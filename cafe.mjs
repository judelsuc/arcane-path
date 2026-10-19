import { restSurvival } from "./survival.mjs";
import { finishAction, marketPrice, actionInterrupted } from "./economy.mjs";
import { practiceSkill, practice, outcomeReputation } from "./practice.mjs";
import { changeReputation, sympathy } from "./pressures.mjs";
import { resolveResonance, resonanceGain } from "./arcane-resonance.mjs";

export const CAFE = Object.freeze({ minutes: 45, fatigue: 6, mealKcal: 600,
  ingredients: Object.freeze(["coffee", "tea", "water", "bread", "cake"]) });

export function cafeVenues(cell) {
  if (!cell || cell.unavailable) return [];
  return [...new Map((cell.pois ?? []).filter(p =>
    /^(node|way|relation)\/\d+$/.test(p.osmId) &&
    ["cafe", "restaurant"].includes(p.tags?.amenity) &&
    !["private", "no"].includes(p.tags.access) &&
    (!p.tags.disused || p.tags.disused === "no") &&
    (!p.tags.abandoned || p.tags.abandoned === "no"))
    .map(p => [p.osmId, p])).values()].sort((a, b) => a.osmId.localeCompare(b.osmId));
}

export function cafeDifficulty(state) {
  const { level, xp } = practiceSkill(state, "cafe");
  return { level, xp, orders: 5 + level, recipeSize: 3 + Math.floor(level / 2),
    arrivalMs: 6500 - level * 500, patienceMs: 14000 - level * 1500,
    multiplier: 1 + level * 0.25 };
}

export function beginCafe(state, cell, info, venueId, survival, economy, options = {}) {
  if (state.cafePending || state.performancePending || state.theftPending || state.miniGamePending ||
      state.events?.pending || state.equipment?.dogEncounter === "pending") throw new Error("A shift or performance is already active.");
  if (!cafeVenues(cell).some(p => p.osmId === venueId)) throw new Error("No available mapped cafe or restaurant here.");
  const difficulty = cafeDifficulty(state);
  const resting = restSurvival({ ...state, lastExpenseCents: 0,
    fatigue: Math.min(100, state.fatigue + CAFE.fatigue) },
  { ...survival, rest_minutes: CAFE.minutes, rest_fatigue_recovery: 0 });
  const next = finishAction(state, resting, info, economy, { survival, sheltered: true });
  const resonance = resolveResonance("cafe", {
    journeyCard: options.journeyCard ?? state.journeyCard ?? null,
    birthCard: options.birthCard ?? state.birthCard ?? null,
    dailyCard: options.dailyCard ?? state.dailyCard ?? null,
    resonance: options.resonance ?? false,
  });
  return { ...next, cafePending: actionInterrupted(state, next) ? null : {
    ...difficulty, venueId, maxRewardCents: Math.round(marketPrice(cell, 1.5, economy, info).cents *
      difficulty.multiplier * (state.pressures ? 0.75 + sympathy(state) / 200 : 1)),
    mealKcal: CAFE.mealKcal, reserveMax: survival.reserve_kcal, resonance,
  } };
}

export function settleCafe(state, served, mistakes, cancelled = false) {
  const shift = state.cafePending;
  if (!shift) throw new Error("No active cafe shift.");
  if (!Number.isInteger(served) || served < 0 || served > shift.orders ||
      !Number.isSafeInteger(mistakes) || mistakes < 0 || typeof cancelled !== "boolean") {
    throw new Error("Invalid cafe score.");
  }
  const completed = cancelled ? 0 : served;
  const reward = resonanceGain(Math.round(shift.maxRewardCents * completed / shift.orders), shift.resonance ?? false);
  const foodKcal = completed ? Math.min(shift.mealKcal, shift.reserveMax - state.reserveKcal) : 0;
  let next = completed ? practice(state, "cafe", completed * 4) : state;
  const reputation = outcomeReputation(completed, shift.orders, false, cancelled);
  if (reputation) next = changeReputation(next, reputation);
  return { ...next, cafePending: null, cafeShifts: (state.cafeShifts ?? 0) + 1,
    walletCents: state.walletCents + reward, reserveKcal: state.reserveKcal + foodKcal,
    meals: state.meals + (completed ? 1 : 0),
    lastCafe: { served: completed, orders: shift.orders, mistakes, cancelled, rewardCents: reward,
      foodKcal, level: shift.level } };
}

export function createCafeGame(shift, now, random = Math.random, { resonance = false } = {}) {
  if (!Number.isFinite(now) || !Number.isInteger(shift.level) || shift.level < 0 || shift.level > 4 ||
      shift.orders !== 5 + shift.level || shift.recipeSize !== 3 + Math.floor(shift.level / 2) ||
      shift.arrivalMs !== 6500 - shift.level * 500 || shift.patienceMs !== 14000 - shift.level * 1500 ||
      typeof resonance !== "boolean") {
    throw new Error("Invalid cafe shift configuration.");
  }
  const draw = max => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Invalid cafe order draw.");
    return Math.floor(value * max);
  };
  const sizeOffset = draw(3);
  const orders = Array.from({ length: shift.orders }, (_, index) => ({
    id: index, arrivesAt: now + index * shift.arrivalMs,
    deadline: now + index * shift.arrivalMs + shift.patienceMs,
    recipe: Array.from({ length: shift.recipeSize + (index + sizeOffset) % 3 },
      () => CAFE.ingredients[draw(CAFE.ingredients.length)]),
    status: "waiting",
  }));
  if (resonance) {
    for (const order of orders) {
      if (draw(100) < 20 + shift.level * 10) {
        const kind = draw(2) === 0 ? "add" : "remove";
        order.changePlan = { kind, after: Math.ceil(order.recipe.length / 2),
          item: kind === "add" ? CAFE.ingredients[draw(CAFE.ingredients.length)]
            : order.recipe[draw(order.recipe.length)] };
      }
    }
  }
  return { startedAt: now, lastAt: now, orders, selected: 0, tray: [], mistakes: 0, resonance };
}

export function advanceCafe(game, now) {
  if (!Number.isFinite(now) || now < game.lastAt) throw new Error("Invalid cafe clock.");
  const orders = game.orders.map(order =>
    order.status === "waiting" && now >= order.deadline ? { ...order, status: "missed" } : order);
  const active = order => order.status === "waiting" && now >= order.arrivesAt;
  const selected = orders.some(o => o.id === game.selected && active(o)) ? game.selected
    : orders.find(active)?.id ?? null;
  return { ...game, lastAt: now, orders, selected, tray: selected === game.selected ? game.tray : [] };
}

export function cafeInput(game, kind, value, now) {
  let next = advanceCafe(game, now);
  if (kind === "select") {
    if (next.orders.some(o => o.id === value && o.status === "waiting" && now >= o.arrivesAt)) {
      next = { ...next, selected: value, tray: [] };
    }
    return next;
  }
  const order = next.orders.find(o => o.id === next.selected && o.status === "waiting" && now >= o.arrivesAt);
  if (!order) return next;
  if (kind === "clear") return { ...next, tray: [] };
  if (kind === "ingredient") {
    if (!CAFE.ingredients.includes(value)) throw new Error("Invalid cafe ingredient.");
    if (next.tray.length >= order.recipe.length) return next;
    next = { ...next, tray: [...next.tray, value] };
    if (order.changePlan && !order.change && next.tray.length >= order.changePlan.after) {
      const { kind, item } = order.changePlan;
      const recipe = [...order.recipe];
      if (kind === "add") recipe.push(item);
      else recipe.splice(recipe.indexOf(item), 1);
      next = { ...next, orders: next.orders.map(o => o.id === order.id
        ? { ...o, recipe, change: { kind, item } } : o) };
    }
    return next;
  }
  if (kind !== "serve") throw new Error("Invalid cafe input.");
  const counts = items => [...items].sort().join(",");
  if (counts(next.tray) !== counts(order.recipe)) return { ...next, tray: [], mistakes: next.mistakes + 1 };
  next = { ...next, orders: next.orders.map(o => o.id === order.id ? {
    ...o, status: "served",
  } : o), tray: [] };
  return advanceCafe(next, now);
}

export function cafeFinished(game) {
  return game.orders.every(o => o.status !== "waiting");
}
