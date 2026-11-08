export const PRACTICE = Object.freeze({ perLevel: 60, maxLevel: 19, maxXp: 1199 });
const KINDS = ["music", "cafe"];

export function progressOutcome(state, kind, xpKey, streakKey, success, cancelled = false, points = 0) {
  const xp = state[xpKey]?.[kind] ?? 0;
  const streak = state[streakKey]?.[kind] ?? 0;
  if (!Number.isSafeInteger(xp) || xp < 0 || xp > PRACTICE.maxXp ||
      !Number.isInteger(streak) || streak < 0 || streak > 2 ||
      typeof success !== "boolean" || typeof cancelled !== "boolean" ||
      !Number.isSafeInteger(points) || points < 0) throw new Error("Invalid game progression.");
  if (cancelled) return state;
  const nextStreak = success ? 0 : streak + 1;
  const nextXp = success ? Math.min(PRACTICE.maxXp, xp + points)
    : nextStreak === 3 ? Math.max(0, xp - PRACTICE.perLevel) : xp;
  return { ...state, [xpKey]: { ...state[xpKey], [kind]: nextXp },
    [streakKey]: { ...state[streakKey], [kind]: nextStreak === 3 ? 0 : nextStreak } };
}

export function validateStreaks(state, key, kinds) {
  const streaks = state[key];
  if (streaks === undefined) return;
  if (!streaks || typeof streaks !== "object" || Array.isArray(streaks) ||
      Object.getPrototypeOf(streaks) !== Object.prototype ||
      Object.entries(streaks).some(([kind, value]) => !kinds.includes(kind) ||
        !Number.isInteger(value) || value < 0 || value > 2)) throw new Error("Invalid failure streaks.");
}

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
  validateStreaks(state, "practiceFailureStreaks", KINDS);
  if (state.skills === undefined) return;
  if (!state.skills || typeof state.skills !== "object" || Array.isArray(state.skills) ||
      Object.keys(state.skills).some(key => !KINDS.includes(key))) throw new Error("Invalid saved skills.");
  for (const kind of KINDS) practiceSkill(state, kind);
}
