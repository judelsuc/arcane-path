import test from "node:test";
import assert from "node:assert/strict";
import { createInvestigation, investigate, investigationHint, INVESTIGATION_ACTIONS, LEGEND } from "../legend-adventure.mjs";
import { COPY } from "../legend-adventure-copy.mjs";
import { createPlatformer, stepPlatformer, ROOMS } from "../minigames/legend-platformer.mjs";

const act = (state, target) => investigate(state, { type: "act", target });
const travel = (state, location) => investigate(state, { type: "travel", location });

test("investigation can be completed using only legal actions, without consuming essential items", () => {
  let state = createInvestigation();
  assert.equal(investigationHint(state), "photo");
  assert.equal(act(state, "bell").archiveOpen, false);
  assert.equal(act(state, "portrait").archiveOpen, false);
  assert.equal(act(travel(state, "archive"), "cabinet").inventory.length, 0);
  assert.equal(act(travel(state, "booth"), "reel").completed, false);
  assert.equal(act(travel(state, "booth"), "mechanism").boothOpen, false);
  state = act(state, "photo");
  assert.equal(investigationHint(state), "permission");
  state = act(state, "bell");
  assert.equal(investigationHint(state), "key");
  state = act(travel(state, "archive"), "cabinet");
  assert.equal(investigationHint(state), "supplies");
  state = act(travel(state, "foyer"), "oil");
  state = act(state, "handle");
  state = act(state, "handle");
  assert.deepEqual(state.inventory, ["key", "oil", "handle"]);
  assert.equal(investigationHint(state), "mechanism");
  state = act(travel(state, "booth"), "mechanism");
  assert.equal(investigationHint(state), "reel");
  state = act(state, "reel");
  assert.equal(state.completed, true);
  assert.equal(investigationHint(state), "complete");
  assert.equal(act(state, "reel"), state);
  assert.equal(travel(state, "foyer"), state);
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.inventory));
});

test("every reachable investigation state still has a route to completion", () => {
  const identity = state => JSON.stringify([state.location, state.inspectedPhoto, state.archiveOpen,
    state.boothOpen, [...state.inventory].sort(), state.completed]);
  const first = createInvestigation();
  const states = new Map([[identity(first), first]]);
  const predecessors = new Map();
  const queue = [first];
  const complete = [];
  for (let index = 0; index < queue.length; index++) {
    assert.ok(index < 2000, "bounded puzzle state space");
    const state = queue[index];
    if (state.completed) complete.push(identity(state));
    const actions = [
      ...Object.keys(INVESTIGATION_ACTIONS).map(location => ({ type: "travel", location })),
      ...INVESTIGATION_ACTIONS[state.location].map(target => ({ type: "act", target })),
    ];
    for (const action of actions) {
      const next = investigate(state, action);
      const key = identity(next);
      if (!predecessors.has(key)) predecessors.set(key, new Set());
      predecessors.get(key).add(identity(state));
      if (!states.has(key)) { states.set(key, next); queue.push(next); }
    }
  }
  const winning = new Set(complete);
  for (let index = 0; index < complete.length; index++) {
    for (const key of predecessors.get(complete[index]) ?? []) {
      if (!winning.has(key)) { winning.add(key); complete.push(key); }
    }
  }
  assert.ok(winning.size > 20);
  assert.equal(winning.size, states.size, "no reachable puzzle state is a soft lock");
  for (const language of ["en", "fr"]) {
    for (const state of states.values()) {
      assert.ok(COPY[language].messages[state.message], `${language}: ${state.message}`);
      assert.ok(COPY[language].hints[investigationHint(state)]);
    }
  }
});

function until(state, predicate, controls, limit = 600) {
  for (let tick = 0; tick < limit && !predicate(state); tick++) {
    state = stepPlatformer(state, typeof controls === "function" ? controls(state) : controls);
  }
  assert.ok(predicate(state), `route did not reach target: ${JSON.stringify(state)}`);
  return state;
}

function walk(state, x) {
  return until(state, current => current.x >= x, current => ({
    right: true,
    jump: current.grounded && ROOMS[current.room].hazards.some(hazard =>
      hazard.x - current.x <= 40 && hazard.x - current.x > 32),
  }));
}

function openPassage() {
  let state = until(createPlatformer(), current => current.x >= 122, { right: true });
  state = until(state, current => current.y <= 166, { up: true });
  state = stepPlatformer(state, { interact: true });
  assert.equal(state.switchOn, true);
  state = walk(state, 594);
  assert.equal(state.retries, 0);
  return stepPlatformer(state, { interact: true });
}

test("platform adventure is completable through simulated movement, climbing, jumps and interactions", () => {
  let state = openPassage();
  assert.equal(state.room, 1);
  state = walk(state, 350);
  state = stepPlatformer(state, { interact: true });
  assert.equal(state.key, true);
  state = walk(state, 594);
  state = stepPlatformer(state, { interact: true });
  assert.equal(state.room, 2);
  state = walk(state, 516);
  state = stepPlatformer(state, { interact: true });
  assert.equal(state.completed, true);
  assert.equal(state.retries, 0);
  assert.equal(stepPlatformer(state, { interact: true }), state);
  assert.ok(Object.isFrozen(state));
  for (const copy of Object.values(COPY)) assert.ok(copy.platformMessages[state.message]);
});

test("platform locked exits, hazardous floor and manual checkpoint retries retain earned progress", () => {
  let state = createPlatformer();
  state = walk(state, 594);
  state = stepPlatformer(state, { interact: true });
  assert.equal(state.room, 0);
  assert.equal(state.message, "switchLocked");
  state = openPassage();
  state = until(state, current => current.retries === 1, { right: true });
  assert.equal(state.room, 1);
  assert.equal(state.x, 32);
  assert.equal(state.switchOn, true);
  state = walk(state, 350);
  state = stepPlatformer(state, { interact: true });
  state = stepPlatformer(state, { retry: true });
  assert.equal(state.key, true);
  assert.equal(state.retries, 2);
  assert.equal(state.x, 32);
});

test("preview engines reject fabricated states, actions and unsupported controls", () => {
  assert.throws(() => investigate({}, { type: "travel", location: "foyer" }), TypeError);
  assert.throws(() => investigate(createInvestigation(), null), TypeError);
  assert.throws(() => travel(createInvestigation(), "missing"), RangeError);
  assert.throws(() => act(createInvestigation(), "reel"), RangeError);
  assert.throws(() => stepPlatformer({}), TypeError);
  assert.throws(() => stepPlatformer(createPlatformer(), { teleport: true }), TypeError);
  assert.throws(() => stepPlatformer(createPlatformer(), { right: 1 }), TypeError);
});

test("legend and composed treasure have bilingual identity and bounded authored attributes", () => {
  assert.equal(LEGEND.treasure.nature, "film");
  assert.deepEqual(LEGEND.treasure.attributes, ["dusk-details", "sepia-skin"]);
  for (const language of ["en", "fr"]) {
    assert.ok(LEGEND.treasure.name[language]);
    assert.equal(LEGEND.accounts[language].length, 3);
    for (const target of Object.values(INVESTIGATION_ACTIONS).flat()) assert.ok(COPY[language].actions[target]);
  }
});
