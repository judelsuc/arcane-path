import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mainArtifactRequest } from "../main-artifacts.mjs";
import { startSurvival, walkSurvival } from "../survival.mjs";
import { startEconomy, finishAction, sleepEconomy } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { LORE_ITEMS } from "../lore-catalogue.mjs";
import { artifactCandidates } from "../lore-engine.mjs";
import { validateArtifactInventory } from "../artifact-inventory.mjs";

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const map = json("../public/map.json"), survival = json("../public/config.json").survival;
const economy = json("../public/economy.json"), journey = "a".repeat(32);
function input() {
  const startedAt = Date.UTC(2026, 9, 19, 12);
  const state = { ...startEconomy(startSurvival(14, 10, startedAt, "balanced", survival), economy, () => 0),
    trail: createTrail(map, 14, 10, () => 0),
    serverJourney: { id: journey, seed: "a".repeat(8), contentVersion: "b".repeat(64),
      createdAt: new Date(startedAt).toISOString() } };
  return { map, journey, genesis: { state, region: "firmi", economy, survival }, snapshot: state,
    nowMillis: startedAt, worldMinutes: 0,
    instances: LORE_ITEMS.map(item => ({ id: item.id, col: 14, row: 10, town: "Firmi",
      marker: `virtual:${item.id}`, generation: 1, owner: null, placement: null, cooldownUntil: 0 })) };
}

test("main compass accounts for ordinary walking and never mutates the canonical runtime", async () => {
  const request = input(), first = await mainArtifactRequest(request);
  first.runtime.state.lore.compass = { stage: first.runtime.state.trail.index, remainingMinutes: 180, signal: null };
  const before = first.runtime.state;
  const moved = walkSurvival(before, 0, 1, map.rows[10][14], map.rows[11][14], survival);
  const snapshot = finishAction(before, moved, { terrain: "place", latitude: 44.54, longitude: 2.3 },
    economy, { survival, random: () => 1 });
  const result = await mainArtifactRequest({ ...request, runtime: first.runtime, snapshot });
  assert.equal(result.runtime.state.lore.compass.remainingMinutes, 180 - snapshot.lastMove.minutes);
  assert.equal(result.runtime.state.lore.compassReceipts[0].minutes, snapshot.lastMove.minutes);
  assert.equal(first.runtime.state.lore.compass.remainingMinutes, 180);
  assert.equal(result.runtime.state.artifactRevision, 2);
});

test("Moon delivers its canonical truth after ordinary main-game sleep, once", async () => {
  const request = input(), first = await mainArtifactRequest(request);
  const clue = artifactCandidates(first.runtime.state, first.instances, map)
    .find(candidate => candidate.clue.targetId === "chariot").clue;
  first.runtime.state.lore.moon = { expiresMinutes: 1440, clues: [clue] };
  const snapshot = sleepEconomy(first.runtime.state, map.rows[10][14],
    { terrain: "place", latitude: 44.54, longitude: 2.3 }, null, survival, economy, { minutes: 60 });
  const second = await mainArtifactRequest({ ...request, runtime: first.runtime, snapshot });
  assert.equal(second.runtime.state.lore.moon, null);
  assert.equal(second.runtime.state.lore.moonReceipts.length, 1);
  assert.ok(second.runtime.state.discovery.entries.some(entry => entry.targetId === "chariot"));
  const third = await mainArtifactRequest({ ...request, runtime: second.runtime, snapshot: second.runtime.state });
  assert.equal(third.runtime.state.lore.moonReceipts.length, 1);
});

test("ordinary and magical inventory share packing cells and a weight limit", async () => {
  let request = input(), result;
  for (const action of [{ type: "inquire", id: "hermit" }, { type: "claim", id: "hermit" }]) {
    result = await mainArtifactRequest({ ...request, action });
    request = { ...request, runtime: result.runtime, snapshot: result.runtime.state, instances: result.instances };
  }
  const state = structuredClone(result.runtime.state);
  validateArtifactInventory(state);
  state.lore.inventory[0].placement = { ...state.equipment.placements[0] };
  assert.throws(() => validateArtifactInventory(state));
  state.lore.inventory[0].placement = result.runtime.state.lore.inventory[0].placement;
  state.lore.carriedGrams++;
  assert.throws(() => validateArtifactInventory(state), /weight/);
});
