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
const RECOMPUTE_JSON = join(root, "docs/research/outputs/alarm-ensemble/nc-ensemble-seat-recompute.json");
const OUT_JSON = join(root, "public/data/case-studies/nc-headline-finding.json");
const REPORT_DIR = join(root, "docs/research/outputs/headline-finding");

// Stamped, not `new Date()`, so rebuilding from the same inputs is a no-op diff.
const GENERATED_AT = "2026-07-17T00:00:00Z";

const HEADLINE_PLAN_ID = "nc-2025-enacted-congressional";
const HEADLINE_PLAN_NAME = "NC 2025 enacted congressional plan (SL 2025-95)";

// The predecessor map anchors the finding in time: SL 2025-95 is the October
// 2025 mid-decade redraw of SL 2023-145, the map used in the 2024 election.
const PRIOR_PLAN_ID = "nc-2023-enacted-congressional";

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

const priorPlan = comparedPlans.find((plan) => plan.planId === PRIOR_PLAN_ID);
if (!priorPlan) throw new Error(`Compared plans missing ${PRIOR_PLAN_ID}`);

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
const round2 = (value) => Math.round(value * 100) / 100;
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
  `${enacted.value} of ${districtCount} districts lean Democratic under the congressional map North Carolina adopted in `
  + `October 2025 for its 2026 election — ${plansAbovePct}% of ${planCount.toLocaleString("en-US")} neutral simulated maps produce more.`;

const shortHeadline =
  `NC's 2026-election map (SL 2025-95): ${enacted.value} of ${districtCount} Democratic-leaning districts — `
  + `${plansAbovePct}% of ${planCount.toLocaleString("en-US")} neutral maps produce more.`;

const methodNote =
  `Districts scored by 2020 presidential two-party vote, compared against the ALARM Project's ${planCount.toLocaleString("en-US")}-plan `
  + `simulated ensemble (redist SMC, NC constraints). Ensemble median: ${medianSeats} Democratic-leaning seats; only `
  + `${plansAtOrBelow} of ${planCount.toLocaleString("en-US")} simulated plans produce ${enacted.value} or fewer — the plan lands at or below the `
  + `ensemble's observed minimum. Its ${percentile.toFixed(1)}th percentile position (exact mid-percentile ${round2(((below + equal / 2) / planCount) * 100)}%) `
  + `means "at or below the observed minimum," not a probability of zero. Diagnostic position, not a seat forecast and not legal evidence.`;

// ── Continuous tail context ──────────────────────────────────────────────────
// Seat count is discrete, so several very different plans land in the same bin and
// the enacted plan reads as merely "tied" with the ensemble minimum. The recompute
// artifact (scripts/recompute-ensemble-seats.py) measures the same plans on a
// continuous axis — the Democratic share of the district that would have to flip to
// yield one more Democratic seat — which orders plans that tie on seat count.
const recompute = JSON.parse(await readFile(RECOMPUTE_JSON, "utf8"));

// Gate the artifact against the ensemble it claims to describe, so this file can
// never quote a tail computed from different inputs than the headline.
{
  const check = recompute.consistencyCheck;
  const published = Object.fromEntries(histogram.map((bin) => [String(bin.value), bin.planCount]));
  if (JSON.stringify(check.recomputedHistogram) !== JSON.stringify(published)) {
    throw new Error("Recompute artifact histogram does not match the ensemble payload histogram");
  }
  if (recompute.source.drawCount !== planCount) {
    throw new Error(`Recompute draw count ${recompute.source.drawCount} != ensemble plan count ${planCount}`);
  }
  if (recompute.discreteTail.enactedSeats !== enacted.value) {
    throw new Error(`Recompute enacted seats ${recompute.discreteTail.enactedSeats} != ${enacted.value}`);
  }
  if (recompute.discreteTail.plansAtOrBelow !== plansAtOrBelow) {
    throw new Error("Recompute tail count disagrees with the histogram");
  }
}

const tail = recompute.continuousTail;
const CENTROID_BOUND_PP = 0.12;

// The ordering claim is only allowed when the enacted plan is strictly beyond every
// draw AND the separation clears the assignment shortcut's district-level error bound.
// Otherwise the finding ships without it rather than overstating.
const orderingClaimAllowed =
  tail.strictlyBelowAllDraws === true
  && tail.tiePlans.enactedDeeperThanAll === true
  && tail.tiePlans.separationPp > CENTROID_BOUND_PP;

const nextSeatOrdinal = tail.tiePlans.count > 0 ? enacted.value + 1 : null;
const tieMaxMarginPp = round2(Math.max(...tail.tiePlans.marginsPp));

const tailStatement = orderingClaimAllowed
  ? `No simulated map is further from a ${nextSeatOrdinal}th Democratic-leaning district than the enacted one: `
    + `it sits ${round2(tail.enactedMarginPp)}pp short of one, while the ${tail.tiePlans.count} simulated plans that match its `
    + `seat count come within ${tieMaxMarginPp}pp.`
  : null;

const tailContext = {
  measureLabel: `Distance to a ${nextSeatOrdinal}th Democratic-leaning district`,
  measureDefinition: tail.measure,
  enactedSharePct: round2(tail.enactedShare * 100),
  enactedMarginPp: round2(tail.enactedMarginPp),
  percentile: tail.percentile,
  plansStrictlyBelow: tail.plansStrictlyBelow,
  tiePlanCount: tail.tiePlans.count,
  tiePlanMaxMarginPp: tieMaxMarginPp,
  separationPp: round2(tail.tiePlans.separationPp),
  centroidBoundPp: CENTROID_BOUND_PP,
  orderingClaimAllowed,
  statement: tailStatement,
  note:
    "Seat count is discrete, so plans that differ substantially can share a bin. This measure is "
    + "continuous and orders them. Simulated draws use ALARM's exact precinct assignment; the enacted "
    + `plan uses precinct representative-point assignment, bounded at ${CENTROID_BOUND_PP}pp at district `
    + "level — the separation above is reported so that bound can be checked rather than assumed clear.",
  source: "scripts/recompute-ensemble-seats.py",
};

const mapStatusNote =
  `SL 2025-95 was enacted October 22, 2025 as a mid-decade redraw and applies from the 2026 election; a federal `
  + `three-judge panel denied preliminary injunctions in November 2025 and litigation continues. It replaced `
  + `the SL 2023-145 map used in the 2024 election, which had ${priorPlan.value} Democratic-leaning districts on the same `
  + `proxy and sat at the ${priorPlan.percentile}th percentile of the same ensemble.`;

const finding = {
  schemaVersion: 1,
  id: "nc-headline-enacted-vs-alarm-ensemble",
  caseStudyId: "nc",
  generatedAt: GENERATED_AT,
  headline,
  shortHeadline,
  methodNote,
  mapStatusNote,
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
  tailContext,
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
    mapStatusNote,
    "Percentile position describes where the plan sits inside a simulated distribution with a documented constraint set. "
      + "It is not evidence of intent or legal injury, and it cannot show whether deviations were legally required.",
    "Seat counts use the 2020 presidential vote as a partisan-lean proxy, not congressional election results.",
    tailContext.note,
    "The underlying ensemble payload is status \"" + ensemble.status + "\" pending expert review of its consistency checks.",
    "Read /limits before citing this number.",
  ],
};

const report = `# NC Headline Finding

Generated by \`scripts/build-headline-finding.mjs\` on ${GENERATED_AT.slice(0, 10)}.

**Headline:** ${headline}

**Map status:** ${mapStatusNote}

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

## Continuous tail context

Seat count is discrete: plans that differ substantially can share a bin, which is why the
enacted map reads as merely "tied" with the ensemble's observed minimum. Measured on a
continuous axis — ${tailContext.measureDefinition} — the tie resolves into an ordering.
Recomputed by \`${tailContext.source}\` from ALARM's assignment matrices; see
\`docs/research/outputs/alarm-ensemble/nc-ensemble-seat-recompute.md\`.

| Quantity | Value |
| --- | --- |
| Enacted plan's ${nextSeatOrdinal}th-ranked district share | ${tailContext.enactedSharePct}% |
| Distance to a ${nextSeatOrdinal}th Democratic-leaning district | ${tailContext.enactedMarginPp}pp |
| Simulated plans strictly below the enacted plan on this measure | ${tailContext.plansStrictlyBelow} of ${planCount} |
| Simulated plans tying the enacted seat count | ${tailContext.tiePlanCount} (all within ${tailContext.tiePlanMaxMarginPp}pp of another seat) |
| Separation from the nearest tie plan | ${tailContext.separationPp}pp |
| Assignment-shortcut bound it must clear | ${tailContext.centroidBoundPp}pp |
| Ordering claim permitted | ${tailContext.orderingClaimAllowed} |

${tailContext.statement ?? "_Ordering claim withheld: the separation does not clear the assignment bound._"}

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
