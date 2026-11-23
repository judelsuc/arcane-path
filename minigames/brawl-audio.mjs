// Synthesized 8-bit effects for the brawl, played from the engine's events.

const SOUNDS = ["kick", "split", "flykick", "windupHigh", "windupLow", "windupGrab", "hit", "dodged", "parried", "push", "shoved",
  "sweep", "down", "miss", "hop", "getup", "grabbed", "break", "dog", "won", "escaped", "lost"];

export function brawlSound(event) {
  if (event.type === "windup") return { high: "windupHigh", low: "windupLow", grab: "windupGrab" }[event.attack];
  return SOUNDS.includes(event.type) ? event.type : null;
}

export function createBrawlAudio({ createContext, onError = () => {}, report = console.warn }) {
  let context, noise, enabled = true, volume = 0.4;
  const live = new Set();
  function ensure() {
    context ??= createContext();
    if (!noise) {
      noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = noise.getChannelData(0);
      let seed = 7919;
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] = seed / 2147483648 - 1;
      }
    }
    return context;
  }
  function track(node, stopAt) {
    live.add(node);
    node.onended = () => { live.delete(node); node.disconnect(); };
    node.start(context.currentTime);
    node.stop(stopAt);
  }
  // A square, triangle or sawtooth tone sliding between two pitches.
  function tone(type, from, to, start, length, level) {
    const at = context.currentTime + start;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.setValueAtTime(level * volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(gain).connect(context.destination);
    live.add(oscillator);
    oscillator.onended = () => { live.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(context.currentTime);
    oscillator.stop(at + length + 0.02);
  }
  // A filtered noise burst: whooshes, thuds and slides.
  function hiss(start, length, level, frequency, sweepTo = frequency, q = 1.2) {
    const at = context.currentTime + start;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = noise;
    filter.type = "bandpass"; filter.Q.value = q;
    filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), at + length);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.setValueAtTime(level * volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter).connect(gain).connect(context.destination);
    track(source, at + length + 0.02);
  }
  const notes = (type, frequencies, step, level) =>
    frequencies.forEach((frequency, index) => tone(type, frequency, frequency, index * step, step * 0.9, level));
  const RECIPES = {
    windupHigh: () => tone("square", 330, 660, 0, 0.12, 0.18),
    windupLow: () => tone("square", 420, 210, 0, 0.12, 0.18),
    windupGrab: () => { tone("sawtooth", 70, 55, 0, 0.45, 0.35); tone("sawtooth", 74, 58, 0, 0.45, 0.25); },
    hit: () => { tone("square", 160, 50, 0, 0.18, 0.5); hiss(0, 0.12, 0.6, 900, 200); },
    dodged: () => hiss(0, 0.16, 0.35, 2400, 600, 0.8),
    parried: () => { tone("square", 1250, 1250, 0, 0.06, 0.25); tone("square", 1870, 1870, 0.03, 0.1, 0.2); },
    push: () => hiss(0, 0.08, 0.3, 1600, 800),
    shoved: () => { tone("triangle", 180, 90, 0, 0.1, 0.5); hiss(0, 0.06, 0.4, 700, 300); },
    sweep: () => hiss(0, 0.18, 0.35, 500, 1800, 0.9),
    down: () => { tone("triangle", 140, 40, 0, 0.28, 0.7); hiss(0.02, 0.22, 0.5, 400, 90); },
    miss: () => hiss(0, 0.1, 0.18, 2000, 900),
    hop: () => tone("square", 300, 600, 0, 0.08, 0.1),
    kick: () => hiss(0.06, 0.12, 0.35, 1200, 3000, 0.9),
    split: () => { hiss(0.05, 0.14, 0.35, 900, 2600, 0.9); hiss(0.1, 0.14, 0.3, 1100, 2800, 0.9); },
    flykick: () => { tone("square", 260, 780, 0, 0.18, 0.12); hiss(0, 0.2, 0.3, 800, 3200, 0.8); },
    getup: () => notes("square", [196, 233], 0.07, 0.12),
    grabbed: () => { tone("sawtooth", 98, 92, 0, 0.6, 0.35); tone("square", 104, 97, 0, 0.6, 0.2); },
    break: () => notes("square", [392, 523, 659, 784], 0.05, 0.2),
    dog: () => { hiss(0, 0.09, 0.6, 700, 450, 3); tone("sawtooth", 420, 260, 0, 0.09, 0.25);
      hiss(0.14, 0.09, 0.6, 750, 480, 3); tone("sawtooth", 450, 280, 0.14, 0.09, 0.25); },
    won: () => notes("square", [523, 659, 784, 1047], 0.11, 0.22),
    escaped: () => notes("square", [392, 494, 587, 784], 0.08, 0.2),
    lost: () => notes("triangle", [294, 262, 233, 175], 0.18, 0.35),
  };
  return {
    async unlock() {
      if (!enabled) return;
      try { ensure(); if (context.state === "suspended") await context.resume(); }
      catch (error) { report("Brawl sound unavailable:", error); onError(error?.message ?? String(error)); }
    },
    enable(value) { enabled = Boolean(value); if (!enabled) this.stop(); },
    volume(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("Invalid brawl volume.");
      volume = value;
    },
    play(name) {
      if (!RECIPES[name]) throw new RangeError(`Unknown brawl sound: ${name}`);
      if (!enabled) return;
      try {
        ensure();
        if (context.state === "suspended") void context.resume();
        RECIPES[name]();
      } catch (error) {
        report("Brawl sound playback failed:", error);
        onError(error?.message ?? String(error));
      }
    },
    stop() { for (const node of live) { try { node.stop(); } catch { /* already stopped */ } } live.clear(); },
  };
}
