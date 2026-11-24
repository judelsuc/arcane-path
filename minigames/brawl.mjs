// Self-defence brawl: the traveller breaks free from one to three attackers.
// Deterministic at 60 ticks per second; a transcript of input changes replays exactly.

export const BRAWL_VERSION = 1;
export const BRAWL_WIDTH = 640;
export const BRAWL_FLOOR = 262;
export const BRAWL_MAX_TICKS = 90 * 60;
export const BRAWL_CONTEXTS = Object.freeze(["street", "camp", "pursuer"]);
export const INPUT = Object.freeze({ left: 1, right: 2, up: 4, down: 8, action: 16, kick: 32 });
const MAX_MASK = 63;

// Distances match the drawn figures (about 40 px wide at scale 3).
export const BRAWL_REACH = Object.freeze({ attack: 58, push: 66, sweep: 70, kick: 82, split: 76, flying: 52, spacing: 40 });
const REACH = BRAWL_REACH.attack, PUSH_REACH = BRAWL_REACH.push, SWEEP_REACH = BRAWL_REACH.sweep, EDGE = 10;
const HOP_TICKS = 34, PUSH_TICKS = 22, SWEEP_TICKS = 26, PARRY_TICKS = 18, PARRY_WINDOW = 12;
// Kicks: slower to land and to recover than a push, but they reach further.
const KICK_TICKS = 30, KICK_DELAY = 8, SPLIT_TICKS = 44, SPLIT_DELAY = 9, LAND_TICKS = 18, JUMP_SPEED = 2.8;
// How far each blow sends an attacker, in pixels.
const KNOCK = Object.freeze({ push: 45, kick: 65, split: 55, flying: 90, sweep: 20, parry: 25 });
const GLIDE = 1 / (1 - 0.85), SWEEP_SLIDE = 50, SWEEP_SLIDE_TICKS = 8;
const STRIKE_TICKS = 7, RECOVER_TICKS = 34, HURT_TICKS = 50, ACTIVE_DELAY = 4;
// Attackers out-run the traveller, so fleeing works only once nobody can follow.
const CHASE = 3.2, LUNGE = 2.4, WALK = 2.2, FREE_DISTANCE = 150;
const DOG_FIRST = 300, DOG_EVERY = 480, DOG_PIN = 170, DROWSY_TICKS = 180;

export function brawlRules(level, context = "street") {
  if (!Number.isInteger(level) || level < 1 || level > 10 || !BRAWL_CONTEXTS.includes(context)) {
    throw new Error("Invalid brawl difficulty.");
  }
  const pursuer = context === "pursuer";
  return {
    // Longer wind-ups at low levels leave time to read high and low attacks.
    windup: Math.round((pursuer ? 34 : 44) - level * 2.4),
    speed: (pursuer ? 70 : 52) + level * 3,
    staggerTicks: Math.round(70 - level * 2.5),
    downTicks: Math.round((pursuer ? 210 : 330) - level * 12),
    // How many attackers may wind up at the same time.
    simultaneous: level >= 7 ? 2 : 1,
    pause: Math.round(70 - level * 4),
    grabBreaks: pursuer ? 6 + Math.floor(level / 2) : 0,
    grabTicks: 150 - level * 4,
  };
}

// mulberry32: neighbouring seeds give unrelated sequences. The generator state is
// saved in the brawl state after every tick, so a replay draws the same numbers.
function random(state) {
  const generator = { state: state >>> 0 };
  generator.next = () => {
    generator.state = (generator.state + 0x6d2b79f5) >>> 0;
    let t = generator.state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 0x100000000;
  };
  return generator;
}

export function createBrawl({ seed, level = 1, context = "street", opponents = 1, breath = 4,
  dog = false, drowsy = false, knife = false } = {}) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Invalid brawl seed.");
  brawlRules(level, context);
  const count = context === "pursuer" ? 1 : opponents;
  if (![1, 2, 3].includes(count) || !Number.isInteger(breath) || breath < 1 || breath > 6 ||
      typeof dog !== "boolean" || typeof drowsy !== "boolean" || typeof knife !== "boolean") {
    throw new Error("Invalid brawl setup.");
  }
  const sides = [[1], [-1, 1], [-1, 1, 1]][count - 1];
  const spread = random(seed ^ 0x5bd1e995);
  return {
    version: BRAWL_VERSION, seed, level, context, dog, drowsy, knife, tick: 0, status: "fighting",
    rng: seed, mask: 0, breath, maxBreath: breath, dogTimer: DOG_FIRST,
    player: { x: BRAWL_WIDTH / 2, facing: 1, pose: "idle", timer: 0, air: 0, hurt: 0,
      parryAge: null, activeAt: null, grabbedBy: null, breaks: 0, vx: 0, flying: false },
    opponents: sides.map((side, index) => ({
      id: index, x: BRAWL_WIDTH / 2 + side * (190 + Math.floor(spread.next() * 50) + (index === 2 ? 80 : 0)),
      pose: "approach", timer: 30 + index * 25 + Math.floor(spread.next() * 30), attack: null, downs: 0, pinned: 0, vx: 0,
    })),
  };
}

const standing = opponent => !["down", "fled"].includes(opponent.pose);
const able = opponent => standing(opponent) && opponent.pinned === 0 && opponent.pose !== "stagger";

function hits(opponent, attack, player) {
  if (player.hurt > 0) return false;
  // Ducking or dropping into the split leaves high blows above the traveller.
  if (attack === "high") return !["duck", "split"].includes(player.pose);
  if (attack === "low") return player.air === 0;
  return player.air === 0; // the pursuer's grab is avoided only by hopping away
}

export function stepBrawl(state, mask = 0) {
  if (!Number.isInteger(mask) || mask < 0 || mask > MAX_MASK) throw new Error("Invalid brawl input.");
  if (state.status !== "fighting") return state;
  const rules = brawlRules(state.level, state.context);
  const next = structuredClone(state);
  const pressed = mask & ~state.mask;
  next.mask = mask;
  next.tick++;
  // Presentation cues for the UI and sounds; they never influence the simulation.
  const events = next.events = [];
  const generator = random(next.rng), draw = generator.next;
  const p = next.player;
  const slow = state.drowsy && next.tick < DROWSY_TICKS ? 0.5 : 1;

  // Traveller.
  if (p.hurt > 0) p.hurt--;
  if (p.air > 0) {
    p.x += p.vx;
    if (--p.air === 0) {
      p.vx = 0;
      // A flying kick ends in a short landing during which the traveller cannot act.
      if (p.flying) { p.flying = false; p.pose = "land"; p.timer = LAND_TICKS; }
    }
  }
  if (p.timer > 0) p.timer--;
  if (p.parryAge !== null) p.parryAge++;
  if (p.grabbedBy !== null) {
    if (pressed & INPUT.action) p.breaks++;
    const holder = next.opponents[p.grabbedBy];
    if (p.breaks >= rules.grabBreaks) {
      events.push({ type: "break", x: p.x });
      p.grabbedBy = null; p.breaks = 0; p.hurt = 30;
      Object.assign(holder, { pose: "stagger", timer: rules.staggerTicks, attack: null });
    } else if (--holder.timer <= 0) {
      next.status = "lost";
      return next;
    }
  } else {
    const busy = p.timer > 0 && ["push", "sweep", "parry", "kick", "split", "land"].includes(p.pose) || p.flying;
    const dir = (mask & INPUT.right ? 1 : 0) - (mask & INPUT.left ? 1 : 0);
    if (!busy) {
      if ((pressed & INPUT.kick) && p.air > 0) {
        p.flying = true; p.pose = "flykick"; p.vx = p.facing * JUMP_SPEED * 1.2;
        events.push({ type: "flykick", x: p.x });
      } else if (pressed & INPUT.kick) {
        if (dir) p.facing = dir;
        const split = Boolean(mask & INPUT.down);
        p.pose = split ? "split" : "kick";
        p.timer = Math.round((split ? SPLIT_TICKS : KICK_TICKS) / slow);
        p.activeAt = next.tick + Math.round((split ? SPLIT_DELAY : KICK_DELAY) / slow);
        events.push({ type: p.pose, x: p.x });
      } else if (pressed & INPUT.action) {
        if (mask & INPUT.up) { p.pose = "parry"; p.timer = PARRY_TICKS; p.parryAge = 0; }
        else if (mask & INPUT.down) { p.pose = "sweep"; p.timer = Math.round(SWEEP_TICKS / slow); }
        else { p.pose = "push"; p.timer = Math.round(PUSH_TICKS / slow); }
        p.activeAt = p.pose === "parry" ? null : next.tick + Math.round(ACTIVE_DELAY / slow);
        events.push({ type: p.pose, x: p.x });
        if (mask & INPUT.left) p.facing = -1;
        if (mask & INPUT.right) p.facing = 1;
      } else if ((pressed & INPUT.up) && p.air === 0) {
        p.air = HOP_TICKS;
        if (dir) {
          // Up with a direction jumps that way; up alone hops back from the facing side.
          p.facing = dir; p.pose = "jump"; p.vx = dir * JUMP_SPEED * slow;
        } else {
          p.pose = "hop"; p.vx = 0; p.x -= p.facing * 26 * slow;
        }
        events.push({ type: "hop", x: p.x });
      } else if (p.air > 0) {
        // Airborne: keep the jump pose until landing.
      } else if (mask & INPUT.down) {
        p.pose = "duck";
      } else {
        if (dir) { p.facing = dir; p.x += dir * WALK * slow; p.pose = "walk"; }
        else if (p.air === 0) p.pose = "idle";
      }
    }
    // Knockback is a glide: a starting speed that decays each tick (distance ≈ speed × 6.7).
    const away = target => Math.sign(target.x - p.x) || p.facing;
    const knock = (target, share, distance) => {
      Object.assign(target, { pose: "stagger", timer: Math.round(rules.staggerTicks * share), attack: null });
      target.vx = away(target) * distance / GLIDE;
      events.push({ type: "shoved", x: target.x, id: target.id });
    };
    const floor = (target, distance) => {
      Object.assign(target, { pose: "down", timer: Math.round(rules.downTicks * (state.knife ? 1.5 : 1)),
        attack: null, pinned: 0, vx: away(target) * distance / GLIDE });
      target.downs++;
      events.push({ type: "down", x: target.x, id: target.id });
    };
    const open = o => o.pose === "stagger" || o.pinned > 0;
    const hittable = o => standing(o) && o.pose !== "grab";
    // Kicks: a staggered or held attacker goes down, anyone else staggers.
    if (["kick", "split"].includes(p.pose) && p.activeAt === next.tick) {
      const split = p.pose === "split";
      const reach = (split ? BRAWL_REACH.split : BRAWL_REACH.kick) + (state.knife ? 6 : 0);
      const targets = next.opponents.filter(o => hittable(o) && Math.abs(o.x - p.x) <= reach &&
        (split || Math.sign(o.x - p.x) === p.facing));
      const hit = split ? targets
        : targets.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x)).slice(0, 1);
      for (const target of hit) {
        if (open(target)) floor(target, split ? KNOCK.split : KNOCK.kick);
        else knock(target, state.knife ? 1 : 0.8, split ? KNOCK.split : KNOCK.kick);
      }
      if (!hit.length) events.push({ type: "miss", x: p.x });
    }
    if (p.flying) {
      const target = next.opponents.find(o => hittable(o) && Math.sign(o.x - p.x) === p.facing &&
        Math.abs(o.x - p.x) <= BRAWL_REACH.flying);
      if (target) {
        floor(target, KNOCK.flying);
        p.vx = -p.facing * 1.5;
      }
    }
    // A push lands once, on its first active tick, and shoves the attacker well back.
    if (p.pose === "push" && p.activeAt === next.tick) {
      const reach = PUSH_REACH + (state.knife ? 10 : 0);
      const target = next.opponents.filter(o => hittable(o) && Math.sign(o.x - p.x) === p.facing &&
        Math.abs(o.x - p.x) <= reach).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (target) knock(target, state.knife ? 1 : 0.7, KNOCK.push);
      else events.push({ type: "miss", x: p.x });
    }
    // The sweep slides along the ground and floors the first off-balance attacker it meets.
    if (p.pose === "sweep" && p.activeAt !== null && next.tick >= p.activeAt &&
        next.tick < p.activeAt + SWEEP_SLIDE_TICKS) {
      p.x += p.facing * SWEEP_SLIDE / SWEEP_SLIDE_TICKS;
      const target = next.opponents.find(o => standing(o) && open(o) && Math.sign(o.x - p.x || p.facing) === p.facing &&
        Math.abs(o.x - p.x) <= SWEEP_REACH);
      if (target) { floor(target, KNOCK.sweep); p.activeAt = null; }
      else if (next.tick === p.activeAt + SWEEP_SLIDE_TICKS - 1) events.push({ type: "miss", x: p.x });
    }
  }
  p.x = Math.max(0, Math.min(BRAWL_WIDTH, p.x));

  // Dog: periodically pins the standing attacker nearest to the traveller.
  if (state.dog) {
    for (const o of next.opponents) if (o.pinned > 0) o.pinned--;
    if (--next.dogTimer <= 0) {
      next.dogTimer = DOG_EVERY;
      const target = next.opponents.filter(o => standing(o) && o.pose !== "grab" && o.pinned === 0)
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (target) {
        Object.assign(target, { pinned: DOG_PIN, pose: "approach", attack: null, timer: 20 });
        events.push({ type: "dog", x: target.x, id: target.id });
      }
    }
  }

  // Attackers.
  let winding = next.opponents.filter(o => ["windup", "strike"].includes(o.pose)).length;
  for (const o of next.opponents) {
    if (o.vx) {
      o.x += o.vx;
      o.vx = Math.abs(o.vx) < 0.1 ? 0 : o.vx * 0.85;
      o.x = Math.max(16, Math.min(BRAWL_WIDTH - 16, o.x));
    }
    if (o.pinned > 0 || o.pose === "fled" || o.pose === "grab") continue;
    if (o.timer > 0) o.timer--;
    const toward = Math.sign(p.x - o.x) || 1;
    const gap = Math.abs(p.x - o.x);
    if (o.pose === "down" || o.pose === "stagger" || o.pose === "recover") {
      if (o.pose === "stagger") o.x -= toward * 0.3;
      if (o.timer === 0) {
        if (o.pose === "down") events.push({ type: "getup", x: o.x, id: o.id });
        o.pose = "approach"; o.timer = rules.pause + Math.floor(draw() * rules.pause);
      }
    } else if (o.pose === "approach") {
      // Attackers queue behind one another instead of overlapping on the same side.
      const blocked = next.opponents.some(other => other !== o && standing(other) &&
        Math.sign(other.x - p.x) === Math.sign(o.x - p.x) && Math.abs(other.x - p.x) < gap &&
        gap - Math.abs(other.x - p.x) < BRAWL_REACH.spacing);
      if (gap > REACH && !blocked) o.x += toward * Math.min(gap - REACH, gap > 140 ? CHASE : rules.speed / 60);
      else if (o.timer === 0 && winding < rules.simultaneous) {
        // A few ticks of variation keep the rhythm unpredictable without hiding the warning.
        o.pose = "windup"; o.timer = rules.windup + Math.floor(draw() * 5) - 2; winding++;
        o.attack = state.context === "pursuer" && draw() < 0.4 ? "grab" : draw() < 0.5 ? "high" : "low";
        events.push({ type: "windup", attack: o.attack, x: o.x, id: o.id });
      }
    } else if (o.pose === "windup" && o.timer > 0) {
      if (gap > REACH - 6) o.x += toward * Math.min(gap - (REACH - 6), LUNGE);
    } else if (o.pose === "windup") {
      o.pose = "strike"; o.timer = STRIKE_TICKS;
      const parried = p.pose === "parry" && p.parryAge !== null && p.parryAge <= PARRY_WINDOW &&
        Math.sign(o.x - p.x) === p.facing && o.attack !== "grab";
      if (parried) {
        Object.assign(o, { pose: "stagger", timer: rules.staggerTicks, attack: null,
          vx: -toward * KNOCK.parry / GLIDE });
        events.push({ type: "parried", x: o.x, id: o.id });
      } else if (gap <= REACH + 8 && p.grabbedBy === null && hits(o, o.attack, p)) {
        if (o.attack === "grab") {
          p.grabbedBy = o.id; p.breaks = 0; o.pose = "grab"; o.timer = rules.grabTicks;
          events.push({ type: "grabbed", x: p.x, id: o.id });
        } else {
          next.breath--; p.hurt = HURT_TICKS; p.x -= toward * 22;
          events.push({ type: "hit", x: p.x, id: o.id });
        }
      } else events.push({ type: "dodged", attack: o.attack, x: o.x, id: o.id });
    } else if (o.pose === "strike" && o.timer === 0) {
      o.pose = "recover"; o.timer = RECOVER_TICKS; o.attack = null;
    }
    o.x = Math.max(-40, Math.min(BRAWL_WIDTH + 40, o.x));
  }
  next.rng = generator.state;

  const active = next.opponents.filter(o => o.pose !== "fled");
  if (next.breath <= 0) next.status = "lost";
  else if (active.every(o => o.pose === "down")) {
    next.status = "won";
    for (const o of active) o.pose = "fled";
  } else if ((p.x <= EDGE || p.x >= BRAWL_WIDTH - EDGE) && p.grabbedBy === null &&
      !active.some(o => able(o) && Math.abs(o.x - p.x) < FREE_DISTANCE)) {
    next.status = "escaped";
  } else if (next.tick >= BRAWL_MAX_TICKS) next.status = "lost";
  return next;
}

export function replayBrawl(setup, transcript) {
  const { changes, ticks, abandoned } = transcript ?? {};
  if (!Array.isArray(changes) || changes.length > 4000 || !Number.isSafeInteger(ticks) ||
      ticks < 0 || ticks > BRAWL_MAX_TICKS || typeof abandoned !== "boolean" ||
      changes.some((change, index) => !Array.isArray(change) || change.length !== 2 ||
        !Number.isSafeInteger(change[0]) || change[0] < 1 || change[0] > ticks ||
        !Number.isInteger(change[1]) || change[1] < 0 || change[1] > MAX_MASK ||
        index > 0 && change[0] <= changes[index - 1][0])) throw new Error("Invalid brawl transcript.");
  let state = createBrawl(setup), mask = 0, index = 0;
  for (let tick = 1; tick <= ticks; tick++) {
    if (state.status !== "fighting") throw new Error("Brawl inputs continue after the outcome.");
    if (changes[index]?.[0] === tick) mask = changes[index++][1];
    state = stepBrawl(state, mask);
  }
  if (abandoned) return "lost";
  if (state.status === "fighting") throw new Error("Brawl transcript is unfinished.");
  return state.status;
}

export function createBrawlRecorder() {
  const changes = [];
  let mask = 0;
  return {
    record(tick, next) {
      if (next !== mask) { changes.push([tick, next]); mask = next; }
    },
    transcript(ticks, abandoned = false) { return { changes: changes.map(c => [...c]), ticks, abandoned }; },
  };
}
