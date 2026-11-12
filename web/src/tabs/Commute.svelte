<script lang="ts">
  import { site } from "../lib/site";
  import ChartCard from "../components/ChartCard.svelte";
  import FlowMap from "../components/FlowMap.svelte";
  import ModeToggle from "../components/ModeToggle.svelte";
  import ShareCard from "../components/ShareCard.svelte";
  import SubTabs from "../components/SubTabs.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { app } from "../lib/app.svelte";
  import { CATEGORY_COLORS, diverging, mixChart, type DivRow, type MixRow } from "../lib/charts";
  import { odFlowsBy } from "../lib/data";
  import { COMMUTE_MIX, commuteSides } from "../lib/flows";
  import { fmtCompact, fmtInt, fmtPct } from "../lib/format";
  import { SPECS } from "../lib/specs";

  const SUBS = [{ id: "travel", label: "How people travel" }, { id: "flows", label: "Where they go" }];
  let sub = $state("travel");

  const OD_TYPES = ["county", "place"];
  const lodes = $derived(Math.min(app.v, app.lodesLatest));
  const NO_OD = "Commute flows are published for counties and cities.";

  // The same chart by where workers live (the usual ACS tables) and by where they work (the workplace tables, published for the state, counties and cities).
  const MODE = [{ id: "home", label: "Where they live", spec: SPECS.commuteMode }, { id: "work", label: "Where they work", spec: SPECS.commuteModeWork }];
  const TIME = [{ id: "home", label: "Where they live", spec: SPECS.travelTime }, { id: "work", label: "Where they work", spec: SPECS.travelTimeWork }];
  const BASIS_NOTE = "Where they work is published for the state, counties and cities, not for tracts.";

  const label = (id: string, sel: string) => (id === sel ? "Same area" : id === site.outside_id ? `Elsewhere in ${site.state.name}` : id === "out-of-state" ? `Outside ${site.state.name}` : app.names.get(id) ?? id);

  // The rows of the selected area's flows with their LEHD breakdowns, shared by the two charts.
  async function flowRows() {
    const sel = app.selected!;
    const raw = await odFlowsBy(app.db!, sel.type, sel.id, lodes);
    return raw.map((r) => ({ ...r, jobs: r.S000 })) as any[];
  }

  async function loadByArea(): Promise<DivRow[]> {
    const sel = app.selected!;
    if (!OD_TYPES.includes(sel.type)) return [];
    const { byArea } = commuteSides(await flowRows(), sel.id, []);
    return [...byArea].sort((a, b) => b[1].out + b[1].inn - (a[1].out + a[1].inn)).slice(0, 8).map(([id, v]) => ({ label: label(id, sel.id), left: v.out, right: v.inn }));
  }

  // The three groups of an area's workers, in the order they read across the chart.
  const GROUPS = ["Commute out", "Live and work here", "Commute in"];
  let facet = $state<string>("earnings");
  async function loadMix(): Promise<MixRow[]> {
    const sel = app.selected!, which = COMMUTE_MIX.find((m) => m.id === facet)!;
    if (!OD_TYPES.includes(sel.type)) return [];
    const keys = which.groups.map(([k]) => k);
    const sides = commuteSides(await flowRows(), sel.id, keys);
    const out: MixRow[] = [];
    for (const [name, side] of [[GROUPS[0], sides.out], [GROUPS[1], sides.here], [GROUPS[2], sides.inn]] as [string, Record<string, number>][]) {
      const total = keys.reduce((t, k) => t + (side[k] ?? 0), 0);
      if (total) for (const [k, label] of which.groups) out.push({ label, series: name, value: (side[k] ?? 0) / total, count: side[k] ?? 0 });
    }
    return out;
  }
  const mixTable = (rows: MixRow[]) => {
    const labels = [...new Set(rows.map((r) => r.label))];
    const cell = (l: string, g: string) => { const r = rows.find((x) => x.label === l && x.series === g); return r ? `${fmtPct(r.value, 1)} (${fmtInt(r.count)})` : ""; };
    return { columns: [{ key: "label", label: "Class" }, ...GROUPS.map((g) => ({ key: g, label: g, align: "right" as const }))], rows: labels.map((l) => ({ label: l, ...Object.fromEntries(GROUPS.map((g) => [g, cell(l, g)])) })) };
  };

  const divTable = (rows: DivRow[]) => ({ columns: [{ key: "label", label: "Group" }, { key: "left", label: "Commute out", align: "right" as const }, { key: "right", label: "Commute in", align: "right" as const }], rows: rows.map((r) => ({ label: r.label, left: fmtInt(r.left), right: fmtInt(r.right) })) });
</script>

<div class="tab">
  {#if sub === "travel"}
    <Tiles ids={["drive_alone", "transit", "wfh", "walk_bike", "long_commute", "mean_travel"]} />
  {:else}
    <Tiles ids={["mean_travel", "long_commute"]} jobs />
  {/if}
  <SubTabs items={SUBS} bind:active={sub} />
  {#if sub === "travel"}
    <div class="g c3r2">
      <ShareCard title="How workers get to work" spec={SPECS.commuteMode} basis={MODE} note={BASIS_NOTE} />
      <ShareCard title="Travel time to work" spec={SPECS.travelTime} basis={TIME} note={BASIS_NOTE} />
      <TrendCard title="Average commute (minutes)" id="mean_travel" />
      <TrendCard title="Workers who work from home" id="wfh" />
      <TrendCard title="Workers who take transit" id="transit" />
      <TrendCard title="Workers commuting 45 minutes or more" id="long_commute" />
    </div>
  {:else}
    <div class="g" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
      <FlowMap style="grid-row:1 / span 2" />
      <ChartCard
        title="Commute balance, {lodes}"
        note="Jobs: residents who work in each area (left) and workers who live there and work here (right), top 8. Areas are of the same kind as the one chosen. Source: LEHD LODES8, {lodes}."
        load={loadByArea}
        isEmpty={(d) => !d.length}
        emptyText={NO_OD}
        draw={(d, width, height, pal) => diverging({ rows: d, pal, format: fmtCompact, width, height, leftLabel: "Commute out (residents)", rightLabel: "Commute in (workers)" })}
        table={divTable}
      />
      <ChartCard
        title="Commute mix, {lodes}"
        note="Each bar is the share of that group's jobs: residents who work elsewhere (commute out), people who live and work here, and workers who live elsewhere (commute in). Source: LEHD LODES8, {lodes}."
        load={loadMix}
        isEmpty={(d) => !d.length}
        emptyText={NO_OD}
        draw={(d, width, height, pal) => mixChart({ rows: d, series: GROUPS, colors: [CATEGORY_COLORS[4], pal.ink2, pal.c3], pal, format: (v) => fmtPct(v, 0), width, height })}
        table={mixTable}
      >
        {#snippet headerExtra()}<ModeToggle label="Breakdown" bind:value={facet} options={COMMUTE_MIX.map((m) => ({ id: m.id, label: m.label }))} />{/snippet}
      </ChartCard>
    </div>
  {/if}
</div>
