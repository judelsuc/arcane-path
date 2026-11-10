import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EVENT_QTES, QTE_PROMPTS, QTE_LETTERS, REACTION_KEYS, eventChallenge, challengeOutcome,
  reactionCue, validateEventChallenge } from "../event-qte.mjs";
import { EVENT_CATALOGUE, advanceJourneyEvents, beginJourneyEventChallenge, settleJourneyEventChallenge,
  acknowledgeJourneyEvent, validateJourneyEvents, journeyEventText, journeyEventEffectParts } from "../journey-events.mjs";
import { eventQtePresentation, eventQteResult } from "../event-qte-copy.mjs";
import { translate } from "../i18n.mjs";
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
  if (rule.type === "reaction") return rule.keys.map((key, index) =>
    ({ key, atMs: reactionCue(rule, index).startMs + 100 }));
  return rule.type === "timing" ? [{ key: "Space", atMs: 1000 }] :
    rule.keys.map((key, index) => ({ key, atMs: 100 + 100 * index }));
}
const settle = (state, context, success, skipped = false) => {
  const event = state.events.history.at(-1);
  const trace = success ? win(event, event.qte.mode) : [];
  return settleJourneyEventChallenge(state, event.id, trace,
    success ? Math.max(1000, trace.at(-1).atMs) : eventChallenge(event, event.qte.mode).durationMs ?? 6000,
    context, survival, economy, skipped);
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
  queued.events.history.at(-1).qte = { version: 1, status: "ready" };
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

test("reaction difficulty depends on event, fatigue shortens deadlines and poor health lengthens sequences", () => {
  for (const kind of Object.keys(EVENT_QTES)) {
    const make = (fatigue, health) => ({ kind, id: 1, opportunity: 1,
      qte: { version: 2, status: "ready", fatigue, health } });
    const rested = eventChallenge(make(0, 100)), tired = eventChallenge(make(100, 100));
    const injured = eventChallenge(make(0, 0));
    assert.equal(rested.type, "reaction");
    assert.equal(rested.reactionMs, 1100);
    assert.equal(tired.reactionMs, 600);
    assert.deepEqual(tired.keys, rested.keys);
    assert.equal(injured.keys.length, rested.keys.length + 4);
    assert.equal(injured.reactionMs, rested.reactionMs);
    assert.ok(injured.keys.length <= 9);
    const event = make(37, 43), rule = eventChallenge(event), trace = win(event);
    assert.equal(challengeOutcome(event, "normal", trace, trace.at(-1).atMs), "success");
    for (const delta of [-1, 0, rule.reactionMs - 1, rule.reactionMs]) {
      const inputs = rule.keys.map((key, index) => ({ key, atMs: reactionCue(rule, index).startMs + delta }));
      assert.equal(challengeOutcome(event, "normal", inputs, inputs.at(-1).atMs),
        delta < 0 || delta === rule.reactionMs ? "failure" : "success");
    }
    validateEventChallenge(event);
    for (const condition of [{ fatigue: -1 }, { health: 101 }, { fatigue: NaN }, { health: undefined }]) {
      assert.throws(() => eventChallenge({ ...event, qte: { ...event.qte, ...condition } }), /condition/);
    }
    assert.throws(() => eventChallenge(event, "relaxed"), /condition/);
  }
  const lengths = ["stars", "coins", "forestBoar"].map(kind => eventChallenge({
    kind, id: 1, opportunity: 1, qte: { version: 2, status: "ready", fatigue: 0, health: 100 },
  }).keys.length);
  assert.deepEqual(lengths, [3, 4, 5]);
});

test("reaction condition snapshots and successful transcripts survive save/load without recalculation", () => {
  const { queued, context } = fixture("forestBoar");
  const event = queued.events.history.at(-1), condition = structuredClone(event.qte);
  assert.equal(condition.version, 3);
  assert.equal(condition.fatigue, queued.fatigue);
  assert.equal(condition.health, queued.health);
  const active = beginJourneyEventChallenge(queued, event.id);
  assert.equal(active.events.history.at(-1).qte.fatigue, condition.fatigue);
  const completed = settle(active, context, true);
  const restored = validateSave(JSON.parse(JSON.stringify(
    createSave({ region: "firmi", map, state: completed, survival, economy }, 1)))).state;
  assert.deepEqual(restored, completed);
  assert.equal(restored.events.history.at(-1).qte.status, "success");
  const trace = restored.events.history.at(-1).qte.trace;
  const invalid = structuredClone(restored);
  invalid.events.history.at(-1).qte.trace[0].atMs = 0;
  assert.throws(() => validateJourneyEvents(invalid, economy, survival), /result/);
  assert.equal(trace[0].atMs, 1000);
});

test("version-3 letters start at fatigue 60 or health 50 and never reinterpret version-2 results", () => {
  for (const kind of Object.keys(EVENT_QTES)) {
    const make = (version, fatigue, health) => ({ kind, id: 1, opportunity: 1,
      qte: { version, status: "ready", fatigue, health } });
    const low = make(3, 59, 51);
    assert.ok(eventChallenge(low).keys.every(key => REACTION_KEYS.includes(key)));
    assert.throws(() => challengeOutcome(low, "normal", [{ key: "a", atMs: 1000 }], 1000), /inputs/);
    for (const [fatigue, health] of [[60, 100], [0, 50], [100, 0]]) {
      const event = make(3, fatigue, health), rule = eventChallenge(event);
      assert.deepEqual(eventChallenge(event), rule);
      assert.ok(rule.keys.some(key => QTE_LETTERS.includes(key)));
      const trace = win(event), elapsedMs = trace.at(-1).atMs;
      assert.equal(challengeOutcome(event, "normal", trace, elapsedMs), "success");
      validateEventChallenge({ ...event,
        qte: { ...event.qte, status: "success", mode: "normal", trace, elapsedMs } });
      const legacy = make(2, fatigue, health);
      assert.ok(eventChallenge(legacy).keys.every(key => REACTION_KEYS.includes(key)));
      const oldTrace = win(legacy), oldElapsed = oldTrace.at(-1).atMs;
      validateEventChallenge({ ...legacy,
        qte: { ...legacy.qte, status: "success", mode: "normal", trace: oldTrace, elapsedMs: oldElapsed } });
      assert.throws(() => challengeOutcome(legacy, "normal", trace, elapsedMs), /inputs/);
    }
  }
});

test("contextual actions cover every event and social impressions survive receipts without new reputation penalties", () => {
  for (const language of ["en", "fr"]) for (const kind of Object.keys(EVENT_QTES)) {
    const presentation = eventQtePresentation({ kind }, language);
    assert.ok(presentation.action.length >= 20);
    if (!presentation.social) continue;
    assert.equal(presentation.lines.length, 9);
    const { queued, context } = fixture(kind);
    const active = beginJourneyEventChallenge(queued, queued.events.pending);
    for (const skipped of [false, true]) {
      const failed = settle(active, context, false, skipped);
      assert.deepEqual(failed.pressures, queued.pressures);
      const record = failed.events.history.at(-1);
      assert.equal(record.reputation, 0);
      const restored = validateSave(JSON.parse(JSON.stringify(
        createSave({ region: "firmi", map, state: failed, survival, economy }, 1)))).state;
      const text = journeyEventText(restored.events.history.at(-1),
        (key, args) => translate(language, key, args));
      assert.ok(text.includes(eventQteResult(record, language)));
      assert.match(text, skipped ? language === "en" ? /let the moment pass/ : /laissez passer/ :
        language === "en" ? /poor impression/ : /mauvaise impression/);
    }
  }
});

test("final receipts show applied rewards, penalties, avoided penalties and neutral results in both languages", () => {
  for (const language of ["en", "fr"]) {
    const t = (key, args) => translate(language, key, args);
    for (const [kind, success, amount] of [["coins", true, "+1.50"], ["forestBoar", false, "-15.0"]]) {
      const { queued, context } = fixture(kind);
      assert.throws(() => journeyEventEffectParts(queued.events.history.at(-1), t), /before/);
      const next = settle(beginJourneyEventChallenge(queued, queued.events.pending), context, success);
      const parts = journeyEventEffectParts(next.events.history.at(-1), t);
      assert.ok(parts.some(part => part.text === amount &&
        part.feedback === (success ? "success" : "failure")));
    }
    for (const [kind, success] of [["coins", false], ["forestBoar", true], ["stars", true], ["stars", false]]) {
      const { queued, context } = fixture(kind);
      const next = settle(beginJourneyEventChallenge(queued, queued.events.pending), context, success);
      assert.match(journeyEventEffectParts(next.events.history.at(-1), t).join(""),
        language === "en" ? /No reward or penalty/ : /Aucune récompense ni pénalité/);
    }
  }
});
