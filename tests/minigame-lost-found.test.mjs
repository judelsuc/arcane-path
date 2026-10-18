import test from "node:test";
import assert from "node:assert/strict";
import { available, difficulty, createGame, input, advance, result } from "../minigames/lost-found.mjs";

test("Moon card matches activate exactly one inspect-and-confirm pair without changing the 15-second clock", () => {
  for (const options of [{ resonance: true }, { journeyCard: "moon" }, { birthCard: "moon" }, { dailyCard: "moon" }, { journeyCard: "moon", dailyCard: "moon" }]) {
    for (let level = 0; level <= 4; level++) {
      let game = createGame({ level, random: () => .3, now: 100, ...options });
      assert.equal(game.resonance, true);
      assert.equal(game.objects.filter(object => object.inspectRequired).length, 2);
      const pair = game.objects.filter(object => object.inspectRequired);
      assert.deepEqual(pair[0].label, pair[1].label);
      assert.notDeepEqual(pair[0].detail, pair[1].detail);
      while (game.status === "playing") {
        const objectId = game.reports[game.index].objectId;
        const object = game.objects.find(item => item.id === objectId);
        if (object.inspectRequired) {
          const blocked = input(game, { type: "match", objectId }, game.now);
          assert.equal(blocked, game);
          assert.equal(input(game, { type: "confirm", objectId }, game.now), game);
          game = input(game, { type: "inspect", objectId }, game.now + 10);
          assert.equal(game.startedAt, 100);
          assert.equal(game.timeLimitMs, 15000);
          assert.equal(game.mistakes, 0);
          const score = game.score;
          game = input(game, { type: "inspect", objectId }, game.now + 10);
          assert.equal(game.score, score, "inspection never answers");
          game = input(game, { type: "confirm", objectId }, game.now);
        } else game = input(game, { type: "match", objectId }, game.now);
      }
      assert.equal(result(game).earningsMultiplier, 1.1);
      assert.equal(result(game).score, 4 + level);
    }
  }
  let game = createGame({ resonance: true });
  game = input(game, { type: "inspect", objectId: "umbrella-moon" }, 14999);
  game = input(game, { type: "confirm", objectId: "umbrella-moon" }, 15000);
  assert.equal(game.status, "timedOut");
  assert.equal(game.mistakes, 0);
  assert.equal(result(game).earningsMultiplier, 1);
  assert.equal(result(input(createGame({ resonance: true }), { type: "cancel" }, 0)).earningsMultiplier, 1);
  assert.deepEqual(createGame({ random: () => .3 }), createGame({ random: () => .3, journeyCard: "hermit" }));
});

const create = level => createGame({ level, random: () => 0.25 });
const solve = game => {
  while (game.status === "playing") {
    game = input(game, { type: "match", objectId: game.reports[game.index].objectId }, game.now + 1);
  }
  return game;
};

test("levels 0–4 are bounded, harder, immutable and perfectly solvable", () => {
  let multiplier = 0;
  for (let level = 0; level <= 4; level++) {
    const settings = difficulty(level);
    assert.equal(settings.objectCount, 4 + level);
    assert.equal(settings.timeLimitMs, 15000);
    assert.ok(settings.rewardMultiplier > multiplier);
    multiplier = settings.rewardMultiplier;
    const game = create(level);
    assert.equal(game.objects.length, 4 + level);
    assert.ok(Object.isFrozen(game));
    assert.ok(Object.isFrozen(game.objects[0].label));
    assert.throws(() => { game.reports[0].objectId = "forged"; }, TypeError);
    const completed = solve(game);
    assert.deepEqual(result(completed), { completed: true, score: 4 + level, maxScore: 4 + level, cancelled: false, timedOut: false, earningsMultiplier: 1 });
    assert.equal(game.score, 0);
    assert.equal(game.remaining.length, 4 + level);
    assert.equal(input(completed, { type: "cancel" }, completed.now), completed);
    assert.equal(advance(completed, completed.now + 50), completed);
  }
  assert.notEqual(create(0).reports[0].description.en, create(4).reports.find(
    item => item.objectId === create(0).reports[0].objectId).description.en);
});

test("handwritten clues distinguish lookalikes in both languages, at every level", () => {
  const distinguishing = {
    "umbrella-moon": [/moon|crescent/i, /lune|croissant/i],
    "umbrella-star": [/star|five.point|five points/i, /étoile|cinq point/i],
    "notebook-leaf": [/leaf|branch/i, /feuille|branche/i],
    "notebook-flower": [/flower|petals/i, /fleur|pétales/i],
    "keys-fish": [/fish|swimmer|fins/i, /poisson|nageur|nageoires/i],
    "keys-bird": [/bird|feather|wings/i, /oiseau|plumes|ailes/i],
    "pouch-square": [/square|four.corner|four right|four equal/i, /carrée|quatre coins|quatre angles|quatre côtés/i],
    "pouch-round": [/round|without corners|circle|without.*corner/i, /ronde|sans coins|cercle|sans.*coin/i],
  };
  for (let level = 0; level <= 4; level++) {
    const game = create(level);
    assert.equal(new Set(game.reports.map(item => item.objectId)).size, game.objects.length);
    for (const [lang, index] of [["en", 0], ["fr", 1]]) {
      assert.equal(new Set(game.objects.map(item => item.label[lang])).size, game.objects.length);
      assert.equal(new Set(game.reports.map(item => item.description[lang])).size, game.objects.length);
      for (const report of game.reports) {
        assert.equal(game.objects.filter(item => item.id === report.objectId).length, 1);
        assert.match(report.description[lang], distinguishing[report.objectId][index]);
      }
    }
  }
});

test("three errors fail without completing; correct matches consume objects only once", () => {
  let game = create(0);
  const original = game;
  const correct = game.reports[0].objectId;
  game = input(game, { type: "match", objectId: correct }, 1);
  assert.equal(game.score, 1);
  assert.throws(() => input(game, { type: "match", objectId: correct }, 2), TypeError);
  const wrong = game.remaining.find(id => id !== game.reports[game.index].objectId);
  for (let i = 0; i < 3; i++) game = input(game, { type: "match", objectId: wrong }, 2 + i);
  assert.equal(game.status, "failed");
  assert.equal(game.mistakes, 3);
  assert.equal(game.error, "mismatch");
  assert.equal(original.mistakes, 0);
  assert.deepEqual(result(game), { completed: false, score: 1, maxScore: 4, cancelled: false, timedOut: false, earningsMultiplier: 1 });
  assert.equal(input(game, { type: "match", objectId: wrong }, 5), game);
});

test("cancel discards partial reward and remains terminal", () => {
  let game = create(4);
  game = input(game, { type: "match", objectId: game.reports[0].objectId }, 10);
  game = input(game, { type: "cancel" }, 11);
  assert.deepEqual(result(game), { completed: false, score: 0, maxScore: 8, cancelled: true, timedOut: false, earningsMultiplier: 1 });
  assert.equal(input(game, { type: "cancel" }, 12), game);
  assert.equal(advance(game, 10000), game);
});

test("rejects invalid levels, RNG, actions, forged states and decreasing/unsafe time", () => {
  for (const level of [-1, 5, 1.5, NaN, Infinity, "1", null]) {
    assert.throws(() => difficulty(level), RangeError);
    assert.throws(() => createGame({ level }), RangeError);
  }
  for (const sample of [-0.1, 1, NaN, Infinity, "0"]) {
    assert.throws(() => createGame({ random: () => sample }), RangeError);
  }
  assert.throws(() => createGame({ random: null }), TypeError);
  let game = create(0);
  for (const action of [null, {}, { type: "start" }, { type: "match" }, { type: "match", objectId: "missing" }]) {
    assert.throws(() => input(game, action, 0), TypeError);
  }
  for (const now of [-1, 0.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "1"]) {
    assert.throws(() => createGame({ now }), RangeError);
    assert.throws(() => advance(game, now), RangeError);
    assert.throws(() => input(game, { type: "cancel" }, now), RangeError);
  }
  game = advance(game, 10);
  assert.throws(() => advance(game, 9), RangeError);
  assert.throws(() => input(game, { type: "cancel" }, 9), RangeError);
  for (const forged of [{ ...game }, JSON.parse(JSON.stringify(game)), null]) {
    assert.throws(() => result(forged), TypeError);
    assert.throws(() => advance(forged, 10), TypeError);
    assert.throws(() => input(forged, { type: "cancel" }, 10), TypeError);
  }
});

test("shuffling varies presentation without changing one-to-one solvability", () => {
  const first = createGame({ level: 4, random: () => 0 });
  const last = createGame({ level: 4, random: () => 0.999999 });
  assert.notDeepEqual(first.objects, last.objects);
  assert.notDeepEqual(first.reports, last.reports);
  assert.equal(result(solve(first)).score, 8);
  assert.equal(result(solve(last)).score, 8);
});

test("availability is current loaded settlement or mapped active public lost-property context only", () => {
  const settlement = { osmId: "node/1", name: "Fiction test town" };
  assert.equal(available({ terrain: "place", settlements: [settlement] }), true);
  const poi = tags => ({ osmId: "way/2", name: "Public test venue", tags });
  for (const tags of [{ amenity: "library" }, { amenity: "community_centre" }, { amenity: "bus_station" },
    { railway: "station" }, { public_transport: "station" }, { amenity: "lost_property" }]) {
    assert.equal(available({ pois: [poi(tags)] }), true);
    for (const restriction of [{ access: "private" }, { access: "no" }, { access: "customers" },
      { disused: "yes" }, { abandoned: "yes" }, { "disused:amenity": tags.amenity ?? "station" },
      { construction: "yes" }]) {
      assert.equal(available({ pois: [poi({ ...tags, ...restriction })] }), false);
    }
  }
  for (const cell of [null, {}, { terrain: "place" }, { settlements: [settlement] },
    { unavailable: true, terrain: "place", settlements: [settlement] },
    { loaded: false, pois: [poi({ amenity: "library" })] },
    { tags: { access: "private" }, terrain: "place", settlements: [settlement] },
    { pois: [{ ...poi({ amenity: "library" }), osmId: "invented" }] },
    { pois: [{ ...poi({ amenity: "library" }), name: "" }] },
    { pois: [poi({ amenity: "cafe" })] },
    { nearby: { pois: [poi({ amenity: "library" })] } }]) assert.equal(available(cell), false);
});

test("15-second deadline starts at creation and expires exactly, including before a late match", () => {
  for (let level = 0; level <= 4; level++) {
    const initial = createGame({ level, random: () => 0.25, now: 5000 });
    let game = advance(initial, 19999);
    assert.equal(game.status, "playing");
    const objectId = game.reports[0].objectId;
    const atBoundary = input(game, { type: "match", objectId }, 20000);
    assert.equal(atBoundary.status, "timedOut");
    assert.equal(atBoundary.score, 0, "the match at the deadline must not count");
    game = input(game, { type: "match", objectId }, 19999);
    assert.equal(game.score, 1);
    const expired = advance(game, 20000);
    assert.equal(expired.status, "timedOut");
    assert.deepEqual(result(expired), { completed: false, score: 1, maxScore: 4 + level, cancelled: false, timedOut: true, earningsMultiplier: 1 });
    assert.equal(advance(expired, 100000), expired);
    assert.equal(input(expired, { type: "cancel" }, 100000), expired);
    assert.equal(initial.score, 0);
    assert.equal(initial.status, "playing");
  }
});
