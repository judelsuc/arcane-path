import { basalEnergy } from "./survival.mjs";
import { tarotEventFactor } from "./tarot-effects.mjs";

const clamp = value => Math.max(0, Math.min(100, value));
const sector = state => `${Math.floor(state.col / 8)},${Math.floor(state.row / 8)}`;
export const PLACEMENT_MINUTES = 24 * 60;
export const PLACEMENT_FACTORS = Object.freeze([
  "urban", "rural", "fatigue", "cleanliness", "police", "lingering",
  "steal", "beg", "music", "shelter", "movement", "wash",
]);

export function beginPressures(state, economy) {
  if (state.pressures || state.ended) return state;
  return { ...state, pressures: { version: 1, startedMinutes: state.elapsedMinutes,
    vigilance: 0, cleanliness: 80, locality: sector(state), localMinutes: 0,
    reputation: [], placements: [], tarotFactor: tarotEventFactor(state, economy) } };
}

export function refreshPressureTarot(state, economy) {
  if (!state.pressures) return state;
  return { ...state, pressures: { ...state.pressures, tarotFactor: tarotEventFactor(state, economy) } };
}

export function sympathy(state) {
  if (!state.pressures) return 50;
  const p = state.pressures;
  const reputation = p.reputation.find(r => r.locality === sector(state))?.value ?? 0;
  return clamp(50 + (p.cleanliness - 80) * 0.3 - state.fatigue * 0.15 + reputation +
    (1 - p.tarotFactor) * 30);
}

export function socialFailureChance(base, state) {
  if (!Number.isFinite(base) || base < 0 || base > 1) throw new Error("Invalid social probability.");
  if (base === 0 || base === 1) return base;
  return state.pressures ? Math.max(0.05, Math.min(0.95, base + (50 - sympathy(state)) / 200)) : base;
}

export function didPlace(previous, next) {
  return (next.pressures?.placements.length ?? 0) > (previous.pressures?.placements.length ?? 0);
}

export function changeReputation(state, amount) {
  if (!state.pressures) return state;
  const locality = sector(state), entries = state.pressures.reputation;
  const value = Math.max(-25, Math.min(25,
    (entries.find(r => r.locality === locality)?.value ?? 0) + amount));
  return { ...state, pressures: { ...state.pressures,
    reputation: [...entries.filter(r => r.locality !== locality).slice(-63), { locality, value }] } };
}

export function policePresence(cell) {
  return Boolean(cell?.pois?.some(p => p.tags?.amenity === "police"));
}

export function washingAvailable(cell) {
  return Boolean(cell && !cell.unavailable && (cell.terrain === "place" ||
    cell.pois?.some(p => ["toilets", "shower", "public_bath"].includes(p.tags?.amenity) &&
      !["private", "no"].includes(p.tags.access) &&
      (!p.tags.disused || p.tags.disused === "no") &&
      (!p.tags.abandoned || p.tags.abandoned === "no"))));
}

export function advancePressures(previous, next, info, { sheltered, activity, survival }) {
  if (!previous.pressures) return next;
  const p = previous.pressures;
  const minutes = next.elapsedMinutes - previous.elapsedMinutes;
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error("Invalid pressure action duration.");
  const locality = sector(next);
  const localMinutes = (locality === p.locality ? p.localMinutes : 0) + minutes;
  const hours = minutes / 60;
  const moving = Math.hypot(next.col - previous.col, next.row - previous.row) * 0.25;
  const cleanliness = activity === "wash" ? 100
    : clamp(p.cleanliness - (hours * (sheltered ? 0.2 : 0.8) + moving * 0.4) *
      (0.75 + p.tarotFactor * 0.25) +
      (sheltered && next.sleeps > previous.sleeps ? 30 : 0));
  const urban = ["place", "station", "building", "church"].includes(info.terrain);
  const lingeringHours = Math.max(0, localMinutes - 240) / 60 -
    Math.max(0, localMinutes - minutes - 240) / 60;
  const exposedHours = sheltered ? 0 : hours * p.tarotFactor;
  const factors = {
    urban: urban ? exposedHours * 3 : 0,
    rural: urban ? 0 : exposedHours * 0.5,
    fatigue: next.fatigue >= 70 ? exposedHours * 2 : 0,
    cleanliness: cleanliness < 30 ? exposedHours * 2 : 0,
    police: info.police ? exposedHours * 5 : 0,
    lingering: sheltered ? 0 : lingeringHours * 2 * p.tarotFactor,
    steal: activity === "steal" ? 20 * p.tarotFactor : 0,
    beg: activity === "beg" ? 4 * p.tarotFactor : 0,
    music: activity === "music" ? 2 * p.tarotFactor : 0,
    shelter: sheltered ? -hours * 2 : 0,
    movement: -moving * 2,
    wash: activity === "wash" ? -5 : 0,
  };
  const rate = (urban ? 3 : 0.5) + (next.fatigue >= 70 ? 2 : 0) +
    (cleanliness < 30 ? 2 : 0) + (info.police ? 5 : 0);
  const vigilance = clamp(p.vigilance + (sheltered ? -hours * 2 : (hours * rate + lingeringHours * 2) * p.tarotFactor) -
    moving * 2 + (activity === "steal" ? 20 : activity === "beg" ? 4 : activity === "music" ? 2 : 0) * p.tarotFactor -
    (activity === "wash" ? 5 : 0));
  next = { ...next, pressures: { ...p, locality, localMinutes, cleanliness, vigilance } };
  if (activity === "steal") next = changeReputation(next, -15);
  if (activity === "beg") next = changeReputation(next, -1);
  if (vigilance < 100 || next.ended) return next;
  if (!Number.isFinite(survival?.reserve_kcal)) throw new Error("Placement requires survival rules.");
  const lostCents = Math.floor(next.walletCents / 4);
  const placement = { startedMinutes: next.elapsedMinutes,
    finishedMinutes: next.elapsedMinutes + PLACEMENT_MINUTES,
    walletBeforeCents: next.walletCents, lostCents, col: next.col, row: next.row,
    trigger: { vigilanceBefore: p.vigilance, minutes, tarotFactor: p.tarotFactor, factors } };
  const placements = [...p.placements, placement];
  return { ...next, elapsedMinutes: placement.finishedMinutes,
    walletCents: next.walletCents - lostCents, reserveKcal: survival.reserve_kcal,
    energyKcal: next.energyKcal + basalEnergy(next, 16 * 60, survival) +
      basalEnergy(next, 8 * 60, survival, true),
    meals: next.meals + 3, sleeps: next.sleeps + 1,
    fatigue: 20, awakeHours: 0, ended: placements.length === 3 ? "placement" : null,
    pressures: { ...next.pressures, vigilance: 20, cleanliness: 80, localMinutes: 0, placements } };
}

export function witnessCooling(state) {
  if (!state.pressures || state.elapsedMinutes < state.pressures.startedMinutes) return 0;
  const visit = state.trail.story?.visits?.[state.trail.index];
  const age = visit ? (state.startedAt + state.elapsedMinutes * 60_000 - visit.departure) / 60_000
    : state.elapsedMinutes - state.pressures.startedMinutes;
  const recallAge = age * state.pressures.tarotFactor;
  return recallAge >= 30 * 1440 ? 2 : recallAge >= 7 * 1440 ? 1 : 0;
}

export function validatePressures(state, economy) {
  if (state.pressures === undefined) {
    if (state.ended === "placement") throw new Error("Missing placement history.");
    return;
  }
  const p = state.pressures, finite = v => Number.isFinite(v) && v >= 0;
  const locality = value => typeof value === "string" && /^-?\d+,-?\d+$/.test(value) &&
    value.split(",").every(n => Number.isSafeInteger(Number(n)) && Math.abs(Number(n)) <= 1000);
  const fail = () => { throw new Error("Invalid pressure history in journey save."); };
  if (!p || p.version !== 1 || !finite(p.startedMinutes) || p.startedMinutes > state.elapsedMinutes ||
      p.tarotFactor !== tarotEventFactor(state, economy) ||
      !finite(p.vigilance) || p.vigilance > 100 || !finite(p.cleanliness) || p.cleanliness > 100 ||
      !locality(p.locality) || p.locality !== sector(state) || !finite(p.localMinutes) ||
      p.localMinutes > state.elapsedMinutes - p.startedMinutes + 1e-6 ||
      !Array.isArray(p.reputation) || p.reputation.length > 64 ||
      new Set(p.reputation.map(r => r?.locality)).size !== p.reputation.length ||
      p.reputation.some(r => !r || !locality(r.locality) || !Number.isFinite(r.value) || Math.abs(r.value) > 25) ||
      !Array.isArray(p.placements) || p.placements.length > 3 ||
      (state.ended === "placement") !== (p.placements.length === 3)) fail();
  let end = p.startedMinutes;
  for (const placement of p.placements) {
    if (!placement || !finite(placement.startedMinutes) || placement.startedMinutes < end ||
        !finite(placement.finishedMinutes) || placement.finishedMinutes > state.elapsedMinutes ||
        Math.abs(placement.finishedMinutes - placement.startedMinutes - PLACEMENT_MINUTES) > 1e-6 ||
        !Number.isSafeInteger(placement.walletBeforeCents) || placement.walletBeforeCents < 0 ||
        placement.lostCents !== Math.floor(placement.walletBeforeCents / 4) ||
        !Number.isSafeInteger(placement.col) || Math.abs(Math.floor(placement.col / 8)) > 1000 ||
        !Number.isSafeInteger(placement.row) || Math.abs(Math.floor(placement.row / 8)) > 1000) fail();
    if (placement.trigger !== undefined) {
      const { vigilanceBefore, minutes, tarotFactor, factors } = placement.trigger ?? {};
      if (!finite(vigilanceBefore) || vigilanceBefore > 100 || !finite(minutes) ||
          minutes > placement.startedMinutes - end + 1e-6 ||
          !finite(tarotFactor) || tarotFactor < 0.5 || tarotFactor > 1.5 ||
          !factors || Object.keys(factors).length !== PLACEMENT_FACTORS.length ||
          PLACEMENT_FACTORS.some(key => !Number.isFinite(factors[key]) ||
            (["shelter", "movement", "wash"].includes(key) ? factors[key] > 0 : factors[key] < 0)) ||
          vigilanceBefore + Object.values(factors).reduce((sum, value) => sum + value, 0) < 100 - 1e-6) fail();
    }
    end = placement.finishedMinutes;
  }
}
