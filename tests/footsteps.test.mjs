import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFootstepPlayer, footstepSource } from "../footsteps.mjs";

function harness(play = async () => {}) {
  const sounds = [], reports = [], errors = [];
  const player = createFootstepPlayer({
    createAudio(url) {
      const audio = { url, listeners: {}, paused: false,
        play, pause() { this.paused = true; }, removeAttribute() {}, load() {},
        addEventListener(name, callback) { this.listeners[name] = callback; } };
      sounds.push(audio);
      return audio;
    },
    report: (...args) => reports.push(args), onError: error => errors.push(error),
  });
  return { player, sounds, reports, errors };
}

test("every supported terrain selects an existing original footstep WAV, without a music dependency", () => {
  const map = JSON.parse(readFileSync(new URL("../public/map.json", import.meta.url)));
  for (const { terrain } of map.legend) {
    const source = footstepSource(terrain);
    assert.match(source, /sfx-step-(road|grass|forest|water|stone)\.wav$/);
    assert.equal(readFileSync(new URL("../" + source, import.meta.url)).subarray(0, 4).toString(), "RIFF");
  }
  for (const [terrain, surface] of [["road", "road"], ["forest", "forest"],
    ["field", "grass"], ["water", "water"], ["place", "stone"], ["mountain", "stone"]]) {
    assert.ok(footstepSource(terrain).endsWith(`sfx-step-${surface}.wav`));
  }
  assert.throws(() => footstepSource("unavailable"), /Unknown footstep/);
});

test("footsteps are one-shots, respect enable/mute and volume, and never accumulate loops", async () => {
  const h = harness();
  await h.player.play("road");
  assert.equal(h.sounds.length, 0);
  h.player.enable(true);
  h.player.volume(0.4);
  await h.player.play("forest");
  const first = h.sounds[0];
  assert.equal(first.loop, false);
  assert.equal(first.volume, 0.4);
  await h.player.play("road");
  assert.equal(first.paused, true);
  h.player.volume(0.1);
  assert.equal(h.sounds[1].volume, 0.1);
  h.player.enable(false);
  assert.equal(h.sounds[1].paused, true);
  await h.player.play("water");
  assert.equal(h.sounds.length, 2);
  for (const volume of [-1, 1.1, NaN]) assert.throws(() => h.player.volume(volume));
});

test("audio failures are logged and surfaced; muted or superseded attempts ignore late errors", async () => {
  const h = harness(async () => { throw new Error("Browser blocked playback"); });
  h.player.enable(true);
  await h.player.play("road");
  assert.equal(h.reports.length, 1);
  assert.equal(h.errors.at(-1), "Browser blocked playback");
  assert.equal(h.sounds[0].paused, true);
  let reject;
  const delayed = harness(() => new Promise((resolve, fail) => { reject = fail; }));
  delayed.player.enable(true);
  const pending = delayed.player.play("grass");
  delayed.player.enable(false);
  reject(new Error("Cancelled by mute"));
  await pending;
  assert.deepEqual(delayed.reports, []);
  const media = harness();
  media.player.enable(true);
  await media.player.play("road");
  media.sounds[0].error = new Error("Audio missing");
  media.sounds[0].listeners.error();
  assert.equal(media.errors.at(-1), "Audio missing");
  assert.equal(media.reports.length, 1);
});
