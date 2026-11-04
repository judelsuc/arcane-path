import test from "node:test";
import assert from "node:assert/strict";
import { PETANQUE, advance, available, ballPosition, boulePositions, computerAim, createGame, difficulty, grade, input, result, scoreEnd, simulateThrow, venue, groundAcceleration, groundHeight }
  from "../minigames/petanque.mjs";

const seq = values => { let i = 0; return () => values[i++ % values.length]; };
test("Strength offers one targeted carreau at any power without changing ordinary throws", () => {
  for (const options of [{ journeyCard: "strength" }, { dailyCard: "strength" },
    { journeyCard: "strength", dailyCard: "strength" }]) {
    const normal = createGame({ random: () => 0.5 });
    let game = createGame({ ...options, random: () => 0.5 });
    assert.deepEqual(computerAim(game), computerAim(normal));
    assert.deepEqual(game.terrain, normal.terrain);
    assert.equal(game.steadyActive, false);
    assert.equal(input(game, "steady", 0).steadyUsed, false);
    const target = { id: 0, owner: "computer", end: { x: 0, y: 6 }, out: false, distance: 0.5 };
    game = { ...game, throws: [target] };
    game = input(game, { type: "setPower", value: 100 }, 0);
    game = input(game, "steady", 0);
    assert.equal(game.steadyActive, true);
    assert.equal(game.steadyUsed, false);
    const thrown = input(game, { type: "carreau", targetId: 0 }, 0);
    assert.equal(thrown.steadyUsed, true);
    assert.equal(thrown.steadyActive, false);
    assert.equal(thrown.rolling.throw.carreau.success, true);
    const settled = advance(thrown, thrown.rolling.until);
    assert.equal(settled.throws[0].out, true);
    assert.deepEqual(settled.throws[1].end, target.end);
    const nextTurn = { ...settled, phase: "aiming" };
    assert.equal(input(nextTurn, "steady", nextTurn.updatedAt).steadyActive, false);
    assert.equal(result(input(game, "cancel", 0)).earningsMultiplier, 1);
    const timedOut = advance(game, game.rules.timeLimitMs);
    assert.equal(result(timedOut).earningsMultiplier, 1);
    assert.equal(timedOut.phase, "finished");
    const ordinary = input(input(createGame({ ...options, random: () => 0.5 }), { type: "setPower", value: 40 }, 0), "throw", 0);
    assert.deepEqual(ordinary.rolling, input(input(normal, { type: "setPower", value: 40 }, 0), "throw", 0).rolling);
  }
});

test("carreau chance boundaries, failures, targets and animation are deterministic at all five levels", () => {
  const normal = createGame({ random: () => 0.5 });
  assert.deepEqual(normal, createGame({ random: () => 0.5, dailyCard: "star" }));
  assert.equal(input(normal, "steady", 0).steadyActive, false);
  for (let level = 0; level < 5; level++) for (const success of [false, true]) {
    const base = createGame({ level, resonance: true, random: () => 0.5 });
    assert.equal(base.rules.carreauChance, [0.75, 0.65, 0.55, 0.45, 0.35][level]);
    const target = { id: 0, owner: "computer", end: { x: 0.25, y: 6 }, out: false, distance: 1 };
    const other = { id: 1, owner: "player", end: { x: -1, y: 4 }, out: false, distance: 3 };
    let game = { ...base, throws: [target, other], carreauDraw: base.rules.carreauChance - (success ? 0.000001 : 0) };
    game = input(game, "steady", 0);
    assert.equal(input(game, "steady", 0).steadyActive, false, "selection can be cancelled for free");
    assert.equal(input(game, "steady", 0).steadyUsed, false);
    for (const value of [0, 50, 100]) assert.equal(input(game, { type: "setPower", value }, 0).steadyActive, true);
    assert.throws(() => input(game, { type: "carreau", targetId: 99 }, 0), RangeError);
    assert.throws(() => input(game, { type: "carreau", targetId: "0" }, 0), RangeError);
    const outTarget = { ...game, throws: [{ ...target, out: true }, other] };
    assert.throws(() => input(outTarget, { type: "carreau", targetId: 0 }, 0), RangeError);
    game = input(game, { type: "carreau", targetId: target.id }, 0);
    assert.equal(game.rolling.throw.carreau.success, success);
    const contact = boulePositions(game, PETANQUE.flightMs).find(point => point.id === 2);
    assert.equal(contact.x, target.end.x);
    assert.equal(contact.y, target.end.y);
    game = advance(game, game.rolling.until);
    assert.equal(game.throws.length, 3);
    assert.deepEqual(game.throws[1].end, other.end);
    assert.equal(game.throws[0].out, success);
    assert.equal(game.throws[2].out, !success);
    assert.deepEqual(game.throws[success ? 2 : 0].end, target.end);
    assert.ok(Math.abs(game.throws[success ? 0 : 2].end.x) > PETANQUE.pitch.width / 2);
    assert.equal(game.phase, "computer");
    assert.ok(Object.isFrozen(game.throws[2].end));
  }
});

test("a fully played Strength match returns ×1.1 without changing either side's score", () => {
  function finish(options) {
    let game = createGame({ ...options, random: () => 0.5 });
    for (let steps = 0; game.phase !== "finished" && steps < 30; steps++) {
      game = game.phase === "aiming"
        ? input(input(game, { type: "setPower", value: 0 }, game.updatedAt), "throw", game.updatedAt)
        : advance(game, game.updatedAt + 10000);
    }
    assert.equal(game.phase, "finished");
    assert.equal(Boolean(game.timedOut), false);
    return result(game);
  }
  const normal = finish({});
  const resonant = finish({ journeyCard: "strength", dailyCard: "strength" });
  assert.equal(resonant.earningsMultiplier, 1.1);
  assert.deepEqual({ ...resonant, earningsMultiplier: 1 }, normal);
});
const pitch = (tags, osmId = "way/42") => ({ osmId, name: "Boulodrome", tags: { leisure: "pitch", sport: "boules", ...tags } });

function bestAim(game) {
  let best = null;
  for (let angle = PETANQUE.angle.min; angle <= PETANQUE.angle.max; angle += PETANQUE.angle.step)
    for (let power = 0; power <= 100; power += PETANQUE.power.step) {
      const sim = simulateThrow({ angle, power, terrain: game.terrain });
      if (sim.out) continue;
      const d = Math.hypot(sim.end.x - game.jack.x, sim.end.y - game.jack.y);
      if (!best || d < best.d) best = { angle, power, d };
    }
  return best;
}

function play(game, angle, power, now) {
  game = input(game, { type: "setAngle", value: angle }, now);
  game = input(game, { type: "setPower", value: power }, now);
  game = input(game, "throw", now);
  return advance(game, game.rolling.until);
}

test("venue requires a mapped, active, public boules/pétanque pitch in the current cell", () => {
  assert.equal(available({ pois: [pitch({})] }), true);
  assert.equal(available({ pois: [pitch({ sport: "petanque" })] }), true);
  assert.equal(available({ pois: [pitch({ sport: "soccer;boules" })] }), true);
  assert.deepEqual(venue({ pois: [pitch({})] }), { osmId: "way/42", name: "Boulodrome" });
  for (const tags of [{ sport: "soccer" }, { leisure: "park" }, { access: "private" }, { access: "members" },
    { disused: "yes" }, { abandoned: "yes" }, { construction: "pitch" }])
    assert.equal(available({ pois: [pitch(tags)] }), false, JSON.stringify(tags));
  assert.equal(available({ pois: [{ ...pitch({}), osmId: "invented" }] }), false);
  assert.equal(available({ pois: [{ osmId: "node/1", tags: { "disused:sport": "boules", leisure: "pitch" } }] }), false);
  assert.equal(available({ unavailable: true, pois: [pitch({})] }), false);
  assert.equal(available({ nearby: [pitch({})] }), false);
  for (const cell of [null, undefined, {}, { pois: "x" }]) assert.equal(available(cell), false);
});

test("difficulty levels 0-4 tighten targets, worsen terrain and raise rewardMultiplier", () => {
  const levels = [0, 1, 2, 3, 4].map(difficulty);
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i].radii.perfect < levels[i - 1].radii.perfect);
    assert.ok(levels[i].slope > levels[i - 1].slope);
    assert.ok(levels[i].jackDistance[1] > levels[i - 1].jackDistance[1]);
    assert.ok(levels[i].rewardMultiplier > levels[i - 1].rewardMultiplier);
  }
  assert.equal(levels[0].rewardMultiplier, 1);
  assert.equal(levels[4].rewardMultiplier, 2);
  for (const bad of [-1, 5, 1.5, "1", NaN]) assert.throws(() => difficulty(bad), RangeError);
  assert.ok(Object.isFrozen(levels[2].radii));
});

test("createGame validates inputs and is deterministic and frozen", () => {
  const a = createGame({ level: 3, random: seq([0.2, 0.7, 0.4]), now: 10 });
  const b = createGame({ level: 3, random: seq([0.2, 0.7, 0.4]), now: 10 });
  assert.deepEqual(a, b);
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.jack) && Object.isFrozen(a.terrain.slope));
  assert.equal(a.phase, "aiming");
  const [near, far] = difficulty(3).jackDistance;
  assert.ok(a.jack.y >= near && a.jack.y <= far);
  assert.throws(() => createGame({ level: 9 }), RangeError);
  assert.throws(() => createGame({ random: 3 }), TypeError);
  assert.throws(() => createGame({ random: () => 1 }), RangeError);
  assert.throws(() => createGame({ now: -1 }), RangeError);
  assert.equal(createGame().level, 0);
});

test("physics is deterministic, bounded and responds to power, direction and terrain", () => {
  const flat = { friction: 0.1, slope: { x: 0, y: 0 } };
  const one = simulateThrow({ angle: 0, power: 50, terrain: flat });
  assert.deepEqual(simulateThrow({ angle: 0, power: 50, terrain: flat }), one);
  assert.equal(one.end.x, 0);
  assert.ok(simulateThrow({ angle: 0, power: 60, terrain: flat }).end.y > one.end.y);
  assert.ok(simulateThrow({ angle: 5, power: 50, terrain: flat }).end.x > 0);
  assert.ok(simulateThrow({ angle: 0, power: 50, terrain: { friction: 0.07, slope: { x: 0, y: 0 } } }).end.y > one.end.y);
  assert.ok(simulateThrow({ angle: 0, power: 50, terrain: { friction: 0.1, slope: { x: 0.3, y: 0 } } }).end.x > 0.05);
  assert.equal(simulateThrow({ angle: 0, power: 100, terrain: flat }).out, true);
  assert.deepEqual(simulateThrow({ angle: 0, power: 0, terrain: flat }).end, { x: 0, y: 0 });
  assert.ok(one.rollMs <= PETANQUE.maxRollMs && one.path.length < 300);
});

test("scoring thresholds grade perfect, good, near, miss and out", () => {
  const radii = difficulty(0).radii;
  assert.equal(grade(radii.perfect, radii), "perfect");
  assert.equal(grade(radii.perfect + 0.01, radii), "good");
  assert.equal(grade(radii.good, radii), "good");
  assert.equal(grade(radii.near, radii), "near");
  assert.equal(grade(radii.near + 0.01, radii), "miss");
  assert.equal(grade(0, radii, true), "out");
});

test("smooth local slopes repel from bumps, attract into hollows, and vanish outside their radius", () => {
  const flat = { friction: 0.11, slope: { x: 0, y: 0 } };
  const feature = { x: 0.4, y: 4.5, radius: 1, height: 0.05, kind: "bump" };
  const bump = { ...flat, relief: [feature] };
  const hollow = { ...flat, relief: [{ ...feature, height: -feature.height, kind: "hollow" }] };
  assert.ok(groundAcceleration(bump, 0, 4.5).x < 0);
  assert.ok(groundAcceleration(hollow, 0, 4.5).x > 0);
  assert.equal(groundAcceleration(bump, 0.4, 4).y < 0, true);
  assert.deepEqual(groundAcceleration(bump, 2, 4.5), flat.slope);
  assert.deepEqual(groundAcceleration(bump, feature.x, feature.y), flat.slope);
  const shot = terrain => simulateThrow({ angle: 0, power: 50, terrain });
  assert.ok(shot(bump).end.x < shot(flat).end.x - 0.01);
  assert.ok(shot(hollow).end.x > shot(flat).end.x + 0.01);
  assert.notEqual(shot(bump).end.y, shot(flat).end.y);
  assert.deepEqual(shot(bump), shot(bump));
});

test("each random pitch has visible, bounded immutable bumps and hollows, growing with difficulty", () => {
  for (let level = 0; level <= 4; level++) {
    const game = createGame({ level, random: seq([0.1, 0.8, 0.3]) });
    assert.ok(game.terrain.relief.length >= 2 + level * 2 && game.terrain.relief.length <= 3 + level * 2);
    assert.equal(createGame({ level, random: () => 0 }).terrain.relief.length, 2 + level * 2);
    assert.equal(createGame({ level, random: () => 0.999 }).terrain.relief.length, 3 + level * 2);
    assert.equal(new Set(game.terrain.relief.map(feature => `${feature.x}:${feature.y}`)).size, game.terrain.relief.length);
    assert.ok(Object.isFrozen(game.terrain.relief));
    for (const feature of game.terrain.relief) {
      assert.ok(Object.isFrozen(feature));
      assert.ok(Math.abs(feature.x) <= 1.25);
      assert.ok(feature.y - feature.radius > 0);
      assert.ok(feature.y + feature.radius < PETANQUE.pitch.length);
      assert.ok(feature.kind === "bump" ? feature.height > 0 : feature.height < 0);
    }
  }
  assert.notDeepEqual(createGame({ random: () => 0.1 }).terrain.relief,
    createGame({ random: () => 0.9 }).terrain.relief);
});

test("varied relieved pitches offer at least a good scoring shot at each level", () => {
  for (const values of [[0.1, 0.6, 0.8], [0.5], [0.9, 0.1, 0.4]]) {
    for (let level = 0; level <= 4; level++) {
      const game = createGame({ level, random: seq(values) });
      const aim = bestAim(game);
      assert.ok(aim && aim.d <= game.rules.radii.good,
        `level ${level}, draws ${values}: closest ${aim?.d}`);
    }
  }
});

function computerTurn(game) {
  assert.equal(game.phase, "computer");
  const rolling = advance(game, game.computerAt);
  assert.equal(rolling.phase, "rolling");
  assert.equal(rolling.rolling.throw.owner, "computer");
  return advance(rolling, rolling.rolling.until);
}

test("six alternating boules use the same terrain; scores wait for the count animation", () => {
  for (let level = 0; level <= 4; level++) {
    let game = createGame({ level, random: seq([0.999, 0.999, 0.25]) });
    const aim = bestAim(game);
    assert.ok(aim.d <= game.rules.radii.perfect, `level ${level}: ${aim.d}`);
    for (let i = 0; i < 3; i++) {
      const playerSim = simulateThrow({ ...aim, terrain: game.terrain, balls: game.throws });
      game = play(game, aim.angle, aim.power, game.updatedAt);
      for (const body of playerSim.settled) {
        assert.deepEqual(game.throws.find(shot => shot.id === body.id).end, body.end);
      }
      const at = game.computerAt;
      assert.equal(input(game, "throw", game.updatedAt).phase, "computer");
      assert.equal(advance(game, at - 1).phase, "computer");
      const computerSim = simulateThrow({ ...computerAim(game), terrain: game.terrain, balls: game.throws });
      game = computerTurn(game);
      for (const body of computerSim.settled) {
        assert.deepEqual(game.throws.find(shot => shot.id === body.id).end, body.end);
      }
    }
    assert.deepEqual(game.throws.map(shot => shot.owner), ["player", "computer", "player", "computer", "player", "computer"]);
    for (const shot of game.throws) {
      const distance = Math.round(Math.hypot(shot.end.x - game.jack.x, shot.end.y - game.jack.y) * 1000) / 1000;
      assert.equal(shot.distance, shot.out ? null : distance);
    }
    assert.equal(game.phase, "counting");
    assert.equal(game.score, 0);
    assert.equal(game.opponentScore, 0);
    assert.equal(result(game).completed, false);
    const end = scoreEnd(game.throws);
    const startedAt = game.counting.startedAt;
    for (let point = 1; point <= end.points; point++) {
      game = advance(game, startedAt + point * PETANQUE.countMs);
      assert.equal(game.counting.awarded, point);
      assert.equal(game.score + game.opponentScore, point);
      assert.equal(game.phase, "counting");
      assert.equal(advance(game, game.updatedAt).counting.awarded, point, "stale ticks never double-count");
    }
    game = advance(game, startedAt + (end.points + 1) * PETANQUE.countMs);
    assert.equal(game.phase, "finished");
    assert.equal(game.score, end.winner === "player" ? end.points : 0);
    assert.equal(game.opponentScore, end.winner === "computer" ? end.points : 0);
    assert.equal(result(game).maxScore, 3);
    assert.equal(result(game).winner, end.winner);
    assert.equal(input(game, "throw", game.updatedAt + 10), game);
  }
});

test("petanque awards 1, 2 or 3 points only to the winner, nearest first; ties and out boules", () => {
  const shots = (owner, distances) => distances.map(distance => ({ owner, distance, out: distance === null }));
  for (const winner of ["player", "computer"]) {
    const loser = winner === "player" ? "computer" : "player";
    for (let points = 1; points <= 3; points++) {
      const winners = [0.3, points >= 2 ? 0.1 : 0.8, points >= 3 ? 0.2 : 1];
      const end = scoreEnd([...shots(winner, winners), ...shots(loser, [0.5, 0.7, 0.9])]);
      assert.equal(end.winner, winner);
      assert.equal(end.points, points);
      assert.deepEqual(end.indices, points === 1 ? [0] : points === 2 ? [1, 0] : [1, 2, 0]);
    }
  }
  assert.deepEqual(scoreEnd([...shots("player", [0.1, 0.2, null]), ...shots("computer", [0.1, 0.7, 1])]),
    { winner: null, points: 0, indices: [] });
  assert.deepEqual(scoreEnd([...shots("player", [0.1, 0.5, 0.7]), ...shots("computer", [0.5, null, null])]),
    { winner: "player", points: 1, indices: [0] }, "equal non-best boule is not counted");
  assert.equal(scoreEnd([...shots("player", [1, null, 10]), ...shots("computer", [null, null, null])]).points, 2);
  assert.deepEqual(scoreEnd(shots("player", [null, null, null])),
    { winner: null, points: 0, indices: [] });
  assert.equal(scoreEnd([{ owner: "player", distance: 0, out: true }, ...shots("computer", [3])]).winner, "computer");
});

test("short and out-of-bounds throws do not receive solo proximity points", () => {
  let game = createGame({ level: 0, random: seq([0.5]) });
  game = play(game, 0, 5, 0);
  assert.ok(game.throws[0].distance > 5);
  assert.equal(game.score, 0);
  game = computerTurn(game);
  game = play(game, 0, 100, game.updatedAt);
  assert.equal(game.throws[2].out, true);
  assert.equal(game.throws[2].distance, null);
  assert.equal(result(game).completed, false);
  assert.equal(game.score, 0);
});

test("aiming controls clamp, rolling locks input and invalid actions throw", () => {
  let game = createGame({ random: seq([0.5]) });
  const before = game;
  game = input(game, "right", 0);
  assert.equal(game.angle, PETANQUE.angle.step);
  assert.equal(before.angle, 0);
  game = input(game, "up", 0);
  assert.equal(game.power, 50 + PETANQUE.power.step);
  game = input(game, "down", 0);
  game = input(game, "left", 0);
  assert.equal(game.angle, 0);
  assert.equal(input(game, { type: "setAngle", value: 99 }, 0).angle, PETANQUE.angle.max);
  assert.equal(input(game, { type: "setPower", value: -5 }, 0).power, 0);
  assert.equal(input(game, { type: "setPower", value: 33.3 }, 0).power, 33.5);
  for (const bad of ["jump", null, { type: "setAngle" }, { type: "setPower", value: NaN }, 4])
    assert.throws(() => input(game, bad, 0));
  assert.throws(() => input(game, "left", NaN), RangeError);
  assert.throws(() => input({}, "left", 0), TypeError);
  assert.throws(() => advance(game, -1), RangeError);
  const rolling = input(game, "throw", 100);
  assert.equal(rolling.phase, "rolling");
  const locked = input(rolling, "left", 150);
  assert.equal(locked.angle, rolling.angle);
  assert.equal(locked.phase, "rolling");
  assert.equal(advance(rolling, rolling.rolling.until - 1).phase, "rolling");
  assert.equal(advance(rolling, rolling.rolling.until).phase, "computer");
  const opponent = advance(rolling, rolling.rolling.until + PETANQUE.computerThinkMs);
  assert.equal(opponent.rolling.throw.owner, "computer");
  assert.equal(input(opponent, "throw", opponent.updatedAt).rolling, opponent.rolling);
  assert.equal(advance(rolling, 50).updatedAt, 100);
  assert.deepEqual(ballPosition(rolling, rolling.rolling.startedAt + PETANQUE.flightMs), rolling.rolling.throw.landing);
});

test("time limit never invents boules or points, and cancellation gives neither side points", () => {
  let game = createGame({ random: seq([0.5]), now: 1000 });
  game = advance(game, 1000 + PETANQUE.timeLimitMs);
  assert.equal(game.phase, "finished");
  assert.equal(game.throws.length, 0);
  assert.deepEqual(result(game), { completed: true, score: 0, opponentScore: 0, winner: null, maxScore: 3, cancelled: false, timedOut: true, earningsMultiplier: 1 });
  let played = createGame({ random: seq([0.5]) });
  const aim = bestAim(played);
  played = play(played, aim.angle, aim.power, 0);
  const cancelled = input(played, "cancel", played.updatedAt + 1);
  assert.deepEqual(result(cancelled), { completed: false, score: 0, opponentScore: 0, winner: null, maxScore: 3, cancelled: true, timedOut: false, earningsMultiplier: 1 });
  assert.equal(advance(cancelled, 1e9), cancelled);
  assert.equal(input(cancelled, "throw", 1e9), cancelled);
  let late = createGame({ random: () => 0.5 });
  late = input(late, "throw", PETANQUE.timeLimitMs - 1);
  late = advance(late, PETANQUE.timeLimitMs);
  assert.equal(late.timedOut, true);
  assert.equal(late.throws.length, 0, "a still-moving boule is not settled after the deadline");
});

test("computer search is reproducible, quantized, skill-dependent and terrain-aware", () => {
  const flat = createGame({ random: () => 0.8 });
  const expert = createGame({ level: 4, random: () => 0.8 });
  assert.ok(expert.rules.computerAngleError < flat.rules.computerAngleError);
  assert.ok(expert.rules.computerPowerError < flat.rules.computerPowerError);
  assert.deepEqual(computerAim(flat), computerAim(createGame({ random: () => 0.8 })));
  assert.notDeepEqual(computerAim(flat), computerAim({ ...flat, terrain: { ...flat.terrain, friction: 0.2 } }));
  for (const game of [flat, expert]) {
    const aim = computerAim(game);
    assert.ok(aim.angle >= PETANQUE.angle.min && aim.angle <= PETANQUE.angle.max);
    assert.ok(aim.power >= 0 && aim.power <= 100);
    assert.equal(aim.angle % 0.5, 0);
    assert.equal(aim.power % 0.5, 0);
    const sim = simulateThrow({ ...aim, terrain: game.terrain });
    assert.ok(sim.out || Math.hypot(sim.end.x - game.jack.x, sim.end.y - game.jack.y) > 0.05, "computer is not a perfect-shot cheat");
  }
});

test("ground height and the gravity used by boules share the same smooth height field", () => {
  const terrain = createGame({ level: 4, random: () => 0.7 }).terrain;
  const delta = 0.00001;
  for (const { x, y } of [{ x: 0.3, y: 3.4 }, { x: -1, y: 9 }, { x: 0.8, y: 5.2 }]) {
    const acceleration = groundAcceleration(terrain, x, y);
    const dx = (groundHeight(terrain, x + delta, y) - groundHeight(terrain, x - delta, y)) / (2 * delta);
    const dy = (groundHeight(terrain, x, y + delta) - groundHeight(terrain, x, y - delta)) / (2 * delta);
    assert.ok(Math.abs(acceleration.x + PETANQUE.gravity * dx) < 0.00001);
    assert.ok(Math.abs(acceleration.y + PETANQUE.gravity * dy) < 0.00001);
  }
});

test("head-on and glancing hits transfer motion, deflect both boules and never mutate their input", () => {
  const terrain = { friction: 0.1, slope: { x: 0, y: 0 } };
  const balls = Object.freeze([Object.freeze({ id: 0, end: Object.freeze({ x: 0, y: 5 }) })]);
  const solo = simulateThrow({ angle: 0, power: 60, terrain });
  const hit = simulateThrow({ angle: 0, power: 60, terrain, balls });
  assert.ok(hit.impacts.length > 0);
  assert.deepEqual(hit.impacts[0].ids, [0, 1]);
  assert.ok(hit.settled[0].end.y > 6.5, "the struck boule receives momentum");
  assert.ok(hit.end.y < solo.end.y - 1, "the thrown boule loses momentum");
  assert.ok(hit.end.y < hit.settled[0].end.y, "the thrown boule cannot pass through its opponent");
  assert.deepEqual(balls[0].end, { x: 0, y: 5 });
  assert.deepEqual(hit, simulateThrow({ angle: 0, power: 60, terrain, balls }));
  assert.ok(Object.isFrozen(hit.frames[0].positions[0]));
  const glance = simulateThrow({ angle: 0, power: 60, terrain, balls: [{ id: 0, end: { x: 0.2, y: 5 } }] });
  assert.ok(glance.end.x < -0.3, "glancing impact diverts the thrown boule");
  assert.ok(glance.settled[0].end.x > 0.5, "glancing impact diverts the struck boule");
  const distant = simulateThrow({ angle: 0, power: 60, terrain, balls: [{ id: 0, end: { x: 1.5, y: 5 } }] });
  assert.equal(distant.impacts.length, 0);
  assert.deepEqual(distant.settled[0].end, { x: 1.5, y: 5 });
  assert.ok(Math.abs(distant.end.y - solo.end.y) < 0.002, "no-contact motion preserves the existing physics");
});

test("full-power approaches hit boules before the nominal landing point instead of passing through", () => {
  const terrain = { friction: 0.1, slope: { x: 0, y: 0 } };
  for (const power of [60, 80, 100]) {
    for (const angle of [-10, 0, 10]) {
      const radians = angle * Math.PI / 180;
      const target = { x: Math.sin(radians) * 4, y: Math.cos(radians) * 4 };
      const shot = simulateThrow({ angle, power, terrain, balls: [{ id: 0, end: target }] });
      assert.ok(shot.impacts.length > 0, `${angle} degrees, ${power} power hits before landing`);
      assert.ok(Math.abs(Math.hypot(shot.landing.x, shot.landing.y) - (4 - PETANQUE.bouleRadius * 2)) < 0.001);
      assert.ok(Math.hypot(shot.settled[0].end.x - target.x, shot.settled[0].end.y - target.y) > 0.1);
      for (const frame of shot.frames) {
        const [a, b] = frame.positions;
        if (!a.out && !b.out)
          assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= PETANQUE.bouleRadius * 2 - 0.002);
      }
      const fast = simulateThrow({ angle, power, terrain, balls: [{ id: 0, end: target }], recordFrames: false });
      assert.deepEqual(fast.settled, shot.settled, "computer and player use identical contact physics");
    }
  }
  const missed = simulateThrow({ angle: 0, power: 100, terrain, balls: [{ id: 0, end: { x: 0.5, y: 4 } }] });
  assert.deepEqual(missed.landing, { x: 0, y: 7 }, "a clear approach keeps its original carry");
  assert.equal(missed.impacts.length, 0);
  const nearest = simulateThrow({ angle: 0, power: 100, terrain, balls: [
    { id: 0, end: { x: 0, y: 6 } }, { id: 1, end: { x: 0, y: 4 } },
  ] });
  assert.ok(Math.abs(nearest.landing.y - 3.64) < 0.001, "the nearest contact wins, not array order");
});

test("chain reactions move multiple boules, knocked-out boules stay out, and final bodies do not overlap", () => {
  const terrain = { friction: 0.1, slope: { x: 0, y: 0 } };
  const chain = simulateThrow({ angle: 0, power: 60, terrain, balls: [
    { id: 0, end: { x: 0, y: 5 } }, { id: 1, end: { x: 0, y: 5.37 } },
  ] });
  assert.ok(chain.settled[0].end.y > 5.02);
  assert.ok(chain.settled[1].end.y > 6);
  assert.ok(chain.impacts.some(impact => impact.ids.includes(1)));
  for (const [index, a] of chain.settled.entries()) {
    for (const b of chain.settled.slice(index + 1)) {
      assert.ok(Math.hypot(a.end.x - b.end.x, a.end.y - b.end.y) >= PETANQUE.bouleRadius * 2 - 0.002);
    }
  }
  const knockout = simulateThrow({ angle: 0, power: 100, terrain: { ...terrain, friction: 0.03 },
    balls: [{ id: 0, end: { x: 0, y: 14.8 } }] });
  assert.equal(knockout.settled[0].out, true);
  assert.equal(knockout.out, false);
  assert.ok(knockout.settled[0].end.y > PETANQUE.pitch.length);
  const ignored = simulateThrow({ angle: 0, power: 60, terrain, balls: [{ id: 0, end: { x: 0, y: 5 }, out: true }] });
  assert.equal(ignored.impacts.length, 0);
  assert.deepEqual(ignored.end, simulateThrow({ angle: 0, power: 60, terrain }).end);
  assert.equal(ignored.settled[0].out, true);
  const overlap = simulateThrow({ angle: 0, power: 60, terrain, balls: [{ id: 0, end: { x: 0, y: 4.2 } }] });
  assert.ok(overlap.settled.every(ball => Number.isFinite(ball.end.x) && Number.isFinite(ball.end.y)));
  assert.ok(Math.hypot(overlap.end.x - overlap.settled[0].end.x, overlap.end.y - overlap.settled[0].end.y) >= PETANQUE.bouleRadius * 2 - 0.002);
  assert.ok(chain.rollMs <= PETANQUE.maxRollMs);
  assert.ok(chain.frames.length < PETANQUE.maxSteps);
  for (const balls of [[{ id: 0, end: { x: NaN, y: 4 } }], [{ id: 0 }], [{ id: 0, end: { x: 0, y: 5 } }, { id: 0, end: { x: 0, y: 6 } }]]) {
    assert.throws(() => simulateThrow({ angle: 0, power: 60, terrain, balls }), TypeError);
  }
});

test("the computer can hit a player boule; animation and scoring use the displaced positions", () => {
  let game = createGame({ random: () => 0.5 });
  const aim = bestAim(game);
  game = play(game, aim.angle, aim.power, 0);
  const original = game.throws[0];
  const rolling = advance(game, game.computerAt);
  assert.ok(rolling.rolling.impacts.length > 0);
  assert.deepEqual(boulePositions(rolling, rolling.updatedAt)[0], { id: 0, ...original.end, out: false });
  const lastImpact = rolling.rolling.impacts.at(-1);
  const displaced = boulePositions(rolling, rolling.rolling.startedAt + PETANQUE.flightMs + lastImpact.timeMs + 100);
  assert.notDeepEqual({ x: displaced[0].x, y: displaced[0].y }, original.end, "a struck boule moves during the throw, not only at its end");
  const settled = advance(rolling, rolling.rolling.until);
  assert.notDeepEqual(settled.throws[0].end, original.end);
  const distance = Math.round(Math.hypot(settled.throws[0].end.x - game.jack.x, settled.throws[0].end.y - game.jack.y) * 1000) / 1000;
  assert.equal(settled.throws[0].distance, distance);
  assert.deepEqual(rolling.throws[0], original, "earlier immutable states are preserved");
  const finalPositions = boulePositions(rolling, rolling.rolling.until);
  for (const shot of settled.throws) {
    const position = finalPositions.find(body => body.id === shot.id);
    assert.deepEqual({ x: position.x, y: position.y }, shot.end);
  }
});
