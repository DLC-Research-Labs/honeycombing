# ALARM NC plan-assignment matrix — pure-Python extraction (2026-07-17)

**Claim tag:** `descriptive` (data-engineering provenance note; no analytical claims).

## What this closes

The ensemble-explainer schema doc (Objective 3) has carried one unresolved
dependency since ingestion: ALARM's precinct→district assignment matrices ship
as `NC_cd_2020_plans.rds`, an R `redist_plans` object, and every data-frame
level reader (pyreadr, `rdata`'s default conversion) drops the matrix because
it lives in an R *attribute* (`plans`), not in the tibble columns. The working
assumption was that ingestion required R tooling.

That assumption is dead. The `rdata` package parses the R serialization format
in pure Python, and the raw parse tree retains attributes. Walking the tree for
the `plans`-tagged attribute recovers the full matrix. The companion
`NC_cd_2020_map.rds` (an sf tibble) converts directly to a 2,666-row DataFrame
with GEOID, county, VTD, full population/VAP by race, returns for eight
statewide races (2016/2020 president, US Senate, governor, attorney general,
secretary of state), land/water area, adjacency, and the `cd_2020` reference
assignment.

## Extraction

`scripts/extract-alarm-plans.py` (run:
`uv run --with rdata --with pandas python3 scripts/extract-alarm-plans.py`)
reads both files and emits, under the gitignored `data/alarm/derived/`:

- `nc-plans-assignment.bin` — int8, row-major, **2,666 precincts × 5,001
  draws** (column 0 = the `cd_2020` reference plan, then simulated draws
  1..5000), values = district labels 1..14. 13.3 MB.
- `nc-plans-assignment-manifest.json` — layout, precinct GEOID row order,
  gate results, provenance.

## Verification gates (all hard; all passed 2026-07-17)

1. **Dims** — matrix dim attribute is exactly [2666, 5001]; map has 2,666
   rows; district tibble has 5,001 × 14 rows.
2. **Reference alignment** — matrix column 0 equals the map's `cd_2020`
   column at every precinct (0 mismatches). Anchors row order to the map.
3. **Population closure** — for **every one of the 5,001 draws**, summing the
   map's precinct populations by assigned district reproduces the tibble's
   `total_pop` *exactly* (integer equality). This jointly verifies matrix
   orientation (column-major reshape), row order, and precinct populations.
4. **District labels** — every draw assigns all districts 1..14.

## What this unlocks (not yet built)

- **H3 cell-level ensemble measure** (the schema doc's open `h3` unit): for
  each precinct, the distribution over 5,000 neutral plans of the district
  environment it lands in — mappable into H3 with the usual assignment
  caveats.
- **Divergence localization** (the ROADMAP's "next headline" prerequisite):
  *where* the 2023 enacted plan departs from the simulated distribution, not
  just how much (seat-count percentile).
- **Observed-vote graduation support**: the map file's non-presidential
  statewide races (US Senate, governor, AG) give proxy-robustness checks
  before precinct-level *congressional* returns are ingested.

## Provenance

ALARM 50-State Redistricting Simulations, Harvard Dataverse
doi:10.7910/DVN/SLCD3E (version 15), CC0. Files: `NC_cd_2020_plans.rds`
(Dataverse file id 6392711), `NC_cd_2020_map.rds` (file id 6380468). See
McCartan et al., *Scientific Data* 9:689 (2022).

## Caveats

- `rdata`'s pairlist layout is an implementation detail of that package; the
  extractor searches for the `plans` attribute rather than hardcoding a path,
  and the population-closure gate would catch any silent layout change.
- The sf `geometry` column of the map file is not used by the extractor;
  precinct geometry for H3 work should come from a shapefile/GeoJSON source
  with its own provenance line (VEST/TIGER), matched on GEOID.
- Nothing here changes the ensemble payload's `draft` status or any displayed
  number.
