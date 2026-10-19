import { resolveResonance, resonanceResult } from "../arcane-resonance.mjs";
// Village pétanque: pure, deterministic engine. Every state is a deeply frozen plain object.

export const PETANQUE = Object.freeze({
  boules: 3,
  pitch: Object.freeze({ width: 4, length: 15 }),
  angle: Object.freeze({ min: -30, max: 30, step: 0.5 }),
  power: Object.freeze({ min: 0, max: 100, step: 0.5 }),
  carryMax: 7,
  rollSpeedMax: 4.2,
  gravity: 9.81,
  dt: 1 / 120,
  maxSteps: 2400,
  flightMs: 600,
  maxRollMs: 2400,
  timeLimitMs: 180000,
  computerThinkMs: 900,
  countMs: 850,
  // Enlarged boules keep contact readable at the preview's top-down scale.
  bouleRadius: 0.18,
  restitution: 0.72,
});

const LEVELS = Object.freeze([
  { label: "easy", terrain: "smooth", friction: 0.11, slope: 0, jack: [6, 7], radii: [0.3, 0.7, 1.4], rewardMultiplier: 1 },
  { label: "steady", terrain: "gravel", friction: 0.1, slope: 0.12, jack: [6, 8], radii: [0.25, 0.6, 1.2], rewardMultiplier: 1.25 },
  { label: "tricky", terrain: "packed", friction: 0.085, slope: 0.22, jack: [6.5, 9], radii: [0.2, 0.5, 1], rewardMultiplier: 1.5 },
  { label: "hard", terrain: "sloped", friction: 0.075, slope: 0.32, jack: [7, 10], radii: [0.16, 0.42, 0.85], rewardMultiplier: 1.75 },
  { label: "expert", terrain: "rough", friction: 0.065, slope: 0.42, jack: [8, 11], radii: [0.12, 0.35, 0.7], rewardMultiplier: 2 },
].map(level => deepFreeze(level)));

const ACTIONS = new Set(["left", "right", "up", "down", "throw", "cancel", "setAngle", "setPower", "steady", "carreau"]);
const OSM_ID = /^(node|way|relation)\/\d+$/;
const CLOSED_ACCESS = new Set(["private", "no", "members", "customers", "permit", "delivery"]);
const INACTIVE = new Set(["yes", "true", "1"]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor || 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function snap(value, step) {
  return round(Math.round(value / step) * step, 3);
}

function checkLevel(level) {
  if (!Number.isInteger(level) || level < 0 || level >= LEVELS.length)
    throw new RangeError(`Pétanque level must be an integer from 0 to ${LEVELS.length - 1}.`);
  return level;
}

function checkNow(now) {
  if (typeof now !== "number" || !Number.isFinite(now) || now < 0)
    throw new RangeError("Pétanque time must be a finite, non-negative number of milliseconds.");
  return now;
}

function checkGame(game) {
  if (!game || typeof game !== "object" || game.kind !== "petanque" || !Array.isArray(game.throws))
    throw new TypeError("Expected a pétanque game state.");
  return game;
}

function draw(random) {
  const value = random();
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 1)
    throw new RangeError("Pétanque random() must return a number in [0, 1).");
  return value;
}

function boulesPitch(poi) {
  const tags = poi?.tags;
  if (!tags || typeof tags !== "object" || !OSM_ID.test(String(poi.osmId ?? ""))) return false;
  const sports = String(tags.sport ?? "").split(";").map(s => s.trim().toLowerCase());
  if (!sports.some(s => s === "boules" || s === "petanque")) return false;
  if (tags.leisure !== "pitch") return false;
  if (CLOSED_ACCESS.has(String(tags.access ?? "").toLowerCase())) return false;
  return !["disused", "abandoned", "demolished", "razed", "construction"]
    .some(key => tags[key] !== undefined && tags[key] !== "no" && (INACTIVE.has(String(tags[key]).toLowerCase()) || key === "construction"));
}

/** Mapped, active, public boules/pétanque pitch in this exact cell, or null. */
export function venue(cell) {
  if (!cell || typeof cell !== "object" || cell.unavailable || !Array.isArray(cell.pois)) return null;
  const pitch = cell.pois.find(boulesPitch);
  return pitch ? deepFreeze({ osmId: pitch.osmId, name: pitch.name ?? pitch.tags.name ?? null }) : null;
}

export function available(cell) {
  return venue(cell) !== null;
}

export function difficulty(level = 0) {
  const spec = LEVELS[checkLevel(level)];
  const [perfect, good, near] = spec.radii;
  return deepFreeze({
    level, label: spec.label, terrain: spec.terrain, friction: spec.friction, slope: spec.slope,
    jackDistance: [...spec.jack], radii: { perfect, good, near },
    rewardMultiplier: spec.rewardMultiplier, boules: PETANQUE.boules,
    maxScore: PETANQUE.boules, timeLimitMs: PETANQUE.timeLimitMs,
    reliefCount: { min: 2 + level * 2, max: 3 + level * 2 }, reliefHeight: 0.008 + level * 0.003,
    computerAngleError: [5, 3.5, 2.5, 1.5, 0.75][level],
    computerPowerError: [7, 5, 3.5, 2, 1][level],
    carreauChance: [0.75, 0.65, 0.55, 0.45, 0.35][level],
  });
}

export function createGame({ level = 0, random = Math.random, now = 0, ...options } = {}) {
  const resonance = resolveResonance("petanque", options);
  const rules = difficulty(level);
  if (typeof random !== "function") throw new TypeError("Pétanque random must be a function.");
  checkNow(now);
  const [near, far] = rules.jackDistance;
  const jack = {
    x: round((draw(random) * 2 - 1) * (0.25 + 0.25 * level), 2),
    y: round(near + draw(random) * (far - near), 2),
  };
  const heading = draw(random) * Math.PI * 2;
  const slope = { x: round(Math.cos(heading) * rules.slope, 3), y: round(Math.sin(heading) * rules.slope, 3) };
  const reliefCount = rules.reliefCount.min + Math.floor(draw(random) * 2);
  const cells = Array.from({ length: 12 }, (_, index) => index);
  const relief = Array.from({ length: reliefCount }, (_, index) => {
    // Sample distinct areas so opposite features cannot cancel at the same centre.
    const [cell] = cells.splice(Math.floor(draw(random) * cells.length), 1);
    return {
      kind: index % 2 === 0 ? "bump" : "hollow",
      x: round((cell % 3 - 1) * 1.1 + (draw(random) * 2 - 1) * 0.15),
      y: round(2.5 + Math.floor(cell / 3) * 3 + draw(random)),
      radius: round(0.75 + draw(random) * 0.35),
      height: rules.reliefHeight * (index % 2 === 0 ? 1 : -1),
    };
  });
  return deepFreeze({
    kind: "petanque", level, resonance, steadyUsed: false, steadyActive: false, rules, jack,
    terrain: { type: rules.terrain, friction: rules.friction, slope, relief },
    angle: 0, power: 50, phase: "aiming", startedAt: now, updatedAt: now,
    throws: [], rolling: null, score: 0, opponentScore: 0, counting: null, cancelled: false,
    computerErrors: Array.from({ length: rules.boules }, () => ({
      angle: (draw(random) * 2 - 1) * rules.computerAngleError,
      power: (draw(random) * 2 - 1) * rules.computerPowerError,
    })),
    carreauDraw: resonance ? draw(random) : null,
  });
}

/** Height in metres; its negative gradient produces groundAcceleration / gravity. */
export function groundHeight(terrain, x, y) {
  let height = -(terrain.slope.x * x + terrain.slope.y * y) / PETANQUE.gravity;
  for (const feature of terrain.relief ?? []) {
    const fraction = ((x - feature.x) ** 2 + (y - feature.y) ** 2) / feature.radius ** 2;
    if (fraction < 1) height += feature.height * (1 - fraction) ** 2;
  }
  return height;
}

/** Bounded coarse-to-fine search, using exactly the player's physics and controls. */
export function computerAim(game) {
  checkGame(game);
  let best = { angle: 0, power: 0, distance: Infinity };
  const search = (minAngle, maxAngle, minPower, maxPower, step) => {
    for (let angle = minAngle; angle <= maxAngle; angle += step) {
      for (let power = minPower; power <= maxPower; power += step) {
        const sim = simulateThrow({ angle, power, terrain: game.terrain, balls: game.throws, recordFrames: false });
        if (sim.out) continue;
        const distance = Math.hypot(sim.end.x - game.jack.x, sim.end.y - game.jack.y);
        if (distance < best.distance) best = { angle, power, distance };
      }
    }
  };
  const { angle: A, power: P } = PETANQUE;
  search(A.min, A.max, P.min, P.max, 5);
  for (const [radius, step] of [[5, 1], [1, 0.5]]) {
    search(Math.max(A.min, best.angle - radius), Math.min(A.max, best.angle + radius),
      Math.max(P.min, best.power - radius), Math.min(P.max, best.power + radius), step);
  }
  const index = game.throws.filter(shot => shot.owner === "computer").length;
  const error = game.computerErrors[index];
  if (!error) throw new RangeError("The computer has no boules remaining.");
  return Object.freeze({
    angle: snap(clamp(best.angle + error.angle, A.min, A.max), A.step),
    power: snap(clamp(best.power + error.power, P.min, P.max), P.step),
  });
}

export function groundAcceleration(terrain, x, y) {
  let ax = terrain.slope.x, ay = terrain.slope.y;
  for (const feature of terrain.relief ?? []) {
    const dx = x - feature.x, dy = y - feature.y, radiusSquared = feature.radius ** 2;
    const fraction = (dx * dx + dy * dy) / radiusSquared;
    if (fraction >= 1) continue;
    // Smooth compact hill: h * (1 - r²/R²)². Gravity acts downhill.
    const strength = 4 * PETANQUE.gravity * feature.height * (1 - fraction) / radiusSquared;
    ax += strength * dx;
    ay += strength * dy;
  }
  return { x: ax, y: ay };
}

function simulateSolo({ angle, power, terrain }) {
  if (!Number.isFinite(angle) || !Number.isFinite(power)) throw new RangeError("Invalid pétanque throw.");
  const { gravity, dt, maxSteps, carryMax, rollSpeedMax, pitch } = PETANQUE;
  const rad = clamp(angle, PETANQUE.angle.min, PETANQUE.angle.max) * Math.PI / 180;
  const p = clamp(power, 0, 100) / 100;
  const dir = { x: Math.sin(rad), y: Math.cos(rad) };
  let x = dir.x * carryMax * p, y = dir.y * carryMax * p;
  let vx = dir.x * rollSpeedMax * p, vy = dir.y * rollSpeedMax * p;
  const landing = { x: round(x), y: round(y) };
  const decel = terrain.friction * gravity;
  const path = [landing];
  let steps = 0, out = false;
  for (; steps < maxSteps; steps++) {
    if (Math.abs(x) > pitch.width / 2 || y > pitch.length || y < 0) { out = true; break; }
    const speed = Math.hypot(vx, vy);
    if (speed < 0.01) break;
    const ground = groundAcceleration(terrain, x, y);
    const ax = ground.x - decel * vx / speed, ay = ground.y - decel * vy / speed;
    const nvx = vx + ax * dt, nvy = vy + ay * dt;
    // Friction cannot reverse the motion: stop when velocity turns back against the original direction.
    if (nvx * vx + nvy * vy <= 0) { vx = 0; vy = 0; break; }
    vx = nvx; vy = nvy; x += vx * dt; y += vy * dt;
    if (steps % 12 === 11) path.push({ x: round(x), y: round(y) });
  }
  const end = { x: round(x), y: round(y) };
  path.push(end);
  return deepFreeze({ landing, end, path, out, rollMs: Math.min(PETANQUE.maxRollMs, Math.round(steps * dt * 1000)) });
}

/** Equal-mass, inelastic contact. Position correction prevents persistent interpenetration. */
function collide(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const diameter = PETANQUE.bouleRadius * 2;
  const distance = Math.hypot(dx, dy);
  if (distance >= diameter || a.out || b.out) return 0;
  const relativeX = b.vx - a.vx, relativeY = b.vy - a.vy;
  const relativeSpeed = Math.hypot(relativeX, relativeY);
  const nx = distance > 1e-9 ? dx / distance : relativeSpeed > 0 ? -relativeX / relativeSpeed : 1;
  const ny = distance > 1e-9 ? dy / distance : relativeSpeed > 0 ? -relativeY / relativeSpeed : 0;
  const correction = (diameter - distance + 1e-7) / 2;
  a.x -= nx * correction; a.y -= ny * correction;
  b.x += nx * correction; b.y += ny * correction;
  const closing = relativeX * nx + relativeY * ny;
  if (closing >= 0) return 0;
  const impulse = -(1 + PETANQUE.restitution) * closing / 2;
  a.vx -= impulse * nx; a.vy -= impulse * ny;
  b.vx += impulse * nx; b.vy += impulse * ny;
  return -closing;
}

/** Stop the approach at first contact instead of jumping past boules before rolling. */
function contactLanding(landing, balls) {
  const lengthSquared = landing.x ** 2 + landing.y ** 2;
  if (lengthSquared === 0) return landing;
  const diameterSquared = (PETANQUE.bouleRadius * 2) ** 2;
  let fraction = 1;
  for (const ball of balls) {
    if (ball.out) continue;
    const { x, y } = ball.end;
    const projection = landing.x * x + landing.y * y;
    const offset = x * x + y * y - diameterSquared;
    const discriminant = projection ** 2 - lengthSquared * offset;
    if (discriminant < 0) continue;
    const contact = offset <= 0 ? 0 : (projection - Math.sqrt(discriminant)) / lengthSquared;
    if (contact >= 0 && contact < fraction) fraction = contact;
  }
  return { x: landing.x * fraction, y: landing.y * fraction };
}

/** Approach, then fixed-step rolling for every boule, including collisions and chain reactions. */
export function simulateThrow({ angle, power, terrain, balls = [], recordFrames = true }) {
  if (!Array.isArray(balls) || balls.length >= PETANQUE.boules * 2 ||
      balls.some(ball => !Number.isInteger(ball.id) || ball.id < 0 || !ball.end ||
        !Number.isFinite(ball.end.x) || !Number.isFinite(ball.end.y) ||
        ball.out !== undefined && typeof ball.out !== "boolean") ||
      new Set(balls.map(ball => ball.id)).size !== balls.length)
    throw new TypeError("Invalid settled pétanque boules.");
  const id = Math.max(-1, ...balls.map(ball => ball.id)) + 1;
  const solo = simulateSolo({ angle, power, terrain });
  if (!balls.some(ball => !ball.out)) {
    return deepFreeze({ ...solo,
      settled: [...balls.map(ball => ({ id: ball.id, end: ball.end, out: Boolean(ball.out) })),
        { id, end: solo.end, out: solo.out }],
      impacts: [],
      frames: recordFrames ? solo.path.map((point, index) => ({
        timeMs: index / (solo.path.length - 1) * solo.rollMs,
        positions: [{ id, ...point, out: solo.out && index === solo.path.length - 1 }],
      })) : [],
    });
  }
  const { gravity, dt, maxSteps, pitch } = PETANQUE;
  const rad = clamp(angle, PETANQUE.angle.min, PETANQUE.angle.max) * Math.PI / 180;
  const speed = PETANQUE.rollSpeedMax * clamp(power, 0, 100) / 100;
  const bodies = balls.filter(ball => !ball.out).map(ball => ({
    id: ball.id, x: ball.end.x, y: ball.end.y, vx: 0, vy: 0, out: false,
  }));
  const landing = contactLanding(solo.landing, balls);
  const thrown = { id, ...landing, vx: Math.sin(rad) * speed, vy: Math.cos(rad) * speed, out: false };
  bodies.push(thrown);
  const snapshot = timeMs => ({ timeMs, positions: bodies.map(body => ({
    id: body.id, x: round(body.x), y: round(body.y), out: body.out,
  })) });
  const frames = recordFrames ? [snapshot(0)] : [];
  const impacts = [], lastImpact = new Map();
  const outside = body => Math.abs(body.x) > pitch.width / 2 || body.y > pitch.length || body.y < 0;
  let steps = 0;
  for (; steps < maxSteps; steps++) {
    for (const body of bodies) {
      if (body.out || outside(body)) { body.out = true; body.vx = body.vy = 0; continue; }
      const velocity = Math.hypot(body.vx, body.vy);
      if (velocity < 0.01) { body.vx = body.vy = 0; continue; }
      const ground = groundAcceleration(terrain, body.x, body.y);
      const vx = body.vx + (ground.x - terrain.friction * gravity * body.vx / velocity) * dt;
      const vy = body.vy + (ground.y - terrain.friction * gravity * body.vy / velocity) * dt;
      if (vx * body.vx + vy * body.vy <= 0) { body.vx = body.vy = 0; continue; }
      body.vx = vx; body.vy = vy;
      body.x += vx * dt; body.y += vy * dt;
    }
    let hit = false;
    for (let pass = 0; pass < 4; pass++) {
      for (let a = 0; a < bodies.length; a++) {
        for (let b = a + 1; b < bodies.length; b++) {
          const strength = collide(bodies[a], bodies[b]);
          const pair = `${a}:${b}`;
          if (strength > 0.08 && steps - (lastImpact.get(pair) ?? -100) >= 6) {
            if (recordFrames) impacts.push({ timeMs: (steps + 1) * dt * 1000, ids: [bodies[a].id, bodies[b].id] });
            lastImpact.set(pair, steps);
            hit = true;
          }
        }
      }
    }
    for (const body of bodies) {
      if (outside(body)) { body.out = true; body.vx = body.vy = 0; }
    }
    if (recordFrames && (steps % 12 === 11 || hit)) frames.push(snapshot((steps + 1) * dt * 1000));
    if (bodies.every(body => body.out || Math.hypot(body.vx, body.vy) < 0.01)) { steps++; break; }
  }
  const duration = steps * dt * 1000;
  const rollMs = Math.min(PETANQUE.maxRollMs, Math.round(duration));
  if (recordFrames) frames.push(snapshot(duration));
  const scale = duration > 0 ? rollMs / duration : 1;
  for (const frame of frames) frame.timeMs *= scale;
  for (const impact of impacts) impact.timeMs *= scale;
  const end = { x: round(thrown.x), y: round(thrown.y) };
  return deepFreeze({ landing, end, out: thrown.out, rollMs, frames, impacts,
    path: recordFrames ? frames.map(frame => {
      const point = frame.positions.find(body => body.id === id);
      return { x: point.x, y: point.y };
    }) : [],
    settled: [...balls.filter(ball => ball.out).map(ball => ({ id: ball.id, end: ball.end, out: true })),
      ...bodies.map(body => ({ id: body.id, end: { x: round(body.x), y: round(body.y) }, out: body.out }))],
  });
}

export function grade(distance, radii, out = false) {
  if (out || !Number.isFinite(distance)) return "out";
  if (distance <= radii.perfect) return "perfect";
  if (distance <= radii.good) return "good";
  if (distance <= radii.near) return "near";
  return "miss";
}

function finishRoll(game) {
  if (!game.rolling) return game;
  const throws = [...game.throws, game.rolling.throw].map(shot => {
    const settled = game.rolling.settled.find(ball => ball.id === shot.id);
    return { ...shot, end: settled.end, out: settled.out,
      distance: settled.out ? null : round(Math.hypot(settled.end.x - game.jack.x, settled.end.y - game.jack.y)) };
  });
  const at = game.rolling.until;
  if (throws.length === game.rules.boules * 2)
    return { ...game, throws, rolling: null, phase: "counting",
      counting: { ...scoreEnd(throws), startedAt: at, awarded: 0 } };
  const computer = game.rolling.throw.owner === "player";
  return { ...game, throws, rolling: null, phase: computer ? "computer" : "aiming",
    computerAt: computer ? at + PETANQUE.computerThinkMs : null };
}

/** An end awards only boules strictly closer than the other side's best. Equal bests draw. */
export function scoreEnd(throws) {
  const valid = throws.map((shot, index) => ({ ...shot, index }))
    .filter(shot => !shot.out && Number.isFinite(shot.distance) && shot.distance >= 0);
  const nearest = owner => Math.min(Infinity, ...valid.filter(shot => shot.owner === owner).map(shot => shot.distance));
  const player = nearest("player"), computer = nearest("computer");
  const winner = player === computer ? null : player < computer ? "player" : "computer";
  const threshold = winner === "player" ? computer : player;
  const indices = winner ? valid.filter(shot => shot.owner === winner && shot.distance < threshold)
    .sort((a, b) => a.distance - b.distance || a.index - b.index).map(shot => shot.index) : [];
  return deepFreeze({ winner, points: indices.length, indices });
}

function startThrow(game, owner, angle, power, at) {
  const sim = simulateThrow({ angle, power, terrain: game.terrain, balls: game.throws });
  const distance = sim.out ? null : round(Math.hypot(sim.end.x - game.jack.x, sim.end.y - game.jack.y));
  const thrown = { owner, id: game.throws.length, angle, power, end: sim.end, landing: sim.landing,
    path: sim.path, distance, out: sim.out };
  return { ...game, phase: "rolling",
    rolling: { throw: thrown, frames: sim.frames, settled: sim.settled, impacts: sim.impacts,
      startedAt: at, until: at + PETANQUE.flightMs + sim.rollMs } };
}

function startCarreau(game, target) {
  const success = game.carreauDraw < game.rules.carreauChance;
  const outside = { x: PETANQUE.pitch.width / 2 + 1, y: target.end.y };
  const end = success ? { ...target.end } : outside;
  const thrown = {
    owner: "player", id: game.throws.length, angle: game.angle, power: game.power,
    end, landing: { ...target.end }, path: [{ x: 0, y: 0 }, { ...target.end }, end],
    distance: success ? round(Math.hypot(end.x - game.jack.x, end.y - game.jack.y)) : null,
    out: !success, carreau: { success, targetId: target.id },
  };
  const settled = [...game.throws.map(shot => ({
    id: shot.id, end: success && shot.id === target.id ? outside : { ...shot.end },
    out: success && shot.id === target.id ? true : shot.out,
  })), { id: thrown.id, end, out: !success }];
  const positions = game.throws.map(shot => ({ id: shot.id, ...shot.end, out: shot.out }));
  const rollMs = 500;
  return deepFreeze({
    ...game, steadyActive: false, steadyUsed: true, phase: "rolling",
    rolling: {
      throw: thrown, settled, impacts: success ? [{ timeMs: 0, ids: [target.id, thrown.id] }] : [],
      frames: [
        { timeMs: 0, positions: [...positions, { id: thrown.id, ...target.end, out: false }] },
        { timeMs: rollMs, positions: settled.map(shot => ({ id: shot.id, ...shot.end, out: shot.out })) },
      ],
      startedAt: game.updatedAt, until: game.updatedAt + PETANQUE.flightMs + rollMs,
    },
  });
}

export function advance(game, now) {
  checkGame(game);
  checkNow(now);
  if (game.phase === "finished" || game.phase === "cancelled") return game;
  const at = Math.max(now, game.updatedAt);
  const deadline = game.startedAt + game.rules.timeLimitMs;
  let next = game;
  while (true) {
    if (next.phase === "rolling" && next.rolling.until <= Math.min(at, deadline)) {
      next = finishRoll(next);
    } else if (next.phase === "computer" && next.computerAt <= Math.min(at, deadline)) {
      const aim = computerAim(next);
      next = startThrow(next, "computer", aim.angle, aim.power, next.computerAt);
    } else break;
  }
  if (next.phase === "counting") {
    const { startedAt, points, winner } = next.counting;
    const awarded = Math.min(points, Math.floor((at - startedAt) / PETANQUE.countMs));
    next = { ...next, counting: { ...next.counting, awarded },
      score: winner === "player" ? awarded : 0, opponentScore: winner === "computer" ? awarded : 0,
      phase: at >= startedAt + (points + 1) * PETANQUE.countMs ? "finished" : "counting" };
  } else if (next.phase !== "finished" && at >= deadline) {
    next = { ...next, rolling: null, phase: "finished", timedOut: true, score: 0, opponentScore: 0 };
  }
  if (next === game && at === game.updatedAt) return game;
  return deepFreeze({ ...next, updatedAt: at });
}

function parseAction(action) {
  const spec = typeof action === "string" ? { type: action } : action;
  if (!spec || typeof spec !== "object" || !ACTIONS.has(spec.type))
    throw new TypeError(`Unknown pétanque action: ${JSON.stringify(action)}.`);
  if ((spec.type === "setAngle" || spec.type === "setPower") &&
      (typeof spec.value !== "number" || !Number.isFinite(spec.value)))
    throw new RangeError(`${spec.type} needs a finite numeric value.`);
  if (spec.type === "carreau" && (!Number.isSafeInteger(spec.targetId) || spec.targetId < 0))
    throw new RangeError("Carreau needs a settled boule id.");
  return spec;
}

export function input(game, action, now) {
  checkGame(game);
  const spec = parseAction(action);
  checkNow(now);
  if (spec.type === "cancel" && !["finished", "cancelled"].includes(game.phase))
    return deepFreeze({ ...game, steadyActive: false, rolling: null, phase: "cancelled", cancelled: true,
      score: 0, opponentScore: 0, updatedAt: Math.max(now, game.updatedAt) });
  const current = advance(game, now);
  if (current.phase !== "aiming") return current;
  const { angle: A, power: P } = PETANQUE;
  const setPower = value => {
    const power = snap(clamp(value, P.min, P.max), P.step);
    return deepFreeze({ ...current, power });
  };
  switch (spec.type) {
    case "steady": return current.resonance && !current.steadyUsed && current.throws.some(shot => !shot.out)
      ? deepFreeze({ ...current, steadyActive: !current.steadyActive }) : current;
    case "carreau": {
      if (!current.resonance || current.steadyUsed || !current.steadyActive) return current;
      const target = current.throws.find(shot => shot.id === spec.targetId && !shot.out);
      if (!target) throw new RangeError("Carreau target must be a settled in-bounds boule.");
      return startCarreau(current, target);
    }
    case "left": return deepFreeze({ ...current, angle: snap(clamp(current.angle - A.step, A.min, A.max), A.step) });
    case "right": return deepFreeze({ ...current, angle: snap(clamp(current.angle + A.step, A.min, A.max), A.step) });
    case "setAngle": return deepFreeze({ ...current, angle: snap(clamp(spec.value, A.min, A.max), A.step) });
    case "up": return setPower(current.power + P.step);
    case "down": return setPower(current.power - P.step);
    case "setPower": return setPower(spec.value);
    case "throw": {
      return deepFreeze({ ...startThrow(current, "player", current.angle, current.power, current.updatedAt),
        steadyActive: false });
    }

  }
  return current;
}

/** Shared visual timeline for the thrown boule and any boules it displaces. */
export function boulePositions(game, now) {
  checkGame(game);
  const stationary = game.throws.map(shot => ({ id: shot.id, ...shot.end, out: shot.out }));
  if (!game.rolling) return stationary;
  const { throw: t, startedAt, until } = game.rolling;
  const flightEnd = startedAt + PETANQUE.flightMs;
  if (now < flightEnd) {
    const f = clamp((now - startedAt) / PETANQUE.flightMs, 0, 1);
    return [...stationary, { id: t.id, x: round(t.landing.x * f), y: round(t.landing.y * f), out: false }];
  }
  const frames = game.rolling.frames;
  const elapsed = clamp(now - flightEnd, 0, Math.max(0, until - flightEnd));
  const index = frames.findIndex(frame => frame.timeMs >= elapsed);
  const right = frames[index < 0 ? frames.length - 1 : index];
  const left = frames[Math.max(0, (index < 0 ? frames.length - 1 : index) - 1)];
  const f = clamp((elapsed - left.timeMs) / Math.max(1e-9, right.timeMs - left.timeMs), 0, 1);
  return right.positions.map(point => {
    const before = left.positions.find(body => body.id === point.id);
    return { id: point.id, x: round(before.x + (point.x - before.x) * f),
      y: round(before.y + (point.y - before.y) * f), out: f === 1 ? point.out : before.out };
  });
}

export function ballPosition(game, now) {
  if (!checkGame(game).rolling) return null;
  const point = boulePositions(game, now).find(body => body.id === game.rolling.throw.id);
  return { x: point.x, y: point.y };
}

export function result(game) {
  checkGame(game);
  const cancelled = game.phase === "cancelled";
  return Object.freeze(resonanceResult({
    completed: game.phase === "finished",
    score: cancelled ? 0 : game.score,
    opponentScore: cancelled ? 0 : game.opponentScore,
    winner: cancelled || game.timedOut ? null : game.counting?.winner ?? null,
    maxScore: game.rules.maxScore,
    cancelled,
    timedOut: Boolean(game.timedOut),
  }, game.resonance && !game.timedOut));
}
