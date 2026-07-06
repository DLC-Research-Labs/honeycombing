# Centroid Shortcut Audit - Mecklenburg County Results

Date: 2026-07-03

County: Mecklenburg County, NC (`119`)
H3 resolution: 7

## Method

- Point shortcut: assign each source block internal point or precinct centroid to one H3 cell.
- Polygon apportionment: intersect each source polygon with overlapping H3 cells and allocate attributes by intersection-area share.
- Area CRS: EPSG:5070.
- This is area-weighted, not population-density-weighted within each polygon.

## Summary

| Layer | Source polygons | Point cells | Apportioned cells | Split polygons | Classification |
| --- | ---: | ---: | ---: | ---: | --- |
| blocks | 12,132 | 342 | 356 | 3,700 | `material_for_statistics` |
| precincts | 195 | 148 | 356 | 195 | `disqualifying_for_evidence_without_apportionment` |

## Field Deltas

### Blocks

| Field | Total | Total delta | Max abs cell delta | Mean abs cell delta |
| --- | ---: | ---: | ---: | ---: |
| Total population | 1,115,482.00 | 0.000000 | 1,875.69 | 240.45 |
| Voting-age population | 860,025.00 | 0.000000 | 1,518.25 | 187.97 |
| White alone population | 520,567.00 | 0.000000 | 1,097.94 | 123.01 |
| Black alone population | 330,458.00 | 0.000000 | 891.58 | 79.42 |
| Hispanic or Latino population | 169,922.00 | 0.000000 | 518.11 | 36.50 |
| Non-Hispanic white alone population | 498,683.00 | 0.000000 | 1,095.34 | 119.71 |

### Precincts

| Field | Total | Total delta | Max abs cell delta | Mean abs cell delta |
| --- | ---: | ---: | ---: | ---: |
| Democratic votes | 378,107.00 | 0.000000 | 6,073.03 | 881.31 |
| Republican votes | 179,211.00 | 0.000000 | 3,080.68 | 462.91 |
| Two-party presidential votes | 557,318.00 | 0.000000 | 8,084.53 | 1,340.58 |

- Max H3-cell two-party Democratic vote-share delta: 16.3636 percentage points.
- Vote-weighted mean H3-cell vote-share delta: 1.3045 percentage points.

## Classification Notes

- `harmless_for_visual_exploration`: shortcut is acceptable for visual orientation in this bounded slice.
- `material_for_statistics`: shortcut changes enough cell-level values that statistical summaries should use apportionment.
- `disqualifying_for_evidence_without_apportionment`: shortcut is too fragile for evidence claims in this slice.

## Caveats

- This is one county, not a statewide conclusion.
- Polygon apportionment is area-weighted; a stronger version should test population-aware allocation for large heterogeneous polygons.
- H3 overlap polyfill uses experimental h3-py 4.4.2 containment behavior.
- The browser should continue loading compact derived artifacts, not raw block or precinct polygons.

## Next Recommendation

For Mecklenburg County, use polygon apportionment for statistical/reporting artifacts and keep centroid/internal-point assignment labeled as diagnostic-only.
