# HANDOFF — Honeycombing

Pick-up doc for the next `/honeycombing` session. Full history lives in `ROADMAP.md`
(the status blocks at the top are newest-first); this file is just "where we are + what's next."

## Live state (2026-07-18)

- **Deployed & live.** Canonical demo: **dalovecompany.com/honeycombing** (dalove proxy → `honeycombing.vercel.app`, basePath `/honeycombing`). Last deploy pushed the T2.1 + T4.2 work; the proxy auto-picks-up new honeycombing prod deploys, so **no dalove redeploy is needed unless the proxy config changes**.
- **Repo.** Public `origin` = `DLC-Research-Labs/honeycombing`, pushed through `f587736` on `main`. ⚠️ **Never push `private-history`** (local + private `archive` remote only). Commits author as `errorwasmade`, no Claude trailer (repo convention).
- **Deploy recipe** (when you next need it): `git push origin main` → `vercel --prod --yes` from the repo. Verify with `curl .../honeycombing/data/ensembles/<file>.json`.

## Shipped this session (see ROADMAP for detail)

- **T2.1 — enacted maps scored under all 10 statewide proxies** (`scripts/score-enacted-maps-proxies.py`). Both enacted maps hold at their presidential-proxy seat count under every 2020-cycle proxy. Methods-audited exact.
- **T4.2 — H3 divergence localization** (`scripts/build-ensemble-h3-localization.py` + the "Localize on H3 grid" overlay in the ensemble panel). The hex grid now shows *where* the 2025 map departs from the neutral ensemble (5,130 outlier cells, lazy-loaded sidecar `nc-congress-2020-alarm-h3.json`). Methods-audited exact; Playwright-verified at 390/820/1440.

## NEXT TASK — 2025 rank-matched district unit measure

**Why:** the ALARM ensemble payload's district unit measure (`ranked_dem_share_pre20`) is keyed to the **2023** enacted plan (`UNIT_REFERENCE_PLAN = "nc-2023-enacted-congressional"`, `scripts/build-alarm-ensemble.mjs:33`). So the district-band overlay can only position the 2023 plan's districts in the ensemble — **not the 2025 map (SL 2025-95), which is the headline map in force.** Payload caveat #5 flags this gap. Closing it lets the district bands show the current map's districts against the neutral distribution, matching the headline.

**Where / how:**
- The rank device is already built: `rankedUnits` (build-alarm-ensemble.mjs ~lines 217–266) sorts a plan's districts by share and matches each to `rankValues[rank]` (the sorted k-th-ranked share across the 5,000 draws). Same machinery, different plan.
- The 2025 district shares are **already computed** — `planDistricts.get("nc-2025-enacted-congressional")` exists (the diagnostics CSV covers it; `comparedPlans` already scores 2025 at 3 seats @ p0). So no new data is needed.
- Decision to make first: **should the district bands default to 2025, or offer both 2023 and 2025?**
  - Simplest: switch `UNIT_REFERENCE_PLAN` to `"nc-2025-enacted-congressional"` (bands default to the headline map). One-line change + regen.
  - Fuller: emit **two** district unit measures (2023 + 2025) and let the panel pick. The UI's `ensembleReferencePlanId` memo (`HoneycombMap.tsx` ~875) currently takes the **first** district measure's `referencePlanId`, and the draw effect (~913–953) renders that one plan's polygons — so "offer both" needs a small selector + the reference-plan geometry loader to follow the selection. More UI surface.
  - Recommendation: ship the **switch to 2025** first (fast, matches the headline), then add the 2023/2025 selector as a follow-up if wanted.
- Retire payload **caveat #5** (build-alarm-ensemble.mjs ~345) when done.

**Verify:** `node scripts/build-alarm-ensemble.mjs` regenerates payload + registry; `npm test` (the ALARM payload test iterates `unitMeasures` and asserts each `referencePlanId` is a known plan — a 2025-keyed measure passes), `npm run lint`, `npm run build`; then Playwright-drive the ensemble panel to confirm the district bands render for the chosen plan. Run the methods-auditor before shipping any changed quantitative claim (spawn via the Agent tool; if the project subagent type isn't registered, use `general-purpose` and point it at `.claude/agents/honeycombing-methods-auditor.md`).

## Other open threads (lower priority)

- **Expert-review emails** (ALARM: Imai/McCartan/Kenny; Duke QG: Mattingly/Herschlag) — the draft→published promotion gate. Draft for Cash's approval; nothing sends without him.
- **Overlay polish** (optional): a "cracking-tail-only" (low-outlier) lighter default for the H3 overlay; the current default draws both tails (5,130 cells).
- Red-team ledger Tier-3 framing items and T2.2 clean close-out (polygon-apportion 2023 CD-1) remain open but non-blocking — see `docs/research/outputs/red-team/objections-ledger.md`.
