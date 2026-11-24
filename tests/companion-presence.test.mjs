import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { companionRecord, companionText, validateCompanionRecord } from "../companion-presence.mjs";
import { beginEquipment } from "../equipment.mjs";
import { startSurvival, walkSurvival, restSurvival } from "../survival.mjs";
import { startEconomy, finishAction } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { survivalChoice, survivalChoiceFailureChance } from "../survival-choices.mjs";
import { beginBusking } from "../music.mjs";
import { beginExploration, prepareFieldSearch, applyFieldSearch } from "../trail-search.mjs";
import { advanceJourneyEvents, journeyEventText, journeyEventTextParts, applyJourneyEvent } from "../journey-events.mjs";
import { translate } from "../i18n.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const survival = json("../public/config.json").survival, economy = json("../public/economy.json");
const map = json("../public/map.json"), forest = { terrain: "forest", elevationMeters: 100 };
const info = { latitude: 44.54, longitude: 2.3, terrain: "forest" };
function start(hour = 12) {
  const state = beginEquipment(startEconomy(startSurvival(14, 10,
    Date.UTC(2026, 9, 17, hour), "balanced", survival), economy, () => 0));
  return { ...state, reserveKcal: 900, trail: createTrail(map, 14, 10, () => 0),
    equipment: { ...state.equipment, dog: { name: "Étoile", hunger: 15, careNeed: 15 } } };
}
const save = state => createSave({ state, region: "firmi", map, survival, economy }, 1);
const hunt = (state, roll = 0.99) => survivalChoice(state, "hunt", forest, info, survival, economy, () => roll);

test("hunting has exact costs, actual dog odds, capped food and a save-compatible action ledger", () => {
  const ready = start(), alone = { ...ready, equipment: { ...ready.equipment, dog: null } };
  const risk = survivalChoiceFailureChance(alone, "hunt", economy);
  assert.ok(Math.abs(survivalChoiceFailureChance(ready, "hunt", economy) - (risk - 0.15)) < 1e-10);
  const roll = risk - 0.075;
  assert.equal(hunt(alone, roll).lastSurvivalChoice.outcome, "nothing");
  assert.equal(hunt(ready, roll).lastSurvivalChoice.outcome, "food");
  const won = hunt(ready), lost = hunt(ready, 0);
  assert.equal(won.elapsedMinutes, ready.elapsedMinutes + 60);
  assert.equal(won.fatigue, ready.fatigue + 10);
  assert.equal(won.reserveKcal - lost.reserveKcal, 800);
  assert.equal(won.lastSurvivalChoice.foodKcal, 800);
  assert.equal(won.walletCents, ready.walletCents);
  assert.equal(won.equipment.dog.hunger, ready.equipment.dog.hunger + 4);
  assert.equal(won.equipment.dog.careNeed, ready.equipment.dog.careNeed + 1);
  assert.equal(won.choiceCounts.hunt, 1);
  assert.deepEqual(won.lastSurvivalChoice.companion, { name: "Étoile", ready: true });
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save(won)))).state, won);
  const capped = hunt({ ...ready, reserveKcal: survival.reserve_kcal });
  assert.equal(capped.reserveKcal, survival.reserve_kcal);
  assert.ok(capped.lastSurvivalChoice.foodKcal < 800);
  assert.throws(() => survivalChoice(ready, "hunt", { terrain: "place" }, info, survival, economy), /not available/);
});

test("neglected dogs lose the hunting bonus at either exact threshold; costs never vanish on failure", () => {
  const state = start(), alone = { ...state, equipment: { ...state.equipment, dog: null } };
  for (const need of ["hunger", "careNeed"]) {
    const neglected = { ...state, equipment: { ...state.equipment,
      dog: { ...state.equipment.dog, [need]: 65 } } };
    assert.equal(survivalChoiceFailureChance(neglected, "hunt", economy),
      survivalChoiceFailureChance(alone, "hunt", economy));
    const lost = hunt(neglected, 0);
    assert.equal(lost.elapsedMinutes, 60);
    assert.equal(lost.lastSurvivalChoice.foodKcal, 0);
    assert.equal(lost.lastSurvivalChoice.companion.ready, false);
  }
  const crossing = hunt({ ...state, equipment: { ...state.equipment,
    dog: { ...state.equipment.dog, hunger: 64 } } });
  assert.equal(crossing.equipment.dog.hunger, 68);
  assert.equal(crossing.lastSurvivalChoice.companion.ready, true);
  const collapsed = hunt({ ...state, fatigue: 99 });
  assert.equal(collapsed.lastSurvivalChoice.outcome, "fainted");
  assert.equal(collapsed.lastSurvivalChoice.foodKcal, 0);
  const exhausted = hunt({ ...state, reserveKcal: 1, health: 0.01 });
  assert.equal(exhausted.lastSurvivalChoice.outcome, "exhausted");
  assert.equal(exhausted.lastSurvivalChoice.foodKcal, 0);
  assert.ok(hunt(start(23)).outdoorNightMinutes > 0);
  for (const roll of [-1, 1, NaN]) assert.throws(() => hunt(state, roll), /draw/);
});

test("participation snapshots preserve the dog's action-time identity across later care and save/resume", async () => {
  const state = start();
  const walked = walkSurvival(state, 1, 0, forest, forest, survival);
  assert.deepEqual(walked.lastMove.companion, companionRecord(state).companion);
  const music = beginBusking(state, { terrain: "place", countryCodes: ["FR"] }, info, survival, economy);
  assert.deepEqual(music.performancePending.companion, companionRecord(state).companion);
  const exploring = beginExploration({ ...state,
    trail: { ...state.trail, version: 2 } });
  const prepared = await prepareFieldSearch(exploring, forest, async () => null,
    new AbortController().signal, { proximity: async () => 1000, random: () => 0 });
  const searched = applyFieldSearch(exploring, prepared, forest, info, survival, economy);
  assert.deepEqual(searched.trail.exploration.lastSearch.companion, companionRecord(state).companion);
  const hunted = hunt(state);
  hunted.equipment.dog.name = "Renamed";
  hunted.equipment.dog.hunger = 100;
  const restored = validateSave(JSON.parse(JSON.stringify(save(hunted)))).state;
  assert.deepEqual(restored.lastSurvivalChoice.companion, { name: "Étoile", ready: true });
  const nighttime = start(23);
  const fainted = finishAction(nighttime, restSurvival({ ...nighttime, fatigue: 100 },
    { ...survival, rest_minutes: 1, rest_fatigue_recovery: 0 }), info, economy, { survival });
  assert.deepEqual(fainted.lastFaint.companion, companionRecord(nighttime).companion);
  const daytime = finishAction(state, restSurvival({ ...state, fatigue: 100 },
    { ...survival, rest_minutes: 1, rest_fatigue_recovery: 0 }), info, economy, { survival });
  assert.equal(daytime.lastFaint.companion, undefined);
});

test("event records retain companion presence without changing event outcomes or generated wording", () => {
  const state = start();
  let eventState;
  for (let seed = 0; seed < 100 && !eventState; seed++) {
    const previous = { ...state, startedAt: state.startedAt + seed };
    const moved = { ...previous, col: previous.col + 1, elapsedMinutes: 90 };
    const next = advanceJourneyEvents(previous, moved, info, survival, economy);
    if (next.events?.history.length) eventState = next;
  }
  assert.ok(eventState);
  assert.deepEqual(eventState.events.history.at(-1).companion, { name: "Étoile", ready: true });
  const alone = { ...state, equipment: { ...state.equipment, dog: null } };
  for (const kind of ["forestBoar", "forestDogs", "food", "picnic", "waterBreak", "catNap", "whiteDeer", "ribbon"]) {
    const withDog = applyJourneyEvent(state, kind, info, survival, economy);
    const without = applyJourneyEvent(alone, kind, info, survival, economy);
    for (const key of ["health", "fatigue", "reserveKcal", "walletCents", "elapsedMinutes"]) {
      assert.equal(withDog[key], without[key], `${kind}: dog text must not invent a ${key} bonus`);
    }
  }
  for (const language of ["fr", "en"]) {
    const t = (key, args) => translate(language, key, args);
    const base = { ...eventState.events.history.at(-1), kind: "forestBoar" };
    assert.match(journeyEventText(base, t), /Étoile/);
    assert.doesNotMatch(journeyEventText({ ...base, companion: undefined }, t), /Étoile|companion\./);
    const generated = { ...base, wording: { fr: "Un sanglier surgit.", en: "A boar appears." } };
    assert.match(journeyEventText(generated, t), /Étoile/);
    const parts = journeyEventTextParts({ ...base, kind: "whiteDeer" }, t);
    assert.ok(parts.some(part => typeof part === "string" && part.includes("Étoile")));
    for (const activity of ["hunt", "search", "walk", "music", "vigilance", "interrupted"]) {
      assert.match(companionText(base, activity, t), /Étoile/);
      assert.doesNotMatch(companionText(base, activity, t), /\{|^companion\./);
      assert.match(companionText({ companion: { ready: false } }, activity, t), /65/);
      assert.equal(companionText({}, activity, t), "");
    }
    assert.ok(companionText({ companion: { ready: true } }, "hunt", t).includes(t("companion.dog")));
  }
});

test("malformed participation is rejected while old saves and unnamed dogs remain valid", () => {
  validateCompanionRecord({});
  validateCompanionRecord({ companion: { ready: true } });
  for (const companion of [null, [], { ready: "yes" }, { ready: true, name: "<bad>" },
    { ready: false, name: "x".repeat(41) }, { ready: true, name: " \n" }, { ready: true, reward: 800 }]) {
    assert.throws(() => validateCompanionRecord({ companion }), /companion participation/);
    const saved = save(hunt(start()));
    saved.state.lastSurvivalChoice.companion = companion;
    assert.throws(() => validateSave(saved), /companion participation/);
  }
});
