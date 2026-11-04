export const PRACTICE = Object.freeze({ perLevel: 60, maxLevel: 4, maxXp: 300 });
const KINDS = ["music", "cafe"];

export function outcomeReputation(score, maxScore, failed = false, cancelled = false) {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 ||
      score < 0 || score > maxScore || typeof failed !== "boolean" || typeof cancelled !== "boolean") {
    throw new Error("Invalid mini-game outcome.");
  }
  if (cancelled) return 0;
  if (failed || score / maxScore < 0.4) return -3;
  return score / maxScore >= 0.6 ? 2 : 0;
}

export function practiceSkill(state, kind) {
  if (!KINDS.includes(kind)) throw new Error("Unknown practice skill.");
  const xp = state.skills?.[kind] ?? 0;
  if (!Number.isSafeInteger(xp) || xp < 0 || xp > PRACTICE.maxXp) {
    throw new Error("Invalid practice experience.");
  }
  return { xp, level: Math.min(PRACTICE.maxLevel, Math.floor(xp / PRACTICE.perLevel)) };
}

export function practice(state, kind, points) {
  if (!Number.isSafeInteger(points) || points < 0) throw new Error("Invalid practice points.");
  const { xp } = practiceSkill(state, kind);
  return { ...state, skills: { ...state.skills, [kind]: Math.min(PRACTICE.maxXp, xp + points) } };
}

export function validatePractice(state) {
  if (state.skills === undefined) return;
  if (!state.skills || typeof state.skills !== "object" || Array.isArray(state.skills) ||
      Object.keys(state.skills).some(key => !KINDS.includes(key))) throw new Error("Invalid saved skills.");
  for (const kind of KINDS) practiceSkill(state, kind);
}
