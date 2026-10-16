import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cellInfo } from "../cell-info.mjs";

for (const path of ["map.json", "maps/alps.json", "maps/paris.json"]) {
  const map = JSON.parse(readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8"));
  test(`cell centers stay within the downloaded bounds including partial edge cells: ${path}`, () => {
    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        const info = cellInfo(map, row, col);
        assert.ok(info.latitude >= map.bounds.minLatitude && info.latitude <= map.bounds.maxLatitude);
        assert.ok(info.longitude >= map.bounds.minLongitude && info.longitude <= map.bounds.maxLongitude);
        assert.equal(info.terrain, map.rows[row][col].terrain);
        assert.equal(info.row, row + 1);
        assert.equal(info.col, col + 1);
        assert.equal(info.meters, map.cellSizeMeters);
      }
    }
    assert.ok(cellInfo(map, 0, 0).latitude > cellInfo(map, map.height - 1, 0).latitude);
    assert.ok(cellInfo(map, 0, 0).longitude < cellInfo(map, 0, map.width - 1).longitude);
  });
}

test("reports invalid cell indices", () => {
  const map = { width: 1, height: 1 };
  for (const [row, col] of [[-1, 0], [0, 1], [0.5, 0], [NaN, 0]]) {
    assert.throws(() => cellInfo(map, row, col), /outside the map/);
  }
});

test("retains real names without inventing names for unnamed cells", () => {
  const map = {
    width: 2, height: 1, cellSizeMeters: 250,
    bounds: { minLatitude: 44.53, maxLatitude: 44.54, minLongitude: 2.3, maxLongitude: 2.32 },
    rows: [[{ terrain: "place", names: ["Firmi"] }, { terrain: "forest" }]],
  };
  assert.deepEqual(cellInfo(map, 0, 0).names, ["Firmi"]);
  assert.deepEqual(cellInfo(map, 0, 1).names, []);
});
