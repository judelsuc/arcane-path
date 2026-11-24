import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareClueSearch, searchClueOptions, trailClue, CLUE_ACTIONS } from "../trail-actions.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { createSave, validateSave } from "../journey-save.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const survival = json("../public/config.json").survival, economy = json("../public/economy.json");
const map = json("../public/map.json"), cell = { terrain: "place", countryCodes: ["FR"] };
const info = { latitude: 44.54, longitude: 2.3 };
function start(index = 0) {
  const step = 45000 / 6371008.8 * 180 / Math.PI / Math.cos(info.latitude * Math.PI / 180);
  const stages = Array.from({ length: 10 }, (_, i) => ({
    ...info, col: -166 - i * 180, row: 10, longitude: info.longitude - (i + 1) * step,
    name: `Town ${i + 1}`, osmId: `node/${i + 1}`, placeType: "town", legMeters: 45000,
    sourceUrl: "https://overpass-api.de/api/interpreter", retrievedAt: "2026-10-17T12:00:00Z",
    witnessId: `fictional-traveler-${i + 1}`,
  }));
  const state = startEconomy(startSurvival(stages[index].col, 10,
    Date.UTC(2026, 9, 17, 12), "balanced", survival), economy, () => 0);
  return { ...state, trail: { version: 2, origin: { ...info, col: 14, row: 10 },
    parentName: "Camille", stages, index, history: [], completed: false } };
}

test("one search selects all existing stage clue types at equal random intervals with their original costs", async () => {
  const found = new Set();
  for (const index of [0, 1, 2]) {
    const state = start(index), before = structuredClone(state);
    const options = searchClueOptions(state, cell, info, economy);
    for (let i = 0; i < options.length; i++) {
      const photo = { blob: new Blob(["fixture"], { type: "image/png" }), sourceUrl: "https://example.org/photo" };
      const result = await prepareClueSearch(state, cell, info, economy, async () => photo,
        () => (i + 0.5) / options.length);
      assert.equal(result.kind, options[i]);
      assert.equal(result.photoUnavailable, false);
      assert.equal(Boolean(result.content), result.kind === "photo");
      const next = trailClue(state, result.kind, cell, info, survival, economy);
      assert.equal(next.elapsedMinutes, CLUE_ACTIONS[result.kind].minutes);
      assert.equal(next.trail.discovery.kind, result.kind);
      found.add(result.kind);
    }
    assert.deepEqual(state, before);
  }
  assert.deepEqual([...found].sort(), ["buy", "discuss", "guestbook", "letter", "photo", "search", "ticket"]);
});

test("missing photo is replaced explicitly by a non-photo clue, charging only the fallback", async () => {
  const state = start(), rolls = [0.3, 0.4];
  const result = await prepareClueSearch(state, cell, info, economy, async () => null, () => rolls.shift());
  assert.equal(result.kind, "letter");
  assert.equal(result.photoUnavailable, true);
  assert.equal(state.elapsedMinutes, 0);
  const next = trailClue(state, result.kind, cell, info, survival, economy);
  assert.equal(next.elapsedMinutes, CLUE_ACTIONS.letter.minutes);
  assert.equal(next.trail.discovery.kind, "letter");
  const saved = createSave({ region: "firmi", map, state: next, survival, economy }, 1);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(saved))).state, next);
});

test("photo retrieval finishes before a search can commit and non-photo searches never contact photo services", async () => {
  const state = start(), before = structuredClone(state);
  let resolve;
  const pending = prepareClueSearch(state, cell, info, economy,
    () => new Promise(r => { resolve = r; }), () => 0.3);
  assert.deepEqual(state, before);
  const content = { blob: new Blob(["decoded fixture"]), licenseUrl: "https://example.org/license" };
  resolve(content);
  assert.equal((await pending).content, content);
  let called = false;
  const result = await prepareClueSearch(state, cell, info, economy,
    () => { called = true; throw new Error("Must not fetch"); }, () => 0);
  assert.equal(result.kind, "discuss");
  assert.equal(called, false);
});

test("search excludes unaffordable purchases, pending directions and unavailable encounters", async () => {
  const state = { ...start(), walletCents: 0 };
  assert.deepEqual(searchClueOptions(state, cell, info, economy), ["discuss", "photo", "letter"]);
  for (let i = 0; i < 10; i++) {
    assert.notEqual((await prepareClueSearch(state, cell, info, economy, async () => null, () => i / 10)).kind, "buy");
  }
  for (const unavailable of [{ ...state, col: 999 }, { ...state, ended: "hunger" },
    { ...state, trail: { ...state.trail, discovery: { pending: true } } }]) {
    assert.deepEqual(searchClueOptions(unavailable, cell, info, economy), []);
    await assert.rejects(prepareClueSearch(unavailable, cell, info, economy, async () => null), /available/);
  }
  for (const roll of [-1, 1, NaN]) {
    await assert.rejects(prepareClueSearch(state, cell, info, economy, async () => null, () => roll), /draw/);
  }
});
