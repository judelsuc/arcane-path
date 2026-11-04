import { discoveryIdentity, learnDiscovery } from "./discovery.mjs";
import { selectDiscoveryCandidate } from "./discovery-policy.mjs";

export const DREAM_VERSION = 1;
const history = state => state.lore.dreams ?? { version: DREAM_VERSION, episodes: [] };
const STRONG = new Set(["priestess", "hermit", "star", "moon", "judgement"]);
const GUIDING = new Set(["fool", "magician", "lovers", "chariot", "wheel", "hanged", "world"]);
const GROUNDED = new Set(["empress", "emperor", "hierophant", "justice", "strength", "nameless",
  "temperance", "devil", "tower", "sun"]);
const adjustment = card => {
  if (STRONG.has(card)) return 0.1;
  if (GUIDING.has(card)) return 0.05;
  if (GROUNDED.has(card)) return 0;
  throw new Error("Invalid dream tarot card.");
};

export function dreamChance(proximity, birthCard, dailyCard) {
  if (!Number.isFinite(proximity) || proximity < 0 || proximity > 1) {
    throw new Error("Invalid dream proximity.");
  }
  return Math.min(0.75, 0.15 + 0.35 * proximity + adjustment(birthCard) + adjustment(dailyCard));
}

export function validateDreams(state) {
  const dreams = state.lore && history(state);
  if (!dreams || dreams.version !== DREAM_VERSION || !Array.isArray(dreams.episodes) ||
      dreams.episodes.length > 1000) throw new Error("Invalid dream history.");
  let lastCheck = -Infinity, lastEnd = 0;
  for (const episode of dreams.episodes) {
    if (!episode || !Number.isSafeInteger(episode.id) || episode.id < 1 ||
        !Number.isFinite(episode.startedMinutes) || episode.startedMinutes < lastEnd ||
        episode.checkMinutes !== episode.startedMinutes + 60 ||
        episode.checkMinutes < lastCheck + 1440 ||
        !Number.isFinite(episode.wokeMinutes) || episode.wokeMinutes < episode.checkMinutes ||
        episode.wokeMinutes > state.elapsedMinutes ||
        !["clue", "miss", "empty", "interrupted", "unavailable"].includes(episode.outcome) ||
        (episode.clue === null ? episode.roll !== null || episode.chance !== null :
          typeof episode.clue !== "string" || !Number.isFinite(episode.roll) ||
          episode.roll < 0 || episode.roll >= 1 || !Number.isFinite(episode.chance) ||
          episode.chance < 0.15 || episode.chance > 0.75)) throw new Error("Invalid dream receipt.");
    adjustment(episode.birthCard);
    adjustment(episode.dailyCard);
    lastCheck = episode.checkMinutes;
    lastEnd = episode.wokeMinutes;
  }
  if (new Set(dreams.episodes.map(episode => episode.id)).size !== dreams.episodes.length) {
    throw new Error("Duplicate dream episode.");
  }
}

// Only the caller's deliberate, settled sleep action enters this channel.
export function settleDream(previous, next, candidates,
  { interrupted = false, random = Math.random, dailyCardAtCheck } = {}) {
  validateDreams(previous);
  const episodes = history(previous).episodes;
  const checkMinutes = previous.elapsedMinutes + 60;
  if (next.elapsedMinutes < checkMinutes ||
      episodes.length && checkMinutes < episodes.at(-1).checkMinutes + 1440) return next;
  if (episodes.length === 1000) throw new Error("Dream history capacity reached.");
  const checkDay = new Date(previous.startedAt + checkMinutes * 60000).toISOString().slice(0, 10);
  const dailyCard = dailyCardAtCheck ?? (checkDay === previous.tarotDay ? previous.dailyCard : next.dailyCard);
  const clue = selectDiscoveryCandidate(previous, candidates);
  const selected = clue && candidates.find(candidate => discoveryIdentity(candidate.clue) === discoveryIdentity(clue));
  const chance = clue ? dreamChance(selected.dreamProximity, previous.birthCard, dailyCard) : null;
  const roll = clue ? random() : null;
  if (roll !== null && (!Number.isFinite(roll) || roll < 0 || roll >= 1)) throw new Error("Invalid dream draw.");
  const outcome = interrupted || next.ended ? "interrupted" : !clue ? "empty" : roll < chance ? "clue" : "miss";
  let state = next;
  if (outcome === "clue") {
    state = learnDiscovery(next, [{ ...clue, channels: ["dream"], source: "sleep-dream",
      observedMinutes: next.elapsedMinutes, contentVersion: "authored-v1" }]);
  }
  const episode = { id: episodes.length + 1, startedMinutes: previous.elapsedMinutes, checkMinutes,
    wokeMinutes: next.elapsedMinutes, birthCard: previous.birthCard, dailyCard,
    clue: clue ? discoveryIdentity(clue) : null, chance, roll, outcome };
  state = { ...state, lore: { ...state.lore,
    dreams: { version: DREAM_VERSION, episodes: [...episodes, episode] } } };
  validateDreams(state);
  return state;
}

export function publicDreams(state) {
  validateDreams(state);
  return { version: DREAM_VERSION, episodes: history(state).episodes.map(
    ({ id, startedMinutes, wokeMinutes, birthCard, dailyCard, clue, outcome }) =>
      ({ id, startedMinutes, wokeMinutes, birthCard, dailyCard,
        clue: ["clue", "unavailable"].includes(outcome) ? clue : null, outcome })) };
}
