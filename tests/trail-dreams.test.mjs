import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { settleTrailDream, validateTrailDreams, trailDreamText, TRAIL_DREAMS } from "../trail-dreams.mjs";
import { beginExploration, prepareFieldSearch, applyFieldSearch, validateExploration } from "../trail-search.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy, sleepEconomy, restEconomy } from "../economy.mjs";
import { askHospitality, HOSPITALITY_RULES } from "../hospitality.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { trailReminder, trailPageRecords } from "../trail-ui.mjs";
import { translate } from "../i18n.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const survival = json("../public/config.json").survival, economy = json("../public/economy.json");
const map = json("../public/map.json");
const info = { latitude: 44.54, longitude: 2.3, terrain: "place" };
const cell = { terrain: "place", countryCodes: ["FR"] };
function start(minutes = 0) {
  const step = 45000 / 6371008.8 * 180 / Math.PI / Math.cos(info.latitude * Math.PI / 180);
  const stages = Array.from({ length: 10 }, (_, i) => ({
    ...info, col: 194 + i * 180, row: 10, longitude: info.longitude + (i + 1) * step,
    name: `SECRET Town ${i + 1}`, osmId: `node/${i + 1}`, placeType: "town", legMeters: 45000,
    sourceUrl: "https://overpass-api.de/api/interpreter", retrievedAt: "2026-10-17T12:00:00Z",
    witnessId: `fictional-traveler-${i + 1}`,
  }));
  const state = beginExploration({ ...startEconomy(startSurvival(14, 10,
    Date.UTC(2026, 9, 17, 12), "balanced", survival), economy, () => 0),
    trail: { version: 2, origin: { ...info, col: 14, row: 10 }, parentName: "Camille",
      stages, index: 0, history: [], completed: false } });
  return atTime(state, minutes);
}
function atTime(state, elapsedMinutes) {
  return { ...state, elapsedMinutes, tarotDay: new Date(state.startedAt + elapsedMinutes * 60000).toISOString().slice(0, 10) };
}
const slept = (state, minutes = 60) => ({ ...atTime(state, state.elapsedMinutes + minutes), sleeps: state.sleeps + 1 });
const latest = state => state.trail.dreams?.checks.at(-1);
const save = state => createSave({ region: "firmi", map, state, survival, economy }, 1);

test("one settled sleep hour is required; successful dreams restart the 48-hour delay", () => {
  const state = start(2880);
  assert.equal(settleTrailDream(state, slept(state, 59.999)).trail.dreams, undefined);
  const first = settleTrailDream(state, slept(state));
  assert.equal(latest(first).outcome, "guidance");
  assert.equal(latest(first).checkMinutes, 2940);
  const early = atTime(first, first.elapsedMinutes + TRAIL_DREAMS.stalled - 60 - 0.001);
  assert.equal(settleTrailDream(early, slept(early)).trail.dreams.checks.length, 1);
  const exact = atTime(first, first.elapsedMinutes + TRAIL_DREAMS.stalled - 60);
  assert.equal(settleTrailDream(exact, slept(exact)).trail.dreams.checks.length, 2);
  assert.equal(settleTrailDream(state, atTime(state, 59 + state.elapsedMinutes)).trail.dreams, undefined);
  assert.throws(() => settleTrailDream(state, slept(state), { startedMinutes: NaN }), /sleep start/);
});

test("guidance begins at exactly 48 hours without progress and every new clue resets it", () => {
  const before = start(2819.999), exact = start(2820);
  assert.equal(settleTrailDream(before, slept(before)).trail.dreams, undefined);
  assert.equal(latest(settleTrailDream(exact, slept(exact))).rescue, true);
  const recent = start(2880);
  recent.trail.exploration.hints = [{ stage: 0, kind: "direction", precision: "vague",
    col: 14, row: 10, elapsedMinutes: 2800 }];
  assert.equal(settleTrailDream(recent, slept(recent)).trail.dreams, undefined);
  const overdue = atTime(recent, 2800 + TRAIL_DREAMS.stalled - 60);
  assert.equal(latest(settleTrailDream(overdue, slept(overdue))).rescue, true);
  const previousStage = start(2880);
  previousStage.trail.index = 1;
  previousStage.trail.history = [{ elapsedMinutes: 2800 }];
  assert.equal(settleTrailDream(previousStage, slept(previousStage)).trail.dreams, undefined);
  for (const channel of ["signs", "reports"]) {
    const current = start(10000);
    current.trail.exploration[channel] = [{ stage: 0, elapsedMinutes: 9990 }];
    assert.equal(settleTrailDream(current, slept(current)).trail.dreams, undefined, channel);
  }
  const arrived = start(10000);
  arrived.trail.arrivals = [{ stage: 0, elapsedMinutes: 9990 }];
  assert.equal(settleTrailDream(arrived, slept(arrived)).trail.dreams, undefined);
});

test("dream wording rotates durably past the bounded history and legacy receipts remain readable", () => {
  let state = start(2880);
  for (let index = 0; index < 132; index++) {
    state = settleTrailDream(state, slept(state));
    assert.equal(latest(state).wordingVariant, index % 3);
    assert.equal(state.trail.dreams.checks.length, Math.min(index + 1, 128));
    validateTrailDreams(state);
    state = atTime(state, state.elapsedMinutes + TRAIL_DREAMS.stalled);
  }
  const invalid = structuredClone(state);
  invalid.trail.dreams.checks.at(-1).wordingVariant = 3;
  assert.throws(() => validateTrailDreams(invalid), /dream history/);
  for (const check of state.trail.dreams.checks) delete check.wordingVariant;
  validateTrailDreams(state);
  const resumed = settleTrailDream(state, slept(state));
  assert.equal(latest(resumed).wordingVariant, 2);
});

test("three failed searches cannot bypass the quiet period; overdue guidance resets the counter", async () => {
  let state = start();
  for (let count = 1; count <= 3; count++) {
    const signal = new AbortController().signal;
    const result = await prepareFieldSearch(state, cell, async () => null, signal, {
      proximity: async () => 100000, random: () => 0.999,
    });
    state = applyFieldSearch(state, result, cell, info, survival, economy);
    assert.equal(state.trail.exploration.searchStreak.failures, count);
    assert.deepEqual(state.trail.exploration.searchStreak.misses, [], "far-route misses must count too");
    validateExploration(state);
  }
  assert.equal(settleTrailDream(state, slept(state)).trail.dreams, undefined);
  state = atTime(state, 2880);
  const before = structuredClone(state);
  const next = slept(state), result = settleTrailDream(state, next);
  assert.equal(latest(result).rescue, true);
  assert.equal(latest(result).outcome, "guidance");
  assert.equal(result.trail.exploration.searchStreak.failures, 0);
  assert.deepEqual(state, before);
  const { trail: _, ...mechanics } = result, { trail: __, ...expected } = next;
  assert.deepEqual(mechanics, expected);
  const prepared = await prepareFieldSearch(state, cell, async () => null, new AbortController().signal, {
    proximity: async () => 0, random: () => 0,
  });
  assert.equal(applyFieldSearch(state, prepared, cell, info, survival, economy)
    .trail.exploration.searchStreak.failures, 0);
});

test("no random early opportunities or rerolls on resume; historical receipts remain compatible", () => {
  for (let offset = 0; offset < 100; offset++) {
    const state = start(offset), next = slept(state);
    const result = settleTrailDream(state, next);
    assert.equal(result, next);
    assert.deepEqual(settleTrailDream(state, next), result);
    const restored = validateSave(JSON.parse(JSON.stringify(save(result)))).state;
    assert.deepEqual(restored.trail.dreams, result.trail.dreams);
    assert.equal(settleTrailDream(restored, slept(restored)).trail.dreams, undefined);
  }
  const legacy = start(10000);
  legacy.trail.dreams = { version: 1, checks: [
    { stage: 0, startedMinutes: 0, checkMinutes: 60, elapsedMinutes: 480,
      col: 14, row: 10, rescue: false, outcome: "miss", direction: null },
    { stage: 0, startedMinutes: 720, checkMinutes: 780, elapsedMinutes: 1200,
      col: 14, row: 10, rescue: false, outcome: "guidance", direction: "east" },
  ] };
  validateSave(save(legacy));
  const recent = atTime(legacy, 1200 + TRAIL_DREAMS.stalled - 60 - .001);
  assert.equal(settleTrailDream(recent, slept(recent)).trail.dreams.checks.length, 2);
});

test("rest, fainting, care, interrupted sleep, completed trails and arrival do not deliver dreams", () => {
  const state = start(2880);
  for (const next of [
    atTime(state, 3500),
    { ...slept(state), faints: 1 },
    { ...slept(state), pressures: { placements: [{}] } },
    { ...slept(state), ended: "hunger" },
    { ...slept(state), trail: { ...state.trail, index: 1 } },
  ]) assert.equal(settleTrailDream(state, next).trail.dreams, undefined);
  const arrived = { ...state, col: 193, row: 11 };
  assert.equal(settleTrailDream(arrived, slept(arrived)).trail.dreams, undefined);
  const ended = { ...state, trail: { ...state.trail, completed: true } };
  assert.equal(settleTrailDream(ended, slept(ended)).trail.dreams, undefined);
});

test("real outdoor, sheltered and accepted hospitality sleeps can deliver guidance, ordinary rest cannot", () => {
  const state = start(2880);
  const shelterCell = { ...cell, pois: [{ osmId: "node/2", tags: { amenity: "shelter", fee: "no" } }] };
  for (const [place, id] of [[cell, null], [shelterCell, "node/2"]]) {
    const next = sleepEconomy(state, place, info, id, survival, economy);
    assert.equal(latest(settleTrailDream(state, next)).outcome, "guidance");
  }
  assert.equal(settleTrailDream(state, restEconomy(state, info, survival, economy)).trail.dreams, undefined);
  let hosted;
  for (let id = 1; id < 30 && !hosted; id++) {
    const town = { ...cell, settlements: [{ osmId: `node/${id}`, name: "Test village" }] };
    const next = askHospitality(state, town, info, survival, economy, () => 0.99);
    if (next.hospitalityAttempts.at(-1).outcome === "hosted") hosted = next;
    else assert.equal(settleTrailDream(state, next).trail.dreams, undefined);
  }
  assert.ok(hosted);
  const result = settleTrailDream(state, hosted, { startedMinutes: state.elapsedMinutes + HOSPITALITY_RULES.minutes });
  assert.equal(latest(result).checkMinutes, state.elapsedMinutes + 90);
  assert.equal(latest(result).outcome, "guidance");
});

test("bearing follows the sleeping location, survives saves and reaches the trail journal without secrets", () => {
  for (const [col, row, direction] of [[14, 10, "east"], [300, 10, "west"], [194, 100, "north"], [194, -100, "south"]]) {
    const state = { ...start(2880), col, row };
    const result = settleTrailDream(state, slept(state));
    const dream = latest(result);
    assert.equal(dream.direction, direction);
    assert.equal(trailPageRecords(result, 0)[0].kind, "dream");
    for (const language of ["fr", "en"]) {
      const t = (key, args) => translate(language, key, args);
      const text = trailDreamText(dream, t);
      assert.ok(text.includes(t(`hintCompass.${direction}`)));
      assert.equal(trailReminder(result, t), text);
      assert.doesNotMatch(text, /SECRET|194|Town|node|45 km/);
    }
    const restored = validateSave(JSON.parse(JSON.stringify(save(result)))).state;
    assert.deepEqual(restored.trail.dreams, result.trail.dreams);
  }
});

test("legacy saves remain valid and malformed dream/failure receipts are rejected", () => {
  const state = start(2880);
  validateSave(save(state));
  const result = settleTrailDream(state, slept(state));
  for (const change of [
    check => { check.stage = 10; }, check => { check.direction = "teleport"; },
    check => { check.checkMinutes++; }, check => { check.elapsedMinutes = Infinity; },
    check => { check.col = 1.5; }, check => { check.outcome = "secret"; },
    check => { check.rescue = "true"; },
  ]) {
    const invalid = structuredClone(result);
    change(latest(invalid));
    assert.throws(() => validateTrailDreams(invalid), /dream history/);
    assert.throws(() => save(invalid));
  }
  const invalid = structuredClone(result);
  invalid.trail.dreams.checks.push({ ...latest(invalid), checkMinutes: latest(invalid).checkMinutes });
  assert.throws(() => validateTrailDreams(invalid), /dream history/);
  for (const failures of [-1, 4, 1.5, null, "3"]) {
    const invalid = start();
    invalid.trail.exploration.searchStreak = { stage: 0, misses: [], failures };
    assert.throws(() => validateExploration(invalid), /field clue history/);
  }
});
