import test from "node:test";
import assert from "node:assert/strict";
import { available, difficulty, createGame, input, advance, result, constellation, INK } from "../minigames/sketch.mjs";

const make = (level = 0, sample = 0) => createGame({ level, random: () => sample });
test("Star marks three occupied positions, connects only correct colours and never alters targets or raw scores", () => {
  for (let level = 0; level <= 19; level++) for (const sample of [0, 0.25, 0.5, 0.75]) {
    const normal = make(level, sample);
    for (const options of [{ journeyCard: "star" }, { dailyCard: "star" },
      { journeyCard: "star", dailyCard: "star" }]) {
      const initial = createGame({ level, random: () => sample, ...options });
      assert.deepEqual(initial.target, normal.target);
      assert.equal(new Set(initial.landmarks).size, 3);
      assert.ok(initial.landmarks.every(index => initial.target[index] > 0));
      assert.ok(Object.isFrozen(initial.landmarks));
      let game = drawing(initial);
      assert.deepEqual(constellation(game), []);
      const index = game.landmarks[0], row = Math.floor(index / game.width), col = index % game.width;
      if (game.colours > 1) {
        game = input(game, { type: "toggle", row, col, colour: game.target[index] % game.colours + 1 }, 2);
        assert.deepEqual(constellation(game), []);
      }
      game = input(game, { type: "toggle", row, col, colour: game.target[index] }, 2);
      assert.deepEqual(constellation(game), [index]);
      game = input(game, { type: "clear" }, 2);
      assert.deepEqual(constellation(game), []);
      const completed = input(reproduce(game), { type: "submit" }, 3);
      assert.equal(result(completed).score, result(input(reproduce(drawing(normal)), { type: "submit" }, 3)).score);
      assert.equal(result(completed).earningsMultiplier, 1.1);
      assert.equal(result(input(initial, { type: "cancel" }, 0)).earningsMultiplier, 1);
    }
    assert.deepEqual(normal.landmarks, []);
    assert.deepEqual(normal, createGame({ level, random: () => sample, dailyCard: "magician" }));
  }
});
const drawing = game => input(input(game, { type: "start" }, 0), { type: "remember" }, 1);
function reproduce(game, target = game.target) {
  for (let index = 0; index < target.length; index++) {
    if (target[index]) game = input(game, { type: "toggle", row: Math.floor(index / game.width),
      col: index % game.width, colour: Number(target[index]) }, 2);
  }
  return game;
}

test("availability uses only named mapped public spots or settlements in this cell", () => {
  const spot = { osmId: "node/123", name: "Lookout", category: "tourism", tags: { tourism: "viewpoint" } };
  assert.equal(available({ pois: [spot] }), true);
  assert.equal(available({ settlements: [{ osmId: "node/8", name: "Village" }] }), true);
  for (const cell of [null, {}, { terrain: "place" }, { terrain: "mountain", names: ["Pretty"] },
    { nearby: [spot] }, { unavailable: true, pois: [spot] },
    { tags: { access: "private" }, pois: [spot] }]) assert.equal(available(cell), false);
  for (const override of [
    { name: "" }, { osmId: "generated" }, { osmId: Symbol("bad") }, { category: "shop" }, { tags: {} },
    { tags: { tourism: "hotel" } },
    ...["private", "no", "customers", "permit"].map(access => ({ tags: { tourism: "viewpoint", access } })),
    { tags: { tourism: "viewpoint", abandoned: "yes" } },
    { tags: { tourism: "viewpoint", disused: "yes" } },
  ]) assert.equal(available({ pois: [{ ...spot, ...override }] }), false);
  assert.equal(available({ settlements: [{ osmId: "node/8", name: "Village",
    tags: { access: "private" } }] }), false);
  assert.equal(available({ settlements: [{ osmId: "node/8", name: "Village",
    tags: { abandoned: "yes" } }] }), false);
  assert.equal(available({ pois: "invalid", settlements: {} }), false);
});

test("all original scenes and levels are playable, progressively detailed and rewarded", () => {
  const sceneIds = new Set();
  for (const sample of [0, 0.25, 0.5, 0.75, 0.999]) {
    let previous = null;
    for (let level = 0; level <= 19; level++) {
      const game = make(level, sample);
      sceneIds.add(game.scene);
      assert.equal(game.target.length, (3 + Math.floor(level * 4 / 19)) ** 2);
      assert.equal(game.marks.length, game.target.length);
      assert.equal(game.colours, level < 7 ? 1 : level < 15 ? 2 : 4);
      assert.ok(game.target.every(value => Number.isInteger(value) && value >= 0 && value <= game.colours));
      assert.equal(new Set(game.target.filter(Boolean)).size, game.colours);
      assert.equal(difficulty(level).level, level);
      assert.equal(game.rewardMultiplier, 1 + level / 19);
      if (previous) {
        assert.ok(game.width >= previous.width);
        assert.ok(game.rewardMultiplier > previous.rewardMultiplier);
      }
      const complete = input(reproduce(drawing(game)), { type: "submit" }, 3);
      const output = result(complete);
      assert.equal(output.completed, true);
      assert.equal(output.cancelled, false);
      assert.equal(output.score, output.maxScore);
      assert.deepEqual(output.sketch.rows.join("").split("").map(c => INK.findIndex(ink => ink.symbol === c)), game.target);
      assert.equal(output.sketch.width, game.width);
      assert.equal(output.sketch.height, game.height);
      previous = game;
    }
  }
  assert.equal(sceneIds.size, 4);
});

test("explicit start, timed observation, early hide, and untimed drawing", () => {
  const game = make();
  assert.equal(game.phase, "ready");
  assert.equal(advance(game, 50000).phase, "ready");
  assert.equal(input(game, { type: "submit" }, 0).phase, "ready");
  const observing = input(game, { type: "start" }, 10);
  assert.equal(observing.phase, "observe");
  assert.equal(input(observing, { type: "toggle", row: 0, col: 0 }, 11).marks[0], 0);
  assert.equal(advance(observing, 10 + observing.observeMs - 1).phase, "observe");
  assert.equal(advance(observing, 10 + observing.observeMs).phase, "draw");
  assert.equal(advance(drawing(game), Number.MAX_SAFE_INTEGER).phase, "draw");
  const automatic = input(observing, { type: "toggle", row: 0, col: 0 }, 10 + observing.observeMs);
  assert.equal(automatic.phase, "draw");
  assert.equal(automatic.marks[0], 1);
});

test("intermediate levels bridge grid complexity without adding colours at the same time", () => {
  const medium = difficulty(10), harder = difficulty(14);
  assert.equal(medium.width, 5);
  assert.equal(medium.colours, 2);
  assert.ok(medium.observeMs >= 16000);
  assert.equal(harder.width, 5);
  assert.equal(harder.colours, 2);
  assert.ok(harder.observeMs >= 16000);
  for (const settings of [medium, harder]) {
    const observing = input(make(settings.level), { type: "start" }, 10);
    assert.equal(advance(observing, 10 + settings.observeMs - 1).phase, "observe");
    assert.equal(advance(observing, 10 + settings.observeMs).phase, "draw");
  }
  for (const level of [0, 1, 4]) {
    assert.equal(difficulty(level).colours, 1);
    assert.ok(difficulty(level).observeMs >= 9000);
  }
});

test("wrong, missing and excess ink reduce score; clear and toggling work", () => {
  let game = drawing(make());
  const targetIndex = game.target.indexOf(1);
  const extraIndex = game.target.indexOf(0);
  game = reproduce(game);
  game = input(game, { type: "toggle", row: Math.floor(targetIndex / game.width), col: targetIndex % game.width }, 2);
  game = input(game, { type: "toggle", row: Math.floor(extraIndex / game.width), col: extraIndex % game.width }, 2);
  const output = result(input(game, { type: "submit" }, 3));
  assert.equal(output.score, output.maxScore - 2);
  assert.equal(result(input(drawing(make()), { type: "submit" }, 3)).score, 0);
  const all = result(input(reproduce(drawing(make()), Array(9).fill(1)), { type: "submit" }, 3));
  assert.ok(all.score < all.maxScore, "filling the whole grid cannot earn a perfect score");
  assert.equal(result(input(reproduce(drawing(make()), make().target.map(ink => !ink)),
    { type: "submit" }, 3)).score, 0);
  assert.ok(input(game, { type: "clear" }, 3).marks.every(ink => !ink));
});

test("invalid options fail safely; invalid actions/times cannot change state", () => {
  for (const level of [-1, 20, 1.5, NaN, Infinity, "2", null])
    assert.throws(() => difficulty(level), RangeError);
  for (const sample of [-0.1, 1, NaN, Infinity, undefined, "0"])
    assert.throws(() => createGame({ random: () => sample }), RangeError);
  for (const now of [-1, NaN, Infinity, 1.5, "1", Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => createGame({ now }), TypeError);
  assert.throws(() => createGame({ random: null }), TypeError);
  const game = drawing(make());
  for (const action of [null, "submit", {}, { type: "wat" }, { type: "toggle", row: -1, col: 0 },
    { type: "toggle", row: 7, col: 0 }, { type: "toggle", row: 0, col: 7 },
    { type: "toggle", row: 0.5, col: 0 }, { type: "toggle", row: "0", col: 0 }])
    assert.equal(input(game, action, 9), game);
  for (const now of [0, -1, NaN, Infinity, 1.5, "2"]) {
    assert.equal(input(game, { type: "submit" }, now), game);
    assert.equal(advance(game, now), game);
  }
  assert.throws(() => result({}), TypeError);
  assert.throws(() => advance({}, 0), TypeError);
  assert.throws(() => input({}, { type: "start" }, 0), TypeError);
});

test("immutable states/results, terminal actions, and cancellation never award a sketch", () => {
  const initial = make();
  const game = reproduce(drawing(initial));
  assert.ok(initial.marks.every(ink => !ink));
  assert.throws(() => { game.marks[0] = true; }, TypeError);
  assert.throws(() => { game.target[0] = true; }, TypeError);
  assert.throws(() => { game.phase = "completed"; }, TypeError);
  assert.equal(result(game).score, 0);
  assert.equal(result(game).sketch, undefined);
  for (const source of [initial, input(initial, { type: "start" }, 0), game]) {
    const cancelled = input(source, { type: "cancel" }, 3);
    assert.deepEqual(result(cancelled), { completed: false, score: 0,
      maxScore: result(source).maxScore, cancelled: true, earningsMultiplier: 1 });
    assert.equal(input(cancelled, { type: "submit" }, 4), cancelled);
    assert.equal(advance(cancelled, 100000), cancelled);
  }
  const complete = input(game, { type: "submit" }, 3);
  assert.equal(input(complete, { type: "cancel" }, 4), complete);
  const output = result(complete);
  assert.ok(Object.isFrozen(output) && Object.isFrozen(output.sketch.rows));
  assert.equal(output.sketch.kind, "original-ascii");
  assert.equal(output.sketch.fictional, true);
  assert.ok(output.sketch.rows.every(row => /^[.#]{3}$/.test(row)));
  assert.ok(JSON.stringify(output).length < 500);
});

test("wrong colours lose points, repainting and erasing work, and clear preserves palette rules", () => {
  let game = reproduce(drawing(make(19)));
  const index = game.target.findIndex(value => value === 1);
  const position = { row: Math.floor(index / game.width), col: index % game.width };
  game = input(game, { type: "toggle", ...position, colour: 2 }, 2);
  assert.equal(result(input(game, { type: "submit" }, 3)).score, result(game).maxScore - 2);
  game = input(game, { type: "toggle", ...position, colour: 1 }, 2);
  assert.equal(result(input(game, { type: "submit" }, 3)).score, result(game).maxScore);
  game = input(game, { type: "toggle", ...position, colour: 0 }, 2);
  assert.equal(game.marks[index], 0);
  assert.equal(input(game, { type: "toggle", ...position, colour: 5 }, 2), game);
  assert.equal(input(game, { type: "toggle", row: 7, col: 0, colour: 1 }, 2), game);
  assert.ok(input(game, { type: "clear" }, 2).marks.every(value => value === 0));
});
