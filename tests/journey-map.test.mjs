import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recordJourneyPosition, validateJourneyMap, journeyMapView, drawJourneyMap,
  journeyMapDescription, MAX_JOURNEY_POINTS } from "../journey-map.mjs";
import { moveJourney, initialJourney } from "../travel.mjs";
import { translate } from "../i18n.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { createTrail } from "../trail.mjs";

const cell = { terrain: "road", elevationMeters: 0 };
test("actual walking records turns, backtracking and straight geometry without changing costs", () => {
  let state = initialJourney(0, 0, 0);
  for (const [dc, dr] of [[1, 0], [1, 0], [0, -1], [0, 1], [1, 0]]) {
    state = moveJourney(state, dc, dr, cell, cell);
  }
  assert.deepEqual(state.journeyMap.points, [
    { col: 0, row: 0 }, { col: 2, row: 0 }, { col: 2, row: -1 },
    { col: 2, row: 0 }, { col: 3, row: 0 },
  ]);
  assert.equal(state.distanceMeters, 1250);
  assert.equal(state.journeyMap.partial, false);
  validateJourneyMap(state);
  assert.equal(recordJourneyPosition(state), state);
});

test("legacy path is never reconstructed from guessed stops or hidden destinations", () => {
  const state = { col: 4, row: 6, distanceMeters: 9000, trail: {
    origin: { col: -10, row: 2 },
    stages: [{ col: 3, row: 4, name: "Visited" }, { col: 99, row: 99, name: "Secret" }],
    arrivals: [{ stage: 0 }],
  } };
  const saved = recordJourneyPosition(state);
  const next = recordJourneyPosition({ ...saved, col: 5 });
  const view = journeyMapView(next);
  assert.equal(view.partial, true);
  assert.deepEqual(view.points, [{ col: 4, row: 6 }, { col: 5, row: 6 }]);
  assert.equal(view.stops.length, 3);
  assert.doesNotMatch(JSON.stringify(view), /Secret|99/);
  assert.throws(() => journeyMapView(next, NaN), /scale/);
});

test("very long journeys remain bounded and label geometric simplification", () => {
  const points = Array.from({ length: MAX_JOURNEY_POINTS }, (_, index) => ({
    col: Math.floor(index / 2), row: index % 2,
  }));
  const state = { col: 4096, row: 1, journeyMap: {
    version: 1, points, partial: false, simplified: false,
  } };
  const next = recordJourneyPosition(state);
  assert.ok(next.journeyMap.points.length <= MAX_JOURNEY_POINTS);
  assert.deepEqual(next.journeyMap.points[0], points[0]);
  assert.deepEqual(next.journeyMap.points.at(-1), { col: 4096, row: 1 });
  assert.equal(next.journeyMap.simplified, true);
  validateJourneyMap(next);
});

test("save roundtrip preserves route and rejects malformed data while old saves remain valid", () => {
  const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
  const map = json("../public/map.json"), survival = json("../public/config.json").survival,
    economy = json("../public/economy.json");
  const state = recordJourneyPosition({ ...startEconomy(startSurvival(14, 10,
    Date.UTC(2026, 9, 17), "sturdy", survival), economy, () => 0),
    trail: createTrail(map, 14, 10, () => 0) });
  const save = createSave({ region: "firmi", map, state, survival, economy }, 1);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save))).state.journeyMap, state.journeyMap);
  for (const mutate of [
    map => { map.version = 2; }, map => { map.points = []; },
    map => { map.points[0].col++; }, map => { map.partial = "yes"; },
    map => { map.points = Array(MAX_JOURNEY_POINTS + 1).fill({ col: 14, row: 10 }); },
  ]) {
    const invalid = structuredClone(save);
    mutate(invalid.state.journeyMap);
    assert.throws(() => validateSave(invalid), /journey map/);
  }
  delete save.state.journeyMap;
  validateSave(save);
});

for (const locale of ["fr", "en"]) {
  test(`${locale} schematic map fits both singleton and long routes, shows north/scale and no fake links`, () => {
    const labels = [], coordinates = [];
    const ctx = { fillRect() {}, setLineDash() {}, beginPath() {}, stroke() {}, fill() {},
      moveTo(...p) { coordinates.push(p); }, lineTo(...p) { coordinates.push(p); },
      arc(x, y) { coordinates.push([x, y]); }, fillText(text) { labels.push(text); } };
    const canvas = { getContext: () => ctx };
    const t = (key, args) => translate(locale, key, args);
    for (const state of [
      { col: -100, row: -100, distanceMeters: 0 },
      recordJourneyPosition({ ...recordJourneyPosition({ col: -300, row: 70, distanceMeters: 3 }), col: 400 }),
    ]) {
      const view = journeyMapView(state);
      drawJourneyMap(canvas, view, t);
      assert.ok(labels.includes(t("journalMapNorth")));
      assert.match(labels.join(" "), /km/);
      assert.ok(coordinates.flat().every(Number.isFinite));
      assert.ok(coordinates.every(([x, y]) => x >= 0 && x <= 1200 && y >= 0 && y <= 800));
      assert.ok(journeyMapDescription(view, t).includes(t("journalMapNote")));
    }
  });
}
