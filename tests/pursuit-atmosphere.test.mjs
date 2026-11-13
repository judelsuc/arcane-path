import test from "node:test";
import assert from "node:assert/strict";
import { createPursuitAtmosphere, validatePursuitAtmosphere, pursuitVisibility,
  drawPursuitAtmosphere } from "../pursuit-atmosphere.mjs";
import { skyState } from "../sky.mjs";
import { createEscape, stepEscape, escapeObstacles, escapeCourse, replayEscape } from "../minigames/pursuit-escape.mjs";

const state = { col: 10, row: 10, startedAt: Date.UTC(2026, 10, 13, 12), elapsedMinutes: 0 };
const info = (condition = "rain") => ({ latitude: 48.85, longitude: 2.35,
  weather: { months: Array.from({ length: 12 }, () => ({ condition, minC: 5, maxC: 12 })) } });
const cell = { terrain: "forest" };
const fresh = { health: 100, fatigue: 0, awakeHours: 0, level: 10 };
const tired = { health: 1, fatigue: 99, awakeHours: 32, level: 10 };
const atmosphere = (phase = "night", precipitation = "storm", fog = "dense") =>
  ({ version: 1, phase, precipitation, fog, seed: 123 });

test("solar phase and precipitation follow location, journey date and monthly weather", () => {
  assert.equal(createPursuitAtmosphere(state, cell, info(), 1).phase, "day");
  const night = { ...state, startedAt: Date.UTC(2026, 10, 13, 0) };
  assert.equal(createPursuitAtmosphere(night, cell, info(), 1).phase, "night");
  const tahiti = { ...info(), latitude: -17.5, longitude: -149.5 };
  assert.equal(createPursuitAtmosphere(night, cell, tahiti, 1).phase, "day");
  for (const [condition, expected] of [["clear", "none"], ["cloudy", "none"], ["rain", "rain"],
    ["storm", "storm"], ["snow", "snow"]]) {
    assert.equal(createPursuitAtmosphere(state, cell, info(condition), 2).precipitation, expected);
  }
});

test("fog is retained seeded context, including existing fog summaries and cool wet dawns", () => {
  const solar = skyState(new Date(state.startedAt), 48.85, 2.35);
  const dawn = { ...state, startedAt: solar.sunrise };
  const fogs = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const first = createPursuitAtmosphere(dawn, cell, info(), seed);
    assert.equal(first.phase, "dawn");
    assert.deepEqual(first, createPursuitAtmosphere(dawn, cell, info(), seed));
    fogs.add(first.fog);
  }
  assert.deepEqual(fogs, new Set(["none", "light", "dense"]));
  assert.notEqual(createPursuitAtmosphere(state, cell, info("fog"), 3).fog, "none");
});

test("missing weather and solar context are explicit; malformed data is rejected", () => {
  const unknown = createPursuitAtmosphere(state, cell, undefined, 1);
  assert.equal(unknown.phase, "unknown");
  assert.equal(unknown.precipitation, "unknown");
  assert.equal(unknown.fog, "none");
  validatePursuitAtmosphere(unknown);
  assert.throws(() => createPursuitAtmosphere(state, cell, { ...info(), latitude: 999 }, 1), /Invalid/);
  assert.throws(() => createPursuitAtmosphere(state, cell, info("bogus"), 1), /Invalid/);
  assert.throws(() => createPursuitAtmosphere(state, cell, { ...info(), weather: { months: [] } }, 1), /Missing/);
  for (const edit of [
    a => { a.version = 2; }, a => { a.phase = "bogus"; }, a => { a.fog = "opaque"; },
    a => { a.precipitation = null; }, a => { a.seed = -1; }, a => { a.extra = true; },
  ]) {
    const copy = atmosphere(); edit(copy);
    assert.throws(() => validatePursuitAtmosphere(copy), /Invalid/);
  }
});

function paint(atmosphere, condition, speed, tick, reduced = false, layer = "foreground") {
  const fills = [];
  const ctx = { fillStyle: "", fillRect(x, y, width, height) {
    fills.push({ color: this.fillStyle, x, y, width, height });
  } };
  drawPursuitAtmosphere(ctx, atmosphere, condition, speed, tick, reduced, layer);
  return fills;
}

test("combined worst-case effects preserve at least 1.2 seconds of capped-opacity obstacle visibility", () => {
  for (let level = 1; level <= 10; level++) {
    const { speed } = escapeCourse(7, level);
    for (const phase of ["day", "dawn", "dusk", "night"]) {
      for (const fog of ["none", "light", "dense"]) {
        const conditions = atmosphere(phase, "storm", fog);
        const condition = { ...tired, level };
        const visible = pursuitVisibility(conditions, condition, speed);
        const closingSpeed = speed + (level >= 8 ? 60 : 0);
        assert.ok((visible.clearDistancePx - 18) / closingSpeed >= 1.2);
        assert.ok(visible.nearOpacity <= 0.20);
        const fills = paint(conditions, condition, speed, 0);
        const protectedArea = fills.filter(r => r.height === 320 && r.x < 118 + closingSpeed * 1.2);
        for (const fill of protectedArea) {
          const opacity = Number(fill.color.match(/,([^,]+)\)$/)[1]);
          assert.ok(opacity <= 0.20, `${phase}, ${fog}: foreground opacity ${opacity}`);
        }
      }
    }
  }
  const mist = paint(atmosphere(), tired, 320, 0);
  assert.ok(mist.some(r => r.x > 580 && Number(r.color.match(/,([^,]+)\)$/)[1]) > 0.4));
});

test("poor condition modestly narrows the warning zone and contrast without blur or flashing", () => {
  const fit = pursuitVisibility(atmosphere(), fresh, 320);
  const unfit = pursuitVisibility(atmosphere(), tired, 320);
  assert.ok(unfit.warningSeconds < fit.warningSeconds);
  assert.ok(unfit.nearOpacity > fit.nearOpacity);
  const clear = pursuitVisibility(atmosphere("day", "none", "none"), tired, 320);
  assert.ok(clear.nearOpacity > 0);
  assert.ok(clear.clearDistancePx / 320 >= 1.2);
});

test("rain and fog animate deterministically from the simulation tick; reduced motion uses static frames", () => {
  for (const layer of ["background", "foreground"]) {
    const first = paint(atmosphere(), fresh, 320, 0, false, layer);
    const next = paint(atmosphere(), fresh, 320, 30, false, layer);
    assert.notDeepEqual(first, next);
    assert.deepEqual(next, paint(atmosphere(), fresh, 320, 30, false, layer));
    assert.deepEqual(paint(atmosphere(), fresh, 320, 0, true, layer),
      paint(atmosphere(), fresh, 320, 30, true, layer));
  }
  const snow = paint(atmosphere("day", "snow", "none"), fresh, 222, 0);
  assert.equal(snow.filter(r => r.width === 2 && r.height === 2).length, 32);
  assert.notDeepEqual(snow, paint(atmosphere("day", "snow", "none"), fresh, 222, 30));
  assert.deepEqual(paint(atmosphere("day", "snow", "none"), fresh, 222, 0, true),
    paint(atmosphere("day", "snow", "none"), fresh, 222, 30, true));
});

test("atmospheric protocol keeps expert geometry and jump physics identical to protocol five", () => {
  for (const level of [1, 8, 10]) {
    assert.deepEqual(escapeCourse(6, level), escapeCourse(5, level));
    assert.deepEqual(escapeObstacles(123, 6, level, 31), escapeObstacles(123, 5, level, 31));
    let old = createEscape(123, 5, level), next = createEscape(123, 6, level);
    const jumps = [];
    while (old.status === "running") {
      const jump = old.tick % 42 === 0;
      if (jump) jumps.push(old.tick + 1);
      old = stepEscape(old, jump);
      next = stepEscape(next, jump);
      assert.deepEqual({ ...next, version: 5 }, old);
    }
    assert.equal(replayEscape(123, jumps, old.tick, false, 6, level),
      replayEscape(123, jumps, old.tick, false, 5, level));
  }
});
