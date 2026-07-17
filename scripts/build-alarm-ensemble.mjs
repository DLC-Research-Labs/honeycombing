import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Normalizes the ALARM Project's published NC congressional ensemble into the
// Honeycombing EnsembleSummary schema (expert-review Objective 3). Every
// distribution below is computed from ALARM's per-plan, per-district 2020
// presidential vote counts so the ensemble uses the same partisan-lean proxy
// as the rest of the Honeycombing pipeline. The payload ships as status
// "draft": constraints are documented (the outlier gate opens), but promotion
// to "published" waits on expert review of the consistency checks.

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const STATS_CSV = join(root, "data/alarm/NC_cd_2020_stats.csv");
const DIAGNOSTICS_CSV = join(root, "docs/research/outputs/nc-asymmetry/nc-plan-district-diagnostics.csv");
const OUT_DIR = join(root, "public/data/ensembles");
const REPORT_DIR = join(root, "docs/research/outputs/alarm-ensemble");

const DATASET_DOI_URL = "https://doi.org/10.7910/DVN/SLCD3E";
const CITATION =
  "McCartan, Kenny, Simko, Kuriwaki, Garcia, Wang, Wu, Ebowe, O'Sullivan, Samarth, Arora, Gao, Zhao & Imai, "
  + "\"50-State Redistricting Simulations\" (Harvard Dataverse, doi:10.7910/DVN/SLCD3E, version 15), "
  + "files NC_cd_2020_stats.csv and NC_cd_2020_doc.html. See also McCartan et al., "
  + "\"Simulated redistricting plans for the analysis and evaluation of redistricting in the United States\", "
  + "Scientific Data 9:689 (2022).";

const REFERENCE_DRAW = "cd_2020";
const REFERENCE_REGISTRY_PLAN = "nc-2022-court-interim-congressional";
const UNIT_REFERENCE_PLAN = "nc-2023-enacted-congressional";
// Calibration tolerance between ALARM's exact precinct-assignment district
// shares for the reference plan and our centroid-assigned shares for the same
// geometry. The centroid-shortcut audits found cell-level errors up to 16pp;
// district-level aggregation is expected to wash most of that out.
const CALIBRATION_TOLERANCE = 0.01;

if (!existsSync(STATS_CSV)) {
  console.error(
    `Missing ${STATS_CSV}\n\n`
    + "Download the ALARM NC 2020 congressional ensemble (CC0) first:\n"
    + "  mkdir -p data/alarm\n"
    + "  curl -sL 'https://dataverse.harvard.edu/api/access/datafile/6392710?format=original' -o data/alarm/NC_cd_2020_stats.csv\n"
    + "  curl -sL 'https://dataverse.harvard.edu/api/access/datafile/6431354' -o data/alarm/NC_cd_2020_doc.html\n",
  );
  process.exit(1);
}

// ── Parse the ALARM stats CSV ────────────────────────────────────────────────
// Simple CSV: quoted fields never contain commas; numeric fields may carry
// leading spaces.

const statsText = await readFile(STATS_CSV, "utf8");
const statsLines = statsText.split("\n").filter((line) => line.length > 0);
const statsHeader = statsLines[0].split(",");
const drawIndex = statsHeader.indexOf("draw");
const demIndex = statsHeader.indexOf("pre_20_dem_bid");
const repIndex = statsHeader.indexOf("pre_20_rep_tru");
if (drawIndex < 0 || demIndex < 0 || repIndex < 0) {
  throw new Error("NC_cd_2020_stats.csv is missing draw/pre_20_dem_bid/pre_20_rep_tru columns");
}

/** @type {Map<string, number[]>} draw id -> district Democratic two-party shares */
const sharesByDraw = new Map();
for (let i = 1; i < statsLines.length; i += 1) {
  const cells = statsLines[i].split(",");
  const draw = cells[drawIndex].trim().replaceAll("\"", "");
  const dem = Number.parseFloat(cells[demIndex]);
  const rep = Number.parseFloat(cells[repIndex]);
  if (!Number.isFinite(dem) || !Number.isFinite(rep)) {
    throw new Error(`Non-numeric 2020 presidential votes on line ${i + 1}`);
  }
  let shares = sharesByDraw.get(draw);
  if (!shares) {
    shares = [];
    sharesByDraw.set(draw, shares);
  }
  shares.push(dem / (dem + rep));
}

const sampledDraws = [...sharesByDraw.keys()].filter((draw) => /^\d+$/.test(draw));
const referenceShares = sharesByDraw.get(REFERENCE_DRAW);
if (!referenceShares) throw new Error(`Reference draw ${REFERENCE_DRAW} not found in stats file`);

const districtCount = referenceShares.length;
for (const draw of sampledDraws) {
  if (sharesByDraw.get(draw).length !== districtCount) {
    throw new Error(`Draw ${draw} does not have ${districtCount} districts`);
  }
}

// ── Parse our plan diagnostics (centroid-assigned precinct votes) ────────────

const diagnosticsText = await readFile(DIAGNOSTICS_CSV, "utf8");
const diagnosticsLines = diagnosticsText.trim().split("\n");
const diagnosticsHeader = diagnosticsLines[0].split(",");
const column = (name) => {
  const index = diagnosticsHeader.indexOf(name);
  if (index < 0) throw new Error(`Diagnostics CSV is missing column ${name}`);
  return index;
};
const planIdIndex = column("plan_id");
const districtIdIndex = column("district_id");
const demVotesIndex = column("dem_votes");
const repVotesIndex = column("rep_votes");

/** @type {Map<string, { districtId: string, share: number }[]>} */
const planDistricts = new Map();
for (let i = 1; i < diagnosticsLines.length; i += 1) {
  const cells = diagnosticsLines[i].split(",");
  const planId = cells[planIdIndex];
  const dem = Number.parseFloat(cells[demVotesIndex]);
  const rep = Number.parseFloat(cells[repVotesIndex]);
  let districts = planDistricts.get(planId);
  if (!districts) {
    districts = [];
    planDistricts.set(planId, districts);
  }
  districts.push({ districtId: cells[districtIdIndex], share: dem / (dem + rep) });
}

// ── Calibration check: ALARM reference draw vs our centroid-assigned shares ──
// ALARM's cd_2020 reference draw is the 2022 ratified congressional map — the
// same geometry as our nc-2022-court-interim-congressional registry plan.
// Comparing rank-sorted district shares measures how much our precinct
// centroid shortcut moves district-level aggregates.

const ourReference = planDistricts.get(REFERENCE_REGISTRY_PLAN);
if (!ourReference || ourReference.length !== districtCount) {
  throw new Error(`Diagnostics for ${REFERENCE_REGISTRY_PLAN} missing or wrong district count`);
}
const alarmSorted = [...referenceShares].sort((a, b) => a - b);
const oursSorted = ourReference.map((district) => district.share).sort((a, b) => a - b);
const calibrationDeltas = alarmSorted.map((share, index) => Math.abs(share - oursSorted[index]));
const maxCalibrationDelta = Math.max(...calibrationDeltas);
if (maxCalibrationDelta > CALIBRATION_TOLERANCE) {
  throw new Error(
    `Calibration failed: max rank-sorted district share delta ${maxCalibrationDelta.toFixed(4)} `
    + `exceeds tolerance ${CALIBRATION_TOLERANCE}`,
  );
}

// ── Seat measure ─────────────────────────────────────────────────────────────

const demSeats = (shares) => shares.reduce((total, share) => total + (share > 0.5 ? 1 : 0), 0);

const seatCounts = new Map();
for (const draw of sampledDraws) {
  const seats = demSeats(sharesByDraw.get(draw));
  seatCounts.set(seats, (seatCounts.get(seats) ?? 0) + 1);
}
const histogram = [...seatCounts.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([value, planCount]) => ({ value, planCount }));

const round1 = (value) => Math.round(value * 10) / 10;
const round4 = (value) => Math.round(value * 10000) / 10000;

const seatPercentile = (seats) => {
  let below = 0;
  let equal = 0;
  for (const bin of histogram) {
    if (bin.value < seats) below += bin.planCount;
    if (bin.value === seats) equal += bin.planCount;
  }
  return round1(((below + equal / 2) / sampledDraws.length) * 100);
};

const comparedPlans = [
  "us-congress-118-enacted",
  "nc-2022-court-interim-congressional",
  "nc-2023-enacted-congressional",
  "nc-2025-enacted-congressional",
].map((planId) => {
  const districts = planDistricts.get(planId);
  if (!districts) throw new Error(`Diagnostics missing plan ${planId}`);
  const value = demSeats(districts.map((district) => district.share));
  return { planId, value, percentile: seatPercentile(value) };
});

// ── District-keyed unit measure: rank-ordered Democratic share ──────────────
// Districts are not identity-comparable across plans, so we use the standard
// ranked-marginal device: compare the k-th most Republican-to-Democratic
// district across all plans, and key each 2023 enacted district by the rank
// it holds within its own plan.

const quantile = (sorted, q) => {
  const position = q * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

/** @type {number[][]} rankValues[k] = sorted k-th ranked share across sampled draws */
const rankValues = Array.from({ length: districtCount }, () => []);
for (const draw of sampledDraws) {
  const sorted = [...sharesByDraw.get(draw)].sort((a, b) => a - b);
  for (let rank = 0; rank < districtCount; rank += 1) {
    rankValues[rank].push(sorted[rank]);
  }
}
for (const values of rankValues) values.sort((a, b) => a - b);

const unitPlan = planDistricts.get(UNIT_REFERENCE_PLAN);
if (!unitPlan || unitPlan.length !== districtCount) {
  throw new Error(`Diagnostics for ${UNIT_REFERENCE_PLAN} missing or wrong district count`);
}
const rankedUnits = [...unitPlan]
  .sort((a, b) => a.share - b.share)
  .map((district, rank) => {
    const values = rankValues[rank];
    let below = 0;
    let equal = 0;
    for (const value of values) {
      if (value < district.share) below += 1;
      else if (value === district.share) equal += 1;
    }
    return {
      unitId: district.districtId,
      percentiles: {
        p5: round4(quantile(values, 0.05)),
        p25: round4(quantile(values, 0.25)),
        p50: round4(quantile(values, 0.5)),
        p75: round4(quantile(values, 0.75)),
        p95: round4(quantile(values, 0.95)),
      },
      comparedValue: round4(district.share),
      comparedPercentile: round1(((below + equal / 2) / values.length) * 100),
    };
  })
  .sort((a, b) => a.unitId.localeCompare(b.unitId));

// ── Assemble the summary ─────────────────────────────────────────────────────

const CENTROID_CAVEAT =
  "Compared-plan values (seat counts and district shares) are computed by Honeycombing from VEST 2020 precinct "
  + "centroid assignment (descriptive_with_assignment_caveat). Calibration against ALARM's exact precinct assignment "
  + `for the same reference geometry shows a maximum rank-sorted district share difference of ${(maxCalibrationDelta * 100).toFixed(2)}pp.`;

const summary = {
  schemaVersion: 1,
  id: "nc-congress-2020-alarm",
  title: "North Carolina congressional ensemble (ALARM 50-State Simulations)",
  status: "draft",
  jurisdiction: "North Carolina",
  office: "U.S. House",
  generatedAt: "2026-07-17T00:00:00Z",
  method: {
    generator: "ALARM Project 50-State Redistricting Simulations (redist SMC)",
    algorithm:
      "Sequential Monte Carlo via the redist package: 20,000 plans sampled across two independent runs, "
      + "thinned to 5,000. Honeycombing computes all distributions below from ALARM's published per-district "
      + "2020 presidential vote counts (pre_20), not ALARM's multi-election composite indices.",
    planCount: sampledDraws.length,
    constraints: [
      {
        id: "pop-deviation",
        description: "Maximum population deviation of 0.5% (NC Const. Art. II §§3, 5 equal-population requirement).",
      },
      { id: "contiguity", description: "Districts must be contiguous (NC Const. Art. II §§3, 5)." },
      { id: "compactness", description: "Districts must be geographically compact (NC Const. Art. II §§3, 5)." },
      {
        id: "county-splits",
        description: "County boundaries preserved as much as possible (NC whole-county provision).",
      },
      {
        id: "vra-handling",
        description:
          "Hinge Gibbs constraint targeting the same number of majority-minority districts as the enacted plan, "
          + "plus a hinge Gibbs constraint discouraging packing of minority voters. This is a simulation constraint, "
          + "not a VRA §2 analysis (no CVAP, racially-polarized-voting, or candidate-of-choice evidence).",
      },
    ],
    sourceUrl: DATASET_DOI_URL,
    citation: CITATION,
  },
  seatMeasure: {
    measureId: "dem_seats_pre20",
    label: `Democratic seats (of ${districtCount})`,
    definition:
      "Number of districts with a Democratic two-party majority under the 2020 presidential vote, per ensemble plan. "
      + "Computed from ALARM's per-district pre_20 vote counts; a partisan-lean proxy, not congressional performance.",
    histogram,
    comparedPlans,
  },
  unitMeasures: [
    {
      measureId: "ranked_dem_share_pre20",
      label: "District Democratic two-party share (rank-matched)",
      definition:
        "Distribution across ensemble plans of the k-th ranked district Democratic two-party share (2020 presidential), "
        + "where k is the rank each 2023 enacted district holds within its own plan. Districts are compared by rank, "
        + "not identity, because district numbering is not stable across plans.",
      unitKeyType: "district",
      referencePlanId: UNIT_REFERENCE_PLAN,
      units: rankedUnits,
    },
  ],
  caveats: [
    "DRAFT: distributions are computed from ALARM's published statistics, but the payload stays draft until the "
      + "consistency checks are expert-reviewed. Percentiles are only meaningful relative to the documented constraint set.",
    "The seat and share measures use the 2020 presidential proxy (pre_20), not ALARM's e_dem/pr_dem multi-election "
      + "composites and not congressional election results.",
    CENTROID_CAVEAT,
    "The ensemble was simulated for the 2020 redistricting cycle with the 2022 ratified congressional map as its "
      + "reference plan. Percentile positions describe where a plan sits in this simulated distribution; they are not "
      + "evidence of intent or legal injury.",
    "The district-level unit measure (ranked_dem_share_pre20) ranks the 2023 enacted plan's districts; a rank-matched "
      + "measure for the 2025 enacted plan (SL 2025-95) has not been generated yet.",
    "No H3 cell-level measure yet: cell projection requires ALARM's plan assignment matrices (NC_cd_2020_plans.rds), "
      + "which this adapter does not ingest.",
  ],
};

// ── Upsert the registry (keeps the mock as a test fixture, real data first) ──

const STATUS_ORDER = { published: 0, draft: 1, mock: 2 };
const registryPath = join(OUT_DIR, "registry.json");
const registry = existsSync(registryPath)
  ? JSON.parse(await readFile(registryPath, "utf8"))
  : { schemaVersion: 1, ensembles: [] };

const entry = {
  id: summary.id,
  name: summary.title,
  source: "ALARM Project, 50-State Redistricting Simulations (Harvard Dataverse, CC0)",
  url: "/data/ensembles/nc-congress-2020-alarm.json",
  status: summary.status,
  description:
    "Real NC congressional ensemble (5,000 redist SMC plans) normalized from ALARM's published per-district statistics "
    + "under the 2020 presidential proxy.",
  caveats: summary.caveats,
  metadata: {
    jurisdiction: "North Carolina",
    office: "U.S. House",
    planCount: sampledDraws.length,
    generator: "redist-smc-alarm",
    sourceUrl: DATASET_DOI_URL,
  },
};

registry.ensembles = [
  entry,
  ...registry.ensembles.filter((candidate) => candidate.id !== entry.id),
].sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || a.id.localeCompare(b.id));

// ── Research report ──────────────────────────────────────────────────────────

const histogramTable = histogram
  .map((bin) => `| ${bin.value} | ${bin.planCount} | ${((bin.planCount / sampledDraws.length) * 100).toFixed(1)}% |`)
  .join("\n");
const comparedPlan = (planId) => {
  const plan = comparedPlans.find((candidate) => candidate.planId === planId);
  if (!plan) throw new Error(`Compared plans missing ${planId}`);
  return plan;
};
const comparedTable = comparedPlans
  .map((plan) => `| ${plan.planId} | ${plan.value} | ${plan.percentile} |`)
  .join("\n");
const calibrationTable = alarmSorted
  .map((share, index) => `| ${index + 1} | ${(share * 100).toFixed(2)} | ${(oursSorted[index] * 100).toFixed(2)} | ${(calibrationDeltas[index] * 100).toFixed(2)} |`)
  .join("\n");

const report = `# ALARM NC Congressional Ensemble Ingestion

Generated by \`scripts/build-alarm-ensemble.mjs\` on 2026-07-17.

Source: ALARM Project, 50-State Redistricting Simulations (Harvard Dataverse, doi:10.7910/DVN/SLCD3E, v15, CC0),
files \`NC_cd_2020_stats.csv\` + \`NC_cd_2020_doc.html\`. ${sampledDraws.length} sampled plans, ${districtCount} districts,
reference draw \`${REFERENCE_DRAW}\` (the 2022 ratified congressional map).

All measures below use the 2020 presidential two-party vote (ALARM's \`pre_20\` columns) — the same partisan-lean
proxy as the rest of the Honeycombing pipeline. Claim tag for every number: \`descriptive\` relative to the documented
constraint set; compared-plan values additionally carry \`descriptive_with_assignment_caveat\`.

## Seat distribution (Democratic seats of ${districtCount})

| Seats | Plans | Share |
| --- | --- | --- |
${histogramTable}

## Compared plans

| Registry plan | Dem seats (pre-2020 proxy) | Ensemble percentile |
| --- | --- | --- |
${comparedTable}

The 2023 enacted plan (used in the 2024 election) sits at percentile ${comparedPlan("nc-2023-enacted-congressional").percentile}
of the ensemble seat distribution (${comparedPlan("nc-2023-enacted-congressional").value} Democratic seats
against an ensemble median of 6) — a low outlier under \`classifyEnsemblePercentile\`. The 2025 enacted plan
(SL 2025-95, the October 2025 mid-decade redraw in force for the 2026 election) sits at percentile
${comparedPlan("nc-2025-enacted-congressional").percentile} with
${comparedPlan("nc-2025-enacted-congressional").value} Democratic seats — ${
  histogram.filter((bin) => bin.value <= comparedPlan("nc-2025-enacted-congressional").value)
    .reduce((total, bin) => total + bin.planCount, 0)
} of ${sampledDraws.length} simulated plans produce that few or fewer (ensemble minimum: ${histogram[0].value}).
The 2022 court plan sits at percentile ${comparedPlan("nc-2022-court-interim-congressional").percentile} —
high edge, not an outlier. Whether any plan's position reflects unlawful intent is NOT concluded here;
the ensemble's constraint set is the entire meaning of these percentiles.

## Calibration: ALARM exact assignment vs Honeycombing centroid assignment

ALARM's reference draw and our \`${REFERENCE_REGISTRY_PLAN}\` registry plan share the same geometry. Rank-sorted
district Democratic shares:

| Rank | ALARM share (%) | Honeycombing share (%) | |delta| (pp) |
| --- | --- | --- | --- |
${calibrationTable}

Maximum difference: **${(maxCalibrationDelta * 100).toFixed(2)}pp** (tolerance ${(CALIBRATION_TOLERANCE * 100).toFixed(0)}pp). The precinct-centroid
shortcut, rated disqualifying at cell level by the Alamance and Mecklenburg audits, largely washes out at district
aggregation — consistent with the audits' prediction.

## Not ingested

- ALARM's multi-election composites (\`ndv\`, \`e_dvs\`, \`pr_dem\`, \`e_dem\`, \`pbias\`, \`egap\`).
- Plan assignment matrices (\`NC_cd_2020_plans.rds\`) — required for the H3 cell-level projection measure.
- The NC 2010-cycle ensemble (\`NC_cd_2010_*\`).
`;

await mkdir(OUT_DIR, { recursive: true });
await mkdir(REPORT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, "nc-congress-2020-alarm.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
await writeFile(join(REPORT_DIR, "nc-alarm-ensemble-ingestion.md"), report);

console.log(`Wrote ${join(OUT_DIR, "nc-congress-2020-alarm.json")}`);
console.log(`Wrote ${registryPath}`);
console.log(`Wrote ${join(REPORT_DIR, "nc-alarm-ensemble-ingestion.md")}`);
console.log(`plans ${sampledDraws.length}; calibration max delta ${(maxCalibrationDelta * 100).toFixed(2)}pp`);
for (const plan of comparedPlans) {
  console.log(`  ${plan.planId}: ${plan.value} seats @ p${plan.percentile}`);
}
