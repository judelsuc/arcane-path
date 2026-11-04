import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTheftAudio } from "../theft-audio.mjs";

function fixture(play = async () => {}) {
  const sounds = [], errors = [], reports = [];
  const player = createTheftAudio({
    createAudio(url) {
      const sound = { url, handlers: {}, play, pause() { this.paused = true; },
        removeAttribute() {}, load() {},
        addEventListener(event, callback) { this.handlers[event] = callback; } };
      sounds.push(sound);
      return sound;
    },
    onError: error => errors.push(error), report: (...args) => reports.push(args),
  });
  return { player, sounds, errors, reports };
}

test("theft outcome sounds exist, differ, respect volume/mute, and stop on completion", async () => {
  const h = fixture();
  await h.player.play("success");
  assert.equal(h.sounds.length, 0);
  h.player.enable(true);
  await h.player.play("success");
  await h.player.play("caught");
  assert.notEqual(h.sounds[0].url, h.sounds[1].url);
  for (const sound of h.sounds) {
    assert.equal(readFileSync(new URL(`../${sound.url}`, import.meta.url)).subarray(0, 4).toString(), "RIFF");
    assert.equal(sound.loop, false);
  }
  assert.equal(h.sounds[0].paused, true);
  h.player.volume(0.4);
  assert.equal(h.sounds[1].volume, 0.4);
  h.sounds[1].handlers.ended();
  assert.equal(h.sounds[1].paused, true);
  await h.player.play("success");
  h.player.enable(false);
  assert.equal(h.sounds[2].paused, true);
  await h.player.play("caught");
  assert.equal(h.sounds.length, 3);
  assert.deepEqual(h.errors, ["", "", ""]);
  for (const value of [-1, NaN, 2]) assert.throws(() => h.player.volume(value));
  await assert.rejects(h.player.play("unknown"), /Unknown theft sound/);
});

test("theft playback errors surface, while cancellation suppresses stale errors", async () => {
  const h = fixture(async () => { throw new Error("Playback blocked"); });
  h.player.enable(true);
  await h.player.play("caught");
  assert.deepEqual(h.errors, ["Playback blocked"]);
  assert.equal(h.reports.length, 1);
  const media = fixture();
  media.player.enable(true);
  await media.player.play("success");
  media.sounds[0].error = new Error("Decode failed");
  media.sounds[0].handlers.error();
  assert.equal(media.errors.at(-1), "Decode failed");
  let reject;
  const pending = fixture(() => new Promise((_, fail) => { reject = fail; }));
  pending.player.enable(true);
  const loading = pending.player.play("success");
  pending.player.stop();
  reject(new Error("Stale"));
  await loading;
  assert.deepEqual(pending.errors, []);
  assert.equal(pending.sounds[0].paused, true);
});
