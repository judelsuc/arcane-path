export const THEFT = Object.freeze({ durationMs: 9000, cycleMs: 1800,
  minTargetWidth: 0.12, maxTargetWidth: 0.28, targetMargin: 0.08, bonusWidthRatio: 0.35 });

export function createTheftGame(now, random = Math.random, difficulty = "normal", { resonance = false } = {}) {
  if (!Number.isFinite(now)) throw new Error("Invalid theft clock.");
  if (!["normal", "hard"].includes(difficulty) || typeof resonance !== "boolean") throw new Error("Invalid theft difficulty.");
  const hard = difficulty === "hard";
  const minWidth = hard ? 0.07 : THEFT.minTargetWidth;
  const maxWidth = hard ? 0.16 : THEFT.maxTargetWidth;
  const draw = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Invalid theft target draw.");
    return value;
  };
  const width = minWidth + draw() * (maxWidth - minWidth);
  const targetStart = THEFT.targetMargin + draw() * (1 - 2 * THEFT.targetMargin - width);
  const targetEnd = targetStart + width;
  const bonusWidth = width * THEFT.bonusWidthRatio;
  const bonusStart = resonance ? (targetStart + targetEnd - bonusWidth) / 2 : null;
  return { startedAt: now, lastAt: now, outcome: null, targetStart, targetEnd, bonusStart,
    bonusEnd: resonance ? bonusStart + bonusWidth : null, resonance, difficulty,
    cycleMs: hard ? 1200 : THEFT.cycleMs };
}

export function theftPosition(game, now) {
  if (!Number.isFinite(now) || now < game.lastAt) throw new Error("Invalid theft clock.");
  const phase = (now - game.startedAt) % game.cycleMs;
  const half = game.cycleMs / 2;
  return phase <= half ? phase / half : (game.cycleMs - phase) / half;
}

export function advanceTheft(game, now, grab = false) {
  const position = theftPosition(game, now);
  if (game.outcome) return game;
  const inGreen = position >= game.targetStart && position <= game.targetEnd;
  const inGold = game.resonance && position >= game.bonusStart && position <= game.bonusEnd;
  const outcome = now - game.startedAt >= THEFT.durationMs ? "caught"
    : grab ? inGold ? "bonus" : inGreen ? "success" : "caught" : null;
  return { ...game, lastAt: now, outcome };
}
