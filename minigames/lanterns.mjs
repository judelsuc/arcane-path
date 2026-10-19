/**
 * Standalone fictional lantern rehearsal, not a claim about a live festival.
 * Actions: {type:"start"}, {type:"press", lantern:0..5}, {type:"cancel"}.
 * Times are monotonic milliseconds. States are opaque, frozen engine values;
 * persist neither states nor rewards. Host integration requires a separate playtest.
 */
import { resolveResonance, resonanceResult } from "../arcane-resonance.mjs";

const issued = new WeakSet();
const patterns = Object.freeze([
  Object.freeze([0, 1, 0, 2, 1, 2, 3, 0, 3, 2, 4, 5]),
  Object.freeze([2, 0, 1, 1, 2, 0, 2, 3, 1, 4, 5, 0]),
  Object.freeze([1, 2, 2, 0, 1, 3, 0, 1, 4, 2, 0, 5]),
]);

/** Only current-cell, mapped, active public cultural venues qualify. */
export function available(cell) {
  if (!cell || cell.unavailable || !Array.isArray(cell.pois)) return false;
  return cell.pois.some(place => {
    if (!place || !/^(node|way|relation)\/[1-9]\d*$/.test(place.osmId)) return false;
    const tags = place.tags;
    if (!tags || typeof tags !== "object") return false;
    if (tags.access !== undefined && !["yes", "public", "permissive", "designated"].includes(tags.access)) return false;
    for (const flag of ["disused", "abandoned", "demolished", "razed", "construction", "proposed", "closed"]) {
      if (tags[flag] !== undefined && tags[flag] !== "no") return false;
    }
    if (Object.keys(tags).some(key =>
      /^(disused|abandoned|demolished|razed|construction|proposed|removed|closed):/.test(key))) return false;
    return ["community_centre", "arts_centre", "theatre"].includes(tags.amenity) ||
      tags.amenity === "festival_grounds" || tags.leisure === "festival_grounds" ||
      tags.event === "festival";
  });
}

export function difficulty(level) {
  if (!Number.isInteger(level) || level < 0 || level > 4) throw new RangeError("Level must be 0–4.");
  return Object.freeze({
    level, length: 7 + level, lanternCount: [3, 4, 4, 5, 6][level],
    litMs: 800 - level * 80, gapMs: 260 - level * 20,
    leadMs: 500, roundGapMs: 700, rewardMultiplier: 1 + level * 0.25,
  });
}

function time(now) {
  if (!Number.isFinite(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - 100_000) {
    throw new RangeError("Invalid monotonic time.");
  }
}

function state(game) {
  if (!game || !issued.has(game)) throw new TypeError("Expected a lantern engine state.");
}

function freeze(game) {
  Object.freeze(game);
  issued.add(game);
  return game;
}

function at(game, now) {
  state(game);
  time(now);
  if (now < game.updatedAt) throw new RangeError("Time cannot move backwards.");
}

export function createGame({ level = 0, random = Math.random, now = 0, ...options } = {}) {
  const resonance = resolveResonance("lanterns", options);
  const rules = difficulty(level);
  time(now);
  if (typeof random !== "function") throw new TypeError("Expected a random function.");
  const draw = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("Random must return [0, 1).");
    return value;
  };
  const variant = Math.floor(draw() * 4);
  const sequence = Object.freeze(Array.from({ length: rules.length }, (_, index) =>
    variant < patterns.length
      ? patterns[variant][index] % rules.lanternCount
      : Math.floor(draw() * rules.lanternCount)));
  return freeze({
    rules, sequence, variant, resonance, phase: "ready", updatedAt: now,
    startedAt: null, nextAt: null, litLantern: null, playbackIndex: -1,
    round: 1, cursor: 0, score: 0, lastLantern: null, lastCorrect: null,
  });
}

/** Pure time advancement; a late tick skips expired flashes, never accepts an early answer. */
export function advance(game, now) {
  at(game, now);
  if (game.phase === "roundGap" && now >= game.nextAt) {
    return advance(freeze({
      ...game, phase: "playback", round: game.round + 1, cursor: 0,
      startedAt: game.nextAt, updatedAt: game.nextAt, nextAt: game.nextAt + game.rules.leadMs,
      litLantern: null, playbackIndex: -1, lastCorrect: null,
    }), now);
  }
  if (game.phase !== "playback") return now === game.updatedAt
    ? game : freeze({ ...game, updatedAt: now });
  const { leadMs, litMs, gapMs } = game.rules;
  const firstAt = game.startedAt + leadMs;
  if (now < firstAt) return freeze({ ...game, updatedAt: now, nextAt: firstAt });
  const beat = litMs + gapMs;
  const elapsed = now - firstAt;
  const index = Math.floor(elapsed / beat);
  if (index >= game.round) return freeze({
    ...game, phase: "input", updatedAt: now, nextAt: null, litLantern: null,
    playbackIndex: game.round,
  });
  const lit = elapsed % beat < litMs;
  return freeze({
    ...game, updatedAt: now, playbackIndex: index,
    litLantern: lit ? game.sequence[index] : null,
    nextAt: firstAt + index * beat + (lit ? litMs : beat),
  });
}

export function input(game, action, now) {
  at(game, now);
  if (!action || typeof action !== "object" ||
      !["start", "press", "cancel"].includes(action.type)) throw new TypeError("Invalid action.");
  if (action.type === "press" && (!Number.isInteger(action.lantern) ||
      action.lantern < 0 || action.lantern >= game.rules.lanternCount)) {
    throw new RangeError("Invalid lantern.");
  }
  if (["done", "failed", "cancelled"].includes(game.phase)) return game;
  if (action.type === "cancel") return freeze({
    ...game, phase: "cancelled", score: 0, updatedAt: now, litLantern: null, nextAt: null,
  });
  if (action.type === "start") {
    if (game.phase !== "ready") return game;
    return freeze({ ...game, phase: "playback", updatedAt: now,
      startedAt: now, nextAt: now + game.rules.leadMs });
  }
  const current = advance(game, now);
  if (current.phase !== "input") return current;
  const correct = action.lantern === current.sequence[current.cursor];
  const cursor = current.cursor + 1;
  if (!correct) return freeze({
    ...current, updatedAt: now, phase: "failed", cursor, lastLantern: action.lantern,
    lastCorrect: false, nextAt: null, litLantern: null,
  });
  const completeRound = cursor === current.round;
  return freeze({
    ...current, updatedAt: now, cursor, lastLantern: action.lantern, lastCorrect: correct,
    score: current.score + Number(completeRound),
    phase: !completeRound ? "input" : current.round === current.rules.length ? "done" : "roundGap",
    nextAt: completeRound && current.round < current.rules.length ? now + current.rules.roundGapMs : null,
  });
}

/** In-progress and cancelled games never expose a reward-bearing score. */
export function result(game) {
  state(game);
  return Object.freeze(resonanceResult({
    completed: game.phase === "done", score: game.phase === "done" ? game.score : 0,
    maxScore: game.rules.length, cancelled: game.phase === "cancelled",
  }, game.resonance));
}
