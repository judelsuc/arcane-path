import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MUSIC, rhythm, beatTime, rhythmEnd, tapRhythm, beginBusking, settleBusking } from "../music.mjs";
import { startEconomy, buyMeal, sleepEconomy, restEconomy } from "../economy.mjs";
import { startSurvival } from "../survival.mjs";

const data = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));
const survival = JSON.parse(readFileSync(new URL("../public/config.json", import.meta.url))).survival;
const start = () => startEconomy(startSurvival(0, 0, Date.UTC(2026, 9, 17, 12),
  "balanced", survival), data, () => 0);
const cell = { terrain: "place", countryCodes: ["FR"] };
const info = { latitude: 44.54, longitude: 2.3 };

test("rhythm counts each note once, including exact tolerance endpoints", () => {
  const initial = rhythm(1000);
  let game = tapRhythm(initial, beatTime(initial, 0) - MUSIC.windowMs);
  assert.equal(game.hits[0], true);
  assert.equal(initial.hits[0], false);
  assert.equal(tapRhythm(game, beatTime(game, 0)), game);
  game = tapRhythm(game, beatTime(game, 1) + MUSIC.windowMs);
  assert.equal(game.hits[1], true);
  assert.equal(tapRhythm(game, beatTime(game, 2) + MUSIC.windowMs + 0.01), game);
  assert.equal(tapRhythm(game, 0), game);
  assert.equal(tapRhythm(game, rhythmEnd(game) + 1), game);
  assert.throws(() => tapRhythm(game, NaN));
});

test("perfect sequence hits all eight notes; rapid spamming cannot count one note twice", () => {
  let game = rhythm(0);
  for (let i = 0; i < MUSIC.beats; i++) game = tapRhythm(game, beatTime(game, i));
  assert.equal(game.hits.filter(Boolean).length, 8);
  let spam = rhythm(0);
  for (let i = 0; i < 50; i++) spam = tapRhythm(spam, 1500 + i);
  assert.equal(spam.hits.filter(Boolean).length, 1);
});

test("performances cost time, energy and fatigue up front, even with no money", () => {
  const state = { ...start(), walletCents: 0 };
  const next = beginBusking(state, cell, info, survival, data);
  assert.equal(next.elapsedMinutes, 30);
  assert.equal(next.fatigue, 4);
  assert.equal(next.reserveKcal, state.reserveKcal - 20);
  assert.equal(next.walletCents, 0);
  assert.ok(next.performancePending);
  assert.throws(() => beginBusking(next, cell, info, survival, data), /already active/);
});

test("rewards are score-proportional integer cents and settle exactly once", () => {
  const state = beginBusking(start(), cell, info, survival, data);
  for (const hits of [0, 4, 8]) {
    const next = settleBusking(state, hits);
    assert.equal(next.walletCents - state.walletCents, Math.round(1120 * hits / 8));
    assert.equal(next.elapsedMinutes, 30);
    assert.equal(next.performancePending, null);
    assert.throws(() => settleBusking(next, hits), /No active/);
  }
  for (const score of [-1, 9, 2.5]) assert.throws(() => settleBusking(state, score));
});

test("cancelled performance costs remain and exhausted or remote characters cannot earn", () => {
  const next = settleBusking(beginBusking(start(), cell, info, survival, data), 0);
  assert.equal(next.walletCents, start().walletCents);
  assert.equal(next.elapsedMinutes, 30);
  assert.throws(() => beginBusking(start(), { terrain: "forest" }, info, survival, data), /settlement/);
  const exhausted = beginBusking({ ...start(), fatigue: 98 }, cell, info, survival, data);
  assert.equal(exhausted.ended, "fatigue");
  assert.equal(exhausted.performancePending, null);
  assert.throws(() => beginBusking({ ...start(), ended: "hunger" }, cell, info, survival, data), /ended/);
});

test("earning, meals and shelter support three full simulated days without free resources", () => {
  let state = startEconomy(startSurvival(0, 0, Date.UTC(2026, 9, 17, 8),
    "balanced", survival), data, () => 0);
  const hostel = { ...cell, pois: [{ osmId: "node/1", tags: { tourism: "hostel" } }] };
  for (let day = 0; day < 3; day++) {
    for (let i = 0; i < 4; i++) state = settleBusking(beginBusking(state, cell, info, survival, data), 8);
    for (let i = 0; i < 40; i++) state = restEconomy(state, info, { ...survival, rest_minutes: 20 }, data);
    for (let i = 0; i < 2; i++) state = buyMeal(state, cell, info, "aligot", survival, data);
    state = sleepEconomy(state, hostel, info, "node/1", survival, data);
    assert.equal(state.ended, null);
    assert.ok(state.walletCents >= 0);
  }
  assert.equal(state.elapsedMinutes, 3 * 24 * 60);
  assert.equal(state.performances, 12);
  assert.equal(state.meals, 6);
  assert.equal(state.sleeps, 3);
});
