import test from "node:test";
import assert from "node:assert/strict";
import { createBike, rideBike, bikeHouse, bikeRouteDistance } from "../minigames/deliveries-bike.mjs";
import { createGame, input, result } from "../minigames/deliveries.mjs";

test("continuous riding is frame-independent, normalized diagonally, immutable and bounded", () => {
  const start = createBike(3);
  const next = rideBike(start, 1, 0, 0.5);
  assert.equal(start.x, 0);
  assert.equal(next.x, 0.8);
  assert.equal(next.distance, 0.8);
  let small = start;
  for (let i = 0; i < 50; i++) small = rideBike(small, 1, 0, 0.01);
  assert.ok(Math.abs(small.x - next.x) < 1e-12);
  const diagonal = rideBike(start, 1, 1, 0.5);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 0.8) < 1e-12);
  const bounded = rideBike(start, 1, 1, 100);
  assert.equal(bounded.x, 2);
  assert.equal(bounded.y, 2);
  assert.equal(bounded.distance, 4);
  const againstEdge = rideBike(bounded, 1, 1, 10);
  assert.equal(againstEdge.distance, 4);
  assert.equal(rideBike(start, -1, -1, 10).distance, 0);
});

test("house range uses a circular 0.36-cell zone and return distance only on completion", () => {
  const start = createBike(3);
  assert.equal(bikeHouse(start), 0);
  assert.equal(bikeHouse({ ...start, x: 0.36 }), 0);
  assert.equal(bikeHouse({ ...start, x: 0.361 }), null);
  assert.equal(bikeHouse({ ...start, x: 0.3, y: 0.3 }), null);
  assert.equal(bikeHouse({ ...start, x: 1, y: 2 }), 7);
  const bike = rideBike(start, 1, 0, 0.5);
  assert.equal(bikeRouteDistance(bike, false), 0.8);
  assert.equal(bikeRouteDistance(bike, true), 1.6);
});

test("score uses actual ridden distance, including detours, rather than delivery teleports", () => {
  let game = createGame({ random: () => 0 });
  game = input(game, { type: "ready" }, 0);
  game.targets.forEach((cell, parcel) => { game = input(game, { type: "deliver", parcel, cell }, 0); });
  const base = result(game);
  const ridden = result(game, base.optimalDistance * 4);
  assert.equal(ridden.score, 250);
  assert.equal(ridden.distance, base.optimalDistance * 4);
  assert.throws(() => result(game, NaN), /Invalid ridden distance/);
  assert.throws(() => result(game, -1), /Invalid ridden distance/);
});

test("invalid controls, grids and elapsed times fail explicitly", () => {
  assert.throws(() => createBike(2), /Invalid/);
  assert.throws(() => createBike(3.5), /Invalid/);
  assert.throws(() => rideBike(createBike(3), 2, 0, 1), /Invalid/);
  assert.throws(() => rideBike(createBike(3), 0, 1, -1), /Invalid/);
  assert.throws(() => rideBike(createBike(3), 0, 1, NaN), /Invalid/);
});
