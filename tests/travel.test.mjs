import assert from "node:assert/strict";
import test from "node:test";
import { chunkPosition, initialJourney, journeyDate, moveJourney, restJourney, travelCost } from "../travel.mjs";

const road = { terrain: "major_road", elevationMeters: 100 };

test("250m road walk advances position, exact simulated time, fatigue and energy", () => {
  const state = initialJourney(0, 0, Date.UTC(2026, 9, 17, 8));
  const next = moveJourney(state, 1, 0, road, road);
  assert.equal(next.col, 1);
  assert.equal(next.row, 0);
  assert.equal(next.distanceMeters, 250);
  assert.equal(next.lastMove.speedKmh, 4.5);
  assert.ok(Math.abs(next.elapsedMinutes - 10 / 3) < 1e-10);
  assert.ok(next.fatigue > 0);
  assert.equal(next.energyKcal, 7.5);
  assert.equal(journeyDate(next).toISOString(), "2026-10-17T08:03:20.000Z");
  assert.equal(state.elapsedMinutes, 0);
});

test("height and ground change costs; fatigue reduces speed without blocking", () => {
  const flat = travelCost(road, road, 250, 0);
  const climb = travelCost(road, { ...road, elevationMeters: 150 }, 250, 0);
  const descent = travelCost({ ...road, elevationMeters: 150 }, road, 250, 0);
  const forest = travelCost(road, { terrain: "forest", elevationMeters: 100 }, 250, 0);
  assert.ok(climb.minutes > flat.minutes);
  assert.ok(climb.energyKcal > flat.energyKcal);
  assert.equal(climb.ascentMeters, 50);
  assert.equal(descent.descentMeters, 50);
  assert.ok(forest.minutes > flat.minutes);
  assert.ok(travelCost(road, road, 250, 100).minutes > flat.minutes);
  for (const terrain of ["water", "mountain", "rail", "cable", "building", "field", "plain", "place"]) {
    const result = travelCost(road, { terrain, elevationMeters: 500 }, 250, 100);
    assert.ok(Number.isFinite(result.minutes) && result.speedKmh >= 0.5);
  }
});

test("missing height is an explicit flat-slope estimate, not invented elevation", () => {
  const cost = travelCost(road, { terrain: "grass" }, 250, 0);
  assert.equal(cost.elevationKnown, false);
  assert.equal(cost.ascentMeters, 0);
  assert.equal(cost.descentMeters, 0);
});

test("rest recovers bounded fatigue but consumes time and basal energy, not food inventory", () => {
  const state = { ...initialJourney(1, -1, Date.UTC(2026, 9, 17, 23, 50)), fatigue: 12 };
  const rested = restJourney(state);
  assert.equal(rested.fatigue, 0);
  assert.equal(rested.energyKcal, 20);
  assert.equal(journeyDate(rested).toISOString(), "2026-10-18T00:20:00.000Z");
  assert.equal(rested.col, 1);
  assert.equal(rested.row, -1);
  assert.equal(rested.distanceMeters, 0);
});

test("fatigue saturates at 100 and every subsequent walk still succeeds", () => {
  let state = initialJourney(0, 0);
  for (let i = 0; i < 200; i++) {
    state = moveJourney(state, 0, -1, road, { terrain: "mountain", elevationMeters: 1000 });
  }
  assert.equal(state.fatigue, 100);
  assert.equal(state.row, -200);
  assert.ok(Number.isFinite(state.energyKcal));
});

test("negative chunk crossings keep stable global positions", () => {
  assert.deepEqual(chunkPosition(-1, -9), { x: -1, y: -2, col: 7, row: 7 });
  assert.deepEqual(chunkPosition(8, 7), { x: 1, y: 0, col: 0, row: 7 });
  assert.throws(() => moveJourney(initialJourney(0, 0), 1, 1, road, road));
  assert.throws(() => travelCost(road, { terrain: "unknown" }, 250, 0));
  assert.throws(() => travelCost(road, road, NaN, 0));
});
