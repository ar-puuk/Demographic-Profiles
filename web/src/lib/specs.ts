// Distribution charts, defined once: categories over ACS variable codes, and the builders that turn them
// into chart rows (a share of a total, with the margin of error, for the selected and compared areas).
import type { Db } from "./db";
import { acsLabels, acsVariables, lodesValues, lodesVariables, shareMoe, sumOf, type Ref } from "./data";
import { fmtInt, methodOf, type Method } from "./format";

export interface AreaRef extends Ref {
  label: string;
}
// `less` rows are subtracted from `vars` (a category that is a parent row minus some of its children).
export interface Category { label: string; vars: string[]; less?: string[] }
// `since`: first vintage whose table layout the codes below describe (earlier vintages return no rows rather than a wrong share).
// `legacy`: for vintages before `before`, these codes are renamed (the Census moved a row, the meaning is unchanged).
export interface Spec {
  topic: string; den: string[]; minus?: string[]; categories: Category[];
  since?: number; legacy?: { before: number; map: Record<string, string> };
}
export interface ShareRow { category: string; series: string; value: number; count?: number; moe?: number | null; note?: string; method?: Method }

const code = (table: string, n: number) => `${table}_${String(n).padStart(3, "0")}`;
const codes = (table: string, ...n: number[]) => n.map((i) => code(table, i));
const span = (table: string, a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => code(table, a + i));

// Sex by age, merged to 5-year groups (the Census splits 15-24 and 60-69 more finely).
const AGE_GROUPS: [string, number[], number[]][] = [
  ["Under 5", [3], [27]], ["5–9", [4], [28]], ["10–14", [5], [29]], ["15–19", [6, 7], [30, 31]],
  ["20–24", [8, 9, 10], [32, 33, 34]], ["25–29", [11], [35]], ["30–34", [12], [36]], ["35–39", [13], [37]],
  ["40–44", [14], [38]], ["45–49", [15], [39]], ["50–54", [16], [40]], ["55–59", [17], [41]],
  ["60–64", [18, 19], [42, 43]], ["65–69", [20, 21], [44, 45]], ["70–74", [22], [46]], ["75–79", [23], [47]],
  ["80–84", [24], [48]], ["85+", [25], [49]],
];
export const AGES = AGE_GROUPS.map((g) => g[0]);

// Disability by age and sex (B18101): the "with a disability" and "no disability" rows, every age group, men then women.
const DISABLED = [4, 7, 10, 13, 16, 19, 23, 26, 29, 32, 35, 38].map((n) => code("B18101", n));
const NOT_DISABLED = [5, 8, 11, 14, 17, 20, 24, 27, 30, 33, 36, 39].map((n) => code("B18101", n));
// Language at home (C16001, the collapsed table the Census publishes for every area): each language group is a total row
// followed by "very well" and "less than very well". Spanish is the first.
export const LANGUAGE_ROWS = Array.from({ length: 12 }, (_, k) => 3 + 3 * k);
// A group total already includes its two "very well" rows, so only the totals are summed.
const OTHER_LANGUAGES = LANGUAGE_ROWS.slice(1).map((n) => code("C16001", n));

// topic, total variable(s) and categories. `minus` removes rows that are not part of the base.
export const SPECS: Record<string, Spec> = {
  occupancy: { topic: "housing", den: codes("B25002", 1), categories: [{ label: "Occupied", vars: codes("B25002", 2) }, { label: "Vacant", vars: codes("B25002", 3) }] },
  internet: { topic: "social", den: codes("B28002", 1), categories: [
    { label: "Has an internet subscription", vars: codes("B28002", 2) }, { label: "Access without a subscription", vars: codes("B28002", 12) },
    { label: "No internet access", vars: codes("B28002", 13) }] },
  enrollment: { topic: "education", den: codes("B14001", 1), categories: [
    { label: "Not enrolled", vars: codes("B14001", 10) }, { label: "Preschool", vars: codes("B14001", 3) },
    { label: "Kindergarten to grade 8", vars: codes("B14001", 4, 5, 6) }, { label: "High school", vars: codes("B14001", 7) },
    { label: "College", vars: codes("B14001", 8) }, { label: "Graduate or professional school", vars: codes("B14001", 9) }] },
  ageBands: { topic: "population", den: codes("B01001", 1), categories: [
    { label: "Under 18", vars: [...codes("B01001", 3, 4, 5, 6), ...codes("B01001", 27, 28, 29, 30)] },
    { label: "18 to 64", vars: [...span("B01001", 7, 19), ...span("B01001", 31, 43)] },
    { label: "65 and over", vars: [...span("B01001", 20, 25), ...span("B01001", 44, 49)] }] },
  race: { topic: "population", den: codes("B02001", 1), categories: [
    { label: "White", vars: codes("B02001", 2) }, { label: "Black or African American", vars: codes("B02001", 3) },
    { label: "Am. Indian, Alaska Native", vars: codes("B02001", 4) }, { label: "Asian", vars: codes("B02001", 5) },
    { label: "Pacific Islander", vars: codes("B02001", 6) },
    { label: "Some other race", vars: codes("B02001", 7) }, { label: "Two or more races", vars: codes("B02001", 8) }] },
  ethnicity: { topic: "population", den: codes("B03003", 1), categories: [
    { label: "Hispanic or Latino (any race)", vars: codes("B03003", 3) }, { label: "Not Hispanic or Latino", vars: codes("B03003", 2) }] },
  sex: { topic: "population", den: codes("B01001", 1), categories: [{ label: "Men", vars: codes("B01001", 2) }, { label: "Women", vars: codes("B01001", 26) }] },
  poverty: { topic: "income", den: codes("B17001", 1), categories: [{ label: "Below the poverty level", vars: codes("B17001", 2) }, { label: "At or above the poverty level", vars: codes("B17001", 31) }] },
  tenure: { topic: "households", den: codes("B25003", 1), categories: [
    { label: "Own", vars: codes("B25003", 2) }, { label: "Rent", vars: codes("B25003", 3) }] },
  structure: { topic: "housing", den: codes("B25024", 1), categories: [
    { label: "Single-family detached", vars: codes("B25024", 2) }, { label: "Single-family attached", vars: codes("B25024", 3) },
    { label: "2 units", vars: codes("B25024", 4) }, { label: "3 to 4 units", vars: codes("B25024", 5) },
    { label: "5 to 9 units", vars: codes("B25024", 6) }, { label: "10 to 19 units", vars: codes("B25024", 7) },
    { label: "20 or more units", vars: codes("B25024", 8, 9) }, { label: "Mobile home", vars: codes("B25024", 10) },
    { label: "Boat, RV, van, etc.", vars: codes("B25024", 11) }] },
  householdType: { topic: "households", since: 2019, den: codes("B11012", 1), categories: [
    { label: "Married couple", vars: codes("B11012", 2) }, { label: "Cohabiting couple", vars: codes("B11012", 5) },
    { label: "Female householder, no partner", vars: codes("B11012", 8) }, { label: "Male householder, no partner", vars: codes("B11012", 13) }] },
  income: { topic: "income", den: codes("B19001", 1), categories: [
    { label: "Under $15,000", vars: codes("B19001", 2, 3) }, { label: "$15,000 to $24,999", vars: codes("B19001", 4, 5) },
    { label: "$25,000 to $34,999", vars: codes("B19001", 6, 7) }, { label: "$35,000 to $49,999", vars: codes("B19001", 8, 9, 10) },
    { label: "$50,000 to $74,999", vars: codes("B19001", 11, 12) }, { label: "$75,000 to $99,999", vars: codes("B19001", 13) },
    { label: "$100,000 to $149,999", vars: codes("B19001", 14, 15) }, { label: "$150,000 to $199,999", vars: codes("B19001", 16) },
    { label: "$200,000 or more", vars: codes("B19001", 17) }] },
  rentBurden: { topic: "housing", den: codes("B25070", 1), minus: codes("B25070", 11), categories: [
    { label: "Under 20% of income", vars: codes("B25070", 2, 3, 4) }, { label: "20% to 29%", vars: codes("B25070", 5, 6) },
    { label: "30% to 34%", vars: codes("B25070", 7) }, { label: "35% to 49%", vars: codes("B25070", 8, 9) },
    { label: "50% or more", vars: codes("B25070", 10) }] },
  education: { topic: "education", den: codes("B15003", 1), categories: [
    { label: "Less than high school", vars: span("B15003", 2, 16) }, { label: "High school or GED", vars: codes("B15003", 17, 18) },
    { label: "Some college or associate degree", vars: codes("B15003", 19, 20, 21) },
    { label: "Bachelor's degree", vars: codes("B15003", 22) }, { label: "Graduate or professional degree", vars: codes("B15003", 23, 24, 25) }] },
  employment: { topic: "employment", den: codes("B23025", 1), categories: [
    { label: "Employed", vars: codes("B23025", 4) }, { label: "Unemployed", vars: codes("B23025", 5) },
    { label: "Armed forces", vars: codes("B23025", 6) }, { label: "Not in labor force", vars: codes("B23025", 7) }] },
  ownerBurden: { topic: "housing", den: codes("B25091", 1), minus: codes("B25091", 12, 23), categories: [
    { label: "Under 20% of income", vars: [...codes("B25091", 3, 4, 5), ...codes("B25091", 14, 15, 16)] },
    { label: "20% to 29%", vars: [...codes("B25091", 6, 7), ...codes("B25091", 17, 18)] },
    { label: "30% to 34%", vars: codes("B25091", 8, 19) }, { label: "35% to 49%", vars: [...codes("B25091", 9, 10), ...codes("B25091", 20, 21)] },
    { label: "50% or more", vars: codes("B25091", 11, 22) }] },
  rentBands: { topic: "housing", since: 2015, den: codes("B25063", 1), minus: codes("B25063", 27), categories: [
    { label: "Under $500", vars: span("B25063", 3, 11) }, { label: "$500 to $999", vars: span("B25063", 12, 19) },
    { label: "$1,000 to $1,499", vars: codes("B25063", 20, 21) }, { label: "$1,500 to $1,999", vars: codes("B25063", 22) },
    { label: "$2,000 to $2,499", vars: codes("B25063", 23) }, { label: "$2,500 or more", vars: span("B25063", 24, 26) }] },
  valueBands: { topic: "housing", den: codes("B25075", 1), categories: [
    { label: "Under $200,000", vars: span("B25075", 2, 18) }, { label: "$200,000 to $299,999", vars: codes("B25075", 19, 20) },
    { label: "$300,000 to $399,999", vars: codes("B25075", 21) }, { label: "$400,000 to $499,999", vars: codes("B25075", 22) },
    { label: "$500,000 to $749,999", vars: codes("B25075", 23) }, { label: "$750,000 or more", vars: span("B25075", 24, 27) }] },
  disability: { topic: "social", den: codes("B18101", 1), categories: [
    { label: "With a disability", vars: DISABLED }, { label: "No disability", vars: NOT_DISABLED }] },
  language: { topic: "social", den: codes("C16001", 1), categories: [
    { label: "English only", vars: codes("C16001", 2) }, { label: "Spanish", vars: codes("C16001", 3) },
    { label: "Another language", vars: OTHER_LANGUAGES }] },
  raceEthnicity: { topic: "population", den: codes("B03002", 1), categories: [
    { label: "White, not Hispanic", vars: codes("B03002", 3) }, { label: "Hispanic or Latino", vars: codes("B03002", 12) },
    { label: "Asian, not Hispanic", vars: codes("B03002", 6) }, { label: "Black, not Hispanic", vars: codes("B03002", 4) },
    { label: "Two or more races, not Hispanic", vars: codes("B03002", 9) },
    { label: "Another race, not Hispanic", vars: codes("B03002", 5, 7, 8) }] },
  nativity: { topic: "population", legacy: { before: 2015, map: { B05002_021: "B05002_015" } }, den: codes("B05002", 1), categories: [
    { label: "Born in this state", vars: codes("B05002", 3) }, { label: "Born in another state", vars: codes("B05002", 4) },
    { label: "Born in a U.S. territory or abroad to U.S. parents", vars: codes("B05002", 9) }, { label: "Naturalized citizen", vars: codes("B05002", 14) },
    { label: "Not a U.S. citizen", vars: codes("B05002", 21) }] },
  mobility: { topic: "population", den: codes("B07003", 1), categories: [
    { label: "Same home a year ago", vars: codes("B07003", 4) }, { label: "Moved within the county", vars: codes("B07003", 7) },
    { label: "From another county in the state", vars: codes("B07003", 10) }, { label: "From another state", vars: codes("B07003", 13) },
    { label: "From abroad", vars: codes("B07003", 16) }] },
  vacancyStatus: { topic: "housing", den: codes("B25004", 1), categories: [
    { label: "For rent", vars: codes("B25004", 2) }, { label: "For sale", vars: codes("B25004", 4) },
    { label: "Rented or sold, not occupied", vars: codes("B25004", 3, 5) }, { label: "Seasonal or occasional use", vars: codes("B25004", 6) },
    { label: "Other vacant", vars: codes("B25004", 7, 8) }] },
  householdDetail: { topic: "households", since: 2019, den: codes("B11012", 1), categories: [
    { label: "Married couple with children", vars: codes("B11012", 3) }, { label: "Married couple, no children", vars: codes("B11012", 4) },
    { label: "Cohabiting couple", vars: codes("B11012", 5) }, { label: "Single parent", vars: codes("B11012", 10, 15) },
    { label: "Living alone", vars: codes("B11012", 9, 14) }, { label: "Other households", vars: codes("B11012", 11, 12, 16, 17) }] },
  // B28002 "any" rows overlap, so the categories use the "no other type" rows; what is left of "broadband of any type" is people
  // with more than one kind. The six categories add to the total.
  internetType: { topic: "social", since: 2017, den: codes("B28002", 1), categories: [
    { label: "Cable, fiber or DSL only", vars: codes("B28002", 8) }, { label: "Cellular data only", vars: codes("B28002", 6) },
    { label: "Satellite only", vars: codes("B28002", 10) }, { label: "Dial-up or other service only", vars: codes("B28002", 3, 11) },
    { label: "More than one type", vars: codes("B28002", 4), less: codes("B28002", 6, 8, 10) },
    { label: "No subscription", vars: codes("B28002", 12, 13) }] },
  english: { topic: "social", den: LANGUAGE_ROWS.flatMap((n) => codes("C16001", n + 1, n + 2)), categories: [
    { label: "Speak English very well", vars: LANGUAGE_ROWS.map((n) => code("C16001", n + 1)) },
    { label: "Less than very well", vars: LANGUAGE_ROWS.map((n) => code("C16001", n + 2)) }] },
  marital: { topic: "population", den: codes("B12001", 1), categories: [
    { label: "Never married", vars: codes("B12001", 3, 12) }, { label: "Married", vars: codes("B12001", 4, 13) },
    { label: "Widowed", vars: codes("B12001", 9, 18) }, { label: "Divorced", vars: codes("B12001", 10, 19) }] },
  crowding: { topic: "housing", den: codes("B25014", 1), categories: [
    { label: "0.50 or fewer per room", vars: codes("B25014", 3, 9) }, { label: "0.51 to 1.00", vars: codes("B25014", 4, 10) },
    { label: "1.01 to 1.50", vars: codes("B25014", 5, 11) }, { label: "More than 1.50", vars: codes("B25014", 6, 7, 12, 13) }] },
  residentIndustry: { topic: "employment", den: codes("C24050", 1), categories: [
    { label: "Educational and health services", vars: codes("C24050", 11) }, { label: "Professional and administrative", vars: codes("C24050", 10) },
    { label: "Retail trade", vars: codes("C24050", 6) }, { label: "Finance, insurance and real estate", vars: codes("C24050", 9) },
    { label: "Manufacturing", vars: codes("C24050", 4) }, { label: "Construction", vars: codes("C24050", 3) },
    { label: "Arts, entertainment and food service", vars: codes("C24050", 12) }, { label: "Transportation and utilities", vars: codes("C24050", 7) },
    { label: "Public administration", vars: codes("C24050", 14) }, { label: "Other services", vars: codes("C24050", 13) },
    { label: "Wholesale and information", vars: codes("C24050", 5, 8) }, { label: "Agriculture and mining", vars: codes("C24050", 2) }] },
  commuteMode: { topic: "commute", den: codes("B08301", 1), categories: [
    { label: "Drove alone", vars: codes("B08301", 3) }, { label: "Carpooled", vars: codes("B08301", 4) },
    { label: "Public transportation", vars: codes("B08301", 10) }, { label: "Walked", vars: codes("B08301", 19) },
    { label: "Bicycle", vars: codes("B08301", 18) }, { label: "Taxi, motorcycle or other", vars: codes("B08301", 16, 17, 20) },
    { label: "Worked from home", vars: codes("B08301", 21) }] },
  travelTime: { topic: "commute", den: codes("B08303", 1), categories: [
    { label: "Under 10 minutes", vars: codes("B08303", 2, 3) }, { label: "10 to 19", vars: codes("B08303", 4, 5) },
    { label: "20 to 29", vars: codes("B08303", 6, 7) }, { label: "30 to 44", vars: codes("B08303", 8, 9, 10) },
    { label: "45 to 59", vars: codes("B08303", 11) }, { label: "60 minutes or more", vars: codes("B08303", 12, 13) }] },
};

// The Census also publishes means of transportation (B08601) and travel time (B08603) by where people work, with the
// same rows as the by-residence tables. They exist for the state, counties, cities and tracts, not for tracts.
const swapTable = (spec: Spec, from: string, to: string): Spec => JSON.parse(JSON.stringify(spec).split(from).join(to));
SPECS.commuteModeWork = swapTable(SPECS.commuteMode, "B08301", "B08601");
SPECS.travelTimeWork = swapTable(SPECS.travelTime, "B08303", "B08603");

const unique = <T,>(xs: T[]) => [...new Set(xs)];

// The spec as it applies to one vintage: null when its table layout does not exist yet, codes renamed where the Census moved a row.
export function specFor(spec: Spec, vintage: number): Spec | null {
  if (spec.since && vintage < spec.since) return null;
  const m = spec.legacy && vintage < spec.legacy.before ? spec.legacy.map : null;
  if (!m) return spec;
  const re = (xs: string[]) => xs.map((x) => m[x] ?? x);
  return { ...spec, den: re(spec.den), minus: spec.minus && re(spec.minus),
    categories: spec.categories.map((c) => ({ ...c, vars: re(c.vars), less: c.less && re(c.less) })) };
}

// Short display names for the 20 NAICS sectors, keyed by LODES variable (CNS01...) and by NAICS code (QCEW),
// so chart axes do not need a quarter of the card for labels.
const SECTORS = [
  ["CNS01", "11", "Agriculture, forestry, fishing"], ["CNS02", "21", "Mining and oil and gas"], ["CNS03", "22", "Utilities"],
  ["CNS04", "23", "Construction"], ["CNS05", "31-33", "Manufacturing"], ["CNS06", "42", "Wholesale trade"],
  ["CNS07", "44-45", "Retail trade"], ["CNS08", "48-49", "Transportation and warehousing"], ["CNS09", "51", "Information"],
  ["CNS10", "52", "Finance and insurance"], ["CNS11", "53", "Real estate and rental"],
  ["CNS12", "54", "Professional and technical services"], ["CNS13", "55", "Management of companies"],
  ["CNS14", "56", "Administrative and waste services"], ["CNS15", "61", "Educational services"],
  ["CNS16", "62", "Health care and social assistance"], ["CNS17", "71", "Arts, entertainment, recreation"],
  ["CNS18", "72", "Accommodation and food services"], ["CNS19", "81", "Other services"], ["CNS20", "92", "Public administration"],
];
export const SECTOR_BY_CNS: Record<string, string> = Object.fromEntries(SECTORS.map(([cns, , name]) => [cns, name]));
export const SECTOR_BY_NAICS: Record<string, string> = Object.fromEntries(SECTORS.map(([, naics, name]) => [naics, name]));

// Share rows for each area: [{category, series, value, count, moe, note}]. An empty result means the table does
// not exist for this vintage (for example household type in 2015 to 2018).
export async function distribution(handle: Db, base: Spec, refs: AreaRef[], vintage: number, given?: Category[]): Promise<ShareRow[]> {
  const spec = specFor(base, vintage);
  if (!spec) return [];
  const categories = given ?? spec.categories;
  const vars = unique([...categories.flatMap((c) => [...c.vars, ...(c.less ?? [])]), ...spec.den, ...(spec.minus ?? [])]);
  const map = await acsVariables(handle, spec.topic, refs, vintage, vars);
  const rows: ShareRow[] = [];
  for (const ref of refs) {
    const total = sumOf(map, ref.id, spec.den);
    const minus = spec.minus ? sumOf(map, ref.id, spec.minus) : { value: 0, moe: 0 };
    const den = total.any ? (total.value ?? 0) - (minus.value ?? 0) : null;
    const denMoe = total.moe == null ? null : Math.sqrt(total.moe ** 2 + (minus.moe ?? 0) ** 2);
    for (const cat of categories) {
      const parts = sumOf(map, ref.id, cat.vars);
      const less = cat.less ? sumOf(map, ref.id, cat.less) : null;
      if (!parts.any || !den) continue;
      const value = (parts.value ?? 0) - (less?.value ?? 0);
      const moe = less ? (parts.moe == null || less.moe == null ? null : Math.sqrt(parts.moe ** 2 + less.moe ** 2)) : parts.moe;
      rows.push({
        category: cat.label, series: ref.label, value: value / den, count: value,
        moe: shareMoe(value, den, moe, denMoe),
        note: fmtInt(value), method: methodOf(Math.max(parts.rank, less?.rank ?? 0, total.rank)),
      });
    }
  }
  return rows;
}

// Vehicles available by tenure: shares of all households, one row per vehicle count and tenure.
export async function vehicles(handle: Db, refs: AreaRef[], vintage: number) {
  const owner = [code("B25044", 3), ...codes("B25044", 4, 5, 6, 7, 8)];
  const renter = [code("B25044", 10), ...codes("B25044", 11, 12, 13, 14, 15)];
  const labels = ["No vehicle", "1 vehicle", "2 vehicles", "3 vehicles", "4 vehicles", "5 or more"];
  const map = await acsVariables(handle, "households", refs, vintage, [...owner, ...renter, code("B25044", 1)]);
  const out: Record<string, { category: string; series: string; value: number }[]> = {};
  for (const ref of refs) {
    const den = sumOf(map, ref.id, codes("B25044", 1)).value;
    out[ref.id] = den ? labels.flatMap((label, i) => [
      { category: label, series: "Owner-occupied", value: (map.get(`${ref.id}|${owner[i]}`)?.estimate ?? 0) / den },
      { category: label, series: "Renter-occupied", value: (map.get(`${ref.id}|${renter[i]}`)?.estimate ?? 0) / den },
    ]) : [];
  }
  return { labels, rows: out };
}

// Pyramid rows (shares of the area's population) for one area.
export async function pyramidRows(handle: Db, ref: AreaRef, vintage: number): Promise<{ age: string; sex: "Male" | "Female"; value: number }[]> {
  const vars = AGE_GROUPS.flatMap(([, m, f]) => [...m.map((n) => code("B01001", n)), ...f.map((n) => code("B01001", n))]);
  const map = await acsVariables(handle, "population", [ref], vintage, [...vars, code("B01001", 1)]);
  const total = sumOf(map, ref.id, codes("B01001", 1)).value;
  if (!total) return [];
  return AGE_GROUPS.flatMap(([age, m, f]) => [
    { age, sex: "Male" as const, value: (sumOf(map, ref.id, m.map((n) => code("B01001", n))).value ?? 0) / total },
    { age, sex: "Female" as const, value: (sumOf(map, ref.id, f.map((n) => code("B01001", n))).value ?? 0) / total },
  ]);
}

// Year-built categories change between vintages, so they are read from that vintage's variable labels
// (newest first).
export async function yearBuiltCategories(handle: Db, vintage: number): Promise<Category[]> {
  const labels = await acsLabels(handle, vintage, "B25034");
  return labels.filter((l) => l.variable !== code("B25034", 1))
    .map((l) => ({ label: l.label.split(" > ").pop()!.replace(/^Built /, ""), vars: [l.variable] }));
}

// ---- LODES -----------------------------------------------------------------------------------------------

let lodesLabels: Awaited<ReturnType<typeof lodesVariables>> | undefined;
export async function lodesGroups(handle: Db) {
  lodesLabels ??= await lodesVariables(handle);
  return lodesLabels;
}

// Share of jobs (WAC) or workers (RAC) by one LODES breakdown: group is industry, age, earnings, race,
// ethnicity, education or sex (firm age and size are all zero for Utah, so they are not offered).
// The base of a LODES breakdown's shares, or null when LODES publishes none: firm age and size are zero for Utah, and race, sex,
// ethnicity and education are zero before 2009 (zero there means "not reported", not "no jobs"). Education is reported only for
// workers 30 and older, so its shares are of those workers; every other breakdown partitions all jobs.
export function lodesBase(group: string, counts: number[], total: number): number | null {
  const published = counts.reduce((a, b) => a + b, 0);
  if (published <= 0) return null;
  return group === "education" ? published : total;
}

export async function lodesDistribution(handle: Db, kind: "wac" | "rac", refs: AreaRef[], year: number, group: string): Promise<ShareRow[]> {
  const labels = (await lodesGroups(handle)).filter((l) => l.source === "wac/rac" && l.group === group);
  const map = await lodesValues(handle, kind, refs, year);
  const rows: ShareRow[] = [];
  for (const ref of refs) {
    const total = map.get(`${ref.id}|C000`);
    if (!total) continue;
    const base = lodesBase(group, labels.map((l) => map.get(`${ref.id}|${l.variable}`) ?? 0), total);
    if (!base) continue;
    for (const l of labels) {
      const count = map.get(`${ref.id}|${l.variable}`) ?? 0;
      rows.push({ category: group === "industry" ? (SECTOR_BY_CNS[l.variable] ?? l.label) : l.label, series: ref.label, value: count / base, count,
                  note: `${fmtInt(count)} ${kind === "wac" ? "jobs" : "workers"}` });
    }
  }
  return rows;
}

// Order categories by the first series' value, largest first.
export function sortByFirst(rows: { series: string; category: string; value: number }[], descending = true) {
  const first = rows.length ? rows[0].series : null;
  const value = new Map(rows.filter((r) => r.series === first).map((r) => [r.category, r.value]));
  return [...value.keys()].sort((a, b) => (descending ? value.get(b)! - value.get(a)! : value.get(a)! - value.get(b)!));
}


// The share of each category at every vintage for one area, as line series (a vintage whose table is missing is skipped).
export async function distributionOverTime(handle: Db, spec: Spec, ref: AreaRef, vintages: number[], order?: string[]) {
  const per = await Promise.all(vintages.map(async (v) => ({ v, rows: await distribution(handle, spec, [ref], v) })));
  const labels = order ?? spec.categories.map((c) => c.label);
  return labels.map((label) => ({
    label, color: "",
    points: per.flatMap(({ v, rows }) => { const r = rows.find((x) => x.category === label); return r ? [{ x: v, y: r.value, note: r.note }] : []; }),
  })).filter((s) => s.points.length);
}

// ---- rates by group ----------------------------------------------------------------------------------------
// A rate is a share inside a group (people with a disability among 18 to 34 year olds), unlike a distribution, whose shares add to one.
export interface Rate { label: string; num: string[]; den: string[] }
// `relabel`: before vintage `before` the Census used other age brackets under the same rows; `labels` maps each group to its old name,
// and a trend leaves those groups out of the years before, because the two brackets are not the same people.
export interface RateSpec { topic: string; rates: Rate[]; since?: number; relabel?: { before: number; labels: Record<string, string> } }

export const rateLabel = (spec: RateSpec, label: string, vintage: number) => (spec.relabel && vintage < spec.relabel.before ? spec.relabel.labels[label] ?? label : label);

const both = (table: string, m: number[], f: number[]) => [...m, ...f].map((n) => code(table, n));
// [label, numerator rows for men, for women, denominator rows for men, for women]
const ageRates = (table: string, groups: [string, number[], number[], number[], number[]][]): Rate[] =>
  groups.map(([label, numM, numF, denM, denF]) => ({ label, num: both(table, numM, numF), den: both(table, denM, denF) }));
// Poverty rows come as below-poverty and at-or-above-poverty pairs; the base is their sum.
const povertyRates = (groups: [string, number[], number[], number[], number[]][]): Rate[] =>
  groups.map(([label, nm, nf, am, af]) => ({ label, num: both("B17001", nm, nf), den: both("B17001", [...nm, ...am], [...nf, ...af]) }));

export const RATES: Record<string, RateSpec> = {
  disabilityByAge: { topic: "social", rates: ageRates("B18101", [
    ["Under 5", [4], [23], [3], [22]], ["5 to 17", [7], [26], [6], [25]], ["18 to 34", [10], [29], [9], [28]],
    ["35 to 64", [13], [32], [12], [31]], ["65 to 74", [16], [35], [15], [34]], ["75 and over", [19], [38], [18], [37]]]) },
  uninsuredByAge: { topic: "social", relabel: { before: 2017, labels: { "6 to 18": "6 to 17", "19 to 25": "18 to 24", "26 to 34": "25 to 34" } }, rates: ageRates("B27001", [
    ["Under 6", [5], [33], [3], [31]], ["6 to 18", [8], [36], [6], [34]], ["19 to 25", [11], [39], [9], [37]], ["26 to 34", [14], [42], [12], [40]],
    ["35 to 44", [17], [45], [15], [43]], ["45 to 54", [20], [48], [18], [46]], ["55 to 64", [23], [51], [21], [49]],
    ["65 to 74", [26], [54], [24], [52]], ["75 and over", [29], [57], [27], [55]]]) },
  povertyByAge: { topic: "income", rates: povertyRates([
    ["Under 18", [4, 5, 6, 7, 8, 9], [18, 19, 20, 21, 22, 23], [33, 34, 35, 36, 37, 38], [47, 48, 49, 50, 51, 52]],
    ["18 to 24", [10], [24], [39], [53]], ["25 to 34", [11], [25], [40], [54]], ["35 to 44", [12], [26], [41], [55]],
    ["45 to 54", [13], [27], [42], [56]], ["55 to 64", [14], [28], [43], [57]], ["65 to 74", [15], [29], [44], [58]],
    ["75 and over", [16], [30], [45], [59]]]) },
  veteransByAge: { topic: "population", since: 2010, rates: ageRates("B21001", [
    ["18 to 34", [8], [26], [7], [25]], ["35 to 54", [11], [29], [10], [28]], ["55 to 64", [14], [32], [13], [31]],
    ["65 to 74", [17], [35], [16], [34]], ["75 and over", [20], [38], [19], [37]]]) },
  costBurden: { topic: "housing", rates: [
    { label: "Renters", num: codes("B25070", 7, 8, 9, 10), den: span("B25070", 2, 10) },
    { label: "Owners with a mortgage", num: codes("B25091", 8, 9, 10, 11), den: span("B25091", 3, 11) },
    { label: "Owners without a mortgage", num: codes("B25091", 19, 20, 21, 22), den: span("B25091", 14, 22) }] },
};

// The rate of each group for each area in one vintage.
export async function rates(handle: Db, spec: RateSpec, refs: AreaRef[], vintage: number): Promise<ShareRow[]> {
  if (spec.since && vintage < spec.since) return [];
  const vars = unique(spec.rates.flatMap((r) => [...r.num, ...r.den]));
  const map = await acsVariables(handle, spec.topic, refs, vintage, vars);
  const rows: ShareRow[] = [];
  for (const ref of refs) {
    for (const r of spec.rates) {
      const n = sumOf(map, ref.id, r.num), d = sumOf(map, ref.id, r.den);
      if (!n.any || !d.any || !d.value) continue;
      rows.push({ category: rateLabel(spec, r.label, vintage), series: ref.label, value: (n.value ?? 0) / d.value, count: n.value ?? 0, moe: shareMoe(n.value, d.value, n.moe, d.moe),
                  note: `${fmtInt(n.value)} of ${fmtInt(d.value)}` });
    }
  }
  return rows;
}

export async function ratesOverTime(handle: Db, spec: RateSpec, ref: AreaRef, vintages: number[]) {
  const per = await Promise.all(vintages.map(async (v) => ({ v, rows: await rates(handle, spec, [ref], v) })));
  return spec.rates.map((r) => ({
    label: r.label, color: "",
    points: per.flatMap(({ v, rows }) => { const x = rateLabel(spec, r.label, v) === r.label ? rows.find((q) => q.category === r.label) : undefined; return x ? [{ x: v, y: x.value, note: x.note }] : []; }),
  })).filter((s) => s.points.length);
}

// The languages spoken at home other than English: the top-level C16001 rows ranked by the first area's count.
export async function topLanguages(handle: Db, refs: AreaRef[], vintage: number, limit = 12): Promise<{ rows: ShareRow[]; order: string[] }> {
  const labels = await acsLabels(handle, vintage, "C16001");
  const names = new Map(labels.map((l) => [l.variable, l.label.split(" > ").pop()!]));
  const rowCodes = LANGUAGE_ROWS.map((n) => code("C16001", n));
  const map = await acsVariables(handle, "social", refs, vintage, [...rowCodes, code("C16001", 1)]);
  const total = (id: string) => map.get(`${id}|${code("C16001", 1)}`)?.estimate ?? 0;
  const count = (id: string, c: string) => map.get(`${id}|${c}`)?.estimate ?? 0;
  const order = rowCodes.map((c) => ({ c, v: count(refs[0].id, c) })).sort((a, b) => b.v - a.v).slice(0, limit).map((x) => x.c);
  const rows: ShareRow[] = refs.flatMap((ref) => order.map((c) => ({
    category: names.get(c) ?? c, series: ref.label, value: total(ref.id) ? count(ref.id, c) / total(ref.id) : 0,
    count: count(ref.id, c), note: `${fmtInt(count(ref.id, c))} people`,
  })));
  return { rows, order: order.map((c) => names.get(c) ?? c) };
}
