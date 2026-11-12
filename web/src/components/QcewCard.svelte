<script lang="ts">
  // Private-sector employment or average annual pay by industry sector (BLS QCEW), for the chosen year, or the eight largest
  // sectors over the years. BLS publishes it only for counties and the state.
  import { app } from "../lib/app.svelte";
  import { CATEGORY_COLORS, bars, lines, type BarRow, type LineSeries } from "../lib/charts";
  import { qcewCodes, qcewIndustries, qcewSeries } from "../lib/data";
  import { fmtCompact, fmtInt, fmtMoney } from "../lib/format";
  import { SECTOR_BY_NAICS } from "../lib/specs";
  import { trendTable } from "../lib/tables";
  import ChartCard from "./ChartCard.svelte";
  import ViewSwitch from "./ViewSwitch.svelte";

  let { variable, style = "" }: { variable: "employment" | "avg_annual_pay"; style?: string } = $props();
  let when = $state<"snapshot" | "trend">("snapshot");
  const year = $derived(Math.min(app.v, app.qcewLatest));
  const NO_QCEW = "BLS publishes this only for counties and the state, and from 2014.";
  const fmt = $derived(variable === "employment" ? fmtInt : fmtMoney);
  const tick = (x: number | null | undefined) => (variable === "employment" ? fmtCompact(x) : `$${fmtCompact(x)}`);
  const what = $derived(variable === "employment" ? "Employment" : "Average annual pay");

  type Data = { kind: "now"; rows: BarRow[] } | { kind: "time"; lines: LineSeries[] };
  async function load(): Promise<Data> {
    const sel = app.selected!, db = app.db!;
    const codes = await qcewCodes(db);
    const label = new Map(codes.filter((c) => c.kind === "industry").map((c) => [c.code, c.label]));
    const name = (code: string) => SECTOR_BY_NAICS[code] ?? label.get(code) ?? code;
    const skip = (code: string) => code === "10" || code === "99";
    if (when === "trend") {
      // A withheld year has no value, and an area sum missing a withheld county is only a lower bound: plotting either would draw a
      // fall that did not happen, so those years are left out of the line.
      const rows = (await qcewSeries(db, sel, variable)).filter((r) => !skip(r.industry) && r.value != null && !r.flag);
      const by = new Map<string, LineSeries>();
      for (const r of rows) (by.get(r.industry) ?? by.set(r.industry, { label: name(r.industry), color: "", points: [] }).get(r.industry)!).points.push({ x: r.year, y: r.value! });
      const top = [...by.values()].sort((a, b) => (b.points.at(-1)?.y ?? 0) - (a.points.at(-1)?.y ?? 0)).slice(0, 8);
      return { kind: "time", lines: top.map((s, i) => ({ ...s, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] })) };
    }
    const rows = await qcewIndustries(db, sel, year);
    // Employment of an area with a withheld county is a lower bound, so its sector is marked "at least". An average pay of such an
    // area is the mean of the counties that report, which is no bound at all, so it is left out.
    return { kind: "now", rows: rows.filter((r) => !skip(r.industry) && r[variable] != null && !(variable === "avg_annual_pay" && r.flag))
      .map((r): BarRow => ({ category: r.flag === "partial" ? `${name(r.industry)} *` : name(r.industry), series: what, value: r[variable] as number })).sort((a, b) => b.value - a.value) };
  }
</script>

<ChartCard
  title={when === "trend" ? `${what} by industry over time` : `${what} by industry, ${year}`}
  {style}
  note="Private-sector {variable === 'employment' ? 'average annual employment' : 'wages per job'}{when === 'trend' ? ', the eight largest sectors' : ''}. Sectors BLS withholds are left out{when === 'trend' ? ', as are years when an area sum is missing a withheld county' : '. * means at least this many: BLS withholds a county in that sector'}. Source: BLS QCEW."
  {load}
  isEmpty={(d) => (d.kind === "now" ? !d.rows.length : !d.lines.length)}
  emptyText={NO_QCEW}
  draw={(d, width, height, pal) => d.kind === "time"
    ? lines({ series: d.lines, pal, format: fmt, tickFormat: tick, width, height, highlight: year, tipX: String })
    : bars({ rows: d.rows, order: d.rows.map((r) => r.category), pal, format: fmt, tickFormat: tick, width, height })}
  table={(d) => (d.kind === "time" ? trendTable(d.lines, fmt, String) : ({ columns: [{ key: "category", label: "Industry" }, { key: "v", label: what, align: "right" }], rows: d.rows.map((r) => ({ category: r.category, v: fmt(r.value) })) }))}
>
  {#snippet headerExtra()}<ViewSwitch bind:value={when} />{/snippet}
</ChartCard>
