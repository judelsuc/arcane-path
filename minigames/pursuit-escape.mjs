import { PLAYER, STEP } from "./legend-platformer.mjs";

export const ESCAPE_VERSION = 7;
export const ESCAPE_LENGTH = 5400;
export const ESCAPE_MAX_TICKS = 2400;
const FLOOR = 270;

export function escapeCourse(version = ESCAPE_VERSION, difficulty = 1) {
  if (![1, 2, 3, 4, 5, 6, 7].includes(version) || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 10) {
    throw new Error("Invalid escape course.");
  }
  const speed = version >= 7 && difficulty >= 4 ? [260, 285, 310, 320, 330, 350, 370][difficulty - 4]
    : version >= 5 && difficulty >= 8 ? 260 + (difficulty - 8) * 30
    : version >= 4 ? 220 + difficulty * 2 : PLAYER.speed;
  return { speed, length: version >= 4 ? speed * 34 : ESCAPE_LENGTH };
}

export function escapeTerrain(terrain) {
  if (terrain === "forest") return "woodland";
  if (["building", "place", "church", "station", "road", "major_road"].includes(terrain)) return "streets";
  if (["mountain", "hill"].includes(terrain)) return "rocky";
  return "country";
}

export function escapeObstacles(seed, version = ESCAPE_VERSION, difficulty = 1, tick = 0) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Invalid escape seed.");
  if (!Number.isSafeInteger(tick) || tick < 0 || tick > ESCAPE_MAX_TICKS) throw new Error("Invalid escape obstacle tick.");
  if (version === 1) {
    return Array.from({ length: 9 }, (_, index) => ({
      x: 550 + index * 520 + ((seed >>> (index % 8 * 4)) & 3) * 12,
      width: 28 + (index % 3) * 4, height: 14 + (index % 2) * 4,
    }));
  }
  if (version >= 4 && version <= ESCAPE_VERSION) {
    const { length, speed } = escapeCourse(version, difficulty);
    const hard = version >= 5 && difficulty >= 8;
    const demanding = version >= 7 && difficulty >= 4;
    const count = demanding ? 24 + Math.floor((difficulty - 4) * 0.75) : hard ? 28 + (difficulty - 8) * 2 : 14 + difficulty;
    const families = ["low", "stack", "gap", "platform", "overhead", "pair", "steps", "wide"];
    const kinds = Array.from({ length: count }, (_, index) =>
      families[(index + (seed >>> 8 & 7)) % families.length]);
    if (demanding) {
      let random = seed;
      for (let start = 0; start < count; start += families.length) {
        const block = [...families];
        for (let i = block.length - 1; i > 0; i--) {
          random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
          const other = Math.floor(random / 0x100000000 * (i + 1));
          [block[i], block[other]] = [block[other], block[i]];
        }
        kinds.splice(start, Math.min(block.length, count - start), ...block.slice(0, count - start));
      }
    }
    // Leave landing room before the low ceiling guarding the next stack.
    const weights = kinds.map((kind, index) => demanding
      ? ({ platform: 2.6, steps: 2.5, pair: 1.9, wide: 1.8, low: 1.5, gap: 1.6, stack: 1.5, overhead: 1.15 })[kind] +
        (kinds[index + 1] === "stack" ? 0.6 : 0)
      : kind === "platform" ? 1.65 : kind === "steps" ? 1.25 : 1);
    const total = weights.slice(0, -1).reduce((sum, weight) => sum + weight, 0);
    let position = 500;
    return kinds.flatMap((kind, index) => {
      const variant = seed >>> (index % 8 * 4) & 3;
      const x = position + variant * 6;
      position += weights[index] * (length - 1000) / total;
      const obstacle = (kind, offset, width, height, bottom = FLOOR) =>
        ({ kind, x: x + offset, width, height, bottom });
      if (difficulty >= 8 && (kind === "low" || kind === "wide")) {
        const period = kind === "low" ? hard ? 120 : 180 : hard ? 90 : 120;
        const phase = ((tick + (seed >>> 16 & 127) + index * 17) % period) / period;
        const wave = 1 - Math.abs(phase * 2 - 1);
        return kind === "low"
          ? [{ ...obstacle("cart", 0, 34, 22), x: x + (wave * 2 - 1) * (hard ? 30 : 16) }]
          : [obstacle("bouncer", 0, 30, 20, FLOOR - wave * (hard ? 30 : 18))];
      }
      if (kind === "platform") return [
        obstacle(kind, 0, demanding ? speed * 0.90 : 240, 24),
        obstacle("crate", demanding ? speed * 0.65 : 165, 30, 24, FLOOR - 24),
      ];
      if (kind === "overhead") return [obstacle(kind, 0, 80 + difficulty * 2, 18, demanding ? 232 : 226)];
      if (kind === "pair") return [
        obstacle("hurdle", 0, demanding || hard ? 28 : 24, demanding ? 26 + Math.floor((difficulty - 4) / 2) * 2 : hard ? 28 : 18),
        obstacle("hurdle", demanding || hard ? 84 : 62, demanding || hard ? 28 : 24,
          demanding ? 26 + Math.floor((difficulty - 4) / 2) * 2 : hard ? 28 : 18),
      ];
      if (kind === "steps") return [
        obstacle("platform", 0, 64, 18), obstacle("platform", 72, 72, 36),
        ...(demanding ? [obstacle("platform", 160, 90, 54)] : []),
      ];
      if (kind === "stack") return [
        ...(demanding ? [obstacle("overhead", -speed * (difficulty >= 7 ? 0.30 : 0.27) - 58, 58, 18, 232)] : []),
        obstacle(kind, 0, demanding ? 38 + variant * 2 : hard ? 42 : 28 + variant * 2,
          demanding ? 44 + (difficulty - 4) * 2 : hard ? 50 + (difficulty - 8) * 2 : 34 + Math.floor(difficulty / 3) * 2),
      ];
      if (kind === "wide") return [obstacle("crate", 0, demanding ? 64 + difficulty * 3 : 48 + difficulty, demanding ? 34 : 24)];
      if (kind === "gap") return [obstacle(kind, 0,
        demanding ? 94 + (difficulty - 4) * 8 + variant * 2
          : hard ? 116 + (difficulty - 8) * 12 + variant * 2 : 70 + difficulty * 2 + variant * 2, 16)];
      return [obstacle("low", 0, 30 + variant * 2, 20 + Math.floor(difficulty / 4) * 2)];
    });
  }
  if (![2, 3].includes(version)) throw new Error("Invalid escape version.");
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 10) throw new Error("Invalid escape difficulty.");
  const count = version === 2 ? 13 : 9 + difficulty;
  // Leave landing room after each platform's second jump, even on dense routes.
  const intervals = Array.from({ length: count - 1 }, (_, index) => index % 4 === 3 ? 1.65 : 1);
  const totalWeight = intervals.reduce((sum, weight) => sum + weight, 0);
  let position = 430;
  return Array.from({ length: count }, (_, index) => {
    const variant = (seed >>> (index % 8 * 4)) & 3;
    const x = (version === 2 ? 430 + index * 365 : position) + variant * 12;
    position += (intervals[index] ?? 0) * 4550 / totalWeight;
    const kind = ["low", "crate", "gap", "platform"][index % 4];
    const platformHeight = version === 2 ? 24 : 20 + Math.floor(difficulty / 4) * 2;
    const crateHeight = version === 2 ? 24 : 20 + Math.floor(difficulty / 3) * 2;
    if (kind === "platform") return [
      { kind, x, width: 210, height: platformHeight, bottom: FLOOR },
      { kind: "crate", x: x + 110, width: 32, height: crateHeight, bottom: FLOOR - platformHeight },
    ];
    return [{ kind, x, width: kind === "gap"
      ? version === 2 ? 56 + variant * 4 : 40 + difficulty * 1.5 + variant * 2 : 28 + variant * 2,
      height: kind === "crate" ? crateHeight : version === 2 ? 16 : 12 + Math.floor(difficulty / 3) * 2,
      bottom: FLOOR }];
  }).flat();
}

export function createEscape(seed, version = ESCAPE_VERSION, difficulty = 1) {
  escapeObstacles(seed, version, difficulty);
  return { version, seed, ...(version >= 3 ? { difficulty, fallingGap: null } : {}),
    ...(version >= 7 ? { contacts: [] } : {}), tick: 0, x: 0, y: FLOOR - PLAYER.height,
    vy: 0, grounded: true, hits: 0, invulnerableUntil: 0, status: "running" };
}

export function stepEscape(state, jump = false) {
  if (typeof jump !== "boolean" || ![1, 2, 3, 4, 5, 6, ESCAPE_VERSION].includes(state.version)) throw new Error("Invalid escape controls.");
  if (state.status !== "running") return state;
  const course = escapeCourse(state.version, state.difficulty);
  const next = { ...state, tick: state.tick + 1, x: state.x + course.speed * STEP };
  if (jump && state.grounded) { next.vy = -PLAYER.jump; next.grounded = false; }
  next.vy += PLAYER.gravity * STEP;
  next.y += next.vy * STEP;
  const obstacles = escapeObstacles(state.seed, state.version, state.difficulty, next.tick);
  const recoveryTicks = state.version >= 7 && state.difficulty >= 4 ? 24 : 90;
  const gap = obstacles.find(obstacle => obstacle.kind === "gap" &&
    next.x + PLAYER.width / 2 >= obstacle.x && next.x + PLAYER.width / 2 < obstacle.x + obstacle.width);
  if (state.version === 1) {
    if (next.y >= FLOOR - PLAYER.height) {
      next.y = FLOOR - PLAYER.height;
      next.vy = 0;
      next.grounded = true;
    }
  } else {
    const fallingGap = state.version >= 3
      ? state.fallingGap ?? (gap && next.y + PLAYER.height > FLOOR ? gap : null) : gap;
    if (state.version >= 3) next.fallingGap = fallingGap;
    let surface = gap || fallingGap ? Infinity : FLOOR;
    next.grounded = false;
    if (next.vy >= 0) {
      for (const obstacle of obstacles) {
        const top = obstacle.bottom - obstacle.height;
        if (obstacle.kind !== "gap" && next.x < obstacle.x + obstacle.width &&
            next.x + PLAYER.width > obstacle.x && state.y + PLAYER.height <= top + 0.001 &&
            next.y + PLAYER.height >= top) surface = Math.min(surface, top);
      }
      if (next.y + PLAYER.height >= surface) {
        next.y = surface - PLAYER.height;
        next.vy = 0;
        next.grounded = true;
      }
    }
    if (fallingGap && next.y >= FLOOR + 18) {
      next.hits++;
      next.invulnerableUntil = next.tick + recoveryTicks;
      next.x = fallingGap.x + fallingGap.width + 4;
      next.y = FLOOR - PLAYER.height;
      next.vy = 0;
      next.grounded = true;
      if (state.version >= 3) next.fallingGap = null;
    }
  }
  const contacts = obstacles.flatMap((obstacle, index) =>
    obstacle.kind !== "gap" &&
    next.x < obstacle.x + obstacle.width && next.x + PLAYER.width > obstacle.x &&
    (state.version === 1 ? next.y + PLAYER.height > FLOOR - obstacle.height :
      next.y + PLAYER.height > obstacle.bottom - obstacle.height + 0.001 && next.y < obstacle.bottom) ? [index] : []);
  if (state.version >= 7) next.contacts = contacts;
  if (next.tick >= next.invulnerableUntil && contacts.some(index => state.version < 7 || !state.contacts.includes(index))) {
    next.hits++;
    next.invulnerableUntil = next.tick + recoveryTicks;
  }
  next.status = next.hits >= 3 || next.tick >= ESCAPE_MAX_TICKS ? "captured"
    : next.x >= course.length ? "escaped" : "running";
  return next;
}

export function replayEscape(seed, jumps, ticks, abandoned = false, version = ESCAPE_VERSION, difficulty = 1) {
  if (!Array.isArray(jumps) || jumps.length > 100 || !Number.isSafeInteger(ticks) ||
      ticks < 0 || ticks > ESCAPE_MAX_TICKS || typeof abandoned !== "boolean" ||
      jumps.some((tick, index) => !Number.isSafeInteger(tick) || tick < 1 || tick > ticks ||
        index > 0 && tick <= jumps[index - 1])) throw new Error("Invalid escape transcript.");
  const inputs = new Set(jumps);
  let state = createEscape(seed, version, difficulty);
  for (let tick = 1; tick <= ticks; tick++) {
    if (state.status !== "running") throw new Error("Escape inputs continue after the outcome.");
    state = stepEscape(state, inputs.has(tick));
  }
  if (abandoned) return "captured";
  if (state.status === "running") throw new Error("Escape transcript is unfinished.");
  return state.status;
}
