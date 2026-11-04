import { parentIntimacy } from "./parent-intimacy.mjs";
import { clueDirection } from "./trail-search.mjs";
import { trailTarget, atTrailTarget } from "./trail.mjs";
import { citedTowns } from "./directions.mjs";

export const PARENT_RECOLLECTION_FIRST_DELAY = 60;
export const PARENT_RECOLLECTION_INTERVAL = 180;

function lastParentProgress(state) {
  const { trail } = state, stage = trail.index;
  return Math.max(0, ...[
    ...trail.history,
    ...(trail.arrivals ?? []).filter(entry => entry.stage === stage),
    ...(trail.exploration?.hints ?? []).filter(entry => entry.stage === stage),
    ...(trail.exploration?.signs ?? []).filter(entry => entry.stage === stage),
    ...(trail.exploration?.reports ?? []).filter(entry => entry.stage === stage),
    ...(trail.dreams?.checks ?? []).filter(entry => entry.stage === stage && entry.outcome === "guidance"),
    ...(trail.discovery ? [trail.discovery] : []),
  ].map(entry => entry.elapsedMinutes ?? 0));
}

export function validateParentRecollection(state) {
  const record = state?.parentRecollection;
  if (record === undefined) return;
  if (!record || !["elapsedMinutes,stage,variant", "elapsedMinutes,intuition,stage,variant"]
      .includes(Object.keys(record).sort().join()) ||
      !state.trail || !Number.isInteger(record.stage) || record.stage < 0 ||
      record.stage >= state.trail.stages.length || record.stage > state.trail.index ||
      !Number.isFinite(record.elapsedMinutes) || record.elapsedMinutes < PARENT_RECOLLECTION_FIRST_DELAY ||
      record.elapsedMinutes > state.elapsedMinutes ||
      !Number.isInteger(record.variant) || record.variant < 0 || record.variant > 2) {
    throw new Error("Invalid parent recollection.");
  }
  const help = record.intuition;
  if (help !== undefined && (!help || Object.keys(help).sort().join() !== "col,direction,row" ||
      !Number.isSafeInteger(help.col) || !Number.isSafeInteger(help.row) ||
      Math.abs(Math.floor(help.col / 8)) > 1000 || Math.abs(Math.floor(help.row / 8)) > 1000 ||
      help.direction !== clueDirection(help, state.trail.stages[record.stage]))) {
    throw new Error("Invalid parent recollection intuition.");
  }
}

export function recordParentRecollection(state) {
  if (!state?.trail || state.ended || state.trail.completed) return state;
  validateParentRecollection(state);
  const previous = state.parentRecollection;
  const since = Math.max(lastParentProgress(state), previous?.elapsedMinutes ?? 0);
  const delay = previous ? PARENT_RECOLLECTION_INTERVAL : PARENT_RECOLLECTION_FIRST_DELAY;
  if (state.elapsedMinutes - since < delay) return state;
  const knownTown = citedTowns(state).some(town =>
    town.stage === state.trail.index && town.status === "known");
  const intuition = !knownTown && !atTrailTarget(state) ? {
    col: state.col, row: state.row, direction: clueDirection(state, trailTarget(state)),
  } : undefined;
  const next = { ...state, parentRecollection: {
    stage: state.trail.index, elapsedMinutes: state.elapsedMinutes,
    variant: previous ? (previous.variant + 1) % 3 : 0,
    ...(intuition ? { intuition } : {}),
  } };
  validateParentRecollection(next);
  return next;
}

export function parentIntuitionText(state, t) {
  const help = state.parentRecollection?.intuition;
  if (!help || !parentRecollectionVisible(state)) return "";
  const direction = t(`hintCompass.${help.direction}`);
  const moved = state.col !== help.col || state.row !== help.row;
  return t("languageCode") === "en"
    ? `A hunch draws you back to your parent's trail, somewhere towards ${direction} ${
      moved ? "from where this feeling came to you" : "from here"}.`
    : `Une intuition vous ramène vers la piste de votre parent, du côté ${direction}, ${
      moved ? "depuis l'endroit où ce pressentiment vous est venu" : "depuis cet endroit"}.`;
}

export function parentRecollectionVisible(state) {
  const record = state?.parentRecollection;
  return Boolean(record && !state.ended && !state.trail.completed &&
    record.stage === state.trail.index && record.elapsedMinutes >= lastParentProgress(state));
}

export function parentRecollectionText(state, t, reminder) {
  const profile = parentIntimacy(state), language = t("languageCode");
  const variant = state.parentRecollection.variant;
  const memory = profile ? variant === 0 ? t("parentRecollection.letter", { letter: profile.letter[language] })
    : variant === 1 ? t("parentRecollection.memory", { memory: profile.memory[language] })
      : t("parentRecollection.desire", { desire: profile.desire[language] })
    : t("parentRecollection.fallback");
  return t("parentRecollection.text", { parent: state.trail.parentName, memory, clue: reminder });
}
