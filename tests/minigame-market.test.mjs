import test from "node:test";
import assert from "node:assert/strict";
import { createGame, input, advance, result, difficulty, WEIGHTS, available, makeChange } from "../minigames/market.mjs";

const cashTotal = cash => Object.entries(cash).reduce((sum, [coin, count]) => sum + Number(coin) * count, 0);

function pack(game, now = 1) {
  const order = game.orders[game.orderIndex];
  for (const line of order.lines) {
    if (line.grams !== undefined) {
      let remaining = line.grams;
      for (const grams of [...WEIGHTS].reverse()) while (remaining >= grams) {
        game = input(game, { type: "weight", grams }, now);
        remaining -= grams;
      }
    } else game = input(game, { type: "quantity", item: line.id, quantity: line.quantity }, now);
  }
  return game;
}

test("normal and Justice shifts complete at every difficulty with unchanged raw scores", () => {
  for (let level = 0; level < 5; level++) for (const resonance of [false, true]) {
    for (const random of [0, 0.25, 0.5, 0.75]) {
      let game = createGame({ level, resonance, random: () => random });
      const initialCash = cashTotal(game.drawer);
      assert.equal(game.orders.flatMap(order => order.lines).filter(line => line.grams).length, Number(resonance));
      assert.ok(Object.isFrozen(game));
      assert.ok(Object.isFrozen(game.orders[0].lines[0]));
      while (game.status === "playing") {
        game = pack(game);
        game = input(game, { type: "submit" }, 1);
        assert.equal(game.error, null);
        assert.ok(Object.values(game.drawer).every(count => Number.isSafeInteger(count) && count >= 0));
        assert.equal(game.phase, "change");
        const { changeCents } = game.orders[game.orderIndex];
        game = input(game, { type: "change", cents: changeCents }, 1);
        game = input(game, { type: "submit" }, 1);
      }
      assert.deepEqual(result(game), {
        completed: true, score: (3 + level) * 2, maxScore: (3 + level) * 2,
        cancelled: false, earningsMultiplier: resonance ? 1.1 : 1,
      });
      assert.equal(cashTotal(game.drawer), initialCash + game.orders.reduce((sum, order) => sum + order.totalCents, 0));
    }
  }
});

test("bounded change searches past greedy dead ends and never invents coins", () => {
  assert.deepEqual(makeChange(60, { 50: 1, 20: 3 }), { 20: 3 });
  assert.equal(makeChange(10, { 20: 20 }), null);
  assert.deepEqual(makeChange(0, {}), {});
  assert.throws(() => makeChange(1, { 1: -1 }), RangeError);
  assert.throws(() => makeChange(1, { 3: 1 }), RangeError);
  for (let ones = 0; ones <= 3; ones++) for (let twos = 0; twos <= 3; twos++) for (let fives = 0; fives <= 3; fives++) {
    const inventory = { 1: ones, 2: twos, 5: fives };
    const possible = new Set();
    for (let a = 0; a <= ones; a++) for (let b = 0; b <= twos; b++) for (let c = 0; c <= fives; c++) possible.add(a + 2 * b + 5 * c);
    for (let amount = 0; amount <= 25; amount++) {
      const plan = makeChange(amount, inventory);
      assert.equal(plan !== null, possible.has(amount));
      if (plan) {
        assert.equal(cashTotal(plan), amount);
        assert.ok(Object.entries(plan).every(([coin, count]) => count <= inventory[coin]));
      }
    }
  }
});

test("Easy starts with four extra coins of each small denomination, adding exactly 3.40 euros", () => {
  for (const random of [0, 0.25, 0.5, 0.75]) {
    const game = createGame({ level: 0, random: () => random });
    const balance = {}, minimum = {};
    for (const order of game.orders) {
      const change = makeChange(order.changeCents, Object.fromEntries(game.denominations.map(coin => [coin, 100])));
      for (const coin of game.denominations) {
        balance[coin] = (balance[coin] ?? 0) + (order.payment[coin] ?? 0) - (change[coin] ?? 0);
        minimum[coin] = Math.max(minimum[coin] ?? 0, -balance[coin]);
      }
    }
    for (const coin of game.denominations) assert.equal(game.drawer[coin], minimum[coin] + ([5, 10, 20, 50].includes(coin) ? 5 : 0));
    assert.equal(cashTotal(game.drawer) - cashTotal(minimum), 425);
  }
});

test("drawer receives payment once, reserves finite cash, returns cleared cash and carries across customers", () => {
  let game = createGame({ random: () => 0 });
  const initial = game.drawer;
  game = input(pack(game), { type: "submit" }, 1);
  assert.equal(cashTotal(game.drawer), cashTotal(initial) + 500);
  const paidDrawer = game.drawer;
  assert.ok(Object.isFrozen(paidDrawer));
  for (let i = 0; i < paidDrawer[200]; i++) game = input(game, { type: "coin", cents: 200 }, 1);
  const reserved = game.selectedCash[200];
  game = input(game, { type: "coin", cents: 200 }, 1);
  assert.equal(game.error, "empty-denomination");
  assert.equal(game.selectedCash[200], reserved);
  assert.deepEqual(game.drawer, paidDrawer);
  game = input(game, { type: "remove-coin", cents: 200 }, 1);
  assert.equal(game.selectedCash[200], reserved - 1);
  game = input(game, { type: "clear-change" }, 1);
  assert.deepEqual(game.selectedCash, {});
  assert.equal(game.changeCents, 0);
  game = input(game, { type: "change", cents: 1 }, 1);
  assert.equal(game.error, "insufficient-cash");
  assert.equal(game.mistakes, 0);
  game = input(game, { type: "change", cents: 290 }, 1);
  const selection = game.selectedCash;
  game = input(game, { type: "submit" }, 1);
  assert.equal(game.orderIndex, 1);
  for (const coin of game.denominations) assert.equal(game.drawer[coin], (paidDrawer[coin] ?? 0) - (selection[coin] ?? 0));
  assert.equal(cashTotal(game.drawer), cashTotal(initial) + 210);
  assert.deepEqual(game.selectedCash, {});
});

test("customers accept only coins in their finite purse; extra money increases change owed, not profit", () => {
  let game = input(pack(createGame({ random: () => 0 })), { type: "submit" }, 1);
  const drawer = game.drawer;
  const purse = game.customerPurse;
  const startValue = cashTotal(drawer);
  assert.equal(purse[10], 1);
  game = input(game, { type: "ask-extra", cents: 15 }, 1);
  assert.equal(game.notice, "customer-refused");
  assert.deepEqual(game.drawer, drawer);
  assert.deepEqual(game.customerPurse, purse);
  assert.equal(game.mistakes, 0);
  game = input(game, { type: "ask-extra", cents: 10 }, 1);
  assert.equal(game.notice, "customer-agreed");
  assert.equal(game.extraCents, 10);
  assert.equal(game.customerPurse[10], 0);
  assert.equal(cashTotal(game.drawer), startValue + 10);
  assert.equal(game.score, 1);
  assert.equal(game.changeCents, 0);
  game = input(game, { type: "ask-extra", cents: 10 }, 1);
  assert.equal(game.notice, "customer-refused");
  assert.equal(game.extraCents, 10);
  for (const cents of [0, -1, 501, 2.5, "10"]) {
    assert.equal(input(game, { type: "ask-extra", cents }, 1).error, "invalid-action");
  }
  game = input(game, { type: "change", cents: 290 }, 1);
  game = input(game, { type: "submit" }, 1);
  assert.equal(game.error, "wrong-change");
  game = input(game, { type: "change", cents: 300 }, 1);
  game = input(game, { type: "submit" }, 1);
  assert.equal(game.orderIndex, 1);
  assert.equal(cashTotal(game.drawer), startValue + 10 - 300);
  assert.equal(game.extraCents, 0);
  assert.equal(game.customerPurse, game.orders[1].purse);
  assert.equal(input(game, { type: "ask-extra", cents: 10 }, 1).error, "invalid-action");
});

test("either matching card activates scales, both do not duplicate", () => {
  for (const cards of [{ journeyCard: "justice" }, { dailyCard: "justice" },
    { journeyCard: "justice", dailyCard: "justice" }]) {
    const game = createGame({ ...cards, random: () => 0 });
    assert.equal(game.resonance, true);
    assert.equal(game.orders[0].lines.filter(line => line.grams).length, 1);
  }
  assert.equal(createGame({ journeyCard: "moon", dailyCard: "sun" }).resonance, false);
});

test("scale rejects quantity bypass, wrong mass and invalid weights; corrections work", () => {
  let game = createGame({ resonance: true, random: () => 0 });
  const line = game.orders[0].lines.find(item => item.grams);
  game = input(game, { type: "quantity", item: line.id, quantity: line.quantity }, 1);
  assert.equal(game.error, "invalid-action");
  for (const grams of [30, -50, NaN, Infinity, "50", null]) {
    game = input(game, { type: "weight", grams }, 1);
    assert.equal(game.error, "invalid-action");
    assert.equal(game.weightGrams, 0);
  }
  game = pack(game);
  game = input(game, { type: "weight", grams: 50 }, 1);
  game = input(game, { type: "submit" }, 1);
  assert.equal(game.error, "wrong-basket");
  assert.equal(game.mistakes, 1);
  game = input(game, { type: "weight", grams: -50 }, 1);
  game = input(game, { type: "submit" }, 1);
  assert.equal(game.phase, "change");
  assert.equal(input(game, { type: "weight", grams: 50 }, 1).error, "invalid-action");
});

test("exact basket checks include unrequested products and change uses integer cents", () => {
  let game = pack(createGame({ random: () => 0 }));
  game = input(game, { type: "quantity", item: "honey", quantity: 1 }, 1);
  game = input(game, { type: "submit" }, 1);
  assert.equal(game.error, "wrong-basket");
  game = input(game, { type: "quantity", item: "honey", quantity: 0 }, 1);
  game = input(game, { type: "submit" }, 1);
  assert.equal(input(game, { type: "change", cents: 1.5 }, 1).error, "invalid-action");
  assert.equal(input(game, { type: "coin", cents: 3 }, 1).error, "invalid-action");
  game = input(game, { type: "coin", cents: 200 }, 1);
  assert.equal(game.changeCents, 200);
  game = input(game, { type: "clear-change" }, 1);
  assert.equal(game.changeCents, 0);
  game = input(game, { type: "submit" }, 1);
  assert.equal(game.error, "wrong-change");
});

test("three mistakes, exact deadline, cancellation and invalid actions never grant resonance gains", () => {
  for (const resonance of [false, true]) {
    let game = createGame({ resonance });
    for (let i = 0; i < 3; i++) game = input(game, { type: "submit" }, 1);
    assert.equal(game.status, "failed");
    assert.equal(result(game).earningsMultiplier, 1);
    game = createGame({ resonance });
    assert.equal(advance(game, game.deadline - 1).status, "playing");
    const expired = input(game, { type: "submit" }, game.deadline);
    assert.equal(expired.status, "failed");
    assert.equal(expired.error, "timeout");
    assert.equal(result(expired).earningsMultiplier, 1);
    assert.equal(input(expired, { type: "submit" }, game.deadline), expired);
    assert.equal(result(input(game, { type: "cancel" }, 1)).cancelled, true);
    assert.equal(input(game, null, 1).error, "invalid-action");
    assert.equal(advance(game, -1).error, "invalid-time");
  }
  assert.throws(() => createGame({ level: 5 }), RangeError);
  assert.throws(() => difficulty(NaN), RangeError);
  assert.throws(() => createGame({ random: () => 1 }), RangeError);
  assert.throws(() => advance({}, 1), TypeError);
});

test("a finished basket and exact change succeed just before the deadline, never at it", () => {
  for (const resonance of [false, true]) {
    let game = createGame({ resonance, random: () => 0 });
    while (game.orderIndex < game.orders.length - 1) {
      game = input(pack(game), { type: "submit" }, 1);
      game = input(game, { type: "change", cents: game.orders[game.orderIndex].changeCents }, 1);
      game = input(game, { type: "submit" }, 1);
    }
    game = input(pack(game), { type: "submit" }, 1);
    game = input(game, { type: "change", cents: game.orders[game.orderIndex].changeCents }, 1);
    const timely = input(game, { type: "submit" }, game.deadline - 1);
    const late = input(game, { type: "submit" }, game.deadline);
    assert.equal(timely.status, "completed");
    assert.equal(late.status, "failed");
    assert.equal(result(late).earningsMultiplier, 1);
    assert.equal(result(timely).earningsMultiplier, resonance ? 1.1 : 1);
  }
});

test("market is available only at eligible mapped food shops", () => {
  assert.equal(available({ pois: [{ osmId: "node/1", tags: { amenity: "marketplace" } }] }), true);
  assert.equal(available({ pois: [{ osmId: "node/1", tags: { shop: "bakery", access: "private" } }] }), false);
  assert.equal(available(null), false);
});
