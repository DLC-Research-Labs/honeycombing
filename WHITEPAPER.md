# Honeycombing: A Neutral Hex Grid Layer for Auditing Redistricting Distortion

**Draft v0.3 - Diagnostic Tool First, Plan Registry Online**

---

## Abstract

We present *Honeycombing*, a browser-based diagnostic method for evaluating redistricting distortion by comparing enacted legislative boundaries against a geometrically neutral reference layer generated from Uber's H3 hierarchical hexagonal grid system. Unlike ensemble methods that ask what many valid maps might look like, Honeycombing asks a narrower visual question: what does the partisan vote signal look like when it is aggregated onto a fixed grid that was not drawn for politics?

Honeycombing does not claim that equal-area H3 cells should replace legal districts. The current tool is an audit and communication layer: it helps researchers, journalists, advocates, and legal practitioners see where official boundaries diverge from geographically coherent voting patterns. A more ambitious future project could use H3 as the starting scaffold for population-balanced, Voting Rights Act-aware, community-sensitive district construction, but that prescriptive version requires additional algorithmic and legal work.

---

## 1. The Problem

### 1.1 What Gerrymandering Does

Gerrymandering is the manipulation of electoral district boundaries to predetermine electoral outcomes. Two primary techniques are used:

- **Packing**: concentrating the opposing party's voters into a small number of districts, where they win by large margins but "waste" votes
- **Cracking**: splitting a natural geographic community of voters across multiple districts, diluting their influence in each

The result: a party can win a majority of seats while losing the popular vote within a state. In North Carolina's 2012 congressional election, Republicans won 9 of 13 seats with 49% of the statewide vote. In Wisconsin's 2012 state assembly election, Republicans won 60 of 99 seats with 48.6% of the vote.

### 1.2 Why Current Remedies Are Insufficient

**Legal challenges** have largely failed in federal court. In *Rucho v. Common Cause* (2019), the Supreme Court held that federal courts cannot review partisan gerrymandering claims because they present a political question. State constitutional litigation, statutory reform, and Voting Rights Act litigation remain active paths.

**Independent redistricting commissions** exist in some states and can reduce partisan abuse, but they still face political pressure, criteria ambiguity, public-input complexity, and litigation risk.

**Existing mathematical measures** such as efficiency gap, compactness scores, partisan symmetry, and ensemble analysis are powerful tools for experts. They are less immediately legible to general audiences, journalists, and courts that need to see where spatial distortion occurs.

### 1.3 The Representational Gap

Using 2020 presidential election data as a proxy for partisan lean, comparing actual 118th Congress district outcomes against a population-proportional expectation:

- Democrats won approximately 52% of the national two-party presidential vote
- Democrats held approximately 213 of 435 House seats in the 118th Congress, or about 49%
- The gap is about 3 percentage points under a simple proportional benchmark

This proportional benchmark is not itself a gerrymandering test. Geography, incumbency, candidate quality, turnout, and district-specific dynamics all matter. Honeycombing instead focuses on a spatial question: where do enacted boundaries cut across, pack, or dilute coherent vote-signal regions when compared with a neutral grid?

---

## 2. The Honeycombing Approach

### 2.1 H3: A Neutral Grid

Uber's H3 geospatial indexing system divides the Earth's surface into a hierarchical grid of mostly hexagonal cells at 16 resolution levels, 0 through 15. Key properties:

- **Pre-existing neutrality**: H3 was designed for logistics and spatial indexing, not electoral advantage.
- **Hierarchical aggregation**: H3 supports aggregation across resolution levels, allowing the same data to be viewed at neighborhood, regional, and national scales.
- **Near-uniform area**: cells at a given resolution are much more spatially comparable than counties or congressional districts, though H3 is not a perfect equal-area projection and includes pentagons required by spherical geometry.
- **Open source**: H3 is freely available, reproducible, and auditable.

At resolution 5, each hex roughly corresponds to a small-to-medium county. At resolution 7, a hex captures a neighborhood or precinct cluster. The appropriate resolution depends on the question being asked and the density of the underlying data.

### 2.2 The Parallel Layer

Honeycombing does not replace existing districts. It creates a *parallel representation* that can coexist with and be compared to the official system.

```text
Gerrymandered reality:          Honeycombing layer:
+------------------+            H H H H H H
|  District 12     |            H H H H H H
|  89% Rep         |   <->      H H H H H H
|  drawn 2021      |            H H H H H H
+------------------+            H H H H H H
```

The delta between the two views helps identify distortion introduced by human-drawn boundaries. On its own, the map does not prove illegal intent or legal injury. It is an exploratory and explanatory layer that can guide deeper statistical, legal, and historical analysis.

### 2.3 Multi-Resolution Aggregation

A key insight is that the same precinct or county result can be aggregated at multiple H3 resolutions. A voter in Philadelphia belongs to a fine-grained local cell, a coarser neighborhood-scale cell, and a still-coarser regional cell.

This is useful for diagnostics because packing and cracking often operate across scales. A city, metro area, county cluster, or neighborhood corridor may each tell a different story. If a pattern appears across multiple resolutions, the analyst can have more confidence that it is not merely an artifact of one aggregation choice.

### 2.4 Population Normalization

A critical design challenge: H3 cells have equal *area*, not equal *population*. A resolution-7 hex in Manhattan may contain many thousands of people; the same hex in rural Wyoming may contain very few.

The current diagnostic tool addresses this through:

1. **Vote-signal rendering**: hexes display partisan lean and competitiveness rather than treating equal-area cells as equal-population districts.
2. **Population-weighted summaries**: selected regions report raw vote totals and vote shares separately from raw hex counts.
3. **Resolution controls**: users can inspect the same data at multiple H3 resolutions to see whether a pattern is robust or an artifact of aggregation scale.

This distinction matters. A hex map is a visual baseline, not a legally valid district plan. Prescriptive redistricting requires equal population, contiguity, state-law criteria, Voting Rights Act compliance, and communities-of-interest analysis.

**Current implementation note.** The North Carolina block view now follows a reproducible derived-data pattern. Raw Census PL 94-171 block point records remain build artifacts, while the browser loads an H3 resolution-7 aggregate with a manifest recording source path, checksum, record counts, and population totals. This makes the default map practical to load while preserving an audit trail. The current method assigns each block's internal point to an H3 cell; a court-grade version should apportion block polygons to intersecting H3 cells where that distinction matters.

### 2.5 Prescriptive Research Track: Adaptive Hex Districts

The more ambitious research track is to use H3 as a starting scaffold for population-balanced district construction. Rather than selecting a single resolution for the entire country, a prescriptive algorithm would group or split cells until each proposed district contains approximately the same population as a standard congressional district.

In principle, urban areas would be represented by smaller high-resolution cell clusters while rural areas would require larger low-resolution clusters. Both would need roughly equal population. The serious version of this project should use two different data substrates at once:

- **Census blocks / PL 94-171 redistricting data** for population equality, race, ethnicity, voting-age population, and VRA analysis.
- **Precincts and election returns** for partisan lean, turnout, competitiveness, and enacted-election performance.

Precincts are the natural unit for election results. Census blocks are the natural unit for legal population balancing. Honeycombing should not collapse those two jobs into one layer. It should map both into H3, preserve provenance, and let the user switch between population, election, legal, and community lenses.

This could make hex-based redistricting more viable, but it is not solved by H3 alone:

- **One person, one vote** requires explicit population balancing, not equal-area cells.
- **Contiguity and compactness** require graph-based clustering and boundary validation.
- **Voting Rights Act compliance** requires racial and electoral performance analysis, including whether protected communities can elect candidates of choice.
- **Communities of interest** require additional civic, demographic, local-government, and public-input data.
- **Legal defensibility** requires explaining which deviations from the neutral scaffold are required by law and which are discretionary.

An eventual adaptive districting algorithm would likely:

1. Convert census blocks into a fine H3 population layer, apportioning block population to intersecting H3 cells when needed.
2. Convert precinct results into an H3 election layer, using precinct centroids for the prototype and polygon-to-hex apportionment for court-grade analysis.
3. Build a graph of adjacent H3 cells with population, election, demographic, municipal, and community-of-interest attributes.
4. Cluster cells into the required number of contiguous districts within strict population tolerances.
5. Apply hard legal constraints first: state boundaries, district count, contiguity, equal population, and VRA opportunity-district requirements.
6. Optimize soft criteria second: compactness, county and municipality preservation, community-of-interest preservation, partisan fairness, competitiveness, and minimal deviation from the neutral H3 scaffold.
7. Generate many valid plans, not one magic answer, so enacted plans can be compared against a transparent family of alternatives.
8. Treat the neutral H3 scaffold as the starting point, then require documented justification for deviations.

This is a separate project from the current diagnostic tool. The current tool is best understood as a neutral audit layer; the prescriptive system would be a full redistricting algorithm.

### 2.6 Research and Industry Overlay Layers

Honeycombing becomes more useful when it can overlay external redistricting artifacts on the same neutral grid. Candidate layers include:

- **Enacted plans**: current congressional, state house, state senate, county, municipal, and school-board boundaries.
- **Alternative plans**: court-drawn maps, commission proposals, party proposals, public submissions, and Districtr exports.
- **Ensemble summaries**: GerryChain or other ensemble outputs showing how often each area appears in a district with a given partisan, racial, or competitiveness profile.
- **Communities of interest**: public COI submissions, municipal regions, tribal areas, school districts, transit corridors, watersheds, and other civic geographies.
- **VRA opportunity layers**: demographic concentration, citizen voting-age population, racially polarized voting analysis outputs, and candidate-of-choice performance estimates.
- **Administrative split layers**: county splits, municipal splits, precinct splits, and compactness or boundary-complexity diagnostics.

These layers should be toggleable, not baked into one composite score. The target expert user needs to ask different questions at different moments: "what is the vote signal?", "what did the enacted map do?", "what do ensembles normally do here?", "does this split a claimed community?", and "is there a lawful VRA reason for the deviation?"

### 2.7 Data Practice Alignment

This architecture mirrors the direction of professional redistricting data work rather than trying to replace it. The [Data and Democracy Lab / MGGG](https://mggg.org/data-practices) emphasizes cleaned geospatial precinct data and documented demographic-category construction. The [Redistricting Data Hub](https://redistrictingdatahub.org/data/about-our-data/) publishes PL 94-171, TIGER, CVAP, legislative-boundary, COI, and public-testimony datasets with metadata and validation reports. The [Princeton Gerrymandering Project](https://gerrymander.princeton.edu/redistricting-report-card-methodology/) compares enacted plans against simulated ensembles and explicitly separates demographic composition screens from full VRA compliance. California's [Statewide Database](https://statewidedatabase.org/redistricting.html) allocates election and registration data to census blocks for redistricting and voting-rights analysis.

For Honeycombing, the lesson is practical: preserve raw source data and provenance, publish compact derived layers for the app, and keep population, election, plan, ensemble, COI, and VRA evidence as separate toggles rather than flattening them into one score.

---

## 3. What the Comparison Reveals

### 3.1 Packed Districts

A packed district appears in the Honeycombing layer as a cluster of deeply colored hexes that corresponds to a single safe district. The hex layer shows a coherent dense community. The district layer shows whether that community has been used up in one safe seat rather than influencing adjacent districts.

### 3.2 Cracked Communities

A cracked community appears as a coherent hex cluster that is visibly split across multiple enacted districts. The diagnostic question is not merely "is the district oddly shaped?" but "does the enacted boundary cut through a coherent vote-signal region in a way that changes representational power?"

### 3.3 The Proportionality Gap

For any selected region, Honeycombing can currently compute:

- **Raw hex signal**: how many visible or selected H3 cells lean Democratic, Republican, or are within a toss-up band.
- **Population-weighted vote signal**: what share of selected two-party votes fall in each partisan direction.
- **Actual district overlay**: how enacted district boundaries intersect the same spatial signal.

This is related to but distinct from the efficiency gap. Rather than counting wasted votes, it asks: *what spatial pattern appears before district lines are imposed, and how do enacted lines alter that pattern?*

#### 3.3.1 National Analysis: 2020 Presidential Data

Using 2020 presidential returns as a partisan lean proxy, we computed population-weighted H3 vote-signal projections at multiple resolutions. The key metric: *what fraction of voters live in H3 cells with a Democratic vs. Republican majority?* This is a signal proxy, not a seat forecast, because H3 cells are not districts and are not equal population.

| Dataset / Method | D proxy (of 435) | R proxy | Toss-up proxy | D% of voters in D-leaning cells |
|---|---:|---:|---:|---:|
| County centroids, H3 Resolution 2 (118 cells) | 252 | 170 | 13 | 58.0% |
| County centroids, H3 Resolution 3 (635 cells) | 258 | 155 | 22 | 59.3% |
| County centroids, H3 Resolution 4 (2,503 cells) | 247 | 169 | 18 | 56.8% |
| VEST precinct centroids, H3 Resolution 2 (157 cells) | 248 | 177 | 9 | 57.1% |
| VEST precinct centroids, H3 Resolution 3 (826 cells) | 239 | 170 | 27 | 54.8% |
| VEST precinct centroids, H3 Resolution 4 (4,482 cells) | 240 | 178 | 17 | 55.1% |
| Popular vote proportional | ~227 | ~208 | - | 52.3% |
| Actual 118th Congress | 213 | 222 | - | 48.9% seats held by Democrats |

**The finding**: the older county-centroid analysis produced a large Democratic-leaning neutral-grid signal. The newer VEST precinct-centroid analysis still shows a Democratic-leaning population-weighted signal, but the effect is smaller and more resolution-sensitive. At H3 resolutions 3 and 4, the precinct analysis produces a D proxy near 239-240 rather than 247-258. Compared with the 213 Democratic seats in the 118th Congress, this suggests a meaningful spatial distortion worth investigating, but it should not be described as a precise 40-45 seat estimate.

Presidential returns are an imperfect proxy for congressional partisan lean. House elections include incumbency effects, local candidates, uncontested races, turnout differences, and district-specific dynamics.

Raw hex counts are also not a seat measure. Democratic voters are geographically concentrated in urban areas while Republican voters are spread across larger rural areas, so equal-area cells systematically undercount dense populations unless summaries are population-weighted.

---

## 4. Design Choices and Open Questions

### 4.1 Diagnostic Tool vs. Proposed Alternative

Two distinct use cases:

1. **Diagnostic**: use H3 to measure and visualize divergence between a neutral spatial signal and enacted districts.
2. **Prescriptive**: use H3 as a scaffold for generating population-balanced district plans.

The diagnostic case is stronger legally and politically. It asks: "where and how does the enacted map diverge from a neutral spatial signal?" Courts, journalists, and researchers can evaluate that question without adopting any particular replacement map.

The prescriptive case is more radical and more fragile. It requires a full redistricting algorithm with population equality, contiguity, VRA compliance, state-law criteria, and communities-of-interest handling.

### 4.2 Communities of Interest

A common objection to algorithmic redistricting is that it may split communities of interest: geographic areas that share economic, cultural, demographic, tribal, municipal, or civic characteristics that should have unified representation.

For the diagnostic tool, H3 does not decide communities of interest; it reveals spatial patterns that can be compared against community claims. For a prescriptive tool, community preservation would need explicit inputs such as municipal boundaries, public testimony, shared infrastructure, school districts, tribal boundaries, economic regions, and demographic data.

### 4.3 The Voting Rights Act

The Voting Rights Act requires that protected minority communities not have their electoral power diluted. Any redistricting framework, including one based on H3, must be evaluated for VRA compliance. In some cases, legally required districts may require boundaries that are not compact or grid-like.

This is not a reason to abandon neutral baselines. It is a reason to distinguish justified deviations from unjustified ones. A strong prescriptive Honeycombing system would show the neutral scaffold, then document where and why legal constraints require departures from it.

### 4.4 Relationship to Existing Approaches

| Approach | Method | Strengths | Limitations |
|---|---|---|---|
| Efficiency Gap | Count wasted votes | Simple, legally cited | Sensitive to landslide elections |
| Compactness scores | Measure shape regularity | Intuitive, long legal history | Does not capture partisan intent by itself |
| MCMC ensemble | Random map sampling | Statistically rigorous | Opaque to non-experts |
| Princeton-style report cards | Multiple public-facing metrics | Interpretable, media-friendly | Baseline depends on generated map universe |
| Honeycombing | Fixed neutral grid comparison | Legible, pre-existing spatial reference | Diagnostic only unless population/VRA/community constraints are added |

Honeycombing is not a replacement for MCMC analysis. It is a complementary visualization and communication layer. The two approaches could be used together: ensemble methods to establish statistical significance, Honeycombing to communicate the spatial pattern visually.

---

## 5. Current Implementation

The Honeycombing tool is a browser-based interactive visualization built with:

- **H3-js**: Uber's JavaScript H3 library for hexagon computation
- **Leaflet**: open-source mapping library
- **Next.js / TypeScript**: web application framework
- **MIT Election Data Science Lab / VEST data**: county-level presidential returns 2000-2024 and 2020 precinct-level presidential returns
- **Census PL 94-171 redistricting data**: North Carolina block population and demographic fields, aggregated into app-facing H3 cells
- **Census Bureau cartographic boundaries**: 118th Congress congressional district boundaries
- **North Carolina General Assembly plan files**: NC 2022 court-ordered congressional plan package

Current features:

- North Carolina opens as the default case study.
- Granularity toggle supports Block, Precinct, and County views, with Block as the default because population and demographic analysis are core to redistricting work.
- The North Carolina block layer loads a compact H3 resolution-7 aggregate with a provenance manifest.
- Multi-resolution H3 grids support zoom-adaptive and manual resolution controls.
- Bivariate encoding can show political lean or demographic concentration as hue, with conviction or concentration represented through saturation and line weight.
- Data provenance is exposed in the interface, including source, method, payload URL, manifest URL where applicable, and caveats.
- The Plans quick panel exposes enacted district outlines, district heat fill, and local plan-registry overlays.
- District heat fill is intentionally labeled as county-derived 2020 presidential signal, not precinct-to-district aggregation or court-grade evidence.
- The plan registry accepts normalized GeoJSON FeatureCollections with `plan_id`, `district_id`, `GEOID`, `name`, `source`, and `cycle` properties.
- The first real external plan overlay is the North Carolina congressional plan ordered by the NC Courts on February 23, 2022 and published by the North Carolina General Assembly.
- The plan comparison panel reports active plan metadata, district count, population total where present, and selected-H3 center coverage against toggled plan geometries.
- The North Carolina starter stats packet summarizes statewide block/H3 population data, 2020 precinct and county vote signals, county-derived district heat, and enacted-vs-court plan coverage checks.
- Region selection reports population-weighted vote summaries and population/demographic totals for selected H3 cells.
- CSV copy, print view, and share-link scaffolding are present but need additional polish before researcher-facing release.

### 5.1 Current Data Maturity

The current app should be described as a diagnostic prototype with a serious provenance spine. It is not yet a court-grade analytical package. The most mature pieces are the layer model, provenance model, North Carolina block-derived H3 layer, and local plan registry. The least mature pieces are precinct-to-district vote aggregation, polygon apportionment, COI overlays, VRA opportunity analysis, ensemble overlays, and formal diagnostic scoring.

This distinction is important for credibility. The project is already useful for visual inspection, public communication, and workflow design. It should not yet be represented as producing legal conclusions, replacement district plans, or statistically validated gerrymandering findings.

### 5.2 Expert Review Packet

The current handoff posture is to ask a qualified reviewer to evaluate Honeycombing as a diagnostic visual audit, not a legal conclusion engine. The app-facing white-paper page now presents a concise review packet before the longer paper.

Surfaces ready for external critique:

- North Carolina Census 2020 block-derived H3 population and demographic layer.
- Block, Precinct, and County granularity controls with dataset-appropriate metrics.
- Local plan-registry overlays for enacted and court plan geometries.
- Plan comparison panel for plan metadata, district counts, population totals, and selected-H3 center coverage.
- Data provenance and caveat surfacing in the UI.

Known limits to keep visible during review:

- Block and precinct assignments currently use internal points or centroids rather than polygon-to-H3 apportionment.
- District heat fill is county-derived and should not be treated as precinct-to-district aggregation.
- CVAP, racially polarized voting, candidate-of-choice, COI, ensemble, and formal VRA workflows are not implemented yet.
- Current comparisons are descriptive and exploratory, not statistically validated legal findings.

The recommended next objective is now to turn the **NC starter stats packet** into a named-selection case study: pick a few legally or politically meaningful North Carolina regions, compare their H3 population layer, precinct signal, enacted boundaries, and court-plan overlay, and keep the caveats explicit enough for a redistricting expert to critique.

### 5.3 North Carolina Starter Stats Packet

The starter packet is generated at `public/data/case-studies/nc-starter-pack.json` from tracked app-facing artifacts. It gives reviewers a compact first-pass data bundle without requiring them to run the app or inspect raw Census and plan files.

Current statewide values:

- 10,439,388 total population and 8,155,099 voting-age population from Census 2020 PL 94-171.
- 236,638 source Census block records aggregated into 25,956 H3 resolution-7 cells.
- 4,127,240 nonwhite residents, or 39.5% of total population.
- 2,662 VEST precinct centroid records with a 2020 two-party presidential signal of D 49.3% / R 50.7%.
- 100 county centroid records with the same broad two-party signal, used only for coarse orientation and district heat.
- 14 county-derived district-heat summaries, explicitly not precinct-to-district aggregation.

Current plan coverage checks:

- The 118th Congress enacted North Carolina districts cover 25,186 of the 25,956 H3 cell centers in the NC block-derived layer, or 97.0%, and touch 14 districts.
- The NC 2022 court-ordered congressional plan covers 25,770 of the 25,956 H3 cell centers, or 99.3%, and touches 14 districts.
- The NC 2023 enacted congressional plan, used for the 2024 election, covers 25,770 of the 25,956 H3 cell centers, or 99.3%, and touches 14 districts.
- These coverage checks are center-point diagnostics, not area or population apportionment.

The packet's immediate value is not proving which plan is better. Its value is making the first outside-review conversation more concrete: here are the population totals, here is the election proxy, here are the plan geometries, here is what the app can compare today, and here are the shortcuts that must be fixed before expert evidence claims.

### 5.4 Disciplined Review Objectives

The outside-review prompts should be treated as objectives with explicit definitions of success:

1. **Centroid shortcut audit**: measure whether centroid/internal-point assignment changes the diagnostic story when compared with polygon-to-H3 apportionment.
2. **NC asymmetry decomposition**: separate political geography, lawful redistricting criteria, and map-drawing choices in the North Carolina case study.
3. **H3 ensemble explainer**: project ensemble outlier summaries onto H3 without weakening the statistical meaning of the ensemble.
4. **COI fracture prompt**: compare public community-of-interest polygons against H3, plan boundaries, and demographic/vote-signal layers.
5. **VRA boundary ledger**: classify visible deviations from the neutral scaffold by possible legal or civic justification, while avoiding VRA conclusions without CVAP, RPV, and candidate-of-choice evidence.
6. **Single-metric skepticism**: design the reporting surface as a bundle of diagnostics rather than a single fairness score.

These are now rendered as expert review objectives in the app-facing handoff page and expanded in `ROADMAP.md`.

### 5.5 Findings Logged During Objective Passes

The first two expert-review objectives have started to convert the caveats above into auditable findings.

**Centroid shortcut audit.** A bounded Alamance County, NC H3 resolution-7 audit compared the current point shortcut against area-weighted polygon-to-H3 apportionment. For Census blocks, internal-point assignment preserved county totals but moved enough cell-level population to classify the shortcut as **material for statistics**. The largest H3-cell total-population delta was 505.62 people, and 1,300 of 3,594 block polygons crossed more than one H3 cell. For VEST precincts, centroid assignment was **disqualifying for evidence without apportionment** in the tested slice: 37 of 38 precinct polygons crossed more than one H3 cell, and the largest H3-cell two-party Democratic vote-share delta was 9.1598 percentage points. The practical result is that point assignment can remain a diagnostic UI shortcut, but statistical or reviewer-facing artifacts should use polygon apportionment.

**NC asymmetry decomposition.** The NC decomposition packet remains an orientation packet rather than a completed legal or statistical finding, but it now contains a genuine alternative-plan contrast. The 2020 VEST precinct-centroid proxy is nearly even statewide, D 49.32% / R 50.68%. At H3 resolution 7, that vote is spatially concentrated: 964 D-leaning cells versus 1,482 R-leaning cells, while 63.54% of Democratic votes fall inside D-leaning cells. That supports a descriptive political-geography claim, not a gerrymandering conclusion. Under the current precinct-centroid diagnostic, the 2022 court plan summarizes as 7 D-majority and 7 R-majority districts with 3 competitive districts, while the 2023 enacted congressional plan used for the 2024 election summarizes as 4 D-majority and 10 R-majority districts with 1 competitive district. This is the first useful boundary-choice contrast in the registry. Honeycombing still needs polygon-apportioned precinct-to-district aggregation and VRA/COI review before it can separate natural political geography from legally relevant map-drawing choices; first ensemble context for the seat-level contrast now exists via the ALARM ingestion described below.

**NC starter selections.** The starter packet now names five bounded review regions: Triangle, Charlotte/Mecklenburg, Triad, Eastern Black Belt, and Western North Carolina. Each selection includes a rectangular map extent, H3 resolution-7 block-derived population summary, VEST 2020 precinct-centroid vote proxy, and district-touch counts for the 2022 court plan and 2023 enacted plan. The UI exposes these as a Starters panel so a reviewer can jump directly to an area and see the local context before using freeform hex selection. These selections are triage regions, not official COIs or legal findings.

**H3 ensemble explainer (first real payload).** The ensemble explainer schema now carries a real ensemble: the ALARM Project's 50-State Redistricting Simulations for the North Carolina 2020 congressional cycle (Harvard Dataverse, doi:10.7910/DVN/SLCD3E, CC0) — 5,000 plans sampled by Sequential Monte Carlo under documented constraints (0.5% maximum population deviation, contiguity, compactness, county preservation, and hinge Gibbs constraints targeting majority-minority district counts and discouraging minority packing). Honeycombing computes all distributions from ALARM's published per-district 2020 presidential vote counts, so the ensemble uses the same partisan-lean proxy as the rest of the pipeline. Under that proxy, the ensemble's median outcome is 6 Democratic seats of 14. The 2023 enacted plan's 4 Democratic-majority districts sit at the 2.8th percentile of the seat distribution — a low outlier relative to this documented comparison universe — while the 2022 court plan's 7 sit at the 86.2nd percentile, the high edge but not an outlier. These positions are descriptive relative to ALARM's constraint set; they are not conclusions about intent or legality, and the compared-plan values carry the precinct-centroid assignment caveat. The ingestion also produced a useful calibration finding: rank-sorted district Democratic shares for the shared reference geometry differ from ALARM's exact precinct assignment by at most 0.12 percentage points, confirming that the centroid shortcut — disqualifying at cell level in the Alamance and Mecklenburg audits — largely washes out at district aggregation. The payload ships as a draft: the outlier gate opens because constraints are documented, but promotion to published status waits on expert review, and the H3 cell-level projection still requires ALARM's plan assignment matrices.

**Mid-decade redraw (added 2026-07-17).** North Carolina enacted Session Law 2025-95 on October 22, 2025 — a mid-decade redraw of SL 2023-145 that applies from the 2026 election. Ingested into the plan registry from the NCGA shapefile and run through the same diagnostics, the 2025 plan summarizes as 3 Democratic-majority districts of 14 under the 2020 presidential precinct-centroid proxy. Against the same ALARM ensemble, only 3 of 5,000 simulated plans produce that few Democratic-leaning seats and none produce fewer (0th mid-percentile, matching the ensemble's minimum observed seat count). The seat classification is robust to the assignment shortcut at district level: the closest district sits 3.4 percentage points from the 50% threshold, versus a 0.12-point maximum calibration error. The same discipline applies — this is a position inside a documented simulated distribution, not a conclusion about intent or legality, and the ensemble was simulated under 2020-cycle constraints with the 2022 map as reference.

---

## 6. Proposed Next Steps

### 6.1 Immediate Product Priorities

The next product milestone should turn Honeycombing from a map with promising overlays into a comparison tool that can answer a small number of expert questions clearly.

Recommended order:

1. **Checkpoint and release hygiene**: commit the current diagnostic/provenance/registry milestone, keep raw data ignored, and document the tracked app-facing artifacts.
2. **Expert handoff packet**: keep the `/about` review packet aligned with the current UI so outside reviewers can see ready surfaces, known caveats, and review questions quickly.
3. **COI overlay skeleton**: reuse the plan-registry pattern for community-of-interest polygons, with source/cycle/caveat metadata.
4. **Precinct-to-district aggregation**: replace county-derived district heat with precinct-derived district summaries where precinct geometry and district boundaries can be joined reliably.
5. **Expert handoff packet**: package the white paper, NC starter selections, caveat ledger, and open review questions into a concise outside-review brief.

### 6.2 Data Provenance and Accuracy

The project now includes VEST 2020 precinct-level presidential results for all 50 states plus DC. Remaining data caveats:

- Current precinct aggregation uses precinct centroids, not full precinct polygon-to-hex apportionment.
- North Carolina Census PL 94-171 block data now loads as the default case-study layer. It uses Census block internal points for H3 aggregation; polygon-to-H3 apportionment remains future work for court-grade analysis.
- Historical year modes currently use county centroids.
- The current interface exposes a Plans quick panel for enacted district outlines, district heat fill, and local plan-registry overlays.
- District heat fill is explicitly labeled as county-derived 2020 presidential signal, not precinct-to-district aggregation or court-grade evidence.
- Plan layers now carry explicit source, method, payload, and caveat metadata in the app. Alternative plans should enter through a documented GeoJSON FeatureCollection schema with stable `plan_id`, `district_id`, `GEOID`, `name`, `source`, and `cycle` properties.
- The first external plan packages are the North Carolina congressional plan ordered by the NC Courts on February 23, 2022 and the North Carolina 2023 enacted congressional plan used for the 2024 election, both published by the North Carolina General Assembly.
- District overlay vote totals are currently county-derived and should be replaced with precinct-to-district aggregation.
- Documentation should cite the exact VEST release and processing scripts used to build the web datasets.

### 6.3 House Election Returns

Presidential election data is used as a proxy for partisan lean. For gerrymandering analysis, congressional and state legislative election returns are more directly relevant. Adding House race results by district and precinct would enable direct comparison: here is what the electorate did under the enacted map, and here is what the underlying spatial vote signal suggests.

### 6.4 Diagnostic Scoring Algorithm

Formalize a diagnostic Honeycombing Score that does not overclaim legal causation. Candidate inputs:

- Population-weighted vote-signal delta between H3 cells and enacted districts
- Number of district boundaries crossing coherent H3 clusters
- Packed-cell concentration: high-margin cells absorbed into already-safe districts
- Cracked-cluster fragmentation: coherent clusters split across multiple districts
- Robustness across H3 resolutions

### 6.5 Layer System

Build a layer model that can host expert redistricting artifacts without cluttering the primary map. Near-term target layers:

- **Plan overlays**: enacted maps, court maps, commission maps, proposed maps, and user-imported plans.
- **COI overlays**: community polygons from Districtr-style exports or public testimony datasets.
- **Ensemble overlays**: per-cell or per-precinct summaries from GerryChain-style plan ensembles.
- **Census block population layer**: block-derived population and demographic aggregation into H3 cells, currently implemented for the North Carolina default case study at H3 resolution 7.
- **VRA analysis layer**: protected-class population concentrations and election-performance indicators.

The UI should expose these as toggles and presets. North Carolina, Maryland, Wisconsin, Ohio, Illinois, Texas, and a commission-state control could become "case study presets" rather than separate dataset modes.

Plan imports should preserve provenance at the feature level. The first implementation path is a local/public-data registry: each entry points to a normalized GeoJSON FeatureCollection plan package. A professional-grade registry should treat enacted plans, court plans, commission proposals, public submissions, and Districtr-style exports as comparable plan packages rather than anonymous shape files. Raw downloads and bulky rebuildable files should stay out of the tracked app bundle unless they are compact, documented, and directly needed by the browser.

### 6.6 Selection and Export Tools

For Honeycombing to be useful to researchers, journalists, and legal practitioners, it should support:

- **Region selection**: improve the current select-visible-area and click-toggle interaction into explicit lasso, state, district, and viewport selection modes
- **Comparative stats panel**: for any selected region, show hex-grid vote signal, enacted district signal, raw vote totals, and data provenance
- **CSV export**: one row per selected hex/district with full vote data, for use in external analysis
- **Print/PDF export**: clean single-page snapshot of the current map view with stats, suitable for briefs or presentations
- **Shareable URL**: encode layer configuration and selection state in URL parameters for reproducible sharing

### 6.7 State Legislature Data

State legislative gerrymandering is arguably more consequential than congressional gerrymandering because state legislatures often draw congressional maps. Extending Honeycombing to state house and state senate districts would expand its analytical scope.

---

## 7. Related Work

- **Stephanopoulos & McGhee (2015)**: foundational paper on the efficiency gap measure
- **Data and Democracy Lab / MGGG**: ensemble methods, redistricting science, Districtr, VRA-oriented computational work
- **Princeton Gerrymandering Project**: public-facing report cards and map scoring
- **Brennan Center for Justice**: legal, policy, and litigation research on fair maps
- **Voting and Election Science Team (VEST)**: precinct-level election returns and boundary data
- **Dave's Redistricting App**: the primary public interactive redistricting tool

---

## 8. Conclusion

Honeycombing offers a legible, pre-existing, politically neutral spatial reference frame. It does not require a statistician to interpret the first visual layer. It does not require a court or commission to accept a replacement plan. It simply asks: here is the vote signal on a neutral grid; here are the boundaries drawn by humans; where do they diverge, and why?

That diagnostic question is the current project. The prescriptive question, whether neutral hex scaffolds can help generate legally valid maps, is real and promising, but it deserves its own algorithmic and legal research track.

---

*Honeycombing is an open project. The codebase, data pipelines, and this white paper are available for review, critique, and collaboration. We are particularly interested in engagement from redistricting researchers, election lawyers, civic technologists, and election data practitioners.*

---

**Draft notes / TODO:**

- [x] Add actual NC starter case study with numbers
- [x] Add plan comparison panel for enacted vs court-plan overlays
- [x] Add expert handoff packet to the white-paper surface
- [ ] Formalize the diagnostic Honeycombing Score
- [ ] Scope prescriptive adaptive hex districting as a separate research project
- [x] Add Census block / PL 94-171 ingestion scaffold and NC default block-derived H3 layer
- [x] Add first local/public-data plan registry and NC court-ordered congressional plan
- [ ] Add COI, ensemble-summary, and VRA-layer roadmap
- [ ] Add citations with proper academic formatting
- [ ] Get review from someone with redistricting law background
- [ ] Address population-per-district constitutional standard more rigorously
- [ ] Add figures from the visualization tool
