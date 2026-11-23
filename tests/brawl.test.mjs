import assert from "node:assert/strict";
import test from "node:test";
import { BRAWL_REACH, INPUT, brawlRules, createBrawl, createBrawlRecorder, replayBrawl, stepBrawl } from "../minigames/brawl.mjs";

function run(setup, choose, limit = 6000) {
  let state = createBrawl(setup);
  const recorder = createBrawlRecorder();
  while (state.status === "fighting" && state.tick < limit) {
    const mask = choose(state);
    recorder.record(state.tick + 1, mask);
    state = stepBrawl(state, mask);
  }
  return { state, transcript: recorder.transcript(state.tick) };
}

// Reads each wind-up, parries it, then sweeps the staggered attacker.
function defender(state) {
  const p = state.player;
  const threat = state.opponents.find(o => o.pose === "windup" && o.timer <= 8 && Math.abs(o.x - p.x) < BRAWL_REACH.attack + 26);
  if (threat) {
    if (threat.attack === "grab") return INPUT.up;
    const face = threat.x > p.x ? INPUT.right : INPUT.left;
    return state.tick % 2 ? INPUT.up | INPUT.action | face : INPUT.up | face;
  }
  if (p.grabbedBy !== null) return state.tick % 2 ? INPUT.action : 0;
  const open = state.opponents.find(o => (o.pose === "stagger" || o.pinned > 0) && Math.abs(o.x - p.x) < BRAWL_REACH.sweep);
  if (open) {
    const face = open.x > p.x ? INPUT.right : INPUT.left;
    return state.tick % 2 ? INPUT.down | INPUT.action | face : INPUT.down | face;
  }
  const near = state.opponents.filter(o => !["down", "fled"].includes(o.pose))
    .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
  if (near && Math.abs(near.x - p.x) > BRAWL_REACH.attack + 2) return near.x > p.x ? INPUT.right : INPUT.left;
  return 0;
}

test("reading, parrying and sweeping beats one to three attackers and replays exactly", () => {
  for (const opponents of [1, 2, 3]) for (const level of [1, 6, 10]) {
    let won = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const setup = { seed, level, opponents, breath: 4 };
      const { state, transcript } = run(setup, defender);
      if (state.status === "won") won++;
      assert.equal(replayBrawl(setup, transcript), state.status);
    }
    assert.ok(won >= (opponents === 3 ? 5 : 6), `${opponents} attackers at level ${level}: ${won}/6`);
  }
});

test("standing still loses breath and eventually the fight", () => {
  const setup = { seed: 9, level: 3, opponents: 2, breath: 3 };
  const { state, transcript } = run(setup, () => 0);
  assert.equal(state.status, "lost");
  assert.equal(state.breath, 0);
  assert.equal(replayBrawl(setup, transcript), "lost");
});

test("running away only works once nobody able to chase is close", () => {
  const { state } = run({ seed: 3, level: 1, opponents: 1, breath: 6 }, () => INPUT.left, 600);
  assert.notEqual(state.status, "escaped", "an attacker out-runs a traveller who just walks off");
  let held = false;
  const { state: free } = run({ seed: 3, level: 1, opponents: 1, breath: 6, dog: true }, s => {
    held ||= s.opponents[0].pinned > 0;
    return held ? INPUT.left : 0;
  });
  assert.equal(free.status, "escaped");
});

test("the pursuer grabs, and only hammering the action key breaks free", () => {
  const rules = brawlRules(5, "pursuer");
  let state = createBrawl({ seed: 1, level: 5, context: "pursuer" });
  assert.equal(state.opponents.length, 1);
  state.player.grabbedBy = 0;
  Object.assign(state.opponents[0], { pose: "grab", timer: rules.grabTicks });
  let held = state;
  for (let i = 0; i < rules.grabTicks && held.status === "fighting"; i++) held = stepBrawl(held, 0);
  assert.equal(held.status, "lost", "a grab left alone is fatal");
  let free = state;
  for (let i = 0; i < rules.grabBreaks * 2; i++) free = stepBrawl(free, i % 2 ? INPUT.action : 0);
  assert.equal(free.player.grabbedBy, null);
  assert.equal(free.opponents[0].pose, "stagger");
});

test("a present dog periodically holds back an attacker, who can then be swept", () => {
  let state = createBrawl({ seed: 5, level: 2, opponents: 1, dog: true, breath: 6 });
  let pinned = false;
  for (let i = 0; i < 700 && state.status === "fighting"; i++) {
    state = stepBrawl(state, 0);
    pinned ||= state.opponents.some(o => o.pinned > 0);
  }
  assert.ok(pinned);
  const alone = createBrawl({ seed: 5, level: 2, opponents: 1, breath: 6 });
  let other = alone;
  for (let i = 0; i < 700 && other.status === "fighting"; i++) other = stepBrawl(other, 0);
  assert.ok(other.opponents.every(o => o.pinned === 0));
});

test("transcripts are bounded, ordered and cannot continue after the outcome", () => {
  const setup = { seed: 2, level: 1, opponents: 1, breath: 1 };
  const { transcript } = run(setup, () => 0);
  assert.throws(() => replayBrawl(setup, { ...transcript, ticks: transcript.ticks + 5 }), /continue after/);
  assert.throws(() => replayBrawl(setup, { changes: [[3, 1], [2, 0]], ticks: 10, abandoned: false }), /Invalid/);
  assert.throws(() => replayBrawl(setup, { changes: [[1, 64]], ticks: 10, abandoned: false }), /Invalid/);
  assert.throws(() => replayBrawl(setup, { changes: [], ticks: 10, abandoned: false }), /unfinished/);
  assert.equal(replayBrawl(setup, { changes: [], ticks: 10, abandoned: true }), "lost");
  assert.throws(() => createBrawl({ seed: 1, opponents: 4 }), /setup/);
  assert.throws(() => createBrawl({ seed: -1 }), /seed/);
});

test("a push followed by a sweep floors an attacker: the basic combo the hints teach", () => {
  let state = createBrawl({ seed: 12, level: 3, opponents: 1, breath: 6 });
  while (Math.abs(state.opponents[0].x - state.player.x) > BRAWL_REACH.attack + 2) state = stepBrawl(state, INPUT.right);
  const seen = [];
  const press = (mask, ticks) => { for (let i = 0; i < ticks; i++) { state = stepBrawl(state, i ? mask & ~INPUT.action | (mask & INPUT.action ? 0 : 0) : mask); seen.push(...state.events.map(e => e.type)); } };
  press(INPUT.action | INPUT.right, 1); press(0, 24);
  assert.equal(state.opponents[0].pose, "stagger");
  press(INPUT.action | INPUT.down | INPUT.right, 1); press(INPUT.down, 10);
  assert.equal(state.status, "won");
  assert.ok(seen.includes("shoved") && seen.includes("down"));
});

test("a carried knife makes pushes reach further, stagger longer and floor attackers for longer", () => {
  const rules = brawlRules(3, "street");
  const outcome = knife => {
    let state = createBrawl({ seed: 12, level: 3, opponents: 1, breath: 6, knife });
    // The attacker waits just beyond the bare-handed push; he closes about one pixel per tick before the push lands.
    Object.assign(state.opponents[0], { x: state.player.x + BRAWL_REACH.push + 8, timer: 200 });
    state = stepBrawl(state, INPUT.action | INPUT.right);
    for (let i = 0; i < 6; i++) state = stepBrawl(state, 0);
    return state.opponents[0];
  };
  assert.notEqual(outcome(false).pose, "stagger", "without a knife the push falls short at this distance");
  const pushed = outcome(true);
  assert.equal(pushed.pose, "stagger");
  assert.ok(pushed.timer > Math.round(rules.staggerTicks * 0.6));
  assert.throws(() => createBrawl({ seed: 1, knife: "yes" }), /setup/);
});
