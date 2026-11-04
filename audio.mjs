const TRACKS = [
  "music-title", "music-road-day", "music-forest", "music-mountains",
  "music-town", "music-city", "music-coast", "music-night",
  "music-shelter", "music-tarot-trail", "music-street-practice",
  "music-reunion", "music-journey-ended",
  "music-title-song",
];

export function musicTrack({ active, ended, terrain, sources = [], night, dialog, sleeping } = {}) {
  if (dialog === "music-dialog" || dialog === "cafe-dialog") return null;
  if (!active) return "music-title-song";
  if (ended) return ended === "reunion" ? "music-reunion" : "music-journey-ended";
  if (["trail-dialog", "birth-tarot-dialog", "daily-tarot-dialog"].includes(dialog)) return "music-tarot-trail";
  if (dialog === "economy-dialog" && sleeping) return "music-shelter";
  if (dialog === "town-dialog" || dialog === "economy-dialog") return "music-town";
  if (night) return "music-night";
  if (terrain === "mountain" || terrain === "hill") return "music-mountains";
  if (sources.some(source => source.tags?.natural === "coastline")) return "music-coast";
  if (terrain === "forest") return "music-forest";
  if (sources.some(source => ["city", "town"].includes(source.tags?.place) ||
      ["residential", "commercial", "retail"].includes(source.tags?.landuse))) return "music-city";
  if (terrain === "place") return "music-town";
  return "music-road-day";
}

export function musicCandidates(track) {
  const index = TRACKS.indexOf(track);
  if (index < 0) throw new Error(`Unknown music track: ${track}`);
  const number = track === "music-title-song" ? "16" : String(index + 1).padStart(2, "0");
  const legacy = { "music-city": "music-paris", "music-coast": "music-tahiti" }[track];
  const names = [track, ...(legacy ? [legacy] : [])].flatMap(id =>
    [id, `${number}-${id}`, `${number} - ${id}`]);
  return ["wav", "mp3", "ogg"].flatMap(extension =>
    names.map(name =>
      `./public/audio/music/${encodeURIComponent(name)}.${extension}`));
}

export function musicFallbacks(track) {
  if (track === null) return [];
  musicCandidates(track);
  if (track === "music-title-song") return ["music-title-song", "music-title"];
  return [...new Set([track, ...(track === "music-title" ? [] : ["music-road-day", "music-title"])])];
}

export function createMusicPlayer({ createAudio, onChange, report = console.warn }) {
  let enabled = false, suspended = false, requested = "music-title";
  let audio, generation = 0, volume = 0.25;
  const failed = new Set();

  function stop() {
    generation++;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio = undefined;
    }
  }

  async function update() {
    stop();
    if (!enabled || suspended || requested === null) {
      onChange({ status: !enabled ? "off" : "paused", enabled });
      return;
    }
    const token = generation, desired = requested;
    onChange({ status: "loading", enabled });
    for (const track of musicFallbacks(desired)) {
      for (const url of musicCandidates(track)) {
        if (failed.has(url)) continue;
        const candidate = createAudio(url);
        audio = candidate;
        candidate.loop = true;
        candidate.volume = volume;
        let timeout;
        try {
          await Promise.race([
            candidate.play(),
            new Promise((_, reject) => {
              timeout = setTimeout(() => reject(new Error("Audio loading timed out.")), 10000);
            }),
          ]);
        } catch (error) {
          if (token !== generation) return;
          candidate.pause();
          candidate.removeAttribute("src");
          candidate.load();
          if (error.name === "NotAllowedError") {
            report("Music playback requires a user gesture:", error);
            onChange({ status: "blocked", enabled });
            return;
          }
          failed.add(url);
          report(`Music unavailable: ${url}`, error);
          continue;
        } finally {
          clearTimeout(timeout);
        }
        if (token !== generation) return;
        candidate.addEventListener("error", () => {
          if (token !== generation) return;
          failed.add(url);
          report(`Music playback failed: ${url}`, candidate.error);
          void update();
        }, { once: true });
        onChange({ status: track === desired ? "playing" : "fallback", enabled, track, requested: desired });
        return;
      }
    }
    audio = undefined;
    onChange({ status: "unavailable", enabled });
  }

  return {
    enable(value) {
      enabled = value;
      if (value) failed.clear();
      return update();
    },
    select(track) {
      musicFallbacks(track);
      if (track === requested) return;
      requested = track;
      return update();
    },
    suspend(value) {
      if (value === suspended) return;
      suspended = value;
      return update();
    },
    volume(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid music volume.");
      volume = value;
      if (audio) audio.volume = value;
    },
  };
}
