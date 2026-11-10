import { adventurePacing } from "./legend-pacing.mjs";
import { createMechanism, advanceMechanism, initialMechanismState, mechanismCommands } from "./legend-mechanisms.mjs";
import { decoyLever } from "./legend-decoys.mjs";

export const INVESTIGATION_PROFILES = Object.freeze({
  modest: Object.freeze({ rooms: 8, rewardBudget: 1 }),
  notable: Object.freeze({ rooms: 16, rewardBudget: 2 }),
  exceptional: Object.freeze({ rooms: 32, rewardBudget: 3 }),
});
export const PUZZLE_FAMILIES = Object.freeze(["evidence", "witnesses", "assembly", "sequence"]);
export const EXPANDED_PUZZLE_FAMILIES = Object.freeze([...PUZZLE_FAMILIES, "cipher", "deduction", "exchange", "alignment"]);
const levels = new WeakSet(), states = new WeakSet();
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function retain(state) { freeze(state); states.add(state); return state; }

export function generateInvestigation({ seed = 1, tier = "modest", roomCount = INVESTIGATION_PROFILES[tier]?.rooms, paced = false, expanded = false, catalogue = false, decoys = false } = {}) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff ||
      !Object.hasOwn(INVESTIGATION_PROFILES, tier) || !Number.isSafeInteger(roomCount) ||
      roomCount < 4 || roomCount > 32 || roomCount % 4 || typeof paced !== "boolean" ||
      typeof expanded !== "boolean" || typeof catalogue !== "boolean" || catalogue && !expanded ||
      typeof decoys !== "boolean" || decoys && !catalogue ||
      expanded && !paced || paced && roomCount < 8) throw new RangeError("Invalid investigation seed or tier.");
  let value = seed;
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
  const shuffle = values => {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  let bag = [];
  const rooms = [];
  for (let id = 0; id < roomCount; id++) {
    if (!bag.length) {
      bag = shuffle(expanded ? EXPANDED_PUZZLE_FAMILIES : PUZZLE_FAMILIES);
      if (bag[0] === rooms.at(-1)?.family) [bag[0], bag[1]] = [bag[1], bag[0]];
    }
    rooms.push({ id, family: bag.shift(), variant: Math.floor(random() * 2),
      order: shuffle([0, 1, 2]), answer: Math.floor(random() * 3) });
  }
  if (paced) for (const room of rooms) {
    room.pacing = adventurePacing(room.id, roomCount);
    if (room.pacing.complexity) {
      room.reference = room.id - 1 - (room.id % 3);
      room.shift = room.pacing.complexity === 2 ? 1 : 0;
      room.seal = (rooms[room.reference].answer + room.shift) % 3;
      if (room.family === "sequence") room.order.push(...room.order.slice(0, room.pacing.complexity));
    }
  }
  if (expanded) for (const room of rooms) {
    room.concealed = room.id % 4 === 2;
    room.cipherShift = 1 + room.id % 2;
    room.stash = room.concealed ? { kind: room.id % 8 === 2 ? "money" : "food" } : null;
  }
  if (catalogue) for (const room of rooms) {
    const kind = { 1: "tool", 3: "repair", 5: "overlay" }[room.id % 8];
    if (kind) {
      room.family = kind;
      room.recipe = createMechanism("investigation", kind, room.answer);
    }
  }
  if (decoys) for (const room of rooms.filter(room => room.id % 2 === 0)) room.decoy = decoyLever(seed, room.id);
  const level = freeze({ version: decoys ? 5 : catalogue ? 4 : expanded ? 3 : paced ? 2 : 1, seed, tier, ...INVESTIGATION_PROFILES[tier], rooms });
  levels.add(level);
  return level;
}

export function createGeneratedInvestigation({ level = generateInvestigation() } = {}) {
  if (!levels.has(level)) throw new TypeError("Expected a generated investigation.");
  return retain({ level, room: 0, progress: level.rooms.map(room => ({
    solved: false, inspected: false, witnesses: [], parts: [], sequence: [],
    ...(level.version >= 2 ? { resolved: false } : {}),
    ...(level.version >= 3 ? { revealed: false, branches: [], dials: [0, 0, 0] } : {}),
    ...(room.recipe ? { mechanism: initialMechanismState() } : {}),
  })), completed: false, message: "arrival",
  ...(level.version >= 3 ? { tick: 0, stashes: [] } : {}),
  ...(level.version >= 5 ? { spentDecoys: [] } : {}),
  metrics: { roomEntries: 1, roomsVisited: [0], trapHits: 0, ...(level.version >= 3 ? { wrongAttempts: 0 } : {}) } });
}

export const investigationWitnessPresent = (state, witness) => state.level.version < 3 ||
  (state.tick + state.room) % 3 !== witness;

export function investigationCommands(state) {
  if (!states.has(state)) throw new TypeError("Expected a generated investigation state.");
  const room = state.level.rooms[state.room];
  if (room.concealed && !state.progress[state.room].revealed) return ["inspect", "search:0", "search:1", "search:2"];
  if (room.seal !== undefined && state.progress[state.room].resolved) return ["verify:0", "verify:1", "verify:2"];
  if (room.recipe) return mechanismCommands(room.recipe, state.progress[state.room].mechanism);
  if (room.family === "witnesses" && state.level.version >= 3) {
    return state.progress[state.room].witnesses.length < 2 ? ["witness:0", "witness:1", "wait"] : ["choose:0", "choose:1", "choose:2"];
  }
  return ({
    evidence: ["inspect", "choose:0", "choose:1", "choose:2"],
    witnesses: ["witness:0", "witness:1", "choose:0", "choose:1", "choose:2"],
    assembly: ["take:0", "take:1", "combine"],
    sequence: ["inspect", "press:0", "press:1", "press:2"],
    cipher: ["inspect", "choose:0", "choose:1", "choose:2"],
    deduction: ["inspect:0", "inspect:1", "choose:0", "choose:1", "choose:2"],
    exchange: state.progress[state.room].parts.length ? ["inspect", "offer:0", "offer:1", "offer:2"] :
      ["inspect", "take:0", "take:1"],
    alignment: ["inspect", "rotate:0", "rotate:1", "rotate:2", "combine"],
  })[room.family];
}

export function stepInvestigation(state, action) {
  if (!states.has(state)) throw new TypeError("Expected a generated investigation state.");
  if (!action || typeof action !== "object" || Array.isArray(action) ||
      Object.keys(action).length !== 2 || !Object.hasOwn(action, "type") ||
      !["travel", "act"].includes(action.type) ||
      action.type === "travel" && (!Object.hasOwn(action, "room") || !Number.isSafeInteger(action.room) ||
        action.room < 0 || action.room >= state.level.rooms.length) ||
      action.type === "act" && (!Object.hasOwn(action, "command") || !investigationCommands(state).includes(action.command) &&
        !(state.level.rooms[state.room].decoy && action.command === "decoy:pull"))) {
    throw new RangeError("Invalid generated investigation input.");
  }
  if (state.completed) return state;
  if (action.type === "travel") {
    if (action.room === state.room) return state;
    if (action.room > 0 && !state.progress[action.room - 1].solved) return retain({ ...state, message: "locked" });
    return retain({ ...state, room: action.room, message: "arrival",
      metrics: { ...state.metrics, roomEntries: state.metrics.roomEntries + 1,
        roomsVisited: [...new Set([...state.metrics.roomsVisited, action.room])] } });
  }
  const room = state.level.rooms[state.room], old = state.progress[state.room];
  if (action.command === "decoy:pull") {
    if (state.spentDecoys.includes(room.id)) return retain({ ...state, message: "decoySpent" });
    const trap = room.decoy.kind === "trap";
    return retain({ ...state, tick: state.tick + 1, spentDecoys: [...state.spentDecoys, room.id],
      message: trap ? "decoyTrap" : "decoyMistake",
      metrics: { ...state.metrics, trapHits: state.metrics.trapHits + Number(trap),
        wrongAttempts: state.metrics.wrongAttempts + Number(!trap) } });
  }
  if (old.solved) return retain({ ...state, message: "already" });
  const current = { ...old, witnesses: [...old.witnesses], parts: [...old.parts], sequence: [...old.sequence] };
  let message = "progress";
  const [command, indexText] = action.command.split(":");
  const index = Number(indexText);
  if (room.recipe && command !== "verify") {
    const result = advanceMechanism(room.recipe, old.mechanism, { command: action.command });
    current.mechanism = result.state;
    current.parts = [...result.state.items];
    current.inspected = result.state.inspected;
    current.solved = result.state.solved;
    message = result.state.solved ? "solved" : result.message;
  } else {
    if (command === "inspect") {
      current.inspected = true; message = "clue";
      if (room.family === "deduction" && indexText !== undefined) current.branches = [...new Set([...old.branches, index])];
    }
    if (command === "search") {
      if (!current.inspected) message = "needEvidence";
      else if (index !== room.order[0]) message = "wrong";
      else { current.revealed = true; current.inspected = false; message = "secret"; }
    }
    if (command === "witness") {
      if (!investigationWitnessPresent(state, index)) message = "witnessAway";
      else {
        if (!current.witnesses.includes(index)) current.witnesses.push(index);
        message = `witness:${index}`;
      }
    }
    if (command === "take") {
      if (!current.parts.includes(index)) current.parts.push(index);
      message = "supplies";
    }
    if (command === "combine") {
      current.solved = room.family === "alignment" ? current.inspected && current.dials.every((value, i) => value === room.order[i]) :
        current.parts.length === 2;
      if (room.family === "alignment" && !current.solved) message = "wrong";
      else message = current.solved ? "solved" : "needParts";
    }
    if (command === "rotate") current.dials = old.dials.map((value, i) => i === index ? (value + 1) % 3 : value);
    if (command === "offer") {
      current.solved = current.inspected && current.parts.includes(room.variant) && index === room.answer;
      message = current.solved ? "solved" : "wrong";
      if (!current.solved) current.parts = [];
    }
    if (command === "choose") {
      const ready = ["evidence", "cipher"].includes(room.family) ? current.inspected :
        room.family === "deduction" ? current.branches.length === 2 : current.witnesses.length === 2;
      current.solved = ready && index === room.answer;
      message = !ready ? "needEvidence" : current.solved ? "solved" : "wrong";
    }
    if (command === "press") {
      if (!current.inspected) message = "needEvidence";
      else if (index !== room.order[current.sequence.length]) {
        current.sequence = [];
        message = "resetSequence";
      } else {
        current.sequence.push(index);
        current.solved = current.sequence.length === room.order.length;
        message = current.solved ? "solved" : "progress";
      }
    }
  }
  if (room.seal !== undefined) {
    if (command === "verify") {
      current.solved = index === room.seal;
      message = current.solved ? "solved" : "wrongSeal";
    } else if (current.solved) {
      current.resolved = true;
      current.solved = false;
      message = "sealReady";
    }
  }
  const progress = state.progress.map((entry, id) => id === state.room ? current : entry);
  const completed = progress.every(entry => entry.solved);
  return retain({ ...state, progress, completed, message: completed ? "complete" : message,
    ...(state.level.version >= 3 ? { tick: state.tick + 1,
      stashes: current.revealed && room.stash ? [...new Set([...state.stashes, room.id])] : state.stashes,
      metrics: { ...state.metrics, wrongAttempts: state.metrics.wrongAttempts +
        Number(["wrong", "wrongSeal", "resetSequence"].includes(message)) } } : {}) });
}

export function generatedInvestigationHint(state) {
  if (!states.has(state)) throw new TypeError("Expected a generated investigation state.");
  const room = state.level.rooms[state.room], progress = state.progress[state.room];
  if (state.completed) return "complete";
  if (progress.solved) return "next";
  if (room.seal !== undefined && progress.resolved) return "seal";
  if (room.recipe) return room.family;
  if (room.concealed && !progress.revealed) return "secret";
  if (["cipher", "deduction", "exchange", "alignment"].includes(room.family)) return room.family;
  if (room.family === "assembly") return progress.parts.length === 2 ? "combine" : "take";
  if (room.family === "sequence") return progress.inspected ? "sequence" : "inspect";
  if (room.family === "witnesses") return progress.witnesses.length === 2 ? "choose" : "witnesses";
  return progress.inspected ? "choose" : "inspect";
}
