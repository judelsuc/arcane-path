const TRACKS = [
  "music-title", "music-road-day", "music-forest", "music-mountains",
  "music-town", "music-paris", "music-tahiti", "music-night",
  "music-shelter", "music-tarot-trail", "music-street-practice",
  "music-reunion", "music-journey-ended",
];

export function musicTrack({ active, ended, region, terrain, night, dialog, sleeping } = {}) {
  if (dialog === "music-dialog") return null;
  if (!active) return "music-title";
  if (ended) return ended === "reunion" ? "music-reunion" : "music-journey-ended";
  if (dialog === "trail-dialog") return "music-tarot-trail";
  if (dialog === "economy-dialog" && sleeping) return "music-shelter";
  if (dialog === "town-dialog" || dialog === "economy-dialog") return "music-town";
  if (night) return "music-night";
  if (region === "alps" || terrain === "mountain" || terrain === "hill") return "music-mountains";
  if (region === "paris") return "music-paris";
  if (region === "tahiti") return "music-tahiti";
  if (terrain === "forest") return "music-forest";
  if (terrain === "place") return "music-town";
  return "music-road-day";
}

export function musicCandidates(track) {
  const index = TRACKS.indexOf(track);
  if (index < 0) throw new Error(`Unknown music track: ${track}`);
  const number = String(index + 1).padStart(2, "0");
  return ["wav", "mp3", "ogg"].flatMap(extension =>
    [track, `${number}-${track}`, `${number} - ${track}`].map(name =>
      `./public/audio/music/${encodeURIComponent(name)}.${extension}`));
}

export function musicFallbacks(track) {
  if (track === null) return [];
  musicCandidates(track);
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
