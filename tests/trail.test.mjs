import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTrail, trailTarget, atTrailTarget, witnessFacts, interviewTrail } from "../trail.mjs";
import { startEconomy } from "../economy.mjs";
import { startSurvival } from "../survival.mjs";

const survival = JSON.parse(readFileSync(new URL("../public/config.json", import.meta.url))).survival;
const economy = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));
const maps = ["../public/map.json", "../public/maps/paris.json",
  "../public/maps/alps.json", "../public/maps/tahiti.json"].map(file =>
  JSON.parse(readFileSync(new URL(file, import.meta.url))));
const info = { latitude: 44.54, longitude: 2.3 };
const start = () => {
  const state = startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 17, 12),
    "balanced", survival), economy, () => 0);
  return { ...state, trail: createTrail(maps[0], state.col, state.row, () => 0) };
};

test("all four real maps support ten distinct local stages using existing named OSM objects", () => {
  for (const map of maps) {
    for (let seed = 0; seed < 12; seed++) {
      const col = Math.floor(map.width / 2), row = Math.floor(map.height / 2);
      const trail = createTrail(map, col, row, () => (seed + 0.5) / 12);
      assert.equal(trail.stages.length, 10);
      assert.equal(new Set(trail.stages.map(s => `${s.col},${s.row}`)).size, 10);
      for (const stage of trail.stages) {
        const cell = map.rows[stage.row][stage.col];
        assert.ok([...(cell.settlements ?? []), ...(cell.pois ?? [])].some(p =>
          p.osmId === stage.osmId && p.name === stage.name));
        assert.match(stage.witnessId, /^fictional-/);
      }
    }
  }
});

test("generation is deterministic for fixed draws and fails explicitly with insufficient map locations", () => {
  assert.deepEqual(createTrail(maps[0], 14, 10, () => 0.5),
    createTrail(maps[0], 14, 10, () => 0.5));
  assert.throws(() => createTrail({ width: 1, height: 1, rows: [[{ terrain: "plain" }]] }, 0, 0), /10 distinct/);
  assert.throws(() => createTrail(maps[0], 14, 10, () => 1), /draw/);
});

test("witness sheets constrain dialogue to the parent, current place and next real landmark", () => {
  const state = start();
  const facts = witnessFacts(state);
  assert.equal(facts.parentName, state.trail.parentName);
  assert.equal(facts.place, trailTarget(state).name);
  assert.equal(facts.next.name, state.trail.stages[1].name);
  assert.equal(facts.fictional, true);
  assert.equal(atTrailTarget(state), false);
  assert.throws(() => interviewTrail(state, info, survival, economy), /player's position/);
});

test("ten ordered encounters consume exactly five minutes each and only the last ends in reunion", () => {
  let state = start();
  for (let index = 0; index < 10; index++) {
    const target = trailTarget(state);
    state = { ...state, col: target.col, row: target.row };
    const previous = state;
    state = interviewTrail(state, info, survival, economy);
    assert.equal(state.trail.index, index + 1);
    assert.equal(state.trail.history.length, index + 1);
    assert.equal(state.elapsedMinutes - previous.elapsedMinutes, 5);
    assert.ok(state.reserveKcal < previous.reserveKcal);
    assert.equal(previous.trail.index, index);
    assert.equal(state.walletCents, previous.walletCents);
    assert.equal(state.ended, index === 9 ? "reunion" : null);
  }
  assert.equal(state.ended, "reunion");
  assert.equal(state.trail.completed, true);
  assert.equal(trailTarget(state), null);
  assert.throws(() => interviewTrail(state, info, survival, economy), /No new/);
});

test("revisiting a witness cannot advance twice and survival failure takes priority over reunion", () => {
  const state = start();
  const first = trailTarget(state);
  const next = interviewTrail({ ...state, col: first.col, row: first.row }, info, survival, economy);
  assert.throws(() => interviewTrail(next, info, survival, economy), /No new/);
  const last = state.trail.stages[2];
  const hungry = interviewTrail({ ...state, col: last.col, row: last.row, reserveKcal: 1,
    trail: { ...state.trail, index: 2 } }, info, survival, economy);
  assert.equal(hungry.ended, "hunger");
  assert.equal(hungry.trail.completed, false);
  assert.equal(hungry.trail.index, 2);
});
