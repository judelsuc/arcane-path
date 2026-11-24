import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mainArtifactRequest } from "../main-artifacts.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { LORE_ITEMS } from "../lore-catalogue.mjs";
import { infoAt } from "../lore-engine.mjs";
import { generatePlatformLevel, EXPANDED_PLATFORM_ARCHETYPES, EXPANDED_PLATFORM_CHALLENGES } from "../minigames/legend-layout.mjs";
import { createPlatformer, stepPlatformer, platformArrow, platformAnimal } from "../minigames/legend-platformer.mjs";
import { generateDungeon, createDungeon, stepDungeon } from "../minigames/legend-dungeon.mjs";
import { EXPANDED_PLATFORM_VERSION, EXPANDED_INVESTIGATION_VERSION, EXPANDED_DUNGEON_VERSION,
  CATALOGUE_PLATFORM_VERSION, CATALOGUE_INVESTIGATION_VERSION, CATALOGUE_DUNGEON_VERSION, isCatalogueLegendSession,
  DECOY_PLATFORM_VERSION, DECOY_INVESTIGATION_VERSION, hasDecoyLevers,
  replayLegendSession, validateLegendSessionView, createLocalLegendAttempt, stepLocalLegendAttempt } from "../legend-session.mjs";
import { encounterCosts } from "../adventure-costs.mjs";
import { variedPlatformRoute } from "./helpers/legend-varied-platform-route.mjs";
import { findDungeonRoute } from "./helpers/legend-dungeon-route.mjs";

import { expandedInvestigationRoute, expandedDungeonRoute } from "./helpers/legend-expanded-route.mjs";

test("expanded platform decks include sixteen architectures and eight distinct mechanisms", () => {
  const archetypes = new Set(), challenges = new Set();
  for (let seed = 0; seed < 32; seed++) {
    const level = generatePlatformLevel({ seed, tier: "notable", paced: true, varied: true, expanded: true });
    assert.equal(new Set(level.rooms.slice(0, 16).map(room => room.archetype)).size, 16);
    for (const room of level.rooms) {
      archetypes.add(room.archetype);
      if (room.challenge) challenges.add(room.challenge.family);
    }
    assert.ok(level.rooms.some(room => room.connections.some(door => door.secret)));
    assert.ok(level.rooms.some(room => room.arrowTrap));
    assert.ok(level.rooms.some(room => room.stash));
  }
  assert.deepEqual([...archetypes].sort(), [...EXPANDED_PLATFORM_ARCHETYPES].sort());
  assert.deepEqual([...challenges].sort(), [...EXPANDED_PLATFORM_CHALLENGES].sort());
});

test("new investigation families and concealed clues are solvable and replay exactly, including charged mistakes", () => {
  const families = new Set();
  for (const tier of ["modest", "notable", "exceptional"]) for (let seed = 0; seed < 24; seed++) {
    const { state, actions } = expandedInvestigationRoute(seed, { tier, mistakes: true });
    state.level.rooms.forEach(room => families.add(room.family));
    assert.equal(state.stashes.length, state.level.rooms.filter(room => room.concealed).length);
    assert.ok(state.metrics.wrongAttempts > 0);
    assert.equal(encounterCosts(state.metrics).minutes, state.metrics.roomEntries * 3 + state.metrics.wrongAttempts * 2);
    if (tier === "modest") assert.deepEqual(replayLegendSession({ seed, actions, contentVersion: EXPANDED_INVESTIGATION_VERSION }), state);
  }
  assert.equal(families.size, 8);
});

test("expanded dungeons, required cracks and optional stash chambers are traversable unarmed without damage", () => {
  for (let seed = 0; seed < 24; seed++) {
    const tier = ["modest", "notable", "exceptional"][seed % 3];
    const { state, actions } = expandedDungeonRoute(seed, { tier });
    assert.equal(state.stashes.length, state.level.rooms.filter(room => room.hidden).length);
    assert.equal(state.metrics.trapHits + state.metrics.creatureHits, 0);
    if (tier === "modest") assert.deepEqual(replayLegendSession({ seed, actions, contentVersion: EXPANDED_DUNGEON_VERSION, weapon: "none" }), state);
  }
});

test("expanded platforms are physically completable with secrets and replayed new mechanisms", () => {
  for (let seed = 0; seed < 48; seed++) {
    const tier = ["modest", "notable", "exceptional"][seed % 3];
    const route = variedPlatformRoute(seed, { expanded: true, tier, visitBranches: seed < 6 });
    if (tier === "modest") assert.deepEqual(replayLegendSession({ seed, actions: route.actions, contentVersion: EXPANDED_PLATFORM_VERSION }), route.state);
    assert.ok(route.state.secrets.length);
    if (seed < 6) assert.equal(route.state.stashes.length, route.level.rooms.filter(room => room.stash).length);
  }
});

test("pressure plates telegraph real arrows, animal patrols move and retries retain injuries without rearming arrows", () => {
  let state = createPlatformer({ level: generatePlatformLevel({ seed: 1, tier: "modest", paced: true, varied: true, expanded: true }), healthMode: "journey" });
  const firstAnimal = platformAnimal(state);
  for (let i = 0; i < 80 && state.trapTick === null; i++) state = stepPlatformer(state, { left: true });
  assert.notEqual(state.trapTick, null);
  assert.equal(platformArrow(state), null);
  const armed = state;
  for (let i = 0; i < 48; i++) state = stepPlatformer(state, {});
  assert.ok(platformArrow(state));
  assert.notEqual(platformAnimal(state).x, firstAnimal.x);
  for (let i = 0; i < 130 && state.metrics.trapHits === armed.metrics.trapHits; i++) state = stepPlatformer(state, {});
  assert.equal(state.metrics.trapHits, armed.metrics.trapHits + 1);
  assert.equal(state.trapTick, null);
  const costs = encounterCosts(state.metrics);
  state = stepPlatformer(state, { retry: true });
  assert.deepEqual(encounterCosts(state.metrics), costs);
  let dungeon = createDungeon({ level: generateDungeon({ seed: 0, paced: true, expanded: true }), healthMode: "journey" });
  dungeon = findDungeonRoute(dungeon, next => next.trapTick !== null).state;
  assert.equal(dungeon.message, "trapWarning");
  const before = dungeon.metrics.trapHits;
  for (let i = 0; i < 6; i++) dungeon = stepDungeon(dungeon, { type: "wait" });
  assert.equal(dungeon.metrics.trapHits, before + 1);
});

function journeyRequest() {
  const json = file => JSON.parse(readFileSync(new URL(file, import.meta.url)));
  const map = json("../public/map.json"), survival = json("../public/config.json").survival;
  const economy = json("../public/economy.json"), journey = "a".repeat(32), startedAt = Date.UTC(2026, 9, 19, 12);
  const state = { ...startEconomy(startSurvival(14, 10, startedAt, "balanced", survival), economy, () => 0),
    trail: createTrail(map, 14, 10, () => 0), serverJourney: { id: journey, seed: "a".repeat(8),
      contentVersion: "b".repeat(64), createdAt: new Date(startedAt).toISOString() } };
  return { map, journey, genesis: { state, region: "firmi", economy, survival }, snapshot: state,
    nowMillis: startedAt, worldMinutes: 0, requestId: "00000000-0000-4000-8000-000000000001",
    instances: LORE_ITEMS.map(item => ({ id: item.id, col: 14, row: 10, town: "Firmi",
      marker: `virtual:${item.id}`, generation: 1, owner: null, placement: null, cooldownUntil: 0 })) };
}

test("all expanded formats settle actual journey penalties and first-clear money/food stashes, never on abandon or replay", async () => {
  for (const [format, contentVersion, seed = 1] of [["platform", EXPANDED_PLATFORM_VERSION],
    ["investigation", EXPANDED_INVESTIGATION_VERSION], ["dungeon", EXPANDED_DUNGEON_VERSION],
    ["platform", CATALOGUE_PLATFORM_VERSION], ["investigation", CATALOGUE_INVESTIGATION_VERSION],
    ["dungeon", CATALOGUE_DUNGEON_VERSION], ["platform", DECOY_PLATFORM_VERSION],
    ["investigation", DECOY_INVESTIGATION_VERSION], ["platform", DECOY_PLATFORM_VERSION, 0],
    ["investigation", DECOY_INVESTIGATION_VERSION, 0]]) {
    const base = journeyRequest();
    const request = { ...base, legendDefinition: { townId: "node/42", town: "Firmi", eligible: true, format, seed },
      action: { type: "legend-start", townId: "node/42", contentVersion } };
    const started = await mainArtifactRequest(request);
    validateLegendSessionView(started.view.adventure, started.view.state);
    const catalogue = isCatalogueLegendSession(contentVersion);
    const decoys = hasDecoyLevers(contentVersion);
    const route = format === "platform" ? variedPlatformRoute(seed, {
      expanded: true, visitBranches: true, catalogue, decoys, pullFirstDecoy: decoys,
    }) : format === "dungeon" ? expandedDungeonRoute(seed, { catalogue }) :
      expandedInvestigationRoute(seed, { mistakes: true, catalogue, decoys, pullFirstDecoy: decoys });
    const { actions } = route;
    if (decoys) {
      assert.equal(route.state.metrics.trapHits, seed);
      if (!seed) assert.ok(route.state.metrics.wrongAttempts > 0);
    }
    let local = createLocalLegendAttempt(started.view.adventure, { ...started.runtime,
      info: infoAt(request.map, started.view.state) });
    for (const action of actions) local = stepLocalLegendAttempt(local, action);
    assert.equal(local.interrupted, false);
    assert.equal(local.state.walletCents, started.view.state.walletCents);
    const finish = transcript => ({ ...request, runtime: started.runtime, snapshot: started.view.state,
      worldMinutes: started.runtime.worldMinutes, instances: started.instances,
      action: { type: "legend-finish", runId: base.requestId, actions: transcript } });
    const finished = await mainArtifactRequest(finish(actions));
    validateLegendSessionView(finished.view.adventure, finished.view.state);
    assert.equal(finished.view.adventure.status, "completed");
    const stash = finished.view.treasures.result.stash;
    const finds = route.state.stashes.map(id => route.state.level.rooms[id].stash);
    assert.equal(stash.cents, finds.filter(stash => stash.kind === "money").length * 100);
    assert.ok(stash.foodKcal > 0 && stash.foodKcal <= finds.filter(stash => stash.kind === "food").length * 150);
    assert.equal(finished.view.state.walletCents, local.state.walletCents + stash.cents);
    assert.equal(finished.view.state.reserveKcal, local.state.reserveKcal + stash.foodKcal);
    for (const key of ["health", "fatigue", "elapsedMinutes"]) assert.equal(finished.view.state[key], local.state[key]);
    assert.equal(finished.view.state.pressures.cleanliness, local.state.pressures.cleanliness);
    const left = await mainArtifactRequest(finish(actions.slice(0, -1)));
    assert.equal(left.view.adventure.status, "left");
    assert.equal(left.view.treasures.result, null);
    assert.equal(left.view.state.walletCents, local.state.walletCents);
    const taken = await mainArtifactRequest({ ...finish(actions), treasureInstances: finished.treasureInstances });
    assert.equal(taken.view.treasures.result.outcome, "taken");
    assert.equal(taken.view.treasures.result.stash, undefined);
    assert.equal(taken.view.state.walletCents, local.state.walletCents);
    await assert.rejects(() => mainArtifactRequest({ ...finish(actions), runtime: finished.runtime,
      snapshot: finished.view.state }), /No matching active/);
  }
});

test("surprise injuries interrupt fragile journeys consistently in local and authoritative replay", async () => {
  for (const [format, contentVersion] of [["platform", DECOY_PLATFORM_VERSION], ["investigation", DECOY_INVESTIGATION_VERSION]]) {
    const seed = 1, base = journeyRequest();
    const state = { ...base.snapshot, health: 5 };
    const request = { ...base, snapshot: state, genesis: { ...base.genesis, state },
      legendDefinition: { townId: "node/42", town: "Firmi", eligible: true, format, seed },
      action: { type: "legend-start", townId: "node/42", contentVersion } };
    const started = await mainArtifactRequest(request);
    const route = format === "platform" ? variedPlatformRoute(seed, {
      expanded: true, catalogue: true, decoys: true, pullFirstDecoy: true,
    }) : expandedInvestigationRoute(seed, { catalogue: true, decoys: true, pullFirstDecoy: true });
    let local = createLocalLegendAttempt(started.view.adventure, {
      ...started.runtime, info: infoAt(request.map, started.view.state),
    });
    const actions = [];
    for (const action of route.actions) {
      actions.push(action);
      local = stepLocalLegendAttempt(local, action);
      if (local.interrupted) break;
    }
    assert.equal(local.interrupted, true);
    assert.equal(local.progress.metrics.trapHits, 1);
    const finished = await mainArtifactRequest({ ...request, runtime: started.runtime, snapshot: started.view.state,
      worldMinutes: started.runtime.worldMinutes, instances: started.instances,
      action: { type: "legend-finish", runId: base.requestId, actions } });
    assert.equal(finished.view.adventure.status, "interrupted");
    assert.equal(finished.view.treasures.result, null);
    for (const key of ["health", "fatigue", "elapsedMinutes", "walletCents"]) {
      assert.equal(finished.view.state[key], local.state[key]);
    }
    validateLegendSessionView(finished.view.adventure, finished.view.state);
  }
});
