const notes = [261.63, 329.63, 392, 440, 523.25, 659.25];

export function createLanternAudio({ createContext, onError, report = console.warn }) {
  let context, enabled = true, volume = 0.3, generation = 0;
  const voices = new Map();
  function stop() {
    generation++;
    for (const [voice, gain] of voices) {
      voice.onended = null;
      voice.stop();
      voice.disconnect();
      gain.disconnect();
    }
    voices.clear();
  }
  return {
    stop,
    async unlock() {
      if (!enabled) return;
      try {
        context ??= createContext();
        if (context.state === "suspended") await context.resume();
      } catch (error) {
        report("Lantern sound playback failed:", error);
        onError(error?.message ?? String(error));
      }
    },
    enable(value) { enabled = value; if (!value) stop(); },
    volume(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("Invalid lantern volume.");
      volume = value;
    },
    async play(index) {
      if (!Number.isInteger(index) || index < 0 || index >= notes.length) throw new RangeError("Invalid lantern tone.");
      if (!enabled) return;
      const token = generation;
      try {
        context ??= createContext();
        if (context.state === "suspended") await context.resume();
        if (token !== generation || !enabled) return;
        const oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = notes[index];
        const at = context.currentTime;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(volume, at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
        oscillator.connect(gain);
        gain.connect(context.destination);
        voices.set(oscillator, gain);
        oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(at);
        oscillator.stop(at + 0.24);
        onError("");
      } catch (error) {
        if (token !== generation) return;
        report("Lantern sound playback failed:", error);
        onError(error?.message ?? String(error));
      }
    },
  };
}
