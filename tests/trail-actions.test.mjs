import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { trailClue, clueActions, CLUE_ACTIONS } from "../trail-actions.mjs";
import { interviewTrail } from "../trail.mjs";

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const survival = json("../public/config.json").survival;
const economy = json("../public/economy.json");
const map = json("../public/map.json");
const cell = { terrain: "place", countryCodes: ["FR"] };
const info = { latitude: 44.54, longitude: 2.3 };
function state() {
  const step = 45000 / 6371008.8 * 180 / Math.PI / Math.cos(info.latitude * Math.PI / 180);
  const origin = { ...info, col: 14, row: 10 };
  const stages = Array.from({ length: 10 }, (_, i) => ({
    ...origin, col: -166 - 180 * i, longitude: info.longitude - (i + 1) * step,
    name: `Town ${i + 1}`, osmId: `node/${i + 1}`, placeType: "town", legMeters: 45000,
    sourceUrl: "https://overpass-api.de/api/interpreter", retrievedAt: "2026-10-17T12:00:00Z",
    witnessId: `fictional-traveler-${i + 1}`,
  }));
  return { ...startEconomy(startSurvival(stages[0].col, stages[0].row,
    Date.UTC(2026, 9, 17, 12), "balanced", survival), economy, () => 0),
  trail: { version: 2, origin, stages, index: 0, history: [], parentName: "Camille", completed: false } };
}
const save = s => createSave({ region: "firmi", map, state: s, survival, economy }, 1);

test("each planned cell offers four varied clues, other cells cannot advance the story", () => {
  const s = state();
  assert.equal(clueActions(s).length, 4);
  assert.deepEqual(clueActions({ ...s, col: s.col + 1 }), []);
  assert.throws(() => trailClue({ ...s, col: s.col + 1 }, "photo", cell, info, survival, economy), /unavailable/);
  assert.throws(() => interviewTrail(s, info, survival, economy), /Choose a clue/);
});

test("clue forms consume exact time, fatigue, extra energy and paid-note money, once per stop", () => {
  for (const kind of ["discuss", "photo", "letter", "buy", "search", "guestbook", "ticket"]) {
    const s = state();
    const index = ["search", "guestbook"].includes(kind) ? 1 : kind === "ticket" ? 2 : 0;
    s.trail.index = index;
    Object.assign(s, { col: s.trail.stages[index].col, row: s.trail.stages[index].row });
    // History is not tested here; save tests below exercise complete journeys.
    const result = trailClue(s, kind, cell, info, survival, economy);
    assert.equal(result.elapsedMinutes - s.elapsedMinutes, CLUE_ACTIONS[kind].minutes);
    assert.ok(result.energyKcal - s.energyKcal > CLUE_ACTIONS[kind].kcal);
    assert.ok(result.reserveKcal < s.reserveKcal);
    assert.ok(result.fatigue >= s.fatigue + CLUE_ACTIONS[kind].fatigue);
    assert.equal(result.trail.index, index + 1);
    assert.equal(result.trail.discovery.kind, kind);
    assert.equal(result.trail.discovery.nextName, s.trail.stages[index + 1].name);
    assert.equal(result.walletCents < s.walletCents, kind === "buy");
    assert.throws(() => trailClue(result, kind, cell, info, survival, economy), /unavailable/);
  }
});

test("POI-only clues hide town until paid-in-time directions; pending and complete saves roundtrip", () => {
  const s = state();
  s.trail.stages[1].venue = { name: "Cafe des Voyageurs", osmId: "node/500",
    sourceUrl: "https://overpass-api.de/api/interpreter" };
  const found = trailClue(s, "photo", cell, info, survival, economy);
  assert.equal(found.trail.index, 0);
  assert.equal(found.trail.discovery.pending, true);
  assert.deepEqual(clueActions(found), ["directions"]);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save(found)))).state, found);
  const next = trailClue(found, "directions", cell, info, survival, economy);
  assert.equal(next.elapsedMinutes - found.elapsedMinutes, 15);
  assert.equal(next.trail.index, 1);
  assert.equal(next.trail.discovery.pending, false);
  assert.equal(next.trail.history[0].usedDirections, true);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save(next)))).state, next);
  const bad = structuredClone(next);
  bad.trail.discovery.nextName = "Incorrect";
  assert.throws(() => save(bad));
});

test("exhaustion and insufficient money never grant a clue, final discovery completes reunion", () => {
  const s = state();
  assert.throws(() => trailClue({ ...s, walletCents: 0 }, "buy", cell, info, survival, economy), /Insufficient/);
  const exhausted = trailClue({ ...s, reserveKcal: 1 }, "photo", cell, info, survival, economy);
  assert.equal(exhausted.ended, "hunger");
  assert.equal(exhausted.trail.index, 0);
  assert.equal(exhausted.trail.discovery, undefined);
  let current = s;
  for (let i = 0; i < 10; i++) {
    const stage = current.trail.stages[i];
    current = { ...current, col: stage.col, row: stage.row, reserveKcal: 1800, fatigue: 0, awakeHours: 0 };
    current = trailClue(current, clueActions(current)[0], cell, info, survival, economy);
    assert.equal(current.trail.index, i + 1);
    save(current);
  }
  assert.equal(current.ended, "reunion");
  assert.deepEqual(clueActions(current), []);
});
