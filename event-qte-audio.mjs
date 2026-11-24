import { pcmWav } from "./pcm-wav.mjs";

export const EVENT_QTE_SOUNDS = Object.freeze(["cue", "go", "hit", "success", "failure"]);

export function eventQteWav(kind) {
  if (!EVENT_QTE_SOUNDS.includes(kind)) throw new RangeError("Unknown event challenge sound.");
  const rate = 22050;
  const seconds = { cue: 0.09, go: 0.16, hit: 0.12, success: 0.55, failure: 0.4 }[kind];
  const samples = new Float32Array(Math.round(rate * seconds));
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate;
    const edge = Math.min(1, time / 0.008, (seconds - time) / 0.02);
    if (kind === "cue") {
      samples[index] = (Math.sin(2 * Math.PI * 1320 * time) * 0.3 +
        Math.sin(2 * Math.PI * 1980 * time) * 0.12) * Math.exp(-28 * time) * edge;
    } else if (kind === "go") {
      samples[index] = (Math.sin(2 * Math.PI * 990 * time) * 0.3 +
        Math.sin(2 * Math.PI * 1485 * time) * 0.12) * Math.exp(-14 * time) * edge;
    } else if (kind === "hit") {
      samples[index] = (Math.sin(2 * Math.PI * 880 * time) * 0.28 +
        Math.sin(2 * Math.PI * 1320 * time) * 0.16) * Math.exp(-24 * time) * edge;
    } else if (kind === "success") {
      const step = Math.min(2, Math.floor(time / 0.16));
      const local = time - step * 0.16;
      samples[index] = (Math.sin(2 * Math.PI * [660, 880, 1100][step] * time) * 0.3 +
        Math.sin(2 * Math.PI * [660, 880, 1100][step] * 2 * time) * 0.08) * Math.exp(-7 * local) * edge;
    } else {
      samples[index] = (Math.sin(2 * Math.PI * 196 * time) * 0.3 +
        Math.sin(2 * Math.PI * 147 * time) * 0.2) * Math.exp(-6 * time) * edge;
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
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("Invalid event challenge volume.");
      volume = value;
      if (voice) voice.audio.volume = value;
    },
    async play(kind) {
      if (!EVENT_QTE_SOUNDS.includes(kind)) throw new RangeError("Unknown event challenge sound.");
      if (!enabled) return;
      stop();
      const token = generation;
      if (!buffers.has(kind)) buffers.set(kind, eventQteWav(kind));
      const url = URL.createObjectURL(new Blob([buffers.get(kind)], { type: "audio/wav" }));
      const fail = error => {
        if (token !== generation) return;
        stop();
        report("Event challenge sound playback failed:", error);
        onError(error?.message ?? String(error));
      };
      try {
        const audio = createAudio(url);
        voice = { audio, url };
        audio.volume = volume;
        audio.loop = false;
        audio.addEventListener("error", () => fail(audio.error ?? new Error("Unable to decode event challenge audio.")), { once: true });
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

export function createEventQteAudio(options) {
  // Cues and outcomes play on separate voices so a correct press does not cut
  // off the next lighting key.
  const cues = createVoice(options), outcomes = createVoice(options);
  return {
    stop() { cues.stop(); outcomes.stop(); },
    enable(value) { cues.enable(value); outcomes.enable(value); },
    volume(value) { cues.volume(value); outcomes.volume(value); },
    play(kind) { return (["cue", "go"].includes(kind) ? cues : outcomes).play(kind); },
  };
}
