import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startSurvival } from "../survival.mjs";
import { startEconomy, mealOffers, marketPrice, buyMeal } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { createSave, validateSave } from "../journey-save.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const survival = json("../public/config.json").survival;
const economy = json("../public/economy.json"), map = json("../public/map.json");
const info = { latitude: 44.54, longitude: 2.3 };
const cell = { terrain: "place", countryCodes: ["FR"], pois: Array.from({ length: 20 }, (_, i) => ({
  osmId: `node/${i + 1}`, tags: { amenity: "restaurant" },
})) };
const state = { ...startEconomy(startSurvival(12, 12, Date.UTC(2026, 9, 17, 12),
  "balanced", survival), economy, () => 0), trail: createTrail(map, 12, 12, () => 0) };

test("meal offers vary within exact bounds and price determines hunger recovery monotonically", () => {
  const prices = new Set(), base = marketPrice(cell, 1, economy, info).cents;
  for (let day = 0; day < 30; day++) {
    const offers = mealOffers({ ...state, elapsedMinutes: day * 1440 }, cell, info, economy)
      .sort((a, b) => a.cents - b.cents);
    for (const offer of offers) {
      const low = marketPrice(cell, offer.mealUnits * 0.7, economy, info).cents;
      const high = marketPrice(cell, offer.mealUnits * 1.5, economy, info).cents;
      assert.ok(offer.cents >= low && offer.cents <= high);
      assert.equal(offer.reserveKcal, Math.round(900 * offer.cents / base));
      prices.add(offer.cents);
    }
    for (let i = 1; i < offers.length; i++) {
      if (offers[i].cents > offers[i - 1].cents) {
        assert.ok(offers[i].reserveKcal > offers[i - 1].reserveKcal);
      }
    }
  }
  assert.ok(prices.size > 200);
});

test("offers remain stable across menu reads, purchases, language-neutral data copies and save/resume; change by day and location", () => {
  const offers = mealOffers(state, cell, info, economy);
  assert.deepEqual(mealOffers({ ...state, elapsedMinutes: 300, meals: 7, walletCents: 0 },
    structuredClone(cell), info, structuredClone(economy)), offers);
  const saved = createSave({ region: "firmi", state, map, survival, economy }, 1);
  const resumed = validateSave(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(mealOffers(resumed.state, cell, info, resumed.economy), offers);
  assert.notDeepEqual(mealOffers({ ...state, elapsedMinutes: 720 }, cell, info, economy), offers);
  assert.notDeepEqual(mealOffers({ ...state, col: 13 }, cell, info, economy), offers);
  assert.deepEqual(mealOffers(state, { terrain: "forest" }, {}, economy), []);
  assert.deepEqual(mealOffers(state, { ...cell, unavailable: true }, info, economy), []);
});

test("purchase charges the displayed offer and grants its calories once with capacity and metabolism preserved", () => {
  const before = { ...state, reserveKcal: 200, walletCents: 100000 };
  const offers = mealOffers(before, cell, info, economy);
  for (const offer of offers) {
    const next = buyMeal(before, cell, info, offer.id, survival, economy);
    assert.equal(next.walletCents, before.walletCents - offer.cents);
    assert.equal(next.lastExpenseCents, offer.cents);
    assert.equal(next.reserveKcal, Math.min(survival.reserve_kcal, 200 + offer.reserveKcal) -
      survival.basal_kcal_per_hour * survival.meal_minutes / 60);
    assert.equal(next.meals, before.meals + 1);
    assert.equal(next.elapsedMinutes, survival.meal_minutes);
    assert.throws(() => buyMeal({ ...before, walletCents: offer.cents - 1 },
      cell, info, offer.id, survival, economy), /funds/);
    assert.deepEqual(mealOffers(next, cell, info, economy), offers);
  }
  const full = buyMeal({ ...before, reserveKcal: survival.reserve_kcal }, cell, info, offers[0].id,
    survival, economy);
  assert.ok(full.reserveKcal <= survival.reserve_kcal);
  assert.equal(before.reserveKcal, 200);
});
