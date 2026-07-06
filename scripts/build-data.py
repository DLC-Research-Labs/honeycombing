#!/usr/bin/env python3
"""
Build Honeycombing dataset from MIT MEDSL county presidential returns + Census Gazetteer.
Output: public/data/precincts-2020.json (county-level voting data with lat/lng)
"""

import csv
import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')

def load_county_coords():
    """Load county FIPS -> (lat, lng) from Census Gazetteer."""
    coords = {}
    with open(os.path.join(DATA_DIR, 'counties_geo.txt'), 'r') as f:
        for line in f:
            parts = line.strip().split('\t')
            if parts[0] == 'USPS':
                continue  # header
            geoid = parts[1].strip()
            try:
                lat = float(parts[8].strip())
                lng = float(parts[9].strip())
                coords[geoid] = (lat, lng)
            except (ValueError, IndexError):
                continue
    print(f"Loaded {len(coords)} county coordinates")
    return coords

def build_2020_data(coords):
    """Process 2020 presidential returns, merge with coordinates."""
    # Aggregate by county FIPS
    counties = {}  # fips -> {dem_votes, rep_votes, total_votes, ...}
    
    with open(os.path.join(DATA_DIR, 'countypres_2000-2024.csv'), 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['year'] != '2020':
                continue
            
            fips = row['county_fips'].strip().zfill(5) if row['county_fips'] else None
            if not fips or fips == '00000':
                continue
            
            if fips not in counties:
                counties[fips] = {
                    'county_fips': fips,
                    'county_name': row['county_name'],
                    'state': row['state'],
                    'state_po': row['state_po'],
                    'dem_votes': 0,
                    'rep_votes': 0,
                    'other_votes': 0,
                    'total_votes': 0,
                }
            
            votes = int(row['candidatevotes']) if row['candidatevotes'] else 0
            party = row['party']
            
            if party == 'DEMOCRAT':
                counties[fips]['dem_votes'] += votes
            elif party == 'REPUBLICAN':
                counties[fips]['rep_votes'] += votes
            else:
                counties[fips]['other_votes'] += votes
            
            # Use the totalvotes from any row (same per county)
            total = int(row['totalvotes']) if row['totalvotes'] else 0
            if total > counties[fips]['total_votes']:
                counties[fips]['total_votes'] = total

    # Merge with coordinates
    results = []
    missing = 0
    for fips, data in counties.items():
        if fips in coords:
            lat, lng = coords[fips]
            results.append({
                'lat': lat,
                'lng': lng,
                'dem_votes': data['dem_votes'],
                'rep_votes': data['rep_votes'],
                'total_votes': data['total_votes'],
                'precinct_id': fips,
                'precinct_name': f"{data['county_name']}, {data['state_po']}",
            })
        else:
            missing += 1
    
    print(f"Matched {len(results)} counties, {missing} missing coordinates")
    
    # Stats
    total_dem = sum(r['dem_votes'] for r in results)
    total_rep = sum(r['rep_votes'] for r in results)
    total_all = sum(r['total_votes'] for r in results)
    print(f"Total votes: {total_all:,} (D: {total_dem:,} R: {total_rep:,})")
    
    return results

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    
    coords = load_county_coords()
    data = build_2020_data(coords)
    
    out_path = os.path.join(OUT_DIR, 'precincts-2020.json')
    with open(out_path, 'w') as f:
        json.dump(data, f)
    
    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"Wrote {out_path} ({size_mb:.1f} MB, {len(data)} records)")

if __name__ == '__main__':
    main()
