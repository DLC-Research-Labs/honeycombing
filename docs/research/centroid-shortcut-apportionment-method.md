# Centroid Shortcut Audit - Apportionment Method

Date: 2026-05-03

Checkpoint: Expert Review: Centroid shortcut audit - Define polygon-to-H3 apportionment method

## Scope

This method defines the first bounded comparison between Honeycombing's current point shortcut and a polygon-to-H3 apportionment workflow. It is intentionally scoped to a county-sized North Carolina slice before expanding to a statewide or urban-region run.

Initial slice:

- State: North Carolina
- County: Alamance County (`001`)
- H3 resolution: 7
- Population source: Census 2020 PL 94-171 block attributes joined to TIGER 2020 tabulation blocks
- Election source: VEST 2020 precinct polygons and presidential returns

## Methods Compared

### Current Point Shortcut

The current app-facing shortcut assigns each source unit to one H3 cell:

- Census blocks use TIGER block internal points (`INTPTLAT20` / `INTPTLON20`).
- VEST precincts use polygon centroids.
- County election records use county centroids.

This preserves total population or vote totals, but it concentrates each source unit into exactly one cell. That can distort cell-level summaries when a source polygon is large, irregular, or crosses multiple H3 cells.

### Area-Weighted Polygon Apportionment

The audit method assigns each source polygon across all overlapping H3 cells:

1. Load source polygons.
2. Repair invalid geometries with `make_valid`.
3. Convert source polygons to WGS84 for H3 cell discovery.
4. Use H3 overlap polyfill at resolution 7 to find candidate cells.
5. Convert source polygons and H3 cell polygons to EPSG:5070 for area calculation.
6. Intersect each source polygon with each overlapping H3 cell.
7. Allocate each source attribute by `intersection_area / total_intersected_area`.
8. Sum apportioned attributes by H3 cell.

This is area-weighted, not population-density-weighted. It is still a prototype, but it is a materially better test than centroid/internal-point assignment for statistical claims.

## Classification Rules

The audit classifies drift with three labels:

- `harmless_for_visual_exploration`: the shortcut is acceptable for visual orientation in the tested slice.
- `material_for_statistics`: the shortcut changes enough cell-level values that statistical summaries should use apportionment.
- `disqualifying_for_evidence_without_apportionment`: the shortcut is too fragile for evidence claims in the tested slice.

For blocks, the first-pass classifier uses total-population cell drift and source-polygon split rate. For precincts, it uses H3-cell two-party Democratic vote-share drift.

These thresholds are intentionally conservative and should be revisited after running at least one urban/suburban region.

## Artifacts

- Script: `scripts/audit-centroid-shortcut.py`
- Summary JSON: `docs/research/outputs/centroid-shortcut-audit/alamance-r7-summary.json`
- Cell delta CSV: `docs/research/outputs/centroid-shortcut-audit/alamance-r7-cell-deltas.csv`
- Audit table: `docs/research/outputs/centroid-shortcut-audit/alamance-r7-audit-table.md`

## Dependency Note

The script uses the existing local geospatial stack (`geopandas`, `shapely`, `pyproj`) plus `h3` for Python. In this session, `h3` was installed into a temporary venv at `/tmp/honeycomb-h3-venv` and run with:

```bash
PYTHONPATH=/tmp/honeycomb-h3-venv/lib/python3.14/site-packages python3 scripts/audit-centroid-shortcut.py
```

If this audit becomes a regular workflow, promote these dependencies into a tracked geospatial requirements file or a reproducible task runner.
