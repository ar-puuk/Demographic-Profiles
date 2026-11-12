<script lang="ts">
  // The commute flow map panel: how many residents live and work in the selected area, how many commute in and how many out,
  // and a map of the lines between it and the areas its workers live in and work in (LEHD origin-destination, same type of area).
  import { untrack } from "svelte";
  import { app } from "../lib/app.svelte";
  import { FLOW_RAMPS } from "../lib/classes";
  import { centroids, geojson, odFlows, restShape } from "../lib/data";
  import { buildFlows, ROUTE_LIMITS, summarizeFlows, type Direction, type OdRow } from "../lib/flows";
  import { FlowMapController, type FlowTip } from "../lib/flowmap";
  import { flowViewFrame } from "../report/geo";
  import type { TipData } from "../lib/charts";
  import { fmtCompact, fmtInt, fmtPct } from "../lib/format";
  import { site } from "../lib/site";
  import { theme } from "../lib/theme.svelte";
  import Chip from "./Chip.svelte";
  import DataTable from "./DataTable.svelte";
  import Dropdown from "./Dropdown.svelte";

  let { style = "" }: { style?: string } = $props();

  const OD_TYPES = ["county", "place"];
  const NO_OD = "Commute flows are published for counties and cities.";
  const DIRECTIONS: { id: Direction; label: string; note: string }[] = [
    { id: "both", label: "Both", note: "Where residents work and where workers live" },
    { id: "work", label: "Where residents work", note: "Lines to the areas where the selected area's residents work" },
    { id: "live", label: "Where workers live", note: "Lines from the areas where the selected area's workers live" },
  ];

  let el: HTMLDivElement | undefined = $state();
  let controller = $state.raw<FlowMapController>();
  let direction = $state<Direction>("both");
  let limit = $state("100");
  let view = $state<"map" | "table">("map");
  // Moving dashes show which way the jobs go but make the routes harder to read, so they are off until asked for, and they start only when a reader turns them on, including readers whose device prefers less motion.
  let animate = $state(false);
  const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let failed = $state("");
  // The rows on screen. A new year or area replaces them only when the new ones arrive, so the map does not blank in between.
  let data = $state.raw<{ id: string; type: string; year: number; rows: OdRow[]; places: Map<string, { lon: number; lat: number }>; shapes: GeoJSON.FeatureCollection; rest: GeoJSON.FeatureCollection } | null>(null);

  const sel = $derived(app.selected);
  const supported = $derived(!!sel && OD_TYPES.includes(sel.type));
  const lodes = $derived(Math.min(app.v, app.lodesLatest));
  const mode = $derived(theme.resolved);

  // The map element is only on the page while there are flows to show, so the map is made (and removed) with it.
  $effect(() => {
    if (!el) return;
    const c = new FlowMapController(el, untrack(() => theme.resolved));
    controller = c;
    return () => { c.destroy(); controller = undefined; };
  });
  $effect(() => { controller?.setMode(mode); });

  let token = 0;
  $effect(() => {
    if (!app.ready || !sel || !OD_TYPES.includes(sel.type) || !lodes) return;
    const { id, type } = sel, year = lodes, db = app.db!, mine = ++token;
    (async () => {
      const [rows, places, shapes, rest] = await Promise.all([odFlows(db, type, id, year), centroids(db, type), geojson(type), restShape(type)]);
      if (mine === token) { data = { id, type, year, rows, places, shapes, rest }; failed = ""; }
    })().catch((e) => { if (mine === token) failed = String(e?.message ?? e); });
  });

  const name = (id: string) =>
    id === site.outside_id ? `Elsewhere in ${site.state.name}` : id === "out-of-state" ? `Outside ${site.state.name}` : app.names.get(id) ?? id;

  const summary = $derived(data ? summarizeFlows(data.rows, data.id) : null);
  const lines = $derived.by(() => {
    if (!data) return null;
    const known = new Set(data.places.keys());
    return buildFlows(data.rows, data.id, direction, +limit, known);
  });
  const places = $derived(data ? [...data.places].map(([id, p]) => ({ id, name: name(id), lon: p.lon, lat: p.lat })) : []);
  const drawn = $derived(lines ? lines.flows.filter((f) => f.origin !== f.dest) : []);
  // Routes the opening view leaves off, so the note under the map can say they are there.
  const beyond = $derived.by(() => {
    if (!data || !lines) return null;
    const f = flowViewFrame(lines.flows, places, data.id, data.shapes.features.find((q: any) => q.properties.id === data!.id) ?? null);
    return f && f.beyond.routes ? f.beyond : null;
  });
  const range = $derived(drawn.length ? [Math.min(...drawn.map((f) => f.count)), Math.max(...drawn.map((f) => f.count))] : null);
  const alone = $derived(!!data && data.places.size < 2);
  const ramp = $derived(`linear-gradient(to right, ${FLOW_RAMPS[mode].join(", ")})`);

  const pct = (x: number | null) => (x == null ? "" : fmtPct(x, 0));
  const jobs = (n: number) => `${fmtInt(n)} ${n === 1 ? "job" : "jobs"}`;

  // The area's own name is not repeated: it is the title of the panel and the outlined shape on the map.
  function tip(t: FlowTip): TipData | string {
    if (!data || !summary) return "";
    const me = data.id, here = name(me), rows = data.rows;
    const n = (o: string, d: string) => rows.find((r) => r.origin_id === o && r.dest_id === d)?.jobs ?? 0;
    const color = "var(--accent)";
    if (t.kind === "flow") {
      const out = t.origin === me, other = out ? t.dest : t.origin, back = n(t.dest, t.origin);
      const total = out ? summary.workers : summary.jobs;
      const both = { kind: "bars" as const, head: ["Both directions"] as [string], rows: [
        { label: out ? "Commute out" : "Commute in", value: t.count, text: fmtInt(t.count) },
        { label: out ? "Commute in" : "Commute out", value: back, text: fmtInt(back) },
      ] };
      return {
        hero: true,
        title: out ? `Residents who work in ${name(other)}` : `Workers who live in ${name(other)}`,
        rows: [{ value: fmtInt(t.count), color, sub: out ? "residents work there" : "workers live there" }],
        visuals: [{ kind: "stack", head: [out ? "Where residents work" : "Where workers live"], parts: [{ label: name(other), value: t.count }, { label: "Elsewhere", value: Math.max(0, total - t.count) }] }, both],
      };
    }
    if (t.id === me) return { title: here, rows: [{ value: fmtInt(summary.both), color, sub: "live and work here" }], visuals: [
      { kind: "stack", head: ["Where residents work"], parts: [{ label: "Here", value: summary.both }, { label: "Elsewhere", value: summary.outflow }] },
      { kind: "stack", head: ["Who holds the jobs here"], parts: [{ label: "Residents", value: summary.both }, { label: "Commute in", value: summary.inflow }] },
    ] };
    const inn = n(t.id, me), outn = n(me, t.id), net = inn - outn;
    return {
      title: t.name, hero: true,
      rows: [{ value: fmtInt(inn + outn), color, sub: "commuters in both directions" }],
      visuals: [{ kind: "bars", head: ["Each way"], rows: [{ label: "Commute in", value: inn, text: fmtInt(inn) }, { label: "Commute out", value: outn, text: fmtInt(outn) }],
        note: net === 0 ? "Equal in both directions" : `Net ${fmtInt(Math.abs(net))} ${net > 0 ? "into" : "out of"} ${here}` }],
    };
  }

  $effect(() => {
    const c = controller, d = data, l = lines, moving = animate;
    if (!c || !d || !l) return;
    const type = d.type, focus = { type: "FeatureCollection" as const, features: d.shapes.features.filter((f: any) => f.properties.id === d.id) };
    c.update({
      places, flows: l.flows, selId: d.id, shapes: d.shapes, focus, rest: d.rest, tip, animate: moving,
      fitKey: `${type}|${d.id}`, // not the direction or route count: changing those keeps the view the reader has framed
      onSelect: (id) => app.select(id),
    });
  });

  const rowsOut = $derived.by(() => {
    if (!data || !lines) return [];
    const all = [
      ...lines.flows.map((f) => ({ from: name(f.origin), to: name(f.dest), jobs: f.count })),
      ...lines.unmapped.flatMap((u) => [
        ...(direction !== "live" && u.work ? [{ from: name(data!.id), to: name(u.id), jobs: u.work }] : []),
        ...(direction !== "work" && u.live ? [{ from: name(u.id), to: name(data!.id), jobs: u.live }] : []),
      ]),
    ];
    return all.sort((a, b) => b.jobs - a.jobs);
  });
  const summaryLabel = $derived(
    summary && sel ? `Commute flows for ${sel.label}, ${lodes}: ${fmtInt(summary.both)} live and work here, ${fmtInt(summary.inflow)} commute in, ${fmtInt(summary.outflow)} commute out. Use the table view for every route.` : "Commute flow map",
  );
  const unmappedText = (u: { id: string; work: number; live: number }) =>
    direction === "work" ? `${fmtInt(u.work)} out` : direction === "live" ? `${fmtInt(u.live)} in` : `${fmtInt(u.work)} out, ${fmtInt(u.live)} in`;
  const net = $derived(summary ? summary.net : 0);
</script>

<section class="pn fm-flow" aria-label="Commute flow map" {style}>
  <div class="pn-head">
    <h3>Commute flow map{supported ? `, ${lodes}` : ""} {#if supported}<Chip method="aggregated" />{/if}</h3>
    {#if supported && data}
      <div class="pn-actions">
        <div class="fm-dir" role="group" aria-label="Direction of the lines">
          {#each DIRECTIONS as d}
            <button class="mini-btn" aria-pressed={direction === d.id} title={d.note} onclick={() => (direction = d.id)}>{d.label}</button>
          {/each}
        </div>
        <div class="fm-min"><Dropdown bind:value={limit} options={ROUTE_LIMITS} label="How many routes to draw" up={false} /></div>
        {#if view === "map"}
          <button class="mini-btn" aria-pressed={animate} title={calm ? "Your device is set to reduce motion, so this is off until you turn it on. It moves dashes along the routes to show direction" : "Show moving dashes along the routes, which makes the direction easier to see"} onclick={() => (animate = !animate)}>Animate</button>
        {/if}
        <button class="mini-btn" aria-pressed={view === "table"} onclick={() => (view = view === "table" ? "map" : "table")}>{view === "table" ? "Map" : "Table"}</button>
      </div>
    {/if}
  </div>

  {#if !supported}
    <div class="pn-body"><div class="empty">{NO_OD}</div></div>
  {:else if failed}
    <div class="pn-body"><div class="empty error" role="alert">Could not load the commute flows: {failed}</div></div>
  {:else}
    {#if summary}
      <div class="fm-figures" role="group" aria-label="Where residents work">
        <div class="fm-fig">
          <span class="fm-k">Live and work here</span>
          <span class="fm-n">{fmtInt(summary.both)}</span>
          <span class="fm-m">{pct(summary.liveShare)} of resident workers</span>
        </div>
        <div class="fm-fig">
          <span class="fm-k">Commute in</span>
          <span class="fm-n">{fmtInt(summary.inflow)}</span>
          <span class="fm-m">{pct(summary.inShare)} of jobs here{summary.outside ? `, ${fmtCompact(summary.outside)} from outside ${site.state.name}` : ""}</span>
        </div>
        <div class="fm-fig">
          <span class="fm-k">Commute out</span>
          <span class="fm-n">{fmtInt(summary.outflow)}</span>
          <span class="fm-m">{pct(summary.outShare)} of resident workers</span>
        </div>
        <div class="fm-fig">
          <span class="fm-k">Net commuters</span>
          <span class="fm-n">{net > 0 ? "+" : net < 0 ? "−" : ""}{fmtInt(Math.abs(net))}</span>
          <span class="fm-m">{net > 0 ? "more commute in than out" : net < 0 ? "more commute out than in" : "in and out are equal"}</span>
        </div>
      </div>
    {/if}

    <div class="pn-body">
      <div class="fm-mapwrap" hidden={view === "table"}>
        <div class="fm-canvas" bind:this={el} role="application" aria-label={summaryLabel}></div>
        {#if alone}
          <div class="fm-alone">This area has no other areas of its kind to draw lines to. Choose a county or city to see its routes.</div>
        {/if}
        {#if lines && !alone}
          <div class="fm-legend" aria-label="How to read the lines">
            <div class="fm-lt">Jobs on each route</div>
            <div class="fm-bar" style="background:{ramp}"></div>
            <div class="fm-ends"><span>{range ? fmtCompact(range[0]) : "0"}</span><span>{range ? fmtCompact(range[1]) : "0"}</span></div>
            {#if lines.unmapped.length}
              <div class="fm-off">
                <div class="fm-lt">Not drawn</div>
                {#each lines.unmapped as u}<div class="fm-row"><span>{name(u.id)}</span><b>{unmappedText(u)}</b></div>{/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
      {#if view === "table" && data}
        <p class="src">Largest first: {limit === "0" ? "every route" : `the ${limit} largest routes drawn on the map`}{lines?.unmapped.length ? ", plus the areas not drawn on it" : ""}.</p>
        <DataTable
          caption="Commute routes of {sel?.label}, {lodes}"
          columns={[{ key: "from", label: "Lives in" }, { key: "to", label: "Works in" }, { key: "jobs", label: "Jobs", align: "right" }]}
          rows={rowsOut.map((r) => ({ from: r.from, to: r.to, jobs: fmtInt(r.jobs) }))}
        />
      {/if}
    </div>
    <p class="src">
      Source: LEHD LODES8 {lodes}, jobs counted where the worker lives and where the job is. Jobs outside {site.state.name} are not in this data. Click an area to select it.{beyond ? ` The map opens on the main routes; ${fmtInt(beyond.routes)} smaller ones (${fmtCompact(beyond.jobs)} jobs) reach beyond it, so zoom out to see them.` : ""}{data?.rest.features.length ? ` The dashed outline is the rest of ${site.state.name}, outside every area of this kind; the point is where lines to it end.` : ""}{app.compare ? " The map follows the main area, not the compared one." : ""}
    </p>
  {/if}
</section>

<style>
  .fm-flow h3 { display: flex; align-items: center; gap: 8px; }
  .fm-dir { display: inline-flex; gap: 4px; flex-wrap: wrap; }
  .pn-actions { align-items: center; }
  .fm-min { min-width: 128px; }
  .fm-figures { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--border); border-radius: 10px; margin: 2px 0 8px; flex: none; }
  .fm-fig { display: flex; flex-direction: column; gap: 1px; padding: 8px 12px; min-width: 0; }
  .fm-fig + .fm-fig { border-left: 1px solid var(--border); }
  .fm-k { font-size: 0.72rem; color: var(--muted); }
  .fm-n { font-family: var(--f-display); font-size: 1.35rem; font-weight: 700; line-height: 1.15; color: var(--text); font-variant-numeric: tabular-nums; }
  .fm-m { font-size: 0.7rem; color: var(--muted); line-height: 1.3; }
  .fm-mapwrap { position: absolute; inset: 0; border-radius: 10px; overflow: hidden; background: var(--raised); }
  .fm-mapwrap[hidden] { display: none; }
  .fm-canvas { position: absolute; inset: 0; }
  .fm-alone { position: absolute; left: 50%; top: 50%; translate: -50% -50%; max-width: 300px; padding: 10px 14px; text-align: center; font-size: 0.8rem; color: var(--muted); background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); z-index: 3; }
  .fm-legend { position: absolute; left: 10px; bottom: 36px; width: min(230px, calc(100% - 20px)); max-height: calc(100% - 60px); overflow-y: auto; z-index: 3; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); padding: 9px 12px; font-size: 0.72rem; color: var(--muted); }
  .fm-lt { font-weight: 600; color: var(--text); font-size: 0.75rem; margin-bottom: 5px; }
  .fm-bar { height: 9px; border-radius: 3px; border: 1px solid var(--border); }
  .fm-ends { display: flex; justify-content: space-between; margin-top: 3px; font-size: 0.68rem; font-variant-numeric: tabular-nums; }
  .fm-off { margin-top: 9px; padding-top: 8px; border-top: 1px solid var(--border); display: grid; gap: 2px; }
  .fm-row { display: flex; justify-content: space-between; gap: 8px; min-width: 0; }
  .fm-row span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fm-row b { color: var(--text); font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
  @media (max-width: 1000px) {
    /* One column on a phone: the panel is as tall as its contents, so the map is given a height of its own. */
    .fm-flow :global(.pn-body) { min-height: 380px; flex: none; }
  }
  @media (max-width: 600px) {
    .fm-legend { width: 176px; padding: 7px 9px; bottom: 32px; }
  }
  @media (max-width: 900px) {
    .fm-figures { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .fm-fig:nth-child(3) { border-left: 0; }
    .fm-fig:nth-child(n + 3) { border-top: 1px solid var(--border); }
  }
</style>
