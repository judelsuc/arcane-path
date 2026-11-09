import test from "node:test";
import assert from "node:assert/strict";
import { generatePlatformLevel, PLATFORM_PROFILES, PLATFORM_CHALLENGES } from "../minigames/legend-layout.mjs";
import { createPlatformer, stepPlatformer, platformRoomSolved, platformHazardActive } from "../minigames/legend-platformer.mjs";

const opposite = { left: "right", right: "left", up: "down", down: "up" };
const delta = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

function until(state, predicate, controls, limit = 900) {
  for (let tick = 0; tick < limit && !predicate(state); tick++) {
    state = stepPlatformer(state, typeof controls === "function" ? controls(state) : controls);
  }
  assert.ok(predicate(state), `movement failed at ${state.room}: ${state.x},${state.y}`);
  return state;
}

function walk(state, x) {
  return until(state, current => Math.abs(current.x - x) <= 3, current => {
    const right = current.x < x;
    return {
      right, left: !right,
      jump: current.grounded && current.level.rooms[current.room].hazards.some(hazard => {
        const distance = right ? hazard.x - current.x : current.x - hazard.x - hazard.width;
        return distance >= 32 && distance <= 42;
      }),
    };
  });
}

function approach(state, point) {
  state = walk(state, 311);
  state = until(state, current => current.y >= 262, { down: true });
  if (point.y < 262) state = until(state, current => current.y <= point.y, { up: true });
  for (let i = 0; i < 10; i++) state = stepPlatformer(state);
  state = walk(state, point.x);
  if (state.y < point.y - 5) state = until(state, current => current.y >= point.y - 5, { down: true });
  return state;
}

function useDoor(state, door) {
  state = solveRoom(state);
  const retries = state.retries;
  const entries = state.metrics.roomEntries;
  const visited = [...new Set([...state.metrics.roomsVisited, door.target])];
  state = approach(state, door);
  state = stepPlatformer(state, { interact: true });
  assert.equal(state.room, door.target, "door connects to declared neighbour");
  assert.equal(state.metrics.roomEntries, entries + 1);
  assert.deepEqual(state.metrics.roomsVisited, visited);
  assert.equal(state.retries, retries, "door route never requires damage or retries");
  assert.equal(state.x, door.arrivalX);
  assert.equal(state.y, door.arrivalY);
  return state;
}

function solveRoom(state) {
  const room = state.level.rooms[state.room];
  if (platformRoomSolved(state, room)) return state;
  const point = room.challenge;
  if (point.family === "switch") {
    state = approach(state, { x: 128, y: 262 });
    state = until(state, current => current.y <= 166, { up: true });
  } else if (point.family === "jump") {
    state = approach(state, { x: 390, y: 262 });
    state = stepPlatformer(state, { jump: true, right: true });
    state = until(state, current => current.x >= 436, { right: true });
  } else state = approach(state, point);
  state = stepPlatformer(state, { interact: true });
  assert.ok(platformRoomSolved(state, room), `challenge ${point.family} solved in room ${room.id}`);
  return state;
}

test("architecture is reproducible, non-overlapping and has a main path plus reversible dead ends", () => {
  for (let seed = 0; seed < 100; seed++) {
    const level = generatePlatformLevel({ seed });
    assert.deepEqual(level, generatePlatformLevel({ seed }));
    assert.equal(new Set(level.rooms.map(room => `${room.col},${room.row}`)).size, level.rooms.length);
    assert.equal(level.edges.length, level.rooms.length - 1);
    assert.equal(level.rooms.filter(room => room.main).length, 8);
    assert.equal(level.rooms.filter(room => room.reward).length, 2);
    assert.ok(level.rooms.some(room => room.reward === "health"));
    assert.ok(level.rooms.some(room => room.reward === "empty"));
    assert.ok(Object.isFrozen(level.rooms[0].connections));
    for (const room of level.rooms) {
      for (const door of room.connections) {
        const neighbour = level.rooms[door.target];
        const back = neighbour.connections.find(item => item.target === room.id);
        assert.ok(back);
        assert.equal(back.direction, opposite[door.direction]);
        assert.equal(neighbour.col - room.col, delta[door.direction][0]);
        assert.equal(neighbour.row - room.row, delta[door.direction][1]);
        assert.equal(door.arrivalX, back.x);
        assert.equal(door.arrivalY, back.y);
        if (["left", "right"].includes(door.direction)) assert.equal(door.y, back.y);
      }
    }
  }
  assert.notDeepEqual(generatePlatformLevel({ seed: 1 }), generatePlatformLevel({ seed: 2 }));
});

test("actual movement traverses every generated door in both directions and reaches the treasure", () => {
  for (let seed = 0; seed < 40; seed++) {
    const level = generatePlatformLevel({ seed, mainRooms: 4 + seed % 13, branches: seed % 5 });
    let state = createPlatformer({ level });
    function visit(parent = null) {
      const currentRoom = state.room;
      for (const door of level.rooms[currentRoom].connections) {
        if (door.target === parent) continue;
        state = useDoor(state, door);
        visit(currentRoom);
        state = useDoor(state, level.rooms[state.room].connections.find(item => item.target === currentRoom));
      }
    }
    visit();
    assert.equal(state.room, level.start);
    for (let room = 1; room < level.mainRooms; room++) {
      state = useDoor(state, level.rooms[state.room].connections.find(door => door.target === room));
    }
    state = solveRoom(state);
    state = approach(state, level.rooms[state.room].treasure);
    state = stepPlatformer(state, { interact: true });
    assert.equal(state.completed, true);
    assert.equal(state.retries, 0);
    assert.equal(state.metrics.roomsVisited.length, level.rooms.length);
    assert.equal(state.metrics.roomEntries, 2 * level.rooms.length + level.mainRooms - 2);
    assert.equal(state.metrics.trapHits, 0);
    assert.equal(stepPlatformer(state, { interact: true }), state);
  }
});

test("health supplies recover once, full-health supplies remain available and checkpoints do not farm health", () => {
  const level = generatePlatformLevel({ seed: 1 });
  let state = createPlatformer({ level });
  const target = level.rooms.find(room => room.pickup);
  function findPath(room, parent = null) {
    if (room.id === target.id) return [];
    for (const door of room.connections) {
      if (door.target === parent) continue;
      const suffix = findPath(level.rooms[door.target], room.id);
      if (suffix) return [door, ...suffix];
    }
    return null;
  }
  for (const door of findPath(level.rooms[0])) state = useDoor(state, door);
  state = approach(state, target.pickup);
  state = stepPlatformer(state, { interact: true });
  assert.equal(state.message, "healthFull");
  assert.equal(state.collected.length, 0);
  state = walk(state, 500);
  state = until(state, current => current.health === 2, { left: true });
  assert.equal(state.room, target.id);
  assert.deepEqual({ x: state.x, y: state.y }, state.checkpoint);
  state = approach(state, target.pickup);
  state = stepPlatformer(state, { interact: true });
  assert.equal(state.health, 3);
  assert.deepEqual(state.collected, [target.id]);
  state = stepPlatformer(state, { retry: true });
  assert.equal(state.health, 3);
  assert.deepEqual(state.collected, [target.id]);
});

test("generator bounds inputs and platform engine rejects forged layouts", () => {
  for (const options of [{ seed: -1 }, { seed: NaN }, { seed: 2 ** 32 }, { mainRooms: 3 }, { branches: 5 }]) {
    assert.throws(() => generatePlatformLevel(options), RangeError);
  }
  for (const mainRooms of [4, 16]) {
    assert.equal(generatePlatformLevel({ seed: 4, mainRooms, branches: 4 }).mainRooms, mainRooms);
  }
  assert.throws(() => createPlatformer({ level: { rooms: [] } }), TypeError);
});

test("manual checkpoint retries preserve damage; exhausted preview health recovers explicitly", () => {
  let state = createPlatformer({ level: generatePlatformLevel({ seed: 2 }) });
  assert.equal(state.level.rooms[0].challenge.family, "timing");
  const seekSpikes = current => ({ right: current.x < 428, left: current.x > 432, down: true });
  state = until(state, current => current.retries === 1, seekSpikes);
  assert.equal(state.health, 2);
  state = stepPlatformer(state, { retry: true });
  assert.equal(state.health, 2);
  state = until(state, current => current.retries === 3, seekSpikes);
  assert.equal(state.health, 1);
  state = until(state, current => current.retries === 4, seekSpikes);
  assert.equal(state.health, 3);
  assert.equal(state.message, "recovered");
});

test("reward tiers fix mandatory route length and challenge diversity before optional branches", () => {
  let length = 0, budget = 0;
  for (const [tier, profile] of Object.entries(PLATFORM_PROFILES)) {
    assert.ok(profile.rooms > length && profile.rewardBudget > budget);
    length = profile.rooms; budget = profile.rewardBudget;
    for (let seed = 0; seed < 30; seed++) {
      const level = generatePlatformLevel({ seed, tier, branches: seed % 5 });
      assert.equal(level.mainRooms, profile.rooms);
      assert.equal(level.rewardBudget, profile.rewardBudget);
      const main = level.rooms.filter(room => room.main);
      for (let i = 0; i < main.length; i += 4) {
        assert.deepEqual(new Set(main.slice(i, i + 4).map(room => room.challenge.family)),
          new Set(PLATFORM_CHALLENGES));
      }
      assert.ok(main.every((room, i) => !i || room.challenge.family !== main[i - 1].challenge.family));
      const distance = new Map([[0, 0]]), queue = [0];
      for (const id of queue) for (const door of level.rooms[id].connections) {
        if (!distance.has(door.target)) {
          distance.set(door.target, distance.get(id) + 1);
          queue.push(door.target);
        }
      }
      assert.equal(distance.get(level.treasureRoom), profile.rooms - 1, "branches cannot shorten mandatory route");
    }
  }
  assert.throws(() => generatePlatformLevel({ tier: "mythic" }), RangeError);
  assert.throws(() => generatePlatformLevel({ tier: "modest", mainRooms: 16 }), RangeError);
});

test("every reward tier completes through actual challenges without damage, including revisits", () => {
  for (const tier of Object.keys(PLATFORM_PROFILES)) for (let seed = 0; seed < 8; seed++) {
    const level = generatePlatformLevel({ seed, tier });
    let state = createPlatformer({ level });
    for (let id = 0; id < level.mainRooms - 1; id++) {
      state = useDoor(state, level.rooms[id].connections.find(door => door.target === id + 1));
    }
    state = solveRoom(state);
    state = approach(state, level.rooms[state.room].treasure);
    state = stepPlatformer(state, { interact: true });
    assert.equal(state.completed, true);
    assert.equal(state.solved.length, level.mainRooms);
    assert.equal(state.metrics.trapHits, 0);
    const retried = stepPlatformer(state, { retry: true });
    assert.equal(retried, state);
  }
});

test("forward gates require challenges; retries retain solved gates and hazard phases are deterministic", () => {
  let state = createPlatformer({ level: generatePlatformLevel({ seed: 2, tier: "modest", branches: 0 }) });
  const door = state.level.rooms[0].connections[0];
  state = approach(state, door);
  state = stepPlatformer(state, { interact: true });
  assert.equal(state.room, 0);
  assert.equal(state.message, "challengeLocked");
  state = solveRoom(state);
  const retry = stepPlatformer(state, { retry: true });
  assert.deepEqual(retry.solved, [0]);
  const hazard = state.level.rooms.find(room => room.challenge.family === "timing").hazards[0];
  assert.equal(Array.from({ length: 180 }, (_, tick) => platformHazardActive(hazard, tick)).filter(Boolean).length, 90);
  for (let tick = 0; tick < 180; tick++) assert.equal(platformHazardActive(hazard, tick), platformHazardActive(hazard, tick + 180));
});

test("jump bells require a rising jump rather than walking under them or standing on the ledge", () => {
  const seed = Array.from({ length: 30 }, (_, value) => value)
    .find(value => generatePlatformLevel({ seed: value, branches: 0 }).rooms[0].challenge.family === "jump");
  let state = createPlatformer({ level: generatePlatformLevel({ seed, branches: 0 }) });
  state = approach(state, { x: 440, y: 262 });
  state = stepPlatformer(state, { interact: true });
  assert.equal(platformRoomSolved(state), false);
  state = approach(state, { x: 390, y: 262 });
  state = stepPlatformer(state, { jump: true, right: true });
  state = until(state, current => current.x >= 436, { right: true });
  state = until(state, current => current.grounded && current.y === 210, {});
  state = stepPlatformer(state, { interact: true });
  assert.equal(platformRoomSolved(state), false, "standing on the ledge alone cannot ring the jump bell");
  state = stepPlatformer(state, { jump: true, interact: true });
  assert.equal(platformRoomSolved(state), true);
  const room = state.room;
  state = stepPlatformer(state, { retry: true });
  assert.ok(state.solved.includes(room), "checkpoint retry does not remove earned challenge progress");
});
