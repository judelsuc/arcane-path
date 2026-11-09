import { adventurePacing } from "./legend-pacing.mjs";

const DIRECTIONS = Object.freeze({
  right: { col: 1, row: 0, opposite: "left" },
  left: { col: -1, row: 0, opposite: "right" },
  down: { col: 0, row: 1, opposite: "up" },
  up: { col: 0, row: -1, opposite: "down" },
});
const levels = new WeakSet();
const cellKey = ({ col, row }) => `${col},${row}`;
export const PLATFORM_PROFILES = Object.freeze({
  modest: Object.freeze({ rooms: 8, rewardBudget: 1 }),
  notable: Object.freeze({ rooms: 16, rewardBudget: 2 }),
  exceptional: Object.freeze({ rooms: 32, rewardBudget: 3 }),
});
export const PLATFORM_CHALLENGES = Object.freeze(["jump", "switch", "key", "timing"]);

function randomSource(seed) {
  let value = seed;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(value ^ value >>> 15, value | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function isPlatformLevel(level) { return levels.has(level); }

export function generatePlatformLevel({ seed = 1, mainRooms, branches = 2, tier, paced = false } = {}) {
  if (tier !== undefined && (!Object.hasOwn(PLATFORM_PROFILES, tier) || mainRooms !== undefined)) {
    throw new RangeError("Choose a platform reward tier or a custom main path length.");
  }
  mainRooms ??= tier === undefined ? 8 : PLATFORM_PROFILES[tier].rooms;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff ||
      !Number.isSafeInteger(mainRooms) || mainRooms < 4 || mainRooms > 32 ||
      !Number.isSafeInteger(branches) || branches < 0 || branches > 4 ||
      typeof paced !== "boolean" || paced && mainRooms < 8) {
    throw new RangeError("Invalid platform level seed, main path length or branch count.");
  }
  const random = randomSource(seed);
  const shuffled = values => values.map(value => ({ value, rank: random() }))
    .sort((a, b) => a.rank - b.rank).map(entry => entry.value);
  const rooms = [{ id: 0, col: 0, row: 0, main: true, connections: [] }];
  const occupied = new Set(["0,0"]);
  const edges = [];
  function extend(from, direction, main) {
    const delta = DIRECTIONS[direction];
    const position = { col: from.col + delta.col, row: from.row + delta.row };
    if (occupied.has(cellKey(position))) return null;
    const room = { id: rooms.length, ...position, main, connections: [] };
    occupied.add(cellKey(position));
    rooms.push(room);
    edges.push({ from: from.id, to: room.id, direction });
    return room;
  }
  // An unbounded grid always offers a continuation; backtrack if a walk encloses itself.
  function mainPath() {
    if (rooms.length === mainRooms) return true;
    const from = rooms.at(-1);
    for (const direction of shuffled(Object.keys(DIRECTIONS))) {
      const room = extend(from, direction, true);
      if (!room) continue;
      if (mainPath()) return true;
      rooms.pop();
      edges.pop();
      occupied.delete(cellKey(room));
    }
    return false;
  }
  if (!mainPath()) throw new Error("Unable to construct the main adventure path.");
  for (let branch = 0; branch < branches; branch++) {
    let tip;
    for (const room of shuffled(rooms.slice(0, mainRooms - 1))) {
      for (const direction of shuffled(Object.keys(DIRECTIONS))) {
        tip = extend(room, direction, false);
        if (tip) break;
      }
      if (tip) break;
    }
    if (!tip) throw new Error("Unable to attach an optional adventure branch.");
    if (random() < .5) {
      for (const direction of shuffled(Object.keys(DIRECTIONS))) {
        const next = extend(tip, direction, false);
        if (next) { tip = next; break; }
      }
    }
    tip.reward = branch % 2 === 0 ? "health" : "empty";
  }
  function port(direction, height) {
    if (direction === "left") return { x: 32, y: height - 26 };
    if (direction === "right") return { x: 590, y: height - 26 };
    return { x: 311, y: direction === "up" ? 70 : 262 };
  }
  for (const edge of edges) {
    const opposite = DIRECTIONS[edge.direction].opposite;
    const height = random() < .5 ? 192 : 240;
    const a = port(edge.direction, height);
    const b = port(opposite, height);
    rooms[edge.from].connections.push({ direction: edge.direction, target: edge.to,
      ...a, arrivalX: b.x, arrivalY: b.y });
    rooms[edge.to].connections.push({ direction: opposite, target: edge.from,
      ...b, arrivalX: a.x, arrivalY: a.y });
  }
  let challenges = [];
  let previousChallenge;
  for (const room of rooms) {
    room.name = room.main ? "route" : "branch";
    room.background = room.row > 0 ? "interior" : "passage";
    room.ladder = { x: 320, top: 96, bottom: 288 };
    const heights = new Set(room.connections.filter(door => ["left", "right"].includes(door.direction))
      .map(door => door.y + 26));
    room.platforms = [{ x: 280, y: 96, width: 80, height: 12 }];
    for (const height of heights) {
      const doors = room.connections.filter(door => door.y + 26 === height);
      const left = doors.some(door => door.direction === "left") ? 16 : 280;
      const right = doors.some(door => door.direction === "right") ? 624 : 360;
      room.platforms.push({ x: left, y: height, width: right - left, height: 12 });
    }
    if (room.main) {
      if (!challenges.length) {
        challenges = shuffled(PLATFORM_CHALLENGES);
        if (challenges[0] === previousChallenge) [challenges[0], challenges[1]] = [challenges[1], challenges[0]];
      }
      const family = challenges.shift();
      previousChallenge = family;
      room.challenge = { family, x: family === "switch" ? 128 : family === "jump" ? 440 : 520,
        y: family === "switch" ? 166 : family === "jump" ? 210 : 262 };
      if (family === "switch") {
        room.platforms.push({ x: 96, y: 192, width: 112, height: 12 });
        room.challengeLadder = { x: 128, top: 192, bottom: 288 };
      }
      if (family === "jump") room.platforms.push({ x: 408, y: 236, width: 80, height: 12 });
      room.hazards = family === "timing"
        ? [{ x: 416, y: 278, width: 40, height: 10, period: 180, activeTicks: 90, phase: seed % 180 }]
        : [];
    } else room.hazards = [{ x: 416, y: 278, width: 40, height: 10 }];
    room.treasure = room.id === mainRooms - 1 ? { x: 520, y: 262 } : null;
    room.pickup = room.reward === "health" ? { x: 520, y: 262 } : null;
  }
  if (paced) for (const room of rooms) {
    if (!room.main) continue;
    room.pacing = adventurePacing(room.id, mainRooms);
    room.challenges = [{ ...room.challenge }];
    if (room.pacing.complexity) {
      const family = room.challenge.family === "switch" ? "key" : "switch";
      room.challenges.push({ family, x: family === "switch" ? 128 : 520, y: family === "switch" ? 166 : 262 });
      if (family === "switch") {
        room.platforms.push({ x: 96, y: 192, width: 112, height: 12 });
        room.challengeLadder = { x: 128, top: 192, bottom: 288 };
      }
    }
    if (room.pacing.complexity === 2 && !room.challenges.some(item => item.family === "jump")) {
      room.challenges.push({ family: "jump", x: 440, y: 210 });
      room.platforms.push({ x: 408, y: 236, width: 80, height: 12 });
    }
    for (const point of room.challenges) {
      if (point.family === "switch") {
        point.x = (room.id + seed) % 2 ? 176 : 128;
        room.challengeLadder = { x: point.x, top: 192, bottom: 288 };
      }
      if (point.family === "key") point.x = (room.id + seed) % 2 ? 552 : 520;
    }
    room.hazards = room.pacing.stage === "rest" ? [] :
      room.challenge.family === "timing" || room.pacing.complexity === 2
        ? [{ x: 416, y: 278, width: room.pacing.complexity === 2 ? 40 : 24,
          height: 10, period: 240, activeTicks: room.pacing.complexity === 2 ? 100 : 60, phase: seed % 240 }] : [];
  }
  const level = deepFreeze({ version: paced ? 3 : 2, seed, mainRooms, tier: tier ?? null,
    rewardBudget: tier === undefined ? null : PLATFORM_PROFILES[tier].rewardBudget,
    start: 0, treasureRoom: mainRooms - 1,
    rooms, edges, spawn: { x: 311, y: 262 } });
  levels.add(level);
  return level;
}
