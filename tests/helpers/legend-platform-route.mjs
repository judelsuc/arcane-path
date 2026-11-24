import assert from "node:assert/strict";
import { createPlatformer, stepPlatformer, platformRoomSolved } from "../../minigames/legend-platformer.mjs";
import { generatePlatformLevel } from "../../minigames/legend-layout.mjs";

export function platformCompletionActions(seed, { tier = "modest", paced = false } = {}) {
  let state = createPlatformer({ level: generatePlatformLevel({ seed, tier, paced }), healthMode: "journey" });
  const actions = [];
  function step(controls = {}) {
    controls = Object.fromEntries(Object.entries(controls).filter(([, value]) => value));
    const last = actions.at(-1);
    if (last?.ticks < 60 && JSON.stringify(last.controls) === JSON.stringify(controls)) last.ticks++;
    else actions.push({ controls, ticks: 1 });
    state = stepPlatformer(state, controls);
  }
  function until(predicate, controls) {
    for (let tick = 0; tick < 900 && !predicate(state); tick++) {
      step(typeof controls === "function" ? controls(state) : controls);
    }
    assert.ok(predicate(state), `movement failed at ${state.room}: ${state.x},${state.y}`);
  }
  function walk(x) {
    until(current => Math.abs(current.x - x) <= 3, current => {
      const right = current.x < x;
      return { right, left: !right, jump: current.grounded && current.level.rooms[current.room].hazards.some(hazard => {
        const distance = right ? hazard.x - current.x : current.x - hazard.x - hazard.width;
        return distance >= 32 && distance <= 42;
      }) };
    });
  }
  function approach(point) {
    walk(311);
    until(current => current.y >= 262, { down: true });
    if (point.y < 262) until(current => current.y <= point.y, { up: true });
    for (let tick = 0; tick < 10; tick++) step();
    walk(point.x);
    if (state.y < point.y - 5) until(current => current.y >= point.y - 5, { down: true });
    if (point.y === 262) until(current => current.grounded && current.y >= 262, { down: true });
  }
  for (let id = 0; id < state.level.mainRooms; id++) {
    const room = state.level.rooms[id];
    for (const point of room.challenges ?? [room.challenge]) {
      if (point.family === "switch") {
        approach({ x: point.x, y: 262 });
        until(current => current.y <= point.y, { up: true });
      } else if (point.family === "jump") {
        approach({ x: 390, y: 262 });
        step({ jump: true, right: true });
        until(current => current.x >= 436, { right: true });
      } else approach(point);
      step({ interact: true });
    }
    assert.ok(platformRoomSolved(state, room),
      `unsolved room ${id}: ${JSON.stringify({ challenges: room.challenges, activated: state.activated, x: state.x, y: state.y, message: state.message })}`);
    const door = room.connections.find(item => item.target === id + 1);
    approach(door ?? room.treasure);
    step({ interact: true });
    if (door) assert.equal(state.room, door.target);
  }
  assert.equal(state.completed, true);
  assert.equal(state.metrics.trapHits, 0);
  return actions;
}
