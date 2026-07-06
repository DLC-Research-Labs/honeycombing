#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { latLngToCell } from "h3-js";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const OUT_DIR = "docs/research/outputs/nc-asymmetry";

function round(value, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function percent(part, whole, digits = 1) {
  return whole > 0 ? round((part / whole) * 100, digits) : 0;
}

async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

function sum(rows, getter) {
  return rows.reduce((total, row) => total + (Number(getter(row)) || 0), 0);
}

function getDistrictId(feature) {
  const p = feature.properties ?? {};
  const raw = p.district_id ?? p.GEOID ?? p.CD118FP ?? p.DISTRICT;
  return raw === undefined || raw === null ? "unknown" : String(raw);
}

function getDistrictName(feature) {
  const p = feature.properties ?? {};
  return String(p.name ?? p.NAMELSAD ?? `District ${getDistrictId(feature)}`);
}

function filterNcPlan(plan) {
  return {
    ...plan,
    features: plan.features.filter((feature) => {
      const p = feature.properties ?? {};
      const geoid = String(p.GEOID ?? p.district_id ?? "");
      return geoid.startsWith("37") || String(p.plan_id ?? "").toLowerCase().includes("nc");
    }),
  };
}

function isNcCongressionalRegistryPlan(plan) {
  return plan.metadata?.jurisdiction === "North Carolina"
    && plan.metadata?.office === "U.S. House"
    && plan.url?.startsWith("/data/plans/");
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i][0]);
    const yi = Number(ring[i][1]);
    const xj = Number(ring[j][0]);
    const yj = Number(ring[j][1]);
    const intersects = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoordinates(lng, lat, coordinates) {
  const [outerRing, ...holes] = coordinates;
  if (!outerRing || !pointInRing(lng, lat, outerRing)) return false;
  return !holes.some((hole) => pointInRing(lng, lat, hole));
}

function featureContainsPoint(feature, point) {
  const geometry = feature.geometry;
  if (!geometry) return false;
  if (geometry.type === "Polygon") {
    return pointInPolygonCoordinates(point.lng, point.lat, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygonCoordinates(point.lng, point.lat, polygon));
  }
  return false;
}

function assignPointToDistrict(plan, point) {
  return plan.features.find((feature) => featureContainsPoint(feature, point)) ?? null;
}

function aggregatePrecinctsToH3(precincts, resolution) {
  const cells = new Map();
  for (const row of precincts) {
    const h3 = latLngToCell(Number(row.lat), Number(row.lng), resolution);
    const current = cells.get(h3) ?? {
      h3,
      precincts: 0,
      demVotes: 0,
      repVotes: 0,
      totalVotes: 0,
    };
    current.precincts += 1;
    current.demVotes += Number(row.dem_votes) || 0;
    current.repVotes += Number(row.rep_votes) || 0;
    current.totalVotes += Number(row.total_votes) || 0;
    cells.set(h3, current);
  }
  return [...cells.values()].map((cell) => ({
    ...cell,
    demPct: percent(cell.demVotes, cell.demVotes + cell.repVotes, 2),
    marginPct: percent(cell.demVotes - cell.repVotes, cell.demVotes + cell.repVotes, 2),
    lean: cell.demVotes > cell.repVotes ? "D" : cell.repVotes > cell.demVotes ? "R" : "Toss-up",
  }));
}

function summarizeH3Concentration(cells) {
  const totalVotes = sum(cells, (cell) => cell.totalVotes);
  const demVotes = sum(cells, (cell) => cell.demVotes);
  const repVotes = sum(cells, (cell) => cell.repVotes);
  const demCells = cells.filter((cell) => cell.lean === "D");
  const repCells = cells.filter((cell) => cell.lean === "R");
  const tossupCells = cells.filter((cell) => Math.abs(cell.demPct - 50) <= 2);
  const safeDemCells = cells.filter((cell) => cell.demPct >= 60);
  const safeRepCells = cells.filter((cell) => cell.demPct <= 40);
  const competitiveCells = cells.filter((cell) => Math.abs(cell.demPct - 50) <= 5);
  const demVotesInDemCells = sum(demCells, (cell) => cell.demVotes);
  const totalVotesInDemCells = sum(demCells, (cell) => cell.totalVotes);

  return {
    h3Resolution: 7,
    cells: cells.length,
    totalVotes,
    demVotes,
    repVotes,
    demPct: percent(demVotes, demVotes + repVotes, 2),
    repPct: percent(repVotes, demVotes + repVotes, 2),
    demLeaningCells: demCells.length,
    repLeaningCells: repCells.length,
    tossupBandCells: tossupCells.length,
    competitiveCells: competitiveCells.length,
    safeDemCells: safeDemCells.length,
    safeRepCells: safeRepCells.length,
    votersInDemLeaningCellsPct: percent(totalVotesInDemCells, totalVotes, 2),
    demVotesInDemLeaningCellsPct: percent(demVotesInDemCells, demVotes, 2),
  };
}

function emptyDistrictSummary(feature) {
  const districtId = getDistrictId(feature);
  return {
    districtId,
    name: getDistrictName(feature),
    h3Cells: 0,
    population: 0,
    votingAgePopulation: 0,
    blackPopulation: 0,
    hispanicPopulation: 0,
    nonHispanicWhitePopulation: 0,
    nonwhitePopulation: 0,
    precincts: 0,
    demVotes: 0,
    repVotes: 0,
    totalVotes: 0,
  };
}

function summarizePlan(planEntry, plan, h3Cells, precincts) {
  const byDistrict = new Map(plan.features.map((feature) => [getDistrictId(feature), emptyDistrictSummary(feature)]));
  let unmatchedH3Cells = 0;
  let unmatchedPrecincts = 0;

  for (const cell of h3Cells) {
    const feature = assignPointToDistrict(plan, { lat: Number(cell.lat), lng: Number(cell.lng) });
    if (!feature) {
      unmatchedH3Cells += 1;
      continue;
    }
    const districtId = getDistrictId(feature);
    const summary = byDistrict.get(districtId) ?? emptyDistrictSummary(feature);
    summary.h3Cells += 1;
    summary.population += Number(cell.total_population) || 0;
    summary.votingAgePopulation += Number(cell.voting_age_population) || 0;
    summary.blackPopulation += Number(cell.black_alone) || 0;
    summary.hispanicPopulation += Number(cell.hispanic_or_latino) || 0;
    summary.nonHispanicWhitePopulation += Number(cell.non_hispanic_white_alone) || 0;
    summary.nonwhitePopulation += Math.max((Number(cell.total_population) || 0) - (Number(cell.non_hispanic_white_alone) || 0), 0);
    byDistrict.set(districtId, summary);
  }

  for (const precinct of precincts) {
    const feature = assignPointToDistrict(plan, { lat: Number(precinct.lat), lng: Number(precinct.lng) });
    if (!feature) {
      unmatchedPrecincts += 1;
      continue;
    }
    const districtId = getDistrictId(feature);
    const summary = byDistrict.get(districtId) ?? emptyDistrictSummary(feature);
    summary.precincts += 1;
    summary.demVotes += Number(precinct.dem_votes) || 0;
    summary.repVotes += Number(precinct.rep_votes) || 0;
    summary.totalVotes += Number(precinct.total_votes) || 0;
    byDistrict.set(districtId, summary);
  }

  const districts = [...byDistrict.values()]
    .map((district) => {
      const twoParty = district.demVotes + district.repVotes;
      const margin = twoParty > 0 ? ((district.demVotes - district.repVotes) / twoParty) * 100 : 0;
      const demPct = percent(district.demVotes, twoParty, 2);
      const competitiveness = Math.abs(demPct - 50);
      return {
        ...district,
        demPct,
        repPct: percent(district.repVotes, twoParty, 2),
        marginPct: round(margin, 2),
        nonwhitePct: percent(district.nonwhitePopulation, district.population, 2),
        blackPct: percent(district.blackPopulation, district.population, 2),
        hispanicPct: percent(district.hispanicPopulation, district.population, 2),
        partyLean: district.demVotes > district.repVotes ? "D" : district.repVotes > district.demVotes ? "R" : "Toss-up",
        band: competitiveness <= 5 ? "competitive"
          : demPct >= 65 ? "deep_dem"
          : demPct >= 55 ? "lean_dem"
          : demPct <= 35 ? "deep_rep"
          : demPct <= 45 ? "lean_rep"
          : "tossup_band",
      };
    })
    .sort((a, b) => a.districtId.localeCompare(b.districtId, undefined, { numeric: true }));

  const population = sum(districts, (district) => district.population);
  const idealPopulation = population / districts.length;
  const demMajorityDistricts = districts.filter((district) => district.partyLean === "D").length;
  const repMajorityDistricts = districts.filter((district) => district.partyLean === "R").length;
  const competitiveDistricts = districts.filter((district) => district.band === "competitive").length;
  const deepDemDistricts = districts.filter((district) => district.band === "deep_dem").length;
  const deepRepDistricts = districts.filter((district) => district.band === "deep_rep").length;

  return {
    planId: planEntry.id,
    name: planEntry.name,
    status: planEntry.status,
    source: planEntry.source,
    cycle: planEntry.cycle,
    districtCount: districts.length,
    unmatchedH3Cells,
    unmatchedPrecincts,
    population,
    idealPopulation: round(idealPopulation, 2),
    maxPopulationDeviationPct: round(Math.max(...districts.map((district) => Math.abs(district.population - idealPopulation) / idealPopulation)) * 100, 2),
    demMajorityDistricts,
    repMajorityDistricts,
    competitiveDistricts,
    deepDemDistricts,
    deepRepDistricts,
    statewideDemPctFromAssignedPrecincts: percent(sum(districts, (d) => d.demVotes), sum(districts, (d) => d.demVotes + d.repVotes), 2),
    caveat: "Plan district summaries assign H3 cell centers and precinct centroids to plan polygons. They are descriptive diagnostics, not polygon-apportioned district aggregations.",
    districts,
  };
}

function claimClasses(packet) {
  const baseline = packet.planSummaries.find((plan) => plan.planId === "us-congress-118-enacted");
  const court = packet.planSummaries.find((plan) => plan.planId === "nc-2022-court-interim-congressional");
  const enacted2023 = packet.planSummaries.find((plan) => plan.planId === "nc-2023-enacted-congressional");
  const alternativePlans = packet.planSummaries.filter((plan) => plan.planId !== "us-congress-118-enacted");
  const concentration = packet.h3VoteConcentration;
  const claims = [
    {
      claim: "NC 2020 two-party presidential vote proxy is nearly even but slightly Republican.",
      class: "descriptive",
      evidence: `VEST precinct centroids total D ${packet.statewideVote.demPct}% / R ${packet.statewideVote.repPct}%.`,
    },
    {
      claim: "Democratic voters are spatially concentrated in fewer H3 cells than Republican voters at resolution 7.",
      class: "descriptive_with_centroid_caveat",
      evidence: `${concentration.demLeaningCells} D-leaning H3 cells versus ${concentration.repLeaningCells} R-leaning cells; ${concentration.demVotesInDemLeaningCellsPct}% of Democratic votes are in D-leaning cells.`,
    },
    {
      claim: "Baseline, enacted, and court plans can be compared with the same center-assignment diagnostic, but the comparison is not yet court-grade.",
      class: "descriptive_with_assignment_caveat",
      evidence: `118th baseline: ${baseline.demMajorityDistricts} D-majority / ${baseline.repMajorityDistricts} R-majority districts. 2022 court plan: ${court.demMajorityDistricts} D-majority / ${court.repMajorityDistricts} R-majority districts. 2023 enacted plan: ${enacted2023.demMajorityDistricts} D-majority / ${enacted2023.repMajorityDistricts} R-majority districts by precinct-centroid assignment.`,
    },
    {
      claim: "The NC registry now includes a meaningfully different enacted-vs-court contrast.",
      class: "descriptive_with_assignment_caveat",
      evidence: `${alternativePlans.map((plan) => `${plan.name}: ${plan.demMajorityDistricts}-${plan.repMajorityDistricts}, ${plan.competitiveDistricts} competitive`).join("; ")}. The contrast is useful for review triage but still depends on centroid assignment.`,
    },
    {
      claim: "Whether observed asymmetry is lawful, ensemble-typical, or map-drawing-driven cannot be concluded from this packet alone.",
      class: "requires_ensemble_and_expert_validation",
      evidence: "Needs ensemble baseline, district-specific election history, VRA/COI context, and polygon-apportioned precinct-to-district aggregation.",
    },
  ];
  return claims;
}

function markdown(packet) {
  const concentration = packet.h3VoteConcentration;
  const planRows = packet.planSummaries.map((plan) => (
    `| ${plan.name} | ${plan.demMajorityDistricts} | ${plan.repMajorityDistricts} | ${plan.competitiveDistricts} | ${plan.deepDemDistricts} | ${plan.deepRepDistricts} | ${plan.maxPopulationDeviationPct}% |`
  )).join("\n");
  return `# NC Asymmetry Decomposition Packet

Date: 2026-05-03

## Scope

This packet compares North Carolina's statewide vote proxy, H3 vote concentration, baseline congressional geography, the NC 2022 court plan, and the NC 2023 enacted plan used for the 2024 election using the data Honeycombing can inspect today.

## Statewide Vote Proxy

- VEST 2020 precinct-centroid records: ${packet.statewideVote.precincts.toLocaleString()}
- Two-party presidential signal: D ${packet.statewideVote.demPct}% / R ${packet.statewideVote.repPct}%
- Caveat: presidential vote is a partisan proxy, not congressional vote performance.

## H3 Vote Concentration

- H3 resolution ${concentration.h3Resolution} precinct-centroid cells: ${concentration.cells.toLocaleString()}
- D-leaning cells: ${concentration.demLeaningCells.toLocaleString()}
- R-leaning cells: ${concentration.repLeaningCells.toLocaleString()}
- Competitive cells within 5 points: ${concentration.competitiveCells.toLocaleString()}
- Voters in D-leaning cells: ${concentration.votersInDemLeaningCellsPct}%
- Democratic votes in D-leaning cells: ${concentration.demVotesInDemLeaningCellsPct}%

## Plan Diagnostic Summary

| Plan | D-majority districts | R-majority districts | Competitive districts | Deep-D districts | Deep-R districts | Max population deviation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${planRows}

## Claim Classes

${packet.claimClasses.map((claim) => `- **${claim.class}**: ${claim.claim} ${claim.evidence}`).join("\n")}

## Caveats

- Plan summaries assign H3 cell centers and precinct centroids to district polygons.
- The centroid shortcut audit showed precinct centroid assignment can be disqualifying for evidence in a bounded Alamance County test.
- The 2023 enacted plan adds a genuine contrast, but all plan summaries remain center-assignment diagnostics until polygon apportionment is implemented.
- This packet is useful for orienting expert review, not proving lawful or unlawful districting.
- Ensemble baselines, COI overlays, VRA evidence, and polygon-apportioned precinct-to-district aggregation remain required before strong claims.

## Next Artifact

Turn this packet into named NC starter selections, prioritizing one urban/suburban region and one region where the 2022 court and 2023 enacted boundaries differ visibly.
`;
}

async function main() {
  const h3Cells = await readJson("public/derived-data/census-h3/census-blocks-37-r7-2020.json");
  const precincts = await readJson("public/data/precincts-nc-2020.json");
  const counties = await readJson("public/data/counties-nc-2020.json");
  const registry = await readJson("public/data/plans/registry.json");
  const centroidAudit = await readJson("docs/research/outputs/centroid-shortcut-audit/alamance-r7-summary.json");

  const planSummaries = [];
  const planEntries = registry.plans.filter((plan) => plan.id === "us-congress-118-enacted" || isNcCongressionalRegistryPlan(plan));
  for (const entry of planEntries) {
    const plan = filterNcPlan(await readJson(`public${entry.url}`));
    planSummaries.push(summarizePlan(entry, plan, h3Cells, precincts));
  }

  const h3VoteCells = aggregatePrecinctsToH3(precincts, 7);
  const demVotes = sum(precincts, (row) => row.dem_votes);
  const repVotes = sum(precincts, (row) => row.rep_votes);
  const countyDemVotes = sum(counties, (row) => row.dem_votes);
  const countyRepVotes = sum(counties, (row) => row.rep_votes);

  const packet = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    caseStudy: {
      id: "nc",
      name: "North Carolina",
      year: 2020,
    },
    statewideVote: {
      source: "VEST 2020 precinct presidential returns, centroid point payload",
      precincts: precincts.length,
      demVotes,
      repVotes,
      totalVotes: demVotes + repVotes,
      demPct: percent(demVotes, demVotes + repVotes, 2),
      repPct: percent(repVotes, demVotes + repVotes, 2),
      countyCentroidDemPct: percent(countyDemVotes, countyDemVotes + countyRepVotes, 2),
      caveat: "2020 presidential vote is a partisan proxy and the current precinct layer uses centroid assignment.",
    },
    h3VoteConcentration: summarizeH3Concentration(h3VoteCells),
    planSummaries,
    centroidShortcutFinding: {
      source: "docs/research/outputs/centroid-shortcut-audit/alamance-r7-summary.json",
      layers: centroidAudit.layers.map((layer) => ({
        layer: layer.layer,
        classification: layer.classification,
        splitPolygons: layer.split_polygons,
        sourcePolygons: layer.source_polygons,
        maxVoteShareDeltaPp: layer.max_vote_share_delta_pp,
        maxPopulationCellDelta: layer.max_abs_cell_delta_by_field?.total_population ?? null,
      })),
    },
  };
  packet.claimClasses = claimClasses(packet);
  packet.caveats = [
    "Plan summaries assign H3 cell centers and precinct centroids to district polygons; this is not polygon apportionment.",
    "The centroid shortcut audit found precinct centroids can be disqualifying for evidence in the tested slice.",
    "The NC 2023 enacted plan adds a real alternative-plan contrast, but boundary-choice claims still require polygon-apportioned aggregation and expert validation.",
    "No ensemble baseline is included, so the packet cannot say whether a plan is an outlier among lawful alternatives.",
    "No CVAP, RPV, candidate-of-choice, or COI evidence is included, so VRA and legal conclusions are out of scope.",
  ];

  const outputDir = join(root, OUT_DIR);
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "nc-asymmetry-packet.json"), `${JSON.stringify(packet, null, 2)}\n`);

  const districtRows = [];
  for (const plan of packet.planSummaries) {
    for (const district of plan.districts) {
      districtRows.push([
        plan.planId,
        plan.name,
        district.districtId,
        district.name,
        district.population,
        district.nonwhitePct,
        district.precincts,
        district.demVotes,
        district.repVotes,
        district.demPct,
        district.marginPct,
        district.partyLean,
        district.band,
      ].join(","));
    }
  }
  await writeFile(
    join(outputDir, "nc-plan-district-diagnostics.csv"),
    [
      "plan_id,plan_name,district_id,district_name,population_center_assigned,nonwhite_pct,precincts_centroid_assigned,dem_votes,rep_votes,dem_pct,margin_pct,party_lean,band",
      ...districtRows,
    ].join("\n") + "\n",
  );
  await writeFile(join(outputDir, "nc-asymmetry-packet.md"), markdown(packet));

  console.log(`Wrote ${OUT_DIR}/nc-asymmetry-packet.json`);
  console.log(`Wrote ${OUT_DIR}/nc-plan-district-diagnostics.csv`);
  console.log(`Wrote ${OUT_DIR}/nc-asymmetry-packet.md`);
}

await main();
