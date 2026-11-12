"""TIGER/Line geometries through pygris, cached as GeoParquet under raw/tiger."""
from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyarrow.parquet as pq
import pygris

from .paths import RAW


def counties(state: str, year: int, refresh: bool = False) -> Path:
    """Path to the cached county GeoParquet (NAD83, EPSG:4269), downloading it with pygris if needed."""
    cache = RAW / "tiger" / f"counties_{state}_{year}.parquet"
    if not cache.exists() or refresh:
        gdf = pygris.counties(state=state, year=year, cb=False)
        cache.parent.mkdir(parents=True, exist_ok=True)
        gdf.to_parquet(cache, compression="zstd")
    return cache


def county_fips(state: str, year: int, refresh: bool = False) -> list[str]:
    """Three-digit county FIPS codes of the state."""
    col = pq.read_table(counties(state, year, refresh), columns=["COUNTYFP"]).column("COUNTYFP")
    return sorted(col.to_pylist())


def blocks(state: str, year: int, counties_fips: list[str], refresh: bool = False) -> Path:
    """Path to a GeoParquet of block internal points (block, aland) for the census year, cached in raw.
    Only the internal point and land area are kept; the export weights each area's flow-map point by them."""
    cache = RAW / "tiger" / f"blocks_{state}_{year}.parquet"
    if not cache.exists() or refresh:
        suffix = str(year)[-2:]
        parts = []
        for county in counties_fips:
            g = pygris.blocks(state=state, county=county, year=year)
            parts.append(gpd.GeoDataFrame(
                {"block": g[f"GEOID{suffix}"].to_numpy(), "aland": g[f"ALAND{suffix}"].astype("int64").to_numpy()},
                geometry=gpd.points_from_xy(g[f"INTPTLON{suffix}"].astype(float), g[f"INTPTLAT{suffix}"].astype(float)),
                crs=g.crs))
        cache.parent.mkdir(parents=True, exist_ok=True)
        gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs=parts[0].crs).to_parquet(cache, compression="zstd")
    return cache


def cartographic(kind: str, state: str, year: int, refresh: bool = False) -> Path:
    """Path to a cached cartographic-boundary GeoParquet (500k, clipped to the shoreline) of `kind`
    (counties, places or tracts) for the state, which draws better on a web map than full TIGER."""
    cache = RAW / "tiger" / f"cb_{kind}_{state}_{year}.parquet"
    if not cache.exists() or refresh:
        fetch = {"counties": pygris.counties, "places": pygris.places, "tracts": pygris.tracts}[kind]
        gdf = fetch(state=state, cb=True, year=year)
        cache.parent.mkdir(parents=True, exist_ok=True)
        gdf.to_parquet(cache, compression="zstd")
    return cache
