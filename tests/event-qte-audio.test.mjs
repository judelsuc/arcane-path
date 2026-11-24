import test from "node:test";
import assert from "node:assert/strict";
import { createEventQteAudio, eventQteWav, EVENT_QTE_SOUNDS } from "../event-qte-audio.mjs";

function setup() {
  const voices = [], errors = [], reports = [];
  const sound = createEventQteAudio({
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

test("cue, go, hit, success and failure PCM WAVs are distinct, audible, bounded and deterministic", () => {
  const buffers = EVENT_QTE_SOUNDS.map(eventQteWav);
  for (let index = 0; index < buffers.length; index++) {
    const bytes = new Uint8Array(buffers[index]);
    assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
    assert.equal(new TextDecoder().decode(bytes.slice(8, 12)), "WAVE");
    assert.ok(bytes.length > 2000 && bytes.length < 50000);
    assert.deepEqual(buffers[index], eventQteWav(EVENT_QTE_SOUNDS[index]));
    assert.ok(bytes.slice(44).some(value => value !== 0));
    for (let other = 0; other < index; other++) assert.notDeepEqual(buffers[index], buffers[other]);
  }
  assert.throws(() => eventQteWav("unknown"), /Unknown/);
});

test("outcome sounds overlay cues, respect mute and shared volume, and reject invalid input", async () => {
  const h = setup();
  await h.sound.play("cue");
  assert.equal(h.voices.length, 0, "muted audio creates no voices");
  h.sound.enable(true);
  h.sound.volume(0.2);
  await h.sound.play("cue");
  await h.sound.play("hit");
  const [cue, hit] = h.voices;
  assert.equal(cue.paused, false, "a correct press must not cut the next cue");
  assert.equal(cue.volume, 0.2);
  assert.equal(hit.volume, 0.2);
  await h.sound.play("go");
  assert.equal(cue.paused, true, "a new cue replaces the previous one");
  assert.equal(hit.paused, false);
  h.sound.enable(false);
  assert.ok(h.voices.every(voice => voice.paused));
  assert.throws(() => h.sound.volume(2), /Invalid/);
  await assert.rejects(h.sound.play("unknown"), /Unknown/);
});
