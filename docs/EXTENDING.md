# Extending the profiles

Everything below is a change to `config/config.yml`, then `uv run python -m pipeline all`. The web app reads
`data/meta/app.json`, which the export step writes from the same file.

| To add | Change | Code change |
|---|---|---|
| A new ACS vintage | append the year to `acs.vintages` | none |
| A new LODES or QCEW year | append to `lodes.years` / `qcew.years` | none |
| A new PEP release | add a `pep.files` entry (use `{fips}` in file names) | none |
| An ACS table | add it under `acs.tables` with topic, weight and unit | none for the pipeline; a chart in `web/src/tabs` to show it |
| A simplification tolerance for a new type | `export.simplify` | none |
| Another state | change `state` (abbr, fips, name), `pep.files`, `app.defaults`, `app.benchmarks`, `tiger.year`, `export.metric_crs`, `lodes.other_id` | none for one state at a time |

`{fips}` in any string of the config is replaced by `state.fips`. The LODES file prefix is derived from `state.abbr`.

## Adding to the PDF report

The report is a fixed document, so a chart reaches it by being listed, not by existing in the dashboard. Everything is in `web/src/report/`:

- **A chart or tile on an existing page:** add it to that page in `plan.ts`. A chart is a loader from `model.ts` (`share` for a distribution in `specs.ts`, `rate`, `trend` for an indicator over the years, or one of the specific loaders) with one fixed type: `bars` (many categories or long labels), `columns` (a few short, ordered categories), `donut` (up to about six categories) or `stacked`. A page holds six cells (3 columns by 2 rows in landscape, 2 by 3 in portrait); a panel with `span: TALL` takes two. `report.test.ts` fails if a page's panels do not fit in both orientations.
- **A new page:** add a page to `PAGES` in `plan.ts`. Its section name becomes a line of the contents on the cover.
- **A map:** add the indicator to `MAPS` in `model.ts`. It needs `map: true` in `indicators.ts`; the report draws it for every tract of the area, on classes shared by the selected and compared area.
- **A new kind of chart:** add a component to `charts.tsx` and a `kind` to `PanelData` in `model.ts`, then a case in `Chart` in `Doc.tsx`.

The poster is separate: `posterBuild.ts` lists its panels and where each sits in the grid (3 by 6 in portrait, 6 by 3 in landscape). `posterRects` is unit tested to fill the grid exactly, so adding a panel means taking one out or changing a span.

Colours and fonts are written out in `report/theme.ts` (the PDF cannot read CSS variables); keep them in step with `app.css`.

Not yet generic: the web app lists its geography types in `GEO_TYPES`. A run covers one state; several
states means one checkout per state.
