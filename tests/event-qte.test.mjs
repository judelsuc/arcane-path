import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EVENT_QTES, QTE_PROMPTS, eventChallenge, challengeOutcome } from "../event-qte.mjs";
import { EVENT_CATALOGUE, advanceJourneyEvents, beginJourneyEventChallenge, settleJourneyEventChallenge,
  acknowledgeJourneyEvent, validateJourneyEvents } from "../journey-events.mjs";
import { startEconomy, finishAction } from "../economy.mjs";
import { startSurvival, restSurvival } from "../survival.mjs";
import { beginEquipment } from "../equipment.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { createTrail } from "../trail.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const economy = json("../public/economy.json"), survival = json("../public/config.json").survival;
const map = json("../public/map.json");
const info = { latitude: 44.54, longitude: 2.3, terrain: "road" };
const fixtures = new Map();
function fixture(kind) {
  if (fixtures.has(kind)) return structuredClone(fixtures.get(kind));
  const context = { ...info, terrain: EVENT_CATALOGUE[kind].terrains?.[0] ?? "road" };
  for (let seed = 0; seed < 10000; seed++) {
    let state = beginEquipment(startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 17, 12) + seed,
      "balanced", survival), economy, () => 0));
    state = { ...state, reserveKcal: 1000, fatigue: 20, health: 50, awakeHours: 8,
      trail: createTrail(map, 14, 10, () => 0),
      equipment: { ...state.equipment, ...(kind === "dogEncounter" ? {} :
        { dog: { name: "Aster", hunger: 15, careNeed: 15 } }) } };
    const moved = { ...finishAction(state, restSurvival(state, {
      ...survival, rest_minutes: 90, rest_fatigue_recovery: 0,
    }), context, economy, { survival, random: () => 0.1 }), col: 15 };
    const queued = advanceJourneyEvents(state, moved, context, survival, economy);
    if (queued.events?.history.at(-1)?.kind !== kind) continue;
    fixtures.set(kind, { moved, queued, context });
    return structuredClone(fixtures.get(kind));
  }
  throw new Error("Missing QTE fixture: " + kind);
}
function win(event, mode = "normal") {
  const rule = eventChallenge(event, mode);
  return rule.type === "timing" ? [{ key: "Space", atMs: 1000 }] :
    rule.keys.map((key, index) => ({ key, atMs: 100 + 100 * index }));
}
const settle = (state, context, success, skipped = false) => {
  const event = state.events.history.at(-1);
  return settleJourneyEventChallenge(state, event.id, success ? win(event, event.qte.mode) : [],
    success ? 1000 : 6000, context, survival, economy, skipped);
};

test("all 37 events have contextual bilingual challenges and deterministic normal/accessible controls", () => {
  assert.deepEqual(Object.keys(EVENT_QTES).sort(), Object.keys(EVENT_CATALOGUE).sort());
  assert.deepEqual(Object.keys(QTE_PROMPTS).sort(), Object.keys(EVENT_CATALOGUE).sort());
  assert.equal(Object.keys(EVENT_QTES).length, 37);
  for (const kind of Object.keys(EVENT_QTES)) {
    assert.ok(QTE_PROMPTS[kind].every(text => text.length >= 20));
    for (const mode of ["normal", "relaxed"]) {
      const event = { kind, id: 1, opportunity: 3 };
      assert.deepEqual(eventChallenge(event, mode), eventChallenge(event, mode));
      assert.equal(challengeOutcome(event, mode, win(event, mode), 1000), "success");
      assert.equal(challengeOutcome(event, mode, [], 6000), "failure");
      assert.equal(challengeOutcome(event, mode, [], 0, true), "skipped");
      assert.equal(eventChallenge(event, mode).durationMs, mode === "normal" ? 6000 : null);
    }
  }
});

test("timing windows, deadline and input validation use actual measurable boundaries", () => {
  const event = { kind: "coins", id: 1, opportunity: 1 };
  for (const atMs of [700, 1300, 2700, 3300]) {
    assert.equal(challengeOutcome(event, "normal", [{ key: "Space", atMs }], atMs), "success");
  }
  for (const atMs of [0, 699, 1301, 6000]) {
    assert.equal(challengeOutcome(event, "normal", [{ key: "Space", atMs }], atMs), "failure");
  }
  for (const trace of [[{ key: "invented", atMs: 100 }], [{ key: "Space", atMs: -1 }],
    [{ key: "Space", atMs: 1001 }], Array(4).fill({ key: "Space", atMs: 1 })]) {
    assert.throws(() => challengeOutcome(event, "normal", trace, 1000), /inputs/);
  }
  assert.throws(() => eventChallenge(event, "invalid"), /challenge/);
  assert.throws(() => challengeOutcome(event, "normal", [], NaN), /inputs/);
  const observation = { kind: "stars", id: 2, opportunity: 4 };
  const trace = win(observation, "relaxed");
  assert.equal(challengeOutcome(observation, "relaxed", trace, 100000), "success");
  assert.equal(challengeOutcome(observation, "normal", trace, 6000), "failure");
});

test("every event defers all mechanics, then settles positive rewards or negative penalties exactly once", () => {
  for (const [kind, rule] of Object.entries(EVENT_CATALOGUE)) {
    const { queued, moved, context } = fixture(kind), event = queued.events.history.at(-1);
    for (const key of ["walletCents", "reserveKcal", "fatigue", "health", "awakeHours", "elapsedMinutes", "equipment"]) {
      assert.deepEqual(queued[key], moved[key], kind + ": no pre-QTE effects");
    }
    validateJourneyEvents(queued, economy, survival);
    assert.throws(() => acknowledgeJourneyEvent(queued), /Resolve/);
    assert.throws(() => settle(queued, context, true), /cannot be settled/);
    for (const success of [true, false]) {
      const active = beginJourneyEventChallenge(queued, event.id);
      assert.throws(() => beginJourneyEventChallenge(active, event.id), /cannot be started/);
      const next = settle(active, context, success);
      assert.equal(next.events.history.at(-1).qte.status, success ? "success" : "failure");
      validateJourneyEvents(next, economy, survival);
      assert.throws(() => settle(next, context, success), /cannot be settled/);
      const neutral = rule.polarity === "story" || rule.polarity === "positive" && !success ||
        rule.polarity === "negative" && success;
      if (neutral) for (const key of ["walletCents", "reserveKcal", "fatigue", "health", "awakeHours",
        "elapsedMinutes", "equipment", "speedEffect"]) assert.deepEqual(next[key], moved[key], kind);
      if (kind === "coins") assert.equal(next.walletCents - moved.walletCents, success ? 150 : 0);
      if (kind === "forestBoar") assert.equal(next.health - moved.health, success ? 0 : -15);
      if (kind === "dogEncounter") assert.equal(next.equipment.dogEncounter, success ? "pending" : null);
      const done = acknowledgeJourneyEvent(next);
      assert.equal(done.events.pending, null);
      assert.throws(() => acknowledgeJourneyEvent(done), /No journey event/);
    }
  }
});

test("ready, active and final saves roundtrip; started reloads fail, resolved events cannot replay, legacy stays acknowledged", () => {
  const { queued, context } = fixture("coins");
  const roundtrip = state => validateSave(JSON.parse(JSON.stringify(
    createSave({ region: "firmi", map, state, survival, economy }, 1)))).state;
  assert.deepEqual(roundtrip(queued), queued);
  const active = roundtrip(beginJourneyEventChallenge(queued, queued.events.pending, "relaxed"));
  const failed = settle(active, context, false);
  assert.equal(failed.walletCents, queued.walletCents);
  assert.equal(roundtrip(failed).events.history.at(-1).qte.status, "failure");
  const success = roundtrip(settle(beginJourneyEventChallenge(queued, queued.events.pending), context, true));
  assert.equal(success.walletCents, queued.walletCents + 150);
  assert.throws(() => settle(success, context, true), /cannot be settled/);
  const legacy = structuredClone(success);
  delete legacy.events.history.at(-1).qte;
  assert.equal(acknowledgeJourneyEvent(roundtrip(legacy)).walletCents, success.walletCents);
  for (const mutate of [
    state => { state.events.history[0].qte.extra = true; },
    state => { state.events.history[0].qte.status = "success"; },
    state => { state.events.history[0].moneyCents = 150; },
    state => { state.col++; },
    state => { state.elapsedMinutes++; },
  ]) {
    const invalid = structuredClone(queued);
    mutate(invalid);
    assert.throws(() => roundtrip(invalid));
  }
  assert.throws(() => settleJourneyEventChallenge(active, active.events.pending, [], 0,
    { ...context, terrain: "water" }, survival, economy), /cannot be settled/);
});
