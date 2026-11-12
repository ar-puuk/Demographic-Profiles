// Everything the report shows, loaded once from the same queries the dashboard uses and held as plain data. Nothing here reads
// the app's live state: the caller freezes it in a `Ctx` first, so changing the area or year while a report builds cannot mix two
// views in one document.
import { centroids, geojson, hasPep, indicatorSeries, indicatorValues, lodesSeries, lodesValues, odFlowsBy, pepSeries, qcewCodes, qcewIndustries } from "../lib/data";
import type { Db } from "../lib/db";
import { quantileBreaks } from "../lib/classes";
import { COMMUTE_MIX, buildFlows, commuteSides, summarizeFlows, type OdRow, type Unmapped } from "../lib/flows";
import { FORMATS, fmtCompact, fmtInt, fmtMoney, fmtOne, fmtPct, fmtPctTick, lowReliability, type Method } from "../lib/format";
import { BY_ID, type Indicator } from "../lib/indicators";
import {
  AGES, RATES, SECTOR_BY_NAICS, distribution, lodesDistribution, pyramidRows, rateLabel, rates, sortByFirst, specFor, topLanguages, vehicles,
  type AreaRef, type Category, type ShareRow, type Spec,
} from "../lib/specs";
import type { Fmt, LineSeries, PyramidRow, Row } from "./charts";
import { flowFrame, tractsFor, type Frame } from "./geo";
import type { Segment } from "./maps";
import { C } from "./theme";

type Feature = GeoJSON.Feature<GeoJSON.Geometry, any>;
export type Orientation = "portrait" | "landscape";

/** The view being reported, frozen at the moment the button was pressed. */
export interface Ctx {
  db: Db;
  sel: AreaRef;
  cmp?: AreaRef;
  refs: AreaRef[];
  v: number;               // ACS vintage (the year shown)
  years: number[];         // vintages available for the area(s)
  latestVintage: number;
  lodes: number;           // LODES year used for the chosen year
  qcew: number;
  acs: string;             // "2020–2024 American Community Survey"
  names: Map<string, string>;
  state: { name: string };
  outsideId: string;
  url: string;             // the dashboard view this report describes
  signal?: AbortSignal;
}

export interface Tile {
  label: string; value: string; meta: string; method: Method | null;
  compare: { label: string; value: string } | null;
  spark: { x: number; y: number }[];
}

export type PanelData =
  | { kind: "bars" | "donut" | "stacked" | "columns"; rows: Row[]; order: string[]; series: string[]; fmt: Fmt; plain?: boolean }
  | { kind: "line"; series: LineSeries[]; fmt: Fmt; tick: Fmt; highlight?: number; zero?: boolean; note?: string }
  | { kind: "pyramid"; rows: PyramidRow[]; other: PyramidRow[] | null; ages: string[]; otherLabel?: string }
  | { kind: "map"; uid: string; tracts: Feature[]; values: Map<string, number | null>; cuts: number[]; area: Feature; tick: Fmt; summary: string; context: Feature[]; names: Map<string, string> }
  | { kind: "triple"; rows: { group: string; label: string; out: number; here: number; inn: number }[]; fmt: Fmt }
  | { kind: "diverging"; rows: { label: string; group?: string; left: number; right: number }[]; leftLabel: string; rightLabel: string; fmt: Fmt }
  | { kind: "flowsum"; out: Segment[]; inn: Segment[]; outTitle: string; innTitle: string; fmt: Fmt; outside: string }
  | { kind: "flow"; uid: string; frame: Frame; context: Feature[]; shapes: Feature[]; focusId: string; places: Map<string, { lon: number; lat: number }>; flows: { origin: string; dest: string; count: number }[]; names: Map<string, string>; fmt: Fmt; outside: string }
  | { kind: "empty"; text: string };

export interface Panel {
  title: string;
  note?: string;
  /** Columns and rows the panel takes in the page grid. */
  span?: Record<Orientation, [number, number]>;
  data: PanelData;
}

export type Loader = (ctx: Ctx) => Promise<PanelData>;
export const EMPTY_TEXT = "Not published for this area or year.";
export const empty = (text = EMPTY_TEXT): PanelData => ({ kind: "empty", text });

// ---- formats ------------------------------------------------------------------------------------------------------

const num = (f: (v: number | null | undefined) => string): Fmt => (v) => f(v);
export const pct1 = num((v) => fmtPct(v, 1));
export const pct0 = num(fmtPctTick);
export const FMT = { pct1, pct0, int: num(fmtInt), compact: num(fmtCompact), money: num(fmtMoney), one: num(fmtOne) };

function tickFor(ind: Indicator): Fmt {
  switch (ind.format) {
    case "pct": return pct0;
    case "int": return FMT.compact;
    case "money": return (v) => (v >= 10000 ? `$${fmtCompact(v)}` : fmtMoney(v));
    default: return num(FORMATS[ind.format]);
  }
}

const check = (ctx: Ctx) => { if (ctx.signal?.aborted) throw new DOMException("Report cancelled", "AbortError"); };

// ---- panels -------------------------------------------------------------------------------------------------------

interface ShareOpts { as: "bars" | "donut" | "stacked" | "columns"; sort?: boolean; top?: number; max?: number }
export type SpecSource = Spec | ((ctx: Ctx) => Promise<{ spec: Spec; categories: Category[] }>);

const orderOf = (rows: ShareRow[], cats: string[], o: ShareOpts) => {
  let order = o.sort ? sortByFirst(rows) : cats;
  if (o.top) order = order.slice(0, o.top);
  return order;
};

/** A share-of-total chart (one distribution from specs.ts) at its fixed print type. */
export function share(source: SpecSource, o: ShareOpts): Loader {
  return async (ctx) => {
    const { spec, categories } = typeof source === "function" ? await source(ctx) : { spec: source, categories: source.categories };
    const rows = await distribution(ctx.db, spec, ctx.refs, ctx.v, categories);
    if (!rows.length) return empty();
    return { kind: o.as, rows, order: orderOf(rows, categories.map((c) => c.label), o), series: ctx.refs.map((r) => r.label), fmt: pct1 };
  };
}

/** A rate chart: the share of each group with some trait (disability by age). */
export function rate(key: string, as: "bars" | "columns" = "bars"): Loader {
  return async (ctx) => {
    const spec = RATES[key];
    const rows = await rates(ctx.db, spec, ctx.refs, ctx.v);
    if (!rows.length) return empty();
    return { kind: as, rows, order: spec.rates.map((r) => rateLabel(spec, r.label, ctx.v)), series: ctx.refs.map((r) => r.label), fmt: pct1 };
  };
}

/** An ACS indicator over the years, with its margin of error as a band. */
export function trend(id: string, zero = false): Loader {
  return async (ctx) => {
    const ind = BY_ID[id];
    const data = await indicatorSeries(ctx.db, ind, ctx.refs);
    const series: LineSeries[] = ctx.refs.map((r, i) => ({
      label: r.label, color: i === 0 ? C.sel : C.cmp,
      points: data.filter((d) => d.id === r.id).map((d) => ({ x: d.vintage, y: d.value!, lo: d.moe == null ? null : d.value! - d.moe, hi: d.moe == null ? null : d.value! + d.moe })),
    })).filter((s) => s.points.length);
    if (!series.length) return empty();
    return { kind: "line", series, fmt: num(FORMATS[ind.format]), tick: tickFor(ind), highlight: ctx.v, zero };
  };
}

/** Population over time: the annual estimates where they exist for every area shown, the ACS series otherwise. */
export function populationTrend(): Loader {
  return async (ctx) => {
    if (ctx.refs.every((r) => hasPep(r.type))) {
      const rows = await pepSeries(ctx.db, ctx.refs);
      const series: LineSeries[] = ctx.refs.map((r, i) => ({ label: r.label, color: i === 0 ? C.sel : C.cmp, points: rows.filter((p) => p.id === r.id).map((p) => ({ x: p.year, y: p.value })) })).filter((s) => s.points.length);
      if (series.length) return { kind: "line", series, fmt: FMT.int, tick: FMT.compact, highlight: Math.min(ctx.v, Math.max(...series.flatMap((s) => s.points.map((p) => p.x)))), note: "Annual estimates; they differ a little from the 5-year survey figure in the tiles." };
    }
    return trend("pop")(ctx);
  };
}

export function pyramid(): Loader {
  return async (ctx) => {
    const [rows, other] = await Promise.all([pyramidRows(ctx.db, ctx.sel, ctx.v), ctx.cmp ? pyramidRows(ctx.db, ctx.cmp, ctx.v) : null]);
    return rows.length ? { kind: "pyramid", rows, other: other?.length ? other : null, ages: AGES, otherLabel: ctx.cmp?.label } : empty();
  };
}

/** Households with 0 to 5+ vehicles, owners and renters together. */
export function vehicleBars(): Loader {
  return async (ctx) => {
    const result = await vehicles(ctx.db, ctx.refs, ctx.v);
    const rows: Row[] = ctx.refs.flatMap((r) => result.labels.map((category) => ({
      category, series: r.label,
      value: (result.rows[r.id] ?? []).filter((x) => x.category === category).reduce((s, x) => s + x.value, 0),
    })));
    return rows.some((r) => r.value > 0) ? { kind: "columns", rows, order: result.labels, series: ctx.refs.map((r) => r.label), fmt: pct1 } : empty();
  };
}

export function languages(): Loader {
  return async (ctx) => {
    const { rows, order } = await topLanguages(ctx.db, ctx.refs, ctx.v, 8);
    return rows.length ? { kind: "bars", rows, order, series: ctx.refs.map((r) => r.label), fmt: pct1 } : empty();
  };
}

/** Jobs (WAC) by one LODES breakdown. */
export function jobsBy(group: string, o: { top?: number; sort?: boolean; as?: "bars" | "donut" | "columns" } = {}): Loader {
  return async (ctx) => {
    const rows = await lodesDistribution(ctx.db, "wac", ctx.refs, ctx.lodes, group);
    if (!rows.length) return empty();
    const cats = [...new Set(rows.map((r) => r.category))];
    return { kind: o.as ?? "bars", rows, order: o.sort ? sortByFirst(rows).slice(0, o.top ?? 99) : cats.slice(0, o.top ?? 99), series: ctx.refs.map((r) => r.label), fmt: pct1 };
  };
}

export function lodesTrend(kind: "wac" | "rac"): Loader {
  return async (ctx) => {
    const rows = await lodesSeries(ctx.db, kind, ctx.refs);
    const series: LineSeries[] = ctx.refs.map((r, i) => ({ label: r.label, color: i === 0 ? C.sel : C.cmp, points: rows.filter((p) => p.id === r.id).map((p) => ({ x: p.year, y: p.value })) })).filter((s) => s.points.length);
    return series.length ? { kind: "line", series, fmt: FMT.int, tick: FMT.compact, highlight: Math.min(ctx.v, ctx.lodes) } : empty();
  };
}

/** Private-sector employment or pay by industry sector (BLS QCEW), for the areas it covers. */
export function qcew(variable: "employment" | "avg_annual_pay"): Loader {
  return async (ctx) => {
    const codes = await qcewCodes(ctx.db);
    const label = new Map(codes.filter((c) => c.kind === "industry").map((c) => [c.code, c.label]));
    const name = (code: string) => SECTOR_BY_NAICS[code] ?? label.get(code) ?? code;
    const per = await Promise.all(ctx.refs.map(async (r) => ({ r, rows: await qcewIndustries(ctx.db, r, ctx.qcew) })));
    const first = per[0].rows.filter((x) => x.industry !== "10" && x.industry !== "99" && typeof x[variable] === "number");
    if (!first.length) return empty("BLS publishes this only for counties and the state.");
    const order = first.sort((a, b) => (b[variable] as number) - (a[variable] as number)).slice(0, 8).map((x) => x.industry);
    const rows: Row[] = per.flatMap(({ r, rows }) => order.flatMap((code) => {
      const v = rows.find((x) => x.industry === code)?.[variable];
      return typeof v === "number" ? [{ category: name(code), series: r.label, value: v }] : [];
    }));
    return { kind: "bars", rows, order: order.map(name), series: ctx.refs.map((r) => r.label), fmt: variable === "employment" ? FMT.compact : num((v) => `$${fmtCompact(v)}`) };
  };
}

// ---- tiles --------------------------------------------------------------------------------------------------------

export async function loadTiles(ctx: Ctx, ids: string[], jobs = false): Promise<Tile[]> {
  const { db, sel, cmp, refs, v } = ctx;
  const years = new Set(ctx.years);
  const [maps, wac, rac, hist] = await Promise.all([
    Promise.all(ids.map((id) => indicatorValues(db, BY_ID[id], refs, v))),
    jobs ? lodesValues(db, "wac", refs, ctx.lodes) : null,
    jobs ? lodesValues(db, "rac", refs, ctx.lodes) : null,
    Promise.all(ids.map((id) => indicatorSeries(db, BY_ID[id], [sel]).catch(() => []))),
  ]);
  const out = ids.map((id, i): Tile => {
    const ind = BY_ID[id], f = FORMATS[ind.format];
    const a = maps[i].get(sel.id), b = cmp ? maps[i].get(cmp.id) : null;
    return {
      label: ind.label, value: a?.value == null ? "–" : f(a.value),
      meta: a?.moe != null ? `±${f(a.moe)}${lowReliability(a.value, a.moe) ? " · use with caution" : ""}` : String(v),
      method: a?.value == null ? null : a.method,
      spark: hist[i].filter((p) => years.has(p.vintage) && p.vintage <= v).map((p) => ({ x: p.vintage, y: p.value! })),
      compare: cmp ? { label: cmp.label, value: b?.value == null ? "–" : f(b.value) } : null,
    };
  });
  if (wac && rac) {
    const jobsOf = (id: string) => wac.get(`${id}|C000`) ?? 0, workersOf = (id: string) => rac.get(`${id}|C000`) ?? 0;
    const per = (id: string) => (workersOf(id) ? (jobsOf(id) / workersOf(id)).toFixed(2) : "–");
    const t = (label: string, f: (id: string) => string, method: Method): Tile => ({ label, value: f(sel.id), meta: `LODES8 ${ctx.lodes}`, method, spark: [], compare: cmp ? { label: cmp.label, value: f(cmp.id) } : null });
    out.push(t("Jobs located here", (id) => fmtInt(jobsOf(id)), "aggregated"), t("Workers who live here", (id) => fmtInt(workersOf(id)), "aggregated"), t("Jobs per resident worker", per, "derived"));
  }
  return out;
}

// ---- tract maps ---------------------------------------------------------------------------------------------------

/** The tracts that make up each area shown, found once (the geometry work is the slow part). */
export interface MapBase { area: Feature; tracts: Feature[]; label: string; context: Feature[] }

/** ACS tracts were redrawn in 2020, so a map for an earlier vintage uses the newest one. */
export const tractYear = (ctx: Ctx) => (ctx.v >= 2021 ? ctx.v : ctx.latestVintage);

export async function mapBases(ctx: Ctx): Promise<MapBase[]> {
  const [tractFc, countyFc] = await Promise.all([geojson("tract"), geojson("county")]);
  const tracts: Feature[] = tractFc.features;
  const bases = await Promise.all(ctx.refs.map(async (r) => {
    const fc = await geojson(r.type);
    const area: Feature | undefined = fc.features.find((f: Feature) => f.properties.id === r.id);
    return area ? { area, tracts: tractsFor(area, tracts), label: r.label, context: countyFc.features as Feature[] } : null;
  }));
  return bases.filter((b): b is MapBase => !!b);
}

export interface MapDef { id: string; title: string }
export const MAPS: MapDef[] = [
  { id: "median_income", title: "Median household income" },
  { id: "poverty", title: "People below poverty" },
  { id: "bachelors", title: "Adults with a bachelor's degree or more" },
  { id: "median_value", title: "Median home value" },
  { id: "median_rent", title: "Median gross rent" },
  { id: "renters", title: "Renter households" },
  { id: "rent_burden", title: "Renters paying 30% or more of income" },
  { id: "age65", title: "Age 65 and over" },
  { id: "under18", title: "Under 18" },
  { id: "foreign_born", title: "Foreign-born residents" },
  { id: "no_vehicle", title: "Households with no vehicle" },
  { id: "wfh", title: "Workers who work from home" },
];

/** One map per area, all classed on the same breaks (taken from every tract shown) so two areas compare fairly. */
export async function loadMap(ctx: Ctx, bases: MapBase[], def: MapDef): Promise<{ base: MapBase; data: PanelData }[]> {
  const ind = BY_ID[def.id];
  const values = await indicatorValues(ctx.db, ind, null, tractYear(ctx), "tract");
  const val = new Map([...values].map(([id, x]) => [id, x.value ?? null]));
  const shown = bases.flatMap((b) => b.tracts.map((t) => val.get(t.properties.id)));
  const cuts = quantileBreaks(shown, 5);
  const f = FORMATS[ind.format];
  const tick: Fmt = ind.format === "money" ? (v) => (v >= 10000 ? `$${Math.round(v / 1000)}K` : fmtMoney(v)) : ind.format === "pct" ? (v) => fmtPct(v, cuts.length && Math.abs(cuts[cuts.length - 1] - cuts[0]) < 0.1 ? 1 : 0) : ind.format === "int" ? FMT.compact : num(f);
  return bases.map((base) => {
    const have = base.tracts.map((t) => val.get(t.properties.id)).filter((x): x is number => x != null);
    const summary = have.length ? `${base.tracts.length} tracts · ${f(Math.min(...have))} to ${f(Math.max(...have))}` : `${base.tracts.length} tracts · no data`;
    return { base, data: have.length ? { kind: "map" as const, uid: "", tracts: base.tracts, values: val, cuts, area: base.area, tick, summary, context: base.context, names: ctx.names } : empty(EMPTY_TEXT) };
  });
}

// ---- commute flows ------------------------------------------------------------------------------------------------

export const OD_TYPES = ["county", "place"];

export interface FlowPage { tiles: Tile[]; map: PanelData; byArea: PanelData; mix: PanelData }

// The two directions of a commute by earnings, industry class and age, as the dashboard draws them.
const MIX: [string, [string, string][]][] = COMMUTE_MIX.map((x) => [x.label, x.groups]);

export async function loadFlows(ctx: Ctx): Promise<FlowPage | null> {
  const { sel, db, lodes } = ctx;
  if (!OD_TYPES.includes(sel.type) || !lodes) return null;
  const name = (id: string) => (id === ctx.outsideId ? `Elsewhere in ${ctx.state.name}` : id === "out-of-state" ? `Outside ${ctx.state.name}` : ctx.names.get(id) ?? id);
  const [raw, places, shapes] = await Promise.all([odFlowsBy(db, sel.type, sel.id, lodes), centroids(db, sel.type), geojson(sel.type)]);
  const rows: (OdRow & Record<string, number>)[] = raw.map((r) => ({ ...r, jobs: r.S000 })) as any;
  if (!rows.length) return null;
  const s = summarizeFlows(rows, sel.id);
  const tile = (label: string, value: string, meta: string): Tile => ({ label, value, meta, method: "aggregated", compare: null, spark: [] });
  const pct = (x: number | null) => (x == null ? "\u2013" : fmtPct(x, 0));
  const tiles = [
    tile("Live and work here", pct(s.liveShare), `${fmtInt(s.both)} of ${fmtInt(s.workers)} resident workers`),
    tile("Commute in", pct(s.inShare), `${fmtInt(s.inflow)} of ${fmtInt(s.jobs)} jobs here`),
    tile("Commute out", pct(s.outShare), `${fmtInt(s.outflow)} of ${fmtInt(s.workers)} resident workers`),
    tile("Jobs located here", fmtInt(s.jobs), `LODES8 ${lodes}`),
  ];
  const { flows, unmapped } = buildFlows(rows, sel.id, "both", 0, new Set(places.keys()));
  const mapPlaces = places;
  const feats: Feature[] = shapes.features;
  const area = feats.find((f) => f.properties.id === sel.id) ?? null;
  const frame = flowFrame(flows, mapPlaces, sel.id, area);
  const outside = unmapped.slice(0, 3).map((u) => `${name(u.id)} ${fmtCompact(u.work + u.live)}`).join(" · ");

  // Commute in and out with each area, side by side: residents who work there on the left, workers who live there on the right.
  const sides = new Map<string, { out: number; inn: number }>();
  const side = (id: string) => sides.get(id) ?? sides.set(id, { out: 0, inn: 0 }).get(id)!;
  for (const f of flows) { if (f.origin === sel.id && f.dest !== sel.id) side(f.dest).out += f.count; else if (f.dest === sel.id && f.origin !== sel.id) side(f.origin).inn += f.count; }
  for (const u of unmapped) { side(u.id).out += u.work; side(u.id).inn += u.live; }
  const top = [...sides].sort((a, b) => b[1].out + b[1].inn - (a[1].out + a[1].inn)).slice(0, 8);
  const byArea: PanelData = top.length ? { kind: "diverging", rows: top.map(([id, v]) => ({ label: name(id), left: v.out, right: v.inn })), leftLabel: "Commute out (residents)", rightLabel: "Commute in (workers)", fmt: FMT.compact } : empty();

  // The people who commute out, live and work here, and commute in, by earnings, industry class and age of their jobs, as shares of each group.
  const keys = MIX.flatMap(([, list]) => list.map(([k]) => k));
  const sums = commuteSides(rows, sel.id, keys);
  const share = (side: Record<string, number>, list: [string, string][], k: string) => {
    const total = list.reduce((t, [kk]) => t + (side[kk] ?? 0), 0);
    return total ? (side[k] ?? 0) / total : 0;
  };
  const mixRows = MIX.flatMap(([group, list]) => list.map(([k, label]) => ({ group, label, out: share(sums.out, list, k), here: share(sums.here, list, k), inn: share(sums.inn, list, k) })));
  const mix: PanelData = mixRows.some((r) => r.out + r.here + r.inn > 0) ? { kind: "triple", rows: mixRows, fmt: pct0 } : empty();

  let map: PanelData = empty("Commute flows are not available for this area.");
  if (frame && flows.length && mapPlaces.size >= 4) {
    const countyFc = await geojson("county");
    // Draw the routes the frame reaches; a route whose far end is off the frame is clipped by the map edge.
    const inside = feats.filter((f) => { const b = boxOfFeature(f); return b.w <= frame.e && b.e >= frame.w && b.s <= frame.n && b.n >= frame.s; });
    // Both directions are kept in view: the 25 busiest routes in and the 15 busiest out (a city's inflow would otherwise hide its outflow).
    const byCount = [...flows].sort((a, b) => b.count - a.count);
    const drawn = [...byCount.filter((f) => f.dest === sel.id).slice(0, 25), ...byCount.filter((f) => f.origin === sel.id).slice(0, 15)];
    map = { kind: "flow", uid: "", frame, context: countyFc.features, shapes: inside, focusId: sel.id, places: mapPlaces, flows: drawn, names: new Map([...mapPlaces.keys()].map((id) => [id, id === sel.id ? sel.label : name(id)])), fmt: FMT.compact,
            outside: `${frame.beyond.routes ? `${frame.beyond.routes} smaller routes lie beyond the frame (${fmtCompact(frame.beyond.jobs)} jobs). ` : ""}${outside ? `Not on the map: ${outside}.` : ""}`.trim() };
  } else {
    // Too few neighbouring areas to draw lines between: show where the numbers go as two bars instead.
    const split = (side: "origin_id" | "dest_id", own: string): Segment[] => {
      const mine = rows.filter((r) => r.origin_id === sel.id && r.dest_id === sel.id).reduce((t, r) => t + r.jobs, 0);
      const rest = rows.filter((r) => !(r.origin_id === sel.id && r.dest_id === sel.id) && (side === "origin_id" ? r.dest_id === sel.id : r.origin_id === sel.id)).sort((a, b) => b.jobs - a.jobs);
      const named = rest.slice(0, 3).map((r) => ({ label: name(r[side]), value: r.jobs }));
      const others = rest.slice(3).reduce((t, r) => t + r.jobs, 0);
      return [{ label: own, value: mine }, ...named, ...(others > 0 ? [{ label: "Other areas", value: others }] : [])].filter((x) => x.value > 0);
    };
    map = { kind: "flowsum", out: split("dest_id", "Live and work here"), inn: split("origin_id", "Residents who work here"), outTitle: "Where residents work", innTitle: "Who holds the jobs here", fmt: FMT.compact, outside: "" };
  }
  return { tiles, map, byArea, mix };
}

function boxOfFeature(f: Feature) {
  const b = { w: Infinity, s: Infinity, e: -Infinity, n: -Infinity };
  const walk = (c: any) => (typeof c[0] === "number" ? (b.w = Math.min(b.w, c[0]), b.e = Math.max(b.e, c[0]), b.s = Math.min(b.s, c[1]), b.n = Math.max(b.n, c[1])) : c.forEach(walk));
  walk((f.geometry as any).coordinates);
  return b;
}

// ---- indicator table ----------------------------------------------------------------------------------------------

export interface IndicatorRow { label: string; group: string; value: string; moe: string; method: Method | null; compare: string }

export async function loadIndicatorRows(ctx: Ctx, list: Indicator[], progress?: () => void): Promise<IndicatorRow[]> {
  const out: IndicatorRow[] = [];
  for (let i = 0; i < list.length; i += 8) {
    check(ctx);
    const batch = list.slice(i, i + 8);
    const maps = await Promise.all(batch.map((ind) => indicatorValues(ctx.db, ind, ctx.refs, ctx.v).catch(() => new Map())));
    batch.forEach((ind, j) => {
      const f = FORMATS[ind.format], a = maps[j].get(ctx.sel.id), b = ctx.cmp ? maps[j].get(ctx.cmp.id) : null;
      out.push({
        label: ind.label, group: ind.group, value: a?.value == null ? "–" : f(a.value), moe: a?.moe != null ? `±${f(a.moe)}` : "", method: a?.value == null ? null : a.method,
        compare: b?.value == null ? (ctx.cmp ? "–" : "") : f(b.value),
      });
      progress?.();
    });
  }
  return out;
}

export { specFor };
