import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregateCensusRowsToH3 } from "./census-h3-helpers.mjs";

test("aggregates Census block point rows into H3 cells with source counts", () => {
  const rows = [
    {
      geoid: "370010001001000",
      lat: 35.00001,
      lng: -80.00001,
      total_population: 10,
      voting_age_population: 8,
      black_alone: 2,
      hispanic_or_latino: 1,
      non_hispanic_white_alone: 7,
    },
    {
      geoid: "370010001001001",
      lat: 35.00002,
      lng: -80.00002,
      total_population: 15,
      voting_age_population: 9,
      black_alone: 3,
      hispanic_or_latino: 2,
      non_hispanic_white_alone: 10,
    },
  ];

  const cells = aggregateCensusRowsToH3(rows, 7, { includeSourceGeoids: true });

  assert.equal(cells.length, 1);
  assert.equal(typeof cells[0].h3, "string");
  assert.equal(typeof cells[0].lat, "number");
  assert.equal(typeof cells[0].lng, "number");
  assert.equal(cells[0].source_count, 2);
  assert.equal(cells[0].total_population, 25);
  assert.equal(cells[0].voting_age_population, 17);
  assert.equal(cells[0].black_alone, 5);
  assert.equal(cells[0].hispanic_or_latino, 3);
  assert.equal(cells[0].non_hispanic_white_alone, 17);
  assert.deepEqual(cells[0].source_geoids, ["370010001001000", "370010001001001"]);
});

test("skips malformed Census rows instead of emitting impossible H3 cells", () => {
  const cells = aggregateCensusRowsToH3(
    [
      { lat: 35, lng: -80, total_population: 4 },
      { lat: null, lng: -80, total_population: 9 },
      { lat: 36, lng: undefined, total_population: 11 },
    ],
    7,
  );

  assert.equal(cells.length, 1);
  assert.equal(cells[0].source_count, 1);
  assert.equal(cells[0].total_population, 4);
});
