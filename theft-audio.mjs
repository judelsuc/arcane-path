const SOUNDS = { success: "./public/audio/sfx/sfx-meal.wav", caught: "./public/audio/sfx/sfx-needs-warning.wav" };

export function createTheftAudio({ createAudio, onError, report = console.warn, sounds = SOUNDS }) {
  let enabled = false, volume = 0.25, voice, generation = 0;
  function stop() {
    generation++;
    if (!voice) return;
    voice.pause();
    voice.removeAttribute("src");
    voice.load();
    voice = undefined;
  }
  return {
    stop,
    enable(value) { enabled = value; if (!value) stop(); },
    volume(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid theft volume.");
      volume = value;
      if (voice) voice.volume = value;
    },
    async play(outcome) {
      if (!Object.hasOwn(sounds, outcome)) throw new Error("Unknown theft sound.");
      if (!enabled) return;
      stop();
      const token = generation;
      const fail = error => {
        if (token !== generation) return;
        stop();
        report("Theft sound playback failed:", error);
        onError(error?.message ?? String(error));
      };
      try {
        voice = createAudio(sounds[outcome]);
        voice.volume = volume;
        voice.loop = false;
        const current = voice;
        current.addEventListener("error", () => fail(current.error), { once: true });
        current.addEventListener("ended", () => { if (token === generation) stop(); }, { once: true });
        await current.play();
        if (token === generation) onError("");
      } catch (reason) {
        fail(reason);
      }
    },
  };
}
