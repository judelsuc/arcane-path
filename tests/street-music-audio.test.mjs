import test from "node:test";
import assert from "node:assert/strict";
import { createStreetMusicAudio, streetMusicWav } from "../street-music-audio.mjs";
import { MUSIC, rhythm, beatTime, rhythmEnd } from "../music.mjs";

function fixture(options = {}) {
  const voices = [], errors = [], reports = [];
  const player = createStreetMusicAudio({
    createAudio(url) {
      const voice = { url, handlers: {}, currentTime: 0,
        async play() { this.played = true; }, pause() { this.paused = true; },
        removeAttribute() {}, load() {},
        addEventListener(name, handler) { this.handlers[name] = handler; } };
      voices.push(voice);
      return voice;
    },
    now: () => 1000, onError: error => errors.push(error),
    report: (...args) => reports.push(args), ...options,
  });
  return { player, voices, errors, reports };
}

test("native PCM melody contains audible cues on the exact visual beat clock, including all three loops", () => {
  const bytes = streetMusicWav(), view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), "RIFF");
  assert.equal(new TextDecoder().decode(bytes.subarray(8, 12)), "WAVE");
  assert.equal(view.getUint32(4, true), bytes.length - 8);
  assert.equal(view.getUint32(24, true), 22050);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), bytes.length - 44);
  function peak(at, duration) {
    let max = 0;
    for (let i = Math.round(at * 22050); i < (at + duration) * 22050; i++) {
      max = Math.max(max, Math.abs(view.getInt16(44 + i * 2, true)));
    }
    return max;
  }
  assert.equal(peak(0, MUSIC.leadMs / 1000), 0);
  for (let i = 0; i < MUSIC.beats; i++) {
    assert.ok(peak(beatTime(rhythm(0), i) / 1000, 0.1) > 8000);
  }
  assert.equal(peak((MUSIC.leadMs + MUSIC.intervalMs * 2) / 1000, 0.1), 0);
  assert.notDeepEqual(streetMusicWav(true), streetMusicWav(false));
});

test("native audio plays the melody and distinct hit/miss WAVs; mute, volume and stop affect all voices", async () => {
  const { player, voices, errors } = fixture();
  player.enable(true);
  await player.start(rhythm(1000));
  assert.equal(voices.length, 1);
  assert.equal(voices[0].played, true);
  assert.equal(voices[0].muted, false);
  assert.equal(voices[0].volume, 0.25);
  assert.equal(voices[0].currentTime, 0);
  player.hit(true);
  player.hit(false);
  assert.equal(voices.length, 3);
  const blobs = await Promise.all(voices.map(async v => (await fetch(v.url)).arrayBuffer()));
  assert.notDeepEqual(blobs[1], blobs[2]);
  player.volume(0.6);
  player.enable(false);
  assert.ok(voices.every(v => v.volume === 0.6 && v.muted));
  player.enable(true);
  assert.ok(voices.every(v => !v.muted));
  player.stop();
  assert.ok(voices.every(v => v.paused));
  player.hit(true);
  assert.equal(voices.length, 3);
  await assert.rejects(fetch(voices[0].url));
  assert.deepEqual(errors, [""]);
  for (const value of [-1, 2, NaN]) assert.throws(() => player.volume(value));
});

test("loading latency seeks to the visual clock and never plays an expired performance", async () => {
  const { player, voices } = fixture({ now: () => 3000 });
  await player.start(rhythm(1000));
  assert.equal(voices[0].currentTime, 2);
  const expired = fixture({ now: () => rhythmEnd(rhythm(1000)) + 1000 });
  await expired.player.start(rhythm(1000));
  assert.equal(expired.voices[0].paused, true);
});

test("cancelled loading cannot revive music, later performances work and ended tap URLs are released", async () => {
  const { player, voices } = fixture();
  let unlock;
  const pendingPlayer = fixture({ createAudio: () => ({
    addEventListener() {}, play: () => new Promise(resolve => { unlock = resolve; }),
    pause() {}, removeAttribute() {}, load() {},
  }) }).player;
  const pending = pendingPlayer.start(rhythm(1000));
  pendingPlayer.stop();
  unlock();
  await pending;
  player.enable(true);
  await player.start(rhythm(1000));
  player.stop();
  await player.start(rhythm(1000));
  player.hit(true);
  const tap = voices.at(-1);
  tap.handlers.ended();
  await assert.rejects(fetch(tap.url));
  player.stop();
});

test("rejected native playback and decode errors are visible without rejecting the visual game", async () => {
  const { player, errors, reports } = fixture({
    createAudio: () => ({ addEventListener() {}, pause() {}, removeAttribute() {}, load() {},
      async play() { throw new Error("Audio unavailable"); } }),
  });
  await player.start(rhythm(1000));
  assert.deepEqual(errors, ["Audio unavailable"]);
  assert.equal(reports.length, 1);
  player.hit(false);
  const decoding = fixture();
  await decoding.player.start(rhythm(1000));
  decoding.voices[0].handlers.error();
  assert.match(decoding.errors.at(-1), /decoded/);
  assert.equal(decoding.voices[0].paused, true);
});
