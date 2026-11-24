import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beginPursuit, advancePursuit, pursuitStatus, pursuitPending,
  beginPursuitEscape, settlePursuitEscape, validatePursuit, pursuitDifficulty } from "../pursuit.mjs";
import { createEscape, stepEscape, escapeObstacles, replayEscape, escapeTerrain, escapeCourse } from "../minigames/pursuit-escape.mjs";
import { startSurvival } from "../survival.mjs";
import { applyBirthTarot, startEconomy } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { journeyActionBlocker } from "../travel.mjs";
import { escapeRoute } from "./helpers/pursuit-route.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const economy = json("../public/economy.json"), survival = json("../public/config.json").survival;
const map = json("../public/map.json"), cell = { terrain: "forest" };
const base = () => ({ ...applyBirthTarot(startEconomy(startSurvival(14, 10,
  Date.UTC(2026, 10, 13, 12), "balanced", survival), economy, () => 0), economy),
  trail: createTrail(map, 14, 10, () => 0) });
const advance = (state, minutes, position = {}, terrain = cell) =>
  advancePursuit({ ...state, elapsedMinutes: state.elapsedMinutes + minutes, ...position }, terrain);
const ready = () => advance(beginPursuit(base()), 1440 + 900);
const save = state => createSave({ region: "firmi", map, state, survival, economy }, 1);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

function route(seed, approach = 54, version = 5, difficulty = 1) {
  let state = createEscape(seed, version, difficulty);
  const jumps = [], landings = new Set();
  while (state.status === "running") {
    const obstacle = escapeObstacles(seed, version, difficulty, state.tick).find(obstacle => obstacle.kind !== "overhead" &&
      obstacle.x + obstacle.width > state.x &&
      (obstacle.kind === "gap" || (obstacle.bottom ?? 270) - obstacle.height < state.y + 26 - 0.001));
    const threshold = typeof approach === "function" && obstacle ? approach(state, obstacle) : approach;
    const jump = state.grounded && obstacle && obstacle.x - state.x <= threshold;
    if (jump) jumps.push(state.tick + 1);
    state = stepEscape(state, Boolean(jump));
    if (state.grounded) landings.add(state.y);
  }
  return { state, landings, transcript: { jumps, ticks: state.tick, abandoned: false } };
}

function hardApproach(state, obstacle) {
  const speed = escapeCourse(state.version, state.difficulty).speed;
  const timing = { stack: 0.32, cart: 0.29, bouncer: 0.30, platform: 0.28, crate: 0.24,
    gap: 0.20, hurdle: 0.18 };
  return speed * timing[obstacle.kind];
}

test("legacy journeys remain unchanged until activation; existing journeys receive a full protected day", () => {
  const legacy = base();
  validatePursuit(legacy);
  assert.equal(advancePursuit(legacy, cell), legacy);
  const started = beginPursuit({ ...legacy, elapsedMinutes: 10000 });
  assert.equal(pursuitStatus(started).grace, 1440);
  assert.equal(beginPursuit(started), started);
  assert.deepEqual(validateSave(save(beginPursuit(legacy))).state, beginPursuit(legacy));
});

test("24-hour grace resets the starting gap at the current position; real-world idle and reloads do not advance it", () => {
  const state = beginPursuit(base());
  const after = advance(state, 1440, { col: -100 });
  assert.equal(pursuitStatus(after).grace, 0);
  close(pursuitStatus(after).gap, 30);
  assert.equal(after.pursuit.pending, null);
  assert.equal(advancePursuit(after, cell), after);
  const restored = structuredClone(after);
  assert.deepEqual(advancePursuit(restored, cell), after);
  close(pursuitStatus(advance(after, 60)).gap, 28);
});

test("pursuer advances at 2 km/h independently of distance credit, rest, sleep and sheltered time", () => {
  const state = advance(beginPursuit(base()), 1440);
  const hour = advance(state, 60);
  const sleep = advance(state, 480, { sleeps: state.sleeps + 1 });
  close(pursuitStatus(hour).gap, 28);
  close(pursuitStatus(sleep).gap, 14);
  close(hour.distanceMeters, state.distanceMeters);
  let split = state;
  for (let i = 0; i < 60; i++) split = advance(split, 1);
  close(split.pursuit.x, hour.pursuit.x);
});

test("walking away increases the gap; moving towards the pursuer closes it; transport changes position without walking credit", () => {
  const state = advance(beginPursuit(base()), 1440);
  const walk = advance(state, 60, { col: state.col + 18 });
  close(pursuitStatus(walk).gap, 32.5);
  const back = advance(state, 60, { col: state.col - 18 });
  close(pursuitStatus(back).gap, 23.5);
  const bus = advance(state, 60, { col: state.col + 400 });
  close(pursuitStatus(bus).gap, 128);
  assert.equal(bus.distanceMeters, state.distanceMeters);
});

test("warnings escalate before contact, actual cell terrain is retained and action locks survive reload", () => {
  let state = advance(beginPursuit(base()), 1440);
  assert.equal(pursuitStatus(state).stage, "distant");
  state = advance(state, 600);
  assert.equal(pursuitStatus(state).stage, "near");
  state = advance(state, 240);
  assert.equal(pursuitStatus(state).stage, "danger");
  state = advance(state, 60);
  assert.equal(pursuitStatus(state).stage, "escape");
  assert.equal(state.pursuit.pending.terrain, "woodland");
  assert.equal(state.pursuit.pending.status, "ready");
  assert.equal(pursuitPending(state), true);
  assert.equal(journeyActionBlocker(state, { cell }), "event");
  validatePursuit(state);
  // Keep the survival date consistent when testing complete journey saves.
  state.tarotDay = new Date(state.startedAt + state.elapsedMinutes * 60000).toISOString().slice(0, 10);
  const restored = validateSave(save(state)).state;
  assert.deepEqual(restored.pursuit, state.pursuit);
  assert.throws(() => beginPursuitEscape(restored, "unknown"), /cannot start/);
});

test("an already-pending travel event can finish before the same ready escape without rerolling", () => {
  const state = ready(), pending = state.pursuit.pending;
  const next = advance(state, 15, {}, { terrain: "building" });
  assert.equal(next.pursuit.pending.seed, pending.seed);
  assert.equal(next.pursuit.pending.id, pending.id);
  assert.equal(next.pursuit.pending.terrain, "streets");
  validatePursuit(next);
  assert.throws(() => advance(beginPursuitEscape(next, "normal"), 1), /Resolve/);
});

test("terrain scenery never changes escape collision facts, and every tested route is achievable in 30–45 seconds", () => {
  assert.deepEqual(["forest", "building", "plain", "hill"].map(escapeTerrain),
    ["woodland", "streets", "country", "rocky"]);
  for (const seed of [0, 1, 0xffffffff, ...Array.from({ length: 64 }, (_, i) => i * 65537)]) {
    const { state, transcript, landings } = route(seed, 40, 2);
    assert.equal(state.status, "escaped", `Seed ${seed}`);
    assert.equal(state.hits, 0);
    assert.ok(state.tick / 60 >= 30 && state.tick / 60 <= 45);
    assert.equal(replayEscape(seed, transcript.jumps, transcript.ticks, false, 2), "escaped");
    assert.ok(landings.has(220), `Seed ${seed}: runner must actually land on raised platforms`);
    // More than 150 ms of timing tolerance, not one exact solution frame.
    for (const approach of [34, 62]) {
      assert.equal(route(seed, approach, 2).state.hits, 0, `Seed ${seed}, approach ${approach}`);
    }
  }
});

test("falling into a gap costs exactly one stumble and recovers on its far side", () => {
  const gap = escapeObstacles(123).find(obstacle => obstacle.kind === "gap");
  let state = { ...createEscape(123), x: gap.x - 12 }, fell = false;
  for (let i = 0; i < 120 && !state.hits; i++) {
    state = stepEscape(state);
    fell ||= state.y > 244;
  }
  assert.equal(fell, true);
  assert.equal(state.hits, 1);
  assert.equal(state.status, "running");
  assert.equal(state.x, gap.x + gap.width + 4);
  assert.equal(state.y, 244);
  assert.equal(state.grounded, true);
  for (let i = 0; i < 60; i++) state = stepEscape(state);
  assert.equal(state.hits, 1);
});

test("version-one attempts keep their old route, physics and saved replay outcome", () => {
  const active = beginPursuitEscape(ready(), "normal");
  active.pursuit.pending.version = 1;
  delete active.pursuit.pending.atmosphere;
  delete active.pursuit.pending.difficulty;
  const seed = active.pursuit.pending.seed;
  const { state, transcript } = route(seed, 40, 1);
  assert.equal(escapeObstacles(seed, 1).length, 9);
  assert.equal(state.hits, 0);
  assert.equal(replayEscape(seed, transcript.jumps, transcript.ticks, false, 1), "escaped");
  const settled = settlePursuitEscape(active, transcript);
  assert.equal(settled.pursuit.history[0].version, 1);
  validatePursuit(settled);
});

test("ten levels progress every two escapes and condition adjusts by at most two levels", () => {
  const normal = { health: 70, fatigue: 40, awakeHours: 12 };
  const fresh = { health: 100, fatigue: 0, awakeHours: 0 };
  const exhausted = { health: 15, fatigue: 85, awakeHours: 24 };
  for (let completed = 0; completed <= 24; completed++) {
    const baseLevel = Math.min(10, 1 + Math.floor(completed / 2));
    assert.equal(pursuitDifficulty(normal, completed).level, baseLevel);
    assert.equal(pursuitDifficulty(fresh, completed).level, Math.max(1, baseLevel - 2));
    assert.equal(pursuitDifficulty(exhausted, completed).level, Math.min(10, baseLevel + 2));
  }
  assert.equal(pursuitDifficulty({ health: 90, fatigue: 20, awakeHours: 6 }, 8).modifier, -1);
  assert.equal(pursuitDifficulty({ health: 40, fatigue: 60, awakeHours: 16 }, 8).modifier, 1);
  assert.throws(() => pursuitDifficulty({ ...normal, fatigue: NaN }), /Invalid/);
});

test("all ten routes are distinct, achievable without damage and replayable across seeds and timing windows", () => {
  const layouts = new Set();
  for (let level = 1; level <= 10; level++) {
    layouts.add(JSON.stringify(escapeObstacles(123, 3, level)));
    for (const seed of [0, 1, 0xffffffff, ...Array.from({ length: 32 }, (_, i) => i * 65537)]) {
      for (const approach of [42, 54]) {
        const { state, transcript, landings } = route(seed, approach, 3, level);
        assert.equal(state.status, "escaped", `level ${level}, seed ${seed}, approach ${approach}`);
        assert.equal(state.hits, 0, `level ${level}, seed ${seed}, approach ${approach}`);
        assert.ok([...landings].some(y => y < 244));
        assert.ok(state.tick / 60 >= 30 && state.tick / 60 <= 45);
        assert.equal(replayEscape(seed, transcript.jumps, transcript.ticks, false, 3, level), "escaped");
      }
    }
  }
  assert.equal(layouts.size, 10);
  for (const level of [0, 11, 1.5, NaN]) assert.throws(() => createEscape(1, 3, level), /difficulty/);
});

test("difficulty and its condition snapshot stay pinned through deferral, reload and settlement", () => {
  let state = beginPursuit(base());
  for (let completed = 0; completed < 5; completed++) {
    state = advance(state, completed ? 900 : 2340, { health: 70, fatigue: 40, awakeHours: 12 });
    const selected = structuredClone(state.pursuit.pending.difficulty);
    const days = (state.pursuit.pending.elapsedMinutes - state.pursuit.startedMinutes) / 1440;
    assert.equal(selected.base,
      Math.min(10, 1 + Math.floor(completed / 2) + Math.floor(days / 2)));
    state = advance(state, 1, { health: 20, fatigue: 80, awakeHours: 23 });
    assert.deepEqual(state.pursuit.pending.difficulty, selected);
    state = structuredClone(state);
    validatePursuit(state);
    state = beginPursuitEscape(state, "normal");
    const pending = state.pursuit.pending;
    const { transcript } = route(pending.seed, hardApproach, pending.version, selected.level);
    state = settlePursuitEscape(state, transcript);
    assert.deepEqual(state.pursuit.history.at(-1).difficulty, selected);
    validatePursuit(state);
  }
  for (const change of [
    d => { d.level = 10; }, d => { d.modifier = 3; }, d => { d.base = 9; },
    d => { d.health = -1; }, d => { d.extra = true; },
  ]) {
    const malformed = structuredClone(state);
    change(malformed.pursuit.history[0].difficulty);
    assert.throws(() => validatePursuit(malformed), /Invalid/);
  }
});

test("version-two pending escapes keep their fixed layout and settlement without difficulty metadata", () => {
  const active = beginPursuitEscape(ready(), "normal");
  active.pursuit.pending.version = 2;
  delete active.pursuit.pending.atmosphere;
  delete active.pursuit.pending.difficulty;
  const seed = active.pursuit.pending.seed;
  const { transcript } = route(seed, 40, 2);
  const settled = settlePursuitEscape(active, transcript);
  assert.equal(settled.pursuit.history[0].outcome, "escaped");
  validatePursuit(settled);
});

test("faster routes add obstacle density and eight distinct challenge families, with damage-free solutions", () => {
  for (let level = 1; level <= 10; level++) {
    const course = escapeCourse(4, level);
    assert.ok(course.speed >= 220, "even level one must be at least 37.5% faster than the old pace");
    const obstacles = escapeObstacles(123, 4, level);
    assert.ok(new Set(obstacles.map(o => o.kind)).size >= 7);
    if (level > 1) assert.ok(obstacles.length > escapeObstacles(123, 4, level - 1).length);
    for (const seed of [0, 1, 123, 0xffffffff, ...Array.from({ length: 32 }, (_, i) => Math.imul(i, 0x9e3779b1) >>> 0)]) {
      for (const approach of [54, 66]) {
        const { state, transcript } = route(seed, approach, 4, level);
        assert.equal(state.status, "escaped", `level ${level}, seed ${seed}, approach ${approach}`);
        assert.equal(state.hits, 0, `level ${level}, seed ${seed}, approach ${approach}`);
        assert.ok(state.tick / 60 >= 33 && state.tick / 60 <= 35);
        assert.equal(replayEscape(seed, transcript.jumps, transcript.ticks, false, 4, level), "escaped");
      }
    }
  }
});

test("moving obstacles appear only at levels 8–10 and use tick-pinned collision geometry", () => {
  for (let level = 1; level <= 10; level++) {
    const before = escapeObstacles(123, 4, level, 0), after = escapeObstacles(123, 4, level, 30);
    const movers = before.filter(o => ["cart", "bouncer"].includes(o.kind));
    assert.equal(movers.length > 0, level >= 8);
    if (level >= 8) {
      assert.notEqual(before.find(o => o.kind === "cart").x, after.find(o => o.kind === "cart").x);
      assert.notEqual(before.find(o => o.kind === "bouncer").bottom, after.find(o => o.kind === "bouncer").bottom);
      assert.deepEqual(after, escapeObstacles(123, 4, level, 30));
      const cart = after.find(o => o.kind === "cart");
      const state = { ...createEscape(123, 4, level), tick: 29, x: cart.x - 4 };
      assert.equal(stepEscape(state).hits, 1);
    }
  }
});

test("overhead obstacles punish jumping but allow the runner to pass underneath", () => {
  const obstacle = escapeObstacles(0, 4, 10).find(o => o.kind === "overhead");
  let grounded = { ...createEscape(0, 4, 10), x: obstacle.x - 20 };
  let jumping = { ...grounded };
  for (let i = 0; i < 36; i++) {
    grounded = stepEscape(grounded);
    jumping = stepEscape(jumping, i === 0);
  }
  assert.equal(grounded.hits, 0);
  assert.equal(jumping.hits, 1);
});

test("protocol-three adaptive attempts retain their old slower route and selected level", () => {
  const active = beginPursuitEscape(ready(), "normal");
  active.pursuit.pending.version = 3;
  delete active.pursuit.pending.atmosphere;
  const { seed, difficulty } = active.pursuit.pending;
  const { transcript } = route(seed, 42, 3, difficulty.level);
  const settled = settlePursuitEscape(active, transcript);
  assert.equal(settled.pursuit.history[0].outcome, "escaped");
  assert.equal(escapeCourse(3, 10).speed, 160);
  validatePursuit(settled);
});

test("hardest courses require obstacle-specific timing, with dense faster routes that remain damage-free achievable", () => {
  for (const level of [8, 9, 10]) {
    assert.ok(escapeCourse(5, level).speed > escapeCourse(4, level).speed);
    assert.ok(escapeObstacles(123, 5, level).length > escapeObstacles(123, 4, level).length);
    for (const seed of [0, 1, 123, 0xffffffff, ...Array.from({ length: 32 }, (_, i) => Math.imul(i, 0x9e3779b1) >>> 0)]) {
      for (const offset of [-2, 2]) {
        const { state, transcript } = route(seed, (state, obstacle) => hardApproach(state, obstacle) + offset, 5, level);
        assert.equal(state.status, "escaped", `level ${level}, seed ${seed}, offset ${offset}`);
        assert.equal(state.hits, 0, `level ${level}, seed ${seed}, offset ${offset}`);
        assert.equal(replayEscape(seed, transcript.jumps, transcript.ticks, false, 5, level), "escaped");
      }
    }
  }
  const thresholds = Array.from({ length: 46 }, (_, index) => 30 + index * 2);
  const oldWindows = thresholds.filter(timing => route(0, timing, 4, 10).state.hits === 0).length;
  const hardWindows = thresholds.filter(timing => route(0, timing, 5, 10).state.hits === 0).length;
  assert.ok(hardWindows > 0, "a precise repeated rhythm still has a non-zero solvable window");
  assert.ok(hardWindows <= oldWindows / 2, "expert timing must be measurably stricter, not just renamed");
});

test("protocol-four attempts keep their earlier pace and successful replay", () => {
  const active = beginPursuitEscape(ready(), "normal");
  active.pursuit.pending.version = 4;
  delete active.pursuit.pending.atmosphere;
  const { seed, difficulty } = active.pursuit.pending;
  const { transcript } = route(seed, 54, 4, difficulty.level);
  const settled = settlePursuitEscape(active, transcript);
  assert.equal(settled.pursuit.history[0].outcome, "escaped");
  validatePursuit(settled);
});

test("new middle and expert routes have damage-free solutions despite shuffled multi-jump encounters", () => {
  for (let level = 4; level <= 10; level++) {
    for (const seed of [0, 1, 123, 0xffffffff, ...Array.from({ length: 8 }, (_, i) => Math.imul(i + 1, 0x9e3779b1) >>> 0)]) {
      const { state, transcript } = escapeRoute(seed, 7, level);
      assert.equal(state.hits, 0);
      assert.ok(state.tick / 60 >= 33 && state.tick / 60 <= 35);
      assert.equal(replayEscape(seed, transcript.jumps, transcript.ticks, false, 7, level), "escaped");
    }
  }
  assert.ok(escapeCourse(7, 6).speed >= escapeCourse(6, 6).speed * 1.3);
  assert.ok(escapeObstacles(0, 7, 6).length >= escapeObstacles(0, 6, 6).length * 1.3);
  for (let level = 1; level <= 3; level++) {
    assert.deepEqual(escapeCourse(7, level), escapeCourse(6, level));
    assert.deepEqual(escapeObstacles(0, 7, level), escapeObstacles(0, 6, level));
  }
});

test("level six has less than half the previous forgiving timing window, without relying on weather", () => {
  const timings = Array.from({ length: 51 }, (_, i) => 0.1 + i * 0.01);
  const counts = version => {
    const routes = timings.map(seconds => route(0, escapeCourse(version, 6).speed * seconds, version, 6).state);
    return { clean: routes.filter(state => state.hits === 0).length,
      wins: routes.filter(state => state.status === "escaped").length };
  };
  const before = counts(6), after = counts(7);
  assert.ok(after.clean > 0 && after.wins > 0, "precise timing must still work");
  assert.ok(after.clean <= before.clean / 2, `${after.clean} clean timing choices versus ${before.clean}`);
  assert.ok(after.wins <= before.wins / 2, `${after.wins} winning timing choices versus ${before.wins}`);
});

test("new impacts no longer get a 1.5-second shield, but sustained contact counts only once", () => {
  const obstacles = escapeObstacles(0, 7, 6);
  const platform = obstacles.find(o => o.kind === "platform" && o.width > 250);
  let state = { ...createEscape(0, 7, 6), x: platform.x - 17 };
  for (let i = 0; i < 32; i++) state = stepEscape(state);
  assert.equal(state.hits, 1, "do not charge twice for touching the same platform");
  const stack = obstacles.find(o => o.kind === "stack");
  state = stepEscape({ ...state, x: stack.x - 10 });
  assert.equal(state.hits, 2, "a separate impact after half a second must count");
});

test("protocol-six atmosphere and replay remain valid after new difficulty tuning", () => {
  const active = beginPursuitEscape(ready(), "normal");
  active.pursuit.pending.version = 6;
  const { seed, difficulty } = active.pursuit.pending;
  const { transcript } = route(seed, 54, 6, difficulty.level);
  validatePursuit(settlePursuitEscape(active, transcript));
});

test("atmosphere remains pinned across queued-event changes, reload and settlement; legacy five stays unchanged", () => {
  const info = { latitude: 48.85, longitude: 2.35,
    weather: { months: Array.from({ length: 12 }, () => ({ condition: "rain", minC: 5, maxC: 12 })) } };
  let state = beginPursuit(base());
  state = advancePursuit({ ...state, elapsedMinutes: 2340 }, cell, info);
  const selected = structuredClone(state.pursuit.pending.atmosphere);
  const deferred = advancePursuit({ ...state, elapsedMinutes: 2350, fatigue: 90 },
    { terrain: "building" }, { ...info, weather: undefined });
  assert.deepEqual(deferred.pursuit.pending.atmosphere, selected);
  state = beginPursuitEscape(structuredClone(deferred), "normal");
  validatePursuit(state);
  state.tarotDay = new Date(state.startedAt + state.elapsedMinutes * 60000).toISOString().slice(0, 10);
  state = validateSave(save(state)).state;
  const { transcript } = route(state.pursuit.pending.seed, 54, 6, state.pursuit.pending.difficulty.level);
  state = settlePursuitEscape(state, transcript);
  assert.deepEqual(state.pursuit.history[0].atmosphere, selected);
  validatePursuit(state);
  state.pursuit.history[0].atmosphere.fog = "opaque";
  assert.throws(() => validatePursuit(state), /Invalid/);

  const legacy = beginPursuitEscape(ready(), "normal");
  legacy.pursuit.pending.version = 5;
  delete legacy.pursuit.pending.atmosphere;
  const { transcript: oldTranscript } = route(legacy.pursuit.pending.seed, 54, 5);
  validatePursuit(settlePursuitEscape(legacy, oldTranscript));
});

test("successful replay gives exactly 30 km lead once; inputs cannot claim a forged success", () => {
  const state = beginPursuitEscape(ready(), "accessible");
  const { transcript } = route(state.pursuit.pending.seed);
  const escaped = settlePursuitEscape(state, transcript);
  close(pursuitStatus(escaped).gap, 30);
  assert.equal(escaped.pursuit.history[0].outcome, "escaped");
  assert.equal(escaped.pursuit.pending, null);
  assert.equal(escaped.ended, null);
  validatePursuit(escaped);
  assert.throws(() => settlePursuitEscape(escaped, transcript), /cannot be settled/);
  assert.throws(() => settlePursuitEscape(state, { jumps: [], ticks: 10, abandoned: false }), /unfinished/);
  assert.throws(() => settlePursuitEscape(state, { jumps: [4, 3], ticks: 10, abandoned: false }), /Invalid/);
});

test("three stumbles or abandoning a started escape ends the journey; reload cannot restart it", () => {
  const state = beginPursuitEscape(ready(), "normal");
  const restored = structuredClone(state);
  assert.throws(() => beginPursuitEscape(restored, "normal"), /cannot start/);
  const captured = settlePursuitEscape(restored, { jumps: [], ticks: 0, abandoned: true });
  assert.equal(captured.ended, "captured");
  validatePursuit(captured);
  let engine = createEscape(state.pursuit.pending.seed);
  while (engine.status === "running") engine = stepEscape(engine);
  const failed = settlePursuitEscape(state, { jumps: [], ticks: engine.tick, abandoned: false });
  assert.equal(failed.ended, "captured");
  assert.equal(failed.pursuit.history[0].outcome, "captured");
  validatePursuit(failed);
  failed.tarotDay = new Date(failed.startedAt + failed.elapsedMinutes * 60000).toISOString().slice(0, 10);
  assert.deepEqual(validateSave(save(failed)).state, failed);
});

test("another terminal journey outcome cancels a queued escape without replacing the original ending", () => {
  const state = ready();
  const next = advancePursuit({ ...state, ended: "health" }, cell);
  assert.equal(next.pursuit.pending, null);
  assert.equal(next.ended, "health");
  validatePursuit(next);
});

test("malformed pursuit state, incompatible protocols, forged outcomes and displaced attempts are rejected", () => {
  const state = ready();
  for (const edit of [
    p => { p.version = 2; }, p => { p.x = NaN; }, p => { p.cellSizeMeters = 0; },
    p => { p.pending.version = 999; }, p => { p.pending.col++; },
    p => { p.pending.seed = -1; }, p => { p.pending.elapsedMinutes++; },
    p => { p.history = [{ ...p.pending, status: "active", mode: "normal", outcome: "escaped",
      jumps: [], ticks: 0, abandoned: true }]; p.pending = null; },
  ]) {
    const copy = structuredClone(state);
    edit(copy.pursuit);
    assert.throws(() => validatePursuit(copy), /Invalid/);
  }
  assert.throws(() => validatePursuit({ ...base(), ended: "captured" }), /Invalid/);
  assert.throws(() => advance(advance(beginPursuit(base()), 1440), 900, {}, { unavailable: true }), /loaded terrain/);
});

test("the pursuer grows bolder with journey time, even without any escape attempts", () => {
  const condition = { health: 70, fatigue: 40, awakeHours: 12 };
  assert.equal(pursuitDifficulty(condition, 0, 0).base, 1, "a fresh chase starts gently");
  assert.equal(pursuitDifficulty(condition, 0, 5).base, 3);
  assert.equal(pursuitDifficulty(condition, 0, 30).base, 10, "time alone can reach the hardest routes");
  assert.equal(pursuitDifficulty(condition, 4, 5).base, 5, "attempts and days stack");
  assert.equal(pursuitDifficulty(condition, 0).base, 1, "the legacy formula ignores time");
  assert.throws(() => pursuitDifficulty(condition, 0, -1), /Invalid/);
  // A traveller who outruns the pursuer for ten days faces a much bolder chase
  // on first contact, and the save roundtrips with the pinned difficulty.
  let state = beginPursuit(base());
  for (let i = 0; i < 20; i++) state = advance(state, 720, { col: state.col + 96 });
  assert.equal(state.pursuit.pending, null, "matching the pursuer's pace avoids contact");
  state = advance(state, 900);
  const difficulty = state.pursuit.pending.difficulty;
  assert.equal(difficulty.base, 6, "ten days of chase raise the base difficulty");
  validatePursuit(state);
  // Deferring the escape keeps the pinned difficulty valid across day boundaries.
  state = advance(state, 3 * 1440);
  assert.deepEqual(state.pursuit.pending.difficulty, difficulty);
  validatePursuit(state);
  const forged = structuredClone(state);
  forged.pursuit.pending.difficulty.base = 9;
  forged.pursuit.pending.difficulty.level = 9;
  assert.throws(() => validatePursuit(forged), /Invalid/,
    "a base above what the elapsed chase allows is rejected");
  const inflated = structuredClone(state);
  inflated.pursuit.pending.difficulty.level = 10;
  assert.throws(() => validatePursuit(inflated), /Invalid/,
    "the level must follow the pinned base and modifier");
});
