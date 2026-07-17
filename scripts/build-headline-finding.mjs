import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Derives the demo's headline finding from the normalized ALARM ensemble
// payload. Every number in the output is recomputed here from the ensemble
// summary (which build-alarm-ensemble.mjs derives from ALARM's published
// per-district statistics), so the headline card can never drift from the
// underlying data. The finding is diagnostic — a position inside a documented
// simulated distribution — and is framed with the same claim discipline as
// /limits: descriptive, not legal evidence.

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const ENSEMBLE_JSON = join(root, "public/data/ensembles/nc-congress-2020-alarm.json");
const OUT_JSON = join(root, "public/data/case-studies/nc-headline-finding.json");
const REPORT_DIR = join(root, "docs/research/outputs/headline-finding");

// Stamped, not `new Date()`, so rebuilding from the same inputs is a no-op diff.
const GENERATED_AT = "2026-07-17T00:00:00Z";

const HEADLINE_PLAN_ID = "nc-2023-enacted-congressional";
const HEADLINE_PLAN_NAME = "NC 2023 enacted congressional plan (SL 2023-145)";

// The SL 2023-145 map was replaced mid-decade; the finding must read as
// describing the 2024-election map, never the map currently in force.
const SUPERSEDED_NOTE =
  "North Carolina enacted a replacement congressional map in October 2025 (SL 2025-95), which applies from the "
  + "2026 election. This finding describes the SL 2023-145 map used in the 2024 election, not the map now in force.";

const ensemble = JSON.parse(await readFile(ENSEMBLE_JSON, "utf8"));

if (ensemble.status === "mock") {
  throw new Error("Refusing to build a headline finding from a mock ensemble");
}

const { histogram, comparedPlans } = ensemble.seatMeasure;
const planCount = histogram.reduce((total, bin) => total + bin.planCount, 0);
if (planCount !== ensemble.method.planCount) {
  throw new Error(`Histogram total ${planCount} != declared plan count ${ensemble.method.planCount}`);
}

const districtCount = ensemble.unitMeasures[0].units.length;

const enacted = comparedPlans.find((plan) => plan.planId === HEADLINE_PLAN_ID);
if (!enacted) throw new Error(`Compared plans missing ${HEADLINE_PLAN_ID}`);

// Ensemble median seat count from the histogram.
let cumulative = 0;
let medianSeats = null;
for (const bin of histogram) {
  cumulative += bin.planCount;
  if (cumulative >= planCount / 2) {
    medianSeats = bin.value;
    break;
  }
}

const plansAtOrBelow = histogram
  .filter((bin) => bin.value <= enacted.value)
  .reduce((total, bin) => total + bin.planCount, 0);
const plansAbove = planCount - plansAtOrBelow;

const round1 = (value) => Math.round(value * 10) / 10;
const plansAtOrBelowPct = round1((plansAtOrBelow / planCount) * 100);
const plansAbovePct = round1((plansAbove / planCount) * 100);

// Mid-percentile, recomputed from the histogram; must match the ensemble
// payload's own compared-plan percentile.
let below = 0;
let equal = 0;
for (const bin of histogram) {
  if (bin.value < enacted.value) below += bin.planCount;
  if (bin.value === enacted.value) equal += bin.planCount;
}
const percentile = round1(((below + equal / 2) / planCount) * 100);
if (percentile !== enacted.percentile) {
  throw new Error(`Recomputed percentile ${percentile} != ensemble payload percentile ${enacted.percentile}`);
}

// Same thresholds as classifyEnsemblePercentile in app/lib/honeycomb-ui-helpers.ts.
const band =
  percentile < 5 ? "low_outlier"
  : percentile < 25 ? "low_edge"
  : percentile <= 75 ? "typical"
  : percentile <= 95 ? "high_edge"
  : "high_outlier";

const headline =
  `${enacted.value} of ${districtCount} districts leaned Democratic under the congressional map North Carolina used in `
  + `its 2024 election — ${plansAbovePct}% of ${planCount.toLocaleString("en-US")} neutral simulated maps produce more.`;

const shortHeadline =
  `NC's 2024-election map (SL 2023-145): ${enacted.value} of ${districtCount} Democratic-leaning districts — `
  + `${plansAbovePct}% of ${planCount.toLocaleString("en-US")} neutral maps produce more.`;

const methodNote =
  `Districts scored by 2020 presidential two-party vote, compared against the ALARM Project's ${planCount.toLocaleString("en-US")}-plan `
  + `simulated ensemble (redist SMC, NC constraints). Ensemble median: ${medianSeats} Democratic-leaning seats; the SL 2023-145 plan sits at `
  + `the ${percentile}th percentile (mid-percentile convention: plans tied with it split evenly above and below). `
  + `Diagnostic position, not a seat forecast and not legal evidence.`;

const finding = {
  schemaVersion: 1,
  id: "nc-headline-enacted-vs-alarm-ensemble",
  caseStudyId: "nc",
  generatedAt: GENERATED_AT,
  headline,
  shortHeadline,
  methodNote,
  supersededNote: SUPERSEDED_NOTE,
  stat: {
    planId: HEADLINE_PLAN_ID,
    planName: HEADLINE_PLAN_NAME,
    measureId: ensemble.seatMeasure.measureId,
    measureLabel: ensemble.seatMeasure.label,
    planSeats: enacted.value,
    districtCount,
    ensembleMedianSeats: medianSeats,
    planCount,
    plansAtOrBelow,
    plansAtOrBelowPct,
    plansAbove,
    plansAbovePct,
    percentile,
    band,
  },
  provenance: {
    script: "scripts/build-headline-finding.mjs",
    inputs: [
      {
        path: "public/data/ensembles/nc-congress-2020-alarm.json",
        description:
          "ALARM Project 50-State Redistricting Simulations, NC 2020 congressional cycle, normalized by scripts/build-alarm-ensemble.mjs",
        sourceUrl: ensemble.method.sourceUrl,
        status: ensemble.status,
      },
    ],
    citation: ensemble.method.citation,
    voteProxy:
      "2020 presidential two-party vote (ALARM pre_20 columns); compared-plan seat counts use Honeycombing's VEST precinct "
      + "centroid assignment, calibrated against ALARM's exact assignment (max rank-sorted district share delta 0.12pp).",
  },
  caveats: [
    SUPERSEDED_NOTE,
    "Percentile position describes where the plan sits inside a simulated distribution with a documented constraint set. "
      + "It is not evidence of intent or legal injury, and it cannot show whether deviations were legally required.",
    "Seat counts use the 2020 presidential vote as a partisan-lean proxy, not congressional election results.",
    "The underlying ensemble payload is status \"" + ensemble.status + "\" pending expert review of its consistency checks.",
    "Read /limits before citing this number.",
  ],
};

const report = `# NC Headline Finding

Generated by \`scripts/build-headline-finding.mjs\` on ${GENERATED_AT.slice(0, 10)}.

**Headline:** ${headline}

**Map status:** ${SUPERSEDED_NOTE}

**Method:** ${methodNote}

## Derivation

All numbers recomputed from \`public/data/ensembles/nc-congress-2020-alarm.json\`
(ALARM 50-State Simulations, NC 2020 congressional cycle, doi:10.7910/DVN/SLCD3E, CC0):

| Quantity | Value |
| --- | --- |
| Enacted-plan Democratic-leaning seats (pre-2020 proxy) | ${enacted.value} of ${districtCount} |
| Ensemble plans | ${planCount} |
| Ensemble median Democratic-leaning seats | ${medianSeats} |
| Plans with ≤ ${enacted.value} Democratic-leaning seats | ${plansAtOrBelow} (${plansAtOrBelowPct}%) |
| Plans with > ${enacted.value} Democratic-leaning seats | ${plansAbove} (${plansAbovePct}%) |
| Mid-percentile of the enacted plan | ${percentile} |
| Band (\`classifyEnsemblePercentile\` thresholds) | ${band} |

## Claim discipline

${finding.caveats.map((caveat) => `- ${caveat}`).join("\n")}

## Next headline

Once precinct-level congressional election results are aggregated into the H3 layer
(Phase 1 open item "Aggregate actual election results into hex grid"), the headline should
graduate from the presidential proxy to observed congressional votes, and the cell-level
projection measure (ALARM \`NC_cd_2020_plans.rds\` assignment matrices) can localize *where*
the enacted plan diverges from the ensemble, not just how much.
`;

await mkdir(dirname(OUT_JSON), { recursive: true });
await mkdir(REPORT_DIR, { recursive: true });
await writeFile(OUT_JSON, `${JSON.stringify(finding, null, 2)}\n`);
await writeFile(join(REPORT_DIR, "nc-headline-finding.md"), report);

console.log(`Wrote ${OUT_JSON}`);
console.log(`Wrote ${join(REPORT_DIR, "nc-headline-finding.md")}`);
console.log(headline);
console.log(`  percentile ${percentile} (${band}); median ${medianSeats}; plans ≤ ${enacted.value} seats: ${plansAtOrBelow}/${planCount}`);
