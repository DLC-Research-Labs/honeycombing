#!/usr/bin/env python3

import json
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

import geopandas as gpd
from shapely.geometry import mapping

SOURCE_URL = "https://webservices.ncleg.gov/ViewBillDocument/2025/7667/0/SL%202025-95%20-%20Shapefile"
PLAN_ID = "nc-2025-enacted-congressional"
PLAN_NAME = "NC 2025 enacted congressional plan"
SOURCE = "North Carolina General Assembly"
CYCLE = "2026"
STATUS = "enacted"
OUTPUT_PATH = Path("public/data/plans/nc-2025-enacted-congressional.json")


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        zip_path = Path(tmp_dir) / "nc-2025-congressional.zip"
        request = Request(SOURCE_URL, headers={"User-Agent": "Honeycombing plan importer"})
        with urlopen(request) as response:
            zip_path.write_bytes(response.read())
        gdf = gpd.read_file(f"zip://{zip_path}").to_crs("EPSG:4326")

    features = []
    for _, row in gdf.sort_values("DISTRICT", key=lambda series: series.astype(int)).iterrows():
        district_number = int(row["DISTRICT"])
        district_id = f"37{district_number:02d}"
        geometry = row.geometry
        if geometry is None or geometry.is_empty:
            raise ValueError(f"District {district_number} has empty geometry")

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "plan_id": PLAN_ID,
                    "district_id": district_id,
                    "GEOID": district_id,
                    "name": f"NC Congressional District {district_number}",
                    "source": SOURCE,
                    "cycle": CYCLE,
                    "status": STATUS,
                    "district_number": district_number,
                    "population": int(row["PL20AA_TOT"]),
                    "source_plan_name": "SL 2025-95 Congressional",
                    "source_url": SOURCE_URL,
                },
                "geometry": mapping(geometry),
            },
        )

    collection = {
        "type": "FeatureCollection",
        "name": PLAN_NAME,
        "features": features,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(collection, separators=(",", ":")) + "\n")
    print(f"Wrote {OUTPUT_PATH} with {len(features)} districts")


if __name__ == "__main__":
    main()
