"""ACS 5-year direct pulls: validate the configured tables, download whole tables for each geography and
vintage, and write long-format parquet (data/acs/<topic>/<geo>.parquet).

Every row published here has method = 'direct' (the Census Bureau published it at that geography).
Estimates of areas that are not Census geographies are built from these in the aggregation stage.

Layout: each (topic, geography, vintage) is written as a part file under raw/derived/acs, which
keeps memory small and holds the full history. The tracked files are assembled from those parts; tracts
and block groups are published for the latest vintage only (config: acs.latest_only).
"""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd

from .census import BASE, get_json
from .db import connect, sql_path, write_parquet
from .paths import DATA, META, RAW
from .util import load_config, update_manifest, write_if_changed

# Census annotation codes that replace a number: no data, not applicable, bound only, and so on.
SENTINEL_LIMIT = -222222222
VAR_RE = re.compile(r"^([A-Z]\d+[A-Z]?_\d+)([EMA]{1,2})$")
WORKERS = 6
DERIVED = RAW / "derived" / "acs"


def dataset(vintage: int) -> str:
    return f"{BASE}/{vintage}/acs/acs5"


def clean_label(label: str) -> str:
    return re.sub(r"^(Estimate|Margin of Error for)!!", "", label).replace(":!!", " > ").replace("!!", " > ").rstrip(":")


def load_variables(vintage: int, refresh: bool = False) -> dict:
    return get_json(f"{dataset(vintage)}/variables.json", cache=RAW / "acs" / str(vintage) / "variables.json",
                    refresh=refresh)["variables"]


def estimate_codes(variables: dict, table: str) -> list[str]:
    return sorted(c for c in variables if c.startswith(table + "_") and c.endswith("E") and VAR_RE.match(c))


def geographies_for(cfg: dict, vintage: int) -> dict[str, dict]:
    return {g: gc for g, gc in cfg["geographies"].items() if vintage >= gc.get("since", 0)}


def drifted(old: dict[str, str], new: dict[str, str]) -> list[str]:
    """Variables present in both vintages whose label (what the row means) differs, e.g. B25034 '2010 or later' that
    became '2014 or later'. Variable ids alone do not show this."""
    # Punctuation, spacing and the dollar year in "(in 2015 inflation-adjusted dollars)" are not a change of meaning.
    norm = lambda t: re.sub(r"[^a-z0-9]", "", re.sub(r"\(in \d{4} inflation-adjusted dollars\)", "", t.lower()))
    return sorted(c for c in old.keys() & new.keys() if norm(old[c]) != norm(new[c]))


def validate(refresh: bool = False) -> pd.DataFrame:
    """Check the configured tables and geographies against each vintage and build the variable table.
    The latest vintage must offer everything configured; earlier gaps (a table that did not exist yet, or
    a year it was dropped) are allowed, skipped by the pull, and written to meta/acs-availability.md."""
    cfg = load_config()["acs"]
    latest = max(cfg["vintages"])
    rows, problems = [], []
    first_year: dict[str, int] = {}
    gaps: dict[str, list[int]] = {}
    changed: dict[str, list[int]] = {}
    latest_codes: dict[str, list[str]] = {}
    latest_labels: dict[str, dict[str, str]] = {}
    relabeled: dict[str, list[int]] = {}
    for vintage in sorted(cfg["vintages"], reverse=True):
        variables = load_variables(vintage, refresh)
        geo_json = get_json(f"{dataset(vintage)}/geography.json",
                            cache=RAW / "acs" / str(vintage) / "geography.json", refresh=refresh)
        levels = {f["name"] for f in geo_json["fips"]}
        if vintage == latest:
            for gc in cfg["geographies"].values():
                level = gc["for"].split(":")[0]
                if level not in levels:
                    problems.append(f"{vintage}: geography '{level}' is not offered")
        for table, tc in cfg["tables"].items():
            codes = estimate_codes(variables, table)
            if not codes:
                if vintage == latest:
                    problems.append(f"{vintage}: table {table} has no estimate variables")
                gaps.setdefault(table, []).append(vintage)
                continue
            first_year[table] = min(first_year.get(table, vintage), vintage)
            labels = {c[:-1]: clean_label(variables[c]["label"]) for c in codes}
            if vintage == latest:
                latest_codes[table] = codes
                latest_labels[table] = labels
            else:
                if codes != latest_codes.get(table):
                    changed.setdefault(table, []).append(vintage)
                if drifted(labels, latest_labels.get(table, {})):
                    relabeled.setdefault(table, []).append(vintage)
            for code in codes:
                rows.append({"vintage": vintage, "table": table, "topic": tc["topic"],
                             "agg": tc.get("agg", "sum"), "variable": code[:-1],
                             "label": clean_label(variables[code]["label"]),
                             "concept": variables[code].get("concept", "")})
    if problems:
        raise RuntimeError("ACS validation failed:\n  " + "\n  ".join(problems))
    df = pd.DataFrame(rows).sort_values(["vintage", "variable"]).reset_index(drop=True)

    lines = ["# ACS table availability", "",
             f"Vintages {min(cfg['vintages'])} to {latest}. The pull skips a table in a vintage where the Census "
             "does not offer it. Where a table's variable list differs from the latest vintage, "
             "compare trends with care. A row can keep its variable id while its meaning changes (for example a '2010 or later' "
             "bracket that becomes '2014 or later'), so labels are compared as well.", "",
             "| Table | First vintage | Missing in | Variables differ from latest in | Labels differ from latest in |", "|---|---:|---|---|---|"]
    for table in cfg["tables"]:
        missing = sorted(v for v in gaps.get(table, []) if v > first_year.get(table, latest))
        lines.append(f"| `{table}` | {first_year.get(table, '-')} | {', '.join(map(str, missing)) or '-'} | "
                     f"{', '.join(map(str, sorted(changed.get(table, [])))) or '-'} | "
                     f"{', '.join(map(str, sorted(relabeled.get(table, [])))) or '-'} |")
    write_if_changed(META / "acs-availability.md", ("\n".join(lines) + "\n").encode("utf-8"))
    print(f"validated {len(cfg['tables'])} tables, {df.variable.nunique()} variables, "
          f"vintages {min(cfg['vintages'])}-{latest}")
    return df


def geo_id(df: pd.DataFrame, geo_type: str) -> pd.Series:
    cols = {"state": ["state"], "county": ["state", "county"], "place": ["state", "place"],
            "tract": ["state", "county", "tract"], "block_group": ["state", "county", "tract", "block group"]}
    return df[cols[geo_type]].agg("".join, axis=1)


def fetch_table(vintage: int, table: str, geo_type: str, gcfg: dict, refresh: bool) -> pd.DataFrame:
    params = {"get": f"NAME,group({table})", "for": gcfg["for"]}
    if "in" in gcfg:
        params["in"] = gcfg["in"]
    cache = RAW / "acs" / str(vintage) / f"{table}__{geo_type}.json"
    data = get_json(dataset(vintage), params, cache, refresh)
    df = pd.DataFrame(data[1:], columns=data[0])
    return df.loc[:, ~df.columns.duplicated()]  # group() repeats NAME


def to_long(raw: pd.DataFrame, geo_type: str, vintage: int) -> pd.DataFrame:
    """Wide Census response -> one row per geography and variable: estimate, moe, flag."""
    ids = geo_id(raw, geo_type)
    est, moe, flag = {}, {}, {}
    for col in raw.columns:
        m = VAR_RE.match(col)
        if not m:
            continue
        var, kind = m.groups()
        target = {"E": est, "M": moe, "EA": flag}.get(kind)
        if target is not None:
            target[var] = raw[col]
    long = []
    for var, e in est.items():
        e = pd.to_numeric(e, errors="coerce")
        m = pd.to_numeric(moe[var], errors="coerce") if var in moe else pd.Series(float("nan"), index=raw.index)
        f = flag[var].where(flag[var].notna() & (flag[var] != ""), None) if var in flag else None
        frame = pd.DataFrame({
            "geo_id": ids, "variable": var,
            "estimate": e.where(e > SENTINEL_LIMIT), "moe": m.where(m > SENTINEL_LIMIT),
        })
        frame["flag"] = f if f is not None else None
        long.append(frame)
    out = pd.concat(long, ignore_index=True)
    out.insert(1, "geo_type", geo_type)
    out.insert(2, "vintage", vintage)
    out["method"] = "direct"
    return out


def names(vintage: int, refresh: bool = False) -> pd.DataFrame:
    """geo_id and Census NAME for state, county and place (the selectable standard geographies)."""
    cfg = load_config()["acs"]
    out = []
    for geo_type in ("state", "county", "place"):
        raw = fetch_table(vintage, next(iter(cfg["tables"])), geo_type, cfg["geographies"][geo_type], refresh)
        out.append(pd.DataFrame({"geo_id": geo_id(raw, geo_type), "geo_type": geo_type, "name": raw["NAME"]}))
    return pd.concat(out, ignore_index=True)


def part_dir(topic: str, geo_type: str) -> Path:
    return DERIVED / topic / geo_type


def part_tables(con, part: Path) -> set[str]:
    """The ACS tables a part file holds (the prefix of each variable id, B01001_002 -> B01001)."""
    rows = con.execute(f"SELECT DISTINCT split_part(variable, '_', 1) FROM read_parquet('{sql_path(part)}')").fetchall()
    return {r[0] for r in rows}


def run(refresh: bool = False) -> None:
    cfg = load_config()["acs"]
    variables = validate(refresh)
    con = connect()
    META.mkdir(parents=True, exist_ok=True)
    con.register("variables_df", variables)
    write_parquet(con, "SELECT * FROM variables_df", META / "variables.parquet", 'vintage, variable, "table"')

    available = {(r.vintage, r.table) for r in variables[["vintage", "table"]].drop_duplicates().itertuples()}
    jobs = [(v, g, t) for v in cfg["vintages"] for g in geographies_for(cfg, v) for t in cfg["tables"]
            if (v, t) in available]

    def download(job):
        v, g, t = job
        fetch_table(v, t, g, cfg["geographies"][g], refresh)  # cached as raw JSON; the frame is discarded
        return job

    with ThreadPoolExecutor(WORKERS) as pool:
        for i, _ in enumerate(pool.map(download, jobs), 1):
            if i % 100 == 0 or i == len(jobs):
                print(f"downloaded {i}/{len(jobs)} tables", flush=True)

    # one part file per (topic, geography, vintage)
    topics = sorted({tc["topic"] for tc in cfg["tables"].values()})
    for vintage in cfg["vintages"]:
        for geo_type in geographies_for(cfg, vintage):
            for topic in topics:
                part = part_dir(topic, geo_type) / f"{vintage}.parquet"
                wanted = {t for t, tc in cfg["tables"].items() if tc["topic"] == topic and (vintage, t) in available}
                if part.exists() and not refresh and wanted <= part_tables(con, part):
                    continue  # a part that lacks a configured table (added since it was written) is rebuilt
                frames = [to_long(fetch_table(vintage, t, geo_type, cfg["geographies"][geo_type], False), geo_type, vintage)
                          for t, tc in cfg["tables"].items() if tc["topic"] == topic and (vintage, t) in available]
                if not frames:  # none of the topic's tables exist yet in this vintage
                    continue
                part.parent.mkdir(parents=True, exist_ok=True)
                con.register("part_df", pd.concat(frames, ignore_index=True))
                con.execute(f"COPY (SELECT geo_id, geo_type, vintage, variable, estimate, moe, CAST(flag AS VARCHAR) AS flag, "
                            f"method FROM part_df) TO '{sql_path(part)}' (FORMAT parquet, COMPRESSION zstd)")
                con.unregister("part_df")

    latest = max(cfg["vintages"])
    manifest: dict = {"vintages": cfg["vintages"], "tables": sorted(cfg["tables"]), "files": {}}
    for geo_type in cfg["geographies"]:
        for topic in topics:
            where = f"WHERE vintage = {latest}" if geo_type in cfg.get("latest_only", []) else ""
            glob = sql_path(part_dir(topic, geo_type) / "*.parquet")
            dest = DATA / "acs" / topic / f"{geo_type}.parquet"
            write_parquet(con, f"SELECT * FROM read_parquet('{glob}', union_by_name = true) {where}", dest, "vintage, variable, geo_id")
            rows = con.execute(f"SELECT count(*) FROM read_parquet('{sql_path(dest)}')").fetchone()[0]
            manifest["files"][f"{topic}/{geo_type}"] = {"rows": rows, "bytes": dest.stat().st_size}
    update_manifest("acs", manifest)
    print(f"wrote {len(manifest['files'])} ACS files")
