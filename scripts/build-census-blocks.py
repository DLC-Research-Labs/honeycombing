#!/usr/bin/env python3
"""
Build Census PL 94-171 block demographic records for Honeycombing.

The script joins Census API redistricting table rows to TIGER/Line 2020
tabulation block internal points. It intentionally writes county/state slices
instead of a single national payload; the national block geometry files are too
large for a client-side first pass.

Example:
  python3 scripts/build-census-blocks.py --state 37 --county 001
  python3 scripts/build-census-blocks.py --state 37 --county 001 --dry-run
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path
from typing import Any

import geopandas as gpd
import requests


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DEFAULT_CACHE_DIR = PROJECT_DIR / "data" / "census"
DEFAULT_OUT_DIR = PROJECT_DIR / "public" / "data" / "census"

PL_BASE_URL = "https://api.census.gov/data/2020/dec/pl"
TIGER_BASE_URL = "https://www2.census.gov/geo/tiger/TIGER2020PL/STATE"

STATE_FOLDERS = {
    "01": "01_ALABAMA",
    "02": "02_ALASKA",
    "04": "04_ARIZONA",
    "05": "05_ARKANSAS",
    "06": "06_CALIFORNIA",
    "08": "08_COLORADO",
    "09": "09_CONNECTICUT",
    "10": "10_DELAWARE",
    "11": "11_DISTRICT_OF_COLUMBIA",
    "12": "12_FLORIDA",
    "13": "13_GEORGIA",
    "15": "15_HAWAII",
    "16": "16_IDAHO",
    "17": "17_ILLINOIS",
    "18": "18_INDIANA",
    "19": "19_IOWA",
    "20": "20_KANSAS",
    "21": "21_KENTUCKY",
    "22": "22_LOUISIANA",
    "23": "23_MAINE",
    "24": "24_MARYLAND",
    "25": "25_MASSACHUSETTS",
    "26": "26_MICHIGAN",
    "27": "27_MINNESOTA",
    "28": "28_MISSISSIPPI",
    "29": "29_MISSOURI",
    "30": "30_MONTANA",
    "31": "31_NEBRASKA",
    "32": "32_NEVADA",
    "33": "33_NEW_HAMPSHIRE",
    "34": "34_NEW_JERSEY",
    "35": "35_NEW_MEXICO",
    "36": "36_NEW_YORK",
    "37": "37_NORTH_CAROLINA",
    "38": "38_NORTH_DAKOTA",
    "39": "39_OHIO",
    "40": "40_OKLAHOMA",
    "41": "41_OREGON",
    "42": "42_PENNSYLVANIA",
    "44": "44_RHODE_ISLAND",
    "45": "45_SOUTH_CAROLINA",
    "46": "46_SOUTH_DAKOTA",
    "47": "47_TENNESSEE",
    "48": "48_TEXAS",
    "49": "49_UTAH",
    "50": "50_VERMONT",
    "51": "51_VIRGINIA",
    "53": "53_WASHINGTON",
    "54": "54_WEST_VIRGINIA",
    "55": "55_WISCONSIN",
    "56": "56_WYOMING",
    "72": "72_PUERTO_RICO",
}

PL_FIELDS = {
    "P1_001N": "total_population",
    "P1_003N": "white_alone",
    "P1_004N": "black_alone",
    "P1_005N": "american_indian_alaska_native_alone",
    "P1_006N": "asian_alone",
    "P1_007N": "native_hawaiian_pacific_islander_alone",
    "P1_008N": "some_other_race_alone",
    "P1_009N": "two_or_more_races",
    "P2_002N": "hispanic_or_latino",
    "P2_005N": "non_hispanic_white_alone",
    "P3_001N": "voting_age_population",
    "P3_003N": "vap_white_alone",
    "P3_004N": "vap_black_alone",
    "P4_002N": "vap_hispanic_or_latino",
    "P4_005N": "vap_non_hispanic_white_alone",
}


def fips(value: str, width: int) -> str:
    normalized = value.strip()
    if not normalized.isdigit():
        raise ValueError(f"FIPS values must be numeric: {value!r}")
    return normalized.zfill(width)


def tiger_block_url(state: str) -> str:
    folder = STATE_FOLDERS[state]
    return f"{TIGER_BASE_URL}/{folder}/{state}/tl_2020_{state}_tabblock20.zip"


def pl_block_params(state: str, county: str) -> dict[str, str]:
    fields = ["NAME", *PL_FIELDS.keys()]
    return {
        "get": ",".join(fields),
        "for": "block:*",
        "in": f"state:{state} county:{county} tract:*",
    }


def pl_county_params(state: str) -> dict[str, str]:
    return {"get": "NAME", "for": "county:*", "in": f"state:{state}"}


def api_get(params: dict[str, str]) -> list[list[str]]:
    response = requests.get(PL_BASE_URL, params=params, timeout=120)
    response.raise_for_status()
    return response.json()


def list_counties(state: str) -> list[str]:
    rows = api_get(pl_county_params(state))
    header, *data_rows = rows
    county_index = header.index("county")
    return [row[county_index] for row in data_rows]


def download_file(url: str, path: Path, force: bool = False) -> None:
    if path.exists() and not force:
        print(f"Using cached {path}")
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    print(f"Downloading {url}")
    with requests.get(url, stream=True, timeout=120) as response:
        response.raise_for_status()
        with open(tmp_path, "wb") as fh:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    fh.write(chunk)
    tmp_path.replace(path)


def load_block_points(zip_path: Path, county: str | None = None) -> dict[str, dict[str, Any]]:
    gdf = gpd.read_file(f"zip://{zip_path}")
    if county is not None:
        gdf = gdf[gdf["COUNTYFP20"] == county]

    points: dict[str, dict[str, Any]] = {}
    for _, row in gdf.iterrows():
        geoid = str(row["GEOID20"])
        try:
            lat = float(row["INTPTLAT20"])
            lng = float(row["INTPTLON20"])
        except (TypeError, ValueError, KeyError):
            point = row.geometry.representative_point()
            lat = float(point.y)
            lng = float(point.x)

        points[geoid] = {
            "lat": round(lat, 7),
            "lng": round(lng, 7),
            "state_fips": str(row["STATEFP20"]),
            "county_fips": str(row["COUNTYFP20"]),
            "tract": str(row["TRACTCE20"]),
            "block": str(row["BLOCKCE20"]),
        }
    return points


def parse_int(value: str) -> int:
    return int(value) if value else 0


def build_block_records(state: str, county: str, points: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows = api_get(pl_block_params(state, county))
    header, *data_rows = rows
    indexes = {name: header.index(name) for name in header}

    records: list[dict[str, Any]] = []
    missing_points = 0
    for row in data_rows:
        geoid = f"{row[indexes['state']]}{row[indexes['county']]}{row[indexes['tract']]}{row[indexes['block']]}"
        point = points.get(geoid)
        if point is None:
            missing_points += 1
            continue

        record: dict[str, Any] = {
            "geoid": geoid,
            "name": row[indexes["NAME"]],
            **point,
        }
        for field, output_name in PL_FIELDS.items():
            record[output_name] = parse_int(row[indexes[field]])
        records.append(record)

    print(f"  blocks: {len(records):,} joined; {missing_points:,} without TIGER points")
    return records


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as fh:
        if compact:
            json.dump(payload, fh, separators=(",", ":"))
        else:
            json.dump(payload, fh, indent=2)
            fh.write("\n")


def build_for_county(
    state: str,
    county: str,
    points: dict[str, dict[str, Any]],
    out_dir: Path,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    print(f"Fetching PL 94-171 rows for {state}-{county}")
    records = build_block_records(state, county, points)
    out_path = out_dir / f"census-blocks-{state}-{county}-2020.json"
    write_json(out_path, records, compact=True)

    size_mb = out_path.stat().st_size / 1024 / 1024
    print(f"  wrote {out_path} ({size_mb:.1f} MB)")
    summary = {
        "state": state,
        "county": county,
        "records": len(records),
        "output": str(out_path.relative_to(PROJECT_DIR)),
        "size_mb": round(size_mb, 2),
    }
    return summary, records


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Census PL 94-171 block records")
    parser.add_argument("--state", required=True, help="State FIPS, e.g. 37 for North Carolina")
    parser.add_argument("--county", help="County FIPS, e.g. 001. Omit only with --all-counties")
    parser.add_argument("--all-counties", action="store_true", help="Build every county in the state")
    parser.add_argument("--cache-dir", default=str(DEFAULT_CACHE_DIR), help="Download/cache directory")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="Output directory")
    parser.add_argument("--force-download", action="store_true", help="Redownload TIGER zip even if cached")
    parser.add_argument("--dry-run", action="store_true", help="Print source URLs and exit")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    state = fips(args.state, 2)
    if state not in STATE_FOLDERS:
        print(f"Unsupported state FIPS: {state}", file=sys.stderr)
        return 2

    if not args.county and not args.all_counties:
        print("Provide --county for a targeted build, or --all-counties for a full state.", file=sys.stderr)
        return 2

    counties = list_counties(state) if args.all_counties else [fips(args.county, 3)]
    tiger_url = tiger_block_url(state)

    if args.dry_run:
        print(f"TIGER blocks: {tiger_url}")
        for county in counties:
            preview = requests.Request("GET", PL_BASE_URL, params=pl_block_params(state, county)).prepare().url
            print(f"PL API {state}-{county}: {preview}")
        return 0

    out_dir = Path(args.out_dir)
    cache_dir = Path(args.cache_dir)
    zip_path = cache_dir / "tiger" / f"tl_2020_{state}_tabblock20.zip"
    download_file(tiger_url, zip_path, force=args.force_download)

    print(f"Loading TIGER block points for {state}")
    points = load_block_points(zip_path)
    print(f"  TIGER points: {len(points):,}")

    runs = []
    state_records: list[dict[str, Any]] = []
    for county in counties:
        print(f"\n{state}-{county}")
        summary, records = build_for_county(state, county, points, out_dir)
        runs.append(summary)
        state_records.extend(records)

    state_output = None
    if args.all_counties:
        state_path = out_dir / f"census-blocks-{state}-2020.json"
        write_json(state_path, state_records, compact=True)
        state_output = {
            "output": str(state_path.relative_to(PROJECT_DIR)),
            "records": len(state_records),
            "size_mb": round(state_path.stat().st_size / 1024 / 1024, 2),
        }
        print(f"\nWrote state file {state_path} ({state_output['size_mb']:.1f} MB, {len(state_records):,} records)")

    manifest = {
        "generated_at": dt.datetime.now(dt.UTC).isoformat(),
        "source": {
            "pl_api": PL_BASE_URL,
            "tiger_blocks": tiger_url,
        },
        "fields": PL_FIELDS,
        "state_output": state_output,
        "runs": runs,
    }
    write_json(out_dir / f"census-blocks-{state}-manifest.json", manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
