import test from "node:test";
import assert from "node:assert/strict";
import { cafeWav, createCafeAudio } from "../cafe-audio.mjs";
import { CAFE } from "../cafe.mjs";

function fixture(options = {}) {
  const voices = [], errors = [], reports = [];
  const player = createCafeAudio({
    createAudio(url) {
      const voice = { url, handlers: {}, async play() {}, pause() { this.paused = true; },
        removeAttribute() {}, load() {},
        addEventListener(name, callback) { this.handlers[name] = callback; } };
      voices.push(voice);
      return voice;
    },
    onError: error => errors.push(error),
    report: (...args) => reports.push(args),
    ...options,
  });
  return { player, voices, errors, reports };
}

test("original cafe ambience loops for 12 seconds and each ingredient has a distinct audible pickup", () => {
  const ambient = cafeWav("ambience"), view = new DataView(ambient.buffer);
  assert.equal(view.getUint32(24, true), 22050);
  assert.equal(view.getUint32(40, true), 12 * 22050 * 2);
  assert.equal(view.getInt16(44, true), 0);
  assert.ok(Math.abs(view.getInt16(ambient.length - 2, true)) <= 10);
  for (let second = 0; second < 12; second++) {
    let peak = 0;
    for (let i = second * 22050; i < (second + 1) * 22050; i++) {
      peak = Math.max(peak, Math.abs(view.getInt16(44 + i * 2, true)));
    }
    assert.ok(peak > 1000);
  }
  const sounds = CAFE.ingredients.map(cafeWav);
  assert.equal(new Set(sounds.map(sound => Buffer.from(sound).toString("base64"))).size, 5);
  for (const sound of sounds) {
    const samples = new DataView(sound.buffer);
    assert.equal(samples.getUint32(40, true), 0.16 * 22050 * 2);
    assert.ok(sound.subarray(44).some(value => value !== 0));
  }
  assert.throws(() => cafeWav("unknown"), /Unknown/);
});

test("cafe sound shares volume/mute, resumes ambience on unmute, and releases every voice on stop", async () => {
  const { player, voices, errors } = fixture();
  await player.start();
  assert.equal(voices.length, 0);
  player.enable(true);
  await Promise.resolve();
  assert.equal(voices.length, 1);
  assert.equal(voices[0].loop, true);
  player.enable(true);
  assert.equal(voices.length, 1);
  await player.pickup("coffee");
  assert.equal(voices[1].loop, false);
  player.volume(0.6);
  assert.equal(voices[0].volume, 0.6 * 0.75);
  assert.equal(voices[1].volume, 0.6);
  voices[1].handlers.ended();
  await assert.rejects(fetch(voices[1].url));
  player.enable(false);
  assert.ok(voices.every(voice => voice.paused));
  await assert.rejects(fetch(voices[0].url));
  await player.pickup("tea");
  assert.equal(voices.length, 2);
  player.enable(true);
  await Promise.resolve();
  assert.equal(voices.length, 3);
  assert.equal(voices[2].loop, true);
  player.stop();
  await player.pickup("cake");
  assert.equal(voices.length, 3);
  assert.ok(voices.every(voice => voice.paused));
  assert.ok(errors.every(error => error === ""));
  for (const value of [-1, 2, NaN]) assert.throws(() => player.volume(value), /volume/);
  assert.throws(() => player.pickup("unknown"), /Unknown/);
});

test("cancelled cafe loading never revives audio or overwrites a later error", async () => {
  let finish;
  const voices = [], errors = [];
  const { player } = fixture({
    onError: error => errors.push(error),
    createAudio(url) {
      const voice = { url, addEventListener() {}, removeAttribute() {}, load() {},
        pause() { this.paused = true; }, play: () => new Promise(resolve => { finish = resolve; }) };
      voices.push(voice);
      return voice;
    },
  });
  player.enable(true);
  const loading = player.start();
  player.stop();
  finish();
  await loading;
  assert.equal(voices[0].paused, true);
  await assert.rejects(fetch(voices[0].url));
  assert.deepEqual(errors, []);
});

test("playback rejection and decode errors are reported without rejecting the visual shift", async () => {
  const failed = fixture({ createAudio: () => ({
    addEventListener() {}, removeAttribute() {}, load() {}, pause() {},
    async play() { throw new Error("Audio blocked"); },
  }) });
  failed.player.enable(true);
  await failed.player.start();
  assert.deepEqual(failed.errors, ["Audio blocked"]);
  assert.equal(failed.reports.length, 1);
  const decoded = fixture();
  decoded.player.enable(true);
  await decoded.player.start();
  decoded.voices[0].error = { message: "Decode failed" };
  decoded.voices[0].handlers.error();
  assert.equal(decoded.errors.at(-1), "Decode failed");
  assert.equal(decoded.reports.length, 1);
  await assert.rejects(fetch(decoded.voices[0].url));
});
