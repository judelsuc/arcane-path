import test from "node:test";
import assert from "node:assert/strict";
import { available, difficulty, createGame, input, advance, result } from "../minigames/lanterns.mjs";

test("Hermit card matches preserve validated Simon sequences, lengths and failure rules with a completion-only bonus", () => {
  for (const options of [{ resonance: true }, { journeyCard: "hermit" }, { birthCard: "hermit" }, { dailyCard: "hermit" }, { journeyCard: "hermit", dailyCard: "hermit" }]) {
    for (let level = 0; level <= 4; level++) {
      const normal = createGame({ level, random: () => .3 });
      let game = createGame({ level, random: () => .3, ...options });
      assert.equal(game.resonance, true);
      assert.deepEqual(game.rules, normal.rules);
      assert.deepEqual(game.sequence, normal.sequence);
      assert.equal(result(input(game, { type: "cancel" }, 0)).earningsMultiplier, 1);
      game = input(game, { type: "start" }, 0);
      const wrong = input(advance(game, endTime(game)), { type: "press", lantern: (game.sequence[0] + 1) % game.rules.lanternCount }, endTime(game));
      assert.equal(wrong.phase, "failed");
      assert.equal(result(wrong).earningsMultiplier, 1);
      while (game.phase !== "done") {
        game = advance(game, endTime(game));
        for (let step = 0; step < game.round; step++) game = input(game, { type: "press", lantern: game.sequence[step] }, game.updatedAt);
        if (game.phase === "roundGap") game = advance(game, game.nextAt);
      }
      assert.equal(result(game).score, 7 + level);
      assert.equal(result(game).earningsMultiplier, 1.1);
    }
  }
  assert.deepEqual(createGame({ random: () => .3 }), createGame({ random: () => .3, birthCard: "moon" }));
});

const endTime = game => game.startedAt + game.rules.leadMs +
  game.round * (game.rules.litMs + game.rules.gapMs);
const started = (options = {}) => input(createGame({ random: () => 0, ...options }), { type: "start" }, 0);
const press = (game, lantern, now) => input(game, { type: "press", lantern }, now);

test("availability requires a mapped current active public venue, never a remote offer", () => {
  const cell = (tags, extra = {}) => ({ pois: [{ osmId: "node/17", tags }], ...extra });
  for (const amenity of ["community_centre", "arts_centre", "theatre", "festival_grounds"]) {
    assert.equal(available(cell({ amenity })), true);
    for (const access of ["no", "private", "customers", "members", "permit", "unknown"]) {
      assert.equal(available(cell({ amenity, access })), false);
    }
    for (const flag of ["disused", "abandoned", "demolished", "razed", "construction", "proposed", "closed"]) {
      assert.equal(available(cell({ amenity, [flag]: "yes" })), false);
      assert.equal(available(cell({ amenity, [flag]: "no" })), true);
      assert.equal(available(cell({ amenity, [`${flag}:amenity`]: amenity })), false);
    }
  }
  assert.equal(available(cell({ leisure: "festival_grounds", access: "public" })), true);
  assert.equal(available(cell({ event: "festival", access: "yes" })), true);
  assert.equal(available(cell({ amenity: "theatre" }, { unavailable: true })), false);
  for (const invalid of [null, {}, { pois: null }, { pois: [null, {}, { osmId: "remote", tags: { amenity: "theatre" } }] },
    cell({ amenity: "cafe" }), cell({ "disused:amenity": "theatre" })]) {
    assert.equal(available(invalid), false);
  }
});

test("levels strictly increase length and reward, and accelerate playback", () => {
  let previous;
  for (let level = 0; level <= 4; level++) {
    const rules = difficulty(level);
    const game = createGame({ level, random: () => 0 });
    assert.equal(game.phase, "ready");
    assert.equal(game.sequence.length, rules.length);
    assert.equal(rules.length, 7 + level);
    assert.equal(game.round, 1);
    assert.ok(game.sequence.every(value => value >= 0 && value < rules.lanternCount));
    assert.ok(Object.isFrozen(rules));
    if (previous) {
      assert.ok(rules.length > previous.length);
      assert.ok(rules.rewardMultiplier > previous.rewardMultiplier);
      assert.ok(rules.litMs < previous.litMs);
    }
    previous = rules;
  }
  for (const level of [-1, 5, 0.5, NaN, Infinity, "1", null]) {
    assert.throws(() => difficulty(level), RangeError);
    assert.throws(() => createGame({ level }), RangeError);
  }
});

test("three authored variants and bounded deterministic generation", () => {
  const authored = [0, 0.26, 0.51].map(value => createGame({ level: 4, random: () => value }));
  assert.equal(new Set(authored.map(game => game.sequence.join(","))).size, 3);
  const generator = () => {
    let seed = 8123;
    return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  };
  function generated() {
    const next = generator();
    let calls = 0;
    const game = createGame({ level: 4, random: () => ++calls === 1 ? 0.99 : next() });
    assert.equal(calls, 12);
    assert.equal(game.variant, 3);
    return game.sequence;
  }
  assert.deepEqual(generated(), generated());
  assert.ok(new Set(generated()).size > 1);
  for (const value of [-1, 1, Infinity, NaN, undefined, "0.5"]) {
    assert.throws(() => createGame({ random: () => value }), RangeError);
  }
  assert.throws(() => createGame({ random: 7 }), TypeError);
});

test("playback lead, lit/gap boundaries, repeated lanterns and input gate", () => {
  let game = started();
  const { leadMs, litMs, gapMs } = game.rules;
  assert.equal(game.litLantern, null);
  assert.equal(press(game, 0, 0).cursor, 0);
  game = advance(game, leadMs - 1);
  assert.equal(game.litLantern, null);
  game = advance(game, leadMs);
  assert.equal(game.litLantern, game.sequence[0]);
  assert.equal(game.nextAt, leadMs + litMs);
  game = advance(game, leadMs + litMs);
  assert.equal(game.litLantern, null);
  const end = endTime(game);
  game = advance(game, end - 1);
  assert.equal(game.phase, "playback");
  assert.equal(game.litLantern, null);
  assert.equal(press(game, 0, end - 1).cursor, 0);
  game = advance(game, end);
  assert.equal(game.phase, "input");
  assert.equal(game.nextAt, null);
  assert.equal(game.cursor, 0);
  assert.equal(press(game, game.sequence[0], end).cursor, 1);
  assert.equal(press(game, game.sequence[0], end).phase, "roundGap");
  assert.equal(advance(started(), end + 100_000).phase, "input");
});

test("Simon rounds grow from one item to 7–11, preserving every earlier item and awarding one point per round", () => {
  for (let level = 0; level <= 4; level++) {
    let game = started({ level });
    const initial = game, sequence = game.sequence;
    for (let round = 1; round <= 7 + level; round++) {
      assert.equal(game.round, round);
      assert.equal(game.phase, "playback");
      assert.equal(game.sequence, sequence);
      const now = endTime(game);
      game = advance(game, now - 1);
      assert.equal(game.phase, "playback");
      game = advance(game, now);
      assert.equal(game.phase, "input");
      for (let step = 0; step < round; step++) {
        game = press(game, sequence[step], now);
        assert.equal(game.score, step === round - 1 ? round : round - 1);
        assert.equal(game.cursor, step + 1);
        if (step < round - 1) assert.equal(game.phase, "input");
      }
      if (round < 7 + level) {
        assert.equal(result(game).score, 0, "unfinished runs cannot award rewards");
        assert.equal(game.phase, "roundGap");
        const nextAt = game.nextAt;
        assert.equal(press(game, sequence[0], nextAt - 1).cursor, round, "no early answer in intermission");
        game = advance(game, nextAt);
        assert.equal(game.cursor, 0);
        assert.equal(game.litLantern, null);
      }
    }
    assert.deepEqual(result(game), { completed: true, score: 7 + level, maxScore: 7 + level, cancelled: false, earningsMultiplier: 1 });
    assert.equal(input(game, { type: "cancel" }, game.updatedAt), game);
    assert.equal(press(game, 0, game.updatedAt), game);
    assert.equal(initial.score, 0);
    assert.equal(initial.round, 1);
  }
});

test("one wrong answer immediately ends Simon, even after earlier rounds succeeded", () => {
  const initial = started();
  const now = endTime(initial);
  let game = press(initial, initial.sequence[0], now);
  assert.equal(result(game).score, 0);
  game = advance(game, game.nextAt);
  const secondRoundEnd = endTime(game);
  game = press(game, game.sequence[0], secondRoundEnd);
  game = press(game, (game.sequence[1] + 1) % game.rules.lanternCount, secondRoundEnd);
  assert.equal(game.lastCorrect, false);
  assert.equal(game.cursor, 2);
  assert.equal(game.phase, "failed");
  assert.equal(game.score, 1);
  assert.equal(game.nextAt, null);
  assert.deepEqual(result(game), { completed: false, score: 0, maxScore: 7, cancelled: false, earningsMultiplier: 1 });
  assert.equal(press(game, game.sequence[2], secondRoundEnd), game);
  assert.equal(input(game, { type: "start" }, secondRoundEnd), game);
  assert.equal(initial.cursor, 0);
  assert.ok(Object.isFrozen(game));
  assert.ok(Object.isFrozen(game.sequence));
  assert.throws(() => { game.sequence[0] = 5; }, TypeError);
  assert.throws(() => { game.score = 100; }, TypeError);
});

test("cancel ready/playback/input forfeits score and is terminal", () => {
  const initial = createGame({ random: () => 0 });
  const playing = started();
  const answering = press(playing, playing.sequence[0], endTime(playing));
  for (const game of [initial, playing, answering]) {
    const cancelled = input(game, { type: "cancel" }, game.updatedAt);
    assert.deepEqual(result(cancelled), { completed: false, score: 0, maxScore: 7, cancelled: true, earningsMultiplier: 1 });
    assert.equal(cancelled.litLantern, null);
    assert.equal(cancelled.nextAt, null);
    assert.equal(press(cancelled, 0, cancelled.updatedAt), cancelled);
    assert.equal(input(cancelled, { type: "start" }, cancelled.updatedAt), cancelled);
  }
});

test("invalid time, state and controls fail without mutating the game", () => {
  const game = createGame({ now: 10, random: () => 0 });
  for (const now of [-1, NaN, Infinity, "10", Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => createGame({ now }), RangeError);
    assert.throws(() => advance(game, now), RangeError);
  }
  assert.throws(() => input(game, { type: "start" }, 9), RangeError);
  assert.throws(() => advance(advance(game, 20), 19), RangeError);
  for (const action of [null, "start", {}, { type: "win" }, { type: "press", lantern: -1 },
    { type: "press", lantern: 3 }, { type: "press", lantern: 0.5 }, { type: "press", lantern: "1" }]) {
    assert.throws(() => input(game, action, 10));
  }
  for (const forged of [null, {}, { ...game }]) {
    assert.throws(() => advance(forged, 10), TypeError);
    assert.throws(() => input(forged, { type: "cancel" }, 10), TypeError);
    assert.throws(() => result(forged), TypeError);
  }
  assert.equal(game.phase, "ready");
});
