import test from "node:test";
import assert from "node:assert/strict";
import { available, difficulty, createGame, input, advance, result } from "../minigames/deliveries.mjs";

const game = level => createGame({ level, random: () => 0.5 });
const move = (g, parcel, cell = g.targets[parcel]) => input(g, { type: "deliver", parcel, cell }, g.lastNow + 1);
const permutations = list => list.length ? list.flatMap((v, i) =>
  permutations(list.filter((_, j) => i !== j)).map(tail => [v, ...tail])) : [[]];
function bestOrder(g) {
  const grid = difficulty(g.level).grid;
  const distance = (a, b) => Math.abs(a % grid - b % grid) + Math.abs(Math.floor(a / grid) - Math.floor(b / grid));
  return permutations(g.targets.map((_, i) => i)).sort((a, b) => {
    const length = order => [0, ...order.map(i => g.targets[i]), 0].slice(1).reduce((sum, c, i) =>
      sum + distance(i ? g.targets[order[i - 1]] : 0, c), 0);
    return length(a) - length(b);
  })[0];
}

test("availability uses only a mapped town cell and its own named public delivery venue", () => {
  const cell = { terrain: "place", settlements: [{ osmId: "node/1", name: "Town" }],
    pois: [{ osmId: "node/2", name: "Post", category: "amenity", tags: { amenity: "post_office" } }] };
  assert.equal(available(cell), true);
  for (const bad of [null, {}, { ...cell, unavailable: true }, { ...cell, terrain: "forest" },
    { ...cell, settlements: [] }, { ...cell, settlements: [{ name: "Invented" }] },
    { ...cell, pois: [] }, { ...cell, nearby: cell.pois, pois: [] }]) assert.equal(available(bad), false);
  for (const tags of [{ amenity: "police" }, { amenity: "post_office", access: "private" },
    { amenity: "post_office", access: "no" }, { amenity: "post_office", disused: "yes" },
    { amenity: "post_office", abandoned: "yes" }]) {
    assert.equal(available({ ...cell, pois: [{ ...cell.pois[0], tags }] }), false);
  }
  assert.equal(available({ ...cell, pois: [{ ...cell.pois[0], name: "" }] }), false);
  assert.equal(available({ ...cell, pois: [{ ...cell.pois[0], osmId: "fictional" }] }), false);
  assert.equal(available({ ...cell, pois: [{ ...cell.pois[0], category: "shop", tags: { shop: "bakery" } }] }), true);
});

test("perfect memory and optimal route earns maximum at every skill level", () => {
  for (let level = 0; level <= 4; level++) {
    let g = input(game(level), { type: "ready" }, 1);
    const initial = g, order = bestOrder(g);
    for (const parcel of order) g = move(g, parcel);
    const r = result(g);
    assert.equal(r.completed, true);
    assert.equal(r.score, r.maxScore);
    assert.equal(r.distance, r.optimalDistance);
    assert.equal(r.rewardMultiplier, 1 + level * 0.5);
    assert.equal(initial.delivered.some(Boolean), false);
    assert.ok(Object.isFrozen(g) && Object.isFrozen(g.targets) && Object.isFrozen(g.delivered));
    assert.deepEqual(input(g, { type: "cancel" }, g.lastNow), g);
  }
});

test("route order matters and wrong addresses consume distance and scoring", () => {
  let g = input(game(2), { type: "ready" }, 0);
  const orders = permutations(g.targets.map((_, i) => i));
  const outcomes = orders.map(order => result(order.reduce((state, p) => move(state, p), g)));
  assert.ok(outcomes.some(r => r.score < r.maxScore));
  g = move(g, 0, 0);
  assert.equal(g.feedback, "wrong");
  assert.equal(g.mistakes, 1);
  assert.equal(g.delivered[0], false);
  for (const parcel of bestOrder(g)) g = move(g, parcel);
  assert.equal(result(g).completed, true);
  assert.ok(result(g).score <= 900);
});

test("three failures, deadline, delayed advance, duplicates and cancellation", () => {
  let g = input(game(0), { type: "ready" }, 0);
  for (let i = 0; i < 3; i++) g = move(g, 0, 0);
  assert.equal(g.phase, "failed");
  assert.equal(result(g).score, 0);
  assert.equal(advance(game(0), difficulty(0).memoryMs).phase, "route");
  assert.equal(advance(game(0), 1e6).phase, "failed");
  let timed = input(game(0), { type: "ready" }, 0);
  timed = input(timed, { type: "deliver", parcel: 0, cell: timed.targets[0] }, difficulty(0).routeMs);
  assert.equal(timed.feedback, "timeout");
  assert.equal(timed.delivered[0], false);
  let duplicate = move(input(game(0), { type: "ready" }, 0), 0);
  const oldDistance = duplicate.distance;
  duplicate = move(duplicate, 0);
  assert.equal(duplicate.distance, oldDistance);
  for (const start of [game(0), input(game(0), { type: "ready" }, 0)]) {
    const cancelled = input(start, { type: "cancel" }, 1e6);
    assert.equal(result(cancelled).cancelled, true);
    assert.equal(result(cancelled).score, 0);
    assert.equal(advance(cancelled, 2e6).phase, "cancelled");
  }
});

test("difficulty increases route size, memory pressure and potential pay", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(level => difficulty(level).parcels), [4, 4, 5, 6, 7]);
  for (let level = 1; level <= 4; level++) {
    const before = difficulty(level - 1), after = difficulty(level);
    assert.ok(after.parcels >= before.parcels && after.grid >= before.grid);
    assert.ok(after.memoryMs < before.memoryMs && after.rewardMultiplier > before.rewardMultiplier);
    assert.equal(game(level).targets.length, after.parcels);
  }
});

test("malformed options, randomness, states, actions and clocks are rejected", () => {
  for (const level of [-1, 5, 0.5, NaN, "1", null]) assert.throws(() => difficulty(level), TypeError);
  for (const options of [null, [], "x", { extra: 1 }, { now: -1 }, { now: Infinity },
    { random: 2 }, { random: () => 1 }, { random: () => NaN }, { resonance: "yes" }]) {
    assert.throws(() => createGame(options), TypeError);
  }
  const g = game(0);
  for (const state of [null, {}, { ...g, extra: [] }, { ...g, targets: [1, 1, 2] },
    { ...g, delivered: [true, true, true] }, { ...g, phase: "bogus" },
    { ...g, distance: NaN }, { ...g, position: 100 }, { ...g, lastNow: -1 },
    { ...g, routeStartedAt: 0 }, { ...g, mistakes: 3 },
    { ...g, targets: [1, 2, ,] }, { ...g, delivered: [false, false, ,] },
    { ...g, phase: "route", routeStartedAt: 0, distance: 1000 }]) {
    assert.throws(() => result(state), TypeError);
  }
  for (const action of [null, [], {}, { type: "teleport" }, { type: "deliver" },
    { type: "cancel", reward: 1 }, { type: "deliver", parcel: 100, cell: 0 },
    { type: "deliver", parcel: 0, cell: -1 }, { type: "deliver", parcel: 0, cell: NaN }]) {
    assert.throws(() => input(g, action, 0), TypeError);
  }
  for (const now of [-1, NaN, Infinity, "0"]) assert.throws(() => advance(g, now), TypeError);
  assert.throws(() => advance(advance(g, 10), 9), TypeError);
  assert.deepEqual(game(0), game(0));
});

test("Chariot marks a home parcel only in memory and reports an earnings multiplier without changing score", () => {
  const normal = createGame({ level: 0, random: () => 0.5 });
  const resonant = createGame({ level: 0, random: () => 0.5, resonance: true });
  assert.equal(normal.resonance, false);
  assert.equal(normal.homeParcel, null);
  assert.equal(resonant.resonance, true);
  assert.equal(resonant.homeParcel, 0);
  assert.throws(() => result({ ...resonant, homeParcel: null }), TypeError);
  let game = input(resonant, { type: "ready" }, 1);
  for (let parcel = 0; parcel < game.targets.length; parcel++) {
    game = input(game, { type: "deliver", parcel, cell: game.targets[parcel] }, game.lastNow + 1);
  }
  const finished = result(game);
  assert.equal(finished.completed, true);
  assert.ok(finished.score <= finished.maxScore);
});
