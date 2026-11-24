import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { healthValue, migrateHealth, validateHealth } from "../health.mjs";
import { startSurvival, restSurvival, sleepSurvival, eatSurvival, walkSurvival } from "../survival.mjs";
import { startEconomy, finishAction } from "../economy.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { createTrail } from "../trail.mjs";
import { createNeedsNotices } from "../needs-notices.mjs";
import { isDeath } from "../death.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const survival = json("../public/config.json").survival, economy = json("../public/economy.json");
const map = json("../public/map.json");
const info = { latitude: 44.54, longitude: 2.3, terrain: "road" };
const road = { terrain: "road", elevationMeters: 0 };
const start = () => ({ ...startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 17, 12),
  "balanced", survival), economy, () => 0), trail: createTrail(map, 14, 10, () => 0) });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const rest = (s, minutes) => restSurvival(s, { ...survival, rest_minutes: minutes, rest_fatigue_recovery: 0 });
const sleep = (s, hours) => sleepSurvival(s, { ...survival, sleep_hours: hours });
const finish = (s, n, extra = {}) => finishAction(s, n, { ...info, ...extra }, economy, { survival, random: () => 0 });

test("starvation starts only after exact depletion and drains ten health per simulated hour", () => {
  const s = { ...start(), health: 50 };
  assert.equal(s.health, 50);
  const exact = rest({ ...s, reserveKcal: 40 }, 60);
  close(exact.health, 50);
  assert.equal(exact.reserveKcal, 0);
  assert.equal(exact.ended, null);
  close(rest({ ...s, reserveKcal: 20 }, 60).health, 45);
  close(rest({ ...s, reserveKcal: 0 }, 120).health, 30);
  const whole = rest({ ...s, reserveKcal: 20 }, 120);
  const split = rest(rest({ ...s, reserveKcal: 20 }, 60), 60);
  close(whole.health, split.health);
  close(whole.reserveKcal, split.reserveKcal);
});

test("fed sleep heals five per hour, unfed sleep damages health and meals never heal instantly", () => {
  const s = { ...start(), health: 50 };
  close(sleep(s, 2).health, 60);
  close(sleep({ ...s, reserveKcal: 0 }, 2).health, 30);
  close(sleep({ ...s, reserveKcal: 32 }, 2).health, 45);
  close(sleep({ ...s, health: 99, reserveKcal: 32 }, 2).health, 90);
  assert.equal(sleep({ ...s, health: 99 }, 2).health, 100);
  const fed = eatSurvival({ ...s, reserveKcal: 0 }, { terrain: "place" }, survival);
  assert.equal(fed.health, 50);
  assert.ok(fed.reserveKcal > 0);
  assert.equal(rest(s, 120).health, 50);
});

test("only zero health kills under new starvation rules and no meal, sleep or rest revives death", () => {
  const s = { ...start(), reserveKcal: 0, health: 10 };
  const dead = finish(s, rest(s, 60));
  assert.equal(dead.health, 0);
  assert.equal(dead.ended, "health");
  assert.equal(isDeath(dead), true);
  for (const action of [() => rest(dead, 30), () => sleep(dead, 8),
    () => eatSurvival(dead, { terrain: "place" }, survival)]) assert.throws(action, /ended/);
  const saved = createSave({ region: "firmi", map, state: dead, survival, economy }, 1);
  assert.deepEqual(validateSave(saved).state, dead);
});

test("cold advances depletion but never charges starvation twice or changes its hourly rate", () => {
  const weather = { months: Array.from({ length: 12 }, () => ({ minC: 0, maxC: 0, condition: "clear" })) };
  const s = { ...start(), reserveKcal: 40, health: 50 };
  const cold = finish(s, rest(s, 60), { weather });
  close(cold.health, 48);
  close(cold.energyKcal - s.energyKcal, 50);
  close(cold.reserveKcal, 0);
  assert.equal(cold.metabolism, undefined);
  const empty = { ...s, reserveKcal: 0 };
  close(finish(empty, rest(empty, 60), { weather }).health, 40);
});

test("hunger progressively slows walking even with food exhausted; weather and temporary speed stack without profile mutation", () => {
  const s = start(), baseline = walkSurvival(s, 1, 0, road, road, survival);
  const hungerSpeeds = [1, 0.5, 0].map(f => walkSurvival({ ...s, reserveKcal: survival.reserve_kcal * f },
    1, 0, road, road, survival).lastMove.speedKmh);
  assert.ok(hungerSpeeds[0] > hungerSpeeds[1] && hungerSpeeds[1] > hungerSpeeds[2]);
  close(hungerSpeeds[2], baseline.lastMove.speedKmh * (1 - survival.hunger_speed_penalty));
  const rainy = { weather: { months: Array.from({ length: 12 }, () => ({ condition: "rain" })) } };
  const exhausted = { ...s, reserveKcal: 0, speedEffect: { factor: 0.8, expiresMinutes: 90 } };
  const slow = walkSurvival(exhausted, 1, 0, road, road, survival, rainy);
  close(slow.lastMove.speedKmh, hungerSpeeds[2] * 0.85 * 0.8);
  assert.equal(slow.character, s.character);
  assert.equal(slow.ended, null);
  assert.ok(slow.health < s.health);
  close(slow.health, 100 - slow.lastMove.minutes / 60 * 10);
});

test("speed effects expire precisely within a move, including time passed resting, and remain bounded", () => {
  const s = start(), base = walkSurvival(s, 1, 0, road, road, survival);
  for (const factor of [0.8, 1.15]) {
    const modified = walkSurvival({ ...s, speedEffect: { factor, expiresMinutes: 2 } }, 1, 0, road, road, survival);
    close(modified.lastMove.minutes, 2 + base.lastMove.minutes - 2 * factor);
    assert.equal(modified.character, s.character);
    const rested = rest({ ...s, speedEffect: { factor, expiresMinutes: 2 } }, 5);
    const after = walkSurvival(rested, 1, 0, road, road, survival);
    const clean = walkSurvival({ ...rested, speedEffect: undefined }, 1, 0, road, road, survival);
    close(after.lastMove.minutes, clean.lastMove.minutes);
  }
});

test("legacy migration is explicit, does not revive old deaths and saves validate health/speed strictly", () => {
  const legacy = start();
  delete legacy.health;
  assert.equal(migrateHealth(legacy).health, 100);
  assert.equal(legacy.health, undefined);
  const oldDead = migrateHealth({ ...legacy, reserveKcal: 0, ended: "hunger" });
  assert.equal(oldDead.health, 0);
  assert.equal(oldDead.ended, "hunger");
  assert.equal(healthValue(oldDead), 0);
  const active = { ...start(), reserveKcal: 0, health: 20, speedEffect: { factor: 1.15, expiresMinutes: 90 } };
  const saved = createSave({ region: "firmi", map, state: active, survival, economy }, 1);
  assert.deepEqual(validateSave(saved).state, active);
  for (const health of [-1, 101, NaN, null, 0]) {
    assert.throws(() => validateHealth({ ...active, health }));
  }
  for (const speedEffect of [{ factor: 0 }, { factor: 2, expiresMinutes: 90 },
    { factor: 1.1, expiresMinutes: NaN }]) assert.throws(() => validateHealth({ ...active, speedEffect }));
  assert.throws(() => validateHealth({ ...active, ended: "health", health: 20 }));
  const notices = createNeedsNotices();
  assert.equal(notices.pending({ ...active, health: 25 }, survival), "healthWarning");
  notices.shown("healthWarning");
  assert.equal(notices.pending({ ...active, health: 25 }, survival), "warning");
  notices.pending({ ...active, health: 26 }, survival);
  assert.equal(notices.pending({ ...active, health: 25 }, survival), "healthWarning");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="needs-health"[^>]*optimum="100"/);
});
