"use client";

import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { latLngToCell, cellToBoundary, cellToLatLng } from "h3-js";
import { Hexagon, Layers, Settings, Users } from "lucide-react";
import type { DatasetKind, MetricConfig, VoteMetric, PrecinctResult } from "@/app/lib/vote-types";
import { ELECTION_METRICS } from "@/app/lib/vote-types";
import {
  COI_OVERLAY_COLOR,
  ENSEMBLE_BAND_STYLES,
  RESEARCH_LAYERS,
  buildLayerGroups,
  buildLayerStatus,
  classifyEnsemblePercentile,
  comparePlanToPoints,
  getCoiFractureGate,
  getCoiRegistryUrl,
  getEnsembleOutlierGate,
  getEnsembleRegistryUrl,
  getPlanImportSchema,
  getPlanRegistryUrl,
  getResearchLayerProvenance,
  summarizePlanFeatureCollection,
  summarizeHexStats,
  type CoiRegistry,
  type CoiRegistryEntry,
  type CoiSummary,
  type EnsembleRegistry,
  type EnsembleRegistryEntry,
  type EnsembleSummary,
  type PlanRegistry,
  type PlanRegistryEntry,
  type PlanComparisonPoint,
  type PlanPointComparison,
  type ResearchLayerId,
  type ViewPresetId,
} from "@/app/lib/honeycomb-ui-helpers";

export type { VoteMetric, PrecinctResult };

// ── Color scales ──
function marginColor(ratio: number): string {
  const r = Math.min(Math.max(ratio, -1), 1);
  if (r < -0.3) return "#dc2626";
  if (r < -0.1) return "#ef4444";
  if (r < -0.02) return "#f87171";
  if (r <= 0.02) return "#a855f7";
  if (r <= 0.1) return "#60a5fa";
  if (r <= 0.3) return "#3b82f6";
  return "#2563eb";
}

function turnoutColor(ratio: number): string {
  const r = Math.min(Math.max(ratio, 0), 1);
  if (r < 0.2) return "#27272a";
  if (r < 0.4) return "#3f3f46";
  if (r < 0.6) return "#22d3ee";
  if (r < 0.8) return "#06b6d4";
  return "#0891b2";
}

function pctColor(ratio: number, party: "dem" | "rep"): string {
  const r = Math.min(Math.max(ratio, 0), 1);
  if (party === "dem") {
    if (r < 0.2) return "#1e3a5f";
    if (r < 0.4) return "#1e40af";
    if (r < 0.6) return "#2563eb";
    if (r < 0.8) return "#3b82f6";
    return "#60a5fa";
  }
  if (r < 0.2) return "#5f1e1e";
  if (r < 0.4) return "#991b1b";
  if (r < 0.6) return "#dc2626";
  if (r < 0.8) return "#ef4444";
  return "#f87171";
}

function competitivenessColor(ratio: number): string {
  const r = Math.min(Math.max(ratio, 0), 1);
  if (r < 0.2) return "#27272a";
  if (r < 0.4) return "#71717a";
  if (r < 0.6) return "#a855f7";
  if (r < 0.8) return "#c084fc";
  return "#e879f9";
}

function shareColor(ratio: number): string {
  const r = Math.min(Math.max(ratio, 0), 1);
  if (r < 0.2) return "#164e63";
  if (r < 0.4) return "#0e7490";
  if (r < 0.6) return "#14b8a6";
  if (r < 0.8) return "#84cc16";
  return "#eab308";
}

// ── Hex aggregation ──
interface HexAgg {
  count: number;
  totalDem: number;
  totalRep: number;
  totalVotes: number;
  totalPopulation: number;
  votingAgePopulation: number;
  blackPopulation: number;
  hispanicPopulation: number;
  nonHispanicWhitePopulation: number;
  precincts: PrecinctResult[];
}

function computeMetricValue(data: HexAgg, metric: VoteMetric): number {
  switch (metric) {
    case "population":
      return data.totalPopulation;
    case "vap":
      return data.votingAgePopulation;
    case "black_pct":
      return data.totalPopulation > 0 ? (data.blackPopulation / data.totalPopulation) * 100 : 0;
    case "hispanic_pct":
      return data.totalPopulation > 0 ? (data.hispanicPopulation / data.totalPopulation) * 100 : 0;
    case "nonwhite_pct":
      return data.totalPopulation > 0
        ? ((data.totalPopulation - data.nonHispanicWhitePopulation) / data.totalPopulation) * 100
        : 0;
    case "turnout":
      return data.totalVotes;
    case "dem_pct":
      return data.totalVotes > 0 ? (data.totalDem / data.totalVotes) * 100 : 0;
    case "rep_pct":
      return data.totalVotes > 0 ? (data.totalRep / data.totalVotes) * 100 : 0;
    case "margin":
      return data.totalVotes > 0 ? ((data.totalDem - data.totalRep) / data.totalVotes) * 100 : 0;
    case "competitiveness": {
      if (data.totalVotes === 0) return 0;
      const absMargin = Math.abs(data.totalDem - data.totalRep) / data.totalVotes;
      return (1 - absMargin) * 100;
    }
    default:
      return data.totalVotes;
  }
}

function getHexColor(data: HexAgg, metric: VoteMetric, minVal: number, maxVal: number): string {
  const range = maxVal - minVal || 1;
  const value = computeMetricValue(data, metric);

  switch (metric) {
    case "turnout":
      return turnoutColor((value - minVal) / range);
    case "dem_pct":
      return pctColor((value - minVal) / range, "dem");
    case "rep_pct":
      return pctColor((value - minVal) / range, "rep");
    case "margin":
      return marginColor(value / 100);
    case "competitiveness":
      return competitivenessColor((value - minVal) / range);
    case "population":
    case "vap":
      return turnoutColor((value - minVal) / range);
    case "black_pct":
    case "hispanic_pct":
    case "nonwhite_pct":
      return shareColor(value / 100);
    default:
      return "#22d3ee";
  }
}

// ── District vote helpers ──
interface DistrictVoteProps {
  GEOID: string;
  STATEFP: string;
  CD118FP: string;
  name: string;
  dem_votes: number;
  rep_votes: number;
  total_votes: number;
  county_count: number;
}

interface PlanFeatureProps {
  GEOID?: string;
  district_id?: string;
  name?: string;
  plan_id?: string;
  source?: string;
  cycle?: string;
  NAMELSAD?: string;
}

export interface MapFocusBounds {
  south: number;
  west: number;
  north: number;
  east: number;
  nonce: number;
}

const PLAN_COLORS = ["#facc15", "#22d3ee", "#f97316", "#a78bfa", "#34d399", "#fb7185"] as const;

interface ActivePlanComparison {
  id: string;
  name: string;
  source: string;
  cycle: string;
  status: string;
  color: string;
  districtCount: number;
  totalPopulation: number;
  selection: PlanPointComparison | null;
}

function districtToHexAgg(props: DistrictVoteProps): HexAgg {
  return {
    count: props.county_count,
    totalDem: props.dem_votes,
    totalRep: props.rep_votes,
    totalVotes: props.total_votes,
    totalPopulation: 0,
    votingAgePopulation: 0,
    blackPopulation: 0,
    hispanicPopulation: 0,
    nonHispanicWhitePopulation: 0,
    precincts: [],
  };
}

function createEmptyHexAgg(): HexAgg {
  return {
    count: 0,
    totalDem: 0,
    totalRep: 0,
    totalVotes: 0,
    totalPopulation: 0,
    votingAgePopulation: 0,
    blackPopulation: 0,
    hispanicPopulation: 0,
    nonHispanicWhitePopulation: 0,
    precincts: [],
  };
}

function addRecordToAgg(agg: HexAgg, record: PrecinctResult) {
  const demVotes = record.dem_votes ?? 0;
  const repVotes = record.rep_votes ?? 0;
  const totalVotes = record.total_votes ?? demVotes + repVotes;
  const totalPopulation = record.total_population ?? totalVotes;

  agg.count += record.source_count ?? 1;
  agg.totalDem += demVotes;
  agg.totalRep += repVotes;
  agg.totalVotes += totalVotes;
  agg.totalPopulation += totalPopulation;
  agg.votingAgePopulation += record.voting_age_population ?? 0;
  agg.blackPopulation += record.black_alone ?? 0;
  agg.hispanicPopulation += record.hispanic_or_latino ?? 0;
  agg.nonHispanicWhitePopulation += record.non_hispanic_white_alone ?? 0;
  agg.precincts.push(record);
}

function summarizePopulationHexes(hexes: Iterable<HexAgg>) {
  let totalPopulation = 0;
  let votingAgePopulation = 0;
  let blackPopulation = 0;
  let hispanicPopulation = 0;
  let nonwhitePopulation = 0;

  for (const data of hexes) {
    totalPopulation += data.totalPopulation;
    votingAgePopulation += data.votingAgePopulation;
    blackPopulation += data.blackPopulation;
    hispanicPopulation += data.hispanicPopulation;
    nonwhitePopulation += Math.max(data.totalPopulation - data.nonHispanicWhitePopulation, 0);
  }

  return {
    totalPopulation,
    votingAgePopulation,
    blackPopulation,
    hispanicPopulation,
    nonwhitePopulation,
  };
}

function percent(part: number, total: number): string {
  return total > 0 ? ((part / total) * 100).toFixed(1) : "0.0";
}

// ── Types ──
type LayerAMode = "hex3" | "hex4" | "hex5" | "counties";

const LAYER_A_OPTIONS: { value: LayerAMode; label: string; hint?: string; disabled?: boolean }[] = [
  { value: "hex3", label: "H3 res 3" },
  { value: "hex4", label: "H3 res 4", hint: "default" },
  { value: "hex5", label: "H3 res 5" },
  { value: "counties", label: "Counties", hint: "soon", disabled: true },
];

// ── Component ──
export interface HexStats {
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
  totalPopulation: number;
  votingAgePopulation: number;
  blackPopulation: number;
  hispanicPopulation: number;
  nonwhitePopulation: number;
  dataKind: DatasetKind;
  unitLabel: string;
  res: number;
  layerAMode: string;
}

export interface SelectionStats {
  selectedCount: number;
  totalVotes: number;
  demVotes: number;
  repVotes: number;
  totalPopulation: number;
  votingAgePopulation: number;
  blackPopulation: number;
  hispanicPopulation: number;
  nonwhitePopulation: number;
  dataKind: DatasetKind;
  unitLabel: string;
  resolution: number;
  hexEntries: {
    h3Index: string;
    dem: number;
    rep: number;
    total: number;
    population: number;
    vap: number;
    black: number;
    hispanic: number;
    nonwhite: number;
  }[];
}

interface HoneycombMapProps {
  center: [number, number];
  results: PrecinctResult[];
  onStatsChange?: (stats: HexStats) => void;
  onLayerBMetricChange?: (m: VoteMetric) => void;
  dataKind?: DatasetKind;
  unitLabel?: string;
  metricOptions?: readonly MetricConfig[];
  initialMetric?: VoteMetric;
  initialZoom?: number;
  selectionMode?: boolean;
  selectionResetKey?: number;
  onSelectionUpdate?: (stats: SelectionStats | null) => void;
  focusBounds?: MapFocusBounds | null;
  activePresetId?: ViewPresetId;
}

export default function HoneycombMap({
  center,
  results,
  onStatsChange,
  onLayerBMetricChange,
  dataKind = "election",
  unitLabel = "precincts",
  metricOptions = ELECTION_METRICS,
  initialMetric = "margin",
  initialZoom = 4,
  selectionMode,
  selectionResetKey,
  onSelectionUpdate,
  focusBounds,
  activePresetId,
}: HoneycombMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialCenterRef = useRef(center);
  const initialZoomRef = useRef(initialZoom);
  const hexLayerRef = useRef<L.LayerGroup | null>(null);
  const bgHexLayerRef = useRef<L.LayerGroup | null>(null);
  const districtLayerRef = useRef<L.LayerGroup | null>(null);
  const planLayerRef = useRef<L.LayerGroup | null>(null);
  const ensembleLayerRef = useRef<L.LayerGroup | null>(null);
  const coiLayerRef = useRef<L.LayerGroup | null>(null);
  const districtDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const districtVotesRef = useRef<Map<string, DistrictVoteProps>>(new Map());

  // Selection mode refs
  const selectedHexesRef = useRef<Set<string>>(new Set());
  const hexPolygonsRef = useRef<Map<string, { polygon: L.Polygon; data: HexAgg; baseStyle: { color: string; weight: number; opacity: number; fillColor: string; fillOpacity: number } }>>(new Map());
  const selectionRectRef = useRef<L.Rectangle | null>(null);
  const selectionModeRef = useRef(false);
  const hexDataRef = useRef<Map<string, HexAgg>>(new Map());
  const onSelectionUpdateRef = useRef(onSelectionUpdate);
  const layerBResRef = useRef(4);
  const startsInPlanCompare = activePresetId === "plan-compare";

  // Layer A
  const [layerAMode, setLayerAMode] = useState<LayerAMode>("hex4");
  const [showLayerA, setShowLayerA] = useState(true);

  // Districts overlay (independent of Layer A)
  const [showDistricts, setShowDistricts] = useState(startsInPlanCompare);
  const [districtHeatFill, setDistrictHeatFill] = useState(false);

  // Layer B
  const [resolution, setResolution] = useState(4);
  const [layerBManual, setLayerBManual] = useState(false);
  const [layerBManualRes, setLayerBManualRes] = useState(5);
  const [showLayerB, setShowLayerB] = useState(true);

  // Metrics (independent per layer)
  const [layerAMetric, setLayerAMetric] = useState<VoteMetric>(initialMetric);
  const [layerBMetric, setLayerBMetric] = useState<VoteMetric>(initialMetric);

  // Bivariate
  const [bivariate, setBivariate] = useState(true);

  // Layer ordering
  const [layerOrderSwapped, setLayerOrderSwapped] = useState(false);

  // UI
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(startsInPlanCompare);
  const [districtDataLoaded, setDistrictDataLoaded] = useState(false);
  const [districtVotesLoaded, setDistrictVotesLoaded] = useState(false);
  const [planRegistry, setPlanRegistry] = useState<PlanRegistryEntry[]>([]);
  const [activePlanIds, setActivePlanIds] = useState<string[]>(
    startsInPlanCompare ? ["nc-2022-court-interim-congressional", "nc-2023-enacted-congressional"] : [],
  );
  const [planDataById, setPlanDataById] = useState<Record<string, GeoJSON.FeatureCollection>>({});
  const [planComparisonPoints, setPlanComparisonPoints] = useState<PlanComparisonPoint[]>([]);

  // Ensemble explainer layer
  const [showEnsemble, setShowEnsemble] = useState(false);
  const [ensembleOpen, setEnsembleOpen] = useState(false);
  const [ensembleEntry, setEnsembleEntry] = useState<EnsembleRegistryEntry | null>(null);
  const [ensembleSummary, setEnsembleSummary] = useState<EnsembleSummary | null>(null);
  const [ensembleError, setEnsembleError] = useState<string | null>(null);

  // Communities (COI) layer
  const [showCois, setShowCois] = useState(false);
  const [coisOpen, setCoisOpen] = useState(false);
  const [coiEntries, setCoiEntries] = useState<CoiRegistryEntry[] | null>(null);
  const [coiSummaries, setCoiSummaries] = useState<Record<string, CoiSummary>>({});
  const [coiError, setCoiError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      if (activePresetId === "plan-compare") {
        setPlansOpen(true);
        setShowDistricts(true);
        setDistrictHeatFill(false);
        setActivePlanIds(["nc-2022-court-interim-congressional", "nc-2023-enacted-congressional"]);
        setShowEnsemble(false);
        setEnsembleOpen(false);
        setShowCois(false);
        setCoisOpen(false);
        return;
      }

      if (activePresetId) {
        setPlansOpen(false);
        setShowDistricts(false);
        setDistrictHeatFill(false);
        setActivePlanIds([]);
        setShowEnsemble(false);
        setEnsembleOpen(false);
        setShowCois(false);
        setCoisOpen(false);
      }
    });
  }, [activePresetId]);

  const activeResearchLayers = useMemo<ResearchLayerId[]>(() => {
    const layers: ResearchLayerId[] = [];
    if (showDistricts) layers.push("district-outlines");
    if (showDistricts && districtHeatFill) layers.push("district-heat");
    if (activePlanIds.length > 0) layers.push("plan-overlays");
    if (showEnsemble) layers.push("ensemble-summary");
    if (showCois) layers.push("coi-overlays");
    return layers;
  }, [showDistricts, districtHeatFill, activePlanIds, showEnsemble, showCois]);

  const planRegistryById = useMemo(
    () => new Map(planRegistry.map((plan) => [plan.id, plan])),
    [planRegistry],
  );

  const researchLayerStatus = useMemo(
    () => buildLayerStatus(RESEARCH_LAYERS, activeResearchLayers),
    [activeResearchLayers],
  );

  const layerGroups = useMemo(
    () => buildLayerGroups(researchLayerStatus),
    [researchLayerStatus],
  );

  const plansGroup = layerGroups.find((group) => group.group === "Plans");
  const planImportSchema = useMemo(() => getPlanImportSchema(), []);
  const activePlanComparisons = useMemo<ActivePlanComparison[]>(() => {
    return activePlanIds.flatMap((planId, index) => {
      const data = planDataById[planId];
      const entry = planRegistryById.get(planId);
      if (!data || !entry) return [];

      const summary = summarizePlanFeatureCollection(data);
      return [{
        id: planId,
        name: entry.name,
        source: entry.source,
        cycle: entry.cycle,
        status: entry.status,
        color: PLAN_COLORS[index % PLAN_COLORS.length],
        districtCount: summary.districtCount,
        totalPopulation: summary.totalPopulation,
        selection: planComparisonPoints.length > 0
          ? comparePlanToPoints(data, planComparisonPoints)
          : null,
      }];
    });
  }, [activePlanIds, planDataById, planRegistryById, planComparisonPoints]);

  function toggleResearchLayer(layerId: ResearchLayerId) {
    if (layerId === "district-outlines") {
      if (showDistricts) {
        setDistrictHeatFill(false);
        setShowDistricts(false);
      } else {
        setShowDistricts(true);
      }
      return;
    }
    if (layerId === "district-heat") {
      setDistrictHeatFill((heat) => !heat);
      setShowDistricts(true);
      return;
    }
    if (layerId === "plan-overlays") {
      setActivePlanIds((ids) => {
        if (ids.length > 0) return [];
        const firstPlan = planRegistry[0];
        return firstPlan ? [firstPlan.id] : [];
      });
      return;
    }
    if (layerId === "ensemble-summary") {
      setShowEnsemble((show) => {
        // Constraints must be on screen before any band renders, so enabling
        // always opens the method panel.
        if (!show) setEnsembleOpen(true);
        return !show;
      });
      return;
    }
    if (layerId === "coi-overlays") {
      setShowCois((show) => {
        // Submitter and source provenance must be on screen before any COI
        // polygon renders, so enabling always opens the Communities panel.
        if (!show) setCoisOpen(true);
        return !show;
      });
    }
  }

  function togglePlanRegistryEntry(planId: string) {
    setActivePlanIds((ids) => (
      ids.includes(planId)
        ? ids.filter((id) => id !== planId)
        : [...ids, planId]
    ));
  }

  // Derived
  const layerBRes = layerBManual ? layerBManualRes : resolution;
  const layerARes =
    layerAMode === "hex3" ? 3 :
    layerAMode === "hex4" ? 4 :
    layerAMode === "hex5" ? 5 : null;

  // Notify parent of Layer B metric changes (for Legend)
  useEffect(() => {
    onLayerBMetricChange?.(layerBMetric);
  }, [layerBMetric, onLayerBMetricChange]);

  // ── Selection mode ref sync ──
  useEffect(() => { selectionModeRef.current = selectionMode ?? false; }, [selectionMode]);
  useEffect(() => { onSelectionUpdateRef.current = onSelectionUpdate; }, [onSelectionUpdate]);
  useEffect(() => { layerBResRef.current = layerBRes; }, [layerBRes]);

  const applySelectionStyles = useCallback(() => {
    if (!selectionModeRef.current) return;
    hexPolygonsRef.current.forEach(({ polygon, baseStyle }, h3Index) => {
      const isSelected = selectedHexesRef.current.has(h3Index);
      if (isSelected) {
        polygon.setStyle({
          color: "#f59e0b",
          weight: 3,
          opacity: 1,
          fillColor: baseStyle.fillColor,
          fillOpacity: Math.max(baseStyle.fillOpacity, 0.5),
        });
      } else {
        polygon.setStyle({
          color: baseStyle.color,
          weight: baseStyle.weight,
          opacity: baseStyle.opacity * 0.5,
          fillColor: baseStyle.fillColor,
          fillOpacity: baseStyle.fillOpacity * 0.4,
        });
      }
    });
  }, []);

  const reportSelection = useCallback((): PlanComparisonPoint[] => {
    const selected = selectedHexesRef.current;
    const currentHexData = hexDataRef.current;
    let totalVotes = 0, demVotes = 0, repVotes = 0;
    let totalPopulation = 0, votingAgePopulation = 0, blackPopulation = 0, hispanicPopulation = 0, nonwhitePopulation = 0;
    const hexEntries: SelectionStats["hexEntries"] = [];
    const comparisonPoints: PlanComparisonPoint[] = [];
    selected.forEach((h3Index) => {
      const data = currentHexData.get(h3Index);
      if (data) {
        try {
          const [lat, lng] = cellToLatLng(h3Index);
          comparisonPoints.push({ lat, lng });
        } catch { /* skip invalid h3 */ }

        totalVotes += data.totalVotes;
        demVotes += data.totalDem;
        repVotes += data.totalRep;
        totalPopulation += data.totalPopulation;
        votingAgePopulation += data.votingAgePopulation;
        blackPopulation += data.blackPopulation;
        hispanicPopulation += data.hispanicPopulation;
        nonwhitePopulation += Math.max(data.totalPopulation - data.nonHispanicWhitePopulation, 0);
        hexEntries.push({
          h3Index,
          dem: data.totalDem,
          rep: data.totalRep,
          total: data.totalVotes,
          population: data.totalPopulation,
          vap: data.votingAgePopulation,
          black: data.blackPopulation,
          hispanic: data.hispanicPopulation,
          nonwhite: Math.max(data.totalPopulation - data.nonHispanicWhitePopulation, 0),
        });
      }
    });
    onSelectionUpdateRef.current?.({
      selectedCount: selected.size,
      totalVotes,
      demVotes,
      repVotes,
      totalPopulation,
      votingAgePopulation,
      blackPopulation,
      hispanicPopulation,
      nonwhitePopulation,
      dataKind,
      unitLabel,
      resolution: layerBResRef.current,
      hexEntries,
    });
    return comparisonPoints;
  }, [dataKind, unitLabel]);

  // ── Initialize map ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: initialCenterRef.current,
      zoom: initialZoomRef.current,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 19 }
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    bgHexLayerRef.current = L.layerGroup().addTo(map);
    hexLayerRef.current = L.layerGroup().addTo(map);
    planLayerRef.current = L.layerGroup().addTo(map);
    districtLayerRef.current = L.layerGroup().addTo(map);
    ensembleLayerRef.current = L.layerGroup().addTo(map);
    coiLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    fetch("/data/congressional-districts-2022.json")
      .then((r) => r.json())
      .then((data: GeoJSON.FeatureCollection) => {
        districtDataRef.current = data;
        setDistrictDataLoaded(true);
      })
      .catch(() => {});

    fetch("/data/districts-votes-2020.json")
      .then((r) => r.json())
      .then((data: GeoJSON.FeatureCollection) => {
        const map = new Map<string, DistrictVoteProps>();
        for (const f of data.features) {
          const p = f.properties as DistrictVoteProps;
          if (p?.GEOID) map.set(p.GEOID, p);
        }
        districtVotesRef.current = map;
        setDistrictVotesLoaded(true);
      })
      .catch(() => {});

    fetch(getPlanRegistryUrl())
      .then((r) => {
        if (!r.ok) throw new Error(`Unable to load plan registry: ${r.status}`);
        return r.json();
      })
      .then((registry: PlanRegistry) => {
        setPlanRegistry([...registry.plans]);
      })
      .catch(() => {
        setPlanRegistry([]);
      });

    // Layer order: bgHex (Layer A) → hex (Layer B) → plan registry → districts
    // This is the default, swapping handled in a separate effect

    map.on("zoomend", () => {
      const z = map.getZoom();
      let base = 3;
      if (z >= 14) base = 8;
      else if (z >= 12) base = 7;
      else if (z >= 10) base = 6;
      else if (z >= 8) base = 5;
      else if (z >= 6) base = 4;
      else base = 3;
      setResolution(base);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView(center, initialZoom, { animate: false });
  }, [center, initialZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusBounds) return;
    map.fitBounds(
      [
        [focusBounds.south, focusBounds.west],
        [focusBounds.north, focusBounds.east],
      ],
      { animate: true, padding: [28, 28] },
    );
  }, [focusBounds]);

  // ── Layer order swap ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bgHexLayerRef.current || !hexLayerRef.current || !planLayerRef.current || !districtLayerRef.current) return;
    // Remove and re-add in desired order (last added = on top)
    bgHexLayerRef.current.remove();
    hexLayerRef.current.remove();
    planLayerRef.current.remove();
    districtLayerRef.current.remove();
    if (layerOrderSwapped) {
      hexLayerRef.current.addTo(map);
      bgHexLayerRef.current.addTo(map);
    } else {
      bgHexLayerRef.current.addTo(map);
      hexLayerRef.current.addTo(map);
    }
    planLayerRef.current.addTo(map);
    districtLayerRef.current.addTo(map);
  }, [layerOrderSwapped]);

  useEffect(() => {
    const missingPlanIds = activePlanIds.filter((planId) => !planDataById[planId]);
    if (missingPlanIds.length === 0) return;

    let cancelled = false;

    Promise.all(
      missingPlanIds.map(async (planId) => {
        const entry = planRegistryById.get(planId);
        if (!entry) return null;
        const response = await fetch(entry.url);
        if (!response.ok) throw new Error(`Unable to load plan ${planId}: ${response.status}`);
        const data = await response.json() as GeoJSON.FeatureCollection;
        return [planId, data] as const;
      }),
    )
      .then((loadedPlans) => {
        if (cancelled) return;
        setPlanDataById((current) => {
          const next = { ...current };
          for (const loadedPlan of loadedPlans) {
            if (!loadedPlan) continue;
            const [planId, data] = loadedPlan;
            next[planId] = data;
          }
          return next;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activePlanIds, planDataById, planRegistryById]);

  // ── Load the registered ensemble summary when the layer is first enabled ──
  useEffect(() => {
    if (!showEnsemble || ensembleSummary) return;

    let cancelled = false;

    (async () => {
      try {
        const registryResponse = await fetch(getEnsembleRegistryUrl());
        if (!registryResponse.ok) throw new Error(`HTTP ${registryResponse.status}`);
        const registry = await registryResponse.json() as EnsembleRegistry;
        const entry = registry.ensembles[0];
        if (!entry) throw new Error("Ensemble registry is empty");

        const summaryResponse = await fetch(entry.url);
        if (!summaryResponse.ok) throw new Error(`HTTP ${summaryResponse.status}`);
        const summary = await summaryResponse.json() as EnsembleSummary;

        if (!cancelled) {
          setEnsembleEntry(entry);
          setEnsembleSummary(summary);
          setEnsembleError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setEnsembleError(error instanceof Error ? error.message : "Failed to load ensemble summary");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showEnsemble, ensembleSummary]);

  // ── Load the ensemble's reference plan geometry into the plan cache ──
  const ensembleReferencePlanId = useMemo(() => (
    ensembleSummary?.unitMeasures.find((measure) => measure.unitKeyType === "district")?.referencePlanId ?? null
  ), [ensembleSummary]);

  useEffect(() => {
    if (!showEnsemble || !ensembleReferencePlanId || planDataById[ensembleReferencePlanId]) return;
    const entry = planRegistryById.get(ensembleReferencePlanId);
    if (!entry) return;

    let cancelled = false;

    fetch(entry.url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<GeoJSON.FeatureCollection>;
      })
      .then((data) => {
        if (cancelled) return;
        setPlanDataById((current) => (
          current[entry.id] ? current : { ...current, [entry.id]: data }
        ));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [showEnsemble, ensembleReferencePlanId, planDataById, planRegistryById]);

  // ── Draw ensemble percentile bands ──
  useEffect(() => {
    ensembleLayerRef.current?.clearLayers();
    if (!ensembleLayerRef.current || !showEnsemble || !ensembleSummary) return;

    const gate = getEnsembleOutlierGate(ensembleSummary);
    const previewNote = gate.allowed
      ? ""
      : `<br><span style="color:#f59e0b">Preview only: ${ensembleSummary.status === "mock" ? "mock payload, numbers fabricated" : "outlier gate blocked"}</span>`;

    const districtMeasure = ensembleSummary.unitMeasures.find((measure) => measure.unitKeyType === "district");
    const referenceData = districtMeasure ? planDataById[districtMeasure.referencePlanId] : undefined;
    if (districtMeasure && referenceData) {
      const unitById = new Map(districtMeasure.units.map((unit) => [unit.unitId, unit]));

      const geojsonLayer = L.geoJSON(referenceData, {
        style: (feature) => {
          const props = feature?.properties as PlanFeatureProps | undefined;
          const districtId = String(props?.district_id ?? props?.GEOID ?? "");
          const unit = unitById.get(districtId);
          if (!unit) return { color: "#3f3f46", weight: 1, opacity: 0.5, fillOpacity: 0 };

          const band = ENSEMBLE_BAND_STYLES[classifyEnsemblePercentile(unit.comparedPercentile)];
          return {
            color: band.color,
            weight: 1.5,
            opacity: 0.9,
            fillColor: band.color,
            fillOpacity: gate.allowed ? 0.32 : 0.2,
            dashArray: gate.allowed ? undefined : "4 4",
          };
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties as PlanFeatureProps | undefined;
          const districtId = String(props?.district_id ?? props?.GEOID ?? "");
          const unit = unitById.get(districtId);
          if (!unit) return;

          const band = ENSEMBLE_BAND_STYLES[classifyEnsemblePercentile(unit.comparedPercentile)];
          layer.bindTooltip(
            `<div style="font-size:11px;line-height:1.55">
              <b>District ${districtId}</b><br>
              ${districtMeasure.label}: <b>${unit.comparedValue.toFixed(3)}</b><br>
              Ensemble percentile: <b>${unit.comparedPercentile.toFixed(1)}</b> · ${band.label}${previewNote}
            </div>`,
            { direction: "top", className: "honeycomb-tooltip", sticky: true },
          );
        },
      });
      ensembleLayerRef.current.addLayer(geojsonLayer);
    }

    const h3Measure = ensembleSummary.unitMeasures.find((measure) => measure.unitKeyType === "h3");
    if (h3Measure) {
      for (const unit of h3Measure.units) {
        try {
          const boundary = cellToBoundary(unit.unitId);
          const latlngs = boundary.map(([lat, lng]) => [lat, lng] as [number, number]);
          const band = ENSEMBLE_BAND_STYLES[classifyEnsemblePercentile(unit.comparedPercentile)];

          const polygon = L.polygon(latlngs, {
            color: band.color,
            weight: 2.5,
            opacity: 1,
            fillColor: band.color,
            fillOpacity: gate.allowed ? 0.55 : 0.4,
            dashArray: gate.allowed ? undefined : "4 4",
          });
          polygon.bindTooltip(
            `<div style="font-size:11px;line-height:1.55">
              <b>H3 ${unit.unitId}</b><br>
              ${h3Measure.label}: <b>${unit.comparedValue.toFixed(3)}</b><br>
              Ensemble percentile: <b>${unit.comparedPercentile.toFixed(1)}</b> · ${band.label}${previewNote}
            </div>`,
            { direction: "top", className: "honeycomb-tooltip", sticky: true },
          );
          ensembleLayerRef.current.addLayer(polygon);
        } catch {
          // Skip malformed cell ids rather than dropping the whole layer.
        }
      }
    }

    ensembleLayerRef.current.eachLayer((layer) => {
      if ("bringToFront" in layer && typeof layer.bringToFront === "function") {
        (layer as L.GeoJSON).bringToFront();
      }
    });
  }, [showEnsemble, ensembleSummary, planDataById]);

  // ── Load the COI registry and payloads when the panel or layer is opened ──
  useEffect(() => {
    if ((!coisOpen && !showCois) || coiEntries) return;

    let cancelled = false;

    (async () => {
      try {
        const registryResponse = await fetch(getCoiRegistryUrl());
        if (!registryResponse.ok) throw new Error(`HTTP ${registryResponse.status}`);
        const registry = await registryResponse.json() as CoiRegistry;

        const summaries: Record<string, CoiSummary> = {};
        for (const entry of registry.cois) {
          const summaryResponse = await fetch(entry.url);
          if (!summaryResponse.ok) throw new Error(`HTTP ${summaryResponse.status} for ${entry.id}`);
          summaries[entry.id] = await summaryResponse.json() as CoiSummary;
        }

        if (!cancelled) {
          setCoiEntries([...registry.cois]);
          setCoiSummaries(summaries);
          setCoiError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setCoiError(error instanceof Error ? error.message : "Failed to load COI registry");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coisOpen, showCois, coiEntries]);

  // ── Draw COI polygons as context overlays ──
  useEffect(() => {
    coiLayerRef.current?.clearLayers();
    if (!coiLayerRef.current || !showCois) return;

    for (const summary of Object.values(coiSummaries)) {
      const gate = getCoiFractureGate(summary);
      const fractureLines = summary.fracture.plans
        .map((plan) => `${plan.planId}: ${plan.districtsTouched} districts, largest ${(plan.largestShare * 100).toFixed(1)}%`)
        .join("<br>");
      const gateNote = gate.allowed
        ? ""
        : `<br><span style="color:#f59e0b">Preview only: ${summary.status === "sample" ? "sample payload, geometry fictional" : "provenance incomplete"}</span>`;

      const geojsonLayer = L.geoJSON(summary.geometry, {
        style: {
          color: COI_OVERLAY_COLOR,
          weight: 2,
          opacity: 0.9,
          fillColor: COI_OVERLAY_COLOR,
          fillOpacity: gate.allowed ? 0.18 : 0.1,
          dashArray: gate.allowed ? undefined : "6 4",
        },
      });
      geojsonLayer.bindTooltip(
        `<div style="font-size:11px;line-height:1.55">
          <b>${summary.name}</b> · ${summary.status}<br>
          Submitter: ${summary.submitter.name}<br>
          ${fractureLines}${gateNote}
        </div>`,
        { direction: "top", className: "honeycomb-tooltip", sticky: true },
      );
      coiLayerRef.current.addLayer(geojsonLayer);
    }
  }, [showCois, coiSummaries]);

  // ── Layer B hex aggregation ──
  const hexData = useMemo(() => {
    const hexMap = new Map<string, HexAgg>();
    for (const r of results) {
      if (!r.lat || !r.lng) continue;
      try {
        const h3Index = latLngToCell(r.lat, r.lng, layerBRes);
        const existing = hexMap.get(h3Index) || createEmptyHexAgg();
        addRecordToAgg(existing, r);
        hexMap.set(h3Index, existing);
      } catch { /* skip invalid coords */ }
    }
    return hexMap;
  }, [results, layerBRes]);

  useEffect(() => { hexDataRef.current = hexData; }, [hexData]);

  // ── Layer A hex aggregation (hex modes only) ──
  const bgHexData = useMemo(() => {
    if (layerARes === null) return new Map<string, HexAgg>();
    const hexMap = new Map<string, HexAgg>();
    for (const r of results) {
      if (!r.lat || !r.lng) continue;
      try {
        const h3Index = latLngToCell(r.lat, r.lng, layerARes);
        const existing = hexMap.get(h3Index) || createEmptyHexAgg();
        addRecordToAgg(existing, r);
        hexMap.set(h3Index, existing);
      } catch { /* skip invalid coords */ }
    }
    return hexMap;
  }, [results, layerARes]);

  // ── Emit stats whenever hex data changes ──
  useEffect(() => {
    if (!onStatsChange) return;
    onStatsChange({
      ...summarizeHexStats(hexData.values()),
      ...summarizePopulationHexes(hexData.values()),
      dataKind,
      unitLabel,
      res: layerBRes,
      layerAMode,
    });
  }, [dataKind, hexData, layerAMode, layerBRes, onStatsChange, unitLabel]);

  // ── Selection mode enter/exit ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectionMode) {
      const bounds = map.getBounds();
      const selected = new Set<string>();

      hexDataRef.current.forEach((_, h3Index) => {
        try {
          const [lat, lng] = cellToLatLng(h3Index);
          if (bounds.contains([lat, lng])) {
            selected.add(h3Index);
          }
        } catch { /* skip */ }
      });

      selectedHexesRef.current = selected;

      if (selectionRectRef.current) selectionRectRef.current.remove();
      selectionRectRef.current = L.rectangle(bounds, {
        color: "#f59e0b",
        weight: 2,
        opacity: 0.6,
        fillOpacity: 0,
        dashArray: "8, 6",
        interactive: false,
      }).addTo(map);

      applySelectionStyles();
      const comparisonPoints = reportSelection();
      queueMicrotask(() => setPlanComparisonPoints(comparisonPoints));
    } else {
      selectedHexesRef.current = new Set();
      queueMicrotask(() => setPlanComparisonPoints([]));

      if (selectionRectRef.current) {
        selectionRectRef.current.remove();
        selectionRectRef.current = null;
      }

      hexPolygonsRef.current.forEach(({ polygon, baseStyle }) => {
        polygon.setStyle(baseStyle);
      });

      onSelectionUpdateRef.current?.(null);
    }
  }, [applySelectionStyles, reportSelection, selectionMode, selectionResetKey]);

  // ── Draw Layer A (hex modes only) ──
  useEffect(() => {
    bgHexLayerRef.current?.clearLayers();

    if (!showLayerA) return;

    if (layerARes !== null && bgHexData.size > 0 && bgHexLayerRef.current) {
      const entries: { h3: string; data: HexAgg; value: number }[] = [];
      bgHexData.forEach((data, h3) => {
        entries.push({ h3, data, value: computeMetricValue(data, layerAMetric) });
      });
      if (entries.length === 0) return;

      const minVal = Math.min(...entries.map((e) => e.value));
      const maxVal = Math.max(...entries.map((e) => e.value));

      // Bivariate encoding for Layer A (subtle: max opacity ~0.4)
      const useBivariateA = bivariate && !["turnout", "population", "vap"].includes(layerAMetric);

      for (const { h3: h3Index, data } of entries) {
        try {
          const boundary = cellToBoundary(h3Index);
          const latlngs = boundary.map(([lat, lng]) => [lat, lng] as [number, number]);
          const color = getHexColor(data, layerAMetric, minVal, maxVal);

          let fillOpacity: number;
          let weight: number;
          let borderOpacity: number;

          if (useBivariateA) {
            let confidence: number;
            if (layerAMetric === "margin") {
              confidence = data.totalVotes > 0
                ? Math.abs(data.totalDem - data.totalRep) / data.totalVotes
                : 0;
            } else if (["black_pct", "hispanic_pct", "nonwhite_pct"].includes(layerAMetric)) {
              confidence = computeMetricValue(data, layerAMetric) / 100;
            } else {
              const pct = layerAMetric === "dem_pct"
                ? (data.totalVotes > 0 ? (data.totalDem / data.totalVotes) * 100 : 50)
                : layerAMetric === "rep_pct"
                  ? (data.totalVotes > 0 ? (data.totalRep / data.totalVotes) * 100 : 50)
                  : computeMetricValue(data, layerAMetric);
              confidence = Math.abs(pct - 50) / 50;
            }
            confidence = Math.min(Math.max(confidence, 0), 1);

            fillOpacity = 0.1 + confidence * 0.3;   // 0.1–0.4 (subtle)
            weight = 0.3 + confidence * 0.9;         // 0.3–1.2
            borderOpacity = 0.15 + confidence * 0.35;
          } else {
            fillOpacity = 0.2;
            weight = 0.5;
            borderOpacity = 0.3;
          }

          const polygon = L.polygon(latlngs, {
            color,
            weight,
            opacity: borderOpacity,
            fillColor: color,
            fillOpacity,
          });
          bgHexLayerRef.current!.addLayer(polygon);
        } catch { /* skip invalid hex */ }
      }
    }

  }, [layerARes, showLayerA, bgHexData, layerAMetric, bivariate]);

  // ── Draw districts overlay (independent of Layer A) ──
  useEffect(() => {
    districtLayerRef.current?.clearLayers();

    if (!showDistricts) return;
    if (!districtDataRef.current || !districtLayerRef.current) return;

    if (districtHeatFill) {
      // Heat fill mode — same as old districts mode
      const allAggs: { geoid: string; agg: HexAgg; value: number }[] = [];
      districtVotesRef.current.forEach((props, geoid) => {
        const agg = districtToHexAgg(props);
        allAggs.push({ geoid, agg, value: computeMetricValue(agg, layerAMetric) });
      });
      const distMinVal = allAggs.length > 0 ? Math.min(...allAggs.map((e) => e.value)) : 0;
      const distMaxVal = allAggs.length > 0 ? Math.max(...allAggs.map((e) => e.value)) : 1;

      const geojsonLayer = L.geoJSON(districtDataRef.current, {
        style: (feature) => {
          const geoid = feature?.properties?.GEOID;
          const voteProps = geoid ? districtVotesRef.current.get(geoid) : undefined;
          if (voteProps) {
            const agg = districtToHexAgg(voteProps);
            const color = getHexColor(agg, layerAMetric, distMinVal, distMaxVal);
            return {
              color: "#ffffff",
              weight: 1.5,
              opacity: 0.7,
              fillColor: color,
              fillOpacity: 0.35,
            };
          }
          return {
            color: "#ffffff",
            weight: 1.5,
            opacity: 0.7,
            fillOpacity: 0,
          };
        },
        onEachFeature: (feature, layer) => {
          const geoid = feature.properties?.GEOID;
          const voteProps = geoid ? districtVotesRef.current.get(geoid) : undefined;
          const name = voteProps?.name || feature.properties?.NAMELSAD || "District";

          if (voteProps && voteProps.total_votes > 0) {
            const demPct = ((voteProps.dem_votes / voteProps.total_votes) * 100).toFixed(1);
            const repPct = ((voteProps.rep_votes / voteProps.total_votes) * 100).toFixed(1);
            const marginVal = (((voteProps.dem_votes - voteProps.rep_votes) / voteProps.total_votes) * 100).toFixed(1);
            const marginLabel =
              Number(marginVal) > 0 ? `D+${marginVal}%` :
              Number(marginVal) < 0 ? `R+${Math.abs(Number(marginVal))}%` : "Even";

            layer.bindTooltip(
              `<div style="font-size:11px;line-height:1.6">
                <b>${name}</b><br>
                <b>${voteProps.total_votes.toLocaleString()}</b> votes · ${voteProps.county_count} ${voteProps.county_count === 1 ? "county" : "counties"}<br>
                <span style="color:#60a5fa">Dem ${demPct}%</span> · <span style="color:#f87171">Rep ${repPct}%</span><br>
                Margin: <b>${marginLabel}</b>
              </div>`,
              { direction: "top", className: "honeycomb-tooltip", sticky: true }
            );
          } else {
            layer.bindTooltip(
              `<div style="font-size:11px;line-height:1.4"><b>${name}</b></div>`,
              { direction: "top", className: "honeycomb-tooltip", sticky: true }
            );
          }
        },
      });
      districtLayerRef.current.addLayer(geojsonLayer);
    } else {
      // Outline-only mode
      const geojsonLayer = L.geoJSON(districtDataRef.current, {
        style: () => ({
          color: "#ffffff",
          weight: 1.5,
          opacity: 0.5,
          fillOpacity: 0,
        }),
        onEachFeature: (feature, layer) => {
          const geoid = feature.properties?.GEOID;
          const voteProps = geoid ? districtVotesRef.current.get(geoid) : undefined;
          const name = voteProps?.name || feature.properties?.NAMELSAD || "District";

          if (voteProps && voteProps.total_votes > 0) {
            const demPct = ((voteProps.dem_votes / voteProps.total_votes) * 100).toFixed(1);
            const repPct = ((voteProps.rep_votes / voteProps.total_votes) * 100).toFixed(1);
            const marginVal = (((voteProps.dem_votes - voteProps.rep_votes) / voteProps.total_votes) * 100).toFixed(1);
            const marginLabel =
              Number(marginVal) > 0 ? `D+${marginVal}%` :
              Number(marginVal) < 0 ? `R+${Math.abs(Number(marginVal))}%` : "Even";

            layer.bindTooltip(
              `<div style="font-size:11px;line-height:1.6">
                <b>${name}</b><br>
                <b>${voteProps.total_votes.toLocaleString()}</b> votes · ${voteProps.county_count} ${voteProps.county_count === 1 ? "county" : "counties"}<br>
                <span style="color:#60a5fa">Dem ${demPct}%</span> · <span style="color:#f87171">Rep ${repPct}%</span><br>
                Margin: <b>${marginLabel}</b>
              </div>`,
              { direction: "top", className: "honeycomb-tooltip", sticky: true }
            );
          } else {
            layer.bindTooltip(
              `<div style="font-size:11px;line-height:1.4"><b>${name}</b></div>`,
              { direction: "top", className: "honeycomb-tooltip", sticky: true }
            );
          }
        },
      });
      districtLayerRef.current.addLayer(geojsonLayer);
    }

    // Always bring districts to front
    if (mapRef.current && districtLayerRef.current) {
      districtLayerRef.current.eachLayer((layer) => {
        if ('bringToFront' in layer && typeof layer.bringToFront === 'function') {
          (layer as L.GeoJSON).bringToFront();
        }
      });
    }
  }, [showDistricts, districtHeatFill, districtDataLoaded, districtVotesLoaded, layerAMetric]);

  // ── Draw imported plan registry overlays ──
  useEffect(() => {
    planLayerRef.current?.clearLayers();

    if (!planLayerRef.current || activePlanIds.length === 0) return;

    activePlanIds.forEach((planId, index) => {
      const data = planDataById[planId];
      if (!data) return;

      const entry = planRegistryById.get(planId);
      const color = PLAN_COLORS[index % PLAN_COLORS.length];

      const geojsonLayer = L.geoJSON(data, {
        style: () => ({
          color,
          weight: 2,
          opacity: 0.9,
          fillColor: color,
          fillOpacity: 0.04,
          dashArray: entry?.status === "enacted" ? undefined : "6 4",
        }),
        onEachFeature: (feature, layer) => {
          const props = feature.properties as PlanFeatureProps | undefined;
          const districtId = props?.district_id ?? props?.GEOID ?? "unknown";
          const districtName = props?.name ?? props?.NAMELSAD ?? `District ${districtId}`;
          const planName = entry?.name ?? props?.plan_id ?? "Imported plan";
          const source = props?.source ?? entry?.source ?? "Unknown source";
          const cycle = props?.cycle ?? entry?.cycle ?? "Unknown cycle";

          layer.bindTooltip(
            `<div style="font-size:11px;line-height:1.55">
              <b>${planName}</b><br>
              ${districtName}<br>
              District ID: <b>${districtId}</b><br>
              <span style="color:#94a3b8">${source} · ${cycle}</span>
            </div>`,
            { direction: "top", className: "honeycomb-tooltip", sticky: true }
          );
        },
      });

      planLayerRef.current?.addLayer(geojsonLayer);
    });

    if (mapRef.current && planLayerRef.current) {
      planLayerRef.current.eachLayer((layer) => {
        if ("bringToFront" in layer && typeof layer.bringToFront === "function") {
          (layer as L.GeoJSON).bringToFront();
        }
      });
    }
  }, [activePlanIds, planDataById, planRegistryById]);

  // ── Draw Layer B hexes ──
  useEffect(() => {
    if (!hexLayerRef.current) return;
    hexLayerRef.current.clearLayers();
    hexPolygonsRef.current.clear();

    if (!showLayerB || hexData.size === 0) return;

    const entries: { h3: string; data: HexAgg; value: number }[] = [];
    hexData.forEach((data, h3) => {
      entries.push({ h3, data, value: computeMetricValue(data, layerBMetric) });
    });
    if (entries.length === 0) return;

    const minVal = Math.min(...entries.map((e) => e.value));
    const maxVal = Math.max(...entries.map((e) => e.value));
    const range = maxVal - minVal || 1;

    // Should we apply bivariate encoding?
    const useBivariate = bivariate && !["turnout", "population", "vap"].includes(layerBMetric);

    for (const { h3: h3Index, data, value } of entries) {
      try {
        const boundary = cellToBoundary(h3Index);
        const latlngs = boundary.map(([lat, lng]) => [lat, lng] as [number, number]);
        const color = getHexColor(data, layerBMetric, minVal, maxVal);

        let fillOpacity: number;
        let weight: number;
        let borderOpacity: number;

        if (useBivariate) {
          // Confidence = how decisive the result was
          let confidence: number;
          if (layerBMetric === "margin") {
            confidence = data.totalVotes > 0
              ? Math.abs(data.totalDem - data.totalRep) / data.totalVotes
              : 0;
          } else if (["black_pct", "hispanic_pct", "nonwhite_pct"].includes(layerBMetric)) {
            confidence = computeMetricValue(data, layerBMetric) / 100;
          } else {
            // dem_pct, rep_pct, competitiveness: distance from 50%
            const pct = layerBMetric === "dem_pct"
              ? (data.totalVotes > 0 ? (data.totalDem / data.totalVotes) * 100 : 50)
              : layerBMetric === "rep_pct"
                ? (data.totalVotes > 0 ? (data.totalRep / data.totalVotes) * 100 : 50)
                : computeMetricValue(data, layerBMetric);
            confidence = Math.abs(pct - 50) / 50;
          }
          confidence = Math.min(Math.max(confidence, 0), 1);

          fillOpacity = 0.15 + confidence * 0.65;
          weight = 0.5 + confidence * 1.5;
          borderOpacity = 0.3 + confidence * 0.5;
        } else {
          const ratio = (value - minVal) / range;
          fillOpacity = 0.25 + ratio * 0.55;
          weight = 1;
          borderOpacity = 0.6;
        }

        const polygon = L.polygon(latlngs, {
          color,
          weight,
          opacity: borderOpacity,
          fillColor: color,
          fillOpacity,
        });

        if (dataKind === "population") {
          const nonwhitePopulation = Math.max(data.totalPopulation - data.nonHispanicWhitePopulation, 0);
          polygon.bindTooltip(
            `<div style="font-size:11px;line-height:1.6">
              <b>${data.totalPopulation.toLocaleString()}</b> people · ${data.count} ${data.count === 1 ? unitLabel.replace(/s$/, "") : unitLabel}<br>
              VAP: <b>${data.votingAgePopulation.toLocaleString()}</b><br>
              <span style="color:#14b8a6">Black ${percent(data.blackPopulation, data.totalPopulation)}%</span> ·
              <span style="color:#eab308">Hispanic ${percent(data.hispanicPopulation, data.totalPopulation)}%</span><br>
              Nonwhite: <b>${percent(nonwhitePopulation, data.totalPopulation)}%</b>
            </div>`,
            { direction: "top", className: "honeycomb-tooltip" }
          );
        } else {
          const demPct = data.totalVotes > 0 ? ((data.totalDem / data.totalVotes) * 100).toFixed(1) : "0";
          const repPct = data.totalVotes > 0 ? ((data.totalRep / data.totalVotes) * 100).toFixed(1) : "0";
          const marginVal = data.totalVotes > 0 ? (((data.totalDem - data.totalRep) / data.totalVotes) * 100).toFixed(1) : "0";
          const absMargin = Math.abs(Number(marginVal));
          const marginLabel =
            Number(marginVal) > 0 ? `D+${marginVal}%` :
            Number(marginVal) < 0 ? `R+${absMargin}%` : "Even";

          const party = Number(marginVal) >= 0 ? "D" : "R";
          const zoneLabel = absMargin < 5
            ? '<span style="color:#a855f7">Competitive zone</span>'
            : absMargin < 15
              ? `<span style="color:#94a3b8">Lean ${party}</span>`
              : `<span style="color:#64748b">Solid ${party}</span>`;

          polygon.bindTooltip(
            `<div style="font-size:11px;line-height:1.6">
              <b>${data.totalVotes.toLocaleString()}</b> votes · ${data.count} ${data.count === 1 ? unitLabel.replace(/s$/, "") : unitLabel}<br>
              <span style="color:#60a5fa">Dem ${demPct}%</span> · <span style="color:#f87171">Rep ${repPct}%</span><br>
              Margin: <b>${marginLabel}</b> · ${zoneLabel}<br>
              <span style="color:#71717a">${data.totalDem.toLocaleString()} D / ${data.totalRep.toLocaleString()} R</span>
            </div>`,
            { direction: "top", className: "honeycomb-tooltip" }
          );
        }

        hexPolygonsRef.current.set(h3Index, {
          polygon,
          data,
          baseStyle: { color, weight, opacity: borderOpacity, fillColor: color, fillOpacity },
        });

        polygon.on("click", () => {
          if (!selectionModeRef.current) return;
          const set = selectedHexesRef.current;
          if (set.has(h3Index)) set.delete(h3Index);
          else set.add(h3Index);
          applySelectionStyles();
          setPlanComparisonPoints(reportSelection());
        });

        hexLayerRef.current!.addLayer(polygon);
      } catch { /* skip invalid hex */ }
    }

    if (selectionModeRef.current) {
      applySelectionStyles();
      const comparisonPoints = reportSelection();
      queueMicrotask(() => setPlanComparisonPoints(comparisonPoints));
    }

  }, [applySelectionStyles, bivariate, dataKind, hexData, layerBMetric, reportSelection, showLayerB, unitLabel]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className={`w-full h-full${selectionMode ? " cursor-crosshair" : ""}`} />
      {selectionMode && (
        <div className="absolute inset-0 bg-amber-500/5 pointer-events-none z-[399]" />
      )}

      {/* Plans + communities + ensemble quick panels */}
      <div className="absolute z-[1000] flex items-start gap-2" style={{ top: 'max(12px, env(safe-area-inset-top, 12px))', left: 'max(12px, env(safe-area-inset-left, 12px))' }}>
        <div>
        <button
          type="button"
          onClick={() => setPlansOpen((o) => !o)}
          aria-expanded={plansOpen}
          className={`px-2.5 py-2 rounded-lg backdrop-blur-xl shadow-lg transition-all inline-flex items-center gap-2 ${
            plansOpen || (plansGroup?.enabledCount ?? 0) > 0
              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
              : "bg-black/60 text-zinc-400 border border-white/10 hover:text-zinc-200"
          }`}
        >
          <Layers className="h-4 w-4" aria-hidden="true" />
          <span className="text-[11px] font-mono">Plans</span>
          {(plansGroup?.enabledCount ?? 0) > 0 && (
            <span className="rounded bg-cyan-400/20 px-1.5 py-0.5 text-[9px] font-mono text-cyan-300">
              {plansGroup?.enabledCount}
            </span>
          )}
        </button>

        {plansOpen && plansGroup && (
          <div
            className="mt-2 w-80 overflow-y-auto border border-white/10 bg-black/90 p-3 shadow-2xl backdrop-blur-xl"
            style={{ maxHeight: "calc(100dvh - 88px)" }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
              <div>
                <div className="text-[11px] font-semibold text-zinc-200">Plan Compare</div>
                <div className="mt-0.5 text-[9px] text-zinc-600">
                  {plansGroup.enabledCount} active · {plansGroup.availableCount} available
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDistricts(false);
                  setDistrictHeatFill(false);
                  setActivePlanIds([]);
                }}
                className="text-[10px] font-mono text-zinc-600 transition-colors hover:text-zinc-300"
              >
                Clear
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setShowDistricts(true);
                  setDistrictHeatFill(false);
                  setActivePlanIds(["nc-2022-court-interim-congressional", "nc-2023-enacted-congressional"]);
                }}
                className="border border-yellow-400/25 bg-yellow-400/10 px-2 py-2 text-left text-[10px] font-mono text-yellow-200 transition-colors hover:bg-yellow-400/15"
              >
                Court vs enacted
                <div className="mt-0.5 text-[8.5px] leading-snug text-yellow-100/55">
                  2022 court plan + 2023 enacted plan
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDistricts(true);
                  setDistrictHeatFill(false);
                }}
                className="border border-cyan-400/20 bg-cyan-400/10 px-2 py-2 text-left text-[10px] font-mono text-cyan-200 transition-colors hover:bg-cyan-400/15"
              >
                Outlines only
                <div className="mt-0.5 text-[8.5px] leading-snug text-cyan-100/50">
                  Boundaries above the H3 layer
                </div>
              </button>
            </div>

            <div className="mt-2 space-y-1.5">
              {plansGroup.layers.map((layer) => {
                const provenance = getResearchLayerProvenance(layer.id);

                return (
                  <label
                    key={layer.id}
                    title={layer.disabled ? layer.reason : layer.description}
                    className={`block border px-2 py-2 transition-colors ${
                      layer.disabled
                        ? "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-55"
                        : layer.enabled
                          ? "cursor-pointer border-cyan-500/30 bg-cyan-500/10"
                          : "cursor-pointer border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={layer.enabled}
                        disabled={layer.disabled}
                        onChange={() => toggleResearchLayer(layer.id)}
                        className="mt-0.5 h-3 w-3 accent-cyan-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-medium ${layer.enabled ? "text-cyan-300" : "text-zinc-200"}`}>
                            {layer.label}
                          </span>
                          <span className={`ml-auto text-[8px] font-mono ${
                            layer.status === "available" ? "text-emerald-500/70" : "text-zinc-600"
                          }`}>
                            {layer.status}
                          </span>
                        </div>
                        <div className="mt-1 text-[9px] leading-snug text-zinc-600">
                          {layer.description}
                        </div>
                        <details className="mt-1.5 break-words text-[8.5px] leading-snug text-zinc-500">
                          <summary className="cursor-pointer font-mono uppercase text-zinc-600 transition-colors hover:text-zinc-400">
                            Provenance and caveat
                          </summary>
                          <div className="mt-1 space-y-0.5">
                            <div>
                              <span className="font-mono uppercase text-zinc-600">Source:</span> {provenance.source}
                            </div>
                            <div>
                              <span className="font-mono uppercase text-zinc-600">Method:</span> {provenance.method}
                            </div>
                            {provenance.payloadUrl && (
                              <div>
                                <span className="font-mono uppercase text-zinc-600">Payload:</span> {provenance.payloadUrl}
                              </div>
                            )}
                            <div>
                              <span className="font-mono uppercase text-zinc-600">Caveat:</span> {provenance.caveats[0]}
                            </div>
                          </div>
                        </details>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="mt-2 border-t border-white/10 pt-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[9px] font-mono uppercase tracking-wide text-zinc-600">
                  Plan imports: local registry
                </div>
                <div className="text-[8px] font-mono text-zinc-700">
                  {activePlanIds.length}/{planRegistry.length}
                </div>
              </div>
              <div className="mt-1.5 space-y-1">
                {planRegistry.length === 0 && (
                  <div className="text-[9px] leading-snug text-zinc-700">
                    No local plan registry entries found.
                  </div>
                )}
                {planRegistry.map((plan, index) => (
                  <label
                    key={plan.id}
                    className={`block border px-2 py-1.5 transition-colors ${
                      activePlanIds.includes(plan.id)
                        ? "border-yellow-400/30 bg-yellow-400/10"
                        : "cursor-pointer border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={activePlanIds.includes(plan.id)}
                        onChange={() => togglePlanRegistryEntry(plan.id)}
                        className="mt-0.5 h-3 w-3 accent-yellow-400"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: PLAN_COLORS[index % PLAN_COLORS.length] }}
                            aria-hidden="true"
                          />
                          <span className="text-[10px] font-medium text-zinc-200">
                            {plan.name}
                          </span>
                          <span className="ml-auto text-[8px] font-mono text-zinc-600">
                            {plan.status}
                          </span>
                        </div>
                        <div className="mt-1 break-words text-[8.5px] leading-snug text-zinc-600">
                          {plan.source} · {plan.cycle}
                        </div>
                        {plan.description && (
                          <div className="mt-0.5 break-words text-[8.5px] leading-snug text-zinc-700">
                            {plan.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {activePlanComparisons.length > 0 && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="text-[9px] font-mono uppercase tracking-wide text-zinc-600">
                  Plan comparison
                </div>
                <div className="mt-1.5 space-y-1">
                  {activePlanComparisons.map((plan) => (
                    <div key={plan.id} className="border border-white/10 bg-white/[0.03] px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: plan.color }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-zinc-200">
                          {plan.name}
                        </span>
                        <span className="text-[8px] font-mono text-zinc-600">
                          {plan.status}
                        </span>
                      </div>
                      <div className="mt-1 text-[8.5px] leading-snug text-zinc-600">
                        {plan.source} · {plan.cycle}
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-1 text-[8.5px]">
                        <div className="border border-white/5 bg-black/30 px-1.5 py-1">
                          <div className="font-mono uppercase text-zinc-700">Districts</div>
                          <div className="text-zinc-300">{plan.districtCount}</div>
                        </div>
                        <div className="border border-white/5 bg-black/30 px-1.5 py-1">
                          <div className="font-mono uppercase text-zinc-700">Population</div>
                          <div className="text-zinc-300">
                            {plan.totalPopulation > 0 ? plan.totalPopulation.toLocaleString() : "n/a"}
                          </div>
                        </div>
                      </div>
                      {plan.selection ? (
                        <div className="mt-1 text-[8.5px] leading-snug text-zinc-500">
                          Selection: {plan.selection.matchedPointCount}/{plan.selection.selectedPointCount} H3 centers inside this plan, touching {plan.selection.districtCount} {plan.selection.districtCount === 1 ? "district" : "districts"}.
                        </div>
                      ) : (
                        <div className="mt-1 text-[8.5px] leading-snug text-zinc-700">
                          Use region selection to compare selected H3 centers against this plan.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-2 border-t border-white/10 pt-2">
              <div className="text-[9px] font-mono uppercase tracking-wide text-zinc-600">Import schema</div>
              <div className="mt-1 text-[9px] leading-snug text-zinc-500">
                {planImportSchema.format}
              </div>
              <div className="mt-1 break-words text-[9px] leading-snug text-zinc-600">
                Required: {planImportSchema.requiredProperties.join(", ")}
              </div>
              <div className="mt-1 text-[8.5px] leading-snug text-zinc-700">
                {planImportSchema.validationNotes[0]}
              </div>
            </div>
          </div>
        )}
        </div>

        <div>
        <button
          type="button"
          onClick={() => setCoisOpen((open) => !open)}
          aria-expanded={coisOpen}
          className={`px-2.5 py-2 rounded-lg backdrop-blur-xl shadow-lg transition-all inline-flex items-center gap-2 ${
            coisOpen || showCois
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "bg-black/60 text-zinc-400 border border-white/10 hover:text-zinc-200"
          }`}
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          <span className="text-[11px] font-mono">Communities</span>
          {showCois && (
            <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-mono text-amber-200">on</span>
          )}
        </button>

        {coisOpen && (
          <div
            className="mt-2 w-80 overflow-y-auto border border-white/10 bg-black/90 p-3 shadow-2xl backdrop-blur-xl"
            style={{ maxHeight: "calc(100dvh - 88px)" }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
              <div>
                <div className="text-[11px] font-semibold text-zinc-200">Communities of interest</div>
                <div className="mt-0.5 text-[9px] text-zinc-600">
                  Context overlays with submitter provenance — never scored
                </div>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] font-mono text-zinc-300 select-none">
                <input
                  type="checkbox"
                  checked={showCois}
                  onChange={() => toggleResearchLayer("coi-overlays")}
                  className="h-3 w-3 accent-amber-500"
                />
                Show on map
              </label>
            </div>

            {coiError && (
              <div className="mt-2 border border-red-500/25 bg-red-500/10 px-2 py-1.5 text-[10px] leading-snug text-red-300">
                {coiError}
              </div>
            )}

            {!coiEntries && !coiError && (
              <div className="mt-2 text-[10px] text-zinc-500">Loading COI registry…</div>
            )}

            {coiEntries && coiEntries.length === 0 && (
              <div className="mt-2 text-[10px] text-zinc-500">No communities registered yet.</div>
            )}

            {coiEntries?.map((entry) => {
              const summary = coiSummaries[entry.id];
              if (!summary) return null;
              const gate = getCoiFractureGate(summary);

              return (
                <div key={entry.id} className="mt-2 border border-white/10 bg-white/[0.02] p-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: COI_OVERLAY_COLOR }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-zinc-200" title={summary.name}>
                      {summary.name}
                    </span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-mono uppercase ${
                      summary.status === "published"
                        ? "bg-emerald-400/15 text-emerald-300"
                        : summary.status === "draft"
                          ? "bg-cyan-400/15 text-cyan-300"
                          : "bg-amber-400/15 text-amber-300"
                    }`}>
                      {summary.status}
                    </span>
                  </div>

                  <div className="mt-1.5 space-y-0.5 text-[9px] leading-snug text-zinc-500">
                    <div>
                      <span className="font-mono uppercase text-zinc-600">Submitter:</span> {summary.submitter.name} ({summary.submitter.type})
                    </div>
                    <div>
                      <span className="font-mono uppercase text-zinc-600">Source:</span> {summary.source.description}
                    </div>
                    <div>
                      <span className="font-mono uppercase text-zinc-600">Collected:</span> {summary.source.collectedAt} · {summary.source.method}
                    </div>
                  </div>

                  {!gate.allowed && (
                    <div className="mt-1.5 border border-amber-400/30 bg-amber-400/10 px-2 py-1.5">
                      <div className="text-[9px] font-mono uppercase tracking-wide text-amber-300">
                        Fracture claims blocked
                      </div>
                      {gate.blockers.map((blocker) => (
                        <div key={blocker} className="mt-1 text-[9px] leading-snug text-amber-200/80">
                          {blocker}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-1.5">
                    <div className="text-[9px] font-mono uppercase tracking-wide text-zinc-600">
                      District fracture · {summary.fracture.cellCount} cells · {summary.fracture.population.toLocaleString()} people
                    </div>
                    <div className="mt-1 space-y-1">
                      {summary.fracture.plans.map((planFracture) => {
                        const planName = planRegistryById.get(planFracture.planId)?.name ?? planFracture.planId;
                        return (
                          <div key={planFracture.planId} className="border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[9.5px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="min-w-0 flex-1 truncate text-zinc-400" title={planName}>{planName}</span>
                              <span className="shrink-0 font-mono text-zinc-200">
                                {planFracture.districtsTouched} district{planFracture.districtsTouched === 1 ? "" : "s"}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[8.5px] text-zinc-600">
                              largest share {(planFracture.largestShare * 100).toFixed(1)}%
                              {gate.allowed ? "" : " · preview"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-1 text-[8px] font-mono text-zinc-700">
                      claim tag: {summary.fracture.claimTag} · a fractured community is a review question, not a violation
                    </div>
                  </div>

                  <div className="mt-1.5 border-t border-white/10 pt-1.5 text-[8.5px] leading-snug text-zinc-600">
                    {summary.caveats[0]}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>

        <div>
        <button
          type="button"
          onClick={() => setEnsembleOpen((open) => !open)}
          aria-expanded={ensembleOpen}
          className={`px-2.5 py-2 rounded-lg backdrop-blur-xl shadow-lg transition-all inline-flex items-center gap-2 ${
            ensembleOpen || showEnsemble
              ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
              : "bg-black/60 text-zinc-400 border border-white/10 hover:text-zinc-200"
          }`}
        >
          <Hexagon className="h-4 w-4" aria-hidden="true" />
          <span className="text-[11px] font-mono">Ensemble</span>
          {showEnsemble && (
            <span className="rounded bg-teal-400/20 px-1.5 py-0.5 text-[9px] font-mono text-teal-200">on</span>
          )}
        </button>

        {ensembleOpen && (
          <div
            className="mt-2 w-80 overflow-y-auto border border-white/10 bg-black/90 p-3 shadow-2xl backdrop-blur-xl"
            style={{ maxHeight: "calc(100dvh - 88px)" }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
              <div>
                <div className="text-[11px] font-semibold text-zinc-200">Ensemble explainer</div>
                <div className="mt-0.5 text-[9px] text-zinc-600">
                  {ensembleEntry ? ensembleEntry.name : "Registered ensemble summary"}
                </div>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] font-mono text-zinc-300 select-none">
                <input
                  type="checkbox"
                  checked={showEnsemble}
                  onChange={() => toggleResearchLayer("ensemble-summary")}
                  className="h-3 w-3 accent-teal-500"
                />
                Show bands
              </label>
            </div>

            {ensembleError && (
              <div className="mt-2 border border-red-500/25 bg-red-500/10 px-2 py-1.5 text-[10px] leading-snug text-red-300">
                {ensembleError}
              </div>
            )}

            {!ensembleSummary && !ensembleError && (
              <div className="mt-2 text-[10px] text-zinc-500">
                {showEnsemble ? "Loading ensemble summary…" : "Enable the layer to load the registered ensemble summary."}
              </div>
            )}

            {ensembleSummary && (() => {
              const gate = getEnsembleOutlierGate(ensembleSummary);
              return (
                <>
                  {!gate.allowed && (
                    <div className="mt-2 border border-amber-400/30 bg-amber-400/10 px-2 py-1.5">
                      <div className="text-[9px] font-mono uppercase tracking-wide text-amber-300">
                        Outlier claims blocked
                      </div>
                      {gate.blockers.map((blocker) => (
                        <div key={blocker} className="mt-1 text-[9.5px] leading-snug text-amber-200/80">
                          {blocker}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-2">
                    <div className="text-[9px] font-mono uppercase tracking-wide text-zinc-600">Comparison universe</div>
                    <div className="mt-1 text-[9.5px] leading-snug text-zinc-400">
                      {ensembleSummary.method.generator} · {ensembleSummary.method.planCount.toLocaleString()} plans
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {ensembleSummary.method.constraints.map((constraint) => (
                        <div key={constraint.id} className="border border-white/10 bg-white/[0.03] px-2 py-1 text-[9.5px] leading-snug">
                          <span className="font-mono text-zinc-400">{constraint.id}</span>
                          <span className="text-zinc-500"> — {constraint.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className="text-[9px] font-mono uppercase tracking-wide text-zinc-600">
                      {ensembleSummary.seatMeasure.label}
                    </div>
                    <div className="mt-1 space-y-1">
                      {ensembleSummary.seatMeasure.comparedPlans.map((compared) => {
                        const band = ENSEMBLE_BAND_STYLES[classifyEnsemblePercentile(compared.percentile)];
                        const planName = planRegistryById.get(compared.planId)?.name ?? compared.planId;
                        return (
                          <div key={compared.planId} className="flex items-center justify-between gap-2 border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[9.5px]">
                            <span className="min-w-0 flex-1 truncate text-zinc-400" title={planName}>{planName}</span>
                            <span className="shrink-0 font-mono text-zinc-200">{compared.value}</span>
                            <span
                              className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[8.5px] text-black/80"
                              style={{ backgroundColor: band.color }}
                            >
                              p{compared.percentile.toFixed(1)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className="text-[9px] font-mono uppercase tracking-wide text-zinc-600">Percentile bands</div>
                    <div className="mt-1 space-y-0.5">
                      {Object.values(ENSEMBLE_BAND_STYLES).map((band) => (
                        <div key={band.label} className="flex items-center gap-2 text-[9.5px] text-zinc-400">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: band.color }} />
                          {band.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-2 border-t border-white/10 pt-2 text-[8.5px] leading-snug text-zinc-600">
                    {ensembleSummary.caveats[0]}
                  </div>
                </>
              );
            })()}
          </div>
        )}
        </div>
      </div>

      {/* Gear button — top right, with safe-area inset for iPad */}
      <div className="absolute z-[1000]" style={{ top: 'max(12px, env(safe-area-inset-top, 12px))', right: 'max(12px, env(safe-area-inset-right, 12px))' }}>
        <button
          type="button"
          onClick={() => setSettingsOpen((o) => !o)}
          aria-label={settingsOpen ? "Close map settings" : "Open map settings"}
          aria-expanded={settingsOpen}
          className={`p-2.5 rounded-lg backdrop-blur-xl shadow-lg transition-all ${
            settingsOpen
              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
              : "bg-black/60 text-zinc-400 border border-white/10 hover:text-zinc-200"
          }`}
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
        </button>

        {/* Settings panel — scrollable, max-height to stay on screen */}
        {settingsOpen && (
          <div className="mt-2 w-64 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-3 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 100px)' }}>
            {/* Layer A */}
            <div>
              <div className="text-[11px] font-semibold text-zinc-300 mb-1.5">Layer A <span className="text-zinc-500 font-normal">(region)</span></div>
              <div className="space-y-0.5">
                {LAYER_A_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    disabled={opt.disabled}
                    onClick={() => !opt.disabled && setLayerAMode(opt.value)}
                    className={`flex items-center gap-2 w-full px-2 py-1 rounded text-[11px] transition-colors ${
                      opt.disabled
                        ? "text-zinc-600 cursor-not-allowed"
                        : layerAMode === opt.value
                          ? "text-cyan-400"
                          : "text-zinc-400 hover:text-zinc-300"
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      opt.disabled ? "border-zinc-700" :
                      layerAMode === opt.value ? "border-cyan-400" : "border-zinc-600"
                    }`}>
                      {layerAMode === opt.value && !opt.disabled && (
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      )}
                    </div>
                    <span>{opt.label}</span>
                    {opt.hint && (
                      <span className="text-[9px] text-zinc-600 ml-auto">({opt.hint})</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-1.5">
                <div className="text-[9px] text-zinc-500 mb-1 px-1">Color metric</div>
                <div className="flex flex-wrap gap-1 px-1">
                  {metricOptions.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setLayerAMetric(m.value)}
                      title={m.desc}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        layerAMetric === m.value
                          ? "bg-white/10 text-cyan-400"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-white/10" />

            {/* Layer B */}
            <div>
              <div className="text-[11px] font-semibold text-zinc-300 mb-1.5">Layer B <span className="text-zinc-500 font-normal">(detail)</span></div>
              <div className="space-y-0.5">
                <button
                  onClick={() => setLayerBManual(false)}
                  className={`flex items-center gap-2 w-full px-2 py-1 rounded text-[11px] transition-colors ${
                    !layerBManual ? "text-cyan-400" : "text-zinc-400 hover:text-zinc-300"
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    !layerBManual ? "border-cyan-400" : "border-zinc-600"
                  }`}>
                    {!layerBManual && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                  </div>
                  <span>Auto <span className="text-zinc-500">(zoom-adaptive)</span></span>
                </button>
                <div className="flex items-center gap-2 px-2 py-1">
                  <button
                    onClick={() => setLayerBManual(true)}
                    className={`flex items-center gap-2 text-[11px] flex-shrink-0 ${
                      layerBManual ? "text-cyan-400" : "text-zinc-400"
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      layerBManual ? "border-cyan-400" : "border-zinc-600"
                    }`}>
                      {layerBManual && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                    </div>
                    <span>Manual</span>
                  </button>
                  <input
                    type="range"
                    min={3}
                    max={10}
                    step={1}
                    value={layerBManualRes}
                    onChange={(e) => {
                      setLayerBManualRes(Number(e.target.value));
                      setLayerBManual(true);
                    }}
                    className={`flex-1 h-1 accent-cyan-500 cursor-pointer ${!layerBManual ? "opacity-30" : ""}`}
                  />
                  <span className={`text-[9px] font-mono w-5 text-right ${layerBManual ? "text-zinc-400" : "text-zinc-600"}`}>
                    r{layerBManual ? layerBManualRes : resolution}
                  </span>
                </div>
                <label className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={bivariate}
                    onChange={() => setBivariate((v) => !v)}
                    className="accent-cyan-500 w-3 h-3"
                  />
                  Bivariate
                  <span className="text-[9px] text-zinc-600 ml-auto">(saturation + weight)</span>
                </label>
              </div>
              <div className="mt-1.5">
                <div className="text-[9px] text-zinc-500 mb-1 px-1">Color metric</div>
                <div className="flex flex-wrap gap-1 px-1">
                  {metricOptions.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setLayerBMetric(m.value)}
                      title={m.desc}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        layerBMetric === m.value
                          ? "bg-white/10 text-cyan-400"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-white/10" />

            {/* Research layers */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[11px] font-semibold text-zinc-300">Research layers</div>
                <span className="text-[9px] text-zinc-600">{activeResearchLayers.length} active</span>
              </div>
              <div className="space-y-2">
                {layerGroups.map((group) => (
                  <div key={group.group} className="space-y-0.5">
                    <div className="flex items-center justify-between px-1">
                      <div className="text-[9px] uppercase tracking-wide text-zinc-600">{group.group}</div>
                      <div className="text-[8px] font-mono text-zinc-700">{group.enabledCount}/{group.availableCount}</div>
                    </div>
                    {group.layers.map((layer) => (
                      <label
                        key={layer.id}
                        title={layer.disabled ? layer.reason : layer.description}
                        className={`block rounded px-1.5 py-1 transition-colors ${
                          layer.disabled
                            ? "cursor-not-allowed opacity-55"
                            : "cursor-pointer hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <input
                            type="checkbox"
                            checked={layer.enabled}
                            disabled={layer.disabled}
                            onChange={() => toggleResearchLayer(layer.id)}
                            className="accent-cyan-500 w-3 h-3"
                          />
                          <span className={layer.enabled ? "text-cyan-400" : "text-zinc-300"}>{layer.label}</span>
                          <span className={`ml-auto text-[8px] font-mono ${
                            layer.status === "available" ? "text-emerald-500/70" : "text-zinc-600"
                          }`}>
                            {layer.status}
                          </span>
                        </div>
                        <div className="pl-5 pr-1 mt-0.5 text-[9px] leading-snug text-zinc-600">
                          {layer.description}
                        </div>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10" />

            {/* Overlay visibility */}
            <div>
              <div className="text-[11px] font-semibold text-zinc-300 mb-1.5">Overlay visibility</div>
              <div className="flex items-center gap-4 px-2">
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showLayerA}
                    onChange={() => setShowLayerA((v) => !v)}
                    className="accent-cyan-500 w-3 h-3"
                  />
                  Layer A
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showLayerB}
                    onChange={() => setShowLayerB((v) => !v)}
                    className="accent-cyan-500 w-3 h-3"
                  />
                  Layer B
                </label>
              </div>
            </div>

            <div className="border-t border-white/10" />

            {/* Layer order */}
            <div>
              <div className="text-[11px] font-semibold text-zinc-300 mb-1.5">Layer order</div>
              <div className="space-y-1 px-1">
                {(layerOrderSwapped
                  ? [
                      { label: "Layer B", sub: "detail", pos: "bottom" },
                      { label: "Layer A", sub: "region", pos: "top" },
                    ]
                  : [
                      { label: "Layer A", sub: "region", pos: "bottom" },
                      { label: "Layer B", sub: "detail", pos: "top" },
                    ]
                ).map((item, i) => (
                  <div key={item.label} className="flex items-center gap-2 text-[10px]">
                    <span className={`w-4 text-center font-mono ${i === 1 ? "text-zinc-400" : "text-zinc-600"}`}>
                      {i === 1 ? "▲" : "▼"}
                    </span>
                    <span className={`${i === 1 ? "text-zinc-300" : "text-zinc-500"}`}>
                      {item.label} <span className="text-zinc-600">({item.sub})</span>
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="w-4 text-center font-mono text-zinc-300">▲</span>
                  <span className="text-zinc-400">Districts <span className="text-zinc-600">(always top)</span></span>
                </div>
                <button
                  onClick={() => setLayerOrderSwapped((v) => !v)}
                  className="mt-1 px-2 py-1 rounded text-[10px] font-medium text-zinc-400 hover:text-cyan-400 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  ↕ Swap A / B
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {results.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-[400] pointer-events-none">
          <div className="text-center">
            <Hexagon className="h-16 w-16 mx-auto mb-3 text-cyan-500/20" />
            <h3 className="text-lg font-medium text-zinc-400 mb-1">
              No voting data loaded
            </h3>
            <p className="text-sm text-zinc-600">
              Load precinct data to see the hex grid overlay
            </p>
          </div>
        </div>
      )}

      <style jsx global>{`
        .honeycomb-tooltip {
          background: rgba(0, 0, 0, 0.92) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          border-radius: 8px !important;
          color: white !important;
          padding: 8px 12px !important;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5) !important;
        }
        .honeycomb-tooltip::before {
          border-top-color: rgba(0, 0, 0, 0.92) !important;
        }
        .leaflet-tooltip {
          background: rgba(0, 0, 0, 0.92) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          border-radius: 8px !important;
          color: white !important;
          padding: 8px 12px !important;
        }
        .leaflet-tooltip-top::before {
          border-top-color: rgba(0, 0, 0, 0.92) !important;
        }
      `}</style>
    </div>
  );
}
