<script lang="ts">
  // The methods page: how a value was made, the sources, and what to keep in mind. The long form (for the repository) is
  // METHODOLOGY.md.
  import { site } from "../lib/site";
  import Chip from "./Chip.svelte";

  const repo = "https://github.com/ar-puuk/Demographic-Profiles";
  const sources = [
    { topic: "People, households, housing, income, education, commuting", source: "American Community Survey 5-year estimates", years: "2005–2009 to 2020–2024", finest: "Tract" },
    { topic: "Annual population", source: "Population Estimates Program", years: "2010–2024", finest: "County, city" },
    { topic: "Jobs, workers, commute flows", source: "LEHD LODES8", years: "2002–2023", finest: "Block" },
    { topic: "Employment and wages by industry", source: "Quarterly Census of Employment and Wages (BLS)", years: "2014–2025", finest: "County" },
    { topic: "Boundaries", source: "Census TIGER/Line cartographic boundaries", years: "Current", finest: "" },
  ];
  const notes = [
    { h: "Margins of error", p: "ACS values are sample estimates. The margin of error is shown at the 90% confidence level, and shaded bands on trend charts show it. Small areas have wide margins." },
    { h: "Overlapping periods", p: "A 5-year estimate pools five years, so adjacent periods share four. To look for change, compare periods that do not overlap, such as 2014–2018 with 2019–2023." },
    { h: "Medians", p: "A median cannot be added across areas, so it is shown only where the Census publishes it for that area." },
    { h: "Time", p: "History uses the boundary the Census published for each period. City trends follow each year's published boundary, so annexations show as growth." },
    { h: "Dollars", p: "Income, rent and home value are in the dollars of each period, not adjusted for inflation." },
    { h: "Jobs", p: `LODES counts jobs by workplace and workers by residence, with noise added to small blocks, so jobs in very small areas are rough. Commute flows include workers who live outside ${site.state.name} but not residents who work outside it. The commute flow map draws lines only between areas of the same kind as the one chosen (cities to cities, counties to counties), from a point inside each area; flows to the rest of the state or to other states are listed beside the map, not drawn. QCEW covers counties only and will not match LODES exactly.` },
    { h: "Population estimates", p: "The 2010s estimates start from the 2010 Census and the 2020s from the 2020 Census, so the series steps at 2020." },
    { h: "Missing values", p: "Where the Census withholds a value it is left empty, not shown as zero." },
  ];
</script>

<div class="page" id="methods">
  <article class="m">
    <header>
      <h2>Documentation</h2>
      <p>Where the numbers come from, and how much weight each figure can bear.</p>
    </header>

    <section aria-labelledby="m-made">
      <h3 id="m-made">How each number was made</h3>
      <p class="sub">Every value carries one of two labels. Hover a label anywhere in the dashboard for the same explanation.</p>
      <div class="three">
        <div class="card"><Chip method="direct" /><b>Straight from the Census</b><span>Exactly this area: a county, city, tract or the state.</span></div>
        <div class="card"><Chip method="aggregated" /><b>Exact sum</b><span>Whole Census blocks that lie inside the area, added together. Used for jobs and commute flows.</span></div>
      </div>
    </section>

    <section aria-labelledby="m-src">
      <h3 id="m-src">Sources</h3>
      <div class="src">
        {#each sources as s}
          <div class="s"><b>{s.source}</b><span>{s.topic}</span><span class="meta">{s.years}{s.finest ? `. Finest: ${s.finest}` : ""}</span></div>
        {/each}
      </div>
    </section>

    <section aria-labelledby="m-map">
      <h3 id="m-map">Reading the map</h3>
      <div class="notes">
        <details open><summary>Choosing what it shows</summary><p>Pick a variable under "Colour by". Add a second one under "and" to make a bivariate map: each area falls in one of nine groups, three by three, and the legend outlines where the selected area sits.</p></details>
        <details open><summary>Groups and layers</summary><p>Areas are shaded in five equal-sized groups. The map shows the year chosen at the top. Switch to tracts to see the same year at finer detail. Census redrew tracts in 2020, so for earlier years a tract that has since been split or merged has no value.</p></details>
        <details open><summary>Choosing an area</summary><p>Click an area to open its profile. Shift-click to compare it with the one you have open. The expand button at the top right of the panel makes the map full screen.</p></details>
      </div>
    </section>

    <section aria-labelledby="m-read">
      <h3 id="m-read">Reading the numbers</h3>
      <div class="notes">
        {#each notes as n}
          <details><summary>{n.h}</summary><p>{n.p}</p></details>
        {/each}
      </div>
    </section>

    <section class="foot" aria-labelledby="m-use">
      <h3 id="m-use">Reuse and cite</h3>
      <p>All data is in the <a href="{repo}/tree/main/data" target="_blank" rel="noopener">project repository</a> as Parquet, every chart has a table view, and the Indicators tab has a CSV download. The pipeline rebuilds every file from the original sources: <code>uv sync</code>, add a Census API key to <code>.env</code>, then <code>uv run python -m pipeline all</code>. Add a vintage or state in <code>config/config.yml</code>; see <a href="{repo}/blob/main/docs/EXTENDING.md" target="_blank" rel="noopener">extending</a>.</p>
      <p>Derived from the Community Profiles of the Wasatch Front Regional Council (CC BY 4.0); data from other sources keeps its own terms. Suggested citation: {site.title}, using data from the U.S. Census Bureau and the U.S. Bureau of Labor Statistics.</p>
    </section>
  </article>
</div>

<style>
  .m { max-width: 1040px; margin: 0 auto; padding: 28px 20px 64px; display: grid; gap: 30px; }
  header h2 { font-size: 1.7rem; margin: 0 0 6px; }
  header p, .sub { color: var(--muted); margin: 0; max-width: 70ch; }
  h3 { font-size: 1.1rem; margin: 0 0 4px; }
  .sub { margin-bottom: 14px; }
  .three { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .card, .s { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card, 14px); padding: 14px; display: grid; gap: 6px; align-content: start; font-size: 0.875rem; }
  .card :global(.chip) { justify-self: start; }
  .card span, .s span { color: var(--muted); line-height: 1.45; }
  .src { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .s b { font-size: 0.9rem; }
  .s .meta { font-size: 0.8rem; }
  .notes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; align-items: start; }
  details { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 0 14px; font-size: 0.875rem; }
  summary { cursor: pointer; padding: 10px 0; font-weight: 600; }
  details p { margin: 0 0 12px; color: var(--muted); line-height: 1.5; }
  .foot p { color: var(--muted); font-size: 0.875rem; max-width: 80ch; line-height: 1.55; }
  .foot a { color: var(--sel-text); }
  @media (max-width: 900px) { .three, .src, .notes { grid-template-columns: minmax(0, 1fr); } }
</style>
