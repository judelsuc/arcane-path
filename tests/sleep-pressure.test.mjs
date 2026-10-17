import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startSurvival, restSurvival, wakingSleepHours } from "../survival.mjs";
import { startEconomy, finishAction, sleepEconomy } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { createSave, validateSave } from "../journey-save.mjs";

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const survival = json("../public/config.json").survival;
const economy = json("../public/economy.json");
const map = json("../public/map.json");
const info = { terrain: "place", latitude: 44.54, longitude: 2.3 };
const start = (hour, minute = 0) => ({
  ...startEconomy(startSurvival(12, 12, Date.UTC(2026, 9, 17, hour, minute),
    "balanced", survival), economy, () => 0),
  trail: createTrail(map, 12, 12, () => 0),
});
const finish = (previous, next, sheltered = false) => finishAction(previous, next,
  info, economy, { survival, sheltered, random: () => 0 });

test("sleep bar grows at exactly 1x by day, 2x at 22-02 and 4x at 02-06 UTC", () => {
  for (const [hour, expected] of [[6, 1], [12, 1], [21, 1], [22, 2], [0, 2], [2, 4], [5, 4]]) {
    assert.equal(wakingSleepHours(start(hour), 60), expected);
  }
  assert.equal(wakingSleepHours(start(21, 30), 60), 1.5);
  assert.equal(wakingSleepHours(start(1, 30), 60), 3);
  assert.equal(wakingSleepHours(start(5, 30), 60), 2.5);
  assert.equal(wakingSleepHours(start(23, 30), 60), 2);
  assert.equal(wakingSleepHours(start(0), 24 * 60), 40);
  assert.equal(wakingSleepHours(start(0), 48 * 60), 80);
});

test("passing 02:00 does not collapse a rested player; a full sleep bar uses the fainting penalty", () => {
  const rested = start(1, 50);
  const awake = finish(rested, restSurvival(rested, survival));
  assert.equal(awake.faints, undefined);
  assert.ok(Math.abs(awake.awakeHours - 5 / 3) < 1e-12);
  const state = { ...start(2), awakeHours: survival.sleep_limit_hours - 1, fatigue: 5 };
  const next = finish(state, restSurvival(state, survival));
  assert.equal(next.faints, 1);
  assert.equal(next.ended, null);
  assert.equal(next.fatigue, 40);
  assert.equal(next.elapsedMinutes, 30 + 480);
  assert.equal(next.lastFaint.reason, "sleep");
  assert.equal(next.awakeHours, survival.sleep_limit_hours - 8 * survival.sleep_recovery_per_hour);
  assert.equal(next.sleeps, 0);
  assert.equal(next.walletCents, state.walletCents - next.lastFaint.stolenCents);
  assert.ok(next.reserveKcal < state.reserveKcal);
  const again = finish(next, restSurvival(next, survival));
  assert.equal(again.faints, 1);
  assert.equal(again.ended, null);
  const save = createSave({ region: "firmi", map, state: next, survival, economy }, 1);
  assert.deepEqual(validateSave(save).state, next);
  save.state.lastFaint.reason = "unknown";
  assert.throws(() => validateSave(save), /fainting/);
});

test("sleep growth also applies indoors, voluntary sleep still recovers normally, hunger and old ended saves stay terminal", () => {
  const state = { ...start(2), awakeHours: survival.sleep_limit_hours - 1 };
  const indoors = finish(state, restSurvival(state, survival), true);
  assert.equal(indoors.lastFaint.reason, "sleep");
  assert.equal(indoors.lastFaint.sheltered, true);
  const slept = sleepEconomy(state, { terrain: "place" }, info, null, survival, economy);
  assert.equal(slept.faints, undefined);
  assert.equal(slept.sleeps, 1);
  const hungry = finish({ ...state, reserveKcal: 1 },
    restSurvival({ ...state, reserveKcal: 1 }, survival));
  assert.equal(hungry.ended, "hunger");
  assert.equal(hungry.faints, undefined);
  assert.throws(() => finish({ ...state, ended: "sleep" }, state), /ended/);
});
