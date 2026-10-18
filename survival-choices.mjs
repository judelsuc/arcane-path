import { restSurvival, sleepSurvival } from "./survival.mjs";
import { finishAction, marketPrice, tarotEventChance, didFaint, actionInterrupted } from "./economy.mjs";
import { didPlace, socialFailureChance, changeReputation } from "./pressures.mjs";
import { resolveResonance } from "./arcane-resonance.mjs";

export const CHOICE_RULES = Object.freeze({
  forage: Object.freeze({ minutes: 30, fatigue: 5, failureChance: 0.35, foodKcal: 450 }),
  beg: Object.freeze({ minutes: 30, fatigue: 2, failureChance: 0.4, mealUnits: 0.5 }),
  steal: Object.freeze({ minutes: 10, fatigue: 3, failureChance: 0.35, foodKcal: 900, detentionHours: 6 }),
});
const FOOD_SHOPS = new Set([
  "supermarket", "convenience", "bakery", "greengrocer", "butcher",
  "deli", "cheese", "seafood", "food", "farm",
]);

export function hasFoodShop(cell) {
  return Boolean(!cell?.unavailable && cell?.pois?.some(({ tags }) => tags &&
    FOOD_SHOPS.has(tags.shop) && !["no", "private"].includes(tags.access) &&
    (!tags.disused || tags.disused === "no") &&
    (!tags.abandoned || tags.abandoned === "no")));
}

export function choiceAvailable(kind, cell) {
  if (!Object.hasOwn(CHOICE_RULES, kind)) throw new Error("Unknown survival choice.");
  if (!cell || cell.unavailable) return false;
  return kind === "forage" ? cell.terrain === "forest"
    : kind === "beg" ? cell.terrain === "place" : hasFoodShop(cell);
}

export function survivalChoice(state, kind, cell, info, survival, economy, random = Math.random) {
  if (state.ended) throw new Error("This journey has ended.");
  if (!choiceAvailable(kind, cell)) throw new Error("This action is not available in the current cell.");
  const roll = random();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error("Invalid survival choice draw.");
  const rule = CHOICE_RULES[kind];
  const baseFailure = tarotEventChance(rule.failureChance, state, economy);
  const failure = roll < (kind === "beg" ? socialFailureChance(baseFailure, state) : baseFailure);
  let next = restSurvival(state, { ...survival,
    rest_minutes: rule.minutes, rest_fatigue_recovery: 0 });
  next = { ...next, fatigue: Math.min(100, next.fatigue + rule.fatigue) };
  next = finishAction(state, next, info, economy, { random, survival, activity: kind });
  return resolveChoice(state, next, kind, failure, cell, info, survival, economy, random);
}

function resolveChoice(state, next, kind, failure, cell, info, survival, economy, random,
  bonus = false, resonance = false) {
  const rule = CHOICE_RULES[kind];
  let outcome = didPlace(state, next) ? "placed" : next.ended ? "exhausted"
    : didFaint(state, next) ? "fainted" : failure ? "nothing" : "food";
  let foodKcal = 0, moneyCents = 0, detentionMinutes = 0;
  if (!next.ended && !["fainted", "placed"].includes(outcome)) {
    if (kind === "steal" && failure) {
      const detained = sleepSurvival({ ...next, reserveKcal: survival.reserve_kcal },
        { ...survival, sleep_hours: rule.detentionHours });
      next = finishAction(next, detained, info, economy, { sheltered: true, random, survival });
      detentionMinutes = rule.detentionHours * 60;
      outcome = "detained";
    } else if (!failure && kind === "beg") {
      moneyCents = marketPrice(cell, rule.mealUnits, economy, info).cents;
      next = { ...next, walletCents: next.walletCents + moneyCents };
      outcome = "money";
    } else if (!failure) {
      const baseFoodReward = rule.foodKcal +
        (kind === "steal" && bonus ? Math.round(rule.foodKcal / 10) : 0);
      const foodReward = kind === "steal" && resonance
        ? Math.round(baseFoodReward * 1.1) : baseFoodReward;
      foodKcal = Math.min(foodReward, survival.reserve_kcal - next.reserveKcal);
      next = { ...next, reserveKcal: next.reserveKcal + foodKcal };
    }
  }
  return { ...next,
    choiceCounts: { ...state.choiceCounts, [kind]: (state.choiceCounts?.[kind] ?? 0) + 1 },
    lastSurvivalChoice: { kind, outcome, foodKcal, moneyCents, detentionMinutes,
      minutes: next.elapsedMinutes - state.elapsedMinutes },
  };
}

export function beginTheft(state, cell, info, survival, economy, random = Math.random, options = {}) {
  if (state.ended) throw new Error("This journey has ended.");
  if (state.theftPending || state.performancePending || state.cafePending || state.miniGamePending ||
      state.events?.pending || state.equipment?.dogEncounter === "pending") {
    throw new Error("A mini-game is already active.");
  }
  if (!choiceAvailable("steal", cell)) throw new Error("No accessible mapped food shop here.");
  const rule = CHOICE_RULES.steal;
  let next = restSurvival(state, { ...survival,
    rest_minutes: rule.minutes, rest_fatigue_recovery: 0 });
  next = { ...next, fatigue: Math.min(100, next.fatigue + rule.fatigue) };
  next = finishAction(state, next, info, economy, { random, survival, activity: "steal" });
  if (actionInterrupted(state, next)) {
    return resolveChoice(state, next, "steal", true, cell, info, survival, economy, random);
  }
  const resonance = resolveResonance("theft", {
    journeyCard: options.journeyCard ?? state.journeyCard ?? null,
    birthCard: options.birthCard ?? state.birthCard ?? null,
    dailyCard: options.dailyCard ?? state.dailyCard ?? null,
    resonance: options.resonance ?? false,
  });
  return { ...next, theftPending: { startedMinutes: state.elapsedMinutes, resonance } };
}

export function settleTheft(state, outcome, info, survival, economy, random = Math.random) {
  if (!state.theftPending) throw new Error("No active theft attempt.");
  if (!["success", "bonus", "caught", "cancelled"].includes(outcome) ||
      outcome === "bonus" && !state.theftPending.resonance) throw new Error("Invalid theft outcome.");
  const startedMinutes = state.theftPending.startedMinutes;
  let next = { ...state, theftPending: null };
  if (outcome === "cancelled") {
    return { ...next, choiceCounts: { ...state.choiceCounts, steal: (state.choiceCounts?.steal ?? 0) + 1 },
      lastSurvivalChoice: { kind: "steal", outcome: "nothing", foodKcal: 0,
        moneyCents: 0, detentionMinutes: 0, minutes: state.elapsedMinutes - startedMinutes } };
  }
  if (outcome === "caught") next = changeReputation(next, -5);
  return resolveChoice({ ...state, elapsedMinutes: startedMinutes }, next, "steal",
    outcome === "caught", null, info, survival, economy, random,
    outcome === "bonus", state.theftPending.resonance);
}
