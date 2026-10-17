import { restSurvival } from "./survival.mjs";
import { finishAction, marketPrice, actionInterrupted } from "./economy.mjs";
import { changeReputation, sympathy } from "./pressures.mjs";

export const MUSIC = Object.freeze({
  beats: 24, loops: 3, slots: 12,
  intervalMs: 400, leadMs: 1500, windowMs: 150, minMistakes: 3, maxMistakes: 8,
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

export function rhythm(startedAt, random = Math.random, mistakeLimit = MUSIC.minMistakes) {
  if (!Number.isFinite(startedAt)) throw new Error("Invalid performance clock.");
  if (!Number.isInteger(mistakeLimit) || mistakeLimit < MUSIC.minMistakes || mistakeLimit > MUSIC.maxMistakes) {
    throw new Error("Invalid rhythm mistake limit.");
  }
  const pattern = Array.from({ length: MUSIC.slots }, (_, i) => i < MUSIC.beats / MUSIC.loops ? 1 : 0);
  for (let i = pattern.length - 1; i > 0; i--) {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error("Invalid rhythm draw.");
    const j = Math.floor(roll * (i + 1));
    [pattern[i], pattern[j]] = [pattern[j], pattern[i]];
  }
  return { startedAt, pattern: Object.freeze(pattern),
    hits: Array(MUSIC.beats).fill(false), mistakes: 0, mistakeLimit };
}

export function beatTime(game, index) {
  const notes = game.pattern.flatMap((note, slot) => note ? [slot] : []);
  const slot = Math.floor(index / notes.length) * MUSIC.slots + notes[index % notes.length];
  return game.startedAt + MUSIC.leadMs + slot * MUSIC.intervalMs;
}

export function rhythmEnd(game) {
  return beatTime(game, MUSIC.beats - 1) + MUSIC.windowMs;
}

export function tapRhythm(game, now) {
  if (!Number.isFinite(now)) throw new Error("Invalid tap clock.");
  if (game.mistakes >= game.mistakeLimit || now > rhythmEnd(game)) return game;
  const slot = Math.round((now - game.startedAt - MUSIC.leadMs) / MUSIC.intervalMs);
  const notes = game.pattern.flatMap((note, slot) => note ? [slot] : []);
  const position = notes.indexOf(slot % MUSIC.slots);
  const index = Math.floor(slot / MUSIC.slots) * notes.length + position;
  if (position < 0 || index < 0 || index >= MUSIC.beats || game.hits[index] ||
      Math.abs(now - beatTime(game, index)) > MUSIC.windowMs) {
    return { ...game, mistakes: game.mistakes + 1 };
  }
  const hits = [...game.hits];
  hits[index] = true;
  return { ...game, hits };
}

export function beginBusking(state, cell, info, survival, data) {
  if (state.performancePending) throw new Error("A performance is already active.");
  if (cell.terrain !== "place") throw new Error("Street music is only available in settlement cells.");
  const performing = restSurvival({ ...state, fatigue: Math.min(100,
    state.fatigue + data.rules.performanceFatigue) }, { ...survival,
    rest_minutes: data.rules.performanceMinutes, rest_fatigue_recovery: 0 });
  const next = finishAction(state, performing, info, data, { survival, activity: "music" });
  return { ...next, performancePending: actionInterrupted(state, next) ? null : {
    maxRewardCents: Math.round(marketPrice(cell, 2, data, info).cents *
      (state.pressures ? 0.75 + sympathy(state) / 200 : 1)),
  } };
}

export function settleBusking(state, hits, mistakes = 0) {
  if (!state.performancePending) throw new Error("No active performance to settle.");
  if (!Number.isInteger(hits) || hits < 0 || hits > MUSIC.beats) throw new Error("Invalid rhythm score.");
  const mistakeLimit = musicMistakeLimit(state);
  if (!Number.isInteger(mistakes) || mistakes < 0 || mistakes > mistakeLimit) {
    throw new Error("Invalid rhythm mistake count.");
  }
  const reward = mistakes >= mistakeLimit ? 0
    : Math.round(state.performancePending.maxRewardCents * hits / MUSIC.beats);
  const next = reward > 0 ? changeReputation(state, 2) : state;
  return { ...next, walletCents: state.walletCents + reward, performancePending: null,
    performances: (state.performances ?? 0) + 1, lastEarningsCents: reward };
}
