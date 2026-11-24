import test from "node:test";
import assert from "node:assert/strict";
import { PATRONS, resolveResonance, resonanceGain, resonanceResult } from "../arcane-resonance.mjs";

test("all twelve patrons activate through journey or daily card without stacking", () => {
  assert.equal(Object.keys(PATRONS).length, 12);
  assert.equal(new Set(Object.values(PATRONS)).size, 12);
  for (const [game, card] of Object.entries(PATRONS)) {
    assert.equal(resolveResonance(game), false);
    assert.equal(resolveResonance(game, { journeyCard: card }), true);
    assert.equal(resolveResonance(game, { birthCard: card }), true);
    assert.equal(resolveResonance(game, { dailyCard: card }), true);
    assert.equal(resolveResonance(game, { journeyCard: card, dailyCard: card }), true);
    assert.equal(resolveResonance(game, { journeyCard: "fool", dailyCard: "world" }), false);
    assert.equal(resolveResonance(game, { resonance: true }), true);
  }
});

test("gains are exactly x1.1, rounded once in cents, not score or penalties", () => {
  assert.equal(resonanceGain(100, true), 110);
  assert.equal(resonanceGain(105, true), 116);
  assert.equal(resonanceGain(105, false), 105);
  assert.equal(resonanceGain(0, true), 0);
  assert.deepEqual(resonanceResult({ completed: true, score: 7, maxScore: 7 }, true),
    { completed: true, score: 7, maxScore: 7, earningsMultiplier: 1.1 });
  assert.equal(resonanceResult({ completed: false, score: 3 }, true).earningsMultiplier, 1);
  assert.equal(resonanceResult({ completed: true, cancelled: true }, true).earningsMultiplier, 1);
  assert.throws(() => resonanceGain(-1, true), RangeError);
  assert.throws(() => resonanceGain(2.5, true), RangeError);
  assert.throws(() => resonanceGain(Number.MAX_SAFE_INTEGER, true), RangeError);
});

test("invalid game, card and activation are explicit errors", () => {
  assert.throws(() => resolveResonance("unknown"), RangeError);
  assert.throws(() => resolveResonance("market", { dailyCard: "invalid" }), RangeError);
  assert.throws(() => resolveResonance("market", { resonance: "yes" }), TypeError);
});
