# NC Named-Selection Case Study

Generated: 2026-05-02 (data vintage: 2020 Census, VEST 2020, plans as registered)

Two named selections compare the H3 population layer, the precinct partisan proxy, and the district assignments of the 118th enacted, NC 2022 court-ordered, and NC 2023 enacted congressional plans. Every quantitative claim carries a claim tag. This packet is descriptive review triage, not evidence.

## Charlotte / Mecklenburg

Urban/suburban concentration test: does either plan pack the metro core into fewer districts or crack the suburban edge across many? The Mecklenburg centroid audit makes this the region where assignment caveats are strongest.

- H3 r7 cells: 868 | population 1,742,306 | Black 23.9% | nonwhite 47.3% `descriptive_with_assignment_caveat`
- Precinct proxy: 320 precincts, D 56.6% / R 43.4% | cells with votes: 270 (154 D-leaning, 116 R-leaning, 42 within ±5pp) `descriptive_with_centroid_caveat`

| Plan | Status | Districts touched | Cells assigned |
| --- | --- | ---: | ---: |
| 118th Congress enacted districts | enacted | 4 | 858 |
| NC 2022 court-ordered congressional plan | court | 4 | 856 |
| NC 2023 enacted congressional plan | enacted | 5 | 856 |

### Boundary delta: NC 2022 court-ordered congressional plan vs NC 2023 enacted congressional plan

- Cells reassigned: 277 of 856 (32.4%) `descriptive_with_assignment_caveat`
- Population in reassigned cells: 776,780 (44.6% of selection) `descriptive_with_assignment_caveat`
- Reassigned-precinct proxy signal: 156 precincts, D 57.8% / R 42.2% (lean D) `descriptive_with_centroid_caveat`

| Flow | Cells | Population |
| --- | ---: | ---: |
| 3714 -> 3712 | 63 | 337,021 |
| 3712 -> 3714 | 62 | 125,265 |
| 3712 -> 3708 | 58 | 110,293 |
| 3712 -> 3706 | 48 | 104,925 |
| 3714 -> 3708 | 17 | 70,063 |
| 3708 -> 3706 | 29 | 29,213 |

Interpretation: Reassignment counts describe where the two adopted boundary sets differ inside this selection. Whether any flow is lawful, ensemble-typical, VRA-required, or a reviewable choice cannot be concluded from this packet; it needs an ensemble baseline, district election history, and VRA/COI context. `requires_ensemble_and_expert_validation`

### Deviation ledger seed

- [unresolved] Do the 2023 boundary shifts around the Charlotte core follow county lines, or do they cross Mecklenburg for another reason? (candidates: county-lines, compactness, partisan-choice)
- [needs-data] Is the suburban-edge reassignment consistent with what a compactness-driven redraw would produce? (candidates: compactness, contiguity, partisan-choice) — needs: Ensemble baseline of legally compliant plans for the Charlotte region.

## Eastern Black Belt

VRA-adjacent region: any deviation here may be a legally required VRA adjustment rather than a reviewable choice. Honeycombing can only flag where boundaries changed; it cannot classify a change as VRA-driven without CVAP, racially polarized voting, and candidate-of-choice evidence, none of which are implemented.

- H3 r7 cells: 7,742 | population 1,969,311 | Black 31% | nonwhite 47.7% `descriptive_with_assignment_caveat`
- Precinct proxy: 564 precincts, D 51.3% / R 48.7% | cells with votes: 537 (260 D-leaning, 277 R-leaning, 94 within ±5pp) `descriptive_with_centroid_caveat`

| Plan | Status | Districts touched | Cells assigned |
| --- | --- | ---: | ---: |
| 118th Congress enacted districts | enacted | 6 | 7,506 |
| NC 2022 court-ordered congressional plan | court | 6 | 7,713 |
| NC 2023 enacted congressional plan | enacted | 5 | 7,713 |

### Boundary delta: NC 2022 court-ordered congressional plan vs NC 2023 enacted congressional plan

- Cells reassigned: 1,476 of 7,713 (19.1%) `descriptive_with_assignment_caveat`
- Population in reassigned cells: 635,275 (32.3% of selection) `descriptive_with_assignment_caveat`
- Reassigned-precinct proxy signal: 154 precincts, D 53% / R 47% (lean D) `descriptive_with_centroid_caveat`

| Flow | Cells | Population |
| --- | ---: | ---: |
| 3701 -> 3703 | 273 | 152,211 |
| 3713 -> 3702 | 42 | 120,555 |
| 3703 -> 3701 | 430 | 113,691 |
| 3713 -> 3701 | 167 | 70,141 |
| 3701 -> 3713 | 264 | 68,109 |
| 3702 -> 3713 | 73 | 64,645 |
| 3704 -> 3713 | 118 | 23,377 |
| 3703 -> 3707 | 93 | 13,060 |
| 3704 -> 3701 | 16 | 9,486 |

Interpretation: Reassignment counts describe where the two adopted boundary sets differ inside this selection. Whether any flow is lawful, ensemble-typical, VRA-required, or a reviewable choice cannot be concluded from this packet; it needs an ensemble baseline, district election history, and VRA/COI context. `requires_ensemble_and_expert_validation`

### Deviation ledger seed

- [needs-data] Which reassigned cells sit in areas where a VRA district could be legally required? (candidates: vra-required, county-lines, partisan-choice) — needs: CVAP, racially polarized voting analysis, and candidate-of-choice election history. Population composition alone cannot support a VRA conclusion.
- [unresolved] Do the 2023 changes split any county groupings that the NC whole-county provision would otherwise protect? (candidates: county-lines, state-constitutional-criteria)

## Shared caveats

- H3 cells are equal-area hexagons, not districts and not equal-population units.
- All point-in-polygon assignment uses cell centers or precinct centroids; bounded audits rate these shortcuts material_for_statistics (blocks) and disqualifying_for_evidence_without_apportionment (precinct votes).
- Whether any observed asymmetry or boundary flow is lawful, ensemble-typical, or map-drawing-driven cannot be concluded without an ensemble baseline, district election history, and VRA/COI context.

## Assignment audits backing the claim tags

- Alamance County (`001`): blocks material_for_statistics (max cell pop delta 505.62); precincts disqualifying_for_evidence_without_apportionment (max cell vote-share delta 9.16pp)
- Mecklenburg County (`119`): blocks material_for_statistics (max cell pop delta 1875.69); precincts disqualifying_for_evidence_without_apportionment (max cell vote-share delta 16.36pp)

