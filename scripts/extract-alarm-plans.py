#!/usr/bin/env python3
"""Extract ALARM's NC precinct->district assignment matrix from plans.rds.

Pure-Python (no R): the `rdata` package parses the R serialization directly.
The redist_plans object stores the assignment matrix as a `plans` attribute
(int matrix, precincts x draws) that data-frame-level readers drop; this
script walks the raw parse tree to recover it, verifies it against the
district-level tibble and the map's reference assignment, and emits a compact
binary artifact plus a manifest for downstream builders.

Run:
  uv run --with rdata --with pandas python3 scripts/extract-alarm-plans.py

Inputs (Harvard Dataverse doi:10.7910/DVN/SLCD3E, CC0):
  data/alarm/NC_cd_2020_plans.rds  (file id 6392711)
  data/alarm/NC_cd_2020_map.rds    (file id 6380468)

Outputs (data/ is gitignored; artifacts are re-derived, never tracked):
  data/alarm/derived/nc-plans-assignment.bin            int8, row-major
                                                        [precincts x draws]
  data/alarm/derived/nc-plans-assignment-manifest.json  dims, orderings,
                                                        gates, provenance

Hard gates (any failure exits non-zero, no artifact written):
  1. dims        matrix is [2666 x 5001]; map has 2666 rows; tibble has
                 5001 draws x 14 districts
  2. reference   matrix column 0 equals the map's cd_2020 assignment for
                 every precinct
  3. population  for every draw, precinct populations summed by assigned
                 district reproduce the tibble's total_pop exactly
  4. labels      every draw uses district labels 1..14, all present
"""

from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
PLANS_RDS = ROOT / "data/alarm/NC_cd_2020_plans.rds"
MAP_RDS = ROOT / "data/alarm/NC_cd_2020_map.rds"
OUT_DIR = ROOT / "data/alarm/derived"
BIN_OUT = OUT_DIR / "nc-plans-assignment.bin"
MANIFEST_OUT = OUT_DIR / "nc-plans-assignment-manifest.json"

DATASET_DOI_URL = "https://doi.org/10.7910/DVN/SLCD3E"
CITATION = (
    "McCartan, Kenny, Simko, Kuriwaki, Garcia, Wang, Wu, Ebowe, O'Sullivan, "
    "Samarth, Arora, Gao, Zhao & Imai, \"50-State Redistricting Simulations\" "
    "(Harvard Dataverse, doi:10.7910/DVN/SLCD3E, version 15), files "
    "NC_cd_2020_plans.rds and NC_cd_2020_map.rds."
)

EXPECTED_PRECINCTS = 2666
EXPECTED_DRAWS = 5001  # cd_2020 reference + 5000 simulated
EXPECTED_DISTRICTS = 14

missing = [p for p in (PLANS_RDS, MAP_RDS) if not p.exists()]
if missing:
    names = "\n  ".join(str(p) for p in missing)
    sys.exit(
        f"Missing input(s):\n  {names}\n\n"
        "Download the ALARM NC 2020 congressional files (CC0) first:\n"
        "  mkdir -p data/alarm\n"
        "  curl -sL 'https://dataverse.harvard.edu/api/access/datafile/6392711'"
        " -o data/alarm/NC_cd_2020_plans.rds\n"
        "  curl -sL 'https://dataverse.harvard.edu/api/access/datafile/6380468'"
        " -o data/alarm/NC_cd_2020_map.rds\n"
    )

import rdata  # noqa: E402


def find_plans_matrix(node, depth=0):
    """Depth-first search of the raw parse tree for the `plans` attribute.

    rdata's pairlist layout is version-sensitive, so instead of hardcoding a
    path we look for any attribute tagged `plans` whose value carries a `dim`
    attribute — the redist assignment matrix.
    """
    if node is None or depth > 12:
        return None
    tag = getattr(node, "tag", None)
    if tag is not None:
        tag_value = getattr(tag, "value", None)
        name = None
        if isinstance(tag_value, bytes):
            name = tag_value.decode()
        elif hasattr(tag_value, "value") and isinstance(tag_value.value, bytes):
            name = tag_value.value.decode()
        if name == "plans":
            value = node.value
            car = value[0] if isinstance(value, (list, tuple)) else value
            data = getattr(car, "value", None)
            if isinstance(data, np.ndarray):
                dim = find_dim(car)
                if dim is not None:
                    return data, dim
    value = getattr(node, "value", None)
    if isinstance(value, (list, tuple)):
        for child in value:
            if hasattr(child, "info"):
                found = find_plans_matrix(child, depth + 1)
                if found is not None:
                    return found
    found = find_plans_matrix(getattr(node, "attributes", None), depth + 1)
    if found is not None:
        return found
    return None


def find_dim(node, depth=0):
    if node is None or depth > 6:
        return None
    attrs = getattr(node, "attributes", None)
    while attrs is not None:
        tag = getattr(attrs, "tag", None)
        name = None
        if tag is not None:
            tag_value = getattr(tag, "value", None)
            if isinstance(tag_value, bytes):
                name = tag_value.decode()
            elif hasattr(tag_value, "value") and isinstance(tag_value.value, bytes):
                name = tag_value.value.decode()
        value = getattr(attrs, "value", None)
        car = value[0] if isinstance(value, (list, tuple)) else value
        if name == "dim":
            dim = getattr(car, "value", None)
            if isinstance(dim, np.ndarray):
                return dim.tolist()
        attrs = value[1] if isinstance(value, (list, tuple)) and len(value) > 1 else None
        if attrs is not None and not hasattr(attrs, "tag"):
            attrs = None
    return None


print("Parsing plans.rds (raw tree, hunting the `plans` attribute)...")
parsed = rdata.parser.parse_file(PLANS_RDS)
found = find_plans_matrix(parsed.object)
if found is None:
    sys.exit("GATE FAIL: no `plans` matrix attribute found in NC_cd_2020_plans.rds")
raw, dim = found

with warnings.catch_warnings():
    warnings.simplefilter("ignore")  # redist_plans/tbl_df fall back to data.frame
    tibble = rdata.read_rds(PLANS_RDS)
    nc_map = rdata.read_rds(MAP_RDS)

# ── Gate 1: dimensions ───────────────────────────────────────────────────────
if dim != [EXPECTED_PRECINCTS, EXPECTED_DRAWS]:
    sys.exit(f"GATE FAIL dims: plans matrix dim {dim}, expected [{EXPECTED_PRECINCTS}, {EXPECTED_DRAWS}]")
if len(nc_map) != EXPECTED_PRECINCTS:
    sys.exit(f"GATE FAIL dims: map has {len(nc_map)} precincts, expected {EXPECTED_PRECINCTS}")
if len(tibble) != EXPECTED_DRAWS * EXPECTED_DISTRICTS:
    sys.exit(
        f"GATE FAIL dims: tibble has {len(tibble)} rows, expected "
        f"{EXPECTED_DRAWS} draws x {EXPECTED_DISTRICTS} districts"
    )

# R stores matrices column-major; reshape then transpose to [precincts, draws].
matrix = np.asarray(raw, dtype=np.int64).reshape(EXPECTED_DRAWS, EXPECTED_PRECINCTS).T
print(f"matrix: {matrix.shape[0]} precincts x {matrix.shape[1]} draws")

# ── Gate 2: reference alignment ──────────────────────────────────────────────
reference = np.asarray(nc_map["cd_2020"], dtype=np.int64)
mismatches = int((matrix[:, 0] != reference).sum())
if mismatches:
    sys.exit(f"GATE FAIL reference: matrix column 0 differs from map cd_2020 at {mismatches} precincts")
print("gate reference: matrix column 0 == map cd_2020 for all precincts")

# ── Gate 3: population closure, every draw ───────────────────────────────────
prec_pop = np.asarray(nc_map["pop"], dtype=np.int64)
expected_pop = (
    np.asarray(tibble["total_pop"], dtype=np.int64)
    .reshape(EXPECTED_DRAWS, EXPECTED_DISTRICTS)
)
# districts are labeled 1..14; bincount per draw column
computed_pop = np.zeros((EXPECTED_DRAWS, EXPECTED_DISTRICTS), dtype=np.int64)
for draw in range(EXPECTED_DRAWS):
    counts = np.bincount(matrix[:, draw], weights=prec_pop, minlength=EXPECTED_DISTRICTS + 1)
    computed_pop[draw] = counts[1:].astype(np.int64)
pop_mismatch_draws = int((computed_pop != expected_pop).any(axis=1).sum())
if pop_mismatch_draws:
    sys.exit(f"GATE FAIL population: recomputed district populations differ in {pop_mismatch_draws} draws")
print(f"gate population: district populations reproduce total_pop exactly in all {EXPECTED_DRAWS} draws")

# ── Gate 4: district labels ──────────────────────────────────────────────────
lo, hi = int(matrix.min()), int(matrix.max())
if lo != 1 or hi != EXPECTED_DISTRICTS:
    sys.exit(f"GATE FAIL labels: assignments span {lo}..{hi}, expected 1..{EXPECTED_DISTRICTS}")
per_draw_districts = np.array([len(np.unique(matrix[:, d])) for d in range(EXPECTED_DRAWS)])
short_draws = int((per_draw_districts != EXPECTED_DISTRICTS).sum())
if short_draws:
    sys.exit(f"GATE FAIL labels: {short_draws} draws are missing at least one district")
print("gate labels: every draw assigns all 14 districts")

# ── Emit ─────────────────────────────────────────────────────────────────────
OUT_DIR.mkdir(parents=True, exist_ok=True)
BIN_OUT.write_bytes(matrix.astype(np.int8).tobytes(order="C"))

draw_labels = ["cd_2020"] + [str(i) for i in range(1, EXPECTED_DRAWS)]
manifest = {
    "artifact": BIN_OUT.name,
    "layout": {
        "dtype": "int8",
        "order": "row-major",
        "shape": [EXPECTED_PRECINCTS, EXPECTED_DRAWS],
        "rows": "precincts, in NC_cd_2020_map.rds row order (GEOIDs below)",
        "columns": "draws: column 0 is the cd_2020 reference plan, then simulated draws 1..5000",
        "values": "congressional district label 1..14",
    },
    "draws": {"count": EXPECTED_DRAWS, "first": draw_labels[0], "simulated": EXPECTED_DRAWS - 1},
    "precinct_geoids": [str(g) for g in nc_map["GEOID"]],
    "gates": {
        "dims": f"[{EXPECTED_PRECINCTS}, {EXPECTED_DRAWS}] confirmed",
        "reference_alignment": "matrix column 0 == map cd_2020, 0 mismatches",
        "population_closure": f"total_pop reproduced exactly for all {EXPECTED_DRAWS} draws",
        "district_labels": "1..14, all present in every draw",
    },
    "provenance": {
        "dataset": DATASET_DOI_URL,
        "citation": CITATION,
        "files": {
            "NC_cd_2020_plans.rds": "Dataverse file id 6392711",
            "NC_cd_2020_map.rds": "Dataverse file id 6380468",
        },
        "extraction": "scripts/extract-alarm-plans.py (pure Python, rdata package)",
        "license": "CC0",
    },
    "claim_tag": "descriptive",
}
MANIFEST_OUT.write_text(json.dumps(manifest, indent=2) + "\n")
size_mb = BIN_OUT.stat().st_size / 1e6
print(f"wrote {BIN_OUT.relative_to(ROOT)} ({size_mb:.1f} MB) and {MANIFEST_OUT.relative_to(ROOT)}")
