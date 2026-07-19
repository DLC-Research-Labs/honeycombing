import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  getDefaultMetricForDatasetKind,
  getMetricOptionsForDatasetKind,
} from "../app/lib/vote-types.ts";

import {
  copyTextToClipboard,
} from "../app/lib/browser-clipboard.ts";

import {
  CASE_STUDIES,
  DATASETS,
  DEFAULT_CASE_STUDY_ID,
  DEFAULT_DATASET_ID,
  DEFAULT_VIEW_PRESET_ID,
  DEFAULT_YEAR,
  ELECTION_YEARS,
  buildDatasetStatus,
  buildLayerGroups,
  buildLayerStatus,
  getCaseStudy,
  getDatasetKind,
  getDatasetModeGuide,
  getDatasetManifestUrl,
  getDatasetProvenance,
  getDatasetUnitLabel,
  getDatasetUrl,
  getDisplayYear,
  getExpertReviewPacket,
  getExpertReviewObjectives,
  getCaseStudyPacketUrl,
  getPlanRegistryUrl,
  getPlanImportSchema,
  getResearchLayerProvenance,
  getViewPresetTransition,
  getNamedSelectionsPacketUrl,
  getEnsembleRegistryUrl,
  withBasePath,
  getEnsembleImportSchema,
  classifyEnsemblePercentile,
  getEnsembleOutlierGate,
  getCoiRegistryUrl,
  getCoiFractureGate,
  COI_OVERLAY_COLOR,
  ENSEMBLE_BAND_STYLES,
  getHoneycombMapInstanceKey,
  getViewPreset,
  RESEARCH_LAYERS,
  VIEW_PRESETS,
  comparePlanToPoints,
  assignPointsToPlanDistricts,
  summarizePlanFeatureCollection,
  summarizeHexStats,
} from "../app/lib/honeycomb-ui-helpers.ts";

test("new sessions default to the NC population layer, not the vote-on-hexes map", () => {
  assert.equal(DEFAULT_CASE_STUDY_ID, "nc");
  assert.equal(DEFAULT_DATASET_ID, "blocks");
  assert.equal(DEFAULT_YEAR, 2020);
  // Opens on population, not vote margin: the equal-area vote map is a MAUP-loaded
  // "ruler-that-isn't" and must not be the front door (red-team T1.3).
  assert.equal(DEFAULT_VIEW_PRESET_ID, "population-demographics");
  assert.deepEqual(DATASETS.map((dataset) => dataset.id), ["blocks", "precincts", "counties"]);

  const nc = getCaseStudy("nc");
  assert.equal(nc.label, "NC");
  assert.equal(nc.stateFips, "37");
  assert.equal(nc.defaultDataset, "precincts");
});

test("case studies expose NC as the initial credibility preset", () => {
  assert.equal(CASE_STUDIES.length, 1);
  assert.deepEqual(getCaseStudy("missing-id"), getCaseStudy("nc"));
});

test("NC precinct dataset is explicitly pinned to 2020", () => {
  assert.equal(getDatasetUrl("precincts", 2024, "nc"), "/data/precincts-nc-2020.json");
  assert.equal(getDisplayYear("precincts", 2024), 2020);
});

test("NC block dataset is explicitly pinned to Census 2020", () => {
  assert.equal(getDatasetUrl("blocks", 2024, "nc"), "/derived-data/census-h3/census-blocks-37-r7-2020.json");
  assert.equal(getDatasetManifestUrl("blocks", 2024, "nc"), "/derived-data/census-h3/census-blocks-37-r7-2020.manifest.json");
  assert.equal(getDisplayYear("blocks", 2024), 2020);
  assert.equal(getDatasetKind("blocks"), "population");
  assert.equal(getDatasetUnitLabel("blocks"), "blocks");
});

test("dataset provenance explains source, method, and caveats", () => {
  const block = getDatasetProvenance("blocks", 2024, "nc");
  assert.equal(block.title, "NC Census block-derived H3 layer");
  assert.equal(block.payloadUrl, "/derived-data/census-h3/census-blocks-37-r7-2020.json");
  assert.equal(block.manifestUrl, "/derived-data/census-h3/census-blocks-37-r7-2020.manifest.json");
  assert.equal(block.h3Resolution, 7);
  assert.match(block.source, /Census 2020 PL 94-171/);
  assert.match(block.method, /internal points assigned to H3/);
  assert.ok(block.caveats.some((caveat) => caveat.includes("not polygon apportionment")));

  const precinct = getDatasetProvenance("precincts", 2024, "nc");
  assert.equal(precinct.title, "NC VEST precinct centroid layer");
  assert.equal(precinct.payloadUrl, "/data/precincts-nc-2020.json");
  assert.equal(precinct.manifestUrl, undefined);
  assert.match(precinct.method, /H3 aggregation happens in the browser/);
});

test("county dataset follows selected election year", () => {
  assert.equal(getDatasetUrl("counties", 2024, "nc"), "/data/counties-nc-2024.json");
  assert.equal(getDisplayYear("counties", 2024), 2024);
  assert.equal(getDatasetKind("counties"), "election");
  assert.equal(getDatasetUnitLabel("counties"), "counties");
});

test("view presets describe the coherence workflow in user-facing terms", () => {
  assert.deepEqual(
    VIEW_PRESETS.map((preset) => preset.id),
    ["vote-map", "population-demographics", "plan-compare", "starter-regions", "method-provenance"],
  );

  const voteMap = getViewPreset("vote-map");
  assert.equal(voteMap.dataset, "precincts");
  assert.equal(voteMap.metric, "margin");
  assert.ok(voteMap.summary.includes("red/blue"));
  assert.ok(voteMap.sidekickPrompt.includes("vote signal"));

  const fallback = getViewPreset("missing");
  assert.equal(fallback.id, "vote-map");

  for (const preset of VIEW_PRESETS) {
    assert.ok(preset.label.length > 4, `${preset.id} needs a human label`);
    assert.ok(preset.summary.length > 20, `${preset.id} needs a plain-language summary`);
    assert.ok(preset.sidekickPrompt.length > 20, `${preset.id} needs a sidekick prompt`);
  }
});

test("view preset transitions clear stale review context before plan comparison", () => {
  const planCompare = getViewPresetTransition("plan-compare");
  assert.equal(planCompare.opensDataPanel, false);
  assert.equal(planCompare.opensStarterPanel, false);
  assert.equal(planCompare.opensSidekickPanel, false);
  assert.equal(planCompare.clearsActiveStarter, true);
  assert.equal(planCompare.clearsMapFocus, true);

  const starterRegions = getViewPresetTransition("starter-regions");
  assert.equal(starterRegions.opensStarterPanel, true);
  assert.equal(starterRegions.clearsActiveStarter, false);
  assert.equal(starterRegions.clearsMapFocus, false);
});

test("map instance key changes only when the base geography changes", () => {
  assert.equal(getHoneycombMapInstanceKey("nc", "precincts"), "nc-precincts");
  assert.equal(
    getHoneycombMapInstanceKey("nc", getViewPreset("vote-map").dataset),
    getHoneycombMapInstanceKey("nc", getViewPreset("plan-compare").dataset),
  );
  assert.notEqual(
    getHoneycombMapInstanceKey("nc", "precincts"),
    getHoneycombMapInstanceKey("nc", "blocks"),
  );
});

test("map settings button exposes an accessible name", async () => {
  const source = await readFile(new URL("../app/components/HoneycombMap.tsx", import.meta.url), "utf8");
  assert.match(source, /aria-label=.+Open map settings/s);
});

test("clipboard helper uses the async clipboard when available", async () => {
  let copied = "";
  const ok = await copyTextToClipboard("hello", {
    clipboard: {
      writeText: async (text) => {
        copied = text;
      },
    },
  });

  assert.equal(ok, true);
  assert.equal(copied, "hello");
});

test("clipboard helper falls back to a temporary textarea when permissions deny async clipboard", async () => {
  const calls = [];
  const textarea = {
    value: "",
    style: {},
    focus: () => calls.push("focus"),
    select: () => calls.push("select"),
  };
  const documentRef = {
    body: {
      appendChild: (node) => {
        calls.push("append");
        assert.equal(node, textarea);
      },
      removeChild: (node) => {
        calls.push("remove");
        assert.equal(node, textarea);
      },
    },
    createElement: (tagName) => {
      assert.equal(tagName, "textarea");
      return textarea;
    },
    execCommand: (command) => {
      calls.push(command);
      return command === "copy";
    },
  };

  const ok = await copyTextToClipboard("fallback text", {
    clipboard: {
      writeText: async () => {
        throw new Error("denied");
      },
    },
    documentRef,
  });

  assert.equal(ok, true);
  assert.equal(textarea.value, "fallback text");
  assert.deepEqual(calls, ["append", "focus", "select", "copy", "remove"]);
});

test("dataset mode guide explains when red and blue appear", () => {
  const block = getDatasetModeGuide("blocks");
  const precinct = getDatasetModeGuide("precincts");
  const county = getDatasetModeGuide("counties");

  assert.match(block.primaryQuestion, /population/i);
  assert.match(block.redBlueRule, /does not show red\/blue/i);
  assert.match(precinct.primaryQuestion, /vote/i);
  assert.match(precinct.redBlueRule, /red\/blue/i);
  assert.match(county.primaryQuestion, /coarse/i);
  assert.match(county.bestUse, /sanity/i);
});

test("population datasets default to population-safe metrics", () => {
  assert.equal(getDefaultMetricForDatasetKind("population"), "population");
  assert.deepEqual(
    getMetricOptionsForDatasetKind("population").map((metric) => metric.value),
    ["population", "vap", "black_pct", "hispanic_pct", "nonwhite_pct"],
  );
});

test("election datasets keep election metrics", () => {
  assert.equal(getDefaultMetricForDatasetKind("election"), "margin");
  assert.deepEqual(
    getMetricOptionsForDatasetKind("election").map((metric) => metric.value),
    ["turnout", "dem_pct", "rep_pct", "margin", "competitiveness"],
  );
});

test("dataset status disables unavailable years", () => {
  const statuses = buildDatasetStatus(DATASETS, ELECTION_YEARS, "precincts", 2024);
  const unavailable2024 = statuses.find((s) => s.year === 2024);
  const available2020 = statuses.find((s) => s.year === 2020);

  assert.equal(unavailable2024.disabled, true);
  assert.equal(unavailable2024.label, "2024");
  assert.equal(available2020.disabled, false);
  assert.equal(available2020.selected, true);
});

test("hex summary reports raw counts and population-weighted vote shares separately", () => {
  const stats = summarizeHexStats([
    { totalDem: 90, totalRep: 10, totalVotes: 100 },
    { totalDem: 10, totalRep: 990, totalVotes: 1000 },
    { totalDem: 50, totalRep: 50, totalVotes: 100 },
  ]);

  assert.deepEqual(stats, {
    hexCount: 3,
    demHexes: 1,
    repHexes: 1,
    tossupHexes: 1,
    totalVotes: 1200,
    demVotes: 150,
    repVotes: 1050,
    demVoteShare: 12.5,
    repVoteShare: 87.5,
    tossupVoteShare: 8.333333333333332,
  });
});

test("research layer catalog exposes available and planned expert overlays", () => {
  assert.equal(RESEARCH_LAYERS.length, 7);

  const enacted = RESEARCH_LAYERS.find((layer) => layer.id === "district-outlines");
  const plans = RESEARCH_LAYERS.find((layer) => layer.id === "plan-overlays");
  const census = RESEARCH_LAYERS.find((layer) => layer.id === "census-blocks");
  const coi = RESEARCH_LAYERS.find((layer) => layer.id === "coi-overlays");

  assert.equal(enacted.status, "available");
  assert.equal(plans.status, "available");
  assert.equal(census.status, "planned");
  assert.equal(coi.status, "available");
});

test("layer status keeps unavailable layers disabled even if requested active", () => {
  const statuses = buildLayerStatus(RESEARCH_LAYERS, ["district-outlines", "census-blocks"]);
  const districts = statuses.find((layer) => layer.id === "district-outlines");
  const census = statuses.find((layer) => layer.id === "census-blocks");

  assert.equal(districts.enabled, true);
  assert.equal(districts.disabled, false);
  assert.equal(census.enabled, false);
  assert.equal(census.disabled, true);
  assert.equal(census.reason, "Census block ingestion is planned");
});

test("layer groups expose plan layers as a first-class group with counts", () => {
  const statuses = buildLayerStatus(RESEARCH_LAYERS, ["district-outlines", "district-heat"]);
  const groups = buildLayerGroups(statuses);
  const plans = groups.find((group) => group.group === "Plans");

  assert.equal(groups[0].group, "Plans");
  assert.equal(plans.availableCount, 3);
  assert.equal(plans.enabledCount, 2);
  assert.deepEqual(plans.layers.map((layer) => layer.id), [
    "district-outlines",
    "district-heat",
    "plan-overlays",
  ]);
});

test("plan layers expose provenance and caveats separately from base datasets", () => {
  const outlines = getResearchLayerProvenance("district-outlines");
  assert.equal(outlines.title, "Enacted congressional district outlines");
  assert.equal(outlines.payloadUrl, "/data/congressional-districts-2022.json");
  assert.match(outlines.source, /Census Bureau/);
  assert.ok(outlines.caveats.some((caveat) => caveat.includes("118th Congress")));

  const heat = getResearchLayerProvenance("district-heat");
  assert.equal(heat.title, "District heat fill");
  assert.equal(heat.payloadUrl, "/data/districts-votes-2020.json");
  assert.match(heat.method, /county centroid/);
  assert.match(heat.caveats[0], /^County-derived heat fill/);
  assert.ok(heat.caveats[0].includes("not precinct-to-district aggregation"));
});

test("plan import schema documents the expected registry shape", () => {
  const schema = getPlanImportSchema();

  assert.equal(schema.format, "GeoJSON FeatureCollection");
  assert.deepEqual(schema.requiredProperties, ["plan_id", "district_id", "GEOID", "name", "source", "cycle"]);
  assert.ok(schema.optionalProperties.includes("metadata"));
  assert.ok(schema.validationNotes.some((note) => note.includes("GEOID may mirror district_id")));
  assert.ok(schema.validationNotes.some((note) => note.includes("Polygon or MultiPolygon")));
});

test("local plan registry points at normalized GeoJSON plan packages", async () => {
  assert.equal(getPlanRegistryUrl(), "/data/plans/registry.json");

  const registry = JSON.parse(await readFile(new URL("../public/data/plans/registry.json", import.meta.url), "utf8"));
  assert.equal(registry.schemaVersion, 1);
  assert.ok(Array.isArray(registry.plans));
  assert.ok(registry.plans.length >= 1);

  const enacted = registry.plans.find((plan) => plan.id === "us-congress-118-enacted");
  assert.equal(enacted.name, "118th Congress enacted districts");
  assert.equal(enacted.source, "U.S. Census Bureau");
  assert.equal(enacted.cycle, "2022");
  assert.equal(enacted.url, "/data/plans/us-congress-118-enacted.json");

  const plan = JSON.parse(await readFile(new URL(`../public${enacted.url}`, import.meta.url), "utf8"));
  assert.equal(plan.type, "FeatureCollection");
  assert.ok(plan.features.length > 0);

  const schema = getPlanImportSchema();
  const properties = plan.features[0].properties;
  for (const property of schema.requiredProperties) {
    assert.ok(properties[property], `missing required plan property ${property}`);
  }
});

test("plan registry includes the NC court-ordered 2022 congressional plan", async () => {
  const registry = JSON.parse(await readFile(new URL("../public/data/plans/registry.json", import.meta.url), "utf8"));
  const courtPlan = registry.plans.find((plan) => plan.id === "nc-2022-court-interim-congressional");

  assert.equal(courtPlan.name, "NC 2022 court-ordered congressional plan");
  assert.equal(courtPlan.source, "North Carolina General Assembly");
  assert.equal(courtPlan.cycle, "2022");
  assert.equal(courtPlan.status, "court");
  assert.equal(courtPlan.url, "/data/plans/nc-2022-court-interim-congressional.json");

  const plan = JSON.parse(await readFile(new URL(`../public${courtPlan.url}`, import.meta.url), "utf8"));
  assert.equal(plan.type, "FeatureCollection");
  assert.equal(plan.features.length, 14);

  const schema = getPlanImportSchema();
  for (const feature of plan.features) {
    for (const property of schema.requiredProperties) {
      assert.ok(feature.properties[property], `missing required plan property ${property}`);
    }
    assert.equal(feature.properties.plan_id, courtPlan.id);
    assert.equal(feature.properties.source, courtPlan.source);
    assert.equal(feature.properties.cycle, courtPlan.cycle);
  }
});

test("plan registry includes the NC 2023 enacted congressional plan", async () => {
  const registry = JSON.parse(await readFile(new URL("../public/data/plans/registry.json", import.meta.url), "utf8"));
  const enactedPlan = registry.plans.find((plan) => plan.id === "nc-2023-enacted-congressional");

  assert.equal(enactedPlan.name, "NC 2023 enacted congressional plan");
  assert.equal(enactedPlan.source, "North Carolina General Assembly");
  assert.equal(enactedPlan.cycle, "2024");
  assert.equal(enactedPlan.status, "enacted");
  assert.equal(enactedPlan.url, "/data/plans/nc-2023-enacted-congressional.json");

  const plan = JSON.parse(await readFile(new URL(`../public${enactedPlan.url}`, import.meta.url), "utf8"));
  assert.equal(plan.type, "FeatureCollection");
  assert.equal(plan.features.length, 14);

  const schema = getPlanImportSchema();
  for (const feature of plan.features) {
    for (const property of schema.requiredProperties) {
      assert.ok(feature.properties[property], `missing required plan property ${property}`);
    }
    assert.equal(feature.properties.plan_id, enactedPlan.id);
    assert.equal(feature.properties.source, enactedPlan.source);
    assert.equal(feature.properties.cycle, enactedPlan.cycle);
  }
});

test("plan feature collections summarize district count and population", () => {
  const plan = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { district_id: "A", population: 100 },
        geometry: { type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] },
      },
      {
        type: "Feature",
        properties: { district_id: "B", population: 200 },
        geometry: { type: "Polygon", coordinates: [[[2, 0], [4, 0], [4, 2], [2, 2], [2, 0]]] },
      },
    ],
  };

  assert.deepEqual(summarizePlanFeatureCollection(plan), {
    featureCount: 2,
    districtCount: 2,
    totalPopulation: 300,
  });
});

test("plan comparison reports selected points covered by plan districts", () => {
  const plan = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { district_id: "A" },
        geometry: { type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] },
      },
      {
        type: "Feature",
        properties: { district_id: "B" },
        geometry: { type: "Polygon", coordinates: [[[2, 0], [4, 0], [4, 2], [2, 2], [2, 0]]] },
      },
    ],
  };

  assert.deepEqual(
    comparePlanToPoints(plan, [
      { lat: 1, lng: 1 },
      { lat: 1, lng: 3 },
      { lat: 10, lng: 10 },
    ]),
    {
      selectedPointCount: 3,
      matchedPointCount: 2,
      unmatchedPointCount: 1,
      districtCount: 2,
      districtIds: ["A", "B"],
    },
  );
});

test("plan district assignment returns one district id or null per point", () => {
  const plan = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { district_id: "A" },
        geometry: { type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] },
      },
      {
        type: "Feature",
        properties: { district_id: "B" },
        geometry: { type: "Polygon", coordinates: [[[2, 0], [4, 0], [4, 2], [2, 2], [2, 0]]] },
      },
    ],
  };

  assert.deepEqual(
    assignPointsToPlanDistricts(plan, [
      { lat: 1, lng: 1 },
      { lat: 1, lng: 3 },
      { lat: 10, lng: 10 },
    ]),
    ["A", "B", null],
  );
});

test("expert review packet separates ready surfaces from known caveats", () => {
  const packet = getExpertReviewPacket();

  assert.equal(packet.title, "Expert review packet");
  assert.match(packet.reviewStance, /diagnostic/i);
  assert.ok(packet.readyForReview.some((item) => item.includes("Plan comparison panel")));
  assert.ok(packet.knownLimits.some((item) => item.includes("county-derived")));
  assert.ok(packet.knownLimits.some((item) => item.includes("CVAP")));
  assert.ok(packet.reviewQuestions.some((item) => item.includes("plan import schema")));
  assert.equal(packet.recommendedNextObjective, "First real COI payload (RDH/Representable) and the VRA boundary ledger prototype");

  const serialized = JSON.stringify(packet);
  assert.doesNotMatch(serialized, /TBD|TODO|placeholder/i);
});

test("named-selections packet ships claim-tagged boundary deltas per region", async () => {
  assert.equal(getNamedSelectionsPacketUrl("nc"), "/data/case-studies/nc-named-selections.json");

  const packet = JSON.parse(await readFile(new URL("../public/data/case-studies/nc-named-selections.json", import.meta.url), "utf8"));

  assert.equal(packet.schemaVersion, 1);
  assert.match(packet.reviewStance, /not court-grade evidence/);
  assert.equal(packet.regions.length, 2);
  for (const region of packet.regions) {
    assert.ok(region.legalFrame.length > 0);
    assert.equal(region.populationLayer.claimTag, "descriptive_with_assignment_caveat");
    assert.equal(region.precinctSignal.claimTag, "descriptive_with_centroid_caveat");
    assert.equal(region.boundaryDelta.claimTag, "descriptive_with_assignment_caveat");
    assert.equal(region.boundaryDelta.interpretationTag, "requires_ensemble_and_expert_validation");
    assert.ok(region.boundaryDelta.h3CellsReassigned > 0);
    assert.equal(
      region.boundaryDelta.districtFlows.reduce((total, flow) => total + flow.population, 0),
      region.boundaryDelta.populationInReassignedCells,
    );
    assert.ok(region.deviationLedgerSeed.every((item) => ["unresolved", "needs-data"].includes(item.status)));
  }
});

test("ensemble percentile bands split outliers, edges, and typical positions", () => {
  assert.equal(classifyEnsemblePercentile(0.5), "low_outlier");
  assert.equal(classifyEnsemblePercentile(4.9), "low_outlier");
  assert.equal(classifyEnsemblePercentile(5), "low_edge");
  assert.equal(classifyEnsemblePercentile(25), "typical");
  assert.equal(classifyEnsemblePercentile(68.3), "typical");
  assert.equal(classifyEnsemblePercentile(75), "typical");
  assert.equal(classifyEnsemblePercentile(80), "high_edge");
  assert.equal(classifyEnsemblePercentile(95), "high_edge");
  assert.equal(classifyEnsemblePercentile(96.4), "high_outlier");
});

test("ensemble outlier gate blocks mocks and undocumented constraint sets", () => {
  const documented = [{ id: "pop-deviation", description: "x" }];

  assert.deepEqual(
    getEnsembleOutlierGate({ status: "published", method: { generator: "g", algorithm: "a", planCount: 5000, constraints: documented } }),
    { allowed: true, blockers: [] },
  );

  const mockGate = getEnsembleOutlierGate({ status: "mock", method: { generator: "g", algorithm: "a", planCount: 5000, constraints: documented } });
  assert.equal(mockGate.allowed, false);
  assert.match(mockGate.blockers[0], /fabricated/);

  const bareGate = getEnsembleOutlierGate({ status: "published", method: { generator: "g", algorithm: "a", planCount: 0, constraints: [] } });
  assert.equal(bareGate.allowed, false);
  assert.equal(bareGate.blockers.length, 2);
});

test("ensemble band styles cover every percentile band with a distinct color", () => {
  const bands = ["low_outlier", "low_edge", "typical", "high_edge", "high_outlier"];
  const colors = new Set();
  for (const band of bands) {
    assert.ok(ENSEMBLE_BAND_STYLES[band], `missing style for ${band}`);
    assert.match(ENSEMBLE_BAND_STYLES[band].color, /^#[0-9a-f]{6}$/);
    colors.add(ENSEMBLE_BAND_STYLES[band].color);
  }
  assert.equal(colors.size, bands.length);
});

test("ensemble summary research layer is available for toggling", () => {
  const layer = RESEARCH_LAYERS.find((candidate) => candidate.id === "ensemble-summary");
  assert.equal(layer.status, "available");
  const status = buildLayerStatus(RESEARCH_LAYERS, ["ensemble-summary"]);
  const view = status.find((candidate) => candidate.id === "ensemble-summary");
  assert.equal(view.disabled, false);
  assert.equal(view.enabled, true);
});

async function readEnsembleRegistry() {
  return JSON.parse(await readFile(new URL("../public/data/ensembles/registry.json", import.meta.url), "utf8"));
}

async function readEnsembleSummary(entry) {
  return JSON.parse(await readFile(new URL(`../public${entry.url}`, import.meta.url), "utf8"));
}

async function assertValidEnsembleSummary(summary) {
  const histogramTotal = summary.seatMeasure.histogram.reduce((total, bin) => total + bin.planCount, 0);
  assert.equal(histogramTotal, summary.method.planCount);

  const planRegistry = JSON.parse(await readFile(new URL("../public/data/plans/registry.json", import.meta.url), "utf8"));
  const knownPlanIds = new Set(planRegistry.plans.map((plan) => plan.id));
  for (const compared of summary.seatMeasure.comparedPlans) {
    assert.ok(knownPlanIds.has(compared.planId), `unknown plan ${compared.planId}`);
    assert.ok(compared.percentile >= 0 && compared.percentile <= 100);
  }

  for (const measure of summary.unitMeasures) {
    assert.ok(knownPlanIds.has(measure.referencePlanId));
    if (measure.unitKeyType === "h3") assert.equal(measure.h3Resolution, 7);
    for (const unit of measure.units) {
      const { p5, p25, p50, p75, p95 } = unit.percentiles;
      assert.ok(p5 <= p25 && p25 <= p50 && p50 <= p75 && p75 <= p95, `non-monotonic percentiles for ${unit.unitId}`);
      assert.ok(unit.comparedPercentile >= 0 && unit.comparedPercentile <= 100);
    }
  }
}

test("ensemble registry lists real data ahead of the mock fixture", async () => {
  assert.equal(getEnsembleRegistryUrl(), "/data/ensembles/registry.json");
  assert.ok(getEnsembleImportSchema().validationNotes.some((note) => note.includes("constraints")));

  const registry = await readEnsembleRegistry();
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.ensembles.length, 2);
  assert.equal(registry.ensembles[0].id, "nc-congress-2020-alarm");
  assert.equal(registry.ensembles[0].status, "draft");
  assert.equal(registry.ensembles[1].status, "mock");
});

test("mock NC ensemble payload validates the ensemble import schema end-to-end", async () => {
  const registry = await readEnsembleRegistry();
  const entry = registry.ensembles.find((candidate) => candidate.id === "nc-congress-2020-mock");
  const summary = await readEnsembleSummary(entry);
  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.status, "mock");
  assert.match(summary.mockCaveat, /must never be cited/);

  const gate = getEnsembleOutlierGate(summary);
  assert.equal(gate.allowed, false);

  await assertValidEnsembleSummary(summary);

  const districtMeasure = summary.unitMeasures.find((measure) => measure.unitKeyType === "district");
  assert.equal(districtMeasure.units.length, 14);
});

test("ALARM NC ensemble payload is real, gated open, and positions both plans", async () => {
  const registry = await readEnsembleRegistry();
  const entry = registry.ensembles.find((candidate) => candidate.id === "nc-congress-2020-alarm");
  const summary = await readEnsembleSummary(entry);
  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.status, "draft");
  assert.equal(summary.mockCaveat, undefined);
  assert.equal(summary.method.planCount, 5000);
  assert.match(summary.method.sourceUrl, /10\.7910\/DVN\/SLCD3E/);
  assert.ok(summary.method.constraints.some((constraint) => constraint.id === "vra-handling"));

  // Real constraints + real plan count: the outlier gate opens.
  const gate = getEnsembleOutlierGate(summary);
  assert.deepEqual(gate, { allowed: true, blockers: [] });

  await assertValidEnsembleSummary(summary);

  // Headline positions under the 2020 presidential proxy: the 2023 enacted
  // plan (4 Democratic seats) is a low outlier; the 2022 court plan (7) is
  // high edge. These bands are the case study's ensemble context.
  const enacted = summary.seatMeasure.comparedPlans.find((plan) => plan.planId === "nc-2023-enacted-congressional");
  assert.equal(enacted.value, 4);
  assert.equal(classifyEnsemblePercentile(enacted.percentile), "low_outlier");

  const court = summary.seatMeasure.comparedPlans.find((plan) => plan.planId === "nc-2022-court-interim-congressional");
  assert.equal(court.value, 7);
  assert.equal(classifyEnsemblePercentile(court.percentile), "high_edge");

  const districtMeasure = summary.unitMeasures.find((measure) => measure.unitKeyType === "district");
  assert.equal(districtMeasure.referencePlanId, "nc-2025-enacted-congressional");
  assert.equal(districtMeasure.units.length, 14);
  const unitIds = new Set(districtMeasure.units.map((unit) => unit.unitId));
  assert.equal(unitIds.size, 14);
  assert.ok(unitIds.has("3701") && unitIds.has("3714"));

  // The centroid-assignment caveat must travel with the compared values.
  assert.ok(summary.caveats.some((caveat) => caveat.includes("descriptive_with_assignment_caveat")));
});

test("COI fracture gate blocks samples, synthetic submitters, and missing provenance", () => {
  const realProvenance = {
    submitter: { name: "Neighborhood Coalition", type: "organization" },
    source: { description: "Portal submission", collectedAt: "2021-10-02", method: "Districtr drawing tool" },
  };

  assert.deepEqual(getCoiFractureGate({ status: "published", ...realProvenance }), { allowed: true, blockers: [] });

  const sampleGate = getCoiFractureGate({ status: "sample", ...realProvenance });
  assert.equal(sampleGate.allowed, false);
  assert.match(sampleGate.blockers[0], /fictional/);

  const syntheticGate = getCoiFractureGate({
    status: "draft",
    submitter: { name: "generator", type: "synthetic" },
    source: realProvenance.source,
  });
  assert.equal(syntheticGate.allowed, false);
  assert.match(syntheticGate.blockers[0], /submitter/);

  const bareGate = getCoiFractureGate({
    status: "draft",
    submitter: realProvenance.submitter,
    source: { description: "", collectedAt: "", method: "" },
  });
  assert.equal(bareGate.allowed, false);
  assert.match(bareGate.blockers[0], /provenance/);
});

test("sample COI payload validates the registry schema and stays gated", async () => {
  assert.equal(getCoiRegistryUrl(), "/data/cois/registry.json");
  assert.match(COI_OVERLAY_COLOR, /^#[0-9a-f]{6}$/);

  const registry = JSON.parse(await readFile(new URL("../public/data/cois/registry.json", import.meta.url), "utf8"));
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.cois.length, 1);
  assert.equal(registry.cois[0].id, "nc-sample-fictional-crescent");
  assert.equal(registry.cois[0].status, "sample");

  const summary = JSON.parse(await readFile(new URL(`../public${registry.cois[0].url}`, import.meta.url), "utf8"));
  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.status, "sample");
  assert.equal(summary.submitter.type, "synthetic");
  assert.match(summary.sampleCaveat, /must never be cited/);
  assert.equal(summary.geometry.geometry.type, "Polygon");

  // The gate must block the fictional sample no matter how complete it looks.
  const gate = getCoiFractureGate(summary);
  assert.equal(gate.allowed, false);

  const planRegistry = JSON.parse(await readFile(new URL("../public/data/plans/registry.json", import.meta.url), "utf8"));
  const knownPlanIds = new Set(planRegistry.plans.map((plan) => plan.id));

  assert.equal(summary.fracture.h3Resolution, 7);
  assert.equal(summary.fracture.claimTag, "descriptive_with_assignment_caveat");
  assert.ok(summary.fracture.cellCount > 0);
  assert.ok(summary.fracture.plans.length >= 2);
  for (const planFracture of summary.fracture.plans) {
    assert.ok(knownPlanIds.has(planFracture.planId), `unknown plan ${planFracture.planId}`);
    assert.ok(planFracture.districtsTouched >= 1);
    const shareTotal = planFracture.segments.reduce((total, segment) => total + segment.populationShare, 0);
    assert.ok(Math.abs(shareTotal - 1) < 0.01, `segment shares should sum to ~1, got ${shareTotal}`);
    const populationTotal = planFracture.segments.reduce((total, segment) => total + segment.population, 0);
    assert.equal(populationTotal, summary.fracture.population);
    assert.equal(planFracture.largestShare, Math.max(...planFracture.segments.map((segment) => segment.populationShare)));
  }

  // The sample exists to exercise the fracture readout in both directions:
  // more cohesive under one plan than the other.
  const shares = summary.fracture.plans.map((planFracture) => planFracture.largestShare);
  assert.ok(Math.max(...shares) !== Math.min(...shares));
});

test("NC starter packet is a compact generated case-study handoff artifact", async () => {
  assert.equal(getCaseStudyPacketUrl("nc"), "/data/case-studies/nc-starter-pack.json");

  const packet = JSON.parse(await readFile(new URL("../public/data/case-studies/nc-starter-pack.json", import.meta.url), "utf8"));

  assert.equal(packet.schemaVersion, 1);
  assert.equal(packet.id, "nc-starter-pack");
  assert.equal(packet.caseStudy.statePostal, "NC");
  assert.equal(packet.caseStudy.year, 2020);
  assert.equal(packet.statewide.population, 10439388);
  assert.equal(packet.statewide.h3Resolution, 7);
  assert.equal(packet.statewide.sourceBlocks, 236638);
  assert.equal(packet.statewide.h3Cells, 25956);
  assert.ok(packet.statewide.nonwhitePopulation > 4000000);
  assert.ok(packet.planComparisons.some((plan) => plan.planId === "nc-2022-court-interim-congressional" && plan.districtCount === 14));
  assert.ok(packet.planComparisons.some((plan) => plan.planId === "nc-2023-enacted-congressional" && plan.districtCount === 14));
  assert.ok(packet.planComparisons.some((plan) => plan.planId === "us-congress-118-enacted" && plan.districtCount === 14));
  assert.equal(packet.starterSelections.length, 5);
  assert.deepEqual(
    packet.starterSelections.map((selection) => selection.id),
    ["triangle", "charlotte-mecklenburg", "triad", "eastern-black-belt", "western-nc"],
  );
  for (const selection of packet.starterSelections) {
    assert.ok(selection.bounds.south < selection.bounds.north, `${selection.id} has invalid vertical bounds`);
    assert.ok(selection.bounds.west < selection.bounds.east, `${selection.id} has invalid horizontal bounds`);
    assert.ok(selection.h3Cells > 0, `${selection.id} needs selected H3 cells`);
    assert.ok(selection.population.total > 0, `${selection.id} needs population`);
    assert.ok(selection.electionSignal.precincts > 0, `${selection.id} needs precinct signal`);
    assert.ok(selection.planTouches.some((plan) => plan.planId === "nc-2022-court-interim-congressional"), `${selection.id} missing court plan touch stats`);
    assert.ok(selection.planTouches.some((plan) => plan.planId === "nc-2023-enacted-congressional"), `${selection.id} missing enacted plan touch stats`);
  }
  assert.ok(packet.caveats.some((caveat) => caveat.includes("county-derived")));
  assert.ok(packet.nextQuestions.some((question) => question.includes("precinct-to-district")));
});

test("expert review objectives define success criteria for each disciplined prompt", () => {
  const objectives = getExpertReviewObjectives();

  assert.equal(objectives.length, 6);
  assert.deepEqual(
    objectives.map((objective) => objective.id),
    [
      "centroid-shortcut-audit",
      "nc-asymmetry-decomposition",
      "h3-ensemble-explainer",
      "coi-fracture-prompt",
      "vra-boundary-ledger",
      "single-metric-skepticism",
    ],
  );

  for (const objective of objectives) {
    assert.ok(objective.prompt.length > 20, `${objective.id} prompt is too vague`);
    assert.ok(objective.objective.length > 20, `${objective.id} objective is too vague`);
    assert.ok(objective.definitionOfSuccess.length >= 3, `${objective.id} needs concrete success criteria`);
    assert.ok(objective.roadblocks.length >= 2, `${objective.id} needs roadblocks`);
    assert.ok(objective.nextArtifact.length > 10, `${objective.id} needs a next artifact`);

    const serialized = JSON.stringify(objective);
    assert.doesNotMatch(serialized, /TBD|TODO|placeholder/i);
  }
});

test("withBasePath prefixes absolute URLs with NEXT_PUBLIC_BASE_PATH and leaves others alone", () => {
  const original = process.env.NEXT_PUBLIC_BASE_PATH;
  try {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    assert.equal(withBasePath("/data/plans/registry.json"), "/data/plans/registry.json");

    process.env.NEXT_PUBLIC_BASE_PATH = "/honeycombing";
    assert.equal(withBasePath("/data/plans/registry.json"), "/honeycombing/data/plans/registry.json");
    assert.equal(withBasePath(getEnsembleRegistryUrl()), "/honeycombing/data/ensembles/registry.json");
    assert.equal(withBasePath("https://example.com/x.json"), "https://example.com/x.json");
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
    else process.env.NEXT_PUBLIC_BASE_PATH = original;
  }
});
