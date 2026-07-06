# ROADMAP — Honeycombing

## STATUS 2026-07-06 — public demo live, share-readiness in progress

- **Live demo:** `honeycombing.dalovecompany.com` (static Vercel build; raw census inputs and bulk build inputs are excluded from deploys via `.vercelignore`). The `/about` white paper and `/limits` page are public-facing documents.
- **Landing posture:** live demo + public repo. Licenses: Apache-2.0 (code), CC-BY-4.0 (white paper + derived data).
- **Share-readiness definition of done:** a stranger can use the demo (including mobile), understand the method, reproduce the NC result (REPRODUCE.md + DATA.md — pending), and know what not to conclude (`/limits`). COI/VRA work is explicitly out of this pass.


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
