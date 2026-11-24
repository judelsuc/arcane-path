import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beginEquipment, advanceEquipment, equipmentModifiers, journeyEquipmentModifiers } from "../equipment.mjs";
import { journeyEquipmentAction } from "../equipment-journey.mjs";
import { startSurvival, walkSurvival, restSurvival } from "../survival.mjs";
import { startEconomy, finishAction, restEconomy, sleepEconomy, shelters, faintingRisk } from "../economy.mjs";
import { applyJourneyEvent, selectJourneyEvent } from "../journey-events.mjs";
import { weatherWalkingFactor, applyWeatherExposure } from "../weather-effects.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { createTrail } from "../trail.mjs";
import { beginBusking } from "../music.mjs";
import { prepareFieldSearch, beginExploration } from "../trail-search.mjs";
import { beginJourneyMiniGame, settleJourneyMiniGame } from "../journey-mini-games.mjs";
import { journeyStats } from "../journey-stats.mjs";
import { translate } from "../i18n.mjs";

const json = file => JSON.parse(readFileSync(new URL(file, import.meta.url)));
const economy = json("../public/economy.json"), survival = json("../public/config.json").survival;
const map = json("../public/map.json");
const cell = { terrain: "place", countryCodes: ["FR"], elevationMeters: 100 };
const info = { latitude: 44.54, longitude: 2.3, terrain: "place" };
const start = () => beginEquipment({ ...startEconomy(startSurvival(14, 10,
  Date.UTC(2026, 9, 18, 12), "balanced", survival), economy, () => 0),
walletCents: 20000, trail: createTrail(map, 14, 10, () => 0) });
const action = (s, a, c = cell, i = info) => journeyEquipmentAction(s, a, c, i, survival, economy);
const buy = (s, itemId) => action(s, { type: "buy", itemId });
const offered = s => applyJourneyEvent(s, "dogEncounter", info, survival, economy);
const dog = s => action(offered(s), { type: "adoptDog", name: "  Étoile  " });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const rain = { ...info, weather: { months: Array.from({ length: 12 }, () =>
  ({ minC: 15, maxC: 20, condition: "rain" })) } };

test("legacy migration has no historic wear, needs, spending, distance or time changes", () => {
  const s = start();
  delete s.equipment;
  s.elapsedMinutes = 1440;
  s.distanceMeters = 10000;
  const before = structuredClone(s), next = beginEquipment(s);
  assert.deepEqual(s, before);
  assert.deepEqual({ ...next, equipment: undefined }, { ...s, equipment: undefined });
  assert.equal(next.equipment.elapsedMinutes, 1440);
  assert.equal(next.equipment.walkedMeters, 0);
  assert.equal(next.equipment.dog, null);
  assert.ok(next.equipment.items.every(i => i.condition === 100));
  assert.throws(() => beginEquipment({ ...s, equipment: null }));
});

test("real walking composes load speed, energy and fatigue exactly once, then wears items", () => {
  const s = start(), legacy = { ...s };
  delete legacy.equipment;
  const baseline = walkSurvival(legacy, 1, 0, cell, cell, survival);
  const moved = walkSurvival(s, 1, 0, cell, cell, survival);
  const modifiers = equipmentModifiers(s.equipment);
  near(moved.lastMove.speedKmh, baseline.lastMove.speedKmh * modifiers.speedMultiplier);
  near(moved.lastMove.energyKcal, baseline.lastMove.energyKcal * modifiers.energyMultiplier);
  near(moved.lastMove.fatigueGain, baseline.lastMove.fatigueGain / modifiers.speedMultiplier * modifiers.fatigueMultiplier);
  const next = finishAction(s, moved, info, economy, { survival });
  assert.equal(next.equipment.elapsedMinutes, next.elapsedMinutes);
  assert.equal(next.equipment.walkedMeters, 250);
  near(next.equipment.items[0].condition, 99.85);
  assert.equal(s.equipment.items[0].condition, 100);
  assert.equal(next.equipment.dogEncounter, null);
});

test("purchases, repairs and care use actual host time, money and metabolism without double decay", () => {
  const initial = dog(start()), before = structuredClone(initial);
  const purchased = buy(initial, "raincoat");
  assert.deepEqual(initial, before);
  assert.equal(purchased.elapsedMinutes - initial.elapsedMinutes, 10);
  assert.equal(initial.walletCents - purchased.walletCents, 2500);
  near(purchased.equipment.dog.hunger - initial.equipment.dog.hunger, 4 / 6);
  assert.ok(purchased.reserveKcal < initial.reserveKcal);
  assert.equal(purchased.equipment.elapsedMinutes, purchased.elapsedMinutes);
  assert.throws(() => buy(purchased, "raincoat"), /unavailable/);
  assert.throws(() => buy({ ...initial, walletCents: 0 }, "camera"), /funds/);
  assert.throws(() => action(initial, { type: "buy", itemId: "camera" }, { terrain: "forest" }), /unavailable/);
  assert.throws(() => buy({ ...initial, events: { pending: 1 } }, "camera"), /active/);
});

test("encounters are optional events, not a guaranteed distance reward; names persist and declines never reoffer", () => {
  let s = start();
  const advanced = advanceEquipment(s.equipment, { expectedRevision: 0, elapsedMinutes: 100, walkedMeters: 5000 }).state;
  assert.equal(advanced.dogEncounter, null);
  assert.throws(() => action(s, { type: "adoptDog", name: "Lune" }), /encounter/);
  s = offered(s);
  assert.equal(s.equipment.dogEncounter, "pending");
  assert.throws(() => action(s, { type: "adoptDog", name: " " }), /name/i);
  assert.throws(() => buy(s, "camera"), /Choose/);
  const adopted = action(s, { type: "adoptDog", name: " E\u0301toile " });
  assert.equal(adopted.equipment.dog.name, "Étoile");
  assert.equal(adopted.elapsedMinutes, 30);
  assert.equal(adopted.walletCents, 19500);
  const rested = restEconomy(adopted, info, survival, economy);
  assert.equal(rested.equipment.dog.name, "Étoile");
  const renamed = action(rested, { type: "nameDog", name: "Lune" });
  assert.deepEqual(renamed.equipment.dog, { ...rested.equipment.dog, name: "Lune" });
  assert.equal(renamed.elapsedMinutes, rested.elapsedMinutes);
  const declined = action(s, { type: "declineDog" });
  assert.equal(declined.equipment.dog, null);
  assert.equal(declined.walletCents, s.walletCents);
  for (const state of [declined, adopted]) {
    assert.throws(() => offered(state), /unavailable/);
    const kinds = Array.from({ length: 100 }, (_, n) => selectJourneyEvent(state, economy, 0, 0, n / 100, info));
    assert.ok(!kinds.includes("dogEncounter"));
  }
});

test("inventory layouts and named companion roundtrip in actual journey saves; malformed slices fail", () => {
  const s = buy(dog(start()), "camera");
  const moved = action(s, { type: "move", itemId: "camera", x: 5, y: 1, rotated: true });
  assert.equal(moved.elapsedMinutes, s.elapsedMinutes);
  assert.equal(moved.walletCents, s.walletCents);
  const saved = createSave({ region: "firmi", map, state: moved, survival, economy }, 1);
  const restored = validateSave(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored.state.equipment, moved.equipment);
  for (const mutate of [
    s => { s.equipment = null; },
    s => { s.equipment.elapsedMinutes++; },
    s => { s.equipment.walkedMeters = s.distanceMeters + 1; },
    s => { s.equipment.placements[0].x = -1; },
    s => { s.equipment.dog.name = "<bad>\n"; },
  ]) {
    const bad = structuredClone(saved);
    mutate(bad.state);
    assert.throws(() => validateSave(bad));
  }
});

test("raincoat protects rain speed and fatigue; broken equipment loses its benefit", () => {
  const s = start(), coated = buy(s, "raincoat");
  near(weatherWalkingFactor(s, rain), 0.85);
  near(weatherWalkingFactor(coated, rain), 1 - 0.15 * 0.65);
  const exposed = state => applyWeatherExposure(state,
    { ...state, elapsedMinutes: state.elapsedMinutes + 60 }, rain).fatigue - state.fatigue;
  near(exposed(coated), exposed(s) * 0.65);
  const broken = structuredClone(coated);
  broken.equipment.items.find(i => i.id === "raincoat").condition = 0;
  near(weatherWalkingFactor(broken, rain), 0.85);
});

test("sleeping bag reduces outdoor night fatigue and tent permits mapped camping only, without hotel food", () => {
  const s = start();
  s.startedAt = Date.UTC(2026, 9, 18, 23);
  s.tarotDay = "2026-10-18";
  const withBag = buy(s, "sleepingBag");
  const withoutBag = { ...withBag, equipment: { ...withBag.equipment,
    items: withBag.equipment.items.filter(i => i.id !== "sleepingBag"), placements: [] } };
  const plain = sleepEconomy(withoutBag, cell, info, null, survival, economy);
  const warm = sleepEconomy(withBag, cell, info, null, survival, economy);
  near(warm.fatigue - withBag.fatigue, (plain.fatigue - withBag.fatigue) * 0.8);
  const campsite = { ...cell, pois: [{ osmId: "node/42", tags: { tourism: "camp_site", fee: "no" } }] };
  assert.equal(shelters(campsite, s).length, 0);
  assert.throws(() => sleepEconomy(s, campsite, info, "node/42", survival, economy), /not available/);
  const tent = buy(s, "tent");
  assert.equal(shelters(campsite, tent)[0].camping, true);
  const camped = sleepEconomy(tent, campsite, info, "node/42", survival, economy);
  assert.equal(camped.meals, tent.meals);
  assert.ok(camped.reserveKcal < tent.reserveKcal);
  assert.equal(camped.equipment.elapsedMinutes, camped.elapsedMinutes);
});

test("dog needs advance through host sleep and interrupted actions, not reload or real waiting", () => {
  const s = dog(start()), next = sleepEconomy(s, cell, info, null, survival, economy);
  near(next.equipment.dog.hunger, s.equipment.dog.hunger + survival.sleep_hours * 4);
  const exhausted = { ...s, awakeHours: survival.sleep_limit_hours - 0.01 };
  const recovered = buy(exhausted, "camera");
  assert.equal(recovered.faints, 1);
  assert.equal(recovered.equipment.elapsedMinutes, recovered.elapsedMinutes);
  near(recovered.equipment.dog.hunger, Math.min(100, s.equipment.dog.hunger +
    (recovered.elapsedMinutes - exhausted.elapsedMinutes) / 60 * 4));
  assert.equal(recovered.equipment.dog.name, "Étoile");
});

test("feeding and care debit host wallet and preserve player health rules", () => {
  let s = dog(start());
  s = finishAction(s, restSurvival(s, { ...survival, rest_minutes: 360,
    rest_fatigue_recovery: 0 }), info, economy, { survival });
  const fed = action(s, { type: "feedDog" });
  assert.equal(fed.walletCents, s.walletCents - 150);
  assert.equal(fed.elapsedMinutes, s.elapsedMinutes + 10);
  near(fed.equipment.dog.hunger, Math.max(0, s.equipment.dog.hunger + 4 / 6 - 55));
  assert.throws(() => action(fed, { type: "feedDog" }), /need/);
  assert.throws(() => action(s, { type: "feedDog" }, { terrain: "forest" }), /supplies/);
});

test("ready companion boosts actual music payouts and nighttime robbery protection, never daytime risk", () => {
  const withDog = dog(start()), withoutDog = { ...withDog, equipment: { ...withDog.equipment,
    dog: null, dogEncounter: null } };
  const a = beginBusking(withDog, cell, info, survival, economy).performancePending.maxRewardCents;
  const b = beginBusking(withoutDog, cell, info, survival, economy).performancePending.maxRewardCents;
  assert.equal(a, Math.round(b * 1.1));
  near(faintingRisk(withDog, info, economy), faintingRisk(withoutDog, info, economy));
  const night = s => ({ ...s, startedAt: Date.UTC(2026, 9, 18, 23) });
  near(faintingRisk(night(withDog), info, economy), faintingRisk(night(withoutDog), info, economy) * 0.9);
  const neglected = { ...withDog, equipment: { ...withDog.equipment,
    dog: { ...withDog.equipment.dog, hunger: 65 } } };
  assert.equal(journeyEquipmentModifiers(neglected).streetMusicIncomeMultiplier, 1);
});

test("ready dog adds exactly eight probability points to actual field searches", async () => {
  const s = dog(start()), target = { col: s.col + 100, row: s.row };
  s.trail = { ...s.trail, version: 2, stages: [target], index: 0, completed: false };
  const exploring = beginExploration(s);
  const withoutDog = { ...exploring, equipment: { ...exploring.equipment, dog: null, dogEncounter: null } };
  const options = { proximity: async () => 100000, random: () => 0.1 };
  const search = state => prepareFieldSearch(state, cell, async () => null, new AbortController().signal, options);
  assert.equal((await search(withoutDog)).kind, null);
  assert.ok((await search(exploring)).kind);
});

test("new activities share the equipment clock and serialized cancellation never loses gear or pays twice", () => {
  const s = dog(start());
  const begun = beginJourneyMiniGame(s, "harvest", {
    cell: { terrain: "vineyard", countryCodes: ["FR"] }, info, survival, data: economy });
  assert.equal(begun.equipment.elapsedMinutes, begun.elapsedMinutes);
  near(begun.equipment.dog.hunger, s.equipment.dog.hunger + 2);
  const saved = createSave({ region: "firmi", map, state: begun, survival, economy }, 1);
  assert.equal(saved.state.miniGamePending, null);
  assert.equal(saved.state.walletCents, begun.walletCents);
  assert.deepEqual(saved.state.equipment, begun.equipment);
  assert.ok(begun.miniGamePending);
  const settled = settleJourneyMiniGame(begun, "harvest",
    { completed: true, cancelled: false, score: 7, maxScore: 10 });
  assert.ok(settled.walletCents > begun.walletCents);
  assert.equal(settled.elapsedMinutes, begun.elapsedMinutes);
  assert.deepEqual(settled.equipment, begun.equipment);
  assert.throws(() => settleJourneyMiniGame(settled, "harvest",
    { completed: true, cancelled: false, score: 7, maxScore: 10 }), /No matching/);
});

test("notebook and PDF statistics include the actual named dog, bag load and game experience in both languages", () => {
  const state = { ...dog(start()), journeyMiniGamesPlayed: 3,
    journeyMiniGameSkills: { harvest: 300 } };
  for (const language of ["fr", "en"]) {
    const t = (key, args) => translate(language, key, args);
    const groups = journeyStats({ state, survival, economy }, t, language);
    const equipment = groups.find(g => g.title === t("equipmentTitle"));
    assert.equal(equipment.rows.find(r => r.label === t("statsCompanion")).value, "Étoile");
    assert.equal(equipment.rows.find(r => r.label === t("statsCarriedWeight")).value, "1.40 / 5.50 kg");
    const games = groups.find(g => g.title === t("statsOtherActivities"));
    assert.equal(games.rows[0].value, "3");
    assert.equal(games.rows[1].value, t("practiceLevel", { level: 4, xp: 300 }));
  }
});
