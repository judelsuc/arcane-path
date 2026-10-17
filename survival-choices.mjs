import { restSurvival, sleepSurvival } from "./survival.mjs";
import { finishAction, marketPrice, tarotEventChance, didFaint } from "./economy.mjs";

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
  const failure = roll < tarotEventChance(rule.failureChance, state, economy);
  let next = restSurvival(state, { ...survival,
    rest_minutes: rule.minutes, rest_fatigue_recovery: 0 });
  next = { ...next, fatigue: Math.min(100, next.fatigue + rule.fatigue) };
  next = finishAction(state, next, info, economy, { random, survival });
  let outcome = next.ended ? "exhausted" : didFaint(state, next) ? "fainted" : failure ? "nothing" : "food";
  let foodKcal = 0, moneyCents = 0, detentionMinutes = 0;
  if (!next.ended && outcome !== "fainted") {
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
      foodKcal = Math.min(rule.foodKcal, survival.reserve_kcal - next.reserveKcal);
      next = { ...next, reserveKcal: next.reserveKcal + foodKcal };
    }
  }
  return { ...next,
    choiceCounts: { ...state.choiceCounts, [kind]: (state.choiceCounts?.[kind] ?? 0) + 1 },
    lastSurvivalChoice: { kind, outcome, foodKcal, moneyCents, detentionMinutes,
      minutes: next.elapsedMinutes - state.elapsedMinutes },
  };
}
