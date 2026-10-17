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
