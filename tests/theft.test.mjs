import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { THEFT, createTheftGame, advanceTheft, theftPosition } from "../theft.mjs";
import { beginTheft, settleTheft } from "../survival-choices.mjs";
import { startEconomy } from "../economy.mjs";
import { startSurvival } from "../survival.mjs";
import { beginPressures, sympathy, socialFailureChance } from "../pressures.mjs";
import { beginBusking, settleBusking, musicMistakeLimit } from "../music.mjs";
import { outcomeReputation } from "../practice.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { createTrail } from "../trail.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const economy = json("../public/economy.json"), survival = json("../public/config.json").survival;
const map = json("../public/map.json");
const cell = { terrain: "place", countryCodes: ["FR"], pois: [{ tags: { shop: "bakery" } }] };
const info = { terrain: "place", latitude: 44.54, longitude: 2.3 };
const start = () => beginPressures({ ...startEconomy(startSurvival(14, 10,
  Date.UTC(2026, 9, 17, 12), "balanced", survival), economy, () => 0),
  reserveKcal: 900, trail: createTrail(map, 14, 10, () => 0) }, economy);
const begin = s => beginTheft(s, cell, info, survival, economy, () => 0.99);
const settle = (s, outcome) => settleTheft(s, outcome, info, survival, economy, () => 0.99);

test("single timing grab has exact success boundaries, both directions and a hard deadline", () => {
  const game = createTheftGame(0, () => 0.5);
  for (const now of [360, 540, 1260, 1440]) assert.equal(advanceTheft(game, now, true).outcome, "success");
  for (const now of [359.9, 540.1, 1259.9, 1440.1, 0, 900]) {
    assert.equal(advanceTheft(game, now, true).outcome, "caught");
  }
  assert.equal(advanceTheft(game, THEFT.durationMs - 1).outcome, null);
  assert.equal(advanceTheft(game, THEFT.durationMs, true).outcome, "caught");
  const done = advanceTheft(game, 450, true);
  assert.equal(advanceTheft(done, 600, true), done);
  assert.equal(game.outcome, null);
  assert.equal(theftPosition(game, 900), 1);
  assert.throws(() => createTheftGame(NaN), /clock/);
  assert.throws(() => advanceTheft(done, 200), /clock/);
});

test("target position and width vary between attempts, stay bounded and remain fixed during a run", () => {
  const narrow = createTheftGame(0, () => 0);
  const wide = createTheftGame(0, () => 0.999999);
  assert.notEqual(narrow.targetStart, wide.targetStart);
  assert.notEqual(narrow.targetEnd - narrow.targetStart, wide.targetEnd - wide.targetStart);
  for (const game of [narrow, wide, createTheftGame(0, () => 0.5)]) {
    const width = game.targetEnd - game.targetStart;
    assert.ok(width >= THEFT.minTargetWidth - 1e-12 && width <= THEFT.maxTargetWidth);
    assert.ok(game.targetStart >= THEFT.targetMargin);
    assert.ok(game.targetEnd <= 1 - THEFT.targetMargin);
    const next = advanceTheft(game, 100);
    assert.equal(next.targetStart, game.targetStart);
    assert.equal(next.targetEnd, game.targetEnd);
    const half = THEFT.cycleMs / 2;
    for (const position of [game.targetStart + 1e-8, game.targetEnd - 1e-8]) {
      assert.equal(advanceTheft(game, position * half, true).outcome, "success");
      assert.equal(advanceTheft(game, THEFT.cycleMs - position * half, true).outcome, "success");
    }
    for (const position of [game.targetStart - 1e-8, game.targetEnd + 1e-8]) {
      assert.equal(advanceTheft(game, position * half, true).outcome, "caught");
    }
  }
  for (const draw of [-1, 1, NaN, Infinity]) {
    assert.throws(() => createTheftGame(0, () => draw), /target draw/);
    let count = 0;
    assert.throws(() => createTheftGame(0, () => count++ ? draw : 0.5), /target draw/);
  }
});

test("hard sandbox difficulty narrows the target and speeds the cursor without changing settlement rules", () => {
  for (const draw of [0, 0.5, 0.999999]) {
    const hard = createTheftGame(0, () => draw, "hard");
    const normal = createTheftGame(0, () => draw);
    const width = hard.targetEnd - hard.targetStart;
    assert.ok(width >= 0.07 - 1e-12 && width <= 0.16);
    assert.equal(hard.cycleMs, 1200);
    assert.equal(normal.cycleMs, 1800);
    assert.equal(theftPosition(hard, 600), 1);
    assert.equal(theftPosition(normal, 600), 2 / 3);
    const midpoint = (hard.targetStart + hard.targetEnd) / 2;
    assert.equal(advanceTheft(hard, midpoint * 600, true).outcome, "success");
    assert.equal(advanceTheft(hard, 9000).outcome, "caught");
  }
  assert.throws(() => createTheftGame(0, () => 0.5, "unknown"), /difficulty/);
});

test("Devil adds a narrower gold timing target; one grab awards modest extra game food", () => {
  const game = createTheftGame(0, () => 0.5, "normal", { resonance: true });
  assert.equal(game.resonance, true);
  assert.ok(game.bonusStart > game.targetStart);
  assert.ok(game.bonusEnd < game.targetEnd);
  assert.ok(game.bonusEnd - game.bonusStart < game.targetEnd - game.targetStart);
  const goldMid = (game.bonusStart + game.bonusEnd) / 2;
  assert.equal(advanceTheft(game, goldMid * THEFT.cycleMs / 2, true).outcome, "bonus");
  const greenOnly = (game.targetStart + game.bonusStart) / 2;
  assert.equal(advanceTheft(game, greenOnly * THEFT.cycleMs / 2, true).outcome, "success");
  const pending = beginTheft({ ...start(), reserveKcal: 100, birthCard: "devil", dailyCard: "fool" },
    cell, info, survival, economy, () => 0.99);
  assert.equal(pending.theftPending.resonance, true);
  const green = settleTheft(pending, "success", info, survival, economy, () => 0.99);
  assert.equal(green.lastSurvivalChoice.foodKcal, 990);
  const bonus = settleTheft(pending, "bonus", info, survival, economy, () => 0.99);
  assert.equal(bonus.lastSurvivalChoice.foodKcal, 1089);
  assert.equal(bonus.walletCents, pending.walletCents);
  const dailyMatch = beginTheft({ ...start(), reserveKcal: 100, birthCard: "fool", dailyCard: "devil" },
    cell, info, survival, economy, () => 0.99);
  assert.equal(settleTheft(dailyMatch, "success", info, survival, economy, () => 0.99)
    .lastSurvivalChoice.foodKcal, 990);
  const journeyMatch = beginTheft({ ...start(), reserveKcal: 100, birthCard: "fool", dailyCard: "fool" },
    cell, info, survival, economy, () => 0.99, { journeyCard: "devil" });
  assert.equal(settleTheft(journeyMatch, "success", info, survival, economy, () => 0.99)
    .lastSurvivalChoice.foodKcal, 990);
  const normal = beginTheft({ ...start(), birthCard: "fool", dailyCard: "fool" },
    cell, info, survival, economy, () => 0.99);
  assert.equal(normal.theftPending.resonance, false);
  assert.equal(settleTheft(normal, "success", info, survival, economy, () => 0.99)
    .lastSurvivalChoice.foodKcal, 900);
  assert.throws(() => settleTheft(normal, "bonus", info, survival, economy, () => 0.99), /outcome/);
});

test("theft pays costs up front, successful timing feeds once and failure detains without extra random chance", () => {
  const initial = start(), pending = begin(initial);
  assert.equal(pending.elapsedMinutes - initial.elapsedMinutes, 10);
  assert.equal(pending.fatigue - initial.fatigue, 3);
  assert.equal(pending.pressures.reputation[0].value, -15);
  assert.ok(pending.pressures.vigilance > initial.pressures.vigilance);
  const won = settle(pending, "success");
  assert.equal(won.lastSurvivalChoice.foodKcal, 900);
  assert.equal(won.lastSurvivalChoice.minutes, 10);
  assert.equal(won.walletCents, initial.walletCents);
  assert.equal(won.choiceCounts.steal, 1);
  assert.equal(won.theftPending, null);
  assert.throws(() => settle(won, "success"), /No active/);
  const caught = settle(pending, "caught");
  assert.equal(caught.lastSurvivalChoice.outcome, "detained");
  assert.equal(caught.lastSurvivalChoice.detentionMinutes, 360);
  assert.equal(caught.lastSurvivalChoice.minutes, 370);
  assert.equal(caught.pressures.reputation[0].value, -20);
  assert.equal(caught.walletCents, initial.walletCents);
  assert.equal(caught.col, initial.col);
  assert.equal(caught.row, initial.row);
  assert.throws(() => settle(pending, "invalid"), /outcome/);
  assert.throws(() => begin(pending), /already active/);
  assert.throws(() => beginTheft(initial, { terrain: "place" }, info, survival, economy), /shop/);
});

test("cancellation, reload and interrupted needs cannot yield stolen food or replay a pending result", () => {
  const pending = begin(start()), cancelled = settle(pending, "cancelled");
  assert.equal(cancelled.reserveKcal, pending.reserveKcal);
  assert.deepEqual(cancelled.pressures, pending.pressures);
  assert.equal(cancelled.lastSurvivalChoice.outcome, "nothing");
  const save = createSave({ region: "firmi", map, state: pending, survival, economy }, 1);
  assert.deepEqual(save.state, cancelled);
  assert.ok(pending.theftPending);
  const invalid = structuredClone(save);
  invalid.state.theftPending = {};
  assert.throws(() => validateSave(invalid));
  for (const changed of [{ reserveKcal: 1, health: 0.01 }, { fatigue: 99 }]) {
    const interrupted = begin({ ...start(), ...changed });
    assert.ok(!interrupted.theftPending);
    assert.equal(interrupted.lastSurvivalChoice.foodKcal, 0);
    assert.throws(() => settle(interrupted, "success"), /No active/);
  }
});

test("bad music lowers local sympathy, social success and next pay; good music improves them", () => {
  const pending = beginBusking(start(), cell, info, survival, economy);
  const bad = settleBusking(pending, 1), good = settleBusking(pending, 24);
  assert.equal(bad.pressures.reputation[0].value, -3);
  assert.equal(good.pressures.reputation[0].value, 2);
  assert.ok(sympathy(bad) < sympathy(pending));
  assert.ok(socialFailureChance(0.4, bad) > socialFailureChance(0.4, pending));
  assert.ok(beginBusking(bad, cell, info, survival, economy).performancePending.maxRewardCents <
    beginBusking(good, cell, info, survival, economy).performancePending.maxRewardCents);
  assert.equal(settleBusking(pending, 24, musicMistakeLimit(pending)).pressures.reputation[0].value, -3);
  assert.deepEqual(settleBusking(pending, 24, 0, true).pressures, pending.pressures);
  for (const [score, expected] of [[0, -3], [39, -3], [40, 0], [59, 0], [60, 2], [100, 2]]) {
    assert.equal(outcomeReputation(score, 100), expected);
  }
  assert.throws(() => outcomeReputation(1, 0));
  assert.throws(() => outcomeReputation(-1, 10));
});
