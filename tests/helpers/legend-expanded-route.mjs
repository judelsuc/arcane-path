import assert from "node:assert/strict";
import { generateInvestigation, createGeneratedInvestigation, stepInvestigation, investigationWitnessPresent } from "../../minigames/legend-investigation.mjs";
import { generateDungeon, createDungeon, dungeonGateOpen, dungeonTarget, DUNGEON_RUNES, DUNGEON_DIRECTIONS } from "../../minigames/legend-dungeon.mjs";
import { findDungeonRoute } from "./legend-dungeon-route.mjs";

export function expandedInvestigationRoute(seed, { tier = "modest", mistakes = false, catalogue = false, decoys = false, pullFirstDecoy = false } = {}) {
  let state = createGeneratedInvestigation({ level: generateInvestigation({ seed, tier, paced: true, expanded: true, catalogue, decoys }) });
  const actions = [];
  function act(command) {
    const action = { type: "act", command }; actions.push(action); state = stepInvestigation(state, action);
  }
  if (pullFirstDecoy) act("decoy:pull");
  for (const room of state.level.rooms) {
    if (room.id) {
      const action = { type: "travel", room: room.id }; actions.push(action); state = stepInvestigation(state, action);
    }
    if (room.concealed) {
      act("inspect");
      if (mistakes) act(`search:${(room.order[0] + 1) % 3}`);
      act(`search:${room.order[0]}`);
    }
    if (["evidence", "cipher", "sequence", "alignment", "exchange", "tool", "repair"].includes(room.family)) act("inspect");
    if (room.family === "deduction") { act("inspect:0"); act("inspect:1"); }
    if (room.family === "witnesses") for (const witness of [0, 1]) {
      if (!investigationWitnessPresent(state, witness)) act("wait");
      act(`witness:${witness}`);
    }
    if (["evidence", "cipher", "deduction", "witnesses"].includes(room.family)) {
      if (mistakes) act(`choose:${(room.answer + 1) % 3}`);
      act(`choose:${room.answer}`);
    } else if (room.family === "sequence") {
      if (mistakes) act(`press:${(room.order[0] + 1) % 3}`);
      for (const index of room.order) act(`press:${index}`);
    } else if (room.family === "tool") {
      if (mistakes) { const wrong = (room.answer + 1) % 3; act(`take:${wrong}`); act(`use:${wrong}`); }
      act(`take:${room.answer}`); act(`use:${room.answer}`);
    } else if (["repair", "overlay", "assembly"].includes(room.family)) {
      act("take:0"); act("take:1"); act("combine");
      if (room.family === "repair") act("install");
      if (room.family === "overlay") {
        if (mistakes) act(`choose:${(room.answer + 1) % 3}`);
        act(`choose:${room.answer}`);
      }
    } else if (room.family === "exchange") { act(`take:${room.variant}`); act(`offer:${room.answer}`); }
    else if (room.family === "alignment") {
      for (let i = 0; i < 3; i++) for (let count = 0; count < room.order[i]; count++) act(`rotate:${i}`);
      act("combine");
    }
    if (room.seal !== undefined) {
      if (mistakes) act(`verify:${(room.seal + 1) % 3}`);
      act(`verify:${room.seal}`);
    }
    assert.ok(state.progress[room.id].solved, `unsolved ${room.family}, ${seed}, ${room.id}`);
  }
  assert.ok(state.completed);
  return { state, actions };
}

export function expandedDungeonRoute(seed, { tier = "modest", secrets = true, catalogue = false } = {}) {
  let state = createDungeon({ level: generateDungeon({ seed, tier, paced: true, expanded: true, catalogue }), healthMode: "journey" });
  const actions = [];
  function route(predicate) {
    const found = findDungeonRoute(state, predicate);
    actions.push(...found.actions); state = found.state;
  }
  function operate(point, predicate) {
    const roomId = state.room;
    route(next => next.room === roomId && predicate(next));
    assert.ok(predicate(state), `operation seed${seed} room${state.room} ${JSON.stringify(point)} from ${state.x},${state.y}: ${state.message}; secrets ${state.secrets}`);
  }
  function enter(door) {
    const [x, y] = DUNGEON_DIRECTIONS[door.direction].door;
    if (door.secret) operate({ x, y }, next => next.secrets.includes(`${state.room}:${door.target}`));
    route(next => next.room === door.target);
  }
  while (!state.completed) {
    const room = state.level.rooms[state.room];
    for (const mechanism of room.mechanisms) {
      const done = next => next.activated.includes(`${room.id}:${mechanism}`);
      if (mechanism === "spikes" || done(state)) continue;
      if (["block", "plate", "weight"].includes(mechanism)) route(done);
      else if (mechanism === "runes") for (const index of room.runeOrder) {
        operate(DUNGEON_RUNES[index], next => done(next) || next.runes.length > room.runeOrder.indexOf(index));
      }
      else {
        if (mechanism === "torch") operate(room.flame, next => next.flames.includes(room.id));
        operate(dungeonTarget(room, mechanism), done);
      }
    }
    assert.ok(dungeonGateOpen(state));
    if (secrets) for (const door of room.connections.filter(door => state.level.rooms[door.target].hidden)) {
      enter(door);
      const hidden = state.level.rooms[state.room];
      operate(hidden.stash, next => next.stashes.includes(hidden.id));
      enter(hidden.connections[0]);
    }
    if (room.id === state.level.treasureRoom) operate({ x: 6, y: 3 }, next => next.completed);
    else enter(room.connections.find(door => door.target === room.id + 1));
  }
  return { state, actions };
}
