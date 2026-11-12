"""LEHD LODES: jobs by workplace (WAC), workers by residence (RAC) and commute flows (OD).

LODES is published at the block, so every number here is a sum of whole blocks (method = aggregated)
for the state, counties, places and tracts; nothing is allocated. Blocks are assigned to them by the LODES geography crosswalk.
Block counts carry noise infusion by the Census Bureau, so small areas are noisy.

Outputs (data):
  lodes/wac|rac/<geo_type>.parquet   geo_id, geo_type, year, variable, jobs, method
  lodes/od/<geo_type>.parquet        origin_id, dest_id, year, then one column per OD measure
  meta/lodes_variables.parquet       what each variable means
In OD files `other-ut` is a Utah block outside every area of that geography type and `out-of-state`
is a worker who lives outside Utah (from the aux files). In files that drop zeros, a missing row is zero.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import duckdb
import pandas as pd
import requests

from .db import connect, sql_path, write_parquet
from .paths import DATA, META, RAW
from .util import load_config, update_manifest

DERIVED = RAW / "derived" / "lodes"
WORKERS = 6
OTHER = load_config()["lodes"]["other_id"]   # OD id for blocks of the state outside every area

NAICS = {
    "CNS01": "Agriculture, forestry, fishing and hunting (11)", "CNS02": "Mining, quarrying, and oil and gas extraction (21)",
    "CNS03": "Utilities (22)", "CNS04": "Construction (23)", "CNS05": "Manufacturing (31-33)",
    "CNS06": "Wholesale trade (42)", "CNS07": "Retail trade (44-45)", "CNS08": "Transportation and warehousing (48-49)",
    "CNS09": "Information (51)", "CNS10": "Finance and insurance (52)", "CNS11": "Real estate and rental and leasing (53)",
    "CNS12": "Professional, scientific, and technical services (54)", "CNS13": "Management of companies and enterprises (55)",
    "CNS14": "Administrative and support and waste management (56)", "CNS15": "Educational services (61)",
    "CNS16": "Health care and social assistance (62)", "CNS17": "Arts, entertainment, and recreation (71)",
    "CNS18": "Accommodation and food services (72)", "CNS19": "Other services except public administration (81)",
    "CNS20": "Public administration (92)",
}
# variable -> (group, label); groups are the dashboard's breakdowns
VARIABLES: dict[str, tuple[str, str]] = {
    "C000": ("total", "All jobs"),
    "CA01": ("age", "Age 29 or younger"), "CA02": ("age", "Age 30 to 54"), "CA03": ("age", "Age 55 or older"),
    "CE01": ("earnings", "$1,250 per month or less"), "CE02": ("earnings", "$1,251 to $3,333 per month"),
    "CE03": ("earnings", "More than $3,333 per month"),
    **{k: ("industry", v) for k, v in NAICS.items()},
    "CR01": ("race", "White alone"), "CR02": ("race", "Black or African American alone"),
    "CR03": ("race", "American Indian or Alaska Native alone"), "CR04": ("race", "Asian alone"),
    "CR05": ("race", "Native Hawaiian or Other Pacific Islander alone"), "CR07": ("race", "Two or more race groups"),
    "CT01": ("ethnicity", "Not Hispanic or Latino"), "CT02": ("ethnicity", "Hispanic or Latino"),
    "CD01": ("education", "Less than high school"), "CD02": ("education", "High school or equivalent, no college"),
    "CD03": ("education", "Some college or associate degree"), "CD04": ("education", "Bachelor's degree or advanced degree"),
    "CS01": ("sex", "Male"), "CS02": ("sex", "Female"),
    "CFA01": ("firm_age", "Firm age 0-1 years"), "CFA02": ("firm_age", "Firm age 2-3 years"),
    "CFA03": ("firm_age", "Firm age 4-5 years"), "CFA04": ("firm_age", "Firm age 6-10 years"),
    "CFA05": ("firm_age", "Firm age 11+ years"),
    "CFS01": ("firm_size", "Firm size 0-19 employees"), "CFS02": ("firm_size", "Firm size 20-49 employees"),
    "CFS03": ("firm_size", "Firm size 50-249 employees"), "CFS04": ("firm_size", "Firm size 250-499 employees"),
    "CFS05": ("firm_size", "Firm size 500+ employees"),
}
OD_VARIABLES = ["S000", "SA01", "SA02", "SA03", "SE01", "SE02", "SE03", "SI01", "SI02", "SI03"]
OD_LABELS = {"S000": "All jobs", "SA01": "Age 29 or younger", "SA02": "Age 30 to 54", "SA03": "Age 55 or older",
             "SE01": "$1,250 per month or less", "SE02": "$1,251 to $3,333 per month",
             "SE03": "More than $3,333 per month", "SI01": "Goods producing industries",
             "SI02": "Trade, transportation, and utilities", "SI03": "All other services"}
ID_COLUMN = {"wac": "w_geocode", "rac": "h_geocode"}


def url(cfg: dict, kind: str, year: int | None = None, variant: str | None = None) -> tuple[str, Path]:
    st = cfg["state"]
    if kind == "xwalk":
        name = f"{st}_xwalk.csv.gz"
        return f"{cfg['base']}/{st}/{name}", RAW / "lodes" / name
    seg, jt = cfg["segment"], cfg["job_type"]
    name = (f"{st}_od_{variant}_{jt}_{year}.csv.gz" if kind == "od" else f"{st}_{kind}_{seg}_{jt}_{year}.csv.gz")
    return f"{cfg['base']}/{st}/{kind}/{name}", RAW / "lodes" / str(year) / name


def download(src: str, dest: Path, refresh: bool = False) -> Path:
    if dest.exists() and not refresh:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    last = ""
    for attempt in range(4):
        try:
            with requests.get(src, stream=True, timeout=300) as r:
                if r.status_code == 200:
                    with open(tmp, "wb") as f:
                        f.writelines(r.iter_content(1 << 20))
                    tmp.replace(dest)
                    return dest
                last = f"HTTP {r.status_code}"
                if r.status_code < 500:
                    break
        except requests.RequestException as e:
            last = str(e)
    raise RuntimeError(f"Could not download {src}: {last}")


def build_block_geo(con: duckdb.DuckDBPyConnection, xwalk: Path) -> None:
    """Table block_geo (block, geo_type, geo_id): state, county, place and tract from the LODES crosswalk."""
    con.execute(f"""
        CREATE OR REPLACE TABLE block_geo AS
        WITH x AS (SELECT tabblk2020 AS block, cty, trct, stplc
                   FROM read_csv('{sql_path(xwalk)}', types = {{'tabblk2020': 'VARCHAR', 'cty': 'VARCHAR',
                                  'trct': 'VARCHAR', 'stplc': 'VARCHAR'}}))
        SELECT block, 'state' AS geo_type, left(block, 2) AS geo_id FROM x
        UNION ALL SELECT block, 'county', cty FROM x
        UNION ALL SELECT block, 'place', stplc FROM x WHERE stplc <> '9999999'
        UNION ALL SELECT block, 'tract', trct FROM x
    """)


def jobs_part(con: duckdb.DuckDBPyConnection, kind: str, year: int, path: Path, drop_zero: list[str]) -> Path:
    """Sum one WAC or RAC file to every geography and unpivot to long rows; returns the part file."""
    key = ID_COLUMN[kind]
    con.execute(f"CREATE OR REPLACE TEMP TABLE src AS SELECT * FROM read_csv('{sql_path(path)}', types = {{'{key}': 'VARCHAR'}})")
    cols = [c for c in con.execute("DESCRIBE src").fetchdf()["column_name"] if c not in (key, "createdate")]
    unknown = [c for c in cols if c not in VARIABLES]
    if unknown:
        raise RuntimeError(f"{kind} {year}: LODES columns with no label: {unknown}; add them to VARIABLES")
    sums = ", ".join(f"sum({c})::BIGINT AS {c}" for c in cols)
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE wide AS
        SELECT g.geo_type, g.geo_id, {sums} FROM src s JOIN block_geo g ON g.block = s.{key}
        GROUP BY g.geo_type, g.geo_id
    """)
    unmatched = con.execute(f"SELECT coalesce(sum(C000), 0) FROM src WHERE {key} NOT IN (SELECT block FROM block_geo WHERE geo_type = 'state')").fetchone()[0]
    if unmatched:
        raise RuntimeError(f"{kind} {year}: {unmatched} jobs sit in blocks missing from the crosswalk")
    zero = ", ".join(repr(t) for t in drop_zero)
    part = DERIVED / kind / f"{year}.parquet"
    part.parent.mkdir(parents=True, exist_ok=True)
    con.execute(f"""
        COPY (SELECT geo_id, geo_type, {year} AS year, variable, jobs, 'aggregated' AS method
              FROM (UNPIVOT wide ON COLUMNS(* EXCLUDE (geo_type, geo_id)) INTO NAME variable VALUE jobs)
              WHERE NOT (jobs = 0 AND geo_type IN ({zero}))
              ORDER BY geo_type, geo_id, variable) TO '{sql_path(part)}' (FORMAT parquet, COMPRESSION zstd)
    """)
    return part


def od_part(con: duckdb.DuckDBPyConnection, year: int, main: Path, aux: Path, geo_types: list[str]) -> Path:
    """Commute flows between areas of each geography type for one year (main plus out-of-state aux)."""
    types = "{'w_geocode': 'VARCHAR', 'h_geocode': 'VARCHAR'}"
    measures = ", ".join(OD_VARIABLES)
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE od AS
        SELECT w_geocode, h_geocode, 'main' AS src, {measures} FROM read_csv('{sql_path(main)}', types = {types})
        UNION ALL
        SELECT w_geocode, h_geocode, 'aux' AS src, {measures} FROM read_csv('{sql_path(aux)}', types = {types})
    """)
    sums = ", ".join(f"sum({m})::BIGINT AS {m}" for m in OD_VARIABLES)
    selects = []
    for t in geo_types:
        con.execute(f"CREATE OR REPLACE TEMP VIEW bg_{t.replace('-', '_')} AS SELECT block, geo_id FROM block_geo WHERE geo_type = '{t}'")
        selects.append(f"""
            SELECT '{t}' AS geo_type,
                   coalesce(h.geo_id, CASE WHEN od.src = 'aux' THEN 'out-of-state' ELSE '{OTHER}' END) AS origin_id,
                   coalesce(w.geo_id, '{OTHER}') AS dest_id, {year} AS year, {sums}
            FROM od LEFT JOIN bg_{t} h ON h.block = od.h_geocode LEFT JOIN bg_{t} w ON w.block = od.w_geocode
            GROUP BY ALL
            HAVING NOT (origin_id IN ('{OTHER}', 'out-of-state') AND dest_id = '{OTHER}')""")
    part = DERIVED / "od" / f"{year}.parquet"
    part.parent.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY ({' UNION ALL '.join(selects)} ORDER BY geo_type, origin_id, dest_id) TO '{sql_path(part)}' "
                "(FORMAT parquet, COMPRESSION zstd)")
    return part


def run(refresh: bool = False) -> None:
    cfg = load_config()
    lc = cfg["lodes"]
    years = lc["years"]
    jobs = [url(lc, "xwalk")]
    for y in years:
        jobs += [url(lc, k, y) for k in ("wac", "rac")] + [url(lc, "od", y, v) for v in ("main", "aux")]
    with ThreadPoolExecutor(WORKERS) as pool:
        futures = [pool.submit(download, src, dest, refresh) for src, dest in jobs]
        for i, f in enumerate(futures, 1):
            f.result()
            if i % 20 == 0 or i == len(futures):
                print(f"downloaded {i}/{len(futures)} LODES files", flush=True)

    con = connect()
    build_block_geo(con, url(lc, "xwalk")[1])
    drop_zero = lc["drop_zero"]
    for y in years:
        for kind in ("wac", "rac"):
            if refresh or not (DERIVED / kind / f"{y}.parquet").exists():
                jobs_part(con, kind, y, url(lc, kind, y)[1], drop_zero)
        if refresh or not (DERIVED / "od" / f"{y}.parquet").exists():
            od_part(con, y, url(lc, "od", y, "main")[1], url(lc, "od", y, "aux")[1], lc["od_geographies"])
        print(f"processed {y}", flush=True)

    META.mkdir(parents=True, exist_ok=True)
    meta = pd.DataFrame(
        [{"source": "wac/rac", "variable": k, "group": g, "label": l} for k, (g, l) in VARIABLES.items()]
        + [{"source": "od", "variable": k, "group": "total" if k == "S000" else k[:2], "label": l}
           for k, l in OD_LABELS.items()])
    con.register("meta_df", meta)
    write_parquet(con, "SELECT * FROM meta_df", META / "lodes_variables.parquet", "source, variable")

    latest = max(years)
    manifest: dict = {"years": [min(years), latest], "files": {}}
    geo_types = [r[0] for r in con.execute(
        f"SELECT DISTINCT geo_type FROM read_parquet('{sql_path(DERIVED / 'wac' / '*.parquet')}') ORDER BY 1").fetchall()]
    for kind in ("wac", "rac"):
        glob = sql_path(DERIVED / kind / "*.parquet")
        for t in geo_types:
            where = f"AND year = {latest}" if t in lc["latest_only"] else ""
            dest = DATA / "lodes" / kind / f"{t}.parquet"
            write_parquet(con, f"SELECT geo_id, geo_type, year, variable, jobs, method FROM read_parquet('{glob}') "
                               f"WHERE geo_type = '{t}' {where}", dest, "year, variable, geo_id")
            manifest["files"][f"{kind}/{t}"] = {"bytes": dest.stat().st_size}
    glob = sql_path(DERIVED / "od" / "*.parquet")
    for t in lc["od_geographies"]:
        dest = DATA / "lodes" / "od" / f"{t}.parquet"
        write_parquet(con, f"SELECT * EXCLUDE (geo_type) FROM read_parquet('{glob}') WHERE geo_type = '{t}'",
                      dest, "year, origin_id, dest_id")
        manifest["files"][f"od/{t}"] = {"bytes": dest.stat().st_size}
    update_manifest("lodes", manifest)
    print(f"wrote {len(manifest['files'])} LODES files")
