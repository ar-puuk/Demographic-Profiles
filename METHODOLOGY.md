# Community profiles: methods and sources

Where the numbers come from, and what to keep in mind when reading them.

The community profiles show facts and figures for Utah at three levels: the state, its counties, and its cities and towns, with Census tracts on the maps. This page explains where each number comes from and how much weight it can bear.

## What you are looking at

Every value in the dashboard carries a label that says how it was made.

| Label | Meaning |
|---|---|
| **Census published** | The Census Bureau published this value for exactly this area (a county, city, tract or the state). |
| **Census aggregate** | An exact sum of whole Census blocks that lie inside the area. Used for jobs and commute flows. |

All ACS values are Census published; only the LODES jobs and flows are aggregates, because LODES is published by block.

## Sources

| Topic | Source | Years | Finest geography used |
|---|---|---|---|
| People, households, housing, income, education, commuting | American Community Survey (ACS) 5-year estimates, Census Bureau | 2005–2009 through 2020–2024 | Tract (the latest period only); county and city for every period |
| Annual population | Population Estimates Program, Census Bureau | 2010–2024 | County, city |
| Jobs, workers, commute flows | LEHD Origin-Destination Employment Statistics (LODES8), Census Bureau | 2002–2023 | Block |
| Employment, establishments, wages by industry | Quarterly Census of Employment and Wages (QCEW), Bureau of Labor Statistics | 2014–2025 | County |
| Boundaries | Census TIGER/Line cartographic boundaries | Current | |

An ACS 5-year estimate pools five years of survey responses, so "2020–2024" is an average over those years. Adjacent periods share four of their five years: compare periods that do not overlap (for example 2014–18 with 2019–23) when looking for change.

### Time

History uses the boundary the Census published for each period. City trends follow each year's published boundary, so an annexation shows as growth. Census tracts were redrawn in 2020, so on the maps a tract that has since been split or merged has no value for earlier periods, and tract values are shown for the latest period only.

## Reading the numbers

- **Margins of error.** ACS values are estimates from a sample. The margin of error is shown at the 90% confidence level; shaded bands on trend charts show it. Small areas have wide margins.
- **Dollars.** Income, rent and home value are in the dollars of each period and are not adjusted for inflation.
- **Population estimates.** The 2010s estimates are based on the 2010 Census and the 2020s on the 2020 Census, so the series steps at 2020: the state grows 2.4% from 2019 to 2020 against about 1.7% a year on either side, and some places move by tens of percent. Read the change across 2019 to 2020 as a change of base, not of growth. (The dashboard shows ACS populations; the estimates are in the data files only.)
- **Jobs.** LODES counts jobs by place of work and workers by place of residence. The Census Bureau adds noise to block counts to protect privacy, so jobs in very small areas are rough. Commute flows include workers who live outside Utah but exclude Utah residents who work outside the state. QCEW counts covered employment and is published only for counties and the state; it will not match LODES exactly.
- **LODES breakdowns.** Educational attainment is reported only for workers 30 and older, so education shares are of those workers' jobs, not of all jobs. Race, ethnicity, sex and education are not reported before 2009, and firm age and firm size are zero for Utah in every year; the app shows these as not published rather than as 0%. Residents counted by LODES (workers who live here) include those working outside Utah, while commute flows count only in-state jobs, so the two totals differ by roughly 2% (about 33,700 workers in 2023: 1,652,761 against 1,619,040). The "workers who live here" tile uses the first, the commute-flow map the second.
- **Source quirks.** Some oddities are in the data as the Census Bureau publishes it, and are left as they are. Public administration jumps by about 11,000 jobs in Utah from 2009 to 2010 and stays there while total jobs are flat. LODES places each job at its employer's address, so one large employer can move many jobs into a single block: a block in Millcreek holds about 15,000 to 21,000 jobs in 2012 to 2019 and about 600 in 2020, which is why Millcreek's job count doubles in 2012 and halves in 2020 (county totals are not affected). Davis County's resident workers fall to 67,405 in 2006 (119,825 in 2007), apparently a geocoding gap in that year's source file. Place and county LODES series use the current boundary of each place in every year. QCEW's Morgan County professional services pay more than doubles in 2025 ($104,349 to $232,900 for 242 jobs), which is the published figure.
- **Missing values.** Where the Census withholds a value, it is left empty, not shown as zero.

## The PDF report

The report is built in your browser from the same files as the dashboard, for the area, comparison and year on screen. Charts and maps are drawn as vector graphics, so the text can be selected and the pages print sharply. It has bookmarks and a document language but no accessibility tags; the table view and CSV download of every chart in the dashboard are the accessible form.

- **Tract maps.** Each map shows the Census tracts that make up the area: every tract with at least a quarter of its own extent inside the area, and every tract that holds at least 2% of the area (so a small city inside one large tract shows that tract). Tracts that only touch the boundary are left out. A tract that crosses the boundary is drawn whole, because its value describes the whole tract. Tract values are the newest ACS vintage whose tracts match the 2020 boundaries, so a report for an earlier year still draws the newest tracts. Classes are five groups of equal count, taken from every tract on the page set so that two areas are classed alike.
- **Commute flow map.** The map is framed to reach the routes that carry about 75 percent of the jobs between the area and the other areas of its kind (at least 4 and at most 25 routes), plus the area itself. It draws the busiest routes in the style of the dashboard's flow map: straight flows from where workers live to where they work, an arrowhead at the job end, and colour and thickness that grow with the number of jobs; a route whose far end is off the frame is clipped at the edge and counted under the map. Flows to the rest of the state and to other states have no location on the map and are listed beneath it. With a comparison, the flow map shows the selected area only.
- **Poster.** The poster is one 24 by 36 inch page with a fixed set of figures, charts and two tract maps (income and poverty) of the selected area, and the flow map where the area has commute flows (otherwise four more charts). With a comparison, charts and key figures show both areas and the maps show the selected area only.
- **What is fixed.** Unlike the dashboard, each chart in the report has one chart type and a fixed set of variables, chosen for print.

## Reproducing and reusing the data

All data behind the dashboard is published as Parquet files in the [project repository](https://github.com/ar-puuk/Demographic-Profiles/tree/main/data), and every chart has a table view, and the Indicators tab has a CSV download. The pipeline that downloads and processes the sources is in the same repository. It is reproducible from scratch: `uv sync`, add a Census API key to `.env`, and `uv run python -m pipeline all` rebuild every file from the original sources. The repository also holds the checks that the processing reproduces published Census totals.

This project derives from the Community Profiles of the Wasatch Front Regional Council, whose material is licensed CC BY 4.0; data from other sources keeps its own terms.

## Suggested citation

Utah Community Profiles (github.com/ar-puuk/Demographic-Profiles), using data from the U.S. Census Bureau (ACS, Population Estimates Program, LEHD LODES) and the U.S. Bureau of Labor Statistics (QCEW). Derived from the Wasatch Front Regional Council's Community Profiles (CC BY 4.0).
