# Centroid Shortcut Audit - Alamance County Results

Date: 2026-05-03

County: Alamance County, NC (`001`)
H3 resolution: 7

## Method

- Point shortcut: assign each source block internal point or precinct centroid to one H3 cell.
- Polygon apportionment: intersect each source polygon with overlapping H3 cells and allocate attributes by intersection-area share.
- Area CRS: EPSG:5070.
- This is area-weighted, not population-density-weighted within each polygon.

## Summary

| Layer | Source polygons | Point cells | Apportioned cells | Split polygons | Classification |
| --- | ---: | ---: | ---: | ---: | --- |
| blocks | 3,594 | 264 | 278 | 1,300 | `material_for_statistics` |
| precincts | 38 | 35 | 278 | 37 | `disqualifying_for_evidence_without_apportionment` |

## Field Deltas

### Blocks

| Field | Total | Total delta | Max abs cell delta | Mean abs cell delta |
| --- | ---: | ---: | ---: | ---: |
| Total population | 171,415.00 | 0.000000 | 505.62 | 86.84 |
| Voting-age population | 133,969.00 | 0.000000 | 386.70 | 68.00 |
| White alone population | 105,847.00 | 0.000000 | 405.48 | 65.77 |
| Black alone population | 34,014.00 | 0.000000 | 173.43 | 13.59 |
| Hispanic or Latino population | 24,703.00 | 0.000000 | 142.79 | 8.54 |
| Non-Hispanic white alone population | 102,487.00 | 0.000000 | 399.32 | 64.87 |

### Precincts

| Field | Total | Total delta | Max abs cell delta | Mean abs cell delta |
| --- | ---: | ---: | ---: | ---: |
| Democratic votes | 38,825.00 | 0.000000 | 2,153.38 | 164.84 |
| Republican votes | 46,056.00 | 0.000000 | 2,328.62 | 232.44 |
| Two-party presidential votes | 84,881.00 | 0.000000 | 4,238.43 | 397.23 |

- Max H3-cell two-party Democratic vote-share delta: 9.1598 percentage points.
- Vote-weighted mean H3-cell vote-share delta: 1.1544 percentage points.

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

For Alamance County, use polygon apportionment for statistical/reporting artifacts and keep centroid/internal-point assignment labeled as diagnostic-only until at least one urban/suburban region is tested.
