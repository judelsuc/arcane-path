import assert from "node:assert/strict";
import { createDungeon, generateDungeon, stepDungeon } from "../../minigames/legend-dungeon.mjs";

export function findDungeonRoute(initial, predicate, { attack = false, damage = false } = {}) {
  const queue = [{ state: initial, previous: null, action: null }];
  const seen = new Set();
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index], state = node.state;
    if (predicate(state)) {
      const actions = [];
      for (let current = node; current.previous; current = current.previous) actions.unshift(current.action);
      return { state, actions };
    }
    if (state.room !== initial.room || state.failed || state.completed ||
        !damage && (state.metrics.trapHits > initial.metrics.trapHits ||
          state.metrics.creatureHits > initial.metrics.creatureHits)) continue;
    const key = JSON.stringify([state.x, state.y, state.facing, state.tick % 12, state.health,
      state.invulnerable, state.blocks[state.room].x, state.solved.includes(state.room), state.defeated.includes(state.room),
      state.activated?.filter(id => id.startsWith(`${state.room}:`)).sort()]);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const type of ["up", "right", "down", "left", "interact", "wait", ...(attack ? ["attack"] : [])]) {
      const action = { type };
      queue.push({ state: stepDungeon(state, action), previous: node, action });
    }
  }
  assert.fail(`No route from room ${initial.room}, seed ${initial.level.seed}`);
}

export function dungeonCompletionActions(seed, weapon = "none", roomCount = 4, paced = false) {
  let state = createDungeon({ level: generateDungeon({ seed, roomCount, paced }), weapon, healthMode: "journey" });
  const actions = [];
  while (!state.completed) {
    const room = state.room;
    const route = findDungeonRoute(state, next => room === state.level.treasureRoom
      ? next.completed : next.room === room + 1);
    state = route.state;
    actions.push(...route.actions);
  }
  return actions;
}
