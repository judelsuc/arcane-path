import { journeyDate } from "./travel.mjs";
import { restSurvival, sleepSurvival } from "./survival.mjs";
import { finishAction, tarotEventChance, didFaint } from "./economy.mjs";
import { didPlace, socialFailureChance, PLACEMENT_MINUTES } from "./pressures.mjs";

export const HOSPITALITY_RULES = Object.freeze({ minutes: 30, failureChance: 0.5 });

export function worshipPlaces(cell) {
  if (!cell || cell.unavailable) return [];
  return [...new Map((cell.pois ?? []).filter(place =>
    /^(node|way|relation)\/\d+$/.test(place.osmId) &&
    place.tags?.amenity === "place_of_worship" &&
    !["no", "private"].includes(place.tags.access) &&
    (!place.tags.disused || place.tags.disused === "no") &&
    (!place.tags.abandoned || place.tags.abandoned === "no"))
    .map(place => [place.osmId, place])).values()]
    .sort((a, b) => a.osmId.localeCompare(b.osmId));
}

export function hospitalityTown(cell) {
  if (!cell || cell.unavailable || cell.terrain !== "place") return null;
  return (cell.settlements ?? []).filter(place =>
    /^(node|way)\/\d+$/.test(place.osmId) && typeof place.name === "string" && place.name.trim())
    .sort((a, b) => a.osmId.localeCompare(b.osmId))[0] ?? null;
}

export function hospitalityStatus(state, cell, placeId) {
  const town = placeId === undefined ? hospitalityTown(cell)
    : worshipPlaces(cell).find(place => place.osmId === placeId) ?? null;
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

export function askHospitality(state, cell, info, survival, economy, random = Math.random, placeId) {
  if (state.ended) throw new Error("This journey has ended.");
  const { town, day, available } = hospitalityStatus(state, cell, placeId);
  if (!town) throw new Error(placeId === undefined
    ? "Ask for hospitality in a mapped, named settlement cell."
    : "This mapped place of worship is unavailable for a shelter request.");
  if (!available) throw new Error("You have already asked at this place today.");
  const accepted = dailyDraw(state, town.osmId, day) >=
    socialFailureChance(tarotEventChance(HOSPITALITY_RULES.failureChance, state, economy), state);
  let next = finishAction(state, restSurvival(state, { ...survival,
    rest_minutes: HOSPITALITY_RULES.minutes, rest_fatigue_recovery: 0 }), info, economy, { random, survival });
  let outcome = didPlace(state, next) ? "placed" : didFaint(state, next) ? "fainted"
    : next.ended ? "exhausted" : accepted ? "hosted" : "refused";
  if (outcome === "hosted") {
    const sleeping = sleepSurvival({ ...next, lastExpenseCents: 0 }, survival);
    next = finishAction(next, sleeping, info, economy, { sheltered: true, random, survival, washed: true });
    if (next.ended) outcome = "exhausted";
  }
  return { ...next, hospitalityAttempts: [...(state.hospitalityAttempts ?? []), {
    townId: town.osmId, townName: town.name?.trim() || town.osmId, day, outcome,
    ...(placeId === undefined ? {} : { placeKind: "worship" }),
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
    if (!attempt || typeof attempt.townId !== "string" ||
        !(attempt.placeKind === "worship" ? /^(node|way|relation)\/\d+$/ : /^(node|way)\/\d+$/).test(attempt.townId) ||
        (attempt.placeKind !== undefined && attempt.placeKind !== "worship") ||
        typeof attempt.townName !== "string" || !attempt.townName.trim() ||
        !["hosted", "refused", "exhausted", "fainted", "placed"].includes(attempt.outcome) ||
        !Number.isFinite(attempt.startedMinutes) || attempt.startedMinutes < previousEnd ||
        !Number.isFinite(attempt.finishedMinutes) || attempt.finishedMinutes > state.elapsedMinutes ||
        attempt.finishedMinutes < attempt.startedMinutes + HOSPITALITY_RULES.minutes ||
        !Number.isFinite(state.startedAt + attempt.startedMinutes * 60_000) ||
        !Number.isFinite(new Date(state.startedAt + attempt.startedMinutes * 60_000).getTime())) fail();
    const duration = attempt.finishedMinutes - attempt.startedMinutes;
    const night = HOSPITALITY_RULES.minutes + survival.sleep_hours * 60;
    const placement = state.pressures?.placements.find(p => p.startedMinutes >= attempt.startedMinutes &&
      p.finishedMinutes === attempt.finishedMinutes);
    if (attempt.outcome === "placed" && !placement) fail();
    const expected = attempt.outcome === "placed" ? HOSPITALITY_RULES.minutes + PLACEMENT_MINUTES
      : attempt.outcome === "fainted" ? HOSPITALITY_RULES.minutes + 480
      : attempt.outcome === "hosted" ? night : HOSPITALITY_RULES.minutes;
    if (Math.abs(duration - expected) > 1e-6 &&
        !(attempt.outcome === "exhausted" && Math.abs(duration - night) < 1e-6) &&
        !(attempt.outcome === "placed" && Math.abs(duration - expected - 480) < 1e-6)) fail();
    const day = new Date(state.startedAt + attempt.startedMinutes * 60_000).toISOString().slice(0, 10);
    const key = `${attempt.townId}:${day}`;
    if (attempt.day !== day || keys.has(key)) fail();
    keys.add(key);
    previousEnd = attempt.finishedMinutes;
  }
}
