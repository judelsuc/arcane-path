import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startBuildingSleep, beginBuildingSleep, settleBuildingSleep, buildingSleepStatus,
  buildingSleepPending, buildingSleepEvent } from "../building-sleep.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy, applyBirthTarot } from "../economy.mjs";
import { beginPressures, validatePressures } from "../pressures.mjs";
import { eventChallenge, reactionCue } from "../event-qte.mjs";
import { journeyActionBlocker } from "../travel.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { createTrail } from "../trail.mjs";
import { placementReason } from "../needs-notices.mjs";
import { translate } from "../i18n.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const economy = json("../public/economy.json"), survival = json("../public/config.json").survival;
const map = json("../public/map.json");
const cell = { terrain: "building" };
const info = { latitude: 44.54, longitude: 2.3, terrain: "building" };
const start = () => beginPressures({
  ...applyBirthTarot(startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 17, 12),
    "balanced", survival), economy, () => 0), economy),
  fatigue: 50, awakeHours: 12, walletCents: 0, trail: createTrail(map, 14, 10, () => 0),
}, economy);
const search = (state = start(), context = info) =>
  startBuildingSleep(state, cell, context, survival, economy, () => 0);
const pending = () => beginBuildingSleep(search());
const finish = (state, result, context = info) =>
  settleBuildingSleep(state, cell, context, survival, economy, result, () => 0);
const save = state => createSave({ region: "firmi", map, state, survival, economy }, 1);
const last = state => state.buildingSleepAttempts.at(-1);
function success(state) {
  const rules = eventChallenge(buildingSleepEvent(last(state), state.buildingSleepAttempts.length - 1));
  const trace = rules.keys.map((key, index) => ({ key, atMs: reactionCue(rules, index).startMs + 50 }));
  return { trace, elapsedMs: trace.at(-1).atMs, skipped: false };
}
const skipped = { trace: [], elapsedMs: 0, skipped: true };
const failure = { trace: [], elapsedMs: 20000, skipped: false };

test("shelter search is exclusive to loaded building cells and costs ten minutes once", () => {
  const state = start();
  for (const invalid of [null, { terrain: "place" }, { terrain: "church" },
    { ...cell, unavailable: true }, { ...cell, downloading: true }]) {
    assert.equal(buildingSleepStatus(state, invalid).available, false);
    assert.throws(() => startBuildingSleep(state, invalid, info, survival, economy), /unavailable/);
  }
  for (const other of [{ events: { pending: 1 } }, { miniGamePending: {} },
    { cafePending: {} }, { performancePending: {} }, { theftPending: {} },
    { legendAdventure: {} }, { equipment: { dogEncounter: "pending" } }]) {
    assert.throws(() => search({ ...state, ...other }), /unavailable/);
  }
  const next = search(state);
  assert.equal(next.elapsedMinutes, state.elapsedMinutes + 10);
  assert.equal(next.walletCents, 0);
  assert.equal(next.sleeps, state.sleeps);
  assert.equal(last(next).qte.status, "ready");
  assert.equal(buildingSleepPending(next), true);
  assert.equal(journeyActionBlocker(next, { cell }), "event");
  assert.throws(() => search(next), /unavailable/);
  assert.deepEqual(validateSave(save(next)).state, next);
});

test("success grants ordinary sheltered sleep, not money, food or washing, and persists", () => {
  const state = pending();
  state.pressures.cleanliness = 20;
  const next = finish(state, success(state));
  assert.equal(last(next).outcome, "slept");
  assert.equal(next.elapsedMinutes, 10 + survival.sleep_hours * 60);
  assert.equal(next.sleeps, state.sleeps + 1);
  assert.equal(next.meals, state.meals);
  assert.equal(next.walletCents, 0);
  assert.ok(next.reserveKcal < state.reserveKcal);
  assert.ok(next.fatigue < state.fatigue);
  assert.ok(next.awakeHours < state.awakeHours);
  assert.ok(next.pressures.cleanliness < 100);
  assert.equal(buildingSleepPending(next), false);
  assert.deepEqual(validateSave(save(next)).state, next);
  assert.throws(() => finish(next, success(state)), /cannot be settled/);
});

for (const [name, result] of [["failure", failure], ["skipping", skipped]]) {
  test(`${name} adds exactly five vigilance points and no sleep, damage or extra time`, () => {
    const state = pending();
    const next = finish(state, result);
    assert.equal(last(next).outcome, "outside");
    assert.equal(next.pressures.vigilance, state.pressures.vigilance + 5);
    assert.equal(next.health, state.health);
    assert.equal(next.elapsedMinutes, state.elapsedMinutes);
    assert.equal(next.sleeps, state.sleeps);
    assert.equal(next.walletCents, state.walletCents);
    assert.equal(buildingSleepStatus(next, cell).available, false);
    assert.deepEqual(validateSave(save(next)).state, next);
    assert.throws(() => finish(next, result), /cannot be settled/);
    assert.throws(() => search(next), /unavailable/);
    assert.equal(buildingSleepStatus({ ...next, col: next.col + 1 }, cell).available, true);
    assert.equal(buildingSleepStatus({ ...next, elapsedMinutes: next.elapsedMinutes + 1440 }, cell).available, true);
  });
}

test("reloading an active attempt preserves the lock and cannot avoid the failure penalty", () => {
  const state = validateSave(save(pending())).state;
  assert.equal(last(state).qte.status, "active");
  assert.equal(buildingSleepPending(state), true);
  assert.throws(() => beginBuildingSleep(state), /cannot start/);
  const next = finish(state, failure);
  assert.equal(next.pressures.vigilance, state.pressures.vigilance + 5);
  assert.deepEqual(validateSave(save(next)).state, next);
});

test("the five-point penalty triggers normal placement at 100 with an explained, valid receipt", () => {
  const state = pending();
  state.pressures.vigilance = 97;
  const next = finish(state, failure);
  assert.equal(next.pressures.placements.length, 1);
  assert.equal(last(next).outcome, "interrupted");
  assert.equal(next.elapsedMinutes, state.elapsedMinutes + 1440);
  assert.equal(next.pressures.placements[0].trigger.factors.buildingSearch, 5);
  assert.equal(next.pressures.vigilance, 20);
  for (const language of ["en", "fr"]) assert.ok(placementReason(next.pressures.placements[0],
    (key, values) => translate(language, key, values)).includes(
    translate(language, "placementCause.buildingSearch")));
  validatePressures(next, economy);
  assert.deepEqual(validateSave(save(next)).state, next);
});

test("fainting or placement during the initial search consumes the attempt without launching a QTE", () => {
  const state = start();
  state.pressures.vigilance = 99.9;
  const next = search(state);
  assert.equal(last(next).outcome, "interrupted");
  assert.equal(buildingSleepPending(next), false);
  assert.deepEqual(validateSave(save(next)).state, next);
  assert.throws(() => beginBuildingSleep(next), /cannot start/);
});

test("history rejects rerolls, moved pending attempts, forged timing, outcomes and input", () => {
  const state = pending();
  for (const change of [
    copy => { copy.col++; },
    copy => { copy.buildingSleepAttempts.push(structuredClone(last(copy))); },
    copy => { last(copy).day = "2026-10-18"; },
    copy => { last(copy).finishedMinutes++; },
    copy => { last(copy).outcome = "slept"; },
    copy => { last(copy).qte.fatigue = 101; },
  ]) {
    const copy = structuredClone(state);
    change(copy);
    assert.throws(() => save(copy), /Invalid/);
  }
  assert.throws(() => finish(state, { trace: [{ key: "x", atMs: 1 }], elapsedMs: 1, skipped: false }), /Invalid/);
  assert.throws(() => settleBuildingSleep(state, { terrain: "plain" }, info, survival, economy, skipped), /cannot/);
});
