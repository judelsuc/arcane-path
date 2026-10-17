import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  startSurvival, characterProfile, hungerPercent, canEat, walkSurvival,
  restSurvival, sleepSurvival, eatSurvival, validateSurvivalConfig,
} from "../survival.mjs";
import { journeyDate } from "../travel.mjs";

const config = JSON.parse(readFileSync(new URL("../public/config.json", import.meta.url))).survival;
const road = { terrain: "road", elevationMeters: 100 };
const town = { terrain: "place" };
const start = (profile = "balanced", settings = config) =>
  startSurvival(0, 0, Date.UTC(2026, 9, 17, 8), profile, settings);

test("fresh journey starts fed, rested and with independent character attributes", () => {
  const state = start();
  assert.equal(hungerPercent(state, config), 0);
  assert.equal(state.awakeHours, 0);
  assert.equal(state.character.bodyMassKg, 40);
  assert.equal(state.character.baseSpeedKmh, 4.5);
  assert.equal(state.ended, null);
});

test("stronger faster character burns more energy per hour and per journey step", () => {
  const balanced = walkSurvival(start(), 1, 0, road, road, config);
  const sturdy = walkSurvival(start("sturdy"), 1, 0, road, road, config);
  assert.ok(sturdy.elapsedMinutes < balanced.elapsedMinutes);
  assert.ok(sturdy.energyKcal > balanced.energyKcal);
  assert.ok(hungerPercent(sturdy, config) > hungerPercent(balanced, config));
  assert.ok(sturdy.energyKcal / sturdy.elapsedMinutes > balanced.energyKcal / balanced.elapsedMinutes);
  assert.ok(restSurvival(start("sturdy"), config).energyKcal > restSurvival(start(), config).energyKcal);
});

test("endurance reduces fatigue and needs cost includes passive and active energy exactly once", () => {
  const next = walkSurvival(start(), 1, 0, road, road, config);
  const enduring = walkSurvival(start("enduring"), 1, 0, road, road, config);
  assert.ok(enduring.fatigue < next.fatigue);
  const expected = next.lastMove.energyKcal + config.basal_kcal_per_hour * next.lastMove.minutes / 60;
  assert.ok(Math.abs(next.energyKcal - expected) < 1e-10);
  assert.ok(Math.abs(next.reserveKcal - (config.reserve_kcal - expected)) < 1e-10);
  assert.equal(next.col, 1);
  assert.equal(next.row, 0);
  assert.equal(next.distanceMeters, 250);
});

test("hunger and sleep pressure slow walking without permanently altering profile", () => {
  const state = start();
  const fresh = walkSurvival(state, 1, 0, road, road, config);
  const hungry = walkSurvival({ ...state, reserveKcal: config.reserve_kcal * 0.2 }, 1, 0, road, road, config);
  const tired = walkSurvival({ ...state, awakeHours: 24 }, 1, 0, road, road, config);
  assert.ok(hungry.lastMove.speedKmh < fresh.lastMove.speedKmh);
  assert.ok(tired.lastMove.speedKmh < fresh.lastMove.speedKmh);
  assert.equal(hungry.character.baseSpeedKmh, state.character.baseSpeedKmh);
  assert.equal(hungry.character, state.character);
});

test("rest recovers exertion but cannot replace sleep or food", () => {
  const state = { ...start(), fatigue: 50, awakeHours: 20 };
  const rested = restSurvival(state, config);
  assert.equal(rested.fatigue, 30);
  assert.equal(rested.awakeHours, 20.5);
  assert.equal(rested.reserveKcal, config.reserve_kcal - 20);
  assert.equal(state.fatigue, 50);
});

test("sleep restores sleep pressure and fatigue, advances calendar and consumes basal energy", () => {
  const state = { ...start(), fatigue: 70, awakeHours: 24 };
  const slept = sleepSurvival(state, config);
  assert.equal(slept.awakeHours, 0);
  assert.equal(slept.fatigue, 0);
  assert.equal(slept.elapsedMinutes, 480);
  assert.equal(slept.energyKcal, 256);
  assert.equal(slept.sleeps, 1);
  assert.equal(journeyDate(slept).toISOString(), "2026-10-17T16:00:00.000Z");
});

test("town meals refill reserve up to capacity, take time and do not grant sleep", () => {
  const state = { ...start(), reserveKcal: 500, awakeHours: 10 };
  const fed = eatSurvival(state, town, config);
  assert.ok(fed.reserveKcal > state.reserveKcal);
  assert.equal(fed.meals, 1);
  assert.equal(fed.elapsedMinutes, 20);
  assert.ok(fed.awakeHours > state.awakeHours);
  assert.ok(eatSurvival(start(), town, config).reserveKcal <= config.reserve_kcal);
  assert.throws(() => eatSurvival(state, road, config), /settlement/);
  assert.equal(canEat(undefined), false);
});

test("each exhaustion threshold is exact and the terminal journey rejects all survival actions", () => {
  const hungry = restSurvival({ ...start(), reserveKcal: 20 }, config);
  const sleepy = restSurvival({ ...start(), awakeHours: config.sleep_limit_hours - 0.5 }, config);
  const exhausted = walkSurvival({ ...start(), fatigue: 99.99 }, 1, 0, road,
    { ...road, elevationMeters: 400 }, config);
  assert.equal(hungry.ended, "hunger");
  assert.equal(sleepy.ended, "sleep");
  assert.equal(exhausted.ended, "fatigue");
  for (const ended of [hungry, sleepy, exhausted]) {
    for (const action of [
      () => restSurvival(ended, config), () => sleepSurvival(ended, config),
      () => eatSurvival(ended, town, config), () => walkSurvival(ended, 1, 0, road, road, config),
    ]) assert.throws(action, /journey has ended/);
  }
});

test("sleeping hungry can end a journey; terrain water remains traversable", () => {
  assert.equal(sleepSurvival({ ...start(), reserveKcal: 100 }, config).ended, "hunger");
  assert.equal(walkSurvival(start(), 1, 0, road, { ...road, terrain: "water" }, config).col, 1);
});

test("configuration and profiles reject invalid values rather than silently defaulting", () => {
  for (const bad of [
    { ...config, reserve_kcal: NaN }, { ...config, sleep_hours: 0 },
    { ...config, sleep_limit_hours: config.sleep_warning_hours },
    { ...config, profiles: { balanced: {} } },
  ]) assert.throws(() => validateSurvivalConfig(bad));
  assert.throws(() => characterProfile({ strength: 0, endurance: 3, pace: 3 }));
  assert.throws(() => start("unknown"));
});
