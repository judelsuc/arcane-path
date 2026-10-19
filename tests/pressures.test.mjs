import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beginPressures, sympathy, socialFailureChance, changeReputation, policePresence,
  washingAvailable, didPlace, witnessCooling, validatePressures, refreshPressureTarot } from "../pressures.mjs";
import { startSurvival, walkSurvival } from "../survival.mjs";
import { startEconomy, finishAction, washEconomy, restEconomy, sleepEconomy, buyMeal } from "../economy.mjs";
import { askDirections, directionsChance } from "../directions.mjs";
import { askHospitality } from "../hospitality.mjs";
import { survivalChoice } from "../survival-choices.mjs";
import { beginBusking, settleBusking } from "../music.mjs";
import { trailClue } from "../trail-actions.mjs";
import { beginExploration, fieldSearchRules, prepareFieldSearch, applyFieldSearch,
  fieldClueText, validateExploration } from "../trail-search.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { createNeedsNotices, placementReason } from "../needs-notices.mjs";
import { translate } from "../i18n.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const survival = json("../public/config.json").survival, economy = json("../public/economy.json");
const map = json("../public/map.json");
const cell = { terrain: "place", countryCodes: ["FR"],
  settlements: [{ osmId: "node/1", name: "Here" }] };
const info = { latitude: 44.54, longitude: 2.3, terrain: "place" };
const signal = () => new AbortController().signal;
function start() {
  const origin = { ...info, col: 14, row: 10 };
  const step = 45000 / 6371008.8 * 180 / Math.PI / Math.cos(info.latitude * Math.PI / 180);
  const stages = Array.from({ length: 10 }, (_, i) => ({ ...info,
    col: 194 + i * 180, row: 10, longitude: info.longitude + (i + 1) * step,
    name: `Secret Town ${i + 1}`, osmId: `node/${i + 1}`, placeType: "town", legMeters: 45000,
    sourceUrl: "https://overpass-api.de/api/interpreter", retrievedAt: "2026-10-17T12:00:00Z",
    witnessId: `fictional-traveler-${i + 1}` }));
  return beginPressures(beginExploration({ ...startEconomy(startSurvival(14, 10,
    Date.UTC(2026, 9, 17, 12), "balanced", survival), economy, () => 0),
    trail: { version: 2, origin, parentName: "Camille", stages, index: 0, history: [], completed: false } }), economy);
}
const save = state => createSave({ region: "firmi", map, state, survival, economy }, 1);
const nearThreshold = state => ({ ...state, pressures: { ...state.pressures, vigilance: 99.9 } });
const action = (state, minutes, context = info, options = {}) => finishAction(state,
  { ...state, elapsedMinutes: state.elapsedMinutes + minutes }, context, economy,
  { survival, random: () => 0, ...options });
async function search(state, random = () => 0) {
  return prepareFieldSearch(state, cell, async () => null, signal(),
    { proximity: async () => 0, random });
}

test("new and legacy journeys initialize once without resetting existing counters or old saves", () => {
  const state = start();
  assert.strictEqual(beginPressures(state), state);
  assert.equal(state.pressures.vigilance, 0);
  assert.equal(sympathy(state), 50);
  assert.deepEqual(validateSave(save(state)).state, state);
  const legacy = structuredClone(state);
  delete legacy.pressures;
  assert.deepEqual(validateSave(save(legacy)).state, legacy);
  legacy.elapsedMinutes = 60;
  assert.equal(beginPressures(legacy, economy).pressures.startedMinutes, 60);
  assert.equal(beginPressures({ ...legacy, ended: "hunger" }).pressures, undefined);
});

test("vigilance has exact rates for place, fatigue, neglect, police, lingering and shelter", () => {
  const state = start();
  assert.equal(action(state, 60).pressures.vigilance, 3);
  assert.equal(action(state, 60, { ...info, terrain: "forest" }).pressures.vigilance, 0.5);
  assert.equal(action(state, 60, { ...info, police: true }).pressures.vigilance, 8);
  assert.equal(action({ ...state, fatigue: 70 }, 60).pressures.vigilance, 5);
  assert.equal(action({ ...state, pressures: { ...state.pressures, cleanliness: 29 } }, 60).pressures.vigilance, 5);
  assert.equal(action(state, 300).pressures.vigilance, 17);
  const vigilant = { ...state, pressures: { ...state.pressures, vigilance: 50 } };
  assert.equal(action(vigilant, 60, info, { sheltered: true }).pressures.vigilance, 48);
  assert.equal(action(vigilant, 60).pressures.localMinutes, 60);
  assert.equal(policePresence({ pois: [{ tags: { amenity: "police" } }] }), true);
});

test("moving reduces vigilance and resets only sector dwell time, including terminal movement", () => {
  const state = { ...start(), elapsedMinutes: 300 };
  state.pressures.vigilance = 50;
  state.pressures.localMinutes = 300;
  const next = finishAction(state, { ...state, col: 18, elapsedMinutes: 310 }, info, economy, { survival });
  assert.ok(next.pressures.vigilance < 50);
  assert.equal(next.pressures.localMinutes, 10);
  validatePressures(next, economy);
  const ended = finishAction(state, { ...state, col: 18, elapsedMinutes: 310,
    reserveKcal: 0, ended: "hunger" }, info, economy, { survival });
  assert.equal(ended.ended, "hunger");
  validatePressures(ended, economy);
});

test("100 vigilance gives two recoverable days in care, then ends the third journey episode", () => {
  const threshold = start();
  threshold.pressures.vigilance = 96.999;
  assert.equal(action(threshold, 60).pressures.placements.length, 0);
  threshold.pressures.vigilance = 97;
  assert.equal(action(threshold, 60).pressures.placements.length, 1);
  let state = start();
  for (let count = 1; count <= 3; count++) {
    state = nearThreshold(state);
    const before = state;
    state = action(state, 10);
    assert.equal(didPlace(before, state), true);
    assert.equal(state.pressures.placements.length, count);
    assert.equal(state.elapsedMinutes - before.elapsedMinutes, 1450);
    assert.equal(state.walletCents, before.walletCents - Math.floor(before.walletCents / 4));
    assert.equal(state.reserveKcal, survival.reserve_kcal);
    assert.equal(state.awakeHours, 0);
    assert.equal(state.fatigue, 20);
    assert.equal(state.pressures.vigilance, 20);
    assert.equal(state.pressures.cleanliness, 80);
    assert.equal(state.pressures.localMinutes, 0);
    assert.equal(state.ended, count === 3 ? "placement" : null);
    assert.strictEqual(state.trail, before.trail);
    assert.equal(state.outdoorNightMinutes, before.outdoorNightMinutes);
    assert.deepEqual(validateSave(save(state)).state, state);
  }
  assert.throws(() => action(state, 10), /ended/);
});

test("placement records exact triggering factors and explains them without inventing legacy history", () => {
  const previous = nearThreshold(start());
  const next = action(previous, 10, { ...info, police: true }, { activity: "beg" });
  const placement = next.pressures.placements[0];
  assert.equal(placement.trigger.vigilanceBefore, 99.9);
  assert.equal(placement.trigger.minutes, 10);
  assert.equal(placement.trigger.tarotFactor, 1);
  assert.equal(placement.trigger.factors.urban, 0.5);
  assert.ok(Math.abs(placement.trigger.factors.police - 5 / 6) < 1e-12);
  assert.equal(placement.trigger.factors.beg, 4);
  assert.equal(placement.trigger.factors.fatigue, 0);
  assert.deepEqual(validateSave(save(next)).state, next);
  for (const locale of ["fr", "en"]) {
    const t = (key, args) => translate(locale, key, args);
    const text = placementReason(placement, t);
    for (const value of ["100", "99.90", "10.0", "+0.50", "+0.83", "+4.00"])
      assert.ok(text.includes(value), `${locale}: ${value}`);
    assert.ok(text.includes(t("placementCause.police")));
    assert.ok(text.includes(t("placementCause.beg")));
    assert.ok(!text.includes(t("placementCause.fatigue")));
    const legacy = structuredClone(next);
    delete legacy.pressures.placements[0].trigger;
    assert.deepEqual(validateSave(save(legacy)).state, legacy);
    assert.equal(placementReason(legacy.pressures.placements[0], t), t("placementReasonLegacy"));
  }
  for (const mutate of [
    trigger => { trigger.vigilanceBefore = -1; },
    trigger => { trigger.minutes = Infinity; },
    trigger => { trigger.minutes = placement.startedMinutes + 1; },
    trigger => { trigger.factors.police = -1; },
    trigger => { trigger.factors.movement = 1; },
    trigger => { trigger.factors.unknown = 1; },
    trigger => { trigger.factors = null; },
    trigger => { trigger.tarotFactor = 99; },
    trigger => { trigger.vigilanceBefore = 0; },
  ]) {
    const malformed = structuredClone(next);
    mutate(malformed.pressures.placements[0].trigger);
    assert.throws(() => validateSave(save(malformed)), /pressure history/);
  }
});

test("placements interrupt directions, survival rewards, hospitality, music and field clues", async () => {
  const state = nearThreshold(start());
  const helped = askDirections(state, cell, info, survival, economy, () => 0);
  assert.equal(helped.outcome, "placed");
  const begged = survivalChoice(state, "beg", cell, info, survival, economy, () => 0.99);
  assert.equal(begged.lastSurvivalChoice.outcome, "placed");
  assert.equal(begged.lastSurvivalChoice.moneyCents, 0);
  const hosted = askHospitality(state, cell, info, survival, economy, () => 0);
  assert.equal(hosted.hospitalityAttempts.at(-1).outcome, "placed");
  assert.equal(hosted.sleeps, state.sleeps + 1);
  const music = beginBusking(state, cell, info, survival, economy);
  assert.equal(music.performancePending, null);
  const found = applyFieldSearch(state, await search(state), cell, info, survival, economy);
  assert.equal(found.trail.exploration.lastSearch.outcome, "placed");
  assert.equal(found.trail.exploration.hints.length, 0);
  for (const next of [helped.state, begged, hosted, music, found]) {
    assert.equal(next.pressures.placements.length, 1);
    assert.deepEqual(validateSave(save(next)).state, next);
  }
});

test("placement suppresses town progression and theft food or detention rewards", () => {
  let state = start();
  state = beginPressures({ ...state, col: 194, pressures: undefined }, economy);
  state = nearThreshold(state);
  const clue = trailClue(state, "discuss", cell, info, survival, economy);
  assert.equal(clue.trail.index, 0);
  assert.equal(clue.trail.history.length, 0);
  const shop = { ...cell, pois: [{ tags: { shop: "bakery" } }] };
  for (const roll of [0, 0.99]) {
    const next = survivalChoice(state, "steal", shop, info, survival, economy, () => roll);
    assert.equal(next.lastSurvivalChoice.outcome, "placed");
    assert.equal(next.lastSurvivalChoice.foodKcal, 0);
    assert.equal(next.lastSurvivalChoice.detentionMinutes, 0);
    assert.equal(next.pressures.reputation[0].value, -15);
    assert.deepEqual(validateSave(save(next)).state, next);
  }
});

test("washing is paid, takes time, needs facilities and cannot resurrect a fatal need", () => {
  const state = start();
  state.pressures.cleanliness = 10;
  state.pressures.vigilance = 50;
  const next = washEconomy(state, cell, info, survival, economy);
  assert.equal(next.elapsedMinutes, 20);
  assert.ok(next.walletCents < state.walletCents);
  assert.equal(next.pressures.cleanliness, 100);
  assert.equal(next.pressures.vigilance, 46);
  assert.equal(washingAvailable({ terrain: "forest" }), false);
  assert.equal(washingAvailable({ pois: [{ tags: { amenity: "shower", access: "private" } }] }), false);
  assert.equal(washingAvailable({ pois: [{ tags: { amenity: "shower", disused: "yes" } }] }), false);
  assert.equal(washingAvailable({ pois: [{ tags: { amenity: "shower" } }] }), true);
  assert.throws(() => washEconomy(state, { terrain: "forest" }, info, survival, economy), /facilities/);
  const hungry = washEconomy({ ...state, reserveKcal: 1, health: 0.01 }, cell, info, survival, economy);
  assert.equal(hungry.ended, "health");
  assert.equal(hungry.pressures.placements.length, 0);
});

test("sympathy changes social chances and music rewards; reputation is local, capped and bounded", () => {
  let state = start();
  assert.equal(socialFailureChance(0.5, state), 0.5);
  assert.equal(directionsChance({ terrain: "water" }, state), 0);
  state = changeReputation(state, 100);
  assert.equal(sympathy(state), 75);
  assert.equal(socialFailureChance(0.5, state), 0.375);
  assert.equal(sympathy({ ...state, col: 200 }), 50);
  const clean = beginBusking(state, cell, info, survival, economy);
  const dirty = beginBusking({ ...state, fatigue: 50, pressures: { ...state.pressures, cleanliness: 0 } },
    cell, info, survival, economy);
  assert.ok(clean.performancePending.maxRewardCents > dirty.performancePending.maxRewardCents);
  const played = settleBusking(clean, 24);
  assert.ok(played.walletCents > clean.walletCents);
  for (let n = 0; n < 80; n++) state = changeReputation({ ...state, col: n * 8 }, -100);
  assert.equal(state.pressures.reputation.length, 64);
  assert.ok(state.pressures.reputation.every(r => r.value >= -25 && r.value <= 25));
});

test("birth and daily cards independently affect vigilance, sympathy, cleanliness and witness memory", () => {
  const state = { ...start(), elapsedMinutes: 7 * 1440 };
  const effects = [];
  for (const field of ["birthCard", "dailyCard"]) {
    const favorable = refreshPressureTarot({ ...state, [field]: "star" }, economy);
    const difficult = refreshPressureTarot({ ...state, [field]: "moon" }, economy);
    assert.equal(favorable.pressures.tarotFactor, 0.85);
    assert.equal(difficult.pressures.tarotFactor, 1.05);
    assert.ok(action(favorable, 60).pressures.vigilance < action(difficult, 60).pressures.vigilance);
    assert.ok(action(favorable, 60).pressures.cleanliness > action(difficult, 60).pressures.cleanliness);
    assert.ok(sympathy(favorable) > sympathy(difficult));
    assert.ok(directionsChance(cell, favorable) > directionsChance(cell, difficult));
    assert.equal(witnessCooling(favorable), 0);
    assert.equal(witnessCooling(difficult), 1);
    for (const card of economy.tarot) {
      const changed = refreshPressureTarot({ ...state, [field]: card.id }, economy);
      assert.equal(changed.pressures.tarotFactor, 0.5 + (0.5 + card.nightRisk) / 2);
      validatePressures(changed, economy);
      effects.push(changed.pressures.tarotFactor);
    }
  }
  assert.ok(new Set(effects).size > 1);
});

test("daily turnover updates pressure effects once without retroactively changing acquired clues", async () => {
  const state = start();
  state.startedAt = Date.UTC(2026, 9, 17, 23, 50);
  const result = await search(state, () => 0.5);
  const first = applyFieldSearch(state, result, cell, info, survival, economy);
  const oldHints = structuredClone(first.trail.exploration.hints);
  const next = refreshPressureTarot({ ...first, dailyCard: "star" }, economy);
  validateExploration(next);
  assert.deepEqual(next.trail.exploration.hints, oldHints);
  assert.equal(oldHints[0].witnessFactor, 1);
  const midnight = finishAction(state, { ...state, elapsedMinutes: 20 }, info, economy,
    { survival, random: () => (17 + 0.5) / 22 });
  assert.equal(midnight.dailyCard, "star");
  assert.equal(midnight.pressures.tarotFactor, 0.85);
  assert.equal(midnight.pressures.vigilance, 1);
  assert.deepEqual(validateSave(save(midnight)).state, midnight);
  const corrupted = structuredClone(midnight);
  corrupted.pressures.tarotFactor = 1;
  assert.throws(() => validateSave(save(corrupted)), /pressure/);
});

test("fainting then placement is one action, its indoor day has no outdoor exposure", () => {
  const state = { ...nearThreshold(start()), fatigue: 100 };
  const next = askHospitality(state, cell, info, survival, economy, () => 0);
  assert.equal(next.faints, 1);
  assert.equal(next.pressures.placements.length, 1);
  assert.equal(next.elapsedMinutes, 30 + 480 + 1440);
  assert.equal(next.hospitalityAttempts.at(-1).outcome, "placed");
  assert.deepEqual(validateSave(save(next)).state, next);
});

test("walking, resting, meals and sleeping all share pressure accounting without double charging", () => {
  const state = start();
  state.pressures.vigilance = 60;
  state.pressures.cleanliness = 20;
  const shelterCell = { ...cell, pois: [{ osmId: "node/2", tags: { amenity: "shelter", fee: "no" } }] };
  const rested = restEconomy(state, info, survival, economy);
  const meal = buyMeal(state, cell, info, "basic-meal", survival, economy);
  const indoors = sleepEconomy(state, shelterCell, info, "node/2", survival, economy);
  const outdoors = sleepEconomy(state, cell, info, null, survival, economy);
  const walked = finishAction(state, walkSurvival(state, 1, 0, cell, cell, survival, info),
    info, economy, { survival });
  assert.ok(rested.pressures.vigilance > state.pressures.vigilance);
  assert.ok(meal.pressures.vigilance < state.pressures.vigilance);
  assert.ok(indoors.pressures.vigilance < state.pressures.vigilance);
  assert.ok(indoors.pressures.cleanliness > state.pressures.cleanliness);
  assert.ok(outdoors.pressures.vigilance > state.pressures.vigilance || didPlace(state, outdoors));
  assert.equal(indoors.elapsedMinutes, survival.sleep_hours * 60);
  assert.equal(walked.pressures.localMinutes, walked.elapsedMinutes);
  assert.equal(walked.pressures.cleanliness, 20 - walked.elapsedMinutes / 60 * 0.8 - 0.1);
  for (const next of [rested, meal, indoors, outdoors, walked]) {
    assert.deepEqual(validateSave(save(next)).state, next);
  }
});

test("optional pressure state rejects corrupted and impossible saves", () => {
  const state = action(nearThreshold(start()), 10);
  for (const mutate of [
    s => { s.pressures.vigilance = 101; },
    s => { s.pressures.cleanliness = -1; },
    s => { s.pressures.locality = "1001,0"; },
    s => { s.pressures.localMinutes = s.elapsedMinutes + 1; },
    s => { s.pressures.reputation = [{ locality: "1,1", value: 26 }]; },
    s => { s.pressures.placements[0].lostCents++; },
    s => { s.pressures.placements[0].finishedMinutes--; },
    s => { s.ended = "placement"; },
  ]) {
    const invalid = structuredClone(state);
    mutate(invalid);
    assert.throws(() => validateSave(save(invalid)));
  }
});

test("cooling boundaries degrade only new clues and near-town verification guarantees progress", async () => {
  const state = start();
  state.col = 154; // 10 km from the first destination.
  state.pressures.locality = "19,1";
  assert.equal(witnessCooling(state), 0);
  assert.equal(fieldSearchRules(state).precision, "partial");
  const first = applyFieldSearch(state, await search(state, () => 0.5), cell, info, survival, economy);
  const oldHints = structuredClone(first.trail.exploration.hints);
  const weekly = { ...first, elapsedMinutes: 7 * 1440 };
  assert.equal(witnessCooling({ ...weekly, elapsedMinutes: 7 * 1440 - 1 }), 0);
  assert.equal(witnessCooling(weekly), 1);
  assert.equal(fieldSearchRules(weekly).precision, "vague");
  validateExploration(weekly);
  const monthly = { ...weekly, elapsedMinutes: 30 * 1440 };
  assert.equal(witnessCooling({ ...monthly, elapsedMinutes: 30 * 1440 - 1 }), 1);
  assert.equal(witnessCooling(monthly), 2);
  assert.equal((await search(monthly, () => 0.5)).kind, "direction");
  assert.deepEqual(monthly.trail.exploration.hints, oldHints);
  const nearby = { ...monthly, col: 182 };
  assert.equal(fieldSearchRules(nearby).precision, "precise");
  const result = await prepareFieldSearch(nearby, cell, async () => null, signal(),
    { proximity: async () => 100000, random: () => 0.999 });
  assert.equal(result.kind, "place");
  const next = applyFieldSearch(nearby, result, cell, info, survival, economy);
  assert.equal(next.trail.exploration.hints.at(-1).kind, "place");
  validateExploration(next);
  assert.deepEqual(validateSave(save(next)).state, next);
  for (const locale of ["fr", "en"]) {
    const t = (key, args) => translate(locale, key, args);
    assert.equal(fieldClueText(first, oldHints[0], t), fieldClueText(monthly, oldHints[0], t));
    for (const key of ["pressureTitle", "placementText", "journeyEnded.placement",
      "choiceResult.placed", "fieldOutcome.placed", "fieldReport.placed", "hintOutcome.placed",
      "hospitalityResult.placed", "worshipResult.placed", "fieldCooling.0", "fieldCooling.1", "fieldCooling.2"]) {
      assert.ok(t(key, { count: 1, money: "1", town: "Here", day: "today", minutes: 1450 }));
    }
  }
});

test("placement notices supersede fainting but leave hunger and terminal ending notifications intact", () => {
  const notices = createNeedsNotices();
  const state = action(nearThreshold(start()), 10);
  assert.equal(notices.pending(state, survival), "placed");
  notices.shown("placed", state);
  assert.equal(notices.pending(state, survival), null);
  const ended = { ...state, ended: "placement" };
  assert.equal(notices.pending(ended, survival), "placement");
  notices.shown("placement", ended);
  assert.equal(notices.pending(ended, survival), null);
});
