import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startSurvival, walkSurvival } from "../survival.mjs";
import { validateEconomy, drawTarot, startEconomy, localMeals, mealOptions, marketPrice, shelters, restEffect, refreshNightRest,
  nightMinutes, finishAction, buyMeal, sleepEconomy, restEconomy,
  dailyTarotPending, acknowledgeDailyTarot, refreshPricing, refreshMeals } from "../economy.mjs";

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

test("daily reveal is pending on a new date even for the same card, and acknowledgment never rerolls", () => {
  const initial = start(23);
  assert.equal(dailyTarotPending(initial), false);
  const next = finishAction(initial, { ...initial, elapsedMinutes: 120 }, info, data, { random: () => 0 });
  assert.equal(next.dailyCard, initial.dailyCard);
  assert.equal(dailyTarotPending(next), true);
  const acknowledged = acknowledgeDailyTarot(next);
  assert.equal(dailyTarotPending(acknowledged), false);
  assert.deepEqual(acknowledged, { ...next, dailyTarotSeenDay: next.tarotDay });
  assert.throws(() => acknowledgeDailyTarot(acknowledged), /No daily/);
  const another = finishAction(acknowledged, { ...acknowledged, elapsedMinutes: 1560 }, info, data, { random: () => 0.5 });
  assert.equal(dailyTarotPending(another), true);
  assert.equal(another.birthCard, initial.birthCard);
  assert.deepEqual(another.character, initial.character);
  assert.equal(another.walletCents, initial.walletCents);
  assert.equal(dailyTarotPending({ ...another, ended: "hunger" }), false);
});

test("sourced specialties follow coordinates, not selected region or guessed country", () => {
  for (const [point, id] of [
    [info, "aligot"], [{ latitude: 48.85, longitude: 2.35 }, "croque"],
    [{ latitude: 45.92, longitude: 6.87 }, "tartiflette"],
    [{ latitude: -17.55, longitude: -149.56 }, "poisson-cru"],
  ]) assert.deepEqual(localMeals(point, data).map(m => m.id), [id]);
  assert.deepEqual(localMeals({ latitude: 0, longitude: 0 }, data), []);
});

test("European dishes cover 15 countries with confirmed country matching and bounded regional coverage", () => {
  const examples = [
    ["FR", 49.387, 3.005, "ficelle-picarde"], ["IT", 40.85, 14.27, "pizza-napoletana"],
    ["ES", 40.42, -3.7, "tortilla"], ["PT", 38.72, -9.14, "bacalhau-bras"],
    ["CH", 46.95, 7.45, "rosti"], ["AT", 48.21, 16.37, "wiener-schnitzel"],
    ["DE", 52.52, 13.4, "bratwurst"], ["BE", 50.85, 4.35, "carbonnade"],
    ["NL", 52.37, 4.9, "stamppot"], ["PL", 50.06, 19.94, "pierogi"],
    ["HU", 47.5, 19.04, "gulyas"], ["CZ", 50.08, 14.43, "svickova"],
    ["GR", 37.98, 23.73, "moussaka"], ["IE", 53.35, -6.26, "irish-stew"],
    ["GB", 55.95, -3.19, "haggis"],
  ];
  assert.equal(new Set(examples.map(([code]) => code)).size, 15);
  for (const [code, latitude, longitude, id] of examples) {
    const point = { latitude, longitude };
    assert.ok(localMeals(point, data, [code]).some(m => m.id === id), id);
    assert.ok(mealOptions({ terrain: "place", countryCodes: [code] }, point, data).some(m => m.id === id));
    for (const codes of [[], ["US"], [code, "US"]]) {
      assert.ok(!localMeals(point, data, codes).some(m => m.id === id), `${id}: ${codes}`);
    }
    const purchased = buyMeal({ ...start(), reserveKcal: 300, walletCents: 10000 },
      { terrain: "place", countryCodes: [code] }, point, id, survival, data);
    assert.equal(purchased.meals, 1);
    assert.equal(purchased.elapsedMinutes, survival.meal_minutes);
  }
  assert.ok(!localMeals({ latitude: 51.5, longitude: -0.12 }, data, ["GB"]).some(m => m.id === "haggis"));
  assert.ok(!localMeals({ latitude: 45.46, longitude: 9.19 }, data, ["IT"]).some(m => m.id === "pizza-napoletana"));
  assert.ok(!localMeals({ latitude: 46.2, longitude: 6.14 }, data, ["FR"]).some(m => m.id === "rosti"));
});

test("new dishes refresh existing saves without replacing pinned meals, rules, prices or tarot", () => {
  const saved = structuredClone(data);
  saved.meals = saved.meals.slice(0, 4);
  saved.meals[0].reserveKcal = 777;
  const before = structuredClone(saved);
  const updated = refreshMeals(saved, data);
  assert.equal(updated.meals.length, 19);
  assert.deepEqual(updated.meals.slice(0, 4), before.meals);
  assert.deepEqual({ ...updated, meals: before.meals }, before);
  assert.deepEqual(saved, before);
  assert.deepEqual(refreshMeals(updated, data), updated);
  updated.meals.at(-1).name = "mutated";
  assert.notEqual(data.meals.at(-1).name, "mutated");
  for (const invalid of [
    m => { m.scope = "global"; }, m => { m.countries = []; },
    m => { m.countries = ["France"]; }, m => { m.area = ""; },
  ]) {
    const corrupt = structuredClone(data);
    invalid(corrupt.meals.at(-1));
    assert.throws(() => refreshMeals(saved, corrupt), /Invalid economy/);
  }
});

test("national prices use comparable dollar values and missing countries use the European mean", () => {
  assert.equal(marketPrice(town, 1, data).cents, 560);
  assert.equal(marketPrice({ countryCodes: ["IT"] }, 1, data).cents, 656);
  assert.equal(marketPrice({ countryCodes: ["CH"] }, 1, data).cents,
    Math.round(619 * 9.0419272929956 / 7.07922094259998));
  for (const countryCodes of [[], ["PF"], ["FR", "CH"]]) {
    const price = marketPrice({ countryCodes }, 1, data, info);
    assert.equal(price.reference, true);
    assert.equal(price.market, null);
    assert.equal(price.estimated, true);
  }
});

test("paid meal restores reserve once, costs time and money, and cannot be bought outside town or without funds", () => {
  const state = { ...start(), reserveKcal: 300 };
  const next = buyMeal(state, town, info, "aligot", survival, data);
  assert.equal(next.walletCents, state.walletCents - 560);
  assert.equal(next.meals, 1);
  assert.equal(next.elapsedMinutes, 20);
  assert.ok(next.reserveKcal > 1100);
  assert.equal(state.reserveKcal, 300);
  assert.throws(() => buyMeal({ ...state, walletCents: 559 }, town, info, "aligot", survival, data), /funds/);
  assert.throws(() => buyMeal(state, { terrain: "forest" }, info, "aligot", survival, data), /settlement/);
  assert.throws(() => buyMeal(state, town, info, "poisson-cru", survival, data), /local meal/);
});

test("every settlement offers a priced basic meal, including Engins and legacy economies without local specialties", () => {
  const engins = { latitude: 45.182, longitude: 5.616 };
  assert.deepEqual(localMeals(engins, data), []);
  assert.deepEqual(mealOptions(town, engins, data).map(m => m.id), ["basic-meal"]);
  const state = { ...start(), reserveKcal: 300 };
  const next = buyMeal(state, town, engins, "basic-meal", survival, data);
  assert.equal(next.walletCents, state.walletCents - marketPrice(town, 1, data, engins).cents);
  assert.equal(next.elapsedMinutes - state.elapsedMinutes, survival.meal_minutes);
  assert.equal(next.meals, 1);
  assert.ok(next.reserveKcal > 1100);
  assert.throws(() => buyMeal({ ...state, walletCents: 0 }, town, engins, "basic-meal", survival, data), /funds/);
  assert.deepEqual(mealOptions({ terrain: "forest" }, engins, data), []);
  assert.throws(() => buyMeal(state, { terrain: "forest" }, engins, "basic-meal", survival, data), /settlement/);
  assert.throws(() => buyMeal({ ...state, ended: "hunger" }, town, engins, "basic-meal", survival, data), /ended/);
  assert.ok(mealOptions(town, info, data).some(m => m.id === "aligot"));
});

test("mapped restaurant offers use current-cell public active OSM venues, without changing meal costs or inventing specialties", () => {
  const venue = { osmId: "node/32", name: "Test café", tags: { amenity: "cafe" } };
  const cell = { ...town, pois: [venue, venue,
    { osmId: "way/33", tags: { amenity: "restaurant", access: "private" } },
    { osmId: "way/34", tags: { amenity: "restaurant", disused: "yes" } },
    { osmId: "way/35", tags: { amenity: "restaurant", abandoned: "yes" } },
    { osmId: "bad-id", tags: { amenity: "restaurant" } },
    { osmId: "node/36", tags: { amenity: "bar" } },
  ] };
  const options = mealOptions(cell, info, data);
  assert.deepEqual(options.filter(m => m.kind === "restaurant").map(m => m.id), ["basic-meal@node/32"]);
  const state = { ...start(), reserveKcal: 300 };
  assert.deepEqual(buyMeal(state, cell, info, "basic-meal@node/32", survival, data),
    buyMeal(state, town, info, "basic-meal", survival, data));
  assert.throws(() => buyMeal(state, town, info, "basic-meal@node/32", survival, data), /local meal/);
  assert.deepEqual(mealOptions({ ...cell, unavailable: true }, info, data), []);
});

test("European fallback is the national arithmetic mean with stable bounded per-cell variation", () => {
  const countries = data.pricing.fallback.countries;
  assert.ok(countries.includes("IT"));
  assert.ok(!countries.includes("US"));
  const mean = countries.reduce((sum, code) => sum + data.pricing.markets[code].dollarPrice, 0) / countries.length;
  assert.ok(Math.abs(mean - data.pricing.fallback.dollarPrice) < 1e-9);
  const base = 619 * mean / data.pricing.referenceDollarPrice;
  const variations = new Set();
  for (let col = 0; col < 1000; col++) {
    const point = { latitude: 42, longitude: 12 + col * 0.003 };
    const quote = marketPrice({ countryCodes: [] }, 1, data, point);
    assert.ok(quote.variation >= -0.1 && quote.variation <= 0.1);
    assert.equal(quote.cents, Math.round(base * (1 + quote.variation)));
    assert.deepEqual(marketPrice({}, 1, JSON.parse(JSON.stringify(data)), { ...point }), quote);
    variations.add(quote.variation);
  }
  assert.ok(variations.size > 100);
  const italy = marketPrice({ countryCodes: ["IT"] }, 1, data, info);
  assert.equal(italy.variation, 0);
  assert.equal(italy.estimated, false);
  assert.throws(() => marketPrice({}, 1, data), /coordinates/);
  assert.throws(() => marketPrice(town, NaN, data), /price units/);
});

test("refreshing saved pricing preserves balances, character, rules and meal catalogue", () => {
  const legacy = structuredClone(data);
  legacy.pricing = { ...legacy.pricing, markets: { FR: {
    name: "Euro area", dollarPrice: legacy.pricing.referenceDollarPrice,
  } } };
  delete legacy.pricing.fallback;
  const savedState = start();
  const before = structuredClone(savedState);
  const upgraded = refreshPricing(legacy, data);
  assert.equal(upgraded.pricing.markets.IT.name, "Italy");
  assert.deepEqual(upgraded.meals, legacy.meals);
  assert.deepEqual(upgraded.rules, legacy.rules);
  assert.deepEqual(upgraded.tarot, legacy.tarot);
  assert.deepEqual(savedState, before);
  assert.equal(marketPrice(town, 1, legacy).cents, 619);
  assert.equal(marketPrice({ countryCodes: ["IT"] }, 1, upgraded).cents, 656);
  assert.equal(marketPrice({}, 1, legacy).cents, 619);
  assert.throws(() => validateEconomy({ ...data, pricing: { ...data.pricing,
    fallback: { ...data.pricing.fallback, dollarPrice: 1 } } }), /Invalid economy/);
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
  assert.equal(next.walletCents, state.walletCents - marketPrice(cell, 4, data, info).cents);
  assert.equal(next.outdoorNightMinutes, 0);
  const free = sleepEconomy({ ...state, walletCents: 0 }, cell, info, "node/3", survival, data);
  assert.equal(free.walletCents, 0);
  assert.throws(() => sleepEconomy(state, {}, info, "node/1", survival, data), /player's cell/);
  const italian = { ...cell, countryCodes: ["IT"] };
  assert.equal(sleepEconomy(state, italian, info, "node/1", survival, data).walletCents,
    state.walletCents - 2624);
});

test("estimated meal quotes and actual charges use exactly the same cell variation", () => {
  const cell = { terrain: "place" };
  const state = start();
  const quote = marketPrice(cell, 1, data, info);
  assert.equal(buyMeal(state, cell, info, "aligot", survival, data).walletCents,
    state.walletCents - quote.cents);
});

test("outdoor nights increase fatigue during sleep, walking and rest; daytime has no exposure penalty", () => {
  const state = { ...start(22), fatigue: 40, awakeHours: 20 };
  const night = sleepEconomy(state, {}, info, null, survival, data);
  assert.ok(night.fatigue > 40);
  assert.ok(night.awakeHours > 0);
  assert.equal(night.walletCents, state.walletCents);
  assert.ok(night.outdoorNightMinutes > 400);
  const rest = restEconomy(state, info, survival, data);
  assert.equal(rest.fatigue, 31);
  const day = restEconomy({ ...start(), fatigue: 40 }, info, survival, data);
  assert.equal(day.fatigue, 20);
  const walk = walkSurvival(state, 1, 0, town, town, survival);
  assert.ok(finishAction(state, walk, info, data).fatigue > walk.fatigue);
  assert.equal(nightMinutes(start(), 30, info), 0);
  assert.equal(nightMinutes(state, 30, info), 30);
});

test("exposure can cause fainting, shelter cannot bypass hunger, and invalid databases fail explicitly", () => {
  const oldRules = { ...data, rules: { ...data.rules, nightRestRecoveryFactor: 0 } };
  const fainted = restEconomy({ ...start(22), fatigue: 99.5 }, info, survival, oldRules);
  assert.equal(fainted.ended, null);
  assert.equal(fainted.fatigue, 40);
  assert.equal(fainted.faints, 1);
  assert.equal(sleepEconomy({ ...start(22), reserveKcal: 100 }, { pois: [shelter] },
    info, shelter.osmId, survival, data).ended, "hunger");
  for (const bad of [{}, { ...data, tarot: [] },
    { ...data, pricing: { ...data.pricing, referenceDollarPrice: 0 } }]) {
    assert.throws(() => validateEconomy(bad));
  }
});

test("one nighttime rest at 90 fatigue now ends at 81; legacy zero-recovery rule yielded 91", () => {
  const state = { ...start(22), fatigue: 90, awakeHours: 16 };
  const next = restEconomy(state, info, survival, data);
  assert.equal(next.elapsedMinutes - state.elapsedMinutes, 30);
  assert.equal(next.fatigue, 81);
  const legacy = { ...data, rules: { ...data.rules, nightRestRecoveryFactor: 0 } };
  assert.equal(restEconomy(state, info, survival, legacy).fatigue, 91);
  assert.equal(next.ended, null);
  assert.equal(next.awakeHours, 17);
  for (const hour of [0, 5, 6, 12, 17, 18, 22, 23]) {
    for (const fatigue of [0, 10, 90, 99.5]) {
      const before = { ...start(hour), fatigue, awakeHours: 16 };
      assert.equal(restEffect(before, info, survival, data).fatigue,
        restEconomy(before, info, survival, data).fatigue);
    }
  }
  const sleepy = restEconomy({ ...state, awakeHours: 31.75 }, info, survival, data);
  assert.equal(sleepy.ended, null);
  assert.equal(sleepy.lastFaint.reason, "sleep");
  assert.equal(sleepy.elapsedMinutes, 510);
});

test("approved nighttime-rest migration changes only the one coefficient, once, on legacy resume", () => {
  const legacy = structuredClone(data);
  delete legacy.restRuleVersion;
  legacy.rules.nightRestRecoveryFactor = 0;
  legacy.rules.lodgingMealUnits = 3;
  const snapshot = structuredClone(legacy);
  const migrated = refreshNightRest(legacy, data);
  assert.deepEqual(migrated, { ...snapshot, restRuleVersion: 1,
    rules: { ...snapshot.rules, nightRestRecoveryFactor: 0.5 } });
  assert.deepEqual(legacy, snapshot);
  assert.deepEqual(refreshNightRest(migrated, data), migrated);
  assert.throws(() => validateEconomy({ ...data, restRuleVersion: 2 }), /Invalid economy/);
});
