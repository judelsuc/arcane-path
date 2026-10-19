import { clueDirection } from "./trail-search.mjs";
import { atTrailTarget } from "./trail.mjs";

export const TRAIL_DREAMS = Object.freeze({ minimumSleep: 60, interval: 720, stalled: 1440, chance: 0.5 });
const directions = new Set(["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]);

export function validateTrailDreams(state) {
  const dreams = state?.trail?.dreams;
  if (dreams === undefined) return;
  const fail = () => { throw new Error("Invalid parent dream history."); };
  if (!dreams || dreams.version !== 1 || !Array.isArray(dreams.checks) || dreams.checks.length > 128) fail();
  let lastCheck = -Infinity;
  for (const check of dreams.checks) {
    if (!check || !Number.isInteger(check.stage) || check.stage < 0 ||
        check.stage > state.trail.index || check.stage >= state.trail.stages.length ||
        !Number.isFinite(check.startedMinutes) || check.startedMinutes < 0 ||
        check.checkMinutes !== check.startedMinutes + TRAIL_DREAMS.minimumSleep ||
        check.checkMinutes < lastCheck + TRAIL_DREAMS.interval ||
        !Number.isFinite(check.elapsedMinutes) || check.elapsedMinutes < check.checkMinutes ||
        check.elapsedMinutes > state.elapsedMinutes ||
        !Number.isSafeInteger(check.col) || !Number.isSafeInteger(check.row) ||
        Math.abs(Math.floor(check.col / 8)) > 1000 || Math.abs(Math.floor(check.row / 8)) > 1000 ||
        typeof check.rescue !== "boolean" || !["guidance", "miss"].includes(check.outcome) ||
        (check.outcome === "guidance" ? !directions.has(check.direction) ||
          check.direction !== clueDirection(check, state.trail.stages[check.stage])
          : check.direction !== null || check.rescue)) fail();
    lastCheck = check.checkMinutes;
  }
}

export function settleTrailDream(previous, next, { startedMinutes = previous.elapsedMinutes } = {}) {
  validateTrailDreams(previous);
  if (!Number.isFinite(startedMinutes) || startedMinutes < previous.elapsedMinutes ||
      startedMinutes > next.elapsedMinutes) throw new Error("Invalid parent dream sleep start.");
  if (!previous.trail || previous.ended || next.ended || previous.trail.completed ||
      previous.trail.index !== next.trail.index || next.sleeps !== previous.sleeps + 1 ||
      (next.faints ?? 0) !== (previous.faints ?? 0) ||
      (next.pressures?.placements.length ?? 0) !== (previous.pressures?.placements.length ?? 0) ||
      next.elapsedMinutes - startedMinutes < TRAIL_DREAMS.minimumSleep || atTrailTarget(previous)) return next;
  const checks = previous.trail.dreams?.checks ?? [];
  const checkMinutes = startedMinutes + TRAIL_DREAMS.minimumSleep;
  if (checks.length && checkMinutes < checks.at(-1).checkMinutes + TRAIL_DREAMS.interval) return next;
  const stage = previous.trail.index, exploration = previous.trail.exploration;
  const progress = [
    ...previous.trail.history,
    ...(previous.trail.arrivals ?? []).filter(entry => entry.stage === stage),
    ...[...(exploration?.hints ?? []), ...(exploration?.signs ?? []), ...(exploration?.reports ?? []),
      ...checks.filter(entry => entry.outcome === "guidance")].filter(entry => entry.stage === stage),
  ];
  const lastProgress = Math.max(0, ...progress.map(entry => entry.elapsedMinutes ?? 0));
  const rescue = exploration?.searchStreak?.stage === stage && exploration.searchStreak.failures === 3 ||
    checkMinutes - lastProgress >= TRAIL_DREAMS.stalled;
  const identity = JSON.stringify(["parent-dream-v1", previous.serverJourney?.seed ?? previous.startedAt,
    stage, startedMinutes, previous.col, previous.row]);
  let hash = 2166136261;
  for (const character of identity) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  const success = rescue || hash / 2 ** 32 < TRAIL_DREAMS.chance;
  const check = { stage, startedMinutes, checkMinutes, elapsedMinutes: next.elapsedMinutes,
    col: previous.col, row: previous.row, rescue, outcome: success ? "guidance" : "miss",
    direction: success ? clueDirection(previous, previous.trail.stages[stage]) : null };
  let trail = { ...next.trail, dreams: { version: 1, checks: [...checks, check].slice(-128) } };
  if (success && exploration?.searchStreak?.stage === stage) trail = { ...trail,
    exploration: { ...trail.exploration, searchStreak: { ...exploration.searchStreak, failures: 0 } } };
  const result = { ...next, trail };
  validateTrailDreams(result);
  return result;
}

export function trailDreamText(dream, t) {
  return t("trailDreamText", { direction: t(`hintCompass.${dream.direction}`) });
}
