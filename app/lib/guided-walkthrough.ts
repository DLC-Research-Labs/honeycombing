/**
 * Guided walkthrough: the default, plain-English North Carolina path.
 *
 * Four questions — what changed → how unusual is it under this comparison →
 * where does it show up → what can't we conclude — each one wired to layers the
 * research app already renders. Every number in the narrative is read off the
 * tracked headline payload; nothing here is a literal copy of a number, so the
 * story cannot drift from the data it describes.
 *
 * The expert path keeps the full workbench (years, datasets, presets, sample
 * communities, settings) and is reachable at any time; `resolveMapLayerDirective`
 * is the single seam both paths use to tell the map which layers belong on
 * screen, which is why switching modes restores a coherent state rather than
 * leaving stray overlays behind.
 */

import type { DatasetId, ViewPresetId } from "./honeycomb-ui-helpers";
import type { VoteMetric } from "./vote-types";

export type AppModeId = "guided" | "expert";

export const DEFAULT_APP_MODE: AppModeId = "guided";

export const APP_MODES: readonly { id: AppModeId; label: string; description: string }[] = [
  {
    id: "guided",
    label: "Guided",
    description: "A four-step walkthrough of the North Carolina comparison, in plain English.",
  },
  {
    id: "expert",
    label: "Expert",
    description: "The full research workbench: years, datasets, view presets, sample regions, and layer settings.",
  },
];

/**
 * The guided path stays on the Census population substrate for all four steps.
 * That keeps the equal-area vote map (which undercounts dense cities) out of the
 * front door, and because the dataset never changes mid-walkthrough the map is
 * never remounted, so pan, zoom, and focus survive the whole story.
 */
export const GUIDED_DATASET_ID: DatasetId = "blocks";
export const GUIDED_PRESET_ID: ViewPresetId = "population-demographics";
export const GUIDED_METRIC: VoteMetric = "population";

/** The plan the walkthrough examines; its geometry comes from the plan registry. */
export const GUIDED_PLAN_ID = "nc-2025-enacted-congressional";

/** Expert "Plan Compare" preset default, unchanged from the pre-guided app. */
export const EXPERT_PLAN_COMPARE_PLAN_IDS = [
  "nc-2022-court-interim-congressional",
  "nc-2023-enacted-congressional",
] as const;

export type GuidedStepId = "what-changed" | "how-unusual" | "where" | "limits";

export interface GuidedStep {
  id: GuidedStepId;
  ordinal: number;
  navLabel: string;
  question: string;
}

export const GUIDED_STEPS: readonly GuidedStep[] = [
  {
    id: "what-changed",
    ordinal: 1,
    navLabel: "What changed",
    question: "What changed?",
  },
  {
    id: "how-unusual",
    ordinal: 2,
    navLabel: "How unusual",
    question: "How unusual is it under this comparison?",
  },
  {
    id: "where",
    ordinal: 3,
    navLabel: "Where",
    question: "Where does it show up?",
  },
  {
    id: "limits",
    ordinal: 4,
    navLabel: "What we can't say",
    question: "What can't we conclude?",
  },
];

export const DEFAULT_GUIDED_STEP_ID: GuidedStepId = "what-changed";

export function getGuidedStep(stepId: GuidedStepId): GuidedStep {
  return GUIDED_STEPS.find((step) => step.id === stepId) ?? GUIDED_STEPS[0];
}

export function getNextGuidedStepId(stepId: GuidedStepId): GuidedStepId | null {
  const index = GUIDED_STEPS.findIndex((step) => step.id === stepId);
  const next = index < 0 ? undefined : GUIDED_STEPS[index + 1];
  return next ? next.id : null;
}

export function getPreviousGuidedStepId(stepId: GuidedStepId): GuidedStepId | null {
  const index = GUIDED_STEPS.findIndex((step) => step.id === stepId);
  const previous = index <= 0 ? undefined : GUIDED_STEPS[index - 1];
  return previous ? previous.id : null;
}

export type MapChipId = "plans" | "communities" | "ensemble";

export interface MapLayerDirective {
  showDistrictOutlines: boolean;
  districtHeatFill: boolean;
  activePlanIds: readonly string[];
  opensPlansPanel: boolean;
  showEnsembleBands: boolean;
  /** Bands may never appear before the method panel that documents the comparison universe. */
  opensEnsembleMethodPanel: boolean;
  showEnsembleH3: boolean;
  showCommunities: boolean;
  opensCommunitiesPanel: boolean;
  visibleChips: readonly MapChipId[];
  showSettings: boolean;
}

export interface MapLayerDirectiveInput {
  mode: AppModeId;
  guidedStepId: GuidedStepId;
  presetId?: ViewPresetId;
}

const ALL_CHIPS: readonly MapChipId[] = ["plans", "communities", "ensemble"];

const EMPTY_DIRECTIVE: MapLayerDirective = {
  showDistrictOutlines: false,
  districtHeatFill: false,
  activePlanIds: [],
  opensPlansPanel: false,
  showEnsembleBands: false,
  opensEnsembleMethodPanel: false,
  showEnsembleH3: false,
  showCommunities: false,
  opensCommunitiesPanel: false,
  visibleChips: ALL_CHIPS,
  showSettings: true,
};

function guidedDirective(stepId: GuidedStepId): MapLayerDirective {
  const base: MapLayerDirective = {
    ...EMPTY_DIRECTIVE,
    visibleChips: ["ensemble"],
    showSettings: false,
  };

  if (stepId === "what-changed") {
    // The registry plan, not the 118th-Congress outline layer: those are
    // different cycles and must not be conflated in the guided story.
    return { ...base, activePlanIds: [GUIDED_PLAN_ID], visibleChips: ["plans"] };
  }

  // Steps 2–4 read the ensemble. The bands already draw the reference plan's
  // district geometry, so the separate plan overlay is dropped to avoid two
  // boundary layers of the same map.
  const withEnsemble: MapLayerDirective = {
    ...base,
    showEnsembleBands: true,
    opensEnsembleMethodPanel: true,
  };

  if (stepId === "where") {
    return { ...withEnsemble, showEnsembleH3: true };
  }

  return withEnsemble;
}

function expertDirective(presetId?: ViewPresetId): MapLayerDirective {
  if (presetId === "plan-compare") {
    return {
      ...EMPTY_DIRECTIVE,
      showDistrictOutlines: true,
      activePlanIds: [...EXPERT_PLAN_COMPARE_PLAN_IDS],
      opensPlansPanel: true,
    };
  }

  return EMPTY_DIRECTIVE;
}

export function resolveMapLayerDirective(input: MapLayerDirectiveInput): MapLayerDirective {
  return input.mode === "guided"
    ? guidedDirective(input.guidedStepId)
    : expertDirective(input.presetId);
}

/**
 * Plain-English list of the overlays the directive actually turns on. The guided
 * panel prints this so the reader is never told about a layer that is off, and
 * never left guessing which legend belongs to what.
 */
export function describeActiveMapLayers(directive: MapLayerDirective): readonly string[] {
  const layers: string[] = [];

  if (directive.showDistrictOutlines) layers.push("Enacted district outlines (118th Congress geography)");
  if (directive.districtHeatFill) layers.push("County-derived district heat fill");
  if (directive.activePlanIds.length === 1) {
    layers.push("Plan boundaries from the plan registry (1 plan)");
  } else if (directive.activePlanIds.length > 1) {
    layers.push(`Plan boundaries from the plan registry (${directive.activePlanIds.length} plans)`);
  }
  if (directive.showEnsembleBands) layers.push("Ensemble percentile bands, one per district");
  if (directive.showEnsembleH3) layers.push("Ensemble hex localization (outlier tails only)");
  if (directive.showCommunities) layers.push("Community-of-interest polygons");

  return layers;
}

export interface HeadlineFindingStat {
  planId: string;
  planName: string;
  measureLabel?: string;
  planSeats: number;
  districtCount: number;
  ensembleMedianSeats: number;
  planCount: number;
  plansAtOrBelow: number;
  plansAtOrBelowPct: number;
  plansAbove: number;
  plansAbovePct: number;
  percentile: number;
  band: string;
}

export interface HeadlineFindingTailContext {
  measureLabel: string;
  measureDefinition: string;
  enactedMarginPp: number;
  tiePlanCount: number;
  tiePlanMaxMarginPp: number;
  plansStrictlyBelow: number;
  separationPp: number;
  orderingClaimAllowed: boolean;
  statement: string | null;
  note: string;
}

export interface HeadlineFinding {
  headline: string;
  shortHeadline: string;
  methodNote: string;
  mapStatusNote?: string;
  stat: HeadlineFindingStat;
  tailContext?: HeadlineFindingTailContext;
  provenance: {
    inputs: { description: string; sourceUrl: string; status: string }[];
    voteProxy: string;
  };
  caveats: string[];
}

export interface GuidedNarrativeStep extends GuidedStep {
  answer: string;
  /** Optional second sentence the payload only supplies when its own gate allows it. */
  detail?: string;
  bullets: readonly string[];
  limitation: string;
  sourceNote: string;
}

export interface GuidedNarrative {
  title: string;
  statusNotice: string;
  steps: readonly GuidedNarrativeStep[];
}

/**
 * The percentile band vocabulary is owned by `classifyEnsemblePercentile` /
 * `ENSEMBLE_BAND_STYLES` in honeycomb-ui-helpers, which the map's ensemble panel
 * also uses. It is passed in rather than restated here so the guided sentence and
 * the on-map legend can never disagree.
 */
export interface GuidedNarrativeContext {
  percentileBandLabel: string;
}

function count(value: number): string {
  return value.toLocaleString("en-US");
}

function findCaveat(caveats: readonly string[], pattern: RegExp, fallback: string): string {
  return caveats.find((caveat) => pattern.test(caveat)) ?? fallback;
}

export function buildGuidedNarrative(
  finding: HeadlineFinding,
  context: GuidedNarrativeContext,
): GuidedNarrative {
  const { stat, tailContext, provenance, caveats } = finding;
  const source = provenance.inputs[0];
  const payloadStatus = source?.status ?? "unknown";
  const bandLabel = context.percentileBandLabel;

  const statusNotice = payloadStatus === "draft"
    ? "Draft research. The ensemble payload behind every number here carries status \"draft\", pending expert review of its consistency checks. "
      + "Read it as a diagnostic position, not a finished result."
    : `Ensemble payload status: ${payloadStatus}. Every number here is a diagnostic position inside one documented simulated distribution, not a legal conclusion.`;

  const whatChanged: GuidedNarrativeStep = {
    ...getGuidedStep("what-changed"),
    answer: `This walkthrough examines ${stat.planName}. ${finding.mapStatusNote ?? ""}`.trim(),
    bullets: [
      `That plan has ${stat.districtCount} congressional districts, and the map shows their boundaries over Census 2020 population hexes.`,
      "Every boundary overlay is labeled with the plan and cycle it came from. The earlier North Carolina plans stay available in Expert mode for side-by-side comparison.",
      "District boundaries come from the plan registry as published geometry; the walkthrough does not redraw or score them.",
    ],
    limitation:
      "Boundaries are shown as they were drawn. Nothing on this screen establishes why a line moved, who benefits, or whether any change was lawful.",
    sourceNote:
      "Plan geometry: North Carolina General Assembly shapefiles normalized into the app's plan registry (/data/plans/registry.json), with the enacting act and cycle on each entry.",
  };

  const howUnusual: GuidedNarrativeStep = {
    ...getGuidedStep("how-unusual"),
    answer:
      `${stat.planSeats} of ${stat.districtCount} districts lean Democratic under ${stat.planName}, scored by 2020 presidential two-party vote. `
      + `Out of ${count(stat.planCount)} maps simulated for the same state and cycle, ${stat.plansAbovePct}% produce more Democratic-leaning districts `
      + `and ${stat.plansAtOrBelow} produce as few or fewer. The simulated median is ${stat.ensembleMedianSeats}.`,
    detail: tailContext?.statement ?? undefined,
    bullets: [
      `Position in the simulated distribution: ${stat.percentile}th percentile — ${bandLabel}. Percentiles use the mid-rank convention, `
        + `while "${stat.plansAbovePct}% produce more" is a strictly-greater count; the two are reported separately on purpose.`,
      "The comparison maps are sampled under the constraints listed in the map's ensemble method panel — population deviation, contiguity, compactness, "
        + "county preservation, and a majority-minority simulation target. They are a documented comparison universe, not certified fair or lawful maps, "
        + "and the majority-minority target is a simulation constraint rather than a Voting Rights Act analysis.",
      "Presidential vote is a partisan-lean proxy for how a district leans. It is not a forecast and not a substitute for congressional election results.",
      tailContext
        ? `${tailContext.measureLabel}: ${tailContext.enactedMarginPp}pp. ${tailContext.measureDefinition}. Seat counts are discrete, so this continuous `
          + "measure is what orders plans that share a seat bin."
        : "Seat counts are discrete, so plans that differ substantially can share a bin.",
    ],
    limitation: findCaveat(
      caveats,
      /not evidence of intent/i,
      "A percentile position describes where a plan sits in one simulated distribution. It is not evidence of intent or legal injury.",
    ),
    sourceNote: source
      ? `${source.description} — ${source.sourceUrl} (payload status: ${source.status}). Full derivation on the method card and at /about.`
      : "Ensemble source unavailable in this payload.",
  };

  const where: GuidedNarrativeStep = {
    ...getGuidedStep("where"),
    answer:
      "The percentile bands put each district against the simulated range for its rank — districts are matched by rank rather than by number, because "
      + "numbering is not stable across simulated plans. The hex localization layer then shades the cells where "
      + `${stat.planName} places a location in a district that leans further Republican — or further Democratic — than at least 95% of the simulated maps place it.`,
    bullets: [
      "H3 is a fixed visualization grid: Uber's hexagons, published for logistics long before these maps were drawn. It is a way to display geography "
        + "consistently, not a fairness algorithm, not a districting method, and not a standard a map can pass or fail.",
      "A shaded cell reports the containing district's aggregate lean projected onto that cell. It is not a statement about how the people living there voted, "
        + "and it is not a finding of cracking or packing — only a place where this map and the simulated maps disagree.",
      "Cells are matched to precincts and blocks by representative point, not by polygon apportionment, so cell-level readings are for orientation.",
      "Both tails are drawn: districts and cells can sit unusually far in either partisan direction.",
    ],
    limitation:
      "A cell is shaded because of where this plan puts it relative to the simulated maps. That is a spatial pattern worth examining, not evidence of intent "
      + "and not a finding of a legal violation.",
    sourceNote:
      "Same ALARM ensemble and draft status as the headline; the cell-level layer is a separate localization sidecar registered in /data/ensembles/registry.json "
      + "and generated from the ensemble's plan-assignment matrices.",
  };

  const limits: GuidedNarrativeStep = {
    ...getGuidedStep("limits"),
    answer:
      "This is a diagnostic comparison, not a verdict. It cannot tell you that a map is unlawful, that anyone intended a particular result, or what will "
      + "happen in an election. Here is the full list of what travels with the number above.",
    bullets: [
      ...caveats,
      "There is no single Honeycombing fairness score, and nothing here produces a Voting Rights Act conclusion: that needs citizen voting-age population, "
        + "racially polarized voting evidence, and jurisdiction-specific legal review, none of which is implemented.",
      "The sample community of interest available in Expert mode is fictional. It exercises the interface and is permanently blocked from contributing numbers.",
      "Dates, enactment, and litigation status come from the payload's dated map-status note; this app does not check the current state of any case or election "
        + "and should not be read as reporting today's status.",
    ],
    limitation:
      "Every number in this walkthrough is descriptive relative to one documented ensemble, computed from a vote proxy, and the underlying payload is still draft.",
    sourceNote: "Full limitations: /limits. Method, derivation, and the expert-review packet: /about.",
  };

  return {
    title: `North Carolina: ${stat.planName}, compared with ${count(stat.planCount)} simulated maps`,
    statusNotice,
    steps: [whatChanged, howUnusual, where, limits],
  };
}
