# HANDOFF — Honeycombing

Pick-up doc for the next session. Full history lives in `ROADMAP.md` (status blocks newest-first);
this file is "where we are + what's next."

## Where things stand

Three layers, deliberately kept apart:

1. **Deployed.** The public demo at **dalovecompany.com/honeycombing** serves an earlier build. It has the
   expert workbench and the ensemble explainer, but **not** the guided walkthrough, and not the background-map
   fix — its payload also predates the continuous tail statement.
2. **In the repository, not deployed.** The 2025 unit-measure rekey and continuous-tail work (committed), plus
   the guided/expert cleanup and the OpenStreetMap basemap repair described below (uncommitted working tree).
3. **Draft research.** The ALARM ensemble payload is status `draft`, pending expert review of its consistency
   checks — that review is the promotion gate the payload defines for itself. The only community-of-interest
   payload is a fictional sample, permanently gate-blocked.

## This pass — guided/expert cleanup (uncommitted, not deployed)

- **Guided mode is the default.** Four steps — what changed → how unusual is it under this comparison → where does
  it show up → what can't we conclude — in `app/lib/guided-walkthrough.ts`. Narrative text and every number are
  built from `nc-headline-finding.json`; the draft status of the ensemble appears in the default story. Each step
  resolves a layer directive the map applies, so the story drives real layers (plan boundaries → percentile bands
  with the method panel first → H3 divergence tails and region zooms → limits).
- **Expert mode keeps everything**: years, granularity, presets, starter regions, selection, provenance panel,
  Plans/Communities/Ensemble panels, settings gear. Leaving guided mode carries the current layers over; returning
  re-applies the step's layers. Guided mode hides the technical switches and the sample-community surface, hides
  the settings gear, and shows only the chips its step uses.
- **Background map repaired.** CARTO `dark_all` was returning watermarked "API KEY REQUIRED" images with HTTP 200.
  Provider is now OpenStreetMap standard raster tiles (`app/lib/basemap.ts`), key-free, with a visible
  © OpenStreetMap contributors link, no subdomain sharding, and a truthful tile-status notice that scopes a tile
  outage away from the data layers. Note the tiles are light; the app chrome is dark and tiles are rendered
  unmodified (no filter, nothing hidden).
- **Layout**: header wraps instead of scrolling horizontally, guided story sits beside the map (`sm:` and up) or
  above it on phones, map panels capped so they cannot swallow the map, legend raised clear of the attribution.
- **Docs reconciled**: README's "no ensemble/COI pipeline" line was stale and is fixed; deployed vs repo vs draft
  are now distinguished here and in README.
- **Checks**: 70 tests (51 pre-existing + 19 new), lint, and build all green. **Browser/pixel verification is
  pending** — no mounted-layer, tile-pixel, or touch-layout check has been run on this change.

## Next

1. **Browser pass**: run the app, confirm OSM tiles actually paint (pixels, not HTTP 200), walk the guided steps at
   390×844 / 820×1180 / 1440×900, switch modes both ways, and check the ensemble method panel opens before bands.
2. **Expert-review outreach** for the ensemble draft→published gate (drafts go for approval before anything is sent).
3. Then deploy: commit, push, deploy honeycombing, verify the payloads over HTTP.
4. Optional backlog: 2023/2025 selector for the district bands; lighter cracking-tail-only default for the H3 overlay;
   ensemble tooltip clamping at viewport edges; red-team ledger Tier-3 framing items.
