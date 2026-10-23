import { resolveResonance, resonanceResult } from "../arcane-resonance.mjs";
export const PARTS = Object.freeze(["frame", "rearWheel", "frontWheel", "seat", "pedals", "handlebars"]);
export const COLOURS = Object.freeze(["red", "blue", "gold", "green"]);
export const SIZES = Object.freeze(["small", "medium", "large"]);
const freeze = value => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const time = value => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const variant = value => record(value) && Object.keys(value).length === 2 &&
  COLOURS.includes(value.colour) && SIZES.includes(value.size);
export const samePart = (a, b) => a?.colour === b?.colour && a?.size === b?.size;
const keyedParts = object => record(object) && Object.keys(object).length === PARTS.length &&
  PARTS.every(part => Object.hasOwn(object, part));
const matched = game => PARTS.filter(part => samePart(game.selected[part], game.model[part]));

export function available(cell) {
  if (!cell || cell.unavailable || !Array.isArray(cell.pois)) return false;
  return cell.pois.some(place => {
    const tags = place?.tags;
    if (!tags || typeof tags !== "object" || !/^(node|way|relation)\/\d+$/.test(place.osmId)) return false;
    if (tags.access && !["yes", "permissive", "customers", "designated"].includes(tags.access)) return false;
    if (["disused", "abandoned", "demolished", "removed", "construction", "proposed", "closed"]
      .some(key => tags[key] && tags[key] !== "no")) return false;
    if (Object.keys(tags).some(key => /^(disused|abandoned|demolished|removed|construction|proposed):/.test(key) &&
      tags[key] && tags[key] !== "no")) return false;
    return tags.shop === "bicycle" || tags.amenity === "bicycle_repair_station" ||
      tags["service:bicycle:repair"] === "yes";
  });
}

export function difficulty(level) {
  if (!integer(level, 0, 4)) throw new RangeError("Workshop level must be 0–4.");
  return freeze({ level, options: 3 + level, timeMs: 60000 - level * 6000,
    rewardMultiplier: 1 + level * 0.5, maxScore: 1000 });
}

function validate(game, now) {
  if (!record(game) || game.version !== 2) throw new TypeError("Invalid workshop state.");
  const rules = difficulty(game.level);
  const keys = ["version", "level", "now", "startedAt", "status", "model", "choices", "selected", "feedback", "resonance", "repaintPart"];
  if (Object.keys(game).length !== keys.length || Object.keys(game).some(key => !keys.includes(key)) ||
      typeof game.resonance !== "boolean" ||
      (game.resonance ? !PARTS.includes(game.repaintPart) : game.repaintPart !== null) ||
      !time(now) || !time(game.now) || now < game.now ||
      !["ready", "playing", "completed", "failed", "cancelled"].includes(game.status) ||
      !keyedParts(game.model) || !keyedParts(game.choices) || !keyedParts(game.selected) ||
      !["", "changed", "mismatch", "incomplete", "matched", "timeout", "cancelled"].includes(game.feedback) ||
      !(game.startedAt === null || time(game.startedAt) && game.startedAt <= game.now &&
        game.startedAt <= Number.MAX_SAFE_INTEGER - rules.timeMs) ||
      PARTS.some(part => !variant(game.model[part]) || !Array.isArray(game.choices[part]) ||
        game.choices[part].length !== rules.options || !Array.from(game.choices[part]).every(variant) ||
        new Set(game.choices[part].map(value => `${value.colour}/${value.size}`)).size !== rules.options ||
        (part === game.repaintPart
          ? game.choices[part].some(value => samePart(value, game.model[part])) ||
            game.choices[part].filter(value => value.size === game.model[part].size).length !== 1
          : !game.choices[part].some(value => samePart(value, game.model[part]))) ||
        !(game.selected[part] === null || variant(game.selected[part]) &&
          (game.choices[part].some(value => samePart(value, game.selected[part])) ||
            game.resonance && game.choices[part].some(value => value.size === game.selected[part].size))))) {
    throw new TypeError("Invalid workshop state or time.");
  }
  const elapsed = game.startedAt === null ? 0 : game.now - game.startedAt;
  if (game.status === "ready" && (game.startedAt !== null || PARTS.some(part => game.selected[part] !== null)) ||
      ["playing", "completed", "failed"].includes(game.status) && game.startedAt === null ||
      ["playing", "completed"].includes(game.status) && elapsed >= rules.timeMs ||
      game.status === "completed" && (matched(game).length !== PARTS.length || game.feedback !== "matched") ||
      game.status === "failed" && (elapsed < rules.timeMs || game.feedback !== "timeout")) {
    throw new TypeError("Inconsistent workshop state.");
  }
  return rules;
}

export function createGame({ level = 0, random = Math.random, now = 0, ...options } = {}) {
  const resonance = resolveResonance("workshop", options);
  const rules = difficulty(level);
  if (!time(now) || now > Number.MAX_SAFE_INTEGER - rules.timeMs || typeof random !== "function") {
    throw new TypeError("Invalid workshop options.");
  }
  function pick(length) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new RangeError("Invalid workshop random draw.");
    return Math.floor(sample * length);
  }
  function shuffle(values) {
    const next = [...values];
    for (let index = next.length - 1; index > 0; index--) {
      const other = pick(index + 1);
      [next[index], next[other]] = [next[other], next[index]];
    }
    return next;
  }
  const repaintPart = resonance ? PARTS[pick(PARTS.length)] : null;
  const model = {}, choices = {}, selected = {};
  for (const part of PARTS) {
    const colour = pick(COLOURS.length), size = pick(SIZES.length);
    const target = { colour: COLOURS[colour], size: SIZES[size] };
    // Every shelf includes both a wrong-size and a wrong-colour lookalike.
    const required = [target,
      { colour: target.colour, size: SIZES[(size + 1) % SIZES.length] },
      { colour: COLOURS[(colour + 1) % COLOURS.length], size: target.size }];
    const remaining = shuffle(COLOURS.flatMap(colour => SIZES.map(size => ({ colour, size })))
      .filter(value => !required.some(item => samePart(item, value))));
    model[part] = target;
    choices[part] = shuffle([...required, ...remaining.slice(0, rules.options - required.length)]);
    if (part === repaintPart) {
      const repaintable = required[2];
      const wrongSizes = shuffle(COLOURS.flatMap(colour => SIZES
        .filter(size => size !== target.size).map(size => ({ colour, size }))));
      choices[part] = shuffle([repaintable, ...wrongSizes.slice(0, rules.options - 1)]);
    }
    selected[part] = null;
  }
  return freeze({ version: 2, level, resonance, repaintPart, now, startedAt: null, status: "ready", model, choices, selected, feedback: "" });
}

export function input(game, action, now) {
  const rules = validate(game, now);
  if (!record(action) || !["start", "choose", "repaint", "submit", "cancel"].includes(action.type) ||
      Object.keys(action).some(key => !["type", ...(action.type === "choose" ? ["part", "choice"] :
        action.type === "repaint" ? ["colour", "part"] : [])].includes(key)) ||
      action.type === "choose" && (!PARTS.includes(action.part) || !integer(action.choice, 0, rules.options - 1)) ||
      action.type === "repaint" && (!COLOURS.includes(action.colour) ||
        action.part !== undefined && !PARTS.includes(action.part))) {
    throw new TypeError("Invalid workshop action.");
  }
  if (["completed", "failed", "cancelled"].includes(game.status)) return game;
  if (action.type === "cancel") return freeze({ ...game, now, status: "cancelled", feedback: "cancelled" });
  const next = advance(game, now);
  if (next.status === "failed") return next;
  if (action.type === "start" && game.status === "ready") {
    if (now > Number.MAX_SAFE_INTEGER - rules.timeMs) throw new RangeError("Invalid workshop start time.");
    return freeze({ ...next, status: "playing", startedAt: now });
  }
  if (next.status !== "playing") return next;
  if (action.type === "repaint") {
    const part = action.part ?? next.repaintPart, selected = next.selected[part];
    if (!next.resonance || !part || !selected) return next;
    return freeze({ ...next, selected: { ...next.selected, [part]: { ...selected, colour: action.colour } },
      feedback: "changed" });
  }
  if (action.type === "choose") {
    return freeze({ ...next, selected: { ...next.selected, [action.part]: next.choices[action.part][action.choice] },
      feedback: "changed" });
  }
  if (action.type === "submit") {
    if (PARTS.some(part => next.selected[part] === null)) return freeze({ ...next, feedback: "incomplete" });
    const completed = matched(next).length === PARTS.length;
    return freeze({ ...next, status: completed ? "completed" : "playing", feedback: completed ? "matched" : "mismatch" });
  }
  return next;
}

export function advance(game, now) {
  const rules = validate(game, now);
  if (!["ready", "playing"].includes(game.status)) return game;
  if (game.status === "playing" && now - game.startedAt >= rules.timeMs) {
    return freeze({ ...game, now, status: "failed", feedback: "timeout" });
  }
  return freeze({ ...game, now });
}

export function result(game) {
  const rules = validate(game, game?.now);
  return freeze(resonanceResult({ completed: game.status === "completed",
    score: game.status === "completed" ? rules.maxScore : 0,
    maxScore: rules.maxScore, cancelled: game.status === "cancelled" }, game.resonance));
}
