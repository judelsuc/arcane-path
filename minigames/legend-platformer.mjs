import { isPlatformLevel } from "./legend-layout.mjs";

export const WIDTH = 640;
export const HEIGHT = 320;
export const STEP = 1 / 60;
export const PLAYER = Object.freeze({ width: 18, height: 26, speed: 160, jump: 360, gravity: 1000 });

export const ROOMS = Object.freeze([
  Object.freeze({
    name: "passage",
    platforms: Object.freeze([Object.freeze({ x: 96, y: 192, width: 96, height: 12 })]),
    ladder: Object.freeze({ x: 128, top: 192, bottom: 288 }),
    hazards: Object.freeze([Object.freeze({ x: 320, y: 278, width: 48, height: 10 })]),
  }),
  Object.freeze({
    name: "archive",
    platforms: Object.freeze([]),
    ladder: null,
    hazards: Object.freeze([
      Object.freeze({ x: 224, y: 278, width: 48, height: 10 }),
      Object.freeze({ x: 432, y: 278, width: 48, height: 10 }),
    ]),
  }),
  Object.freeze({ name: "booth", platforms: Object.freeze([]), ladder: null, hazards: Object.freeze([]) }),
]);

const states = new WeakSet();
function freeze(state) {
  Object.freeze(state.metrics.roomsVisited);
  Object.freeze(state.metrics);
  Object.freeze(state);
  states.add(state);
  return state;
}

export function createPlatformer({ level = null, healthMode = "preview" } = {}) {
  if (level !== null && !isPlatformLevel(level)) throw new TypeError("Expected a generated platform level.");
  if (!["preview", "journey"].includes(healthMode)) throw new TypeError("Invalid platform health mode.");
  if (level) return freeze({ level, room: level.start, ...level.spawn, vy: 0, grounded: true,
    ticks: 0, solved: Object.freeze([]),
    health: healthMode === "journey" ? null : 3, collected: Object.freeze([]), checkpoint: level.spawn,
    ...(level.version >= 3 ? { activated: Object.freeze([]) } : {}),
    retries: 0, completed: false, message: "route",
    metrics: { roomEntries: 1, roomsVisited: [level.start], trapHits: 0 } });
  return freeze({ room: 0, x: 32, y: 262, vy: 0, grounded: true,
    switchOn: false, key: false, retries: 0, completed: false, message: "passage",
    metrics: { roomEntries: 1, roomsVisited: [0], trapHits: 0 } });
}

const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x &&
  a.y < b.y + b.height && a.y + a.height > b.y;
const body = state => ({ x: state.x, y: state.y, width: PLAYER.width, height: PLAYER.height });
export const platformHazardActive = (hazard, ticks) =>
  !hazard.period || (ticks + hazard.phase) % hazard.period < hazard.activeTicks;
export const platformRoomSolved = (state, room = state.level?.rooms[state.room]) =>
  !room?.challenge || state.solved.includes(room.id);
export const platformLadders = room => room.ladders ?? [room.ladder, room.challengeLadder].filter(Boolean);

export function stepPlatformer(state, controls = {}) {
  if (!states.has(state)) throw new TypeError("Expected a platform adventure state.");
  if (!controls || typeof controls !== "object" || Object.keys(controls).some(key =>
    !["left", "right", "up", "down", "jump", "interact", "retry"].includes(key) ||
    typeof controls[key] !== "boolean")) throw new TypeError("Invalid platform controls.");
  if (state.completed) return state;
  const next = { ...state };
  if (state.level) next.ticks++;
  const retry = (damage = false) => {
    const health = state.level ? state.health === null ? null : state.health - Number(damage) : undefined;
    return freeze({ ...next, ...(state.level ? { health: health === null ? null : health || 3 } : {}),
      metrics: { ...state.metrics, trapHits: state.metrics.trapHits + Number(damage) },
      x: state.checkpoint?.x ?? 32, y: state.checkpoint?.y ?? 262, vy: 0, grounded: true,
      retries: next.retries + 1, message: health === 0 ? "recovered" : "retry" });
  };
  if (controls.retry) return retry();
  const room = (state.level?.rooms ?? ROOMS)[state.room];
  next.x = Math.max(0, Math.min(WIDTH - PLAYER.width,
    state.x + (Number(!!controls.right) - Number(!!controls.left)) * PLAYER.speed * STEP));
  const ladder = platformLadders(room).find(item =>
    next.x + PLAYER.width > item.x - 12 && next.x < item.x + 12);
  const climbing = ladder && next.x + PLAYER.width > ladder.x - 12 && next.x < ladder.x + 12 &&
    next.y + PLAYER.height >= ladder.top && next.y < ladder.bottom && (controls.up || controls.down);
  if (controls.jump && state.grounded) {
    next.vy = -PLAYER.jump;
    next.grounded = false;
  }
  if (climbing && !controls.jump) {
    next.y = Math.max(ladder.top - PLAYER.height,
      Math.min((state.level?.version >= 4 ? ladder.bottom : 288) - PLAYER.height,
        next.y + (controls.down ? 1 : -1) * 130 * STEP));
    next.vy = 0;
    next.grounded = next.y === ladder.top - PLAYER.height ||
      next.y === (state.level?.version >= 4 ? ladder.bottom : 288) - PLAYER.height;
  } else {
    next.vy += PLAYER.gravity * STEP;
    const oldBottom = next.y + PLAYER.height;
    next.y += next.vy * STEP;
    next.grounded = false;
    for (const platform of [{ x: 0, y: 288, width: WIDTH, height: 32 }, ...room.platforms]) {
      if (state.level && controls.down && platform.y !== 288) continue;
      if (next.vy >= 0 && oldBottom <= platform.y && next.y + PLAYER.height >= platform.y &&
          next.x + PLAYER.width > platform.x && next.x < platform.x + platform.width) {
        next.y = platform.y - PLAYER.height;
        next.vy = 0;
        next.grounded = true;
      }
    }
  }
  if (room.hazards.some(hazard => platformHazardActive(hazard, next.ticks ?? 0) &&
      overlaps(body(next), hazard))) return retry(true);
  if (state.level && controls.interact) {
    const near = point => Math.abs(next.x - point.x) < 28 && Math.abs(next.y - point.y) < 28;
    const door = room.connections.find(near);
    if (door) {
      if (room.main && door.target > room.id && !platformRoomSolved(state, room)) {
        next.message = "challengeLocked";
        return freeze(next);
      }
      next.room = door.target;
      next.metrics = { ...state.metrics, roomEntries: state.metrics.roomEntries + 1,
        roomsVisited: [...new Set([...state.metrics.roomsVisited, next.room])] };
      next.x = door.arrivalX;
      next.y = door.arrivalY;
      next.checkpoint = Object.freeze({ x: next.x, y: next.y });
      next.vy = 0;
      next.grounded = true;
      next.message = state.level.rooms[next.room].name;
    } else if (room.challenge && !platformRoomSolved(state, room) &&
        (room.challenges ?? [room.challenge]).some((point, index) =>
          !state.activated?.includes(`${room.id}:${index}`) && near(point) &&
          (point.family !== "jump" || !next.grounded && next.vy < 0))) {
      if (room.challenges) {
        const index = room.challenges.findIndex((point, index) => !state.activated.includes(`${room.id}:${index}`) &&
          near(point) && (point.family !== "jump" || !next.grounded && next.vy < 0));
        next.activated = Object.freeze([...state.activated, `${room.id}:${index}`]);
      }
      const solved = !room.challenges || room.challenges.every((_, index) => next.activated.includes(`${room.id}:${index}`));
      if (solved) next.solved = Object.freeze([...state.solved, room.id]);
      next.message = solved ? "challengeSolved" : "challengeProgress";
    } else if (room.treasure && near(room.treasure) && platformRoomSolved(state, room)) {
      next.completed = true;
      next.message = "complete";
    } else if (room.pickup && near(room.pickup) && !state.collected.includes(state.room)) {
      if (state.health === null || state.health === 3) next.message = "healthFull";
      else {
        next.health++;
        next.collected = Object.freeze([...state.collected, state.room]);
        next.message = "health";
      }
    } else next.message = room.reward === "empty" ? "emptyBranch" : "nothing";
    return freeze(next);
  }
  if (controls.interact) {
    if (state.room === 0 && Math.abs(next.x - 150) < 40 && Math.abs(next.y - 166) < 40) {
      next.switchOn = true;
      next.message = "switch";
    } else if (state.room === 1 && Math.abs(next.x - 350) < 42) {
      next.key = true;
      next.message = "key";
    } else if (state.room === 2 && Math.abs(next.x - 520) < 42) {
      next.completed = true;
      next.message = "complete";
    } else if (next.x > 580) {
      if (state.room === 0 && !next.switchOn) next.message = "switchLocked";
      else if (state.room === 1 && !next.key) next.message = "keyLocked";
      else if (state.room < 2) {
        next.room++;
        next.metrics = { ...state.metrics, roomEntries: state.metrics.roomEntries + 1,
          roomsVisited: [...new Set([...state.metrics.roomsVisited, next.room])] };
        next.x = 32;
        next.y = 262;
        next.vy = 0;
        next.grounded = true;
        next.message = ROOMS[next.room].name;
      } else next.message = "findReel";
    } else next.message = "nothing";
  }
  return freeze(next);
}
