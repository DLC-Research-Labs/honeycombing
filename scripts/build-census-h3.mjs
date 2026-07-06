#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { aggregateCensusRowsToH3, summarizeCensusRows } from "./census-h3-helpers.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(SCRIPT_DIR, "..");

function parseArgs(argv) {
  const args = {
    state: "37",
    year: "2020",
    resolution: 7,
    input: null,
    outDir: "public/derived-data/census-h3",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--state") {
      args.state = next.padStart(2, "0");
      i += 1;
    } else if (arg === "--year") {
      args.year = next;
      i += 1;
    } else if (arg === "--resolution") {
      args.resolution = Number(next);
      i += 1;
    } else if (arg === "--input") {
      args.input = next;
      i += 1;
    } else if (arg === "--out-dir") {
      args.outDir = next;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.resolution) || args.resolution < 0 || args.resolution > 15) {
    throw new Error("--resolution must be an integer from 0 to 15");
  }

  return args;
}

function projectPath(path) {
  return resolve(PROJECT_DIR, path);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input
    ? projectPath(args.input)
    : projectPath(`public/data/census/census-blocks-${args.state}-${args.year}.json`);
  const outDir = projectPath(args.outDir);
  const baseName = `census-blocks-${args.state}-r${args.resolution}-${args.year}`;
  const outputPath = resolve(outDir, `${baseName}.json`);
  const manifestPath = resolve(outDir, `${baseName}.manifest.json`);

  const inputBytes = await readFile(inputPath);
  const sourceSha256 = createHash("sha256").update(inputBytes).digest("hex");
  const inputRows = JSON.parse(inputBytes.toString("utf8"));
  const outputRows = aggregateCensusRowsToH3(inputRows, args.resolution);

  await mkdir(outDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(outputRows)}\n`);

  const inputTotals = summarizeCensusRows(inputRows);
  const outputTotals = summarizeCensusRows(outputRows);
  const manifest = {
    generated_at: new Date().toISOString(),
    state: args.state,
    year: Number(args.year),
    h3_resolution: args.resolution,
    method: "Census PL 94-171 block internal points assigned to H3 cells; summed attributes are point aggregates, not polygon apportionment.",
    source_input: inputPath.replace(`${PROJECT_DIR}/`, ""),
    source_sha256: sourceSha256,
    output: outputPath.replace(`${PROJECT_DIR}/`, ""),
    input_records: inputRows.length,
    output_records: outputRows.length,
    input_totals: inputTotals,
    output_totals: outputTotals,
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Wrote ${outputRows.length.toLocaleString()} H3 cells from ${inputRows.length.toLocaleString()} Census block rows`);
  console.log(outputPath.replace(`${PROJECT_DIR}/`, ""));
  console.log(manifestPath.replace(`${PROJECT_DIR}/`, ""));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
