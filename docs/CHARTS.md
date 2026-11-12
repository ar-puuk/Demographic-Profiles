# Tabs, charts and variables

The plan for what the app shows. Each tab is one screen (about six to eight panels). Every panel has a table view and CSV, names its source, follows the **Year** control and the **Compare** area, and shows a margin of error where one is published.

**Status of each panel**

- **Ready**: the data is already in `data/` and the query exists.
- **Derive**: computed from tables we already have (a share, a rate, a sum of categories).
- **New**: needs a table added to the pipeline (`config/config.yml`) and a re-run.

The geography notes use: **S** state, **C** county, **P** city or town, **T** tract (latest year only).

## Tabs

Eleven destinations on the rail (Overview and Map first, Indicators last), plus a Methods page in the navbar.

| # | Tab | What it answers |
|---|---|---|
| 1 | Overview | Who lives here and how is it changing? |
| 2 | Map | Where is it high or low? Any variable, or two together |
| 3 | People | Age, sex, race, ethnicity, language, disability |
| 4 | Households | Who lives together, and with what (cars, internet) |
| 5 | Housing | What homes are there, what do they cost |
| 6 | Income and poverty | What people earn and who is struggling |
| 7 | Education | Attainment and school enrollment |
| 8 | Jobs and economy | Jobs here, who holds them, wages by industry |
| 9 | Commute | How, how long, and where people travel to work |
| 10 | Explore | Build your own chart from any variable |
| 11 | Indicators | The full table, with margins of error and CSV |

## 1. Overview

Key figures (tiles, each with its method chip and the compared area's value): population, households, median age, median household income, poverty rate, renter share, median gross rent, median home value, bachelor's degree or more, jobs located here.

| Panel | Chart | Variables | Status |
|---|---|---|---|
| Key figures | tiles | the ten above | Ready |
| Where it is | locator map, selected and compared outlined | county, place and area boundaries (`data/web`) | Ready |
| Population over time | line, chosen year ringed | PEP annual estimates (S, C, P, W of whole counties); ACS `B01001_001` otherwise | Ready |
| Age and sex | population pyramid for the chosen year | `B01001` | Ready |
| Median household income over time | line with margin-of-error band | `B19013` | Ready |
| Jobs over time | line | LODES WAC `C000` | Ready |

## 2. Map

One variable shades the map; an optional second makes it bivariate (3 by 3). Layers: counties, cities and towns, census tracts (latest year). Extent: all of Utah. Legend with markers for the selected and compared areas; hover shows the value; click picks an area, Shift-click compares.

Mappable variables (a single list in `web/src/lib/indicators.ts`): the 20 indicators now defined, plus the **New** and **Derive** ones below as they land. Rates and shares only, plus counts shown per capita or as density, never raw counts that just track population.

| Group | Variables | Status |
|---|---|---|
| Population | population, median age, under 18, 65 and over, Hispanic or Latino, female share, foreign born | Ready, Derive (female share from `B01001_026`), New (foreign born) |
| Households | households, renter share, no vehicle, average household size, living alone | Ready, New (size, alone) |
| Housing | housing units, vacancy, median rent, median home value, rent burden, owner cost burden, crowding, built since 2010 | Ready, Derive (owner burden from `B25091`; built since 2010 from `B25034`), New (crowding) |
| Income | median household income, poverty, per capita income, Gini index, SNAP households | Ready, New (last three) |
| Education | bachelor's or more, high school or less, enrolled in college | Ready, Derive |
| Work | unemployment, labor force participation, jobs per worker, jobs density | Ready, Derive |
| Commute | drive alone, transit, work from home, walk or bike, mean travel time, commute over 45 minutes | Ready, Derive, New (mean time) |

## 3. People

| Panel | Chart | Variables | Status |
|---|---|---|---|
| Men and women | two-segment bar: counts, shares, men per 100 women; female share over time | `B01001_002`, `_026` | Ready |
| Age and sex | pyramid for the chosen year; a ghost of an earlier year optional | `B01001` | Ready |
| Age groups | bars: under 5, 5 to 17, 18 to 24, 25 to 44, 45 to 64, 65 to 84, 85 and over; under 18 and 65-plus over time | `B01001` | Ready |
| Median age | line, with men and women separately | `B01002_001`, `_002`, `_003` | Ready |
| Race | bars | `B02001` | Ready |
| Hispanic or Latino origin | bars and trend | `B03003` | Ready |
| Race by origin | stacked bars, Hispanic or Latino by race | `B03002` | New |
| Nativity and place of birth | bars: native, foreign born, region of birth | `B05002`, `B05006` | New |
| Language spoken at home | bars: English only, Spanish, other; English proficiency | `B16001` (series breaks before 2016); proficiency `B16004` | Ready, New |
| Disability | bars by type and by age | `B18101` (from 2012); by type `B18102` to `B18107` | Ready, New |
| Group quarters | bars: college dormitories, correctional, nursing homes, military | `B26001`; type `B26101` | Ready, New |
| Population change | components bars (births, deaths, migration) | PEP components of change | New |
| Veterans | share and bars by era | `B21001` | New |

(A tab holds six to eight; the rest sit in a "More" switcher in the panel header, so the screen stays one page.)

## 4. Households

| Panel | Chart | Variables | Status |
|---|---|---|---|
| Household types | bars: married couple, cohabiting, single parent, living alone, other | `B11012` (not published 2015 to 2018, shown as a gap) | Ready |
| Household size | bars: 1, 2, 3, 4, 5, 6 or more; average size over time | `B11016`, `B25010` | New |
| Families with children | share with own children under 18, single-parent share | `B11003`, `B09002` | New |
| Seniors | living alone, householders 65 and over | `B09020`, `B11007` | New |
| Vehicles available | stacked bars by tenure | `B25044` | Ready |
| Internet access | bars: broadband, cellular only, none | `B28002` (from 2017), `B28001` devices | Ready, New |
| Moved in the last year | bars: same house, same county, other Utah, other state, abroad | `B07003` | New |
| Health insurance | bars: private, public, none; uninsured over time | `B27001`, `B27010` | New |

## 5. Housing

| Panel | Chart | Variables | Status |
|---|---|---|---|
| Own or rent | bars; renter share over time | `B25003` | Ready |
| Occupancy and vacancy | bars: occupied, vacant (for rent, for sale, seasonal, other) | `B25002`, `B25004` | Ready, New |
| Units in structure | bars: detached, attached, 2 to 4, 5 to 19, 20 plus, mobile home | `B25024` | Ready |
| When homes were built | bars (categories differ by vintage, taken from the labels) | `B25034`; median `B25035` | Ready, New |
| Bedrooms | bars by tenure | `B25042` | New |
| Home value | bars by bracket; median over time | `B25075`, `B25077` | Ready |
| Gross rent | bars by bracket; median over time | `B25063`, `B25064` | Ready |
| Renters paying 30 percent or more | bars by share of income; trend | `B25070` | Ready |
| Owner costs as a share of income | bars; trend | `B25091` (with a mortgage and without) | Ready |
| Median monthly owner costs | line | `B25088` | New |
| Crowding | share with more than one person per room | `B25014` | New |
| Housing cost burden by income | stacked: 30 percent plus, by income group | `B25106` | New |

## 6. Income and poverty

| Panel | Chart | Variables | Status |
|---|---|---|---|
| Household income | bars by bracket | `B19001` | Ready |
| Median household income | line, MOE band | `B19013` | Ready |
| Poverty rate | line and bars | `B17001_002` | Ready |
| Poverty by age and sex | bars: children, working age, 65 plus | `B17001` age rows | Ready |
| Income to poverty ratio | bars: under 0.5, under 1, under 2 | `C17002` | New |
| Per capita income | line | `B19301` | New |
| Income inequality | Gini index line | `B19083` | New |
| Earnings, retirement and public assistance | bars: households with earnings, Social Security, SNAP, cash assistance | `B19051`, `B19055`, `B19058`, `B22003` | New |
| Median family income | line | `B19113` | New |

## 7. Education

| Panel | Chart | Variables | Status |
|---|---|---|---|
| Educational attainment (25 and over) | bars: less than high school, high school, some college, bachelor's, graduate; trend of bachelor's or more | `B15003` (from 2012) | Ready |
| School enrollment | bars: preschool, K to 8, high school, college, graduate; enrolled share by age | `B14001` | Ready |
| Attainment by sex | bars, men and women | `B15002` | New |
| Enrollment by public or private | bars | `B14002` | New |
| Disengaged youth | share 16 to 19 not in school and not working | `B14005` | New |
| Median earnings by attainment | bars | `B20004` | New |
| Field of bachelor's degree | bars | `B15011` | New |
| Language and school-age children | children who speak a language other than English | `B16007` | New |

## 8. Jobs and economy

Two sources, kept apart and labelled: **LEHD LODES8** counts jobs by workplace and workers by residence; **BLS QCEW** gives employment, establishments and wages (counties and the state).

| Panel | Chart | Variables | Status |
|---|---|---|---|
| Jobs and workers over time | lines, with jobs per worker | LODES WAC and RAC `C000` | Ready |
| Jobs by industry | bars, 20 sectors | WAC `CNS01` to `CNS20` | Ready |
| Who holds the jobs | switcher: age, earnings, education, race, ethnicity, sex | WAC `CA*`, `CE*`, `CD*`, `CR*`, `CT*`, `CS*` | Ready |
| Firm age and size | bars | WAC `CFA*`, `CFS*` | Ready |
| Workers who live here | the same breakdowns for residents | RAC | Ready |
| Employment by industry | bars | QCEW `employment`, private ownership | Ready |
| Average annual pay by industry | bars | QCEW `avg_annual_pay` | Ready |
| Establishments by industry | bars and trend | QCEW `estabs` | Ready |
| Employment status of residents | bars; unemployment rate over time | `B23025` (from 2011) | Ready |
| Labor force participation | line, men and women | `B23001`, `B23025` | Derive, New |
| Occupation and industry of residents | bars | `C24010`, `C24030` | New |
| Class of worker | bars: private, government, self-employed | `B24080` | New |
| Public sector, private sector, self-employed trend | lines | QCEW ownership codes | Ready |

## 9. Commute

| Panel | Chart | Variables | Status |
|---|---|---|---|
| How workers get to work | bars; transit and work-from-home share over time | `B08301` | Ready |
| Travel time | bars; share over 45 minutes over time | `B08303` | Ready |
| Mean travel time | line | `B08013` over `B08301_001` less home workers | New |
| Time leaving home | bars | `B08302` | New |
| Vehicles available to workers | bars | `B08141` | New |
| Mode by workplace | bars (people who work here, by how they arrive) | `B08601` (from 2010) | Ready |
| Live and work here | four figures with counts and shares: live and work here, commute in, commute out, net; in the flow map panel | LODES OD | Ready |
| Commute flow map | curved lines between the area and the areas of its kind where its workers live and work (both, one direction, top 50 to all routes); selected area outlined; table view; flows to the rest of the state and other states listed beside it | LODES OD, `meta/centroids.parquet` | Ready |
| Where workers live | top areas of the same kind, bars | LODES OD | Ready |
| Where residents work | top destinations | LODES OD | Ready |
| Net commuting | in minus out, over time | LODES OD, years 2002 to 2023 | Derive |
| Commute by earnings and by race | bars of mode by group | `B08119`; race and ethnicity iterations `B08105A` to `B08105I` | New |

## 10. Explore

A chart builder over everything above. Pick one or more variables, areas (using the same search and compare rules), chart type and year or range.

- **Trend** of any indicator for up to four areas.
- **Distribution** of any breakdown (any table in the dictionary) for the chosen year.
- **Scatter** of two indicators across all counties, cities or tracts, with the selected area highlighted (the bivariate map as a chart).
- **Side by side**: one indicator for several areas as small multiples, listed alphabetically (no ranking).
- A **dictionary** panel: every table and variable with its label, first year and caveats (`data/meta/variables.parquet`, `acs-availability.md`).

Status: Ready for the data; **New** UI, built on the existing indicator and distribution definitions.

## 11. Indicators

The full table grouped by topic: value, margin of error, method, period, and the compared area beside it. Sortable columns, filters by topic, CSV and (later) Parquet download. Ready.

## Cross-cutting rules

- **Year-aware everywhere**, with the chosen year highlighted on every trend. Population by sex and age follows the year as well.
- **Series breaks** are shown, not hidden: `B11012` has no data 2015 to 2018; `B25034`, `B25063`, `B25075` and `B16001` change categories in older vintages; `B15003` and `B18101` start 2012, `B23025` 2011, `B28002` 2017, `B08601` and `B08603` 2010; tract values are the latest year only; the PEP series steps at 2020 and LODES stops at 2023.
- **Margins of error** as bands or a ± next to the value; an area with a very wide margin gets a small-area note.
- **Method chips** on figures and tiles; bar charts carry them in their table view.
- **Sources** on every panel, specific to the year shown; no combined footnote.
- **No ranking or recommendation.** Lists are alphabetical; the map shades by group, it does not number places.
- **Compare** works on every panel and uses the compare rules (same kind first, then larger areas).
- Every chart: accessible table view, CSV, keyboard focus, light and dark.

## Pipeline additions this plan needs

- ACS tables (all at county, place and tract where published): `B03002`, `B05002`, `B05006`, `B07003`, `B09002`, `B09020`, `B11003`, `B11007`, `B11016`, `B14002`, `B14005`, `B15002`, `B15011`, `B16004`, `B16007`, `B18102` to `B18107`, `B19051`, `B19055`, `B19058`, `B19083`, `B19113`, `B19301`, `B20004`, `B21001`, `B22003`, `B23001`, `B24080`, `B25004`, `B25010`, `B25014`, `B25035`, `B25042`, `B25088`, `B25106`, `B26101`, `B27001`, `B27010`, `B28001`, `B08013`, `B08105A` to `B08105I`, `B08119`, `B08141`, `B08302`, `C17002`, `C24010`, `C24030`.
- Decennial 2010 and 2020 (P, H and DHC tables) shown as their own source for those two years.
- PEP components of change.
- A containment lookup (place to county) for the compare suggestions.
- Medians and means that are not additive (`B19301`, `B25010`, `B25035`, `B25088`, `B08013`) use the existing derivation rules or are marked `aggregated` only where exact.

Every table above was checked against the Census Bureau's 2024 ACS 5-year table list and exists (`B08105` only as the lettered race iterations). A few are newer and start later than 2009 (for example `B15011`, `B26101`, `B27010`, `B28001`); the `validate` stage records each table's first vintage in `data/meta/acs-availability.md`, and the app shows the series from there. Anything not in the pipeline yet is fetched from the Census API the same way the current tables are.

Adding tables is a config change plus `uv run python -m pipeline all` (about 1.5 hours for a full download); the committed `data/` grows, so check the size guard.
