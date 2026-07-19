# HANDOFF — Honeycombing

Pick-up doc for the next `/honeycombing` session. Full history lives in `ROADMAP.md`
(the status blocks at the top are newest-first); this file is just "where we are + what's next."

## Live state (2026-07-19)

- **Deployed & live.** Canonical demo: **dalovecompany.com/honeycombing** (dalove proxy → `honeycombing.vercel.app`, basePath `/honeycombing`). The proxy auto-picks-up new honeycombing prod deploys, so **no dalove redeploy is needed unless the proxy config changes**.
- **Repo.** Public `origin` = `DLC-Research-Labs/honeycombing`. Commits author as `errorwasmade`, no Claude trailer (repo convention).
- **Deploy recipe:** `git push origin main` → `vercel --prod --yes` from the repo. Verify with `curl .../honeycombing/data/ensembles/<file>.json`.

## Shipped this session (2026-07-19; see ROADMAP for detail)

- **2025 rank-matched district unit measure** (`edb3353`): the ALARM payload's `ranked_dem_share_pre20` measure is now keyed to the **2025 enacted plan (SL 2025-95, the map in force)** — `UNIT_REFERENCE_PLAN` in `scripts/build-alarm-ensemble.mjs`. The ensemble panel's district bands render the current map's 14 districts against the neutral rank distributions; the superseded 2023 plan remains in `comparedPlans` only. Stale caveat retired; replaced by a **computed rank-tie disclosure** (adjacent ranks closer than the 0.12pp calibration bound could swap under exact assignment — currently 3706/3710, 3710/3714, 3707/3711).
- **Methods-audited exact** (independent recompute from the raw ALARM CSV: all quantiles, compared values, mid-rank percentiles, histogram unchanged). **Playwright-verified** at 390/820/1440: 14 bands render, method panel opens first, no 2023 leakage, zero console/network errors.
- **Tooltip label fix** (`6c8c88f`): district bands now say "District 12", not "District 3712".

## NEXT OPTIONS (no single queued task)

1. **Expert-review outreach** — the draft→published promotion gate the ensemble payload defines for itself. Frame: "drift-locked browser explainer on your NC 2020 ensemble, here's the derivation, what did we get wrong?"
2. **2023/2025 selector for district bands** (the "fuller" option from the rekey decision): emit both unit measures and add a small panel selector; `ensembleReferencePlanId` memo + reference-plan geometry loader in `HoneycombMap.tsx` (~910/949) would follow the selection. Only if wanted — the default now matches the headline map.
3. **Overlay polish** (optional): "cracking-tail-only" lighter default for the H3 overlay (current default draws both tails, 5,130 cells); ensemble tooltip clamping at viewport edges (Leaflet tooltips clip on left-edge districts at 390px and under the open panel on desktop — QA note 2026-07-19).
4. Red-team ledger Tier-3 framing items and T2.2 clean close-out (polygon-apportion 2023 CD-1) — non-blocking; see `docs/research/outputs/red-team/objections-ledger.md`.
