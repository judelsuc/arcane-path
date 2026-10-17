import test from "node:test";
import assert from "node:assert/strict";
import { createStreetMusicAudio } from "../street-music-audio.mjs";
import { MUSIC, rhythm, beatTime } from "../music.mjs";

function fixture(options = {}) {
  const voices = [], gains = [], errors = [], reports = [];
  const context = {
    currentTime: 10, state: "running", destination: {},
    async resume() {},
    createGain() {
      const node = { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} };
      gains.push(node);
      return node;
    },
    createOscillator() {
      const node = { frequency: {}, connect() {}, disconnect() {},
        start(at) { this.started = at; }, stop(at) { this.stopped = at ?? "immediate"; } };
      voices.push(node);
      return node;
    },
  };
  const player = createStreetMusicAudio({ createContext: () => context, now: () => 1000,
    onError: error => errors.push(error), report: (...args) => reports.push(args), ...options });
  return { player, context, voices, gains, errors, reports };
}

test("street melody and bass use the exact visual beat clock, with distinct hit/miss notes", async () => {
  const { player, voices, errors } = fixture();
  player.enable(true);
  await player.start(rhythm(1000));
  assert.equal(voices.length, MUSIC.beats * 2);
  for (let i = 0; i < MUSIC.beats; i++) {
    assert.equal(voices[i * 2].started, 10 + (beatTime(rhythm(1000), i) - 1000) / 1000);
    assert.equal(voices[i * 2 + 1].started, voices[i * 2].started);
  }
  player.hit(true);
  assert.equal(voices.at(-1).frequency.value, 783.99);
  player.hit(false);
  assert.equal(voices.at(-1).frequency.value, 110);
  assert.deepEqual(errors, [""]);
});

test("shared mute/volume apply immediately and stopping cancels every scheduled voice", async () => {
  const { player, gains, voices } = fixture();
  player.enable(true);
  await player.start(rhythm(1000));
  assert.equal(gains[0].gain.value, 0.25);
  player.volume(0.6);
  assert.equal(gains[0].gain.value, 0.6);
  player.enable(false);
  assert.equal(gains[0].gain.value, 0);
  player.enable(true);
  assert.equal(gains[0].gain.value, 0.6);
  player.stop();
  assert.ok(voices.every(voice => voice.stopped === "immediate"));
  const count = voices.length;
  player.hit(true);
  assert.equal(voices.length, count);
  for (const value of [-1, 2, NaN]) assert.throws(() => player.volume(value));
});

test("resume latency skips elapsed cues rather than playing a burst of late notes", async () => {
  const { player, voices } = fixture({ now: () => 3000 });
  await player.start(rhythm(1000));
  assert.equal(voices.length, (MUSIC.beats - 2) * 2);
  assert.ok(voices.every(voice => voice.started >= 10));
});

test("cancelled unlock cannot start music, and a later performance reuses the context", async () => {
  const { player, context, voices } = fixture();
  let unlock;
  context.resume = () => new Promise(resolve => { unlock = resolve; });
  const pending = player.start(rhythm(1000));
  player.stop();
  unlock();
  await pending;
  assert.equal(voices.length, 0);
  context.resume = async () => {};
  await player.start(rhythm(1000));
  assert.equal(voices.length, MUSIC.beats * 2);
});

test("unsupported or rejected audio is reported, without rejecting the visual game", async () => {
  const { player, errors, reports } = fixture({
    createContext() { throw new Error("Audio unavailable"); },
  });
  await player.start(rhythm(1000));
  assert.deepEqual(errors, ["Audio unavailable"]);
  assert.equal(reports.length, 1);
  player.hit(false);
});
