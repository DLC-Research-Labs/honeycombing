# Red-Team Objections Ledger — NC ensemble finding

**Date:** 2026-07-17. **Method:** five independent hostile-expert passes (read-only), each attacking a different link in the claim chain and told to find its strongest objection, locate the project's current defense, and rule DEFENSE HOLDS / PARTIAL / REAL VULNERABILITY. Lenses: (1) ensemble validity, (2) statistics & measurement, (3) legal & VRA framing, (4) positioning & value-add, (5) reproducibility & currency.

**Bottom line.** The core finding — *NC's 2026 enacted map (SL 2025-95) is an extreme low outlier: 3 of 14 Democratic-leaning districts, at or below the neutral ensemble minimum* — **survived every attack.** All numbers reproduced exactly from raw ALARM data; the reproducibility lens found zero discrepancies. The vulnerabilities are in **framing and currency**, in the **exact-tail flourish** ("none fewer / percentile 0"), in the **secondary 2023 number**, in one **UX default**, and in **scope gaps** — not in the arithmetic or the qualitative conclusion.

---

## Tier 1 — Real vulnerabilities to fix before outside eyes

### T1.1 "Only 3 of 5,000, none fewer / percentile 0" overstates the sampler's tail
*(lenses 1 & 2, independently)* Splitting ALARM's two independent SMC chains: **chain 1 has zero ≤3-seat plans (floor 4); chain 2 holds all three, two of them near-duplicates.** So "3 of 5,000" is effectively one chain catching one narrow configuration ~twice; ≤3 = 0.06% has a wide finite-sample CI [0.02%, 0.18%].
**Our answer / what survives:** the map is at or below the neutral minimum in **both** independent chains; the robust statement is **≤4 D seats = 5.5% (CI 4.9–6.2%)**. The finding is intact; only the "none fewer / percentile 0" phrasing exceeds what a two-chain thinned ensemble can resolve.
**Fix:** lead with the ≤4 tail + CI; report ≤3 as "≤0.06% (95% CI 0.02–0.18%); no simulated plan produced fewer than 3, a tail resting on a single SMC chain." Replace bare "percentile 0" with "at or below the observed ensemble minimum in both independent runs."

### T1.2 VRA framing predates *Louisiana v. Callais*; racial-vs-partisan mismatch
*(lens 3)* The whitepaper (dated today) cites *Rucho* 4× but never mentions *Callais* (decided Apr 29 2026, narrowed VRA §2 / reworked *Gingles*). The live NC suit against SL 2025-95 is a **racial** vote-dilution case (CD-1 Black VAP ~40→32%); our finding measures a **partisan** outlier — the lane *Rucho* closed to courts. ALARM's ensemble bakes in a majority-minority constraint pinned to the 2020-cycle (2022) map.
**Our answer:** the MM constraint runs *in our favor* — packing Black Democrats into MM seats suppresses the D-seat count elsewhere, so the neutral baseline is more R-favorable and the 6→3 gap is *over and above* VRA compliance (confirmed by lens 1). This is currently unstated.
**Fix:** dated VRA-status note (whitepaper §4.3 + /limits) naming *Callais*, disclosing the MM constraint is 2020-cycle-calibrated, and stating the finding is a *partisan* descriptive outlier with **no bearing on the racial §2/14A claims actually pending**. Surface the MM-baseline decomposition.

### T1.3 The default "Start Here" view is the artifact the paper disowns
*(lens 4)* The live demo opens on `vote-map` — 2020 vote *margin* on equal-area H3 cells by precinct centroid — the exact MAUP-loaded, urban-undercounting picture §2.4/§3.4.1 spend three sections disowning. A hostile screenshot is a red rural sea swamping blue cities. Caveats are one screen away; the misleading image is the front door.
**Fix:** demote `vote-map` from the default (open on population or the plan/ensemble view), or overlay the urban-undercount warning directly on the vote-map canvas.

---

## Tier 2 — Convert "asserted" to "measured" (hours of work; direction helps us)

### T2.1 The enacted maps are only scored under the presidential proxy
*(lens 2, "single highest-value fix"; also lens 1)* The proxy-sensitivity table rescoresthe *ensemble* under 11 proxies but the enacted 2023/2025 maps are scored only under `pre_20`. "Presidential is conservative" is proven for the ensemble tail, asserted for the maps. Direction helps us (any more-Democratic proxy shifts both the tail and the map's seats), but it's unmeasured.
**Fix:** score the enacted maps under the 2020 Senate and Governor proxies (VEST ships those precinct columns) and report their seat counts alongside.
**✅ RESOLVED 2026-07-18** — `scripts/score-enacted-maps-proxies.py` re-places the enacted maps under **all ten** ALARM statewide proxies (not just Senate/Gov), sourced from ALARM's own `NC_cd_2020_map.rds` precinct returns (single provenance, EPSG:32119 → WGS84, 99.96% agreement (2665/2666) with the `cd_2020` reference; presidential reproduces the headline 3/4 as a hard gate). Result (`nc-enacted-maps-proxies.md`): the 2025 map holds at 3 D seats and the 2023 map at 4 under **every 2020-cycle proxy**; no 2020 contest gives either map more than presidential. Only exception across both cycles: 2025 map = 5 under 2016 Secretary of State (Marshall, stale electorate), reported without exception. "Presidential is conservative for the maps" is now measured, not asserted.

### T2.2 The 2023 map's 4th seat is centroid-scored at a thin +0.85pp
*(lens 2)* 2023 District 1 sits +0.85pp from 50% — 7× the 0.12pp calibration bound, so polygon apportionment *could* flip it. Blunted by: 2024 reality (Davis (D) won CD-1 — the call is externally validated); and a flip would send 2023 to 3 seats = *deeper* into the tail. The **2025 headline is immune** (nearest D-side district R+3.36pp, ~28× the bound).
**Fix:** polygon-apportion 2023 CD-1 specifically; report its margin with an error bar rather than a bare "4 @ p2.8."
**↗ PARTIALLY BLUNTED 2026-07-18** — the T2.1 multi-proxy scoring shows presidential is the 2023 map's *thinnest* 4th-seat margin (0.85pp); every other proxy widens CD-1 to 1.6–3.2pp and the seat count stays 4 under all ten. So the 4th seat is fragile *only* under the single proxy we headline with, and the fragility direction (a flip → 3 seats) sends 2023 deeper into the tail. Polygon apportionment of CD-1 specifically is still the clean close-out.

---

## Tier 3 — Framing hardening

- **T3.1 "Neutral" is loaded at the headline** (lens 3; also the earlier methods audit). Body says "descriptive relative to a documented constraint set," but abstract/headline/FAQ use "neutral" bare. Fix: tether at first use ("neutral relative to a documented constraint set") or "constraint-defined comparison ensemble."
- **T3.2 Disclaimer placement** (lens 3). Move "what this cannot establish" adjacent to the headline number, not only a later section.
- **T3.3 §3.4.1 national hex table is unreproducible** (lenses 2 & 4). No script regenerates its D/R columns, and it's a live MAUP demonstration. Fix: demote to an explicitly-labeled illustration with the specific numbers removed, or add a repro script.
- **T3.4 State the MM target count** (lens 1). Name the majority-minority count the ensemble was conditioned on and the 2025 map's MM count, so the racial baseline is explicit not inherited silently.

---

## Tier 4 — Scope decisions (owner's call, not auto-implemented)

- **T4.1 Ship one Democratic-gerrymander case (Maryland/Illinois)** *(lenses 3 & 4, both)*. Nonpartisanship is asserted but the only live finding targets a Republican map; the internal BD "Switzerland strategy" itself said ship a D counter-example. Converts symmetry from claim to demonstration and defuses the single most obvious attack.
- **T4.2 Build the H3 cell-level ensemble projection (divergence localization)** *(lens 4)*. Today the hex grid does not touch the headline number, so the value-add is "a banner quoting ALARM plus a vote-proxy chart." The differentiating feature — spatially showing *where* the outlier lives — is unbuilt (needs the already-extracted plans.rds matrices → H3).
- **T4.3 Keep "replace districts" language out of any external-capable doc** *(lens 4)*. The internal BD_REPORT's "ultimately replace districts / reform of the century" framing contradicts the public thesis. BD is `internal/` (gitignored); keep it there.

---

## Defenses that held (no action)

- **Reproducibility, currency, citations — fully clean** (lens 5): every headline and proxy number re-derived exact; checksum gate bites; Dataverse file ids resolve (v15, CC0); drift-lock passes; litigation facts current; Duke language correctly hedged; live matches repo.
- **Proxy choice** — presidential is the *most conservative* of 11, measured not asserted (lenses 1, 2).
- **Centroid assignment for the 2025 headline** — immune (3.36pp buffer vs 0.12pp bound) (lenses 1, 2).
- **VRA-constraint direction** — runs in the project's favor; the map can't hide behind VRA to explain the gap (lens 1).
- **Ecological inference / MAUP on the core finding** — computed at the district level, the actual unit of representation; no inference step to attack (lens 2).
- **Race-aware-constraint / no-VRA-analysis line** — disclaimed about as well as possible (lens 3).
- **2020-cycle ensemble scoring a 2026 map; seat-count brittleness** — hold (lenses 1, 2).

---

*This ledger feeds the whitepaper FAQ and /limits. The core finding is sound; the fixes above harden framing and retire overclaims, they do not change the conclusion.*
