import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { temperatureModifiers, precipitationModifiers, applyWeatherExposure,
  exposureTemperature, weatherWalkingFactor } from "../weather-effects.mjs";
import { startSurvival, restSurvival, walkSurvival } from "../survival.mjs";
import { startEconomy, finishAction, sleepEconomy, restEconomy, restEffect } from "../economy.mjs";
import { askDirections } from "../directions.mjs";
import { askHospitality } from "../hospitality.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { createTrail } from "../trail.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const survival = json("../public/config.json").survival, economy = json("../public/economy.json");
const map = json("../public/map.json");
const start = (hour = 12) => ({
  ...startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 17, hour), "balanced", survival), economy, () => 0),
  trail: createTrail(map, 14, 10, () => 0),
});
const weatherInfo = (temperature, condition = "clear") => ({
  latitude: 44.54, longitude: 2.3, elevationMeters: 100,
  weather: { elevationMeters: 100,
    months: Array.from({ length: 12 }, () => ({ minC: temperature, maxC: temperature, condition })) },
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const finalize = (previous, next, info, sheltered = false) =>
  finishAction(previous, next, info, economy, { survival, sheltered, random: () => 0 });
const road = { terrain: "road", elevationMeters: 0 };

test("temperature thresholds are strict and proportional with exact agreed caps", () => {
  for (const [temp, calories, fatigue] of [[10, 0, 0], [30, 0, 0], [20, 0, 0],
    [0, 0.25, 0], [-10, 0.5, 0], [-30, 1, 0], [-60, 1, 0],
    [35, 0, 2], [40, 0, 4], [55, 0, 10], [80, 0, 10]]) {
    assert.deepEqual(temperatureModifiers(temp), { extraCaloriesFactor: calories, fatiguePerHour: fatigue });
  }
  assert.ok(temperatureModifiers(9.99).extraCaloriesFactor > 0);
  assert.ok(temperatureModifiers(30.01).fatiguePerHour > 0);
  for (const value of [null, undefined, NaN, Infinity]) assert.throws(() => temperatureModifiers(value), /temperature/);
});

test("rain and storms have exact fatigue and speed penalties; other weather stays unchanged", () => {
  assert.deepEqual(precipitationModifiers("rain"), { fatiguePerHour: 2, speedFactor: 0.85 });
  assert.deepEqual(precipitationModifiers("storm"), { fatiguePerHour: 4, speedFactor: 0.75 });
  for (const condition of ["clear", "cloudy", "fog", "snow"]) {
    assert.deepEqual(precipitationModifiers(condition), { fatiguePerHour: 0, speedFactor: 1 });
  }
});

test("cold charges actual basal and effort calories once, while heat stacks with rain by elapsed time", () => {
  const state = start(), before = structuredClone(state);
  const rested = restSurvival(state, { ...survival, rest_minutes: 60, rest_fatigue_recovery: 0 });
  const baselineKcal = state.reserveKcal - rested.reserveKcal;
  const cold = finalize(state, rested, weatherInfo(0));
  close(state.reserveKcal - cold.reserveKcal, baselineKcal * 1.25);
  close(cold.energyKcal - state.energyKcal, baselineKcal * 1.25);
  const wetCold = finalize(state, rested, weatherInfo(0, "rain"));
  close(wetCold.reserveKcal, cold.reserveKcal);
  close(wetCold.fatigue, rested.fatigue + 2);
  const hotStorm = finalize(state, rested, weatherInfo(40, "storm"));
  close(hotStorm.fatigue, rested.fatigue + 8);
  close(hotStorm.reserveKcal, rested.reserveKcal);
  const moving = walkSurvival(state, 1, 0, road, road, survival);
  const movedCold = finalize(state, moving, weatherInfo(0));
  close(state.reserveKcal - movedCold.reserveKcal, (state.reserveKcal - moving.reserveKcal) * 1.25);
  assert.deepEqual(state, before);
});

test("rain slows actual walking and increases metabolism/exertion fatigue without changing the character", () => {
  const state = start();
  const dry = walkSurvival(state, 1, 0, road, road, survival, weatherInfo(20));
  for (const [condition, factor] of [["rain", 0.85], ["storm", 0.75]]) {
    const info = weatherInfo(20, condition);
    assert.equal(weatherWalkingFactor(state, info), factor);
    const wet = walkSurvival(state, 1, 0, road, road, survival, info);
    close(wet.lastMove.speedKmh, dry.lastMove.speedKmh * factor);
    close(wet.elapsedMinutes, dry.elapsedMinutes / factor);
    assert.ok(wet.reserveKcal < dry.reserveKcal);
    assert.deepEqual(wet.character, state.character);
    const finished = finalize(state, wet, info);
    close(finished.fatigue - wet.fatigue, wet.elapsedMinutes / 60 * precipitationModifiers(condition).fatiguePerHour);
  }
});

test("sheltered actions are exempt, outdoor sleep keeps reduced sleep recovery without fatigue recovery", () => {
  const state = { ...start(23), fatigue: 20, awakeHours: 16, walletCents: 100000 };
  const cell = { terrain: "place", countryCodes: ["FR"], pois: [
    { osmId: "node/1", tags: { tourism: "hotel" } },
  ] };
  for (const info of [weatherInfo(0, "rain"), weatherInfo(35, "storm")]) {
    const sheltered = sleepEconomy(state, cell, info, "node/1", survival, economy);
    const normal = sleepEconomy(state, cell, { latitude: info.latitude, longitude: info.longitude },
      "node/1", survival, economy);
    assert.deepEqual({ ...sheltered, dailyCard: normal.dailyCard }, normal);
    const outdoors = sleepEconomy(state, cell, info, null, survival, economy);
    assert.ok(outdoors.fatigue >= state.fatigue);
    close(outdoors.awakeHours, Math.max(0, state.awakeHours -
      survival.sleep_hours * survival.sleep_recovery_per_hour * economy.rules.outdoorSleepRecoveryFactor));
    assert.equal(outdoors.sleeps, state.sleeps + 1);
    assert.ok(outdoors.reserveKcal < state.reserveKcal);
  }
});

test("exposure applies during directions and hospitality requests, but not hosted sleep", () => {
  const state = start(), cold = weatherInfo(0);
  const asked = askDirections(state, { terrain: "place" }, cold, survival, economy, () => 0);
  close(state.reserveKcal - asked.state.reserveKcal, survival.basal_kcal_per_hour / 6 * 1.25);
  const town = { terrain: "place", settlements: [{ osmId: "node/123", name: "Test" }] };
  let hosted;
  for (let i = 0; i < 100 && !hosted; i++) {
    const s = { ...state, startedAt: state.startedAt + i };
    const next = askHospitality(s, town, cold, survival, economy, () => 0);
    if (next.hospitalityAttempts[0].outcome === "hosted") hosted = next;
  }
  assert.ok(hosted);
  close(state.reserveKcal - hosted.reserveKcal, survival.basal_kcal_per_hour * (
    0.5 * 1.25 + survival.sleep_hours * survival.sleep_metabolism_factor));
});

test("temperature uses altitude, changing hours/months, and only affects available weather", () => {
  const date = new Date(Date.UTC(2026, 9, 17, 12)), info = weatherInfo(10);
  close(exposureTemperature(date, { ...info, elevationMeters: 1100 }), 3.5);
  assert.equal(exposureTemperature(date, { latitude: 0, longitude: 0 }), null);
  const s = start(), next = restSurvival(s, survival);
  assert.strictEqual(applyWeatherExposure(s, next, {}), next);
  assert.equal(weatherWalkingFactor(s, undefined), 1);
  const daily = weatherInfo(0);
  daily.weather.months[9] = { minC: 0, maxC: 20, condition: "clear" };
  assert.notEqual(exposureTemperature(new Date(Date.UTC(2026, 9, 17, 4)), daily),
    exposureTemperature(new Date(Date.UTC(2026, 9, 17, 14)), daily));
  const monthly = weatherInfo(20);
  monthly.weather.months[10] = { minC: 40, maxC: 40, condition: "storm" };
  const previous = { ...s, startedAt: Date.UTC(2026, 9, 31, 23, 30) };
  const after = { ...previous, elapsedMinutes: 60 };
  close(applyWeatherExposure(previous, after, monthly).fatigue, 4);
});

test("cold hunger and heat collapse finalize correctly, including exposure during unconsciousness and save/resume", () => {
  const state = { ...start(), reserveKcal: 23 };
  const next = restSurvival(state, { ...survival, rest_fatigue_recovery: 0 });
  assert.equal(next.ended, null);
  assert.equal(finalize(state, next, weatherInfo(0)).ended, "hunger");
  const hotState = { ...start(), fatigue: 99 };
  const resting = restSurvival(hotState, { ...survival, rest_minutes: 60, rest_fatigue_recovery: 0 });
  const hot = finalize(hotState, resting, weatherInfo(35));
  assert.equal(hot.faints, 1);
  assert.equal(hot.elapsedMinutes, 540);
  close(hot.fatigue, 56);
  const saved = createSave({ region: "firmi", map, state: hot, survival, economy }, 1);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(saved))).state, hot);
});

test("rest preview agrees with actual heat/rain rest fatigue", () => {
  const state = { ...start(), fatigue: 50 };
  for (const info of [weatherInfo(40, "storm"), weatherInfo(0, "rain")]) {
    close(restEffect(state, info, survival, economy).fatigue, restEconomy(state, info, survival, economy).fatigue);
  }
  assert.doesNotThrow(() => restEffect({ ...state, ended: "hunger" }, weatherInfo(20), survival, economy));
});
