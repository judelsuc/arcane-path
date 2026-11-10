import { adventurePacing } from "./legend-pacing.mjs";
import { createMechanism, advanceMechanism, initialMechanismState, validateMechanismPlacement } from "./legend-mechanisms.mjs";

export const DUNGEON_PROFILES = Object.freeze({
  modest: Object.freeze({ rooms: 8, rewardBudget: 1 }),
  notable: Object.freeze({ rooms: 16, rewardBudget: 2 }),
  exceptional: Object.freeze({ rooms: 32, rewardBudget: 3 }),
});
export const DUNGEON_MECHANISMS = Object.freeze(["switch", "block", "key", "spikes"]);
export const EXPANDED_DUNGEON_MECHANISMS = Object.freeze([...DUNGEON_MECHANISMS, "torch", "crank", "runes", "plate"]);
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

export function generateDungeon({ seed = 1, tier = "modest", roomCount = DUNGEON_PROFILES[tier]?.rooms, paced = false, expanded = false, catalogue = false } = {}) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff || !Object.hasOwn(DUNGEON_PROFILES, tier) ||
      !Number.isSafeInteger(roomCount) || roomCount < 4 || roomCount > 32 || roomCount % 4 ||
      typeof paced !== "boolean" || typeof expanded !== "boolean" || typeof catalogue !== "boolean" ||
      catalogue && !expanded || expanded && !paced || paced && roomCount < 8) {
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
      bag = [...(expanded ? EXPANDED_DUNGEON_MECHANISMS : DUNGEON_MECHANISMS)];
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
  if (expanded) {
    const patterns = [
      [[3, 1], [5, 1], [3, 5], [5, 5]], [[4, 1], [4, 4]],
      [[1, 2], [7, 4], [3, 1], [5, 5]], [[3, 2], [5, 2], [3, 4], [5, 4]],
    ];
    for (const room of rooms) {
      const reserved = [[4, 1], [4, 5], [1, 3], [7, 3], [4, 4], ...DUNGEON_RUNES.map(point => [point.x, point.y])];
      room.walls = patterns[(room.id + seed) % patterns.length]
        .filter(([x, y]) => !reserved.some(([rx, ry]) => x === rx && y === ry) &&
          !(room.patrol === 1 ? x === 6 : room.patrol === 2 ? y === 3 : y === (room.creature === "bat" ? 2 : 4)))
        .map(([x, y]) => ({ x, y }));
      room.runeOrder = [0, 1, 2].sort((a, b) => ((a + seed + room.id) % 3) - ((b + seed + room.id) % 3));
      room.flame = { x: 1, y: 5 };
      room.trap = room.pacing.stage === "rest" ? null : { x: 4, y: 4 };
      const forward = room.connections.find(door => door.target === room.id + 1);
      if (forward && room.id % 3 === 2) forward.secret = true;
    }
    for (let id = 1; id < roomCount; id += 4) {
      const room = rooms[id];
      const direction = mirrored ? "left" : "right";
      const target = rooms.length;
      room.connections.push({ direction, target, secret: true });
      rooms.push({ id: target, mechanism: "key", mechanisms: [], phase: 0, creature: null, walls: [],
        hidden: true, stash: { x: 6, y: 4, kind: id % 8 === 1 ? "money" : "food" },
        connections: [{ direction: opposite[direction], target: id }] });
    }
  }
  if (catalogue) for (const room of rooms.filter(room => !room.hidden)) {
    const kind = room.id % 8 === 1 ? "mirror" : room.id % 8 === 3 ? "weight" : null;
    if (kind) {
      room.mechanism = kind;
      room.mechanisms = [kind, ...(room.pacing.complexity ? ["key"] : [])];
      room.walls = []; room.trap = null; room.creature = null;
    }
    room.recipes = Object.fromEntries(room.mechanisms.filter(kind =>
      ["switch", "key", "plate", "crank", "mirror", "weight"].includes(kind))
      .map(kind => [kind, createMechanism("dungeon", kind, (seed + room.id) % 3)]));
    Object.values(room.recipes).forEach(recipe => validateMechanismPlacement(recipe, room));
  }
  const level = freeze({ version: catalogue ? 4 : expanded ? 3 : paced ? 2 : 1, seed, tier, rewardBudget: DUNGEON_PROFILES[tier].rewardBudget,
    rooms, treasureRoom: roomCount - 1 });
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
    ...(level.version >= 2 ? { activated: [] } : {}),
    ...(level.version >= 3 ? { secrets: [], stashes: [], flames: [], crank: 0, runes: [], trapTick: null } : {}),
    ...(level.version >= 4 ? { mechanisms: Object.fromEntries(level.rooms.filter(room => room.recipes)
      .map(room => [room.id, Object.fromEntries(Object.keys(room.recipes).map(kind => [kind, initialMechanismState()]))])) } : {}),
    completed: false, failed: false, message: "arrival",
    metrics: { roomEntries: 1, roomsVisited: [0], trapHits: 0, creatureHits: 0,
      ...(level.version >= 3 ? { wrongAttempts: 0 } : {}) } });
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
  if (mechanism === "mirror") return room.recipes.mirror.mirror;
  if (mechanism === "runes") return DUNGEON_RUNES[0];
  return { x: room.patrol === 1 ? 6 : 2, y: mechanism === "switch" ? 2 : 4 };
}
export function dungeonBeam(state) {
  const room = state.level.rooms[state.room], recipe = room.recipes?.mirror;
  if (!recipe) return [];
  const angle = state.mechanisms[room.id].mirror.angle, points = [];
  for (let x = recipe.source.x; x <= recipe.mirror.x; x++) points.push({ x, y: recipe.source.y });
  const direction = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }][angle];
  for (let x = recipe.mirror.x + direction.x, y = recipe.mirror.y + direction.y;
    x > 0 && x < 8 && y > 0 && y < 6; x += direction.x, y += direction.y) points.push({ x, y });
  return points;
}
export const DUNGEON_RUNES = Object.freeze([{ x: 2, y: 1 }, { x: 4, y: 2 }, { x: 6, y: 1 }].map(Object.freeze));
export function dungeonArrow(state) {
  if (state.trapTick === null || state.trapTick === undefined) return null;
  const age = state.tick - state.trapTick - 2;
  return age >= 0 && age < 7 ? { x: 1 + age, y: 4 } : null;
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
  const operateRecipe = (kind, input) => {
    const recipe = room.recipes?.[kind];
    if (!recipe) return false;
    const result = advanceMechanism(recipe, next.mechanisms[room.id][kind], input);
    next.mechanisms = { ...next.mechanisms, [room.id]: { ...next.mechanisms[room.id], [kind]: result.state } };
    if (result.state.solved) solve(kind);
    else if (result.message !== "nothing") next.message = result.message;
    return true;
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
      if (edge.secret && !state.secrets.includes(`${room.id}:${edge.target}`)) next.message = "hiddenDoor";
      else if (edge.target > state.room && !dungeonGateOpen(state)) next.message = "locked";
      else {
        next.room = edge.target;
        const arrival = DUNGEON_DIRECTIONS[opposite[edge.direction]];
        next.x = arrival.door[0] - arrival.x;
        next.y = arrival.door[1] - arrival.y;
        next.metrics.roomEntries++;
        if (!next.metrics.roomsVisited.includes(next.room)) next.metrics.roomsVisited.push(next.room);
        next.invulnerable = 2;
        next.message = "arrival";
        if (state.level.version >= 3) { next.trapTick = null; next.crank = 0; next.runes = []; }
      }
    } else if (target.x > 0 && target.x < 8 && target.y > 0 && target.y < 6) {
      let blocked = !!room.walls?.some(wall => same(wall, target));
      if ((dungeonMechanisms(room).includes("block") || room.recipes?.weight) && same(target, next.blocks[state.room])) {
        const pushed = { x: target.x + direction.x, y: target.y + direction.y };
        // The block's rail prevents irreversible corner traps.
        blocked = direction.y !== 0 || pushed.x < 2 || pushed.x > 5;
        if (!blocked) {
          next.blocks[state.room] = pushed;
          if (room.recipes?.weight) operateRecipe("weight", { weight: pushed.x === 5 });
          else if (pushed.x === 5) solve("block");
        }
      }
      if (!blocked) Object.assign(next, target);
      else next.message = "blocked";
    } else next.message = "blocked";
  } else if (action.type === "interact") {
    let handled = false;
    if (state.level.version >= 3) {
      const near = point => Math.abs(state.x - point.x) + Math.abs(state.y - point.y) <= 1;
      const secret = room.connections.find(door => door.secret &&
        !state.secrets.includes(`${room.id}:${door.target}`) &&
        near({ x: DUNGEON_DIRECTIONS[door.direction].door[0], y: DUNGEON_DIRECTIONS[door.direction].door[1] }));
      if (secret) {
        next.secrets = [...state.secrets, `${room.id}:${secret.target}`];
        next.message = "secret"; handled = true;
      }
      if (!handled && room.stash && near(room.stash) && !state.stashes.includes(room.id)) {
        next.stashes = [...state.stashes, room.id]; next.message = "stash"; handled = true;
      }
      if (!handled && room.mechanisms.includes("torch") && near(room.flame) && !state.flames.includes(room.id)) {
        next.flames = [...state.flames, room.id]; next.message = "flame"; handled = true;
      }
      if (!handled && room.mechanisms.includes("runes") && !state.activated.includes(`${room.id}:runes`)) {
        const index = DUNGEON_RUNES.findIndex(near);
        if (index >= 0) {
          handled = true;
          if (index !== room.runeOrder[state.runes.length]) {
            next.runes = []; next.metrics.wrongAttempts++; next.message = "runeReset";
          } else {
            next.runes = [...state.runes, index]; next.message = "mechanismProgress";
            if (next.runes.length === 3) solve("runes");
          }
        }
      }
    }
    const mechanism = !handled && dungeonMechanisms(room).find(mechanism => {
      const target = dungeonTarget(room, mechanism);
      return ["switch", "key", "torch", "crank", "mirror"].includes(mechanism) && !state.activated?.includes(`${room.id}:${mechanism}`) &&
        Math.abs(state.x - target.x) + Math.abs(state.y - target.y) <= 1;
    });
    const recipeHandled = mechanism && operateRecipe(mechanism, { operate: true });
    if (!recipeHandled && mechanism === "torch" && !state.flames.includes(room.id)) next.message = "needFlame";
    else if (!recipeHandled && mechanism === "crank" && ++next.crank < 3) next.message = "cranking";
    else if (!recipeHandled && mechanism) solve(mechanism);
    else if (!handled && state.room === state.level.treasureRoom && dungeonGateOpen(state) &&
        Math.abs(state.x - 6) + Math.abs(state.y - 3) <= 1) {
      next.completed = true;
      next.message = "complete";
    } else if (next.message === "move") next.message = "nothing";
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
    if (room.recipes) next.mechanisms = { ...next.mechanisms, [room.id]: Object.fromEntries(
      Object.entries(next.mechanisms[room.id]).map(([kind, progress]) =>
        [kind, progress.solved ? progress : initialMechanismState()])) };
    if (room.mechanisms ? !next.activated.includes(`${room.id}:${room.recipes?.weight ? "weight" : "block"}`) : !next.solved.includes(state.room)) {
      next.blocks[state.room] = { x: 3, y: 3 };
    }
    next.message = "retry";
  }
  if (state.level.version >= 3 && next.room === state.room) {
    if (room.mechanisms.includes("plate") && same(next, dungeonTarget(room, "plate"))) {
      if (!operateRecipe("plate", { weight: true })) solve("plate");
    }
    if (room.trap && same(next, room.trap) && (next.trapTick === null || next.tick - next.trapTick > 10)) {
      next.trapTick = next.tick; next.message = "trapWarning";
    }
    if (action.type === "retry") { next.trapTick = null; next.crank = 0; next.runes = []; }
  }
  if (!next.completed && !next.invulnerable) {
    const creature = dungeonCreature(next);
    const creatureHit = creature && same(next, creature);
    const trapHit = (dungeonMechanisms(next.level.rooms[next.room]).includes("spikes") &&
      next.x === 4 && next.y === 3 && dungeonSpikesActive(next)) || same(next, dungeonArrow(next) ?? { x: -1, y: -1 });
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
