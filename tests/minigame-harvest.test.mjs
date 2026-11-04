import test from "node:test";
import assert from "node:assert/strict";
import { available, difficulty, createGame, input, advance, result, bunchAt } from "../minigames/harvest.mjs";

test("Empress activates from either card, never stacks and completes the timed harvest", () => {
  for (const options of [{ journeyCard: "empress" }, { birthCard: "empress" },
    { dailyCard: "empress" }, { journeyCard: "empress", dailyCard: "empress" }, { resonance: true }]) {
    let game = createGame({ ...options, random: () => 0 });
    assert.equal(game.resonance, true);
    assert.equal(game.items.length, 16);
    assert.equal(result(game).earningsMultiplier, 1);
    game = input(game, "right", 0);
    game = input(game, "stop", 100);
    const position = game.x;
    game = advance(game, difficulty(0).fallMs);
    assert.notEqual(game.x, position);
    const cancelled = input(game, "cancel", game.now);
    assert.equal(result(cancelled).earningsMultiplier, 1);
    game = advance(game, difficulty(0).durationMs);
    assert.equal(result(game).completed, true);
    assert.equal(result(game).earningsMultiplier, 1.1);
  }
});

test("rotten bunches require 500 ms, award once per hold and missed rot subtracts without going negative", () => {
  for (let level = 0; level <= 4; level++) {
    const rule = difficulty(level);
    let game = createGame({ level, resonance: true, random: () => 0 });
    assert.equal(game.rotten.filter(Boolean).length, 2 + level);
    const original = game;
    game = input(game, "press", 0);
    assert.equal(advance(game, 499).score, 0);
    game = advance(game, 500);
    assert.equal(game.score, 1);
    assert.equal(game.feedback, "squashed");
    assert.equal(game.index, 1);
    assert.equal(input(game, "press", 501).score, 1);
    game = advance(game, 500 + rule.fallMs);
    assert.equal(game.score, 0);
    assert.equal(game.feedback, "spoiled");
    assert.equal(original.score, 0);
    assert.ok(Object.isFrozen(game.rotten));
    let released = input(original, "press", 0);
    released = input(released, "release", 499);
    released = advance(released, rule.fallMs);
    assert.equal(released.score, 0);
    assert.equal(released.feedback, "spoiled");
  }
});

test("normal harvest still resets to the predetermined next spawn; unmatched cards change nothing", () => {
  const make = options => {
    let draw = 0;
    return createGame({ ...options, random: () => (++draw % 9) / 10 });
  };
  const normal = make({});
  assert.deepEqual(normal, make({ journeyCard: "star", dailyCard: "magician" }));
  const next = advance(normal, difficulty(0).fallMs);
  assert.equal(next.x, normal.spawns[1]);
  const late = advance(make({ resonance: true }), difficulty(0).fallMs * 3 + 100);
  let framed = make({ resonance: true });
  for (let now = 100; now < late.now; now += 100) framed = advance(framed, now);
  assert.deepEqual(advance(framed, late.now), late);
});

test("grapes fall automatically and land exactly at the deadline at every level", () => {
  for (let level = 0; level <= 4; level++) {
    const rule = difficulty(level);
    let game = createGame({ level, now: 100, random: () => 0 });
    const original = game;
    game = advance(game, 100 + rule.fallMs - 1);
    assert.equal(game.index, 0);
    assert.equal(game.score, 0);
    for (let i = 1; i <= Math.min(rule.rounds, Math.floor(rule.durationMs / rule.fallMs)); i++) {
      game = advance(game, 100 + i * rule.fallMs);
      assert.equal(game.score, i);
      assert.equal(game.index, i);
    }
    game = advance(game, 100 + rule.durationMs);
    assert.equal(result(game).completed, true);
    assert.equal(game.index, Math.floor(rule.durationMs / rule.fallMs));
    assert.equal(original.index, 0);
    assert.ok(Object.isFrozen(game));
    assert.ok(Object.isFrozen(game.items));
    assert.ok(Object.isFrozen(game.spawns));
    assert.equal(advance(game, 1e12), game);
    assert.equal(input(game, "cancel", 1e12), game);
  }
});

test("held steering moves continuously, releasing stops, boundaries clamp", () => {
  let game = createGame({ random: () => 0 });
  game = input(game, "right", 0);
  game = advance(game, 400);
  assert.ok(Math.abs(game.x - 0.38) < 1e-12);
  game = input(game, "stop", 400);
  assert.equal(advance(game, 800).x, game.x);
  game = input(game, "left", 800);
  game = advance(game, 1260);
  assert.equal(game.x, 0.04);
  game = input(game, "right", 1260);
  game = advance(game, difficulty(0).fallMs - 1);
  assert.equal(game.x, 0.96);
  assert.equal(game.index, 0);
});

test("only landing position decides the basket; wrong catches do not score", () => {
  let game = createGame({ random: () => 0 });
  const rule = difficulty(0);
  game = input(game, "right", 0);
  game = advance(game, rule.fallMs - 1);
  assert.equal(game.score, 0);
  game = advance(game, rule.fallMs);
  assert.equal(game.score, 0);
  assert.equal(game.index, 1);
  assert.equal(game.feedback, "wrong");
  assert.equal(game.x, game.spawns[1]);
  game = input(game, "stop", rule.fallMs);
  game = advance(game, 2 * rule.fallMs);
  assert.equal(game.score, 1);
  assert.equal(game.feedback, "correct");
  assert.equal(result(game).completed, false);
});

test("steering every colour from either extreme remains reachable even at the fastest level", () => {
  for (let level = 0; level <= 4; level++) {
    const rule = difficulty(level);
    for (let colour = 0; colour < rule.baskets; colour++) {
      for (const spawn of [0.08, 0.919]) {
        let draw = 0;
        let game = createGame({ level, random: () => draw++ < rule.rounds
          ? (colour + 0.5) / rule.baskets : (spawn - 0.08) / 0.84 });
        const target = (colour + 0.5) / rule.baskets;
        const travelMs = Math.abs(target - game.x) / rule.steerPerSecond * 1000;
        assert.ok(travelMs < rule.fallMs);
        game = input(game, target < game.x ? "left" : "right", 0);
        game = input(game, "stop", travelMs);
        game = advance(game, rule.fallMs);
        assert.equal(game.score, 1, `level ${level}, colour ${colour}, spawn ${spawn}`);
      }
    }
  }
});

test("movement is frame-independent, including frames spanning several falls", () => {
  const start = input(createGame({ random: () => 0.2 }), "right", 0);
  const end = 3 * difficulty(0).fallMs + 500;
  let small = start;
  for (let time = 20; time < end; time += 20) small = advance(small, time);
  small = advance(small, end);
  const large = advance(start, end);
  assert.equal(small.index, large.index);
  assert.equal(small.score, large.score);
  assert.ok(Math.abs(small.x - large.x) < 1e-12);
  assert.equal(result(advance(start, 1e12)).completed, true);
});

test("controls cannot instantly score or teleport; cancellation is terminal", () => {
  let game = createGame({ random: () => 0 });
  for (let i = 0; i < 20; i++) {
    game = input(game, "left", 0);
    game = input(game, "right", 0);
  }
  assert.equal(game.x, 0.08);
  assert.equal(game.score, 0);
  game = input(game, "cancel", 0);
  assert.deepEqual(result(game), { completed: false, score: 0, maxScore: 0, cancelled: true, earningsMultiplier: 1 });
  assert.equal(input(game, "left", 1000), game);
  assert.equal(advance(game, 100000), game);
});

test("all modes last exactly 30 seconds; fast falls start new bunches and more good sorting earns more", () => {
  for (let level = 0; level <= 4; level++) {
    const rule = difficulty(level);
    assert.equal(rule.durationMs, 30000);
    let fast = createGame({ level, random: () => 0 });
    const slow = advance(fast, 30000);
    for (let now = 0; now < 30000; now += 200) {
      fast = input(fast, "press", now);
      fast = input(fast, "release", now);
    }
    fast = advance(fast, 30000);
    assert.equal(result(fast).completed, true);
    assert.ok(result(fast).score > result(slow).score);
    assert.ok(fast.index > 16);
    assert.equal(result(fast).earningsMultiplier, 1);
    assert.equal(input(fast, "press", 30000), fast);
    assert.deepEqual(bunchAt(fast, 50), bunchAt(fast, 50));
    assert.notDeepEqual(bunchAt(fast, 50), bunchAt(fast, 66));
    assert.equal(result(advance(createGame({ level }), 29999)).completed, false);
  }
});

test("short release animates a fast fall for 160 ms, then scores; wrong drops score nothing", () => {
  let game = createGame({ random: () => 0 });
  game = input(game, "press", 0);
  assert.equal(game.index, 0);
  assert.equal(game.score, 0);
  assert.equal(input(game, "press", 10).index, 0);
  game = input(game, "release", 10);
  assert.equal(game.index, 0);
  game = advance(game, 169);
  assert.equal(game.index, 0);
  game = advance(game, 170);
  assert.equal(game.index, 1);
  assert.equal(game.score, 1);
  game = input(game, "right", 170);
  game = input(game, "stop", 1000);
  game = input(game, "press", 1000);
  game = input(game, "release", 1001);
  game = advance(game, 1161);
  assert.equal(game.index, 2);
  assert.equal(game.score, 1);
  assert.equal(game.feedback, "wrong");
});

test("good grapes can be squashed in either mode without earning a point; abort never drops", () => {
  for (const resonance of [false, true]) {
    let game = createGame({ resonance, random: () => 0.99 });
    assert.equal(bunchAt(game).rotten, false);
    game = input(game, "press", 0);
    const before = advance(game, 499);
    assert.equal(before.index, 0);
    game = advance(game, 500);
    assert.equal(game.index, 1);
    assert.equal(game.score, 0);
    assert.equal(game.feedback, "wasted");
    assert.equal(advance(game, 1000).index, 1);
    const aborted = input(before, "abort-press", 499);
    assert.equal(aborted.fastAt, null);
    assert.equal(advance(aborted, 600).index, 0);
  }
});

test("difficulty changes only colour count, falling speed and potential reward", () => {
  assert.equal(difficulty(0).baskets, 3);
  assert.equal(difficulty(4).baskets, 6);
  assert.equal(difficulty(0).fallMs, 2500);
  assert.deepEqual([1, 2, 3, 4].map(level => [difficulty(level).baskets, difficulty(level).fallMs]),
    [[3, 2450], [4, 2100], [5, 1750], [6, 1400]]);
  assert.equal(difficulty(4).fallMs, 1400);
  for (let i = 1; i <= 4; i++) {
    assert.ok(difficulty(i).fallMs < difficulty(i - 1).fallMs);
    assert.equal(difficulty(i).rounds, 16);
    assert.equal(difficulty(i).steerPerSecond, difficulty(0).steerPerSecond);
    assert.ok(difficulty(i).baskets >= difficulty(i - 1).baskets);
    assert.ok(difficulty(i).rewardMultiplier > difficulty(i - 1).rewardMultiplier);
  }
});

test("invalid levels, times, draws, states and actions fail explicitly", () => {
  for (const level of [-1, 5, 0.5, NaN, "0", null]) assert.throws(() => createGame({ level }), RangeError);
  for (const now of [-1, NaN, Infinity, "0", Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => createGame({ now }), RangeError);
    assert.throws(() => advance(createGame(), now), RangeError);
  }
  for (const draw of [-0.1, 1, NaN, Infinity, "0"]) assert.throws(() => createGame({ random: () => draw }), RangeError);
  assert.throws(() => createGame({ random: null }), TypeError);
  const game = createGame({ now: 10 });
  for (const action of ["basket-1", "skip", {}, "up"]) assert.throws(() => input(game, action, 10), TypeError);
  assert.throws(() => advance(game, 9), RangeError);
  for (const invalid of [null, {}, { ...game, index: 99 }, { ...game, score: -1 },
    { ...game, x: NaN }, { ...game, direction: 2 }, { ...game, spawns: [] },
    { ...game, spawns: Array(16) }, { ...game, x: 1.1 }, { ...game, index: 1 },
    { ...game, items: [] }, { ...game, items: Array(16) },
    { ...game, items: game.items.map(() => 9) }]) assert.throws(() => result(invalid));
});

test("only rural actual vineyard terrain or current-cell active accessible mapped vineyards", () => {
  assert.equal(available({ terrain: "vineyard" }), true);
  for (const key of ["contentSources", "pois", "sources"]) {
    assert.equal(available({ terrain: "field", [key]: [{ tags: { landuse: "vineyard" } }] }), true);
    assert.equal(available({ terrain: "field", [key]: [{ tags: { landuse: "orchard" } }] }), false);
    for (const tags of [{ access: "private" }, { access: "no" }, { access: "permit" },
      { abandoned: "yes" }, { disused: "yes" }, { construction: "yes" }]) {
      assert.equal(available({ terrain: "field",
        [key]: [{ tags: { landuse: "vineyard", ...tags } }] }), false);
    }
  }
  for (const cell of [null, {}, { terrain: "field" },
    { terrain: "vineyard", unavailable: true }, { terrain: "vineyard", inTown: true },
    { terrain: "vineyard", settlements: [{ name: "Town" }] },
    { terrain: "vineyard", tags: { access: "private" } },
    { terrain: "vineyard", tags: null },
    { terrain: "vineyard", contentSources: [{ tags: { landuse: "vineyard", access: "private" } }] },
    { terrain: "place", sources: [{ tags: { landuse: "vineyard" } }] },
    { terrain: "forest", nearby: [{ tags: { landuse: "vineyard" } }] }]) assert.equal(available(cell), false);
});
