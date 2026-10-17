import { publicPlace } from "./towns.mjs";
import { restSurvival } from "./survival.mjs";
import { finishAction } from "./economy.mjs";

const PARENTS = ["Camille", "Alex", "Sacha", "Noa"];
export const TRAIL_STAGES = 10;

export function createTrail(map, col, row, random = Math.random) {
  const pick = values => {
    const n = random();
    if (!Number.isFinite(n) || n < 0 || n >= 1) throw new Error("Invalid trail generation draw.");
    return values[Math.floor(n * values.length)];
  };
  const candidates = [];
  for (let r = 0; r < map.height; r++) {
    for (let c = 0; c < map.width; c++) {
      const cell = map.rows[r][c];
      if (cell.unavailable) continue;
      const settlement = cell.settlements?.find(item => item.name?.trim());
      const poi = (cell.pois ?? []).filter(publicPlace)
        .sort((a, b) => a.osmId.localeCompare(b.osmId))[0];
      const place = settlement ?? poi;
      if (place) candidates.push({ col: c, row: r, name: place.name, osmId: place.osmId });
    }
  }
  if (candidates.length < TRAIL_STAGES) throw new Error(`The local map needs ${TRAIL_STAGES} distinct named public locations for a parent trail.`);
  const stages = [];
  let origin = { col, row };
  for (let i = 0; i < TRAIL_STAGES; i++) {
    const nearby = candidates.filter(candidate =>
      !stages.some(s => s.col === candidate.col && s.row === candidate.row))
      .sort((a, b) => Math.hypot(a.col - origin.col, a.row - origin.row) -
        Math.hypot(b.col - origin.col, b.row - origin.row) || a.osmId.localeCompare(b.osmId))
      .slice(0, 4);
    const stage = pick(nearby);
    stages.push({ ...stage, witnessId: `fictional-traveler-${i + 1}` });
    origin = stage;
  }
  return { version: 1, parentName: pick(PARENTS), stages, index: 0, history: [], completed: false };
}

export function trailTarget(state) {
  return state.trail?.stages[state.trail.index] ?? null;
}

export function atTrailTarget(state) {
  const target = trailTarget(state);
  return Boolean(target && state.col === target.col && state.row === target.row);
}

export function witnessFacts(state) {
  const target = trailTarget(state);
  if (!target) return null;
  return { witnessId: target.witnessId, parentName: state.trail.parentName,
    place: target.name, next: state.trail.stages[state.trail.index + 1] ?? null,
    fictional: true };
}

export function interviewTrail(state, info, survival, economy) {
  if (!state.trail || state.trail.completed || !atTrailTarget(state)) {
    throw new Error("No new parent-trail encounter at the player's position.");
  }
  const next = finishAction(state, restSurvival(state, { ...survival,
    rest_minutes: 5, rest_fatigue_recovery: 0 }), info, economy);
  if (next.ended) return next;
  const facts = witnessFacts(state);
  const index = state.trail.index + 1;
  const completed = index === state.trail.stages.length;
  return { ...next, ended: completed ? "reunion" : null, trail: { ...state.trail,
    index, completed, history: [...state.trail.history, facts] } };
}
