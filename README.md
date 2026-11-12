# Utah Community Profiles

Community profiles ("facts and figures") for Utah: a static, map-first dashboard for the state, its counties and its cities and
towns, and the data pipeline behind it. Census tracts are drawn on the maps.

This began as a fork of the Wasatch Front Regional Council's [APP-Community-Profiles](https://github.com/WFRCAnalytics/APP-Community-Profiles)
(CC BY 4.0), reworked to cover counties and cities across Utah under its own name and mark. The name is set in `config/config.yml`
(`app.title`) and the mark in `web/src/components/Logo.svelte`, `web/public/favicon.svg` and `web/scripts/make-logo.py`.

- ACS 5-year indicators with trends 2009–2024, annual population estimates (PEP), jobs, workers and commute flows (LODES) and
  employment and wages (QCEW).
- Every value carries a method label: `direct` (published by the Census Bureau for exactly this area) or `aggregated` (an exact
  sum of whole Census blocks, used for jobs and commute flows).
- There is no backend. DuckDB-WASM reads the committed Parquet files in the browser.

The methods are written up in [METHODOLOGY.md](METHODOLOGY.md), which is also the in-app Methods page.

## Layout

| Path | Purpose |
|---|---|
| `config/config.yml` | Sources, vintages and the app's name and defaults (nothing is hardcoded in code) |
| `pipeline/` | The Python pipeline package |
| `tests/` | Pipeline tests (`uv run pytest`) |
| `data/` | Processed outputs, **committed**: `acs/`, `pep/`, `lodes/`, `qcew/`, `web/` (simplified GeoJSON for the maps) and `meta/` (registry, variables, QA reports, `manifest.json`) |
| `raw/` | Local downloads, not tracked |
| `web/` | The app: Vite, Svelte 5 (runes), TypeScript, DuckDB-WASM, Observable Plot, MapLibre GL, d3-geo |
| `web/e2e/` | Playwright smoke tests, including axe checks in light and dark |
| `.github/workflows/` | CI and the GitHub Pages deploy |

## Run the app

```
cd web
npm ci
npm run dev          # http://localhost:5173, with the data served from ../data
npm run build        # type-checks, then builds web/dist (the data is copied into dist/data)
npm run preview      # serves the build at http://localhost:4173
npm test             # Vitest unit tests
npm run e2e          # Playwright smoke tests (Edge by default; PW_CHANNEL=chromium for Chromium)
```

All data URLs are relative to the page, so the build works from any base path or a plain static server. Set `BASE`
(for example `BASE=/Demographic-Profiles/ npm run build`) when the site is served from a sub-path; the deploy workflow does.
The map basemap is OpenFreeMap (Positron in light mode, Dark in dark mode); everything else is bundled.

### How the app is built

A floating icon rail switches between ten screens (Overview, Map, People, Households, Housing, Income and poverty, Education, Jobs and economy, Commute, Indicators), each sized to fit one screen. The navbar search picks the area (filter by counties or cities); the compare pill picks a second area, suggesting areas of the same kind first and then the state. A Year slider (with Play) drives every panel and highlights that year on every trend. The planned tabs and panels are in [docs/CHARTS.md](docs/CHARTS.md) and the design decisions in [docs/DESIGN.md](docs/DESIGN.md).

| Module (`web/src/`) | Role |
|---|---|
| `lib/db.ts`, `lib/data.ts` | Open DuckDB-WASM (`allowFullHTTPReads: true`, so servers without byte-range support still work) and every query: registry, indicators and series, PEP, LODES, OD flows, QCEW |
| `lib/indicators.ts`, `lib/specs.ts` | The headline indicators and the distribution charts, defined once as ACS variable codes |
| `lib/format.ts` | Number formats and the method labels |
| `lib/charts.ts`, `lib/place.ts`, `lib/map.ts`, `lib/classes.ts` | Plot charts (year highlight, pyramid), the place silhouette, the MapLibre choropleth (one or two variables) and its classes |
| `lib/flows.ts`, `lib/flowmap.ts`, `components/FlowMap.svelte` | The commute flow map (Commute, Where they go): live-and-work, commute in and out from LODES OD rows (`flows.ts`, unit tested), and the Flowmap.gl layer over its own MapLibre map (`flowmap.ts`; deck.gl and Flowmap.gl load only when it opens). Keep `@deck.gl/*` and `@luma.gl/*` at 9.3.5: with 9.4.x Flowmap.gl 9.4.0 draws but nothing can be hovered or clicked |
| `report/`, `components/ReportButton.svelte` | The PDF report (navbar, PDF report), in two formats, each in portrait or landscape. The **document** is a designed profile on US Letter, with a cover, the curated charts of every tab, tract maps of the area, the commute flow map, the indicator table, methods, and a link and QR code back to the dashboard view. The **poster** (`posterBuild.ts`, `Poster.tsx`) is one fixed 24 by 36 inch page of the key figures, main charts, two tract maps and the flow map with one QR code, laid out on a canvas half that size and scaled 2x. `plan.ts` is the curated list of pages, tiles and charts (one fixed chart type each); `model.ts` loads them with the same queries as the dashboard from a frozen view; `charts.tsx` and `maps.tsx` draw vector charts and maps with react-pdf; `geo.ts` and `layout.ts` are pure and unit tested. It is the only React code in the repo: `react` and `@react-pdf/renderer` load in a lazy chunk on the first click, so the app starts as before |
| `lib/app.svelte.ts`, `lib/hash.ts`, `lib/theme.svelte.ts` | State, the shareable URL hash (`#type=…&id=…&cmp=…&v=…&tab=…`) and light, dark or system theme |
| `components/` | Navbar, area picker, rail, context bar, panels (`ChartCard`, `ShareCard`, `TrendCard`, `PyramidCard`, `SeriesCard`), tiles, map card |
| `tabs/` | One file per screen |

Colour grammar, everywhere: **the selected area takes the interface accent (navy, pale blue-grey in dark mode) and the compared area is orange-brown**; the population pyramid keeps the usual men blue, women pink. Method chips are tinted (green published, blue aggregate, amber estimate) and explain themselves on hover. The map's data ramp is yellow to green (ColorBrewer YlGn) and the bivariate map a 3 by 3 palette, never the selection colours.

## Run the pipeline

```
uv sync
cp .env.example .env            # then add CENSUS_API_KEY
uv run python -m pipeline all   # or: uv run profiles all
```

`uv run profiles --help` lists the stages. On machines where Windows Application Control blocks the `profiles.exe` that uv
generates, use `uv run python -m pipeline <command>`, which does the same thing. Every stage caches downloads in `raw/`
and rewrites a tracked file in `data/` only when its bytes change, so a rerun leaves no git diff. Pass `--refresh` to download
again.

| Command | What it does | Output |
|---|---|---|
| `validate` | Check every configured ACS table and geography against each vintage | `data/meta/variables.parquet`, `data/meta/acs-availability.md` |
| `acs` | Download whole ACS 5-year tables (2009 to latest) for state, county, place and tract | `data/acs/<topic>/<geo_type>.parquet` |
| `geographies` | Build the list of selectable areas | `data/meta/geographies.parquet` |
| `pep` | Annual population estimates for the state, counties and places | `data/pep/*.parquet` |
| `lodes` | LEHD jobs by workplace (WAC), workers by residence (RAC) and commute flows (OD), 2002 to latest | `data/lodes/{wac,rac,od}/<geo_type>.parquet` |
| `qcew` | BLS establishments, employment and wages by county, ownership and industry | `data/qcew/*.parquet` |
| `qa` | Check that county jobs add up to the state's and compare LODES with QCEW | `data/meta/employment-qa.md` |
| `export` | Simplified GeoJSON for the web maps, and a point inside each area that has commute flows (where the flow map anchors its lines) | `data/web/<geo_type>.geojson`, `data/meta/centroids.parquet` |

`all` runs them in that order. ACS files are long format (`geo_id, geo_type, vintage, variable, estimate, moe, flag, method`).
Geography files are GeoParquet; spatial work runs in DuckDB with the spatial extension. The simplified GeoJSON in `data/web/`
is the only GeoJSON. Output is deterministic (ordered, zstd), and a size guard in the manifest flags files that grow unexpectedly.

### Reproducibility

With the downloads cached in `raw/` and a Census API key in `.env`, `uv run python -m pipeline all` rebuilds every tracked file
in `data/` byte for byte; with no `raw/` it downloads everything again (about 1 GB). After the planning areas were removed, the
county, city and tract files were rebuilt from the cache and came out unchanged.

## Notes

- `duckdb` is pinned to `1.5.4` in `pyproject.toml`. Newer builds (1.5.6, 2.0.0) were blocked by Windows Application Control on the
  maintainer's machine; it may test 2.0.0 and bump the pin if `LOAD spatial` works.
- Current boundaries are used for every period.
- Windows with CRLF line endings: `.gitattributes` normalises text to LF.
- The Census API key lives in `.env` (gitignored). Never print or commit it.
