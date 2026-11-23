// Self-defence brawl: the traveller breaks free from one to three attackers.
// Deterministic at 60 ticks per second; a transcript of input changes replays exactly.

export const BRAWL_VERSION = 1;
export const BRAWL_WIDTH = 640;
export const BRAWL_FLOOR = 262;
export const BRAWL_MAX_TICKS = 90 * 60;
export const BRAWL_CONTEXTS = Object.freeze(["street", "camp", "pursuer"]);
export const INPUT = Object.freeze({ left: 1, right: 2, up: 4, down: 8, action: 16 });

// Distances match the drawn figures (about 40 px wide at scale 3).
export const BRAWL_REACH = Object.freeze({ attack: 58, push: 66, sweep: 70, spacing: 40 });
const REACH = BRAWL_REACH.attack, PUSH_REACH = BRAWL_REACH.push, SWEEP_REACH = BRAWL_REACH.sweep, EDGE = 10;
const HOP_TICKS = 34, PUSH_TICKS = 22, SWEEP_TICKS = 26, PARRY_TICKS = 18, PARRY_WINDOW = 12;
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
      parryAge: null, activeAt: null, grabbedBy: null, breaks: 0 },
    opponents: sides.map((side, index) => ({
      id: index, x: BRAWL_WIDTH / 2 + side * (190 + Math.floor(spread.next() * 50) + (index === 2 ? 80 : 0)),
      pose: "approach", timer: 30 + index * 25 + Math.floor(spread.next() * 30), attack: null, downs: 0, pinned: 0,
    })),
  };
}

const standing = opponent => !["down", "fled"].includes(opponent.pose);
const able = opponent => standing(opponent) && opponent.pinned === 0 && opponent.pose !== "stagger";

function hits(opponent, attack, player) {
  if (player.hurt > 0) return false;
  if (attack === "high") return player.pose !== "duck";
  if (attack === "low") return player.air === 0;
  return player.air === 0; // the pursuer's grab is avoided only by hopping away
}

export function stepBrawl(state, mask = 0) {
  if (!Number.isInteger(mask) || mask < 0 || mask > 31) throw new Error("Invalid brawl input.");
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
  if (p.air > 0) p.air--;
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
    const busy = p.timer > 0 && ["push", "sweep", "parry"].includes(p.pose);
    if (!busy) {
      if (pressed & INPUT.action) {
        if (mask & INPUT.up) { p.pose = "parry"; p.timer = PARRY_TICKS; p.parryAge = 0; }
        else if (mask & INPUT.down) { p.pose = "sweep"; p.timer = Math.round(SWEEP_TICKS / slow); }
        else { p.pose = "push"; p.timer = Math.round(PUSH_TICKS / slow); }
        p.activeAt = p.pose === "parry" ? null : next.tick + Math.round(ACTIVE_DELAY / slow);
        events.push({ type: p.pose, x: p.x });
        if (mask & INPUT.left) p.facing = -1;
        if (mask & INPUT.right) p.facing = 1;
      } else if ((pressed & INPUT.up) && p.air === 0) {
        p.air = HOP_TICKS; p.pose = "hop";
        events.push({ type: "hop", x: p.x });
        p.x -= p.facing * 26 * slow;
      } else if (mask & INPUT.down) {
        p.pose = "duck";
      } else {
        const dir = (mask & INPUT.right ? 1 : 0) - (mask & INPUT.left ? 1 : 0);
        if (dir) { p.facing = dir; p.x += dir * WALK * slow; p.pose = "walk"; }
        else if (p.air === 0) p.pose = "idle";
      }
    }
    // A push or sweep lands once, on its first active tick.
    if (["push", "sweep"].includes(p.pose) && p.activeAt === next.tick) {
      const sweep = p.pose === "sweep";
      if (sweep) p.x += p.facing * 16; // the sweep slides in under the attacker
      // A carried knife makes every blow count: longer reach, full stagger, longer falls.
      const reach = sweep ? SWEEP_REACH : PUSH_REACH + (state.knife ? 10 : 0);
      const target = next.opponents
        .filter(o => standing(o) && o.pinned === 0 || sweep && o.pose === "stagger")
        .filter(o => Math.sign(o.x - p.x) === p.facing && Math.abs(o.x - p.x) <= reach)
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0]
        ?? next.opponents.find(o => o.pinned > 0 && Math.abs(o.x - p.x) <= reach &&
          Math.sign(o.x - p.x) === p.facing);
      if (target) {
        if (sweep && (target.pose === "stagger" || target.pinned > 0)) {
          Object.assign(target, { pose: "down", timer: Math.round(rules.downTicks * (state.knife ? 1.5 : 1)),
            attack: null, pinned: 0 });
          target.downs++;
          events.push({ type: "down", x: target.x, id: target.id });
        } else if (!sweep) {
          Object.assign(target, { pose: "stagger", timer: Math.round(rules.staggerTicks * (state.knife ? 1 : 0.6)),
            attack: null });
          // A short shove keeps the attacker within reach of the follow-up sweep.
          target.x += p.facing * 12;
          events.push({ type: "shoved", x: target.x, id: target.id });
        } else events.push({ type: "miss", x: p.x });
      } else events.push({ type: "miss", x: p.x });
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
        Object.assign(o, { pose: "stagger", timer: rules.staggerTicks, attack: null });
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
        !Number.isInteger(change[1]) || change[1] < 0 || change[1] > 31 ||
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
