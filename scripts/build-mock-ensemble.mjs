import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Every number in this payload is FABRICATED. The file exists so the ensemble
// explainer schema (expert-review Objective 3) can be validated in tests and
// UI before a real ALARM or GerryChain NC ensemble is normalized into the
// same shape. Values are deterministic literals, not sampled, so the artifact
// is byte-stable across reruns.

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const MOCK_CAVEAT =
  "MOCK PAYLOAD: every number below is fabricated to exercise the schema and UI. "
  + "It is not an ensemble analysis of North Carolina and must never be cited or displayed as evidence.";

// Fabricated 14-seat histogram over 5,000 pretend plans, centered on 6-7
// Democratic seats to look plausible against the statewide ~49.3% D proxy.
const SEAT_HISTOGRAM = [
  { value: 3, planCount: 7 },
  { value: 4, planCount: 38 },
  { value: 5, planCount: 611 },
  { value: 6, planCount: 1892 },
  { value: 7, planCount: 1738 },
  { value: 8, planCount: 601 },
  { value: 9, planCount: 113 },
];

const PLAN_COUNT = SEAT_HISTOGRAM.reduce((total, bin) => total + bin.planCount, 0);

function seatPercentile(seats) {
  let below = 0;
  let equal = 0;
  for (const bin of SEAT_HISTOGRAM) {
    if (bin.value < seats) below += bin.planCount;
    if (bin.value === seats) equal += bin.planCount;
  }
  return Math.round(((below + equal / 2) / PLAN_COUNT) * 1000) / 10;
}

// Fabricated district Democratic two-party shares under the 2023 enacted
// plan, with fabricated ensemble percentile spreads for each district.
const DISTRICT_UNITS = [
  { unitId: "3701", comparedValue: 0.531, percentiles: { p5: 0.492, p25: 0.517, p50: 0.538, p75: 0.561, p95: 0.588 }, comparedPercentile: 43.2 },
  { unitId: "3702", comparedValue: 0.621, percentiles: { p5: 0.522, p25: 0.551, p50: 0.573, p75: 0.598, p95: 0.634 }, comparedPercentile: 89.6 },
  { unitId: "3703", comparedValue: 0.412, percentiles: { p5: 0.408, p25: 0.427, p50: 0.446, p75: 0.468, p95: 0.492 }, comparedPercentile: 6.1 },
  { unitId: "3704", comparedValue: 0.663, percentiles: { p5: 0.548, p25: 0.579, p50: 0.604, p75: 0.631, p95: 0.667 }, comparedPercentile: 93.8 },
  { unitId: "3705", comparedValue: 0.388, percentiles: { p5: 0.401, p25: 0.422, p50: 0.443, p75: 0.466, p95: 0.494 }, comparedPercentile: 2.4 },
  { unitId: "3706", comparedValue: 0.441, percentiles: { p5: 0.452, p25: 0.481, p50: 0.508, p75: 0.534, p95: 0.561 }, comparedPercentile: 3.7 },
  { unitId: "3707", comparedValue: 0.429, percentiles: { p5: 0.418, p25: 0.441, p50: 0.463, p75: 0.487, p95: 0.514 }, comparedPercentile: 11.9 },
  { unitId: "3708", comparedValue: 0.397, percentiles: { p5: 0.402, p25: 0.424, p50: 0.447, p75: 0.471, p95: 0.499 }, comparedPercentile: 3.1 },
  { unitId: "3709", comparedValue: 0.436, percentiles: { p5: 0.429, p25: 0.452, p50: 0.474, p75: 0.497, p95: 0.523 }, comparedPercentile: 8.8 },
  { unitId: "3710", comparedValue: 0.371, percentiles: { p5: 0.379, p25: 0.399, p50: 0.421, p75: 0.444, p95: 0.471 }, comparedPercentile: 3.9 },
  { unitId: "3711", comparedValue: 0.352, percentiles: { p5: 0.344, p25: 0.366, p50: 0.389, p75: 0.413, p95: 0.441 }, comparedPercentile: 32.6 },
  { unitId: "3712", comparedValue: 0.714, percentiles: { p5: 0.581, p25: 0.612, p50: 0.639, p75: 0.668, p95: 0.703 }, comparedPercentile: 96.4 },
  { unitId: "3713", comparedValue: 0.446, percentiles: { p5: 0.471, p25: 0.499, p50: 0.524, p75: 0.549, p95: 0.577 }, comparedPercentile: 1.8 },
  { unitId: "3714", comparedValue: 0.457, percentiles: { p5: 0.468, p25: 0.494, p50: 0.517, p75: 0.541, p95: 0.568 }, comparedPercentile: 4.6 },
];

// Real H3 r7 cell ids from the two named case-study selections (highest
// population cells in Charlotte and Greenville), with fabricated ensemble
// spreads for the Democratic share of whatever district contains each cell.
const H3_UNITS = [
  { unitId: "8744d84daffffff", comparedValue: 0.714, percentiles: { p5: 0.588, p25: 0.617, p50: 0.644, p75: 0.671, p95: 0.706 }, comparedPercentile: 96.1 },
  { unitId: "8744d84f0ffffff", comparedValue: 0.714, percentiles: { p5: 0.579, p25: 0.609, p50: 0.637, p75: 0.664, p95: 0.699 }, comparedPercentile: 96.7 },
  { unitId: "8744daa25ffffff", comparedValue: 0.441, percentiles: { p5: 0.472, p25: 0.514, p50: 0.556, p75: 0.601, p95: 0.652 }, comparedPercentile: 8.3 },
  { unitId: "872ad48d6ffffff", comparedValue: 0.531, percentiles: { p5: 0.487, p25: 0.514, p50: 0.537, p75: 0.559, p95: 0.586 }, comparedPercentile: 44.7 },
  { unitId: "872ad48d3ffffff", comparedValue: 0.531, percentiles: { p5: 0.483, p25: 0.511, p50: 0.534, p75: 0.557, p95: 0.584 }, comparedPercentile: 46.9 },
  { unitId: "872ad48d4ffffff", comparedValue: 0.531, percentiles: { p5: 0.485, p25: 0.512, p50: 0.536, p75: 0.558, p95: 0.585 }, comparedPercentile: 45.8 },
];

const summary = {
  schemaVersion: 1,
  id: "nc-congress-2020-mock",
  title: "North Carolina congressional ensemble summary (MOCK)",
  status: "mock",
  jurisdiction: "North Carolina",
  office: "U.S. House",
  generatedAt: "2026-07-03T00:00:00Z",
  method: {
    generator: "build-mock-ensemble.mjs (deterministic literals)",
    algorithm: "None. Values imitate the shape of redist SMC / GerryChain ReCom summaries without sampling anything.",
    planCount: PLAN_COUNT,
    seed: "not-applicable-mock",
    constraints: [
      { id: "pop-deviation", description: "Pretend constraint: districts within 0.5% of ideal population." },
      { id: "contiguity", description: "Pretend constraint: districts contiguous." },
      { id: "county-splits", description: "Pretend constraint: county splits minimized per NC whole-county provision." },
      { id: "vra-handling", description: "Pretend constraint: none. A real NC ensemble must document how VRA districts were handled, because it changes the entire comparison universe." },
    ],
    citation: "Do not cite. Mock artifact for Honeycombing expert-review Objective 3.",
  },
  mockCaveat: MOCK_CAVEAT,
  seatMeasure: {
    measureId: "dem_seats",
    label: "Democratic seats (of 14)",
    definition: "Number of districts with a Democratic two-party majority under the 2020 presidential proxy, per ensemble plan.",
    histogram: SEAT_HISTOGRAM,
    comparedPlans: [
      { planId: "nc-2022-court-interim-congressional", value: 7, percentile: seatPercentile(7) },
      { planId: "nc-2023-enacted-congressional", value: 4, percentile: seatPercentile(4) },
    ],
  },
  unitMeasures: [
    {
      measureId: "district_dem_share",
      label: "District Democratic two-party share",
      definition: "Distribution of Democratic two-party share for the ensemble district containing each 2023 enacted district's core, versus the enacted district's own share.",
      unitKeyType: "district",
      referencePlanId: "nc-2023-enacted-congressional",
      units: DISTRICT_UNITS,
    },
    {
      measureId: "h3_district_dem_share",
      label: "Democratic share of the district containing each H3 cell",
      definition: "Distribution across ensemble plans of the Democratic two-party share of whichever district contains the cell, versus the same value under the reference plan.",
      unitKeyType: "h3",
      referencePlanId: "nc-2023-enacted-congressional",
      h3Resolution: 7,
      units: H3_UNITS,
    },
  ],
  caveats: [
    MOCK_CAVEAT,
    "Real ingestion targets: ALARM 50-State Redistricting Simulations (redist SMC, Harvard Dataverse) and GerryChain ReCom runs; adapters must normalize to this schema and document real constraints.",
    "Percentile positions are only meaningful relative to the documented constraint set; the outlier gate blocks display when constraints are missing or the payload is a mock.",
    "The seat measure uses the 2020 presidential proxy, not congressional performance.",
  ],
};

const entry = {
  id: summary.id,
  name: summary.title,
  source: "Generated by scripts/build-mock-ensemble.mjs",
  url: "/data/ensembles/nc-congress-2020-mock.json",
  status: "mock",
  description: "Mocked NC congressional ensemble summary that validates the ensemble explainer schema end-to-end.",
  caveats: [MOCK_CAVEAT],
  metadata: {
    jurisdiction: "North Carolina",
    office: "U.S. House",
    planCount: PLAN_COUNT,
    generator: "mock",
  },
};

// Upsert into the shared registry: real ensembles sort ahead of the mock so
// the UI (which loads ensembles[0]) never picks the fixture over real data.
const STATUS_ORDER = { published: 0, draft: 1, mock: 2 };
const outDir = join(root, "public/data/ensembles");
const registryPath = join(outDir, "registry.json");
const registry = existsSync(registryPath)
  ? JSON.parse(await readFile(registryPath, "utf8"))
  : { schemaVersion: 1, ensembles: [] };
registry.ensembles = [
  entry,
  ...registry.ensembles.filter((candidate) => candidate.id !== entry.id),
].sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || a.id.localeCompare(b.id));

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "nc-congress-2020-mock.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

console.log(`Wrote ${join(outDir, "nc-congress-2020-mock.json")}`);
console.log(`Wrote ${join(outDir, "registry.json")}`);
console.log(`planCount ${PLAN_COUNT}; court plan percentile ${seatPercentile(7)}; enacted plan percentile ${seatPercentile(4)}`);
