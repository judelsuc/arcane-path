import { pcmWav } from "../pcm-wav.mjs";
import { createTheftAudio } from "../theft-audio.mjs";

export function squishWav() {
  const rate = 22050, samples = new Float32Array(Math.ceil(rate * 0.32));
  let seed = 37, filtered = 0, phase = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate, progress = i / samples.length;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    filtered += 0.4 * (noise - filtered);
    phase += 2 * Math.PI * (230 - 185 * progress) / rate;
    const envelope = Math.min(1, t / 0.004) * Math.pow(1 - progress, 1.5);
    const pops = [0.018, 0.055, 0.105].reduce((sum, at) =>
      sum + (t >= at ? Math.exp(-(t - at) * 95) : 0), 0);
    samples[i] = Math.tanh((filtered * 2 + Math.sin(phase) * 0.7 + noise * pops * 0.7) * envelope);
  }
  return pcmWav(samples, rate);
}

export function createHarvestAudio(options) {
  let squish;
  const sounds = {
    success: "./public/audio/sfx/sfx-meal.wav",
    caught: "./public/audio/sfx/sfx-needs-warning.wav",
    get squish() {
      squish ??= `data:audio/wav;base64,${btoa(Array.from(squishWav(), byte => String.fromCharCode(byte)).join(""))}`;
      return squish;
    },
  };
  return createTheftAudio({ ...options, sounds });
}
