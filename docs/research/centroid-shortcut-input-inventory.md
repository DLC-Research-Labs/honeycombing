# Centroid Shortcut Audit - Input Inventory

Date: 2026-05-03

Checkpoint: Expert Review: Centroid shortcut audit - Inventory assignment inputs and caveats

## Purpose

This inventory records the exact North Carolina inputs Honeycombing currently uses for centroid/internal-point assignment, which polygon sources are already available for polygon-to-H3 apportionment, and which caveats must travel with the next comparison.

The finding is straightforward: Honeycombing has enough local geometry to design the apportionment audit without a new data hunt. The browser-facing layers are intentionally compact point or H3 aggregate payloads, while the heavier polygon sources live in `data/` and can support the next build step.

## Current Browser-Facing Inputs

| Layer | Path | Records | Current assignment method | Geometry in browser payload | Main caveat |
| --- | --- | ---: | --- | --- | --- |
| NC block H3 aggregate | `public/derived-data/census-h3/census-blocks-37-r7-2020.json` | 25,956 H3 cells | Census block internal points assigned to H3 resolution 7 before browser load | No polygon geometry; H3 cell center and H3 id only | Point aggregate, not polygon apportionment |
| NC block point source | `public/data/census/census-blocks-37-2020.json` | 236,638 blocks | TIGER `INTPTLAT20` / `INTPTLON20` joined to Census PL 94-171 rows | No polygon geometry; lat/lng point records | Internal points preserve totals but do not split blocks crossing H3 cells |
| NC VEST precinct point layer | `public/data/precincts-nc-2020.json` | 2,662 precinct records | VEST precinct polygon centroid assigned to H3 in-browser | No polygon geometry; lat/lng point records | Centroid assignment can misplace votes for large, noncompact, or split precincts |
| NC county point layer | `public/data/counties-nc-2020.json` | 100 counties | Census Gazetteer county centroid assigned to H3 in-browser | No polygon geometry; lat/lng point records | Coarse orientation layer only; not suitable for fine spatial claims |
| District heat | `public/data/districts-votes-2020.json` | 441 congressional district features | County centroids spatial-joined to 118th Congress districts | Polygon/MultiPolygon district geometry with county-derived votes | Not precinct-to-district aggregation; split counties are approximated |
| 118th Congress enacted plan | `public/data/plans/us-congress-118-enacted.json` | 441 district features | Plan overlay; selected H3 centers tested inside plan polygons | Polygon/MultiPolygon district geometry | Baseline plan package, not an alternative proposal |
| NC 2022 court interim plan | `public/data/plans/nc-2022-court-interim-congressional.json` | 14 district features | Plan overlay; selected H3 centers tested inside plan polygons | Polygon district geometry | Plan overlay only; comparisons still need separate aggregation |

## Local Polygon Sources Available For Audit

| Source | Path | Records | CRS | Geometry types | Relevant fields | Audit readiness |
| --- | --- | ---: | --- | --- | --- | --- |
| NC VEST 2020 precinct shapefile | `data/nc/nc_2020.shp` plus sidecar files | 2,662 | EPSG:2264 | Polygon, MultiPolygon | `PREC_ID`, `ENR_DESC`, `COUNTY_NAM`, `COUNTY_ID`, `G20PREDBID`, `G20PRERTRU` | Ready for precinct polygon-to-H3 vote apportionment after reprojection to WGS84 or an equal-area working CRS |
| NC TIGER 2020 tabulation blocks | `data/census/tiger/tl_2020_37_tabblock20.zip` | 236,638 | EPSG:4269 | Polygon, MultiPolygon | `GEOID20`, `COUNTYFP20`, `TRACTCE20`, `BLOCKCE20`, `ALAND20`, `AWATER20`, `INTPTLAT20`, `INTPTLON20` | Ready for block polygon-to-H3 population apportionment once joined to PL 94-171 attributes |
| NC block PL 94-171 joined point records | `public/data/census/census-blocks-37-2020.json` | 236,638 | lat/lng point records | None | `geoid`, demographic totals, VAP fields, race/ethnicity fields | Attribute table is ready; needs join back to `GEOID20` polygons for apportionment |
| Plan registry GeoJSON | `public/data/plans/*.json` | 441 enacted features; 14 NC court-plan features | WGS84 GeoJSON | Polygon, MultiPolygon | `plan_id`, `district_id`, `GEOID`, `name`, `source`, `cycle`, optional population | Ready for overlay and center-point coverage checks; not itself a replacement for block/precinct apportionment |

## Current Assignment Mechanics

### Blocks

The block pipeline is:

1. `scripts/build-census-blocks.py` downloads Census PL 94-171 rows and TIGER 2020 block polygons.
2. It reads TIGER `INTPTLAT20` / `INTPTLON20` internal points, or falls back to a representative point if needed.
3. It writes block point records to `public/data/census/census-blocks-37-2020.json`.
4. `scripts/build-census-h3.mjs` assigns each block point to an H3 cell using `latLngToCell(lat, lng, 7)`.
5. `scripts/census-h3-helpers.mjs` sums population and demographic fields into H3 records.
6. The browser loads only the compact H3 aggregate, not the 142 MB block point source or 202 MB TIGER zip.

The manifest confirms totals are preserved by the point aggregate:

| Field | Input total | H3 output total |
| --- | ---: | ---: |
| Total population | 10,439,388 | 10,439,388 |
| Voting-age population | 8,155,099 | 8,155,099 |
| Black alone population | 2,140,217 | 2,140,217 |
| Hispanic or Latino population | 1,118,596 | 1,118,596 |
| Non-Hispanic white alone population | 6,312,148 | 6,312,148 |

### Precincts

The precinct pipeline is:

1. `scripts/build-all-precincts.py` downloads VEST 2020 precinct shapefiles from Harvard Dataverse.
2. It reprojects each state to EPSG:4326.
3. It computes each precinct polygon centroid.
4. It writes point records with Biden, Trump, and total presidential vote fields.
5. The browser assigns each precinct point to the selected H3 resolution using `latLngToCell`.

For North Carolina, the app-facing layer contains 2,662 point records and 5,443,067 two-party presidential votes.

### Counties

The county pipeline is:

1. `scripts/build-data.py` reads MIT Election Data and Science Lab county presidential returns.
2. It joins county results to Census Gazetteer county coordinates.
3. It writes year-specific county point records.
4. The browser assigns county points to H3 in the same way as precinct points.

This is useful for broad historical orientation, but it is too coarse for the centroid shortcut audit except as a known lower-quality baseline.

### District Heat

`scripts/build-district-votes.py` spatial-joins county centroid point records to 118th Congress district polygons. This produces `public/data/districts-votes-2020.json`.

This layer should stay excluded from centroid shortcut validation except as a caveat example. It is county-derived district heat, not precinct-to-district or block-to-district aggregation.

## Caveats That Must Travel With The Audit

- Current block H3 values use block internal points, not polygon-to-H3 apportionment.
- Current precinct H3 values use precinct centroids, not polygon-to-H3 apportionment.
- Current county layers use county centroids and are orientation-only for this audit.
- H3 cells are equal-ish area, not equal population; population-weighted summaries must remain separate from raw hex counts.
- Area-weighted polygon apportionment is a first audit step, but population-aware apportionment is better where block populations or precinct votes are spatially uneven inside large polygons.
- Block polygons and precinct polygons are in different CRSs (`EPSG:4269` for TIGER blocks, `EPSG:2264` for NC VEST precincts), so the apportionment step should explicitly choose its working CRS.
- Geometry repair/topology validation may be needed before intersection. MultiPolygons, coastal water, holes, slivers, and invalid geometries should be logged rather than silently dropped.
- Browser payload size should not include raw block or precinct polygons. The apportionment audit should generate compact derived artifacts and keep raw geometries as build inputs.

## Recommended Inputs For The Next Checkpoint

Use two bounded test areas:

1. One county with moderate size and manageable geometry count, such as Alamance County (state+county prefix `37001` / county FIPS `001`) or another county already used in local build tests.
2. One urban/suburban region with more complex precinct/block geometry, preferably around Mecklenburg or Wake once a named selection is defined.

For the first method pass, compute both:

- Census block population: internal-point H3 assignment vs polygon-to-H3 area-weighted apportionment.
- VEST precinct votes: centroid H3 assignment vs polygon-to-H3 area-weighted apportionment.

The audit should report deltas by H3 cell and by selected region:

- Total population delta
- Voting-age population delta
- Race/ethnicity field deltas
- Democratic vote delta
- Republican vote delta
- Two-party vote-share delta
- H3 cell count changed
- Number of source polygons split across more than one H3 cell

## Checkpoint Result

This checkpoint is complete once the next agent can answer three questions without reopening the chat thread:

1. What exact browser-facing inputs use centroid/internal-point assignment today?
2. What local polygon sources can support polygon-to-H3 apportionment?
3. What caveats must be preserved before comparing the two methods?

This document answers those questions and should be used as the source context for the next checkpoint: defining the polygon-to-H3 apportionment method.
