# ROADMAP — Honeycombing

## STATUS 2026-07-18 — T4.2 shipped: the hex grid now touches the headline (H3 divergence localization)

- **The differentiating feature is built.** Until now the hex grid did not touch the headline number (the red-team's lens-4 gap: "a banner quoting ALARM plus a vote chart"). The ensemble is now projected onto the H3 grid to show *where* the enacted 2025 map (SL 2025-95) diverges from the 5,000 neutral simulated plans. `scripts/build-ensemble-h3-localization.py`: for each populated r7 cell, take the 2020-presidential Democratic share of its containing district, build that value's distribution across the 5,000 draws (from the extracted plan-assignment matrices + ALARM's per-precinct pre_20 returns — no stats CSV), and locate the enacted 2025 map within it. Reduction: computed once per precinct (2666×5000), inherited by each cell. Four hard gates (GEOID order, matrix dims/labels, 3 D seats, 99.3% cell coverage).
- **Finding:** of 25,956 populated cells, **2,531 (1.42M people, 13.6%) fall in the low-outlier band** — placed in a more Republican-leaning district than ≥95% of neutral plans (consistent with cracking, *not a finding of it*) — and **2,599 (2.05M, 19.6%) in the high-outlier band** (consistent with packing). The 5,130 tail cells (<p5 / >p95, exactly the UI's low_outlier/high_outlier bands) ship as a servable sidecar `nc-congress-2020-alarm-h3.json`, lazy-loaded by an opt-in "Localize on H3 grid" sub-toggle in the ensemble panel.
- **Claim discipline:** the measure is the *containing district's* aggregate lean projected onto the cell, never the residents' own vote/representation (ecological). Methods auditor recomputed all 8 numbers exact (12/12 cell spot-checks) and caught mechanism-verb overclaim ("dilution"/"cracking signature") in an earlier draft — stripped to hedged "consistent with" phrasing before ship. Tag `descriptive_with_assignment_caveat`.
- **Verified:** build passes, 50 tests + lint + typecheck green, Playwright QA at 390/820/1440 all render the overlay (234→5,378 leaflet paths) with zero console errors. Retires the ensemble payload's "No H3 cell-level measure yet" caveat.
- **Next on this track:** rank-matched *district* unit measure for the 2025 plan (payload caveat #5, still open); draft→published promotion still gated on expert review; consider lazy-loading only the low-outlier (cracking) tail as a lighter default.

## STATUS 2026-07-18 — T2.1 closed: enacted maps scored under all 10 statewide proxies

- **Red-team's highest-value open measurement is closed.** `scripts/score-enacted-maps-proxies.py` re-places both enacted NC maps under all ten ALARM statewide proxies from ALARM's own `NC_cd_2020_map.rds` (single provenance; 99.96% CRS calibration vs `cd_2020`; presidential reproduces the headline 3/4 as a hard gate). Both maps hold at their presidential-proxy seat count under every 2020-cycle proxy (2025→3, 2023→4); only cross-cycle exception is 2025→5 under 2016 SoS. Methods auditor: SHIP. Blunts T2.2 (presidential is the 2023 map's thinnest 4th-seat margin). Retires the "scored only under presidential" caveat.

## STATUS 2026-07-17 — P1 closed: SL 2025-95 ingested, headline now describes the map in force

- **The audit's top finding is resolved.** NC's October 2025 mid-decade redraw (SL 2025-95, enacted 2025-10-22, in force for the 2026 election) is ingested into the plan registry (`scripts/import-nc-2025-congressional-plan.py`, NCGA shapefile) and wired through the full pipeline: asymmetry diagnostics → ALARM ensemble compared-plans → headline finding.
- **New headline (auditor-gated before deploy):** "3 of 14 districts lean Democratic under the congressional map North Carolina adopted in October 2025 for its 2026 election — 99.9% of 5,000 neutral simulated maps produce more." Only 3 of 5,000 simulated plans produce as few Democratic-leaning seats; none produce fewer (0th mid-percentile; ensemble median 6; matches the ensemble's minimum observed seat count). Closest district to the seat threshold is 3.4pp away vs 0.12pp calibration error, so the seat count is robust to the centroid shortcut at district level. The SL 2023-145 map (2024 election, 4 seats @ p2.8) is retained as dated context in the payload's `mapStatusNote`, README, and WHITEPAPER §5.5.
- **Retrospective → newsworthy:** the demo now diagnoses the map voters will use in November 2026.

## STATUS 2026-07-17 — ALARM plan-assignment matrices extracted (pure Python; "needs R" blocker dead)

- **Feasibility flip:** `NC_cd_2020_plans.rds` and `NC_cd_2020_map.rds` are fully readable in pure Python via the `rdata` package — the assignment matrix lives in a `plans` R attribute that data-frame-level readers drop; walking the raw parse tree recovers it. No R toolchain needed.
- **Extraction shipped:** `scripts/extract-alarm-plans.py` → `data/alarm/derived/nc-plans-assignment.bin` (int8, 2,666 precincts × 5,001 draws, column 0 = `cd_2020` reference) + manifest with GEOID row order and provenance. Four hard gates, all passed: dims, reference alignment vs the map's `cd_2020`, **exact population closure for every one of 5,001 draws**, complete district labels. Report: `docs/research/outputs/alarm-ensemble/nc-plans-matrix-extraction.md`.
- **Bonus:** the map file carries per-precinct returns for eight statewide races (Senate/governor/AG, 2016+2020) — proxy-robustness checks for the headline stat before congressional returns are ingested.
- **Now unblocked (next):** the h3-keyed ensemble unit measure (schema doc Objective 3 remainder) and divergence *localization* — where the 2023 enacted plan departs from the simulated distribution, feeding the "next headline" below. Deployed demo unchanged by this work.

## STATUS 2026-07-17 — four-agent share-readiness audit; three DoD items closed

- **Audit:** four independent auditors (methodology, code/repo hygiene, Playwright QA, industry positioning) reviewed the project. Methodology: the headline stat was independently recomputed from the raw ALARM CSV — every number confirmed exact; it agrees with Duke Quantifying Gerrymandering's independent ensemble and the actual 2024 outcome (10R–4D, NC-01 the only close seat); under ALARM's multi-election composite only 0.1% of plans produce ≤4 D seats, so the presidential proxy is the conservative choice. Repo hygiene: clean (identity, secrets, tracked-vs-ignored, deploy config).
- **Shipped this pass:** map header made horizontally scrollable (all controls now reachable at 390/820px; fits untruncated at 1440 — Playwright-verified); the nine NC lens payloads (`precincts-nc-2020`, `counties-nc-<year>` ×7, `congressional-districts-2022`, `districts-votes-2020`, ~3.4 MB) are now tracked with the README data policy amended, so a fresh clone renders every layer the demo shows; **REPRODUCE.md + DATA.md written** — the two pending DoD items below are closed.
- **Top open finding (P1): the headline describes a superseded map.** NC enacted a mid-decade congressional redraw in October 2025 for the 2026 cycle (federal courts declined to block; *Williams v. Hall* dismissed Jan 2026). Rephrase the banner to name the 2024 election cycle, add a dated note, ingest the Oct 2025 plan into the registry, and rerun `build:headline-finding` (same 14-district 2020-cycle ensemble; pipeline applies unchanged). → **CLOSED later the same day; see the P1 status block above.**
- **Then:** expert-review emails to the ALARM team and Duke QG (the draft→published promotion gate the ensemble payload defines for itself); publish a proxy-sensitivity table (pre_20 vs multi-election composite); pin ALARM inputs (checksums) and move compared-plan seat counts to the exact-assignment matrices (extraction above); polish tier — percentile-convention footnote, "neutral" wording, mobile provenance-aside occlusion, /about mobile header + TOC.

## STATUS 2026-07-08 — first headline finding shipped (local commits, not yet deployed)

*(Historical: the banner text below describes SL 2023-145 and was superseded by the 2026-07-17 P1 block above.)*

- **Headline finding:** the demo now states a conclusion instead of only offering exploratory layers. Finding banner on the map view: "4 of 14 districts lean Democratic under North Carolina's 2023 enacted congressional map — 94.5% of 5,000 neutral simulated maps produce more." Ensemble median 6; enacted plan at the 2.8th percentile (low outlier under `classifyEnsemblePercentile`); ALARM 50-State Simulations, 2020 presidential proxy.
- **Pipeline:** `npm run build:headline-finding` → `public/data/case-studies/nc-headline-finding.json`, derived entirely from the normalized ALARM ensemble payload; `scripts/headline-finding.test.mjs` recomputes the stat and fails on drift. Derivation report: `docs/research/outputs/headline-finding/nc-headline-finding.md`. Banner links "method" (provenance + caveats card) and `/limits`.
- **Honesty posture:** diagnostic position inside a documented simulated distribution — presidential proxy, draft ensemble status, no intent/legality claim. The `/limits` "Ensemble percentiles are not intent" section covers exactly this stat.
- **Next headline:** when precinct-level congressional results land in the H3 layer, graduate the stat from the presidential proxy to observed congressional votes; ingest ALARM's plan-assignment matrices (`NC_cd_2020_plans.rds`) to localize *where* the enacted plan diverges from the ensemble, not just how much.

## STATUS 2026-07-06 — public demo live, share-readiness in progress

- **Live demo:** `dalovecompany.com/honeycombing` (static Vercel build behind the dalove proxy; the earlier `honeycombing.` subdomain was dropped and has no DNS; raw census inputs and bulk build inputs are excluded from deploys via `.vercelignore`). The `/about` white paper and `/limits` page are public-facing documents.
- **Landing posture:** live demo + public repo. Licenses: Apache-2.0 (code), CC-BY-4.0 (white paper + derived data).
- **Share-readiness definition of done:** a stranger can use the demo (including mobile), understand the method, reproduce the NC result (REPRODUCE.md + DATA.md — shipped 2026-07-17), and know what not to conclude (`/limits`). COI/VRA work is explicitly out of this pass.


## Core Algorithm Insight (Apr 3 2026)
Adaptive resolution hex-districts: instead of picking one H3 resolution, walk up/down the hierarchy until each hex-cluster contains roughly the same population as a standard congressional district (~760k). Urban areas get small high-res hexes, rural get large low-res hexes — but all end up with equal population. This makes the comparison to gerrymandered districts trivially clear.

## Current Product Frame
Honeycombing is a diagnostic audit layer first and a prescriptive districting research track second. The map should stay uncluttered by default, but expert users should be able to toggle plan overlays, communities of interest, ensemble summaries, Census block population layers, and VRA-related analysis surfaces.

## Phase 0: Research (Current)
- [ ] Deep dive: H3 resolution vs US population density analysis
- [ ] Identify best public datasets (Census PL 94-171 blocks, VEST precinct results, enacted plan boundaries, COI submissions)
- [ ] Survey academic literature on mathematical redistricting
- [ ] Legal landscape: what courts have accepted as gerrymandering evidence
- [ ] Catalog existing tools (MGGG, FiveThirtyEight, Dave's Redistricting)
- [ ] Write the core thesis document / whitepaper outline

## Phase 1: Proof of Concept
- [x] Convert NC from a standalone dataset button into the default case-study preset
- [ ] Map precincts to H3 hexes at multiple resolutions
- [x] Add Census block PL 94-171 import scaffold for county/state slices
- [x] Prototype Census block to H3 population aggregation for North Carolina
- [x] Track app-facing NC Census block-derived H3 artifact with provenance manifest
- [x] Clarify tracked vs ignored data artifact policy
- [ ] Aggregate actual election results into hex grid
- [ ] Compare hex vote signal vs actual districts
- [x] Add initial enacted-plan quick panel for district outlines and district heat
- [x] Define plan-layer provenance and draft GeoJSON import schema
- [x] Add first local/public-data plan registry import path
- [x] Add NC 2022 court-ordered congressional plan as first external registry plan
- [x] Add NC 2023 enacted congressional plan as first genuinely different NC comparison plan
- [x] Add named NC starter selections with local population, vote, and plan-touch stats
- [ ] Add proposed/court/commission plan import support
- [ ] Add initial COI overlay support for imported polygons
- [ ] Visualize the comparison (interactive map)

## Expert Review Objectives

These objectives translate the current outside-review prompts into explicit success criteria and next artifacts.

### 1. Centroid Shortcut Audit

**Objective:** Quantify whether centroid/internal-point assignment is directionally reliable enough for diagnostic use.

**Success criteria:**
- Run centroid assignment and polygon-to-H3 apportionment on at least one NC county or named region.
- Report population, vote-share, and H3-cell assignment deltas.
- Classify each delta as harmless for visual exploration, material for statistics, or disqualifying for legal evidence.

**Roadblocks:** Geometry repair, population-aware allocation, runtime, and browser payload size.

**Next artifact:** Centroid-vs-polygon audit table for one NC county and one urban/suburban region.

### 2. NC Asymmetry Decomposition

**Objective:** Separate visible NC asymmetry into natural political geography, legally required choices, and map-drawing choices that deserve review.

**Success criteria:**
- Compare statewide vote signal, H3 vote concentration, enacted district signal, and NC court-plan signal.
- Identify competitive, packed, and cracked districts or regions under the diagnostic lens.
- Label each claim as descriptive, ensemble-dependent, or requiring legal/election-expert validation.
- Import at least one genuinely different NC plan so the packet can compare boundary choices rather than only source coverage.

**Roadblocks:** County-derived district heat, presidential vote as proxy, and lack of ensemble baseline.

**Next artifact:** Named NC starter selections with per-region population, precinct signal, 2022 court-plan, and 2023 enacted-plan comparison stats.

### 3. H3 Ensemble Explainer

**Objective:** Use H3 as an explainer layer for ensemble outputs without weakening the ensemble's statistical meaning.

**Success criteria:**
- Define an import schema for ensemble summaries keyed by H3 cell, precinct, or district identifier.
- Render percentile/outlier indicators as a separate toggleable layer.
- Document the ensemble constraints before displaying any outlier claim.

**Roadblocks:** Constraint-sensitive ensembles, inconsistent output formats, and overconfident visual simplification.

**Next artifact:** Ensemble-summary registry schema plus one mocked NC ensemble payload for UI validation.

### 4. COI Fracture Prompt

**Objective:** Make community-of-interest claims inspectable by preserving source metadata and comparing COI polygons against H3, plans, and demographic layers.

**Success criteria:**
- Define a COI GeoJSON registry schema with submitter/source, date, geography type, and caveats.
- Show COI overlays as context without flattening them into a single score.
- For a selected COI, report intersecting districts and H3 demographic or vote-signal summaries.

**Roadblocks:** Subjective boundaries, inconsistent public metadata, geometry quality, and conflicts with VRA or compactness goals.

**Next artifact:** COI registry skeleton and one NC sample COI layer rendered in the Communities panel.

### 5. VRA Boundary Ledger

**Objective:** Turn deviations from the neutral H3 scaffold into a review ledger that separates lawful justification questions from unsupported distortion claims.

**Success criteria:**
- List each selected-region deviation with possible VRA, COI, county/municipal, compactness, or contiguity justification categories.
- Separate demographic screens from VRA conclusions requiring CVAP, RPV, and candidate-of-choice analysis.
- Mark every item as explained, unresolved, needs data, or outside current scope.

**Roadblocks:** CVAP, racially polarized voting evidence, election history, jurisdiction-specific law, and the risk of implying legal conclusions from population composition alone.

**Next artifact:** Deviation-ledger prototype for one NC selection.

### 6. Single-Metric Skepticism

**Objective:** Keep Honeycombing credible by presenting a multi-signal diagnostic report instead of a single dispositive score.

**Success criteria:**
- Define a dashboard vocabulary for population, vote signal, plan coverage, COI, ensemble, and VRA-adjacent evidence.
- Prevent any one metric from being labeled as a legal conclusion or fairness verdict.
- Display conflicting signals instead of averaging them away.

**Roadblocks:** Stakeholder appetite for simple scores, metric gaming, and reviewer overload.

**Next artifact:** Diagnostic-report wireframe for one NC named selection.

## Phase 2: The Comparison Tool
- [ ] Full US coverage (all 50 states)
- [ ] Presets for NC, MD, WI, OH, IL, TX, and one commission-state control
- [ ] Toggleable layers: enacted plans, alternative plans, COIs, ensemble summaries, Census block population, VRA indicators
- [ ] Gerrymandering score: quantified delta between the two systems
- [ ] Drill-down: state → district → neighborhood level
- [ ] Public web app (anyone can explore)

## Phase 2.5: Prescriptive Algorithm Research
- [ ] Build H3 adjacency graph from Census block population and precinct election data
- [ ] Define hard constraints: equal population, contiguity, district count, state boundary, VRA opportunity requirements
- [ ] Define soft criteria: compactness, county/municipal splits, COI preservation, partisan fairness, competitiveness, minimal scaffold deviation
- [ ] Generate many valid plans rather than one canonical map
- [ ] Compare enacted maps to generated plan families

## Phase 3: Policy & Advocacy
- [ ] Whitepaper for redistricting commissions
- [ ] Legal brief template (how to use hex analysis in court)
- [ ] API for researchers and journalists
- [ ] Partnership outreach: Princeton Gerrymandering Project, Brennan Center, etc.
- [ ] Open source everything
