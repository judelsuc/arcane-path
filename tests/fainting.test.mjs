import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startSurvival, walkSurvival } from "../survival.mjs";
import { startEconomy, finishAction, faintingRisk, didFaint, validateFainting } from "../economy.mjs";
import { createSave, validateSave, createJourneyStore } from "../journey-save.mjs";
import { createTrail } from "../trail.mjs";
import { trailClue } from "../trail-actions.mjs";
import { survivalChoice } from "../survival-choices.mjs";
import { beginBusking } from "../music.mjs";
import { createNeedsNotices } from "../needs-notices.mjs";

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const survival = json("../public/config.json").survival;
const economy = json("../public/economy.json");
const map = json("../public/map.json");
const info = { terrain: "place", latitude: 44.54, longitude: 2.3 };
const cell = { terrain: "place", elevationMeters: 100 };
const start = () => ({ ...startEconomy(startSurvival(12, 12,
  Date.UTC(2026, 9, 17, 12), "balanced", survival), economy, () => 0),
  trail: createTrail(map, 12, 12, () => 0), fatigue: 99.99, awakeHours: 20 });
const collapse = state => finishAction(state,
  walkSurvival(state, 1, 0, cell, { ...cell, elevationMeters: 400 }, survival),
  info, economy, { survival, random: () => 0 });
const details = state => ({ region: "firmi", map, state, survival, economy });

test("100 fatigue collapses once at the destination; eight hours, exactly 40 fatigue and normal unconscious metabolism", () => {
  const state = start(), snapshot = structuredClone(state);
  const moved = walkSurvival(state, 1, 0, cell, { ...cell, elevationMeters: 400 }, survival);
  const next = collapse(state);
  assert.equal(next.ended, null);
  assert.equal(next.fatigue, 40);
  assert.equal(next.faints, 1);
  assert.equal(next.col, moved.col);
  assert.equal(next.row, moved.row);
  assert.equal(next.elapsedMinutes, moved.elapsedMinutes + 480);
  assert.equal(next.reserveKcal, moved.reserveKcal - 8 * 40 * survival.sleep_metabolism_factor);
  assert.equal(next.energyKcal, moved.energyKcal + 8 * 40 * survival.sleep_metabolism_factor);
  assert.equal(next.awakeHours, Math.max(0, moved.awakeHours - 8 * survival.sleep_recovery_per_hour));
  assert.equal(next.sleeps, state.sleeps);
  assert.equal(next.meals, state.meals);
  assert.equal(next.lastMove, null);
  assert.equal(didFaint(state, next), true);
  assert.deepEqual(state, snapshot);
  const walked = finishAction(next, walkSurvival(next, 1, 0, cell, cell, survival),
    info, economy, { survival });
  assert.equal(walked.faints, 1);
  assert.equal(didFaint(next, walked), false);
  assert.ok(walked.elapsedMinutes - next.elapsedMinutes < 20);
});

test("hunger can kill during unconsciousness; hunger already fatal never grants recovery, and old ended saves stay ended", () => {
  const starved = collapse({ ...start(), reserveKcal: 100, health: 5 });
  assert.equal(starved.ended, "health");
  assert.equal(starved.faints, 1);
  assert.equal(starved.reserveKcal, 0);
  const fatal = collapse({ ...start(), reserveKcal: 1, health: 0.01 });
  assert.equal(fatal.ended, "health");
  assert.equal(fatal.faints, undefined);
  assert.ok(fatal.elapsedMinutes < 480);
  assert.throws(() => collapse({ ...start(), ended: "fatigue" }), /ended/);
  const oldSave = createSave(details({ ...start(), fatigue: 100, ended: "fatigue" }), 1);
  assert.equal(validateSave(oldSave).state.ended, "fatigue");
});

test("robbery varies by location and both tarot cards; deterministic outcomes cannot reroll on replay", () => {
  const state = start();
  assert.ok(faintingRisk(state, info, economy) > faintingRisk(state, { ...info, terrain: "forest" }, economy));
  assert.ok(faintingRisk(state, info, economy, true) < faintingRisk(state, info, economy));
  const low = economy.tarot.reduce((a, b) => a.nightRisk < b.nightRisk ? a : b).id;
  const high = economy.tarot.reduce((a, b) => a.nightRisk > b.nightRisk ? a : b).id;
  const chance = (birthCard, dailyCard) => faintingRisk({ ...state, birthCard, dailyCard }, info, economy);
  assert.ok(chance(high, low) > chance(low, low));
  assert.ok(chance(low, high) > chance(low, low));
  const outcomes = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const before = { ...state, startedAt: state.startedAt + seed * 1000, walletCents: 10001 };
    const next = collapse(before);
    assert.deepEqual(collapse(structuredClone(before)), next);
    outcomes.add(next.lastFaint.robbed);
    assert.equal(next.walletCents, before.walletCents - next.lastFaint.stolenCents);
    if (next.lastFaint.robbed) {
      assert.ok(next.lastFaint.stolenCents >= Math.ceil(before.walletCents * 0.25));
      assert.ok(next.lastFaint.stolenCents <= Math.floor(before.walletCents * 0.5));
    } else assert.equal(next.lastFaint.stolenCents, 0);
  }
  assert.deepEqual(outcomes, new Set([false, true]));
  for (const walletCents of [0, 1, 2, 3]) {
    const next = collapse({ ...state, walletCents });
    validateFainting(next);
    assert.ok(next.walletCents >= 0);
    assert.ok(next.lastFaint.stolenCents <= Math.floor(walletCents / 2));
  }
});

test("night exposure is counted during unconsciousness; final fatigue is 40 and tarot follows the final UTC date", () => {
  const state = { ...start(), startedAt: Date.UTC(2026, 9, 17, 23) };
  const next = collapse(state);
  assert.equal(next.fatigue, 40);
  assert.ok(next.outdoorNightMinutes > 300);
  assert.equal(next.tarotDay, "2026-10-18");
  assert.equal(next.dailyTarotSeenDay, "2026-10-17");
  assert.deepEqual(validateSave(createSave(details(next), 1)).state, next);
});

test("fainting interrupts rewards, clue progression and musical performance rather than resuming them after recovery", () => {
  const state = start();
  const begged = survivalChoice(state, "beg", cell, info, survival, economy, () => 0.99);
  assert.equal(begged.lastSurvivalChoice.outcome, "fainted");
  assert.equal(begged.lastSurvivalChoice.moneyCents, 0);
  assert.equal(begged.lastSurvivalChoice.foodKcal, 0);
  assert.deepEqual(validateSave(createSave(details(begged), 1)).state, begged);
  const music = beginBusking(state, cell, info, survival, economy);
  assert.equal(music.performancePending, null);
  assert.equal(music.faints, 1);
  const origin = state.trail.stages[0];
  const stages = Array.from({ length: 10 }, (_, i) => ({
    ...origin, col: 12 + i, row: 12, name: `Stop ${i}`, placeType: "town",
    osmId: `node/${i + 1}`, latitude: info.latitude + (i + 1) * 0.3, longitude: info.longitude,
    legMeters: 33358, sourceUrl: "https://www.openstreetmap.org/", retrievedAt: "2026-10-17",
    witnessId: `fictional-traveler-${i + 1}`,
  }));
  const trailState = { ...state, trail: { ...state.trail, version: 2, stages } };
  const clue = trailClue(trailState, "discuss", cell, info, survival, economy);
  assert.equal(clue.faints, 1);
  assert.equal(clue.trail.index, 0);
  assert.equal(clue.trail.history.length, 0);
});

test("collapse state survives restart exactly and malformed histories fail without modifying the saved data", () => {
  const next = collapse(start()), data = new Map();
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const store = createJourneyStore(storage);
  store.read("firmi");
  store.write(details(next));
  assert.deepEqual(createJourneyStore(storage).read("firmi").state, next);
  const saved = createSave(details(next), 1);
  for (const change of [
    s => { delete s.faints; }, s => { delete s.lastFaint; }, s => { s.faints = 0; },
    s => { s.lastFaint.finishedMinutes++; }, s => { s.lastFaint.stolenCents = -1; },
    s => { s.lastFaint.col = 100000; }, s => { s.lastFaint.chance = 2; },
    s => { s.lastFaint.robbed = false; s.lastFaint.stolenCents = 1; },
  ]) {
    const invalid = structuredClone(saved);
    change(invalid.state);
    assert.throws(() => validateSave(invalid), /fainting/);
  }
  assert.deepEqual(createJourneyStore(storage).read("firmi").state, next);
});

test("fainting notice takes priority over hunger warning and displays each new collapse once", () => {
  const notices = createNeedsNotices(), next = collapse(start());
  assert.equal(notices.pending(next, survival), "fainted");
  notices.shown("fainted", next);
  assert.equal(notices.pending(next, survival), null);
  assert.equal(notices.pending({ ...next, faints: 2 }, survival), "fainted");
  assert.equal(notices.pending({ ...next, ended: "hunger" }, survival), "hunger");
});
