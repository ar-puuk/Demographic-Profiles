"""Employment QA: do the parts add up to the wholes, and do LODES and QCEW agree on the order of magnitude?

1. LODES jobs in the counties add up to the state, in every year.
2. LODES jobs in the places never exceed the state's (places cover part of the state).
3. LODES jobs against QCEW covered employment by county, for the latest year both exist (a reasonableness check).

Writes data/meta/employment-qa.md and raises if a check exceeds the configured tolerance.
"""
from __future__ import annotations

import duckdb

from .db import connect, sql_path
from .paths import DATA, META
from .util import load_config, update_manifest, write_if_changed


def run(refresh: bool = False, con: duckdb.DuckDBPyConnection | None = None) -> None:
    cfg = load_config()
    tol = cfg["qa"]["tolerance"]
    con = con or connect()
    wac = lambda t: f"read_parquet('{sql_path(DATA / 'lodes' / 'wac' / (t + '.parquet'))}')"
    qcew = lambda t: f"read_parquet('{sql_path(DATA / 'qcew' / (t + '.parquet'))}')"
    needed = [DATA / "lodes" / "wac" / "county.parquet", DATA / "lodes" / "wac" / "state.parquet",
              DATA / "lodes" / "wac" / "place.parquet", DATA / "qcew" / "county.parquet"]
    if not all(p.exists() for p in needed):
        raise SystemExit("Run `lodes` and `qcew` first: the QA compares their outputs.")
    failures: list[str] = []
    lines = ["# Employment QA", "", f"Tolerance {tol:.2%}. Largest relative gap across all years between a total and the sum of its parts.", "",
             "| Check | Gap |", "|---|---:|"]
    gap = con.execute(f"""
        WITH c AS (SELECT year, sum(jobs) AS j FROM {wac('county')} WHERE variable = 'C000' GROUP BY year),
             s AS (SELECT year, jobs AS j FROM {wac('state')} WHERE variable = 'C000')
        SELECT max(abs(c.j - s.j) / s.j) FROM c JOIN s USING (year)""").fetchone()[0] or 0.0
    lines.append(f"| LODES jobs: counties sum to the state | {gap:.4%} |")
    if gap > tol:
        failures.append(f"LODES jobs: counties against the state: {gap:.4%}")
    over = con.execute(f"""
        WITH p AS (SELECT year, sum(jobs) AS j FROM {wac('place')} WHERE variable = 'C000' GROUP BY year),
             s AS (SELECT year, jobs AS j FROM {wac('state')} WHERE variable = 'C000')
        SELECT count(*) FROM p JOIN s USING (year) WHERE p.j > s.j""").fetchone()[0]
    lines.append(f"| Years in which places hold more jobs than the state | {over} |")
    if over:
        failures.append(f"LODES jobs: places exceed the state in {over} year(s)")
    lines.append("")

    year = con.execute(f"SELECT max(w.year) FROM {wac('county')} w JOIN (SELECT DISTINCT year FROM {qcew('county')}) q USING (year)").fetchone()[0]
    lines += [f"LODES jobs (all job types, by workplace) against QCEW covered employment in {year}. They differ by design (LODES counts jobs "
              "on a point in the year, QCEW an annual average, and each covers a different mix of workers), so this is a reasonableness check, "
              "not a test.", "", "| County | LODES jobs | QCEW employment | LODES / QCEW |", "|---|---:|---:|---:|"]
    rows = con.execute(f"""
        SELECT w.geo_id, w.jobs, q.value FROM {wac('county')} w
        JOIN {qcew('county')} q ON q.geo_id = w.geo_id AND q.year = w.year
        WHERE w.year = {year} AND w.variable = 'C000' AND q.variable = 'employment' AND q.ownership = '0' AND q.industry = '10'
        ORDER BY w.jobs DESC""").fetchall()
    lines += [f"| `{g}` | {j:,} | {q:,.0f} | {j / q:.2f} |" for g, j, q in rows if q]
    lines.append("")
    write_if_changed(META / "employment-qa.md", ("\n".join(lines) + "\n").encode("utf-8"))
    update_manifest("employment_qa", {"failures": failures})
    print(f"wrote {META / 'employment-qa.md'}")
    if failures:
        raise SystemExit("Employment QA failed:\n  " + "\n  ".join(failures))
