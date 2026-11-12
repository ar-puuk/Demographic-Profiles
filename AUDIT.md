# Calculation audit, 2026-11-07

> **Historical.** This audit was done on the original WFRC version, which also built planning areas (AOG, MPO, RPO, workshop areas) from block groups. That machinery has been removed from this fork, so findings about areas, the crosswalk and interpolated medians no longer apply; the ACS, LODES, PEP and QCEW findings still do.
Scope: pipeline (ACS, LODES, PEP, QCEW, aggregation, export), committed `data/`, and the web app's derived numbers.
Method: four independent read-only reviews (ACS pipeline, LODES/PEP/QCEW, front end, data invariants via DuckDB). Existing tests pass (46 Python, 19 vitest), but none cover the issues below.
No code or data was changed. Detailed per-agent reports (file:line, queries) are in the session scratchpad.

Status key: **Verified** = reproduced by me directly against the committed data/code. **Reported** = found by one reviewer, evidence checked by that reviewer only.

## What reconciles (no action needed)

- Additive ACS variables: tract, block group, county and state sums agree (rounding and suppression gaps only).
- Area estimates and MOEs recomputed independently from crosswalk shares: 0 mismatches over ~51k rows. aog-wfrc equals the sum of its five counties; rpo-morgan equals Morgan County.
- Crosswalk: ACS block-group ids match the 2010/2020 crosswalks (977/977, 1140/1140); no double counting inside a layer.
- Sentinels (-666666666 etc.) nulled; no negative estimates, NaN/inf or negative MOEs.
- Median interpolation within 1.5% for rent, home value, age; income worst case 3.26%.
- LODES: county sums equal state; OD destinations equal WAC; age, earnings and industry segments sum to total; OD direction correct; weighted centroids reproduce.
- PEP county sums equal state in all years; 2020 anchors consistent with the Census counts.
- QCEW: no gaps in 29 counties x 12 years; sectors and ownerships sum to totals.
- Flow-map inflow/outflow/net tie to WAC totals for the cases checked. `manifest.json` counts match all files.

## A. Wrong numbers shown to users

| # | Finding | Where | Status |
|---|---|---|---|
| A1 | **Language card double counts.** Spanish = group total + both child rows. Utah 2024: Spanish shows 21.9% (690,092 / 3,156,873); true is 10.9% (345,046). "Another language" likewise doubled; card sums to ~116%. | `web/src/lib/specs.ts:33-34,102-104` | Verified |
| A2 | **B11012 changes layout between vintages.** Same variable ids mean different things before and after 2019 (2014 `_002` = 673k, 2019 = 596k, different category layout); 2015-18 absent. `married` falls 75% to 61% from definition change alone; `living_alone`, householdType and householdDetail break too (categories sum to 113-169% in early years). | `config.yml:81`, `indicators.ts:52,54`, `specs.ts:67-69,122-125` | Verified (data); effect sizes Reported |
| A3 | **LODES education uses the wrong denominator.** CD01-CD04 cover workers aged 30+ only (2023: 1,180,584 = CA02+CA03, of 1,667,200 jobs). Divided by all jobs, Bachelor's+ reads 20.8% vs ~29.3%; bars sum to ~71%. | `specs.ts`, `LodesCard.svelte:33-36` | Verified (data) |
| A4 | **LODES zeros stand in for "not published".** Firm age/size (CFA/CFS) are 0 for every year/area, but Jobs > Industries shows a "Firm size" card of 0.0% bars. Race, sex, ethnicity, education are 0 for 2002-2008, giving a trend that jumps to ~70% in 2009. | `Jobs.svelte:32`, `lodes.py` | Verified (CFA/CFS, education 2005 = 0) |
| A5 | **QCEW state file is empty.** `data/qcew/state.parquet` has 0 rows: the agglvl filter (70/71/74) excludes BLS state rows (50/51/54). The "Utah" QCEW benchmark is blank although METHODOLOGY.md says it is covered. | `config.yml:173`, `qcew.py:84` | Verified |
| A6 | **Partial QCEW sums plotted as real.** Area sums where counties are suppressed are lower bounds (`flag = partial`), but the web ignores the flag: AOG Construction 78,032 (2024) to 58,328 (2025), a false -25%. Partial `avg_annual_pay` is a subset mean. 332 partial rows. Suppressed latest year is treated as 0, dropping the sector from top-8. | `QcewCard.svelte`, `qcew.py` | Reported |
| A7 | **2009 vintage veterans rows wrong.** B21001_002 is "Male" in 2009: Veterans tile 49.6%, 18-34 rate 198%. | `indicators.ts`, `specs.ts` | Reported |
| A8 | **Nativity omits "Not a U.S. citizen" for 2009-14** (B05002_021 exists only from 2015); shares sum to 94.6%. | `specs.ts` | Reported |
| A9 | **Internet-subscription categories overlap**, sum to 103-104%; donut clips the last slice (No subscription ~3% in ring vs 6.5% legend). | `specs.ts` (B28002 _006/_007/_009) | Reported |
| A10 | **Top-coded/bottom-coded medians shown as exact.** Tiles test `flag === "+"` but real flags are strings like "250,000+" / "10,000-", so the caveat never shows; Indicators table and CSV drop the flag. Places show $2,000,001, $9,999 etc. | `Tiles.svelte:27` | Reported |

## B. Margins of error and statistics

| # | Finding | Status |
|---|---|---|
| B1 | **MOE too wide for whole-county areas.** aog-wfrc 2024 population 1,929,244 +/-18,274 where county MOE is 0; ~80 of 187 population variables >1.5x county-derived. Build county-union areas from county rows (`aggregate.py:266-267`). | Reported by two reviewers |
| B2 | **Ratio MOE uses the proportion formula** for `mean_travel` and `avg_hh_size` (`data.ts:91-97`): Salt Lake mean travel +/-0.19 min vs correct +/-0.36; place 4936400 +/-0.11 vs +/-3.89. `mean_travel` also mixes tract-split numerator with block-group-split denominator. | Reported |
| B3 | **Inconsistent null-MOE rules**: `sumOf` drops the MOE if any term lacks one; SQL aggregation ignores null MOEs (`data.ts:77-88` vs `120-127`). Same figure shows a margin on one card, none on another. Zero-estimate MOEs summed in full (~20% wide). | Reported |
| B4 | **No reliability warning.** 2024: 266 of 324 places have transit-share MOE > estimate; 209 of 326 poverty CV > 30%. | Reported |
| B5 | **Allocated MOEs treat the share as a constant**; METHODOLOGY.md calls aggregates "exact" (true for estimates only). | Reported |
| B6 | **No MOE for medians**, and income median interpolates 0.4% high on average / 3.26% worst, above the "about 3%" documented (`METHODOLOGY.md:45`). | Reported |

## C. Method concerns

- **C1. Population-share weighting for every table**, including household and housing tables (`aggregate.py`). Example: block group 490572104051 has pop share 0.46 but household share 0.025 inside fws-southern-weber. Area-level effect <1%, but derived medians inherit it. Household/housing-unit weights are computed but unused.
- **C2. B12001, B21001, B19058 set to tract-level** though block-group data exist (never_married, veterans, snap coarser than necessary for workshop areas).
- **C3. `validate()` compares variable ids only** (`acs.py:83-84`); 129 variables across 14 tables have label drift (e.g. B25034 "2010 or later" to "2014 or later" to "2020 or later").
- **C4. RAC vs OD origins differ by ~33.7k** (1,652,761 vs 1,619,040: residents working out of state). "Workers who live here" tile uses RAC; flow-map figures use in-state OD (Utah County: 615,114 vs 605,857). Undocumented.
- **C5. Undocumented JT00 federal-jobs break in 2010** (NAICS 92: 52,054 to 63,359 while total jobs flat). LODES place/county series use fixed 2020-era boundaries (not stated).
- **C6. PEP vintage splice at 2019/2020** inflates the state step to +2.44% vs ~+1.7% either side; some places swing +/-60%. No components of change collected; no card uses PEP.
- **C7. "Rest of Utah" anchor**: for places, falls back to a `polylabel` point (-113.216, 41.374) in the Box Elder desert because the weighted mean lies within 2.5 km of a CDP. AOG remainder point sits near Nephi (mean of a multimodal distribution).
- **C8. Morgan RPO `avg_annual_pay` recomputed from rounded employment** (up to 3.5-11% off the BLS figure). Copy BLS value for single-county areas.
- **C9. Map tooltip mixes units**: "vs median" in percentage points, "Since YYYY" in relative percent (12% to 14% reads "+17%"); can print "-0.0%".
- **C10. Dollar-series note** appears on one card only; wording "not adjusted for inflation" is imprecise (ACS dollars are end-year of each period).
- Suspected (code only): tract trends before 2010 splice different tract sets.

## D. Source anomalies to confirm, not necessarily bugs

- Davis County RAC 2006 = 67,405 vs ~113-120k neighbouring years (geocoding anomaly in source).
- Millcreek place jobs +69% (2012), -43% (2020).
- Morgan private pay +23.5% in 2025 (likely a suppressed-sector effect).
- Seven retired place ids in ACS files absent from `geographies.parquet`. Place LODES files omit zero rows, county files keep them.

## E. Labels, display, export

- Labels not matching the number: "People living alone" (one-person households as share of households); "Born abroad to U.S. citizens" includes Puerto Rico/Island Areas; "Married" includes separated; trend tables show end year while tooltips show "2020-2024"; tract names show 6-digit code instead of "1134.14".
- `fmtInt(-0.3)` returns "-0"; `fmtCompact` prints "12.35K"/"1.23M" beside integers; percent axis ticks can duplicate ("2%, 2%, 3%"); sex-ratio has no zero-women guard.
- Two places named "Enterprise" would collide if series are keyed by label.
- CSV: no BOM (Excel garbles "+/-" and en dashes), rounded display strings rather than raw numbers, ChartCard header unquoted.
- Flow-map route table mixes the capped route list with all unmapped routes and has no "Top N" label.
- `acs.run` skips existing part files, so a newly configured table gets no data without `--refresh`.
- METHODOLOGY.md wording: "exact", "dollars of each period"; rpo mixes 2009 and 2013 start years.

## Refuted during verification

- **"State median age stored as whole years"** (data reviewer): not reproduced. `estimate` is DOUBLE; state B01002_001 reads 28.5 (2009) through 32.0 (2024) with MOEs 0.1-0.2. Dropped.

## Test gaps behind these issues

No tests for `qcew.py`, PEP area sums or the vintage splice, `od_part`/`jobs_part` overlap handling, `block_weights`/`rest_weights`, or front-end spec sums. Cheapest guard: a data-driven test that sums each spec's categories to its denominator for state 49 in every vintage (would have caught A1, A2, A8, A9), plus a row-count test per output parquet (would have caught A5).

## Resolution status (2026-11-07)

Fixed, each with a regression test (55 Python and 109 web tests pass):

| Items | Commit | What changed |
|---|---|---|
| A1, A2, A7, A8, A9 | Fix spec and indicator definitions | Language card counts each row once; B11012 specs, married and one-person households start 2019; veterans start 2010; nativity maps the moved row for 2009-14; rent bands start 2015; internet type is a partition. New `spec-sums.test.ts` checks every spec and indicator against Utah's real values in every vintage. |
| A3, A4 | LODES education base | Education shares are of workers 30+; breakdowns LODES does not publish are skipped; firm age/size options removed. |
| A5, A6, C8 | QCEW | State file now loads (49 rows per sector-year, totals match the counties); partial sums are marked or left out in the app; single-county areas use the BLS pay. |
| B1, B2, B3 | Margins of error | The WFRC region is summed from county rows (population margin was +/-18,274, now none); ratio formula for average household size and travel time; one null-margin rule in JS and SQL. |
| A10, C9, E | Display | Bounded medians show as "$250,000+"; percentage-point changes in the tooltip; no "-0"; CSV BOM and quoted headers; "use with caution" when the margin exceeds 30% of the estimate; mislabelled titles renamed. |

Corrected during the work: A2's 2015-18 gap and the `since` logic apply to specs, rate specs and indicators alike; the state-median-age finding was refuted (see above).

Second round (all remaining items worked, easiest first):

| Items | What changed |
|---|---|
| Axis and display | Percent ticks never repeat (2.5% beside 2%, 3%); compact numbers keep three digits ("12.3K"); series are coloured by area id, so two places called "Enterprise" stay apart; sex ratio guards zero women; the flow-map table says it lists the largest routes plus the areas not drawn; tracts use the Census number (1128.01). |
| Uninsured by age | Age breaks moved in 2017: earlier years show the old bracket names, and the trend leaves out the three groups that changed. |
| C3, acs.run | `validate()` now compares labels as well as ids (ignoring punctuation and the dollar year) and lists the vintages in `data/meta/acs-availability.md`; a part file that lacks a configured table is rebuilt instead of skipped. |
| D, C4, C5, C6 | Place and tract LODES series fill omitted zero years as 0. The source oddities are confirmed and documented in METHODOLOGY.md: one block holds 15,000-21,000 Millcreek jobs in 2012-2019; Davis RAC 2006 is in the raw LODES file (also in OD); public administration steps +11,000 in 2010 and total jobs do not; Morgan professional-services pay is the published BLS value; the seven retired place ids are old places that no longer exist. RAC vs OD (33.7k), the fixed place boundaries and the PEP splice (state +2.4% across 2019-20) are documented. |
| C7 | The Rest of Utah point falls back to the nearest clear point to the traffic centre (place type moved from the Box Elder desert to -111.53, 40.18). |
| C1 | Household tables are split by occupied homes (B11012, B25003, B25044, B25008, B25063, B25075, B25070, B25091, B19001, B25014, B28002, B19058) and housing-unit tables by housing units (B25002, B25004, B25024, B25034). Area values move by under 1%; mpo, rpo and fws files regenerated. |
| C2 | B12001, B21001 and B19058 now use block groups (the block-group files were already cached). Estimates move by a few percent; margins widen (for example marital-status total in Box Elder +-824 to +-1,167), which is the honest price of the finer geography. |
| B6 | Derived medians now carry a margin of error from the bracket margins. Against published county margins (50,000+): ratio 1.0 for rent, 1.1-1.2 for income and home value, about 1.6 for age (conservative). |
| B5 | Documented: split-area margins treat the share as exact, so they are slightly too narrow. |

Verified: 58 Python tests, 114 web tests, svelte-check, the production build and the 20 Playwright tests (including axe) pass.

Not changed, on purpose: the source values in section D (they are what the Census Bureau and BLS publish); series keyed by label inside distribution charts still collide if the compared area has the same name as the selected one (the colour fix covers line charts).
