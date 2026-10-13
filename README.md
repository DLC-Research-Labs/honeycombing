# Honeycombing

Honeycombing is a civic mapping prototype that compares enacted district maps against a fixed hexagonal reference grid ([Uber's H3](https://h3geo.org/)). The grid predates any election and was drawn for logistics, not politics; it is the app's visualization substrate, not a fairness algorithm or a districting method. The comparison baseline is a published redistricting *ensemble* — thousands of maps simulated under documented constraints — and the hex grid is how the app shows where a plan and that ensemble disagree.

The app opens in **Guided** mode: a four-step North Carolina walkthrough (what changed → how unusual is it under this comparison → where does it show up → what can't we conclude), each step driving real map layers and carrying its own limitation and source. **Expert** mode holds the full research workbench — election years, Block/Precinct/County granularity, view presets, named review regions, region selection, plan/community/ensemble panels, and layer settings. Nothing is removed by Guided mode; it is one switch in the header.

**Live demo:** [dalovecompany.com/honeycombing](https://www.dalovecompany.com/honeycombing) — the deployed build can lag this repository. The Guided/Expert split and the OpenStreetMap background map described below are in the repo and **not yet deployed**.

**Headline finding (NC case study):** 3 of 14 districts lean Democratic under the congressional map North Carolina adopted in October 2025 for its 2026 election (SL 2025-95) — 99.9% of 5,000 neutral simulated maps produce more; only 3 of 5,000 produce as few, none fewer (ALARM ensemble, 2020 presidential vote proxy; ensemble median 6). The SL 2023-145 map it replaced, used in the 2024 election, had 4 Democratic-leaning districts at the 2.8th percentile of the same ensemble. This is a diagnostic position inside a documented simulated distribution — not a seat forecast and not legal evidence. Method and derivation: `docs/research/outputs/headline-finding/nc-headline-finding.md`.

**What this is not:** a diagnostic prototype, not legal evidence. Nothing here demonstrates illegal intent or legal injury, hex counts are not a seat measure, and the known methodological shortcuts are disclosed rather than hidden. Read [/limits](https://www.dalovecompany.com/honeycombing/limits) before citing any number, and the white paper at [/about](https://www.dalovecompany.com/honeycombing/about) for the full method.

## Run the App

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm test
npm run lint
npm run build
```

`npm test` runs the Node test runner over `scripts/*.test.mjs`, which import the app helpers directly: UI/registry helpers (`honeycomb-ui-helpers.test.mjs`), the headline finding recomputed from the ensemble payload (`headline-finding.test.mjs`), the guided walkthrough narrative and layer directives (`guided-walkthrough.test.mjs`), the background-tile provider and status wording (`basemap.test.mjs`), and the Census H3 builder helpers. Browser behaviour (mounted layers, pixels, touch layout) is not covered by these tests and needs a run of the app.

## Expert Handoff Packet

The `/about` white-paper page now opens with an expert review packet. It frames Honeycombing as a diagnostic visual audit, lists the surfaces that are ready for critique, separates known non-court-grade shortcuts, and names the questions we want a redistricting lawyer, election-data practitioner, or research group to answer.

Current reviewer-facing status:

- Ready to review: the guided NC walkthrough and its claim wording, the block-derived H3 default layer, Block/Precinct/County controls, plan-registry overlays, the ensemble explainer (seat distribution, district bands, H3 divergence localization), and the provenance/caveat surfaces.
- Known limits: centroid/internal-point assignments rather than polygon apportionment; county-derived district heat; a 2020 presidential partisan-lean proxy rather than congressional results; no CVAP, racially polarized voting, or VRA analysis; no formal diagnostic score. **No ensemble is generated here** — the app normalizes the published ALARM ensemble, and that payload is status `draft` pending expert review. The only community-of-interest payload is a clearly labeled fictional sample whose fracture numbers are gate-blocked.
- Recommended next objective: expert review of the ensemble consistency checks (the draft→published gate the payload defines for itself), then a real community-of-interest payload.

## Data Sources

- County presidential returns: MIT Election Data and Science Lab county presidential data, 2000-2024.
- Precinct presidential returns: VEST 2020 precinct shapefiles via Harvard Dataverse.
- Congressional districts: 118th congressional district boundary data.
- Census blocks: Census 2020 PL 94-171 API joined to TIGER/Line 2020 tabulation block geometry for North Carolina.
- Redistricting ensemble: ALARM Project 50-State Redistricting Simulations, NC 2020 congressional cycle (Harvard Dataverse, doi:10.7910/DVN/SLCD3E, CC0) — 5,000 SMC-sampled plans normalized into the app's ensemble registry.
- Background map tiles: [OpenStreetMap](https://www.openstreetmap.org/copyright) standard raster tiles, © OpenStreetMap contributors, used under the [OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/) — a best-effort public service with no uptime guarantee. Provider wiring is isolated in `app/lib/basemap.ts`: one URL template, its attribution, and a tile-status helper. The map renders the attribution link visibly and shows a plain notice when tiles fail instead of pretending the background is fine. No key, account, prefetching, or bulk downloading is involved.

## Data Scripts

- `scripts/build-data.py`: builds county-level election point data.
- `scripts/build-all-precincts.py`: builds national and per-state VEST 2020 precinct point files.
- `scripts/build-district-votes.py`: aggregates county-derived vote totals into congressional districts.
- `scripts/build-census-blocks.py`: builds county/state Census block demographic point slices.
- `scripts/build-census-h3.mjs`: builds the app-facing H3 aggregate from the raw Census block slice and writes a manifest.
- `scripts/build-nc-starter-pack.mjs`: builds the compact North Carolina handoff packet from the tracked H3, precinct, county, district-heat, and plan-registry artifacts.
- `scripts/build-headline-finding.mjs`: derives the demo's headline finding (2025 enacted plan, SL 2025-95, vs the ALARM ensemble seat distribution) from the normalized ensemble payload, recomputing every number so the headline card can never drift from its source data.

Example Census block dry run:

```bash
python3 scripts/build-census-blocks.py --state 37 --county 001 --dry-run
```

Example Census block import for Alamance County, North Carolina:

```bash
python3 scripts/build-census-blocks.py --state 37 --county 001
```

The Census block script writes `public/data/census/census-blocks-{state}-{county}-2020.json`, `public/data/census/census-blocks-{state}-2020.json`, and a state manifest. It downloads the full state TIGER tabulation-block zip into `data/census/tiger/`, so full-state or national imports should be treated as build artifacts, not hand-edited source files.

Build the North Carolina app-facing Census H3 layer:

```bash
npm run build:census-h3 -- --state 37 --year 2020 --resolution 7
```

The app loads `public/derived-data/census-h3/census-blocks-37-r7-2020.json`. That tracked file is a compact H3 r7 aggregate of the raw NC Census block point slice: 236,638 source blocks become 25,956 H3 cells, with a manifest at `public/derived-data/census-h3/census-blocks-37-r7-2020.manifest.json`. The raw Census/TIGER files remain ignored build artifacts; the derived artifact is the browser payload.

Build the North Carolina starter stats packet:

```bash
npm run build:nc-starter-pack
```

The app reads `public/data/case-studies/nc-starter-pack.json` on the white-paper page. It summarizes the default NC H3 population layer, 2020 precinct and county vote signals, county-derived district heat, enacted district coverage, and NC court-plan coverage with caveats suitable for external review.

Build the North Carolina headline finding:

```bash
npm run build:headline-finding
```

The map view reads `public/data/case-studies/nc-headline-finding.json` and renders it as the Finding banner (with a method/provenance detail card). The artifact is derived entirely from `public/data/ensembles/nc-congress-2020-alarm.json`; `scripts/headline-finding.test.mjs` recomputes the stat from the ensemble payload and fails if the tracked artifact drifts. A human-readable derivation lives at `docs/research/outputs/headline-finding/nc-headline-finding.md`.

## Data Artifact Policy

Tracked app payloads should be compact, documented, and useful without private setup. Raw downloads, TIGER files, Census county slices, national precinct dumps, and other bulky rebuildable inputs stay ignored under `data/` or `public/data/`. Tracked public-data exceptions are files that are part of the app-facing product contract and small enough to review: `public/data/plans/` (the plan registry) and the North Carolina lens payloads the map fetches at runtime — `precincts-nc-2020.json`, `counties-nc-<year>.json`, `congressional-districts-2022.json`, and `districts-votes-2020.json` (~3.4 MB total). With those tracked, a fresh clone renders every layer the live demo shows. Provenance and rebuild instructions for each family live in `DATA.md` and `REPRODUCE.md`.

## Plan Registry

Plan imports start as local/public-data registry entries rather than browser uploads. The registry lives at `public/data/plans/registry.json`; each entry points to a normalized GeoJSON FeatureCollection under `public/data/plans/`. Every plan feature must carry `plan_id`, `district_id`, `GEOID`, `name`, `source`, and `cycle`.

Current packaged plans:

- `public/data/plans/us-congress-118-enacted.json`: normalized 118th Congress baseline from Census congressional district boundaries.
- `public/data/plans/nc-2022-court-interim-congressional.json`: North Carolina congressional plan ordered by the NC Courts on February 23, 2022, sourced from the NC General Assembly 2022 redistricting process shapefile.
- `public/data/plans/nc-2023-enacted-congressional.json`: North Carolina 2023 enacted congressional plan (SL 2023-145), used in the 2024 election, sourced from the NC General Assembly.
- `public/data/plans/nc-2025-enacted-congressional.json`: North Carolina 2025 enacted congressional plan (SL 2025-95, the October 2025 mid-decade redraw, in force for the 2026 election), sourced from the NC General Assembly.

## Guided and Expert modes

One switch in the header, no routing change, no separate state store:

- **Guided (default)** — the four-step NC walkthrough. Step copy and every number are built from `public/data/case-studies/nc-headline-finding.json` by `buildGuidedNarrative` in `app/lib/guided-walkthrough.ts`, so the story cannot drift from the payload; the draft status of the ensemble is stated in the default story, not hidden in an expert corner. Each step resolves a layer directive (`resolveMapLayerDirective`) that the map applies: step 1 draws the examined plan's boundaries, steps 2–4 draw the ensemble percentile bands (always with the method panel open first), step 3 adds the H3 divergence-localization tails and offers region zoom shortcuts. The walkthrough stays on the Census population substrate, so the map is never remounted mid-story and pan/zoom survive.
- **Expert** — the workbench: election years, Block/Precinct/County granularity, the five view presets, the NC starter regions, region selection with CSV/print/share, the data-provenance panel, the Plans/Communities/Ensemble panels, and the layer settings gear. Switching out of Guided keeps the layers currently on screen and adds the controls; switching back re-applies the current step's layers.

## Layer Model

The map currently has functional controls for:

- Case study: North Carolina by default
- Guided walkthrough (default) or the expert headline-finding banner with its method/provenance detail card and a standing link to `/limits`
- Granularity: Block, Precinct, County (expert)
- Layer A: regional H3 grid
- Layer B: detail H3 grid
- Plans quick panel: enacted district outlines, clearly labeled county-derived district heat fill, local plan-registry toggles, layer provenance, and the draft alternative-plan import schema
- Plan comparison panel: active plan metadata, district count, total population where present, and selected-H3 center coverage for region selections
- NC starter packet: white-paper handoff section with statewide block/H3 stats, precinct/county vote signals, district heat caveat, and enacted-vs-court plan coverage checks
- Data provenance panel with source/method/caveat metadata and manifest details for derived Census layers
- Ensemble panel: comparison-universe constraints (shown before any band renders), the simulated seat distribution with each registry plan's position, district percentile bands, the opt-in H3 divergence-localization tails, and the outlier gate that blocks mock or undocumented payloads
- Communities panel: submitter/source provenance first, polygons as context only, fracture readouts gated for sample or synthetic payloads
- Background map: OpenStreetMap raster tiles with visible attribution and a tile-status notice

The research-layer catalog still lists two slots as planned and disabled until their pipelines exist:

- Census block-derived statistics as a research layer entry (the block layer itself ships as the default base dataset)
- VRA opportunity layers — deliberately not implemented; it would require CVAP, racially polarized voting evidence, and jurisdiction-specific legal review

## Licensing

- **Code:** [Apache-2.0](LICENSE).
- **White paper, research reports, and derived data artifacts:** [CC BY 4.0](LICENSE-DOCS).
- Upstream data sources retain their own licenses and must be credited independently (see Data Sources above).
