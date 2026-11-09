import { adventurePacing } from "./legend-pacing.mjs";

export const DUNGEON_PROFILES = Object.freeze({
  modest: Object.freeze({ rooms: 8, rewardBudget: 1 }),
  notable: Object.freeze({ rooms: 16, rewardBudget: 2 }),
  exceptional: Object.freeze({ rooms: 32, rewardBudget: 3 }),
});
export const DUNGEON_MECHANISMS = Object.freeze(["switch", "block", "key", "spikes"]);
export const DUNGEON_DIRECTIONS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1, door: [4, 0] }),
  right: Object.freeze({ x: 1, y: 0, door: [8, 3] }),
  down: Object.freeze({ x: 0, y: 1, door: [4, 6] }),
  left: Object.freeze({ x: -1, y: 0, door: [0, 3] }),
});
const opposite = { up: "down", down: "up", left: "right", right: "left" };
const levels = new WeakSet();
const states = new WeakSet();
const same = (a, b) => a.x === b.x && a.y === b.y;
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function retain(state) { freeze(state); states.add(state); return state; }

export function generateDungeon({ seed = 1, tier = "modest", roomCount = DUNGEON_PROFILES[tier]?.rooms, paced = false } = {}) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff || !Object.hasOwn(DUNGEON_PROFILES, tier) ||
      !Number.isSafeInteger(roomCount) || roomCount < 4 || roomCount > 32 || roomCount % 4 ||
      typeof paced !== "boolean" || paced && roomCount < 8) {
    throw new RangeError("Invalid dungeon seed or reward tier.");
  }
  let value = seed;
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
  const rooms = [];
  let bag = [];
  let creatures = [];
  for (let id = 0; id < roomCount; id++) {
    if (!bag.length) {
      bag = [...DUNGEON_MECHANISMS];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag[0] === rooms.at(-1)?.mechanism) [bag[0], bag[1]] = [bag[1], bag[0]];
    }
    if (!creatures.length) creatures = random() < .5 ? ["bat", "rat"] : ["rat", "bat"];
    rooms.push({ id, mechanism: bag.shift(), connections: [],
      creature: creatures.shift(), phase: Math.floor(random() * 4) });
  }
  const mirrored = random() < .5;
  for (let id = 0; id < rooms.length - 1; id++) {
    const direction = id % 2 ? "down" : (Math.floor(id / 2) % 2 === 0) !== mirrored ? "right" : "left";
    rooms[id].connections.push({ direction, target: id + 1 });
    rooms[id + 1].connections.push({ direction: opposite[direction], target: id });
  }
  if (paced) for (const room of rooms) {
    room.pacing = adventurePacing(room.id, roomCount);
    room.mechanisms = [room.mechanism];
    if (room.pacing.complexity) room.mechanisms.push(room.mechanism === "key" ? "switch" : "key");
    if (room.pacing.complexity === 2 && !room.mechanisms.includes("spikes")) room.mechanisms.push("spikes");
    room.patrol = room.id % 3;
    if (room.pacing.stage === "rest" || room.pacing.stage === "introduce") room.creature = null;
    if (room.pacing.stage === "rest" && room.mechanism === "spikes") room.mechanisms = ["key"];
  }
  const level = freeze({ version: paced ? 2 : 1, seed, tier, rewardBudget: DUNGEON_PROFILES[tier].rewardBudget,
    rooms, treasureRoom: rooms.length - 1 });
  levels.add(level);
  return level;
}

export function createDungeon({ level = generateDungeon(), weapon = "none", healthMode = "preview" } = {}) {
  if (!levels.has(level) || !["none", "knife", "sword"].includes(weapon) ||
      !["preview", "journey"].includes(healthMode)) {
    throw new RangeError("Invalid dungeon level or weapon.");
  }
  return retain({ level, weapon, healthMode, room: 0, x: 4, y: 5, facing: "up",
    health: healthMode === "preview" ? 3 : null, tick: 0,
    solved: [], blocks: level.rooms.map(() => ({ x: 3, y: 3 })), defeated: [], invulnerable: 0,
    ...(level.version === 2 ? { activated: [] } : {}),
    completed: false, failed: false, message: "arrival",
    metrics: { roomEntries: 1, roomsVisited: [0], trapHits: 0, creatureHits: 0 } });
}

export function dungeonCreature(state) {
  const room = state.level.rooms[state.room];
  if (!room.creature || state.defeated.includes(state.room)) return null;
  const phase = (state.tick + room.phase) % 6;
  if (room.patrol === 1) return { kind: room.creature, x: 6, y: 1 + (phase < 4 ? phase : 6 - phase) };
  if (room.patrol === 2) return { kind: room.creature, x: 2 + (phase < 4 ? phase : 6 - phase), y: 3 };
  return { kind: room.creature, x: 3 + (phase < 4 ? phase : 6 - phase),
    y: room.creature === "bat" ? 2 : 4 };
}
export function dungeonSpikesActive(state) {
  return (state.tick + state.level.rooms[state.room].phase) % 4 < 2;
}
export function dungeonGateOpen(state) {
  const room = state.level.rooms[state.room];
  if (room.mechanisms) return room.mechanisms.every(mechanism =>
    mechanism === "spikes" || state.activated.includes(`${room.id}:${mechanism}`));
  return state.level.rooms[state.room].mechanism === "spikes" || state.solved.includes(state.room);
}

export const dungeonMechanisms = room => room.mechanisms ?? [room.mechanism];
export function dungeonTarget(room, mechanism) {
  return { x: room.patrol === 1 ? 6 : 2, y: mechanism === "switch" ? 2 : 4 };
}

export function stepDungeon(state, action) {
  if (!states.has(state)) throw new TypeError("Invalid dungeon state.");
  if (!action || Object.keys(action).length !== 1 || !Object.hasOwn(action, "type") ||
      !["up", "right", "down", "left", "interact", "attack", "wait", "retry"].includes(action.type)) {
    throw new TypeError("Invalid dungeon input.");
  }
  if (state.completed || state.failed) return state;
  const next = { ...state, blocks: state.blocks.map(block => ({ ...block })), solved: [...state.solved],
    ...(state.activated ? { activated: [...state.activated] } : {}),
    defeated: [...state.defeated], metrics: { ...state.metrics, roomsVisited: [...state.metrics.roomsVisited] },
    tick: state.tick + 1, invulnerable: Math.max(0, state.invulnerable - 1), message: "move" };
  const room = state.level.rooms[state.room];
  const solve = mechanism => {
    if (room.mechanisms && !next.activated.includes(`${room.id}:${mechanism}`)) next.activated.push(`${room.id}:${mechanism}`);
    const opened = !room.mechanisms || dungeonGateOpen(next);
    if (opened && !next.solved.includes(next.room)) next.solved.push(next.room);
    next.message = opened ? "opened" : "mechanismProgress";
  };
  const direction = DUNGEON_DIRECTIONS[action.type];
  if (direction) {
    next.facing = action.type;
    const target = { x: state.x + direction.x, y: state.y + direction.y };
    const edge = room.connections.find(door => {
      const [x, y] = DUNGEON_DIRECTIONS[door.direction].door;
      return target.x === x && target.y === y;
    });
    if (edge) {
      if (edge.target > state.room && !dungeonGateOpen(state)) next.message = "locked";
      else {
        next.room = edge.target;
        const arrival = DUNGEON_DIRECTIONS[opposite[edge.direction]];
        next.x = arrival.door[0] - arrival.x;
        next.y = arrival.door[1] - arrival.y;
        next.metrics.roomEntries++;
        if (!next.metrics.roomsVisited.includes(next.room)) next.metrics.roomsVisited.push(next.room);
        next.invulnerable = 2;
        next.message = "arrival";
      }
    } else if (target.x > 0 && target.x < 8 && target.y > 0 && target.y < 6) {
      let blocked = false;
      if (dungeonMechanisms(room).includes("block") && same(target, next.blocks[state.room])) {
        const pushed = { x: target.x + direction.x, y: target.y + direction.y };
        // The block's rail prevents irreversible corner traps.
        blocked = direction.y !== 0 || pushed.x < 2 || pushed.x > 5;
        if (!blocked) {
          next.blocks[state.room] = pushed;
          if (pushed.x === 5) solve("block");
        }
      }
      if (!blocked) Object.assign(next, target);
      else next.message = "blocked";
    } else next.message = "blocked";
  } else if (action.type === "interact") {
    const mechanism = dungeonMechanisms(room).find(mechanism => {
      const target = dungeonTarget(room, mechanism);
      return ["switch", "key"].includes(mechanism) && !state.activated?.includes(`${room.id}:${mechanism}`) &&
        Math.abs(state.x - target.x) + Math.abs(state.y - target.y) <= 1;
    });
    if (mechanism) solve(mechanism);
    else if (state.room === state.level.treasureRoom && dungeonGateOpen(state) &&
        Math.abs(state.x - 6) + Math.abs(state.y - 3) <= 1) {
      next.completed = true;
      next.message = "complete";
    } else next.message = "nothing";
  } else if (action.type === "attack") {
    const creature = dungeonCreature(state);
    const reach = state.weapon === "sword" ? 2 : 1;
    const facing = DUNGEON_DIRECTIONS[state.facing];
    if (state.weapon === "none") next.message = "unarmed";
    else if (creature && Array.from({ length: reach }, (_, i) =>
      same(creature, { x: state.x + facing.x * (i + 1), y: state.y + facing.y * (i + 1) })).some(Boolean)) {
      next.defeated.push(state.room);
      next.message = "defeated";
    } else next.message = "miss";
  } else if (action.type === "retry") {
    next.x = 4;
    next.y = 5;
    if (room.mechanisms ? !next.activated.includes(`${room.id}:block`) : !next.solved.includes(state.room)) {
      next.blocks[state.room] = { x: 3, y: 3 };
    }
    next.message = "retry";
  }
  if (!next.completed && !next.invulnerable) {
    const creature = dungeonCreature(next);
    const creatureHit = creature && same(next, creature);
    const trapHit = dungeonMechanisms(next.level.rooms[next.room]).includes("spikes") &&
      next.x === 4 && next.y === 3 && dungeonSpikesActive(next);
    if (creatureHit || trapHit) {
      if (next.healthMode === "preview") next.health--;
      if (trapHit) next.metrics.trapHits++;
      if (creatureHit) next.metrics.creatureHits++;
      next.invulnerable = 3;
      next.message = creatureHit ? "creatureHit" : "trapHit";
      if (next.healthMode === "preview" && next.health === 0) { next.failed = true; next.message = "failed"; }
    }
  }
  return retain(next);
}
