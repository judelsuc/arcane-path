import { MUSIC, rhythm, beatTime, rhythmEnd } from "./music.mjs";

const MELODY = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 392, 523.25];
const BASS = [130.81, 130.81, 130.81, 130.81, 146.83, 146.83, 196, 130.81];
const SAMPLE_RATE = 22050;

export function streetMusicWav(hit) {
  const game = rhythm(0);
  const seconds = hit === undefined ? rhythmEnd(game) / 1000 + 0.3 : 0.16;
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
    for (let i = 0; i < MUSIC.beats; i++) {
      const at = beatTime(game, i) / 1000;
      note(MELODY[i % MELODY.length], at, 0.22, 0.55, true);
      note(BASS[i % BASS.length], at, 0.3, 0.35);
    }
  } else note(hit ? 783.99 : 110, 0, 0.12, hit ? 0.4 : 0.3);
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  function text(offset, value) {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  }
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVE"); text(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  }
  return bytes;
}

export function createStreetMusicAudio({ createAudio, now = () => performance.now(),
  onError, report = console.warn }) {
  let enabled = false, volume = 0.25, generation = 0, active = false, melody;
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
  async function play(bytes, token, game) {
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
        const elapsed = Math.max(0, (now() - game.startedAt) / 1000);
        if (elapsed * 1000 >= rhythmEnd(game) - game.startedAt) return stop();
        voice.audio.currentTime = elapsed;
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
      melody ??= streetMusicWav();
      return play(melody, generation, game);
    },
    hit(success) {
      if (!active) return;
      if (!sounds.has(success)) sounds.set(success, streetMusicWav(success));
      void play(sounds.get(success), generation);
    },
    stop,
  };
}
