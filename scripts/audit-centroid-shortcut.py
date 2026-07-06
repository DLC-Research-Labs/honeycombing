#!/usr/bin/env python3
"""
Run a bounded centroid/internal-point vs polygon-to-H3 apportionment audit.

This intentionally starts with one North Carolina county so the method is
inspectable before expanding statewide. It compares the current point shortcut
against area-weighted polygon apportionment for Census blocks and VEST precincts.
"""

from __future__ import annotations

import argparse
import csv
import json
from datetime import UTC, datetime
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import geopandas as gpd
import h3
from shapely.geometry import Polygon, shape
from shapely.ops import transform
from shapely.validation import make_valid


PROJECT_DIR = Path(__file__).resolve().parents[1]
OUT_DIR = PROJECT_DIR / "docs" / "research" / "outputs" / "centroid-shortcut-audit"

BLOCK_FIELDS = [
    "total_population",
    "voting_age_population",
    "white_alone",
    "black_alone",
    "hispanic_or_latino",
    "non_hispanic_white_alone",
]

PRECINCT_FIELDS = ["dem_votes", "rep_votes", "total_votes"]

FIELD_LABELS = {
    "total_population": "Total population",
    "voting_age_population": "Voting-age population",
    "white_alone": "White alone population",
    "black_alone": "Black alone population",
    "hispanic_or_latino": "Hispanic or Latino population",
    "non_hispanic_white_alone": "Non-Hispanic white alone population",
    "dem_votes": "Democratic votes",
    "rep_votes": "Republican votes",
    "total_votes": "Two-party presidential votes",
}


@dataclass
class LayerAudit:
    layer: str
    county_fips: str
    county_name: str
    h3_resolution: int
    source_polygons: int
    point_cells: int
    apportioned_cells: int
    split_polygons: int
    total_by_field: dict[str, float]
    delta_by_field: dict[str, float]
    max_abs_cell_delta_by_field: dict[str, float]
    mean_abs_cell_delta_by_field: dict[str, float]
    max_vote_share_delta_pp: float | None
    weighted_mean_vote_share_delta_pp: float | None
    classification: str
    caveats: list[str]


def read_json(path: Path) -> Any:
    with open(path) as fh:
        return json.load(fh)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as fh:
        json.dump(payload, fh, indent=2)
        fh.write("\n")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("")
        return
    fieldnames = sorted({key for row in rows for key in row})
    preferred = ["layer", "county_fips", "county_name", "h3"]
    fieldnames = [field for field in preferred if field in fieldnames] + [
        field for field in fieldnames if field not in preferred
    ]
    with open(path, "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def valid_geom(geom):
    if geom is None or geom.is_empty:
        return None
    if not geom.is_valid:
        geom = make_valid(geom)
    if geom.is_empty:
        return None
    return geom


def h3_cell_polygon(cell: str):
    boundary = h3.cell_to_boundary(cell)
    return Polygon([(lng, lat) for lat, lng in boundary])


def geom_to_h3shape(geom):
    """Convert a Polygon/MultiPolygon-ish geometry to h3 LatLngPoly objects."""
    geom = valid_geom(geom)
    if geom is None:
        return []
    if geom.geom_type == "Polygon":
        polygons = [geom]
    elif geom.geom_type == "MultiPolygon":
        polygons = list(geom.geoms)
    else:
        return []

    h3_polys = []
    for poly in polygons:
        exterior = [(lat, lng) for lng, lat in poly.exterior.coords]
        holes = [
            [(lat, lng) for lng, lat in ring.coords]
            for ring in poly.interiors
        ]
        if len(exterior) >= 4:
            h3_polys.append(h3.LatLngPoly(exterior, *holes))
    return h3_polys


def h3_cells_for_geom(geom, resolution: int) -> set[str]:
    cells: set[str] = set()
    for h3shape in geom_to_h3shape(geom):
        cells.update(h3.h3shape_to_cells_experimental(h3shape, resolution, contain="overlap"))
    if not cells:
        point = geom.representative_point()
        cells.add(h3.latlng_to_cell(point.y, point.x, resolution))
    return cells


def numeric(value: Any) -> float:
    try:
        if value is None:
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def aggregate_points(records: Iterable[dict[str, Any]], fields: list[str], resolution: int) -> dict[str, dict[str, float]]:
    by_cell: dict[str, dict[str, float]] = defaultdict(lambda: {field: 0.0 for field in fields})
    for row in records:
        lat = numeric(row.get("lat"))
        lng = numeric(row.get("lng"))
        cell = h3.latlng_to_cell(lat, lng, resolution)
        for field in fields:
            by_cell[cell][field] += numeric(row.get(field))
    return dict(by_cell)


def aggregate_polygons(
    gdf: gpd.GeoDataFrame,
    fields: list[str],
    resolution: int,
) -> tuple[dict[str, dict[str, float]], int]:
    by_cell: dict[str, dict[str, float]] = defaultdict(lambda: {field: 0.0 for field in fields})
    split_polygons = 0

    gdf_wgs84 = gdf.to_crs("EPSG:4326")
    gdf_area = gdf.to_crs("EPSG:5070")

    for idx, row in gdf_wgs84.iterrows():
        geom_wgs84 = valid_geom(row.geometry)
        if geom_wgs84 is None:
            continue
        cells = h3_cells_for_geom(geom_wgs84, resolution)
        if len(cells) > 1:
            split_polygons += 1

        geom_area = valid_geom(gdf_area.loc[idx].geometry)
        if geom_area is None:
            continue

        weighted: list[tuple[str, float]] = []
        for cell in cells:
            cell_poly = gpd.GeoSeries([h3_cell_polygon(cell)], crs="EPSG:4326").to_crs("EPSG:5070").iloc[0]
            intersection = geom_area.intersection(cell_poly)
            area = intersection.area if not intersection.is_empty else 0.0
            if area > 0:
                weighted.append((cell, area))

        total_area = sum(area for _, area in weighted)
        if total_area <= 0:
            point = geom_wgs84.representative_point()
            weighted = [(h3.latlng_to_cell(point.y, point.x, resolution), 1.0)]
            total_area = 1.0

        for cell, area in weighted:
            weight = area / total_area
            for field in fields:
                by_cell[cell][field] += numeric(row.get(field)) * weight

    return dict(by_cell), split_polygons


def compare_aggregates(
    layer: str,
    county_fips: str,
    county_name: str,
    fields: list[str],
    point: dict[str, dict[str, float]],
    apportioned: dict[str, dict[str, float]],
    source_polygons: int,
    split_polygons: int,
    resolution: int,
) -> tuple[LayerAudit, list[dict[str, Any]]]:
    cells = sorted(set(point) | set(apportioned))
    rows: list[dict[str, Any]] = []
    total_by_field: dict[str, float] = {}
    delta_by_field: dict[str, float] = {}
    max_abs_cell_delta_by_field: dict[str, float] = {}
    mean_abs_cell_delta_by_field: dict[str, float] = {}

    for cell in cells:
        row: dict[str, Any] = {"layer": layer, "county_fips": county_fips, "county_name": county_name, "h3": cell}
        for field in fields:
            point_value = point.get(cell, {}).get(field, 0.0)
            apportioned_value = apportioned.get(cell, {}).get(field, 0.0)
            row[f"{field}_point"] = round(point_value, 6)
            row[f"{field}_apportioned"] = round(apportioned_value, 6)
            row[f"{field}_delta"] = round(apportioned_value - point_value, 6)
        rows.append(row)

    for field in fields:
        point_total = sum(values.get(field, 0.0) for values in point.values())
        apportioned_total = sum(values.get(field, 0.0) for values in apportioned.values())
        deltas = [abs(row[f"{field}_delta"]) for row in rows]
        total_by_field[field] = round(point_total, 6)
        delta_by_field[field] = round(apportioned_total - point_total, 6)
        max_abs_cell_delta_by_field[field] = round(max(deltas) if deltas else 0.0, 6)
        mean_abs_cell_delta_by_field[field] = round((sum(deltas) / len(deltas)) if deltas else 0.0, 6)

    max_vote_share_delta_pp = None
    weighted_mean_vote_share_delta_pp = None
    if {"dem_votes", "rep_votes"}.issubset(fields):
        max_delta = 0.0
        weighted_sum = 0.0
        total_weight = 0.0
        for row in rows:
            p_dem = row["dem_votes_point"]
            p_rep = row["rep_votes_point"]
            a_dem = row["dem_votes_apportioned"]
            a_rep = row["rep_votes_apportioned"]
            p_total = p_dem + p_rep
            a_total = a_dem + a_rep
            if p_total <= 0 or a_total <= 0:
                continue
            delta_pp = abs((a_dem / a_total - p_dem / p_total) * 100)
            max_delta = max(max_delta, delta_pp)
            weight = max(p_total, a_total)
            weighted_sum += delta_pp * weight
            total_weight += weight
        max_vote_share_delta_pp = round(max_delta, 4)
        weighted_mean_vote_share_delta_pp = round(weighted_sum / total_weight, 4) if total_weight else 0.0

    if layer == "blocks":
        main_field = "total_population"
        max_delta = max_abs_cell_delta_by_field.get(main_field, 0)
        total = total_by_field.get(main_field, 0)
        split_rate = split_polygons / source_polygons if source_polygons else 0
        if max_delta <= max(total * 0.001, 250) and split_rate < 0.15:
            classification = "harmless_for_visual_exploration"
        elif max_delta <= max(total * 0.01, 2500):
            classification = "material_for_statistics"
        else:
            classification = "disqualifying_for_evidence_without_apportionment"
    else:
        max_delta = max_vote_share_delta_pp or 0
        if max_delta <= 0.5:
            classification = "harmless_for_visual_exploration"
        elif max_delta <= 3:
            classification = "material_for_statistics"
        else:
            classification = "disqualifying_for_evidence_without_apportionment"

    caveats = [
        "Polygon apportionment is area-weighted, not population-density-weighted inside source polygons.",
        "The H3 overlap polyfill uses an experimental containment mode in h3-py 4.4.2.",
        "This is a bounded county audit and should not be generalized statewide without additional slices.",
    ]

    audit = LayerAudit(
        layer=layer,
        county_fips=county_fips,
        county_name=county_name,
        h3_resolution=resolution,
        source_polygons=source_polygons,
        point_cells=len(point),
        apportioned_cells=len(apportioned),
        split_polygons=split_polygons,
        total_by_field=total_by_field,
        delta_by_field=delta_by_field,
        max_abs_cell_delta_by_field=max_abs_cell_delta_by_field,
        mean_abs_cell_delta_by_field=mean_abs_cell_delta_by_field,
        max_vote_share_delta_pp=max_vote_share_delta_pp,
        weighted_mean_vote_share_delta_pp=weighted_mean_vote_share_delta_pp,
        classification=classification,
        caveats=caveats,
    )
    return audit, rows


def load_block_layer(county_fips: str) -> tuple[gpd.GeoDataFrame, list[dict[str, Any]]]:
    points = read_json(PROJECT_DIR / "public" / "data" / "census" / "census-blocks-37-2020.json")
    point_rows = [row for row in points if str(row.get("county_fips")).zfill(3) == county_fips]
    attr_by_geoid = {row["geoid"]: row for row in point_rows}

    blocks = gpd.read_file(f"zip://{PROJECT_DIR / 'data' / 'census' / 'tiger' / 'tl_2020_37_tabblock20.zip'}")
    blocks = blocks[blocks["COUNTYFP20"].astype(str).str.zfill(3) == county_fips].copy()
    for field in BLOCK_FIELDS:
        blocks[field] = blocks["GEOID20"].map(lambda geoid: numeric(attr_by_geoid.get(str(geoid), {}).get(field)))
    return blocks, point_rows


def load_precinct_layer(county_number: int) -> tuple[gpd.GeoDataFrame, list[dict[str, Any]], str]:
    precincts = gpd.read_file(PROJECT_DIR / "data" / "nc" / "nc_2020.shp")
    precincts = precincts[precincts["COUNTY_ID"].astype(int) == county_number].copy()
    county_name = str(precincts["COUNTY_NAM"].iloc[0]).title() if len(precincts) else f"County {county_number}"

    precincts["dem_votes"] = precincts["G20PREDBID"].map(numeric)
    precincts["rep_votes"] = precincts["G20PRERTRU"].map(numeric)
    precincts["total_votes"] = precincts["dem_votes"] + precincts["rep_votes"]

    centroids = precincts.geometry.centroid
    centroids = gpd.GeoSeries(centroids, crs=precincts.crs).to_crs("EPSG:4326")
    point_rows = []
    for idx, row in precincts.iterrows():
        point = centroids.loc[idx]
        point_rows.append({
            "lat": point.y,
            "lng": point.x,
            "dem_votes": numeric(row["dem_votes"]),
            "rep_votes": numeric(row["rep_votes"]),
            "total_votes": numeric(row["total_votes"]),
            "precinct_id": str(row.get("PREC_ID")),
            "precinct_name": str(row.get("ENR_DESC")),
        })
    return precincts, point_rows, county_name


def audit(county_fips: str, county_number: int, resolution: int) -> dict[str, Any]:
    block_gdf, block_points = load_block_layer(county_fips)
    precinct_gdf, precinct_points, county_name = load_precinct_layer(county_number)

    block_point = aggregate_points(block_points, BLOCK_FIELDS, resolution)
    block_apportioned, block_splits = aggregate_polygons(block_gdf, BLOCK_FIELDS, resolution)
    block_audit, block_rows = compare_aggregates(
        "blocks",
        county_fips,
        county_name,
        BLOCK_FIELDS,
        block_point,
        block_apportioned,
        len(block_gdf),
        block_splits,
        resolution,
    )

    precinct_point = aggregate_points(precinct_points, PRECINCT_FIELDS, resolution)
    precinct_apportioned, precinct_splits = aggregate_polygons(precinct_gdf, PRECINCT_FIELDS, resolution)
    precinct_audit, precinct_rows = compare_aggregates(
        "precincts",
        county_fips,
        county_name,
        PRECINCT_FIELDS,
        precinct_point,
        precinct_apportioned,
        len(precinct_gdf),
        precinct_splits,
        resolution,
    )

    rows = block_rows + precinct_rows
    summary = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(UTC).isoformat(),
        "county": {
            "state": "NC",
            "countyFips": county_fips,
            "countyNumber": county_number,
            "name": county_name,
        },
        "h3Resolution": resolution,
        "method": {
            "pointAssignment": "Current shortcut: source internal point or centroid assigned to one H3 cell.",
            "polygonApportionment": "Audit method: source polygon intersected with overlapping H3 cells and attributes allocated by intersection area share.",
            "workingAreaCrs": "EPSG:5070",
            "displayCrs": "EPSG:4326",
        },
        "layers": [block_audit.__dict__, precinct_audit.__dict__],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    slug = county_slug(county_name)
    write_json(OUT_DIR / f"{slug}-r{resolution}-summary.json", summary)
    write_csv(OUT_DIR / f"{slug}-r{resolution}-cell-deltas.csv", rows)
    return summary


def county_slug(county_name: str) -> str:
    return county_name.lower().replace(" ", "-")


def markdown_report(summary: dict[str, Any]) -> str:
    county = summary["county"]
    lines = [
        f"# Centroid Shortcut Audit - {county['name']} County Results",
        "",
        f"Date: {summary['generatedAt'][:10]}",
        "",
        f"County: {county['name']} County, NC (`{county['countyFips']}`)",
        f"H3 resolution: {summary['h3Resolution']}",
        "",
        "## Method",
        "",
        "- Point shortcut: assign each source block internal point or precinct centroid to one H3 cell.",
        "- Polygon apportionment: intersect each source polygon with overlapping H3 cells and allocate attributes by intersection-area share.",
        "- Area CRS: EPSG:5070.",
        "- This is area-weighted, not population-density-weighted within each polygon.",
        "",
        "## Summary",
        "",
        "| Layer | Source polygons | Point cells | Apportioned cells | Split polygons | Classification |",
        "| --- | ---: | ---: | ---: | ---: | --- |",
    ]
    for layer in summary["layers"]:
        lines.append(
            f"| {layer['layer']} | {layer['source_polygons']:,} | {layer['point_cells']:,} | "
            f"{layer['apportioned_cells']:,} | {layer['split_polygons']:,} | `{layer['classification']}` |"
        )

    lines.extend(["", "## Field Deltas", ""])
    for layer in summary["layers"]:
        lines.extend([
            f"### {layer['layer'].title()}",
            "",
            "| Field | Total | Total delta | Max abs cell delta | Mean abs cell delta |",
            "| --- | ---: | ---: | ---: | ---: |",
        ])
        for field, total in layer["total_by_field"].items():
            label = FIELD_LABELS.get(field, field)
            lines.append(
                f"| {label} | {total:,.2f} | {layer['delta_by_field'][field]:,.6f} | "
                f"{layer['max_abs_cell_delta_by_field'][field]:,.2f} | "
                f"{layer['mean_abs_cell_delta_by_field'][field]:,.2f} |"
            )
        if layer["max_vote_share_delta_pp"] is not None:
            lines.extend([
                "",
                f"- Max H3-cell two-party Democratic vote-share delta: {layer['max_vote_share_delta_pp']:.4f} percentage points.",
                f"- Vote-weighted mean H3-cell vote-share delta: {layer['weighted_mean_vote_share_delta_pp']:.4f} percentage points.",
            ])
        lines.append("")

    lines.extend([
        "## Classification Notes",
        "",
        "- `harmless_for_visual_exploration`: shortcut is acceptable for visual orientation in this bounded slice.",
        "- `material_for_statistics`: shortcut changes enough cell-level values that statistical summaries should use apportionment.",
        "- `disqualifying_for_evidence_without_apportionment`: shortcut is too fragile for evidence claims in this slice.",
        "",
        "## Caveats",
        "",
        "- This is one county, not a statewide conclusion.",
        "- Polygon apportionment is area-weighted; a stronger version should test population-aware allocation for large heterogeneous polygons.",
        "- H3 overlap polyfill uses experimental h3-py 4.4.2 containment behavior.",
        "- The browser should continue loading compact derived artifacts, not raw block or precinct polygons.",
        "",
        "## Next Recommendation",
        "",
        f"For {county['name']} County, use polygon apportionment for statistical/reporting artifacts and keep centroid/internal-point assignment labeled as diagnostic-only.",
    ])
    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit centroid/internal-point H3 assignment shortcut")
    parser.add_argument("--county-fips", default="001", help="Three-digit NC county FIPS")
    parser.add_argument("--county-number", type=int, default=1, help="VEST COUNTY_ID numeric value")
    parser.add_argument("--resolution", type=int, default=7, help="H3 resolution")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    summary = audit(args.county_fips.zfill(3), args.county_number, args.resolution)
    report = markdown_report(summary)
    slug = county_slug(summary["county"]["name"])
    report_path = OUT_DIR / f"{slug}-r{args.resolution}-audit-table.md"
    report_path.write_text(report)
    print(f"Wrote {OUT_DIR / f'{slug}-r{args.resolution}-summary.json'}")
    print(f"Wrote {OUT_DIR / f'{slug}-r{args.resolution}-cell-deltas.csv'}")
    print(f"Wrote {report_path}")
    for layer in summary["layers"]:
        print(
            f"{layer['layer']}: {layer['classification']} "
            f"({layer['split_polygons']}/{layer['source_polygons']} split polygons)"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
