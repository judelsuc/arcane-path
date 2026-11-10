import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { mainArtifactRequest } from "../main-artifacts.mjs";
import { startSurvival, walkSurvival } from "../survival.mjs";
import { startEconomy, finishAction, sleepEconomy } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { LORE_ITEMS } from "../lore-catalogue.mjs";
import { artifactCandidates, infoAt } from "../lore-engine.mjs";
import { validateArtifactInventory } from "../artifact-inventory.mjs";
import { discoveryClueText } from "../discovery-ui.mjs";
import { authoredHint } from "../discovery-authored.mjs";
import { translate } from "../i18n.mjs";
import ARTIFACT_RUMOURS from "../public/artifact-rumours.json" with { type: "json" };
import { LEGEND_SESSION_VERSION, replayInvestigation, settleAdventureCosts,
  validateLegendSessionView, validateLegendActivity, MAX_INVESTIGATION_ACTIONS,
  GENERATED_INVESTIGATION_VERSION, replayLegendSession, DUNGEON_SESSION_VERSION, DUNGEON_FOOD_VERSION,
  LOCAL_PLATFORM_VERSION, LOCAL_DUNGEON_VERSION, LOCAL_INVESTIGATION_VERSION,
  PACED_PLATFORM_VERSION, PACED_INVESTIGATION_VERSION, PACED_DUNGEON_VERSION,
  isPacedLegendSession, isPlatformSession, isDungeonSession,
  createLocalLegendAttempt, stepLocalLegendAttempt, MAX_PLATFORM_PACKETS, MAX_PLATFORM_TICKS } from "../legend-session.mjs";
import { findDungeonRoute, dungeonCompletionActions } from "./helpers/legend-dungeon-route.mjs";
import { platformCompletionActions } from "./helpers/legend-platform-route.mjs";
import { dungeonCosts } from "../adventure-costs.mjs";
import { createEquipment } from "../equipment.mjs";
import { journeyActionBlocker } from "../travel.mjs";
import { createJourneyStore } from "../journey-save.mjs";
import { TREASURE_PLATFORM_VERSION, VARIED_PLATFORM_VERSION, TREASURE_INVESTIGATION_VERSION, TREASURE_DUNGEON_VERSION } from "../legend-session.mjs";
import { variedPlatformRoute } from "./helpers/legend-varied-platform-route.mjs";
import { treasureId, treasureItem, composedReward, awardTreasure, treasureAction } from "../legend-rewards.mjs";

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

const runId = "00000000-0000-4000-8000-000000000001";
const legendDefinition = { townId: "node/42", town: "Firmi", eligible: true, seed: 1, format: "investigation" };
async function startInvestigation(overrides = {}, contentVersion = LEGEND_SESSION_VERSION) {
  const definition = overrides.legendDefinition ?? legendDefinition;
  const request = { ...input(), ...overrides, legendDefinition: definition, requestId: runId,
    action: { type: "legend-start", townId: definition.townId, contentVersion } };
  return { request, result: await mainArtifactRequest(request) };
}
const nextInvestigation = (request, result, action) => mainArtifactRequest({
  ...request, runtime: result.runtime, snapshot: result.runtime.state,
  instances: result.instances, worldMinutes: result.runtime.worldMinutes, action,
});
const investigationMove = input => ({ type: "legend-input", runId, input });

test("composed weapons are authoritative dungeon equipment and a cursed jewel has freely removable cumulative costs", async () => {
  const initial = input();
  const initialized = await mainArtifactRequest(initial), instances = [];
  const owned = awardTreasure(initialized.runtime.state, instances, journey, { ...legendDefinition, seed: 0 }, composedReward(0));
  const base = await mainArtifactRequest({ ...initial, runtime: initialized.runtime,
    snapshot: initialized.runtime.state, treasureInstances: instances });
  // Equipment selection is read from the previous authoritative runtime, never the incoming snapshot.
  const equipped = await mainArtifactRequest({ ...initial, runtime: base.runtime, snapshot: base.runtime.state,
    treasureInstances: base.treasureInstances, action: { type: "treasure-equip-gear", id: owned.id } });
  const { result } = await startInvestigation({ ...initial, runtime: equipped.runtime, snapshot: equipped.runtime.state,
    treasureInstances: equipped.treasureInstances }, TREASURE_DUNGEON_VERSION);
  assert.equal(result.view.adventure.weapon, "sword");
  validateLegendSessionView(result.view.adventure, result.view.state);
  const jewelInstances = [];
  const jewel = awardTreasure(initialized.runtime.state, jewelInstances, journey, { ...legendDefinition, seed: 49 }, composedReward(49));
  const cursed = treasureAction(jewel.state, jewelInstances,
    journey, map, { type: "treasure-equip-gear", id: jewel.id });
  const info = infoAt(map, cursed);
  let paid = cursed;
  for (let index = 0; index < 10; index++) paid = settleAdventureCosts(paid,
    { minutes: 1, fatigue: 1, health: 1, dirt: 0 }, { survival, economy, info,
      paidCosts: { minutes: index, fatigue: index, health: index, dirt: 0 } });
  const together = settleAdventureCosts(cursed, { minutes: 10, fatigue: 10, health: 10, dirt: 0 },
    { survival, economy, info });
  assert.equal(paid.health, together.health);
  assert.equal(paid.fatigue, together.fatigue);
  assert.equal(paid.elapsedMinutes, together.elapsedMinutes);
});

test("cache opening consumes an actual carried lockpick and cannot use an arbitrary treasure", async () => {
  const initial = input(), treasures = [];
  const initialized = await mainArtifactRequest(initial);
  awardTreasure(initialized.runtime.state, treasures, journey, { ...legendDefinition, seed: 10 }, composedReward(10));
  const base = await mainArtifactRequest({ ...initial, runtime: initialized.runtime,
    snapshot: initialized.runtime.state, treasureInstances: treasures });
  const cache = { id: "de:OC123", cents: 321 };
  const opened = await mainArtifactRequest({ ...initial, runtime: base.runtime, snapshot: base.runtime.state,
    treasureInstances: base.treasureInstances, geocache: cache,
    action: { type: "cache-open", cacheId: cache.id, lockpick: treasures[0].id } });
  assert.equal(opened.view.state.walletCents, base.view.state.walletCents + 321);
  assert.equal(opened.view.state.treasures.inventory.length, 0);
  assert.equal(opened.treasureInstances[0].consumed, true);
  await assert.rejects(() => mainArtifactRequest({ ...initial, runtime: opened.runtime, snapshot: opened.runtime.state,
    treasureInstances: opened.treasureInstances, geocache: cache,
    action: { type: "cache-open", cacheId: cache.id, lockpick: treasures[0].id } }), /unavailable/);
  await assert.rejects(() => mainArtifactRequest({ ...initial, runtime: base.runtime, snapshot: base.runtime.state,
    treasureInstances: base.treasureInstances,
    action: { type: "cache-open", cacheId: cache.id, lockpick: treasures[0].id } }), /No available/);
});

test("all three treasure formats award a real bag item only on successful final settlement", async () => {
  for (const version of [TREASURE_PLATFORM_VERSION, VARIED_PLATFORM_VERSION, TREASURE_INVESTIGATION_VERSION, TREASURE_DUNGEON_VERSION]) {
    const { request, result: first } = await startInvestigation({}, version);
    assert.equal(first.view.state.treasures.inventory.length, 0);
    const session = first.view.adventure, seed = session.seed;
    const actions = version === VARIED_PLATFORM_VERSION ? variedPlatformRoute(seed).actions :
      isPlatformSession(version) ? platformCompletionActions(seed, { paced: true }) :
      isDungeonSession(version) ? dungeonCompletionActions(seed, "none", 8, true) :
        replayLegendSession(session).level.rooms.flatMap(room => [
          ...generatedCommands(room).map(command => ({ type: "act", command })),
          ...(room.id < 7 ? [{ type: "travel", room: room.id + 1 }] : []),
        ]);
    const finish = { type: "legend-finish", runId, actions };
    const completed = await nextInvestigation(request, first, finish);
    assert.equal(completed.view.adventure.status, "completed");
    const id = treasureId(session.townId, seed);
    assert.deepEqual(completed.view.treasures.result, { id, outcome: "collected" });
    assert.equal(completed.view.state.treasures.inventory[0].id, id);
    assert.equal(completed.treasureInstances[0].firstClaimant, journey);
    assert.equal(completed.view.state.lore.carriedGrams, treasureItem(id).grams);
    validateArtifactInventory(completed.view.state);
    await assert.rejects(() => nextInvestigation(request, completed, finish), /active/);
    const left = await nextInvestigation(request, first, { ...finish, actions: [] });
    assert.equal(left.view.adventure.status, "left");
    assert.equal(left.treasureInstances.length, 0);
  }
});

test("survival interruption in every treasure format creates no original and grants no item", async () => {
  for (const version of [TREASURE_PLATFORM_VERSION, VARIED_PLATFORM_VERSION, TREASURE_INVESTIGATION_VERSION, TREASURE_DUNGEON_VERSION]) {
    const source = input();
    const { result } = await startInvestigation({
      snapshot: { ...source.snapshot, health: .1, reserveKcal: 0 },
    }, version);
    assert.equal(result.view.adventure.status, "interrupted");
    assert.equal(result.view.state.ended, "health");
    assert.equal(result.treasureInstances.length, 0);
    assert.equal(result.view.state.treasures.inventory.length, 0);
  }
});

test("completed treasure recovery with no bag cells settles costs and leaves exactly one original at the entrance", async () => {
  const treasureInstances = Array.from({ length: 24 }, (_, index) => {
    const id = treasureId(`node/${index + 100}`, 8);
    return { id, owner: journey, col: 14, row: 10, place: "Firmi", firstClaimant: journey,
      placement: { id, x: index % 6, y: Math.floor(index / 6), rotated: false } };
  });
  const { request, result: first } = await startInvestigation({ treasureInstances }, TREASURE_INVESTIGATION_VERSION);
  const actions = replayLegendSession(first.view.adventure).level.rooms.flatMap(room => [
    ...generatedCommands(room).map(command => ({ type: "act", command })),
    ...(room.id < 7 ? [{ type: "travel", room: room.id + 1 }] : []),
  ]);
  const completed = await nextInvestigation(request, first, { type: "legend-finish", runId, actions });
  assert.equal(completed.view.adventure.status, "completed");
  assert.equal(completed.view.state.elapsedMinutes, 24);
  assert.equal(completed.view.treasures.result.outcome, "left");
  assert.equal(completed.view.state.treasures.inventory.length, 24);
  assert.equal(completed.treasureInstances.length, 25);
  assert.equal(completed.view.treasures.offers[0].id, completed.view.treasures.result.id);
  assert.equal(completed.treasureInstances.at(-1).owner, null);
});

test("world custody overrides forged reward snapshots and equipped looks; deposits release ownership", async () => {
  const placeMap = structuredClone(map);
  placeMap.rows[10][14] = { ...placeMap.rows[10][14], terrain: "place",
    settlements: [{ osmId: "node/42", name: "Firmi" }] };
  const { request, result: first } = await startInvestigation({ map: placeMap }, TREASURE_INVESTIGATION_VERSION);
  const actions = replayLegendSession(first.view.adventure).level.rooms.flatMap(room => [
    ...generatedCommands(room).map(command => ({ type: "act", command })),
    ...(room.id < 7 ? [{ type: "travel", room: room.id + 1 }] : []),
  ]);
  const completed = await nextInvestigation(request, first, { type: "legend-finish", runId, actions });
  const id = completed.treasureInstances[0].id;
  const send = (result, action, changes = {}) => mainArtifactRequest({ ...request, action,
    snapshot: result.view.state, runtime: result.runtime, treasureInstances: result.treasureInstances,
    instances: result.instances, worldMinutes: result.runtime.worldMinutes, ...changes });
  const equipped = await send(completed, { type: "treasure-equip", id });
  assert.equal(equipped.view.state.treasures.equipped, id);
  const skinned = await send(equipped, { type: "treasure-equip-ui", id });
  assert.equal(skinned.view.state.treasures.uiEquipped, id);
  const iconed = await send(skinned, { type: "treasure-equip-icon", id });
  assert.equal(iconed.view.state.treasures.iconEquipped, id);
  const forgedIcon = structuredClone(completed.view.state);
  forgedIcon.treasures.iconEquipped = id;
  const clean = await send(completed, null, { snapshot: forgedIcon });
  assert.equal(clean.view.state.treasures.iconEquipped, null, "client snapshots cannot equip earned icons");
  const dropped = await send(iconed, { type: "treasure-drop", id });
  assert.equal(dropped.view.state.treasures.equipped, null);
  assert.equal(dropped.view.state.treasures.uiEquipped, null);
  assert.equal(dropped.view.state.treasures.iconEquipped, null);
  assert.equal(dropped.view.state.treasures.inventory.length, 0);
  assert.deepEqual(dropped.view.treasures.offers.map(item => item.id), [id]);
  const forged = structuredClone(dropped.view.state);
  forged.treasures = iconed.view.state.treasures;
  forged.lore.carriedGrams = equipped.view.state.lore.carriedGrams;
  const refreshed = await send(dropped, null, { snapshot: forged });
  assert.equal(refreshed.view.state.treasures.inventory.length, 0);
  assert.equal(refreshed.view.state.treasures.uiEquipped, null);
  assert.equal(refreshed.view.state.treasures.iconEquipped, null);
  assert.equal(refreshed.view.state.lore.carriedGrams, 0);
  await assert.rejects(() => send(dropped, { type: "treasure-equip", id }), /carry/);
  await assert.rejects(() => send(dropped, { type: "treasure-equip-ui", id }), /carry/);
  await assert.rejects(() => send(dropped, { type: "treasure-equip-icon", id }), /carry/);
  const reclaimed = await send(dropped, { type: "treasure-pickup", id });
  assert.equal(reclaimed.view.state.treasures.inventory.length, 1);
  assert.equal(reclaimed.view.state.treasures.equipped, null);
  assert.equal(reclaimed.view.state.treasures.iconEquipped, null);
  const ended = await send(reclaimed, null, { snapshot: { ...reclaimed.view.state, health: 0, ended: "health" } });
  assert.equal(ended.view.state.treasures.inventory.length, 0);
  assert.equal(ended.treasureInstances[0].owner, null);
});

function generatedCommands(room) {
  return [...({
    evidence: ["inspect", `choose:${room.answer}`],
    witnesses: ["witness:0", "witness:1", `choose:${room.answer}`],
    assembly: ["take:0", "take:1", "combine"],
    sequence: ["inspect", ...room.order.map(index => `press:${index}`)],
  })[room.family], ...(room.seal === undefined ? [] : [`verify:${room.seal}`])];
}

test("all three local formats settle a complete transcript once, with matching local survival", async () => {
  for (const seed of [0, 1, 7, 123]) for (const contentVersion of [
    LOCAL_PLATFORM_VERSION, LOCAL_INVESTIGATION_VERSION, LOCAL_DUNGEON_VERSION,
    PACED_PLATFORM_VERSION, PACED_INVESTIGATION_VERSION, PACED_DUNGEON_VERSION,
  ]) {
    const { request, result: first } = await startInvestigation({
      legendDefinition: { ...legendDefinition, format: "platform", seed },
    }, contentVersion);
    const session = first.view.adventure;
    let local = createLocalLegendAttempt(session, { ...first.runtime, info: infoAt(map, first.runtime.state) });
    const paced = isPacedLegendSession(contentVersion);
    const actions = isPlatformSession(contentVersion) ? platformCompletionActions(seed, { paced }) :
      isDungeonSession(contentVersion) ? dungeonCompletionActions(seed, "none", 8, paced) :
        local.progress.level.rooms.flatMap(room => [
          ...generatedCommands(room).map(command => ({ type: "act", command })),
          ...(room.id < 7 ? [{ type: "travel", room: room.id + 1 }] : []),
        ]);
    for (const move of actions) local = stepLocalLegendAttempt(local, move);
    assert.equal(local.progress.completed, true);
    assert.equal(first.runtime.state.elapsedMinutes, 3, "server knows only paid entry until settlement");
    assert.deepEqual(first.runtime.adventure.actions, []);
    const result = await nextInvestigation(request, first, { type: "legend-finish", runId, actions });
    validateLegendSessionView(result.view.adventure, result.view.state);
    assert.equal(result.view.adventure.status, "completed");
    assert.deepEqual(result.view.adventure.costs, { minutes: 24, fatigue: 8, health: 0, dirt: 8 });
    for (const field of ["health", "reserveKcal", "fatigue", "elapsedMinutes", "walletCents", "pressures"]) {
      assert.deepEqual(result.runtime.state[field], local.state[field], `local/server ${field}`);
    }
    assert.equal(result.runtime.state.legendAdventure, null);
    assert.deepEqual((await nextInvestigation(request, result, null)).view.adventure, result.view.adventure);
    await assert.rejects(nextInvestigation(request, result, { type: "legend-finish", runId, actions }), /matching active/);
  }
});

test("reload discards local effects, retains entry, and paid restart resets all three formats", async () => {
  for (const contentVersion of [LOCAL_PLATFORM_VERSION, LOCAL_INVESTIGATION_VERSION, LOCAL_DUNGEON_VERSION]) {
    const { request, result: first } = await startInvestigation({}, contentVersion);
    const recovered = await nextInvestigation(request, first, null);
    assert.deepEqual(recovered.view.adventure.actions, []);
    assert.equal(recovered.runtime.state.elapsedMinutes, 3);
    const restarted = await nextInvestigation(request, recovered, { type: "legend-restart", runId });
    assert.equal(restarted.runtime.state.elapsedMinutes, 6);
    assert.deepEqual(restarted.view.adventure.actions, []);
    assert.equal(replayLegendSession(restarted.view.adventure).metrics.roomEntries, 1);
    await assert.rejects(nextInvestigation(request, restarted, investigationMove({ type: "wait" })), /final input transcript/);
    const left = await nextInvestigation(request, restarted, { type: "legend-finish", runId, actions: [] });
    assert.equal(left.runtime.state.elapsedMinutes, 6, "leaving never double-charges the paid entry");
    assert.equal(left.view.adventure.status, "left");
  }
});

test("local dungeon food is provisional until leaving, discarded by restart, and never heals", async () => {
  const initial = input(), starter = createEquipment();
  const equipment = { ...starter, items: [...starter.items, { id: "knife", condition: 100 }],
    placements: [{ id: "knife", x: 0, y: 0, rotated: false }] };
  const { request, result: first } = await startInvestigation({
    ...initial, snapshot: { ...initial.snapshot, equipment, reserveKcal: 500, health: 85 },
  }, LOCAL_DUNGEON_VERSION);
  const actions = findDungeonRoute(replayLegendSession(first.view.adventure),
    state => state.defeated.includes(0), { attack: true }).actions;
  let local = createLocalLegendAttempt(first.view.adventure, { ...first.runtime, info: infoAt(map, first.runtime.state) });
  for (const action of actions) local = stepLocalLegendAttempt(local, action);
  assert.equal(local.state.reserveKcal, first.runtime.state.reserveKcal + 150);
  assert.equal(local.state.health, first.runtime.state.health);
  const restarted = await nextInvestigation(request, first, { type: "legend-restart", runId });
  assert.equal(restarted.view.adventure.foodKcal, 0);
  assert.ok(restarted.runtime.state.reserveKcal < first.runtime.state.reserveKcal, "only new entry survival applied");
  assert.deepEqual(replayLegendSession(restarted.view.adventure).defeated, []);
  const settled = await nextInvestigation(request, first, { type: "legend-finish", runId, actions });
  assert.equal(settled.runtime.state.reserveKcal, local.state.reserveKcal);
  assert.equal(settled.view.adventure.foodKcal, 150);
});

test("paced dungeon patrol defeats still yield provisional food once, without respawning on retry", async () => {
  const initial = input(), starter = createEquipment();
  const equipment = { ...starter, items: [...starter.items, { id: "knife", condition: 100 }],
    placements: [{ id: "knife", x: 0, y: 0, rotated: false }] };
  const { request, result: first } = await startInvestigation({
    ...initial, snapshot: { ...initial.snapshot, equipment, reserveKcal: 500, health: 85 },
    legendDefinition: { ...legendDefinition, seed: 3 },
  }, PACED_DUNGEON_VERSION);
  const actions = [];
  let local = createLocalLegendAttempt(first.view.adventure, { ...first.runtime, info: infoAt(map, first.runtime.state) });
  for (let room = 0; room < 4; room++) {
    const route = findDungeonRoute(local.progress, state => state.room === room + 1);
    for (const action of route.actions) { actions.push(action); local = stepLocalLegendAttempt(local, action); }
  }
  const route = findDungeonRoute(local.progress, state => state.defeated.includes(4), { attack: true });
  for (const action of route.actions) { actions.push(action); local = stepLocalLegendAttempt(local, action); }
  assert.equal(local.foodKcal, 150);
  const reserveKcal = local.state.reserveKcal;
  for (const action of [{ type: "attack" }, { type: "retry" }]) {
    actions.push(action);
    local = stepLocalLegendAttempt(local, action);
    assert.equal(local.foodKcal, 0);
    assert.equal(local.state.reserveKcal, reserveKcal);
    assert.deepEqual(local.progress.defeated, [4]);
  }
  assert.equal(first.view.adventure.foodKcal, 0, "server never receives provisional food");
  const settled = await nextInvestigation(request, first, { type: "legend-finish", runId, actions });
  assert.equal(settled.runtime.state.reserveKcal, reserveKcal);
  assert.equal(settled.runtime.state.health, 85);
  validateLegendSessionView(settled.view.adventure, settled.view.state);
});

test("local platform transcript rejects forged packets, unbounded replay and post-completion inputs", async () => {
  const { request, result } = await startInvestigation({}, LOCAL_PLATFORM_VERSION);
  for (const actions of [
    [{ controls: { teleport: true }, ticks: 1 }],
    [{ controls: { right: 1 }, ticks: 1 }],
    [{ controls: [], ticks: 1 }],
    [{ controls: {}, ticks: 61 }],
    [{ controls: {}, ticks: 1, completed: true }],
    Array(MAX_PLATFORM_PACKETS + 1).fill({ controls: {}, ticks: 1 }),
    Array(Math.floor(MAX_PLATFORM_TICKS / 60) + 1).fill({ controls: {}, ticks: 60 }),
    [...platformCompletionActions(1), { controls: {}, ticks: 1 }],
  ]) {
    await assert.rejects(nextInvestigation(request, result, { type: "legend-finish", runId, actions }));
  }
});

test("local survival interrupts platform play without preview healing or accepting later frames", async () => {
  const initial = input();
  const { request, result: first } = await startInvestigation({
    ...initial, snapshot: { ...initial.snapshot, health: 4 },
    legendDefinition: { ...legendDefinition, seed: 2 },
  }, LOCAL_PLATFORM_VERSION);
  let local = createLocalLegendAttempt(first.view.adventure, { ...first.runtime, info: infoAt(map, first.runtime.state) });
  const actions = [];
  while (!local.interrupted && actions.length < 200) {
    const action = { controls: { right: local.progress.x < 428, left: local.progress.x > 432, down: true }, ticks: 1 };
    action.controls = Object.fromEntries(Object.entries(action.controls).filter(([, value]) => value));
    actions.push(action);
    local = stepLocalLegendAttempt(local, action);
  }
  assert.equal(local.interrupted, true);
  assert.equal(local.progress.health, null);
  assert.throws(() => stepLocalLegendAttempt(local, { controls: {}, ticks: 1 }), /already stopped/);
  const settled = await nextInvestigation(request, first, { type: "legend-finish", runId, actions });
  assert.equal(settled.view.adventure.status, "interrupted");
  assert.equal(settled.runtime.state.health, 0);
  assert.equal(settled.runtime.state.legendAdventure, null);
});

test("live dungeons complete unarmed across seeds with canonical costs, recovery and no reward", async () => {
  for (const seed of [0, 1, 2, 7]) {
    const { request, result: first } = await startInvestigation({
      legendDefinition: { ...legendDefinition, format: "platform", seed },
    }, DUNGEON_SESSION_VERSION);
    let result = first;
    assert.equal(first.view.adventure.weapon, "none");
    for (const action of dungeonCompletionActions(seed)) {
      result = await nextInvestigation(request, result, investigationMove(action));
      validateLegendSessionView(result.view.adventure, result.view.state);
    }
    assert.equal(result.view.adventure.status, "completed");
    assert.deepEqual(result.view.adventure.costs, { minutes: 12, fatigue: 4, health: 0, dirt: 4 });
    assert.deepEqual(result.view.adventure.metrics, { roomEntries: 4, roomsVisited: [0, 1, 2, 3], trapHits: 0, creatureHits: 0 });
    assert.equal(result.runtime.state.legendAdventure, null);
    assert.equal(result.runtime.state.elapsedMinutes, 12);
    assert.equal(result.runtime.state.walletCents, first.runtime.state.walletCents);
    assert.deepEqual(result.runtime.state.equipment.items, first.runtime.state.equipment.items);
    assert.deepEqual(result.instances, first.instances);
    const recovered = await nextInvestigation(request, result, null);
    assert.deepEqual(recovered.view.adventure, result.view.adventure);
    await assert.rejects(nextInvestigation(request, result, investigationMove({ type: "wait" })), /matching active/);
  }
});

test("seeded-dungeon-v1 pins its generator and legal completion transcript", () => {
  const session = { contentVersion: DUNGEON_SESSION_VERSION, seed: 123, weapon: "none", actions: [] };
  assert.equal(DUNGEON_SESSION_VERSION, "seeded-dungeon-v1");
  assert.deepEqual(replayLegendSession(session).level.rooms, [
    { id: 0, mechanism: "key", connections: [{ direction: "right", target: 1 }], creature: "bat", phase: 1 },
    { id: 1, mechanism: "switch", connections: [{ direction: "left", target: 0 }, { direction: "down", target: 2 }], creature: "rat", phase: 2 },
    { id: 2, mechanism: "spikes", connections: [{ direction: "up", target: 1 }, { direction: "left", target: 3 }], creature: "bat", phase: 1 },
    { id: 3, mechanism: "block", connections: [{ direction: "right", target: 2 }], creature: "rat", phase: 0 },
  ]);
  const actions = ["up", "left", "interact", "up", "right", "right", "right", "right", "right",
    "right", "interact", "right", "right", "down", "down", "down", "down", "down", "left",
    "left", "left", "left", "up", "left", "left", "left", "left", "left", "down", "right",
    "right", "up", "right", "right", "interact"].map(type => ({ type }));
  const progress = replayLegendSession({ ...session, actions });
  assert.equal(progress.completed, true);
  assert.deepEqual(progress.metrics, { roomEntries: 4, roomsVisited: [0, 1, 2, 3], trapHits: 0, creatureHits: 0 });
});

test("dungeon food grants capped energy once per defeat, persists on resume and rewards new attempts again", async () => {
  for (const reserveKcal of [500, survival.reserve_kcal - 20.25, survival.reserve_kcal]) {
    const initial = input(), starter = createEquipment();
    const equipment = { ...starter, items: [...starter.items, { id: "knife", condition: 100 }],
      placements: [{ id: "knife", x: 0, y: 0, rotated: false }] };
    const { request, result: first } = await startInvestigation({
      ...initial, snapshot: { ...initial.snapshot, equipment, reserveKcal, health: 85 },
    }, DUNGEON_FOOD_VERSION);
    let result = first;
    for (let attempt = 0; attempt < 2; attempt++) {
      const progress = replayLegendSession(result.view.adventure);
      assert.deepEqual(progress.defeated, [], "new attempts respawn creatures");
      const route = findDungeonRoute(progress, state => state.defeated.includes(0), { attack: true });
      for (const action of route.actions.slice(0, -1)) result = await nextInvestigation(request, result, investigationMove(action));
      const before = result.runtime.state;
      result = await nextInvestigation(request, result, investigationMove(route.actions.at(-1)));
      assert.deepEqual(replayLegendSession(result.view.adventure).defeated, [0]);
      assert.equal(result.runtime.state.reserveKcal, Math.min(survival.reserve_kcal, before.reserveKcal + 150));
      assert.equal(result.view.adventure.foodKcal, Math.min(150, survival.reserve_kcal - before.reserveKcal));
      assert.equal(result.runtime.state.health, before.health);
      assert.equal(result.runtime.state.meals, before.meals);
      assert.equal(result.runtime.state.elapsedMinutes, before.elapsedMinutes);
      assert.equal(result.runtime.dungeonFoodClaims, undefined, "no cross-attempt food ledger");
      validateLegendSessionView(result.view.adventure, result.view.state);
      const recovered = await mainArtifactRequest({ ...request, runtime: structuredClone(result.runtime),
        snapshot: result.runtime.state, action: null });
      assert.deepEqual(recovered.view.adventure, result.view.adventure);
      assert.equal(recovered.runtime.state.reserveKcal, result.runtime.state.reserveKcal);
      result = recovered;
      const fed = result.runtime.state.reserveKcal;
      for (const action of [{ type: "attack" }, { type: "retry" }, { type: "attack" }]) {
        result = await nextInvestigation(request, result, investigationMove(action));
        assert.equal(result.runtime.state.reserveKcal, fed);
        assert.equal(result.view.adventure.foodKcal, 0);
        assert.deepEqual(replayLegendSession(result.view.adventure).defeated, [0]);
      }
      result = await nextInvestigation(request, result, { type: "legend-leave", runId });
      if (!attempt) result = await nextInvestigation(request, result, {
        type: "legend-start", townId: legendDefinition.townId, contentVersion: DUNGEON_FOOD_VERSION,
      });
    }
  }
});

test("legacy dungeon kills still give no food, and v2 cannot accept invented food inputs or receipts", async () => {
  const initial = input(), starter = createEquipment();
  const equipment = { ...starter, items: [...starter.items, { id: "knife", condition: 100 }],
    placements: [{ id: "knife", x: 0, y: 0, rotated: false }] };
  const { request, result: first } = await startInvestigation({
    ...initial, snapshot: { ...initial.snapshot, equipment, reserveKcal: 500 },
  }, DUNGEON_SESSION_VERSION);
  let result = first;
  const route = findDungeonRoute(replayLegendSession(result.view.adventure), state => state.defeated.includes(0), { attack: true });
  const before = result.runtime.state.reserveKcal;
  for (const action of route.actions) result = await nextInvestigation(request, result, investigationMove(action));
  assert.equal(result.runtime.state.reserveKcal, before);
  assert.equal(result.view.adventure.foodKcal, undefined);
  const foodSession = { ...result.view.adventure, contentVersion: DUNGEON_FOOD_VERSION, foodKcal: 150 };
  validateLegendSessionView(foodSession, result.view.state);
  for (const foodKcal of [undefined, -1, 151, NaN, "150"]) {
    assert.throws(() => validateLegendSessionView({ ...foodSession, foodKcal }, result.view.state));
  }
  await assert.rejects(nextInvestigation(request, result, investigationMove({ type: "attack", foodKcal: 150 })), /Invalid dungeon/);
});

test("live dungeon collisions use journey health, additive trap/creature rates and no three-hit cutoff", async () => {
  const { request, result: first } = await startInvestigation({}, DUNGEON_SESSION_VERSION);
  let result = first;
  for (let hits = 1; hits <= 4; hits++) {
    const state = replayLegendSession(result.view.adventure);
    const route = findDungeonRoute(state, next => next.metrics.creatureHits + next.metrics.trapHits === hits, { damage: true });
    for (const action of route.actions) result = await nextInvestigation(request, result, investigationMove(action));
    assert.equal(result.view.adventure.status, "active");
    assert.equal(replayLegendSession(result.view.adventure).health, null);
    assert.deepEqual(result.view.adventure.costs, dungeonCosts(route.state.metrics));
    validateLegendSessionView(result.view.adventure, result.view.state);
  }
  assert.equal(result.view.adventure.metrics.creatureHits, 3);
  assert.equal(result.view.adventure.metrics.trapHits, 1);
  assert.deepEqual(result.view.adventure.costs, { minutes: 8, fatigue: 7, health: 11, dirt: 8 });
  assert.ok(result.runtime.state.health <= first.runtime.state.health - 11);
  const recovered = await nextInvestigation(request, result, null);
  assert.deepEqual(recovered.view.adventure, result.view.adventure);
  const retry = await nextInvestigation(request, recovered, investigationMove({ type: "retry" }));
  assert.deepEqual(retry.view.adventure.costs, recovered.view.adventure.costs);
  assert.equal(retry.runtime.state.health, recovered.runtime.state.health);
  const left = await nextInvestigation(request, retry, { type: "legend-leave", runId });
  assert.equal(left.view.adventure.status, "left");
  assert.equal(left.runtime.state.health, retry.runtime.state.health);
});

test("live dungeon weapon is pinned from usable inventory, not browser equipment or later snapshots", async () => {
  for (const condition of [0, 100]) {
    const initial = input();
    const starter = createEquipment();
    const equipment = { ...starter, items: [
      ...starter.items, { id: "knife", condition },
    ], placements: [{ id: "knife", x: 0, y: 0, rotated: false }] };
    const { request, result } = await startInvestigation({
      ...initial, snapshot: { ...initial.snapshot, equipment },
    }, DUNGEON_SESSION_VERSION);
    assert.equal(result.view.adventure.weapon, condition ? "knife" : "none");
    const resumed = await mainArtifactRequest({ ...request, runtime: result.runtime,
      snapshot: { ...result.runtime.state, equipment: { ...result.runtime.state.equipment,
        items: result.runtime.state.equipment.items.map(item => item.id === "knife" ? { ...item, condition: 100 } : item) } },
      action: null });
    assert.equal(resumed.view.adventure.weapon, result.view.adventure.weapon);
    if (condition) {
      const route = findDungeonRoute(replayLegendSession(result.view.adventure), state => state.defeated.includes(0), { attack: true });
      let next = result;
      for (const action of route.actions) next = await nextInvestigation(request, next, investigationMove(action));
      assert.deepEqual(replayLegendSession(next.view.adventure).defeated, [0]);
      assert.deepEqual(next.instances, result.instances);
      assert.equal(next.runtime.state.walletCents, result.runtime.state.walletCents);
    }
  }
});

test("dungeon authority rejects protocol/weapon forgery, bounded histories remain leaveable, survival interrupts", async () => {
  const { request, result } = await startInvestigation({}, DUNGEON_SESSION_VERSION);
  for (const action of [{ type: "travel", room: 1 }, { type: "wait", hits: 0 }, { type: "teleport" }]) {
    await assert.rejects(nextInvestigation(request, result, investigationMove(action)), /Invalid dungeon/);
  }
  for (const patch of [{ weapon: "sword" }, { metrics: { ...result.view.adventure.metrics, creatureHits: 5 } },
    { costs: { ...result.view.adventure.costs, health: 0, minutes: 0 } }]) {
    assert.throws(() => validateLegendSessionView({ ...result.view.adventure, ...patch }, result.view.state));
  }
  const bounded = { ...result, runtime: { ...result.runtime, adventure: { ...result.runtime.adventure,
    actions: Array(MAX_INVESTIGATION_ACTIONS).fill({ type: "wait" }) } } };
  await assert.rejects(nextInvestigation(request, bounded, investigationMove({ type: "wait" })), /history/);
  assert.equal((await nextInvestigation(request, bounded, { type: "legend-leave", runId })).view.adventure.status, "left");
  const initial = input();
  const lethal = await startInvestigation({ ...initial, snapshot: { ...initial.snapshot, health: 0.1, reserveKcal: 0 } }, DUNGEON_SESSION_VERSION);
  assert.equal(lethal.result.view.adventure.status, "interrupted");
  assert.equal(lethal.result.runtime.state.ended, "health");
  assert.equal(lethal.result.runtime.state.legendAdventure, null);
});

test("dungeon collision death and fainting interrupt immediately and do not resurrect at a checkpoint", async () => {
  for (const stats of [{ health: 1 }, { fatigue: 98 }]) {
    const initial = input();
    const { request, result: first } = await startInvestigation({
      ...initial, snapshot: { ...initial.snapshot, ...stats },
    }, DUNGEON_SESSION_VERSION);
    assert.equal(first.view.adventure.status, "active");
    const route = findDungeonRoute(replayLegendSession(first.view.adventure),
      state => state.metrics.creatureHits + state.metrics.trapHits > 0, { damage: true });
    let result = first;
    for (const action of route.actions) result = await nextInvestigation(request, result, investigationMove(action));
    assert.equal(result.view.adventure.status, "interrupted");
    assert.equal(result.runtime.state.legendAdventure, null);
    if (stats.health) assert.equal(result.runtime.state.ended, "health");
    else assert.equal(result.runtime.state.faints, 1);
    validateLegendSessionView(result.view.adventure, result.view.state);
    await assert.rejects(nextInvestigation(request, result, investigationMove({ type: "retry" })), /matching active/);
  }
});

test("seeded-investigation-v1 retains its pinned generator and legal completion transcript", () => {
  const session = { contentVersion: GENERATED_INVESTIGATION_VERSION, seed: 123, actions: [] };
  assert.equal(GENERATED_INVESTIGATION_VERSION, "seeded-investigation-v1");
  assert.deepEqual(replayLegendSession(session).level.rooms, [
    { id: 0, family: "assembly", variant: 0, order: [0, 2, 1], answer: 1 },
    { id: 1, family: "evidence", variant: 0, order: [2, 1, 0], answer: 1 },
    { id: 2, family: "sequence", variant: 1, order: [0, 1, 2], answer: 0 },
    { id: 3, family: "witnesses", variant: 1, order: [2, 0, 1], answer: 0 },
  ]);
  const actions = [
    { type: "act", command: "take:0" }, { type: "act", command: "take:1" },
    { type: "act", command: "combine" }, { type: "travel", room: 1 },
    { type: "act", command: "inspect" }, { type: "act", command: "choose:1" },
    { type: "travel", room: 2 }, { type: "act", command: "inspect" },
    { type: "act", command: "press:0" }, { type: "act", command: "press:1" },
    { type: "act", command: "press:2" }, { type: "travel", room: 3 },
    { type: "act", command: "witness:0" }, { type: "act", command: "witness:1" },
    { type: "act", command: "choose:0" },
  ];
  const progress = replayLegendSession({ ...session, actions });
  assert.equal(progress.completed, true);
  assert.deepEqual(progress.metrics, { roomEntries: 4, roomsVisited: [0, 1, 2, 3], trapHits: 0 });
  assert.throws(() => replayLegendSession({ ...session, actions: [...actions, { type: "travel", room: 0 }] }), /after completion/);
});

test("live generated investigations replay their canonical town seed, complete all four families and grant no reward", async () => {
  for (let seed = 0; seed < 8; seed++) {
    const { request, result: first } = await startInvestigation({
      legendDefinition: { ...legendDefinition, seed },
    }, GENERATED_INVESTIGATION_VERSION);
    let result = first;
    const level = replayLegendSession(first.view.adventure).level;
    assert.equal(level.seed, seed);
    assert.equal(level.tier, "modest");
    assert.equal(level.rooms.length, 4);
    assert.equal(first.runtime.state.elapsedMinutes, 3);
    for (const room of level.rooms) {
      for (const command of generatedCommands(room)) {
        result = await nextInvestigation(request, result, investigationMove({ type: "act", command }));
        validateLegendSessionView(result.view.adventure, result.view.state);
      }
      if (room.id < 3) {
        result = await nextInvestigation(request, result, investigationMove({ type: "travel", room: room.id + 1 }));
      }
    }
    assert.equal(result.view.adventure.status, "completed");
    assert.equal(result.runtime.state.legendAdventure, null);
    assert.equal(result.runtime.state.elapsedMinutes, 12);
    assert.deepEqual(result.view.adventure.costs, { minutes: 12, fatigue: 4, health: 0, dirt: 4 });
    assert.deepEqual(result.runtime.state.lore.inventory, []);
    assert.deepEqual(result.runtime.state.equipment.items, first.runtime.state.equipment.items);
    assert.equal(result.runtime.state.walletCents, first.runtime.state.walletCents);
    assert.deepEqual(result.instances, first.instances);
    const resumed = await nextInvestigation(request, result, null);
    assert.deepEqual(resumed.view.adventure, result.view.adventure);
    await assert.rejects(nextInvestigation(request, result, investigationMove({ type: "travel", room: 0 })), /matching active/);
  }
});

test("generated trials retain partial progress on recovery and backtracking and charge only actual entries", async () => {
  const { request, result: first } = await startInvestigation({}, GENERATED_INVESTIGATION_VERSION);
  const room = replayLegendSession(first.view.adventure).level.rooms[0];
  const commands = generatedCommands(room);
  let result = await nextInvestigation(request, first, investigationMove({ type: "travel", room: 3 }));
  assert.equal(result.runtime.state.elapsedMinutes, 3, "a locked site is not an entry");
  result = await nextInvestigation(request, result, investigationMove({ type: "act", command: commands[0] }));
  const recovered = await mainArtifactRequest({ ...request, runtime: structuredClone(result.runtime),
    snapshot: { ...result.runtime.state, walletCents: 500000 }, action: null });
  assert.deepEqual(recovered.view.adventure, result.view.adventure);
  assert.equal(recovered.runtime.state.walletCents, result.runtime.state.walletCents);
  result = recovered;
  for (const command of commands.slice(1)) result = await nextInvestigation(request, result, investigationMove({ type: "act", command }));
  result = await nextInvestigation(request, result, investigationMove({ type: "travel", room: 1 }));
  result = await nextInvestigation(request, result, investigationMove({ type: "travel", room: 0 }));
  assert.equal(replayLegendSession(result.view.adventure).progress[0].solved, true);
  assert.deepEqual(result.view.adventure.metrics, { roomEntries: 3, roomsVisited: [0, 1], trapHits: 0 });
  const left = await nextInvestigation(request, result, { type: "legend-leave", runId });
  assert.equal(left.view.adventure.status, "left");
  assert.equal(left.runtime.state.elapsedMinutes, 9);
  assert.equal(left.runtime.state.legendAdventure, null);
  validateLegendSessionView(left.view.adventure, left.view.state);
});

test("generated authority rejects mixed protocols, invented progress, excess actions and invalid views", async () => {
  const { request, result } = await startInvestigation({}, GENERATED_INVESTIGATION_VERSION);
  for (const move of [{ type: "act", target: "photo" }, { type: "travel", location: "archive" },
    { type: "travel", room: 4 }, { type: "act", command: "inspect", completed: true }]) {
    await assert.rejects(nextInvestigation(request, result, investigationMove(move)), /Invalid generated/);
  }
  await assert.rejects(nextInvestigation(request, result, { type: "inquire" }), /active legend/);
  const { request: authoredRequest, result: authored } = await startInvestigation();
  await assert.rejects(nextInvestigation(authoredRequest, authored, investigationMove({ type: "travel", room: 1 })), /Invalid investigation/);
  for (const change of [{ contentVersion: "seeded-investigation-v99" }, { seed: -1 }, { costs: { ...result.view.adventure.costs, minutes: 0 } },
    { status: "completed" }, { metrics: { ...result.view.adventure.metrics, roomEntries: 99 } }]) {
    assert.throws(() => validateLegendSessionView({ ...result.view.adventure, ...change }, result.view.state));
  }
  assert.throws(() => replayLegendSession({ ...result.view.adventure, seed: undefined }), /Invalid investigation/);
  assert.throws(() => replayLegendSession({ ...result.view.adventure,
    actions: Array(MAX_INVESTIGATION_ACTIONS + 1).fill({ type: "travel", room: 0 }) }), /history/);
  const bounded = { ...result, runtime: { ...result.runtime, adventure: { ...result.runtime.adventure,
    actions: Array(MAX_INVESTIGATION_ACTIONS).fill({ type: "travel", room: 0 }) } } };
  await assert.rejects(nextInvestigation(request, bounded, investigationMove({ type: "travel", room: 0 })), /history/);
  const left = await nextInvestigation(request, bounded, { type: "legend-leave", runId });
  assert.equal(left.view.adventure.status, "left");
});

test("generated trial survival interruptions retain costs and use normal journey death/fainting", async () => {
  for (const stats of [{ health: 0.1, reserveKcal: 0 }, { fatigue: 99 }]) {
    const request = input();
    request.snapshot = { ...request.snapshot, ...stats };
    const { result } = await startInvestigation(request, GENERATED_INVESTIGATION_VERSION);
    assert.equal(result.view.adventure.status, "interrupted");
    assert.equal(result.runtime.state.legendAdventure, null);
    assert.deepEqual(result.view.adventure.costs, { minutes: 3, fatigue: 1, health: 0, dirt: 1 });
    if (stats.health) assert.equal(result.runtime.state.ended, "health");
    else assert.equal(result.runtime.state.faints, 1);
    validateLegendSessionView(result.view.adventure, result.view.state);
  }
});

test("live investigation charges room entries incrementally, preserves canonical progress and resumes without another fee", async () => {
  const { request, result: first } = await startInvestigation();
  assert.equal(first.runtime.state.elapsedMinutes - request.snapshot.elapsedMinutes, 3);
  assert.equal(first.runtime.state.fatigue - request.snapshot.fatigue, 1);
  assert.equal(first.runtime.state.walletCents, request.snapshot.walletCents);
  assert.equal(first.view.adventure.status, "active");
  assert.equal(first.view.state.legendAdventure.runId, runId);
  assert.equal(journeyActionBlocker(first.view.state, { cell: { terrain: "place" }, artifactPending: true }), "legend");
  validateLegendSessionView(first.view.adventure, first.view.state);
  const snapshot = { ...first.runtime.state, walletCents: 500000, health: 1 };
  const resumed = await mainArtifactRequest({ ...request, runtime: first.runtime, snapshot, action: null });
  assert.equal(resumed.runtime.state.elapsedMinutes, first.runtime.state.elapsedMinutes);
  assert.equal(resumed.runtime.state.walletCents, first.runtime.state.walletCents);
  assert.equal(resumed.runtime.state.health, first.runtime.state.health);
  const visited = await nextInvestigation(request, resumed, investigationMove({ type: "travel", location: "archive" }));
  const same = await nextInvestigation(request, visited, investigationMove({ type: "travel", location: "archive" }));
  const returned = await nextInvestigation(request, same, investigationMove({ type: "travel", location: "foyer" }));
  assert.equal(same.runtime.state.elapsedMinutes, visited.runtime.state.elapsedMinutes);
  assert.deepEqual(returned.view.adventure.metrics, { roomEntries: 3, roomsVisited: ["foyer", "archive"], trapHits: 0 });
  assert.equal(returned.runtime.state.elapsedMinutes - request.snapshot.elapsedMinutes, 9);
  assert.ok(returned.runtime.state.pressures.cleanliness < 77.01);
  const left = await nextInvestigation(request, returned, { type: "legend-leave", runId });
  assert.equal(left.view.adventure.status, "left");
  assert.equal(left.runtime.state.legendAdventure, null);
  assert.equal(left.runtime.state.elapsedMinutes, returned.runtime.state.elapsedMinutes);
  validateLegendSessionView(left.view.adventure, left.view.state);
});

test("active investigation saves retain only their recovery marker and cannot lose it on ordinary reload", async () => {
  const { request, result } = await startInvestigation();
  const values = new Map(), storage = {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
  };
  const store = createJourneyStore(storage);
  store.read("firmi");
  store.write({ region: "firmi", map, state: result.view.state, survival, economy });
  const restored = createJourneyStore(storage).read("firmi");
  assert.deepEqual(restored.state.legendAdventure, { version: 1, runId });
  assert.equal(restored.state.adventure, undefined, "authoritative input log is not part of the browser save");
  const resumed = await mainArtifactRequest({ ...request, runtime: result.runtime,
    snapshot: restored.state, action: null });
  assert.equal(resumed.runtime.state.elapsedMinutes, 3);
  assert.deepEqual(resumed.view.adventure, result.view.adventure);
});

test("live investigation completion grants no inventory or money and late inputs cannot replay completion", async () => {
  const { request, result: first } = await startInvestigation();
  let result = first;
  for (const move of [
    { type: "act", target: "photo" }, { type: "act", target: "bell" },
    { type: "act", target: "handle" }, { type: "act", target: "oil" },
    { type: "travel", location: "archive" }, { type: "act", target: "cabinet" },
    { type: "travel", location: "booth" }, { type: "act", target: "mechanism" }, { type: "act", target: "reel" },
  ]) result = await nextInvestigation(request, result, investigationMove(move));
  assert.equal(result.view.adventure.status, "completed");
  assert.equal(result.runtime.state.legendAdventure, null);
  assert.equal(result.runtime.state.elapsedMinutes - request.snapshot.elapsedMinutes, 9);
  assert.equal(result.runtime.state.walletCents, first.runtime.state.walletCents);
  assert.deepEqual(result.runtime.state.equipment.items, first.runtime.state.equipment.items);
  assert.deepEqual(result.runtime.state.equipment.placements, first.runtime.state.equipment.placements);
  assert.deepEqual(result.runtime.state.lore.inventory, []);
  validateLegendSessionView(result.view.adventure, result.view.state);
  await assert.rejects(nextInvestigation(request, result, investigationMove({ type: "act", target: "reel" })), /matching active/);
});

test("active investigation rejects travel, other powers, invented inputs, forged markers and unsupported content", async () => {
  const { request, result } = await startInvestigation();
  await assert.rejects(nextInvestigation(request, result, { type: "inquire" }), /active legend/);
  await assert.rejects(nextInvestigation(request, result, investigationMove({ type: "act", target: "cabinet" })), /Unknown investigation/);
  await assert.rejects(nextInvestigation(request, result, investigationMove({ type: "act", target: "photo", completed: true })), /Invalid investigation input/);
  await assert.rejects(nextInvestigation(request, result, { type: "legend-leave", runId: "bad" }), /matching active/);
  await assert.rejects(mainArtifactRequest({ ...request, runtime: result.runtime,
    snapshot: { ...result.runtime.state, col: 15 }, action: null }), /moved during/);
  await assert.rejects(mainArtifactRequest({ ...request, legendDefinition: { ...legendDefinition, eligible: false } }), /unavailable/);
  assert.throws(() => validateLegendActivity({ ...result.view.state, miniGamePending: {} }), /Invalid active/);
  assert.throws(() => validateLegendSessionView({ ...result.view.adventure, costs: { minutes: 0 } }, result.view.state), /Inconsistent/);
  assert.throws(() => replayInvestigation(Array(MAX_INVESTIGATION_ACTIONS + 1).fill({ type: "act", target: "photo" })), /history/);
});

test("survival interruption retains costs, clears the activity and never gives free recovery", async () => {
  const starved = input();
  starved.snapshot = { ...starved.snapshot, health: 0.1, reserveKcal: 0 };
  const { result } = await startInvestigation(starved);
  assert.equal(result.runtime.state.health, 0);
  assert.equal(result.runtime.state.ended, "health");
  assert.equal(result.runtime.state.legendAdventure, null);
  assert.equal(result.view.adventure.status, "interrupted");
  assert.equal(result.runtime.state.elapsedMinutes, 3);
  const fatigued = input();
  fatigued.snapshot = { ...fatigued.snapshot, fatigue: 99 };
  const fainted = (await startInvestigation(fatigued)).result;
  assert.equal(fainted.view.adventure.status, "interrupted");
  assert.equal(fainted.runtime.state.legendAdventure, null);
  assert.equal(fainted.runtime.state.faints, 1);
  assert.ok(fainted.runtime.state.elapsedMinutes >= 483);
});

test("lethal investigation costs release already-owned arcane custody exactly once", async () => {
  const request = input();
  const known = await mainArtifactRequest({ ...request, action: { type: "inquire", id: "hermit" } });
  const claimed = await nextInvestigation(request, known, { type: "claim", id: "hermit" });
  const owned = claimed.instances.find(item => item.id === "hermit");
  assert.equal(owned.owner, journey);
  const result = await mainArtifactRequest({ ...request, runtime: claimed.runtime, instances: claimed.instances,
    snapshot: { ...claimed.runtime.state, health: 0.1, reserveKcal: 0 },
    requestId: runId, legendDefinition,
    action: { type: "legend-start", townId: legendDefinition.townId, contentVersion: LEGEND_SESSION_VERSION } });
  assert.equal(result.view.adventure.status, "interrupted");
  assert.equal(result.runtime.state.ended, "health");
  const released = result.instances.find(item => item.id === "hermit");
  assert.equal(released.owner, null);
  assert.equal(released.generation, owned.generation + 1);
  assert.deepEqual(result.runtime.state.lore.inventory, []);
});

test("trap cost settlement uses existing survival and pressure rules, including lethal damage", async () => {
  const { request, result } = await startInvestigation();
  const context = { survival, economy, info: { latitude: 44.5, longitude: 2.3, terrain: "place", police: false } };
  const before = { ...result.runtime.state, health: 4, legendAdventure: null };
  const hit = settleAdventureCosts(before, { minutes: 2, fatigue: 3, health: 5, dirt: 4 }, context);
  assert.equal(hit.elapsedMinutes - before.elapsedMinutes, 2);
  assert.equal(hit.health, 0);
  assert.equal(hit.ended, "health");
  assert.equal(hit.fatigue - before.fatigue, 3);
  assert.ok(hit.pressures.cleanliness <= before.pressures.cleanliness - 4);
  assert.equal(hit.walletCents, request.snapshot.walletCents);
  assert.throws(() => settleAdventureCosts(before, { minutes: 0, fatigue: 3, health: 0, dirt: 0 }, context), /elapsed time/);
});

test("artifact worker flushes large journey responses completely before exiting", async () => {
  const request = input();
  request.operation = "main-artifacts";
  request.seed = "worker-output-regression";
  request.snapshot.sidequests = Array.from({ length: 100 }, (_, index) => ({
    id: index.toString(16).padStart(32, "0"), parent: `Journal parent ${index}`,
    history: [], step: 0, delivered: false,
    stages: Array.from({ length: 10 }, (_, stage) => ({
      name: `Known journal destination ${index}, stage ${stage}`, latitude: 44.5, longitude: 2.3,
    })),
  }));
  const expected = await mainArtifactRequest(request);
  const worker = spawn(process.execPath, [new URL("../scripts/lore_worker.mjs", import.meta.url).pathname],
    { stdio: ["pipe", "pipe", "pipe"] });
  worker.stdout.setEncoding("utf8");
  worker.stderr.setEncoding("utf8");
  let stdout = "", stderr = "";
  worker.stdout.on("data", data => { stdout += data; });
  worker.stderr.on("data", data => { stderr += data; });
  const exited = new Promise((resolve, reject) => {
    worker.on("error", reject);
    worker.on("close", code => resolve(code));
  });
  worker.stdin.end(JSON.stringify(request));
  assert.equal(await exited, 0, stderr);
  assert.ok(Buffer.byteLength(JSON.stringify(expected)) > 65536);
  assert.deepEqual(JSON.parse(stdout), expected);
});

test("every artifact has a bilingual authored legend, not a fabricated location or inscription", () => {
  assert.deepEqual(Object.keys(ARTIFACT_RUMOURS).sort(), LORE_ITEMS.map(item => item.id).sort());
  for (const legend of Object.values(ARTIFACT_RUMOURS)) {
    assert.deepEqual(Object.keys(legend).sort(), ["en", "fr"]);
    assert.ok(legend.fr.length > 30 && legend.en.length > 30);
  }
});

test("a spontaneous character story earns a saved legend and only its pinned coarse lead, for free", async () => {
  const request = input();
  const clue = { targetType: "artifact", targetId: "hermit", targetRevision: "1",
    evidenceKey: "location", kind: "location", precision: "town",
    facts: { artifact: "hermit", region: map.name, place: "Firmi" }, source: "character-artifact-rumour",
    channels: ["npc"], availability: "current", contentVersion: "template-v1" };
  const rumour = { id: "hermit", characterId: "b".repeat(32), clue };
  const result = await mainArtifactRequest({ ...request, characterRumour: rumour });
  assert.equal(result.runtime.state.elapsedMinutes, request.snapshot.elapsedMinutes);
  assert.equal(result.runtime.state.walletCents, request.snapshot.walletCents);
  const entries = result.runtime.state.discovery.entries.filter(entry => entry.targetType === "artifact");
  assert.deepEqual(entries.map(entry => entry.kind), ["legend", "location"]);
  assert.equal(entries[1].precision, "town");
  assert.equal(entries[1].facts.col, undefined);
  assert.equal(entries[1].facts.marker, undefined);
  for (const lang of ["fr", "en"]) {
    const t = (key, values) => translate(lang, key, values);
    assert.equal(discoveryClueText(entries[0], result.runtime.state, t), ARTIFACT_RUMOURS.hermit[lang]);
    assert.equal(authoredHint(entries[0], result.runtime.state, t, "", 0), null);
  }
  const again = await mainArtifactRequest({ ...request, snapshot: result.runtime.state,
    runtime: result.runtime, characterRumour: rumour });
  assert.equal(again.runtime.state.discovery.entries.filter(entry => entry.targetType === "artifact").length, 2);
  const normal = await mainArtifactRequest({ ...request, snapshot: again.runtime.state, runtime: again.runtime });
  assert.equal(normal.runtime.state.discovery.entries.filter(entry => entry.targetType === "artifact").length, 2);
});

test("a character cannot reveal an object's new location or a private holder's whereabouts", async () => {
  const request = input();
  request.instances[0] = { ...request.instances[0], owner: "c".repeat(32), generation: 2,
    col: 19, row: 20, town: "Private new location" };
  const rumour = { id: "hermit", characterId: "b".repeat(32),
    clue: { targetType: "artifact", targetId: "hermit", targetRevision: "1",
      evidenceKey: "location", kind: "location", precision: "town",
      facts: { artifact: "hermit", region: "Old region", place: "Old public town" },
      source: "character-artifact-rumour", channels: ["npc"], availability: "current", contentVersion: "template-v1" } };
  const result = await mainArtifactRequest({ ...request, characterRumour: rumour });
  const clue = result.runtime.state.discovery.entries.find(entry => entry.kind === "location");
  assert.equal(clue.availability, "historical");
  assert.equal(clue.facts.place, "Old public town");
  assert.doesNotMatch(JSON.stringify(result.view.conversationRumour), /Private new location/);
  await assert.rejects(mainArtifactRequest({ ...request, characterRumour: {
    ...rumour, clue: { ...rumour.clue, precision: "local", facts: { ...rumour.clue.facts, col: 19 } },
  } }), /Invalid character artifact lead/);
});

test("a coarse character story neither overwrites earned facts nor attributes a known exact location to the speaker", async () => {
  const request = input();
  const first = await mainArtifactRequest({ ...request, action: { type: "inquire", id: "hermit" } });
  const precise = first.runtime.state.discovery.entries.find(entry => entry.targetId === "hermit");
  assert.equal(precise.precision, "local");
  const result = await mainArtifactRequest({ ...request, snapshot: first.runtime.state, runtime: first.runtime,
    characterRumour: { id: "hermit", characterId: "b".repeat(32), clue: { ...precise, precision: "town",
      facts: { artifact: "hermit", region: "Another public map name", place: "Firmi" } } } });
  const locations = result.runtime.state.discovery.entries.filter(entry =>
    entry.targetId === "hermit" && entry.kind === "location");
  assert.deepEqual(locations, [precise]);
  assert.equal(result.view.conversationRumour.clueRevision, null);
});

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
