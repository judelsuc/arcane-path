import { restSurvival } from "./survival.mjs";
import { finishAction, marketPrice, actionInterrupted } from "./economy.mjs";
import { changeReputation, sympathy } from "./pressures.mjs";
import { practiceSkill, practice, outcomeReputation } from "./practice.mjs";
import { resolveResonance, resonanceGain } from "./arcane-resonance.mjs";
import { journeyEquipmentModifiers } from "./equipment.mjs";

export const MUSIC = Object.freeze({
  beats: 24, loops: 3, slots: 12,
  intervalMs: 400, leadMs: 1500, windowMs: 150, releaseWindowMs: 300,
  minMistakes: 3, maxMistakes: 8,
});

const CARD_CHARISMA = Object.freeze({
  fool: 4, magician: 6, priestess: 2, empress: 5, emperor: 4, hierophant: 4,
  lovers: 6, chariot: 4, justice: 3, hermit: 1, wheel: 3, strength: 5,
  hanged: 2, nameless: 1, temperance: 4, devil: 6, tower: 1, star: 5,
  moon: 2, sun: 6, judgement: 4, world: 5,
});

export function musicMistakeLimit(state) {
  const charisma = Object.hasOwn(CARD_CHARISMA, state.birthCard) ? CARD_CHARISMA[state.birthCard] : undefined;
  if (charisma === undefined) throw new Error("Unknown starting card for music charisma.");
  return charisma + 2;
}

export function musicDifficulty(state) {
  const { level, xp } = practiceSkill(state, "music");
  const holdLengths = level === 0 ? [] : level === 1 ? [2] : level === 2 ? [2, 3] : [2, 3, 4];
  const extraSlots = holdLengths.reduce((sum, length) => sum + length - 1, 0);
  return { level, xp, beats: (8 + level) * MUSIC.loops, multiplier: 1 + level * 0.25,
    intervalMs: MUSIC.intervalMs - level * 35, slots: MUSIC.slots + level + extraSlots,
    holdNotes: holdLengths.length, holdLengths,
    resonance: resolveResonance("music", {
      journeyCard: state.journeyCard ?? null,
      birthCard: state.birthCard ?? null,
      dailyCard: state.dailyCard ?? null,
    }) };
}

export function rhythm(startedAt, random = Math.random, mistakeLimit = MUSIC.minMistakes,
  totalBeats = MUSIC.beats, timing = {}) {
  if (!Number.isFinite(startedAt)) throw new Error("Invalid performance clock.");
  if (!Number.isInteger(mistakeLimit) || mistakeLimit < MUSIC.minMistakes || mistakeLimit > MUSIC.maxMistakes) {
    throw new Error("Invalid rhythm mistake limit.");
  }
  if (!Number.isInteger(totalBeats) || totalBeats < MUSIC.beats || totalBeats > 36 ||
      totalBeats % MUSIC.loops !== 0) throw new Error("Invalid rhythm note count.");
  const { intervalMs = MUSIC.intervalMs, slots = MUSIC.slots, holdNotes = 0,
    resonance = false } = timing;
  if (!Number.isInteger(holdNotes) || holdNotes < 0 || holdNotes > 3) {
    throw new Error("Invalid rhythm timing.");
  }
  const { holdLengths = Array(holdNotes).fill(2) } = timing;
  const notes = totalBeats / MUSIC.loops;
  if (!Array.isArray(holdLengths) || holdLengths.length !== holdNotes ||
      holdLengths.some(length => !Number.isInteger(length) || length < 2 || length > 4)) {
    throw new Error("Invalid rhythm hold lengths.");
  }
  const extraSlots = holdLengths.reduce((sum, length) => sum + length - 1, 0);
  if (!Number.isFinite(intervalMs) || intervalMs < 260 || intervalMs > MUSIC.intervalMs ||
      !Number.isInteger(slots) || slots < MUSIC.slots || slots > 22 ||
      !Number.isInteger(holdNotes) || holdNotes < 0 || holdNotes > 3 || typeof resonance !== "boolean" ||
      notes + extraSlots >= slots) throw new Error("Invalid rhythm timing.");
  const tokens = Array.from({ length: slots - extraSlots }, (_, i) =>
    i < holdNotes ? holdLengths[i] : i < notes ? 1 : 0);
  for (let i = tokens.length - 1; i > 0; i--) {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error("Invalid rhythm draw.");
    const j = Math.floor(roll * (i + 1));
    [tokens[i], tokens[j]] = [tokens[j], tokens[i]];
  }
  const pattern = tokens.flatMap(token => token > 1 ? [token, ...Array(token - 1).fill(-1)] : [token]);
  return { startedAt, pattern: Object.freeze(pattern),
    intervalMs, hits: Array(totalBeats).fill(false), mistakes: 0, mistakeLimit,
    activeHold: null, attemptedHolds: [], resonance,
    previewMs: resonance ? MUSIC.leadMs + pattern.length * intervalMs : 0 };
}

export function beatTime(game, index) {
  const notes = game.pattern.flatMap((note, slot) => note > 0 ? [slot] : []);
  const slot = Math.floor(index / notes.length) * game.pattern.length + notes[index % notes.length];
  return game.startedAt + MUSIC.leadMs + slot * game.intervalMs;
}

export function holdDuration(game, index) {
  const notes = game.pattern.filter(note => note > 0);
  const length = notes[index % notes.length];
  return length > 1 ? length * game.intervalMs : 0;
}

export function rhythmEnd(game) {
  const last = game.hits.length - 1;
  const duration = holdDuration(game, last);
  return beatTime(game, last) + duration + (duration ? MUSIC.releaseWindowMs : MUSIC.windowMs);
}

export function advanceRhythm(game, now) {
  if (!Number.isFinite(now)) throw new Error("Invalid rhythm clock.");
  if (game.mistakes >= game.mistakeLimit) return game;
  if (game.activeHold !== null &&
      now > beatTime(game, game.activeHold) + holdDuration(game, game.activeHold) + MUSIC.releaseWindowMs) {
    return { ...game, activeHold: null, mistakes: game.mistakes + 1 };
  }
  return game;
}

export function releaseRhythm(game, now, cancelled = false) {
  if (!Number.isFinite(now)) throw new Error("Invalid release clock.");
  if (game.activeHold === null || game.mistakes >= game.mistakeLimit) return game;
  const index = game.activeHold;
  const success = !cancelled &&
    Math.abs(now - beatTime(game, index) - holdDuration(game, index)) <= MUSIC.releaseWindowMs;
  const hits = success ? game.hits.map((hit, i) => i === index || hit) : game.hits;
  return { ...game, activeHold: null, hits, mistakes: game.mistakes + (success ? 0 : 1) };
}

export function tapRhythm(game, now) {
  if (!Number.isFinite(now)) throw new Error("Invalid tap clock.");
  game = advanceRhythm(game, now);
  if (game.mistakes >= game.mistakeLimit || now > rhythmEnd(game)) return game;
  const slot = Math.round((now - game.startedAt - MUSIC.leadMs) / game.intervalMs);
  const notes = game.pattern.flatMap((note, slot) => note > 0 ? [slot] : []);
  const position = notes.indexOf(slot % game.pattern.length);
  const index = Math.floor(slot / game.pattern.length) * notes.length + position;
  if (position < 0 || index < 0 || index >= game.hits.length || game.hits[index] ||
      game.activeHold !== null || game.attemptedHolds.includes(index) ||
      Math.abs(now - beatTime(game, index)) > MUSIC.windowMs) {
    return { ...game, mistakes: game.mistakes + 1 };
  }
  if (holdDuration(game, index)) {
    return { ...game, activeHold: index, attemptedHolds: [...game.attemptedHolds, index] };
  }
  const hits = [...game.hits];
  hits[index] = true;
  return { ...game, hits };
}

export function beginBusking(state, cell, info, survival, data, options = {}) {
  if (state.performancePending || state.cafePending || state.theftPending || state.miniGamePending ||
      state.events?.pending || state.equipment?.dogEncounter === "pending") throw new Error("A performance or shift is already active.");
  if (cell.terrain !== "place") throw new Error("Street music is only available in settlement cells.");
  const performing = restSurvival({ ...state, fatigue: Math.min(100,
    state.fatigue + data.rules.performanceFatigue) }, { ...survival,
    rest_minutes: data.rules.performanceMinutes, rest_fatigue_recovery: 0 });
  const next = finishAction(state, performing, info, data, { survival, activity: "music" });
  const difficulty = musicDifficulty(state);
  const resonance = resolveResonance("music", {
    journeyCard: options.journeyCard ?? state.journeyCard ?? null,
    birthCard: options.birthCard ?? state.birthCard ?? null,
    dailyCard: options.dailyCard ?? state.dailyCard ?? null,
    resonance: options.resonance ?? false,
  });
  return { ...next, performancePending: actionInterrupted(state, next) ? null : {
    beats: difficulty.beats,
    maxRewardCents: Math.round(marketPrice(cell, 2, data, info).cents *
      (state.pressures ? 0.75 + sympathy(state) / 200 : 1) * difficulty.multiplier *
      journeyEquipmentModifiers(state).streetMusicIncomeMultiplier),
    resonance,
  } };
}

export function settleBusking(state, hits, mistakes = 0, cancelled = false) {
  if (!state.performancePending) throw new Error("No active performance to settle.");
  const total = state.performancePending.beats ?? MUSIC.beats;
  if (!Number.isInteger(hits) || hits < 0 || hits > total) throw new Error("Invalid rhythm score.");
  const mistakeLimit = musicMistakeLimit(state);
  if (!Number.isInteger(mistakes) || mistakes < 0 || mistakes > mistakeLimit) {
    throw new Error("Invalid rhythm mistake count.");
  }
  if (typeof cancelled !== "boolean") throw new Error("Invalid performance cancellation.");
  const baseReward = cancelled || mistakes >= mistakeLimit ? 0
    : Math.round(state.performancePending.maxRewardCents * hits / total);
  const reward = resonanceGain(baseReward, state.performancePending.resonance ?? false);
  const reputation = outcomeReputation(hits, total, mistakes >= mistakeLimit, cancelled);
  let next = reputation ? changeReputation(state, reputation) : state;
  if (!cancelled && mistakes < mistakeLimit && hits >= Math.ceil(total * 0.6)) next = practice(next, "music", hits);
  return { ...next, walletCents: state.walletCents + reward, performancePending: null,
    performances: (state.performances ?? 0) + 1, lastEarningsCents: reward };
}
