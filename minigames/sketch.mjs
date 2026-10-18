import { resolveResonance, resonanceResult } from "../arcane-resonance.mjs";
// Original, fictional motifs: these are never photographs or mapped geography.
const SCENES = Object.freeze([
  { id: "pine", rows: ["...#...", "..###..", ".#####.", "#######", "...#...", "...#...", "..###.."] },
  { id: "cottage", rows: ["...#...", "..###..", ".#####.", "#######", ".#...#.", ".#.#.#.", ".#####."] },
  { id: "sail", rows: ["...#...", "...##..", "...###.", "...####", ".#####.", "..###..", "#######"] },
  { id: "bridge", rows: [".......", "#.....#", "#######", "#.#.#.#", "#.#.#.#", ".......", "#######"] },
]);
const games = new WeakSet();
const OSM_ID = /^(node|way|relation)\/\d{1,20}$/;
const TOURISM = new Set(["viewpoint", "attraction", "artwork", "museum", "gallery", "picnic_site"]);
const PUBLIC_ACCESS = new Set([undefined, "yes", "public", "permissive", "designated"]);

function mapped(item) {
  return item && typeof item === "object" && typeof item.osmId === "string" && OSM_ID.test(item.osmId) &&
    typeof item.name === "string" && item.name.trim().length > 0 && item.name.length <= 300;
}

/** Accept only the current mapped cell, never a nearby-POI search or terrain guess. */
export function available(cell) {
  if (!cell || typeof cell !== "object" || cell.unavailable ||
      !PUBLIC_ACCESS.has(cell.tags?.access)) return false;
  if (Array.isArray(cell.settlements) && cell.settlements.slice(0, 100).some(item =>
    mapped(item) && PUBLIC_ACCESS.has(item.tags?.access) &&
    (!item.tags?.disused || item.tags.disused === "no") &&
    (!item.tags?.abandoned || item.tags.abandoned === "no"))) return true;
  return Array.isArray(cell.pois) && cell.pois.slice(0, 1000).some(item =>
    mapped(item) && item.category === "tourism" && TOURISM.has(item.tags?.tourism) &&
    PUBLIC_ACCESS.has(item.tags?.access) &&
    (!item.tags?.disused || item.tags.disused === "no") &&
    (!item.tags?.abandoned || item.tags.abandoned === "no"));
}

export const INK = Object.freeze([
  Object.freeze({ symbol: ".", colour: "#b09a73" }),
  Object.freeze({ symbol: "#", colour: "#315c45" }),
  Object.freeze({ symbol: "O", colour: "#b84037" }),
  Object.freeze({ symbol: "+", colour: "#2866ad" }),
  Object.freeze({ symbol: "*", colour: "#86519c" }),
]);

export function difficulty(level = 0) {
  if (!Number.isInteger(level) || level < 0 || level > 4) throw new RangeError("Invalid sketch level");
  return Object.freeze({ level, width: 3 + level, height: 3 + level,
    colours: [1, 1, 2, 2, 4][level],
    observeMs: [7000, 8000, 7000, 12000, 11000][level],
    rewardMultiplier: 1 + level * 0.25 });
}

function timeValid(now) {
  return Number.isSafeInteger(now) && now >= 0;
}

function state(value) {
  Object.freeze(value.target);
  Object.freeze(value.marks);
  Object.freeze(value);
  games.add(value);
  return value;
}

function known(game) {
  if (!game || !games.has(game)) throw new TypeError("Unknown sketch game");
}

/**
 * State is immutable and opaque to construction (no save/store integration).
 * now uses monotonic milliseconds. random is called exactly once and must return [0, 1).
 */
export function createGame({ level = 0, random = Math.random, now = 0, ...options } = {}) {
  const resonance = resolveResonance("sketch", options);
  const settings = difficulty(level);
  if (!timeValid(now) || typeof random !== "function") throw new TypeError("Invalid sketch options");
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new RangeError("Invalid random sample");
  const scene = SCENES[Math.floor(sample * SCENES.length)];
  const size = settings.width, middle = Math.floor(size / 2);
  const target = Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size), col = index % size;
    let filled;
    if (scene.id === "pine") filled = row < size - 1
      ? Math.abs(col - middle) <= Math.floor(row / 2) : col === middle;
    else if (scene.id === "cottage") filled = row < middle
      ? Math.abs(col - middle) <= row : col === 0 || col === size - 1 || row === middle || row === size - 1;
    else if (scene.id === "sail") filled = row === size - 1 || col === middle ||
      row < size - 2 && col > middle && col <= middle + row;
    else filled = row === middle || row === size - 1 || (col === 0 || col === size - 1) && row >= middle - 1;
    return filled ? 1 + (row + col) % settings.colours : 0;
  });
  const occupied = target.flatMap((ink, index) => ink ? [index] : []);
  const landmarks = Object.freeze(resonance
    ? [occupied[0], occupied[Math.floor(occupied.length / 2)], occupied.at(-1)] : []);
  return state({ ...settings, resonance, landmarks, scene: scene.id, phase: "ready", target,
    marks: Array(size * size).fill(0), lastNow: now, observedAt: null });
}

export function advance(game, now) {
  known(game);
  if (!timeValid(now) || now < game.lastNow || ["completed", "cancelled"].includes(game.phase)) return game;
  const phase = game.phase === "observe" && now - game.observedAt >= game.observeMs ? "draw" : game.phase;
  if (now === game.lastNow && phase === game.phase) return game;
  return state({ ...game, phase, lastNow: now });
}

/**
 * Actions: start, remember (hide early), toggle {row,col,colour?}, clear, submit, cancel.
 * Invalid actions/timestamps are harmless no-ops; terminal states never change.
 * Drawing is untimed. Score = exact colour matches minus incorrect ink, floored at zero.
 */
export function input(game, action, now) {
  known(game);
  if (!timeValid(now) || now < game.lastNow || !action || typeof action !== "object" ||
      !["start", "remember", "toggle", "clear", "submit", "cancel"].includes(action.type)) return game;
  if (action.type === "toggle" && (!Number.isInteger(action.row) || !Number.isInteger(action.col) ||
      action.row < 0 || action.row >= game.height || action.col < 0 || action.col >= game.width ||
      action.colour !== undefined && (!Number.isInteger(action.colour) || action.colour < 0 ||
        action.colour > game.colours))) return game;
  if (["completed", "cancelled"].includes(game.phase)) return game;
  const current = advance(game, now);
  if (action.type === "cancel") return state({ ...current, phase: "cancelled" });
  if (action.type === "start" && current.phase === "ready")
    return state({ ...current, phase: "observe", observedAt: now });
  if (action.type === "remember" && current.phase === "observe")
    return state({ ...current, phase: "draw" });
  if (current.phase !== "draw") return current;
  if (action.type === "submit") return state({ ...current, phase: "completed" });
  if (action.type === "clear") return state({ ...current, marks: Array(game.width * game.height).fill(0) });
  if (action.type !== "toggle") return current;
  const marks = [...current.marks];
  const index = action.row * game.width + action.col, colour = action.colour ?? 1;
  marks[index] = marks[index] === colour ? 0 : colour;
  return state({ ...current, marks });
}

/** Pin-ready plain text only; no HTML, user strings, coordinates, URLs or storage writes. */
export function result(game) {
  known(game);
  const completed = game.phase === "completed";
  const maxScore = game.target.filter(Boolean).length;
  const score = completed ? Math.max(0, game.marks.reduce((sum, ink, index) =>
    sum + (ink ? (game.target[index] === ink ? 1 : -1) : 0), 0)) : 0;
  const output = { completed, score, maxScore, cancelled: game.phase === "cancelled" };
  if (completed) output.sketch = Object.freeze({ kind: "original-ascii", fictional: true,
    scene: game.scene, width: game.width, height: game.height,
    rows: Object.freeze(Array.from({ length: game.height }, (_, row) =>
      game.marks.slice(row * game.width, (row + 1) * game.width).map(ink => INK[ink].symbol).join(""))) });
  return Object.freeze(resonanceResult(output, game.resonance));
}

export function constellation(game) {
  known(game);
  return Object.freeze(game.landmarks.filter(index => game.marks[index] === game.target[index]));
}
