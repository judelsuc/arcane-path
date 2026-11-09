import test from "node:test";
import assert from "node:assert/strict";
import { INVESTIGATION_PROFILES, PUZZLE_FAMILIES, generateInvestigation, createGeneratedInvestigation,
  stepInvestigation, investigationCommands, generatedInvestigationHint } from "../minigames/legend-investigation.mjs";
import { INVESTIGATION_COPY } from "../minigames/legend-investigation-copy.mjs";
import { replayInvestigation, LEGEND_SESSION_VERSION } from "../legend-session.mjs";

function solve(state) {
  const room = state.level.rooms[state.room];
  if (state.progress[state.room].solved) return state;
  if (room.family === "sequence" && state.progress[state.room].sequence.length) {
    const wrong = (room.order[state.progress[state.room].sequence.length] + 1) % 3;
    state = stepInvestigation(state, { type: "act", command: `press:${wrong}` });
  }
  const commands = ({
    evidence: ["inspect", `choose:${room.answer}`],
    witnesses: ["witness:0", "witness:1", `choose:${room.answer}`],
    assembly: ["take:0", "take:1", "combine"],
    sequence: ["inspect", ...room.order.map(index => `press:${index}`)],
  })[room.family];
  for (const command of commands) state = stepInvestigation(state, { type: "act", command });
  assert.ok(state.progress[state.room].solved);
  return state;
}
const act = (state, command) => stepInvestigation(state, { type: "act", command });

test("reward tiers generate longer mandatory puzzle chains, varied families and repeatable variants", () => {
  assert.deepEqual(Object.values(INVESTIGATION_PROFILES).map(profile => profile.rooms), [8, 16, 32]);
  let length = 0, budget = 0;
  for (const [tier, profile] of Object.entries(INVESTIGATION_PROFILES)) {
    assert.ok(profile.rooms > length && profile.rewardBudget > budget);
    length = profile.rooms; budget = profile.rewardBudget;
    for (let seed = 0; seed < 100; seed++) {
      const level = generateInvestigation({ seed, tier });
      assert.deepEqual(level, generateInvestigation({ seed, tier }));
      assert.equal(level.rooms.length, profile.rooms);
      assert.equal(level.rewardBudget, profile.rewardBudget);
      assert.ok(level.rooms.every((room, i) => !i || room.family !== level.rooms[i - 1].family));
      for (let i = 0; i < level.rooms.length; i += 4) {
        assert.deepEqual(new Set(level.rooms.slice(i, i + 4).map(room => room.family)), new Set(PUZZLE_FAMILIES));
      }
      for (const room of level.rooms) assert.deepEqual([...room.order].sort(), [0, 1, 2]);
      assert.ok(Object.isFrozen(level.rooms[0]));
    }
  }
  assert.notDeepEqual(generateInvestigation({ seed: 1 }), generateInvestigation({ seed: 2 }));
  for (const family of PUZZLE_FAMILIES) {
    const variants = new Set(Array.from({ length: 60 }, (_, seed) =>
      generateInvestigation({ seed }).rooms.find(room => room.family === family).variant));
    assert.equal(variants.size, 2, family);
  }
});

test("every tier completes with the minimum number of room entries and no shortcut to later sites", () => {
  for (const tier of Object.keys(INVESTIGATION_PROFILES)) for (let seed = 0; seed < 30; seed++) {
    let state = createGeneratedInvestigation({ level: generateInvestigation({ seed, tier }) });
    const original = state;
    for (let room = 0; room < state.level.rooms.length; room++) {
      assert.equal(state.room, room);
      if (room + 1 < state.level.rooms.length) {
        const blocked = stepInvestigation(state, { type: "travel", room: room + 1 });
        assert.equal(blocked.message, "locked");
        assert.deepEqual(blocked.metrics, state.metrics);
      }
      state = solve(state);
      if (room + 1 < state.level.rooms.length) {
        state = stepInvestigation(state, { type: "travel", room: room + 1 });
      }
    }
    assert.equal(state.completed, true);
    assert.equal(state.metrics.roomEntries, state.level.rooms.length);
    assert.equal(state.metrics.trapHits, 0);
    assert.ok(state.progress.every(entry => entry.solved));
    assert.equal(original.progress[0].solved, false);
    assert.equal(stepInvestigation(state, { type: "travel", room: 0 }), state);
    assert.equal(generatedInvestigationHint(state), "complete");
  }
});

test("all reachable local puzzle states remain solvable; failed actions preserve evidence and supplies", () => {
  for (let seed = 0; seed < 8; seed++) {
    let start = createGeneratedInvestigation({ level: generateInvestigation({ seed, tier: "notable" }) });
    for (let room = 0; room < start.level.rooms.length; room++) {
      const queue = [start], seen = new Set();
      for (let index = 0; index < queue.length; index++) {
        const state = queue[index], progress = state.progress[room];
        const key = JSON.stringify(progress);
        if (seen.has(key)) continue;
        seen.add(key);
        assert.ok(solve(state).progress[room].solved, `${seed}/${room}/${key}`);
        assert.ok(generatedInvestigationHint(state));
        if (progress.solved) continue;
        for (const command of investigationCommands(state)) {
          const next = act(state, command);
          assert.ok(progress.parts.every(item => next.progress[room].parts.includes(item)));
          assert.ok(progress.witnesses.every(item => next.progress[room].witnesses.includes(item)));
          assert.ok(!progress.inspected || next.progress[room].inspected);
          assert.deepEqual(next.metrics, state.metrics, "puzzle clicks do not invent entries");
          queue.push(next);
        }
      }
      assert.ok(seen.size > 2);
      start = solve(start);
      if (room + 1 < start.level.rooms.length) start = stepInvestigation(start, { type: "travel", room: room + 1 });
    }
  }
});

test("revisits retain progress and count entries separately; room-level hints track prerequisites", () => {
  let state = createGeneratedInvestigation();
  const initialHint = generatedInvestigationHint(state);
  assert.ok(["inspect", "witnesses", "take"].includes(initialHint));
  state = solve(state);
  assert.equal(generatedInvestigationHint(state), "next");
  state = stepInvestigation(state, { type: "travel", room: 1 });
  state = stepInvestigation(state, { type: "travel", room: 0 });
  assert.ok(state.progress[0].solved);
  assert.equal(state.metrics.roomEntries, 3);
  assert.deepEqual(state.metrics.roomsVisited, [0, 1]);
  assert.equal(stepInvestigation(state, { type: "travel", room: 0 }), state);
  assert.ok(Object.isFrozen(state.progress[0].parts));
});

test("localized templates cover all seeded families, clues, supplies and hints", () => {
  for (const language of ["en", "fr"]) {
    const copy = INVESTIGATION_COPY[language];
    for (const family of PUZZLE_FAMILIES) assert.equal(copy.families[family].length, 2);
    for (let variant = 0; variant < 2; variant++) {
      for (const answer of copy.symbols[variant]) {
        assert.ok(copy.evidence(variant, answer).includes(answer));
        for (const witness of [0, 1]) assert.ok(copy.witnessText(variant, witness, answer).includes(answer));
      }
      assert.equal(copy.parts[variant].length, 2);
      assert.ok(copy.sequenceClue(copy.controls[variant]).includes(copy.controls[variant][0]));
    }
  }
});

test("strict state/action validation and live cinema replay remain independent", () => {
  const state = createGeneratedInvestigation();
  for (const action of [{ type: "travel", room: -1 }, { type: "travel", room: 100 },
    { type: "travel", room: 1.5 }, { type: "act", command: "complete" },
    { type: "act", command: investigationCommands(state)[0], solved: true }, null]) {
    assert.throws(() => stepInvestigation(state, action), RangeError);
  }
  assert.throws(() => stepInvestigation({ ...state }, { type: "travel", room: 0 }), TypeError);
  assert.throws(() => createGeneratedInvestigation({ level: { ...state.level } }), TypeError);
  for (const options of [{ seed: -1 }, { seed: NaN }, { tier: "mythic" }]) {
    assert.throws(() => generateInvestigation(options), RangeError);
  }
  assert.equal(LEGEND_SESSION_VERSION, "cinema-investigation-v1");
  assert.equal(replayInvestigation([]).location, "foyer");
  assert.throws(() => replayInvestigation([{ type: "act", command: "inspect" }]));
});
