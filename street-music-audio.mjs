import { MUSIC, beatTime, rhythmEnd, holdDuration } from "./music.mjs";
import { pcmWav } from "./pcm-wav.mjs";

const MELODY = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 392, 523.25];
const BASS = [130.81, 130.81, 130.81, 130.81, 146.83, 146.83, 196, 130.81];
const SAMPLE_RATE = 22050;

export function streetMusicWav(hit, game) {
  const previewMs = hit === undefined ? game.previewMs ?? 0 : 0;
  const seconds = hit === undefined
    ? (rhythmEnd(game) - game.startedAt + previewMs) / 1000 + 0.3 : 0.16;
  const samples = new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
  function note(frequency, at, duration, level, triangle = false) {
    const start = Math.round(at * SAMPLE_RATE);
    for (let i = 0; i < duration * SAMPLE_RATE && start + i < samples.length; i++) {
      const time = i / SAMPLE_RATE;
      const phase = time * frequency;
      const wave = triangle ? 2 / Math.PI * Math.asin(Math.sin(2 * Math.PI * phase))
        : Math.sin(2 * Math.PI * phase);
      const envelope = Math.min(1, time / 0.012) * Math.exp(-6 * time / duration);
      samples[start + i] += wave * envelope * level;
    }
  }
  if (hit === undefined) {
    const phraseBeats = game.hits.length / MUSIC.loops;
    if (previewMs) {
      for (let i = 0; i < phraseBeats; i++) {
        const at = (beatTime(game, i) - game.startedAt) / 1000;
        const duration = holdDuration(game, i) / 1000;
        note(MELODY[i % MELODY.length], at, duration || 0.22, 0.55, true);
        note(BASS[i % BASS.length], at, duration || 0.3, 0.35);
      }
    }
    for (let i = 0; i < game.hits.length; i++) {
      const at = (beatTime(game, i) - game.startedAt) / 1000 + previewMs / 1000;
      const duration = holdDuration(game, i) / 1000;
      note(MELODY[i % MELODY.length], at, duration || 0.22, 0.55, true);
      note(BASS[i % BASS.length], at, duration || 0.3, 0.35);
    }
  } else note(hit ? 783.99 : 110, 0, 0.12, hit ? 0.4 : 0.3);
  return pcmWav(samples, SAMPLE_RATE);
}

export function createStreetMusicAudio({ createAudio, now = () => performance.now(),
  onError, report = console.warn }) {
  let enabled = false, volume = 0.25, generation = 0, active = false;
  const sounds = new Map(), voices = new Set();

  function release(voice) {
    if (!voices.delete(voice)) return;
    voice.audio.pause();
    voice.audio.removeAttribute("src");
    voice.audio.load();
    URL.revokeObjectURL(voice.url);
  }
  function stop() {
    generation++;
    active = false;
    for (const voice of voices) release(voice);
  }
  function fail(error) {
    stop();
    report("Street music playback failed:", error);
    onError(error.message);
  }
  async function play(bytes, token, game, origin) {
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    let voice, timeout;
    try {
      voice = { url, audio: createAudio(url) };
      voices.add(voice);
      voice.audio.volume = volume;
      voice.audio.muted = !enabled;
      voice.audio.addEventListener("ended", () => release(voice), { once: true });
      voice.audio.addEventListener("error", () => {
        if (token === generation && voices.has(voice)) {
          fail(new Error(voice.audio.error?.message || "Street music could not be decoded."));
        }
      }, { once: true });
      await Promise.race([voice.audio.play(), new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Street music loading timed out.")), 10000);
      })]);
      if (token !== generation || !voices.has(voice)) return;
      if (game) {
        const elapsed = Math.max(0, now() - game.startedAt);
        if (elapsed >= rhythmEnd(game) - game.startedAt) return stop();
        voice.audio.currentTime = Math.max(0, (now() - origin) / 1000);
        active = true;
        onError("");
      }
    } catch (error) {
      if (!voice) URL.revokeObjectURL(url);
      if (token === generation) fail(error);
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    enable(value) {
      enabled = value;
      for (const voice of voices) voice.audio.muted = !value;
    },
    volume(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid street music volume.");
      volume = value;
      for (const voice of voices) voice.audio.volume = value;
    },
    start(game) {
      stop();
      const origin = game.startedAt - (game.previewMs ?? 0);
      return play(streetMusicWav(undefined, game), generation, game, origin);
    },
    hit(success) {
      if (!active) return;
      if (!sounds.has(success)) sounds.set(success, streetMusicWav(success));
      void play(sounds.get(success), generation);
    },
    stop,
  };
}
