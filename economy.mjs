import { journeyDate } from "./travel.mjs";
import { skyState } from "./sky.mjs";
import { eatSurvival, sleepSurvival, restSurvival, faintSurvival, characterProfile, canEat } from "./survival.mjs";
import { applyWeatherExposure } from "./weather-effects.mjs";
import { advancePressures, didPlace, washingAvailable, refreshPressureTarot } from "./pressures.mjs";
import { tarotEventChance } from "./tarot-effects.mjs";
export { tarotEventChance } from "./tarot-effects.mjs";

export function validateEconomy(data) {
  const positive = n => Number.isFinite(n) && n > 0;
  const source = url => typeof url === "string" && url.startsWith("https://");
  if (data?.version !== 1 || (data.restRuleVersion !== undefined && data.restRuleVersion !== 1) ||
      !Number.isSafeInteger(data.pricing?.referenceCents) ||
      !positive(data.pricing.referenceCents) || !positive(data.pricing.referenceDollarPrice) ||
      !source(data.pricing.source) || !data.pricing.markets ||
      Object.values(data.pricing.markets).some(m => !m.name || !positive(m.dollarPrice)) ||
      (data.pricing.fallback !== undefined && (!data.pricing.fallback ||
        data.pricing.fallback.method !== "european-national-arithmetic-mean" ||
        !positive(data.pricing.fallback.dollarPrice) ||
        !Array.isArray(data.pricing.fallback.countries) || !data.pricing.fallback.countries.length ||
        new Set(data.pricing.fallback.countries).size !== data.pricing.fallback.countries.length ||
        data.pricing.fallback.countries.some(code => !data.pricing.markets[code]) ||
        Math.abs(data.pricing.fallback.dollarPrice -
          data.pricing.fallback.countries.reduce((sum, code) =>
            sum + data.pricing.markets[code].dollarPrice, 0) / data.pricing.fallback.countries.length) > 1e-9)) ||
      !data.rules || !["lodgingMealUnits", "outdoorFatiguePerNightHour",
        "performanceMinutes", "performanceFatigue"].every(k => positive(data.rules[k])) ||
      !["outdoorSleepRecoveryFactor", "nightRestRecoveryFactor"].every(k =>
        Number.isFinite(data.rules[k]) && data.rules[k] >= 0 && data.rules[k] <= 1) ||
      !Array.isArray(data.tarot) || data.tarot.length !== 22 ||
      new Set(data.tarot.map(c => c.id)).size !== 22 ||
      data.tarot.some(c => !c.id || !c.fr || !c.en || !positive(c.mealUnits) ||
        (c.attributes !== undefined && (!c.attributes ||
          Object.keys(c.attributes).sort().join() !== "endurance,pace,strength" ||
          Object.values(c.attributes).some(v => !Number.isInteger(v) || v < 1 || v > 5))) ||
        !Number.isFinite(c.nightRisk) || c.nightRisk < 0 || c.nightRisk > 1) ||
      !Array.isArray(data.meals) || !data.meals.length ||
      new Set(data.meals.map(m => m.id)).size !== data.meals.length ||
      data.meals.some(m => !m.id || !m.name || !m.fr || !m.en || !m.publisher ||
        !source(m.source) || !positive(m.reserveKcal) || !positive(m.mealUnits) ||
        !Array.isArray(m.bounds) || m.bounds.length !== 4 || !m.bounds.every(Number.isFinite) ||
        m.bounds[0] >= m.bounds[2] || m.bounds[1] >= m.bounds[3] ||
        (m.scope !== undefined && (!["regional", "national"].includes(m.scope) ||
          typeof m.area !== "string" || !m.area.trim() ||
          !Array.isArray(m.countries) || !m.countries.length ||
          new Set(m.countries).size !== m.countries.length ||
          m.countries.some(code => typeof code !== "string" || !/^[A-Z]{2}$/.test(code)))))) {
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
    dailyTarotSeenDay: journeyDate(state).toISOString().slice(0, 10),
    walletCents: Math.round(card.mealUnits * data.pricing.referenceCents),
    outdoorNightMinutes: 0, lastExpenseCents: 0 };
}

export function applyBirthTarot(state, data) {
  const card = data.tarot.find(c => c.id === state.birthCard);
  if (!card?.attributes) throw new Error("Starting tarot attributes are missing.");
  return { ...state, profileId: "tarot", character: characterProfile(card.attributes) };
}

export function dailyTarotPending(state) {
  return Boolean(state && !state.ended && state.dailyTarotSeenDay !== undefined &&
    state.dailyTarotSeenDay !== state.tarotDay);
}

export function acknowledgeDailyTarot(state) {
  if (!dailyTarotPending(state)) throw new Error("No daily tarot reveal is pending.");
  return { ...state, dailyTarotSeenDay: state.tarotDay };
}

export function localMeals(info, data, countryCodes = []) {
  const countries = [...new Set(countryCodes)];
  return data.meals.filter(({ bounds: [west, south, east, north], countries: allowed, scope }) => {
    if (scope && (countries.length !== 1 || !allowed.includes(countries[0]))) return false;
    return info.longitude >= west && info.longitude <= east && info.latitude >= south && info.latitude <= north;
  }).sort((a, b) => Number(a.scope === "national") - Number(b.scope === "national"));
}

function usablePoi({ tags = {} }) {
  return !["private", "no"].includes(tags.access) &&
    (!tags.disused || tags.disused === "no") && (!tags.abandoned || tags.abandoned === "no");
}

export function mealOptions(cell, info, data) {
  if (!canEat(cell) || cell.unavailable) return [];
  const basic = { id: "basic-meal", kind: "basic", mealUnits: 1, reserveKcal: 900 };
  const restaurants = [...new Map((cell.pois ?? []).filter(p => usablePoi(p) &&
    /^(node|way|relation)\/\d+$/.test(p.osmId) &&
    ["restaurant", "fast_food", "cafe", "food_court"].includes(p.tags?.amenity))
    .map(p => [p.osmId, p])).values()];
  return [basic, ...localMeals(info, data, cell.countryCodes).map(meal => ({ ...meal, kind: "specialty" })),
    ...restaurants.map(venue => ({ ...basic, id: `basic-meal@${venue.osmId}`, kind: "restaurant", venue }))];
}

export function marketPrice(cell, units, data, info) {
  if (!Number.isFinite(units) || units <= 0) throw new Error("Invalid price units.");
  const codes = [...new Set(cell.countryCodes ?? [])];
  const market = codes.length === 1 ? data.pricing.markets[codes[0]] : null;
  let variation = 0;
  if (!market && data.pricing.fallback) {
    if (!Number.isFinite(info?.latitude) || !Number.isFinite(info?.longitude)) {
      throw new Error("Cell coordinates are required for estimated pricing.");
    }
    const identity = `${info.latitude.toFixed(6)},${info.longitude.toFixed(6)}`;
    let hash = 2166136261;
    for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    variation = (hash % 2001 - 1000) / 10000;
  }
  const base = market?.dollarPrice ?? data.pricing.fallback?.dollarPrice ?? data.pricing.referenceDollarPrice;
  const factor = base / data.pricing.referenceDollarPrice * (1 + variation);
  return { cents: Math.round(data.pricing.referenceCents * factor * units),
    reference: !market, market: market?.name ?? null, variation,
    estimated: !market && Boolean(data.pricing.fallback) };
}

export function mealOffers(state, cell, info, data) {
  const meals = mealOptions(cell, info, data);
  if (!meals.length) return [];
  const day = journeyDate(state).toISOString().slice(0, 10);
  const baseCents = marketPrice(cell, 1, data, info).cents;
  return meals.map(meal => {
    const identity = JSON.stringify([state.startedAt, state.col, state.row, day, meal.id]);
    let hash = 2166136261;
    for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    hash = Math.imul(hash ^ hash >>> 16, 0x85ebca6b);
    hash = Math.imul(hash ^ hash >>> 13, 0xc2b2ae35);
    const factor = 0.7 + ((hash ^ hash >>> 16) >>> 0) / 2 ** 32 * 0.8;
    const cents = marketPrice(cell, meal.mealUnits * factor, data, info).cents;
    return { ...meal, cents, reserveKcal: Math.round(900 * cents / baseCents) };
  });
}

export function refreshPricing(savedEconomy, currentEconomy) {
  validateEconomy(currentEconomy);
  return validateEconomy({ ...structuredClone(savedEconomy), pricing: structuredClone(currentEconomy.pricing) });
}

export function refreshMeals(savedEconomy, currentEconomy) {
  validateEconomy(savedEconomy);
  validateEconomy(currentEconomy);
  const meals = new Map(savedEconomy.meals.map(meal => [meal.id, structuredClone(meal)]));
  for (const meal of currentEconomy.meals) {
    if (!meals.has(meal.id)) meals.set(meal.id, structuredClone(meal));
  }
  return validateEconomy({ ...structuredClone(savedEconomy), meals: [...meals.values()] });
}

export function refreshNightRest(savedEconomy, currentEconomy) {
  validateEconomy(savedEconomy);
  validateEconomy(currentEconomy);
  const updated = structuredClone(savedEconomy);
  if (updated.restRuleVersion === undefined && currentEconomy.restRuleVersion === 1) {
    updated.restRuleVersion = 1;
    updated.rules.nightRestRecoveryFactor = currentEconomy.rules.nightRestRecoveryFactor;
  }
  return validateEconomy(updated);
}

export function shelters(cell) {
  return (cell.pois ?? []).filter(p => usablePoi(p)).filter(p => {
    const tags = p.tags ?? {};
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

export function faintingRisk(state, info, data, sheltered = false) {
  return tarotEventChance(sheltered ? 0.05 : info.terrain === "place" ? 0.3 : 0.15, state, data);
}

function collapseDraw(state, label) {
  const identity = JSON.stringify(["fainting-v1", state.serverJourney?.seed ?? state.startedAt,
    state.birthCard, state.faints ?? 0, state.col, state.row, state.elapsedMinutes, label]);
  let hash = 2166136261;
  for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash / 2 ** 32;
}

export function didFaint(previous, next) {
  return (next.faints ?? 0) > (previous.faints ?? 0);
}

export function actionInterrupted(previous, next) {
  return Boolean(next.ended || didFaint(previous, next) || didPlace(previous, next));
}

export function washEconomy(state, cell, info, survival, data) {
  if (!state.pressures || !washingAvailable(cell)) throw new Error("No washing facilities available here.");
  const cents = marketPrice(cell, 0.25, data, info).cents;
  const paid = charge(state, cents);
  const next = restSurvival(paid, { ...survival, rest_minutes: 20, rest_fatigue_recovery: 0 });
  return finishAction(state, next, info, data, { survival, activity: "wash" });
}

export function finishAction(previous, next, info, data,
  { sheltered = false, random = Math.random, survival, activity } = {}) {
  if (previous.ended) throw new Error("This journey has ended.");
  if (!sheltered) next = applyWeatherExposure(previous, next, info);
  if (next.reserveKcal <= 0) next = { ...next, ended: "hunger" };
  const minutes = next.elapsedMinutes - previous.elapsedMinutes;
  let exposed = sheltered ? 0 : nightMinutes(previous, minutes, info);
  const fatigue = Math.min(100, next.fatigue + exposed / 60 * data.rules.outdoorFatiguePerNightHour);
  next = { ...next, fatigue };
  const sleepy = next.ended === "sleep";
  if ((fatigue >= 100 || sleepy) && next.ended !== "hunger") {
    const startedMinutes = next.elapsedMinutes;
    const chance = faintingRisk(previous, info, data, sheltered);
    const robbed = collapseDraw(next, "robbery") < chance;
    const stolenCents = robbed
      ? Math.min(Math.floor(next.walletCents / 2),
        Math.ceil(next.walletCents * (0.25 + collapseDraw(next, "loss") * 0.25))) : 0;
    const unconscious = faintSurvival(next, survival);
    const recovered = sheltered ? unconscious : applyWeatherExposure(next, unconscious, info);
    if (!sheltered) exposed += nightMinutes(next, 8 * 60, info);
    next = { ...recovered, walletCents: next.walletCents - stolenCents,
      faints: (next.faints ?? 0) + 1,
      lastFaint: { startedMinutes, finishedMinutes: recovered.elapsedMinutes,
        ...(sleepy ? { reason: "sleep" } : {}),
        col: next.col, row: next.row, sheltered, chance, robbed, stolenCents,
        walletBeforeCents: next.walletCents } };
  }
  next = advancePressures(previous, next, info, { sheltered, survival, activity });
  const day = journeyDate(next).toISOString().slice(0, 10);
  return refreshPressureTarot({ ...next,
    outdoorNightMinutes: previous.outdoorNightMinutes + exposed,
    dailyCard: day === previous.tarotDay ? previous.dailyCard : drawTarot(data, random),
    dailyTarotSeenDay: previous.dailyTarotSeenDay ?? previous.tarotDay,
    tarotDay: day }, data);
}

export function validateFainting(state) {
  if (state.faints === undefined && state.lastFaint === undefined) return;
  const f = state.lastFaint;
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  if (!Number.isSafeInteger(state.faints) || state.faints < 1 ||
      !f || !Number.isFinite(f.startedMinutes) || f.startedMinutes < 0 ||
      !Number.isFinite(f.finishedMinutes) || f.finishedMinutes > state.elapsedMinutes ||
      Math.abs(f.finishedMinutes - f.startedMinutes - 480) > 1e-6 ||
      state.faints * 480 > state.elapsedMinutes + 1e-6 ||
      !Number.isSafeInteger(f.col) || Math.abs(Math.floor(f.col / 8)) > 1000 ||
      !Number.isSafeInteger(f.row) || Math.abs(Math.floor(f.row / 8)) > 1000 ||
      typeof f.sheltered !== "boolean" || typeof f.robbed !== "boolean" ||
      (f.reason !== undefined && f.reason !== "sleep") ||
      !Number.isFinite(f.chance) || f.chance <= 0 || f.chance > (f.sheltered ? 0.075 : 0.45) + 1e-9 ||
      !integer(f.walletBeforeCents) || !integer(f.stolenCents) ||
      (!f.robbed && f.stolenCents !== 0) ||
      (f.robbed && (f.stolenCents < Math.min(Math.floor(f.walletBeforeCents / 2),
        Math.ceil(f.walletBeforeCents / 4)) || f.stolenCents > Math.floor(f.walletBeforeCents / 2)))) {
    throw new Error("Invalid fainting history in journey save.");
  }
}

function charge(state, cents) {
  if (state.ended) throw new Error("This journey has ended.");
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Invalid price.");
  if (state.walletCents < cents) throw new Error("Insufficient funds.");
  return { ...state, walletCents: state.walletCents - cents, lastExpenseCents: cents };
}

export function buyMeal(state, cell, info, mealId, survival, data) {
  if (!canEat(cell)) throw new Error("Meals are only available in settlement cells.");
  const meal = mealOffers(state, cell, info, data).find(m => m.id === mealId);
  if (!meal) throw new Error("No local meal available in the player's cell.");
  const paid = charge(state, meal.cents);
  const next = eatSurvival(paid, cell, { ...survival, meal_kcal: meal.reserveKcal });
  return finishAction(state, next, info, data, { sheltered: true, survival });
}

export function sleepEconomy(state, cell, info, shelterId, survival, data) {
  const shelter = shelterId === null ? null : shelters(cell).find(s => s.osmId === shelterId);
  if (shelterId !== null && !shelter) throw new Error("Shelter is not available in the player's cell.");
  const cents = shelter && !shelter.free ? marketPrice(cell, data.rules.lodgingMealUnits, data, info).cents : 0;
  const paid = charge(state, cents);
  const config = shelter ? survival : { ...survival,
    sleep_fatigue_recovery_per_hour: 0,
    sleep_recovery_per_hour: survival.sleep_recovery_per_hour * data.rules.outdoorSleepRecoveryFactor };
  const next = sleepSurvival(paid, config);
  return finishAction(state, next, info, data, { sheltered: Boolean(shelter), survival });
}

export function restEffect(state, info, survival, data) {
  const night = nightMinutes(state, survival.rest_minutes, info) / survival.rest_minutes;
  const recovery = survival.rest_fatigue_recovery * (1 - night * (1 - data.rules.nightRestRecoveryFactor));
  const rested = { ...state, elapsedMinutes: state.elapsedMinutes + survival.rest_minutes,
    fatigue: Math.max(0, state.fatigue - recovery) };
  const exposed = applyWeatherExposure(state, rested, info);
  return { recovery, fatigue: Math.min(100, exposed.fatigue +
    night * survival.rest_minutes / 60 * data.rules.outdoorFatiguePerNightHour) };
}

export function restEconomy(state, info, survival, data) {
  const next = restSurvival(state, { ...survival,
    rest_fatigue_recovery: restEffect(state, info, survival, data).recovery });
  return finishAction(state, next, info, data, { survival });
}
