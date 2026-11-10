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
export const PLATFORM_ARCHETYPES = Object.freeze([
  "terraces", "stepping-stones", "split-shafts", "hanging-gallery",
  "low-vault", "twin-balconies", "zigzag", "high-bridge",
]);
export const EXPANDED_PLATFORM_ARCHETYPES = Object.freeze([
  ...PLATFORM_ARCHETYPES, "bell-tower", "sunken-stairs", "broken-aqueduct", "crossing-galleries",
  "well", "rooftops", "switchback", "three-islands",
]);
export const EXPANDED_PLATFORM_CHALLENGES = Object.freeze([
  "jump", "switch", "key", "timing", "plate", "crank", "torch", "runes",
]);
export const PLATFORM_RUNES = Object.freeze([144, 432, 528].map(x => Object.freeze({ x, y: 262 })));

function variedRoom(room, archetype, mirrored, random) {
  const shelf = (x, y, width) => ({ x, y, width, height: 12 });
  const ladder = (x, top, bottom = 288) => ({ x, top, bottom });
  const geometry = {
    terraces: { platforms: [shelf(48, 240, 128), shelf(176, 192, 128),
      shelf(304, 144, 128), shelf(432, 96, 176)], ladders: [] },
    "stepping-stones": { platforms: [shelf(56, 240, 80), shelf(160, 192, 80),
      shelf(264, 144, 80), shelf(368, 96, 112), shelf(512, 144, 96)], ladders: [] },
    "split-shafts": { platforms: [shelf(48, 192, 544), shelf(456, 96, 152)],
      ladders: [ladder(112, 192), ladder(512, 96, 192)] },
    "hanging-gallery": { platforms: [shelf(32, 96, 208), shelf(248, 192, 128), shelf(384, 144, 224)],
      ladders: [ladder(80, 96), ladder(560, 144)] },
    "low-vault": { platforms: [shelf(48, 192, 144), shelf(224, 240, 112),
      shelf(336, 144, 96), shelf(448, 96, 160)], ladders: [ladder(560, 96)] },
    "twin-balconies": { platforms: [shelf(32, 144, 208), shelf(272, 192, 96), shelf(400, 96, 208)],
      ladders: [ladder(96, 144), ladder(544, 96)] },
    zigzag: { platforms: [shelf(48, 240, 272), shelf(232, 192, 272),
      shelf(416, 144, 192), shelf(504, 96, 104)],
      ladders: [ladder(96, 240), ladder(280, 192, 240), ladder(464, 144, 192), ladder(560, 96, 144)] },
    "high-bridge": { platforms: [shelf(32, 96, 576), shelf(80, 192, 128), shelf(432, 240, 128)],
      ladders: [ladder(80, 96), ladder(560, 96)] },
    "bell-tower": { platforms: [shelf(264, 240, 112), shelf(160, 192, 120), shelf(280, 144, 120), shelf(384, 96, 160)],
      ladders: [ladder(320, 240), ladder(440, 96)] },
    "sunken-stairs": { platforms: [shelf(32, 96, 144), shelf(176, 144, 128), shelf(304, 192, 128), shelf(432, 240, 160)],
      ladders: [] },
    "broken-aqueduct": { platforms: [shelf(32, 96, 176), shelf(256, 96, 128), shelf(432, 96, 176), shelf(208, 192, 224)],
      ladders: [ladder(80, 96), ladder(560, 96)] },
    "crossing-galleries": { platforms: [shelf(48, 240, 208), shelf(352, 240, 240), shelf(192, 192, 240),
      shelf(80, 144, 144), shelf(400, 144, 144), shelf(224, 96, 192)],
      ladders: [ladder(112, 144), ladder(496, 144)] },
    well: { platforms: [shelf(48, 96, 160), shelf(432, 96, 160), shelf(160, 192, 112), shelf(336, 240, 112)],
      ladders: [ladder(96, 96), ladder(544, 96)] },
    rooftops: { platforms: [shelf(32, 240, 128), shelf(176, 192, 128), shelf(320, 144, 128), shelf(464, 96, 144)],
      ladders: [] },
    switchback: { platforms: [shelf(64, 240, 192), shelf(208, 192, 192), shelf(352, 144, 192), shelf(208, 96, 192)],
      ladders: [ladder(112, 240), ladder(256, 192, 240), ladder(400, 144, 192), ladder(384, 96, 144)] },
    "three-islands": { platforms: [shelf(32, 144, 176), shelf(240, 96, 192), shelf(464, 192, 144)],
      ladders: [ladder(80, 144), ladder(296, 96), ladder(560, 192)] },
  }[archetype];
  room.archetype = archetype;
  room.mirrored = mirrored;
  room.platforms = geometry.platforms;
  room.ladder = null;
  room.challengeLadder = null;
  room.ladders = geometry.ladders;
  const surfaces = [{ x: 16, y: 288, width: 608 }, ...room.platforms];
  const points = room.challenges ?? (room.challenge ? [room.challenge] : []);
  points.forEach((point, index) => {
    const surface = surfaces[1 + (room.id + index) % room.platforms.length];
    point.x = Math.round(surface.x + surface.width * (.3 + random() * .4) - 9);
    point.y = surface.y - (point.family === "jump" ? 64 : 26);
  });
  if (points.length) {
    room.challenges = points;
    room.challenge = points[0];
  }
  for (const object of [room.treasure, room.pickup].filter(Boolean)) {
    const surface = surfaces.at(-1);
    object.x = Math.round(surface.x + surface.width / 2 - 9);
    object.y = surface.y - 26;
  }
  for (const door of room.connections) {
    if (door.direction === "up") {
      const top = room.platforms.find(surface => surface.y === 96);
      door.x = top.x + 8;
      door.y = 70;
      for (const point of [...points, room.treasure, room.pickup].filter(Boolean)) {
        if (Math.abs(point.x - door.x) < 60 && Math.abs(point.y - door.y) < 66) {
          const surface = surfaces.find(surface => surface.y === point.y + (point.family === "jump" ? 64 : 26));
          const ends = [surface.x + 8, surface.x + surface.width - 30];
          point.x = ends.sort((a, b) => Math.abs(b - door.x) - Math.abs(a - door.x))[0];
        }
      }
    } else if (door.direction === "down") {
      door.x = 280 + Math.floor(random() * 80);
      door.y = 262;
    } else {
      door.y = 262;
    }
  }
  room.hazards = room.hazards.map((hazard, index) => {
    const candidates = [208, 352, 464, 96];
    const safe = [...room.connections.filter(door => door.y === 262),
      ...room.ladders.filter(ladder => ladder.bottom === 288).map(ladder => ({ x: ladder.x - 9 })),
      { x: 311 }];
    const x = candidates.map((_, offset) => candidates[(room.id + index + offset) % candidates.length])
      .find(x => safe.every(point => point.x + 18 + 24 <= x || point.x >= x + hazard.width + 24));
    if (x === undefined) throw new Error("Unable to place a trap clear of platform entrances.");
    return { ...hazard, x };
  });
  if (mirrored) {
    for (const platform of room.platforms) platform.x = 640 - platform.x - platform.width;
    for (const item of room.ladders) item.x = 640 - item.x;
    for (const point of [...points, room.treasure, room.pickup].filter(Boolean)) point.x = 622 - point.x;
    for (const hazard of room.hazards) hazard.x = 640 - hazard.x - hazard.width;
    for (const door of room.connections) {
      if (["up", "down"].includes(door.direction)) door.x = 622 - door.x;
    }
  }
}

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

export function generatePlatformLevel({ seed = 1, mainRooms, branches = 2, tier, paced = false, varied = false, expanded = false } = {}) {
  if (tier !== undefined && (!Object.hasOwn(PLATFORM_PROFILES, tier) || mainRooms !== undefined)) {
    throw new RangeError("Choose a platform reward tier or a custom main path length.");
  }
  mainRooms ??= tier === undefined ? 8 : PLATFORM_PROFILES[tier].rooms;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff ||
      !Number.isSafeInteger(mainRooms) || mainRooms < 4 || mainRooms > 32 ||
      !Number.isSafeInteger(branches) || branches < 0 || branches > 4 ||
      typeof paced !== "boolean" || typeof varied !== "boolean" || typeof expanded !== "boolean" ||
      expanded && (!varied || !paced) || paced && mainRooms < 8) {
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
  if (varied) {
    let archetypes = [];
    let previous;
    for (const room of rooms) {
      if (!archetypes.length) {
        archetypes = shuffled(expanded ? EXPANDED_PLATFORM_ARCHETYPES : PLATFORM_ARCHETYPES);
        if (archetypes[0] === previous) [archetypes[0], archetypes[1]] = [archetypes[1], archetypes[0]];
      }
      const archetype = archetypes.shift();
      variedRoom(room, archetype, random() < .5, random);
      previous = archetype;
    }
    if (expanded) {
      const families = shuffled(EXPANDED_PLATFORM_CHALLENGES);
      for (const room of rooms) {
        if (room.main) {
          const point = room.challenges[0];
          const supportY = point.y + (point.family === "jump" ? 64 : 26);
          room.challenges[0].family = families[room.id % families.length];
          room.challenge = room.challenges[0];
          point.y = supportY - (point.family === "jump" ? 64 : 26);
          if (room.challenge.family === "torch") room.flame = { x: 311, y: 262 };
          if (room.challenge.family === "runes") {
            room.runeOrder = shuffled([0, 1, 2]);
            room.hazards = [];
          }
          const forward = room.connections.find(door => door.target === room.id + 1);
          if (forward && room.id % 3 === 2) forward.secret = true;
        }
        if (!room.main) room.stash = { x: room.pickup?.x ?? 311, y: room.pickup?.y ?? 262,
          kind: room.id % 2 ? "food" : "money" };
        if (room.pacing?.stage !== "rest") {
          const lanes = room.platforms.filter(surface => surface.width >= 160 && [...(room.challenges ?? []), room.treasure,
            ...room.connections].filter(Boolean).every(point =>
            !([point.y + 26, point.y + 64].includes(surface.y) ||
              point.family === "jump" && Math.abs(surface.y - point.y - 64) <= 96) ||
              point.x < surface.x - 40 || point.x > surface.x + surface.width + 40));
          const flightX = [32, 544, 280].find(x => (room.challenges ?? []).every(point =>
            point.family !== "jump" || point.x < x - 48 || point.x > x + 112));
          if (!lanes.length && flightX === undefined) throw new Error("Unable to keep a bat clear of bell jumps.");
          const lane = lanes[(room.id + 1) % lanes.length] ?? { x: flightX, y: 288, width: 64 };
          room.animal = { kind: lanes.length && room.id % 2 ? "rat" : "bat", x: lane.x + 8,
            y: lanes.length ? lane.y - 18 : 32, range: Math.max(24, lane.width - 32), period: 240 + room.id % 3 * 60 };
          room.arrowTrap = { plate: { x: 240 + room.id % 3 * 56, y: 284, width: 24, height: 4 },
            x: room.mirrored ? 608 : 16, y: 267, direction: room.mirrored ? -1 : 1,
            delay: 48, cooldown: 240 };
        }
      }
    }
    for (const room of rooms) for (const door of room.connections) {
      const back = rooms[door.target].connections.find(item => item.target === room.id);
      door.arrivalX = back.x;
      door.arrivalY = back.y;
    }
  }
  const level = deepFreeze({ version: expanded ? 5 : varied ? 4 : paced ? 3 : 2, seed, mainRooms, tier: tier ?? null,
    rewardBudget: tier === undefined ? null : PLATFORM_PROFILES[tier].rewardBudget,
    start: 0, treasureRoom: mainRooms - 1,
    rooms, edges, spawn: { x: 311, y: 262 } });
  levels.add(level);
  return level;
}
