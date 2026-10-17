import { restSurvival } from "./survival.mjs";
import { finishAction, didFaint } from "./economy.mjs";

export const DIRECTIONS_RULES = Object.freeze({ minutes: 10, fatigue: 2 });
const CHANCES = Object.freeze({
  place: 0.9, station: 0.75, cable_station: 0.75,
  road: 0.5, major_road: 0.5, building: 0.5, church: 0.5,
  plain: 0.25, grass: 0.25, field: 0.25, vineyard: 0.25, park: 0.25,
  forest: 0.15, hill: 0.15, mountain: 0.05, rail: 0.05, cable: 0.05, water: 0,
});

export function directionsChance(cell) {
  if (!cell || cell.unavailable || !Object.hasOwn(CHANCES, cell.terrain)) {
    throw new Error("Directions require a loaded cell with a known terrain.");
  }
  return CHANCES[cell.terrain];
}

export function citedTowns(state) {
  const trail = state.trail, towns = new Map();
  if (!trail) return [];
  const rank = { suggested: 0, known: 1, visited: 2 };
  function add(town, stage, status, elapsedMinutes = -1) {
    if (!town?.name || !Number.isFinite(town.latitude) || !Number.isFinite(town.longitude)) return;
    const key = JSON.stringify([town.name, town.latitude.toFixed(6), town.longitude.toFixed(6)]);
    const previous = towns.get(key);
    if (!previous || rank[status] > rank[previous.status] ||
        rank[status] === rank[previous.status] && elapsedMinutes > previous.elapsedMinutes) {
      towns.set(key, { key, name: town.name, latitude: town.latitude, longitude: town.longitude,
        stage, status, elapsedMinutes });
    }
  }
  const exploration = trail.exploration;
  for (const [stage, town] of trail.stages.entries()) {
    const arrival = trail.arrivals?.find(entry => entry.stage === stage);
    if (stage < trail.index || arrival) add(town, stage, "visited", arrival?.elapsedMinutes);
    else if ((stage === trail.index && (!exploration || exploration.knownStage === stage)) ||
        exploration?.hints.some(hint => hint.stage === stage && hint.kind === "place")) {
      add(town, stage, "known", exploration?.hints.find(hint =>
        hint.stage === stage && hint.kind === "place")?.elapsedMinutes);
    }
  }
  for (const [index, facts] of trail.history.entries()) {
    if (facts.next && (!exploration || index < exploration.firstStage)) {
      add(facts.next, index + 1, "known", facts.elapsedMinutes);
    }
  }
  for (const report of [...(exploration?.reports ?? []), ...(exploration?.lastReport ? [exploration.lastReport] : [])]) {
    if (report.outcome === "suggestion") add(report.town, report.stage, "suggested", report.elapsedMinutes);
  }
  return [...towns.values()].sort((a, b) => b.elapsedMinutes - a.elapsedMinutes || a.name.localeCompare(b.name));
}

export function askDirections(state, cell, info, survival, economy, random = Math.random) {
  if (state.ended || !state.trail || state.trail.completed) {
    throw new Error("No active journey destination to ask about.");
  }
  const chance = directionsChance(cell), roll = random();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error("Invalid directions encounter draw.");
  let next = restSurvival({ ...state, lastExpenseCents: 0 }, { ...survival,
    rest_minutes: DIRECTIONS_RULES.minutes, rest_fatigue_recovery: 0 });
  next = finishAction(state, { ...next,
    fatigue: Math.min(100, next.fatigue + DIRECTIONS_RULES.fatigue) }, info, economy, { random, survival });
  return { state: next, outcome: next.ended ? "exhausted"
    : didFaint(state, next) ? "fainted" : roll < chance ? "helped" : "nobody" };
}
