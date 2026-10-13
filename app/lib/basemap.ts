/**
 * Background raster wiring, kept in one small module so the provider can be
 * swapped without touching map rendering code.
 *
 * Provider: OpenStreetMap's standard tile layer. It is key-free and public, and
 * it is a best-effort service with no uptime guarantee — see the tile usage
 * policy at POLICY_URL. Usage stays inside that policy: ordinary in-viewport
 * browser requests at the provider's max zoom, no subdomain sharding, no
 * prefetching or bulk downloading, default browser Referer and caching, and the
 * attribution below rendered visibly on the map.
 *
 * The previous provider (CARTO dark_all) served watermarked "API KEY REQUIRED"
 * images with HTTP 200 status, which is why the tile status helper below treats
 * transport success as insufficient and the app renders a truthful notice
 * instead of assuming a usable basemap.
 */

export interface BasemapConfig {
  id: string;
  label: string;
  urlTemplate: string;
  maxZoom: number;
  attributionText: string;
  attributionUrl: string;
  attributionHtml: string;
  policyUrl: string;
}

const OSM_STANDARD_BASEMAP: BasemapConfig = {
  id: "osm-standard",
  label: "OpenStreetMap standard",
  urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  maxZoom: 19,
  attributionText: "© OpenStreetMap contributors",
  attributionUrl: "https://www.openstreetmap.org/copyright",
  attributionHtml:
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
  policyUrl: "https://operations.osmfoundation.org/policies/tiles/",
};

export function getBasemapConfig(): BasemapConfig {
  return OSM_STANDARD_BASEMAP;
}

export type BasemapStatusLevel = "loading" | "ok" | "partial" | "failed";

export interface BasemapStatus {
  level: BasemapStatusLevel;
  message: string | null;
}

export interface BasemapTileCounts {
  loadedTileCount: number;
  erroredTileCount: number;
}

/**
 * Turns observed tile load/error counts into a user-facing status. Failures are
 * named rather than hidden, and the notice scopes the problem to the background
 * imagery so a tile outage does not read as a data outage.
 */
export function describeBasemapStatus(counts: BasemapTileCounts): BasemapStatus {
  const loaded = Math.max(0, Math.trunc(counts.loadedTileCount));
  const errored = Math.max(0, Math.trunc(counts.erroredTileCount));

  if (errored === 0) {
    return loaded === 0 ? { level: "loading", message: null } : { level: "ok", message: null };
  }

  if (loaded === 0) {
    return {
      level: "failed",
      message:
        "The background map tiles are not loading from OpenStreetMap right now — a best-effort public service with no uptime guarantee. "
        + "The Census population, plan, and ensemble layers on this map are unaffected and still render; only the terrain behind them is missing.",
    };
  }

  const tileWord = errored === 1 ? "tile" : "tiles";
  return {
    level: "partial",
    message:
      `${errored} background map ${tileWord} failed to load from OpenStreetMap — a best-effort public service with no uptime guarantee. `
      + "The Census population, plan, and ensemble layers on this map are unaffected.",
  };
}
