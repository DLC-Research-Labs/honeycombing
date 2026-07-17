"use client";

import type { VoteMetric } from "@/app/lib/vote-types";

interface LegendProps {
  metric: VoteMetric;
}

const LEGEND_CONFIGS: Record<
  VoteMetric,
  { label: string; colors: string[]; labels: [string, string] }
> = {
  population: {
    label: "Population",
    colors: ["#27272a", "#3f3f46", "#22d3ee", "#06b6d4", "#0891b2"],
    labels: ["Low", "High"],
  },
  vap: {
    label: "Voting Age",
    colors: ["#27272a", "#3f3f46", "#22d3ee", "#06b6d4", "#0891b2"],
    labels: ["Low", "High"],
  },
  black_pct: {
    label: "Black %",
    colors: ["#164e63", "#0e7490", "#14b8a6", "#84cc16", "#eab308"],
    labels: ["Low", "High"],
  },
  hispanic_pct: {
    label: "Hispanic %",
    colors: ["#164e63", "#0e7490", "#14b8a6", "#84cc16", "#eab308"],
    labels: ["Low", "High"],
  },
  nonwhite_pct: {
    label: "Nonwhite %",
    colors: ["#164e63", "#0e7490", "#14b8a6", "#84cc16", "#eab308"],
    labels: ["Low", "High"],
  },
  turnout: {
    label: "Turnout",
    colors: ["#27272a", "#3f3f46", "#22d3ee", "#06b6d4", "#0891b2"],
    labels: ["Low", "High"],
  },
  dem_pct: {
    label: "Dem %",
    colors: ["#1e3a5f", "#1e40af", "#2563eb", "#3b82f6", "#60a5fa"],
    labels: ["Low", "High"],
  },
  rep_pct: {
    label: "Rep %",
    colors: ["#5f1e1e", "#991b1b", "#dc2626", "#ef4444", "#f87171"],
    labels: ["Low", "High"],
  },
  margin: {
    label: "Margin",
    colors: ["#dc2626", "#f87171", "#a855f7", "#60a5fa", "#2563eb"],
    labels: ["R+", "D+"],
  },
  competitiveness: {
    label: "Competitiveness",
    colors: ["#27272a", "#71717a", "#a855f7", "#c084fc", "#e879f9"],
    labels: ["Blowout", "Toss-up"],
  },
};

export default function Legend({ metric }: LegendProps) {
  const config = LEGEND_CONFIGS[metric];

  return (
    <div className="absolute z-[1000] pointer-events-none" style={{ bottom: 'max(14px, env(safe-area-inset-bottom, 14px))', left: 'max(12px, env(safe-area-inset-left, 12px))' }}>
      <div className="px-2.5 py-2 rounded-lg bg-black/60 backdrop-blur-xl border border-white/10">
        <p className="text-[9px] text-zinc-500 mb-1.5 font-medium">
          {config.label}
        </p>
        <div className="flex items-center gap-0.5">
          {config.colors.map((color, i) => (
            <div
              key={i}
              className="w-5 h-3 rounded-sm"
              style={{
                backgroundColor: color,
                opacity: 0.3 + (i / (config.colors.length - 1)) * 0.7,
              }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between text-[8px] text-zinc-500 mt-1">
          <span>{config.labels[0]}</span>
          <span>{config.labels[1]}</span>
        </div>
      </div>
    </div>
  );
}
