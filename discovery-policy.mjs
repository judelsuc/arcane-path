import { discoveryEntries, discoveryIdentity, learnDiscovery } from "./discovery.mjs";

export const DISCOVERY_WALKING_INTERVAL = 60;
const ARTIFACT_PRECISION = ["region", "town", "marker", "local"];

export function discoveryKnown(state, clue) {
  return discoveryEntries(state).some(entry => {
    if (discoveryIdentity(entry) === discoveryIdentity(clue)) return true;
    if (entry.targetType !== clue.targetType || entry.targetId !== clue.targetId ||
        entry.targetRevision !== clue.targetRevision) return false;
    if (clue.targetType === "artifact" && clue.kind === "location" && entry.kind === "location") {
      const precision = ARTIFACT_PRECISION.indexOf(clue.precision);
      return precision >= 0 && ARTIFACT_PRECISION.indexOf(entry.precision) >= precision;
    }
    if (clue.targetType === "parent-trail") {
      return entry.kind === "place" && entry.precision === "precise" ||
        entry.evidenceKey === clue.evidenceKey && entry.precision === "partial" && clue.precision === "vague";
    }
    return false;
  });
}

export function selectDiscoveryCandidate(state, candidates, { targetType, targetId } = {}) {
  const selected = candidates.filter(candidate =>
    (targetType === undefined || candidate.clue.targetType === targetType) &&
    (targetId === undefined || candidate.clue.targetId === targetId) &&
    !discoveryKnown(state, candidate.clue));
  for (const candidate of selected) {
    if (!Number.isFinite(candidate.distanceMeters) || candidate.distanceMeters < 0 ||
        !Number.isSafeInteger(candidate.priority) || candidate.priority < 0) {
      throw new Error("Invalid discovery eligibility.");
    }
  }
  const lastSeen = type => Math.max(-1, ...discoveryEntries(state)
    .filter(entry => entry.targetType === type).map(entry => entry.observedMinutes));
  return selected.sort((a, b) => b.priority - a.priority ||
    lastSeen(a.clue.targetType) - lastSeen(b.clue.targetType) ||
    a.distanceMeters - b.distanceMeters ||
    discoveryIdentity(a.clue).localeCompare(discoveryIdentity(b.clue)))[0]?.clue ?? null;
}

export function validateDiscoverySchedule(state) {
  const schedule = state.discoverySchedule;
  if (schedule === undefined) return;
  if (!schedule || Object.keys(schedule).sort().join() !== "lastAutomaticMinutes,walkingMinutes" ||
      !Number.isFinite(schedule.walkingMinutes) || schedule.walkingMinutes < 0 ||
      schedule.walkingMinutes > state.elapsedMinutes + 1e-6 ||
      !Number.isFinite(schedule.lastAutomaticMinutes) || schedule.lastAutomaticMinutes < 0 ||
      schedule.lastAutomaticMinutes > schedule.walkingMinutes) {
    throw new Error("Invalid discovery delivery schedule.");
  }
}

export function deliverAutomaticDiscovery(previous, state, candidates, walkingMinutes) {
  validateDiscoverySchedule(previous);
  if (!Number.isFinite(walkingMinutes) || walkingMinutes < 0 ||
      walkingMinutes > state.elapsedMinutes - previous.elapsedMinutes + 1e-6) {
    throw new Error("Invalid discovery walking duration.");
  }
  const old = previous.discoverySchedule ?? { walkingMinutes: 0, lastAutomaticMinutes: 0 };
  const schedule = { ...old, walkingMinutes: old.walkingMinutes + walkingMinutes };
  const clue = schedule.walkingMinutes - old.lastAutomaticMinutes >= DISCOVERY_WALKING_INTERVAL
    ? selectDiscoveryCandidate(state, candidates) : null;
  const next = { ...state, discoverySchedule: {
    ...schedule, lastAutomaticMinutes: clue ? schedule.walkingMinutes : old.lastAutomaticMinutes,
  } };
  return clue ? learnDiscovery(next, [clue]) : next;
}
