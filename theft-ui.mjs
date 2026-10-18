import { THEFT, createTheftGame, theftPosition, advanceTheft } from "./theft.mjs";
import { setFeedback } from "./feedback.mjs";
import { decorateResonance } from "./arcane-resonance.mjs";

export function setupTheft(t, { available, begin, settle, audio, difficulty = () => "normal",
  resonance = () => false }) {
  const dialog = document.querySelector("#theft-dialog");
  const start = document.querySelector("#theft-start");
  const grab = document.querySelector("#theft-grab");
  const marker = document.querySelector("#theft-marker");
  const target = document.querySelector("#theft-dialog .theft-target");
  const result = document.querySelector("#theft-result");
  let game, timer, outcome, failure = "", decorated = false, decorationNodes = [];
  const instructions = document.querySelector("#theft-dialog .window-help-text");
  const baseInstructions = instructions.textContent;
  const french = document.documentElement?.lang !== "en";
  function showVariantHelp(active) {
    instructions.textContent = active
      ? `${baseInstructions} ${french
        ? "Variante du Diable : le succès augmente la nourriture de jeu de 10 %. La cible dorée, plus étroite et située dans la zone verte, ajoute encore jusqu’à 10 % avant ce multiplicateur ; un seul appui. Défi de timing fictif, sans conseils applicables au monde réel."
        : "Devil variant: success increases game food by 10%. The narrower gold target inside the green zone adds up to 10% more before that multiplier. One press; a fictional timing challenge, not real-world guidance."}`
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
    decorateResonance(dialog, "theft", true, french ? "fr" : "en");
    decorationNodes = Array.from(dialog.children).filter(node => !before.has(node));
    decorated = true;
  }
  function localize() {
    start.disabled = Boolean(game) || !available();
    grab.disabled = !game;
    result.textContent = failure || (outcome === "bonus"
      ? (french ? "Résonance dorée : nourriture supplémentaire accordée." : "Gold resonance: bonus food awarded.")
      : outcome ? t(`theftResult.${outcome}`) : "");
    setFeedback(result, failure || outcome && !["success", "bonus"].includes(outcome)
      ? "failure" : outcome ? "success" : "");
    const resonant = Boolean(game?.resonance ?? resonance());
    showVariantHelp(resonant);
    setResonanceDecoration(resonant);
  }
  function finish(value) {
    if (!game) return;
    clearInterval(timer);
    timer = undefined;
    game = undefined;
    try {
      const settled = settle(value);
      if (!settled) throw new Error(t("theftFailed"));
      outcome = value;
      if (value !== "cancelled") void audio?.play(value === "bonus" ? "success" : value);
      else audio?.stop();
    } catch (reason) {
      console.error("Unable to settle theft:", reason);
      failure = t("theftError", { error: reason.message });
    }
    localize();
  }
  function render(now) {
    marker.style.left = `${theftPosition(game, now) * 100}%`;
    const clock = document.querySelector("#theft-clock");
    const text = t("theftTime", {
      seconds: Math.max(0, Math.ceil((THEFT.durationMs - now + game.startedAt) / 1000)),
    });
    if (clock.textContent !== text) clock.textContent = text;
  }
  function open() {
    if (!available()) return;
    document.querySelector("#earn-money-dialog")?.close();
    if (document.querySelector("dialog[open]")) return;
    outcome = null;
    audio?.stop();
    failure = "";
    marker.style.left = "0%";
    target.hidden = true;
    document.querySelector("#theft-clock").textContent = "";
    dialog.showModal();
    localize();
  }
  start.addEventListener("click", () => {
    if (game || !available()) return;
    outcome = null;
    failure = "";
    let began = false;
    try {
      audio?.stop();
      const started = begin();
      if (!started) {
        failure = t("theftFailed");
        localize();
        return;
      }
      began = true;
      const active = Boolean(started?.resonance ?? resonance());
      game = createTheftGame(performance.now(), Math.random, difficulty(), { resonance: active });
      if (active) {
        showVariantHelp(true);
        setResonanceDecoration(true);
      }
      target.style.left = `${game.targetStart * 100}%`;
      target.style.width = `${(game.targetEnd - game.targetStart) * 100}%`;
      if (active) {
        const width = game.targetEnd - game.targetStart;
        const goldStart = (game.bonusStart - game.targetStart) / width * 100;
        const goldEnd = (game.bonusEnd - game.targetStart) / width * 100;
        target.style.backgroundImage = `linear-gradient(to right, #63794d 0 ${goldStart}%, #e4c45a ${goldStart}% ${goldEnd}%, #63794d ${goldEnd}% 100%)`;
      } else target.style.backgroundImage = "";
      target.hidden = false;
      render(performance.now());
      localize();
      grab.focus();
      timer = setInterval(() => {
        game = advanceTheft(game, performance.now());
        if (game.outcome) finish(game.outcome);
        else render(game.lastAt);
      }, 25);
    } catch (reason) {
      console.error("Unable to start theft:", reason);
      if (game) finish("cancelled");
      else if (began) {
        try { settle("cancelled"); }
        catch (settlementError) { console.error("Unable to cancel theft startup:", settlementError); }
      }
      failure = t("theftError", { error: reason.message });
      localize();
    }
  });
  grab.addEventListener("click", () => {
    if (!game) return;
    game = advanceTheft(game, performance.now(), true);
    finish(game.outcome);
  });
  dialog.addEventListener("keydown", event => {
    if (event.code === "Space" && game) {
      event.preventDefault();
      if (!event.repeat) grab.click();
    }
  });
  dialog.addEventListener("cancel", () => finish("cancelled"));
  dialog.addEventListener("close", () => { finish("cancelled"); audio?.stop(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { finish("cancelled"); audio?.stop(); }
  });
  return { open, localize, reset() { finish("cancelled"); dialog.close(); outcome = null; failure = ""; } };
}
