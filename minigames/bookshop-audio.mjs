import { createLanternAudio as createToneAudio } from "./lanterns-audio.mjs";

const cues = Object.freeze({ select: 1, place: 2, serve: 3, mistake: 0, complete: 5, failed: 0 });

export function createBookshopAudio(options) {
  const tones = createToneAudio({
    ...options,
    report: (_message, error) => (options.report ?? console.warn)("Bookshop sound playback failed:", error),
  });
  return {
    enable: tones.enable,
    volume: tones.volume,
    stop: tones.stop,
    unlock: tones.unlock,
    play(cue) {
      if (!Object.hasOwn(cues, cue)) throw new RangeError("Unknown bookshop sound.");
      return tones.play(cues[cue]);
    },
  };
}
