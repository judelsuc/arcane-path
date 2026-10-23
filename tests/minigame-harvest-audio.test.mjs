import test from "node:test";
import assert from "node:assert/strict";
import { createHarvestAudio, squishWav } from "../minigames/harvest-audio.mjs";

test("squish is a distinct audible generated WAV; native playback respects mute, volume and cleanup", async () => {
  const bytes = squishWav(), view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), "RIFF");
  assert.equal(view.getUint32(24, true), 22050);
  assert.equal((bytes.length - 44) / 2, Math.ceil(22050 * 0.32));
  let peak = 0;
  for (let i = 44; i < bytes.length; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)));
  assert.ok(peak > 20000);
  assert.deepEqual(bytes, squishWav());
  const voices = [], errors = [];
  const player = createHarvestAudio({
    createAudio(url) {
      const voice = { url, events: {}, async play() {}, pause() { this.paused = true; },
        removeAttribute() {}, load() {}, addEventListener(key, fn) { this.events[key] = fn; } };
      voices.push(voice);
      return voice;
    }, onError: message => errors.push(message),
  });
  await player.play("squish");
  assert.equal(voices.length, 0);
  player.enable(true);
  player.volume(0.4);
  await player.play("squish");
  assert.match(voices[0].url, /^data:audio\/wav;base64,/);
  assert.equal(voices[0].volume, 0.4);
  voices[0].events.ended();
  assert.equal(voices[0].paused, true);
  await player.play("success");
  assert.match(voices[1].url, /sfx-meal.wav$/);
  player.enable(false);
  assert.equal(voices[1].paused, true);
  assert.deepEqual(errors, ["", ""]);
});
