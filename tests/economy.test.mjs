import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startSurvival, walkSurvival } from "../survival.mjs";
import { validateEconomy, drawTarot, startEconomy, localMeals, marketPrice, shelters,
  nightMinutes, finishAction, buyMeal, sleepEconomy, restEconomy } from "../economy.mjs";

const data = validateEconomy(JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url))));
const survival = JSON.parse(readFileSync(new URL("../public/config.json", import.meta.url))).survival;
const info = { latitude: 44.54, longitude: 2.3 };
const town = { terrain: "place", countryCodes: ["FR"] };
const start = (hour = 12) => startEconomy(startSurvival(0, 0,
  Date.UTC(2026, 9, 17, hour), "balanced", survival), data, () => 0);
const shelter = { osmId: "node/1", name: "Test hostel", tags: { tourism: "hostel" } };

test("all 22 tarot draws have explicit budgets; daily draw never grants money again", () => {
  const ids = new Set();
  for (let i = 0; i < 22; i++) {
    const state = startEconomy(start(), data, () => (i + 0.5) / 22);
    ids.add(state.birthCard);
    assert.equal(state.walletCents, Math.round(data.tarot[i].mealUnits * 619));
  }
  assert.equal(ids.size, 22);
  for (const n of [-1, 1, NaN]) assert.throws(() => drawTarot(data, () => n));
  const state = start(23);
  const next = finishAction(state, { ...state, elapsedMinutes: 120 }, info, data, { random: () => 0.99 });
  assert.notEqual(next.dailyCard, state.dailyCard);
  assert.equal(next.birthCard, state.birthCard);
  assert.equal(next.walletCents, state.walletCents);
});

test("sourced specialties follow coordinates, not selected region or guessed country", () => {
  for (const [point, id] of [
    [info, "aligot"], [{ latitude: 48.85, longitude: 2.35 }, "croque"],
    [{ latitude: 45.92, longitude: 6.87 }, "tartiflette"],
    [{ latitude: -17.55, longitude: -149.56 }, "poisson-cru"],
  ]) assert.deepEqual(localMeals(point, data).map(m => m.id), [id]);
  assert.deepEqual(localMeals({ latitude: 0, longitude: 0 }, data), []);
});

test("Big Mac prices use comparable dollar values; absent countries are explicit reference, not France", () => {
  assert.equal(marketPrice(town, 1, data).cents, 619);
  assert.equal(marketPrice({ countryCodes: ["CH"] }, 1, data).cents,
    Math.round(619 * 9.0419272929956 / 7.07922094259998));
  for (const countryCodes of [[], ["PF"], ["FR", "CH"]]) {
    const price = marketPrice({ countryCodes }, 1, data);
    assert.equal(price.reference, true);
    assert.equal(price.market, null);
  }
});

test("paid meal restores reserve once, costs time and money, and cannot be bought outside town or without funds", () => {
  const state = { ...start(), reserveKcal: 300 };
  const next = buyMeal(state, town, info, "aligot", survival, data);
  assert.equal(next.walletCents, state.walletCents - 619);
  assert.equal(next.meals, 1);
  assert.equal(next.elapsedMinutes, 20);
  assert.ok(next.reserveKcal > 1100);
  assert.equal(state.reserveKcal, 300);
  assert.throws(() => buyMeal({ ...state, walletCents: 618 }, town, info, "aligot", survival, data), /funds/);
  assert.throws(() => buyMeal(state, { terrain: "forest" }, info, "aligot", survival, data), /settlement/);
  assert.throws(() => buyMeal(state, town, info, "poisson-cru", survival, data), /local meal/);
});

test("only current-cell mapped accommodation and explicitly free shelters are usable", () => {
  const cell = { pois: [shelter,
    { osmId: "node/2", tags: { amenity: "shelter" } },
    { osmId: "node/3", tags: { amenity: "shelter", fee: "no" } },
    { osmId: "node/4", tags: { tourism: "hotel", access: "private" } },
    { osmId: "node/5", tags: { tourism: "hostel", disused: "yes" } },
  ] };
  assert.deepEqual(shelters(cell).map(s => s.osmId), ["node/1", "node/3"]);
  const state = { ...start(22), fatigue: 60, awakeHours: 20 };
  const next = sleepEconomy(state, cell, info, "node/1", survival, data);
  assert.equal(next.fatigue, 0);
  assert.equal(next.awakeHours, 0);
  assert.equal(next.walletCents, state.walletCents - 4 * 619);
  assert.equal(next.outdoorNightMinutes, 0);
  const free = sleepEconomy({ ...state, walletCents: 0 }, cell, info, "node/3", survival, data);
  assert.equal(free.walletCents, 0);
  assert.throws(() => sleepEconomy(state, {}, info, "node/1", survival, data), /player's cell/);
});

test("outdoor nights increase fatigue during sleep, walking and rest; daytime has no exposure penalty", () => {
  const state = { ...start(22), fatigue: 40, awakeHours: 20 };
  const night = sleepEconomy(state, {}, info, null, survival, data);
  assert.ok(night.fatigue > 40);
  assert.ok(night.awakeHours > 0);
  assert.equal(night.walletCents, state.walletCents);
  assert.ok(night.outdoorNightMinutes > 400);
  const rest = restEconomy(state, info, survival, data);
  assert.ok(rest.fatigue > 40);
  const day = restEconomy({ ...start(), fatigue: 40 }, info, survival, data);
  assert.equal(day.fatigue, 20);
  const walk = walkSurvival(state, 1, 0, town, town, survival);
  assert.ok(finishAction(state, walk, info, data).fatigue > walk.fatigue);
  assert.equal(nightMinutes(start(), 30, info), 0);
  assert.equal(nightMinutes(state, 30, info), 30);
});

test("exposure can terminate a journey, shelter cannot bypass hunger, and invalid databases fail explicitly", () => {
  assert.equal(restEconomy({ ...start(22), fatigue: 99.5 }, info, survival, data).ended, "fatigue");
  assert.equal(sleepEconomy({ ...start(22), reserveKcal: 100 }, { pois: [shelter] },
    info, shelter.osmId, survival, data).ended, "hunger");
  for (const bad of [{}, { ...data, tarot: [] },
    { ...data, pricing: { ...data.pricing, referenceDollarPrice: 0 } }]) {
    assert.throws(() => validateEconomy(bad));
  }
});
