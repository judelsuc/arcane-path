import test from "node:test";
import assert from "node:assert/strict";
import { adventurePacing } from "../minigames/legend-pacing.mjs";
import { generatePlatformLevel } from "../minigames/legend-layout.mjs";
import { createPlatformer, stepPlatformer } from "../minigames/legend-platformer.mjs";
import { generateDungeon, createDungeon, stepDungeon, dungeonCreature, dungeonGateOpen,
  dungeonMechanisms } from "../minigames/legend-dungeon.mjs";
import { generateInvestigation, createGeneratedInvestigation, stepInvestigation,
  generatedInvestigationHint, investigationCommands } from "../minigames/legend-investigation.mjs";
import { platformCompletionActions } from "./helpers/legend-platform-route.mjs";
import { dungeonCompletionActions, findDungeonRoute } from "./helpers/legend-dungeon-route.mjs";

test("pacing is independent of treasure length with introductions, rests and a bounded finale", () => {
  for (const count of [8, 16, 32]) {
    const beats = Array.from({ length: count }, (_, id) => adventurePacing(id, count));
    assert.ok(beats.slice(0, 4).every(beat => beat.stage === "introduce" && beat.complexity === 0));
    assert.equal(beats.at(-1).stage, "finale");
    for (let index = 6; index < count; index += 8) assert.equal(beats[index].stage, "rest");
    assert.ok(beats.every(beat => beat.complexity <= 2));
    assert.deepEqual(beats.slice(0, 7), Array.from({ length: 7 }, (_, id) => adventurePacing(id, 32)));
  }
  for (const [index, count] of [[-1, 8], [8, 8], [0, 4], [1.5, 8]]) {
    assert.throws(() => adventurePacing(index, count), RangeError);
  }
  assert.equal(adventurePacing(14, 15).stage, "finale", "a custom path still ends with a finale");
  for (const generator of [generatePlatformLevel, generateDungeon, generateInvestigation]) {
    assert.throws(() => generator({ paced: "true" }), RangeError);
    assert.throws(() => generator({ paced: true, mainRooms: 4, roomCount: 4 }), RangeError);
  }
});

test("paced templates are deterministic, combine real mechanics and retain safe breathing rooms", () => {
  const signatures = { platform: new Set(), dungeon: new Set(), investigation: new Set() };
  for (let seed = 0; seed < 32; seed++) for (const tier of ["modest", "notable", "exceptional"]) {
    const platform = generatePlatformLevel({ seed, tier, paced: true });
    const dungeon = generateDungeon({ seed, tier, paced: true });
    const investigation = generateInvestigation({ seed, tier, paced: true });
    assert.deepEqual(platform, generatePlatformLevel({ seed, tier, paced: true }));
    assert.deepEqual(dungeon, generateDungeon({ seed, tier, paced: true }));
    assert.deepEqual(investigation, generateInvestigation({ seed, tier, paced: true }));
    for (const room of platform.rooms.filter(room => room.main)) {
      assert.equal(room.challenges.length, room.pacing.complexity ? room.pacing.complexity === 2 &&
        !["jump"].includes(room.challenge.family) ? 3 : 2 : 1);
      if (room.pacing.stage === "rest") assert.deepEqual(room.hazards, []);
      for (const hazard of room.hazards) {
        assert.ok(hazard.period - hazard.activeTicks >= 140, "timing never shrinks to a reflex race");
        for (const door of room.connections) assert.ok(Math.abs(door.arrivalX - hazard.x) > 40);
      }
      signatures.platform.add(room.challenges.map(point => point.family).join("+"));
    }
    for (const room of dungeon.rooms) {
      if (room.pacing.stage === "introduce" || room.pacing.stage === "rest") assert.equal(room.creature, null);
      if (room.pacing.stage === "rest") assert.ok(!dungeonMechanisms(room).includes("spikes"));
      if (room.pacing.complexity) assert.ok(room.mechanisms.length >= 2);
      signatures.dungeon.add(`${room.mechanisms.join("+")}:${room.patrol}`);
    }
    for (const room of investigation.rooms) {
      if (room.pacing.complexity) {
        assert.ok(room.reference >= 0 && room.reference < room.id, "dependencies cannot cycle");
        assert.equal(room.seal, (investigation.rooms[room.reference].answer + room.shift) % 3);
      } else assert.equal(room.seal, undefined);
      signatures.investigation.add(`${room.family}:${room.shift}:${room.order.length}`);
    }
  }
  assert.ok(signatures.platform.size >= 7);
  assert.ok(signatures.dungeon.size >= 12);
  assert.ok(signatures.investigation.size >= 10);
});

test("paced platform routes complete all 8/16/32 required rooms without damage or retries", () => {
  for (const tier of ["modest", "notable", "exceptional"]) for (let seed = 0; seed < 8; seed++) {
    const actions = platformCompletionActions(seed, { tier, paced: true });
    let state = createPlatformer({ level: generatePlatformLevel({ seed, tier, paced: true }), healthMode: "journey" });
    for (const packet of actions) for (let tick = 0; tick < packet.ticks; tick++) state = stepPlatformer(state, packet.controls);
    assert.equal(state.completed, true);
    assert.equal(state.solved.length, state.level.mainRooms);
    assert.equal(state.metrics.roomEntries, state.level.mainRooms);
    assert.equal(state.metrics.trapHits, 0);
    const activated = [...state.activated];
    assert.equal(activated.length, state.level.rooms.filter(room => room.main).reduce((sum, room) => sum + room.challenges.length, 0));
  }
  let state = createPlatformer({ level: generatePlatformLevel({ seed: 3, paced: true }), healthMode: "journey" });
  partial: for (const packet of platformCompletionActions(3, { paced: true })) {
    for (let tick = 0; tick < packet.ticks; tick++) {
      state = stepPlatformer(state, packet.controls);
      if (state.room === 4 && state.activated.includes("4:0")) break partial;
    }
  }
  assert.equal(state.solved.includes(4), false, "one component does not open a compound gate");
  const activated = [...state.activated];
  state = stepPlatformer(state, { retry: true });
  assert.deepEqual(state.activated, activated);
  assert.equal(state.solved.includes(4), false);
  state = stepPlatformer(state, { interact: true });
  assert.equal(state.room, 3, "the previous door remains available before solving");
  state = stepPlatformer(state, { interact: true });
  assert.equal(state.room, 4);
  assert.deepEqual(state.activated, activated, "revisiting retains the partial mechanism");
  assert.equal(state.solved.includes(4), false);
});

test("paced dungeons complete unarmed and damage-free across all lengths and patrol combinations", () => {
  for (const roomCount of [8, 16, 32]) for (let seed = 0; seed < 4; seed++) {
    const actions = dungeonCompletionActions(seed, "none", roomCount, true);
    let state = createDungeon({ level: generateDungeon({ seed, roomCount, paced: true }), healthMode: "journey" });
    for (const action of actions) state = stepDungeon(state, action);
    assert.equal(state.completed, true);
    assert.equal(state.metrics.roomEntries, roomCount);
    assert.equal(state.metrics.trapHits, 0);
    assert.equal(state.metrics.creatureHits, 0);
    assert.deepEqual(state.defeated, [], "combat is never mandatory");
  }
});

test("compound dungeon gates require every latch and retries/revisits preserve solved parts", () => {
  let state = createDungeon({ level: generateDungeon({ seed: 3, paced: true }), healthMode: "journey" });
  for (let room = 0; room < 4; room++) state = findDungeonRoute(state, next => next.room === room + 1).state;
  assert.ok(state.level.rooms[state.room].mechanisms.length >= 2);
  const room = state.room;
  state = findDungeonRoute(state, next => next.activated.filter(id => id.startsWith(`${room}:`)).length === 1).state;
  assert.equal(dungeonGateOpen(state), false);
  const activated = [...state.activated];
  state = stepDungeon(state, { type: "retry" });
  assert.deepEqual(state.activated, activated);
  assert.equal(dungeonGateOpen(state), false);
  state = findDungeonRoute(state, next => next.room === room - 1).state;
  state = findDungeonRoute(state, next => next.room === room).state;
  assert.deepEqual(state.activated, activated);
  assert.equal(dungeonGateOpen(state), false);
  assert.ok(dungeonCreature(state));
});

test("linked investigations keep archive evidence and remain solvable after wrong answers and revisits", () => {
  for (const tier of ["modest", "notable", "exceptional"]) for (let seed = 0; seed < 16; seed++) {
    let state = createGeneratedInvestigation({ level: generateInvestigation({ seed, tier, paced: true }) });
    for (const room of state.level.rooms) {
      const commands = ({
        evidence: ["inspect", `choose:${room.answer}`],
        witnesses: ["witness:0", "witness:1", `choose:${room.answer}`],
        assembly: ["take:0", "take:1", "combine"],
        sequence: ["inspect", ...room.order.map(index => `press:${index}`)],
      })[room.family];
      for (const command of commands) state = stepInvestigation(state, { type: "act", command });
      if (room.seal !== undefined) {
        assert.equal(state.progress[room.id].resolved, true);
        assert.equal(state.progress[room.id].solved, false);
        assert.equal(generatedInvestigationHint(state), "seal");
        const evidence = structuredClone(state.progress);
        state = stepInvestigation(state, { type: "act", command: `verify:${(room.seal + 1) % 3}` });
        assert.equal(state.message, "wrongSeal");
        assert.deepEqual(state.progress, evidence);
        const blocked = stepInvestigation(state, { type: "travel", room: Math.min(room.id + 1, state.level.rooms.length - 1) });
        if (room.id < state.level.rooms.length - 1) assert.equal(blocked.message, "locked");
        state = stepInvestigation(state, { type: "travel", room: room.reference });
        assert.ok(state.progress[room.reference].solved);
        state = stepInvestigation(state, { type: "travel", room: room.id });
        assert.deepEqual(investigationCommands(state), ["verify:0", "verify:1", "verify:2"]);
        state = stepInvestigation(state, { type: "act", command: `verify:${room.seal}` });
      }
      assert.ok(state.progress[room.id].solved);
      if (!state.completed) state = stepInvestigation(state, { type: "travel", room: room.id + 1 });
    }
    assert.equal(state.completed, true);
    assert.equal(state.metrics.trapHits, 0);
  }
});
