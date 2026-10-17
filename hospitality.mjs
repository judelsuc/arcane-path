import { journeyDate } from "./travel.mjs";
import { restSurvival, sleepSurvival } from "./survival.mjs";
import { finishAction, tarotEventChance } from "./economy.mjs";

export const HOSPITALITY_RULES = Object.freeze({ minutes: 30, failureChance: 0.5 });

export function hospitalityTown(cell) {
  if (!cell || cell.unavailable || cell.terrain !== "place") return null;
  return (cell.settlements ?? []).filter(place =>
    /^(node|way)\/\d+$/.test(place.osmId) && typeof place.name === "string" && place.name.trim())
    .sort((a, b) => a.osmId.localeCompare(b.osmId))[0] ?? null;
}

export function hospitalityStatus(state, cell) {
  const town = hospitalityTown(cell);
  const day = journeyDate(state).toISOString().slice(0, 10);
  const attempt = town && (state.hospitalityAttempts ?? []).find(a => a.townId === town.osmId && a.day === day);
  return { town, day, attempt: attempt ?? null,
    available: Boolean(town && !attempt && !state.ended) };
}

function dailyDraw(state, townId, day) {
  // Stable before autosave too: reopening an old save cannot reroll this town/day.
  const identity = JSON.stringify(["hospitality-v1", state.serverJourney?.seed ?? state.startedAt,
    state.birthCard, townId, day]);
  let hash = 2166136261;
  for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash / 2 ** 32;
}

export function askHospitality(state, cell, info, survival, economy, random = Math.random) {
  if (state.ended) throw new Error("This journey has ended.");
  const { town, day, available } = hospitalityStatus(state, cell);
  if (!town) throw new Error("Ask for hospitality in a mapped, named settlement cell.");
  if (!available) throw new Error("You have already asked in this town today.");
  const accepted = dailyDraw(state, town.osmId, day) >=
    tarotEventChance(HOSPITALITY_RULES.failureChance, state, economy);
  let next = finishAction(state, restSurvival(state, { ...survival,
    rest_minutes: HOSPITALITY_RULES.minutes, rest_fatigue_recovery: 0 }), info, economy, { random });
  let outcome = next.ended ? "exhausted" : accepted ? "hosted" : "refused";
  if (outcome === "hosted") {
    const sleeping = sleepSurvival({ ...next, lastExpenseCents: 0 }, survival);
    next = finishAction(next, sleeping, info, economy, { sheltered: true, random });
    if (next.ended) outcome = "exhausted";
  }
  return { ...next, hospitalityAttempts: [...(state.hospitalityAttempts ?? []), {
    townId: town.osmId, townName: town.name, day, outcome,
    startedMinutes: state.elapsedMinutes, finishedMinutes: next.elapsedMinutes,
  }] };
}

export function validateHospitality(state, survival) {
  if (state.hospitalityAttempts === undefined) return;
  const attempts = state.hospitalityAttempts;
  const fail = () => { throw new Error("Invalid hospitality history in journey save."); };
  if (!Array.isArray(attempts)) fail();
  const keys = new Set();
  let previousEnd = 0;
  for (const attempt of attempts) {
    if (!attempt || typeof attempt.townId !== "string" || !/^(node|way)\/\d+$/.test(attempt.townId) ||
        typeof attempt.townName !== "string" || !attempt.townName.trim() ||
        !["hosted", "refused", "exhausted"].includes(attempt.outcome) ||
        !Number.isFinite(attempt.startedMinutes) || attempt.startedMinutes < previousEnd ||
        !Number.isFinite(attempt.finishedMinutes) || attempt.finishedMinutes > state.elapsedMinutes ||
        attempt.finishedMinutes < attempt.startedMinutes + HOSPITALITY_RULES.minutes ||
        !Number.isFinite(state.startedAt + attempt.startedMinutes * 60_000) ||
        !Number.isFinite(new Date(state.startedAt + attempt.startedMinutes * 60_000).getTime())) fail();
    const duration = attempt.finishedMinutes - attempt.startedMinutes;
    const night = HOSPITALITY_RULES.minutes + survival.sleep_hours * 60;
    if (Math.abs(duration - (attempt.outcome === "hosted" ? night : HOSPITALITY_RULES.minutes)) > 1e-6 &&
        !(attempt.outcome === "exhausted" && Math.abs(duration - night) < 1e-6)) fail();
    const day = new Date(state.startedAt + attempt.startedMinutes * 60_000).toISOString().slice(0, 10);
    const key = `${attempt.townId}:${day}`;
    if (attempt.day !== day || keys.has(key)) fail();
    keys.add(key);
    previousEnd = attempt.finishedMinutes;
  }
}
