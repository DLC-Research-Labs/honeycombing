"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Database, MapPinned, MessageCircle, X } from "lucide-react";
import Legend from "./components/Legend";
import { copyTextToClipboard } from "@/app/lib/browser-clipboard";
import type { VoteMetric, PrecinctResult } from "@/app/lib/vote-types";
import { getDefaultMetricForDatasetKind, getMetricOptionsForDatasetKind } from "@/app/lib/vote-types";
import type { HexStats, MapFocusBounds, SelectionStats } from "./components/HoneycombMap";
import {
  DATASETS,
  DEFAULT_CASE_STUDY_ID,
  DEFAULT_DATASET_ID,
  DEFAULT_VIEW_PRESET_ID,
  DEFAULT_YEAR,
  ELECTION_YEARS,
  VIEW_PRESETS,
  buildDatasetStatus,
  getCaseStudy,
  getCaseStudyPacketUrl,
  getNamedSelectionsPacketUrl,
  getHeadlineFindingUrl,
  getDatasetModeGuide,
  getDatasetKind,
  getDatasetNote,
  getDatasetProvenance,
  getDatasetUnitLabel,
  getDatasetUrl,
  getDisplayYear,
  getHoneycombMapInstanceKey,
  getViewPreset,
  getViewPresetTransition,
  withBasePath,
  type CaseStudyId,
  type DatasetId,
  type ViewPreset,
  type ViewPresetId,
} from "@/app/lib/honeycomb-ui-helpers";

interface DatasetManifest {
  generated_at?: string;
  method?: string;
  source_input?: string;
  source_sha256?: string;
  output?: string;
  input_records?: number;
  output_records?: number;
  h3_resolution?: number;
  input_totals?: {
    total_population?: number;
    voting_age_population?: number;
  };
  output_totals?: {
    total_population?: number;
    voting_age_population?: number;
  };
}

interface ManifestState {
  url: string;
  data?: DatasetManifest;
  error?: string;
}

interface StarterSelectionPlanTouch {
  planId: string;
  name: string;
  districtsTouched: number;
  districtIds: string[];
  h3CoveragePct: number;
}

interface StarterSelection {
  id: string;
  name: string;
  shortName: string;
  description: string;
  reviewerPrompt: string;
  bounds: Omit<MapFocusBounds, "nonce">;
  center: { lat: number; lng: number };
  zoom: number;
  h3Cells: number;
  population: {
    total: number;
    nonwhitePct: number;
    blackPct: number;
    hispanicPct: number;
  };
  electionSignal: {
    precincts: number;
    totalVotes: number;
    demPct: number;
    repPct: number;
    marginPct: number;
    lean: string;
  };
  planTouches: StarterSelectionPlanTouch[];
}

interface CaseStudyPacket {
  starterSelections?: StarterSelection[];
}

interface NamedSelectionDistrictFlow {
  fromDistrictId: string;
  toDistrictId: string;
  h3Cells: number;
  population: number;
}

interface NamedSelectionRegion {
  id: string;
  legalFrame: string;
  boundaryDelta: {
    basePlanName: string;
    comparePlanName: string;
    h3CellsCompared: number;
    h3CellsReassigned: number;
    reassignedCellPct: number;
    populationInReassignedCells: number;
    populationInReassignedCellsPct: number;
    reassignedPrecinctSignal: {
      precinctsReassigned: number;
      demPct: number;
      repPct: number;
      lean: string;
    };
    districtFlows: NamedSelectionDistrictFlow[];
    interpretationNote: string;
  };
  deviationLedgerSeed: {
    question: string;
    status: string;
    neededData?: string;
  }[];
}

interface NamedSelectionsPacket {
  regions?: NamedSelectionRegion[];
}

interface HeadlineFinding {
  headline: string;
  shortHeadline: string;
  methodNote: string;
  stat: {
    planName: string;
    planSeats: number;
    districtCount: number;
    ensembleMedianSeats: number;
    planCount: number;
    plansAbove: number;
    plansAbovePct: number;
    percentile: number;
    band: string;
  };
  provenance: {
    inputs: { description: string; sourceUrl: string; status: string }[];
    voteProxy: string;
  };
  caveats: string[];
}

function districtLabel(districtId: string): string {
  const district = Number(districtId.slice(2));
  return Number.isFinite(district) && districtId.startsWith("37") ? `CD ${district}` : districtId;
}

function compactHash(value?: string): string {
  return value ? `${value.slice(0, 10)}…${value.slice(-8)}` : "Unavailable";
}

function formatManifestNumber(value?: number): string {
  return typeof value === "number" ? value.toLocaleString() : "Unavailable";
}

const HoneycombMap = dynamic(() => import("./components/HoneycombMap"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-black">
      <div className="text-zinc-600 text-sm">Loading map…</div>
    </div>
  ),
});

export default function Home() {
  const [caseStudyId] = useState<CaseStudyId>(DEFAULT_CASE_STUDY_ID);
  const [dataset, setDataset] = useState<DatasetId>(DEFAULT_DATASET_ID);
  const [activePresetId, setActivePresetId] = useState<ViewPresetId>(DEFAULT_VIEW_PRESET_ID);
  const datasetKind = getDatasetKind(dataset);
  const unitLabel = getDatasetUnitLabel(dataset);
  const recordLabel = dataset === "blocks" ? "block-H3 cells" : unitLabel;
  const metricOptions = getMetricOptionsForDatasetKind(datasetKind);
  const initialMetric = getDefaultMetricForDatasetKind(datasetKind);
  const caseStudy = getCaseStudy(caseStudyId);
  const datasetGuide = getDatasetModeGuide(dataset);
  const activePreset = getViewPreset(activePresetId);
  const [layerBMetric, setLayerBMetric] = useState<VoteMetric>(
    getDefaultMetricForDatasetKind(getDatasetKind(DEFAULT_DATASET_ID)),
  );
  const [results, setResults] = useState<PrecinctResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [hexStats, setHexStats] = useState<HexStats | null>(null);
  const [selectionPhase, setSelectionPhase] = useState<"idle" | "selecting" | "locked">("idle");
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const [selectionStats, setSelectionStats] = useState<SelectionStats | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("Copied!");
  const [dataPanelOpen, setDataPanelOpen] = useState(false);
  const [startersOpen, setStartersOpen] = useState(false);
  const [sidekickOpen, setSidekickOpen] = useState(false);
  const [caseStudyPacket, setCaseStudyPacket] = useState<CaseStudyPacket | null>(null);
  const [namedSelections, setNamedSelections] = useState<NamedSelectionsPacket | null>(null);
  const [headlineFinding, setHeadlineFinding] = useState<HeadlineFinding | null>(null);
  const [findingOpen, setFindingOpen] = useState(false);
  const [activeStarterId, setActiveStarterId] = useState<string | null>(null);
  const [mapFocusBounds, setMapFocusBounds] = useState<MapFocusBounds | null>(null);
  const [manifestState, setManifestState] = useState<ManifestState | null>(null);
  const provenance = getDatasetProvenance(dataset, year, caseStudyId);
  const activeManifest = manifestState && manifestState.url === provenance.manifestUrl ? manifestState.data : undefined;
  const activeManifestError = manifestState && manifestState.url === provenance.manifestUrl ? manifestState.error : undefined;
  const starterSelections = caseStudyPacket?.starterSelections ?? [];
  const activeStarter = starterSelections.find((selection) => selection.id === activeStarterId) ?? null;
  const activeCaseStudyRegion = namedSelections?.regions?.find((region) => region.id === activeStarterId) ?? null;

  const fetchYear = useCallback((y: number, ds: DatasetId = DEFAULT_DATASET_ID, studyId: CaseStudyId = DEFAULT_CASE_STUDY_ID) => {
    const url = getDatasetUrl(ds, y, studyId);
    fetch(withBasePath(url))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
        return r.json();
      })
      .then((data: PrecinctResult[]) => {
        setResults(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load map data:", err);
        setResults([]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchYear(DEFAULT_YEAR, DEFAULT_DATASET_ID, DEFAULT_CASE_STUDY_ID);
  }, [fetchYear]);

  useEffect(() => {
    let cancelled = false;
    fetch(withBasePath(getCaseStudyPacketUrl(caseStudyId)))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((packet: CaseStudyPacket) => {
        if (!cancelled) setCaseStudyPacket(packet);
      })
      .catch(() => {
        if (!cancelled) setCaseStudyPacket(null);
      });

    fetch(withBasePath(getNamedSelectionsPacketUrl(caseStudyId)))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((packet: NamedSelectionsPacket) => {
        if (!cancelled) setNamedSelections(packet);
      })
      .catch(() => {
        if (!cancelled) setNamedSelections(null);
      });

    fetch(withBasePath(getHeadlineFindingUrl(caseStudyId)))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((finding: HeadlineFinding) => {
        if (!cancelled) setHeadlineFinding(finding);
      })
      .catch(() => {
        if (!cancelled) setHeadlineFinding(null);
      });

    return () => {
      cancelled = true;
    };
  }, [caseStudyId]);

  useEffect(() => {
    if (!dataPanelOpen || !provenance.manifestUrl) return;

    let cancelled = false;
    const url = provenance.manifestUrl;
    fetch(withBasePath(url))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: DatasetManifest) => {
        if (!cancelled) setManifestState({ url, data });
      })
      .catch((err) => {
        if (!cancelled) {
          setManifestState({
            url,
            error: err instanceof Error ? err.message : "Failed to load manifest",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dataPanelOpen, provenance.manifestUrl]);

  const handleYearChange = (y: number) => {
    const displayYear = getDisplayYear(dataset, y);
    setYear(displayYear);
    setLoading(true);
    fetchYear(displayYear, dataset, caseStudyId);
  };

  const handleDatasetChange = (ds: DatasetId) => {
    const displayYear = getDisplayYear(ds, year);
    const nextPresetId = ds === "blocks" ? "population-demographics" : "vote-map";
    const transition = getViewPresetTransition(nextPresetId);
    setActivePresetId(nextPresetId);
    setDataset(ds);
    setYear(displayYear);
    setLayerBMetric(getDefaultMetricForDatasetKind(getDatasetKind(ds)));
    setLoading(true);
    fetchYear(displayYear, ds, caseStudyId);
    setDataPanelOpen(transition.opensDataPanel);
    setStartersOpen(transition.opensStarterPanel);
    setSidekickOpen(transition.opensSidekickPanel);
    if (transition.clearsActiveStarter) setActiveStarterId(null);
    if (transition.clearsMapFocus) setMapFocusBounds(null);
  };

  const handlePresetSelect = (preset: ViewPreset) => {
    const displayYear = getDisplayYear(preset.dataset, year);
    const transition = getViewPresetTransition(preset.id);
    setActivePresetId(preset.id);
    setDataset(preset.dataset);
    setYear(displayYear);
    setLayerBMetric(preset.metric);
    setLoading(true);
    fetchYear(displayYear, preset.dataset, caseStudyId);
    setDataPanelOpen(transition.opensDataPanel);
    setStartersOpen(transition.opensStarterPanel);
    setSidekickOpen(transition.opensSidekickPanel);
    if (transition.clearsActiveStarter) setActiveStarterId(null);
    if (transition.clearsMapFocus) setMapFocusBounds(null);
  };

  const showCopyToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  const handleCopyCSV = async () => {
    if (!selectionStats) return;
    if (selectionStats.dataKind === "population") {
      const header = "h3_index,resolution,total_population,voting_age_population,black_population,hispanic_population,nonwhite_population,black_pct,hispanic_pct,nonwhite_pct";
      const rows = selectionStats.hexEntries.map((e) => {
        const hex = e as typeof e & {
          population?: number;
          vap?: number;
          black?: number;
          hispanic?: number;
          nonwhite?: number;
        };
        const population = hex.population ?? 0;
        const blackPct = population > 0 ? (((hex.black ?? 0) / population) * 100).toFixed(2) : "0";
        const hispanicPct = population > 0 ? (((hex.hispanic ?? 0) / population) * 100).toFixed(2) : "0";
        const nonwhitePct = population > 0 ? (((hex.nonwhite ?? 0) / population) * 100).toFixed(2) : "0";
        return `${e.h3Index},${selectionStats.resolution},${population},${hex.vap ?? 0},${hex.black ?? 0},${hex.hispanic ?? 0},${hex.nonwhite ?? 0},${blackPct},${hispanicPct},${nonwhitePct}`;
      });
      const copied = await copyTextToClipboard([header, ...rows].join("\n"));
      showCopyToast(copied ? "Copied!" : "Copy failed");
      return;
    }

    const header = "h3_index,resolution,dem_votes,rep_votes,total_votes,dem_pct,rep_pct,margin";
    const rows = selectionStats.hexEntries.map((e) => {
      const demPct = e.total > 0 ? ((e.dem / e.total) * 100).toFixed(2) : "0";
      const repPct = e.total > 0 ? ((e.rep / e.total) * 100).toFixed(2) : "0";
      const margin = e.total > 0 ? (((e.dem - e.rep) / e.total) * 100).toFixed(2) : "0";
      return `${e.h3Index},${selectionStats.resolution},${e.dem},${e.rep},${e.total},${demPct},${repPct},${margin}`;
    });
    const copied = await copyTextToClipboard([header, ...rows].join("\n"));
    showCopyToast(copied ? "Copied!" : "Copy failed");
  };

  const handleShareLink = () => {
    if (!selectionStats) return;
    const hexIds = selectionStats.hexEntries.map((e) => e.h3Index).join(",");
    window.location.hash = `sel=${hexIds}&year=${year}&layerB=${selectionStats.resolution}&metric=${layerBMetric}`;
  };

  const handleStarterSelect = (selection: StarterSelection) => {
    setActiveStarterId(selection.id);
    setMapFocusBounds((current) => ({ ...selection.bounds, nonce: (current?.nonce ?? 0) + 1 }));
    setStartersOpen(false);
  };

  return (
    <div className="flex flex-col bg-black text-white" style={{ height: '100dvh', overflow: 'hidden' }}>
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 flex-shrink-0" style={{ paddingTop: 'max(10px, env(safe-area-inset-top, 10px))' }}>
        <div className="flex items-center gap-3 flex-shrink-0">
          <h1 className="text-base font-semibold tracking-tight text-zinc-100">
            ⬡ Honeycombing
          </h1>
          <span className="text-[10px] text-zinc-600 font-mono">
            {loading ? `Loading data…` :
              datasetKind === "population" ? `${results.length.toLocaleString()} ${recordLabel} · ${caseStudy.label} Census ${year}` :
              dataset === "precincts" ? `${results.length.toLocaleString()} ${unitLabel} · ${caseStudy.label} VEST ${year}` :
              `${results.length.toLocaleString()} ${unitLabel} · ${year} Presidential`}
          </span>
          <span className="hidden md:inline text-[10px] text-zinc-700 font-mono">
            {caseStudy.fullLabel} study · {getDatasetNote(dataset)}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
          {buildDatasetStatus(DATASETS, ELECTION_YEARS, dataset, year).map((status) => (
            <button
              key={status.year}
              onClick={() => handleYearChange(status.year)}
              disabled={loading || status.disabled}
              title={status.reason}
              className={`px-1.5 py-0.5 text-[11px] font-mono transition-colors ${
                loading || status.disabled ? "opacity-35 cursor-not-allowed" : ""
              } ${
                status.selected
                  ? "text-cyan-400 border-b border-cyan-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {status.label}
            </button>
          ))}
          {/* Dataset switcher */}
          <div className="flex items-center gap-0.5 ml-2 border-l border-white/10 pl-2">
            {DATASETS.map((ds) => (
              <button
                key={ds.id}
                onClick={() => handleDatasetChange(ds.id)}
                disabled={loading}
                className={`px-1.5 py-0.5 text-[11px] font-mono rounded transition-colors ${
                  dataset === ds.id
                    ? "text-cyan-400 bg-cyan-500/10"
                    : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {ds.label}
              </button>
            ))}
          </div>

          {/* About */}
          <Link href="/about" className="ml-2 px-1.5 py-0.5 text-[11px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors border-l border-white/10 pl-2">
            White Paper
          </Link>

          <button
            type="button"
            onClick={() => setDataPanelOpen((open) => !open)}
            aria-expanded={dataPanelOpen}
            className={`ml-1 px-1.5 py-0.5 text-[11px] font-mono rounded transition-colors inline-flex items-center gap-1 ${
              dataPanelOpen
                ? "text-cyan-400 bg-cyan-500/10"
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            <Database size={12} aria-hidden="true" />
            <span>Data</span>
          </button>

          <button
            type="button"
            onClick={() => setStartersOpen((open) => !open)}
            aria-expanded={startersOpen}
            disabled={starterSelections.length === 0}
            className={`ml-1 px-1.5 py-0.5 text-[11px] font-mono rounded transition-colors inline-flex items-center gap-1 ${
              startersOpen || activeStarter
                ? "text-amber-300 bg-amber-500/10"
                : "text-zinc-600 hover:text-zinc-400"
            } ${starterSelections.length === 0 ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <MapPinned size={12} aria-hidden="true" />
            <span>Starters</span>
          </button>

          <button
            onClick={() => {
              if (selectionPhase === "idle") setSelectionPhase("selecting");
            }}
            className={`ml-2 px-2 py-0.5 text-[11px] font-mono rounded transition-colors ${
              selectionPhase !== "idle"
                ? "text-amber-400 bg-amber-500/10 border border-amber-500/30"
                : "text-zinc-500 hover:text-zinc-300 border border-transparent"
            }`}
          >
            ◎ Select
          </button>
        </div>
      </header>

      <div className="flex flex-shrink-0 items-center gap-2 overflow-x-auto border-b border-white/5 bg-zinc-950/80 px-4 py-2">
        <div className="flex items-center gap-1">
          {VIEW_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetSelect(preset)}
              className={`whitespace-nowrap rounded border px-2 py-1 text-[10px] font-mono transition-colors ${
                activePresetId === preset.id
                  ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-200"
                  : "border-white/10 bg-white/[0.03] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span className="hidden text-zinc-600 sm:inline">{preset.eyebrow}: </span>
              {preset.label}
            </button>
          ))}
        </div>
        <div className="ml-auto hidden min-w-0 items-center gap-2 text-[10px] font-mono text-zinc-500 lg:flex">
          <span className="shrink-0 text-cyan-400">{activePreset.label}</span>
          <span className="truncate">{activePreset.summary}</span>
        </div>
        <button
          type="button"
          onClick={() => setSidekickOpen((open) => !open)}
          aria-expanded={sidekickOpen}
          className={`ml-1 inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-mono transition-colors ${
            sidekickOpen
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
              : "border-white/10 bg-white/[0.03] text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <MessageCircle size={12} aria-hidden="true" />
          Sidekick
        </button>
      </div>

      <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/5 bg-black px-4 py-1.5 text-[10px] font-mono">
        <span className="shrink-0 rounded bg-white/[0.04] px-1.5 py-0.5 text-zinc-300">{datasetGuide.label}</span>
        <span className="min-w-0 truncate text-zinc-500">{datasetGuide.primaryQuestion}</span>
        <span className="hidden min-w-0 truncate text-zinc-700 md:block">{datasetGuide.redBlueRule}</span>
        <Link
          href="/limits"
          className="ml-auto shrink-0 rounded border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-amber-300 transition-colors hover:bg-amber-500/15"
        >
          Prototype — not legal evidence
        </Link>
      </div>

      {/* Headline finding banner */}
      {headlineFinding && (
        <div className="flex flex-shrink-0 items-start gap-2 border-b border-cyan-500/15 bg-cyan-500/[0.05] px-4 py-1.5 font-mono text-[11px]">
          <span className="mt-px shrink-0 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-cyan-300">
            Finding
          </span>
          <span className="min-w-0 leading-snug text-zinc-200">
            {headlineFinding.headline}{" "}
            <button
              type="button"
              onClick={() => setFindingOpen((open) => !open)}
              aria-expanded={findingOpen}
              className="text-cyan-400 underline decoration-cyan-400/40 underline-offset-2 transition-colors hover:text-cyan-300"
            >
              method
            </button>
            <span className="text-zinc-600"> · </span>
            <Link
              href="/limits"
              className="text-amber-300/90 underline decoration-amber-400/40 underline-offset-2 transition-colors hover:text-amber-300"
            >
              limits
            </Link>
          </span>
        </div>
      )}

      {/* Headline finding detail card */}
      {headlineFinding && findingOpen && (
        <aside className="fixed left-3 top-32 z-[1250] w-[min(440px,calc(100vw-24px))] max-h-[calc(100dvh-152px)] overflow-auto border border-cyan-500/25 bg-zinc-950/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-400">Headline Finding · NC case study</div>
              <h2 className="mt-1 text-sm font-semibold text-zinc-100">Enacted plan vs neutral ensemble</h2>
            </div>
            <button
              type="button"
              onClick={() => setFindingOpen(false)}
              aria-label="Close headline finding detail"
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-4 px-4 py-3 text-[11px] font-mono">
            <div className="border border-cyan-500/20 bg-cyan-500/[0.05] px-3 py-2.5">
              <div className="text-2xl font-semibold tracking-tight text-cyan-200">
                {headlineFinding.stat.planSeats} of {headlineFinding.stat.districtCount}
              </div>
              <div className="mt-1 leading-relaxed text-zinc-300">
                Democratic-leaning districts under the {headlineFinding.stat.planName} — {headlineFinding.stat.plansAbovePct}% of{" "}
                {headlineFinding.stat.planCount.toLocaleString()} neutral simulated maps produce more.
              </div>
            </div>

            <section className="grid grid-cols-3 gap-2">
              <div className="border border-white/10 bg-white/[0.03] px-2 py-1.5">
                <div className="text-zinc-500">Ensemble median</div>
                <div className="mt-1 text-zinc-200">{headlineFinding.stat.ensembleMedianSeats} seats</div>
              </div>
              <div className="border border-white/10 bg-white/[0.03] px-2 py-1.5">
                <div className="text-zinc-500">Percentile</div>
                <div className="mt-1 text-zinc-200">{headlineFinding.stat.percentile}</div>
              </div>
              <div className="border border-white/10 bg-white/[0.03] px-2 py-1.5">
                <div className="text-zinc-500">Band</div>
                <div className="mt-1 text-zinc-200">{headlineFinding.stat.band.replace("_", " ")}</div>
              </div>
            </section>

            <section className="space-y-1.5">
              <div className="text-zinc-500">Method</div>
              <p className="leading-relaxed text-zinc-300">{headlineFinding.methodNote}</p>
            </section>

            <section className="space-y-1.5">
              <div className="text-zinc-500">Source</div>
              {headlineFinding.provenance.inputs.map((input) => (
                <p key={input.sourceUrl} className="leading-relaxed text-zinc-400">
                  {input.description} (
                  <a
                    href={input.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 underline decoration-cyan-400/40 underline-offset-2 hover:text-cyan-300"
                  >
                    doi:10.7910/DVN/SLCD3E
                  </a>
                  , status: {input.status})
                </p>
              ))}
              <p className="leading-relaxed text-zinc-500">{headlineFinding.provenance.voteProxy}</p>
            </section>

            <section className="space-y-2">
              <div className="text-zinc-500">Cite carefully</div>
              <ul className="space-y-1.5 text-zinc-400">
                {headlineFinding.caveats.map((caveat) => (
                  <li key={caveat} className="leading-relaxed">- {caveat}</li>
                ))}
              </ul>
            </section>

            <Link
              href="/limits"
              className="inline-block rounded border border-amber-400/25 bg-amber-500/10 px-2 py-1 text-amber-300 transition-colors hover:bg-amber-500/15"
            >
              Read /limits before citing this number →
            </Link>
          </div>
        </aside>
      )}

      {/* Stats bar / Selection banner */}
      {selectionPhase === "selecting" ? (
        <div className="flex items-center gap-4 px-4 py-1.5 border-b border-amber-500/20 bg-amber-500/10 text-[11px] font-mono flex-shrink-0">
          <span className="text-amber-400 font-semibold">◎ Selection Mode</span>
          <span className="text-amber-300/70">{selectionStats?.selectedCount ?? 0} hexes selected</span>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setSelectionResetKey((k) => k + 1)}
              className="text-amber-400/60 hover:text-amber-400 transition-colors"
            >
              ↺ Reset
            </button>
            <button
              onClick={() => setSelectionPhase("locked")}
              className="text-amber-400/60 hover:text-amber-400 transition-colors"
            >
              Exit
            </button>
          </div>
        </div>
      ) : hexStats ? (
        <div className="flex items-center gap-4 px-4 py-1.5 border-b border-white/5 bg-black/40 text-[10px] font-mono flex-shrink-0">
          <span className="text-zinc-500">Layer B · r{hexStats.res} · <span className="text-zinc-300">{hexStats.hexCount.toLocaleString()} hexes</span></span>
          {hexStats.dataKind === "population" ? (
            <>
              <span className="text-cyan-400">Pop {hexStats.totalPopulation.toLocaleString()}</span>
              <span className="text-teal-400">VAP {hexStats.votingAgePopulation.toLocaleString()}</span>
              <span className="text-zinc-600 ml-auto">
                source: {hexStats.unitLabel} · nonwhite {hexStats.totalPopulation > 0 ? ((hexStats.nonwhitePopulation / hexStats.totalPopulation) * 100).toFixed(1) : "0.0"}%
                {" "}<span className="text-zinc-700">| Black {hexStats.totalPopulation > 0 ? ((hexStats.blackPopulation / hexStats.totalPopulation) * 100).toFixed(1) : "0.0"}% · Hispanic {hexStats.totalPopulation > 0 ? ((hexStats.hispanicPopulation / hexStats.totalPopulation) * 100).toFixed(1) : "0.0"}%</span>
              </span>
            </>
          ) : (
            <>
              <span className="text-blue-400">D {hexStats.demHexes.toLocaleString()}</span>
              <span className="text-red-400">R {hexStats.repHexes.toLocaleString()}</span>
              <span className="text-purple-400">~ {hexStats.tossupHexes.toLocaleString()}</span>
              {hexStats.hexCount > 0 && (
                <span className="text-zinc-600 ml-auto">
                  raw hexes: D {((hexStats.demHexes / hexStats.hexCount) * 100).toFixed(0)}% ·
                  R {((hexStats.repHexes / hexStats.hexCount) * 100).toFixed(0)}%
                  {" "}<span className="text-zinc-700">| vote signal: D {hexStats.demVoteShare.toFixed(1)}% · R {hexStats.repVoteShare.toFixed(1)}%</span>
                </span>
              )}
            </>
          )}
        </div>
      ) : null}

      {/* Data provenance panel */}
      {dataPanelOpen && (
        <aside className="fixed right-3 top-14 z-[1200] w-[min(420px,calc(100vw-24px))] max-h-[calc(100dvh-72px)] overflow-auto border border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-400">Data Provenance</div>
              <h2 className="mt-1 text-sm font-semibold text-zinc-100">{provenance.title}</h2>
            </div>
            <button
              type="button"
              onClick={() => setDataPanelOpen(false)}
              aria-label="Close data provenance panel"
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-4 px-4 py-3 text-[11px] font-mono">
            <section className="space-y-1.5">
              <div className="text-zinc-500">Source</div>
              <p className="leading-relaxed text-zinc-300">{provenance.source}</p>
            </section>

            <section className="space-y-1.5">
              <div className="text-zinc-500">Method</div>
              <p className="leading-relaxed text-zinc-300">{activeManifest?.method ?? provenance.method}</p>
            </section>

            <section className="grid grid-cols-2 gap-2">
              <div className="border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="text-zinc-500">Payload</div>
                <div className="mt-1 break-all text-zinc-300">{provenance.payloadUrl}</div>
              </div>
              <div className="border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="text-zinc-500">Manifest</div>
                <div className="mt-1 break-all text-zinc-300">{provenance.manifestUrl ?? "Not available for this layer"}</div>
              </div>
            </section>

            {provenance.manifestUrl && (
              <section className="space-y-2 border border-cyan-500/20 bg-cyan-500/[0.04] px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-cyan-300">Manifest Check</div>
                  <div className="text-zinc-500">
                    {activeManifest ? "Loaded" : activeManifestError ? "Unavailable" : "Loading…"}
                  </div>
                </div>
                {activeManifestError ? (
                  <div className="text-amber-300">Manifest fetch failed: {activeManifestError}</div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-zinc-300">
                    <div>
                      <span className="text-zinc-500">Input rows</span>
                      <br />
                      {formatManifestNumber(activeManifest?.input_records)}
                    </div>
                    <div>
                      <span className="text-zinc-500">Derived rows</span>
                      <br />
                      {formatManifestNumber(activeManifest?.output_records)}
                    </div>
                    <div>
                      <span className="text-zinc-500">Population</span>
                      <br />
                      {formatManifestNumber(activeManifest?.output_totals?.total_population)}
                    </div>
                    <div>
                      <span className="text-zinc-500">VAP</span>
                      <br />
                      {formatManifestNumber(activeManifest?.output_totals?.voting_age_population)}
                    </div>
                    <div>
                      <span className="text-zinc-500">H3 resolution</span>
                      <br />
                      {formatManifestNumber(activeManifest?.h3_resolution ?? provenance.h3Resolution)}
                    </div>
                    <div>
                      <span className="text-zinc-500">Source SHA-256</span>
                      <br />
                      {compactHash(activeManifest?.source_sha256)}
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="space-y-2">
              <div className="text-zinc-500">Caveats</div>
              <ul className="space-y-1.5 text-zinc-400">
                {provenance.caveats.map((caveat) => (
                  <li key={caveat} className="leading-relaxed">- {caveat}</li>
                ))}
              </ul>
            </section>
          </div>
        </aside>
      )}

      {sidekickOpen && (
        <aside className="fixed right-3 bottom-3 z-[1150] w-[min(360px,calc(100vw-24px))] border border-emerald-400/20 bg-zinc-950/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">Sidekick</div>
              <h2 className="mt-1 text-sm font-semibold text-zinc-100">What am I looking at?</h2>
            </div>
            <button
              type="button"
              onClick={() => setSidekickOpen(false)}
              aria-label="Close sidekick"
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-3 px-4 py-3 text-[11px]">
            <div className="rounded border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-2">
              <div className="text-[10px] font-mono uppercase tracking-wide text-emerald-300">{activePreset.label}</div>
              <p className="mt-1 leading-relaxed text-zinc-300">{activePreset.sidekickPrompt}</p>
            </div>
            <div className="grid gap-2 font-mono text-[10px]">
              <div className="border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="text-zinc-500">Mode</div>
                <div className="mt-1 leading-relaxed text-zinc-300">{datasetGuide.primaryQuestion}</div>
              </div>
              <div className="border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="text-zinc-500">Red / Blue</div>
                <div className="mt-1 leading-relaxed text-zinc-300">{datasetGuide.redBlueRule}</div>
              </div>
              <div className="border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="text-zinc-500">Best use</div>
                <div className="mt-1 leading-relaxed text-zinc-300">{datasetGuide.bestUse}</div>
              </div>
            </div>
            {activeStarter ? (
              <div className="border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2 font-mono text-[10px]">
                <div className="text-amber-300">Active starter: {activeStarter.name}</div>
                <div className="mt-1 leading-relaxed text-zinc-300">{activeStarter.reviewerPrompt}</div>
              </div>
            ) : null}
            <div className="font-mono text-[10px] leading-relaxed text-zinc-600">
              Cite carefully: {datasetGuide.caveat}
            </div>
          </div>
        </aside>
      )}

      {startersOpen && (
        <aside className="fixed left-3 top-14 z-[1200] w-[min(380px,calc(100vw-24px))] max-h-[calc(100dvh-72px)] overflow-auto border border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-amber-300">NC Starters</div>
              <h2 className="mt-1 text-sm font-semibold text-zinc-100">Named review regions</h2>
            </div>
            <button
              type="button"
              onClick={() => setStartersOpen(false)}
              aria-label="Close starter selections panel"
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-2 px-3 py-3">
            {starterSelections.map((selection) => {
              const marginLabel = selection.electionSignal.marginPct > 0
                ? `D+${selection.electionSignal.marginPct.toFixed(1)}`
                : selection.electionSignal.marginPct < 0
                  ? `R+${Math.abs(selection.electionSignal.marginPct).toFixed(1)}`
                  : "Even";
              const active = activeStarterId === selection.id;
              return (
                <button
                  type="button"
                  key={selection.id}
                  onClick={() => handleStarterSelect(selection)}
                  className={`w-full border px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-amber-400/40 bg-amber-400/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={active ? "text-[12px] font-semibold text-amber-200" : "text-[12px] font-semibold text-zinc-100"}>
                        {selection.name}
                      </div>
                      <div className="mt-1 text-[10px] leading-snug text-zinc-500">
                        {selection.description}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[10px] font-mono text-zinc-400">
                      {marginLabel}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-[9px] font-mono">
                    <div className="border border-white/5 bg-black/25 px-1.5 py-1">
                      <div className="text-zinc-600">Pop</div>
                      <div className="text-zinc-300">{selection.population.total.toLocaleString()}</div>
                    </div>
                    <div className="border border-white/5 bg-black/25 px-1.5 py-1">
                      <div className="text-zinc-600">Nonwhite</div>
                      <div className="text-zinc-300">{selection.population.nonwhitePct.toFixed(1)}%</div>
                    </div>
                    <div className="border border-white/5 bg-black/25 px-1.5 py-1">
                      <div className="text-zinc-600">H3 cells</div>
                      <div className="text-zinc-300">{selection.h3Cells.toLocaleString()}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      )}

      {activeStarter && (
        <aside className="fixed left-3 bottom-3 z-[1000] w-[min(420px,calc(100vw-24px))] max-h-[min(72dvh,560px)] overflow-auto border border-amber-400/20 bg-zinc-950/92 px-4 py-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-amber-300">Active Starter</div>
              <h2 className="mt-1 text-sm font-semibold text-zinc-100">{activeStarter.name}</h2>
            </div>
            <button
              type="button"
              onClick={() => setActiveStarterId(null)}
              aria-label="Clear active starter selection"
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">{activeStarter.reviewerPrompt}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-mono">
            <div className="border border-white/10 bg-white/[0.03] px-2 py-1.5">
              <div className="text-zinc-600">Vote proxy</div>
              <div className="text-zinc-200">
                D {activeStarter.electionSignal.demPct.toFixed(1)}% · R {activeStarter.electionSignal.repPct.toFixed(1)}%
              </div>
            </div>
            <div className="border border-white/10 bg-white/[0.03] px-2 py-1.5">
              <div className="text-zinc-600">Population</div>
              <div className="text-zinc-200">{activeStarter.population.total.toLocaleString()}</div>
            </div>
          </div>
          <div className="mt-2 space-y-1 text-[10px] font-mono">
            {activeStarter.planTouches
              .filter((plan) => plan.planId !== "us-congress-118-enacted")
              .map((plan) => (
                <div key={plan.planId} className="flex items-start justify-between gap-3 border border-white/10 bg-white/[0.03] px-2 py-1.5">
                  <span className="text-zinc-400">{plan.name}</span>
                  <span className="shrink-0 text-zinc-200">{plan.districtsTouched} districts</span>
                </div>
              ))}
          </div>
          {activeCaseStudyRegion && (
            <div className="mt-3 border-t border-amber-400/15 pt-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-amber-300">
                Case study · court vs enacted
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">{activeCaseStudyRegion.legalFrame}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="border border-white/10 bg-white/[0.03] px-2 py-1.5">
                  <div className="text-zinc-600">Cells reassigned</div>
                  <div className="text-zinc-200">
                    {activeCaseStudyRegion.boundaryDelta.h3CellsReassigned.toLocaleString()} of{" "}
                    {activeCaseStudyRegion.boundaryDelta.h3CellsCompared.toLocaleString()} ({activeCaseStudyRegion.boundaryDelta.reassignedCellPct}%)
                  </div>
                </div>
                <div className="border border-white/10 bg-white/[0.03] px-2 py-1.5">
                  <div className="text-zinc-600">People in moved cells</div>
                  <div className="text-zinc-200">
                    {activeCaseStudyRegion.boundaryDelta.populationInReassignedCells.toLocaleString()} ({activeCaseStudyRegion.boundaryDelta.populationInReassignedCellsPct}%)
                  </div>
                </div>
              </div>
              <div className="mt-1 space-y-1 text-[10px] font-mono">
                {activeCaseStudyRegion.boundaryDelta.districtFlows.slice(0, 3).map((flow) => (
                  <div
                    key={`${flow.fromDistrictId}-${flow.toDistrictId}`}
                    className="flex items-center justify-between gap-3 border border-white/10 bg-white/[0.03] px-2 py-1.5"
                  >
                    <span className="text-zinc-400">
                      {districtLabel(flow.fromDistrictId)} → {districtLabel(flow.toDistrictId)}
                    </span>
                    <span className="shrink-0 text-zinc-200">{flow.population.toLocaleString()} people</span>
                  </div>
                ))}
                {activeCaseStudyRegion.boundaryDelta.districtFlows.length > 3 && (
                  <div className="px-2 text-zinc-600">
                    +{activeCaseStudyRegion.boundaryDelta.districtFlows.length - 3} smaller flows in the packet
                  </div>
                )}
              </div>
              <div className="mt-2 space-y-1">
                {activeCaseStudyRegion.deviationLedgerSeed.map((item) => (
                  <div key={item.question} className="border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[10px] leading-snug">
                    <span
                      className={`mr-1.5 font-mono uppercase ${
                        item.status === "needs-data" ? "text-cyan-400/80" : "text-amber-400/80"
                      }`}
                    >
                      [{item.status}]
                    </span>
                    <span className="text-zinc-400">{item.question}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 font-mono text-[9px] leading-relaxed text-zinc-600">
                Descriptive only — cell centers, not apportionment. Whether any flow is lawful, ensemble-typical, or
                VRA-required is not concluded here.
              </p>
            </div>
          )}
        </aside>
      )}

      {/* Map */}
      <div className="flex-1 relative">
        <HoneycombMap
          key={getHoneycombMapInstanceKey(caseStudyId, dataset)}
          center={[caseStudy.center[0], caseStudy.center[1]]}
          initialZoom={caseStudy.zoom}
          results={results}
          onStatsChange={setHexStats}
          onLayerBMetricChange={setLayerBMetric}
          dataKind={datasetKind}
          unitLabel={unitLabel}
          metricOptions={metricOptions}
          initialMetric={initialMetric}
          activePresetId={activePresetId}
          selectionMode={selectionPhase !== "idle"}
          selectionResetKey={selectionResetKey}
          onSelectionUpdate={setSelectionStats}
          focusBounds={mapFocusBounds}
        />
        <Legend metric={layerBMetric} />
      </div>

      {/* Selection stats panel */}
      {selectionPhase === "locked" && selectionStats && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[1100] transition-transform duration-300"
          style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="bg-zinc-900/95 backdrop-blur-xl border-t border-amber-500/20">
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span className="text-amber-400">◎ Selection: {selectionStats.selectedCount} hexes</span>
                <span className="text-zinc-500">· r{selectionStats.resolution}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectionPhase("selecting")}
                  className="text-[11px] font-mono text-amber-400/70 hover:text-amber-400 transition-colors"
                >
                  ↺ Edit
                </button>
                <button
                  onClick={() => setSelectionPhase("idle")}
                  className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  ✕ Close
                </button>
              </div>
            </div>
            <div className="px-4 py-3 space-y-1.5 text-[11px] font-mono">
              {selectionStats.dataKind === "population" ? (
                <>
                  <div className="text-zinc-300">
                    Total population: <span className="text-zinc-100">{selectionStats.totalPopulation.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-teal-400">
                      VAP: {selectionStats.votingAgePopulation.toLocaleString()}
                    </span>
                    <span className="text-cyan-400">
                      Black: {selectionStats.blackPopulation.toLocaleString()} ({selectionStats.totalPopulation > 0 ? ((selectionStats.blackPopulation / selectionStats.totalPopulation) * 100).toFixed(1) : "0.0"}%)
                    </span>
                    <span className="text-amber-400">
                      Hispanic: {selectionStats.hispanicPopulation.toLocaleString()} ({selectionStats.totalPopulation > 0 ? ((selectionStats.hispanicPopulation / selectionStats.totalPopulation) * 100).toFixed(1) : "0.0"}%)
                    </span>
                  </div>
                  <div className="text-zinc-500">
                    Nonwhite population: <span className="text-zinc-300">{selectionStats.nonwhitePopulation.toLocaleString()} ({selectionStats.totalPopulation > 0 ? ((selectionStats.nonwhitePopulation / selectionStats.totalPopulation) * 100).toFixed(1) : "0.0"}%)</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-zinc-300">
                    Total votes: <span className="text-zinc-100">{selectionStats.totalVotes.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-blue-400">
                      Dem: {selectionStats.demVotes.toLocaleString()} ({selectionStats.totalVotes > 0 ? ((selectionStats.demVotes / selectionStats.totalVotes) * 100).toFixed(1) : "0"}%)
                    </span>
                    <span className="text-red-400">
                      Rep: {selectionStats.repVotes.toLocaleString()} ({selectionStats.totalVotes > 0 ? ((selectionStats.repVotes / selectionStats.totalVotes) * 100).toFixed(1) : "0"}%)
                    </span>
                  </div>
                  {(() => {
                    const margin = selectionStats.totalVotes > 0
                      ? ((selectionStats.demVotes - selectionStats.repVotes) / selectionStats.totalVotes) * 100
                      : 0;
                    const abs = Math.abs(margin);
                    const label = margin > 0 ? `D+${margin.toFixed(1)}%` : margin < 0 ? `R+${abs.toFixed(1)}%` : "Even";
                    const zone = abs < 5 ? "Competitive zone" : abs < 15 ? `Lean ${margin > 0 ? "D" : "R"}` : `Solid ${margin > 0 ? "D" : "R"}`;
                    const signal = abs < 2 ? "Toss-up" : abs < 5 ? `Lean ${margin > 0 ? "Democratic" : "Republican"}` : abs < 15 ? `Likely ${margin > 0 ? "Democratic" : "Republican"}` : `Solid ${margin > 0 ? "Democratic" : "Republican"}`;
                    return (
                      <>
                        <div className="text-zinc-400">
                          Margin: <span className="text-zinc-200">{label}</span>{" "}
                          → <span className={abs < 5 ? "text-purple-400" : "text-zinc-500"}>{zone}</span>
                        </div>
                        <div className="text-zinc-500">
                          Dominant signal: <span className="text-zinc-300">{signal}</span>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
            <div className="px-4 py-2.5 border-t border-white/5 flex items-center gap-4">
              <button onClick={handleCopyCSV} className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors">
                📋 Copy CSV
              </button>
              <button onClick={() => window.print()} className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors">
                🖨 Print View
              </button>
              <button onClick={handleShareLink} className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors">
                ↗ Share Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copied toast */}
      {toastVisible && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[1200] px-4 py-2 bg-zinc-800 text-zinc-200 text-[11px] font-mono rounded-lg shadow-lg border border-white/10">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
