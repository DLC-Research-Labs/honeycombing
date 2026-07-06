# NC Asymmetry Decomposition Packet

Date: 2026-05-03

## Scope

This packet compares North Carolina's statewide vote proxy, H3 vote concentration, baseline congressional geography, the NC 2022 court plan, and the NC 2023 enacted plan used for the 2024 election using the data Honeycombing can inspect today.

## Statewide Vote Proxy

- VEST 2020 precinct-centroid records: 2,662
- Two-party presidential signal: D 49.32% / R 50.68%
- Caveat: presidential vote is a partisan proxy, not congressional vote performance.

## H3 Vote Concentration

- H3 resolution 7 precinct-centroid cells: 2,446
- D-leaning cells: 964
- R-leaning cells: 1,482
- Competitive cells within 5 points: 344
- Voters in D-leaning cells: 45.98%
- Democratic votes in D-leaning cells: 63.54%

## Plan Diagnostic Summary

| Plan | D-majority districts | R-majority districts | Competitive districts | Deep-D districts | Deep-R districts | Max population deviation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 118th Congress enacted districts | 7 | 7 | 3 | 2 | 2 | 3.31% |
| NC 2022 court-ordered congressional plan | 7 | 7 | 3 | 2 | 2 | 1.55% |
| NC 2023 enacted congressional plan | 4 | 10 | 1 | 3 | 0 | 3.08% |

## Claim Classes

- **descriptive**: NC 2020 two-party presidential vote proxy is nearly even but slightly Republican. VEST precinct centroids total D 49.32% / R 50.68%.
- **descriptive_with_centroid_caveat**: Democratic voters are spatially concentrated in fewer H3 cells than Republican voters at resolution 7. 964 D-leaning H3 cells versus 1482 R-leaning cells; 63.54% of Democratic votes are in D-leaning cells.
- **descriptive_with_assignment_caveat**: Baseline, enacted, and court plans can be compared with the same center-assignment diagnostic, but the comparison is not yet court-grade. 118th baseline: 7 D-majority / 7 R-majority districts. 2022 court plan: 7 D-majority / 7 R-majority districts. 2023 enacted plan: 4 D-majority / 10 R-majority districts by precinct-centroid assignment.
- **descriptive_with_assignment_caveat**: The NC registry now includes a meaningfully different enacted-vs-court contrast. NC 2022 court-ordered congressional plan: 7-7, 3 competitive; NC 2023 enacted congressional plan: 4-10, 1 competitive. The contrast is useful for review triage but still depends on centroid assignment.
- **requires_ensemble_and_expert_validation**: Whether observed asymmetry is lawful, ensemble-typical, or map-drawing-driven cannot be concluded from this packet alone. Needs ensemble baseline, district-specific election history, VRA/COI context, and polygon-apportioned precinct-to-district aggregation.

## Caveats

- Plan summaries assign H3 cell centers and precinct centroids to district polygons.
- The centroid shortcut audit showed precinct centroid assignment can be disqualifying for evidence in a bounded Alamance County test.
- The 2023 enacted plan adds a genuine contrast, but all plan summaries remain center-assignment diagnostics until polygon apportionment is implemented.
- This packet is useful for orienting expert review, not proving lawful or unlawful districting.
- Ensemble baselines, COI overlays, VRA evidence, and polygon-apportioned precinct-to-district aggregation remain required before strong claims.

## Next Artifact

Turn this packet into named NC starter selections, prioritizing one urban/suburban region and one region where the 2022 court and 2023 enacted boundaries differ visibly.
