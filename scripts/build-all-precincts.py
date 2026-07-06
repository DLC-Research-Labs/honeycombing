#!/usr/bin/env python3
"""
Download and process all 50-state VEST 2020 precinct shapefiles.
Output: public/data/precincts-national-2020.json  (all states combined)
        public/data/precincts-{state}-2020.json    (per-state files)
"""

import os, json, math, subprocess, tempfile, zipfile
import geopandas as gpd

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
os.makedirs(OUT_DIR, exist_ok=True)

# file_id -> state abbreviation (skip duplicates/estimates)
STATE_FILES = {
    11070062: 'ak', 4751074: 'al', 4931787: 'ar', 4864722: 'az',
    5206371: 'ca', 4863166: 'co', 4986646: 'ct', 4750435: 'dc',
    4773531: 'de', 12070362: 'fl', 11070054: 'ga', 4750434: 'hi',
    4789403: 'ia', 4789401: 'id', 4773525: 'il', 5143396: 'in',
    6696064: 'ks', 6550200: 'ky', 5739918: 'la', 5007849: 'ma',
    12070366: 'md', 11070059: 'me', 9865421: 'mi', 11595851: 'mn',
    5007850: 'mo', 5706487: 'ms', 4773527: 'mt', 11595848: 'nc',
    5342900: 'nd', 5739922: 'ne', 11070060: 'nh', 12070367: 'nj',
    5425599: 'nm', 11595850: 'nv', 5259468: 'ny', 4499012: 'oh',
    5790364: 'ok', 5194704: 'or', 10596699: 'pa', 11070053: 'ri',
    11070057: 'sc', 6082788: 'sd', 11070058: 'tn', 12070365: 'tx',
    11595849: 'ut', 11070061: 'va', 5739919: 'vt', 11070055: 'wa',
    8569139: 'wi', 6418344: 'wv', 4789404: 'wy',
}

def safe_int(v):
    try:
        f = float(v)
        return 0 if math.isnan(f) else int(f)
    except: return 0

def find_vote_cols(cols):
    """Find G20PRE* presidential columns."""
    trump_cols = [c for c in cols if 'G20PRE' in c.upper() and ('RTR' in c.upper() or 'RTRU' in c.upper() or 'RTRUMP' in c.upper())]
    biden_cols = [c for c in cols if 'G20PRE' in c.upper() and ('DBID' in c.upper() or 'DBIDEN' in c.upper())]
    # fallback: all G20PRE columns, pick R and D by party letter
    if not trump_cols:
        trump_cols = [c for c in cols if c.upper().startswith('G20PRER')]
    if not biden_cols:
        biden_cols = [c for c in cols if c.upper().startswith('G20PRED')]
    return trump_cols, biden_cols

def process_state(file_id, state, tmpdir):
    zip_path = os.path.join(tmpdir, f'{state}_2020.zip')
    
    # Download
    url = f"https://dataverse.harvard.edu/api/access/datafile/{file_id}"
    result = subprocess.run(['curl', '-L', '-s', '-o', zip_path, url], capture_output=True)
    if result.returncode != 0:
        return None, f"Download failed: {result.stderr}"
    
    if not os.path.exists(zip_path) or os.path.getsize(zip_path) < 1000:
        return None, "File too small or missing"
    
    # Extract
    extract_dir = os.path.join(tmpdir, state)
    os.makedirs(extract_dir, exist_ok=True)
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            z.extractall(extract_dir)
    except Exception as e:
        return None, f"Unzip failed: {e}"
    
    # Find shapefile
    shp_files = []
    for root, dirs, files in os.walk(extract_dir):
        for f in files:
            if f.endswith('.shp'):
                shp_files.append(os.path.join(root, f))
    
    if not shp_files:
        return None, "No shapefile found"
    
    # Prefer the main state file (not sub-files)
    shp_path = sorted(shp_files)[0]
    for s in shp_files:
        if f'{state}_2020' in os.path.basename(s).lower():
            shp_path = s
            break
    
    try:
        gdf = gpd.read_file(shp_path)
    except Exception as e:
        return None, f"Read shapefile failed: {e}"
    
    # Reproject silently
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        gdf = gdf.to_crs('EPSG:4326')
        gdf['centroid'] = gdf.geometry.centroid
    
    trump_cols, biden_cols = find_vote_cols(gdf.columns.tolist())
    if not trump_cols or not biden_cols:
        return None, f"Vote columns not found. Cols: {gdf.columns.tolist()[:20]}"
    
    results = []
    for _, row in gdf.iterrows():
        rep = sum(safe_int(row.get(c, 0)) for c in trump_cols)
        dem = sum(safe_int(row.get(c, 0)) for c in biden_cols)
        total = rep + dem
        if total == 0: continue
        
        try:
            lat = float(row.centroid.y)
            lng = float(row.centroid.x)
        except: continue
        if math.isnan(lat) or math.isnan(lng): continue
        if lat == 0 and lng == 0: continue
        
        precinct_id = str(row.get('GEOID20', row.get('GEOID', row.get('PREC_ID', ''))))
        precinct_name = str(row.get('NAME20', row.get('NAME', row.get('ENR_DESC', state.upper()))))
        
        results.append({
            'lat': round(lat, 6),
            'lng': round(lng, 6),
            'dem_votes': dem,
            'rep_votes': rep,
            'total_votes': total,
            'precinct_id': precinct_id,
            'precinct_name': f"{precinct_name} ({state.upper()})",
            'state': state.upper(),
        })
    
    return results, None


def main():
    all_results = []
    summary = []
    
    with tempfile.TemporaryDirectory() as tmpdir:
        for file_id, state in sorted(STATE_FILES.items(), key=lambda x: x[1]):
            # Skip NC - already have it, but reprocess for consistency
            print(f"Processing {state.upper()}...", flush=True)
            
            results, error = process_state(file_id, state, tmpdir)
            
            if error:
                print(f"  ERROR: {error}", flush=True)
                summary.append({'state': state, 'precincts': 0, 'error': error})
                continue
            
            # Write per-state file
            state_path = os.path.join(OUT_DIR, f'precincts-{state}-2020.json')
            with open(state_path, 'w') as f:
                json.dump(results, f)
            
            total_v = sum(r['total_votes'] for r in results)
            total_d = sum(r['dem_votes'] for r in results)
            print(f"  {len(results)} precincts, {total_v:,} votes (D:{total_d/total_v*100:.1f}%)", flush=True)
            summary.append({'state': state, 'precincts': len(results), 'total_votes': total_v})
            
            all_results.extend(results)
    
    # Write national file
    national_path = os.path.join(OUT_DIR, 'precincts-national-2020.json')
    with open(national_path, 'w') as f:
        json.dump(all_results, f)
    
    size_mb = os.path.getsize(national_path) / 1024 / 1024
    total_prec = len(all_results)
    total_d = sum(r['dem_votes'] for r in all_results)
    total_r = sum(r['rep_votes'] for r in all_results)
    total_v = sum(r['total_votes'] for r in all_results)
    
    print(f"\n{'='*50}")
    print(f"NATIONAL: {total_prec:,} precincts, {size_mb:.0f}MB")
    print(f"D: {total_d:,} ({total_d/total_v*100:.1f}%)  R: {total_r:,} ({total_r/total_v*100:.1f}%)")
    print(f"Wrote: {national_path}")
    
    errors = [s for s in summary if s.get('error')]
    if errors:
        print(f"\nFailed states ({len(errors)}): {[s['state'] for s in errors]}")
    
    # Write summary
    with open(os.path.join(OUT_DIR, 'precincts-manifest.json'), 'w') as f:
        json.dump({
            'generated': '2026',
            'source': 'VEST / Harvard Dataverse doi:10.7910/DVN/K7760H',
            'year': 2020,
            'national_precincts': total_prec,
            'national_size_mb': round(size_mb, 1),
            'states': summary,
        }, f, indent=2)
    
    print("Done.")

if __name__ == '__main__':
    main()
