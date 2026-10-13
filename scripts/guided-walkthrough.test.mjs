import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  ENSEMBLE_BAND_STYLES,
  classifyEnsemblePercentile,
} from "../app/lib/honeycomb-ui-helpers.ts";

import {
  DEFAULT_APP_MODE,
  DEFAULT_GUIDED_STEP_ID,
  GUIDED_DATASET_ID,
  GUIDED_PLAN_ID,
  GUIDED_PRESET_ID,
  GUIDED_STEPS,
  buildGuidedNarrative,
  describeActiveMapLayers,
  getNextGuidedStepId,
  getPreviousGuidedStepId,
  resolveMapLayerDirective,
} from "../app/lib/guided-walkthrough.ts";

const finding = JSON.parse(
  await readFile(new URL("../public/data/case-studies/nc-headline-finding.json", import.meta.url), "utf8"),
);

// The band vocabulary is owned by the shared classifier the map legend also uses.
const percentileBandLabel = ENSEMBLE_BAND_STYLES[classifyEnsemblePercentile(finding.stat.percentile)].label;
const narrative = buildGuidedNarrative(finding, { percentileBandLabel });
const stepById = new Map(narrative.steps.map((step) => [step.id, step]));

test("the default experience is the four-question guided walkthrough", () => {
  assert.equal(DEFAULT_APP_MODE, "guided");
  assert.equal(DEFAULT_GUIDED_STEP_ID, "what-changed");
  assert.deepEqual(
    GUIDED_STEPS.map((step) => step.id),
    ["what-changed", "how-unusual", "where", "limits"],
  );
  assert.deepEqual(GUIDED_STEPS.map((step) => step.ordinal), [1, 2, 3, 4]);

  // The four questions the walkthrough promises a visitor, in order.
  assert.match(GUIDED_STEPS[0].question, /changed/i);
  assert.match(GUIDED_STEPS[1].question, /unusual/i);
  assert.match(GUIDED_STEPS[2].question, /where/i);
  assert.match(GUIDED_STEPS[3].question, /conclude|can.?t/i);

  for (const step of GUIDED_STEPS) {
    assert.ok(step.navLabel.length > 0 && step.navLabel.length <= 24, `${step.id} has a short nav label`);
  }
});

test("step navigation runs forward and back and stops at both ends", () => {
  assert.equal(getPreviousGuidedStepId("what-changed"), null);
  assert.equal(getNextGuidedStepId("what-changed"), "how-unusual");
  assert.equal(getNextGuidedStepId("how-unusual"), "where");
  assert.equal(getNextGuidedStepId("where"), "limits");
  assert.equal(getNextGuidedStepId("limits"), null);
  assert.equal(getPreviousGuidedStepId("limits"), "where");
});

test("the guided walkthrough runs on the population substrate, not the equal-area vote map", () => {
  // Locking the guided journey to one dataset also means the map is never
  // remounted between steps, so focus and zoom survive the walkthrough.
  assert.equal(GUIDED_DATASET_ID, "blocks");
  assert.equal(GUIDED_PRESET_ID, "population-demographics");
});

test("every guided step carries its own limitation and source, and the draft status is in the default story", () => {
  assert.equal(narrative.steps.length, 4);
  for (const step of narrative.steps) {
    assert.ok(step.answer.length > 40, `${step.id} answers in plain sentences`);
    assert.ok(step.limitation.length > 20, `${step.id} keeps a limitation next to its claim`);
    assert.match(step.sourceNote, /\/data\/|\/limits|\/about|doi|Dataverse|registry/i, `${step.id} links a source or method`);
  }

  assert.match(narrative.statusNotice, /draft/i);
  assert.match(narrative.statusNotice, /expert review/i);
  assert.equal(finding.provenance.inputs[0].status, "draft");
});

test("the 'what changed' step names the plan and keeps its dated status note", () => {
  const step = stepById.get("what-changed");
  assert.ok(step);
  assert.ok(step.answer.includes(finding.stat.planName), "names the plan being examined");
  assert.ok(step.answer.includes(finding.mapStatusNote), "keeps the dated plan-status note verbatim");
  assert.ok(step.bullets.some((bullet) => bullet.includes(String(finding.stat.districtCount))));
  assert.match(step.limitation, /lawful|lawfulness/i);
});

test("the 'how unusual' step reads its numbers off the payload and keeps both count conventions", () => {
  const step = stepById.get("how-unusual");
  const { stat, tailContext } = finding;
  assert.ok(step);

  assert.ok(step.answer.includes(`${stat.planSeats} of ${stat.districtCount}`));
  assert.ok(step.answer.includes(`${stat.plansAbovePct}%`));
  assert.ok(step.answer.includes(stat.planCount.toLocaleString("en-US")));
  assert.ok(step.answer.includes(String(stat.ensembleMedianSeats)));
  assert.ok(step.answer.includes(String(stat.plansAtOrBelow)));

  // strictly-greater vs at-or-below must not blur into one phrase
  assert.match(step.answer, /produce more/);
  assert.match(step.answer, /as few or fewer/);

  // percentile convention + the app's own band vocabulary
  const percentileBullet = step.bullets.find((bullet) => bullet.includes(percentileBandLabel));
  assert.ok(percentileBullet, "the band label comes from the shared classifier");
  assert.ok(percentileBullet.includes(`${stat.percentile}th percentile`));
  assert.match(percentileBullet, /mid-rank/i);

  // The label is injected, never restated inside the walkthrough copy.
  const sentinel = buildGuidedNarrative(finding, { percentileBandLabel: "SENTINEL BAND" });
  const sentinelStep = sentinel.steps.find((candidate) => candidate.id === "how-unusual");
  assert.ok(sentinelStep.bullets.some((bullet) => bullet.includes("SENTINEL BAND")));

  // the continuous tail statement travels with the discrete seat count
  assert.equal(step.detail, tailContext.statement);
  assert.ok(step.bullets.some((bullet) => bullet.includes(`${tailContext.enactedMarginPp}pp`)));

  // alternatives are sampled under documented constraints, never certified maps
  assert.ok(step.bullets.some((bullet) => /sampled under/i.test(bullet) && /not certified/i.test(bullet)));
  assert.ok(step.bullets.some((bullet) => /proxy/i.test(bullet) && /congressional/i.test(bullet)));

  assert.match(step.limitation, /not evidence of intent/i);
  assert.ok(step.sourceNote.includes(finding.provenance.inputs[0].sourceUrl));
  assert.match(step.sourceNote, /draft/);
});

test("the 'where' step explains H3 as a visualization grid and refuses the mechanism claim", () => {
  const step = stepById.get("where");
  assert.ok(step);

  const h3Bullet = step.bullets.find((bullet) => bullet.includes("H3"));
  assert.ok(h3Bullet, "H3 is explained where it is first used");
  assert.match(h3Bullet, /visualization grid/i);
  assert.match(h3Bullet, /not a fairness algorithm/i);

  assert.ok(
    step.bullets.some((bullet) => /containing district/i.test(bullet) && /not a (statement|finding)/i.test(bullet)),
    "the ecological caveat travels with the cell-level layer",
  );
  assert.ok(step.bullets.some((bullet) => /representative point|centroid/i.test(bullet)));
  assert.match(step.limitation, /not evidence of intent|not evidence of a legal|cracking|packing/i);
});

test("the 'what we cannot conclude' step keeps every payload caveat and the usual suspects", () => {
  const step = stepById.get("limits");
  assert.ok(step);

  for (const caveat of finding.caveats) {
    assert.ok(step.bullets.includes(caveat), `payload caveat is not dropped: ${caveat.slice(0, 48)}…`);
  }
  assert.ok(step.bullets.some((bullet) => /single .*score/i.test(bullet)));
  assert.ok(step.bullets.some((bullet) => /Voting Rights Act|VRA/.test(bullet)));
  assert.ok(step.bullets.some((bullet) => /fictional/i.test(bullet)), "the sample community is labeled fictional");
  assert.match(step.sourceNote, /\/limits/);
});

test("guided steps drive real map layers, and bands never render before the method panel", () => {
  const whatChanged = resolveMapLayerDirective({ mode: "guided", guidedStepId: "what-changed" });
  assert.deepEqual([...whatChanged.activePlanIds], [GUIDED_PLAN_ID]);
  assert.equal(whatChanged.showEnsembleBands, false);
  assert.equal(whatChanged.showEnsembleH3, false);
  // The 118th-Congress outline layer is a different vintage from the walkthrough's
  // plan, so the guided story draws the registry plan instead.
  assert.equal(whatChanged.showDistrictOutlines, false);

  const howUnusual = resolveMapLayerDirective({ mode: "guided", guidedStepId: "how-unusual" });
  assert.equal(howUnusual.showEnsembleBands, true);
  assert.equal(howUnusual.opensEnsembleMethodPanel, true);
  assert.equal(howUnusual.showEnsembleH3, false);
  assert.deepEqual([...howUnusual.activePlanIds], [], "bands already draw the plan geometry — no duplicate outline layer");

  const where = resolveMapLayerDirective({ mode: "guided", guidedStepId: "where" });
  assert.equal(where.showEnsembleBands, true);
  assert.equal(where.showEnsembleH3, true);

  const limits = resolveMapLayerDirective({ mode: "guided", guidedStepId: "limits" });
  assert.equal(limits.showEnsembleH3, false, "the heavy tail overlay is dropped once the story leaves it");

  for (const step of GUIDED_STEPS) {
    const directive = resolveMapLayerDirective({ mode: "guided", guidedStepId: step.id });
    if (directive.showEnsembleBands) {
      assert.equal(directive.opensEnsembleMethodPanel, true, `${step.id} opens the method panel with the bands`);
    }
    assert.equal(directive.showCommunities, false, `${step.id} never activates the sample community layer`);
    assert.equal(directive.showSettings, false, `${step.id} keeps the expert settings gear out of guided mode`);
    assert.ok(directive.visibleChips.length <= 2, `${step.id} does not rebuild the control maze on the map`);
  }
});

test("guided layer state is the step's, whatever the expert preset was left on", () => {
  const fromPlanCompare = resolveMapLayerDirective({
    mode: "guided",
    guidedStepId: "how-unusual",
    presetId: "plan-compare",
  });
  const fromStarters = resolveMapLayerDirective({
    mode: "guided",
    guidedStepId: "how-unusual",
    presetId: "starter-regions",
  });
  assert.deepEqual(fromPlanCompare, fromStarters, "switching back restores the guided story, not the expert leftovers");
});

test("expert mode keeps every capability reachable and preserves plan-compare behavior", () => {
  const planCompare = resolveMapLayerDirective({
    mode: "expert",
    guidedStepId: "how-unusual",
    presetId: "plan-compare",
  });
  assert.equal(planCompare.showDistrictOutlines, true);
  assert.equal(planCompare.opensPlansPanel, true);
  assert.deepEqual(
    [...planCompare.activePlanIds],
    ["nc-2022-court-interim-congressional", "nc-2023-enacted-congressional"],
  );
  assert.equal(planCompare.showEnsembleBands, false);
  assert.equal(planCompare.showSettings, true);
  assert.deepEqual([...planCompare.visibleChips], ["plans", "communities", "ensemble"]);

  const votes = resolveMapLayerDirective({ mode: "expert", guidedStepId: "how-unusual", presetId: "vote-map" });
  assert.equal(votes.showDistrictOutlines, false);
  assert.deepEqual([...votes.activePlanIds], []);
  assert.equal(votes.opensPlansPanel, false);
  assert.equal(votes.showSettings, true);
  // Communities (including the gate-blocked fictional sample) stay reachable in expert mode.
  assert.ok(votes.visibleChips.includes("communities"));
  assert.ok(votes.visibleChips.includes("ensemble"));
});

test("the active-layer readout matches the directive, so the legend cannot contradict the map", () => {
  const whatChanged = describeActiveMapLayers(resolveMapLayerDirective({ mode: "guided", guidedStepId: "what-changed" }));
  assert.ok(whatChanged.some((layer) => /plan boundaries/i.test(layer)));
  assert.ok(!whatChanged.some((layer) => /ensemble/i.test(layer)), "no ensemble layer is advertised while it is off");

  const howUnusual = describeActiveMapLayers(resolveMapLayerDirective({ mode: "guided", guidedStepId: "how-unusual" }));
  assert.ok(howUnusual.some((layer) => /percentile bands/i.test(layer)));
  assert.ok(!howUnusual.some((layer) => /localization|hex tail/i.test(layer)));

  const where = describeActiveMapLayers(resolveMapLayerDirective({ mode: "guided", guidedStepId: "where" }));
  assert.ok(where.some((layer) => /percentile bands/i.test(layer)));
  assert.ok(where.some((layer) => /localization/i.test(layer)));

  const expertVotes = describeActiveMapLayers(resolveMapLayerDirective({ mode: "expert", guidedStepId: "where", presetId: "vote-map" }));
  assert.deepEqual(expertVotes, [], "no overlays claimed when none are active");
});
