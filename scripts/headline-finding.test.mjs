import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  classifyEnsemblePercentile,
  getHeadlineFindingUrl,
} from "../app/lib/honeycomb-ui-helpers.ts";

const finding = JSON.parse(
  await readFile(new URL("../public/data/case-studies/nc-headline-finding.json", import.meta.url), "utf8"),
);
const ensemble = JSON.parse(
  await readFile(new URL("../public/data/ensembles/nc-congress-2020-alarm.json", import.meta.url), "utf8"),
);

test("headline finding URL resolves to the tracked NC packet", () => {
  assert.equal(getHeadlineFindingUrl("nc"), "/data/case-studies/nc-headline-finding.json");
  assert.equal(getHeadlineFindingUrl(), "/data/case-studies/nc-headline-finding.json");
});

test("headline stat is recomputable from the ensemble payload it cites", () => {
  const { histogram, comparedPlans } = ensemble.seatMeasure;
  const { stat } = finding;

  const planCount = histogram.reduce((total, bin) => total + bin.planCount, 0);
  assert.equal(stat.planCount, planCount);
  assert.equal(stat.planCount, ensemble.method.planCount);
  assert.equal(stat.districtCount, ensemble.unitMeasures[0].units.length);

  const enacted = comparedPlans.find((plan) => plan.planId === stat.planId);
  assert.ok(enacted, "compared plan present in ensemble payload");
  assert.equal(stat.planSeats, enacted.value);
  assert.equal(stat.percentile, enacted.percentile);

  const plansAtOrBelow = histogram
    .filter((bin) => bin.value <= enacted.value)
    .reduce((total, bin) => total + bin.planCount, 0);
  assert.equal(stat.plansAtOrBelow, plansAtOrBelow);
  assert.equal(stat.plansAbove, planCount - plansAtOrBelow);
  assert.equal(stat.plansAtOrBelowPct, Math.round((plansAtOrBelow / planCount) * 1000) / 10);
  assert.equal(stat.plansAbovePct, Math.round(((planCount - plansAtOrBelow) / planCount) * 1000) / 10);

  let cumulative = 0;
  let medianSeats = null;
  for (const bin of histogram) {
    cumulative += bin.planCount;
    if (cumulative >= planCount / 2) {
      medianSeats = bin.value;
      break;
    }
  }
  assert.equal(stat.ensembleMedianSeats, medianSeats);
});

test("headline band matches the app's ensemble percentile classifier", () => {
  assert.equal(finding.stat.band, classifyEnsemblePercentile(finding.stat.percentile));
});

test("headline sentences carry the load-bearing numbers", () => {
  const { stat } = finding;
  for (const sentence of [finding.headline, finding.shortHeadline]) {
    assert.match(sentence, new RegExp(`${stat.planSeats} of ${stat.districtCount}`));
    assert.match(sentence, new RegExp(`${stat.plansAbovePct}%`));
  }
  assert.match(finding.methodNote, new RegExp(`${stat.percentile}th percentile`));
  assert.match(finding.methodNote, /not legal evidence/);
});

test("headline is dated to the map it describes and carries predecessor context", () => {
  assert.match(finding.headline, /October 2025/);
  assert.match(finding.headline, /2026 election/);
  assert.match(finding.mapStatusNote, /SL 2023-145/);
  assert.match(finding.mapStatusNote, /2024 election/);
  assert.ok(finding.caveats.includes(finding.mapStatusNote));
});

test("continuous tail context is gated on the assignment bound and agrees with its artifact", async () => {
  const { tailContext, stat } = finding;
  assert.ok(tailContext, "headline finding carries continuous tail context");

  const recompute = JSON.parse(
    await readFile(
      new URL("../docs/research/outputs/alarm-ensemble/nc-ensemble-seat-recompute.json", import.meta.url),
      "utf8",
    ),
  );

  // The artifact must describe the same ensemble the headline stat came from.
  assert.equal(recompute.source.drawCount, stat.planCount);
  assert.equal(recompute.discreteTail.enactedSeats, stat.planSeats);
  assert.equal(recompute.discreteTail.plansAtOrBelow, stat.plansAtOrBelow);

  const round2 = (value) => Math.round(value * 100) / 100;
  const tail = recompute.continuousTail;
  assert.equal(tailContext.enactedMarginPp, round2(tail.enactedMarginPp));
  assert.equal(tailContext.separationPp, round2(tail.tiePlans.separationPp));
  assert.equal(tailContext.plansStrictlyBelow, tail.plansStrictlyBelow);
  assert.equal(tailContext.tiePlanCount, tail.tiePlans.count);
  assert.equal(tailContext.tiePlanMaxMarginPp, round2(Math.max(...tail.tiePlans.marginsPp)));

  // The ordering claim may only appear when the enacted plan is strictly beyond every
  // draw AND the separation clears the centroid shortcut's district-level error bound.
  const allowed =
    tail.strictlyBelowAllDraws === true
    && tail.tiePlans.enactedDeeperThanAll === true
    && tail.tiePlans.separationPp > tailContext.centroidBoundPp;
  assert.equal(tailContext.orderingClaimAllowed, allowed);
  if (!allowed) {
    assert.equal(tailContext.statement, null, "ordering claim withheld when the bound is not cleared");
  } else {
    assert.ok(tailContext.separationPp > tailContext.centroidBoundPp);
    assert.match(tailContext.statement, new RegExp(`${tailContext.enactedMarginPp}pp`));
    assert.match(tailContext.statement, new RegExp(`${tailContext.tiePlanMaxMarginPp}pp`));
  }

  // The continuous claim must not be presented without its assignment caveat.
  assert.ok(finding.caveats.includes(tailContext.note));
  assert.match(tailContext.note, /representative-point assignment/);
});

test("headline finding never ships from a mock ensemble and keeps its claim discipline", () => {
  assert.notEqual(ensemble.status, "mock");
  assert.equal(finding.provenance.inputs[0].status, ensemble.status);
  assert.ok(finding.caveats.some((caveat) => caveat.includes("not evidence of intent")));
  assert.ok(finding.caveats.some((caveat) => caveat.includes("/limits")));
  assert.ok(finding.caveats.some((caveat) => caveat.includes("proxy")));
});
