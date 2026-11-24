import test from "node:test";
import assert from "node:assert/strict";
import { createDungeon, generateDungeon, stepDungeon, dungeonCreature, dungeonGateOpen,
  DUNGEON_PROFILES, DUNGEON_MECHANISMS, DUNGEON_DIRECTIONS } from "../minigames/legend-dungeon.mjs";
import { findDungeonRoute as findRoute } from "./helpers/legend-dungeon-route.mjs";

test("reward tiers require strictly longer reproducible routes with four non-adjacent mechanism families", () => {
  assert.deepEqual(Object.values(DUNGEON_PROFILES).map(profile => profile.rooms), [8, 16, 32]);
  let previousRooms = 0, previousBudget = 0;
  for (const [tier, profile] of Object.entries(DUNGEON_PROFILES)) {
    assert.ok(profile.rooms > previousRooms && profile.rewardBudget > previousBudget);
    previousRooms = profile.rooms; previousBudget = profile.rewardBudget;
    for (let seed = 0; seed < 30; seed++) {
      const level = generateDungeon({ seed, tier });
      assert.deepEqual(level, generateDungeon({ seed, tier }));
      assert.equal(level.rooms.length, profile.rooms);
      assert.equal(level.treasureRoom, profile.rooms - 1);
      assert.equal(level.rewardBudget, profile.rewardBudget);
      for (let start = 0; start < level.rooms.length; start += 4) {
        assert.deepEqual(new Set(level.rooms.slice(start, start + 4).map(room => room.mechanism)),
          new Set(DUNGEON_MECHANISMS));
      }
      for (let start = 0; start < level.rooms.length; start += 2) {
        assert.deepEqual(new Set(level.rooms.slice(start, start + 2).map(room => room.creature)),
          new Set(["bat", "rat"]));
      }
      assert.ok(level.rooms.every((room, i) => !i || room.mechanism !== level.rooms[i - 1].mechanism));
      assert.ok(Object.isFrozen(level.rooms[0].connections));
      const coordinates = [{ x: 0, y: 0 }];
      for (let i = 0; i < level.rooms.length - 1; i++) {
        const edge = level.rooms[i].connections.find(door => door.target === i + 1);
        const direction = DUNGEON_DIRECTIONS[edge.direction];
        coordinates.push({ x: coordinates[i].x + direction.x, y: coordinates[i].y + direction.y });
        const back = level.rooms[i + 1].connections.find(door => door.target === i);
        const reverse = DUNGEON_DIRECTIONS[back.direction];
        assert.equal(direction.x + reverse.x, 0);
        assert.equal(direction.y + reverse.y, 0);
      }
      assert.equal(new Set(coordinates.map(point => `${point.x},${point.y}`)).size, coordinates.length);
    }
  }
  assert.notDeepEqual(generateDungeon({ seed: 1 }), generateDungeon({ seed: 2 }));
});

test("all tiers are completable unarmed without any trap or creature damage, with reversible doors", () => {
  for (const tier of Object.keys(DUNGEON_PROFILES)) {
    for (let seed = 0; seed < 8; seed++) {
      let state = createDungeon({ level: generateDungeon({ seed, tier }) });
      while (state.room < state.level.treasureRoom) {
        const room = state.room;
        const route = findRoute(state, next => next.room === room + 1 && next.health === 3);
        state = route.state;
        assert.ok(state.solved.includes(room) || state.level.rooms[room].mechanism === "spikes");
        const back = findRoute(state, next => next.room === room && next.health === 3);
        state = findRoute(back.state, next => next.room === room + 1 && next.health === 3).state;
      }
      state = findRoute(state, next => next.completed && next.health === 3).state;
      assert.equal(state.metrics.roomsVisited.length, state.level.rooms.length);
      assert.equal(state.metrics.trapHits, 0);
      assert.equal(state.metrics.creatureHits, 0);
      assert.deepEqual(state.defeated, [], "combat is never a prerequisite");
      assert.equal(stepDungeon(state, { type: "attack" }), state);
    }
  }
});

test("combat requires an equipped weapon, facing and reach; kills grant no item or health", () => {
  const level = generateDungeon({ seed: 1 });
  const armed = createDungeon({ level, weapon: "sword" });
  const route = findRoute(armed, state => {
    const creature = dungeonCreature(state), facing = DUNGEON_DIRECTIONS[state.facing];
    return creature && creature.x === state.x + facing.x * 2 && creature.y === state.y + facing.y * 2;
  });
  for (const weapon of ["none", "knife", "sword"]) {
    let state = createDungeon({ level, weapon });
    for (const action of route.actions) state = stepDungeon(state, action);
    const attacked = stepDungeon(state, { type: "attack" });
    assert.equal(attacked.defeated.includes(0), weapon === "sword");
    assert.ok(attacked.health <= state.health);
    if (weapon === "none") assert.equal(attacked.message, "unarmed");
  }
  const knife = createDungeon({ level, weapon: "knife" });
  const knifeRoute = findRoute(knife, state => state.defeated.includes(0), { attack: true });
  assert.equal(knifeRoute.state.health, 3);
  assert.equal(knifeRoute.state.metrics.creatureHits, 0);
});

test("damage is separately accounted and retries neither heal nor reset hits; death is terminal", () => {
  let state = createDungeon({ level: generateDungeon({ seed: 2 }) });
  state = findRoute(state, next => next.health === 2, { damage: true }).state;
  assert.equal(state.metrics.trapHits + state.metrics.creatureHits, 1);
  const retry = stepDungeon(state, { type: "retry" });
  assert.equal(retry.health, 2);
  assert.equal(retry.metrics.trapHits + retry.metrics.creatureHits, 1);
  state = findRoute(retry, next => next.failed, { damage: true }).state;
  assert.equal(state.health, 0);
  assert.equal(stepDungeon(state, { type: "retry" }), state);
});

test("journey health mode retains collisions beyond three hits without inventing health or healing", () => {
  let state = createDungeon({ level: generateDungeon({ seed: 2 }), healthMode: "journey" });
  for (let hits = 1; hits <= 4; hits++) {
    state = findRoute(state, next => next.metrics.creatureHits + next.metrics.trapHits === hits, { damage: true }).state;
    assert.equal(state.health, null);
    assert.equal(state.failed, false);
    const before = state.metrics;
    state = stepDungeon(state, { type: "retry" });
    assert.deepEqual(state.metrics, before);
  }
  assert.throws(() => createDungeon({ healthMode: "infinite" }));
});

test("forward locks cannot be skipped, input/state/profile validation is strict", () => {
  let state = createDungeon({ level: generateDungeon({ seed: 1 }) });
  if (!dungeonGateOpen(state)) {
    const forward = state.level.rooms[0].connections[0];
    const direction = DUNGEON_DIRECTIONS[forward.direction];
    const route = findRoute(state, next => next.x === direction.door[0] - direction.x &&
      next.y === direction.door[1] - direction.y && !dungeonGateOpen(next));
    state = stepDungeon(route.state, { type: forward.direction });
    assert.equal(state.room, 0);
    assert.equal(state.message, "locked");
  }
  assert.throws(() => generateDungeon({ tier: "mythic" }));
  assert.throws(() => generateDungeon({ seed: -1 }));
  assert.throws(() => createDungeon({ level: { ...state.level } }));
  assert.throws(() => createDungeon({ weapon: "wand" }));
  assert.throws(() => stepDungeon({ ...state }, { type: "up" }));
  assert.throws(() => stepDungeon(state, { type: "up", completed: true }));
  assert.throws(() => stepDungeon(state, { type: "teleport" }));
});
