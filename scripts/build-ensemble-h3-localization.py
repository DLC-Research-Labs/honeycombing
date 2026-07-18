"""Project ALARM's plan-assignment ensemble onto the H3 grid — divergence localization.

Red-team ledger item T4.2 / ensemble schema Objective 3 remainder: today the hex grid
does not touch the headline number. This builds the H3 cell-level ensemble unit measure
that shows *where* the enacted map's partisan outlier lives, using the plan-assignment
matrices extracted in scripts/extract-alarm-plans.py.

Measure (the schema's "distribution of the containing district's measure per H3 cell"):
For each ensemble draw, every precinct sits in some congressional district; that district
has a 2020-presidential two-party Democratic share. Across the 5,000 neutral simulated
plans, a location therefore sees a *distribution* of "how Democratic is the district I land
in." We compare the enacted 2025 map (SL 2025-95, the headline map) against that
distribution per location. A cell whose enacted containing-district share sits far below the
neutral distribution (low percentile) is placed in a much more Republican district than
neutral maps would — a spatial pattern consistent with cracking (not a finding of it); far
above (high percentile) is consistent with packing. These are markers of where the map
departs from the neutral ensemble, never a claim about the cell residents' own vote.

Key reduction: a cell's containing district in a draw equals the district of its containing
precinct in that draw, so the full distribution is computed once per precinct (2,666 x
5,000) directly from the assignment matrix and ALARM's own per-precinct pre_20 returns —
no stats CSV, no draw-order matching. Every populated r7 cell inherits its containing
precinct's distribution.

IMPORTANT (claim discipline): this projects the partisan lean of the *containing district*
onto the cell. It is NOT a statement about the cell's own residents' representation or vote
(that would be an ecological inference). Tag: descriptive_with_assignment_caveat.

Hard gates:
  1. GEOID order of the map file matches the assignment manifest exactly.
  2. Assignment matrix is [2666, 5001], labels 1..14.
  3. Enacted 2025 plan scores 3 Democratic seats under pre_20 (reproduces the headline).
  4. >= 99% of r7 cells find a containing precinct by point-in-polygon (no fallback flood).

Outputs:
  data/alarm/derived/nc-h3-localization-units.json  (h3 unitMeasure, tail cells only)
  data/alarm/derived/nc-h3-localization-full.json    (all populated cells; research/QA)
  docs/research/outputs/alarm-ensemble/nc-h3-localization.md  (report)

Run:
  uv run --with rdata --with shapely --with pyproj --with h3 --with numpy python3 \
    scripts/build-ensemble-h3-localization.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import h3
import numpy as np
import rdata
from pyproj import Transformer
from shapely.geometry import MultiPolygon, Point, Polygon, shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
MAP_RDS = ROOT / "data/alarm/NC_cd_2020_map.rds"
ASSIGN_BIN = ROOT / "data/alarm/derived/nc-plans-assignment.bin"
ASSIGN_MANIFEST = ROOT / "data/alarm/derived/nc-plans-assignment-manifest.json"
CENSUS_H3 = ROOT / "public/derived-data/census-h3/census-blocks-37-r7-2020.json"
ENACTED_PLAN = ROOT / "public/data/plans/nc-2025-enacted-congressional.json"

# Servable (tracked): the h3 unitMeasure the app lazy-loads when the overlay is enabled.
UNITS_OUT = ROOT / "public/data/ensembles/nc-congress-2020-alarm-h3.json"
# Full per-cell table for research/QA (data/ is gitignored; regenerable).
FULL_OUT = ROOT / "data/alarm/derived/nc-h3-localization-full.json"
MD_OUT = ROOT / "docs/research/outputs/alarm-ensemble/nc-h3-localization.md"

SOURCE_CRS = "EPSG:32119"
H3_RES = 7
N_DISTRICTS = 14
# Divergence tails: cells whose enacted containing-district share sits at/below p_low or
# at/above p_high of the neutral distribution are the "where the outlier lives" cells.
TAIL_LOW = 5.0
TAIL_HIGH = 95.0


def die(msg: str) -> None:
    print(f"GATE FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def build_geometry(raw) -> MultiPolygon | Polygon:
    polys = []
    for poly in raw:
        rings = [np.asarray(ring) for ring in poly]
        polys.append(Polygon(rings[0], rings[1:] if len(rings) > 1 else None))
    return MultiPolygon(polys) if len(polys) > 1 else polys[0]


def main() -> None:
    if not MAP_RDS.exists() or not ASSIGN_BIN.exists():
        die("Missing ALARM inputs. Need NC_cd_2020_map.rds and derived/nc-plans-assignment.bin "
            "(run scripts/extract-alarm-plans.py first).")

    print("Loading ALARM map + assignment matrix...")
    frame = rdata.conversion.convert(rdata.parser.parse_file(MAP_RDS))
    geoids = [str(g) for g in frame["GEOID"]]
    dem = frame["pre_20_dem_bid"].to_numpy(dtype=float)
    rep = frame["pre_20_rep_tru"].to_numpy(dtype=float)
    n_prec = len(geoids)

    manifest = json.loads(ASSIGN_MANIFEST.read_text())
    if manifest["precinct_geoids"] != geoids:
        die("GEOID order mismatch between map file and assignment manifest.")
    shape_rc = manifest["layout"]["shape"]
    assign = np.fromfile(ASSIGN_BIN, dtype=np.int8).reshape(shape_rc)
    if assign.shape != (n_prec, 5001):
        die(f"Assignment matrix shape {assign.shape}, expected ({n_prec}, 5001).")
    draws = assign[:, 1:]  # drop column 0 (cd_2020 reference); keep 5000 simulated
    if draws.min() < 1 or draws.max() > N_DISTRICTS:
        die(f"District labels out of range: [{draws.min()}, {draws.max()}].")

    # ── Per-precinct ensemble distribution of the containing district's pre_20 share ──
    print("Computing per-precinct containing-district share across 5000 draws...")
    n_draws = draws.shape[1]
    prec_share = np.empty((n_prec, n_draws), dtype=np.float64)
    for d in range(n_draws):
        col = draws[:, d]
        dem_by_k = np.bincount(col, weights=dem, minlength=N_DISTRICTS + 1)
        rep_by_k = np.bincount(col, weights=rep, minlength=N_DISTRICTS + 1)
        total = dem_by_k + rep_by_k
        share_by_k = np.divide(dem_by_k, total, out=np.zeros_like(dem_by_k), where=total > 0)
        prec_share[:, d] = share_by_k[col]

    pct = np.percentile(prec_share, [5, 25, 50, 75, 95], axis=1)  # (5, n_prec)

    # ── Enacted 2025 containing-district share per precinct (reproject + assign) ──
    print("Assigning precincts to the enacted 2025 plan...")
    transformer = Transformer.from_crs(SOURCE_CRS, "EPSG:4326", always_xy=True)
    prec_pts = []
    for i in range(n_prec):
        pt = build_geometry(frame["geometry"].iloc[i]).representative_point()
        lng, lat = transformer.transform(pt.x, pt.y)
        prec_pts.append((lng, lat))

    plan = json.loads(ENACTED_PLAN.read_text())
    plan_geoms, plan_keys = [], []
    for feature in plan["features"]:
        props = feature["properties"]
        plan_keys.append(str(props.get("district_number") or props.get("district_id")))
        plan_geoms.append(shape(feature["geometry"]))
    plan_tree = STRtree(plan_geoms)

    def assign_to_plan(lng, lat) -> int:
        p = Point(lng, lat)
        for idx in plan_tree.query(p):
            if plan_geoms[idx].contains(p):
                return idx
        return int(plan_tree.nearest(p))

    prec_plan_idx = np.array([assign_to_plan(lng, lat) for lng, lat in prec_pts])
    # Enacted district pre_20 shares.
    enacted_dem = np.bincount(prec_plan_idx, weights=dem, minlength=len(plan_geoms))
    enacted_rep = np.bincount(prec_plan_idx, weights=rep, minlength=len(plan_geoms))
    enacted_total = enacted_dem + enacted_rep
    enacted_share_by_district = np.divide(
        enacted_dem, enacted_total, out=np.zeros_like(enacted_dem), where=enacted_total > 0)
    dem_seats = int((enacted_share_by_district > 0.5).sum())
    print(f"Gate 3 (enacted 2025 pre_20 seats): {dem_seats} (headline 3)")
    if dem_seats != 3:
        die(f"Enacted 2025 scored {dem_seats} D seats; headline is 3.")

    prec_compared = enacted_share_by_district[prec_plan_idx]  # per-precinct enacted share
    # Mid-rank percentile of the enacted value within each precinct's neutral distribution.
    below = (prec_share < prec_compared[:, None]).sum(axis=1)
    equal = (prec_share == prec_compared[:, None]).sum(axis=1)
    prec_percentile = (below + equal / 2) / n_draws * 100

    # ── Project to populated r7 cells: cell -> containing precinct ──
    print("Projecting to populated r7 cells...")
    prec_wgs = []
    for i in range(n_prec):
        g = build_geometry(frame["geometry"].iloc[i])
        # Reproject polygon to WGS84 by transforming exterior/holes coordinates.
        prec_wgs.append(_reproject(g, transformer))
    prec_tree = STRtree(prec_wgs)

    cells = json.loads(CENSUS_H3.read_text())
    cell_units = []
    fallbacks = 0
    for c in cells:
        cell = c["h3"]
        lat, lng = h3.cell_to_latlng(cell)
        p = Point(lng, lat)
        containing = None
        for idx in prec_tree.query(p):
            if prec_wgs[idx].contains(p):
                containing = idx
                break
        if containing is None:
            containing = int(prec_tree.nearest(p))
            fallbacks += 1
        cell_units.append({
            "unitId": cell,
            "precinct": containing,
            "population": int(c.get("total_population", 0)),
            "percentiles": {
                "p5": round(float(pct[0, containing]), 4),
                "p25": round(float(pct[1, containing]), 4),
                "p50": round(float(pct[2, containing]), 4),
                "p75": round(float(pct[3, containing]), 4),
                "p95": round(float(pct[4, containing]), 4),
            },
            "comparedValue": round(float(prec_compared[containing]), 4),
            "comparedPercentile": round(float(prec_percentile[containing]), 1),
        })
    coverage = 1 - fallbacks / len(cells)
    print(f"Gate 4 (cell->precinct containment coverage): {coverage:.1%} "
          f"({fallbacks} fallbacks of {len(cells)})")
    if coverage < 0.99:
        die(f"Only {coverage:.1%} of cells found a containing precinct by point-in-polygon.")

    # ── Tail selection + summary ──
    # Strict < 5 / > 95 to match the UI's low_outlier / high_outlier band cutoffs exactly,
    # so the overlay shows precisely the cells the ensemble classifies as outliers.
    low = [u for u in cell_units if u["comparedPercentile"] < TAIL_LOW]
    high = [u for u in cell_units if u["comparedPercentile"] > TAIL_HIGH]
    total_pop = sum(u["population"] for u in cell_units)
    low_pop = sum(u["population"] for u in low)
    high_pop = sum(u["population"] for u in high)
    print(f"Divergence tails: {len(low)} cells < p{TAIL_LOW:.0f} ({low_pop:,} people, "
          f"{low_pop / total_pop:.1%}); {len(high)} cells > p{TAIL_HIGH:.0f} "
          f"({high_pop:,} people, {high_pop / total_pop:.1%}); total pop {total_pop:,}.")

    write_outputs(cell_units, low, high, {
        "totalCells": len(cell_units), "totalPop": total_pop,
        "lowCells": len(low), "lowPop": low_pop,
        "highCells": len(high), "highPop": high_pop,
        "coverage": round(coverage, 4), "demSeats": dem_seats,
    })


def _reproject(geom, transformer):
    """Reproject a shapely polygon/multipolygon by transforming its coordinates."""
    def rp(polygon: Polygon) -> Polygon:
        ext = [transformer.transform(x, y) for x, y in polygon.exterior.coords]
        holes = [[transformer.transform(x, y) for x, y in ring.coords] for ring in polygon.interiors]
        return Polygon(ext, holes)
    if isinstance(geom, MultiPolygon):
        return MultiPolygon([rp(g) for g in geom.geoms])
    return rp(geom)


def write_outputs(cell_units, low, high, stats) -> None:
    def strip(u):
        return {k: v for k, v in u.items() if k != "precinct"}

    # Ship both tails as the renderable unit measure (focused "where the outlier lives").
    tail_units = sorted(low + high, key=lambda u: u["comparedPercentile"])
    measure = {
        "measureId": "h3_containing_district_dem_share_pre20",
        "label": "Containing district Democratic share (2020 pres proxy)",
        "definition": (
            "For each simulated plan, the 2020-presidential two-party Democratic share of the "
            "congressional district that contains this cell's precinct; the percentiles span the "
            "5,000-plan neutral distribution, and comparedValue/comparedPercentile place the "
            "enacted 2025 map (SL 2025-95) within it. Low percentile = the enacted map places this "
            "location in a more Republican-leaning district than at least 95% of neutral plans would "
            "(a spatial pattern consistent with cracking, not a finding of it); high = a more "
            "Democratic-leaning district (consistent with packing). This is the containing district's "
            "aggregate lean projected onto the cell, NOT a statement about the cell residents' own "
            "vote or representation."
        ),
        "unitKeyType": "h3",
        "referencePlanId": "nc-2025-enacted-congressional",
        "h3Resolution": H3_RES,
        "selection": {
            "policy": f"divergence tails only: comparedPercentile < {TAIL_LOW} (low_outlier band) "
                      f"or > {TAIL_HIGH} (high_outlier band)",
            "shownCells": len(tail_units),
            "totalPopulatedCells": stats["totalCells"],
            "note": "Interior cells (within the neutral band) are omitted from the overlay by "
                    "design so the layer highlights where the enacted map diverges, not the whole "
                    "state; the full per-cell table is in nc-h3-localization-full.json.",
        },
        "units": [strip(u) for u in tail_units],
    }
    UNITS_OUT.write_text(json.dumps(measure, indent=2) + "\n")
    print(f"Wrote {UNITS_OUT.relative_to(ROOT)} ({len(tail_units)} tail cells)")

    FULL_OUT.write_text(json.dumps({
        "generatedFrom": "scripts/build-ensemble-h3-localization.py",
        "claimTag": "descriptive_with_assignment_caveat",
        "stats": stats,
        "units": [strip(u) for u in cell_units],
    }) + "\n")
    print(f"Wrote {FULL_OUT.relative_to(ROOT)} ({len(cell_units)} cells)")

    write_report(low, high, stats)
    print(f"Wrote {MD_OUT.relative_to(ROOT)}")


def write_report(low, high, stats) -> None:
    lines = []
    lines.append("# NC H3 Ensemble Localization — where the 2025 map's outlier lives\n")
    lines.append(
        "Generated by `scripts/build-ensemble-h3-localization.py` from ALARM's plan-assignment "
        "matrices (`NC_cd_2020_plans.rds`, extracted) + per-precinct `pre_20` returns "
        "(`NC_cd_2020_map.rds`), doi:10.7910/DVN/SLCD3E v15, CC0. Claim tag: "
        "`descriptive_with_assignment_caveat`.\n"
    )
    lines.append(
        "**What this is.** The headline finding says the enacted 2025 congressional map (SL "
        "2025-95) is a partisan outlier against ALARM's 5,000 neutral simulated plans (3 of 14 "
        "Democratic-leaning districts; median 6). This artifact projects that outlier onto the H3 "
        "grid so it is *spatial*, not just a single number: for each populated r7 cell we take the "
        "2020-presidential Democratic share of the district that contains it, build its distribution "
        "across the 5,000 neutral plans, and locate the enacted 2025 map within that distribution.\n"
    )
    lines.append(
        f"**Where the divergence concentrates.** Of {stats['totalCells']:,} populated r7 cells "
        f"({stats['totalPop']:,} people):\n"
    )
    lines.append(
        f"- **{stats['lowCells']:,} cells ({stats['lowPop']:,} people, "
        f"{stats['lowPop'] / stats['totalPop']:.1%})** fall in the **low-outlier band (below the 5th "
        "percentile)** of their own neutral distribution — the enacted map places them in a **more "
        "Republican-leaning district than at least 95% of neutral plans would** (a spatial pattern "
        "consistent with cracking, not a finding of it).\n"
        f"- **{stats['highCells']:,} cells ({stats['highPop']:,} people, "
        f"{stats['highPop'] / stats['totalPop']:.1%})** fall in the **high-outlier band (above the "
        "95th percentile)** — placed in a **more Democratic-leaning district than at least 95% of "
        "neutral plans would** (consistent with packing).\n"
    )
    lines.append("## How to read this — and what it is not\n")
    lines.append(
        "- This is the partisan lean of the **containing district**, projected onto the cell. It is "
        "**not** a claim about how the cell's own residents voted or are represented — inferring that "
        "would be an ecological error. It answers 'is this location swept into a district the neutral "
        "ensemble rarely draws here?', not 'were these voters diluted'.\n"
        "- Percentiles span ALARM's documented constraint set (0.5% population deviation, "
        "contiguity, compactness, county preservation, majority-minority targeting), so the baseline "
        "is 'neutral relative to those constraints', not neutral in the abstract.\n"
        "- Cell -> district assignment is by cell-center point-in-precinct-polygon then the precinct's "
        f"ensemble/enacted district; coverage {stats['coverage']:.1%}. The 2020 presidential proxy is "
        "a partisan-lean stand-in, not congressional performance.\n"
        "- Only the divergence tails are drawn in the overlay by design; the interior (cells the "
        "enacted map places within the neutral band) is omitted so the layer shows *where* the map "
        "departs from the ensemble, not a full-state wash.\n"
    )
    MD_OUT.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
