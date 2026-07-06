import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { latLngToCell } from "h3-js";

import {
  assignPointsToPlanDistricts,
} from "../app/lib/honeycomb-ui-helpers.ts";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const H3_RESOLUTION = 7;
const COMPETITIVE_BAND_PP = 5;

const CLAIM_TAGS = {
  descriptive: "descriptive",
  centroid: "descriptive_with_centroid_caveat",
  assignment: "descriptive_with_assignment_caveat",
  expert: "requires_ensemble_and_expert_validation",
};

const BASE_PLAN_ID = "nc-2022-court-interim-congressional";
const COMPARE_PLAN_ID = "nc-2023-enacted-congressional";

const CASE_STUDY_REGIONS = [
  {
    id: "charlotte-mecklenburg",
    name: "Charlotte / Mecklenburg",
    shortName: "Charlotte",
    description: "Charlotte, Mecklenburg County, and the immediate suburban edge.",
    legalFrame:
      "Urban/suburban concentration test: does either plan pack the metro core into fewer districts or crack the suburban edge across many? The Mecklenburg centroid audit makes this the region where assignment caveats are strongest.",
    reviewerPrompt:
      "Inspect whether the metro core and suburban edge are packed, cracked, or preserved across plans, and whether the boundary changes between the court and enacted plans track any lawful criterion.",
    bounds: { south: 34.9, west: -81.15, north: 35.55, east: -80.45 },
    center: { lat: 35.23, lng: -80.84 },
    zoom: 9,
    deviationLedgerSeed: [
      {
        question: "Do the 2023 boundary shifts around the Charlotte core follow county lines, or do they cross Mecklenburg for another reason?",
        candidateJustifications: ["county-lines", "compactness", "partisan-choice"],
        status: "unresolved",
      },
      {
        question: "Is the suburban-edge reassignment consistent with what a compactness-driven redraw would produce?",
        candidateJustifications: ["compactness", "contiguity", "partisan-choice"],
        status: "needs-data",
        neededData: "Ensemble baseline of legally compliant plans for the Charlotte region.",
      },
    ],
  },
  {
    id: "eastern-black-belt",
    name: "Eastern Black Belt",
    shortName: "East NC",
    description: "Eastern North Carolina counties with substantial Black population and VRA-adjacent review questions.",
    legalFrame:
      "VRA-adjacent region: any deviation here may be a legally required VRA adjustment rather than a reviewable choice. Honeycombing can only flag where boundaries changed; it cannot classify a change as VRA-driven without CVAP, racially polarized voting, and candidate-of-choice evidence, none of which are implemented.",
    reviewerPrompt:
      "Inspect demographic concentration and plan continuity, and identify which boundary changes would need VRA analysis before any characterization is defensible.",
    bounds: { south: 34.85, west: -78.65, north: 36.6, east: -76.15 },
    center: { lat: 35.72, lng: -77.4 },
    zoom: 8,
    deviationLedgerSeed: [
      {
        question: "Which reassigned cells sit in areas where a VRA district could be legally required?",
        candidateJustifications: ["vra-required", "county-lines", "partisan-choice"],
        status: "needs-data",
        neededData: "CVAP, racially polarized voting analysis, and candidate-of-choice election history. Population composition alone cannot support a VRA conclusion.",
      },
      {
        question: "Do the 2023 changes split any county groupings that the NC whole-county provision would otherwise protect?",
        candidateJustifications: ["county-lines", "state-constitutional-criteria"],
        status: "unresolved",
      },
    ],
  },
];

async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

function round(value, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function percent(part, whole, digits = 1) {
  return whole > 0 ? round((part / whole) * 100, digits) : 0;
}

function sumRows(rows, getValue) {
  return rows.reduce((total, row) => total + (Number(getValue(row)) || 0), 0);
}

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

function populationLayer(cells, centroidAudits) {
  const total = sumRows(cells, (cell) => cell.total_population);
  const black = sumRows(cells, (cell) => cell.black_alone);
  const hispanic = sumRows(cells, (cell) => cell.hispanic_or_latino);
  const nonHispanicWhite = sumRows(cells, (cell) => cell.non_hispanic_white_alone);
  const nonwhite = Math.max(total - nonHispanicWhite, 0);

  return {
    claimTag: CLAIM_TAGS.assignment,
    h3Cells: cells.length,
    sourceBlockRecords: sumRows(cells, (cell) => cell.source_count),
    total,
    votingAge: sumRows(cells, (cell) => cell.voting_age_population),
    black,
    blackPct: percent(black, total),
    hispanic,
    hispanicPct: percent(hispanic, total),
    nonHispanicWhite,
    nonwhite,
    nonwhitePct: percent(nonwhite, total),
    assignmentCaveat:
      "Census block internal points are assigned to one H3 cell each. Bounded audits classify this shortcut as material_for_statistics: "
      + centroidAudits.map((audit) => `${audit.county} max cell population delta ${audit.blocksMaxCellPopulationDelta}`).join("; ")
      + ". Statistical use of these totals should move to polygon apportionment.",
  };
}

function voteCellsFromPrecincts(precincts) {
  const byCell = new Map();
  for (const precinct of precincts) {
    const cell = latLngToCell(Number(precinct.lat), Number(precinct.lng), H3_RESOLUTION);
    const entry = byCell.get(cell) ?? { demVotes: 0, repVotes: 0 };
    entry.demVotes += Number(precinct.dem_votes) || 0;
    entry.repVotes += Number(precinct.rep_votes) || 0;
    byCell.set(cell, entry);
  }
  return byCell;
}

function precinctSignal(precincts, centroidAudits) {
  const demVotes = sumRows(precincts, (row) => row.dem_votes);
  const repVotes = sumRows(precincts, (row) => row.rep_votes);
  const totalVotes = demVotes + repVotes;

  const voteCells = Array.from(voteCellsFromPrecincts(precincts).values());
  let demLeaning = 0;
  let repLeaning = 0;
  let competitive = 0;
  for (const cell of voteCells) {
    const cellTotal = cell.demVotes + cell.repVotes;
    if (cellTotal <= 0) continue;
    const demPct = (cell.demVotes / cellTotal) * 100;
    if (Math.abs(demPct - 50) <= COMPETITIVE_BAND_PP) competitive += 1;
    if (cell.demVotes > cell.repVotes) demLeaning += 1;
    else if (cell.repVotes > cell.demVotes) repLeaning += 1;
  }

  return {
    claimTag: CLAIM_TAGS.centroid,
    precincts: precincts.length,
    demVotes,
    repVotes,
    totalVotes,
    demPct: percent(demVotes, totalVotes),
    repPct: percent(repVotes, totalVotes),
    lean: demVotes > repVotes ? "D" : repVotes > demVotes ? "R" : "even",
    h3CellsWithVotes: voteCells.length,
    demLeaningCells: demLeaning,
    repLeaningCells: repLeaning,
    competitiveCells: competitive,
    competitiveBandPp: COMPETITIVE_BAND_PP,
    proxyCaveat:
      "2020 presidential returns are a partisan-lean proxy, not congressional performance.",
    centroidCaveat:
      "VEST precinct centroids are assigned to one H3 cell each. Bounded audits classify this shortcut as disqualifying_for_evidence_without_apportionment: "
      + centroidAudits.map((audit) => `${audit.county} max cell vote-share delta ${audit.precinctsMaxVoteShareDeltaPp}pp`).join("; ")
      + ".",
  };
}

function planAssignmentSummary(planEntry, assignments, cells) {
  const byDistrict = new Map();
  let assigned = 0;
  assignments.forEach((districtId, index) => {
    if (districtId == null) return;
    assigned += 1;
    const entry = byDistrict.get(districtId) ?? { cells: 0, population: 0 };
    entry.cells += 1;
    entry.population += Number(cells[index].total_population) || 0;
    byDistrict.set(districtId, entry);
  });

  return {
    claimTag: CLAIM_TAGS.assignment,
    planId: planEntry.id,
    name: planEntry.name,
    status: planEntry.status,
    cycle: planEntry.cycle,
    h3CentersAssigned: assigned,
    h3CentersUnassigned: assignments.length - assigned,
    districtsTouched: byDistrict.size,
    districts: Array.from(byDistrict.entries())
      .map(([districtId, entry]) => ({ districtId, h3Cells: entry.cells, population: entry.population }))
      .sort((a, b) => a.districtId.localeCompare(b.districtId, undefined, { numeric: true })),
  };
}

function boundaryDelta(baseEntry, compareEntry, baseAssignments, compareAssignments, cells, precincts, basePlan, comparePlan) {
  const flows = new Map();
  let reassigned = 0;
  let reassignedPopulation = 0;
  let comparedCells = 0;
  const totalPopulation = sumRows(cells, (cell) => cell.total_population);

  cells.forEach((cell, index) => {
    const from = baseAssignments[index];
    const to = compareAssignments[index];
    if (from == null || to == null) return;
    comparedCells += 1;
    if (from === to) return;
    reassigned += 1;
    reassignedPopulation += Number(cell.total_population) || 0;
    const key = `${from}->${to}`;
    const entry = flows.get(key) ?? { fromDistrictId: from, toDistrictId: to, h3Cells: 0, population: 0 };
    entry.h3Cells += 1;
    entry.population += Number(cell.total_population) || 0;
    flows.set(key, entry);
  });

  const precinctPoints = precincts.map((precinct) => ({ lat: Number(precinct.lat), lng: Number(precinct.lng) }));
  const precinctBase = assignPointsToPlanDistricts(basePlan, precinctPoints);
  const precinctCompare = assignPointsToPlanDistricts(comparePlan, precinctPoints);
  let reassignedPrecincts = 0;
  let reassignedDem = 0;
  let reassignedRep = 0;
  precincts.forEach((precinct, index) => {
    const from = precinctBase[index];
    const to = precinctCompare[index];
    if (from == null || to == null || from === to) return;
    reassignedPrecincts += 1;
    reassignedDem += Number(precinct.dem_votes) || 0;
    reassignedRep += Number(precinct.rep_votes) || 0;
  });
  const reassignedTotalVotes = reassignedDem + reassignedRep;

  return {
    claimTag: CLAIM_TAGS.assignment,
    interpretationTag: CLAIM_TAGS.expert,
    basePlanId: baseEntry.id,
    basePlanName: baseEntry.name,
    comparePlanId: compareEntry.id,
    comparePlanName: compareEntry.name,
    h3CellsCompared: comparedCells,
    h3CellsReassigned: reassigned,
    reassignedCellPct: percent(reassigned, comparedCells),
    populationInReassignedCells: reassignedPopulation,
    populationInReassignedCellsPct: percent(reassignedPopulation, totalPopulation),
    reassignedPrecinctSignal: {
      claimTag: CLAIM_TAGS.centroid,
      precinctsReassigned: reassignedPrecincts,
      demVotes: reassignedDem,
      repVotes: reassignedRep,
      totalVotes: reassignedTotalVotes,
      demPct: percent(reassignedDem, reassignedTotalVotes),
      repPct: percent(reassignedRep, reassignedTotalVotes),
      lean: reassignedDem > reassignedRep ? "D" : reassignedRep > reassignedDem ? "R" : "even",
    },
    districtFlows: Array.from(flows.values())
      .sort((a, b) => b.population - a.population),
    interpretationNote:
      "Reassignment counts describe where the two adopted boundary sets differ inside this selection. Whether any flow is lawful, ensemble-typical, VRA-required, or a reviewable choice cannot be concluded from this packet; it needs an ensemble baseline, district election history, and VRA/COI context.",
  };
}

function caseStudyPacket(region, h3Cells, precincts, planPayloads, centroidAudits) {
  const cells = h3Cells.filter((cell) => inBounds(cell, region.bounds));
  const cellPoints = cells.map((cell) => ({ lat: cell.lat, lng: cell.lng }));
  const regionPrecincts = precincts.filter((precinct) => inBounds(precinct, region.bounds));

  const assignmentsByPlan = planPayloads.map(({ entry, plan }) => ({
    entry,
    plan,
    assignments: assignPointsToPlanDistricts(plan, cellPoints),
  }));

  const base = assignmentsByPlan.find(({ entry }) => entry.id === BASE_PLAN_ID);
  const compare = assignmentsByPlan.find(({ entry }) => entry.id === COMPARE_PLAN_ID);

  return {
    id: region.id,
    name: region.name,
    shortName: region.shortName,
    description: region.description,
    legalFrame: region.legalFrame,
    reviewerPrompt: region.reviewerPrompt,
    bounds: region.bounds,
    center: region.center,
    zoom: region.zoom,
    h3Resolution: H3_RESOLUTION,
    selectionCaveat:
      "Bounds are a rectangular review selection, not an official region or a legal community of interest.",
    populationLayer: populationLayer(cells, centroidAudits),
    precinctSignal: precinctSignal(regionPrecincts, centroidAudits),
    planAssignments: assignmentsByPlan.map(({ entry, assignments }) => (
      planAssignmentSummary(entry, assignments, cells)
    )),
    boundaryDelta: boundaryDelta(
      base.entry,
      compare.entry,
      base.assignments,
      compare.assignments,
      cells,
      regionPrecincts,
      base.plan,
      compare.plan,
    ),
    deviationLedgerSeed: region.deviationLedgerSeed,
    caveats: [
      "H3 cells are equal-area hexagons, not districts and not equal-population units; raw hex counts are not a seat measure.",
      "Population uses Census block internal points assigned to H3 cells; precinct signal uses VEST precinct centroids. Both shortcuts failed bounded audits for evidence-grade statistics.",
      "Plan assignment uses H3 cell center points inside plan polygons, not area or population apportionment.",
      "2020 presidential returns are a partisan-lean proxy, not congressional performance.",
      "No CVAP, racially polarized voting, candidate-of-choice, COI, or ensemble analysis is included. No VRA conclusion can be drawn from this packet.",
    ],
  };
}

function loadCentroidAudits(summaries) {
  return summaries.map((summary) => {
    const blocks = summary.layers.find((layer) => layer.layer === "blocks");
    const precincts = summary.layers.find((layer) => layer.layer === "precincts");
    return {
      county: `${summary.county.name} County`,
      countyFips: summary.county.countyFips,
      blocksClassification: blocks.classification,
      blocksMaxCellPopulationDelta: round(blocks.max_abs_cell_delta_by_field.total_population, 2),
      precinctsClassification: precincts.classification,
      precinctsMaxVoteShareDeltaPp: round(precincts.max_vote_share_delta_pp, 2),
    };
  });
}

function markdownReport(output) {
  const lines = [
    "# NC Named-Selection Case Study",
    "",
    `Generated: ${output.generatedAt.slice(0, 10)} (data vintage: 2020 Census, VEST 2020, plans as registered)`,
    "",
    "Two named selections compare the H3 population layer, the precinct partisan proxy, and the district assignments of the 118th enacted, NC 2022 court-ordered, and NC 2023 enacted congressional plans. Every quantitative claim carries a claim tag. This packet is descriptive review triage, not evidence.",
    "",
  ];

  for (const region of output.regions) {
    const pop = region.populationLayer;
    const signal = region.precinctSignal;
    const delta = region.boundaryDelta;
    lines.push(
      `## ${region.name}`,
      "",
      region.legalFrame,
      "",
      `- H3 r${region.h3Resolution} cells: ${pop.h3Cells.toLocaleString()} | population ${pop.total.toLocaleString()} | Black ${pop.blackPct}% | nonwhite ${pop.nonwhitePct}% \`${pop.claimTag}\``,
      `- Precinct proxy: ${signal.precincts.toLocaleString()} precincts, D ${signal.demPct}% / R ${signal.repPct}% | cells with votes: ${signal.h3CellsWithVotes.toLocaleString()} (${signal.demLeaningCells} D-leaning, ${signal.repLeaningCells} R-leaning, ${signal.competitiveCells} within ±${signal.competitiveBandPp}pp) \`${signal.claimTag}\``,
      "",
      "| Plan | Status | Districts touched | Cells assigned |",
      "| --- | --- | ---: | ---: |",
    );
    for (const plan of region.planAssignments) {
      lines.push(`| ${plan.name} | ${plan.status} | ${plan.districtsTouched} | ${plan.h3CentersAssigned.toLocaleString()} |`);
    }
    lines.push(
      "",
      `### Boundary delta: ${delta.basePlanName} vs ${delta.comparePlanName}`,
      "",
      `- Cells reassigned: ${delta.h3CellsReassigned.toLocaleString()} of ${delta.h3CellsCompared.toLocaleString()} (${delta.reassignedCellPct}%) \`${delta.claimTag}\``,
      `- Population in reassigned cells: ${delta.populationInReassignedCells.toLocaleString()} (${delta.populationInReassignedCellsPct}% of selection) \`${delta.claimTag}\``,
      `- Reassigned-precinct proxy signal: ${delta.reassignedPrecinctSignal.precinctsReassigned} precincts, D ${delta.reassignedPrecinctSignal.demPct}% / R ${delta.reassignedPrecinctSignal.repPct}% (lean ${delta.reassignedPrecinctSignal.lean}) \`${delta.reassignedPrecinctSignal.claimTag}\``,
      "",
      "| Flow | Cells | Population |",
      "| --- | ---: | ---: |",
    );
    for (const flow of delta.districtFlows) {
      lines.push(`| ${flow.fromDistrictId} -> ${flow.toDistrictId} | ${flow.h3Cells.toLocaleString()} | ${flow.population.toLocaleString()} |`);
    }
    lines.push(
      "",
      `Interpretation: ${delta.interpretationNote} \`${delta.interpretationTag}\``,
      "",
      "### Deviation ledger seed",
      "",
    );
    for (const item of region.deviationLedgerSeed) {
      lines.push(`- [${item.status}] ${item.question} (candidates: ${item.candidateJustifications.join(", ")})${item.neededData ? ` — needs: ${item.neededData}` : ""}`);
    }
    lines.push("");
  }

  lines.push(
    "## Shared caveats",
    "",
    ...output.sharedCaveats.map((caveat) => `- ${caveat}`),
    "",
    "## Assignment audits backing the claim tags",
    "",
    ...output.centroidAudits.map((audit) => (
      `- ${audit.county} (\`${audit.countyFips}\`): blocks ${audit.blocksClassification} (max cell pop delta ${audit.blocksMaxCellPopulationDelta}); precincts ${audit.precinctsClassification} (max cell vote-share delta ${audit.precinctsMaxVoteShareDeltaPp}pp)`
    )),
    "",
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  const manifest = await readJson("public/derived-data/census-h3/census-blocks-37-r7-2020.manifest.json");
  const h3Cells = await readJson("public/derived-data/census-h3/census-blocks-37-r7-2020.json");
  const precincts = (await readJson("public/data/precincts-nc-2020.json"))
    .filter((precinct) => precinct.state === "NC");
  const registry = await readJson("public/data/plans/registry.json");

  const centroidAudits = loadCentroidAudits([
    await readJson("docs/research/outputs/centroid-shortcut-audit/alamance-r7-summary.json"),
    await readJson("docs/research/outputs/centroid-shortcut-audit/mecklenburg-r7-summary.json"),
  ]);

  const planPayloads = [];
  for (const entry of registry.plans) {
    if (entry.metadata?.office !== "U.S. House") continue;
    const plan = filterNorthCarolinaPlan(await readJson(`public${entry.url}`));
    if (plan.features.length === 0) continue;
    planPayloads.push({ entry, plan });
  }

  const output = {
    schemaVersion: 1,
    id: "nc-named-selections",
    title: "North Carolina named-selection case study",
    generatedAt: manifest.generated_at,
    reviewStance:
      "Diagnostic review triage for redistricting experts. Descriptive only; not court-grade evidence, not a fairness score, not a VRA analysis.",
    caseStudy: { id: "nc", name: "North Carolina", stateFips: "37", year: 2020 },
    claimTags: CLAIM_TAGS,
    centroidAudits,
    regions: CASE_STUDY_REGIONS.map((region) => (
      caseStudyPacket(region, h3Cells, precincts, planPayloads, centroidAudits)
    )),
    sharedCaveats: [
      "H3 cells are equal-area hexagons, not districts and not equal-population units.",
      "All point-in-polygon assignment uses cell centers or precinct centroids; bounded audits rate these shortcuts material_for_statistics (blocks) and disqualifying_for_evidence_without_apportionment (precinct votes).",
      "Whether any observed asymmetry or boundary flow is lawful, ensemble-typical, or map-drawing-driven cannot be concluded without an ensemble baseline, district election history, and VRA/COI context.",
    ],
    reviewerQuestions: [
      "Which of the reported boundary flows would a redistricting lawyer treat as presumptively explained by county-line or contiguity requirements?",
      "For the Eastern Black Belt, what minimum evidence set would you require before characterizing any flow as VRA-related in either direction?",
      "Is the reassigned-population framing (cells and population moved between the court and enacted plans) a useful triage signal, or does it invite over-reading?",
      "What should be added or removed before this packet is shown to an election-data practitioner cold?",
    ],
  };

  const packetPath = join(root, "public/data/case-studies/nc-named-selections.json");
  await mkdir(dirname(packetPath), { recursive: true });
  await writeFile(packetPath, `${JSON.stringify(output, null, 2)}\n`);

  const reportPath = join(root, "docs/research/outputs/nc-case-study/nc-named-selections.md");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, markdownReport(output));

  console.log(`Wrote ${packetPath}`);
  console.log(`Wrote ${reportPath}`);
  for (const region of output.regions) {
    const delta = region.boundaryDelta;
    console.log(
      `${region.id}: ${region.populationLayer.h3Cells} cells, `
      + `${delta.h3CellsReassigned}/${delta.h3CellsCompared} reassigned (${delta.reassignedCellPct}%), `
      + `${delta.districtFlows.length} flows`,
    );
  }
}

await main();
