import test from "node:test";
import assert from "node:assert/strict";
import { MECHANISMS, createMechanism, initialMechanismState, advanceMechanism, mechanismCommands,
  validateMechanismPlacement, investigationHotspots, MECHANISM_COPY } from "../minigames/legend-mechanisms.mjs";
import { generatePlatformLevel } from "../minigames/legend-layout.mjs";
import { stepPlatformer, platformBridge, platformCrate, platformRoomSolved, PLAYER } from "../minigames/legend-platformer.mjs";
import { generateDungeon, dungeonBeam, stepDungeon } from "../minigames/legend-dungeon.mjs";
import { generateInvestigation, investigationCommands, stepInvestigation } from "../minigames/legend-investigation.mjs";
import { CATALOGUE_PLATFORM_VERSION, CATALOGUE_DUNGEON_VERSION, CATALOGUE_INVESTIGATION_VERSION,
  EXPANDED_PLATFORM_VERSION, EXPANDED_DUNGEON_VERSION, EXPANDED_INVESTIGATION_VERSION,
  replayLegendSession } from "../legend-session.mjs";
import { expandedDungeonRoute, expandedInvestigationRoute } from "./helpers/legend-expanded-route.mjs";
import { variedPlatformRoute } from "./helpers/legend-varied-platform-route.mjs";

const versions = { platform: CATALOGUE_PLATFORM_VERSION, dungeon: CATALOGUE_DUNGEON_VERSION, investigation: CATALOGUE_INVESTIGATION_VERSION };
const routes = new Map();
function route(format, seed, tier = "modest") {
  const key = `${format}:${seed}:${tier}`;
  if (!routes.has(key)) routes.set(key, (format === "platform" ? variedPlatformRoute :
    format === "dungeon" ? expandedDungeonRoute : expandedInvestigationRoute)(seed,
  { tier, expanded: true, catalogue: true, visitBranches: true, mistakes: true }));
  return routes.get(key);
}
function onRoute(format, predicate, seed = 0) {
  let state = replayLegendSession({ contentVersion: versions[format], seed, weapon: "none", actions: [] });
  for (const action of route(format, seed).actions) {
    if (format === "platform") {
      for (let tick = 0; tick < action.ticks; tick++) {
        state = stepPlatformer(state, action.controls);
        if (predicate(state)) return state;
      }
    } else {
      state = format === "dungeon" ? stepDungeon(state, action) : stepInvestigation(state, action);
      if (predicate(state)) return state;
    }
  }
  assert.fail("Missing room on actual completion route.");
}
const roomEntry = (format, room, seed = 0) => onRoute(format, state => state.room === room, seed);

test("catalogue declares immutable, bounded, compatible recipes and rejects unsafe slots", () => {
  for (const [kind, definition] of Object.entries(MECHANISMS)) {
    assert.ok(definition.id && definition.slot && definition.help.fr && definition.clue.en);
    for (const format of definition.formats) for (let variant = 0; variant < 3; variant++) {
      const recipe = createMechanism(format, kind, variant);
      assert.deepEqual(recipe, createMechanism(format, kind, variant));
      assert.ok(Object.isFrozen(recipe) && Object.isFrozen(recipe.solution));
      assert.ok(recipe.solution.length);
    }
    assert.throws(() => createMechanism("unknown", kind), RangeError);
    for (const variant of [-1, 3, 0.1, NaN]) assert.throws(() => createMechanism(definition.formats[0], kind, variant), RangeError);
  }
  assert.throws(() => createMechanism("platform", "unknown"), RangeError);
  assert.throws(() => createMechanism("platform", "__proto__"), RangeError);
  assert.throws(() => createMechanism("dungeon", "bridge"), RangeError);
  const options = { seed: 1, tier: "modest", paced: true, expanded: true, catalogue: true };
  const platform = generatePlatformLevel({ ...options, varied: true });
  assert.throws(() => validateMechanismPlacement(platform.rooms[1].recipes[0],
    { ...platform.rooms[1], arrowTrap: {} }), /clear.*rail/);
  assert.throws(() => validateMechanismPlacement(platform.rooms[3].recipes[0],
    { ...platform.rooms[3], ladders: [] }), /boarding/);
  const dungeon = generateDungeon(options), mirror = dungeon.rooms[1].recipes.mirror;
  assert.throws(() => validateMechanismPlacement(mirror,
    { ...dungeon.rooms[1], walls: [{ x: 4, y: 3 }] }), /beam path/);
  assert.throws(() => validateMechanismPlacement(dungeon.rooms[3].recipes.weight,
    { ...dungeon.rooms[3], walls: [{ x: 3, y: 3 }] }), /rail/);
});

test("seeded placement is deterministic across all length profiles and retains migrated mechanisms", () => {
  const migrated = new Set();
  for (const tier of ["modest", "notable", "exceptional"]) for (let seed = 0; seed < 64; seed++) {
    const options = { seed, tier, paced: true, expanded: true, catalogue: true };
    for (const generate of [generateDungeon, generateInvestigation, opts => generatePlatformLevel({ ...opts, varied: true })]) {
      const level = generate(options);
      assert.deepEqual(level, generate(options));
      for (const room of level.rooms) {
        if (room.recipe) assert.ok(["tool", "repair", "overlay"].includes(room.recipe.kind));
        if (room.recipes) for (const recipe of Object.values(room.recipes).filter(Boolean)) migrated.add(recipe.kind);
      }
    }
  }
  for (const kind of ["switch", "key", "plate", "crank", "crate", "bridge", "mirror", "weight"]) assert.ok(migrated.has(kind));
});

test("real routes complete all new formats, secrets and profiles without unavoidable damage and replay exactly", () => {
  for (let seed = 0; seed < 24; seed++) {
    const tier = ["modest", "notable", "exceptional"][seed % 3];
    for (const format of Object.keys(versions)) {
      const { state, actions } = route(format, seed, tier);
      assert.ok(state.completed);
      assert.equal(state.metrics.trapHits + (state.metrics.creatureHits ?? 0), 0);
      if (format === "investigation") assert.ok(state.metrics.wrongAttempts > 0);
      else assert.equal(state.metrics.wrongAttempts, 0);
      if (tier === "modest") assert.deepEqual(replayLegendSession({ contentVersion: versions[format], seed, weapon: "none", actions }), state);
    }
  }
});

test("crates move under real input, cannot be passed on foot, reset before solving and stay latched afterwards", () => {
  const entry = roomEntry("platform", 1), recipe = entry.level.rooms[1].recipes[0];
  const initial = platformCrate(entry).x;
  const state = onRoute("platform", state => state.room === 1 &&
    platformCrate(state).x !== initial && !platformRoomSolved(state));
  assert.notEqual(platformCrate(state).x, initial);
  assert.equal(platformRoomSolved(state), false);
  const reset = stepPlatformer(state, { retry: true });
  assert.equal(platformCrate(reset).x, recipe.start);
  assert.equal(reset.metrics.trapHits, state.metrics.trapHits);
  let pushed = state;
  for (let tick = 0; tick < 100; tick++) {
    pushed = stepPlatformer(pushed, { right: true });
    assert.ok(pushed.x + PLAYER.width <= platformCrate(pushed).x + 0.01);
  }
  assert.equal(platformCrate(pushed).x, recipe.target);
  const latchedRetry = stepPlatformer(pushed, { retry: true });
  assert.equal(platformCrate(latchedRetry).x, recipe.target);
  assert.ok(platformRoomSolved(latchedRetry));
  const solved = roomEntry("platform", 2);
  assert.equal(solved.crates[1], recipe.target);
  assert.ok(solved.mechanisms[1][0].solved);
});

test("bridge expires without injury, cannot be solved from the ground, and safely rearms after a missed crossing", () => {
  let state = roomEntry("platform", 3);
  const recipe = state.level.rooms[3].recipes[0];
  assert.equal(platformBridge(state), null);
  for (let tick = 0; tick < 180; tick++) state = stepPlatformer(state, { right: true, interact: true });
  assert.equal(platformRoomSolved(state), false);
  state = stepPlatformer(state, { retry: true });
  for (let tick = 0; tick < 200 && state.x > recipe.lever.x; tick++) state = stepPlatformer(state, { left: true });
  for (let tick = 0; tick < 60; tick++) state = stepPlatformer(state, { up: true });
  state = stepPlatformer(state, { interact: true });
  assert.ok(platformBridge(state));
  const opened = state;
  for (let tick = 0; tick < recipe.duration; tick++) state = stepPlatformer(state, {});
  assert.equal(platformBridge(state), null);
  assert.equal(platformRoomSolved(state), false);
  assert.deepEqual(state.metrics, opened.metrics);
  state = stepPlatformer(state, { interact: true });
  assert.ok(platformBridge(state));
  for (let tick = 0; tick < 140; tick++) state = stepPlatformer(state, { right: true, interact: true });
  assert.ok(platformRoomSolved(state));
  assert.equal(state.metrics.trapHits + state.metrics.creatureHits, 0);
});

test("mirror rays stay bounded and rotating to the receiver opens only that gate component", () => {
  for (let seed = 0; seed < 3; seed++) {
    let state = roomEntry("dungeon", 1, seed), recipe = state.level.rooms[1].recipes.mirror;
    const initialBeam = dungeonBeam(state);
    assert.ok(initialBeam.length > 3 && initialBeam.length < 16);
    while (state.y > 3) state = stepDungeon(state, { type: "up" });
    while (state.x !== 4) state = stepDungeon(state, { type: state.x < 4 ? "right" : "left" });
    for (let rotation = 1; rotation <= recipe.answer; rotation++) {
      state = stepDungeon(state, { type: "interact" });
      assert.equal(state.mechanisms[1].mirror.angle, rotation);
      const beam = dungeonBeam(state);
      assert.ok(beam.length < 16 && beam.every(point => point.x > 0 && point.x < 8 && point.y > 0 && point.y < 6));
      const retried = stepDungeon(state, { type: "retry" });
      assert.equal(retried.mechanisms[1].mirror.angle, rotation === recipe.answer ? rotation : 0);
      assert.equal(retried.mechanisms[1].mirror.solved, rotation === recipe.answer);
    }
    assert.ok(dungeonBeam(state).some(point => point.x === recipe.receiver.x && point.y === recipe.receiver.y));
    assert.ok(state.activated.includes("1:mirror"));
  }
});

test("tools and repair chains never consume essential parts on errors; command sets fit five console buttons", () => {
  for (const kind of ["tool", "repair", "overlay"]) {
    const recipe = createMechanism("investigation", kind, 2);
    let state = initialMechanismState();
    const apply = command => { state = advanceMechanism(recipe, state, { command }).state;
      assert.ok(mechanismCommands(recipe, state).length <= 5); };
    if (kind === "tool") {
      apply("take:0"); apply("inspect"); apply("use:0"); assert.deepEqual(state.items, [0]);
    } else { apply("combine"); assert.equal(state.solved, false); }
    for (const command of recipe.solution) apply(command);
    assert.equal(state.solved, true);
  }
  let tool = roomEntry("investigation", 1);
  const previousMistakes = tool.metrics.wrongAttempts;
  const recipe = tool.level.rooms[1].recipe, wrong = (recipe.answer + 1) % 3;
  for (const command of ["inspect", `take:${wrong}`, `use:${wrong}`]) tool = stepInvestigation(tool, { type: "act", command });
  assert.equal(tool.metrics.wrongAttempts, previousMistakes + 1);
  assert.ok(tool.progress[1].mechanism.items.includes(wrong));
  assert.throws(() => stepInvestigation(tool, { type: "act", command: `use:${recipe.answer}` }), /Invalid/);
  assert.ok(investigationCommands(tool).length <= 5);
});

test("every reachable tool, repair and overlay state retains a valid completion with at most five actions", () => {
  for (const kind of ["tool", "repair", "overlay"]) for (let variant = 0; variant < 3; variant++) {
    const recipe = createMechanism("investigation", kind, variant);
    const queue = [initialMechanismState()], seen = new Set();
    for (let index = 0; index < queue.length; index++) {
      const state = queue[index], key = JSON.stringify({ ...state, items: [...state.items].sort() });
      if (seen.has(key)) continue;
      seen.add(key);
      let completed = state;
      for (const command of recipe.solution) {
        if (mechanismCommands(recipe, completed).includes(command)) {
          completed = advanceMechanism(recipe, completed, { command }).state;
        }
      }
      assert.equal(completed.solved, true, `${kind} ${variant} ${key}`);
      if (state.solved) continue;
      const commands = mechanismCommands(recipe, state);
      assert.ok(commands.length <= 5);
      for (const command of commands) queue.push(advanceMechanism(recipe, state, { command }).state);
    }
    assert.ok(seen.size > 3 && seen.size < 100);
  }
});

test("existing expanded protocols still select their original generators", () => {
  for (const [contentVersion, version] of [[EXPANDED_PLATFORM_VERSION, 5], [EXPANDED_DUNGEON_VERSION, 3], [EXPANDED_INVESTIGATION_VERSION, 3]]) {
    const state = replayLegendSession({ contentVersion, seed: 1, weapon: "none", actions: [] });
    assert.equal(state.level.version, version);
    assert.ok(state.level.rooms.every(room => !room.recipe && !room.recipes));
  }
});

test("recipe hotspots expose only retained-state-compatible collection commands and bounded visible targets", () => {
  for (const kind of ["tool", "repair", "overlay"]) for (const language of ["en", "fr"]) {
    const recipe = createMechanism("investigation", kind, 1);
    const copy = MECHANISM_COPY[language];
    const labels = { items: kind === "tool" ? copy.tools : copy.parts[kind], target: copy.point.target[kind] };
    let state = initialMechanismState();
    for (let count = 0; count <= labels.items.length; count++) {
      const spots = investigationHotspots(recipe, state, labels);
      assert.equal(spots.length, labels.items.length - count + 1);
      assert.equal(new Set(spots.map(spot => spot.id)).size, spots.length);
      for (const spot of spots) {
        assert.ok(spot.label && spot.sprite);
        assert.ok(spot.x >= 0 && spot.y >= 0 && spot.x + spot.width <= 640 && spot.y + spot.height <= 320);
        assert.ok(spot.width >= 48 && spot.height >= 48);
        if (spot.command) assert.ok(mechanismCommands(recipe, state).includes(spot.command));
      }
      if (count < labels.items.length) state = advanceMechanism(recipe, state, { command: `take:${count}` }).state;
    }
  }
});
