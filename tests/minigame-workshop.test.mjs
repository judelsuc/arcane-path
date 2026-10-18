import test from "node:test";
import assert from "node:assert/strict";
import { COLOURS } from "../minigames/workshop.mjs";
import { available, difficulty, createGame, input, advance, result, PARTS, samePart } from "../minigames/workshop.mjs";

const act = (game, type, rest = {}, now = game.now) => input(game, { type, ...rest }, now);
function assemble(game) {
  for (const part of PARTS) {
    const choice = game.choices[part].findIndex(value => samePart(value, game.model[part]));
    game = act(game, "choose", { part, choice });
  }
  return game;
}

test("all levels have an assembled model and unique solvable shelves with colour and size distractors", () => {
  for (let level = 0; level <= 4; level++) {
    for (const draw of [0, 0.1, 0.5, 0.999]) {
      const game = createGame({ level, random: () => draw, now: 10 });
      const rules = difficulty(level);
      assert.ok(Object.isFrozen(game));
      assert.ok(Object.isFrozen(game.model.frame));
      assert.ok(Object.isFrozen(game.choices.seat));
      for (const part of PARTS) {
        const target = game.model[part], choices = game.choices[part];
        assert.equal(choices.length, rules.options);
        assert.equal(new Set(choices.map(value => `${value.colour}/${value.size}`)).size, rules.options);
        assert.equal(choices.filter(value => samePart(value, target)).length, 1);
        assert.ok(choices.some(value => value.colour === target.colour && value.size !== target.size));
        assert.ok(choices.some(value => value.colour !== target.colour && value.size === target.size));
        assert.equal(game.selected[part], null);
      }
      const started = act(game, "start");
      const selected = assemble(started);
      const completed = act(selected, "submit");
      assert.equal(game.status, "ready");
      assert.equal(started.selected.frame, null);
      assert.equal(selected.status, "playing");
      assert.equal(completed.status, "completed");
      assert.deepEqual(result(completed), { completed: true, score: 1000, maxScore: 1000, cancelled: false, earningsMultiplier: 1 });
      assert.equal(act(completed, "cancel"), completed);
    }
  }
});

test("incomplete and mismatching builds can be corrected, without resetting the clock", () => {
  let game = act(createGame({ now: 100 }), "start");
  game = act(game, "submit");
  assert.equal(game.feedback, "incomplete");
  game = assemble(game);
  const part = "seat", target = game.model[part];
  const wrongSize = game.choices[part].findIndex(value => value.colour === target.colour && value.size !== target.size);
  game = act(game, "choose", { part, choice: wrongSize }, 1000);
  game = act(game, "submit");
  assert.equal(game.status, "playing");
  assert.equal(game.feedback, "mismatch");
  assert.equal(result(game).score, 0);
  const wrongColour = game.choices[part].findIndex(value => value.colour !== target.colour && value.size === target.size);
  game = act(game, "choose", { part, choice: wrongColour }, 2000);
  game = act(game, "submit");
  assert.equal(game.feedback, "mismatch");
  assert.equal(game.startedAt, 100);
  game = assemble(game);
  assert.equal(act(game, "submit").status, "completed");
});

test("time starts only on Start, survives selections, and expires exactly at the deadline", () => {
  let game = createGame({ level: 4 });
  game = advance(game, 500000);
  assert.equal(game.status, "ready");
  assert.equal(game.startedAt, null);
  game = act(game, "start");
  const end = game.startedAt + difficulty(4).timeMs;
  game = assemble(game);
  const before = advance(game, end - 1);
  assert.equal(act(before, "submit").status, "completed");
  const expired = act(game, "submit", {}, end);
  assert.equal(expired.status, "failed");
  assert.equal(expired.feedback, "timeout");
  assert.equal(result(expired).completed, false);
  assert.equal(result(expired).score, 0);
  assert.equal(advance(game, 1e12).status, "failed");
  assert.equal(advance(expired, end + 1000), expired);
});

test("a late choose action cannot beat the deadline and Start cannot reset a running timer", () => {
  let game = act(createGame(), "start");
  game = act(game, "start", {}, 1000);
  assert.equal(game.startedAt, 0);
  const expired = act(game, "choose", { part: "frame", choice: 0 }, difficulty(0).timeMs);
  assert.equal(expired.status, "failed");
  assert.equal(expired.selected.frame, null);
});

test("cancellation from ready or partially built is terminal and never rewards", () => {
  for (const playing of [false, true]) {
    let game = createGame();
    if (playing) game = assemble(act(game, "start"));
    game = act(game, "cancel");
    assert.deepEqual(result(game), { completed: false, score: 0, maxScore: 1000, cancelled: true, earningsMultiplier: 1 });
    assert.equal(advance(game, 1e12), game);
    assert.equal(act(game, "start"), game);
  }
});

test("fresh rounds vary and difficulty increases choices while reducing time", () => {
  assert.notDeepEqual(createGame({ random: () => 0 }).model, createGame({ random: () => 0.9 }).model);
  assert.equal(difficulty(0).timeMs, 60000);
  assert.equal(difficulty(4).timeMs, 36000);
  for (let level = 1; level <= 4; level++) {
    assert.ok(difficulty(level).options > difficulty(level - 1).options);
    assert.ok(difficulty(level).timeMs < difficulty(level - 1).timeMs);
  }
});

test("invalid inputs, clocks, choices and forged states fail explicitly", () => {
  for (const level of [-1, 5, 1.5, "1", NaN]) assert.throws(() => createGame({ level }));
  for (const random of [() => 1, () => -0.1, () => NaN, () => "0", null]) assert.throws(() => createGame({ random }));
  for (const now of [-1, Infinity, NaN, "0", Number.MAX_SAFE_INTEGER]) assert.throws(() => createGame({ now }));
  const game = createGame({ now: 5 });
  assert.throws(() => advance(game, 4));
  for (const action of [null, { type: "bogus" }, { type: "choose", part: "seat", choice: -1 },
    { type: "choose", part: "seat", choice: 3 }, { type: "choose", part: "seat", choice: NaN },
    { type: "choose", part: "bell", choice: 0 }, { type: "submit", extra: true }]) {
    assert.throws(() => input(game, action, 5));
  }
  for (const patch of [{ selected: {} }, { model: {} }, { choices: {} }, { status: "completed" },
    { version: 1 }, { extra: true }, { feedback: "invented" }, { startedAt: 10 },
    { choices: { ...game.choices, seat: Array(3).fill(game.model.seat) } },
    { model: { ...game.model, frame: { colour: "purple", size: "small" } } }]) {
    assert.throws(() => advance({ ...game, ...patch }, 5));
  }
});

test("only current-cell mapped public active bicycle venues qualify", () => {
  const cell = tags => ({ pois: [{ osmId: "node/23", tags }] });
  for (const tags of [{ shop: "bicycle" }, { amenity: "bicycle_repair_station" },
    { "service:bicycle:repair": "yes", access: "customers" }, { shop: "bicycle", disused: "no" }]) {
    assert.equal(available(cell(tags)), true);
  }
  for (const tags of [{ shop: "car" }, { shop: "bicycle", access: "private" },
    { shop: "bicycle", access: "no" }, { shop: "bicycle", access: "permit" },
    { shop: "bicycle", disused: "yes" }, { shop: "bicycle", abandoned: "yes" },
    { shop: "bicycle", "disused:shop": "bicycle" }, { shop: "bicycle", construction: "yes" }]) {
    assert.equal(available(cell(tags)), false);
  }
  for (const value of [null, {}, { pois: {} }, { pois: [null] },
    { pois: [{ tags: { shop: "bicycle" }, osmId: "invented" }] },
    { ...cell({ shop: "bicycle" }), unavailable: true },
    { neighbours: [cell({ shop: "bicycle" })] }]) assert.equal(available(value), false);
});
test("Magician replaces exactly one exact match with a repaintable correct-size piece at every level", () => {
  for (let level = 0; level <= 4; level++) for (const options of [
    { journeyCard: "magician" }, { dailyCard: "magician" },
    { journeyCard: "magician", dailyCard: "magician" },
  ]) {
    let game = createGame({ level, ...options, random: () => 0.4 });
    const special = game.repaintPart;
    assert.equal(game.resonance, true);
    assert.equal(PARTS.filter(part => !game.choices[part].some(value => samePart(value, game.model[part]))).length, 1);
    assert.equal(game.choices[special].filter(value => value.size === game.model[special].size).length, 1);
    assert.equal(result(game).earningsMultiplier, 1);
    game = input(game, { type: "start" }, 0);
    assert.equal(input(game, { type: "repaint", colour: game.model[special].colour }, 0).selected[special], null);
    for (const part of PARTS) {
      const choice = game.choices[part].findIndex(value => part === special
        ? value.size === game.model[part].size : samePart(value, game.model[part]));
      game = input(game, { type: "choose", part, choice }, 1);
    }
    assert.equal(input(game, { type: "submit" }, 2).status, "playing");
    for (const colour of COLOURS) {
      const painted = input(game, { type: "repaint", colour }, 2);
      assert.equal(painted.selected[special].colour, colour);
      assert.equal(painted.selected[special].size, game.model[special].size);
    }
    game = input(game, { type: "repaint", colour: game.model[special].colour }, 3);
    const completed = input(game, { type: "submit" }, 4);
    assert.equal(result(completed).score, 1000);
    assert.equal(result(completed).earningsMultiplier, 1.1);
    assert.equal(result(input(game, { type: "cancel" }, 4)).earningsMultiplier, 1);
    assert.equal(result(advance(game, game.startedAt + difficulty(level).timeMs)).earningsMultiplier, 1);
  }
});

test("normal workshop retains six exact choices and ignores repaint attempts", () => {
  const normal = createGame({ random: () => 0.3 });
  assert.deepEqual(normal, createGame({ random: () => 0.3, dailyCard: "star" }));
  const playing = input(normal, { type: "start" }, 0);
  const repainted = input(playing, { type: "repaint", colour: "red" }, 0);
  assert.deepEqual(repainted, playing);
  assert.equal(normal.repaintPart, null);
});

test("Magician can repaint every fitted part, including wrong sizes, without changing geometry", () => {
  for (let level = 0; level <= 4; level++) {
    let game = createGame({ level, resonance: true, random: () => 0 });
    game = input(game, { type: "start" }, 0);
    for (const part of PARTS) {
      const choice = game.choices[part].findIndex(value => value.size !== game.model[part].size);
      game = input(game, { type: "choose", part, choice }, 2);
      const size = game.selected[part].size;
      for (const colour of COLOURS) {
        game = input(game, { type: "repaint", part, colour }, 2);
        assert.equal(game.selected[part].colour, colour);
        assert.equal(game.selected[part].size, size);
        assert.doesNotThrow(() => result(game));
      }
    }
    assert.throws(() => input(game, { type: "repaint", part: "unknown", colour: "red" }, 2), /action/);
  }
});
