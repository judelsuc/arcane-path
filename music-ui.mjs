import { MUSIC, rhythm, beatTime, rhythmEnd, tapRhythm } from "./music.mjs";
import { setFeedback } from "./feedback.mjs";

export function setupMusic(t, { begin, settle, available, audio, mistakeLimit = () => MUSIC.minMistakes }) {
  const dialog = document.querySelector("#music-dialog");
  const play = document.querySelector("#music-start");
  const tap = document.querySelector("#music-tap");
  const result = document.querySelector("#music-result");
  const track = document.querySelector("#music-track");
  const beats = [];
  let game, timer, settled, feedback = "";
  let feedbackOutcome = "";

  function localize() {
    document.querySelector("#open-music").disabled = !available();
    document.querySelector("#town-music").disabled = !available();
    play.disabled = Boolean(game) || !available();
    play.textContent = t("musicStart");
    tap.disabled = !game;
    result.textContent = feedback;
    setFeedback(result, feedback ? feedbackOutcome : "");
    const limit = game?.mistakeLimit ?? mistakeLimit();
    document.querySelector("#music-card-effect").textContent = limit === null ? ""
      : t("musicCardEffect", { charisma: limit - 2, limit });
  }

  function render(now) {
    const hits = game.hits.filter(Boolean).length;
    const loop = Math.min(MUSIC.loops - 1, Math.max(0,
      Math.floor((now - game.startedAt - MUSIC.leadMs) / (MUSIC.slots * MUSIC.intervalMs))));
    let note = loop * MUSIC.beats / MUSIC.loops;
    for (let i = 0; i < beats.length; i++) {
      if (!game.pattern[i]) {
        beats[i].className = "music-beat rest";
        beats[i].textContent = "";
        continue;
      }
      beats[i].className = game.hits[note] ? "music-beat hit"
        : Math.abs(beatTime(game, note) - now) <= MUSIC.windowMs ? "music-beat cue"
        : now > beatTime(game, note) + MUSIC.windowMs ? "music-beat missed" : "music-beat";
      beats[i].textContent = game.hits[note] ? "+" : now > beatTime(game, note) + MUSIC.windowMs ? "-" : "*";
      note++;
    }
    document.querySelector("#music-score").textContent = `${t("musicScore", { hits, total: MUSIC.beats })} — ${
      t("musicMistakes", { mistakes: game.mistakes, limit: game.mistakeLimit })} — ${
      t("musicLoop", { loop: loop + 1, total: MUSIC.loops })}`;
    const cursor = Math.max(0, Math.min(100, (now - game.startedAt) /
      (rhythmEnd(game) - game.startedAt) * 100));
    document.querySelector("#music-progress").value = cursor;
  }

  function finish(cancelled = false) {
    if (!game) return;
    clearInterval(timer);
    timer = undefined;
    audio.stop();
    const mistakes = game.mistakes, limit = game.mistakeLimit, failed = mistakes >= limit;
    const hits = cancelled || failed ? 0 : game.hits.filter(Boolean).length;
    game = undefined;
    settled = settle(hits, mistakes);
    feedbackOutcome = settled === null || cancelled || failed || settled <= 0 ? "failure" : "success";
    feedback = settled === null ? t("musicFailed") : t(failed ? "musicTooManyMistakes"
      : cancelled ? "musicCancelled" : "musicReward", {
      hits, total: MUSIC.beats, money: (settled / 100).toFixed(2), limit,
    });
    localize();
  }

  function start() {
    if (game || !available()) return;
    if (!begin()) {
      feedback = t("musicFailed");
      feedbackOutcome = "failure";
      localize();
      return;
    }
    feedback = "";
    game = rhythm(performance.now(), Math.random, mistakeLimit());
    void audio.start(game);
    track.replaceChildren();
    beats.length = 0;
    for (let i = 0; i < MUSIC.slots; i++) {
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
    audio.hit(next.hits !== game.hits);
    game = next;
    render(now);
    if (game.mistakes >= game.mistakeLimit) finish();
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
