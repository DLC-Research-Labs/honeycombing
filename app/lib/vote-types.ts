// ── Map metric types (shared between components) ──
export type DatasetKind = "population" | "election";
export type VoteMetric =
  | "population"
  | "vap"
  | "black_pct"
  | "hispanic_pct"
  | "nonwhite_pct"
  | "turnout"
  | "dem_pct"
  | "rep_pct"
  | "margin"
  | "competitiveness";

export interface MetricConfig {
  value: VoteMetric;
  label: string;
  desc: string;
}

export const ELECTION_METRICS: MetricConfig[] = [
  { value: "turnout", label: "Turnout", desc: "Total votes cast" },
  { value: "dem_pct", label: "Dem %", desc: "% Democratic" },
  { value: "rep_pct", label: "Rep %", desc: "% Republican" },
  { value: "margin", label: "Margin", desc: "Win margin (+ Dem, − Rep)" },
  { value: "competitiveness", label: "Competitive", desc: "How close the race was" },
];

export const POPULATION_METRICS: MetricConfig[] = [
  { value: "population", label: "Population", desc: "Total population" },
  { value: "vap", label: "VAP", desc: "Voting-age population" },
  { value: "black_pct", label: "Black %", desc: "% Black alone" },
  { value: "hispanic_pct", label: "Hispanic %", desc: "% Hispanic or Latino" },
  { value: "nonwhite_pct", label: "Nonwhite %", desc: "% not non-Hispanic white alone" },
];

export const VOTE_METRICS = ELECTION_METRICS;

export function getMetricOptionsForDatasetKind(kind: DatasetKind): MetricConfig[] {
  return kind === "population" ? POPULATION_METRICS : ELECTION_METRICS;
}

export function getDefaultMetricForDatasetKind(kind: DatasetKind): VoteMetric {
  return kind === "population" ? "population" : "margin";
}

// ── Precinct data shape ──
export interface PrecinctResult {
  lat: number;
  lng: number;
  h3?: string;
  source_count?: number;
  dem_votes?: number;
  rep_votes?: number;
  total_votes?: number;
  precinct_id?: string;
  precinct_name?: string;
  geoid?: string;
  name?: string;
  total_population?: number;
  voting_age_population?: number;
  white_alone?: number;
  black_alone?: number;
  hispanic_or_latino?: number;
  non_hispanic_white_alone?: number;
}
