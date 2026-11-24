// Journey side of the self-defence brawl: when a fight happens, what is at stake,
// and how its outcome is settled and verified by replay.
import { BRAWL_VERSION, createBrawl, replayBrawl } from "./minigames/brawl.mjs";
import { ESCAPE_VERSION, replayEscape } from "./minigames/pursuit-escape.mjs";
import { PURSUIT } from "./pursuit.mjs";
import { journeyEquipmentModifiers } from "./equipment.mjs";
import { healthValue } from "./health.mjs";
import { activePower, powerCoverage } from "./lore-effects.mjs";
import { policePresence } from "./pressures.mjs";
import { skyState } from "./sky.mjs";
import { journeyDate } from "./travel.mjs";

export const BRAWL_COOLDOWN_MINUTES = 7 * 1440;
const STREET_CHANCE = { night: 0.035, day: 0.008 };
const CAMP_CHANCE = 0.15;
const HISTORY_LIMIT = 30;
const URBAN = new Set(["place", "building", "church", "station"]);
const KINDS = ["street", "camp", "pursuer"];
// "fled": the traveller outran street attackers before any blow was exchanged.
const OUTCOMES = ["won", "escaped", "lost", "fled"];
const FLIGHT_FATIGUE = 6;
// Losing is a robbery and a beating, never death.
export const BRAWL_LOSS = Object.freeze({ health: 15, fatigue: 10 });
const WIN_FATIGUE = 4;

function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return value;
}

function draw(state, salt) {
  return hash(`${state.serverJourney?.seed ?? state.startedAt}:brawl:${salt}`) / 0x100000000;
}

function isNight(state, info) {
  try {
    if (Number.isFinite(info?.latitude) && Number.isFinite(info?.longitude)) {
      return skyState(journeyDate(state), info.latitude, info.longitude).phase === "night";
    }
  } catch { /* fall back to the clock */ }
  const hour = journeyDate(state).getUTCHours();
  return hour < 6 || hour >= 21;
}

export function urbanCell(cell) {
  return Boolean(cell && !cell.unavailable && (URBAN.has(cell.terrain) || cell.settlements?.length));
}

export function brawlPending(state) {
  return Boolean(state?.brawl?.pending);
}

function knifeReady(state) {
  return Boolean(state.equipment?.items?.some(item => item.id === "knife" && item.condition > 0));
}

function dogReady(state) {
  return state.equipment !== undefined && Boolean(journeyEquipmentModifiers(state).dogReady);
}

function cooledDown(state) {
  const last = state.brawl?.lastEncounterMinutes ?? null;
  return last === null || state.elapsedMinutes - last >= BRAWL_COOLDOWN_MINUTES;
}

function available(state) {
  // Never stack a fight on top of another pending event or activity.
  return !state.ended && !brawlPending(state) && cooledDown(state) && !state.events?.pending &&
    !state.pursuit?.pending && !state.theftPending && !state.miniGamePending && !state.performancePending &&
    !state.cafePending && state.equipment?.dogEncounter !== "pending";
}

export function brawlLevel(state, kind, night) {
  const days = Math.floor(state.elapsedMinutes / 1440);
  return Math.max(1, Math.min(10, 1 + Math.floor(days / 3) + (state.fatigue >= 70 ? 1 : 0) +
    (night && kind === "street" ? 1 : 0)));
}

export function brawlBreath(state) {
  return Math.max(2, Math.min(5, 1 + Math.ceil(healthValue(state) / 25)));
}

function pending(state, kind, info, salt) {
  const night = isNight(state, info);
  const r = [1, 2, 3].map(index => draw(state, `${salt}:${index}`));
  const opponents = kind === "camp" ? 1 + (r[0] < 0.4 ? 1 : 0)
    : Math.min(3, 1 + (night && r[0] < 0.6 ? 1 : 0) + (r[1] < 0.25 ? 1 : 0));
  const history = state.brawl?.history ?? [];
  return {
    version: BRAWL_VERSION, id: (history.at(-1)?.id ?? 0) + 1, kind,
    seed: hash(`${state.serverJourney?.seed ?? state.startedAt}:${salt}:seed`),
    level: brawlLevel(state, kind, night), opponents, breath: brawlBreath(state),
    knife: knifeReady(state), dog: dogReady(state), drowsy: kind === "camp",
    phase: night ? "night" : "day", col: state.col, row: state.row,
    elapsedMinutes: state.elapsedMinutes, status: "ready", escapeId: null, flight: null,
  };
}

function withPending(state, item) {
  const brawl = state.brawl ?? { version: 1, lastEncounterMinutes: null, pending: null, history: [] };
  return { ...state, brawl: { ...brawl, pending: item } };
}

// After a walking step: a bad encounter may start in town, more often at night.
export function streetEncounter(previous, moved, cell, info) {
  if (!moved || moved === previous || (moved.col === previous.col && moved.row === previous.row) ||
      !available(moved) || !urbanCell(cell) || policePresence(cell)) return moved;
  const chance = isNight(moved, info) ? STREET_CHANCE.night : STREET_CHANCE.day;
  const salt = `street:${moved.elapsedMinutes}:${moved.col}:${moved.row}`;
  if (draw(moved, salt) >= chance) return moved;
  return withPending(moved, pending(moved, "street", info, salt));
}

// Before sleeping without shelter: the share of the night slept before being woken, or null.
export function campInterruption(state, shelterId, minutes) {
  if (shelterId !== null || !available(state)) return null;
  const sanctuary = activePower(state, "emperor");
  if (sanctuary && sanctuary.col === state.col && sanctuary.row === state.row &&
      powerCoverage(state, "emperor", minutes) === minutes) return null;
  const salt = `camp:${state.elapsedMinutes}:${state.col}:${state.row}`;
  const chance = CAMP_CHANCE * (dogReady(state) ? 0.5 : 1);
  if (draw(state, salt) >= chance) return null;
  return 0.35 + 0.4 * draw(state, `${salt}:share`);
}

export function beginCampEncounter(state, info) {
  return withPending(state, pending(state, "camp", info, `camp-fight:${state.elapsedMinutes}:${state.col}:${state.row}`));
}

// A capture by the pursuer opens a fight instead of ending the journey at once.
export function openPursuerFight(state, info) {
  const last = state.pursuit?.history?.at(-1);
  if (state.ended !== "captured" || last?.outcome !== "captured" || brawlPending(state) ||
      state.brawl?.history?.some(record => record.kind === "pursuer" && record.escapeId === last.id)) return state;
  const night = isNight(state, info);
  const history = state.brawl?.history ?? [];
  const item = {
    version: BRAWL_VERSION, id: (history.at(-1)?.id ?? 0) + 1, kind: "pursuer",
    seed: hash(`${state.serverJourney?.seed ?? state.startedAt}:pursuer:${last.id}:${last.seed}`),
    level: Math.max(1, Math.min(10, last.difficulty?.level ?? 1)), opponents: 1, breath: brawlBreath(state),
    knife: knifeReady(state), dog: dogReady(state), drowsy: false, phase: night ? "night" : "day",
    col: state.col, row: state.row, elapsedMinutes: state.elapsedMinutes, status: "ready",
    escapeId: last.id, flight: null,
  };
  return withPending({ ...state, ended: null }, item);
}

function flightSeed(item) {
  return hash(`flight:${item.seed}:${item.id}`);
}

// Street attackers can be outrun: the same run as the pursuit escape, through streets.
export function beginFlight(state) {
  const item = state.brawl?.pending;
  if (state.ended || item?.kind !== "street" || item.status !== "ready" || item.flight !== null) {
    throw new Error("Fleeing is not possible now.");
  }
  const flight = { version: ESCAPE_VERSION, seed: flightSeed(item), difficulty: item.level, status: "active" };
  return { ...state, brawl: { ...state.brawl, pending: { ...item, flight } } };
}

export function settleFlight(state, transcript) {
  const item = state.brawl?.pending;
  if (state.ended || item?.flight?.status !== "active") throw new Error("This flight cannot be settled.");
  const { jumps, ticks, abandoned } = transcript ?? {};
  const outcome = replayEscape(item.flight.seed, jumps, ticks, abandoned, item.flight.version, item.flight.difficulty);
  const flight = { ...item.flight, status: "done", outcome, jumps: [...jumps], ticks, abandoned };
  if (outcome === "captured") {
    // Caught after running: the fight starts out of breath.
    return { ...state, brawl: { ...state.brawl, pending: { ...item, flight, breath: Math.max(1, item.breath - 1) } } };
  }
  const record = { ...item, status: "active", flight, outcome: "fled", changes: [], ticks: 0, abandoned: false,
    stolenCents: 0, healthLost: 0 };
  return { ...state, fatigue: Math.min(100, state.fatigue + FLIGHT_FATIGUE),
    brawl: { ...state.brawl, lastEncounterMinutes: item.elapsedMinutes, pending: null,
      history: [...state.brawl.history, record].slice(-HISTORY_LIMIT) } };
}

export function brawlSetup(item) {
  return { seed: item.seed, level: item.level, context: item.kind, opponents: item.opponents,
    breath: item.breath, dog: item.dog, drowsy: item.drowsy, knife: item.knife };
}

export function beginBrawl(state) {
  const item = state.brawl?.pending;
  if (state.ended || item?.status !== "ready" || item.flight?.status === "active") throw new Error("This fight cannot start.");
  return { ...state, brawl: { ...state.brawl, pending: { ...item, status: "active" } } };
}

export function brawlStolenCents(state, item) {
  const wallet = state.walletCents ?? 0;
  return Math.min(Math.floor(wallet / 2), Math.ceil(wallet * (0.25 + 0.25 * draw(state, `robbery:${item.id}:${item.seed}`))));
}

export function settleBrawl(state, transcript) {
  const item = state.brawl?.pending;
  if (state.ended || item?.status !== "active") throw new Error("This fight cannot be settled.");
  const { changes, ticks, abandoned } = transcript ?? {};
  const outcome = replayBrawl(brawlSetup(item), { changes, ticks, abandoned });
  const lost = outcome === "lost";
  const pursuer = item.kind === "pursuer";
  const stolenCents = lost && !pursuer ? brawlStolenCents(state, item) : 0;
  const healthLost = lost && !pursuer ? Math.min(BRAWL_LOSS.health, Math.max(0, healthValue(state) - 1)) : 0;
  const record = { ...item, outcome, changes: changes.map(change => [...change]), ticks, abandoned,
    stolenCents, healthLost };
  const history = [...state.brawl.history, record].slice(-HISTORY_LIMIT);
  if (pursuer) {
    // Losing to the pursuer ends the journey as a capture always did; beating him
    // gives back the same head start as a successful escape.
    const p = state.pursuit, scale = p.cellSizeMeters / 1000;
    const dx = p.x - state.col * scale, dy = p.y - state.row * scale, length = Math.hypot(dx, dy);
    return { ...state, ended: lost ? "captured" : null,
      fatigue: Math.min(100, state.fatigue + (lost ? 0 : BRAWL_LOSS.fatigue)),
      pursuit: lost ? p : { ...p, x: state.col * scale + (length ? dx / length : -1) * PURSUIT.gapKm,
        y: state.row * scale + (length ? dy / length : 0) * PURSUIT.gapKm },
      brawl: { ...state.brawl, pending: null, history } };
  }
  return {
    ...state,
    walletCents: (state.walletCents ?? 0) - stolenCents,
    ...(lost ? { health: healthValue(state) - healthLost } : {}),
    fatigue: Math.min(100, state.fatigue + (lost ? BRAWL_LOSS.fatigue : WIN_FATIGUE)),
    brawl: { ...state.brawl, lastEncounterMinutes: item.elapsedMinutes, pending: null, history },
  };
}

const ITEM_KEYS = ["version", "id", "kind", "seed", "level", "opponents", "breath", "knife", "dog", "drowsy",
  "phase", "col", "row", "elapsedMinutes", "status", "escapeId", "flight"];
const RECORD_KEYS = [...ITEM_KEYS, "outcome", "changes", "ticks", "abandoned", "stolenCents", "healthLost"];

function validFlight(flight, item, done) {
  const keys = done ? ["version", "seed", "difficulty", "status", "outcome", "jumps", "ticks", "abandoned"]
    : ["version", "seed", "difficulty", "status"];
  if (!flight || typeof flight !== "object" || Object.keys(flight).sort().join() !== [...keys].sort().join() ||
      flight.version !== ESCAPE_VERSION || flight.seed !== flightSeed(item) || flight.difficulty !== item.level ||
      flight.status !== (done ? "done" : "active")) return false;
  if (!done) return true;
  try {
    return replayEscape(flight.seed, flight.jumps, flight.ticks, flight.abandoned, flight.version,
      flight.difficulty) === flight.outcome;
  } catch { return false; }
}

export function validateBrawl(state) {
  const b = state?.brawl;
  if (b === undefined) return;
  const fail = () => { throw new Error("Invalid saved fight."); };
  const same = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join() === [...keys].sort().join();
  if (!same(b, ["version", "lastEncounterMinutes", "pending", "history"]) || b.version !== 1 ||
      !Array.isArray(b.history) || b.history.length > HISTORY_LIMIT ||
      b.lastEncounterMinutes !== null && (!Number.isFinite(b.lastEncounterMinutes) ||
        b.lastEncounterMinutes < 0 || b.lastEncounterMinutes > state.elapsedMinutes)) fail();
  const escapes = new Map((state.pursuit?.history ?? []).map(item => [item.id, item]));
  const checkItem = (item, keys) => {
    if (!same(item, keys) || item.version !== BRAWL_VERSION || !KINDS.includes(item.kind) ||
        !Number.isSafeInteger(item.id) || item.id < 1 || !["day", "night"].includes(item.phase) ||
        !Number.isFinite(item.elapsedMinutes) || item.elapsedMinutes > state.elapsedMinutes ||
        ![item.col, item.row].every(Number.isSafeInteger)) fail();
    if (item.kind === "pursuer") {
      // A pursuer fight follows a recorded capture and is never fled.
      if (escapes.get(item.escapeId)?.outcome !== "captured" || item.flight !== null || item.opponents !== 1) fail();
    } else if (item.escapeId !== null) fail();
    if (item.flight !== null && item.kind !== "street") fail();
    try { createBrawl(brawlSetup(item)); } catch { fail(); }
  };
  let lastId = 0, lastTime = -Infinity, lastEncounter = null;
  const fought = new Set();
  for (const record of b.history) {
    checkItem(record, RECORD_KEYS);
    if (record.id <= lastId || record.elapsedMinutes < lastTime || record.status !== "active" ||
        !OUTCOMES.includes(record.outcome) || !Number.isSafeInteger(record.stolenCents) || record.stolenCents < 0 ||
        !Number.isFinite(record.healthLost) || record.healthLost < 0 || record.healthLost > BRAWL_LOSS.health ||
        record.outcome !== "lost" && (record.stolenCents || record.healthLost) ||
        record.kind === "pursuer" && (record.stolenCents || record.healthLost)) fail();
    if (record.flight !== null && !validFlight(record.flight, record, true)) fail();
    if (record.outcome === "fled") {
      if (record.flight?.outcome !== "escaped" || record.changes.length || record.ticks || record.abandoned) fail();
    } else {
      if (record.flight !== null && record.flight.outcome !== "captured") fail();
      let replayed;
      try { replayed = replayBrawl(brawlSetup(record), record); } catch { fail(); }
      if (replayed !== record.outcome) fail();
    }
    if (record.kind === "pursuer") {
      if (fought.has(record.escapeId)) fail();
      fought.add(record.escapeId);
    } else lastEncounter = record.elapsedMinutes;
    lastId = record.id; lastTime = record.elapsedMinutes;
  }
  if (b.history.length === HISTORY_LIMIT ? lastEncounter !== null && b.lastEncounterMinutes !== lastEncounter
    : b.lastEncounterMinutes !== lastEncounter) fail();
  if (b.pending !== null) {
    const item = b.pending;
    checkItem(item, ITEM_KEYS);
    if (!["ready", "active"].includes(item.status) || item.id <= lastId || state.ended ||
        item.col !== state.col || item.row !== state.row) fail();
    if (item.flight !== null && !validFlight(item.flight, item, item.flight?.status === "done")) fail();
    if (item.flight?.status === "done" && item.flight.outcome !== "captured") fail();
    if (item.flight?.status === "active" && item.status !== "ready") fail();
    if (item.kind === "pursuer" && (fought.has(item.escapeId) || state.pursuit?.history.at(-1)?.id !== item.escapeId)) fail();
  }
}
