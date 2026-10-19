import { restSurvival } from "./survival.mjs";
import { finishAction, didFaint } from "./economy.mjs";
import { askDirections } from "./directions.mjs";
import { didPlace, witnessCooling } from "./pressures.mjs";
import { journeyEquipmentModifiers } from "./equipment.mjs";

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

export function clueDirection(source, target) {
  const east = target.col - source.col, north = source.row - target.row;
  return COMPASS[(Math.round(Math.atan2(east, north) / (Math.PI / 4)) + 8) % 8];
}

export function beginExploration(state, resumed = false) {
  if (state.trail?.version !== 2 || state.trail.exploration || state.trail.completed) return state;
  return { ...state, trail: { ...state.trail, exploration: {
    version: 1, firstStage: state.trail.index,
    knownStage: resumed ? state.trail.index : null, hints: [],
  } } };
}

export function fieldSearchAvailable(state, cell) {
  return Boolean(state.trail?.exploration && !state.ended && !state.trail.completed &&
    cell && !cell.unavailable && cell.terrain !== "water");
}

export function fieldSearchRules(state) {
  const target = state.trail.stages[state.trail.index];
  const meters = Math.hypot(state.col - target.col, state.row - target.row) * 250;
  const precision = meters <= 3000 ? "precise"
    : meters <= 15000 && witnessCooling(state) === 0 ? "partial" : "vague";
  const scale = Math.min(1, meters / 45000);
  return { precision, minMinutes: Math.round(8 + 22 * scale),
    maxMinutes: Math.round(14 + 46 * scale), minFatigue: 1 + Math.floor(3 * scale),
    maxFatigue: 2 + Math.floor(5 * scale) };
}

export function fieldSearchChance(pathDistanceMeters) {
  if (!Number.isFinite(pathDistanceMeters) || pathDistanceMeters < 0) {
    throw new Error("Invalid parent-path proximity.");
  }
  return 0.08 + 0.82 * Math.exp(-pathDistanceMeters / 6000);
}

export async function loadSearchProximity(state, signal, fetcher = fetch) {
  if (!state.serverJourney?.id) throw new Error("A server-created journey is required for field searches.");
  const query = new URLSearchParams({ journey: state.serverJourney.id, stage: String(state.trail.index),
    col: String(state.col), row: String(state.row) });
  const response = await fetcher(`/api/parent-path?${query}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
    throw new Error("The updated game server is required for field searches.");
  }
  const data = await response.json();
  if (response.status === 202 && data.status === "loading" && data.stage === state.trail.index ||
      [422, 429].includes(response.status) && typeof data.error === "string") {
    const target = state.trail.stages[state.trail.index];
    return { destinationDistanceMeters: Math.hypot(state.col - target.col, state.row - target.row) * 250 };
  }
  if (response.status !== 200) throw new Error(data.error ?? "Parent path is still being prepared. Retry shortly.");
  if (data.status !== "ready" || data.version !== "grid-walk-v1" || data.stage !== state.trail.index ||
      data.col !== state.col || data.row !== state.row) throw new Error("Invalid clue search proximity response.");
  fieldSearchChance(data.pathDistanceMeters);
  return data.pathDistanceMeters;
}

export async function prepareFieldSearch(state, cell, resolvePhoto, signal,
  { random = Math.random, proximity = loadSearchProximity } = {}) {
  if (!fieldSearchAvailable(state, cell)) throw new Error("No field search available here.");
  const draw = () => {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error("Invalid clue search draw.");
    return roll;
  };
  const proximityResult = await proximity(state, signal);
  const destinationBased = typeof proximityResult === "object";
  const pathDistance = destinationBased ? proximityResult.destinationDistanceMeters : proximityResult;
  fieldSearchChance(pathDistance);
  signal.throwIfAborted();
  const rules = fieldSearchRules(state);
  const minutes = rules.minMinutes + Math.floor(draw() * (rules.maxMinutes - rules.minMinutes + 1));
  const fatigue = rules.minFatigue + Math.floor(draw() * (rules.maxFatigue - rules.minFatigue + 1));
  const roll = draw();
  const success = state.pressures && rules.precision === "precise" ||
    roll < Math.min(1, fieldSearchChance(pathDistance) + journeyEquipmentModifiers(state).clueChanceBonus);
  let kind = success ? rules.precision === "precise" ? "place"
    : ["direction", "prefix", "photo"][Math.floor(draw() * 3)] : null;
  if (kind && rules.precision !== "precise" && witnessCooling(state) === 2) kind = "direction";
  const nearRoute = pathDistance <= 6000;
  const streak = state.trail.exploration.searchStreak;
  const misses = streak?.stage === state.trail.index ? streak.misses : [];
  const newLocation = !misses.some(p => p.col === state.col && p.row === state.row);
  if (!kind && nearRoute &&
      (roll < 0.95 - 0.2 * pathDistance / 6000 || misses.length === 3 && newLocation)) kind = "sign";
  const content = kind === "photo" ? await resolvePhoto(state, state.trail.index, true) : undefined;
  signal.throwIfAborted();
  const photoUnavailable = kind === "photo" && !content;
  if (photoUnavailable) kind = "prefix";
  return { stage: state.trail.index, col: state.col, row: state.row, startedMinutes: state.elapsedMinutes,
    precision: rules.precision, minutes, fatigue, kind, content, photoUnavailable, nearRoute,
    ...(destinationBased ? { destinationBased: true } : {}) };
}

export function applyFieldSearch(state, result, cell, info, survival, economy) {
  if (!fieldSearchAvailable(state, cell) || result.stage !== state.trail.index ||
      (result.startedMinutes !== undefined && result.startedMinutes !== state.elapsedMinutes) ||
      result.col !== state.col || result.row !== state.row) throw new Error("Stale clue search result.");
  const rules = fieldSearchRules(state);
  if (result.precision !== rules.precision ||
      !Number.isInteger(result.minutes) || result.minutes < rules.minMinutes || result.minutes > rules.maxMinutes ||
      !Number.isInteger(result.fatigue) || result.fatigue < rules.minFatigue || result.fatigue > rules.maxFatigue ||
      typeof result.nearRoute !== "boolean" ||
      (result.destinationBased !== undefined && typeof result.destinationBased !== "boolean") ||
      ![null, "place", "direction", "prefix", "photo", "sign"].includes(result.kind) ||
      (result.kind === "sign" && !result.nearRoute) ||
      (result.kind !== "sign" &&
        (result.kind === "place") !== (Boolean(result.kind) && rules.precision === "precise"))) {
    throw new Error("Invalid field search result.");
  }
  const rested = restSurvival({ ...state, lastExpenseCents: 0 }, { ...survival,
    rest_minutes: result.minutes, rest_fatigue_recovery: 0 });
  const kcal = result.minutes;
  let next = finishAction(state, { ...spendExtraEnergy(rested, kcal),
    fatigue: Math.min(100, rested.fatigue + result.fatigue) }, info, economy, { survival });
  const outcome = didPlace(state, next) ? "placed" : next.ended ? "exhausted" : didFaint(state, next) ? "fainted"
    : result.kind === "sign" ? "sign" : result.kind ? "found" : "nothing";
  const exploration = state.trail.exploration;
  const hint = outcome === "found" ? { stage: result.stage, kind: result.kind,
    precision: result.precision, col: result.col, row: result.row, elapsedMinutes: next.elapsedMinutes,
    ...(state.pressures ? { witnessMinutes: state.elapsedMinutes,
      witnessFactor: state.pressures.tarotFactor } : {}) } : null;
  const hints = hint && !exploration.hints.some(h => h.stage === hint.stage &&
    h.kind === hint.kind && h.precision === hint.precision) ? [...exploration.hints, hint] : exploration.hints;
  const repeated = Boolean(hint && hints === exploration.hints);
  const oldMisses = exploration.searchStreak?.stage === result.stage ? exploration.searchStreak.misses : [];
  const position = { col: result.col, row: result.row };
  const misses = ["found", "sign"].includes(outcome) ? []
    : outcome === "nothing" && result.nearRoute &&
      !oldMisses.some(p => p.col === position.col && p.row === position.row)
      ? [...oldMisses, position].slice(-3) : oldMisses;
  const signs = exploration.signs ?? [];
  const sign = outcome === "sign" ? { ...position, stage: result.stage, elapsedMinutes: next.elapsedMinutes } : null;
  const retainedSigns = sign ? [...signs.filter(s => s.stage !== sign.stage),
    ...signs.filter(s => s.stage === sign.stage).slice(-3), sign] : signs;
  next = { ...next, trail: { ...state.trail, exploration: { ...exploration, hints,
    signs: retainedSigns, searchStreak: { stage: result.stage, misses,
      failures: ["found", "sign"].includes(outcome) ? 0 : Math.min(3,
        (exploration.searchStreak?.stage === result.stage ? exploration.searchStreak.failures ?? 0 : 0) +
        (outcome === "nothing" ? 1 : 0)) },
    lastSearch: { stage: result.stage, outcome, minutes: result.minutes, fatigue: result.fatigue,
      ...(repeated ? { repeated: true } : {}),
      ...(result.destinationBased ? { destinationBased: true } : {}),
      ...position, elapsedMinutes: next.elapsedMinutes },
  } } };
  return next;
}

export function fieldClueText(state, hint, t) {
  const target = state.trail.stages[hint.stage];
  if (hint.kind === "place") return t("fieldClue.place", { place: target.name });
  if (hint.kind === "photo") return t("fieldClue.photo");
  if (hint.kind === "prefix") {
    const chars = Array.from(target.name);
    const length = Math.min(Math.max(1, Math.floor(chars.length / 2)),
      hint.precision === "partial" ? 5 : 2);
    return t("fieldClue.prefix", { prefix: chars.slice(0, length).join("") });
  }
  const variant = Math.abs(hint.col * 31 + hint.row * 17 + hint.stage * 13) % 20;
  return t(`fieldDirection.${variant}`, {
    parent: state.trail.parentName,
    direction: t(`hintCompass.${clueDirection(hint, target)}`),
  });
}

export function vagueLead(state, stage, t) {
  const origin = stage === 0 ? state.trail.origin : state.trail.stages[stage - 1];
  return fieldClueText(state, { ...origin, stage, kind: "direction" }, t);
}

export function openingClue(state) {
  const trail = state.trail, exploration = trail?.exploration;
  if (trail?.version !== 2 || !trail.origin || exploration?.firstStage !== 0 ||
      exploration.knownStage !== null) return undefined;
  return { stage: 0, kind: "direction", precision: "vague",
    col: trail.origin.col, row: trail.origin.row, elapsedMinutes: 0 };
}

export function openingClueText(state, t) {
  const hint = openingClue(state);
  if (!hint) throw new Error("No opening clue is available for this journey.");
  return t("trailOpeningClue", { parent: state.trail.parentName,
    direction: t(`hintCompass.${clueDirection(hint, state.trail.stages[hint.stage])}`) });
}

export function recognitionHint(state) {
  const hints = state.trail?.exploration?.hints ?? [];
  if (hints.some(h => h.stage === state.trail.index && h.kind === "place")) return undefined;
  return hints.findLast(h => h.stage === state.trail.index && h.precision === "partial" && h.kind === "prefix") ??
    hints.findLast(h => h.stage === state.trail.index && ["prefix", "photo"].includes(h.kind));
}

export async function prepareRecognition(state, hint, signal, fetcher = fetch) {
  if (!state.serverJourney?.id || !state.trail.exploration?.hints.includes(hint) ||
      hint.stage !== state.trail.index || !["prefix", "photo"].includes(hint.kind)) {
    throw new Error("No collected clue to ask about.");
  }
  const kind = `${hint.precision}-${hint.kind}`;
  const query = new URLSearchParams({ journey: state.serverJourney.id, stage: String(hint.stage),
    col: String(state.col), row: String(state.row), recognize: kind });
  const response = await fetcher(`/api/parent-path?${query}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
    throw new Error("The updated game server is required for clue recognition.");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Clue recognition: HTTP ${response.status}`);
  if (data.status !== "recognition" || data.stage !== hint.stage || data.col !== state.col ||
      data.row !== state.row || data.kind !== kind || data.sourceUrl !== "https://www.geonames.org/" ||
      !Array.isArray(data.towns) || data.towns.length > 8 || data.towns.some(town =>
        !town || typeof town.name !== "string" || !town.name.trim() ||
        !Number.isFinite(town.latitude) || Math.abs(town.latitude) > 85 ||
        !Number.isFinite(town.longitude) || Math.abs(town.longitude) > 180)) {
    throw new Error("Invalid clue recognition candidates.");
  }
  signal.throwIfAborted();
  return { hint, col: state.col, row: state.row, towns: data.towns };
}

export function askAboutClue(state, prepared, cell, info, survival, economy, random = Math.random) {
  if (state.ended || prepared.hint.stage !== state.trail.index ||
      !state.trail.exploration?.hints.includes(prepared.hint) ||
      state.col !== prepared.col || state.row !== prepared.row) throw new Error("Stale recognition request.");
  const result = askDirections(state, cell, info, survival, economy, random);
  let suggestion;
  if (result.outcome === "helped" && prepared.towns.length) {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error("Invalid recognition draw.");
    if (prepared.hint.kind === "prefix") {
      const confidence = 0.8 - witnessCooling(state) * 0.15;
      suggestion = prepared.towns[roll < confidence ? 0 : Math.min(prepared.towns.length - 1,
        1 + Math.floor((roll - confidence) / (1 - confidence) * (prepared.towns.length - 1)))];
    } else {
      const target = state.trail.stages[state.trail.index];
      const correct = prepared.towns.find(town => town.name === target.name &&
        Math.abs(town.latitude - target.latitude) < 0.02 && Math.abs(town.longitude - target.longitude) < 0.02);
      const others = prepared.towns.filter(town => town !== correct);
      const confidence = 0.65 - witnessCooling(state) * 0.15;
      suggestion = correct && (roll < confidence || !others.length) ? correct
        : others[Math.floor((correct ? (roll - confidence) / (1 - confidence) : roll) * others.length)];
    }
  }
  const exploration = state.trail.exploration;
  const report = { stage: state.trail.index, kind: prepared.hint.kind,
    precision: prepared.hint.precision, elapsedMinutes: result.state.elapsedMinutes,
    outcome: suggestion ? "suggestion" : result.outcome === "helped" ? "unsure" : result.outcome,
    town: suggestion ?? null };
  const reports = exploration.reports ?? [];
  return { state: { ...result.state, trail: { ...state.trail, exploration: { ...exploration,
    lastReport: report, reports: suggestion && !reports.some(r => r.stage === report.stage &&
      r.kind === report.kind && r.precision === report.precision &&
      JSON.stringify(r.town) === JSON.stringify(report.town)) ? [...reports, report] : reports,
  } } }, outcome: report.outcome };
}

export function validateExploration(state) {
  const e = state.trail.exploration;
  if (e === undefined) return;
  const fail = () => { throw new Error("Invalid field clue history."); };
  if (state.trail.version !== 2 || !e || e.version !== 1 ||
      !Number.isInteger(e.firstStage) || e.firstStage < 0 || e.firstStage > state.trail.index ||
      (e.knownStage !== null && e.knownStage !== e.firstStage) || !Array.isArray(e.hints) ||
      e.hints.length > state.trail.stages.length * 7) fail();
  const seen = new Set();
  for (const hint of e.hints) {
    if (!hint || !Number.isInteger(hint.stage) || hint.stage < e.firstStage ||
        hint.stage > state.trail.index || hint.stage >= state.trail.stages.length ||
        !["vague", "partial", "precise"].includes(hint.precision) ||
        (hint.precision === "precise" ? hint.kind !== "place"
          : !["direction", "prefix", "photo"].includes(hint.kind)) ||
        !Number.isSafeInteger(hint.col) || !Number.isSafeInteger(hint.row) ||
        Math.abs(Math.floor(hint.col / 8)) > 1000 || Math.abs(Math.floor(hint.row / 8)) > 1000 ||
        !Number.isFinite(hint.elapsedMinutes) || hint.elapsedMinutes < 0 ||
        hint.elapsedMinutes > state.elapsedMinutes ||
        ((hint.witnessMinutes === undefined) !== (hint.witnessFactor === undefined)) ||
        (hint.witnessMinutes !== undefined && (!state.pressures ||
          !Number.isFinite(hint.witnessFactor) || hint.witnessFactor < 0.5 || hint.witnessFactor > 1.5 ||
          !Number.isFinite(hint.witnessMinutes) || hint.witnessMinutes < state.pressures.startedMinutes ||
          hint.witnessMinutes > hint.elapsedMinutes)) ||
        fieldSearchRules({ ...state, col: hint.col, row: hint.row,
          pressures: hint.witnessMinutes === undefined ? undefined :
            { ...state.pressures, tarotFactor: hint.witnessFactor },
          elapsedMinutes: hint.witnessMinutes ?? hint.elapsedMinutes,
          trail: { ...state.trail, index: hint.stage } }).precision !== hint.precision) fail();
    const key = `${hint.stage}:${hint.precision}:${hint.kind}`;
    if (seen.has(key)) fail();
    seen.add(key);
  }
  const validPosition = p => p && Number.isSafeInteger(p.col) && Number.isSafeInteger(p.row) &&
    Math.abs(Math.floor(p.col / 8)) <= 1000 && Math.abs(Math.floor(p.row / 8)) <= 1000;
  const validStage = p => p && Number.isInteger(p.stage) && p.stage >= e.firstStage &&
    p.stage <= state.trail.index && p.stage < state.trail.stages.length;
  if (e.signs !== undefined) {
    if (!Array.isArray(e.signs) || e.signs.length > state.trail.stages.length * 4) fail();
    const counts = new Map();
    for (const sign of e.signs) {
      if (!validPosition(sign) || !validStage(sign) || !Number.isFinite(sign.elapsedMinutes) ||
          sign.elapsedMinutes < 8 || sign.elapsedMinutes > state.elapsedMinutes) fail();
      counts.set(sign.stage, (counts.get(sign.stage) ?? 0) + 1);
      if (counts.get(sign.stage) > 4) fail();
    }
  }
  if (e.searchStreak !== undefined) {
    const streak = e.searchStreak;
    if (!validStage(streak) || !Array.isArray(streak.misses) || streak.misses.length > 3 ||
        (streak.failures !== undefined && (!Number.isInteger(streak.failures) || streak.failures < 0 || streak.failures > 3)) ||
        streak.misses.some(p => !validPosition(p)) ||
        new Set(streak.misses.map(p => `${p.col},${p.row}`)).size !== streak.misses.length) fail();
  }
  if (e.lastSearch !== undefined) {
    const r = e.lastSearch;
    if (r?.destinationBased !== undefined && typeof r.destinationBased !== "boolean") fail();
    if (r?.repeated !== undefined && (typeof r.repeated !== "boolean" || r.outcome !== "found")) fail();
    if (!r || !Number.isInteger(r.stage) || r.stage < e.firstStage || r.stage > state.trail.index ||
        r.stage >= state.trail.stages.length ||
        !["found", "sign", "nothing", "fainted", "exhausted", "placed"].includes(r.outcome) ||
        ((r.col !== undefined || r.row !== undefined) && !validPosition(r)) ||
        (r.outcome === "sign" && !e.signs?.some(s => s.stage === r.stage &&
          s.col === r.col && s.row === r.row && s.elapsedMinutes === r.elapsedMinutes)) ||
        !Number.isInteger(r.minutes) || r.minutes < 8 || r.minutes > 60 ||
        !Number.isInteger(r.fatigue) || r.fatigue < 1 || r.fatigue > 7 ||
        !Number.isFinite(r.elapsedMinutes) || r.elapsedMinutes < r.minutes ||
        r.elapsedMinutes > state.elapsedMinutes) fail();
  }
  const reports = e.reports ?? [];
  if (!Array.isArray(reports) || reports.length > state.trail.stages.length * 32) fail();
  for (const r of [...reports, ...(e.lastReport !== undefined ? [e.lastReport] : [])]) {
    if (!r || !e.hints.some(h => h.stage === r.stage && h.kind === r.kind && h.precision === r.precision &&
        r.elapsedMinutes >= h.elapsedMinutes + 10) ||
        !["suggestion", "unsure", "nobody", "exhausted", "fainted", "placed"].includes(r.outcome) ||
        !Number.isFinite(r.elapsedMinutes) || r.elapsedMinutes < 10 || r.elapsedMinutes > state.elapsedMinutes ||
        (r.outcome === "suggestion" ? !r.town || typeof r.town.name !== "string" || !r.town.name.trim() ||
          !Number.isFinite(r.town.latitude) || Math.abs(r.town.latitude) > 85 ||
          !Number.isFinite(r.town.longitude) || Math.abs(r.town.longitude) > 180 : r.town !== null)) fail();
  }
}
import { spendExtraEnergy } from "./health.mjs";
