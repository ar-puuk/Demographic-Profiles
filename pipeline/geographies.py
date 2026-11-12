"""Geography registry: every selectable area in one table (meta/geographies.parquet).

The state, counties and places come from Census names. Tracts are a data-only geography and are not listed.
"""
from __future__ import annotations

import re

import pandas as pd

from . import acs
from .db import connect, sql_path, write_parquet
from .paths import META
from .util import load_config

PLACE_KINDS = ("city", "town", "CDP", "village", "borough", "municipality")
PLACE_RE = re.compile(rf"^(.*) ({'|'.join(PLACE_KINDS)})$")


def split_place(name: str) -> tuple[str, str | None]:
    """'Salt Lake City city, Utah' -> ('Salt Lake City', 'city')."""
    base = name.rsplit(", ", 1)[0]
    m = PLACE_RE.match(base)
    return (m.group(1), m.group(2)) if m else (base, None)


def standard(vintage: int, refresh: bool = False) -> pd.DataFrame:
    df = acs.names(vintage, refresh)
    out = []
    for r in df.itertuples():
        if r.geo_type == "place":
            name, kind = split_place(r.name)
        else:
            name, kind = r.name.rsplit(", ", 1)[0] if r.geo_type == "county" else r.name, None
        out.append({"geo_id": r.geo_id, "geo_type": r.geo_type, "geo_name": name, "kind": kind,
                    "organization": None, "acronym": None, "notes": None})
    return pd.DataFrame(out)


def run(refresh: bool = False) -> None:
    cfg = load_config()
    con = connect()
    con.register("standard_df", standard(max(cfg["acs"]["vintages"]), refresh))
    query = "SELECT * FROM standard_df"
    META.mkdir(parents=True, exist_ok=True)
    write_parquet(con, query, META / "geographies.parquet", "geo_type, geo_id")
    n = con.execute(f"SELECT count(*) FROM read_parquet('{sql_path(META / 'geographies.parquet')}')").fetchone()[0]
    print(f"geographies: {n} areas")
