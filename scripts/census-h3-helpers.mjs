import { cellToLatLng, latLngToCell } from "h3-js";

export const CENSUS_SUM_FIELDS = [
  "total_population",
  "voting_age_population",
  "white_alone",
  "black_alone",
  "american_indian_alaska_native_alone",
  "asian_alone",
  "native_hawaiian_pacific_islander_alone",
  "some_other_race_alone",
  "two_or_more_races",
  "hispanic_or_latino",
  "non_hispanic_white_alone",
  "vap_white_alone",
  "vap_black_alone",
  "vap_hispanic_or_latino",
  "vap_non_hispanic_white_alone",
];

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasPoint(row) {
  if (row?.lat === null || row?.lat === undefined || row?.lng === null || row?.lng === undefined) {
    return false;
  }
  return Number.isFinite(Number(row?.lat)) && Number.isFinite(Number(row?.lng));
}

export function aggregateCensusRowsToH3(rows, resolution, options = {}) {
  const includeSourceGeoids = options.includeSourceGeoids === true;
  const byCell = new Map();

  for (const row of rows) {
    if (!hasPoint(row)) continue;

    const h3 = latLngToCell(Number(row.lat), Number(row.lng), resolution);
    let cell = byCell.get(h3);

    if (!cell) {
      cell = {
        h3,
        source_count: 0,
      };

      for (const field of CENSUS_SUM_FIELDS) {
        cell[field] = 0;
      }

      if (includeSourceGeoids) cell.source_geoids = [];
      byCell.set(h3, cell);
    }

    cell.source_count += 1;
    for (const field of CENSUS_SUM_FIELDS) {
      cell[field] += numeric(row[field]);
    }
    if (includeSourceGeoids && row.geoid) cell.source_geoids.push(String(row.geoid));
  }

  return [...byCell.values()]
    .map((cell) => {
      const [lat, lng] = cellToLatLng(cell.h3);
      return {
        ...cell,
        lat,
        lng,
      };
    })
    .sort((a, b) => a.h3.localeCompare(b.h3));
}

export function summarizeCensusRows(rows) {
  const totals = {};
  for (const field of CENSUS_SUM_FIELDS) {
    totals[field] = 0;
  }

  for (const row of rows) {
    for (const field of CENSUS_SUM_FIELDS) {
      totals[field] += numeric(row[field]);
    }
  }

  return totals;
}
