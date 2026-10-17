import { MUSIC, beatTime } from "./music.mjs";

const MELODY = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 392, 523.25];
const BASS = [130.81, 130.81, 130.81, 130.81, 146.83, 146.83, 196, 130.81];

export function createStreetMusicAudio({ createContext, now = () => performance.now(),
  onError, report = console.warn }) {
  let context, master, enabled = false, volume = 0.25, generation = 0, active = false;
  const voices = new Set();

  function stop() {
    generation++;
    active = false;
    for (const voice of voices) voice.stop();
    voices.clear();
  }

  function note(frequency, at, duration, level, type = "triangle") {
    const voice = context.createOscillator();
    const gain = context.createGain();
    voice.type = type;
    voice.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    voice.connect(gain);
    gain.connect(master);
    voice.onended = () => {
      voices.delete(voice);
      voice.disconnect();
      gain.disconnect();
    };
    voices.add(voice);
    voice.start(at);
    voice.stop(at + duration + 0.01);
  }

  function fail(error) {
    stop();
    report("Street music playback failed:", error);
    onError(error.message);
  }

  return {
    enable(value) {
      enabled = value;
      if (master) master.gain.value = enabled ? volume : 0;
    },
    volume(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid street music volume.");
      volume = value;
      if (master) master.gain.value = enabled ? volume : 0;
    },
    async start(game) {
      stop();
      const token = generation;
      try {
        if (!context) {
          context = createContext();
          master = context.createGain();
          master.connect(context.destination);
        }
        master.gain.value = enabled ? volume : 0;
        await context.resume();
        if (token !== generation) return;
        if (context.state !== "running") throw new Error("Audio context is not running.");
        const current = now();
        for (let i = 0; i < MUSIC.beats; i++) {
          const delay = (beatTime(game, i) - current) / 1000;
          if (delay < 0) continue;
          const at = context.currentTime + delay;
          note(MELODY[i % MELODY.length], at, 0.22, 0.28);
          note(BASS[i % BASS.length], at, 0.3, 0.16, "sine");
        }
        active = true;
        onError("");
      } catch (error) {
        if (token === generation) fail(error);
      }
    },
    hit(success) {
      if (!active) return;
      try {
        note(success ? 783.99 : 110, context.currentTime, 0.12, success ? 0.12 : 0.07, "sine");
      } catch (error) {
        fail(error);
      }
    },
    stop,
  };
}
