import { createLanternAudio as createToneAudio } from "./lanterns-audio.mjs";

const cues = Object.freeze({ pick: 1, coin: 4, basket: 2, serve: 3, mistake: 0, complete: 5, failed: 0 });

export function createMarketAudio(options = {}) {
  const tones = createToneAudio({
    ...options,
    onError: options.onError ?? (message => { if (message) console.warn("Market sound playback failed:", message); }),
    report: (_message, error) => (options.report ?? console.warn)("Market sound playback failed:", error),
  });
  return {
    enable: tones.enable, volume: tones.volume, stop: tones.stop, unlock: tones.unlock,
    play(cue) {
      if (!Object.hasOwn(cues, cue)) throw new RangeError("Unknown market sound.");
      return tones.play(cues[cue]);
    },
  };
}
