#!/usr/bin/env python3
"""
Recompute the ensemble's seat distribution from ALARM's plan-assignment matrices,
and characterize the lower tail on a continuous measure.

Why this exists
---------------
The headline stat currently reports a *count* — "3 of 5,000 simulated plans produce
3 or fewer Democratic-leaning seats" — which makes the enacted 2025 map (SL 2025-95)
look like it merely TIES the ensemble's observed minimum. Seat count is a discrete
measure with a sparsely-sampled tail, so ties are an artifact of granularity, not a
statement that the enacted map is ordinary.

This script does two things the published-stats pipeline cannot:

  1. Recomputes every draw's per-district Democratic share directly from the extracted
     assignment matrix + ALARM's own per-precinct pre_20 returns. The resulting seat
     histogram is gated against ALARM's published histogram — an independent
     consistency check on our whole normalization (the check the ensemble payload's
     "draft" status is waiting on).

  2. Ranks each plan's districts by Democratic share and reads off the 4th-ranked
     district — the district that would have to flip to yield a 4th Democratic seat.
     That share is CONTINUOUS, so it orders plans that tie on seat count. It answers
     "how deep into the tail is the enacted map?" rather than "did it tie the floor?"

Claim discipline
----------------
The simulated draws use ALARM's exact precinct->district assignment. The enacted 2025
plan is not in ALARM's ensemble and is scored by precinct representative-point
assignment (the same shortcut the rest of the pipeline uses), so its values carry
`descriptive_with_assignment_caveat`. The centroid calibration bound is 0.12pp at
district level; this script reports the enacted margin so the bound can be compared
against it directly rather than assumed to be clear.

Outputs
  docs/research/outputs/alarm-ensemble/nc-ensemble-seat-recompute.json
  docs/research/outputs/alarm-ensemble/nc-ensemble-seat-recompute.md

Run:
  uv run --with rdata --with shapely --with pyproj --with numpy --with scipy python3 \
    scripts/recompute-ensemble-seats.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import rdata
from pyproj import Transformer
from scipy.stats import beta
from shapely.geometry import MultiPolygon, Point, Polygon, shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
MAP_RDS = ROOT / "data/alarm/NC_cd_2020_map.rds"
ASSIGN_BIN = ROOT / "data/alarm/derived/nc-plans-assignment.bin"
ASSIGN_MANIFEST = ROOT / "data/alarm/derived/nc-plans-assignment-manifest.json"
ENSEMBLE = ROOT / "public/data/ensembles/nc-congress-2020-alarm.json"
ENACTED_PLAN = ROOT / "public/data/plans/nc-2025-enacted-congressional.json"

JSON_OUT = ROOT / "docs/research/outputs/alarm-ensemble/nc-ensemble-seat-recompute.json"
MD_OUT = ROOT / "docs/research/outputs/alarm-ensemble/nc-ensemble-seat-recompute.md"

SOURCE_CRS = "EPSG:32119"
N_DISTRICTS = 14
ENACTED_SEATS = 3          # headline: 3 of 14 under pre_20
# Rank of the district that would have to flip to add one more Democratic seat.
# 0-based: with ENACTED_SEATS Democratic districts, ranks 0..ENACTED_SEATS-1 are >50%,
# so rank ENACTED_SEATS is the "next seat up" district.
NEXT_SEAT_RANK = ENACTED_SEATS
# District-level error bound of the representative-point shortcut, from the ALARM
# reference calibration (see ROADMAP 2026-07-03 / ensemble payload caveat 3).
CENTROID_BOUND_PP = 0.12


def die(msg: str) -> None:
    print(f"GATE FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def build_geometry(raw) -> MultiPolygon | Polygon:
    polys = []
    for poly in raw:
        rings = [np.asarray(ring) for ring in poly]
        polys.append(Polygon(rings[0], rings[1:] if len(rings) > 1 else None))
    return MultiPolygon(polys) if len(polys) > 1 else polys[0]


def clopper_pearson(k: int, n: int, level: float = 0.95) -> tuple[float, float]:
    """Exact binomial confidence interval. k successes in n trials."""
    alpha = 1.0 - level
    lo = 0.0 if k == 0 else float(beta.ppf(alpha / 2, k, n - k + 1))
    hi = 1.0 if k == n else float(beta.ppf(1 - alpha / 2, k + 1, n - k))
    return lo, hi


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
    assign = np.fromfile(ASSIGN_BIN, dtype=np.int8).reshape(manifest["layout"]["shape"])
    if assign.shape != (n_prec, 5001):
        die(f"Assignment matrix shape {assign.shape}, expected ({n_prec}, 5001).")
    draws = assign[:, 1:]
    if draws.min() < 1 or draws.max() > N_DISTRICTS:
        die(f"District labels out of range: [{draws.min()}, {draws.max()}].")
    n_draws = draws.shape[1]

    # ── Per-draw district shares, seat counts, and rank-sorted share profile ──────
    print(f"Recomputing district shares for {n_draws} draws...")
    sorted_shares = np.empty((n_draws, N_DISTRICTS), dtype=np.float64)
    seats = np.empty(n_draws, dtype=np.int64)
    for d in range(n_draws):
        col = draws[:, d]
        dem_by_k = np.bincount(col, weights=dem, minlength=N_DISTRICTS + 1)[1:]
        rep_by_k = np.bincount(col, weights=rep, minlength=N_DISTRICTS + 1)[1:]
        total = dem_by_k + rep_by_k
        share = np.divide(dem_by_k, total, out=np.zeros_like(dem_by_k), where=total > 0)
        # Descending: rank 0 is the most Democratic district.
        sorted_shares[d] = np.sort(share)[::-1]
        seats[d] = int((share > 0.5).sum())

    # ── GATE 1: recomputed histogram must equal ALARM's published histogram ───────
    ensemble = json.loads(ENSEMBLE.read_text())
    published = {int(b["value"]): int(b["planCount"])
                 for b in ensemble["seatMeasure"]["histogram"]}
    recomputed = {int(v): int(c) for v, c in zip(*np.unique(seats, return_counts=True))}
    if recomputed != published:
        die("Recomputed seat histogram does not match ALARM's published histogram.\n"
            f"  published:  {dict(sorted(published.items()))}\n"
            f"  recomputed: {dict(sorted(recomputed.items()))}")
    print(f"Gate 1 (histogram reproduces ALARM published): OK {dict(sorted(recomputed.items()))}")

    # ── Enacted 2025 plan: same measure, representative-point assignment ──────────
    print("Scoring the enacted 2025 plan (SL 2025-95)...")
    transformer = Transformer.from_crs(SOURCE_CRS, "EPSG:4326", always_xy=True)
    prec_pts = []
    for i in range(n_prec):
        pt = build_geometry(frame["geometry"].iloc[i]).representative_point()
        prec_pts.append(transformer.transform(pt.x, pt.y))

    plan = json.loads(ENACTED_PLAN.read_text())
    plan_geoms = [shape(f["geometry"]) for f in plan["features"]]
    if len(plan_geoms) != N_DISTRICTS:
        die(f"Enacted plan has {len(plan_geoms)} districts, expected {N_DISTRICTS}.")
    tree = STRtree(plan_geoms)

    def assign_to_plan(lng, lat) -> int:
        p = Point(lng, lat)
        for idx in tree.query(p):
            if plan_geoms[idx].contains(p):
                return idx
        return int(tree.nearest(p))

    prec_idx = np.array([assign_to_plan(lng, lat) for lng, lat in prec_pts])
    e_dem = np.bincount(prec_idx, weights=dem, minlength=N_DISTRICTS)
    e_rep = np.bincount(prec_idx, weights=rep, minlength=N_DISTRICTS)
    e_total = e_dem + e_rep
    e_share = np.divide(e_dem, e_total, out=np.zeros_like(e_dem), where=e_total > 0)
    e_sorted = np.sort(e_share)[::-1]
    e_seats = int((e_share > 0.5).sum())

    # ── GATE 2: enacted seat count must reproduce the headline ────────────────────
    if e_seats != ENACTED_SEATS:
        die(f"Enacted 2025 scored {e_seats} D seats; headline is {ENACTED_SEATS}.")
    print(f"Gate 2 (enacted 2025 seats reproduces headline): OK {e_seats}")

    # ── Discrete tail: the count-based statement, with an exact interval ──────────
    at_or_below = int((seats <= ENACTED_SEATS).sum())
    below = int((seats < ENACTED_SEATS).sum())
    ci_lo, ci_hi = clopper_pearson(at_or_below, n_draws)

    # ── Continuous tail: the "next seat up" district share ────────────────────────
    # Lower value = further from winning another Democratic seat = deeper into the
    # Republican-favorable tail. This orders plans that tie on seat count.
    draw_next = sorted_shares[:, NEXT_SEAT_RANK]
    e_next = float(e_sorted[NEXT_SEAT_RANK])
    e_margin_pp = (0.5 - e_next) * 100.0

    n_below = int((draw_next < e_next).sum())
    n_equal = int((draw_next == e_next).sum())
    e_next_percentile = (n_below + n_equal / 2) / n_draws * 100.0
    strictly_below_all = n_below == 0 and n_equal == 0

    # The tie plans: draws that match the enacted seat count exactly.
    tie_mask = seats == ENACTED_SEATS
    tie_next = draw_next[tie_mask]
    tie_margins_pp = [(0.5 - float(v)) * 100.0 for v in np.sort(tie_next)[::-1]]
    deeper_than_all_ties = bool(tie_next.size and e_next < tie_next.min())

    # ── GATE 3: the continuous claim must clear the centroid calibration bound ────
    # The enacted plan is centroid-assigned; a separation smaller than the bound is
    # not robust and must not be claimed.
    if tie_next.size:
        sep_pp = (float(tie_next.min()) - e_next) * 100.0
        if deeper_than_all_ties and sep_pp <= CENTROID_BOUND_PP:
            die(f"Enacted plan is deeper than the tie plans by only {sep_pp:.3f}pp, "
                f"within the {CENTROID_BOUND_PP}pp centroid bound — not robust, do not claim.")
        print(f"Gate 3 (separation vs tie plans clears {CENTROID_BOUND_PP}pp bound): "
              f"OK {sep_pp:.2f}pp")
    else:
        sep_pp = None

    result = {
        "generatedBy": "scripts/recompute-ensemble-seats.py",
        "source": {
            "assignmentMatrix": str(ASSIGN_BIN.relative_to(ROOT)),
            "returns": "NC_cd_2020_map.rds pre_20_dem_bid / pre_20_rep_tru",
            "doi": "10.7910/DVN/SLCD3E",
            "drawCount": n_draws,
        },
        "consistencyCheck": {
            "publishedHistogram": dict(sorted(published.items())),
            "recomputedHistogram": dict(sorted(recomputed.items())),
            "match": True,
            "note": ("Seat histogram recomputed independently from the assignment matrices "
                     "reproduces ALARM's published statistics exactly."),
        },
        "discreteTail": {
            "measure": "Democratic-leaning seats of 14 (pre_20 two-party > 50%)",
            "enactedSeats": e_seats,
            "plansAtOrBelow": at_or_below,
            "plansBelow": below,
            "planCount": n_draws,
            "shareAtOrBelowPct": at_or_below / n_draws * 100.0,
            "exactBinomial95CI": {
                "lowerPct": ci_lo * 100.0,
                "upperPct": ci_hi * 100.0,
                "method": "Clopper-Pearson",
            },
            "note": ("The enacted map ties the ensemble's observed minimum: no simulated plan "
                     "produces fewer, and a small number produce the same count. The count is "
                     "an estimate of a tail probability from few events — the interval, not the "
                     "raw count, is the defensible statement."),
        },
        "continuousTail": {
            "measure": (f"Democratic two-party share of the {NEXT_SEAT_RANK + 1}th-ranked "
                        "district — the district that would have to flip to add a "
                        "Democratic seat"),
            "enactedShare": e_next,
            "enactedMarginPp": e_margin_pp,
            "percentile": e_next_percentile,
            "plansStrictlyBelow": n_below,
            "plansEqual": n_equal,
            "strictlyBelowAllDraws": strictly_below_all,
            "tiePlans": {
                "count": int(tie_next.size),
                "marginsPp": tie_margins_pp,
                "enactedDeeperThanAll": deeper_than_all_ties,
                "separationPp": sep_pp,
            },
            "claimTag": "descriptive_with_assignment_caveat",
            "note": ("Simulated draws use ALARM's exact assignment; the enacted plan uses "
                     "precinct representative-point assignment, bounded at "
                     f"{CENTROID_BOUND_PP}pp at district level."),
        },
    }
    JSON_OUT.parent.mkdir(parents=True, exist_ok=True)
    JSON_OUT.write_text(json.dumps(result, indent=2) + "\n")
    write_report(result)
    print(f"\nWrote {JSON_OUT.relative_to(ROOT)}")
    print(f"Wrote {MD_OUT.relative_to(ROOT)}")

    print("\n── Headline-relevant numbers ─────────────────────────────")
    print(f"  seats: {e_seats}; plans at or below: {at_or_below}/{n_draws} "
          f"({at_or_below / n_draws * 100:.2f}%), 95% CI "
          f"[{ci_lo * 100:.3f}%, {ci_hi * 100:.3f}%]")
    print(f"  next-seat-up district share: enacted {e_next * 100:.2f}% "
          f"({e_margin_pp:.2f}pp from a 4th seat)")
    print(f"  continuous percentile: {e_next_percentile:.3f} "
          f"({n_below} draws strictly below, {n_equal} equal)")
    if tie_next.size:
        print(f"  tie plans ({tie_next.size}) margins: "
              f"{', '.join(f'{m:.2f}pp' for m in tie_margins_pp)}")
        print(f"  enacted deeper than every tie plan: {deeper_than_all_ties} "
              f"(separation {sep_pp:.2f}pp)")


def write_report(r: dict) -> None:
    d, c = r["discreteTail"], r["continuousTail"]
    lines = [
        "# NC ensemble — seat distribution recomputed from assignment matrices",
        "",
        "Independent recomputation of the ALARM NC 2020 congressional ensemble's seat",
        "distribution from the extracted plan-assignment matrices and ALARM's own",
        "per-precinct 2020 presidential returns, plus a continuous characterization of the",
        "lower tail. Generated by `scripts/recompute-ensemble-seats.py`.",
        "",
        "## Consistency check (the draft→published gate)",
        "",
        f"Recomputed histogram: `{r['consistencyCheck']['recomputedHistogram']}`",
        "",
        "This reproduces ALARM's published seat histogram **exactly**, computed by a path that",
        "shares no code with the published-statistics pipeline: assignment matrices from",
        "`NC_cd_2020_plans.rds` aggregated against per-precinct `pre_20` returns from",
        "`NC_cd_2020_map.rds`. It is a genuine cross-check of our normalization, not a restatement.",
        "",
        "## The discrete statement, with an interval",
        "",
        f"- Enacted 2025 plan (SL 2025-95): **{d['enactedSeats']} Democratic-leaning seats of 14**.",
        f"- Simulated plans at or below that count: **{d['plansAtOrBelow']} of {d['planCount']}** "
        f"({d['shareAtOrBelowPct']:.2f}%). Plans strictly below: **{d['plansBelow']}**.",
        f"- Exact binomial (Clopper-Pearson) 95% interval on that tail probability: "
        f"**{d['exactBinomial95CI']['lowerPct']:.3f}% – {d['exactBinomial95CI']['upperPct']:.3f}%**.",
        "",
        "The enacted map **ties** the ensemble's observed minimum — no simulated plan produces",
        "fewer Democratic-leaning seats, and a small number produce the same count. Seat count is",
        "a discrete measure with a sparsely sampled tail, so that tie reflects the granularity of",
        "the measure, not the ordinariness of the map. Report the interval, not the bare count.",
        "",
        "## The continuous statement (this is the stronger one)",
        "",
        f"Measure: {c['measure']}.",
        "",
        f"- Enacted 2025: **{c['enactedShare'] * 100:.2f}%** — "
        f"**{c['enactedMarginPp']:.2f}pp** short of a 4th Democratic seat.",
        f"- Position in the ensemble: **{c['percentile']:.3f}th percentile** "
        f"({c['plansStrictlyBelow']} of {d['planCount']} draws strictly below).",
    ]
    tp = c["tiePlans"]
    if tp["count"]:
        margins = ", ".join(f"{m:.2f}pp" for m in tp["marginsPp"])
        lines += [
            f"- The {tp['count']} simulated plan(s) that tie on seat count sit "
            f"{margins} short of a 4th seat.",
        ]
        if tp["enactedDeeperThanAll"]:
            lines += [
                "",
                f"**The enacted map is further from a 4th Democratic seat than every simulated",
                f"plan that matches its seat count** — by {tp['separationPp']:.2f}pp, which clears",
                f"the {CENTROID_BOUND_PP}pp district-level bound on our assignment shortcut. The tie",
                "on seat count resolves into a strict ordering once the measure is continuous.",
            ]
    lines += [
        "",
        "## Claim discipline",
        "",
        f"- Tag: `{c['claimTag']}`.",
        "- Simulated draws use ALARM's exact precinct→district assignment. The enacted plan is",
        "  not in ALARM's ensemble and is scored by precinct representative-point assignment;",
        f"  the district-level bound on that shortcut is {CENTROID_BOUND_PP}pp, and the separation",
        "  above is reported so the bound can be checked against it rather than assumed clear.",
        "- Percentile position describes where a plan sits inside a simulated distribution with a",
        "  documented constraint set. It is not evidence of intent or legal injury, and it cannot",
        "  show whether deviations were legally required.",
        "- Seat and share measures use the 2020 presidential two-party vote as a partisan-lean",
        "  proxy, not congressional election results.",
        "",
    ]
    MD_OUT.parent.mkdir(parents=True, exist_ok=True)
    MD_OUT.write_text("\n".join(lines))


if __name__ == "__main__":
    main()
