import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cellToLatLng } from "h3-js";

import { assignPointsToPlanDistricts } from "../app/lib/honeycomb-ui-helpers.ts";

// Generates the SAMPLE community-of-interest payload for the COI registry
// (expert-review Objective 4). The polygon is FICTIONAL — deterministic
// literals drawn across the Charlotte-area district seam so the fracture
// readout exercises both plans — and the fracture gate blocks it from ever
// being presented as a real community. It exists so the registry schema,
// provenance fields, and fracture computation can be validated before a real
// COI submission (RDH/Representable or digitized public testimony) lands.

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const H3_RESOLUTION = 7;
const CLAIM_TAG = "descriptive_with_assignment_caveat";
const OUT_DIR = join(root, "public/data/cois");

const SAMPLE_CAVEAT =
  "SAMPLE PAYLOAD: this polygon is fictional. It validates the COI registry schema, provenance fields, and "
  + "fracture computation. It is not a community of interest and must never be cited or displayed as one.";

// Fictional crescent through south Charlotte, crossing the 2023 plan's
// CD 12 / CD 14 seam. Coordinates are [lng, lat] literals.
const SAMPLE_GEOMETRY = {
  type: "Feature",
  properties: { coi_id: "nc-sample-fictional-crescent", name: "Sample crescent (FICTIONAL)" },
  geometry: {
    type: "Polygon",
    coordinates: [[
      [-81.02, 35.10],
      [-80.94, 35.06],
      [-80.82, 35.05],
      [-80.72, 35.09],
      [-80.68, 35.16],
      [-80.74, 35.20],
      [-80.82, 35.17],
      [-80.90, 35.17],
      [-80.96, 35.21],
      [-81.04, 35.17],
      [-81.02, 35.10],
    ]],
  },
};

const FRACTURE_PLAN_IDS = [
  "nc-2022-court-interim-congressional",
  "nc-2023-enacted-congressional",
];

// ── Collect H3 cells whose centers fall inside the sample polygon ────────────

const censusCells = JSON.parse(
  await readFile(join(root, "public/derived-data/census-h3/census-blocks-37-r7-2020.json"), "utf8"),
);

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const ring = SAMPLE_GEOMETRY.geometry.coordinates[0];
const memberCells = [];
for (const cell of censusCells) {
  const [lat, lng] = cellToLatLng(cell.h3);
  if (pointInRing(lng, lat, ring)) {
    memberCells.push({ h3: cell.h3, lat, lng, population: cell.total_population });
  }
}
if (memberCells.length === 0) throw new Error("Sample polygon contains no H3 cell centers");

const totalPopulation = memberCells.reduce((total, cell) => total + cell.population, 0);

// ── Fracture per plan: district touches via cell-center assignment ──────────

const points = memberCells.map((cell) => ({ lat: cell.lat, lng: cell.lng }));

const planFractures = [];
for (const planId of FRACTURE_PLAN_IDS) {
  const plan = JSON.parse(await readFile(join(root, `public/data/plans/${planId}.json`), "utf8"));
  const assignments = assignPointsToPlanDistricts(plan, points);

  const populationByDistrict = new Map();
  assignments.forEach((districtId, index) => {
    const key = districtId ?? "unassigned";
    populationByDistrict.set(key, (populationByDistrict.get(key) ?? 0) + memberCells[index].population);
  });

  const segments = [...populationByDistrict.entries()]
    .map(([districtId, population]) => ({
      districtId,
      population,
      populationShare: Math.round((population / totalPopulation) * 10000) / 10000,
    }))
    .sort((a, b) => b.population - a.population);

  planFractures.push({
    planId,
    districtsTouched: segments.filter((segment) => segment.districtId !== "unassigned").length,
    largestShare: segments[0].populationShare,
    segments,
  });
}

// ── Assemble payload ─────────────────────────────────────────────────────────

const summary = {
  schemaVersion: 1,
  id: "nc-sample-fictional-crescent",
  name: "Sample crescent (FICTIONAL)",
  status: "sample",
  jurisdiction: "North Carolina",
  submitter: {
    name: "build-sample-coi.mjs (generated fixture)",
    type: "synthetic",
  },
  source: {
    description: "Deterministic literals in scripts/build-sample-coi.mjs. Not collected from any person or portal.",
    collectedAt: "2026-07-03",
    method: "Hand-placed polygon vertices chosen to cross the Charlotte-area district seam so the fracture readout exercises both registered NC plans.",
  },
  narrative:
    "None. A real COI payload carries the community's own story — shared schools, transit, industry, language, or "
    + "history — written by the submitter, never scored by the tool.",
  sampleCaveat: SAMPLE_CAVEAT,
  geometry: SAMPLE_GEOMETRY,
  fracture: {
    h3Resolution: H3_RESOLUTION,
    cellCount: memberCells.length,
    population: totalPopulation,
    claimTag: CLAIM_TAG,
    plans: planFractures,
  },
  caveats: [
    SAMPLE_CAVEAT,
    "Fracture counts use H3 cell-center district assignment (descriptive_with_assignment_caveat); reviewer-facing "
      + "artifacts for real COIs need polygon apportionment.",
    "COI polygons are context, never inputs to a composite score. A fractured COI is a review question, not a violation.",
    "Real ingestion targets: Redistricting Data Hub / Representable COI datasets, MGGG portal-state collections, and "
      + "digitized NC public testimony, each with submitter and collection provenance.",
  ],
};

// ── Upsert registry (real statuses ahead of samples, same as ensembles) ──────

const STATUS_ORDER = { published: 0, draft: 1, sample: 2 };
const registryPath = join(OUT_DIR, "registry.json");
const registry = existsSync(registryPath)
  ? JSON.parse(await readFile(registryPath, "utf8"))
  : { schemaVersion: 1, cois: [] };

const entry = {
  id: summary.id,
  name: summary.name,
  url: "/data/cois/nc-sample-fictional-crescent.json",
  status: summary.status,
  submitter: summary.submitter,
  source: summary.source,
  description: "Fictional sample COI that validates the registry schema, provenance fields, and fracture readout end-to-end.",
  caveats: [SAMPLE_CAVEAT],
};

registry.cois = [
  entry,
  ...registry.cois.filter((candidate) => candidate.id !== entry.id),
].sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || a.id.localeCompare(b.id));

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, "nc-sample-fictional-crescent.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

console.log(`Wrote ${join(OUT_DIR, "nc-sample-fictional-crescent.json")}`);
console.log(`Wrote ${registryPath}`);
console.log(`cells ${memberCells.length}; population ${totalPopulation.toLocaleString()}`);
for (const fracture of planFractures) {
  console.log(
    `  ${fracture.planId}: ${fracture.districtsTouched} districts, largest share ${(fracture.largestShare * 100).toFixed(1)}%`,
  );
}
