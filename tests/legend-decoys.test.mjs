import test from "node:test";
import assert from "node:assert/strict";
import { generatePlatformLevel } from "../minigames/legend-layout.mjs";
import { createPlatformer, stepPlatformer } from "../minigames/legend-platformer.mjs";
import { generateInvestigation, createGeneratedInvestigation, stepInvestigation } from "../minigames/legend-investigation.mjs";
import { CATALOGUE_PLATFORM_VERSION, CATALOGUE_INVESTIGATION_VERSION,
  DECOY_PLATFORM_VERSION, DECOY_INVESTIGATION_VERSION, replayLegendSession } from "../legend-session.mjs";
import { encounterCosts } from "../adventure-costs.mjs";
import { variedPlatformRoute } from "./helpers/legend-varied-platform-route.mjs";
import { expandedInvestigationRoute } from "./helpers/legend-expanded-route.mjs";

test("new protocols alone add deterministic decoy levers with both consequences", () => {
  const kinds = new Set();
  for (let seed = 0; seed < 32; seed++) {
    const options = { seed, tier: "modest", paced: true, varied: true, expanded: true, catalogue: true, decoys: true };
    for (const generate of [generatePlatformLevel, generateInvestigation]) {
      const level = generate(options);
      assert.deepEqual(level, generate(options));
      assert.ok(level.rooms.some(room => room.decoy));
      for (const room of level.rooms.filter(room => room.decoy)) kinds.add(room.decoy.kind);
    }
  }
  assert.deepEqual([...kinds].sort(), ["mistake", "trap"]);
  for (const contentVersion of [CATALOGUE_PLATFORM_VERSION, CATALOGUE_INVESTIGATION_VERSION]) {
    const state = replayLegendSession({ contentVersion, seed: 0, actions: [] });
    assert.ok(state.level.rooms.every(room => !room.decoy));
    assert.equal(state.spentDecoys, undefined);
  }
  for (const generate of [generatePlatformLevel, generateInvestigation]) {
    assert.throws(() => generate({ decoys: true }), RangeError);
  }
});

test("investigation decoys charge exactly one consequence, retain clues/items and stay spent after revisits", () => {
  for (let seed = 0; seed < 2; seed++) {
    let state = createGeneratedInvestigation({ level: generateInvestigation({
      seed, paced: true, expanded: true, catalogue: true, decoys: true,
    }) });
    const before = state;
    state = stepInvestigation(state, { type: "act", command: "decoy:pull" });
    assert.deepEqual(state.progress, before.progress);
    assert.equal(state.metrics.trapHits, seed);
    assert.equal(state.metrics.wrongAttempts, 1 - seed);
    const costs = encounterCosts(state.metrics), base = encounterCosts(before.metrics);
    assert.equal(costs.minutes - base.minutes, 2);
    assert.equal(costs.fatigue - base.fatigue, seed ? 3 : 1);
    assert.equal(costs.health - base.health, seed ? 5 : 0);
    const again = stepInvestigation(state, { type: "act", command: "decoy:pull" });
    assert.deepEqual(again.metrics, state.metrics);
    assert.equal(again.message, "decoySpent");
    const route = expandedInvestigationRoute(seed, { catalogue: true, decoys: true, pullFirstDecoy: true });
    for (const action of route.actions.slice(1)) state = stepInvestigation(state, action);
    assert.ok(state.completed);
    assert.equal(state.metrics.trapHits, seed);
    assert.equal(state.metrics.wrongAttempts, 1 - seed);
    assert.deepEqual(replayLegendSession({ contentVersion: DECOY_INVESTIGATION_VERSION, seed,
      actions: route.actions }), state);
    const entry = route.actions.findIndex(action => action.type === "travel");
    const visited = replayLegendSession({ contentVersion: DECOY_INVESTIGATION_VERSION, seed,
      actions: [...route.actions.slice(0, entry + 1),
        { type: "travel", room: 0 }, { type: "act", command: "decoy:pull" }] });
    assert.equal(visited.message, "decoySpent");
    assert.equal(visited.metrics.trapHits, seed);
    assert.throws(() => replayLegendSession({ contentVersion: CATALOGUE_INVESTIGATION_VERSION, seed,
      actions: [{ type: "act", command: "decoy:pull" }] }), /Invalid/);
  }
});

test("platform decoys fire once even with held input and retries; injuries use standard trap costs", () => {
  for (let seed = 0; seed < 2; seed++) {
    const level = generatePlatformLevel({ seed, tier: "modest", paced: true, varied: true, expanded: true, catalogue: true, decoys: true });
    let state = createPlatformer({ level, healthMode: "journey" });
    const lever = level.rooms[0].decoy;
    const actions = [];
    const tick = controls => { actions.push({ controls, ticks: 1 }); state = stepPlatformer(state, controls); };
    tick({ left: true, jump: true });
    for (let tickCount = 0; tickCount < 240 && Math.abs(state.x - lever.x) >= 20; tickCount++) {
      tick(state.x < lever.x ? { right: true } : { left: true });
    }
    assert.ok(Math.abs(state.x - lever.x) < 28);
    const before = state.metrics;
    tick({ interact: true });
    assert.ok(state.spentDecoys.includes(0));
    assert.equal(state.message, lever.kind === "trap" ? "decoyTrap" : "decoyMistake");
    assert.equal(state.metrics.trapHits - before.trapHits, Number(lever.kind === "trap"));
    assert.equal(state.metrics.wrongAttempts - before.wrongAttempts, Number(lever.kind === "mistake"));
    if (lever.kind === "trap") {
      let preview = createPlatformer({ level });
      for (const action of actions) preview = stepPlatformer(preview, action.controls);
      assert.equal(preview.health, 2);
    }
    const hits = { ...state.metrics };
    for (let tickCount = 0; tickCount < 120; tickCount++) tick({ interact: true });
    assert.equal(state.message, lever.kind === "trap" ? "decoyTrap" : "decoyMistake");
    tick({ retry: true });
    assert.deepEqual(state.metrics, hits);
    tick({ left: true, jump: true });
    for (let tickCount = 0; tickCount < 240 && Math.abs(state.x - lever.x) >= 20; tickCount++) {
      tick(state.x < lever.x ? { right: true } : { left: true });
    }
    assert.ok(Math.abs(state.x - lever.x) < 28);
    tick({ interact: true });
    assert.deepEqual(state.metrics, hits);
    assert.deepEqual(replayLegendSession({ contentVersion: DECOY_PLATFORM_VERSION, seed, actions }), state);
  }
});

test("surprise levers never become required: damage-free real routes complete every profile and replay", () => {
  for (let seed = 0; seed < 12; seed++) {
    const tier = ["modest", "notable", "exceptional"][seed % 3];
    for (const [route, contentVersion] of [[variedPlatformRoute, DECOY_PLATFORM_VERSION],
      [expandedInvestigationRoute, DECOY_INVESTIGATION_VERSION]]) {
      const { state, actions } = route(seed, { tier, expanded: true, catalogue: true, decoys: true });
      assert.equal(state.completed, true);
      assert.equal(state.metrics.trapHits, 0);
      assert.equal(state.metrics.wrongAttempts, 0);
      assert.deepEqual(state.spentDecoys, []);
      if (tier === "modest") assert.deepEqual(replayLegendSession({ contentVersion, seed, actions }), state);
    }
  }
});
