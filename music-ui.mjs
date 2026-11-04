import { MUSIC, rhythm, beatTime, rhythmEnd, tapRhythm, holdDuration,
  advanceRhythm, releaseRhythm } from "./music.mjs";
import { setFeedback } from "./feedback.mjs";
import { outcomeReputation } from "./practice.mjs";
import { decorateResonance } from "./arcane-resonance.mjs";

export function setupMusic(t, { begin, settle, available, audio, mistakeLimit = () => MUSIC.minMistakes,
  difficulty = () => ({ level: 0, xp: 0, beats: MUSIC.beats, multiplier: 1 }),
  resonance = () => false }) {
  const dialog = document.querySelector("#music-dialog");
  const play = document.querySelector("#music-start");
  const tap = document.querySelector("#music-tap");
  const result = document.querySelector("#music-result");
  const track = document.querySelector("#music-track");
  const beats = [];
  let game, timer, settled, feedback = "", decorated = false, decorationNodes = [];
  let feedbackOutcome = "";
  let holdSource = null, pointerClick = false;
  let pressFeedback = null;
  const instructions = document.querySelector("#music-dialog .window-help-text");
  const baseInstructions = instructions.textContent;
  const french = document.documentElement?.lang !== "en";
  function showVariantHelp(active) {
    instructions.textContent = active
      ? `${baseInstructions} ${french
        ? "Variante du Jugement : regardez et écoutez la démonstration normale, puis reproduisez sans indices visuels, y compris pour les notes tenues. Chaque appui marque sa position en vert si correct, en rouge sinon. Les notes réussies restent visibles. Les phrases ne sont pas liées."
        : "Judgement variant: watch and listen to the normal demonstration, then reproduce without visual hints, including hold/release cues. Each press marks its position green if correct, red otherwise. Successful notes remain visible. Phrases are not linked."}`
      : baseInstructions;
  }
  function setResonanceDecoration(active) {
    if (!active) {
      decorationNodes.forEach(node => node.remove?.());
      decorationNodes = [];
      dialog.className = (dialog.className || "").replace(/\barcane-resonance\b/g, "").trim();
      decorated = false;
      return;
    }
    if (decorated || !dialog.ownerDocument?.createElement || !dialog.append) return;
    const before = new Set(Array.from(dialog.children));
    decorateResonance(dialog, "music", true, french ? "fr" : "en");
    decorationNodes = Array.from(dialog.children).filter(node => !before.has(node));
    decorated = true;
  }

  function localize() {
    document.querySelector("#open-music").disabled = !available();
    play.disabled = Boolean(game) || !available();
    play.textContent = t("musicStart");
    tap.disabled = !game;
    result.textContent = feedback;
    setFeedback(result, feedback ? feedbackOutcome : "");
    const limit = game?.mistakeLimit ?? mistakeLimit();
    document.querySelector("#music-card-effect").textContent = limit === null ? ""
      : t("musicCardEffect", { charisma: limit - 2, limit });
    const skill = difficulty();
    document.querySelector("#music-skill").textContent = t("musicSkill", {
      ...skill, tempo: Math.round(60000 / (skill.intervalMs ?? MUSIC.intervalMs)),
      holds: skill.holdNotes ?? 0, slots: skill.slots ?? MUSIC.slots,
      bonus: Math.round((skill.multiplier - 1) * 100),
    });
    const resonant = game ? game.resonance : Boolean(skill.resonance || resonance());
    showVariantHelp(resonant);
    setResonanceDecoration(resonant);
  }

  function render(now) {
    tap.disabled = now < game.startedAt;
    const demonstrating = game.resonance && now < game.startedAt;
    const hideHints = game.resonance && !demonstrating;
    const visualNow = demonstrating ? now + game.previewMs : now;
    const hits = game.hits.filter(Boolean).length;
    let loop = Math.min(MUSIC.loops - 1, Math.max(0,
      Math.floor((visualNow - game.startedAt - MUSIC.leadMs) / (game.pattern.length * game.intervalMs))));
    if (game.activeHold !== null) loop = Math.min(loop,
      Math.floor(game.activeHold / (game.hits.length / MUSIC.loops)));
    let note = loop * game.hits.length / MUSIC.loops;
    let headSlot = 0;
    for (let i = 0; i < beats.length; i++) {
      beats[i].style.setProperty("--music-fill", "0%");
      if (!game.pattern[i]) {
        beats[i].className = "music-beat rest";
        beats[i].textContent = "";
        continue;
      }
      const continuation = game.pattern[i] === -1;
      if (!continuation) headSlot = i;
      const index = continuation ? note - 1 : note;
      const at = beatTime(game, index);
      const duration = holdDuration(game, index);
      if (hideHints) {
        beats[i].className = game.hits[index] ? `music-beat hit${duration ? " hold" : ""}` : "music-beat rest";
        beats[i].textContent = game.hits[index] ? "+" : "";
        if (!continuation) note++;
        continue;
      }
      const holding = game.activeHold === index;
      const release = holding && Math.abs(visualNow - at - duration) <= MUSIC.releaseWindowMs;
      const cue = duration ? visualNow >= at - MUSIC.windowMs && visualNow <= at + duration + MUSIC.releaseWindowMs
        : Math.abs(at - visualNow) <= MUSIC.windowMs;
      beats[i].className = game.hits[index] ? "music-beat hit"
        : release ? "music-beat release" : holding ? "music-beat holding"
        : cue ? "music-beat cue"
        : visualNow > at + duration + (duration ? MUSIC.releaseWindowMs : MUSIC.windowMs)
          ? "music-beat missed" : "music-beat";
      if (duration) {
        beats[i].className += " hold";
        const progress = Math.max(0, Math.min(1, (visualNow - at - (i - headSlot) * game.intervalMs) / game.intervalMs));
        beats[i].style.setProperty("--music-fill", `${progress * 100}%`);
      }
      beats[i].textContent = game.hits[index] ? "+" : release ? "^" : continuation ? "="
        : duration ? `H${game.pattern[i]}` : visualNow > at + MUSIC.windowMs ? "-" : "*";
      if (!continuation) note++;
    }
    if (hideHints && pressFeedback && now < pressFeedback.until && loop === pressFeedback.loop) {
      const beat = beats[pressFeedback.slot];
      beat.className = `music-beat ${pressFeedback.success ? "hit" : "wrong"}`;
      beat.textContent = pressFeedback.success ? "+" : "×";
    }
    document.querySelector("#music-score").textContent = `${t("musicScore", { hits, total: game.hits.length })} — ${
      t("musicMistakes", { mistakes: game.mistakes, limit: game.mistakeLimit })} — ${
      t("musicLoop", { loop: loop + 1, total: MUSIC.loops })}`;
    if (game.resonance) {
      const phase = demonstrating
        ? (french ? "Démonstration — regardez et écoutez" : "Demonstration — watch and listen")
        : (french ? "À vous — Espace pour jouer, sans indices" : "Your turn — Space to play, no hints");
      document.querySelector("#music-score").textContent =
        `${phase} — ${document.querySelector("#music-score").textContent}`;
    }
    if (game.activeHold !== null && !hideHints) {
      const remaining = beatTime(game, game.activeHold) + holdDuration(game, game.activeHold) - now;
      document.querySelector("#music-score").textContent += ` — ${t(
        Math.abs(remaining) <= MUSIC.releaseWindowMs ? "musicReleaseNow" : "musicKeepHolding")}`;
    }
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
    const total = game.hits.length;
    game = undefined;
    holdSource = null;
    pointerClick = false;
    settled = settle(hits, mistakes, cancelled);
    feedbackOutcome = settled === null || cancelled || failed || settled <= 0 ||
      outcomeReputation(hits, total, failed, cancelled) < 0 ? "failure" : "success";
    feedback = settled === null ? t("musicFailed") : t(failed ? "musicTooManyMistakes"
      : cancelled ? "musicCancelled" : "musicReward", {
      hits, total, money: (settled / 100).toFixed(2), limit,
    });
    if (settled !== null) feedback += ` ${t("minigameReputation", {
      amount: outcomeReputation(hits, total, failed, cancelled),
    })}`;
    localize();
  }

  function start() {
    if (game || !available()) return;
    const skill = difficulty();
    const started = begin();
    if (!started) {
      feedback = t("musicFailed");
      feedbackOutcome = "failure";
      localize();
      return;
    }
    feedback = "";
    pointerClick = false;
    pressFeedback = null;
    const active = Boolean(started?.resonance ?? (skill.resonance || resonance()));
    game = rhythm(performance.now(), Math.random, mistakeLimit(), skill.beats,
      { ...skill, resonance: active });
    if (active) {
      game = { ...game, startedAt: game.startedAt + game.previewMs };
      showVariantHelp(true);
      setResonanceDecoration(true);
    }
    void audio.start(game);
    track.replaceChildren();
    beats.length = 0;
    for (let i = 0; i < game.pattern.length; i++) {
      const beat = document.createElement("span");
      beat.className = "music-beat";
      track.append(beat);
      beats.push(beat);
    }
    localize();
    render(performance.now());
    if (tap.disabled) dialog.focus();
    else tap.focus();
    timer = setInterval(() => {
      const now = performance.now();
      game = advanceRhythm(game, now);
      if (game.activeHold === null) holdSource = null;
      render(now);
      if (game.mistakes >= game.mistakeLimit || now >= rhythmEnd(game)) finish();
    }, 25);
  }

  function hit(source = "click") {
    if (!game) return;
    const now = performance.now();
    if (now < game.startedAt) return;
    if (now > rhythmEnd(game)) return finish();
    const next = tapRhythm(game, now);
    const startedHold = next.activeHold !== null && game.activeHold === null;
    const success = next.hits !== game.hits || startedHold;
    markPress(now, success);
    audio.hit(success);
    game = next;
    if (startedHold) holdSource = source;
    render(now);
    if (game.mistakes >= game.mistakeLimit) finish();
  }
  function markPress(now, success) {
    if (!game.resonance) return;
    const slot = Math.max(0, Math.min(game.pattern.length * MUSIC.loops - 1,
      Math.round((now - game.startedAt - MUSIC.leadMs) / game.intervalMs)));
    pressFeedback = { slot: slot % game.pattern.length,
      loop: Math.floor(slot / game.pattern.length), success, until: now + 350 };
  }
  function release(source, cancelled = false) {
    if (!game || game.activeHold === null || holdSource !== source) return;
    const previous = game;
    game = releaseRhythm(game, performance.now(), cancelled);
    holdSource = null;
    markPress(performance.now(), game.hits !== previous.hits);
    audio.hit(game.hits !== previous.hits);
    render(performance.now());
    if (game.mistakes >= game.mistakeLimit) finish();
  }
  function open() {
    if (document.querySelector("#earn-money-dialog")?.open) document.querySelector("#earn-money-dialog").close();
    if (!available() || document.querySelector("dialog[open]")) return;
    feedback = "";
    track.replaceChildren();
    document.querySelector("#music-score").textContent = "";
    document.querySelector("#music-progress").value = 0;
    dialog.showModal();
    localize();
  }
  play.addEventListener("click", start);
  tap.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !game) return;
    event.preventDefault();
    pointerClick = true;
    tap.setPointerCapture(event.pointerId);
    hit("pointer");
  });
  tap.addEventListener("pointerup", () => release("pointer"));
  tap.addEventListener("pointercancel", () => { release("pointer", true); pointerClick = false; });
  tap.addEventListener("lostpointercapture", () => release("pointer", true));
  tap.addEventListener("click", () => {
    if (pointerClick) { pointerClick = false; return; }
    if (holdSource === "click") release("click");
    else hit();
  });
  document.querySelector("#open-music").addEventListener("click", open);
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish(true);
      dialog.close();
    } else if (event.code === "Space" && game) {
      event.preventDefault();
      if (!event.repeat) hit("keyboard");
    }
  });
  dialog.addEventListener("keyup", event => {
    if (event.code !== "Space" || !game) return;
    event.preventDefault();
    release("keyboard");
  });
  dialog.addEventListener("focusout", event => {
    if (game && !dialog.contains(event.relatedTarget)) release(holdSource, true);
  });
  dialog.addEventListener("close", () => {
    if (!dialog.open) finish(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) finish(true);
  });
  return { localize, reset() { finish(true); dialog.close(); feedback = ""; } };
}
