import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { choiceAvailable, hasFoodShop, survivalChoice } from "../survival-choices.mjs";
import { applyBirthTarot, startEconomy } from "../economy.mjs";
import { startSurvival } from "../survival.mjs";
import { createTrail } from "../trail.mjs";
import { createSave, validateSave } from "../journey-save.mjs";

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const economy = json("../public/economy.json");
const survival = json("../public/config.json").survival;
const map = json("../public/map.json");
const info = { latitude: 44.54, longitude: 2.3 };
const forest = { terrain: "forest" };
const town = { terrain: "place", countryCodes: ["FR"] };
const shop = { terrain: "major_road", pois: [{ tags: { shop: "bakery" } }] };
const start = (hour = 12) => {
  const state = applyBirthTarot(startEconomy(startSurvival(14, 10,
    Date.UTC(2026, 9, 17, hour), "balanced", survival), economy, () => 0), economy);
  return { ...state, reserveKcal: 900, trail: createTrail(map, 14, 10, () => 0) };
};
const act = (s, kind, cell, roll) => survivalChoice(s, kind, cell, info, survival, economy, () => roll);

test("availability uses actual forest/settlement cells and explicit food-shop tags", () => {
  assert.equal(choiceAvailable("forage", forest), true);
  assert.equal(choiceAvailable("forage", town), false);
  assert.equal(choiceAvailable("beg", town), true);
  assert.equal(choiceAvailable("beg", forest), false);
  assert.equal(choiceAvailable("steal", shop), true);
  assert.equal(choiceAvailable("steal", town), false);
  for (const tags of [{ shop: "clothes" }, { amenity: "restaurant" },
    { shop: "bakery", access: "private" }, { shop: "supermarket", disused: "yes" },
    { shop: "convenience", abandoned: "yes" }]) {
    assert.equal(hasFoodShop({ pois: [{ tags }] }), false);
  }
  assert.equal(hasFoodShop({ ...shop, unavailable: true }), false);
  assert.throws(() => choiceAvailable("unknown", town));
});

test("foraging costs metabolism/time/fatigue, caps food and has no inventory or money reward", () => {
  const state = start(), won = act(state, "forage", forest, 0.99);
  const lost = act(state, "forage", forest, 0);
  assert.equal(won.elapsedMinutes, 30);
  assert.equal(won.fatigue, 5);
  assert.ok(won.energyKcal > 0);
  assert.equal(won.reserveKcal - lost.reserveKcal, 450);
  assert.equal(won.walletCents, state.walletCents);
  assert.equal(won.lastSurvivalChoice.outcome, "food");
  assert.equal(lost.lastSurvivalChoice.outcome, "nothing");
  assert.equal(lost.choiceCounts.forage, 1);
  assert.equal(act({ ...state, reserveKcal: 1800 }, "forage", forest, 0.99).reserveKcal, 1800);
});

test("asking for money is possible at zero funds and uses local half-meal pricing", () => {
  const state = { ...start(), walletCents: 0 };
  const won = act(state, "beg", town, 0.99), lost = act(state, "beg", town, 0);
  assert.equal(won.walletCents, 280);
  assert.equal(won.lastSurvivalChoice.moneyCents, 280);
  assert.equal(won.elapsedMinutes, 30);
  assert.equal(won.fatigue, 2);
  assert.equal(lost.walletCents, 0);
  assert.ok(lost.reserveKcal < state.reserveKcal);
  assert.equal(lost.elapsedMinutes, 30);
});

test("theft success feeds once, while detention costs six hours and provides food/rest without a fine", () => {
  const state = { ...start(), fatigue: 60, awakeHours: 14 };
  const won = act(state, "steal", shop, 0.99), caught = act(state, "steal", shop, 0);
  assert.equal(won.lastSurvivalChoice.outcome, "food");
  assert.equal(won.elapsedMinutes, 10);
  assert.equal(won.lastSurvivalChoice.foodKcal, 900);
  assert.equal(caught.lastSurvivalChoice.outcome, "detained");
  assert.equal(caught.lastSurvivalChoice.detentionMinutes, 360);
  assert.equal(caught.elapsedMinutes, 370);
  assert.equal(caught.walletCents, state.walletCents);
  assert.equal(caught.col, state.col);
  assert.equal(caught.row, state.row);
  assert.ok(caught.reserveKcal > state.reserveKcal);
  assert.ok(caught.fatigue < state.fatigue);
  assert.ok(caught.awakeHours < state.awakeHours);
  assert.equal(caught.ended, null);
});

test("both cards change risk, and no reward can revive a journey exhausted during the attempt", () => {
  const state = start();
  assert.equal(act(state, "steal", shop, 0.3).lastSurvivalChoice.outcome, "detained");
  assert.equal(act({ ...state, birthCard: "star" }, "steal", shop, 0.3).lastSurvivalChoice.outcome, "food");
  assert.equal(act({ ...state, dailyCard: "star" }, "steal", shop, 0.3).lastSurvivalChoice.outcome, "food");
  const exhausted = act({ ...state, reserveKcal: 1, health: 0.01 }, "forage", forest, 0.99);
  assert.equal(exhausted.ended, "health");
  assert.equal(exhausted.lastSurvivalChoice.outcome, "exhausted");
  assert.equal(exhausted.lastSurvivalChoice.foodKcal, 0);
  for (const roll of [-1, 1, NaN]) assert.throws(() => act(state, "forage", forest, roll));
  assert.throws(() => act({ ...state, ended: "reunion" }, "forage", forest, 0.99));
  assert.throws(() => act(state, "forage", town, 0.99));
});

test("night exposure applies to attempts, not detention, with saved daily reveals and exact outcome roundtrip", () => {
  const state = start(23), next = act(state, "steal", shop, 0);
  assert.equal(next.tarotDay, "2026-10-18");
  assert.equal(next.dailyTarotSeenDay, "2026-10-17");
  assert.equal(next.outdoorNightMinutes, 10);
  const details = { region: "firmi", map, state: next, survival, economy };
  const saved = createSave(details, 1);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(saved))).state, next);
  saved.state.choiceCounts.steal = -1;
  assert.throws(() => validateSave(saved));
});
