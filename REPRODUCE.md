# Reproducing Honeycombing

This document is the reproduction path for the NC headline finding and an honest
accounting of what a stranger can — and cannot yet — rebuild from this repository.
Companion documents: [DATA.md](DATA.md) (per-dataset provenance and licenses),
[/limits](https://www.dalovecompany.com/honeycombing/limits) (what no number here
can claim), and the derivation report at
`docs/research/outputs/headline-finding/nc-headline-finding.md`.

## Quick start

```bash
git clone <this repo>
cd honeycombing
npm install
npm test        # 50 tests, all offline, including the headline drift-lock
npm run build
npm run dev     # http://localhost:3000/honeycombing (basePath; bare / redirects)
```

Everything the demo shows renders from artifacts tracked in this repository. No
downloads, API keys, or private setup are required to run the app or the tests.

## Reproducing the NC headline finding

The headline: **3 of 14 districts lean Democratic under the congressional map
North Carolina adopted in October 2025 for its 2026 election (SL 2025-95) —
99.9% of 5,000 neutral simulated maps produce more.** Three levels of
reproduction, cheapest first.

### Level 1 — Verify the tracked artifact (seconds)

```bash
npm test
```

`scripts/headline-finding.test.mjs` recomputes every number in the tracked
finding (`public/data/case-studies/nc-headline-finding.json`) from the tracked
ensemble payload (`public/data/ensembles/nc-congress-2020-alarm.json`) — seat
count, median, percentile, plans-above share, and the outlier band — and fails
if the artifact has drifted from its source data. It also asserts the finding
was not built from the mock ensemble and that the claim-discipline caveats are
present.

### Level 2 — Rebuild the finding from the tracked ensemble (seconds)

```bash
npm run build:headline-finding
git diff --stat   # should be empty
npm test
```

`scripts/build-headline-finding.mjs` re-derives the finding from the ensemble
payload. The generation timestamp is stamped, not `new Date()`, so rebuilding
from identical inputs is a no-op diff.

### Level 3 — Full re-derivation from upstream (minutes)

Download the ALARM Project's NC 2020 congressional ensemble (Harvard Dataverse,
doi:10.7910/DVN/SLCD3E, version 15, CC0) — the exact commands
`scripts/build-alarm-ensemble.mjs` prints when the file is missing:

```bash
mkdir -p data/alarm
curl -sL 'https://dataverse.harvard.edu/api/access/datafile/6392710?format=original' -o data/alarm/NC_cd_2020_stats.csv
curl -sL 'https://dataverse.harvard.edu/api/access/datafile/6431354' -o data/alarm/NC_cd_2020_doc.html
```

Then rebuild the ensemble payload, the finding, and re-run the drift-lock:

```bash
node scripts/build-alarm-ensemble.mjs
npm run build:headline-finding
npm test
```

The ensemble build also reads the tracked plan-district diagnostics CSV
(`docs/research/outputs/nc-asymmetry/nc-plan-district-diagnostics.csv`) and
runs a calibration gate: Honeycombing's precinct-centroid district shares for
the 2022 court plan must match ALARM's exact-assignment shares for the same
geometry within 1 percentage point (rank-sorted), or the build fails. The
observed maximum delta is 0.12pp.

**What success looks like** (any deviation means your inputs differ from ours):

| Quantity | Expected |
| --- | --- |
| Ensemble plans | 5,000 |
| Seat histogram (Dem seats → plans) | 3 → 3, 4 → 272, 5 → 1220, 6 → 2269, 7 → 1094, 8 → 142 |
| Ensemble median Democratic-leaning seats | 6 |
| 2025 enacted plan (SL 2025-95) Democratic-leaning seats | 3 of 14 |
| Plans strictly above 3 seats | 4,997 (99.9%) |
| Plans at or below 3 seats | 3 (0.1%) |
| Mid-percentile of the 2025 enacted plan | 0 |
| Band (`classifyEnsemblePercentile`) | `low_outlier` |
| 2023 enacted plan (2024 election) | 4 seats @ 2.8th percentile |
| Calibration max rank-sorted share delta | 0.12pp (tolerance 1pp) |
| 2022 court plan / 118th enacted baseline | 7 seats @ 86.2nd percentile each |

What the percentile does and does not mean is covered at
[/limits](https://www.dalovecompany.com/honeycombing/limits) — it is a position
inside a documented simulated distribution, not evidence of intent or legal
injury.

## What you cannot rebuild yet

We publish our own irreproducibilities the same way we publish our own
disqualifying audit numbers. These tracked artifacts currently lack a clean
committed path from upstream:

| Artifact | Gap | Upstream source |
| --- | --- | --- |
| `public/data/congressional-districts-2022.json` | **No producer script in the repo.** The tracked GeoJSON was derived from the Census cartographic boundary file, but the conversion step was never committed. | Census `cb_2022_us_cd118_500k` (118th Congress, 1:500,000 cartographic boundary shapefile), census.gov cartographic boundary files |
| `public/data/districts-votes-2020.json` | `scripts/build-district-votes.py` exists but reads a **hardcoded local path** (`/tmp/cd_2022/cb_2022_us_cd118_500k.shp`) with no fetch step, and depends on `public/data/precincts-2020.json` (national county file), which is not tracked. | Same Census boundary file + MEDSL county returns (see DATA.md) |
| `public/data/counties-nc-{2000..2024}.json` | **No committed producer.** The committed `scripts/build-data.py` writes only a national 2020 file (`precincts-2020.json`, itself untracked); the NC-filtered, per-year variant that produced these files was never committed. | MEDSL county presidential returns + Census Gazetteer county coordinates (see DATA.md) |
| `public/data/precincts-nc-2020.json` | Rebuildable, but only via `scripts/build-all-precincts.py`, which downloads and processes **all 50 states** (multi-GB, geopandas required) with no single-state flag. | VEST 2020 precinct returns, Harvard Dataverse doi:10.7910/DVN/K7760H (file IDs in the script) |
| `public/derived-data/census-h3/census-blocks-37-r7-2020.json` | Rebuildable end-to-end (`scripts/build-census-blocks.py` then `npm run build:census-h3 -- --state 37`), but the raw inputs are **bulky ignored downloads** (~202 MB TIGER zip, ~142 MB block point file). The tracked manifest records the input's SHA-256 so a rebuild can be checked. | Census 2020 PL 94-171 API + TIGER/Line 2020 tabulation blocks |
| H3 cell-level ensemble measure | **Does not exist.** Requires ALARM's plan assignment matrices (`NC_cd_2020_plans.rds`), which no script ingests yet. | Same ALARM Dataverse dataset |

The headline-finding chain (Level 3 above) is not on this list: it is fully
reproducible from upstream today. The gaps above affect alternate map lenses
(county/precinct/district-heat views), not the headline number.

## Environment

- **Node:** no `engines` field is declared. The test suite imports TypeScript
  from `.mjs` via Node's type stripping, so you need Node ≥ 22.18 (developed on
  Node 25). `npm test` runs `node --test scripts/*.test.mjs`.
- **Python (data rebuilds only):** Python 3 with `geopandas`, `pandas`, and
  `shapely` for the precinct/district/census scripts. Not needed to run the app
  or tests.
- **No API keys.** The Census PL 94-171 queries and all Dataverse downloads are
  keyless.
- **Offline after downloads.** Every build script reads local files; nothing in
  the app or test suite touches the network.
