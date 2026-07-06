import type { VoteMetric } from "./vote-types";

export const ELECTION_YEARS = [2000, 2004, 2008, 2012, 2016, 2020, 2024] as const;

interface DatasetConfig {
  id: "blocks" | "precincts" | "counties";
  label: string;
  availableYears: readonly ElectionYear[];
  note: string;
  kind: "population" | "election";
  unitLabel: string;
}

export interface DatasetModeGuide {
  dataset: DatasetId;
  label: string;
  primaryQuestion: string;
  redBlueRule: string;
  bestUse: string;
  caveat: string;
}

export interface DatasetProvenance {
  title: string;
  source: string;
  method: string;
  payloadUrl: string;
  manifestUrl?: string;
  h3Resolution?: number;
  caveats: readonly string[];
}

export const DATASETS: readonly DatasetConfig[] = [
  {
    id: "blocks",
    label: "Block",
    availableYears: [2020],
    note: "Census PL 94-171 block-derived H3 cells",
    kind: "population",
    unitLabel: "blocks",
  },
  {
    id: "precincts",
    label: "Precinct",
    availableYears: [2020],
    note: "VEST 2020 precinct centroids",
    kind: "election",
    unitLabel: "precincts",
  },
  {
    id: "counties",
    label: "County",
    availableYears: ELECTION_YEARS,
    note: "County centroids",
    kind: "election",
    unitLabel: "counties",
  },
] as const;

export type ElectionYear = (typeof ELECTION_YEARS)[number];
export type DatasetId = DatasetConfig["id"];
export type DatasetKind = DatasetConfig["kind"];

export interface CaseStudyConfig {
  id: "nc";
  label: string;
  fullLabel: string;
  stateFips: string;
  statePostal: string;
  center: readonly [number, number];
  zoom: number;
  defaultDataset: DatasetId;
  defaultYear: ElectionYear;
  note: string;
}

export const CASE_STUDIES: readonly CaseStudyConfig[] = [
  {
    id: "nc",
    label: "NC",
    fullLabel: "North Carolina",
    stateFips: "37",
    statePostal: "NC",
    center: [35.55, -79.15],
    zoom: 7,
    defaultDataset: "precincts",
    defaultYear: 2020,
    note: "Default case study for block, precinct, and county comparison.",
  },
] as const;

export type CaseStudyId = CaseStudyConfig["id"];

export const DEFAULT_CASE_STUDY_ID: CaseStudyId = "nc";
export const DEFAULT_DATASET_ID: DatasetId = "precincts";
export const DEFAULT_YEAR: ElectionYear = 2020;
export const DEFAULT_VIEW_PRESET_ID: ViewPresetId = "vote-map";

export const VIEW_PRESETS: readonly ViewPreset[] = [
  {
    id: "vote-map",
    label: "Vote Map",
    eyebrow: "Start Here",
    dataset: "precincts",
    metric: "margin",
    summary: "red/blue precinct signal on the neutral H3 grid. Best first view for seeing the electoral geography.",
    sidekickPrompt: "You are looking at the vote signal: red/blue H3 cells summarize 2020 precinct returns by margin.",
  },
  {
    id: "population-demographics",
    label: "Population / Demographics",
    eyebrow: "Census Layer",
    dataset: "blocks",
    metric: "population",
    summary: "Census block-derived H3 population and demographic totals. This is where red/blue intentionally disappears.",
    sidekickPrompt: "You are looking at Census population geography, not election returns; use this to inspect people, VAP, and demographic concentration.",
  },
  {
    id: "plan-compare",
    label: "Plan Compare",
    eyebrow: "Boundaries",
    dataset: "precincts",
    metric: "margin",
    summary: "Vote signal plus plan overlays for comparing enacted, court, and registry plan boundaries.",
    sidekickPrompt: "Use this view to compare how district boundaries sit on top of the vote signal. Caveat: current plan touches are diagnostic, not court-grade apportionment.",
  },
  {
    id: "starter-regions",
    label: "Starter Regions",
    eyebrow: "Guided Review",
    dataset: "precincts",
    metric: "margin",
    summary: "Named North Carolina review regions with local vote, population, and plan-touch summaries.",
    sidekickPrompt: "Pick a named NC starter region to zoom into a review question such as Triangle, Charlotte, Triad, Eastern Black Belt, or Western NC.",
  },
  {
    id: "method-provenance",
    label: "Method / Provenance",
    eyebrow: "Trust Layer",
    dataset: "blocks",
    metric: "population",
    summary: "Source, method, payload, manifest, and caveat view for reviewers checking whether a layer can be cited.",
    sidekickPrompt: "This view foregrounds provenance and caveats. It explains what the layer can show and what it cannot support yet.",
  },
] as const;

export const DATASET_MODE_GUIDES: Record<DatasetId, DatasetModeGuide> = {
  blocks: {
    dataset: "blocks",
    label: "Block",
    primaryQuestion: "Where are population and demographic communities concentrated?",
    redBlueRule: "This mode does not show red/blue vote margin because Census blocks carry population, not election returns.",
    bestUse: "Use for population, VAP, Black, Hispanic, and nonwhite diagnostic geography.",
    caveat: "Current block records use internal-point H3 assignment, not polygon apportionment.",
  },
  precincts: {
    dataset: "precincts",
    label: "Precinct",
    primaryQuestion: "Where is the 2020 vote signal red, blue, or competitive?",
    redBlueRule: "This is the red/blue mode: H3 cells aggregate precinct return points by vote margin.",
    bestUse: "Use for the main electoral-geography view and starter-region comparisons.",
    caveat: "Current precinct records use centroid assignment, not precinct polygon apportionment.",
  },
  counties: {
    dataset: "counties",
    label: "County",
    primaryQuestion: "What does the coarse statewide election sanity check say?",
    redBlueRule: "County mode can show red/blue signal, but it is too coarse for neighborhood or district evidence.",
    bestUse: "Use as a sanity check or broad orientation layer.",
    caveat: "County centroids blur urban, suburban, and split-county district detail.",
  },
};

export interface DatasetYearStatus {
  year: ElectionYear;
  label: string;
  selected: boolean;
  disabled: boolean;
  reason?: string;
}

export interface HexSummaryInput {
  totalDem: number;
  totalRep: number;
  totalVotes: number;
}

export interface HexSummary {
  hexCount: number;
  demHexes: number;
  repHexes: number;
  tossupHexes: number;
  totalVotes: number;
  demVotes: number;
  repVotes: number;
  demVoteShare: number;
  repVoteShare: number;
  tossupVoteShare: number;
}

export type ResearchLayerId =
  | "district-outlines"
  | "district-heat"
  | "plan-overlays"
  | "coi-overlays"
  | "ensemble-summary"
  | "census-blocks"
  | "vra-opportunity";

export type ResearchLayerStatus = "available" | "planned";

export interface ResearchLayerConfig {
  id: ResearchLayerId;
  label: string;
  group: "Plans" | "Communities" | "Statistics" | "Legal";
  status: ResearchLayerStatus;
  description: string;
  reason?: string;
}

export interface ResearchLayerView extends ResearchLayerConfig {
  enabled: boolean;
  disabled: boolean;
}

export interface ResearchLayerGroupView {
  group: ResearchLayerConfig["group"];
  layers: ResearchLayerView[];
  availableCount: number;
  enabledCount: number;
}

export interface ResearchLayerProvenance {
  title: string;
  source: string;
  method: string;
  payloadUrl?: string;
  companionPayloadUrl?: string;
  caveats: readonly string[];
}

export interface PlanImportSchema {
  format: "GeoJSON FeatureCollection";
  requiredProperties: readonly string[];
  optionalProperties: readonly string[];
  validationNotes: readonly string[];
}

export type PlanRegistryStatus = "enacted" | "court" | "commission" | "proposed" | "public" | "draft";

export interface PlanRegistryEntry {
  id: string;
  name: string;
  source: string;
  cycle: string;
  url: string;
  status: PlanRegistryStatus;
  description?: string;
  caveats?: readonly string[];
  metadata?: Record<string, string | number | boolean>;
}

export interface PlanRegistry {
  schemaVersion: 1;
  plans: readonly PlanRegistryEntry[];
}

export interface PlanFeatureCollectionSummary {
  featureCount: number;
  districtCount: number;
  totalPopulation: number;
}

export type EnsembleSummaryStatus = "mock" | "draft" | "published";

export type EnsembleUnitKeyType = "district" | "precinct" | "h3";

export type EnsemblePercentileBand =
  | "low_outlier"
  | "low_edge"
  | "typical"
  | "high_edge"
  | "high_outlier";

export interface EnsembleConstraint {
  id: string;
  description: string;
}

export interface EnsembleMethod {
  generator: string;
  algorithm: string;
  planCount: number;
  seed?: string;
  constraints: readonly EnsembleConstraint[];
  sourceUrl?: string;
  citation?: string;
}

export interface EnsemblePercentiles {
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface EnsembleComparedPlan {
  planId: string;
  value: number;
  percentile: number;
}

export interface EnsembleHistogramBin {
  value: number;
  planCount: number;
}

export interface EnsembleSeatMeasure {
  measureId: string;
  label: string;
  definition: string;
  histogram: readonly EnsembleHistogramBin[];
  comparedPlans: readonly EnsembleComparedPlan[];
}

export interface EnsembleUnitSummary {
  unitId: string;
  percentiles: EnsemblePercentiles;
  comparedValue: number;
  comparedPercentile: number;
}

export interface EnsembleUnitMeasure {
  measureId: string;
  label: string;
  definition: string;
  unitKeyType: EnsembleUnitKeyType;
  referencePlanId: string;
  h3Resolution?: number;
  units: readonly EnsembleUnitSummary[];
}

export interface EnsembleSummary {
  schemaVersion: 1;
  id: string;
  title: string;
  status: EnsembleSummaryStatus;
  jurisdiction: string;
  office: string;
  generatedAt: string;
  method: EnsembleMethod;
  mockCaveat?: string;
  seatMeasure: EnsembleSeatMeasure;
  unitMeasures: readonly EnsembleUnitMeasure[];
  caveats: readonly string[];
}

export interface EnsembleRegistryEntry {
  id: string;
  name: string;
  source: string;
  url: string;
  status: EnsembleSummaryStatus;
  description?: string;
  caveats?: readonly string[];
  metadata?: Record<string, string | number | boolean>;
}

export interface EnsembleRegistry {
  schemaVersion: 1;
  ensembles: readonly EnsembleRegistryEntry[];
}

export interface EnsembleImportSchema {
  format: "Ensemble summary JSON";
  requiredProperties: readonly string[];
  optionalProperties: readonly string[];
  validationNotes: readonly string[];
}

export interface EnsembleOutlierGate {
  allowed: boolean;
  blockers: readonly string[];
}

export interface EnsembleBandStyle {
  label: string;
  color: string;
}

export type CoiStatus = "sample" | "draft" | "published";

export interface CoiSubmitter {
  name: string;
  /** "synthetic" marks generated fixtures; the fracture gate always blocks them. */
  type: "individual" | "organization" | "portal" | "synthetic";
  affiliation?: string;
}

export interface CoiSource {
  description: string;
  /** ISO date the COI was collected or submitted. */
  collectedAt: string;
  /** How the polygon was drawn: portal tool, digitized testimony, shapefile, etc. */
  method: string;
  url?: string;
}

export interface CoiFractureSegment {
  districtId: string;
  population: number;
  populationShare: number;
}

export interface CoiPlanFracture {
  planId: string;
  districtsTouched: number;
  largestShare: number;
  segments: readonly CoiFractureSegment[];
}

export interface CoiFracture {
  h3Resolution: number;
  cellCount: number;
  population: number;
  claimTag: string;
  plans: readonly CoiPlanFracture[];
}

export interface CoiSummary {
  schemaVersion: 1;
  id: string;
  name: string;
  status: CoiStatus;
  jurisdiction: string;
  submitter: CoiSubmitter;
  source: CoiSource;
  /** The community's own story — why these people belong together. Never scored. */
  narrative: string;
  sampleCaveat?: string;
  geometry: GeoJSON.Feature;
  fracture: CoiFracture;
  caveats: readonly string[];
}

export interface CoiRegistryEntry {
  id: string;
  name: string;
  url: string;
  status: CoiStatus;
  submitter: CoiSubmitter;
  source: CoiSource;
  description?: string;
  caveats?: readonly string[];
}

export interface CoiRegistry {
  schemaVersion: 1;
  cois: readonly CoiRegistryEntry[];
}

export interface CoiFractureGate {
  allowed: boolean;
  blockers: readonly string[];
}

/** Overlay color for COI polygons — amber, distinct from ensemble bands and plan colors. */
export const COI_OVERLAY_COLOR = "#f59e0b";

export const ENSEMBLE_BAND_STYLES: Record<EnsemblePercentileBand, EnsembleBandStyle> = {
  low_outlier: { label: "Low outlier (<5th pct)", color: "#a855f7" },
  low_edge: { label: "Low edge (5th–25th)", color: "#c4b5fd" },
  typical: { label: "Typical (25th–75th)", color: "#71717a" },
  high_edge: { label: "High edge (75th–95th)", color: "#5eead4" },
  high_outlier: { label: "High outlier (>95th pct)", color: "#14b8a6" },
};

export interface PlanComparisonPoint {
  lat: number;
  lng: number;
}

export interface PlanPointComparison {
  selectedPointCount: number;
  matchedPointCount: number;
  unmatchedPointCount: number;
  districtCount: number;
  districtIds: string[];
}

export interface ExpertReviewPacket {
  title: string;
  reviewStance: string;
  readyForReview: readonly string[];
  knownLimits: readonly string[];
  reviewQuestions: readonly string[];
  recommendedNextObjective: string;
}

export type ViewPresetId =
  | "vote-map"
  | "population-demographics"
  | "plan-compare"
  | "starter-regions"
  | "method-provenance";

export interface ViewPreset {
  id: ViewPresetId;
  label: string;
  eyebrow: string;
  dataset: DatasetId;
  metric: VoteMetric;
  summary: string;
  sidekickPrompt: string;
}

export interface ViewPresetTransition {
  opensDataPanel: boolean;
  opensStarterPanel: boolean;
  opensSidekickPanel: boolean;
  clearsActiveStarter: boolean;
  clearsMapFocus: boolean;
}

export interface ExpertReviewObjective {
  id: string;
  prompt: string;
  objective: string;
  definitionOfSuccess: readonly string[];
  roadblocks: readonly string[];
  nextArtifact: string;
}

export const RESEARCH_LAYERS: readonly ResearchLayerConfig[] = [
  {
    id: "district-outlines",
    label: "District outlines",
    group: "Plans",
    status: "available",
    description: "118th Congressional district boundaries.",
  },
  {
    id: "district-heat",
    label: "District heat fill",
    group: "Plans",
    status: "available",
    description: "County-derived 2020 presidential vote signal inside enacted districts.",
  },
  {
    id: "plan-overlays",
    label: "Plan imports",
    group: "Plans",
    status: "available",
    description: "Local registry for enacted, court, commission, proposed, and Districtr-exported plans.",
  },
  {
    id: "coi-overlays",
    label: "COI overlays",
    group: "Communities",
    status: "available",
    description: "Community-of-interest polygons from the local COI registry, drawn as context with submitter and source provenance. Fracture readouts stay gated until a payload has real provenance.",
  },
  {
    id: "ensemble-summary",
    label: "Ensemble summaries",
    group: "Statistics",
    status: "available",
    description: "Percentile bands from the registered ensemble summary, keyed by district and H3 cell. Current payload: ALARM NC congressional ensemble (draft status, documented constraints); the mock remains as a schema fixture.",
  },
  {
    id: "census-blocks",
    label: "Census blocks",
    group: "Statistics",
    status: "planned",
    description: "PL 94-171 block population and demographic aggregation into H3 cells.",
    reason: "Census block ingestion is planned",
  },
  {
    id: "vra-opportunity",
    label: "VRA opportunity",
    group: "Legal",
    status: "planned",
    description: "Protected-class population and election-performance indicators.",
    reason: "VRA analysis layer is planned",
  },
] as const;

export const PLAN_IMPORT_SCHEMA: PlanImportSchema = {
  format: "GeoJSON FeatureCollection",
  requiredProperties: ["plan_id", "district_id", "GEOID", "name", "source", "cycle"],
  optionalProperties: [
    "url",
    "description",
    "sponsor",
    "status",
    "submitted_at",
    "population",
    "dem_votes",
    "rep_votes",
    "metadata",
  ],
  validationNotes: [
    "Each district feature must be a Polygon or MultiPolygon geometry.",
    "GEOID may mirror district_id when a source already uses Census-style district identifiers.",
    "All features sharing a plan_id should cover one complete plan for the selected jurisdiction.",
    "district_id values should be stable strings so district colors and comparisons do not shift between sessions.",
    "source and cycle should preserve provenance, such as enacted 2022, court proposed, commission draft, or user upload.",
  ],
};

export const ENSEMBLE_IMPORT_SCHEMA: EnsembleImportSchema = {
  format: "Ensemble summary JSON",
  requiredProperties: [
    "id",
    "title",
    "status",
    "jurisdiction",
    "office",
    "method.generator",
    "method.algorithm",
    "method.planCount",
    "method.constraints",
    "seatMeasure",
    "unitMeasures",
    "caveats",
  ],
  optionalProperties: [
    "method.seed",
    "method.sourceUrl",
    "method.citation",
    "mockCaveat",
    "unitMeasures[].h3Resolution",
  ],
  validationNotes: [
    "status must be mock, draft, or published; mock payloads exist for schema and UI validation and must never be cited.",
    "method.constraints documents the comparison universe (population deviation, contiguity, county splits, VRA handling); outlier displays are gated on it being non-empty.",
    "seatMeasure.histogram planCount values must sum to method.planCount.",
    "unitMeasures are keyed by district, precinct, or h3; district-keyed measures index units by the referencePlanId plan's district ids, and h3-keyed measures must set h3Resolution.",
    "comparedPlans and referencePlanId values must reference ids in the plan registry so ensemble positions attach to known plan provenance.",
    "percentiles must be monotonic (p5 <= p25 <= p50 <= p75 <= p95); comparedPercentile is the compared plan's position (0-100) within the ensemble distribution.",
    "Adapters normalizing ALARM (redist SMC) or GerryChain (ReCom) outputs should emit this shape rather than tool-native files.",
  ],
};

export const RESEARCH_LAYER_PROVENANCE: Record<ResearchLayerId, ResearchLayerProvenance> = {
  "district-outlines": {
    title: "Enacted congressional district outlines",
    source: "U.S. Census Bureau congressional district relationship/cartographic data for the 118th Congress.",
    method: "Enacted district GeoJSON is drawn as an outline above the neutral H3 and election layers.",
    payloadUrl: "/data/congressional-districts-2022.json",
    caveats: [
      "Boundaries represent the 118th Congress district geography and should be refreshed for later cycles.",
      "The overlay is a visual reference layer, not a full plan-compliance report.",
    ],
  },
  "district-heat": {
    title: "District heat fill",
    source: "Derived from Census district boundaries and county-level 2020 presidential returns.",
    method: "County records are assigned to districts by county centroid, then summarized into a district-level vote signal.",
    payloadUrl: "/data/districts-votes-2020.json",
    companionPayloadUrl: "/data/congressional-districts-2022.json",
    caveats: [
      "County-derived heat fill: useful for orientation, but not precinct-to-district aggregation or court-grade evidence.",
      "Split counties are approximated by centroid assignment until precinct or block election data is joined to district geometry.",
    ],
  },
  "plan-overlays": {
    title: "Plan imports",
    source: "Local public-data registry for court, commission, proposed, enacted, and Districtr-exported plans.",
    method: "Candidate plans enter as GeoJSON FeatureCollections using the published plan import schema.",
    payloadUrl: "/data/plans/registry.json",
    caveats: [
      "This first path is a local/public-data registry, not browser upload.",
      "Uploaded plans will need geometry validation and topology checks before being compared as research evidence.",
    ],
  },
  "coi-overlays": {
    title: "Community-of-interest overlays",
    source: "Local COI registry: public COI submissions, civic geographies, and partner datasets with submitter/source metadata.",
    method: "COI polygons render as optional context layers. Fracture readouts count district touches per plan via H3 cell-center assignment and stay gated for sample payloads or missing provenance.",
    payloadUrl: "/data/cois/registry.json",
    caveats: [
      "COI data often has subjective boundaries and uneven provenance.",
      "The layer preserves submitter/source metadata instead of flattening every COI into one authority, and never contributes to a composite score.",
    ],
  },
  "ensemble-summary": {
    title: "Ensemble summary overlays",
    source: "Ensemble registry at /data/ensembles/registry.json; the primary payload normalizes the ALARM Project's NC 2020 congressional simulations (Harvard Dataverse doi:10.7910/DVN/SLCD3E, CC0). A fabricated mock payload remains registered as a gate-blocked test fixture.",
    method: "Ensemble statistics attach to H3 cells, precincts, or districts as percentile and outlier indicators, gated on documented generation constraints.",
    caveats: [
      "No ensemble generation pipeline is bundled; the adapter normalizes published ALARM outputs, and the ALARM payload ships as a draft pending expert review.",
      "The mock payload contains fabricated numbers for UI validation and must never be cited; the outlier gate blocks it.",
      "Ensemble interpretation depends heavily on the constraints used to generate comparison plans.",
    ],
  },
  "census-blocks": {
    title: "Census block statistics",
    source: "Census 2020 PL 94-171 block data aggregated into H3 cells.",
    method: "Block-level population records are assigned to H3 cells and exposed as population-safe metrics.",
    caveats: [
      "The current prototype uses block internal points, not polygon apportionment.",
      "CVAP and election-performance fields are not included yet.",
    ],
  },
  "vra-opportunity": {
    title: "VRA opportunity analysis",
    source: "Planned CVAP, demographic, election-performance, and legally reviewed opportunity-district inputs.",
    method: "Future scoring should combine protected-class population, election performance, compactness, and district/COI overlays.",
    caveats: [
      "This is not a legal conclusion layer.",
      "A serious VRA workflow needs data provenance, racially polarized voting evidence, and jurisdiction-specific review.",
    ],
  },
};

function datasetConfig(dataset: DatasetId): DatasetConfig {
  return DATASETS.find((d) => d.id === dataset) ?? DATASETS[0];
}

export function getCaseStudy(caseStudyId: string = DEFAULT_CASE_STUDY_ID): CaseStudyConfig {
  return CASE_STUDIES.find((study) => study.id === caseStudyId) ?? CASE_STUDIES[0];
}

export function getViewPreset(presetId: string = DEFAULT_VIEW_PRESET_ID): ViewPreset {
  return VIEW_PRESETS.find((preset) => preset.id === presetId) ?? VIEW_PRESETS[0];
}

export function getViewPresetTransition(presetId: string = DEFAULT_VIEW_PRESET_ID): ViewPresetTransition {
  switch (getViewPreset(presetId).id) {
    case "starter-regions":
      return {
        opensDataPanel: false,
        opensStarterPanel: true,
        opensSidekickPanel: false,
        clearsActiveStarter: false,
        clearsMapFocus: false,
      };
    case "method-provenance":
      return {
        opensDataPanel: true,
        opensStarterPanel: false,
        opensSidekickPanel: false,
        clearsActiveStarter: true,
        clearsMapFocus: true,
      };
    case "vote-map":
    case "population-demographics":
    case "plan-compare":
    default:
      return {
        opensDataPanel: false,
        opensStarterPanel: false,
        opensSidekickPanel: false,
        clearsActiveStarter: true,
        clearsMapFocus: true,
      };
  }
}

export function getHoneycombMapInstanceKey(caseStudyId: string, dataset: DatasetId): string {
  return `${caseStudyId}-${dataset}`;
}

export function getDatasetModeGuide(dataset: DatasetId): DatasetModeGuide {
  return DATASET_MODE_GUIDES[dataset];
}

export function getDisplayYear(dataset: DatasetId, requestedYear: number): ElectionYear {
  const config = datasetConfig(dataset);
  return config.availableYears.includes(requestedYear as ElectionYear)
    ? requestedYear as ElectionYear
    : config.availableYears[0];
}

export function getDatasetUrl(
  dataset: DatasetId,
  requestedYear: number,
  caseStudyId: string = DEFAULT_CASE_STUDY_ID,
): string {
  const displayYear = getDisplayYear(dataset, requestedYear);
  const caseStudy = getCaseStudy(caseStudyId);
  if (dataset === "blocks") return `/derived-data/census-h3/census-blocks-${caseStudy.stateFips}-r7-${displayYear}.json`;
  if (dataset === "precincts") return `/data/precincts-${caseStudy.statePostal.toLowerCase()}-${displayYear}.json`;
  return `/data/counties-${caseStudy.statePostal.toLowerCase()}-${displayYear}.json`;
}

export function getDatasetManifestUrl(
  dataset: DatasetId,
  requestedYear: number,
  caseStudyId: string = DEFAULT_CASE_STUDY_ID,
): string | undefined {
  const displayYear = getDisplayYear(dataset, requestedYear);
  const caseStudy = getCaseStudy(caseStudyId);
  if (dataset !== "blocks") return undefined;
  return `/derived-data/census-h3/census-blocks-${caseStudy.stateFips}-r7-${displayYear}.manifest.json`;
}

export function getDatasetProvenance(
  dataset: DatasetId,
  requestedYear: number,
  caseStudyId: string = DEFAULT_CASE_STUDY_ID,
): DatasetProvenance {
  const displayYear = getDisplayYear(dataset, requestedYear);
  const caseStudy = getCaseStudy(caseStudyId);
  const payloadUrl = getDatasetUrl(dataset, requestedYear, caseStudyId);
  const manifestUrl = getDatasetManifestUrl(dataset, requestedYear, caseStudyId);

  if (dataset === "blocks") {
    return {
      title: `${caseStudy.label} Census block-derived H3 layer`,
      source: "Census 2020 PL 94-171 API joined to TIGER/Line 2020 tabulation block internal points.",
      method: "Raw Census block internal points assigned to H3 resolution 7 cells; population and demographic fields are summed by H3 cell.",
      payloadUrl,
      manifestUrl,
      h3Resolution: 7,
      caveats: [
        "Prototype uses block internal points, not polygon apportionment.",
        "Population and demographic totals are suitable for diagnostic display, not a court-grade district plan by themselves.",
        "Citizen voting-age population and racially polarized voting analysis are not included yet.",
      ],
    };
  }

  if (dataset === "precincts") {
    return {
      title: `${caseStudy.label} VEST precinct centroid layer`,
      source: "VEST 2020 precinct election returns and boundaries, converted to centroid point records for the current prototype.",
      method: "Precinct records are loaded as points; H3 aggregation happens in the browser at the selected resolution.",
      payloadUrl,
      caveats: [
        "Centroid assignment is a prototype shortcut and does not apportion precinct polygons across H3 cells.",
        "Election returns are 2020 presidential two-party signals, not full candidate or turnout history.",
      ],
    };
  }

  return {
    title: `${caseStudy.label} county presidential layer`,
    source: `MIT Election Data and Science Lab county presidential returns, ${displayYear}.`,
    method: "County records are loaded as centroid point records; H3 aggregation happens in the browser at the selected resolution.",
    payloadUrl,
    caveats: [
      "County centroids are coarse and can blur urban/suburban detail.",
      "This layer is useful for broad comparisons, not block-level population or precinct-level election analysis.",
    ],
  };
}

export function getResearchLayerProvenance(layerId: ResearchLayerId): ResearchLayerProvenance {
  return RESEARCH_LAYER_PROVENANCE[layerId];
}

export function getPlanImportSchema(): PlanImportSchema {
  return PLAN_IMPORT_SCHEMA;
}

export function getPlanRegistryUrl(): string {
  return "/data/plans/registry.json";
}

export function getCaseStudyPacketUrl(caseStudyId: CaseStudyId = DEFAULT_CASE_STUDY_ID): string {
  if (caseStudyId === "nc") return "/data/case-studies/nc-starter-pack.json";
  return "/data/case-studies/nc-starter-pack.json";
}

export function getNamedSelectionsPacketUrl(caseStudyId: CaseStudyId = DEFAULT_CASE_STUDY_ID): string {
  if (caseStudyId === "nc") return "/data/case-studies/nc-named-selections.json";
  return "/data/case-studies/nc-named-selections.json";
}

export function getEnsembleRegistryUrl(): string {
  return "/data/ensembles/registry.json";
}

export function getEnsembleImportSchema(): EnsembleImportSchema {
  return ENSEMBLE_IMPORT_SCHEMA;
}

export function classifyEnsemblePercentile(percentile: number): EnsemblePercentileBand {
  if (percentile < 5) return "low_outlier";
  if (percentile < 25) return "low_edge";
  if (percentile <= 75) return "typical";
  if (percentile <= 95) return "high_edge";
  return "high_outlier";
}

export function getEnsembleOutlierGate(
  summary: Pick<EnsembleSummary, "status" | "method">,
): EnsembleOutlierGate {
  const blockers: string[] = [];

  if (summary.status === "mock") {
    blockers.push("Mock payload for schema and UI validation; every number is fabricated and must not be cited.");
  }
  if (summary.method.constraints.length === 0) {
    blockers.push("Ensemble generation constraints are undocumented, so there is no defined comparison universe for an outlier claim.");
  }
  if (summary.method.planCount <= 0) {
    blockers.push("Ensemble reports no plans, so percentile positions are undefined.");
  }

  return { allowed: blockers.length === 0, blockers };
}

export function getCoiRegistryUrl(): string {
  return "/data/cois/registry.json";
}

export function getCoiFractureGate(
  coi: Pick<CoiSummary, "status" | "submitter" | "source">,
): CoiFractureGate {
  const blockers: string[] = [];

  if (coi.status === "sample") {
    blockers.push("Sample payload for schema and UI validation; the geometry is fictional and fracture numbers must not be cited.");
  }
  if (!coi.submitter?.name || coi.submitter.type === "synthetic") {
    blockers.push("No real submitter of record; a community of interest without a submitter is not reviewable.");
  }
  if (!coi.source?.description || !coi.source?.collectedAt) {
    blockers.push("Collection provenance (source and date) is missing, so the polygon's origin cannot be audited.");
  }

  return { allowed: blockers.length === 0, blockers };
}

export function getExpertReviewPacket(): ExpertReviewPacket {
  return {
    title: "Expert review packet",
    reviewStance: "Honeycombing is ready for diagnostic review: evaluate it as a visual audit and comparison workflow, not as a legal conclusion engine or replacement districting algorithm.",
    readyForReview: [
      "North Carolina default case study with Census 2020 block-derived H3 population and demographic cells.",
      "Block, precinct, and county granularity controls with dataset-specific metric options.",
      "Plan comparison panel for local registry overlays, including metadata, district count, population total, and selected-H3 center coverage.",
      "Documented plan import schema for normalized GeoJSON FeatureCollections with stable plan and district identifiers.",
      "Data provenance panel exposing source, method, payload, manifest, and caveats for app-facing datasets.",
      "Named-selection case study for Charlotte/Mecklenburg and the Eastern Black Belt with claim-tagged court-vs-enacted boundary deltas and deviation ledger seeds.",
    ],
    knownLimits: [
      "Block and precinct assignments currently use internal points or centroids rather than polygon-to-H3 apportionment.",
      "District heat fill remains county-derived and should not be treated as precinct-to-district aggregation.",
      "No CVAP, racially polarized voting, candidate-of-choice, or formal VRA opportunity analysis is included yet.",
      "The ensemble payload is a draft (ALARM NC) pending expert review; the COI registry carries only a gated fictional sample; topology-validation and uploaded-plan workflows are planned but not implemented.",
      "The diagnostic score is not formalized; current outputs are visual and descriptive rather than statistically validated findings.",
    ],
    reviewQuestions: [
      "Is the plan import schema adequate for court, commission, enacted, proposed, and Districtr-style plans?",
      "Which caveats must be more prominent before sharing with redistricting lawyers or expert reviewers?",
      "Should the next evidence upgrade prioritize precinct-to-district aggregation, COI overlays, or NC case-study stats?",
      "Which external datasets or institutional standards should the project align with first?",
    ],
    recommendedNextObjective: "First real COI payload (RDH/Representable) and the VRA boundary ledger prototype",
  };
}

function getPlanDistrictId(feature: GeoJSON.Feature): string | undefined {
  const properties = feature.properties ?? {};
  const districtId = properties.district_id ?? properties.GEOID ?? properties.DISTRICT;
  return districtId === undefined || districtId === null ? undefined : String(districtId);
}

function getPlanPopulation(feature: GeoJSON.Feature): number {
  const population = feature.properties?.population ?? feature.properties?.PL20AA_TOT;
  const numeric = Number(population);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function summarizePlanFeatureCollection(
  plan: GeoJSON.FeatureCollection,
): PlanFeatureCollectionSummary {
  const districtIds = new Set<string>();
  let totalPopulation = 0;

  for (const feature of plan.features) {
    const districtId = getPlanDistrictId(feature);
    if (districtId) districtIds.add(districtId);
    totalPopulation += getPlanPopulation(feature);
  }

  return {
    featureCount: plan.features.length,
    districtCount: districtIds.size,
    totalPopulation,
  };
}

function pointInRing(lng: number, lat: number, ring: GeoJSON.Position[]): boolean {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i][0]);
    const yi = Number(ring[i][1]);
    const xj = Number(ring[j][0]);
    const yj = Number(ring[j][1]);

    const intersects = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygonCoordinates(
  lng: number,
  lat: number,
  coordinates: GeoJSON.Position[][],
): boolean {
  const [outerRing, ...holes] = coordinates;
  if (!outerRing || !pointInRing(lng, lat, outerRing)) return false;
  return !holes.some((hole) => pointInRing(lng, lat, hole));
}

function featureContainsPoint(feature: GeoJSON.Feature, point: PlanComparisonPoint): boolean {
  const geometry = feature.geometry;
  if (!geometry) return false;

  if (geometry.type === "Polygon") {
    return pointInPolygonCoordinates(point.lng, point.lat, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygonCoordinates(point.lng, point.lat, polygon));
  }

  return false;
}

export function comparePlanToPoints(
  plan: GeoJSON.FeatureCollection,
  points: readonly PlanComparisonPoint[],
): PlanPointComparison {
  const districtIds = new Set<string>();
  let matchedPointCount = 0;

  for (const point of points) {
    const matchingFeature = plan.features.find((feature) => featureContainsPoint(feature, point));
    if (!matchingFeature) continue;

    matchedPointCount++;
    const districtId = getPlanDistrictId(matchingFeature);
    if (districtId) districtIds.add(districtId);
  }

  return {
    selectedPointCount: points.length,
    matchedPointCount,
    unmatchedPointCount: points.length - matchedPointCount,
    districtCount: districtIds.size,
    districtIds: Array.from(districtIds).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  };
}

export function assignPointsToPlanDistricts(
  plan: GeoJSON.FeatureCollection,
  points: readonly PlanComparisonPoint[],
): (string | null)[] {
  return points.map((point) => {
    const matchingFeature = plan.features.find((feature) => featureContainsPoint(feature, point));
    return matchingFeature ? getPlanDistrictId(matchingFeature) ?? null : null;
  });
}

export function getExpertReviewObjectives(): readonly ExpertReviewObjective[] {
  return [
    {
      id: "centroid-shortcut-audit",
      prompt: "How different are Honeycombing's conclusions when precinct and block centroids are replaced with polygon-to-H3 apportionment?",
      objective: "Quantify whether the current centroid/internal-point shortcut is directionally reliable enough for diagnostic use, and identify where it breaks down.",
      definitionOfSuccess: [
        "Run the same NC H3 summaries with centroid assignment and polygon-to-H3 apportionment for at least one county or named region.",
        "Report population, vote-share, and H3-cell assignment deltas with explicit thresholds for acceptable diagnostic drift.",
        "Classify each difference as harmless for visual exploration, material for statistics, or disqualifying for legal evidence.",
      ],
      roadblocks: [
        "Precinct and block polygons are large and may require topology repair before intersection.",
        "Polygon apportionment needs area weighting or population-aware allocation, not just geometry overlap.",
        "Runtime and browser payload size can grow quickly if raw geometries leak into the app bundle.",
      ],
      nextArtifact: "A centroid-vs-polygon audit table for one NC county and one urban/suburban region.",
    },
    {
      id: "nc-asymmetry-decomposition",
      prompt: "How much of North Carolina's district signal is explained by political geography versus enacted boundary choices?",
      objective: "Separate the visible NC asymmetry into natural concentration, legally required choices, and map-drawing choices that deserve closer review.",
      definitionOfSuccess: [
        "Compare statewide vote signal, H3 vote concentration, enacted district signal, and NC court-plan signal in one packet.",
        "Identify which districts or regions are competitive, packed, or cracked under the current diagnostic lens.",
        "Label every claim as descriptive, ensemble-dependent, or requiring legal/election-expert validation.",
      ],
      roadblocks: [
        "Current district heat is county-derived and must not be treated as precinct-to-district aggregation.",
        "Presidential vote is only a partisan proxy and does not replace congressional or legislative election returns.",
        "Without ensembles, the tool cannot yet say what neutral-but-lawful plans usually do.",
      ],
      nextArtifact: "Named NC starter selections with per-region population, precinct signal, enacted-plan, and court-plan comparison stats.",
    },
    {
      id: "h3-ensemble-explainer",
      prompt: "Can ensemble outlier regions be projected onto H3 cells so non-expert reviewers can see where enacted maps depart from simulated plan families?",
      objective: "Use H3 as an explainer layer for ensemble outputs without weakening the statistical meaning of the ensemble itself.",
      definitionOfSuccess: [
        "Define an import schema for ensemble summaries keyed by H3 cell, precinct, or district identifier.",
        "Render percentile/outlier indicators as a toggleable layer separate from vote, population, COI, and VRA layers.",
        "Document which ensemble constraints generated the comparison universe before displaying any outlier claim.",
      ],
      roadblocks: [
        "Ensemble outputs are constraint-sensitive and can be misread if generation rules are hidden.",
        "Different ensemble tools may emit district-level, precinct-level, or raster-like summaries that need normalization.",
        "Visual simplification can make statistically conditional claims look absolute.",
      ],
      nextArtifact: "Render percentile bands from the mocked NC payload as a toggleable layer behind the outlier gate, then swap in a real ALARM or GerryChain NC ensemble.",
    },
    {
      id: "coi-fracture-prompt",
      prompt: "Where do enacted or proposed plans split public communities of interest, and do those splits line up with H3 vote or demographic clusters?",
      objective: "Make community-of-interest claims inspectable by preserving source metadata and comparing COI polygons against H3, plans, and demographic layers.",
      definitionOfSuccess: [
        "Define a COI GeoJSON registry schema with submitter/source, date, geography type, and caveat metadata.",
        "Show COI overlays as toggleable context without merging them into a single authority score.",
        "For a selected COI, report intersecting plans/districts and H3 demographic or vote-signal summaries.",
      ],
      roadblocks: [
        "COI boundaries are subjective, unevenly sourced, and often created for advocacy contexts.",
        "Public testimony and Districtr-style exports can have inconsistent metadata and geometry quality.",
        "COI preservation may conflict with VRA, compactness, county splits, or partisan-fairness goals.",
      ],
      nextArtifact: "A COI registry skeleton and one NC sample COI layer rendered in the Plans/Communities panel.",
    },
    {
      id: "vra-boundary-ledger",
      prompt: "For each visible deviation from the neutral H3 scaffold, is there a plausible VRA, COI, county/municipal, compactness, or contiguity justification?",
      objective: "Turn deviations from the neutral scaffold into a review ledger that distinguishes lawful justification questions from unsupported distortion claims.",
      definitionOfSuccess: [
        "List each selected-region deviation with the possible legal or civic justification category it implicates.",
        "Clearly separate demographic screens from VRA conclusions requiring CVAP, RPV, and candidate-of-choice analysis.",
        "Provide a reviewer-facing status for every item: explained, unresolved, needs data, or outside Honeycombing's current scope.",
      ],
      roadblocks: [
        "VRA review requires CVAP, racially polarized voting evidence, election history, and jurisdiction-specific legal analysis.",
        "Some justified boundaries may look visually irregular on an H3 scaffold.",
        "The tool must avoid implying legal conclusions from population composition alone.",
      ],
      nextArtifact: "A deviation-ledger prototype for one NC selection with fields for VRA, COI, county, municipal, compactness, and contiguity notes.",
    },
    {
      id: "single-metric-skepticism",
      prompt: "Can Honeycombing avoid becoming one more gameable metric by presenting a bundle of diagnostics instead of a pass/fail score?",
      objective: "Keep Honeycombing credible by designing its scoring surface as a multi-signal diagnostic report rather than a single dispositive number.",
      definitionOfSuccess: [
        "Define a dashboard vocabulary that separates population, vote signal, plan coverage, COI, ensemble, and VRA-adjacent evidence.",
        "Prevent any one metric from being labeled as a legal conclusion or fairness verdict.",
        "Document how conflicting signals should be displayed instead of averaged away.",
      ],
      roadblocks: [
        "Stakeholders prefer simple scores, even when simple scores hide assumptions.",
        "Metrics can be gamed when mapmakers optimize against one visible target.",
        "Too many diagnostics can overwhelm reviewers unless grouped into a clear narrative workflow.",
      ],
      nextArtifact: "A diagnostic-report wireframe showing a bundle of signals and explicit caveats for one NC named selection.",
    },
  ];
}

export function getDatasetNote(dataset: DatasetId): string {
  return datasetConfig(dataset).note;
}

export function getDatasetKind(dataset: DatasetId): DatasetKind {
  return datasetConfig(dataset).kind;
}

export function getDatasetUnitLabel(dataset: DatasetId): string {
  return datasetConfig(dataset).unitLabel;
}

export function buildDatasetStatus(
  datasets: typeof DATASETS,
  years: readonly ElectionYear[],
  dataset: DatasetId,
  requestedYear: number,
): DatasetYearStatus[] {
  const active = datasets.find((d) => d.id === dataset) ?? datasets[0];
  const displayYear = getDisplayYear(dataset, requestedYear);

  return years.map((year) => {
    const disabled = !active.availableYears.includes(year);
    return {
      year,
      label: String(year),
      selected: year === displayYear,
      disabled,
      reason: disabled ? `${active.label} currently has ${active.availableYears.join(", ")} data only` : undefined,
    };
  });
}

export function buildLayerStatus(
  layers: readonly ResearchLayerConfig[],
  activeLayerIds: readonly string[],
): ResearchLayerView[] {
  const active = new Set(activeLayerIds);

  return layers.map((layer) => {
    const disabled = layer.status !== "available";
    return {
      ...layer,
      disabled,
      enabled: !disabled && active.has(layer.id),
    };
  });
}

export function buildLayerGroups(layers: readonly ResearchLayerView[]): ResearchLayerGroupView[] {
  const groups = new Map<ResearchLayerConfig["group"], ResearchLayerView[]>();

  for (const layer of layers) {
    groups.set(layer.group, [...(groups.get(layer.group) ?? []), layer]);
  }

  return Array.from(groups.entries()).map(([group, groupLayers]) => ({
    group,
    layers: groupLayers,
    availableCount: groupLayers.filter((layer) => !layer.disabled).length,
    enabledCount: groupLayers.filter((layer) => layer.enabled).length,
  }));
}

export function summarizeHexStats(hexes: Iterable<HexSummaryInput>): HexSummary {
  let hexCount = 0;
  let demHexes = 0;
  let repHexes = 0;
  let tossupHexes = 0;
  let totalVotes = 0;
  let demVotes = 0;
  let repVotes = 0;
  let tossupVotes = 0;

  for (const data of hexes) {
    hexCount++;
    totalVotes += data.totalVotes;
    demVotes += data.totalDem;
    repVotes += data.totalRep;

    if (data.totalVotes === 0) {
      tossupHexes++;
      continue;
    }

    const margin = (data.totalDem - data.totalRep) / data.totalVotes;
    if (margin > 0.02) {
      demHexes++;
    } else if (margin < -0.02) {
      repHexes++;
    } else {
      tossupHexes++;
      tossupVotes += data.totalVotes;
    }
  }

  const twoPartyVotes = demVotes + repVotes;

  return {
    hexCount,
    demHexes,
    repHexes,
    tossupHexes,
    totalVotes,
    demVotes,
    repVotes,
    demVoteShare: twoPartyVotes > 0 ? (demVotes / twoPartyVotes) * 100 : 0,
    repVoteShare: twoPartyVotes > 0 ? (repVotes / twoPartyVotes) * 100 : 0,
    tossupVoteShare: totalVotes > 0 ? (tossupVotes / totalVotes) * 100 : 0,
  };
}
