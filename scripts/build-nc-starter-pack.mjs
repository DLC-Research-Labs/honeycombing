import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  comparePlanToPoints,
  summarizePlanFeatureCollection,
} from "../app/lib/honeycomb-ui-helpers.ts";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

function round(value, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function percent(part, whole) {
  return whole > 0 ? round((part / whole) * 100, 1) : 0;
}

function sumRows(rows, getValue) {
  return rows.reduce((total, row) => total + (Number(getValue(row)) || 0), 0);
}

const STARTER_SELECTIONS = [
  {
    id: "triangle",
    name: "Triangle",
    shortName: "Triangle",
    description: "Wake, Durham, Orange, and nearby suburban growth corridors.",
    reviewerPrompt: "Inspect how the court and enacted plans handle a high-growth Democratic urban/suburban cluster.",
    bounds: { south: 35.45, west: -79.35, north: 36.25, east: -78.35 },
    center: { lat: 35.88, lng: -78.82 },
    zoom: 9,
  },
  {
    id: "charlotte-mecklenburg",
    name: "Charlotte / Mecklenburg",
    shortName: "Charlotte",
    description: "Charlotte, Mecklenburg County, and the immediate suburban edge.",
    reviewerPrompt: "Inspect whether the metro core and suburban edge are packed, cracked, or preserved across plans.",
    bounds: { south: 34.9, west: -81.15, north: 35.55, east: -80.45 },
    center: { lat: 35.23, lng: -80.84 },
    zoom: 9,
  },
  {
    id: "triad",
    name: "Triad",
    shortName: "Triad",
    description: "Greensboro, Winston-Salem, High Point, and surrounding counties.",
    reviewerPrompt: "Inspect the state's central urban/suburban corridor where multiple districts can touch compact clusters.",
    bounds: { south: 35.75, west: -80.55, north: 36.35, east: -79.45 },
    center: { lat: 36.07, lng: -79.9 },
    zoom: 9,
  },
  {
    id: "eastern-black-belt",
    name: "Eastern Black Belt",
    shortName: "East NC",
    description: "Eastern North Carolina counties with substantial Black population and VRA-adjacent review questions.",
    reviewerPrompt: "Inspect demographic concentration, plan continuity, and where Honeycombing must defer to CVAP/RPV evidence.",
    bounds: { south: 34.85, west: -78.65, north: 36.6, east: -76.15 },
    center: { lat: 35.72, lng: -77.4 },
    zoom: 8,
  },
  {
    id: "western-nc",
    name: "Western North Carolina",
    shortName: "West NC",
    description: "Mountain and foothill region anchored by Asheville and western counties.",
    reviewerPrompt: "Inspect rural/urban contrast, geography-driven boundaries, and whether the scaffold overstates natural mountain separations.",
    bounds: { south: 34.8, west: -84.35, north: 36.45, east: -81.65 },
    center: { lat: 35.62, lng: -82.55 },
    zoom: 8,
  },
];

function inBounds(row, bounds) {
  return Number(row.lat) >= bounds.south
    && Number(row.lat) <= bounds.north
    && Number(row.lng) >= bounds.west
    && Number(row.lng) <= bounds.east;
}

function filterNorthCarolinaPlan(plan) {
  return {
    ...plan,
    features: plan.features.filter((feature) => {
      const properties = feature.properties ?? {};
      const geoid = String(properties.GEOID ?? properties.district_id ?? "");
      return geoid.startsWith("37");
    }),
  };
}

function selectionPopulation(cells) {
  const total = sumRows(cells, (cell) => cell.total_population);
  const votingAge = sumRows(cells, (cell) => cell.voting_age_population);
  const black = sumRows(cells, (cell) => cell.black_alone);
  const hispanic = sumRows(cells, (cell) => cell.hispanic_or_latino);
  const nonHispanicWhite = sumRows(cells, (cell) => cell.non_hispanic_white_alone);
  const nonwhite = Math.max(total - nonHispanicWhite, 0);

  return {
    total,
    votingAge,
    black,
    blackPct: percent(black, total),
    hispanic,
    hispanicPct: percent(hispanic, total),
    nonHispanicWhite,
    nonwhite,
    nonwhitePct: percent(nonwhite, total),
  };
}

function selectionElectionSignal(precincts) {
  const demVotes = sumRows(precincts, (row) => row.dem_votes);
  const repVotes = sumRows(precincts, (row) => row.rep_votes);
  const totalVotes = demVotes + repVotes;
  const marginPct = totalVotes > 0 ? round(((demVotes - repVotes) / totalVotes) * 100, 1) : 0;

  return {
    precincts: precincts.length,
    demVotes,
    repVotes,
    totalVotes,
    demPct: percent(demVotes, totalVotes),
    repPct: percent(repVotes, totalVotes),
    marginPct,
    lean: marginPct > 0 ? "D" : marginPct < 0 ? "R" : "even",
    caveat: "VEST precinct records are loaded as centroid points in the current prototype.",
  };
}

function selectionPlanTouches(planPayloads, h3Points) {
  return planPayloads.map(({ entry, plan }) => {
    const coverage = comparePlanToPoints(plan, h3Points);
    return {
      planId: entry.id,
      name: entry.name,
      status: entry.status,
      cycle: entry.cycle,
      h3CentersCovered: coverage.matchedPointCount,
      h3CentersUncovered: coverage.unmatchedPointCount,
      h3CoveragePct: percent(coverage.matchedPointCount, coverage.selectedPointCount),
      districtsTouched: coverage.districtCount,
      districtIds: coverage.districtIds,
    };
  });
}

function starterSelectionPacket(selection, h3Cells, precincts, planPayloads) {
  const selectedCells = h3Cells.filter((cell) => inBounds(cell, selection.bounds));
  const selectedPrecincts = precincts.filter((precinct) => inBounds(precinct, selection.bounds));
  const h3Points = selectedCells.map((cell) => ({ lat: cell.lat, lng: cell.lng }));

  return {
    ...selection,
    h3Resolution: 7,
    h3Cells: selectedCells.length,
    sourceBlockRecords: sumRows(selectedCells, (cell) => cell.source_count),
    population: selectionPopulation(selectedCells),
    electionSignal: selectionElectionSignal(selectedPrecincts),
    planTouches: selectionPlanTouches(planPayloads, h3Points),
    caveats: [
      "Bounds are rectangular starter selections for review triage, not official regions or legal communities of interest.",
      "Population uses Census block internal points assigned to H3 cells; precinct signal uses VEST precinct centroids.",
      "Plan touch counts use selected H3 cell centers inside plan polygons, not area or population apportionment.",
    ],
  };
}

function planPacket(entry, plan, h3Points) {
  const ncPlan = filterNorthCarolinaPlan(plan);
  const summary = summarizePlanFeatureCollection(ncPlan);
  const coverage = comparePlanToPoints(ncPlan, h3Points);

  return {
    planId: entry.id,
    name: entry.name,
    status: entry.status,
    source: entry.source,
    cycle: entry.cycle,
    districtCount: summary.districtCount,
    featureCount: summary.featureCount,
    totalPopulation: summary.totalPopulation,
    h3CentersCovered: coverage.matchedPointCount,
    h3CentersUncovered: coverage.unmatchedPointCount,
    h3CoveragePct: percent(coverage.matchedPointCount, coverage.selectedPointCount),
    districtsTouchedByH3Centers: coverage.districtCount,
    caveats: entry.caveats ?? [],
  };
}

async function main() {
  const manifest = await readJson("public/derived-data/census-h3/census-blocks-37-r7-2020.manifest.json");
  const h3Cells = await readJson("public/derived-data/census-h3/census-blocks-37-r7-2020.json");
  const precincts = await readJson("public/data/precincts-nc-2020.json");
  const counties = await readJson("public/data/counties-nc-2020.json");
  const districtHeat = await readJson("public/data/districts-votes-2020.json");
  const registry = await readJson("public/data/plans/registry.json");

  const h3Points = h3Cells.map((cell) => ({ lat: cell.lat, lng: cell.lng }));
  const plans = [];
  const planPayloads = [];
  for (const entry of registry.plans) {
    const plan = filterNorthCarolinaPlan(await readJson(`public${entry.url}`));
    const packet = planPacket(entry, plan, h3Points);
    if (packet.districtCount > 0) plans.push(packet);
    if (entry.metadata?.jurisdiction === "North Carolina" && entry.metadata?.office === "U.S. House") {
      planPayloads.push({ entry, plan });
    }
  }

  const heatFeatures = districtHeat.features.filter((feature) => feature.properties?.STATEFP === "37");
  const heatTotals = {
    districts: heatFeatures.length,
    demVotes: sumRows(heatFeatures, (feature) => feature.properties?.dem_votes),
    repVotes: sumRows(heatFeatures, (feature) => feature.properties?.rep_votes),
    totalVotes: sumRows(heatFeatures, (feature) => feature.properties?.total_votes),
    countyAssignments: sumRows(heatFeatures, (feature) => feature.properties?.county_count),
  };

  const precinctTotals = {
    records: precincts.length,
    demVotes: sumRows(precincts, (row) => row.dem_votes),
    repVotes: sumRows(precincts, (row) => row.rep_votes),
    totalVotes: sumRows(precincts, (row) => row.total_votes),
  };

  const countyTotals = {
    records: counties.length,
    demVotes: sumRows(counties, (row) => row.dem_votes),
    repVotes: sumRows(counties, (row) => row.rep_votes),
    totalVotes: sumRows(counties, (row) => row.total_votes),
  };

  const output = {
    schemaVersion: 1,
    id: "nc-starter-pack",
    title: "North Carolina starter stats packet",
    generatedAt: manifest.generated_at,
    caseStudy: {
      id: "nc",
      name: "North Carolina",
      statePostal: "NC",
      stateFips: "37",
      year: 2020,
    },
    statewide: {
      population: manifest.output_totals.total_population,
      votingAgePopulation: manifest.output_totals.voting_age_population,
      sourceBlocks: manifest.input_records,
      h3Cells: manifest.output_records,
      h3Resolution: manifest.h3_resolution,
      blackPopulation: manifest.output_totals.black_alone,
      blackPct: percent(manifest.output_totals.black_alone, manifest.output_totals.total_population),
      hispanicPopulation: manifest.output_totals.hispanic_or_latino,
      hispanicPct: percent(manifest.output_totals.hispanic_or_latino, manifest.output_totals.total_population),
      nonHispanicWhitePopulation: manifest.output_totals.non_hispanic_white_alone,
      nonwhitePopulation: manifest.output_totals.total_population - manifest.output_totals.non_hispanic_white_alone,
      nonwhitePct: percent(
        manifest.output_totals.total_population - manifest.output_totals.non_hispanic_white_alone,
        manifest.output_totals.total_population,
      ),
    },
    electionSignals: {
      precinctCentroids2020: {
        ...precinctTotals,
        demPct: percent(precinctTotals.demVotes, precinctTotals.demVotes + precinctTotals.repVotes),
        repPct: percent(precinctTotals.repVotes, precinctTotals.demVotes + precinctTotals.repVotes),
        caveat: "VEST precinct records are loaded as centroid points in the current prototype.",
      },
      countyCentroids2020: {
        ...countyTotals,
        demPct: percent(countyTotals.demVotes, countyTotals.demVotes + countyTotals.repVotes),
        repPct: percent(countyTotals.repVotes, countyTotals.demVotes + countyTotals.repVotes),
        caveat: "County centroids are coarse and mainly support broad orientation.",
      },
      countyDerivedDistrictHeat2020: {
        ...heatTotals,
        demPct: percent(heatTotals.demVotes, heatTotals.demVotes + heatTotals.repVotes),
        repPct: percent(heatTotals.repVotes, heatTotals.demVotes + heatTotals.repVotes),
        caveat: "District heat fill is county-derived and not precinct-to-district aggregation.",
      },
    },
    planComparisons: plans,
    starterSelections: STARTER_SELECTIONS.map((selection) => (
      starterSelectionPacket(selection, h3Cells, precincts, planPayloads)
    )),
    caveats: [
      "Block and precinct assignments currently use internal points or centroids rather than polygon-to-H3 apportionment.",
      "District heat fill is county-derived and should not be treated as precinct-to-district aggregation.",
      "Plan coverage counts selected H3 cell centers inside plan polygons; it is a diagnostic coverage signal, not an area apportionment.",
      "CVAP, racially polarized voting, candidate-of-choice, COI, ensemble, and formal VRA workflows are not included yet.",
    ],
    nextQuestions: [
      "Should the next evidence upgrade replace county-derived district heat with precinct-to-district aggregation?",
      "Which NC regions should become named starter selections for expert review?",
      "What COI source should be used first for a North Carolina overlay skeleton?",
      "Which statistics should be considered mandatory before sharing with redistricting lawyers?",
    ],
  };

  const outputPath = join(root, "public/data/case-studies/nc-starter-pack.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
}

await main();
