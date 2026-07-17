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

test("headline is dated to the map it describes, not the map now in force", () => {
  assert.match(finding.headline, /2024/);
  assert.match(finding.supersededNote, /SL 2025-95/);
  assert.match(finding.supersededNote, /October 2025/);
  assert.ok(finding.caveats.includes(finding.supersededNote));
});

test("headline finding never ships from a mock ensemble and keeps its claim discipline", () => {
  assert.notEqual(ensemble.status, "mock");
  assert.equal(finding.provenance.inputs[0].status, ensemble.status);
  assert.ok(finding.caveats.some((caveat) => caveat.includes("not evidence of intent")));
  assert.ok(finding.caveats.some((caveat) => caveat.includes("/limits")));
  assert.ok(finding.caveats.some((caveat) => caveat.includes("proxy")));
});
