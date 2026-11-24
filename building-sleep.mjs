import { journeyDate } from "./travel.mjs";
import { restSurvival, sleepSurvival } from "./survival.mjs";
import { actionInterrupted, finishAction } from "./economy.mjs";
import { challengeOutcome, validateEventChallenge } from "./event-qte.mjs";

export const BUILDING_SEARCH_MINUTES = 10;
export const buildingSleepPending = state =>
  ["ready", "active"].includes(state?.buildingSleepAttempts?.at(-1)?.qte.status);

export function buildingSleepStatus(state, cell) {
  const day = journeyDate(state).toISOString().slice(0, 10);
  const attempt = (state.buildingSleepAttempts ?? []).find(item =>
    item.col === state.col && item.row === state.row && item.day === day);
  return { attempt, day, available: cell?.terrain === "building" && !cell.unavailable &&
    !cell.downloading && !state.ended && !attempt && !buildingSleepPending(state) };
}

export function buildingSleepEvent(attempt, index) {
  return { kind: "delay", id: index + 1, opportunity: index + 1, qte: attempt.qte };
}

export function startBuildingSleep(state, cell, info, survival, economy, random = Math.random) {
  const status = buildingSleepStatus(state, cell);
  if (!status.available || state.events?.pending || state.miniGamePending ||
      state.cafePending || state.theftPending || state.performancePending || state.legendAdventure ||
      state.equipment?.dogEncounter === "pending") throw new Error("Building shelter search is unavailable.");
  const next = finishAction(state, restSurvival({ ...state, lastExpenseCents: 0 }, {
    ...survival, rest_minutes: BUILDING_SEARCH_MINUTES, rest_fatigue_recovery: 0,
  }), info, economy, { random, survival });
  const interrupted = actionInterrupted(state, next);
  return { ...next, buildingSleepAttempts: [...(state.buildingSleepAttempts ?? []), {
    col: state.col, row: state.row, day: status.day,
    startedMinutes: state.elapsedMinutes, finishedMinutes: next.elapsedMinutes,
    outcome: interrupted ? "interrupted" : "searching",
    qte: interrupted ? { version: 3, status: "skipped", fatigue: state.fatigue,
      health: state.health ?? 100, mode: "normal", trace: [], elapsedMs: 0 }
      : { version: 3, status: "ready", fatigue: next.fatigue, health: next.health ?? 100 },
  }] };
}

function updateAttempt(state, attempt) {
  return { ...state, buildingSleepAttempts: [...state.buildingSleepAttempts.slice(0, -1), attempt] };
}

export function beginBuildingSleep(state) {
  const attempt = state.buildingSleepAttempts?.at(-1);
  if (!attempt || attempt.qte.status !== "ready" || state.ended ||
      attempt.col !== state.col || attempt.row !== state.row ||
      attempt.finishedMinutes !== state.elapsedMinutes) throw new Error("Building shelter QTE cannot start.");
  return updateAttempt(state, { ...attempt, qte: { ...attempt.qte, status: "active", mode: "normal" } });
}

export function settleBuildingSleep(state, cell, info, survival, economy, result, random = Math.random) {
  const attempt = state.buildingSleepAttempts?.at(-1);
  if (!attempt || attempt.qte.status !== "active" || attempt.col !== state.col || attempt.row !== state.row ||
      attempt.finishedMinutes !== state.elapsedMinutes ||
      cell?.terrain !== "building" || cell.unavailable || cell.downloading || state.ended) {
    throw new Error("Building shelter QTE cannot be settled here.");
  }
  const status = challengeOutcome(buildingSleepEvent(attempt, state.buildingSleepAttempts.length - 1),
    "normal", result.trace, result.elapsedMs, result.skipped);
  let next = state;
  if (status === "success") {
    next = finishAction(state, sleepSurvival({ ...state, lastExpenseCents: 0 }, survival),
      info, economy, { sheltered: true, survival, random });
  } else {
    next = finishAction(state, { ...state, lastMove: null, lastExpenseCents: 0 },
      info, economy, { survival, activity: "buildingSearch", random });
  }
  return updateAttempt(next, { ...attempt, finishedMinutes: next.elapsedMinutes,
    outcome: actionInterrupted(state, next) ? "interrupted" : status === "success" ? "slept" : "outside",
    qte: { ...attempt.qte, status, trace: structuredClone(result.trace), elapsedMs: result.elapsedMs } });
}

export function validateBuildingSleep(state, survival) {
  if (state.buildingSleepAttempts === undefined) return;
  if (!Array.isArray(state.buildingSleepAttempts)) throw new Error("Invalid building shelter history.");
  const seen = new Set();
  let end = 0;
  state.buildingSleepAttempts.forEach((attempt, index, attempts) => {
    const fail = () => { throw new Error("Invalid building shelter attempt."); };
    if (!attempt || Object.keys(attempt).sort().join() !==
        ["col", "row", "day", "startedMinutes", "finishedMinutes", "outcome", "qte"].sort().join() ||
        ![attempt.col, attempt.row].every(value => Number.isSafeInteger(value) && Math.abs(Math.floor(value / 8)) <= 1000) ||
        ![attempt.startedMinutes, attempt.finishedMinutes].every(Number.isFinite) ||
        attempt.startedMinutes < end || attempt.finishedMinutes < attempt.startedMinutes + BUILDING_SEARCH_MINUTES ||
        attempt.finishedMinutes > state.elapsedMinutes ||
        !["searching", "slept", "outside", "interrupted"].includes(attempt.outcome)) fail();
    const date = new Date(state.startedAt + attempt.startedMinutes * 60000);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== attempt.day) fail();
    const key = `${attempt.col}:${attempt.row}:${attempt.day}`;
    if (seen.has(key) || attempt.qte?.version !== 3) fail();
    seen.add(key);
    validateEventChallenge(buildingSleepEvent(attempt, index));
    const pending = ["ready", "active"].includes(attempt.qte.status);
    const duration = attempt.finishedMinutes - attempt.startedMinutes;
    const expected = BUILDING_SEARCH_MINUTES + (attempt.qte.status === "success" ? survival.sleep_hours * 60 : 0);
    if (pending !== (attempt.outcome === "searching") ||
        pending && attempt.finishedMinutes !== state.elapsedMinutes ||
        pending && (index !== attempts.length - 1 || state.col !== attempt.col || state.row !== attempt.row || state.ended) ||
        attempt.outcome === "slept" && attempt.qte.status !== "success" ||
        attempt.outcome === "outside" && !["failure", "skipped"].includes(attempt.qte.status)) fail();
    if (Math.abs(duration - expected) > 1e-6 &&
        !(attempt.outcome === "interrupted" && [480, 1440, 1920].some(extra =>
          Math.abs(duration - expected - extra) < 1e-6))) fail();
    end = attempt.finishedMinutes;
  });
}
