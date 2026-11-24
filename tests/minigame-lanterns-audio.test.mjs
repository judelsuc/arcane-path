import test from "node:test";
import assert from "node:assert/strict";
import { createLanternAudio } from "../minigames/lanterns-audio.mjs";

function fixture() {
  const voices = [], gains = [], errors = [];
  const context = {
    state: "running", currentTime: 0, destination: {},
    createOscillator() {
      const voice = { frequency: {}, connect() {}, disconnect() { this.disconnected = true; },
        start() { this.started = true; }, stop() { this.stops = (this.stops ?? 0) + 1; } };
      voices.push(voice);
      return voice;
    },
    createGain() {
      const gain = { gain: { setValueAtTime() {}, linearRampToValueAtTime(value) { this.peak = value; }, exponentialRampToValueAtTime() {} },
        connect() {}, disconnect() { this.disconnected = true; } };
      gains.push(gain);
      return gain;
    },
    async resume() { this.state = "running"; },
  };
  const audio = createLanternAudio({ createContext: () => context, onError: value => errors.push(value), report() {} });
  return { audio, context, voices, gains, errors };
}

test("six distinct tones have an audible bounded envelope, respect mute and release their nodes", async () => {
  const f = fixture();
  f.audio.volume(0.2);
  for (let index = 0; index < 6; index++) await f.audio.play(index);
  assert.equal(new Set(f.voices.map(voice => voice.frequency.value)).size, 6);
  assert.ok(f.gains.every(gain => gain.gain.peak === 0.2));
  f.voices[0].onended();
  assert.equal(f.gains[0].disconnected, true);
  f.audio.enable(false);
  assert.ok(f.voices.every(voice => voice.disconnected));
  assert.ok(f.gains.every(gain => gain.disconnected));
  await f.audio.play(1);
  assert.equal(f.voices.length, 6);
  f.audio.enable(true);
  await f.audio.play(1);
  assert.equal(f.voices.length, 7);
  f.audio.stop();
  assert.throws(() => f.audio.volume(NaN), RangeError);
  await assert.rejects(f.audio.play(6), RangeError);
});

test("stop or mute during asynchronous resume prevents a stale tone", async () => {
  for (const action of ["stop", "mute"]) {
    const f = fixture();
    let resume;
    f.context.state = "suspended";
    f.context.resume = () => new Promise(resolve => { resume = resolve; });
    const pending = f.audio.play(0);
    if (action === "stop") f.audio.stop();
    else f.audio.enable(false);
    resume();
    await pending;
    assert.equal(f.voices.length, 0);
  }
});

test("Start unlocks audio without an extra note that could be mistaken for the sequence", async () => {
  const f = fixture();
  f.context.state = "suspended";
  await f.audio.unlock();
  assert.equal(f.context.state, "running");
  assert.equal(f.voices.length, 0);
  await f.audio.play(3);
  assert.equal(f.voices.length, 1);
  f.audio.stop();
});

test("unavailable audio surfaces an explicit error instead of claiming success", async () => {
  const errors = [], reports = [];
  const audio = createLanternAudio({
    createContext() { throw new Error("Audio unavailable"); },
    onError: value => errors.push(value), report: (...args) => reports.push(args),
  });
  await audio.play(0);
  assert.deepEqual(errors, ["Audio unavailable"]);
  assert.equal(reports.length, 1);
});
