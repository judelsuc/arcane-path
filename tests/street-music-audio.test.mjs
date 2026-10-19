import test from "node:test";
import assert from "node:assert/strict";
import { createStreetMusicAudio, streetMusicWav } from "../street-music-audio.mjs";
import { MUSIC, rhythm, beatTime, rhythmEnd, musicDifficulty, holdDuration } from "../music.mjs";

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
  const game = rhythm(1000, () => 0.42);
  const bytes = streetMusicWav(undefined, game), view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), "RIFF");
  assert.equal(new TextDecoder().decode(bytes.subarray(8, 12)), "WAVE");
  assert.equal(view.getUint32(4, true), bytes.length - 8);
  assert.equal(view.getUint32(24, true), 22050);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), bytes.length - 44);
  function peak(at, duration) {
    let max = 0;
    for (let i = Math.round(at * 22050); i < (at + duration) * 22050 && 44 + i * 2 < bytes.length; i++) {
      max = Math.max(max, Math.abs(view.getInt16(44 + i * 2, true)));
    }
    return max;
  }
  assert.equal(peak(0, MUSIC.leadMs / 1000), 0);
  for (let i = 0; i < MUSIC.beats; i++) {
    assert.ok(peak((beatTime(game, i) - game.startedAt) / 1000, 0.1) > 8000);
  }
  for (let loop = 0; loop < MUSIC.loops; loop++) {
    for (let slot = 0; slot < MUSIC.slots; slot++) {
      if (!game.pattern[slot]) {
        assert.equal(peak((MUSIC.leadMs + MUSIC.intervalMs * (loop * MUSIC.slots + slot)) / 1000, 0.1), 0);
      }
    }
  }
  assert.notDeepEqual(bytes, streetMusicWav(undefined, rhythm(1000, () => 0.99)));
  assert.notDeepEqual(streetMusicWav(true), streetMusicWav(false));
});

test("Judgement audio previews the normal phrase and reproduces every note without phrase ties", () => {
  const generated = rhythm(1000, () => 0.42, MUSIC.minMistakes, MUSIC.beats, { resonance: true });
  const game = { ...generated, startedAt: generated.startedAt + generated.previewMs };
  const bytes = streetMusicWav(undefined, game), view = new DataView(bytes.buffer);
  const peak = (at, duration = 0.08) => {
    let max = 0;
    for (let i = Math.round(at * 22050); i < (at + duration) * 22050; i++) {
      if (44 + i * 2 >= bytes.length) break;
      max = Math.max(max, Math.abs(view.getInt16(44 + i * 2, true)));
    }
    return max;
  };
  const firstSlot = game.pattern.findIndex(value => value > 0);
  const firstOffset = (MUSIC.leadMs + firstSlot * game.intervalMs) / 1000;
  assert.ok(peak(firstOffset + 0.04) > 8000);
  assert.ok(peak(game.previewMs / 1000 + firstOffset + 0.04) > 8000);
  const normal = streetMusicWav(undefined, { ...game, resonance: false, previewMs: 0 });
  const offset = Math.round(game.previewMs / 1000 * 22050) * 2;
  assert.deepEqual(bytes.subarray(44 + offset), normal.subarray(44));
  assert.equal((bytes.length - 44) / 2,
    Math.ceil(((rhythmEnd(game) - game.startedAt + game.previewMs) / 1000 + 0.3) * 22050));
  assert.ok(game.resonance);
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

test("higher-level audio follows the faster clock and sustains 2-, 3- and 4-beat held notes", () => {
  const profile = musicDifficulty({ skills: { music: 240 } });
  const game = rhythm(0, () => 0.99, 8, profile.beats, profile);
  const bytes = streetMusicWav(undefined, game), view = new DataView(bytes.buffer);
  assert.equal((bytes.length - 44) / 2,
    Math.ceil(((rhythmEnd(game) - game.startedAt) / 1000 + 0.3) * 22050));
  for (let index = 0; index < game.hits.length; index++) {
    const at = (beatTime(game, index) - game.startedAt) / 1000;
    const duration = holdDuration(game, index);
    const sampleAt = at + (duration ? duration / 1000 * 0.8 : 0.04);
    let peak = 0;
    for (let sample = Math.round(sampleAt * 22050); sample < (sampleAt + 0.02) * 22050; sample++) {
      peak = Math.max(peak, Math.abs(view.getInt16(44 + sample * 2, true)));
    }
    assert.ok(peak > 0, `Note ${index} must remain audible on its visual clock.`);
  }
});
test("loading latency seeks to the visual clock and never plays an expired performance", async () => {
  const { player, voices } = fixture({ now: () => 3000 });
  await player.start(rhythm(1000));
  assert.equal(voices[0].currentTime, 2);
  const expired = fixture({ now: () => rhythmEnd(rhythm(1000)) + 1000 });
  await expired.player.start(rhythm(1000));
  assert.equal(expired.voices[0].paused, true);
});

test("each start regenerates backing audio from that performance's drawn rhythm", async () => {
  const { player, voices } = fixture();
  const first = rhythm(1000, () => 0), second = rhythm(1000, () => 0.99);
  await player.start(first);
  const firstBytes = new Uint8Array(await (await fetch(voices[0].url)).arrayBuffer());
  await player.start(second);
  const secondBytes = new Uint8Array(await (await fetch(voices[1].url)).arrayBuffer());
  assert.deepEqual(firstBytes, streetMusicWav(undefined, first));
  assert.deepEqual(secondBytes, streetMusicWav(undefined, second));
  assert.notDeepEqual(firstBytes, secondBytes);
  player.stop();
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
