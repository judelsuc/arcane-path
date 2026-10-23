// Standalone, unpublished puzzle: board coordinates never represent geographic addresses.
const PHASES = ["memory", "route", "completed", "failed", "cancelled"];
const MAX_SCORE = 1000;
const STATE_KEYS = ["level", "phase", "targets", "delivered", "position", "distance",
  "mistakes", "startedAt", "lastNow", "routeStartedAt", "feedback", "resonance", "homeParcel"];
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const time = value => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const osm = value => typeof value === "string" && /^(node|way|relation)\/[1-9]\d*$/.test(value);

export function available(cell) {
  if (!record(cell) || cell.unavailable || cell.terrain !== "place" ||
      !Array.isArray(cell.settlements) || !cell.settlements.some(s => record(s) &&
        osm(s.osmId) && typeof s.name === "string" && s.name.trim())) return false;
  return Array.isArray(cell.pois) && cell.pois.some(p => {
    if (!record(p) || !osm(p.osmId) || typeof p.name !== "string" || !p.name.trim() ||
        !record(p.tags)) return false;
    const t = p.tags;
    if (["private", "no"].includes(t.access) ||
        t.disused && t.disused !== "no" || t.abandoned && t.abandoned !== "no") return false;
    return p.category === "amenity" &&
      ["post_office", "marketplace", "community_centre", "townhall", "library"].includes(t.amenity) ||
      p.category === "shop" && typeof t.shop === "string" && !["", "no", "vacant"].includes(t.shop);
  });
}

export function difficulty(level) {
  if (!integer(level, 0, 4)) throw new TypeError("Invalid deliveries level");
  return Object.freeze({ level, grid: 3 + Math.floor(level / 2), parcels: level === 0 ? 4 : 3 + level,
    memoryMs: 15000 - level * 1500, routeMs: 60000 + level * 10000,
    maxMistakes: 3, rewardMultiplier: 1 + level * 0.5 });
}

function distance(a, b, grid) {
  return Math.abs(a % grid - b % grid) + Math.abs(Math.floor(a / grid) - Math.floor(b / grid));
}

function optimum(targets, grid) {
  // At most seven stops: exact subset dynamic programming, including return to depot.
  const n = targets.length, dp = Array.from({ length: 1 << n }, () => Array(n).fill(Infinity));
  for (let i = 0; i < n; i++) dp[1 << i][i] = distance(0, targets[i], grid);
  for (let mask = 1; mask < 1 << n; mask++) {
    for (let i = 0; i < n; i++) if (mask & 1 << i) {
      for (let j = 0; j < n; j++) if (!(mask & 1 << j)) {
        const next = mask | 1 << j;
        dp[next][j] = Math.min(dp[next][j], dp[mask][i] + distance(targets[i], targets[j], grid));
      }
    }
  }
  return Math.min(...targets.map((cell, i) => dp[(1 << n) - 1][i] + distance(cell, 0, grid)));
}

function seal(game) {
  return Object.freeze({ ...game, targets: Object.freeze([...game.targets]),
    delivered: Object.freeze([...game.delivered]) });
}

function validate(game) {
  if (!record(game) || !integer(game.level, 0, 4)) throw new TypeError("Invalid deliveries state");
  const d = difficulty(game.level);
  if (Object.keys(game).length !== STATE_KEYS.length ||
      Object.keys(game).some(k => !STATE_KEYS.includes(k)) ||
      !PHASES.includes(game.phase) || !Array.isArray(game.targets) ||
      game.targets.length !== d.parcels || new Set(game.targets).size !== d.parcels ||
      Array.from(game.targets).some(c => !integer(c, 1, d.grid ** 2 - 1)) ||
      !Array.isArray(game.delivered) || game.delivered.length !== d.parcels ||
      Array.from(game.delivered).some(v => typeof v !== "boolean") ||
      !integer(game.position, 0, d.grid ** 2 - 1) || !integer(game.distance, 0, 1000) ||
      !integer(game.mistakes, 0, d.maxMistakes) || !time(game.startedAt) ||
      typeof game.resonance !== "boolean" ||
      !(game.resonance ? integer(game.homeParcel, 0, d.parcels - 1) : game.homeParcel === null) ||
      !time(game.lastNow) || game.lastNow < game.startedAt ||
      !(game.routeStartedAt === null || time(game.routeStartedAt) &&
        game.routeStartedAt >= game.startedAt && game.routeStartedAt <= game.lastNow) ||
      !["", "correct", "wrong", "timeout"].includes(game.feedback) ||
      game.phase === "memory" && (game.routeStartedAt !== null || game.distance !== 0 ||
        game.mistakes !== 0 || game.delivered.some(Boolean)) ||
      ["route", "completed", "failed"].includes(game.phase) && game.routeStartedAt === null ||
      (game.phase === "completed") !== game.delivered.every(Boolean) ||
      game.mistakes === d.maxMistakes && !["failed", "cancelled"].includes(game.phase) ||
      game.phase === "route" && game.mistakes >= d.maxMistakes) {
    throw new TypeError("Invalid deliveries state");
  }
  const stops = game.delivered.filter(Boolean).length + game.mistakes;
  const maxDistance = (stops + Number(game.phase === "completed")) * 2 * (d.grid - 1);
  if (game.distance > maxDistance || stops === 0 && game.position !== 0 ||
      game.phase === "memory" && game.feedback !== "") throw new TypeError("Invalid deliveries state");
  return d;
}

export function createGame(options = {}) {
  if (!record(options) || Object.keys(options).some(k => !["level", "random", "now", "resonance"].includes(k))) {
    throw new TypeError("Invalid deliveries options");
  }
  const { level = 0, random = Math.random, now = 0, resonance = false } = options;
  const d = difficulty(level);
  if (typeof random !== "function" || !time(now) || typeof resonance !== "boolean") {
    throw new TypeError("Invalid deliveries options");
  }
  const cells = Array.from({ length: d.grid ** 2 - 1 }, (_, i) => i + 1);
  for (let i = cells.length - 1; i > 0; i--) {
    const r = random();
    if (!Number.isFinite(r) || r < 0 || r >= 1) throw new TypeError("Invalid random sample");
    const j = Math.floor(r * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return seal({ level, phase: "memory", targets: cells.slice(0, d.parcels),
    delivered: Array(d.parcels).fill(false), position: 0, distance: 0, mistakes: 0,
    startedAt: now, lastNow: now, routeStartedAt: null, feedback: "",
    resonance, homeParcel: resonance ? 0 : null });
}

export function advance(game, now) {
  const d = validate(game);
  if (!time(now) || now < game.lastNow) throw new TypeError("Invalid deliveries clock");
  let next = { ...game, lastNow: now };
  if (next.phase === "memory" && now - game.startedAt >= d.memoryMs) {
    next.phase = "route";
    next.routeStartedAt = game.startedAt + d.memoryMs;
  }
  if (next.phase === "route" && now - next.routeStartedAt >= d.routeMs) {
    next.phase = "failed";
    next.feedback = "timeout";
  }
  return seal(next);
}

export function input(game, action, now) {
  const d = validate(game);
  if (!record(action) || !["ready", "deliver", "cancel"].includes(action.type) ||
      Object.keys(action).some(k => !["type", ...(action.type === "deliver" ? ["parcel", "cell"] : [])].includes(k)) ||
      action.type === "deliver" && (!integer(action.parcel, 0, d.parcels - 1) ||
        !integer(action.cell, 0, d.grid ** 2 - 1))) throw new TypeError("Invalid deliveries action");
  if (!time(now) || now < game.lastNow) throw new TypeError("Invalid deliveries clock");
  if (action.type === "cancel" && ["memory", "route"].includes(game.phase)) {
    return seal({ ...game, phase: "cancelled", lastNow: now });
  }
  let next = advance(game, now);
  if (["completed", "failed", "cancelled"].includes(next.phase)) return next;
  if (action.type === "ready" && next.phase === "memory") {
    return seal({ ...next, phase: "route", routeStartedAt: now });
  }
  if (action.type !== "deliver" || next.phase !== "route" || next.delivered[action.parcel]) return next;
  const correct = next.targets[action.parcel] === action.cell;
  const delivered = [...next.delivered];
  if (correct) delivered[action.parcel] = true;
  const mistakes = next.mistakes + Number(!correct);
  let travelled = next.distance + distance(next.position, action.cell, d.grid);
  let phase = mistakes >= d.maxMistakes ? "failed" : "route";
  if (delivered.every(Boolean)) {
    travelled += distance(action.cell, 0, d.grid);
    phase = "completed";
  }
  return seal({ ...next, delivered, mistakes, distance: travelled, position: action.cell,
    phase, feedback: correct ? "correct" : "wrong" });
}

export function result(game, riddenDistance) {
  const d = validate(game), completed = game.phase === "completed";
  if (riddenDistance !== undefined && (!Number.isFinite(riddenDistance) || riddenDistance < 0)) {
    throw new TypeError("Invalid ridden distance");
  }
  const travelled = riddenDistance ?? game.distance;
  const optimalDistance = optimum(game.targets, d.grid);
  return Object.freeze({ completed, score: completed ? Math.max(0,
    Math.round(MAX_SCORE * optimalDistance / Math.max(optimalDistance, travelled)) -
      game.mistakes * 100) : 0, maxScore: MAX_SCORE, cancelled: game.phase === "cancelled",
    rewardMultiplier: d.rewardMultiplier, distance: travelled, optimalDistance });
}
