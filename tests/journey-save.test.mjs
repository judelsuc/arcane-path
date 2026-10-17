import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSave, validateSave, createJourneyStore, mapIdentity } from "../journey-save.mjs";
import { startSurvival, walkSurvival } from "../survival.mjs";
import { startEconomy, buyMeal, finishAction } from "../economy.mjs";
import { createTrail, interviewTrail, trailTarget } from "../trail.mjs";
import { beginBusking, settleBusking } from "../music.mjs";

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const map = json("../public/map.json");
const survival = json("../public/config.json").survival;
const economy = json("../public/economy.json");
const info = { latitude: 44.54, longitude: 2.3 };
const cell = { terrain: "place", countryCodes: ["FR"], elevationMeters: 100 };
function details() {
  let state = startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 17, 12),
    "sturdy", survival), economy, () => 0);
  state = { ...state, trail: createTrail(map, 14, 10, () => 0) };
  return { region: "firmi", map, state, survival, economy };
}
function storage() {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), data };
}

test("round trips complete state, pinned rules, map identity and separate region slots", () => {
  const memory = storage(), store = createJourneyStore(memory), d = details();
  assert.equal(store.read("firmi"), null);
  const first = store.write(d);
  assert.equal(first.revision, 1);
  assert.deepEqual(store.read("firmi").state, d.state);
  assert.deepEqual(store.read("firmi").survival, survival);
  assert.deepEqual(store.read("firmi").economy, economy);
  assert.equal(first.mapIdentity, mapIdentity(map));
  assert.equal(store.read("paris"), null);
  store.write({ ...d, region: "paris" });
  assert.equal(store.read("firmi").region, "firmi");
  assert.equal(store.write(d).revision, 2);
  const edge = { ...d, state: { ...d.state, col: 8007, row: -8000 } };
  assert.equal(createSave(edge, 3).state.col, 8007);
  assert.throws(() => createSave({ ...edge, state: { ...edge.state, col: 8008 } }, 3));
  assert.throws(() => createSave({ ...edge, state: { ...edge.state, row: -8001 } }, 3));
});

test("resume is exact across movement, a paid meal and a discovered clue without rerolling tarot", () => {
  const d = details(), target = trailTarget(d.state);
  const moved = walkSurvival(d.state, 0, 1, cell, cell, survival);
  d.state = finishAction(d.state, moved, info, economy);
  assert.equal(d.state.col, target.col);
  assert.equal(d.state.row, target.row);
  d.state = buyMeal(d.state, cell, info, "aligot", survival, economy);
  d.state = interviewTrail(d.state, info, survival, economy);
  const save = createSave(d, 1);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save))).state, d.state);
  assert.equal(save.state.trail.index, 1);
  assert.equal(save.state.birthCard, "fool");
  assert.equal(save.state.meals, 1);
  assert.equal(save.state.walletCents, d.state.walletCents);
  assert.ok(save.state.elapsedMinutes > 25);
  assert.equal(save.state.character.bodyMassKg, 50);
});

test("interrupted music keeps upfront costs and no reward, without changing the live performance", () => {
  const d = details();
  d.state = beginBusking(d.state, cell, info, survival, economy);
  const save = createSave(d, 1);
  assert.equal(save.state.performancePending, null);
  assert.equal(save.state.walletCents, d.state.walletCents);
  assert.equal(save.state.elapsedMinutes, 30);
  assert.equal(save.state.performances, 1);
  assert.ok(d.state.performancePending);
  assert.throws(() => settleBusking(save.state, 8), /No active/);
  const won = settleBusking(d.state, 8);
  const completedSave = createSave({ ...d, state: won }, 2);
  assert.equal(completedSave.state.walletCents, won.walletCents);
  assert.equal(completedSave.state.performances, 1);
});

test("terminal reunion and exhaustion states resume rather than revive", () => {
  const d = details();
  for (let i = 0; i < 3; i++) {
    const target = trailTarget(d.state);
    d.state = interviewTrail({ ...d.state, col: target.col, row: target.row }, info, survival, economy);
  }
  assert.equal(createSave(d, 1).state.ended, "reunion");
  const hungry = details();
  hungry.state = { ...hungry.state, reserveKcal: 0, ended: "hunger" };
  assert.equal(createSave(hungry, 1).state.ended, "hunger");
});

test("corrupt, incompatible and invalid saves are rejected without deleting original data", () => {
  const valid = createSave(details(), 1);
  const mutations = [
    s => { s.version = 999; }, s => { s.state.col = 1.5; },
    s => { s.state.walletCents = -1; }, s => { s.state.walletCents = 2.5; },
    s => { s.state.fatigue = 101; }, s => { s.state.reserveKcal = 99999; },
    s => { s.state.dailyCard = "unknown"; }, s => { s.state.tarotDay = "wrong"; },
    s => { s.state.character.bodyMassKg = 0; }, s => { s.state.startedAt = 1e30; },
    s => { s.state.trail.index = 3; }, s => { s.state.trail.stages[1] = s.state.trail.stages[0]; },
    s => { s.state.lastMove = {}; }, s => { s.survival.sleep_hours = 0; },
    s => { s.economy.version = 99; }, s => { s.state.reserveKcal = 0; },
    s => { s.savedAt = 0; }, s => { s.state.trail.stages[0].col = -1; },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(valid);
    mutate(copy);
    assert.throws(() => validateSave(copy));
  }
  const memory = storage(), store = createJourneyStore(memory);
  memory.setItem("arcane-journey-v1:firmi", "{broken");
  assert.throws(() => store.read("firmi"));
  assert.equal(memory.getItem("arcane-journey-v1:firmi"), "{broken");
  assert.equal(store.write(details()).version, 1);
  assert.notEqual(mapIdentity(map), mapIdentity({ ...map, cellSizeMeters: 50 }));
});

test("quota/storage errors surface and stale tabs cannot overwrite a newer journey", () => {
  const memory = storage(), a = createJourneyStore(memory), b = createJourneyStore(memory);
  a.read("firmi");
  b.read("firmi");
  const first = a.write(details());
  assert.throws(() => b.write(details()), /another tab/);
  assert.deepEqual(a.read("firmi"), first);
  const blocked = createJourneyStore({
    getItem: () => null, setItem() { throw new Error("Quota exceeded"); },
  });
  blocked.read("firmi");
  assert.throws(() => blocked.write(details()), /Quota/);
  assert.throws(() => createJourneyStore({ getItem() { throw Error("Denied"); } }).read("firmi"), /Denied/);
  assert.throws(() => createJourneyStore(memory).write(details()), /another tab/);
});
