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

test("perfect sequence hits all 24 notes over three irregular loops; rests never score", () => {
  let game = rhythm(0);
  for (let i = 0; i < MUSIC.beats; i++) game = tapRhythm(game, beatTime(game, i));
  assert.equal(game.hits.filter(Boolean).length, 24);
  const empty = rhythm(0);
  for (let loop = 0; loop < 3; loop++) {
    for (const slot of empty.pattern.flatMap((note, slot) => note ? [] : [slot])) {
      assert.equal(tapRhythm(empty, MUSIC.leadMs + (loop * 12 + slot) * MUSIC.intervalMs), empty);
    }
    assert.equal(beatTime(empty, loop * 8), MUSIC.leadMs +
      (loop * 12 + empty.pattern.indexOf(1)) * MUSIC.intervalMs);
  }
  let spam = rhythm(0);
  const first = beatTime(spam, 0);
  for (let i = 0; i < 50; i++) spam = tapRhythm(spam, first + i);
  assert.equal(spam.hits.filter(Boolean).length, 1);
});

test("each performance draws its own eight-note four-rest phrase and retains it throughout all loops", () => {
  const first = rhythm(0, () => 0), second = rhythm(0, () => 0.99);
  assert.notDeepEqual(first.pattern, second.pattern);
  for (const game of [first, second]) {
    assert.equal(game.pattern.length, 12);
    assert.equal(game.pattern.filter(Boolean).length, 8);
    assert.equal(game.pattern.filter(note => !note).length, 4);
    let played = game;
    for (let i = 0; i < MUSIC.beats; i++) played = tapRhythm(played, beatTime(played, i));
    assert.equal(played.pattern, game.pattern);
    assert.equal(played.hits.filter(Boolean).length, 24);
    for (let i = 0; i < 8; i++) {
      assert.equal(beatTime(game, i + 8) - beatTime(game, i), 12 * MUSIC.intervalMs);
    }
  }
  for (const roll of [-1, 1, NaN]) assert.throws(() => rhythm(0, () => roll), /draw/);
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
  for (const hits of [0, 12, 24]) {
    const next = settleBusking(state, hits);
    assert.equal(next.walletCents - state.walletCents, Math.round(1120 * hits / MUSIC.beats));
    assert.equal(next.elapsedMinutes, 30);
    assert.equal(next.performancePending, null);
    assert.throws(() => settleBusking(next, hits), /No active/);
  }
  for (const score of [-1, 25, 2.5]) assert.throws(() => settleBusking(state, score));
});

test("cancelled performance costs remain and exhausted or remote characters cannot earn", () => {
  const next = settleBusking(beginBusking(start(), cell, info, survival, data), 0);
  assert.equal(next.walletCents, start().walletCents);
  assert.equal(next.elapsedMinutes, 30);
  assert.throws(() => beginBusking(start(), { terrain: "forest" }, info, survival, data), /settlement/);
  const exhausted = beginBusking({ ...start(), fatigue: 98 }, cell, info, survival, data);
  assert.equal(exhausted.ended, null);
  assert.equal(exhausted.fatigue, 40);
  assert.equal(exhausted.faints, 1);
  assert.equal(exhausted.performancePending, null);
  assert.throws(() => beginBusking({ ...start(), ended: "hunger" }, cell, info, survival, data), /ended/);
});

test("earning, meals and shelter support three full simulated days without free resources", () => {
  let state = startEconomy(startSurvival(0, 0, Date.UTC(2026, 9, 17, 8),
    "balanced", survival), data, () => 0);
  const hostel = { ...cell, pois: [{ osmId: "node/1", tags: { tourism: "hostel" } }] };
  for (let day = 0; day < 3; day++) {
    for (let i = 0; i < 4; i++) state = settleBusking(beginBusking(state, cell, info, survival, data), MUSIC.beats);
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
