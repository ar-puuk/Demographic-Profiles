<script lang="ts">
  // "Report" in the navbar: a small panel to pick portrait or landscape, then builds and downloads the PDF profile of the chosen
  // area (and the compared one). The PDF code, its fonts and the layout are fetched on the first click, so none of it loads with the app.
  import { app } from "../lib/app.svelte";
  import { formatHash } from "../lib/hash";
  import { site } from "../lib/site";
  import Icon from "./Icon.svelte";

  const KEY = "utah-profiles-report-orientation", FORMAT_KEY = "utah-profiles-report-format";
  type Orientation = "portrait" | "landscape";
  type Format = "document" | "poster";
  const saved = (): Orientation => {
    try { return localStorage.getItem(KEY) === "landscape" ? "landscape" : "portrait"; } catch { return "portrait"; }
  };

  const savedFormat = (): Format => {
    try { return localStorage.getItem(FORMAT_KEY) === "poster" ? "poster" : "document"; } catch { return "document"; }
  };

  let open = $state(false);
  let format = $state<Format>(savedFormat());
  let orientation = $state<Orientation>(saved());
  let busy = $state(false);
  let failed = $state("");
  let progress = $state({ done: 0, total: 1, label: "" });
  let abort: AbortController | undefined;
  let root: HTMLDivElement | undefined = $state();
  const disabled = $derived(!app.ready || !app.selected || app.page === "methods");

  function pick(o: Orientation) {
    orientation = o;
    try { localStorage.setItem(KEY, o); } catch { /* ignore */ }
  }

  function chooseFormat(f: Format) {
    format = f;
    try { localStorage.setItem(FORMAT_KEY, f); } catch { /* ignore */ }
  }

  async function build() {
    if (busy || !app.selected || !app.db) return;
    busy = true;
    failed = "";
    progress = { done: 0, total: 1, label: "Starting" };
    abort = new AbortController();
    try {
      const { generateReport } = await import("../report/generate");
      const link = `${location.origin}${location.pathname}${formatHash({ type: app.type, id: app.id, cmp: app.cmp, v: app.v })}`;
      const { blob, filename } = await generateReport({
        db: app.db, sel: app.selected, cmp: app.compare, refs: app.refs, v: app.v, years: app.years, latestVintage: app.latestVintage,
        lodes: Math.min(app.v, app.lodesLatest), qcew: Math.min(app.v, app.qcewLatest), acs: app.acs, names: app.names,
        state: site.state, outsideId: site.outside_id, url: link, signal: abort.signal,
      }, { orientation, format, progress: (done, total, label) => (progress = { done, total, label }) });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      open = false;
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        console.error("PDF report failed", e);
        failed = e instanceof Error ? e.message : String(e);
      }
    } finally {
      busy = false;
      abort = undefined;
    }
  }

  $effect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!busy && root && !root.contains(e.target as Node)) open = false; };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  });
</script>

<div class="report" bind:this={root}>
  <button class="btn-ghost" data-tour="report" aria-haspopup="dialog" aria-expanded={open} {disabled} onclick={() => (open = !open)} title="Download a PDF profile of this area">
    <Icon name="download" size={15} /><span>PDF report</span>
  </button>
  {#if open}
    <div class="pop" role="dialog" tabindex="-1" aria-label="Download a PDF report" onkeydown={(e) => { if (e.key === "Escape" && !busy) open = false; }}>
      <p class="head">PDF report</p>
      <p class="what">{format === "poster"
        ? `One page for the wall: the key figures, the main charts, two tract maps and the commute flow map of ${app.selected?.label}${app.compare ? ` and ${app.compare.label}` : ""}, with a QR code to the live profile.`
        : `A designed profile of ${app.selected?.label}${app.compare ? ` compared with ${app.compare.label}` : ""} for ${app.acs.split(" ")[0]}: charts, tract maps, commute flows and the full indicator table.`}</p>
      <div class="seg fmt" role="group" aria-label="Format">
        <button type="button" aria-pressed={format === "document"} disabled={busy} onclick={() => chooseFormat("document")}>Document</button>
        <button type="button" aria-pressed={format === "poster"} disabled={busy} onclick={() => chooseFormat("poster")}>Poster</button>
      </div>
      <div class="seg" role="group" aria-label="Page orientation">
        <button type="button" aria-pressed={orientation === "portrait"} disabled={busy} onclick={() => pick("portrait")}><i class="pg portrait"></i>Portrait</button>
        <button type="button" aria-pressed={orientation === "landscape"} disabled={busy} onclick={() => pick("landscape")}><i class="pg landscape"></i>Landscape</button>
      </div>
      <p class="size">{format === "poster" ? "Poster, 24 × 36 in, one page." : "Document, US Letter 8.5 × 11 in."}</p>
      {#if busy}
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="Building the report"><i style="width:{(100 * progress.done) / progress.total}%"></i></div>
        <p class="status" aria-live="polite">{progress.label}…</p>
        <button class="go ghost" type="button" onclick={() => abort?.abort()}>Cancel</button>
      {:else}
        {#if failed}<p class="err" role="alert">The report could not be built: {failed}</p>{/if}
        <button class="go" type="button" onclick={build}>{failed ? "Try again" : "Download PDF"}</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .report { position: relative; }
  .pop { position: absolute; right: 0; top: calc(100% + 8px); z-index: 60; width: 300px; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  p { margin: 0; font-size: 0.78rem; color: var(--muted); line-height: 1.45; }
  .head { font: 700 0.95rem var(--f-display); color: var(--text); }
  .size { font-size: 0.72rem; }
  .seg { display: flex; gap: 8px; }
  .seg button { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 6px 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--muted); font-size: 0.8rem; cursor: pointer; }
  .seg.fmt button { flex-direction: row; justify-content: center; padding: 7px 6px; }
  .seg button[aria-pressed="true"] { border-color: var(--accent); color: var(--text); font-weight: 600; box-shadow: inset 0 0 0 1px var(--accent); }
  .pg { display: block; border: 1.5px solid currentColor; border-radius: 2px; background: var(--surface-2); }
  .pg.portrait { width: 22px; height: 28px; }
  .pg.landscape { width: 28px; height: 22px; }
  .go { border: 0; background: var(--accent); color: var(--accent-text); font-weight: 600; font-size: 0.82rem; padding: 9px 12px; border-radius: 8px; cursor: pointer; }
  .go.ghost { background: transparent; color: var(--text); border: 1px solid var(--border); }
  .bar { height: 6px; border-radius: 99px; background: var(--raised); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); transition: width 0.2s; }
  .status { font-size: 0.74rem; }
  .err { color: var(--cmp-text); }
</style>
