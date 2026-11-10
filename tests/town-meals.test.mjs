import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { discoverTownMeals } from "../town-meals.mjs";
import { mergeDiscoveredMeals, mealOffers, buyMeal, startEconomy } from "../economy.mjs";
import { startSurvival } from "../survival.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { createTrail } from "../trail.mjs";

const economy = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));
const survival = JSON.parse(readFileSync(new URL("../public/config.json", import.meta.url))).survival;
const dish = {
  id: `discovered-${"a".repeat(24)}`, name: "Bistecca alla fiorentina", area: "Tuscany",
  scope: "regional", countries: ["IT"], towns: ["node/10"], bounds: [-180, -90, 180, 90],
  mealUnits: 1, reserveKcal: 900,
  fr: "Une épaisse pièce de bœuf cuite au gril.", en: "A thick bone-in cut of beef cooked over a grill.",
  source: "https://en.wikipedia.org/wiki/Bistecca_alla_fiorentina",
  publisher: "Wikipedia contributors", originSource: "https://www.wikidata.org/wiki/Q1273",
};
const state = { serverJourney: { id: "a".repeat(32) }, journalAccess: "fixture", col: 0, row: 0 };
const result = meals => ({ identity: "node/10", loading: false, error: "", warnings: [], meals });
const controller = () => new AbortController();
const response = value => ({ ok: true, json: async () => value });

test("Florentine steak is purchasable only in the documented town and survives meal refresh", () => {
  const updated = mergeDiscoveredMeals(economy, [dish], "node/10");
  assert.equal(economy.meals.some(m => m.id === dish.id), false);
  assert.deepEqual(mergeDiscoveredMeals(updated, [dish], "node/10"), updated);
  const initial = { ...startEconomy(startSurvival(0, 0, Date.UTC(2026, 10, 10, 12), "balanced", survival),
    economy, () => 0), reserveKcal: 100, walletCents: 10000 };
  const cell = { terrain: "place", countryCodes: ["IT"], settlements: [{ osmId: "node/10", name: "Firenze" }] };
  const info = { latitude: 43.7696, longitude: 11.2558 };
  const offer = mealOffers(initial, cell, info, updated).find(m => m.id === dish.id);
  assert.ok(offer);
  const purchased = buyMeal(initial, cell, info, dish.id, survival, updated);
  assert.equal(purchased.meals, initial.meals + 1);
  assert.equal(purchased.walletCents, initial.walletCents - offer.cents);
  for (const other of [
    { ...cell, settlements: [{ osmId: "node/99" }] },
    { ...cell, countryCodes: ["FR"] },
    { ...cell, countryCodes: ["IT", "FR"] },
  ]) assert.equal(mealOffers(initial, other, info, updated).some(m => m.id === dish.id), false);
  assert.equal(mealOffers(initial, { ...cell, countryCodes: [] }, info, updated).some(m => m.id === dish.id), true);
  const map = JSON.parse(readFileSync(new URL("../public/map.json", import.meta.url)));
  const saved = createSave({ region: "firmi", map, survival, economy: updated,
    state: { ...purchased, trail: createTrail(map, 0, 0, () => 0) } }, 1);
  const restored = validateSave(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored.economy.meals.at(-1), dish);
});

test("discovery polls with capability and uses only server-derived dishes", async () => {
  const calls = [];
  let waits = 0;
  const found = await discoverTownMeals(state, "node/10", economy, controller().signal, {
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return response(calls.length === 1 ? { ...result([]), loading: true } : result([dish]));
    },
    wait: async () => { waits++; },
  });
  assert.deepEqual(found.meals, [dish]);
  assert.equal(waits, 1);
  assert.equal(calls[0].options.headers["X-Journal-Capability"], "fixture");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    journey: state.serverJourney.id, location: { col: 0, row: 0 }, town: "node/10", kind: "meals",
  });
});

test("slow generation stays pending beyond three minutes but stops after six", async () => {
  let polls = 0;
  const found = await discoverTownMeals(state, "node/10", economy, controller().signal, {
    fetcher: async () => response(++polls <= 190 ? { ...result([]), loading: true } : result([dish])),
    wait: async () => {},
  });
  assert.deepEqual(found.meals, [dish]);
  assert.equal(polls, 191);
  polls = 0;
  await assert.rejects(discoverTownMeals(state, "node/10", economy, controller().signal, {
    fetcher: async () => { polls++; return response({ ...result([]), loading: true }); },
    wait: async () => {},
  }), /still pending/);
  assert.equal(polls, 360);
});

test("discovery rejects mismatched towns, unsafe sources, forged associations and errors", async () => {
  for (const value of [
    { ...result([dish]), identity: "node/other" },
    result([{ ...dish, towns: ["node/elsewhere"] }]),
    result([{ ...dish, source: "https://evil.example/food" }]),
    result([{ ...dish, mealUnits: 100 }]),
    { ...result([]), error: "Source offline" },
  ]) await assert.rejects(discoverTownMeals(state, "node/10", economy, controller().signal, {
    fetcher: async () => response(value),
  }));
  await assert.rejects(discoverTownMeals({}, "node/10", economy, controller().signal), /capability/);
});

test("licensed documentary photos are downloaded privately without becoming saved blobs", async () => {
  const photo = { imageId: "b".repeat(64), sourceUrl: "https://commons.wikimedia.org/wiki/File:Steak.jpg",
    attribution: "Photographer", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" };
  const illustrated = { ...dish, photo };
  const blob = new Blob(["fixture"], { type: "image/jpeg" });
  const found = await discoverTownMeals(state, "node/10", economy, controller().signal, {
    fetcher: async (url, options) => JSON.parse(options.body).image
      ? { ok: true, blob: async () => blob } : response(result([illustrated])),
  });
  assert.deepEqual(found.photos, [{ id: dish.id, blob }]);
  assert.deepEqual(found.meals[0].photo, photo);
});

test("photo download failure preserves dishes with an explicit warning; abort stops polling", async t => {
  t.mock.method(console, "error", () => {});
  const photo = { imageId: "b".repeat(64), sourceUrl: "https://commons.wikimedia.org/wiki/File:Steak.jpg",
    attribution: "Photographer", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" };
  const found = await discoverTownMeals(state, "node/10", economy, controller().signal, {
    fetcher: async (url, options) => {
      if (JSON.parse(options.body).image) throw new Error("Photo offline");
      return response(result([{ ...dish, photo }]));
    },
  });
  assert.equal(found.meals.length, 1);
  assert.equal(found.photos.length, 0);
  assert.deepEqual(found.warnings, ["Photo offline"]);
  const abort = controller();
  await assert.rejects(discoverTownMeals(state, "node/10", economy, abort.signal, {
    fetcher: async () => response({ ...result([]), loading: true }),
    wait: async () => { abort.abort(); },
  }), { name: "AbortError" });
});
