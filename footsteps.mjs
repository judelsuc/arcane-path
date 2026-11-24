const SURFACES = {
  forest: "forest",
  grass: "grass", field: "grass", vineyard: "grass", park: "grass", plain: "grass",
  water: "water",
  mountain: "stone", hill: "stone", building: "stone", church: "stone",
  station: "stone", place: "stone", cable_station: "stone",
  road: "road", major_road: "road", rail: "road", cable: "road",
};

export function footstepSource(terrain) {
  if (!Object.hasOwn(SURFACES, terrain)) throw new Error(`Unknown footstep terrain: ${terrain}`);
  return `./public/audio/sfx/sfx-step-${SURFACES[terrain]}.wav`;
}

export function createFootstepPlayer({ createAudio, report = console.warn, onError = () => {} }) {
  let enabled = false, volume = 0.25, audio, generation = 0;
  function stop() {
    generation++;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio = undefined;
    }
  }
  return {
    enable(value) {
      enabled = value;
      if (!value) stop();
    },
    volume(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid footstep volume.");
      volume = value;
      if (audio) audio.volume = value;
    },
    async play(terrain) {
      const source = footstepSource(terrain);
      if (!enabled) return;
      stop();
      const token = generation;
      const candidate = createAudio(source);
      audio = candidate;
      candidate.loop = false;
      candidate.volume = volume;
      const fail = error => {
        if (token !== generation) return;
        stop();
        report(`Footstep playback failed: ${source}`, error);
        onError(error?.message ?? String(error));
      };
      candidate.addEventListener("error", () => fail(candidate.error), { once: true });
      try {
        await candidate.play();
        if (token === generation) onError("");
      } catch (error) {
        fail(error);
      }
    },
  };
}
