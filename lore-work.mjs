import * as bookshop from "./minigames/bookshop.mjs";
import { JOURNEY_MINI_GAMES, journeyMiniGameOffer, beginJourneyMiniGame, settleJourneyMiniGame } from "./journey-mini-games.mjs";
import { actionInterrupted } from "./economy.mjs";
import * as harvest from "./minigames/harvest.mjs";
import { resonanceGain } from "./arcane-resonance.mjs";

function randomFor(seed) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => { hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0; return hash / 2 ** 32; };
}

function harvestMaximum(state, offer, key) {
  const game = harvest.createGame({ level: offer.level, now: 0,
    random: randomFor(`${state.serverJourney?.seed ?? state.startedAt}:${key}`),
    birthCard: state.birthCard, dailyCard: state.dailyCard });
  const rules = harvest.difficulty(offer.level);
  let scores = new Map([[0, 0]]), best = 0;
  for (let index = 0; index <= Math.floor(rules.durationMs / rules.fastFallMs) && scores.size; index++) {
    const bunch = harvest.bunchAt(game, index), next = new Map();
    const target = Math.max((bunch.colour + 0.000001) / rules.baskets,
      Math.min((bunch.colour + 0.999999) / rules.baskets, bunch.x));
    const catchMs = Math.max(rules.fastFallMs, Math.abs(target - bunch.x) / rules.steerPerSecond * 1000);
    for (const [score, time] of scores) {
      best = Math.max(best, score);
      const choices = bunch.rotten ? [[1, rules.squashMs], [-1, rules.fastFallMs]]
        : [[1, catchMs], [Math.floor(bunch.x * rules.baskets) === bunch.colour ? 1 : 0, rules.fastFallMs]];
      for (const [gain, duration] of choices) {
        const total = time + duration, value = Math.max(0, score + gain);
        if (total <= rules.durationMs && total < (next.get(value) ?? Infinity)) next.set(value, total);
      }
    }
    scores = next;
  }
  return resonanceGain(best * offer.pointRewardCents, offer.resonance);
}

export function earningOffers(state, cell, info, economy) {
  const day = new Date(state.startedAt + state.elapsedMinutes * 60000).toISOString().slice(0, 10);
  if (state.lore.work) return [];
  return JOURNEY_MINI_GAMES.flatMap(game => {
    const key = JSON.stringify([state.col, state.row, day, game,
      state.journeyMiniGamesPlayed ?? 0, state.lore.workCredits?.length ?? 0]);
    if ((state.lore.usedWork ?? []).includes(key)) return [];
    const offer = journeyMiniGameOffer(state, game, cell, info, economy);
    if (!offer) return [];
    const maxRewardCents = Math.min(2000, game === "harvest" ? harvestMaximum(state, offer, key) : offer.maxRewardCents);
    return maxRewardCents > 0 ? [{ ...offer, id: game, key, entryCents: 0, maxRewardCents }] : [];
  });
}

export function workOffer(state, cell, info, economy) {
  const offer = earningOffers(state, cell, info, economy).find(offer => offer.id === "bookshop");
  return offer ? { ...offer, ...journeyMiniGameOffer(state, "bookshop", cell, info, economy) } : null;
}

function replay(state, nowMillis) {
  const session = state.lore.work;
  if (!session || !Array.isArray(session.moves) || session.moves.length > 150 ||
      !Number.isFinite(session.startedReal) || !Number.isFinite(nowMillis)) throw new Error("Invalid work session.");
  let game = bookshop.createGame({ level: session.level, language: session.language,
    random: randomFor(session.seed), now: session.startedReal,
    birthCard: session.birthCard, dailyCard: session.dailyCard });
  for (const move of session.moves) game = bookshop.input(game, move.action, move.now);
  return bookshop.advance(game, Math.max(game.lastNow, nowMillis));
}

export function workView(state, nowMillis) {
  if (!state.lore.work) return null;
  const game = replay(state, nowMillis);
  return { status: game.status, books: game.books.map(({ id, title, genre }) => ({ id, title, genre })),
    shelves: game.shelves, slots: game.slots, selected: game.selected, mistakes: game.mistakes,
    request: game.status === "requests" ? game.requests[game.requestIndex].text : null,
    deadline: game.deadline, feedback: game.feedback };
}

export function startWork(state, cell, info, survival, economy, language, nowMillis) {
  const offer = workOffer(state, cell, info, economy);
  if (!offer || !["fr", "en"].includes(language) || !Number.isFinite(nowMillis)) {
    throw new Error("No available bookshop work here.");
  }
  let next = beginJourneyMiniGame(state, "bookshop", { cell, info, survival, data: economy });
  if (actionInterrupted(state, next)) return next;
  const pending = next.miniGamePending;
  next = { ...next, miniGamePending: null, lore: { ...next.lore,
    usedWork: [...(next.lore.usedWork ?? []), offer.key],
    work: { key: offer.key, level: pending.level, pending, language,
      seed: `${state.serverJourney?.seed ?? state.startedAt}:${offer.key}`,
      birthCard: state.birthCard, dailyCard: state.dailyCard, startedReal: nowMillis, moves: [] },
  } };
  return next;
}

export function answerWork(state, action, nowMillis) {
  const work = state.lore.work;
  if (!work || work.moves.length >= 150 && action.type !== "cancel") {
    throw new Error("No active work session or move capacity reached; cancel to settle.");
  }
  const previous = replay(state, nowMillis);
  if (action.type === "select" && !previous.books.some(book => book.id === action.bookId) ||
      action.type === "place" && (action.shelf < 0 || action.shelf >= previous.shelves.length ||
        action.slot < 0 || action.slot >= previous.config.slots)) throw new Error("Invalid current bookshop input.");
  const now = Math.max(previous.lastNow, nowMillis);
  const game = bookshop.input(previous, action, now);
  const next = { ...state, lore: { ...state.lore, work: { ...work,
    moves: [...work.moves, { action, now }] } } };
  if (["sorting", "requests"].includes(game.status)) return next;
  const settled = settleJourneyMiniGame({ ...next, miniGamePending: work.pending }, "bookshop", bookshop.result(game));
  return { ...settled, lore: { ...settled.lore, work: null,
    earnedActivities: (settled.lore.earnedActivities ?? 0) + (game.status === "completed" ? 1 : 0) } };
}

export function magicWork(state, offer) {
  if (!offer) throw new Error("No available earning offer.");
  return { ...state, walletCents: state.walletCents + offer.maxRewardCents,
    lore: { ...state.lore, usedWork: [...(state.lore.usedWork ?? []), offer.key],
      earnedActivities: (state.lore.earnedActivities ?? 0) + 1,
      workCredits: [...(state.lore.workCredits ?? []),
        { observedMinutes: state.elapsedMinutes, cents: offer.maxRewardCents, magical: true, game: offer.id }] } };
}
