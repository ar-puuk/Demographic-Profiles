"""Annual population estimates (Population Estimates Program) for the state, counties and places.

Written to data/pep/{state,county,place}.parquet with columns geo_id, geo_type, year, vintage, estimate,
method. The program does not publish estimates below the place level, so tracts get no series.
"""
from __future__ import annotations

import io

import pandas as pd
import requests

from .db import connect, write_parquet
from .paths import DATA, RAW
from .util import load_config, update_manifest


def download(base: str, path: str, refresh: bool = False) -> bytes:
    cache = RAW / "pep" / path.replace("/", "__")
    if cache.exists() and not refresh:
        return cache.read_bytes()
    r = requests.get(f"{base}/{path}", timeout=300)
    r.raise_for_status()
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(r.content)
    return r.content


def read_csv(raw: bytes) -> pd.DataFrame:
    return pd.read_csv(io.BytesIO(raw), dtype=str, encoding="latin-1")


def melt_estimates(df: pd.DataFrame, geo_ids: pd.Series, geo_type: str, vintage: int, years: list[int]) -> pd.DataFrame:
    cols = {f"POPESTIMATE{y}": y for y in range(years[0], years[1] + 1)}
    out = df.assign(geo_id=geo_ids)[["geo_id", *cols]].melt("geo_id", var_name="col", value_name="estimate")
    out["year"] = out["col"].map(cols)
    out["estimate"] = pd.to_numeric(out["estimate"])
    out["geo_type"], out["vintage"], out["method"] = geo_type, vintage, "direct"
    return out[["geo_id", "geo_type", "year", "vintage", "estimate", "method"]]


def parse(cfg: dict, state: str, refresh: bool = False) -> pd.DataFrame:
    frames = []
    for f in cfg["files"]:
        counties = read_csv(download(cfg["base"], f["counties"], refresh))
        counties = counties[counties["STATE"] == state]
        st = counties[counties["COUNTY"] == "000"]
        frames.append(melt_estimates(st, st["STATE"], "state", f["vintage"], f["years"]))
        co = counties[counties["COUNTY"] != "000"]
        frames.append(melt_estimates(co, co["STATE"] + co["COUNTY"], "county", f["vintage"], f["years"]))
        places = read_csv(download(cfg["base"], f["places"], refresh))
        places = places[(places["STATE"] == state) & (places["SUMLEV"] == "162")]  # incorporated places
        frames.append(melt_estimates(places, places["STATE"] + places["PLACE"], "place", f["vintage"], f["years"]))
    return pd.concat(frames, ignore_index=True)


def run(refresh: bool = False) -> None:
    cfg = load_config()
    long = parse(cfg["pep"], cfg["state"]["fips"], refresh)
    con = connect()
    con.register("pep_df", long)
    manifest = {}
    for geo_type in ("state", "county", "place"):
        dest = DATA / "pep" / f"{geo_type}.parquet"
        write_parquet(con, f"SELECT * FROM pep_df WHERE geo_type = '{geo_type}'", dest, "year, geo_id")
        manifest[geo_type] = int((long["geo_type"] == geo_type).sum())
    update_manifest("pep", manifest)
    print(f"pep rows: {manifest}")
