import { MUSIC, rhythm, beatTime, rhythmEnd, tapRhythm } from "./music.mjs";

export function setupMusic(t, { begin, settle, available, audio }) {
  const dialog = document.querySelector("#music-dialog");
  const play = document.querySelector("#music-start");
  const tap = document.querySelector("#music-tap");
  const result = document.querySelector("#music-result");
  const track = document.querySelector("#music-track");
  const beats = [];
  let game, timer, settled, feedback = "";

  function localize() {
    document.querySelector("#open-music").disabled = !available();
    document.querySelector("#town-music").disabled = !available();
    play.disabled = Boolean(game) || !available();
    play.textContent = t("musicStart");
    tap.disabled = !game;
    result.textContent = feedback;
  }

  function render(now) {
    const hits = game.hits.filter(Boolean).length;
    for (let i = 0; i < beats.length; i++) {
      beats[i].className = game.hits[i] ? "music-beat hit"
        : Math.abs(beatTime(game, i) - now) <= MUSIC.windowMs ? "music-beat cue"
        : now > beatTime(game, i) + MUSIC.windowMs ? "music-beat missed" : "music-beat";
      beats[i].textContent = game.hits[i] ? "+" : now > beatTime(game, i) + MUSIC.windowMs ? "-" : String(i + 1);
    }
    document.querySelector("#music-score").textContent = t("musicScore", { hits, total: MUSIC.beats });
    const cursor = Math.max(0, Math.min(100, (now - game.startedAt) /
      (rhythmEnd(game) - game.startedAt) * 100));
    document.querySelector("#music-progress").value = cursor;
  }

  function finish(cancelled = false) {
    if (!game) return;
    clearInterval(timer);
    timer = undefined;
    audio.stop();
    const hits = cancelled ? 0 : game.hits.filter(Boolean).length;
    game = undefined;
    settled = settle(hits);
    feedback = settled === null ? t("musicFailed") : t(cancelled ? "musicCancelled" : "musicReward", {
      hits, total: MUSIC.beats, money: (settled / 100).toFixed(2),
    });
    localize();
  }

  function start() {
    if (game || !available()) return;
    if (!begin()) {
      feedback = t("musicFailed");
      localize();
      return;
    }
    feedback = "";
    game = rhythm(performance.now());
    void audio.start(game);
    track.replaceChildren();
    beats.length = 0;
    for (let i = 0; i < MUSIC.beats; i++) {
      const beat = document.createElement("span");
      beat.className = "music-beat";
      track.append(beat);
      beats.push(beat);
    }
    localize();
    render(performance.now());
    tap.focus();
    timer = setInterval(() => {
      const now = performance.now();
      render(now);
      if (now >= rhythmEnd(game)) finish();
    }, 25);
  }

  function hit() {
    if (!game) return;
    const now = performance.now();
    if (now > rhythmEnd(game)) return finish();
    const next = tapRhythm(game, now);
    audio.hit(next !== game);
    game = next;
    render(now);
  }
  function open() {
    if (!available() || document.querySelector("dialog[open]")) return;
    feedback = "";
    track.replaceChildren();
    document.querySelector("#music-score").textContent = "";
    document.querySelector("#music-progress").value = 0;
    dialog.showModal();
    localize();
  }
  play.addEventListener("click", start);
  tap.addEventListener("click", hit);
  document.querySelector("#open-music").addEventListener("click", open);
  document.querySelector("#town-music").addEventListener("click", () => {
    document.querySelector("#town-dialog").close();
    open();
  });
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish(true);
      dialog.close();
    } else if (event.code === "Space" && game) {
      event.preventDefault();
      if (!event.repeat) hit();
    }
  });
  dialog.addEventListener("close", () => {
    if (!dialog.open) finish(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) finish(true);
  });
  return { localize, reset() { finish(true); dialog.close(); feedback = ""; } };
}
