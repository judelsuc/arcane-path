// Standalone fictional transactions: no inventory, money, or save-state writes.
import { resolveResonance, resonanceResult } from "../arcane-resonance.mjs";

const FOOD_SHOPS = new Set([
  "supermarket", "convenience", "bakery", "greengrocer", "butcher",
  "deli", "cheese", "seafood", "food", "farm",
]);
const COINS = Object.freeze([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]);
const PRODUCTS = Object.freeze([
  ["apple", 125], ["bread", 240], ["carrot", 175], ["cheese", 320],
  ["egg", 85], ["honey", 460], ["pear", 215], ["tomato", 135],
].map(([id, cents]) => Object.freeze({ id, cents })));

// Four handwritten baskets per tier, rotated rather than randomly synthesized.
const RECIPES = [
  [[[0, 1], [4, 1]], [[1, 1], [3, 1]], [[2, 1], [7, 1]], [[6, 1], [0, 1]]],
  [[[0, 2], [1, 1], [4, 2]], [[2, 2], [3, 1], [7, 1]],
    [[6, 2], [5, 1], [0, 1]], [[1, 2], [4, 1], [7, 2]]],
  [[[0, 3], [2, 2], [4, 3], [1, 1]], [[3, 2], [5, 1], [6, 3], [7, 2]],
    [[1, 3], [2, 1], [6, 2], [4, 2]], [[0, 2], [5, 2], [7, 3], [3, 1]]],
  [[[0, 4], [1, 2], [2, 3], [3, 1], [4, 4]],
    [[3, 3], [4, 2], [5, 1], [6, 4], [7, 3]],
    [[0, 3], [2, 4], [5, 2], [6, 1], [7, 4]],
    [[1, 4], [3, 2], [4, 3], [5, 3], [6, 2]]],
  [[[0, 5], [1, 3], [2, 4], [3, 2], [4, 5], [5, 1]],
    [[1, 5], [2, 2], [3, 4], [5, 3], [6, 5], [7, 2]],
    [[0, 4], [2, 5], [3, 3], [4, 2], [6, 4], [7, 5]],
    [[0, 3], [1, 4], [4, 5], [5, 4], [6, 2], [7, 3]]],
];
const states = new WeakSet();
export const WEIGHTS = Object.freeze([50, 100, 200, 500, 1000]);
const WEIGHABLE = new Set(["apple", "carrot", "cheese", "pear", "tomato"]);

export function available(cell) {
  if (!cell || cell.unavailable || !Array.isArray(cell.pois)) return false;
  return cell.pois.some(poi => {
    if (!poi || !/^(node|way|relation)\/[1-9]\d*$/.test(poi.osmId)) return false;
    const t = poi.tags;
    if (!t || !(t.amenity === "marketplace" || FOOD_SHOPS.has(t.shop))) return false;
    if (t.access && !["yes", "public", "permissive", "customers"].includes(t.access)) return false;
    if (t.indoor === "private" || t.opening_hours === "closed" || t.opening_hours === "off") return false;
    return ["disused", "abandoned", "demolished", "removed", "construction", "proposed", "closed"]
      .every(key => !t[key] || t[key] === "no");
  });
}

export function difficulty(level) {
  if (!Number.isInteger(level) || level < 0 || level > 4) throw new RangeError("Market level must be 0–4.");
  const value = level;
  return Object.freeze({
    level: value, orders: 3 + value, lines: 2 + value, maxQuantity: 1 + value,
    durationMs: 180000 + value * 60000, maxMistakes: 3,
    rewardMultiplier: 1 + value * 0.5,
  });
}

function freeze(game) {
  Object.freeze(game.basket);
  Object.freeze(game.drawer);
  Object.freeze(game.selectedCash);
  Object.freeze(game.customerPurse);
  Object.freeze(game);
  states.add(game);
  return game;
}

function validTime(now) {
  return Number.isSafeInteger(now) && now >= 0;
}

function cashValue(cash) {
  return COINS.reduce((total, cents) => total + cents * (cash[cents] ?? 0), 0);
}

function splitCash(cents) {
  const cash = {};
  for (const denomination of [...COINS].reverse()) {
    const count = Math.floor(cents / denomination);
    if (count) cash[denomination] = count;
    cents %= denomination;
  }
  return cash;
}

export function makeChange(cents, cash) {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100000 ||
      !cash || typeof cash !== "object" || Object.keys(cash).some(key =>
        !COINS.includes(Number(key)) || !Number.isSafeInteger(cash[key]) || cash[key] < 0 || cash[key] > 1000)) {
    throw new RangeError("Invalid cash amount or inventory.");
  }
  const denominations = [...COINS].reverse();
  const failed = new Set();
  function find(index, remaining) {
    if (!remaining) return {};
    if (index === denominations.length) return null;
    const key = `${index}:${remaining}`;
    if (failed.has(key)) return null;
    const coin = denominations[index];
    const count = Math.min(cash[coin] ?? 0, Math.floor(remaining / coin));
    for (let used = count; used >= 0; used--) {
      const rest = find(index + 1, remaining - used * coin);
      if (rest) return used ? { ...rest, [coin]: used } : rest;
    }
    failed.add(key);
    return null;
  }
  return find(0, cents);
}

function combineCash(cash, added, sign = 1) {
  const next = { ...cash };
  for (const coin of COINS) next[coin] = (cash[coin] ?? 0) + sign * (added[coin] ?? 0);
  return next;
}

function initialFloat(orders, level) {
  const balance = {}, required = {};
  for (const order of orders) {
    const payment = splitCash(order.tenderCents);
    const change = splitCash(order.changeCents);
    for (const coin of COINS) {
      balance[coin] = (balance[coin] ?? 0) + (payment[coin] ?? 0) - (change[coin] ?? 0);
      required[coin] = Math.max(required[coin] ?? 0, -balance[coin]);
    }
  }
  // Reserve enough for a complete canonical shift, plus difficulty-specific spare coins.
  for (const coin of [5, 10, 20, 50]) required[coin] += level < 2 ? 1 : 0;
  if (level === 0) for (const coin of [5, 10, 20, 50]) required[coin] += 4;
  return Object.freeze(required);
}

export function createGame({ level = 0, random = Math.random, now = 0, ...cards } = {}) {
  const rules = difficulty(level);
  const resonance = resolveResonance("market", cards);
  if (!validTime(now) || now > Number.MAX_SAFE_INTEGER - rules.durationMs) {
    throw new RangeError("Invalid start time");
  }
  if (typeof random !== "function") throw new TypeError("Invalid random source");
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new RangeError("Invalid random sample");
  const offset = Math.floor(sample * 4);
  const orders = Object.freeze(Array.from({ length: rules.orders }, (_, index) => {
    const recipe = RECIPES[rules.level][(offset + index) % 4];
    const weighedProduct = resonance && index === 0
      ? recipe.find(([product]) => WEIGHABLE.has(PRODUCTS[product].id))?.[0] : undefined;
    const lines = Object.freeze(recipe.map(([product, quantity]) =>
      Object.freeze({ ...PRODUCTS[product], quantity,
        ...(product === weighedProduct ? { grams: quantity * 250, centsPerKg: PRODUCTS[product].cents * 4 } : {}) })));
    const totalCents = lines.reduce((sum, line) => sum + line.cents * line.quantity, 0);
    const step = [500, 1000, 2000, 5000, 10000][rules.level];
    const tenderCents = (Math.floor(totalCents / step) + 1) * step;
    const payment = Object.freeze(splitCash(tenderCents));
    const purse = splitCash(totalCents % 100);
    for (const coin of [5, 10, 20, 50, 100, 200]) purse[coin] = (purse[coin] ?? 0) + Number((index + coin + offset) % 3 === 0);
    return Object.freeze({ lines, totalCents, tenderCents, changeCents: tenderCents - totalCents,
      payment, purse: Object.freeze(purse) });
  }));
  const drawer = initialFloat(orders, rules.level);
  return freeze({
    rules, resonance, weights: WEIGHTS, weightGrams: 0,
    products: PRODUCTS, denominations: COINS, orders, orderIndex: 0,
    phase: "basket", basket: {}, changeCents: 0, selectedCash: {}, drawer, initialDrawer: drawer,
    customerPurse: orders[0].purse, extraCents: 0, notice: null,
    score: 0, maxScore: rules.orders * 2,
    mistakes: 0, status: "playing", error: null, updatedAt: now,
    deadline: now + rules.durationMs,
  });
}

function assertGame(game) {
  if (!states.has(game)) throw new TypeError("Expected a market game");
}

export function advance(game, now) {
  assertGame(game);
  if (game.status !== "playing") return game;
  if (!validTime(now) || now < game.updatedAt) return freeze({ ...game, error: "invalid-time" });
  if (now >= game.deadline) return freeze({ ...game, status: "failed", error: "timeout", updatedAt: now });
  return now === game.updatedAt ? game : freeze({ ...game, updatedAt: now });
}

// Cash is reserved while selecting change and deducted only on successful service.
export function input(game, action, now) {
  assertGame(game);
  if (game.status !== "playing") return game;
  if (action?.type === "cancel") return freeze({ ...game, status: "cancelled", score: 0, error: null });
  const current = advance(game, now);
  if (current.status !== "playing" || !validTime(now) || now < game.updatedAt) return current;
  const invalid = () => freeze({ ...current, error: "invalid-action" });
  if (!action || typeof action !== "object") return invalid();
  const order = current.orders[current.orderIndex];
  const weighed = order.lines.find(line => line.grams !== undefined);
  if (action.type === "weight" && current.phase === "basket" && weighed) {
    if (!Number.isSafeInteger(action.grams) || !WEIGHTS.includes(Math.abs(action.grams))) return invalid();
    const weightGrams = current.weightGrams + action.grams;
    if (weightGrams < 0 || weightGrams > 10000) return invalid();
    return freeze({ ...current, weightGrams, error: null });
  }
  if (action.type === "quantity" && current.phase === "basket") {
    if (action.item === weighed?.id || !PRODUCTS.some(p => p.id === action.item) || !Number.isInteger(action.quantity) ||
        action.quantity < 0 || action.quantity > current.rules.maxQuantity) return invalid();
    return freeze({ ...current, basket: { ...current.basket, [action.item]: action.quantity }, error: null });
  }
  if (current.phase === "change" && action.type === "ask-extra") {
    if (!Number.isSafeInteger(action.cents) || action.cents <= 0 || action.cents > 500) return invalid();
    const offered = makeChange(action.cents, current.customerPurse);
    if (!offered) return freeze({ ...current, error: null, notice: "customer-refused" });
    return freeze({ ...current, drawer: combineCash(current.drawer, offered),
      customerPurse: combineCash(current.customerPurse, offered, -1),
      extraCents: current.extraCents + action.cents, error: null, notice: "customer-agreed" });
  }
  if (current.phase === "change" && ["change", "coin", "remove-coin", "clear-change"].includes(action.type)) {
    let selectedCash;
    if (action.type === "clear-change") selectedCash = {};
    else if (action.type === "change") {
      if (!Number.isSafeInteger(action.cents) || action.cents < 0 || action.cents > 100000) return invalid();
      selectedCash = makeChange(action.cents, current.drawer);
      if (!selectedCash) return freeze({ ...current, error: "insufficient-cash", notice: null });
    } else {
      if (!COINS.includes(action.cents)) return invalid();
      const selected = current.selectedCash[action.cents] ?? 0;
      const removing = action.type === "remove-coin";
      if (removing ? selected === 0 : selected >= (current.drawer[action.cents] ?? 0)) {
        return freeze({ ...current, error: removing ? "invalid-action" : "empty-denomination", notice: null });
      }
      selectedCash = { ...current.selectedCash, [action.cents]: selected + (removing ? -1 : 1) };
    }
    return freeze({ ...current, selectedCash, changeCents: cashValue(selectedCash), error: null, notice: null });
  }
  if (action.type !== "submit") return invalid();
  const correct = current.phase === "basket"
    ? (!weighed || current.weightGrams === weighed.grams) &&
      PRODUCTS.every(p => p.id === weighed?.id || (current.basket[p.id] ?? 0) === (order.lines.find(l => l.id === p.id)?.quantity ?? 0))
    : current.changeCents === order.changeCents + current.extraCents;
  if (!correct) {
    const mistakes = current.mistakes + 1;
    return freeze({ ...current, mistakes, error: current.phase === "basket" ? "wrong-basket" : "wrong-change",
      status: mistakes >= current.rules.maxMistakes ? "failed" : "playing" });
  }
  if (current.phase === "basket") return freeze({ ...current, phase: "change",
    drawer: combineCash(current.drawer, order.payment), score: current.score + 1, error: null, notice: null });
  const orderIndex = current.orderIndex + 1;
  return freeze({ ...current, score: current.score + 1, orderIndex,
    status: orderIndex === current.orders.length ? "completed" : "playing",
    drawer: combineCash(current.drawer, current.selectedCash, -1),
    phase: "basket", basket: {}, weightGrams: 0, changeCents: 0, selectedCash: {},
    customerPurse: current.orders[orderIndex]?.purse ?? {}, extraCents: 0, error: null, notice: null });
}

export function result(game) {
  assertGame(game);
  return resonanceResult({
    completed: game.status === "completed", score: game.status === "cancelled" ? 0 : game.score,
    maxScore: game.maxScore, cancelled: game.status === "cancelled",
  }, game.resonance);
}
