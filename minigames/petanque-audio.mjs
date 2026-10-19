import { pcmWav } from "../pcm-wav.mjs";

export function petanqueWav(kind) {
  if (!["throw", "roll", "land", "hit"].includes(kind)) throw new RangeError("Unknown petanque sound.");
  const rate = 22050, seconds = kind === "roll" ? 1 : kind === "throw" ? 0.25 : kind === "hit" ? 0.16 : 0.3;
  const samples = new Float32Array(Math.round(rate * seconds));
  let seed = 7919, low = 0;
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low = low * 0.85 + noise * 0.15;
    const edge = Math.min(1, time / 0.01, (seconds - time) / 0.02);
    if (kind === "throw") samples[index] = low * Math.sin(Math.PI * time / seconds) * edge;
    else if (kind === "roll") {
      const grit = 0.3 + 0.7 * Math.max(0, Math.sin(2 * Math.PI * 23 * time));
      samples[index] = (low * 0.7 + noise * 0.12) * grit * edge;
    } else if (kind === "hit") {
      samples[index] = (Math.sin(2 * Math.PI * 910 * time) * 0.35 +
        Math.sin(2 * Math.PI * 1730 * time) * 0.23 + Math.sin(2 * Math.PI * 2810 * time) * 0.12 +
        noise * 0.2) * Math.exp(-35 * time) * edge;
    } else {
      samples[index] = (Math.sin(2 * Math.PI * 420 * time) * 0.25 +
        Math.sin(2 * Math.PI * 1130 * time) * 0.15 + noise * 0.3) * Math.exp(-22 * time) * edge;
    }
  }
  return pcmWav(samples, rate);
}

function createVoice({ createAudio, onError, report = console.warn }) {
  let enabled = false, volume = 0.35, voice, generation = 0;
  const buffers = new Map();
  function stop() {
    generation++;
    if (!voice) return;
    voice.audio.pause();
    voice.audio.removeAttribute("src");
    voice.audio.load();
    URL.revokeObjectURL(voice.url);
    voice = undefined;
  }
  return {
    stop,
    enable(value) { enabled = value; if (!value) stop(); },
    volume(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("Invalid petanque volume.");
      volume = value;
      if (voice) voice.audio.volume = value;
    },
    async play(kind) {
      if (!["throw", "roll", "land", "hit"].includes(kind)) throw new RangeError("Unknown petanque sound.");
      if (!enabled) return;
      stop();
      const token = generation;
      if (!buffers.has(kind)) buffers.set(kind, petanqueWav(kind));
      const url = URL.createObjectURL(new Blob([buffers.get(kind)], { type: "audio/wav" }));
      const fail = error => {
        if (token !== generation) return;
        stop();
        report("Petanque sound playback failed:", error);
        onError(error?.message ?? String(error));
      };
      try {
        const audio = createAudio(url);
        voice = { audio, url };
        audio.volume = volume;
        audio.loop = kind === "roll";
        audio.addEventListener("error", () => fail(audio.error ?? new Error("Unable to decode petanque audio.")), { once: true });
        audio.addEventListener("ended", () => { if (token === generation) stop(); }, { once: true });
        await audio.play();
        if (token === generation) onError("");
      } catch (reason) {
        if (!voice) URL.revokeObjectURL(url);
        fail(reason);
      }
    },
  };
}

export function createPetanqueAudio(options) {
  const movement = createVoice(options), impact = createVoice(options);
  return {
    stop() { movement.stop(); impact.stop(); },
    enable(value) { movement.enable(value); impact.enable(value); },
    volume(value) { movement.volume(value); impact.volume(value); },
    play(kind) { return (kind === "hit" ? impact : movement).play(kind); },
  };
}
