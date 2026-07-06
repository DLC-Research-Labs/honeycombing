#!/usr/bin/env python3
"""
Spatial join: aggregate 2020 presidential county vote data into congressional districts.
Output: public/data/districts-votes-2020.json
  - GeoJSON FeatureCollection
  - Each feature = one congressional district, geometry + vote totals
"""

import json
import os
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

SCRIPT_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(SCRIPT_DIR, '..', 'data')
PUBLIC_DIR = os.path.join(SCRIPT_DIR, '..', 'public', 'data')

def main():
    # Load congressional districts
    print("Loading congressional districts...")
    districts = gpd.read_file('/tmp/cd_2022/cb_2022_us_cd118_500k.shp')
    districts = districts.to_crs('EPSG:4326')

    # Load county precinct data (already has lat/lng)
    print("Loading county vote data...")
    with open(os.path.join(PUBLIC_DIR, 'precincts-2020.json')) as f:
        counties = json.load(f)

    # Convert counties to GeoDataFrame
    county_gdf = gpd.GeoDataFrame(
        counties,
        geometry=[Point(c['lng'], c['lat']) for c in counties],
        crs='EPSG:4326'
    )

    print(f"  {len(county_gdf)} counties, {len(districts)} districts")

    # Spatial join: each county centroid → district it falls in
    print("Running spatial join...")
    joined = gpd.sjoin(county_gdf, districts[['STATEFP', 'CD118FP', 'GEOID', 'NAMELSAD', 'geometry']],
                       how='left', predicate='within')

    # Counties that didn't fall within any district (border edge cases) — try nearest
    unmatched = joined[joined['GEOID'].isna()].copy()
    if len(unmatched) > 0:
        print(f"  {len(unmatched)} counties unmatched, trying nearest...")
        nearest = gpd.sjoin_nearest(
            county_gdf.loc[unmatched.index],
            districts[['STATEFP', 'CD118FP', 'GEOID', 'NAMELSAD', 'geometry']],
            how='left'
        )
        for idx in unmatched.index:
            if idx in nearest.index:
                row = nearest.loc[idx]
                joined.loc[idx, 'GEOID'] = row['GEOID'] if hasattr(row, 'GEOID') else None
                joined.loc[idx, 'STATEFP'] = row['STATEFP'] if hasattr(row, 'STATEFP') else None
                joined.loc[idx, 'CD118FP'] = row['CD118FP'] if hasattr(row, 'CD118FP') else None
                joined.loc[idx, 'NAMELSAD'] = row['NAMELSAD'] if hasattr(row, 'NAMELSAD') else None

    # Aggregate votes per district GEOID
    print("Aggregating votes per district...")
    agg = joined.groupby('GEOID').agg(
        dem_votes=('dem_votes', 'sum'),
        rep_votes=('rep_votes', 'sum'),
        total_votes=('total_votes', 'sum'),
        county_count=('precinct_id', 'count'),
        NAMELSAD=('NAMELSAD', 'first'),
        STATEFP=('STATEFP', 'first'),
        CD118FP=('CD118FP', 'first'),
    ).reset_index()

    print(f"  Aggregated {len(agg)} districts with vote data")

    # Merge vote data back onto district geometries
    districts_votes = districts.merge(agg, on='GEOID', how='left')

    # Simplify geometry for web delivery
    districts_votes.geometry = districts_votes.geometry.simplify(0.01)

    # Build GeoJSON output with vote data in properties
    features = []
    for _, row in districts_votes.iterrows():
        dem = int(row['dem_votes']) if pd.notna(row.get('dem_votes')) else 0
        rep = int(row['rep_votes']) if pd.notna(row.get('rep_votes')) else 0
        total = int(row['total_votes']) if pd.notna(row.get('total_votes')) else 0
        name = row.get('NAMELSAD_x') or row.get('NAMELSAD_y') or row.get('NAMELSAD', '')

        if row.geometry is None or row.geometry.is_empty:
            continue

        features.append({
            'type': 'Feature',
            'geometry': row.geometry.__geo_interface__,
            'properties': {
                'GEOID': row['GEOID'],
                'STATEFP': row['STATEFP'],
                'CD118FP': row['CD118FP'],
                'name': str(name),
                'dem_votes': dem,
                'rep_votes': rep,
                'total_votes': total,
                'county_count': int(row['county_count']) if pd.notna(row.get('county_count')) else 0,
            }
        })

    geojson = {'type': 'FeatureCollection', 'features': features}

    out_path = os.path.join(PUBLIC_DIR, 'districts-votes-2020.json')
    with open(out_path, 'w') as f:
        json.dump(geojson, f)

    size_mb = os.path.getsize(out_path) / 1024 / 1024
    total_d = sum(f['properties']['dem_votes'] for f in features)
    total_r = sum(f['properties']['rep_votes'] for f in features)
    print(f"\nWrote {out_path}")
    print(f"  {len(features)} districts, {size_mb:.1f} MB")
    print(f"  D: {total_d:,}  R: {total_r:,}  total: {total_d+total_r:,}")

    # Quick sanity: who won each district
    d_wins = sum(1 for f in features if f['properties']['dem_votes'] > f['properties']['rep_votes'])
    r_wins = sum(1 for f in features if f['properties']['rep_votes'] > f['properties']['dem_votes'])
    print(f"  D-majority districts: {d_wins}  R-majority districts: {r_wins}")

if __name__ == '__main__':
    main()
