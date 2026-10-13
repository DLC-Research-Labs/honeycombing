import assert from "node:assert/strict";
import { test } from "node:test";

import {
  describeBasemapStatus,
  getBasemapConfig,
} from "../app/lib/basemap.ts";

test("background tiles come from a key-free public raster endpoint", () => {
  const basemap = getBasemapConfig();

  // The previous provider served watermarked "API KEY REQUIRED" tiles as HTTP 200
  // images, so the check is on the endpoint itself, not on fetch success.
  assert.match(basemap.urlTemplate, /^https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png$/);
  assert.doesNotMatch(basemap.urlTemplate, /\{s\}/, "no subdomain sharding: OSM asks clients not to shard");
  assert.doesNotMatch(basemap.urlTemplate, /key|token|apikey|access/i, "no API key or token parameters");
  assert.equal(basemap.maxZoom, 19);
});

test("basemap config carries the attribution and policy the provider requires", () => {
  const basemap = getBasemapConfig();

  assert.match(basemap.attributionText, /OpenStreetMap contributors/);
  assert.equal(basemap.attributionUrl, "https://www.openstreetmap.org/copyright");
  assert.match(basemap.attributionHtml, /href="https:\/\/www\.openstreetmap\.org\/copyright"/);
  assert.match(basemap.attributionHtml, /OpenStreetMap/);
  assert.match(basemap.attributionHtml, /contributors/);
  assert.equal(basemap.policyUrl, "https://operations.osmfoundation.org/policies/tiles/");
});

test("tile status stays quiet while the first tiles are still in flight", () => {
  const status = describeBasemapStatus({ loadedTileCount: 0, erroredTileCount: 0 });
  assert.equal(status.level, "loading");
  assert.equal(status.message, null);
});

test("tile status is silent once tiles are actually painting", () => {
  const status = describeBasemapStatus({ loadedTileCount: 12, erroredTileCount: 0 });
  assert.equal(status.level, "ok");
  assert.equal(status.message, null);
});

test("partial tile failures are reported truthfully, with the data layers scoped out", () => {
  const status = describeBasemapStatus({ loadedTileCount: 12, erroredTileCount: 3 });
  assert.equal(status.level, "partial");
  assert.ok(status.message, "a partial failure is surfaced, not swallowed");
  assert.match(status.message, /3 background map tiles/);
  assert.match(status.message, /OpenStreetMap/);
  assert.match(status.message, /best-effort/i);
  assert.match(status.message, /unaffected/);
});

test("a total tile failure says so instead of implying a usable basemap", () => {
  const status = describeBasemapStatus({ loadedTileCount: 0, erroredTileCount: 8 });
  assert.equal(status.level, "failed");
  assert.ok(status.message);
  assert.match(status.message, /not loading/);
  assert.match(status.message, /OpenStreetMap/);
  assert.doesNotMatch(status.message, /loaded successfully|all tiles/i);
  // The Census/plan/ensemble layers are independent of the tile provider and the
  // notice must say so rather than reading as a data outage.
  assert.match(status.message, /Census|data layers/);
});

test("a single failed tile is not escalated into a dead basemap", () => {
  const status = describeBasemapStatus({ loadedTileCount: 40, erroredTileCount: 1 });
  assert.equal(status.level, "partial");
  assert.match(status.message ?? "", /1 background map tile\b/);
});
