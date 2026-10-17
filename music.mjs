import { restSurvival } from "./survival.mjs";
import { finishAction, marketPrice, didFaint } from "./economy.mjs";

export const MUSIC = Object.freeze({
  beats: 24, loops: 3, slots: 12,
  intervalMs: 400, leadMs: 1500, windowMs: 150,
});

export function rhythm(startedAt, random = Math.random) {
  if (!Number.isFinite(startedAt)) throw new Error("Invalid performance clock.");
  const pattern = Array.from({ length: MUSIC.slots }, (_, i) => i < MUSIC.beats / MUSIC.loops ? 1 : 0);
  for (let i = pattern.length - 1; i > 0; i--) {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error("Invalid rhythm draw.");
    const j = Math.floor(roll * (i + 1));
    [pattern[i], pattern[j]] = [pattern[j], pattern[i]];
  }
  return { startedAt, pattern: Object.freeze(pattern),
    hits: Array(MUSIC.beats).fill(false) };
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
  const slot = Math.round((now - game.startedAt - MUSIC.leadMs) / MUSIC.intervalMs);
  const notes = game.pattern.flatMap((note, slot) => note ? [slot] : []);
  const position = notes.indexOf(slot % MUSIC.slots);
  const index = Math.floor(slot / MUSIC.slots) * notes.length + position;
  if (position < 0) return game;
  if (index < 0 || index >= MUSIC.beats || game.hits[index] ||
      Math.abs(now - beatTime(game, index)) > MUSIC.windowMs) return game;
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
  const next = finishAction(state, performing, info, data, { survival });
  return { ...next, performancePending: next.ended || didFaint(state, next) ? null : {
    maxRewardCents: marketPrice(cell, 2, data, info).cents,
  } };
}

export function settleBusking(state, hits) {
  if (!state.performancePending) throw new Error("No active performance to settle.");
  if (!Number.isInteger(hits) || hits < 0 || hits > MUSIC.beats) throw new Error("Invalid rhythm score.");
  const reward = Math.round(state.performancePending.maxRewardCents * hits / MUSIC.beats);
  return { ...state, walletCents: state.walletCents + reward, performancePending: null,
    performances: (state.performances ?? 0) + 1, lastEarningsCents: reward };
}
