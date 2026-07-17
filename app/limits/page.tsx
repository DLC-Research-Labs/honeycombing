import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Limits — Honeycombing",
  description:
    "What the Honeycombing diagnostic prototype can and cannot tell you: not legal evidence, not a seat forecast, and the shortcuts it discloses.",
};

interface Limit {
  title: string;
  body: string;
  detail?: string;
}

const LIMITS: Limit[] = [
  {
    title: "Not legal evidence",
    body:
      "Nothing on this site demonstrates illegal intent or legal injury. Every readout is descriptive and exploratory. Partisan-gerrymandering claims are not heard in federal court at all (Rucho v. Common Cause, 2019), and the state-court and reform paths that remain have evidentiary standards this prototype does not meet.",
    detail:
      "Treat the maps as a way to see spatial pattern and ask better questions — not as a finding about any map's lawfulness.",
  },
  {
    title: "Not a seat forecast",
    body:
      "H3 hexagons are (roughly) equal area, not equal population, and they are not districts. Counting red versus blue hexes systematically understates dense urban populations, so raw hex tallies are never a measure of seats a party should win.",
    detail:
      "Where the site reports seat counts, they come from district-level aggregation of a documented plan or ensemble — never from hex counts.",
  },
  {
    title: "Point-assignment shortcut",
    body:
      "Precinct returns and census blocks are assigned to hexagons by a single interior point, not by splitting geometry across cell boundaries. Our own audits (Alamance and Mecklenburg counties, NC) rate this shortcut disqualifying for cell-level evidence: single-cell vote-share errors reach 9–16 percentage points.",
    detail:
      "The same audits show the error largely washes out at district-level aggregation (at most 0.12 percentage points in the ALARM calibration check), which is why district summaries are reported and single-cell values are orientation only.",
  },
  {
    title: "District heat is county-derived",
    body:
      "The district fill layer aggregates county-level 2020 presidential returns into districts, not precinct-to-district totals. It exists for coarse orientation; precise district vote shares require precinct-level aggregation that is not built yet.",
  },
  {
    title: "Ensemble percentiles are not intent",
    body:
      "A plan sitting at an extreme percentile of a comparison ensemble — for example, North Carolina's 2023 enacted plan (used in the 2024 election) at the 2.8th percentile of Democratic seats in the ALARM ensemble — is atypical relative to that documented constraint set. Nothing more.",
    detail:
      "Percentiles do not establish motive or unlawfulness, and they cannot show whether deviations were legally required (for example, Voting Rights Act compliance). The ensemble's constraints are always displayed alongside its numbers.",
  },
];

export default function LimitsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center gap-4 px-6 py-3 border-b border-white/10 bg-black/90 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm">
          ← Map
        </Link>
        <span className="text-zinc-700">|</span>
        <span className="text-base font-semibold text-zinc-100">⬡ Honeycombing</span>
        <span className="text-[10px] text-zinc-600 font-mono">Limits</span>
        <Link
          href="/about"
          className="ml-auto text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors font-mono"
        >
          Method &amp; white paper →
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10 border border-amber-400/25 bg-amber-500/[0.06] p-5">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-300">
            Diagnostic prototype
          </p>
          <h1 className="mt-2 text-xl font-semibold text-zinc-100">
            What this tool can — and cannot — tell you
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            Honeycombing compares enacted district maps against a neutral hexagonal reference grid
            (Uber&apos;s H3) to make spatial patterns visible. The grid predates any election and was
            drawn for logistics, not politics — that neutrality is the point. But visibility is not
            proof. Everything here is descriptive; before citing any number, read the five limits below.
          </p>
        </div>

        <ol className="space-y-4">
          {LIMITS.map((limit, index) => (
            <li key={limit.title} className="border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[11px] text-amber-400/80">{index + 1}</span>
                <h2 className="text-sm font-semibold text-zinc-100">{limit.title}</h2>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{limit.body}</p>
              {limit.detail ? (
                <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">{limit.detail}</p>
              ) : null}
            </li>
          ))}
        </ol>

        <div className="mt-10 border border-white/10 bg-white/[0.03] p-5 text-[12px] leading-relaxed text-zinc-500">
          <p>
            Two further caveats apply everywhere: presidential returns are a partisan-lean{" "}
            <span className="text-zinc-400">proxy</span>, not congressional performance; and no
            citizen-voting-age-population or racially-polarized-voting analysis is included, so no
            Voting Rights Act conclusion can be drawn from anything on this site.
          </p>
          <p className="mt-3">
            Full method, data provenance, and the expert review packet live in the{" "}
            <Link href="/about" className="text-cyan-400 hover:text-cyan-300 transition-colors">
              white paper
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
