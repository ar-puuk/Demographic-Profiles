"""BLS Quarterly Census of Employment and Wages: establishments, employment and wages by county,
ownership and industry (annual averages), from the BLS area files.

Outputs (data/qcew): state.parquet and county.parquet (method = direct).
Columns: geo_id, geo_type, year, ownership, industry, variable, value, flag, method. variable is one of
estabs, employment, wages, avg_annual_pay. flag is `suppressed` where BLS withholds a value to protect
confidentiality (the value is empty). The state file uses BLS aggregation levels 50, 51 and 54 where counties use 70, 71 and 74.
"""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import requests

from . import tiger
from .db import connect, sql_path, write_parquet
from .paths import DATA, META, RAW
from .util import load_config, update_manifest

WORKERS = 4
SECTORS = {
    "10": "Total, all industries", "11": "Agriculture, forestry, fishing and hunting", "21": "Mining, quarrying, and oil and gas extraction",
    "22": "Utilities", "23": "Construction", "31-33": "Manufacturing", "42": "Wholesale trade", "44-45": "Retail trade",
    "48-49": "Transportation and warehousing", "51": "Information", "52": "Finance and insurance",
    "53": "Real estate and rental and leasing", "54": "Professional, scientific, and technical services",
    "55": "Management of companies and enterprises", "56": "Administrative and support and waste management",
    "61": "Educational services", "62": "Health care and social assistance", "71": "Arts, entertainment, and recreation",
    "72": "Accommodation and food services", "81": "Other services except public administration", "92": "Public administration",
    "99": "Unclassified",
}
OWNERSHIP = {"0": "Total covered", "1": "Federal government", "2": "State government", "3": "Local government",
             "5": "Private"}
MEASURES = {"annual_avg_estabs": "estabs", "annual_avg_emplvl": "employment", "total_annual_wages": "wages",
            "avg_annual_pay": "avg_annual_pay"}


def download(cfg: dict, year: int, fips: str, refresh: bool = False) -> Path:
    dest = RAW / "qcew" / str(year) / f"{fips}.csv"
    if dest.exists() and not refresh:
        return dest
    src = f"{cfg['base']}/{year}/a/area/{fips}.csv"
    last = ""
    for attempt in range(5):
        r = requests.get(src, headers={"User-Agent": cfg["user_agent"]}, timeout=120)
        if r.status_code == 200:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(r.content)
            return dest
        last = f"HTTP {r.status_code}"
        if r.status_code == 404:
            break
        time.sleep(2 ** attempt)
    raise RuntimeError(f"Could not download {src}: {last}")


def run(refresh: bool = False) -> None:
    cfg = load_config()
    qc, state, abbr = cfg["qcew"], cfg["state"]["fips"], cfg["state"]["abbr"]
    counties = [state + c for c in tiger.county_fips(abbr, cfg["tiger"]["year"])]
    fips_list = [state + "000"] + counties
    jobs = [(y, f) for y in qc["years"] for f in fips_list]
    with ThreadPoolExecutor(WORKERS) as pool:
        futures = [pool.submit(download, qc, y, f, refresh) for y, f in jobs]
        for i, fut in enumerate(futures, 1):
            fut.result()
            if i % 50 == 0 or i == len(futures):
                print(f"downloaded {i}/{len(futures)} QCEW files", flush=True)

    con = connect()
    glob = sql_path(RAW / "qcew" / "*" / "*.csv")
    levels = ", ".join(str(a) for a in qc["agglvl"])
    state_levels = ", ".join(str(a) for a in qc["state_agglvl"])
    cols = ", ".join(MEASURES)
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE qcew_raw AS
        SELECT area_fips, CAST(own_code AS VARCHAR) AS ownership, industry_code AS industry, year,
               disclosure_code = 'N' AS suppressed, {cols}
        FROM read_csv('{glob}', union_by_name = true, types = {{'area_fips': 'VARCHAR', 'own_code': 'VARCHAR',
                      'industry_code': 'VARCHAR', 'disclosure_code': 'VARCHAR'}})
        WHERE ((area_fips = '{state}000' AND agglvl_code IN ({state_levels})) OR (area_fips <> '{state}000' AND agglvl_code IN ({levels})))
          AND year IN ({', '.join(str(y) for y in qc['years'])})
    """)
    unpivot = " UNION ALL ".join(
        f"SELECT area_fips, ownership, industry, year, '{short}' AS variable, "
        f"CASE WHEN suppressed THEN NULL ELSE {col}::DOUBLE END AS value, "
        f"CASE WHEN suppressed THEN 'suppressed' END AS flag FROM qcew_raw" for col, short in MEASURES.items())
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE qcew_long AS
        SELECT CASE WHEN area_fips = '{state}000' THEN '{state}' ELSE area_fips END AS geo_id,
               CASE WHEN area_fips = '{state}000' THEN 'state' ELSE 'county' END AS geo_type,
               year, ownership, industry, variable, value, flag, 'direct' AS method
        FROM ({unpivot})
    """)
    manifest = {}
    for t in ("state", "county"):
        dest = DATA / "qcew" / f"{t}.parquet"
        write_parquet(con, f"SELECT * FROM qcew_long WHERE geo_type = '{t}'", dest, "year, ownership, industry, variable, geo_id")
        manifest[t] = {"bytes": dest.stat().st_size}

    codes = pd.DataFrame(
        [{"kind": "industry", "code": k, "label": v} for k, v in SECTORS.items()]
        + [{"kind": "ownership", "code": k, "label": v} for k, v in OWNERSHIP.items()])
    con.register("codes_df", codes)
    write_parquet(con, "SELECT * FROM codes_df", META / "qcew_codes.parquet", "kind, code")
    update_manifest("qcew", manifest)
    print(f"qcew: {con.execute('SELECT count(*) FROM qcew_long').fetchone()[0]} long rows, years {qc['years'][0]}-{qc['years'][-1]}")
