import { resolveResonance, resonanceResult } from "../arcane-resonance.mjs";
// Fictional sorting only; settlement, payment and save handling belong to the host.
const RULES = Object.freeze(Array.from({ length: 5 }, (_, level) => Object.freeze({
  level, baskets: Math.max(3, 2 + level), rounds: 16,
  fallMs: level === 0 ? 2500 : 2800 - level * 350, steerPerSecond: 0.75,
  rewardMultiplier: 1 + level * 0.25,
  rottenCount: 2 + level,
  durationMs: 30000,
  squashMs: 500, fastFallMs: 160,
})));
const MAX_TIME = Number.MAX_SAFE_INTEGER - 120000;

function time(value) {
  if (!Number.isFinite(value) || value < 0 || value > MAX_TIME) {
    throw new RangeError("Invalid harvest time.");
  }
}

export function difficulty(level) {
  if (!Number.isInteger(level) || level < 0 || level > 4) {
    throw new RangeError("Harvest level must be 0–4.");
  }
  return RULES[level];
}

function active(tags = {}) {
  if (!tags || typeof tags !== "object") return false;
  return !["no", "private", "customers", "permit", "agricultural", "forestry"].includes(tags.access) &&
    ["disused", "abandoned", "demolished", "construction", "proposed"].every(
      key => !tags[key] || tags[key] === "no");
}

export function available(cell) {
  if (!cell || cell.unavailable || cell.inTown || cell.settlement ||
      cell.settlements?.length || ["place", "town", "city", "village"].includes(cell.terrain)) return false;
  const mapped = ["contentSources", "pois", "sources"].flatMap(key =>
    Array.isArray(cell[key]) ? cell[key].filter(source => source?.tags?.landuse === "vineyard") : []);
  if (cell.terrain === "vineyard") {
    return active(cell.tags) && (!mapped.length || mapped.some(source => active(source.tags)));
  }
  return mapped.some(source => active(source.tags));
}

function seal(game) {
  return Object.freeze(game);
}

export function createGame({ level = 0, random = Math.random, now = 0, ...options } = {}) {
  const resonance = resolveResonance("harvest", options);
  const rule = difficulty(level);
  time(now);
  if (typeof random !== "function") throw new TypeError("Invalid harvest random source.");
  function sample() {
    const draw = random();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new RangeError("Invalid harvest draw.");
    return draw;
  }
  const items = Object.freeze(Array.from({ length: rule.rounds }, () => Math.floor(sample() * rule.baskets)));
  const spawns = Object.freeze(Array.from({ length: rule.rounds }, () => 0.08 + sample() * 0.84));
  const rotten = Array(rule.rounds).fill(false);
  if (resonance) {
    const remaining = Array.from({ length: rule.rounds }, (_, i) => i);
    for (let i = 0; i < rule.rottenCount; i++) {
      rotten[remaining.splice(Math.floor(sample() * remaining.length), 1)[0]] = true;
    }
  }
  return seal({ level, resonance, items, spawns, rotten: Object.freeze(rotten),
    seed: Math.floor(sample() * 4294967296), savedMs: 0, pressAt: null, pressIndex: null,
    fastAt: null, fastProgress: 0,
    x: spawns[0], direction: 0,
    startedAt: now, now, index: 0, score: 0,
    cancelled: false, feedback: "ready" });
}

function validate(game) {
  if (!game || typeof game !== "object") throw new TypeError("Invalid harvest game.");
  const rule = difficulty(game.level);
  time(game.startedAt);
  time(game.now);
  if (game.now < game.startedAt || typeof game.resonance !== "boolean" || !Array.isArray(game.items) ||
      game.items.length !== rule.rounds ||
      !Array.from(game.items).every(item => Number.isInteger(item) && item >= 0 && item < rule.baskets) ||
      !Array.isArray(game.spawns) || game.spawns.length !== rule.rounds ||
      !Array.from(game.spawns).every(x => Number.isFinite(x) && x >= 0.08 && x <= 0.92) ||
      !Number.isInteger(game.seed) || game.seed < 0 || game.seed > 4294967295 ||
      !Array.isArray(game.rotten) || game.rotten.length !== rule.rounds ||
      !Array.from(game.rotten).every(value => typeof value === "boolean") ||
      game.rotten.filter(Boolean).length !== (game.resonance ? rule.rottenCount : 0) ||
      !Number.isFinite(game.savedMs) || game.savedMs < 0 || game.savedMs > game.index * rule.fallMs ||
      !(game.fastAt === null || Number.isFinite(game.fastAt) && game.fastAt >= game.startedAt &&
        game.fastAt <= game.now) || !Number.isFinite(game.fastProgress) ||
      game.fastProgress < 0 || game.fastProgress >= 1 ||
      !(game.pressAt === null && game.pressIndex === null ||
        Number.isFinite(game.pressAt) && game.pressAt >= game.startedAt && game.pressAt <= game.now &&
        Number.isInteger(game.pressIndex) && game.pressIndex >= 0 && game.pressIndex <= game.index) ||
      !Number.isFinite(game.x) || game.x < 0.04 || game.x > 0.96 ||
      ![-1, 0, 1].includes(game.direction) ||
      !Number.isSafeInteger(game.index) || game.index < 0 ||
      !Number.isInteger(game.score) || game.score < 0 || game.score > game.index ||
      typeof game.cancelled !== "boolean" ||
      !["ready", "correct", "wrong", "squashed", "wasted", "spoiled", "cancelled"].includes(game.feedback) ||
      !game.cancelled && game.index !==
        Math.floor((Math.min(game.now - game.startedAt, rule.durationMs) + game.savedMs) / rule.fallMs)) {
    throw new TypeError("Invalid harvest game.");
  }
  return rule;
}

export function bunchAt(game, index = game.index) {
  const rule = difficulty(game.level);
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError("Invalid harvest bunch index.");
  if (index < rule.rounds) return { colour: game.items[index], x: game.spawns[index], rotten: game.rotten[index] };
  let seed = (game.seed ^ Math.imul(index, 0x9e3779b9)) >>> 0;
  const draw = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return { colour: Math.floor(draw() * rule.baskets), x: 0.08 + draw() * 0.84,
    rotten: game.resonance && draw() < rule.rottenCount / rule.rounds };
}

export function advance(game, now) {
  const rule = validate(game);
  time(now);
  if (now < game.now) throw new RangeError("Harvest time cannot go backwards.");
  if (game.cancelled || game.now >= game.startedAt + rule.durationMs) return game;
  let { x, index, score, feedback, savedMs, fastAt, fastProgress } = game, at = game.now;
  const end = Math.min(now, game.startedAt + rule.durationMs);
  // Split at landings so a late frame cannot steer a new bunch before it exists.
  while (at <= end) {
    const naturalLanding = game.startedAt + (index + 1) * rule.fallMs - savedMs;
    const landing = fastAt === null ? naturalLanding : Math.min(naturalLanding, fastAt + rule.fastFallMs);
    const bunch = bunchAt(game, index);
    const squashAt = game.pressIndex === index && fastAt === null ? game.pressAt + rule.squashMs : Infinity;
    const eventAt = Math.min(landing, squashAt);
    const until = Math.min(end, eventAt);
    x = Math.max(0.04, Math.min(0.96, x + game.direction * rule.steerPerSecond * (until - at) / 1000));
    at = until;
    if (until < eventAt) break;
    if (squashAt < landing) {
      score += Number(bunch.rotten);
      feedback = bunch.rotten ? "squashed" : "wasted";
    } else if (bunch.rotten) {
      score = Math.max(0, score - 1);
      feedback = "spoiled";
    } else {
      const correct = Math.min(rule.baskets - 1, Math.floor(x * rule.baskets)) === bunch.colour;
      score += Number(correct);
      feedback = correct ? "correct" : "wrong";
    }
    savedMs += naturalLanding - eventAt;
    fastAt = null;
    fastProgress = 0;
    index++;
    x = bunchAt(game, index).x;
  }
  return seal({ ...game, now, x, index, score, feedback, savedMs, fastAt, fastProgress });
}

export function input(game, action, now) {
  const rule = validate(game);
  if (!["cancel", "left", "right", "stop", "press", "release", "abort-press"].includes(action)) {
    throw new TypeError("Invalid harvest action.");
  }
  const next = advance(game, now);
  if (next.cancelled || next.now >= next.startedAt + rule.durationMs) return next;
  if (action === "cancel") return seal({ ...next, cancelled: true, feedback: "cancelled" });
  if (action === "release" || action === "abort-press") {
    const drop = action === "release" && next.pressIndex === next.index && next.fastAt === null;
    return seal({ ...next, pressAt: null, pressIndex: null,
      fastAt: drop ? now : next.fastAt,
      fastProgress: drop
        ? (now - next.startedAt + next.savedMs - next.index * rule.fallMs) / rule.fallMs : next.fastProgress });
  }
  if (action === "press") {
    if (next.pressAt !== null || next.fastAt !== null) return next;
    return seal({ ...next, pressAt: now, pressIndex: next.index });
  }
  return seal({ ...next, direction: action === "left" ? -1 : action === "right" ? 1 : 0 });
}

export function result(game) {
  const rule = validate(game);
  return Object.freeze(resonanceResult({
    completed: !game.cancelled && game.now >= game.startedAt + rule.durationMs,
    score: game.score, maxScore: game.index, cancelled: game.cancelled }, game.resonance));
}
