import test from "node:test";
import assert from "node:assert/strict";
import { createPetanqueAudio, petanqueWav } from "../minigames/petanque-audio.mjs";

function setup() {
  const voices = [], errors = [], reports = [];
  const sound = createPetanqueAudio({
    createAudio(source) {
      const voice = { src: source, paused: false, listeners: {},
        addEventListener(type, fn) { this.listeners[type] = fn; },
        pause() { this.paused = true; },
        removeAttribute() { this.src = ""; },
        load() {}, async play() {},
      };
      voices.push(voice);
      return voice;
    },
    onError: message => errors.push(message),
    report: (...args) => reports.push(args),
  });
  return { sound, voices, errors, reports };
}

test("original throw, rolling and impact PCM WAVs are distinct, audible, bounded and deterministic", () => {
  const kinds = ["throw", "roll", "land", "hit"];
  const buffers = kinds.map(petanqueWav);
  for (let index = 0; index < buffers.length; index++) {
    const bytes = new Uint8Array(buffers[index]);
    assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
    assert.equal(new TextDecoder().decode(bytes.slice(8, 12)), "WAVE");
    assert.ok(bytes.length > 5000 && bytes.length < 50000);
    assert.deepEqual(buffers[index], petanqueWav(kinds[index]));
    assert.ok(bytes.slice(44).some(value => value !== 0));
  }
  assert.notDeepEqual(buffers[0], buffers[1]);
  assert.notDeepEqual(buffers[0], buffers[2]);
  assert.notDeepEqual(buffers[2], buffers[3]);
  assert.throws(() => petanqueWav("unknown"), /Unknown/);
});

test("audio respects mute/volume, loops only rolling, replaces voices and stops at completion", async () => {
  const h = setup();
  await h.sound.play("throw");
  assert.equal(h.voices.length, 0);
  h.sound.enable(true);
  h.sound.volume(0.2);
  await h.sound.play("throw");
  const first = h.voices[0];
  assert.equal(first.volume, 0.2);
  assert.equal(first.loop, false);
  await h.sound.play("roll");
  assert.equal(first.paused, true);
  assert.equal(first.src, "");
  assert.equal(h.voices[1].loop, true);
  h.sound.volume(0.4);
  assert.equal(h.voices[1].volume, 0.4);
  await h.sound.play("land");
  assert.equal(h.voices[1].paused, true);
  const impact = h.voices[2];
  assert.equal(impact.loop, false);
  impact.listeners.ended();
  assert.equal(impact.paused, true);
  await h.sound.play("roll");
  h.sound.enable(false);
  assert.equal(h.voices[3].paused, true);
  await h.sound.play("land");
  assert.equal(h.voices.length, 4);
  assert.throws(() => h.sound.volume(NaN), /Invalid/);
  await assert.rejects(h.sound.play("unknown"), /Unknown/);
});

test("errors surface explicitly, and stale callbacks after stopping cannot affect later audio", async () => {
  const h = setup();
  h.sound.enable(true);
  await h.sound.play("roll");
  const old = h.voices[0];
  h.sound.stop();
  await h.sound.play("land");
  old.error = new Error("Stale");
  old.listeners.error();
  assert.equal(h.reports.length, 0);
  assert.equal(h.voices[1].paused, false);
  h.voices[1].error = new Error("Decode failed");
  h.voices[1].listeners.error();
  assert.equal(h.reports.length, 1);
  assert.equal(h.errors.at(-1), "Decode failed");
  assert.equal(h.voices[1].paused, true);
});

test("rejected playback and construction errors report and clean up", async () => {
  for (const construction of [true, false]) {
    const errors = [];
    let paused = false;
    const sound = createPetanqueAudio({
      createAudio() {
        if (construction) throw new Error("Unavailable");
        return { addEventListener() {}, async play() { throw new Error("Blocked"); },
          pause() { paused = true; }, removeAttribute() {}, load() {} };
      },
      onError: message => errors.push(message), report() {},
    });

    sound.enable(true);
    await sound.play("throw");
    assert.equal(errors[0], construction ? "Unavailable" : "Blocked");
    assert.equal(paused, !construction);
    sound.stop();
  }
});

test("metallic collisions overlay rolling, respect shared volume/mute and discard stale errors", async () => {
  const h = setup();
  h.sound.enable(true);
  await h.sound.play("roll");
  await h.sound.play("hit");
  const [rolling, hit] = h.voices;
  assert.equal(rolling.paused, false, "an impact must not cut the gravel loop");
  assert.equal(hit.loop, false);
  h.sound.volume(0.15);
  assert.equal(rolling.volume, 0.15);
  assert.equal(hit.volume, 0.15);
  await h.sound.play("hit");
  assert.equal(hit.paused, true);
  assert.equal(rolling.paused, false);
  h.sound.enable(false);
  assert.equal(rolling.paused, true);
  assert.equal(h.voices[2].paused, true);
  hit.error = new Error("Stale collision");
  hit.listeners.error();
  assert.equal(h.reports.length, 0);
  await h.sound.play("hit");
  assert.equal(h.voices.length, 3);
});
