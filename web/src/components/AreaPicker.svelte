<script lang="ts">
  // The area picker: opened from the search field to choose an area, or from the compare pill to choose a second one. Filter
  // by kind, type to search, or browse. When comparing, areas of the same kind come first, then the larger areas around it.
  import { tick } from "svelte";
  import { app, displayName } from "../lib/app.svelte";
  import type { Geography } from "../lib/data";
  import { site } from "../lib/site";
  import Icon from "./Icon.svelte";

  const KIND_LABEL: Record<string, string> = { county: "County", place: "City or town", state: "State" };
  const PLURAL: Record<string, string> = { county: "Counties", place: "Cities/Towns" };
  const AREA_KINDS = [["all", "All"], ["county", "Counties"], ["place", "Cities/Towns"]] as const;
  const COMPARE_KINDS = [["suggested", "Suggested"], ["county", "Counties"], ["place", "Cities/Towns"]] as const;
  const ORDER = ["state", "county", "place"];

  const mode = $derived(app.picker);
  let query = $state("");
  let kind = $state("all");
  let active = $state(0);
  let input: HTMLInputElement | undefined = $state();
  // The popup sits directly under the search field, with the same left edge and the same width.
  let anchor = $state({ left: 156, top: 62, width: 580 });
  function measure() {
    const r = document.getElementById("area-field")?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, r.left), width = Math.min(r.width, window.innerWidth - left - 8);
    anchor = { left, top: r.bottom + 6, width };
  }

  type Row = { kind: "group"; label: string } | { kind: "area"; geo: Geography };
  const label = (g: Geography) => displayName(g) + (g.kind && g.kind !== "city" && g.geo_type === "place" ? ` (${g.kind})` : "");
  const byName = (a: Geography, b: Geography) => ORDER.indexOf(a.geo_type) - ORDER.indexOf(b.geo_type) || a.geo_name.localeCompare(b.geo_name);

  $effect(() => {
    if (!mode) return;
    query = "";
    measure();
    kind = mode === "compare" ? "suggested" : "all";
    active = 0;
    tick().then(() => input?.focus());
  });

  const rows = $derived.by((): Row[] => {
    const q = query.trim().toLowerCase();
    const everything = app.geos.filter((g) => g.geo_id !== (mode === "compare" ? app.id : ""));
    if (q) {
      const starts: Geography[] = [], inside: Geography[] = [];
      for (const g of everything) {
        if (kind !== "all" && kind !== "suggested" && g.geo_type !== kind) continue;
        const n = label(g).toLowerCase();
        if (n.startsWith(q)) starts.push(g); else if (n.includes(q)) inside.push(g);
      }
      return [...starts.sort(byName), ...inside.sort(byName)].slice(0, 200).map((geo) => ({ kind: "area", geo }));
    }
    if (mode === "compare" && kind === "suggested") {
      const sel = app.selectedGeo;
      const peers = everything.filter((g) => sel && g.geo_type === sel.geo_type).sort(byName);
      const larger = site.benchmarks.map((id) => app.byId.get(id)).filter((g): g is Geography => !!g && g.geo_id !== app.id && g.geo_type !== sel?.geo_type);
      const out: Row[] = [];
      if (peers.length) out.push({ kind: "group", label: `${PLURAL[sel!.geo_type] ?? "Areas of the same kind"} like ${app.selected?.label}` }, ...peers.map((geo) => ({ kind: "area" as const, geo })));
      if (larger.length) out.push({ kind: "group", label: "Larger areas" }, ...larger.map((geo) => ({ kind: "area" as const, geo })));
      return out;
    }
    const pool = kind === "all" || kind === "suggested" ? everything : everything.filter((g) => g.geo_type === kind);
    return pool.sort(byName).map((geo) => ({ kind: "area", geo }));
  });
  const areaRows = $derived(rows.filter((r): r is Extract<Row, { kind: "area" }> => r.kind === "area"));

  function choose(g: Geography, asCompare = false) {
    if (mode === "compare" || asCompare) app.setCompare(g.geo_id); else app.select(g.geo_id);
    app.picker = null;
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") { app.picker = null; return; }
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(areaRows.length - 1, active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); }
    else if (e.key === "Enter" && areaRows[active]) { e.preventDefault(); choose(areaRows[active].geo, e.shiftKey); }
    else return;
    tick().then(() => document.getElementById(`opt-${areaRows[active]?.geo.geo_id}`)?.scrollIntoView({ block: "nearest" }));
  }
  $effect(() => { query; kind; active = 0; });
  const kinds = $derived(mode === "compare" ? COMPARE_KINDS : AREA_KINDS);
  const note = $derived(mode === "compare" ? "Same kind first, then the larger areas around it" : `${app.geos.length} areas: the state, counties, cities and towns`);
</script>

<svelte:window onresize={measure} />

{#if mode}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={() => (app.picker = null)}></div>
  <div class="popover" style="left:{anchor.left}px;top:{anchor.top}px;width:{anchor.width}px;height:min(540px, calc(100vh - {anchor.top + 16}px))" role="dialog" aria-label={mode === "compare" ? "Choose an area to compare with" : "Choose an area"}>
    <div class="head">
      <div class="q">
        <Icon name="search" size={15} />
        <input
          bind:this={input} bind:value={query} {onkeydown} type="search" autocomplete="off"
          placeholder={mode === "compare" ? `Compare ${app.selected?.label} with…` : "Type a city or county"}
          role="combobox" aria-expanded="true" aria-controls="picker-list" aria-autocomplete="list"
          aria-activedescendant={areaRows[active] ? `opt-${areaRows[active].geo.geo_id}` : undefined}
          aria-label={mode === "compare" ? "Search for an area to compare with" : "Search for an area"}
        />
      </div>
      <div class="kinds" role="group" aria-label="Kind of area">
        {#each kinds as [id, text]}<button aria-pressed={kind === id} onclick={() => (kind = id)}>{text}</button>{/each}
      </div>
      <div class="note"><span>{note}</span><span>{mode === "area" ? "Compare puts it beside the area you have open" : "Pick one area"}</span></div>
    </div>
    <ul class="results" id="picker-list" role="listbox" aria-label="Areas">
      {#each rows as r}
        {#if r.kind === "group"}
          <li class="group" role="presentation">{r.label}</li>
        {:else}
          {@const i = areaRows.indexOf(r)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <li id="opt-{r.geo.geo_id}" role="option" aria-selected={i === active} onclick={() => choose(r.geo)} onmousemove={() => (active = i)}>
            <span class="name">{label(r.geo)}{#if r.geo.geo_id === app.id} <span class="kind">(open)</span>{/if}</span>
            <span class="kind">{KIND_LABEL[r.geo.geo_type]}</span>
            {#if mode === "area"}<button class="act" onclick={(e) => { e.stopPropagation(); choose(r.geo, true); }} aria-label="Compare with {label(r.geo)}">Compare</button>{/if}
          </li>
        {/if}
      {:else}
        <li class="none" role="presentation">No area matches “{query}”.</li>
      {/each}
    </ul>
    <div class="foot2"><span>Up and Down to move, Enter to choose{mode === "area" ? ", Shift+Enter to compare" : ""}. You can also click an area on the overview map.</span><button class="mini-btn" onclick={() => (app.picker = null)}>Close</button></div>
  </div>
{/if}
