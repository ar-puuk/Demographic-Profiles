<script lang="ts">
  // The methods page: how a value was made, how a planning area is built from Census blocks, the sources, and what to keep in
  // mind. The long form (for the repository) is METHODOLOGY.md; this page shows the same method with diagrams.
  import { site } from "../lib/site";
  import Chip from "./Chip.svelte";

  const repo = "https://github.com/ar-puuk/Demographic-Profiles";
  const sources = [
    { topic: "People, households, housing, income, education, commuting", source: "American Community Survey 5-year estimates", years: "2005–2009 to 2020–2024", finest: "Block group (2009–2013 on)" },
    { topic: "Allocation weights", source: "Decennial Census counts, 2010 and 2020", years: "2010, 2020", finest: "Block" },
    { topic: "Annual population", source: "Population Estimates Program", years: "2010–2024", finest: "County, city" },
    { topic: "Jobs, workers, commute flows", source: "LEHD LODES8", years: "2002–2023", finest: "Block" },
    { topic: "Employment and wages by industry", source: "Quarterly Census of Employment and Wages (BLS)", years: "2014–2025", finest: "County" },
    { topic: "Boundaries", source: `${site.organization} planning areas, Census TIGER/Line`, years: "Current", finest: "" },
  ];
  const notes = [
    { h: "Margins of error", p: "ACS values are sample estimates. The margin of error is shown at the 90% confidence level, and shaded bands on trend charts show it. Small areas have wide margins." },
    { h: "Overlapping periods", p: "A 5-year estimate pools five years, so adjacent periods share four. To look for change, compare periods that do not overlap, such as 2014–2018 with 2019–2023." },
    { h: "Medians", p: "A median cannot be added across pieces. For planning areas it is interpolated from the allocated brackets, within about 3% of the published county median for counties of 50,000 people or more. Their margin of error is built from the bracket margins, not the Census method, and is conservative for age." },
    { h: "Time", p: "History uses today's boundary in every period. Block groups changed in 2020, so periods ending 2019 or earlier use 2010 block groups and later ones use 2020. City trends follow each year's published boundary, so annexations show as growth." },
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
      <p>Where the numbers come from, how {site.organization} planning areas are built from Census geography, and how much weight each figure can bear.</p>
    </header>

    <section aria-labelledby="m-made">
      <h3 id="m-made">How each number was made</h3>
      <p class="sub">Every value carries one of three labels. Hover a label anywhere in the dashboard for the same explanation.</p>
      <div class="three">
        <div class="card"><Chip method="direct" /><b>Straight from the Census</b><span>Exactly this area: a county, city or the state, or an area equal to a county.</span></div>
        <div class="card"><Chip method="aggregated" /><b>Exact sum</b><span>Whole block groups or blocks that lie inside the area, added together.</span></div>
        <div class="card"><Chip method="allocated" /><b>Estimate</b><span>Built from block groups only partly inside the area, or a median interpolated from brackets. More uncertain.</span></div>
      </div>
    </section>

    <section aria-labelledby="m-built">
      <h3 id="m-built">How a planning area is built</h3>
      <p class="sub">Regions, planning areas and workshop areas do not follow Census boundaries, so each is assembled from blocks in four steps.</p>
      <ol class="steps">
        <li>
          <svg viewBox="0 0 160 110" role="img" aria-label="Dots for blocks, some inside an area outline and some outside">
            <path class="area" d="M18 30 L90 12 L146 44 L128 96 L44 98 Z" />
            {#each [[40, 46], [62, 34], [92, 40], [118, 54], [70, 68], [100, 80], [52, 84], [128, 80]] as [x, y]}<circle class="in" cx={x} cy={y} r="4" />{/each}
            {#each [[12, 90], [150, 22], [150, 100], [24, 12], [100, 4]] as [x, y]}<circle class="out" cx={x} cy={y} r="4" />{/each}
          </svg>
          <b>Assign blocks</b>
          <span>A block belongs to an area if its internal point falls inside the boundary.</span>
        </li>
        <li>
          <svg viewBox="0 0 160 110" role="img" aria-label="A block group of four blocks with 300, 120, 40 and 540 people; the two blocks inside the area hold 42 percent">
            <rect class="bg" x="8" y="6" width="144" height="70" rx="4" />
            <rect class="blk on" x="8" y="6" width="58" height="42" rx="4" /><text x="37" y="31">300</text>
            <rect class="blk on" x="8" y="48" width="58" height="28" rx="4" /><text x="37" y="66">120</text>
            <rect class="blk" x="66" y="6" width="86" height="70" rx="4" /><text x="109" y="38">540</text>
            <rect class="blk" x="116" y="54" width="36" height="22" rx="4" /><text x="134" y="69">40</text>
            <rect class="bar" x="8" y="84" width="144" height="10" rx="5" /><rect class="bar on" x="8" y="84" width="60.5" height="10" rx="5" />
            <text class="cap" x="8" y="106">42% of people inside</text>
          </svg>
          <b>Split block groups</b>
          <span>The ACS counts block groups. A block group partly inside is split by the people in each block, from the Decennial Census, not by how many blocks. Every table uses these population weights.</span>
        </li>
        <li>
          <svg viewBox="0 0 160 110" role="img" aria-label="Pieces added together with margins of error combined by squares">
            <rect class="blk on" x="10" y="30" width="30" height="40" rx="4" /><rect class="blk on" x="46" y="30" width="30" height="40" rx="4" /><rect class="blk on" x="82" y="30" width="30" height="40" rx="4" />
            <text class="big" x="124" y="58">=</text><rect class="blk sum" x="136" y="22" width="20" height="56" rx="4" />
            <text class="cap" x="10" y="96">Margins add as √(Σ m²)</text>
          </svg>
          <b>Sum</b>
          <span>Values for the pieces are added. Margins of error add as squares, then take the square root, scaled by the share used.</span>
        </li>
        <li>
          <svg viewBox="0 0 160 110" role="img" aria-label="An exact sum or an estimate label">
            <foreignObject x="0" y="20" width="160" height="70"><div class="lbls"><Chip method="aggregated" /><span>every block group whole</span><Chip method="allocated" /><span>any block group split</span></div></foreignObject>
          </svg>
          <b>Label</b>
          <span>An exact sum if every block group sits wholly inside, otherwise an estimate. Poverty, disability and a few other tables are not published by block group, so they are split from tracts, the larger unit.</span>
        </li>
      </ol>
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
      <p>All data is in the <a href="{repo}/tree/main/data" target="_blank" rel="noopener">project repository</a> as Parquet, every chart has a table view, and the Indicators tab has a CSV download. The pipeline rebuilds every file from the original sources: <code>uv sync</code>, add a Census API key to <code>.env</code>, then <code>uv run python -m pipeline all</code>. Add a vintage, geography or state in <code>config/config.yml</code>; see <a href="{repo}/blob/main/docs/EXTENDING.md" target="_blank" rel="noopener">extending</a>.</p>
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
  .three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .card, .s, .steps li { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card, 14px); padding: 14px; display: grid; gap: 6px; align-content: start; font-size: 0.875rem; }
  .card :global(.chip) { justify-self: start; }
  .card span, .steps span, .s span { color: var(--muted); line-height: 1.45; }
  .steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .steps svg { width: 100%; height: auto; display: block; margin-bottom: 4px; }
  .area { fill: color-mix(in srgb, var(--sel) 14%, transparent); stroke: var(--sel); stroke-width: 2; }
  .in { fill: var(--sel); }
  .out { fill: var(--muted); opacity: 0.55; }
  .bg { fill: none; stroke: var(--border); }
  .blk { fill: var(--surface-2); stroke: var(--border); }
  .blk.on { fill: color-mix(in srgb, var(--sel) 30%, var(--surface)); stroke: var(--sel); }
  .blk.sum { fill: var(--sel); stroke: var(--sel); }
  .bar { fill: var(--surface-2); }
  .bar.on { fill: var(--sel); }
  svg text { font-size: 11px; fill: var(--text); text-anchor: middle; font-variant-numeric: tabular-nums; }
  svg text.cap { text-anchor: start; fill: var(--muted); font-size: 10.5px; }
  svg text.big { font-size: 20px; }
  .lbls { display: grid; grid-template-columns: auto 1fr; gap: 8px 8px; align-items: center; font-size: 11px; color: var(--muted); }
  .src { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .s b { font-size: 0.9rem; }
  .s .meta { font-size: 0.8rem; }
  .notes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; align-items: start; }
  details { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 0 14px; font-size: 0.875rem; }
  summary { cursor: pointer; padding: 10px 0; font-weight: 600; }
  details p { margin: 0 0 12px; color: var(--muted); line-height: 1.5; }
  .foot p { color: var(--muted); font-size: 0.875rem; max-width: 80ch; line-height: 1.55; }
  .foot a { color: var(--sel-text); }
  @media (max-width: 900px) { .three, .src, .notes { grid-template-columns: minmax(0, 1fr); } .steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { .steps { grid-template-columns: minmax(0, 1fr); } }
</style>
