# Honeycombing

Honeycombing is a civic mapping prototype that compares enacted district maps against a neutral hexagonal reference grid ([Uber's H3](https://h3geo.org/)). The grid predates any election and was drawn for logistics, not politics — the product makes the delta between that neutral baseline and real district lines visible. The current app defaults to a North Carolina case study and loads a Census block-derived H3 population layer first, with precinct and county views available as alternate lenses.

**Live demo:** [dalovecompany.com/honeycombing](https://www.dalovecompany.com/honeycombing)

**Headline finding (NC case study):** 4 of 14 districts lean Democratic under North Carolina's 2023 enacted congressional map — 94.5% of 5,000 neutral simulated maps produce more (ALARM ensemble, 2020 presidential vote proxy; 2.8th percentile, ensemble median 6). This is a diagnostic position inside a documented simulated distribution — not a seat forecast and not legal evidence. Method and derivation: `docs/research/outputs/headline-finding/nc-headline-finding.md`.

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

## Expert Handoff Packet

The `/about` white-paper page now opens with an expert review packet. It frames Honeycombing as a diagnostic visual audit, lists the surfaces that are ready for critique, separates known non-court-grade shortcuts, and names the questions we want a redistricting lawyer, election-data practitioner, or research group to answer.

Current reviewer-facing status:

- Ready to review: NC block-derived H3 default, Block/Precinct/County controls, plan-registry overlays, plan comparison panel, and provenance/caveat surfaces.
- Known limits: centroid/internal-point assignments, county-derived district heat, no CVAP/RPV/VRA analysis, no COI or ensemble pipeline, and no formal diagnostic score yet.
- Recommended next objective: build an NC case-study stats packet that compares the block H3 layer, selected regions, enacted boundaries, and court-plan overlays with clearly labeled caveats.

## Data Sources

- County presidential returns: MIT Election Data and Science Lab county presidential data, 2000-2024.
- Precinct presidential returns: VEST 2020 precinct shapefiles via Harvard Dataverse.
- Congressional districts: 118th congressional district boundary data.
- Census blocks: Census 2020 PL 94-171 API joined to TIGER/Line 2020 tabulation block geometry for North Carolina.
- Redistricting ensemble: ALARM Project 50-State Redistricting Simulations, NC 2020 congressional cycle (Harvard Dataverse, doi:10.7910/DVN/SLCD3E, CC0) — 5,000 SMC-sampled plans normalized into the app's ensemble registry.

## Data Scripts

- `scripts/build-data.py`: builds county-level election point data.
- `scripts/build-all-precincts.py`: builds national and per-state VEST 2020 precinct point files.
- `scripts/build-district-votes.py`: aggregates county-derived vote totals into congressional districts.
- `scripts/build-census-blocks.py`: builds county/state Census block demographic point slices.
- `scripts/build-census-h3.mjs`: builds the app-facing H3 aggregate from the raw Census block slice and writes a manifest.
- `scripts/build-nc-starter-pack.mjs`: builds the compact North Carolina handoff packet from the tracked H3, precinct, county, district-heat, and plan-registry artifacts.
- `scripts/build-headline-finding.mjs`: derives the demo's headline finding (2023 enacted plan vs the ALARM ensemble seat distribution) from the normalized ensemble payload, recomputing every number so the headline card can never drift from its source data.

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

Tracked app payloads should be compact, documented, and useful without private setup. Raw downloads, TIGER files, Census county slices, national precinct dumps, and other bulky rebuildable inputs stay ignored under `data/` or `public/data/`. The current tracked public-data exception is `public/data/plans/`, because the plan registry is small enough to review and is part of the app-facing product contract.

## Plan Registry

Plan imports start as local/public-data registry entries rather than browser uploads. The registry lives at `public/data/plans/registry.json`; each entry points to a normalized GeoJSON FeatureCollection under `public/data/plans/`. Every plan feature must carry `plan_id`, `district_id`, `GEOID`, `name`, `source`, and `cycle`.

Current packaged plans:

- `public/data/plans/us-congress-118-enacted.json`: normalized 118th Congress baseline from Census congressional district boundaries.
- `public/data/plans/nc-2022-court-interim-congressional.json`: North Carolina congressional plan ordered by the NC Courts on February 23, 2022, sourced from the NC General Assembly 2022 redistricting process shapefile.
- `public/data/plans/nc-2023-enacted-congressional.json`: North Carolina 2023 enacted congressional plan (SL 2023-145), used in the 2024 election, sourced from the NC General Assembly.

## Layer Model

The map currently has functional controls for:

- Case study: North Carolina by default
- Headline finding banner: the enacted-plan-vs-ensemble stat rendered above the map, with a method/provenance detail card and a standing link to `/limits`
- Granularity: Block, Precinct, County
- Layer A: regional H3 grid
- Layer B: detail H3 grid
- Plans quick panel: enacted district outlines, clearly labeled county-derived district heat fill, local plan-registry toggles, layer provenance, and the draft alternative-plan import schema
- Plan comparison panel: active plan metadata, district count, total population where present, and selected-H3 center coverage for region selections
- NC starter packet: white-paper handoff section with statewide block/H3 stats, precinct/county vote signals, district heat caveat, and enacted-vs-court plan coverage checks
- Data provenance panel with source/method/caveat metadata and manifest details for derived Census layers

The research-layer catalog also exposes planned slots for:

- Alternative plan overlays
- Community-of-interest overlays
- Ensemble summaries
- Census block-derived population/demographic layers
- VRA opportunity layers

Those planned layers are visible but disabled until their ingestion and rendering pipelines exist.

## Licensing

- **Code:** [Apache-2.0](LICENSE).
- **White paper, research reports, and derived data artifacts:** [CC BY 4.0](LICENSE-DOCS).
- Upstream data sources retain their own licenses and must be credited independently (see Data Sources above).
