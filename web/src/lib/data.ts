// Data access: every query the app makes against the committed parquet files.
import { dataUrl, sql, type Db } from "./db";
import { methodOf, type Method } from "./format";
import { variablesOf, type GeoType, type Indicator } from "./indicators";

export interface Ref {
  type: GeoType | string;
  id: string;
}

export interface Geography {
  geo_id: string;
  geo_type: GeoType;
  geo_name: string;
  kind: string;
  organization: string | null;
  notes: string | null;
}

export interface IndicatorValue {
  value: number | null;
  moe: number | null;
  method: Method;
  flag: string | null;
  num?: number | null;
  den?: number | null;
}

const lit = (s: unknown) => `'${String(s).replace(/'/g, "''")}'`;
const list = (xs: unknown[]) => xs.map(lit).join(", ");
const groupByType = (refs: Ref[]) => {
  const g = new Map<string, string[]>();
  for (const r of refs) g.set(r.type, [...(g.get(r.type) ?? []), r.id]);
  return g;
};

// ---- lookups ---------------------------------------------------------------------------------------------

export const registry = (h: Db) =>
  sql<Geography>(h, `SELECT geo_id, geo_type, geo_name, kind, organization, notes
                     FROM read_parquet('${dataUrl("meta/geographies.parquet")}') ORDER BY geo_name`);

export async function acsVintages(h: Db): Promise<number[]> {
  const rows = await sql(h, `SELECT DISTINCT vintage FROM read_parquet('${dataUrl("meta/variables.parquet")}') ORDER BY vintage`);
  return rows.map((r) => r.vintage);
}

export const acsLabels = (h: Db, vintage: number, table: string) =>
  sql<{ variable: string; label: string }>(h, `SELECT variable, label FROM read_parquet('${dataUrl("meta/variables.parquet")}')
                                               WHERE vintage = ${+vintage} AND "table" = ${lit(table)} ORDER BY variable`);

// ---- ACS -------------------------------------------------------------------------------------------------

export interface AcsRow {
  geo_id: string;
  variable: string;
  estimate: number | null;
  moe: number | null;
  method: string;
  flag: string | null;
}

// Raw ACS variables for some areas in one vintage: Map("id|variable") -> row.
export async function acsVariables(h: Db, topic: string, refs: Ref[], vintage: number, variables: string[]) {
  const out = new Map<string, AcsRow>();
  await Promise.all([...groupByType(refs)].map(async ([type, ids]) => {
    const rows = await sql<AcsRow>(h, `
      SELECT geo_id, variable, estimate::DOUBLE AS estimate, moe::DOUBLE AS moe, method, flag
      FROM read_parquet('${dataUrl(`acs/${topic}/${type}.parquet`)}')
      WHERE vintage = ${+vintage} AND geo_id IN (${list(ids)}) AND variable IN (${list(variables)})`);
    for (const r of rows) out.set(`${r.geo_id}|${r.variable}`, r);
  }));
  return out;
}

// The sum of some variables in a Map from acsVariables, with its margin of error. A term with an estimate but no margin is a
// Census-controlled count (its margin is zero, as in the Census handbook); the sum has no margin only when no term has one.
// The same rule is applied in SQL by AGG_COLUMNS, so a figure reads the same on every card.
export function sumOf(map: Map<string, AcsRow>, id: string, variables: string[]) {
  let total: number | null = null, sq = 0, rank = 0, any = false, anyMoe = false;
  for (const variable of variables) {
    const r = map.get(`${id}|${variable}`);
    if (!r || r.estimate == null) continue;
    any = true;
    total = (total ?? 0) + r.estimate;
    if (r.moe != null) { anyMoe = true; sq += r.moe ** 2; }
    rank = Math.max(rank, r.method === "direct" ? 0 : r.method === "aggregated" ? 1 : 2);
  }
  return { value: total, moe: any && anyMoe ? Math.sqrt(sq) : null, rank, any };
}

// Margin of error of a proportion num/den (Census handbook formula).
export function shareMoe(num: number | null, den: number | null, numMoe: number | null, denMoe: number | null) {
  if (num == null || !den || numMoe == null) return null;
  const p = num / den;
  const inner = numMoe ** 2 - (denMoe == null ? 0 : p ** 2 * denMoe ** 2);
  const radicand = inner > 0 ? inner : numMoe ** 2 + (denMoe == null ? 0 : p ** 2 * denMoe ** 2);
  return Math.sqrt(radicand) / den;
}

// Margin of error of a ratio num/den where the numerator is not part of the denominator (average household size, mean travel
// time): the Census handbook's ratio formula, which has no cap on the numerator's share the way the proportion formula does.
export function ratioMoe(num: number | null, den: number | null, numMoe: number | null, denMoe: number | null) {
  if (num == null || !den || numMoe == null) return null;
  const r = num / den;
  return Math.sqrt(numMoe ** 2 + (denMoe == null ? 0 : r ** 2 * denMoe ** 2)) / den;
}

interface AggRow {
  num: number | null; num_moe: number | null;
  den: number | null; den_moe: number | null;
  minus_: number | null; minus_moe: number | null;
  rank: number; flag: string | null;
}

export function summarize(ind: Indicator, row: AggRow): IndicatorValue {
  const num = row.num;
  if (ind.type !== "share") {
    return { value: num, moe: row.num_moe ?? null, method: methodOf(row.rank ?? 0), flag: row.flag ?? null };
  }
  const den = (row.den ?? 0) - (row.minus_ ?? 0);
  const denMoe = row.den_moe == null ? null : Math.sqrt(row.den_moe ** 2 + (row.minus_moe ?? 0) ** 2);
  return {
    value: den > 0 && num != null ? num / den : null,
    moe: (ind.ratio ? ratioMoe : shareMoe)(num, den, row.num_moe, denMoe),
    method: methodOf(row.rank ?? 0), flag: row.flag ?? null, num, den,
  };
}

export const AGG_COLUMNS = (ind: Indicator) => {
  const num = list(ind.num), den = list(ind.den ?? []), minus = list(ind.minus ?? []);
  const part = (name: string, vars: string | null) => vars
    ? `sum(estimate) FILTER (WHERE variable IN (${vars}))::DOUBLE AS ${name},
       CASE WHEN count(moe) FILTER (WHERE variable IN (${vars})) = 0 THEN NULL
            ELSE sqrt(sum(power(coalesce(moe, 0), 2)) FILTER (WHERE variable IN (${vars}))) END::DOUBLE AS ${name}_moe`
    : `NULL::DOUBLE AS ${name}, NULL::DOUBLE AS ${name}_moe`;
  return [part("num", num), part("den", den || null), part("minus_", minus || null)].join(",\n");
};

// Vintages before an indicator's layout existed are left out, so no wrong share is computed from re-used variable ids.
const since = (ind: Indicator) => (ind.since ? `AND vintage >= ${+ind.since}` : "");

const METHOD_RANK = `max(CASE method WHEN 'direct' THEN 0 WHEN 'aggregated' THEN 1 ELSE 2 END)::INTEGER AS rank`;

// Indicator values for areas in one vintage: Map(id) -> value. `refs` null means every area of `type` (map layers).
export async function indicatorValues(h: Db, ind: Indicator, refs: Ref[] | null, vintage: number, type: string | null = null) {
  const out = new Map<string, IndicatorValue>();
  const targets: [string | null, string[] | null][] = refs ? [...groupByType(refs)] : [[type, null]];
  await Promise.all(targets.map(async ([t, ids]) => {
    const rows = await sql<AggRow & { geo_id: string }>(h, `
      SELECT geo_id, ${AGG_COLUMNS(ind)}, ${METHOD_RANK}, max(flag) AS flag
      FROM read_parquet('${dataUrl(`acs/${ind.topic}/${t}.parquet`)}')
      WHERE vintage = ${+vintage} ${ids ? `AND geo_id IN (${list(ids)})` : ""} AND variable IN (${list(variablesOf(ind))}) ${since(ind)}
      GROUP BY geo_id`);
    for (const r of rows) out.set(r.geo_id, summarize(ind, r));
  }));
  return out;
}

// An indicator's value in every vintage for every area of one type: Map(id) -> points, oldest first. It feeds the trend line in
// the map's hover tooltip.
export async function indicatorHistory(h: Db, ind: Indicator, type: string) {
  const rows = await sql<AggRow & { geo_id: string; vintage: number }>(h, `
    SELECT geo_id, vintage, ${AGG_COLUMNS(ind)}, ${METHOD_RANK}, max(flag) AS flag
    FROM read_parquet('${dataUrl(`acs/${ind.topic}/${type}.parquet`)}')
    WHERE variable IN (${list(variablesOf(ind))}) ${since(ind)}
    GROUP BY geo_id, vintage ORDER BY vintage`);
  const out = new Map<string, { x: number; y: number }[]>();
  for (const r of rows) {
    const v = summarize(ind, r).value;
    if (v == null) continue;
    (out.get(r.geo_id) ?? out.set(r.geo_id, []).get(r.geo_id)!).push({ x: r.vintage, y: v });
  }
  return out;
}

// Indicator history across vintages: [{id, vintage, value, moe, method}].
export async function indicatorSeries(h: Db, ind: Indicator, refs: Ref[]) {
  const out: (IndicatorValue & { id: string; vintage: number })[] = [];
  await Promise.all([...groupByType(refs)].map(async ([t, ids]) => {
    const rows = await sql<AggRow & { geo_id: string; vintage: number }>(h, `
      SELECT geo_id, vintage, ${AGG_COLUMNS(ind)}, ${METHOD_RANK}, max(flag) AS flag
      FROM read_parquet('${dataUrl(`acs/${ind.topic}/${t}.parquet`)}')
      WHERE geo_id IN (${list(ids)}) AND variable IN (${list(variablesOf(ind))}) ${since(ind)}
      GROUP BY geo_id, vintage`);
    for (const r of rows) out.push({ id: r.geo_id, vintage: r.vintage, ...summarize(ind, r) });
  }));
  return out.filter((r) => r.value != null).sort((a, b) => a.vintage - b.vintage);
}

// ---- population estimates --------------------------------------------------------------------------------

const PEP_FILE: Record<string, string> = { state: "state", county: "county", place: "place" };

// Annual population estimates [{id, year, value, vintage}] for the areas that have them (others return none).
export async function pepSeries(h: Db, refs: Ref[]) {
  const out: { id: string; year: number; value: number; vintage: number }[] = [];
  const byFile = new Map<string, string[]>();
  for (const r of refs) if (PEP_FILE[r.type]) byFile.set(PEP_FILE[r.type], [...(byFile.get(PEP_FILE[r.type]) ?? []), r.id]);
  await Promise.all([...byFile].map(async ([file, ids]) => {
    out.push(...await sql<(typeof out)[number]>(h, `SELECT geo_id AS id, year, estimate::DOUBLE AS value, vintage
                              FROM read_parquet('${dataUrl(`pep/${file}.parquet`)}')
                              WHERE geo_id IN (${list(ids)}) ORDER BY year`));
  }));
  return out;
}

// ---- LODES -----------------------------------------------------------------------------------------------

export async function lodesYears(h: Db): Promise<number[]> {
  const rows = await sql(h, `SELECT DISTINCT year FROM read_parquet('${dataUrl("lodes/wac/county.parquet")}') ORDER BY year`);
  return rows.map((r) => r.year);
}

// Jobs (kind "wac") or workers (kind "rac") by variable for one year: Map("id|variable") -> number.
export async function lodesValues(h: Db, kind: "wac" | "rac", refs: Ref[], year: number) {
  const out = new Map<string, number>();
  await Promise.all([...groupByType(refs)].map(async ([type, ids]) => {
    const rows = await sql(h, `SELECT geo_id, variable, jobs::DOUBLE AS jobs
                               FROM read_parquet('${dataUrl(`lodes/${kind}/${type}.parquet`)}')
                               WHERE year = ${+year} AND geo_id IN (${list(ids)})`);
    for (const r of rows) out.set(`${r.geo_id}|${r.variable}`, r.jobs);
  }));
  return out;
}

// Total jobs/workers over the years: [{id, year, value}]. The place and tract files omit rows of zero jobs (config lodes.drop_zero), so a year
// in which an area has no row is a year with none: it is filled in as 0 for an area that has rows in other years.
const ZERO_OMITTED = ["place", "tract"];
export async function lodesSeries(h: Db, kind: "wac" | "rac", refs: Ref[]) {
  const out: { id: string; year: number; value: number }[] = [];
  const years = await lodesYears(h);
  await Promise.all([...groupByType(refs)].map(async ([type, ids]) => {
    const rows = await sql<(typeof out)[number]>(h, `SELECT geo_id AS id, year, jobs::DOUBLE AS value
                              FROM read_parquet('${dataUrl(`lodes/${kind}/${type}.parquet`)}')
                              WHERE variable = 'C000' AND geo_id IN (${list(ids)}) ORDER BY year`);
    out.push(...(ZERO_OMITTED.includes(type) ? fillZeroYears(rows, years) : rows));
  }));
  return out;
}

export function fillZeroYears(rows: { id: string; year: number; value: number }[], years: number[]) {
  const have = new Set(rows.map((r) => `${r.id}|${r.year}`));
  const filled = [...rows];
  for (const id of new Set(rows.map((r) => r.id))) for (const year of years) if (!have.has(`${id}|${year}`)) filled.push({ id, year, value: 0 });
  return filled.sort((a, b) => a.year - b.year);
}

// One LODES breakdown over the years for one area: [{year, variable, jobs}] including the total (C000).
export async function lodesGroupSeries(h: Db, kind: "wac" | "rac", ref: Ref, variables: string[]) {
  return sql<{ year: number; variable: string; jobs: number }>(h, `
    SELECT year, variable, jobs::DOUBLE AS jobs FROM read_parquet('${dataUrl(`lodes/${kind}/${ref.type}.parquet`)}')
    WHERE geo_id = ${lit(ref.id)} AND variable IN (${list([...variables, "C000"])}) ORDER BY year`);
}

export const lodesVariables = (h: Db) =>
  sql<{ source: string; variable: string; group: string; label: string }>(
    h, `SELECT source, variable, "group", label FROM read_parquet('${dataUrl("meta/lodes_variables.parquet")}')`);

// Flows into and out of an area for one year, from the OD file of its own geography type.
export const odFlows = (h: Db, type: string, id: string, year: number) =>
  sql<{ origin_id: string; dest_id: string; jobs: number }>(h, `
    SELECT origin_id, dest_id, S000::DOUBLE AS jobs FROM read_parquet('${dataUrl(`lodes/od/${type}.parquet`)}')
    WHERE year = ${+year} AND (origin_id = ${lit(id)} OR dest_id = ${lit(id)})`);

// Flows of one area with the LEHD breakdowns of each flow: age (SA), monthly earnings (SE) and industry class (SI), three groups each.
export const odFlowsBy = (h: Db, type: string, id: string, year: number) =>
  sql<Record<string, any>>(h, `
    SELECT origin_id, dest_id, S000::DOUBLE AS S000, SA01::DOUBLE AS SA01, SA02::DOUBLE AS SA02, SA03::DOUBLE AS SA03,
           SE01::DOUBLE AS SE01, SE02::DOUBLE AS SE02, SE03::DOUBLE AS SE03, SI01::DOUBLE AS SI01, SI02::DOUBLE AS SI02, SI03::DOUBLE AS SI03
    FROM read_parquet('${dataUrl(`lodes/od/${type}.parquet`)}')
    WHERE year = ${+year} AND (origin_id = ${lit(id)} OR dest_id = ${lit(id)})`);

// A point inside each area of a type that has commute flows (computed by the pipeline's export step), keyed by geo_id.
export async function centroids(h: Db, type: string) {
  const rows = await sql<{ geo_id: string; lon: number; lat: number }>(h, `
    SELECT geo_id, lon, lat FROM read_parquet('${dataUrl("meta/centroids.parquet")}') WHERE geo_type = ${lit(type)}`);
  return new Map(rows.map((r) => [r.geo_id, { lon: r.lon, lat: r.lat }]));
}

// Where an area's workers live (origins) or where its residents work (destinations), top N, same type.
export function odTop(h: Db, type: string, id: string, year: number, direction: "origins" | "destinations", limit = 10) {
  const [near, far] = direction === "origins" ? ["dest_id", "origin_id"] : ["origin_id", "dest_id"];
  return sql<{ other: string; jobs: number }>(h, `
    SELECT ${far} AS other, S000::DOUBLE AS jobs FROM read_parquet('${dataUrl(`lodes/od/${type}.parquet`)}')
    WHERE year = ${+year} AND ${near} = ${lit(id)} ORDER BY S000 DESC LIMIT ${+limit}`);
}

// ---- QCEW ------------------------------------------------------------------------------------------------

const QCEW_FILE: Record<string, string> = { state: "state", county: "county" };

export async function qcewYears(h: Db): Promise<number[]> {
  const rows = await sql(h, `SELECT DISTINCT year FROM read_parquet('${dataUrl("qcew/county.parquet")}') ORDER BY year`);
  return rows.map((r) => r.year);
}

export interface QcewIndustry {
  industry: string;
  flag?: string;
  [variable: string]: string | number | undefined;
}

// Private-sector employment, establishments and pay by industry sector for one area and year.
// Returns [] when BLS publishes nothing for this kind of area (QCEW stops at the county).
export async function qcewIndustries(h: Db, ref: Ref, year: number): Promise<QcewIndustry[]> {
  if (!(ref.type in QCEW_FILE)) return [];
  const rows = await sql(h, `
    SELECT industry, variable, value::DOUBLE AS value, flag
    FROM read_parquet('${dataUrl(`qcew/${QCEW_FILE[ref.type]}.parquet`)}')
    WHERE geo_id = ${lit(ref.id)} AND year = ${+year} AND ownership = '5'`);
  const by = new Map<string, QcewIndustry>();
  for (const r of rows) {
    const o: QcewIndustry = by.get(r.industry) ?? { industry: r.industry };
    o[r.variable] = r.value;
    if (r.flag) o.flag = r.flag;
    by.set(r.industry, o);
  }
  return [...by.values()];
}

// One QCEW measure (employment, avg_annual_pay, ...) by industry over the years: [{year, industry, value, flag}]. A flag is
// `suppressed` (BLS withholds the value, which is null) or `partial` (an area sum missing a withheld county, a lower bound).
export async function qcewSeries(h: Db, ref: Ref, variable: string) {
  if (!(ref.type in QCEW_FILE)) return [];
  return sql<{ year: number; industry: string; value: number | null; flag: string | null }>(h, `
    SELECT year, industry, value::DOUBLE AS value, flag FROM read_parquet('${dataUrl(`qcew/${QCEW_FILE[ref.type]}.parquet`)}')
    WHERE geo_id = ${lit(ref.id)} AND ownership = '5' AND variable = ${lit(variable)} ORDER BY year`);
}

export const qcewCodes = (h: Db) =>
  sql<{ kind: string; code: string; label: string }>(h, `SELECT kind, code, label FROM read_parquet('${dataUrl("meta/qcew_codes.parquet")}')`);

export const hasQcew = (type: string) => type in QCEW_FILE;
export const hasPep = (type: string) => type in PEP_FILE;

// ---- map geometry ----------------------------------------------------------------------------------------

const geoCache = new Map<string, Promise<any>>();
// The part of the state outside every area of a type (the "Rest of Utah" of the flow map), one feature; empty when the areas cover the state.
const EMPTY_SHAPES: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const restCache = new Map<string, Promise<GeoJSON.FeatureCollection>>();
export function restShape(type: string): Promise<GeoJSON.FeatureCollection> {
  if (!restCache.has(type)) restCache.set(type, fetch(dataUrl(`web/rest-${type}.geojson`)).then((r) => (r.ok ? r.json() : EMPTY_SHAPES)).catch(() => EMPTY_SHAPES));
  return restCache.get(type)!;
}

export function geojson(type: string) {
  if (!geoCache.has(type)) geoCache.set(type, fetch(dataUrl(`web/${type}.geojson`)).then((r) => {
    if (!r.ok) throw new Error(`No map for ${type}`);
    return r.json();
  }));
  return geoCache.get(type)!;
}
