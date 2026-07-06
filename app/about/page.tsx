import { readFileSync } from "fs";
import { join } from "path";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";
import Link from "next/link";
import { getExpertReviewObjectives, getExpertReviewPacket } from "@/app/lib/honeycomb-ui-helpers";

async function getWhitePaperHtml(): Promise<string> {
  const filePath = join(process.cwd(), "WHITEPAPER.md");
  const content = readFileSync(filePath, "utf8");
  const result = await remark().use(remarkGfm).use(remarkHtml, { sanitize: false }).process(content);
  return result.toString();
}

interface NcStarterPack {
  title: string;
  generatedAt: string;
  statewide: {
    population: number;
    votingAgePopulation: number;
    sourceBlocks: number;
    h3Cells: number;
    h3Resolution: number;
    blackPopulation: number;
    blackPct: number;
    hispanicPopulation: number;
    hispanicPct: number;
    nonwhitePopulation: number;
    nonwhitePct: number;
  };
  electionSignals: {
    precinctCentroids2020: ElectionSignal;
    countyCentroids2020: ElectionSignal;
    countyDerivedDistrictHeat2020: ElectionSignal & {
      districts: number;
      countyAssignments: number;
    };
  };
  planComparisons: Array<{
    planId: string;
    name: string;
    status: string;
    source: string;
    cycle: string;
    districtCount: number;
    totalPopulation: number;
    h3CentersCovered: number;
    h3CentersUncovered: number;
    h3CoveragePct: number;
    districtsTouchedByH3Centers: number;
  }>;
  caveats: string[];
  nextQuestions: string[];
}

interface ElectionSignal {
  records?: number;
  demVotes: number;
  repVotes: number;
  totalVotes: number;
  demPct: number;
  repPct: number;
  caveat: string;
}

function getNcStarterPack(): NcStarterPack {
  const filePath = join(process.cwd(), "public/data/case-studies/nc-starter-pack.json");
  return JSON.parse(readFileSync(filePath, "utf8")) as NcStarterPack;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default async function AboutPage() {
  const html = await getWhitePaperHtml();
  const expertReviewPacket = getExpertReviewPacket();
  const expertReviewObjectives = getExpertReviewObjectives();
  const ncStarterPack = getNcStarterPack();
  const precinctSignal = ncStarterPack.electionSignals.precinctCentroids2020;
  const countySignal = ncStarterPack.electionSignals.countyCentroids2020;
  const districtHeatSignal = ncStarterPack.electionSignals.countyDerivedDistrictHeat2020;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-4 px-6 py-3 border-b border-white/10 bg-black/90 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm">
          ← Map
        </Link>
        <span className="text-zinc-700">|</span>
        <span className="text-base font-semibold text-zinc-100">⬡ Honeycombing</span>
        <span className="text-[10px] text-zinc-600 font-mono">White Paper · Draft v0.3</span>
        <Link
          href="/limits"
          className="ml-auto text-[10px] font-mono text-amber-400/80 hover:text-amber-300 transition-colors"
        >
          Limits — not legal evidence
        </Link>
        <a
          href="https://github.com/MEDSL"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Data: MIT Election Lab ↗
        </a>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <section className="mb-12 border border-cyan-500/20 bg-cyan-500/[0.04] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wide text-cyan-500/80">
                Handoff
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">
                {expertReviewPacket.title}
              </h1>
            </div>
            <div className="border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-zinc-500">
              Next: {expertReviewPacket.recommendedNextObjective}
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-zinc-300">
            {expertReviewPacket.reviewStance}
          </p>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <h2 className="text-[11px] font-mono uppercase tracking-wide text-zinc-500">
                Ready For Review
              </h2>
              <ul className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-300">
                {expertReviewPacket.readyForReview.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-[11px] font-mono uppercase tracking-wide text-zinc-500">
                Known Limits
              </h2>
              <ul className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-400">
                {expertReviewPacket.knownLimits.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-5 border-t border-white/10 pt-4">
            <h2 className="text-[11px] font-mono uppercase tracking-wide text-zinc-500">
              Questions For A Qualified Reviewer
            </h2>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-300">
              {expertReviewPacket.reviewQuestions.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mb-12 border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wide text-amber-400/80">
                Starter Pack
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">
                {ncStarterPack.title}
              </h1>
            </div>
            <div className="border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-zinc-500">
              Generated {formatDate(ncStarterPack.generatedAt)}
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-wide text-zinc-600">Population</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">{formatNumber(ncStarterPack.statewide.population)}</div>
              <div className="mt-0.5 text-[11px] text-zinc-600">VAP {formatNumber(ncStarterPack.statewide.votingAgePopulation)}</div>
            </div>
            <div className="border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-wide text-zinc-600">H3 layer</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">{formatNumber(ncStarterPack.statewide.h3Cells)}</div>
              <div className="mt-0.5 text-[11px] text-zinc-600">r{ncStarterPack.statewide.h3Resolution} from {formatNumber(ncStarterPack.statewide.sourceBlocks)} blocks</div>
            </div>
            <div className="border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-wide text-zinc-600">Nonwhite pop.</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">{ncStarterPack.statewide.nonwhitePct}%</div>
              <div className="mt-0.5 text-[11px] text-zinc-600">{formatNumber(ncStarterPack.statewide.nonwhitePopulation)} residents</div>
            </div>
            <div className="border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-wide text-zinc-600">Black / Hispanic</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">{ncStarterPack.statewide.blackPct}% / {ncStarterPack.statewide.hispanicPct}%</div>
              <div className="mt-0.5 text-[11px] text-zinc-600">PL 94-171 fields</div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="border border-white/10 bg-black/25 p-3">
              <div className="text-[10px] font-mono uppercase tracking-wide text-zinc-600">Precinct signal</div>
              <div className="mt-2 text-sm text-zinc-300">
                D {precinctSignal.demPct}% · R {precinctSignal.repPct}%
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                {formatNumber(precinctSignal.records ?? 0)} VEST centroid records · {formatNumber(precinctSignal.totalVotes)} votes
              </div>
            </div>
            <div className="border border-white/10 bg-black/25 p-3">
              <div className="text-[10px] font-mono uppercase tracking-wide text-zinc-600">County signal</div>
              <div className="mt-2 text-sm text-zinc-300">
                D {countySignal.demPct}% · R {countySignal.repPct}%
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                {formatNumber(countySignal.records ?? 0)} county centroids · {formatNumber(countySignal.totalVotes)} total votes
              </div>
            </div>
            <div className="border border-white/10 bg-black/25 p-3">
              <div className="text-[10px] font-mono uppercase tracking-wide text-zinc-600">District heat</div>
              <div className="mt-2 text-sm text-zinc-300">
                {districtHeatSignal.districts} districts · D {districtHeatSignal.demPct}% / R {districtHeatSignal.repPct}%
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                {districtHeatSignal.caveat}
              </div>
            </div>
          </div>

          <div className="mt-5">
            <h2 className="text-[11px] font-mono uppercase tracking-wide text-zinc-500">
              Plan Coverage Checks
            </h2>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {ncStarterPack.planComparisons.map((plan) => (
                <div key={plan.planId} className="border border-white/10 bg-black/25 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-zinc-200">{plan.name}</div>
                      <div className="mt-0.5 text-[11px] text-zinc-600">{plan.source} · {plan.cycle}</div>
                    </div>
                    <span className="border border-white/10 px-1.5 py-0.5 text-[9px] font-mono uppercase text-zinc-500">
                      {plan.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <div className="font-mono uppercase text-zinc-700">Districts</div>
                      <div className="mt-0.5 text-zinc-300">{plan.districtCount}</div>
                    </div>
                    <div>
                      <div className="font-mono uppercase text-zinc-700">H3 covered</div>
                      <div className="mt-0.5 text-zinc-300">{formatNumber(plan.h3CentersCovered)}</div>
                    </div>
                    <div>
                      <div className="font-mono uppercase text-zinc-700">Coverage</div>
                      <div className="mt-0.5 text-zinc-300">{plan.h3CoveragePct}%</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <h2 className="text-[11px] font-mono uppercase tracking-wide text-zinc-500">
                Caveats
              </h2>
              <ul className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-400">
                {ncStarterPack.caveats.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-[11px] font-mono uppercase tracking-wide text-zinc-500">
                Next Questions
              </h2>
              <ul className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-300">
                {ncStarterPack.nextQuestions.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-12 border border-white/10 bg-white/[0.025] p-5">
          <div className="border-b border-white/10 pb-3">
            <p className="text-[10px] font-mono uppercase tracking-wide text-cyan-500/80">
              Expert Review Objectives
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">
              Disciplined Review Objectives
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Each objective turns an expert-facing prompt into a bounded artifact, success criteria, and known roadblocks.
            </p>
          </div>

          <div className="mt-4 space-y-4">
            {expertReviewObjectives.map((objective, index) => (
              <article key={objective.id} className="border border-white/10 bg-black/25 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wide text-zinc-600">
                      Objective {index + 1}
                    </div>
                    <h2 className="mt-1 text-base font-semibold text-zinc-100">
                      {objective.objective}
                    </h2>
                  </div>
                  <div className="border border-white/10 px-2 py-1 text-[9px] font-mono uppercase tracking-wide text-zinc-600">
                    {objective.id}
                  </div>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  {objective.prompt}
                </p>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-[10px] font-mono uppercase tracking-wide text-zinc-600">
                      Success Criteria
                    </h3>
                    <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-zinc-300">
                      {objective.definitionOfSuccess.map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-[10px] font-mono uppercase tracking-wide text-zinc-600">
                      Roadblocks
                    </h3>
                    <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-zinc-500">
                      {objective.roadblocks.map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 border-t border-white/10 pt-3 text-sm leading-relaxed text-zinc-400">
                  <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-600">Next artifact:</span>{" "}
                  {objective.nextArtifact}
                </div>
              </article>
            ))}
          </div>
        </section>

        <div
          className="whitepaper"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <div className="mt-16 pt-8 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-600">
          <span>Honeycombing · Open project · Draft v0.3</span>
          <Link href="/" className="text-cyan-600 hover:text-cyan-400 transition-colors">
            ← Back to map
          </Link>
        </div>
      </main>
    </div>
  );
}
