import { journeyDate } from "./travel.mjs";
import { skyState } from "./sky.mjs";
import { eatSurvival, sleepSurvival, restSurvival } from "./survival.mjs";

export function validateEconomy(data) {
  const positive = n => Number.isFinite(n) && n > 0;
  const source = url => typeof url === "string" && url.startsWith("https://");
  if (data?.version !== 1 || !Number.isSafeInteger(data.pricing?.referenceCents) ||
      !positive(data.pricing.referenceCents) || !positive(data.pricing.referenceDollarPrice) ||
      !source(data.pricing.source) || !data.pricing.markets ||
      Object.values(data.pricing.markets).some(m => !m.name || !positive(m.dollarPrice)) ||
      !data.rules || !["lodgingMealUnits", "outdoorFatiguePerNightHour",
        "performanceMinutes", "performanceFatigue"].every(k => positive(data.rules[k])) ||
      !["outdoorSleepRecoveryFactor", "nightRestRecoveryFactor"].every(k =>
        Number.isFinite(data.rules[k]) && data.rules[k] >= 0 && data.rules[k] <= 1) ||
      !Array.isArray(data.tarot) || data.tarot.length !== 22 ||
      new Set(data.tarot.map(c => c.id)).size !== 22 ||
      data.tarot.some(c => !c.id || !c.fr || !c.en || !positive(c.mealUnits) ||
        !Number.isFinite(c.nightRisk) || c.nightRisk < 0 || c.nightRisk > 1) ||
      !Array.isArray(data.meals) || !data.meals.length ||
      new Set(data.meals.map(m => m.id)).size !== data.meals.length ||
      data.meals.some(m => !m.id || !m.name || !m.fr || !m.en || !m.publisher ||
        !source(m.source) || !positive(m.reserveKcal) || !positive(m.mealUnits) ||
        !Array.isArray(m.bounds) || m.bounds.length !== 4 || !m.bounds.every(Number.isFinite) ||
        m.bounds[0] >= m.bounds[2] || m.bounds[1] >= m.bounds[3])) {
    throw new Error("Invalid economy database.");
  }
  return data;
}

export function drawTarot(data, random = Math.random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Invalid tarot draw.");
  return data.tarot[Math.floor(value * data.tarot.length)].id;
}

export function startEconomy(state, data, random = Math.random) {
  const birthCard = drawTarot(data, random);
  const card = data.tarot.find(c => c.id === birthCard);
  return { ...state, birthCard, dailyCard: birthCard,
    tarotDay: journeyDate(state).toISOString().slice(0, 10),
    walletCents: Math.round(card.mealUnits * data.pricing.referenceCents),
    outdoorNightMinutes: 0, lastExpenseCents: 0 };
}

export function localMeals(info, data) {
  return data.meals.filter(({ bounds: [west, south, east, north] }) =>
    info.longitude >= west && info.longitude <= east && info.latitude >= south && info.latitude <= north);
}

export function marketPrice(cell, units, data) {
  const codes = [...new Set(cell.countryCodes ?? [])];
  const market = codes.length === 1 ? data.pricing.markets[codes[0]] : null;
  const factor = market ? market.dollarPrice / data.pricing.referenceDollarPrice : 1;
  return { cents: Math.round(data.pricing.referenceCents * factor * units),
    reference: !market, market: market?.name ?? null };
}

export function shelters(cell) {
  return (cell.pois ?? []).filter(p => {
    const tags = p.tags ?? {};
    if (["private", "no"].includes(tags.access) ||
        (tags.disused && tags.disused !== "no") || (tags.abandoned && tags.abandoned !== "no")) return false;
    return ["hotel", "hostel", "guest_house", "motel", "alpine_hut"].includes(tags.tourism) ||
      (["shelter", "wilderness_hut"].includes(tags.amenity ?? tags.tourism) && tags.fee === "no");
  }).map(p => ({ ...p, free: p.tags.fee === "no" }));
}

export function nightMinutes(state, minutes, info) {
  let night = 0;
  for (let offset = 0; offset < minutes; offset += 15) {
    const length = Math.min(15, minutes - offset);
    if (skyState(new Date(journeyDate(state).getTime() + (offset + length / 2) * 60000),
      info.latitude, info.longitude).phase === "night") night += length;
  }
  return night;
}

export function finishAction(previous, next, info, data, { sheltered = false, random = Math.random } = {}) {
  const minutes = next.elapsedMinutes - previous.elapsedMinutes;
  const exposed = sheltered ? 0 : nightMinutes(previous, minutes, info);
  const fatigue = Math.min(100, next.fatigue + exposed / 60 * data.rules.outdoorFatiguePerNightHour);
  const day = journeyDate(next).toISOString().slice(0, 10);
  return { ...next, fatigue, ended: next.ended ?? (fatigue >= 100 ? "fatigue" : null),
    outdoorNightMinutes: previous.outdoorNightMinutes + exposed,
    dailyCard: day === previous.tarotDay ? previous.dailyCard : drawTarot(data, random),
    tarotDay: day };
}

function charge(state, cents) {
  if (state.ended) throw new Error("This journey has ended.");
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Invalid price.");
  if (state.walletCents < cents) throw new Error("Insufficient funds.");
  return { ...state, walletCents: state.walletCents - cents, lastExpenseCents: cents };
}

export function buyMeal(state, cell, info, mealId, survival, data) {
  const meal = localMeals(info, data).find(m => m.id === mealId);
  if (!meal) throw new Error("No sourced local meal available.");
  const paid = charge(state, marketPrice(cell, meal.mealUnits, data).cents);
  const next = eatSurvival(paid, cell, { ...survival, meal_kcal: meal.reserveKcal });
  return finishAction(state, next, info, data, { sheltered: true });
}

export function sleepEconomy(state, cell, info, shelterId, survival, data) {
  const shelter = shelterId === null ? null : shelters(cell).find(s => s.osmId === shelterId);
  if (shelterId !== null && !shelter) throw new Error("Shelter is not available in the player's cell.");
  const cents = shelter && !shelter.free ? marketPrice(cell, data.rules.lodgingMealUnits, data).cents : 0;
  const paid = charge(state, cents);
  const config = shelter ? survival : { ...survival,
    sleep_fatigue_recovery_per_hour: 0,
    sleep_recovery_per_hour: survival.sleep_recovery_per_hour * data.rules.outdoorSleepRecoveryFactor };
  const next = sleepSurvival(paid, config);
  return finishAction(state, next, info, data, { sheltered: Boolean(shelter) });
}

export function restEconomy(state, info, survival, data) {
  const night = nightMinutes(state, survival.rest_minutes, info) / survival.rest_minutes;
  const next = restSurvival(state, { ...survival, rest_fatigue_recovery:
    survival.rest_fatigue_recovery * (1 - night * (1 - data.rules.nightRestRecoveryFactor)) });
  return finishAction(state, next, info, data);
}
