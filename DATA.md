# Data Provenance

One section per data family: what it is, whether it is tracked in this repo,
where it comes from, its license, which script produces it, and what is wrong
with it. Reproduction paths and the honest list of what cannot be rebuilt yet
live in [REPRODUCE.md](REPRODUCE.md). What no number here can claim is at
[/limits](https://www.dalovecompany.com/honeycombing/limits).

**Licensing split for this repo:** code is Apache-2.0 ([LICENSE](LICENSE));
the white paper, research reports, and derived data artifacts are CC BY 4.0
([LICENSE-DOCS](LICENSE-DOCS)). Upstream datasets retain their own licenses
and must be credited independently, as below.

## ALARM redistricting ensemble (the headline's backbone)

- **What:** 5,000 SMC-sampled NC congressional plans (2020 cycle) from the
  ALARM Project's 50-State Redistricting Simulations, normalized into
  `public/data/ensembles/nc-congress-2020-alarm.json` using ALARM's published
  per-district 2020 presidential vote counts (`pre_20`).
- **Tracked:** the normalized payload, the ensemble registry, and a clearly
  labeled mock fixture (`nc-congress-2020-mock.json`, gate-blocked from the
  headline). The raw CSV (`data/alarm/NC_cd_2020_stats.csv`) is ignored.
- **Upstream:** Harvard Dataverse, doi:10.7910/DVN/SLCD3E, version 15; file
  IDs 6392710 (stats CSV) and 6431354 (codebook HTML). Citation: McCartan et
  al., "50-State Redistricting Simulations"; see also *Scientific Data* 9:689
  (2022).
- **License:** CC0.
- **Producer:** `scripts/build-alarm-ensemble.mjs` (includes a 1pp calibration
  gate against our centroid-assigned shares; observed max delta 0.12pp).
- **Caveats:** payload status is `draft` pending expert review. Uses the 2020
  presidential proxy, not ALARM's multi-election composites and not
  congressional results. Plan assignment matrices (`NC_cd_2020_plans.rds`) are
  not ingested, so there is no H3 cell-level ensemble measure.

## VEST 2020 precinct returns

- **What:** precinct-level 2020 presidential returns as centroid point records
  (`precinct polygon centroid → lat/lng + Biden/Trump/total votes`).
- **Tracked:** `public/data/precincts-nc-2020.json` (2,662 NC precincts) as an
  app-facing lens payload. The other 49 states, the national roll-up, and the
  raw shapefiles stay ignored.
- **Upstream:** Voting and Election Science Team (VEST) 2020 precinct
  shapefiles, Harvard Dataverse doi:10.7910/DVN/K7760H; per-state file IDs are
  hardcoded in the producer script (NC is 11595848).
- **License:** as published on the VEST Dataverse dataset; credit VEST.
- **Producer:** `scripts/build-all-precincts.py` (all-states batch; no
  single-state flag — see REPRODUCE.md).
- **Caveats:** centroid assignment misplaces votes for large, noncompact, or
  split precincts. Our own audits (Alamance, Mecklenburg) rate this
  disqualifying for cell-level evidence: single-cell vote-share errors reach
  9–16pp, washing out to ≤0.12pp at district aggregation.

## MEDSL county presidential returns (2000–2024)

- **What:** county-level presidential returns joined to Census Gazetteer
  county coordinates, producing county point records per election year.
- **Tracked:** `public/data/counties-nc-{2000,2004,2008,2012,2016,2020,2024}.json`
  (NC lens payloads). The raw CSV (`data/countypres_2000-2024.csv`), the
  Gazetteer file (`data/counties_geo.txt`), and national per-year files stay
  ignored.
- **Upstream:** MIT Election Data and Science Lab, County Presidential
  Election Returns, Harvard Dataverse doi:10.7910/DVN/VOQCHQ (our input file
  extends through 2024); Census Gazetteer national counties file for
  coordinates.
- **License:** as published on the MEDSL Dataverse dataset; credit MEDSL.
- **Producer:** partially missing. The committed `scripts/build-data.py`
  writes only a national 2020 file; the NC-filtered per-year variant that
  produced the tracked files was never committed (see REPRODUCE.md).
- **Caveats:** county centroids are a coarse orientation layer only — never
  suitable for fine spatial claims.

## Census PL 94-171 blocks and the derived H3 layer

- **What:** 2020 Census redistricting (PL 94-171) population and demographic
  counts joined to TIGER/Line 2020 tabulation-block internal points, then
  aggregated to H3 resolution 7. This is the app's default NC population layer:
  236,638 blocks → 25,956 H3 cells.
- **Tracked:** `public/derived-data/census-h3/census-blocks-37-r7-2020.json`
  plus a manifest recording method, input SHA-256, and input/output totals
  (which match exactly — the point aggregate preserves every statewide total).
  Raw inputs (~202 MB TIGER zip, ~142 MB block point file under
  `public/data/census/` and `data/census/`) stay ignored.
- **Upstream:** Census 2020 PL 94-171 API (`api.census.gov/data/2020/dec/pl`,
  keyless) + TIGER/Line 2020 tabulation blocks (`www2.census.gov`).
- **License:** U.S. Census Bureau data, public domain.
- **Producers:** `scripts/build-census-blocks.py` (download + join), then
  `npm run build:census-h3 -- --state 37` (`scripts/build-census-h3.mjs`).
- **Caveats:** internal-point assignment, not polygon apportionment — blocks
  crossing H3 cell boundaries are not split. H3 cells are equal-ish area, not
  equal population; hex counts are never a seat measure.

## Plan boundaries (the plan registry)

Tracked under `public/data/plans/` with a registry; every feature carries
`plan_id`, `district_id`, `GEOID`, `name`, `source`, `cycle`.

- **`us-congress-118-enacted.json`** — 118th Congress baseline from Census
  congressional district boundary data (public domain). No committed importer.
- **`nc-2022-court-interim-congressional.json`** — NC congressional plan
  ordered by the NC courts on February 23, 2022, from the NC General Assembly
  2022 redistricting process shapefile (public record). No committed importer.
- **`nc-2023-enacted-congressional.json`** — NC 2023 enacted plan
  (SL 2023-145, used in the 2024 election). Producer:
  `scripts/import-nc-2023-congressional-plan.py`, which downloads directly
  from `ncleg.gov` — the one plan with a fully committed import path.

**Caveats:** plan overlays are geometry only; district vote shares shown with
them come from the separate (and coarser) aggregation layers below.

## Community-of-interest sample (FICTIONAL)

- **What:** `public/data/cois/nc-sample-fictional-crescent.json` — a
  hand-placed polygon crossing the Charlotte-area district seam.
- **This polygon is fictional.** It was not collected from any person or
  portal. It exists solely to validate the COI registry schema, provenance
  fields, and fracture computation before a real submission (RDH/Representable
  or digitized public testimony) lands, and the registry and payload both
  carry gates and caveats saying so. It must never be cited or displayed as a
  real community of interest.
- **Producer:** `scripts/build-sample-coi.mjs` (deterministic literals).
- **License:** ours (CC BY 4.0 derived data); there is no upstream.

## NC lens payloads (district heat and boundaries)

The remaining tracked app payloads, kept as the app-facing product contract:

- **`public/data/congressional-districts-2022.json`** — 118th Congress
  district outlines. Derived from the Census cartographic boundary file
  `cb_2022_us_cd118_500k` (1:500,000; public domain), but **no producer script
  is committed** — the conversion step was never checked in.
- **`public/data/districts-votes-2020.json`** — county-derived 2020 vote heat
  per 118th Congress district (441 features). Producer
  `scripts/build-district-votes.py` exists but reads the boundary shapefile
  from a hardcoded `/tmp` path and an untracked national county file — not
  currently runnable as committed (see REPRODUCE.md).
- **Caveats:** district heat aggregates county centroids into districts, not
  precinct-to-district totals. Split counties are approximated by
  nearest-district assignment. Orientation only.

## What travels with every number

Presidential returns are a partisan-lean proxy, not congressional performance.
No CVAP or racially-polarized-voting analysis is included, so no Voting Rights
Act conclusion can be drawn from anything in this repo. Full derivation of the
headline number: `docs/research/outputs/headline-finding/nc-headline-finding.md`.
