// Number and label formatting shared by every chart, value box and table.

const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 3 });

type Num = number | null | undefined;
const missing = (v: Num): v is null | undefined => v == null || Number.isNaN(v);

// A value that rounds to zero prints as 0, never -0 (Math.round(-0.3) is -0; toFixed keeps the sign of -0.04).
const unsigned = (s: string) => (/^-0(\.0+)?$/.test(s) ? s.slice(1) : s);
export const fmtInt = (v: Num) => (missing(v) ? "–" : unsigned(int.format(Math.round(v))));
export const fmtOne = (v: Num) => (missing(v) ? "–" : unsigned(one.format(v)));
export const fmtCompact = (v: Num) => (missing(v) ? "–" : compact.format(v));
export const fmtPct = (v: Num, digits = 1) => (missing(v) ? "–" : `${unsigned((v * 100).toFixed(digits))}%`);
// A percent axis label: whole percents when the tick is one, a decimal otherwise, so a 2.5% tick never reads "3%" beside a 3% tick.
export const fmtPctTick = (v: Num) => (missing(v) ? "–" : fmtPct(v, Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 ? 0 : 1));
export const fmtMoney = (v: Num) => (missing(v) ? "–" : `$${unsigned(int.format(Math.round(v)))}`);

// A median the Census could only bound is published as an annotation ("250,000+" for the open top bracket, "10,000-" for the
// bottom one) beside a stand-in number (250,001, 9,999) that must not be read as the median. Our own interpolated medians use "+".
export function fmtFlagged(f: (v: Num) => string, v: Num, flag?: string | null) {
  if (missing(v)) return "–";
  if (flag === "+") return `${f(v)}+`;
  const m = flag?.match(/^([\d,]+)([+-])$/);
  if (!m) return f(v);
  return `${f(Number(m[1].replace(/,/g, "")))}${m[2] === "+" ? "+" : " or less"}`;
}

// The Census Bureau's guidance: an estimate whose margin of error is more than 30% of the estimate should be used with caution.
export const lowReliability = (v: Num, moe: Num) => !missing(v) && !missing(moe) && v !== 0 && Math.abs(moe / v) > 0.3;

// A Census tract as the Census Bureau names it: the six-digit code in the geo id is the number with two implied decimals
// (112801 is tract 1128.01; 113400 is tract 1134).
export const tractName = (geoId: string) => {
  const code = geoId.slice(5), whole = String(Number(code.slice(0, 4))), frac = code.slice(4);
  return `Census tract ${frac === "00" ? whole : `${whole}.${frac}`}`;
};

export type FormatId = "int" | "one" | "pct" | "money" | "compact";
export const FORMATS: Record<FormatId, (v: Num) => string> = { int: fmtInt, one: fmtOne, pct: fmtPct, money: fmtMoney, compact: fmtCompact };

export type Method = "direct" | "aggregated" | "allocated" | "derived";

// How a value was made, in words a reader needs. `rank` orders them so the weakest claim wins when
// several rows are combined: a published value beats an aggregate, an aggregate beats an estimate.
export const METHODS: Record<Method, { label: string; short: string; letter: string; rank: number; note: string }> = {
  direct: { label: "Census published", short: "Published", letter: "P", rank: 0, note: "Published by the Census Bureau for exactly this area." },
  aggregated: { label: "Census aggregate", short: "Aggregate", letter: "A", rank: 1, note: "An exact sum of whole Census blocks inside this area." },
  allocated: { label: "Estimate", short: "Estimate", letter: "E", rank: 2, note: "An estimate, less certain than a published value." },
  derived: { label: "Estimate", short: "Estimate", letter: "E", rank: 2, note: "A value derived from other published values; its margin of error is built from theirs." },
};
export const methodOf = (rank: number): Method => (["direct", "aggregated", "allocated"] as const)[Math.min(rank, 2)];

export const escapeHtml = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// A table of objects -> CSV text (for the download button). `headers` are the column titles when they differ from the keys. The
// text starts with a byte order mark so Excel reads it as UTF-8 (it would garble "±" and "–" otherwise).
export function toCsv(rows: Record<string, unknown>[], columns: string[], headers: string[] = columns): string {
  const cell = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [headers.map(cell).join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n");
}
