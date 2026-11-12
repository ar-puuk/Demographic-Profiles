// Every headline indicator in one list. It drives the value tiles, the map metrics and the Indicators table, so a
// number is defined once. `num`/`den` are ACS variable codes (summed); a median uses `num` alone.
//
//   type  count  one variable, a count
//         median one variable, a median
//         share  sum(num) / sum(den)
// `map: true` marks indicators that can colour the map (one topic, available for tracts).
import type { FormatId } from "./format";

export interface Indicator {
  id: string;
  label: string;
  topic: string;
  type: "count" | "median" | "share";
  num: string[];
  den?: string[];
  minus?: string[];
  format: FormatId;
  map: boolean;
  group: string;
  ratio?: boolean;  // a share whose numerator is not part of its denominator (average household size, mean travel time)
  since?: number;   // first vintage whose table layout the codes describe; earlier vintages have no value
}

const v = (table: string, ...n: number[]) => n.map((i) => `${table}_${String(i).padStart(3, "0")}`);
const range = (table: string, a: number, b: number) => v(table, ...Array.from({ length: b - a + 1 }, (_, i) => a + i));

const P = "Population";
const H = "Households and housing";
const I = "Income and education";
const C = "Commuting";

export const INDICATORS: Indicator[] = [
  { id: "pop", label: "Population", topic: "population", type: "count", num: v("B01001", 1), format: "int", map: true, group: P },
  { id: "median_age", label: "Median age", topic: "population", type: "median", num: v("B01002", 1), format: "one", map: true, group: P },
  { id: "under18", label: "Under 18", topic: "population", type: "share", num: [...v("B01001", 3, 4, 5, 6), ...v("B01001", 27, 28, 29, 30)], den: v("B01001", 1), format: "pct", map: true, group: P },
  { id: "age65", label: "Age 65 and over", topic: "population", type: "share", num: [...range("B01001", 20, 25), ...range("B01001", 44, 49)], den: v("B01001", 1), format: "pct", map: true, group: P },
  { id: "nh_white", label: "White, not Hispanic", topic: "population", type: "share", num: v("B03002", 3), den: v("B03002", 1), format: "pct", map: true, group: P },
  { id: "foreign_born", label: "Foreign-born residents", topic: "population", type: "share", num: v("B05002", 13), den: v("B05002", 1), format: "pct", map: true, group: P },
  { id: "movers", label: "Moved in the past year", topic: "population", type: "share", num: v("B07003", 7, 10, 13, 16), den: v("B07003", 1), format: "pct", map: true, group: P },
  { id: "veterans", label: "Veterans", topic: "population", type: "share", since: 2010, num: v("B21001", 2), den: v("B21001", 1), format: "pct", map: true, group: P },
  { id: "never_married", label: "Never married (15 and over)", topic: "population", type: "share", num: v("B12001", 3, 12), den: v("B12001", 1), format: "pct", map: true, group: P },
  { id: "uninsured", label: "People without health insurance", topic: "social", type: "share", num: v("B27001", 5, 8, 11, 14, 17, 20, 23, 26, 29, 33, 36, 39, 42, 45, 48, 51, 54, 57), den: v("B27001", 1), format: "pct", map: true, group: P },
  { id: "female", label: "Women", topic: "population", type: "share", num: v("B01001", 26), den: v("B01001", 1), format: "pct", map: true, group: P },
  { id: "hispanic", label: "Hispanic or Latino", topic: "population", type: "share", num: v("B03003", 3), den: v("B03003", 1), format: "pct", map: true, group: P },
  { id: "disability", label: "People with a disability", topic: "social", type: "share", num: v("B18101", 4, 7, 10, 13, 16, 19, 23, 26, 29, 32, 35, 38), den: v("B18101", 1), format: "pct", map: true, group: P },
  { id: "lep", label: "Speak English less than very well", topic: "social", type: "share", num: v("C16001", ...Array.from({ length: 12 }, (_, k) => 5 + 3 * k)), den: v("C16001", 1), format: "pct", map: true, group: P },
  { id: "race_white", label: "White alone", topic: "population", type: "share", num: v("B02001", 2), den: v("B02001", 1), format: "pct", map: true, group: P },
  { id: "race_black", label: "Black or African American", topic: "population", type: "share", num: v("B02001", 3), den: v("B02001", 1), format: "pct", map: true, group: P },
  { id: "race_asian", label: "Asian", topic: "population", type: "share", num: v("B02001", 5), den: v("B02001", 1), format: "pct", map: true, group: P },
  { id: "race_two", label: "Two or more races", topic: "population", type: "share", num: v("B02001", 8), den: v("B02001", 1), format: "pct", map: true, group: P },
  { id: "spanish_home", label: "Speak Spanish at home", topic: "social", type: "share", num: v("C16001", 3), den: v("C16001", 1), format: "pct", map: true, group: P },
  { id: "households", label: "Households", topic: "households", type: "count", num: v("B25003", 1), format: "int", map: true, group: H },
  { id: "married", label: "Married-couple households", topic: "households", type: "share", since: 2019, num: v("B11012", 2), den: v("B11012", 1), format: "pct", map: true, group: H },
  { id: "avg_hh_size", label: "Average household size", topic: "households", type: "share", ratio: true, num: v("B25008", 1), den: v("B25003", 1), format: "one", map: true, group: H },
  { id: "living_alone", label: "One-person households", topic: "households", type: "share", since: 2019, num: v("B11012", 9, 14), den: v("B11012", 1), format: "pct", map: true, group: H },
  { id: "renters", label: "Renter households", topic: "households", type: "share", num: v("B25003", 3), den: v("B25003", 1), format: "pct", map: true, group: H },
  { id: "no_vehicle", label: "Households with no vehicle", topic: "households", type: "share", num: [...v("B25044", 3), ...v("B25044", 10)], den: v("B25044", 1), format: "pct", map: true, group: H },
  { id: "no_internet", label: "Households with no internet access", topic: "social", type: "share", num: v("B28002", 13), den: v("B28002", 1), format: "pct", map: true, group: H },
  { id: "housing_units", label: "Housing units", topic: "housing", type: "count", num: v("B25002", 1), format: "int", map: true, group: H },
  { id: "single_family", label: "Single-family detached homes", topic: "housing", type: "share", num: v("B25024", 2), den: v("B25024", 1), format: "pct", map: true, group: H },
  { id: "multifamily", label: "Homes in buildings of 2+ units", topic: "housing", type: "share", num: range("B25024", 4, 9), den: v("B25024", 1), format: "pct", map: true, group: H },
  { id: "mobile_home", label: "Mobile homes", topic: "housing", type: "share", num: v("B25024", 10), den: v("B25024", 1), format: "pct", map: true, group: H },
  { id: "crowded", label: "Homes with more than 1 person per room", topic: "housing", type: "share", num: v("B25014", 5, 6, 7, 11, 12, 13), den: v("B25014", 1), format: "pct", map: true, group: H },
  { id: "vacant", label: "Vacant housing units", topic: "housing", type: "share", num: v("B25002", 3), den: v("B25002", 1), format: "pct", map: true, group: H },
  { id: "median_rent", label: "Median gross rent", topic: "housing", type: "median", num: v("B25064", 1), format: "money", map: true, group: H },
  { id: "median_value", label: "Median home value", topic: "housing", type: "median", num: v("B25077", 1), format: "money", map: true, group: H },
  { id: "rent_burden", label: "Renters paying 30%+ of income", topic: "housing", type: "share", num: range("B25070", 7, 10), den: v("B25070", 1), minus: v("B25070", 11), format: "pct", map: true, group: H },
  { id: "owner_burden", label: "Owners paying 30%+ of income", topic: "housing", type: "share", num: [...v("B25091", 8, 9, 10, 11), ...v("B25091", 19, 20, 21, 22)], den: v("B25091", 1), minus: v("B25091", 12, 23), format: "pct", map: true, group: H },
  { id: "median_income", label: "Median household income", topic: "income", type: "median", num: v("B19013", 1), format: "money", map: true, group: I },
  { id: "low_income", label: "Households under $25,000", topic: "income", type: "share", num: range("B19001", 2, 5), den: v("B19001", 1), format: "pct", map: true, group: I },
  { id: "high_income", label: "Households at $100,000 or more", topic: "income", type: "share", num: range("B19001", 14, 17), den: v("B19001", 1), format: "pct", map: true, group: I },
  { id: "snap", label: "Households on SNAP or public assistance", topic: "income", type: "share", num: v("B19058", 2), den: v("B19058", 1), format: "pct", map: true, group: I },
  { id: "poverty", label: "People below poverty", topic: "income", type: "share", num: v("B17001", 2), den: v("B17001", 1), format: "pct", map: true, group: I },
  { id: "bachelors", label: "Adults with a bachelor's degree or more", topic: "education", type: "share", num: range("B15003", 22, 25), den: v("B15003", 1), format: "pct", map: true, group: I },
  { id: "no_hs", label: "Adults without a high school diploma", topic: "education", type: "share", num: range("B15003", 2, 16), den: v("B15003", 1), format: "pct", map: true, group: I },
  { id: "grad", label: "Adults with a graduate degree", topic: "education", type: "share", num: v("B15003", 23, 24, 25), den: v("B15003", 1), format: "pct", map: true, group: I },
  { id: "college", label: "People in college or graduate school", topic: "education", type: "share", num: v("B14001", 8, 9), den: v("B14001", 1), format: "pct", map: true, group: I },
  { id: "enrolled", label: "People enrolled in school", topic: "education", type: "share", num: range("B14001", 3, 9), den: v("B14001", 1), format: "pct", map: true, group: I },
  { id: "unemployment", label: "Unemployment rate", topic: "employment", type: "share", num: v("B23025", 5), den: v("B23025", 3), format: "pct", map: true, group: I },
  { id: "labor_force", label: "In the labor force", topic: "employment", type: "share", num: v("B23025", 2), den: v("B23025", 1), format: "pct", map: true, group: I },
  { id: "mean_travel", label: "Average commute (minutes)", topic: "commute", type: "share", ratio: true, num: v("B08013", 1), den: v("B08301", 1), minus: v("B08301", 21), format: "one", map: true, group: C },
  { id: "drive_alone", label: "Workers who drive alone", topic: "commute", type: "share", num: v("B08301", 3), den: v("B08301", 1), format: "pct", map: true, group: C },
  { id: "transit", label: "Workers who take transit", topic: "commute", type: "share", num: v("B08301", 10), den: v("B08301", 1), format: "pct", map: true, group: C },
  { id: "wfh", label: "Workers who work from home", topic: "commute", type: "share", num: v("B08301", 21), den: v("B08301", 1), format: "pct", map: true, group: C },
  { id: "long_commute", label: "Workers commuting 45+ minutes", topic: "commute", type: "share", num: v("B08303", 11, 12, 13), den: v("B08303", 1), format: "pct", map: true, group: C },
  { id: "walk_bike", label: "Workers who walk or bike", topic: "commute", type: "share", num: v("B08301", 18, 19), den: v("B08301", 1), format: "pct", map: true, group: C },
];

export const BY_ID: Record<string, Indicator> = Object.fromEntries(INDICATORS.map((i) => [i.id, i]));

// Every ACS variable an indicator reads, as a flat list.
export const variablesOf = (ind: Indicator): string[] => [...ind.num, ...(ind.den ?? []), ...(ind.minus ?? [])];

export type GeoType = "county" | "place" | "state";

// The geography types a reader can pick, in menu order.
export const GEO_TYPES: { id: GeoType; label: string; plural: string }[] = [
  { id: "county", label: "County", plural: "counties" },
  { id: "place", label: "City or town", plural: "places" },
  { id: "state", label: "State", plural: "states" },
];
export const TYPE_LABEL: Record<string, string> = Object.fromEntries(GEO_TYPES.map((t) => [t.id, t.label]));
