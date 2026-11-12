"""Web exports: simplified GeoJSON for the dashboard maps (data/web/<geo_type>.geojson).

GeoParquet stays the stored format; browsers read GeoJSON, so this stage derives it. Each feature has an
`id` property equal to the geo_id used in every data file. Geometries are simplified for the screen.

It also writes meta/centroids.parquet (geo_id, geo_type, lon, lat): a point inside each area of a type that
has commute flows, where the flow map anchors its lines, and web/rest-<geo_type>.geojson with the shape of each type's remainder.
An area's point is the centre of its own jobs and resident workers (latest LODES year) when that lies inside the area, so the lines
start where its people are. Otherwise it is a point on the surface, not the plain centroid, which falls outside crescent or split areas.

For each of those types it also writes a row for the pseudo-area `other-ut` ("Rest of Utah"): the commuters whose other end is a
Utah block outside every area of the type. Its geometry is the state minus the union of the areas, and its point is the pole of
inaccessibility of the largest piece of that remainder, shrunk by `export.rest_margin_m` so the point never sits on an area's edge.
When the block files are on disk the point is instead the centre of the jobs and resident workers in those blocks (latest LODES
year), provided that centre lies inside the shrunk remainder; otherwise it is the nearest point of the shrunk remainder to that centre
(or, with no block files, the pole of inaccessibility).
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import shapely
import shapely.geometry
from pyproj import Transformer
from shapely.geometry import Point
from shapely.ops import nearest_points, polylabel, transform

from . import lodes, tiger
from .db import connect, sql_path, write_parquet
from .paths import DATA, META
from .util import load_config, update_manifest, write_if_changed

PRECISION = 1e-5     # degrees, about 1 m


def collection(con, query: str) -> bytes:
    rows = con.execute(query).fetchall()
    features = [{"type": "Feature", "properties": {"id": geo_id}, "geometry": json.loads(geom)}
                for geo_id, geom in sorted(rows)]
    return json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")).encode("utf-8")


def centroids(con, sources: dict[str, str], geo_types: list[str], weighted: bool = False):
    """One row per area of the given types: a point guaranteed to lie inside it. With `weighted` (the block_geo and block_xy tables
    from block_weights) it is the centre of the area's jobs and resident workers when that lies inside the area, so the lines of a
    sprawling or crescent-shaped area start where its people are; otherwise, or when that centre is outside, a point on the surface."""
    parts = []
    for t in geo_types:
        if weighted:
            centre = f"""LEFT JOIN (SELECT g.geo_id, sum(x.lon * x.jobs) / sum(x.jobs) AS clon, sum(x.lat * x.jobs) / sum(x.jobs) AS clat
                                    FROM block_geo g JOIN block_xy x USING (block) WHERE g.geo_type = '{t}' GROUP BY g.geo_id) w
                         ON w.geo_id = a.geo_id"""
            pick = "CASE WHEN w.clon IS NOT NULL AND ST_Contains(a.g, ST_Point(w.clon, w.clat)) THEN ST_Point(w.clon, w.clat) ELSE ST_PointOnSurface(a.g) END"
        else:
            centre, pick = "", "ST_PointOnSurface(a.g)"
        parts.append(f"""SELECT geo_id, '{t}' AS geo_type, ST_X(p) AS lon, ST_Y(p) AS lat FROM (
            SELECT a.geo_id, {pick} AS p FROM (SELECT geo_id, geometry::GEOMETRY AS g FROM ({sources[t]})) a {centre})""")
    return " UNION ALL ".join(parts)


def rest_point(state, areas: list, margin: float, weighted: tuple | None = None):
    """A point in the part of `state` outside every one of `areas` (shapely geometries in a metric CRS), or None when no part of
    the remainder is wider than twice `margin`. Slivers left by boundaries that do not quite match vanish with the shrink.

    `weighted` is (x, y, weight) arrays for the places the Rest of Utah traffic starts and ends. Their weighted mean is used when it
    lies inside the shrunk remainder; when it falls in a gap or too near an area's edge the point is the nearest one that is clear of
    every edge. Without weights it is the pole of inaccessibility of the largest piece, which is always clear of every edge."""
    rest = state.difference(shapely.union_all(areas)) if areas else state
    core = rest.buffer(-margin)
    pieces = [g for g in getattr(core, "geoms", [core]) if not g.is_empty]
    if not pieces:
        return None
    if weighted is not None:
        x, y, w = weighted
        if len(w) and w.sum() > 0:
            mean = Point((x * w).sum() / w.sum(), (y * w).sum() / w.sum())
            if core.contains(mean):
                return mean
            # The mean is in a gap or too near an edge: take the closest point that is clear of every edge (shrunk a little more so
            # it is strictly inside), which stays near where the traffic is rather than jumping to the middle of the largest piece.
            inner = rest.buffer(-margin * 1.05)
            if not inner.is_empty:
                return nearest_points(inner, mean)[0]
    return polylabel(max(pieces, key=lambda g: g.area), tolerance=margin / 20)


def rest_shape(state, areas: list, margin: float):
    """The part of `state` outside every one of `areas`, opened by a fifth of the margin so slivers left by boundaries that do not
    quite match (a few hundred metres wide) are dropped. Empty when nothing is left."""
    rest = state.difference(shapely.union_all(areas)) if areas else state
    return rest.buffer(-margin / 5).buffer(margin / 5)


def block_weights(con, cfg: dict) -> bool:
    """Create the tables block_geo (block to area, every geography type) and block_xy (block, lon, lat, jobs: the 2020 block points
    with jobs plus resident workers in the latest LODES year). False when the block files are not on disk."""
    lc = cfg["lodes"]
    year = max(lc["years"])
    blocks = tiger.blocks(cfg["state"]["abbr"], 2020, tiger.county_fips(cfg["state"]["abbr"], cfg["tiger"]["year"]))
    files = {k: lodes.url(lc, k, year)[1] for k in ("wac", "rac")}
    if not (blocks.exists() and all(f.exists() for f in files.values()) and lodes.url(lc, "xwalk")[1].exists()):
        print("block weights are not on disk: anchoring places and the rest of the state at geometric points")
        return False
    lodes.build_block_geo(con, lodes.url(lc, "xwalk")[1])
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE block_xy AS
        SELECT b.block, ST_X(b.geometry::GEOMETRY) AS lon, ST_Y(b.geometry::GEOMETRY) AS lat, j.jobs
        FROM read_parquet('{sql_path(blocks)}') b JOIN (
            SELECT block, sum(jobs) AS jobs FROM (
                SELECT w_geocode AS block, C000 AS jobs FROM read_csv('{sql_path(files["wac"])}', types = {{'w_geocode': 'VARCHAR'}})
                UNION ALL SELECT h_geocode, C000 FROM read_csv('{sql_path(files["rac"])}', types = {{'h_geocode': 'VARCHAR'}})) GROUP BY block
        ) j USING (block) WHERE j.jobs > 0""")
    return True


def rest_weights(con, cfg: dict, to_m) -> dict[str, tuple]:
    """Per geography type, the blocks outside every area of the type with their weights: {type: (x, y, weight)} in the metric CRS."""
    out = {}
    for t in cfg["lodes"]["od_geographies"]:
        rows = con.execute(f"""SELECT lon, lat, jobs FROM block_xy WHERE block NOT IN (SELECT block FROM block_geo WHERE geo_type = '{t}')""").fetchall()
        if rows:
            lon, lat, w = (np.array(c, dtype=float) for c in zip(*rows))
            x, y = to_m(lon, lat)
            out[t] = (np.asarray(x), np.asarray(y), w)
    return out


def rest_of_state(con, cfg: dict, sources: dict[str, str], weighted: bool) -> tuple[pd.DataFrame, dict]:
    """The `other-ut` point of every geography type that leaves a remainder (geo_id, geo_type, lon, lat), and the remainders as a
    GeoJSON collection with one feature per type (`id` is the type), simplified like the other web geometry."""
    ex = cfg["export"]
    to_m = Transformer.from_crs(4326, ex["metric_crs"], always_xy=True).transform
    to_deg = Transformer.from_crs(ex["metric_crs"], 4326, always_xy=True).transform

    def load(source: str) -> list:
        rows = con.execute(f"SELECT ST_AsWKB(geometry::GEOMETRY) FROM ({source})").fetchall()
        return [transform(to_m, shapely.from_wkb(bytes(r[0]))) for r in rows]

    state = shapely.union_all(load(sources["state"]))
    weights = rest_weights(con, cfg, to_m) if weighted else {}
    margin = ex["rest_margin_m"]
    out, features = [], []
    for t in cfg["lodes"]["od_geographies"]:
        areas = load(sources[t])
        p = rest_point(state, areas, margin, weights.get(t))
        if p is None:
            print(f"rest of state: no remainder for {t}")
            continue
        lon, lat = transform(to_deg, Point(p)).coords[0]
        out.append({"geo_id": cfg["lodes"]["other_id"], "geo_type": t, "lon": lon, "lat": lat})
        shape = shapely.set_precision(transform(to_deg, rest_shape(state, areas, margin)).simplify(ex["simplify"][t]), PRECISION)
        features.append({"type": "Feature", "properties": {"id": t}, "geometry": shapely.geometry.mapping(shape)})
        print(f"rest of state: {t} at {lon:.4f}, {lat:.4f}")
    return pd.DataFrame(out, columns=["geo_id", "geo_type", "lon", "lat"]), {"type": "FeatureCollection", "features": features}


def app_meta(cfg: dict) -> bytes:
    """data/meta/app.json: the names and defaults the web app reads instead of carrying its own."""
    meta = {**cfg["app"], "state": cfg["state"], "outside_id": cfg["lodes"]["other_id"]}
    return json.dumps(meta, indent=1, sort_keys=True).encode("utf-8") + b"\n"


def run(refresh: bool = False) -> None:
    cfg = load_config()
    write_if_changed(META / "app.json", app_meta(cfg))
    state, year = cfg["state"]["abbr"], cfg["tiger"]["year"]
    con = connect()
    sources = {}
    for kind, geo_type in (("counties", "county"), ("places", "place"), ("tracts", "tract")):
        path = tiger.cartographic(kind, state, year, refresh)
        sources[geo_type] = f"SELECT GEOID AS geo_id, geometry FROM read_parquet('{sql_path(path)}')"
    sources["state"] = (f"SELECT STATEFP AS geo_id, ST_Union_Agg(geometry) AS geometry "
                        f"FROM read_parquet('{sql_path(tiger.cartographic('counties', state, year))}') GROUP BY STATEFP")
    manifest = {}
    for geo_type, source in sources.items():
        query = (f"SELECT geo_id, ST_AsGeoJSON(ST_ReducePrecision(ST_SimplifyPreserveTopology(geometry::GEOMETRY, "
                 f"{cfg["export"]["simplify"][geo_type]}), {PRECISION})) FROM ({source})")
        data = collection(con, query)
        dest = DATA / "web" / f"{geo_type}.geojson"
        write_if_changed(dest, data)
        manifest[geo_type] = {"bytes": len(data)}
        print(f"{geo_type}: {len(data) / 1e6:.2f} MB")
    od_types = cfg["lodes"]["od_geographies"]
    weighted = block_weights(con, cfg)
    rest, remainders = rest_of_state(con, cfg, sources, weighted)
    for f in remainders["features"]:
        data = json.dumps({"type": "FeatureCollection", "features": [f]}, separators=(",", ":")).encode("utf-8")
        write_if_changed(DATA / "web" / f"rest-{f['properties']['id']}.geojson", data)
        manifest[f"rest-{f['properties']['id']}"] = {"bytes": len(data)}
    update_manifest("web_export", manifest)
    con.register("rest_df", rest)
    write_parquet(con, centroids(con, sources, od_types, weighted) + " UNION ALL SELECT geo_id, geo_type, lon, lat FROM rest_df",
                  META / "centroids.parquet", "geo_type, geo_id")
    print(f"centroids: {', '.join(od_types)}")
