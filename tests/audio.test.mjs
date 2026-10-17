import assert from "node:assert/strict";
import test from "node:test";
import { createMusicPlayer, musicCandidates, musicFallbacks, musicTrack } from "../audio.mjs";

function harness(available = new Set()) {
  const attempts = [], states = [], warnings = [], sounds = [];
  const player = createMusicPlayer({
    onChange: state => states.push(state),
    report: (...args) => warnings.push(args),
    createAudio(url) {
      attempts.push(url);
      const sound = {
        paused: false, listeners: {},
        async play() {
          const error = available instanceof Map ? available.get(url)
            : available.has(url) ? null : new Error("Missing audio");
          if (error) throw error;
        },
        pause() { this.paused = true; },
        removeAttribute() {},
        load() {},
        addEventListener(event, callback) { this.listeners[event] = callback; },
      };
      sounds.push(sound);
      return sound;
    },
  });
  return { player, attempts, states, warnings, sounds, last: () => states.at(-1) };
}

test("music context follows real player terrain, region, solar phase, menus and outcomes", () => {
  const travel = { active: true, terrain: "field", region: "firmi" };
  assert.equal(musicTrack(), "music-title");
  assert.equal(musicTrack(travel), "music-road-day");
  for (const [context, expected] of [
    [{ terrain: "forest" }, "music-forest"], [{ region: "alps" }, "music-mountains"],
    [{ terrain: "mountain" }, "music-mountains"], [{ region: "paris" }, "music-paris"],
    [{ region: "tahiti" }, "music-tahiti"], [{ terrain: "place" }, "music-town"],
    [{ night: true, region: "alps" }, "music-night"],
    [{ dialog: "trail-dialog" }, "music-tarot-trail"],
    [{ dialog: "economy-dialog", sleeping: true }, "music-shelter"],
    [{ dialog: "town-dialog" }, "music-town"],
    [{ ended: "reunion", dialog: "trail-dialog" }, "music-reunion"],
    [{ ended: "hunger" }, "music-journey-ended"],
    [{ dialog: "music-dialog" }, null],
  ]) assert.equal(musicTrack({ ...travel, ...context }), expected);
});

test("accepts canonical and numbered filenames without renaming user downloads", () => {
  assert.ok(musicCandidates("music-title").includes("./public/audio/music/01-music-title.wav"));
  assert.ok(musicCandidates("music-road-day").includes("./public/audio/music/02%20-%20music-road-day.wav"));
  assert.ok(musicCandidates("music-night").includes("./public/audio/music/music-night.mp3"));
  assert.ok(musicCandidates("music-town").includes("./public/audio/music/music-town.ogg"));
  assert.deepEqual(musicFallbacks("music-road-day"), ["music-road-day", "music-title"]);
  assert.deepEqual(musicFallbacks("music-title"), ["music-title"]);
  assert.deepEqual(musicFallbacks(null), []);
  assert.throws(() => musicCandidates("untrusted"));
});

test("requires explicit enable, loops at a quiet adjustable volume and mutes completely", async () => {
  const h = harness(new Set(musicCandidates("music-title")));
  await h.player.select("music-town");
  assert.equal(h.attempts.length, 0);
  await h.player.select("music-title");
  await h.player.enable(true);
  assert.equal(h.last().status, "playing");
  assert.equal(h.sounds.at(-1).loop, true);
  assert.equal(h.sounds.at(-1).volume, 0.25);
  h.player.volume(0.4);
  assert.equal(h.sounds.at(-1).volume, 0.4);
  assert.throws(() => h.player.volume(NaN));
  assert.throws(() => h.player.volume(2));
  await h.player.enable(false);
  assert.equal(h.last().status, "off");
  assert.ok(h.sounds.every(sound => sound.paused));
});

test("missing regional music falls back to road, then title, then explicit silence", async () => {
  for (const available of ["music-road-day", "music-title", null]) {
    const h = harness(new Set(available ? musicCandidates(available) : []));
    await h.player.select("music-forest");
    await h.player.enable(true);
    assert.equal(h.last().status, available ? "fallback" : "unavailable");
    assert.equal(h.last().track, available ?? undefined);
    assert.ok(h.warnings.length > 0);
    if (!available) assert.ok(h.sounds.every(sound => sound.paused));
  }
});

test("retry discovers files added during a session, while repeated renders do not restart music", async () => {
  const available = new Set(), h = harness(available);
  await h.player.enable(true);
  assert.equal(h.last().status, "unavailable");
  available.add(musicCandidates("music-title")[2]);
  await h.player.enable(false);
  await h.player.enable(true);
  assert.equal(h.last().status, "playing");
  const attempts = h.attempts.length;
  await h.player.select("music-title");
  assert.equal(h.attempts.length, attempts);
});

test("hidden tab and rhythm-game silence preserve the user's enable preference", async () => {
  const h = harness(new Set(musicCandidates("music-road-day")));
  await h.player.select("music-road-day");
  await h.player.enable(true);
  await h.player.suspend(true);
  assert.equal(h.last().status, "paused");
  assert.equal(h.last().enabled, true);
  await h.player.suspend(false);
  assert.equal(h.last().status, "playing");
  await h.player.select(null);
  assert.equal(h.last().status, "paused");
  await h.player.select("music-road-day");
  assert.equal(h.last().status, "playing");
});

test("browser autoplay denial is surfaced, not treated as a missing track", async () => {
  const errors = new Map([[musicCandidates("music-title")[0],
    Object.assign(new Error("Gesture required"), { name: "NotAllowedError" })]]);
  const h = harness(errors);
  await h.player.enable(true);
  assert.equal(h.last().status, "blocked");
  assert.equal(h.attempts.length, 1);
  errors.clear();
  await h.player.enable(true);
  assert.equal(h.last().status, "playing");
});

test("a stale load cannot restart music or replace status after mute", async () => {
  let resolve;
  const states = [];
  const sound = { play: () => new Promise(r => { resolve = r; }),
    pause() {}, removeAttribute() {}, load() {}, addEventListener() {} };
  const player = createMusicPlayer({ createAudio: () => sound, onChange: s => states.push(s) });
  const loading = player.enable(true);
  await player.enable(false);
  resolve();
  await loading;
  assert.equal(states.at(-1).status, "off");
});

test("a playback error after starting moves to a different playable file", async () => {
  const urls = musicCandidates("music-title"), h = harness(new Set([urls[0], urls[1]]));
  await h.player.enable(true);
  h.sounds[0].listeners.error();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.last().status, "playing");
  assert.equal(h.attempts.at(-1), urls[1]);
  assert.equal(h.sounds[0].paused, true);
  assert.equal(h.warnings.length, 1);
});
