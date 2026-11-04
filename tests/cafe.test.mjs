import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CAFE, cafeVenues, cafeDifficulty, beginCafe, settleCafe, createCafeGame,
  advanceCafe, cafeInput, cafeFinished } from "../cafe.mjs";
import { startEconomy, marketPrice } from "../economy.mjs";
import { startSurvival } from "../survival.mjs";
import { beginPressures } from "../pressures.mjs";
import { practice, practiceSkill, validatePractice } from "../practice.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { createTrail } from "../trail.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const data = json("../public/economy.json"), survival = json("../public/config.json").survival,
  map = json("../public/map.json");
const venue = { osmId: "node/123", name: "Cafe", tags: { amenity: "cafe" } };
const cell = { terrain: "road", countryCodes: ["FR"], pois: [venue] };
const info = { latitude: 44.54, longitude: 2.3, terrain: "road" };
const start = () => startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 17, 12),
  "balanced", survival), data, () => 0);
const begin = state => beginCafe(state, cell, info, venue.osmId, survival, data);

test("cafe availability uses active accessible mapped venues, including outside town", () => {
  assert.equal(cafeVenues(cell).length, 1);
  assert.deepEqual(cafeVenues({ terrain: "place" }), []);
  for (const tags of [{ access: "private" }, { access: "no" }, { disused: "yes" },
    { abandoned: "yes" }, { amenity: "bar" }]) {
    assert.equal(cafeVenues({ ...cell, pois: [{ ...venue, tags: { ...venue.tags, ...tags } }] }).length, 0);
  }
  assert.equal(cafeVenues({ ...cell, unavailable: true }).length, 0);
  assert.equal(cafeVenues({ ...cell, pois: [{ ...venue, osmId: "fake" }] }).length, 0);
  assert.throws(() => beginCafe(start(), cell, info, "node/999", survival, data), /mapped/);
});

test("upfront indoor cost applies with no wallet, fixed pending terms and proportional meal/pay", () => {
  const before = { ...start(), walletCents: 0, reserveKcal: 1000 };
  const pending = begin(before), terms = pending.cafePending;
  assert.equal(pending.elapsedMinutes - before.elapsedMinutes, 45);
  assert.equal(pending.fatigue - before.fatigue, 6);
  assert.ok(pending.reserveKcal < before.reserveKcal);
  assert.equal(pending.walletCents, 0);
  assert.equal(terms.maxRewardCents, marketPrice(cell, 1.5, data, info).cents);
  const next = settleCafe(pending, 3, 1);
  assert.equal(next.walletCents, Math.round(terms.maxRewardCents * 3 / 5));
  assert.equal(next.reserveKcal - pending.reserveKcal, 600);
  assert.equal(next.meals, before.meals + 1);
  assert.equal(next.cafeShifts, 1);
  assert.equal(practiceSkill(next, "cafe").xp, 12);
  assert.equal(next.cafePending, null);
  assert.throws(() => settleCafe(next, 3, 0), /No active/);
  assert.throws(() => begin(pending), /already active/);
  assert.throws(() => begin({ ...before, performancePending: {} }), /already active/);
});

test("Temperance snapshots matching cards and boosts only completed cafe earnings once", () => {
  for (const state of [
    { ...start(), birthCard: "temperance", dailyCard: "fool" },
    { ...start(), birthCard: "fool", dailyCard: "temperance" },
    { ...start(), birthCard: "temperance", dailyCard: "temperance" },
  ]) {
    const pending = begin(state);
    assert.equal(pending.cafePending.resonance, true);
    const paid = settleCafe(pending, 5, 0);
    assert.equal(paid.walletCents - pending.walletCents,
      Math.round(pending.cafePending.maxRewardCents * 1.1));
    const cancelled = settleCafe(pending, 5, 0, true);
    assert.equal(cancelled.walletCents, pending.walletCents);
    assert.equal(cancelled.meals, pending.meals);
  }
  const normal = begin({ ...start(), birthCard: "fool", dailyCard: "fool" });
  assert.equal(normal.cafePending.resonance, false);
  assert.equal(settleCafe(normal, 5, 0).walletCents - normal.walletCents,
    normal.cafePending.maxRewardCents);
});

test("cancel and empty shifts grant no rewards; only a completed bad shift loses reputation", () => {
  for (const [served, cancelled] of [[0, false], [4, true]]) {
    const pending = begin(beginPressures(start(), data));
    const next = settleCafe(pending, served, 1, cancelled);
    assert.equal(next.walletCents, pending.walletCents);
    assert.equal(next.reserveKcal, pending.reserveKcal);
    assert.equal(practiceSkill(next, "cafe").xp, 0);
    assert.equal(next.meals, pending.meals);
    if (cancelled) assert.deepEqual(next.pressures, pending.pressures);
    else assert.equal(next.pressures.reputation[0].value, -3);
    assert.equal(next.elapsedMinutes, pending.elapsedMinutes);
  }
  const pending = begin(start());
  for (const args of [[-1, 0], [6, 0], [1.5, 0], [1, -1], [1, 0, "yes"]]) {
    assert.throws(() => settleCafe(pending, ...args), /score/);
  }
});

test("collapse or hunger during upfront costs suppresses pending shift and all rewards", () => {
  const collapsed = begin({ ...start(), fatigue: 99 });
  assert.equal(collapsed.cafePending, null);
  assert.equal(collapsed.faints, 1);
  const dead = begin({ ...start(), reserveKcal: 1, health: 0.01 });
  assert.equal(dead.cafePending, null);
  assert.equal(dead.ended, "health");
  assert.throws(() => begin(dead), /ended/);
});

test("practice increases difficulty/pay with bounded separate skills and strict validation", () => {
  let state = start();
  for (let level = 0; level <= 4; level++) {
    state = { ...state, skills: { cafe: level * 60 } };
    const profile = cafeDifficulty(state), terms = begin(state).cafePending;
    assert.equal(profile.orders, 5 + level);
    assert.equal(profile.patienceMs, 14000 - level * 1500);
    assert.equal(terms.maxRewardCents, Math.round(marketPrice(cell, 1.5, data, info).cents * (1 + level / 4)));
  }
  state = practice(state, "cafe", 500);
  assert.equal(practiceSkill(state, "cafe").xp, 300);
  assert.equal(practiceSkill(state, "music").xp, 0);
  for (const skills of [null, [], { piano: 0 }, { cafe: -1 }, { music: 301 }, { cafe: 1.1 }]) {
    assert.throws(() => validatePractice({ skills }));
  }
  assert.throws(() => practice(state, "unknown", 1));
});

test("perfect cafe round serves all orders with quantities independent of ingredient order", () => {
  const config = cafeDifficulty(start());
  let game = createCafeGame(config, 100, () => 0.9);
  const original = structuredClone(game);
  for (const order of game.orders) {
    game = advanceCafe(game, order.arrivesAt);
    game = cafeInput(game, "select", order.id, order.arrivesAt);
    for (const ingredient of [...order.recipe].reverse()) {
      game = cafeInput(game, "ingredient", ingredient, order.arrivesAt);
    }
    game = cafeInput(game, "serve", null, order.arrivesAt);
  }
  assert.equal(cafeFinished(game), true);
  assert.equal(game.orders.filter(o => o.status === "served").length, 5);
  assert.equal(game.mistakes, 0);
  assert.equal(original.orders.every(o => o.status === "waiting"), true);
  assert.equal(cafeFinished(original), false);
});

test("Temperance changes an order halfway through preparation, preserves tray and changes only once", () => {
  for (const kind of ["add", "remove"]) {
    const config = cafeDifficulty(start());
    let draws = 0;
    const random = () => {
      // Normal orders consume one size draw and 19 ingredient draws.
      if (++draws <= 20) return 0;
      return (draws - 21) % 3 === 1 && kind === "remove" ? 0.9 : 0;
    };
    let game = createCafeGame(config, 0, random, { resonance: true });
    const original = structuredClone(game);
    assert.equal(game.orders[0].changePlan.kind, kind);
    game = advanceCafe(game, 1000);
    assert.equal(game.orders[0].change, undefined);
    game = cafeInput(game, "ingredient", "coffee", 1000);
    assert.equal(game.orders[0].change, undefined);
    game = cafeInput(game, "ingredient", "coffee", 1000);
    assert.deepEqual(game.tray, ["coffee", "coffee"]);
    assert.deepEqual(game.orders[0].change, { kind, item: "coffee" });
    assert.equal(game.orders[0].recipe.length, kind === "add" ? 4 : 2);
    assert.equal(game.orders[0].deadline, original.orders[0].deadline);
    assert.equal(original.orders[0].change, undefined);
    game = cafeInput(game, "clear", null, 1000);
    for (const ingredient of game.orders[0].recipe) game = cafeInput(game, "ingredient", ingredient, 1000);
    game = cafeInput(game, "serve", null, 1000);
    assert.equal(game.orders[0].status, "served");
    assert.equal(game.mistakes, 0);
  }
});

test("Temperance eligibility uses exact increasing probability boundaries and never affects normal play", () => {
  for (let level = 0; level <= 4; level++) {
    const profile = cafeDifficulty({ skills: { cafe: level * 60 } });
    const chance = (20 + level * 10) / 100;
    for (const [value, eligible] of [[chance - 0.001, true], [chance, false]]) {
      const game = createCafeGame(profile, 0, () => value, { resonance: true });
      assert.equal(game.orders.every(order => Boolean(order.changePlan) === eligible), true);
    }
    const normal = createCafeGame(profile, 0, () => 0);
    assert.equal(normal.orders.some(order => order.changePlan), false);
  }
});

test("changed recipes can be served perfectly at every level with no final recovery delay", () => {
  for (let level = 0; level <= 4; level++) {
    const profile = cafeDifficulty({ skills: { cafe: level * 60 } });
    let game = createCafeGame(profile, 0, () => 0, { resonance: true });
    for (const order of game.orders) {
      const now = order.arrivesAt;
      game = advanceCafe(game, now);
      game = cafeInput(game, "select", order.id, now);
      for (let i = 0; i < order.changePlan.after; i++) {
        game = cafeInput(game, "ingredient", order.recipe[i], now);
      }
      const revised = game.orders[order.id].recipe;
      for (const item of revised.slice(game.tray.length)) game = cafeInput(game, "ingredient", item, now);
      game = cafeInput(game, "serve", null, now);
    }
    assert.equal(cafeFinished(game), true);
    assert.equal(game.orders.every(order => order.status === "served"), true);
    assert.equal(game.mistakes, 0);
  }
});

test("every difficulty has varied order sizes of at least three items, with exact tray quantities", () => {
  for (let level = 0; level <= 4; level++) {
    const profile = cafeDifficulty({ skills: { cafe: level * 60 } });
    for (const draw of [0, 0.4, 0.99]) {
      const game = createCafeGame(profile, 0, () => draw);
      const sizes = game.orders.map(order => order.recipe.length);
      assert.equal(new Set(sizes).size, 3);
      assert.ok(sizes.every(size => size >= 3 + Math.floor(level / 2) &&
        size <= 5 + Math.floor(level / 2)));
      let next = game;
      for (const ingredient of game.orders[0].recipe.slice(1)) {
        next = cafeInput(next, "ingredient", ingredient, 0);
      }
      next = cafeInput(next, "serve", null, 0);
      assert.equal(next.mistakes, 1);
      assert.equal(next.orders[0].status, "waiting");
      for (const ingredient of game.orders[0].recipe) next = cafeInput(next, "ingredient", ingredient, 0);
      const full = next;
      next = cafeInput(next, "ingredient", "water", 0);
      assert.deepEqual(next.tray, full.tray);
      assert.equal(cafeInput(next, "serve", null, 0).orders[0].status, "served");
    }
  }
});

test("deadline boundaries, wrong trays, clear/selection and invalid clocks have deterministic outcomes", () => {
  let game = createCafeGame(cafeDifficulty(start()), 0, () => 0);
  game = cafeInput(game, "ingredient", "water", 0);
  game = cafeInput(game, "serve", null, 0);
  assert.equal(game.mistakes, 1);
  assert.deepEqual(game.tray, []);
  game = cafeInput(game, "ingredient", "coffee", 0);
  game = cafeInput(game, "clear", null, 0);
  assert.deepEqual(game.tray, []);
  const expired = advanceCafe(game, game.orders[0].deadline);
  assert.equal(expired.orders[0].status, "missed");
  assert.equal(advanceCafe(expired, expired.orders.at(-1).deadline).orders.every(o => o.status === "missed"), true);
  assert.throws(() => advanceCafe(expired, 0), /clock/);
  assert.throws(() => cafeInput(game, "ingredient", "invalid", 0), /ingredient/);
  assert.throws(() => createCafeGame(cafeDifficulty(start()), 0, () => 1), /draw/);
  assert.throws(() => createCafeGame({ ...cafeDifficulty(start()), orders: 99 }, 0), /configuration/);
});

test("saved skills/results roundtrip; saving pending cafe cancels in snapshot without changing live state", () => {
  const state = { ...begin(start()), trail: createTrail(map, 14, 10, () => 0) };
  const save = createSave({ region: "firmi", map, state, survival, economy: data }, 1);
  assert.equal(save.state.cafePending, null);
  assert.equal(save.state.lastCafe.cancelled, true);
  assert.ok(state.cafePending);
  assert.equal(save.state.walletCents, state.walletCents);
  const next = settleCafe(state, 5, 0);
  const done = createSave({ region: "firmi", map, state: next, survival, economy: data }, 2);
  assert.equal(validateSave(done).state.skills.cafe, 20);
  for (const change of [{ served: 6 }, { rewardCents: -1 }, { foodKcal: 601 }, { orders: 8 }]) {
    const invalid = structuredClone(done);
    Object.assign(invalid.state.lastCafe, change);
    assert.throws(() => validateSave(invalid));
  }
  assert.ok(CAFE.ingredients.length >= 5);
});
