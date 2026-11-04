import { CAFE } from "./cafe.mjs";
import { pcmWav } from "./pcm-wav.mjs";

const RATE = 22050;

export function cafeWav(kind) {
  if (kind !== "ambience" && !CAFE.ingredients.includes(kind)) throw new Error("Unknown cafe sound.");
  const ambient = kind === "ambience", seconds = ambient ? 12 : 0.16;
  const samples = new Float32Array(Math.round(seconds * RATE));
  let seed = 1234567, rumble = 0;
  for (let i = 0; i < samples.length; i++) {
    const time = i / RATE;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    if (ambient) {
      rumble = rumble * 0.92 + noise * 0.08;
      const chatter = [137, 193, 251, 317].reduce((sum, frequency, voice) => {
        const syllable = Math.max(0, Math.sin(2 * Math.PI * (2.5 + voice * 0.5) * time + voice));
        const phrase = 0.5 + 0.5 * Math.sin(2 * Math.PI * (voice + 1) / 12 * time);
        return sum + Math.sin(2 * Math.PI * frequency * time) * syllable * phrase * 0.025;
      }, 0);
      const clinkTime = (time + 0.2) % 1.5;
      const clink = Math.sin(2 * Math.PI * 1760 * clinkTime) * Math.exp(-30 * clinkTime) * 0.14;
      const machine = noise * (0.015 + 0.04 * Math.max(0, Math.sin(2 * Math.PI * time / 6)));
      const edge = Math.min(1, time / 0.05, (seconds - time) / 0.05);
      samples[i] = (rumble * 0.9 + chatter + clink + machine) * edge;
    } else {
      const frequency = [740, 880, 1047, 554, 659][CAFE.ingredients.indexOf(kind)];
      const envelope = Math.min(1, time / 0.003) * Math.exp(-28 * time);
      samples[i] = (Math.sin(2 * Math.PI * frequency * time) * 0.5 +
        Math.sin(2 * Math.PI * frequency * 2.4 * time) * 0.15 + noise * 0.08) * envelope;
    }
  }
  return pcmWav(samples, RATE);
}

export function createCafeAudio({ createAudio, onError, report = console.warn }) {
  let enabled = false, volume = 0.25, desired = false, generation = 0;
  const buffers = new Map(), voices = new Set();
  function release(voice) {
    if (!voices.delete(voice)) return;
    voice.audio.pause();
    voice.audio.removeAttribute("src");
    voice.audio.load();
    URL.revokeObjectURL(voice.url);
  }
  function clear() {
    generation++;
    for (const voice of voices) release(voice);
  }
  function stop() {
    desired = false;
    clear();
  }
  async function play(kind) {
    if (!enabled || !desired) return;
    if (!buffers.has(kind)) buffers.set(kind, cafeWav(kind));
    const token = generation, loop = kind === "ambience";
    const url = URL.createObjectURL(new Blob([buffers.get(kind)], { type: "audio/wav" }));
    let voice, timeout;
    function fail(error) {
      if (token !== generation) return;
      stop();
      report("Cafe audio playback failed:", error);
      onError(error.message);
    }
    try {
      voice = { audio: createAudio(url), url, gain: loop ? 0.75 : 1 };
      voices.add(voice);
      voice.audio.loop = loop;
      voice.audio.volume = volume * voice.gain;
      voice.audio.addEventListener("ended", () => release(voice), { once: true });
      voice.audio.addEventListener("error", () => {
        if (voices.has(voice)) fail(new Error(
          voice.audio.error?.message || "Cafe audio could not be decoded."));
      }, { once: true });
      await Promise.race([voice.audio.play(), new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Cafe audio loading timed out.")), 10000);
      })]);
      if (token === generation && voices.has(voice)) onError("");
    } catch (error) {
      if (!voice) URL.revokeObjectURL(url);
      fail(error);
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    enable(value) {
      if (value === enabled) return;
      enabled = value;
      if (!enabled) clear();
      else if (desired) void play("ambience");
    },
    volume(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid cafe volume.");
      volume = value;
      for (const voice of voices) voice.audio.volume = value * voice.gain;
    },
    start() {
      stop();
      desired = true;
      return play("ambience");
    },
    pickup(item) {
      if (!CAFE.ingredients.includes(item)) throw new Error("Unknown cafe ingredient sound.");
      return play(item);
    },
    stop,
  };
}
