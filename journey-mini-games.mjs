import { restSurvival } from "./survival.mjs";
import { finishAction, marketPrice, actionInterrupted } from "./economy.mjs";
import { changeReputation } from "./pressures.mjs";
import { outcomeReputation } from "./practice.mjs";
import { resolveResonance, resonanceGain } from "./arcane-resonance.mjs";
import * as harvest from "./minigames/harvest.mjs";
import * as workshop from "./minigames/workshop.mjs";
import * as sketch from "./minigames/sketch.mjs";
import * as market from "./minigames/market.mjs";
import * as bookshop from "./minigames/bookshop.mjs";
import * as deliveries from "./minigames/deliveries.mjs";
import * as petanque from "./minigames/petanque.mjs";
import * as lanterns from "./minigames/lanterns.mjs";
import * as lostFound from "./minigames/lost-found.mjs";

export const JOURNEY_MINI_GAMES = Object.freeze([
  "harvest", "workshop", "sketch", "market", "bookshop",
  "deliveries", "petanque", "lanterns", "lost-found",
]);

const GAMES = Object.freeze({
  harvest, workshop, sketch, market, bookshop, deliveries, petanque, lanterns,
  "lost-found": lostFound,
});

const ACTIVITIES = Object.freeze({
  harvest: { minutes: 30, fatigue: 5, sheltered: false },
  workshop: { minutes: 30, fatigue: 4, sheltered: true },
  sketch: { minutes: 25, fatigue: 3, sheltered: false },
  market: { minutes: 45, fatigue: 4, sheltered: true },
  bookshop: { minutes: 45, fatigue: 3, sheltered: true },
  deliveries: { minutes: 30, fatigue: 6, sheltered: false },
  petanque: { minutes: 30, fatigue: 5, sheltered: false },
  lanterns: { minutes: 20, fatigue: 3, sheltered: true },
  "lost-found": { minutes: 20, fatigue: 2, sheltered: true },
});

const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const bounded = (value, min, max) => typeof value === "number" &&
  Number.isFinite(value) && value >= min && value <= max;
const exactKeys = (value, expected) => record(value) &&
  Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).sort().join(",") === [...expected].sort().join(",");

function skillLevel(state, game) {
  const skills = state.journeyMiniGameSkills ?? {};
  if (!record(skills) || Object.keys(skills).some(name => !JOURNEY_MINI_GAMES.includes(name))) {
    throw new Error("Invalid journey mini-game skills.");
  }
  const xp = skills[game] ?? 0;
  if (!integer(xp, 0, 300)) throw new Error("Invalid journey mini-game experience.");
  return Math.min(4, Math.floor(xp / 60));
}

function activityTerms(state, game, cell, info, data) {
  if (!Object.hasOwn(GAMES, game)) throw new RangeError(`Unknown journey mini-game: ${game}`);
  if (!journeyMiniGameAvailable(game, cell)) return null;
  const activity = ACTIVITIES[game];
  const difficulty = journeyMiniGameDifficulty(state, game);
  const resonance = resolveResonance(game === "lost-found" ? "lostfound" : game, {
    journeyCard: state.journeyCard ?? null,
    birthCard: state.birthCard ?? null,
    dailyCard: state.dailyCard ?? null,
  });
  const baseRewardCents = Math.round(
    marketPrice(cell, activity.minutes / 30, data, info).cents * difficulty.rewardMultiplier,
  );
  if (!integer(baseRewardCents, 0, Number.MAX_SAFE_INTEGER)) {
    throw new Error("Invalid mini-game reward.");
  }
  const isHarvest = game === "harvest";
  const pointRewardCents = isHarvest ? Math.floor(baseRewardCents / 20) : null;
  return {
    game, level: difficulty.level ?? skillLevel(state, game),
    minutes: activity.minutes, fatigue: activity.fatigue,
    sheltered: activity.sheltered, rewardMultiplier: difficulty.rewardMultiplier,
    baseMaxRewardCents: isHarvest ? null : baseRewardCents,
    maxRewardCents: isHarvest ? null : resonanceGain(baseRewardCents, resonance),
    pointRewardCents, referencePoints: isHarvest ? 20 : null,
    resonance,
  };
}

export function journeyMiniGameOffer(state, game, cell, info, data) {
  if (!record(state)) throw new TypeError("Invalid journey mini-game state.");
  if (state.ended || state.miniGamePending || state.cafePending ||
      state.performancePending || state.theftPending || state.events?.pending ||
      state.equipment?.dogEncounter === "pending") return null;
  return activityTerms(state, game, cell, info, data);
}

export function validateJourneyMiniGames(state) {
  const fail = message => { throw new Error(message); };
  if (!record(state)) fail("Invalid journey mini-game save.");

  if (state.journeyMiniGameSkills !== undefined) {
    const skills = state.journeyMiniGameSkills;
    if (!record(skills) || Object.getPrototypeOf(skills) !== Object.prototype ||
        Object.keys(skills).some(game => !JOURNEY_MINI_GAMES.includes(game)) ||
        Object.values(skills).some(xp => !integer(xp, 0, 300))) {
      fail("Invalid journey mini-game skills.");
    }
  }
  if (state.journeyMiniGamesPlayed !== undefined &&
      !integer(state.journeyMiniGamesPlayed, 0, Number.MAX_SAFE_INTEGER)) {
    fail("Invalid journey mini-game count.");
  }
  if (state.miniGamePending !== undefined && state.miniGamePending !== null) {
    fail("Active journey mini-games cannot be saved.");
  }
  if (state.lastJourneyMiniGame !== undefined) {
    const last = state.lastJourneyMiniGame;
    if (!exactKeys(last, ["game", "completed", "cancelled", "score", "maxScore",
      "rewardCents", "level", "xpGained", "levelUps"]) ||
        !JOURNEY_MINI_GAMES.includes(last.game) ||
        typeof last.completed !== "boolean" || typeof last.cancelled !== "boolean" ||
        (last.completed && last.cancelled) ||
        !bounded(last.maxScore, 0, 10000) || !bounded(last.score, 0, last.maxScore) ||
        (last.maxScore === 0 && (!last.cancelled || last.score !== 0)) ||
        !integer(last.rewardCents, 0, Number.MAX_SAFE_INTEGER) ||
        !integer(last.level, 0, 4) || !integer(last.xpGained, 0, 60) ||
        !integer(last.levelUps, 0, 4) ||
        (!last.completed && (last.score !== 0 || last.rewardCents !== 0 ||
          last.xpGained !== 0 || last.levelUps !== 0))) {
      fail("Invalid last journey mini-game result.");
    }
  }
  return state;
}

export function abandonJourneyMiniGame(state) {
  if (!record(state)) throw new TypeError("Invalid journey state.");
  return { ...state, miniGamePending: null };
}

export function journeyMiniGameDifficulty(state, game) {
  if (!Object.hasOwn(GAMES, game)) throw new RangeError(`Unknown journey mini-game: ${game}`);
  return GAMES[game].difficulty(skillLevel(state, game));
}

export function journeyMiniGameAvailable(game, cell) {
  if (!Object.hasOwn(GAMES, game)) return false;
  return GAMES[game].available(cell);
}

export function beginJourneyMiniGame(state, game, context) {
  if (!record(state) || !record(context) || !Object.hasOwn(GAMES, game)) {
    throw new TypeError("Invalid journey mini-game context.");
  }
  const { cell, info, survival, data } = context;
  if (state.ended) throw new Error("This journey has ended.");
  if (state.miniGamePending || state.cafePending || state.performancePending || state.theftPending ||
      state.events?.pending || state.equipment?.dogEncounter === "pending") {
    throw new Error("Another journey activity is already active.");
  }
  const activity = ACTIVITIES[game];
  const offer = activityTerms(state, game, cell, info, data);
  if (!offer) throw new Error("This game is not available here.");

  const rested = restSurvival({
    ...state,
    lastExpenseCents: 0,
    fatigue: Math.min(100, state.fatigue + activity.fatigue),
  }, { ...survival, rest_minutes: activity.minutes, rest_fatigue_recovery: 0 });
  const next = finishAction(state, rested, info, data, {
    survival, sheltered: activity.sheltered, activity: `journey-${game}`,
  });
  if (actionInterrupted(state, next)) return { ...next, miniGamePending: null };

  return {
    ...next,
    miniGamePending: {
      game, level: offer.level,
      minutes: activity.minutes, startedAt: next.elapsedMinutes,
      maxRewardCents: offer.baseMaxRewardCents,
      pointRewardCents: offer.pointRewardCents,
      rewardMultiplier: GAMES[game].difficulty(offer.level).rewardMultiplier,
      resonance: offer.resonance,
    },
  };
}

export function settleJourneyMiniGame(state, game, result) {
  const pending = state?.miniGamePending;
  if (!pending || pending.game !== game || !Object.hasOwn(GAMES, game)) {
    throw new Error("No matching journey mini-game is active.");
  }
  const currentLevel = skillLevel(state, game);
  const rules = GAMES[game].difficulty(pending.level);
  const harvest = game === "harvest";
  if (pending.level !== currentLevel || pending.minutes !== ACTIVITIES[game].minutes ||
      typeof pending.startedAt !== "number" || !Number.isFinite(pending.startedAt) ||
      pending.startedAt < 0 || pending.startedAt !== state.elapsedMinutes ||
      (harvest
        ? pending.maxRewardCents !== null ||
          !integer(pending.pointRewardCents, 0, Number.MAX_SAFE_INTEGER)
        : !integer(pending.maxRewardCents, 0, Number.MAX_SAFE_INTEGER) ||
          pending.pointRewardCents !== null) ||
      pending.rewardMultiplier !== rules.rewardMultiplier || typeof pending.resonance !== "boolean") {
    throw new Error("Invalid pending journey mini-game.");
  }
  if (!record(result) || typeof result.completed !== "boolean" || typeof result.cancelled !== "boolean" ||
      !bounded(result.score, 0, 10000) || !bounded(result.maxScore, 0, 10000) ||
      (result.maxScore === 0 && (!result.cancelled || result.score !== 0)) ||
      result.score > result.maxScore || (result.cancelled && result.completed)) {
    throw new Error("Invalid journey mini-game result.");
  }
  if (!integer(state.walletCents, 0, Number.MAX_SAFE_INTEGER) ||
      !integer(state.journeyMiniGamesPlayed ?? 0, 0, Number.MAX_SAFE_INTEGER - 1)) {
    throw new Error("Invalid journey mini-game settlement state.");
  }

  const completed = result.completed && !result.cancelled;
  const score = completed ? result.score : 0;
  const earnedCents = !completed ? 0 : harvest
    ? resonanceGain(score * pending.pointRewardCents, pending.resonance)
    : resonanceGain(Math.round(pending.maxRewardCents * score / result.maxScore), pending.resonance);
  let next = state;
  const reputation = completed ? outcomeReputation(score, result.maxScore) : 0;
  if (reputation) next = changeReputation(next, reputation);
  const oldXp = next.journeyMiniGameSkills?.[game] ?? 0;
  const gainedXp = completed ? Math.ceil(60 * score / result.maxScore) : 0;
  const skills = { ...(next.journeyMiniGameSkills ?? {}),
    [game]: Math.min(300, oldXp + gainedXp) };
  const oldLevel = Math.min(4, Math.floor(oldXp / 60));
  const newLevel = Math.min(4, Math.floor(skills[game] / 60));
  const walletCents = state.walletCents + earnedCents;
  if (!Number.isSafeInteger(walletCents)) throw new Error("Journey mini-game reward exceeds currency precision.");

  return {
    ...next,
    miniGamePending: null,
    journeyMiniGameSkills: skills,
    journeyMiniGamesPlayed: (state.journeyMiniGamesPlayed ?? 0) + 1,
    walletCents,
    lastJourneyMiniGame: {
      game, completed, cancelled: result.cancelled, score, maxScore: result.maxScore,
      rewardCents: earnedCents, level: pending.level, xpGained: gainedXp,
      levelUps: Math.max(0, newLevel - oldLevel),
    },
  };
}
