import assert from "node:assert/strict";
import { createPlatformer, stepPlatformer, PLAYER, platformLadders, platformRoomSolved, platformAnimal, platformArrow,
  platformHazardActive, PLATFORM_RUNES } from "../../minigames/legend-platformer.mjs";
import { generatePlatformLevel } from "../../minigames/legend-layout.mjs";

const floor = { x: 0, y: 288, width: 640 };
const centre = surface => surface.x + surface.width / 2 - PLAYER.width / 2;
const supports = (surface, state) => Math.abs(state.y + PLAYER.height - surface.y) < .1 &&
  state.x + PLAYER.width > surface.x && state.x < surface.x + surface.width;

export function variedPlatformRoute(seed, { tier = "modest", branches = 2, visitBranches = false, expanded = false } = {}) {
  const level = generatePlatformLevel({ seed, tier, branches, paced: true, varied: true, expanded });
  let state = createPlatformer({ level, healthMode: "journey" });
  const actions = [];
  function record(controls) {
    const last = actions.at(-1);
    if (last?.ticks < 60 && JSON.stringify(last.controls) === JSON.stringify(controls)) last.ticks++;
    else actions.push({ controls, ticks: 1 });
    const previous = state;
    state = stepPlatformer(state, controls);
    if (expanded) assert.equal(state.metrics.creatureHits, previous.metrics.creatureHits,
      `seed${seed} room${previous.room} tick${previous.ticks} ${previous.x},${previous.y} ${JSON.stringify(controls)} animal ${JSON.stringify(platformAnimal(previous))}`);
  }
  function simulate(start, controls, predicate, limit = 240) {
    let current = start;
    const inputs = [];
    for (let tick = 0; tick < limit && !predicate(current); tick++) {
      const input = controls(current, tick);
      inputs.push(input);
      current = stepPlatformer(current, input);
      if (current.metrics.trapHits !== start.metrics.trapHits ||
          current.metrics.creatureHits !== start.metrics.creatureHits || current.room !== start.room) return null;
    }
    return predicate(current) ? { state: current, inputs } : null;
  }
  function walk(start, x) {
    return simulate(start, current => {
      const right = current.x < x;
      const animal = platformAnimal(current), arrow = platformArrow(current);
      const threat = [animal, arrow].filter(Boolean).some(item =>
        Math.abs(current.y - item.y) < 30 && Math.abs(current.x - item.x) < 65);
      const jump = current.grounded && (threat || current.y >= 250 && level.rooms[current.room].hazards.some(hazard => {
        const distance = right ? hazard.x - current.x - PLAYER.width : current.x - hazard.x - hazard.width;
        return distance >= 20 && distance <= 32 && (!expanded || platformHazardActive(hazard, current.ticks + 12));
      }));
      return { ...(Math.abs(current.x - x) > 2 ? right ? { right: true } : { left: true } : {}), ...(jump ? { jump: true } : {}) };
    }, current => Math.abs(current.x - x) <= 3 && current.grounded);
  }
  function moveTo(point, airborne = false) {
    const room = level.rooms[state.room];
    const surfaces = [floor, ...room.platforms];
    const target = surfaces.find(surface => Math.abs(surface.y - (point.y + (airborne ? 64 : 26))) < .1 &&
      point.x >= surface.x - 3 && point.x + PLAYER.width <= surface.x + surface.width + 3);
    assert.ok(target, `no support for ${JSON.stringify(point)} in ${room.archetype}`);
    const queue = [{ state, inputs: [] }];
    const visited = new Set();
    while (queue.length) {
      const node = queue.shift();
      const source = surfaces.find(surface => supports(surface, node.state));
      if (!source) continue;
      const key = `${source.x}:${source.y}:${Math.round(node.state.x / 40)}${expanded ? `:${Math.floor(node.state.ticks % 3600 / 60)}` : ""}`;
      if (source === target) {
        const result = walk(node.state, point.x);
        if (result && supports(target, result.state)) {
          for (const input of [...node.inputs, ...result.inputs]) record(input);
          if (airborne) {
            const activated = state.activated.length;
            for (let tick = 0; tick < 60; tick++) {
              record({ ...(tick === 0 ? { jump: true } : {}),
                ...(state.activated.length === activated ? { interact: true } : {}) });
              if (tick > 0 && state.grounded) break;
            }
          }
          return;
        }
        if (result && !supports(source, result.state)) {
          queue.push({ state: result.state, inputs: [...node.inputs, ...result.inputs] });
        }
      }
      if (visited.has(key)) continue;
      visited.add(key);
      if (expanded) {
        const waited = simulate(node.state, () => ({}), current => current.ticks >= node.state.ticks + 60);
        if (waited) queue.push({ state: waited.state, inputs: [...node.inputs, ...waited.inputs] });
      }
      for (const destination of surfaces) {
        if (destination === source || destination.y < source.y - 62) continue;
        const landings = [centre(source), centre(destination), destination.x + 12,
          destination.x + destination.width - 30, ...(destination === target ? [point.x] : [])];
        for (const landing of new Set(landings)) {
          const x = Math.max(destination.x + 8, Math.min(destination.x + destination.width - 26, landing));
          const takeoff = Math.max(source.x + 8, Math.min(source.x + source.width - 26, x));
          if (Math.abs(takeoff - x) > 92) continue;
          const walked = walk(node.state, takeoff);
          if (walked && !supports(source, walked.state)) {
            queue.push({ state: walked.state, inputs: [...node.inputs, ...walked.inputs] });
          }
          if (!walked || !supports(source, walked.state)) continue;
          const jump = destination.y <= source.y;
          const result = simulate(walked.state, (current, tick) => ({
            ...(Math.abs(current.x - x) > 2 ? current.x < x ? { right: true } : { left: true } : {}),
            ...(jump && tick === 0 ? { jump: true } : {}),
            ...(!jump && current.y + PLAYER.height <= source.y + 12 ? { down: true } : {}),
          }), current => current !== walked.state && current.grounded &&
            (supports(destination, current) || Math.abs(current.y - walked.state.y) > 1));
          if (result) queue.push({ state: result.state, inputs: [...node.inputs, ...walked.inputs, ...result.inputs] });
        }
      }
      for (const ladder of platformLadders(room)) {
        if (source.y < ladder.top || source.y > ladder.bottom) continue;
        if (ladder.x < source.x || ladder.x > source.x + source.width) continue;
        const walked = walk(node.state, ladder.x - PLAYER.width / 2);
        if (walked && !supports(source, walked.state)) {
          queue.push({ state: walked.state, inputs: [...node.inputs, ...walked.inputs] });
        }
        if (!walked || !supports(source, walked.state)) continue;
        const up = source.y > ladder.top;
        const y = (up ? ladder.top : ladder.bottom) - PLAYER.height;
        const result = simulate(walked.state, () => up ? { up: true } : { down: true },
          current => Math.abs(current.y - y) < .1 && current.grounded);
        if (result) queue.push({ state: result.state, inputs: [...node.inputs, ...walked.inputs, ...result.inputs] });
      }
    }
    assert.fail(`seed ${seed}: unreachable ${JSON.stringify(point)} from ${state.x},${state.y} in ${room.id}:${room.archetype}:${room.mirrored}; ${visited.size} regions searched`);
  }
  function solve() {
    const room = level.rooms[state.room];
    for (const [index, point] of (room.challenges ?? []).entries()) {
      if (state.activated.includes(`${room.id}:${index}`)) continue;
      if (index === 0 && point.family === "runes") {
        for (const rune of room.runeOrder) {
          moveTo(PLATFORM_RUNES[rune]);
          record({ interact: true }); record({});
        }
        continue;
      }
      if (point.family === "torch") {
        moveTo(room.flame); record({ interact: true });
      }
      moveTo(point, point.family === "jump");
      if (point.family === "plate") record({});
      else if (point.family === "crank") for (let tick = 0; tick < 60; tick++) record({ interact: true });
      else if (point.family !== "jump") record({ interact: true });
      assert.ok(state.activated.includes(`${room.id}:${index}`), `mechanism ${point.family} ${room.archetype}`);
    }
    assert.ok(platformRoomSolved(state, room), `seed${seed} room${room.id} ${room.archetype} mechanisms ${JSON.stringify(room.challenges)} activated ${state.activated} runes ${state.runes}`);
  }
  function enter(door) {
    solve();
    moveTo(door);
    record({ interact: true });
    if (door.secret && state.room !== door.target) record({ interact: true });
    assert.equal(state.room, door.target, `door in ${level.rooms[state.room].archetype}`);
  }
  if (visitBranches) {
    function visit(parent = null) {
      const room = level.rooms[state.room];
      if (room.stash) { moveTo(room.stash); record({ interact: true }); }
      for (const door of room.connections) {
        if (door.target === parent) continue;
        enter(door);
        visit(room.id);
        enter(level.rooms[state.room].connections.find(back => back.target === room.id));
      }
    }
    visit();
  }
  for (let id = 0; id < level.mainRooms - 1; id++) {
    enter(level.rooms[id].connections.find(door => door.target === id + 1));
  }
  solve();
  moveTo(level.rooms[state.room].treasure);
  record({ interact: true });
  assert.equal(state.completed, true);
  assert.equal(state.metrics.trapHits, 0);
  if (expanded) assert.equal(state.metrics.creatureHits, 0);
  return { actions, state, level };
}
