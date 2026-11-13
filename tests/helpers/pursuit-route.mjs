import { createEscape, stepEscape, escapeObstacles, escapeCourse } from "../../minigames/pursuit-escape.mjs";

const plans = new Map();

export function escapeRoute(seed, version, difficulty) {
  const key = `${seed}:${version}:${difficulty}`;
  if (plans.has(key)) return plans.get(key);
  const visited = new Set(), { speed } = escapeCourse(version, difficulty);
  function search(state) {
    if (state.hits || state.status === "captured") return null;
    if (state.status === "escaped") return { state, jumps: [] };
    const key = `${state.tick}:${state.y}`;
    if (visited.has(key)) return null;
    visited.add(key);
    const next = escapeObstacles(seed, version, difficulty, state.tick).find(o => o.kind !== "overhead" &&
      o.x + o.width > state.x && (o.kind === "gap" || o.bottom - o.height < state.y + 26 - 0.001));
    const distance = next ? next.x - state.x : Infinity;
    const choices = distance <= speed * 0.3 ? [true, false] : [false, true];
    for (const jump of choices) {
      if (jump && distance > speed * 0.65) continue;
      let candidate = stepEscape(state, jump);
      while (!candidate.grounded && candidate.status === "running" && !candidate.hits) {
        candidate = stepEscape(candidate);
      }
      const result = search(candidate);
      if (result) return { state: result.state, jumps: jump ? [state.tick + 1, ...result.jumps] : result.jumps };
    }
    return null;
  }
  const result = search(createEscape(seed, version, difficulty));
  if (!result) throw new Error(`No damage-free escape route: seed ${seed}, protocol ${version}, level ${difficulty}`);
  const plan = { state: result.state, transcript: { jumps: result.jumps, ticks: result.state.tick, abandoned: false } };
  plans.set(key, plan);
  return plan;
}
