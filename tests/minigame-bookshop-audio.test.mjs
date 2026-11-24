import test from "node:test";
import assert from "node:assert/strict";
import { createBookshopAudio } from "../minigames/bookshop-audio.mjs";

test("bookshop cues are audible, distinct where useful, muted and stopped through the shared tone lifecycle", async () => {
  const voices = [], gains = [], errors = [];
  const context = {
    state: "running", currentTime: 0, destination: {},
    createOscillator() {
      const voice = {
        frequency: {}, connect() {}, disconnect() { this.disconnected = true; },
        start() { this.started = true; }, stop() { this.stopped = true; },
      };
      voices.push(voice);
      return voice;
    },
    createGain() {
      const gain = {
        gain: { setValueAtTime() {}, linearRampToValueAtTime(value) { this.peak = value; }, exponentialRampToValueAtTime() {} },
        connect() {}, disconnect() { this.disconnected = true; },
      };
      gains.push(gain);
      return gain;
    },
  };
  const audio = createBookshopAudio({ createContext: () => context, onError: message => errors.push(message) });
  await audio.unlock();
  assert.equal(voices.length, 0);
  audio.volume(0.2);
  for (const cue of ["select", "place", "serve", "mistake", "complete", "failed"]) await audio.play(cue);
  assert.equal(voices.length, 6);
  assert.ok(gains.every(gain => gain.gain.peak === 0.2));
  assert.equal(new Set(voices.slice(0, 5).map(voice => voice.frequency.value)).size, 5);
  audio.enable(false);
  assert.ok(voices.every(voice => voice.disconnected && voice.stopped));
  assert.ok(gains.every(gain => gain.disconnected));
  await audio.play("place");
  assert.equal(voices.length, 6);
  assert.throws(() => audio.play("unknown"), RangeError);
  assert.ok(errors.every(message => message === ""));
});

test("bookshop audio failures are reported explicitly with the correct game name", async () => {
  const errors = [], reports = [];
  const audio = createBookshopAudio({
    createContext() { throw new Error("Audio blocked"); },
    onError: message => errors.push(message), report: (...args) => reports.push(args),
  });
  await audio.play("select");
  assert.deepEqual(errors, ["Audio blocked"]);
  assert.equal(reports[0][0], "Bookshop sound playback failed:");
});
