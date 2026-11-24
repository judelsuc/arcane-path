import test from "node:test";
import assert from "node:assert/strict";
import { adventureCosts, dungeonCosts } from "../adventure-costs.mjs";
import { createInvestigation, investigate } from "../legend-adventure.mjs";
import { createPlatformer, stepPlatformer } from "../minigames/legend-platformer.mjs";
import { generatePlatformLevel } from "../minigames/legend-layout.mjs";

test("room entries and trap hits have separate measurable provisional costs", () => {
  assert.deepEqual(adventureCosts({ roomEntries: 4, roomsVisited: [0, 1, 2], trapHits: 2 }),
    { minutes: 16, fatigue: 10, health: 10, dirt: 12 });
  assert.deepEqual(adventureCosts({ roomEntries: 1, roomsVisited: ["foyer"], trapHits: 0 }),
    { minutes: 3, fatigue: 1, health: 0, dirt: 1 });
  for (const bad of [null, { roomEntries: -1, roomsVisited: [], trapHits: 0 },
    { roomEntries: 1, roomsVisited: [0, 0], trapHits: 0 },
    { roomEntries: 1, roomsVisited: [0], trapHits: NaN }]) assert.throws(() => adventureCosts(bad), /Invalid/);
});

test("investigation counts actual room entry including returns, not clicks on the current room", () => {
  let state = createInvestigation();
  state = investigate(state, { type: "travel", location: "foyer" });
  assert.equal(state.metrics.roomEntries, 1);
  state = investigate(state, { type: "travel", location: "archive" });
  state = investigate(state, { type: "travel", location: "foyer" });
  state = investigate(state, { type: "act", target: "photo" });
  assert.deepEqual(state.metrics, { roomEntries: 3, roomsVisited: ["foyer", "archive"], trapHits: 0 });
  assert.ok(Object.isFrozen(state.metrics));
  assert.ok(Object.isFrozen(state.metrics.roomsVisited));
});

test("dungeon costs add approved creature damage separately without changing existing trial rates", () => {
  const metrics = { roomEntries: 4, roomsVisited: [0, 1, 2, 3], trapHits: 2, creatureHits: 3 };
  assert.deepEqual(dungeonCosts(metrics), { minutes: 19, fatigue: 13, health: 16, dirt: 15 });
  assert.deepEqual(adventureCosts(metrics), { minutes: 16, fatigue: 10, health: 10, dirt: 12 });
  for (const creatureHits of [undefined, -1, 0.5, NaN, 10001]) {
    assert.throws(() => dungeonCosts({ ...metrics, creatureHits }), /Invalid dungeon/);
  }
});

test("platform counts actual trap collisions, not manual retries, and freezes accounting", () => {
  let state = createPlatformer({ level: generatePlatformLevel({ seed: 2 }) });
  state = stepPlatformer(state, { retry: true });
  assert.equal(state.metrics.trapHits, 0);
  for (let tick = 0; tick < 200 && state.metrics.trapHits === 0; tick++) state = stepPlatformer(state, { right: true });
  assert.equal(state.metrics.trapHits, 1);
  assert.equal(state.metrics.roomEntries, 1);
  assert.deepEqual(state.metrics.roomsVisited, [0]);
  assert.ok(Object.isFrozen(state.metrics));
  assert.ok(Object.isFrozen(state.metrics.roomsVisited));
});
