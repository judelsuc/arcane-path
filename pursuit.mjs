import { escapeTerrain, replayEscape, ESCAPE_VERSION } from "./minigames/pursuit-escape.mjs";
import { healthValue } from "./health.mjs";
import { createPursuitAtmosphere, validatePursuitAtmosphere } from "./pursuit-atmosphere.mjs";

export const PURSUIT = Object.freeze({ version: 1, graceMinutes: 1440, gapKm: 30,
  speedKmPerMinute: 2 / 60, contactKm: 0.05 });
export const pursuitPending = state => Boolean(state?.pursuit?.pending) && !state.ended;
// The fight a capture led to, read from the saved brawl history (validated there).
const pursuerFight = (state, escapeId) => state.brawl?.history?.find(record =>
  record?.kind === "pursuer" && record.escapeId === escapeId);
const distance = (x, y, col, row, scale) => Math.hypot(x - col * scale, y - row * scale);

export function pursuitDifficulty(state, completed = state.pursuit?.history.length ?? 0, days) {
  const health = healthValue(state), { fatigue, awakeHours } = state;
  if (!Number.isSafeInteger(completed) || completed < 0 ||
      days !== undefined && (!Number.isFinite(days) || days < 0) ||
      ![health, fatigue, awakeHours].every(Number.isFinite) ||
      health < 0 || health > 100 || fatigue < 0 || fatigue > 100 || awakeHours < 0) {
    throw new Error("Invalid escape condition.");
  }
  const strain = ((100 - health) + fatigue + Math.min(100, awakeHours / 24 * 100)) / 3;
  const modifier = strain < 15 ? -2 : strain < 30 ? -1 : strain < 50 ? 0 : strain < 70 ? 1 : 2;
  // The pursuer grows bolder with every escape attempt and, since version 8,
  // with each passing journey day of the chase (days is replay-derived from
  // the attempt's elapsed time, never stored).
  const base = Math.min(10, 1 + Math.floor(completed / 2) + Math.floor((days ?? 0) / 2));
  return { base, modifier, level: Math.max(1, Math.min(10, base + modifier)), health, fatigue, awakeHours };
}

export function beginPursuit(state, cellSizeMeters = 250) {
  if (!state || state.pursuit || state.ended) return state;
  if (!Number.isFinite(cellSizeMeters) || cellSizeMeters <= 0) throw new Error("Invalid pursuit grid.");
  const scale = cellSizeMeters / 1000;
  return { ...state, pursuit: { version: 1, startedMinutes: state.elapsedMinutes,
    observedMinutes: state.elapsedMinutes, x: state.col * scale - PURSUIT.gapKm,
    y: state.row * scale, playerCol: state.col, playerRow: state.row,
    cellSizeMeters, pending: null, history: [] } };
}

export function pursuitStatus(state) {
  const p = state?.pursuit;
  if (!p) return null;
  const grace = Math.max(0, p.startedMinutes + PURSUIT.graceMinutes - state.elapsedMinutes);
  const gap = distance(p.x, p.y, state.col, state.row, p.cellSizeMeters / 1000);
  return { gap, grace, stage: state.ended === "captured" ? "captured" : p.pending ? "escape"
    : grace ? "grace" : gap <= 2 ? "danger" : gap <= 10 ? "near" : "distant" };
}

export function advancePursuit(state, cell, info) {
  const p = state?.pursuit;
  if (!p) return state;
  if (state.ended) return p.pending ? { ...state, pursuit: { ...p, pending: null } } : state;
  if (state.elapsedMinutes === p.observedMinutes && state.col === p.playerCol && state.row === p.playerRow) return state;
  if (state.elapsedMinutes < p.observedMinutes) throw new Error("Pursuit time cannot go backwards.");
  if (p.pending) {
    if (p.pending.status === "active") throw new Error("Resolve the pursuit before advancing journey time.");
    if (!cell || cell.unavailable || cell.downloading) throw new Error("Pursuit escape requires loaded terrain.");
    return { ...state, pursuit: { ...p, observedMinutes: state.elapsedMinutes,
      playerCol: state.col, playerRow: state.row, pending: { ...p.pending, col: state.col, row: state.row,
        terrain: escapeTerrain(cell.terrain), elapsedMinutes: state.elapsedMinutes } } };
  }
  const scale = p.cellSizeMeters / 1000;
  const start = Math.max(p.observedMinutes, p.startedMinutes + PURSUIT.graceMinutes);
  const duration = state.elapsedMinutes - p.observedMinutes;
  let x = p.x, y = p.y, reached = false;
  if (p.observedMinutes < p.startedMinutes + PURSUIT.graceMinutes) {
    const ratio = Math.min(1, (p.startedMinutes + PURSUIT.graceMinutes - p.observedMinutes) / duration);
    x = (p.playerCol + (state.col - p.playerCol) * ratio) * scale - PURSUIT.gapKm;
    y = (p.playerRow + (state.row - p.playerRow) * ratio) * scale;
  }
  // Follow the player's action trajectory, not real-world time or walked-distance credit.
  for (let time = start; time < state.elapsedMinutes;) {
    const step = Math.min(1, state.elapsedMinutes - time);
    const ratio = (time + step - p.observedMinutes) / duration;
    const px = (p.playerCol + (state.col - p.playerCol) * ratio) * scale;
    const py = (p.playerRow + (state.row - p.playerRow) * ratio) * scale;
    const gap = Math.hypot(px - x, py - y);
    const move = Math.min(gap, PURSUIT.speedKmPerMinute * step);
    if (gap) { x += (px - x) / gap * move; y += (py - y) / gap * move; }
    if (Math.hypot(px - x, py - y) <= PURSUIT.contactKm) { reached = true; break; }
    time += step;
  }
  let pending = null;
  if (reached) {
    if (!cell || cell.unavailable || cell.downloading) throw new Error("Pursuit escape requires loaded terrain.");
    let seed = 2166136261;
    for (const char of `${state.serverJourney?.seed ?? state.startedAt}:${p.history.length}:${state.col}:${state.row}`) {
      seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
    }
    pending = { version: ESCAPE_VERSION, id: p.history.length + 1, seed,
      difficulty: pursuitDifficulty(state, p.history.length,
        (state.elapsedMinutes - p.startedMinutes) / 1440),
      atmosphere: createPursuitAtmosphere(state, cell, info, seed),
      terrain: escapeTerrain(cell.terrain), col: state.col, row: state.row,
      elapsedMinutes: state.elapsedMinutes, status: "ready" };
  }
  return { ...state, pursuit: { ...p, x, y, observedMinutes: state.elapsedMinutes,
    playerCol: state.col, playerRow: state.row, pending } };
}

export function beginPursuitEscape(state, mode) {
  const pending = state.pursuit?.pending;
  if (state.ended || pending?.status !== "ready" || !["normal", "accessible"].includes(mode)) {
    throw new Error("This escape cannot start.");
  }
  return { ...state, pursuit: { ...state.pursuit, pending: { ...pending, status: "active", mode } } };
}

export function settlePursuitEscape(state, transcript) {
  const p = state.pursuit, pending = p?.pending;
  if (state.ended || pending?.status !== "active") throw new Error("This escape cannot be settled.");
  const { jumps, ticks, abandoned } = transcript;
  const outcome = replayEscape(pending.seed, jumps, ticks, abandoned, pending.version, pending.difficulty?.level);
  const scale = p.cellSizeMeters / 1000;
  const dx = p.x - state.col * scale, dy = p.y - state.row * scale;
  const length = Math.hypot(dx, dy);
  return { ...state, ended: outcome === "captured" ? "captured" : null,
    pursuit: { ...p, ...(outcome === "escaped" ? {
      x: state.col * scale + (length ? dx / length : -1) * PURSUIT.gapKm,
      y: state.row * scale + (length ? dy / length : 0) * PURSUIT.gapKm,
    } : {}), pending: null, history: [...p.history, { ...pending, outcome,
      jumps: [...jumps], ticks, abandoned }] } };
}

export function validatePursuit(state) {
  const p = state?.pursuit;
  const fail = () => { throw new Error("Invalid saved pursuit."); };
  if (!p) { if (state?.ended === "captured") fail(); return; }
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const coord = value => Number.isSafeInteger(value) && Math.abs(Math.floor(value / 8)) <= 1000;
  if (Object.keys(p).sort().join() !==
      "cellSizeMeters,history,observedMinutes,pending,playerCol,playerRow,startedMinutes,version,x,y" ||
      p.version !== 1 || ![p.x, p.y, p.startedMinutes, p.observedMinutes, p.cellSizeMeters].every(finite) ||
      p.cellSizeMeters <= 0 || p.cellSizeMeters > 10000 || p.startedMinutes < 0 ||
      p.observedMinutes < p.startedMinutes || p.observedMinutes > state.elapsedMinutes ||
      !state.ended && (p.observedMinutes !== state.elapsedMinutes ||
        p.playerCol !== state.col || p.playerRow !== state.row) ||
      ![p.playerCol, p.playerRow].every(coord) || !Array.isArray(p.history)) fail();
  let lastTime = p.startedMinutes + PURSUIT.graceMinutes;
  for (const [index, item] of [...p.history, ...(p.pending ? [p.pending] : [])].entries()) {
    const pending = index === p.history.length;
    const keys = ["version", "id", "seed", "terrain", "col", "row", "elapsedMinutes", "status",
      ...(item?.version >= 3 ? ["difficulty"] : []),
      ...(item?.version >= 6 ? ["atmosphere"] : []),
      ...(!pending || item?.status === "active" ? ["mode"] : []),
      ...(!pending ? ["outcome", "jumps", "ticks", "abandoned"] : [])].sort().join();
    if (!item || Object.keys(item).sort().join() !== keys || ![1, 2, 3, 4, 5, 6, 7, ESCAPE_VERSION].includes(item.version) ||
        item.id !== index + 1 || !Number.isSafeInteger(item.seed) || item.seed < 0 || item.seed > 0xffffffff ||
        !["woodland", "streets", "rocky", "country"].includes(item.terrain) ||
        ![item.col, item.row].every(coord) || !finite(item.elapsedMinutes) ||
        item.elapsedMinutes < lastTime || item.elapsedMinutes > state.elapsedMinutes ||
        !(pending ? ["ready", "active"] : ["active"]).includes(item.status) ||
        (item.status === "active" && !["normal", "accessible"].includes(item.mode))) fail();
    if (item.version >= 3) {
      const d = item.difficulty;
      if (!d || Object.keys(d).sort().join() !== "awakeHours,base,fatigue,health,level,modifier") fail();
      const expected = pursuitDifficulty(d, index);
      if (item.version >= 8) {
        // The difficulty is pinned when the attempt is created, while its
        // elapsed time keeps advancing when the escape is deferred, so the
        // exact days input cannot be reproduced: accept any base between the
        // attempts-only floor and the ceiling the latest elapsed time allows.
        const ceiling = pursuitDifficulty(d, index,
          Math.max(0, (item.elapsedMinutes - p.startedMinutes) / 1440)).base;
        if (["health", "fatigue", "awakeHours", "modifier"].some(key => expected[key] !== d[key]) ||
            !Number.isSafeInteger(d.base) || d.base < expected.base || d.base > ceiling ||
            d.level !== Math.max(1, Math.min(10, d.base + d.modifier))) fail();
      } else if (Object.keys(expected).some(key => expected[key] !== d[key])) fail();
    }
    if (item.version >= 6) validatePursuitAtmosphere(item.atmosphere);
    if (pending && (state.ended || item.col !== state.col || item.row !== state.row ||
        item.elapsedMinutes !== state.elapsedMinutes)) fail();
    if (!pending && replayEscape(item.seed, item.jumps, item.ticks, item.abandoned,
      item.version, item.difficulty?.level) !== item.outcome) fail();
    // Since 0.22.47 a capture opens a fight with the pursuer: winning it lets the
    // journey continue, so a capture is final only when that fight was lost (or,
    // for older saves, when no fight followed it).
    if (!pending && item.outcome === "captured" &&
        !["won", "escaped"].includes(pursuerFight(state, item.id)?.outcome) &&
        index !== p.history.length - 1) fail();
    lastTime = item.elapsedMinutes;
  }
  const last = p.history.at(-1);
  const lastFight = last?.outcome === "captured" ? pursuerFight(state, last.id) : undefined;
  const fighting = last?.outcome === "captured" && state.brawl?.pending?.kind === "pursuer" &&
    state.brawl.pending.escapeId === last.id;
  const final = last?.outcome === "captured" && !fighting && !["won", "escaped"].includes(lastFight?.outcome);
  if ((state.ended === "captured") !== final) fail();
}
