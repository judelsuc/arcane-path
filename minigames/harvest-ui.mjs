import { createGame, difficulty, input, advance, result, bunchAt } from "./harvest.mjs";
import { resolveResonance, decorateResonance, resonanceResult } from "../arcane-resonance.mjs";

const COPY = {
  en: {
    title: "Grape harvest", intro: "Fictional playtest: no journey costs, earnings or save changes.",
    instructions: "Harvest for 30 seconds. Hold Left / Right to steer grapes into the matching basket. Tap and release Space or Drop for a fast visible fall. Hold for 0.5 seconds to squash any bunch instead: good grapes are wasted. Each correct bunch earns one point; sort faster to score more. Arrow buttons also steer. Escape cancels.",
    colours: ["Purple", "Green", "Gold", "Red", "Blue", "Pink"],
    start: "Start", cancel: "Cancel", left: "Steer left", right: "Steer right",
    score: "Score", bunch: "Bunch", correct: "Good catch!", wrong: "Wrong basket!",
    ready: "Ready to harvest?", done: "Harvest complete!", cancelled: "Cancelled — no reward.",
    error: "Game error — round cancelled.", baskets: "colours / baskets", fall: "seconds per fall",
    falling: "Falling grapes", target: "Aim for", field: "Falling grapes and matching coloured baskets",
    discard: "Fast fall / hold 0.5 s to squash (Space)", rotten: "Rotten grapes — hold Space 0.5 s!",
    squashed: "Rotten bunch squashed! +1", wasted: "Good bunch squashed — no point.",
    spoiled: "Rotten grapes in the basket! −1 point (minimum 0).",
  },
  fr: {
    title: "Vendanges", intro: "Test fictif : aucun coût, gain ou changement de sauvegarde du voyage.",
    instructions: "Vendangez pendant 30 secondes. Maintenez Gauche / Droite pour viser le panier de même couleur. Appuyez puis relâchez Espace ou Chute pour une chute rapide visible. Maintenez 0,5 seconde pour écraser toute grappe : une bonne grappe est gaspillée. Chaque grappe bien triée rapporte un point ; triez plus vite pour marquer plus de points. Les boutons fléchés guident aussi. Échap annule.",
    colours: ["Violet", "Vert", "Doré", "Rouge", "Bleu", "Rose"],
    start: "Commencer", cancel: "Annuler", left: "Guider à gauche", right: "Guider à droite",
    score: "Score", bunch: "Grappe", correct: "Bien attrapée !", wrong: "Mauvais panier !",
    ready: "Prêt pour les vendanges ?", done: "Vendanges terminées !", cancelled: "Annulé — aucune récompense.",
    error: "Erreur du jeu — partie annulée.", baskets: "couleurs / paniers", fall: "secondes par chute",
    falling: "Grappe en chute", target: "Visez", field: "Grappes en chute et paniers de couleur correspondante",
    discard: "Chute rapide / écraser 0,5 s (Espace)", rotten: "Grappe pourrie — maintenir Espace 0,5 s !",
    squashed: "Grappe pourrie écrasée ! +1", wasted: "Bonne grappe écrasée — aucun point.",
    spoiled: "Grappe pourrie dans le panier ! −1 point (minimum 0).",
  },
};
const COLOURS = ["#b67be2", "#90ce59", "#f4cc55", "#ed706b", "#6db8f2", "#f18dbd"];
const SYMBOLS = ["●", "◆", "★", "■", "▲", "♥"];

export function mount(container, { level = 0, language = "fr", onFinish, audio, journey = false, ...options } = {}) {
  const resonance = resolveResonance("harvest", options);
  const rule = difficulty(level);
  if (!container?.ownerDocument || typeof container.append !== "function" ||
      (onFinish !== undefined && typeof onFinish !== "function")) throw new TypeError("Invalid harvest mount.");
  const doc = container.ownerDocument, view = doc.defaultView ?? globalThis;
  const clock = () => view.performance.now();
  const baseText = COPY[language] ?? COPY.fr;
  const text = journey ? { ...baseText, intro: language === "en"
    ? "Sort grapes into matching baskets and squash rotten bunches before they fall."
    : "Triez les grappes dans les paniers correspondants et écrasez les grappes pourries avant leur chute." }
    : baseText;
  const root = doc.createElement("section");
  root.lang = language === "en" ? "en" : "fr";
  root.tabIndex = 0;
  root.setAttribute("aria-label", text.title);
  const removers = [], held = new Set(), pointers = new Map();
  let game, timer, finished = false, destroyed = false, announced = -1;
  let actionSource = null, pointerClick = false;
  function node(tag, content, className, parent = root) {
    const element = doc.createElement(tag);
    if (content !== undefined) element.textContent = content;
    if (className) element.className = className;
    parent.append(element);
    return element;
  }
  function listen(element, event, handler) {
    element.addEventListener(event, handler);
    removers.push(() => element.removeEventListener(event, handler));
  }
  function illustration(kind, parent) {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    const use = doc.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `./minigames/harvest-art.svg#${kind}`);
    svg.append(use);
    parent.append(svg);
  }
  function button(label, parent = root) {
    const element = node("button", label, undefined, parent);
    element.type = "button";
    return element;
  }
  node("h2", text.title);
  node("p", text.intro, "game-help-text");
  node("p", text.instructions, "game-help-text");
  if (resonance) node("p", language === "en"
    ? `Empress: about ${rule.rottenCount} in 16 bunches are rotten. Hold Space or the drop button for 0.5 seconds to squash a bunch: +1 for rotten, no point for good. Releasing sooner triggers a fast fall, even for rotten grapes. Rotten grapes reaching any basket subtract 1 earned point (minimum 0). Release before acting on the next bunch.`
    : `Impératrice : environ ${rule.rottenCount} grappes sur 16 sont pourries. Maintenez Espace ou le bouton de chute 0,5 seconde pour écraser une grappe : +1 si pourrie, aucun point si bonne. Relâcher avant déclenche une chute rapide, même si pourrie. Une grappe pourrie dans un panier retire 1 point gagné (minimum 0). Relâchez avant d'agir sur la suivante.`, "game-help-text");
  node("p", `${rule.baskets} ${text.baskets} · ${rule.fallMs / 1000} ${text.fall}`, "game-help-text");
  const status = node("p", `${text.score}: 0 · ${rule.durationMs / 1000} s`, "harvest-score");
  const holdStatus = node("p", "", "harvest-hold");
  const cue = node("p", text.ready, "harvest-cue");
  cue.setAttribute("aria-live", "polite");
  const field = node("div", undefined, "harvest-field");
  field.setAttribute("role", "group");
  field.setAttribute("aria-label", text.field);
  node("div", undefined, "harvest-vine", field).setAttribute("aria-hidden", "true");
  const basketRow = node("div", undefined, "harvest-baskets", field);
  const baskets = Array.from({ length: rule.baskets }, (_, i) => {
    const basket = node("div", undefined, "harvest-basket", basketRow);
    basket.style.color = COLOURS[i];
    illustration("basket", basket);
    node("span", `${SYMBOLS[i]} ${text.colours[i]}`, "harvest-basket-label", basket);
    return basket;
  });
  const grape = node("div", undefined, "harvest-grape", field);
  grape.hidden = true;
  grape.setAttribute("role", "img");
  illustration("grape", grape);
  const marker = node("span", "", "harvest-grape-symbol", grape);
  marker.setAttribute("aria-hidden", "true");
  const feedback = node("p", "", "harvest-feedback");
  feedback.setAttribute("role", "status");
  const controls = node("div", undefined, "harvest-controls");
  const start = button(text.start, controls);
  const left = button(`← ${text.left}`, controls);
  const right = button(`${text.right} →`, controls);
  const cancel = button(text.cancel, controls);
  const discard = button(text.discard, controls);
  if (discard) {
    discard.disabled = true;
    discard.setAttribute("aria-keyshortcuts", "Space");
  }
  left.disabled = right.disabled = true;
  left.className = right.className = "harvest-steer";
  function cleanup() {
    view.clearInterval(timer);
    timer = undefined;
    held.clear();
    pointers.clear();
    actionSource = null;
    removers.splice(0).forEach(remove => remove());
  }
  function finish(cancelled, error = false) {
    if (finished) return;
    finished = true;
    cleanup();
    if (cancelled) audio?.stop();
    const outcome = cancelled
      ? Object.freeze({ completed: false, score: game?.score ?? 0, maxScore: game?.index ?? 0, cancelled: true })
      : result(game);
    feedback.textContent = error ? text.error : cancelled ? text.cancelled : text.done;
    grape.hidden = true;
    status.textContent = `${text.score}: ${outcome.score} · ${language === "en" ? "Sorted" : "Triées"}: ${outcome.maxScore}`;
    holdStatus.textContent = "";
    [start, left, right, cancel, discard].filter(Boolean).forEach(element => { element.disabled = true; });
    onFinish?.(Object.freeze(resonanceResult(outcome, resonance)));
  }
  function render() {
    status.textContent = `${text.score}: ${game.score} · ${text.bunch}: ${game.index + 1} · ${Math.max(0,
      Math.ceil((rule.durationMs - (game.now - game.startedAt)) / 1000))} s`;
    const current = bunchAt(game);
    holdStatus.textContent = game.pressIndex === game.index && game.fastAt === null
      ? `${language === "en" ? "Squashing" : "Écrasement"} : ${Math.min(0.5,
        (game.now - game.pressAt) / 1000).toFixed(1)} / 0.5 s` : "";
    if (game.index !== announced) {
      announced = game.index;
      {
        const colour = current.colour;
        const bad = current.rotten;
        cue.textContent = bad ? text.rotten : `${text.target}: ${SYMBOLS[colour]} ${text.colours[colour]}`;
        grape.setAttribute("aria-label", bad ? text.rotten : `${text.falling}: ${text.colours[colour]}`);
        grape.style.color = bad ? "#716348" : COLOURS[colour];
        grape.dataset.rotten = String(bad);
        grape.children[0].children[0].setAttribute("href",
          bad ? "./minigames/harvest-art.svg?v=2#rotten-grape" : "./minigames/harvest-art.svg#grape");
        marker.textContent = bad ? "×" : SYMBOLS[colour];
      }
    }
    if (result(game).completed) return finish(false);
    const naturalProgress = (game.now - game.startedAt + game.savedMs - game.index * rule.fallMs) / rule.fallMs;
    const progress = game.fastAt === null ? naturalProgress : Math.max(naturalProgress,
      game.fastProgress + (1 - game.fastProgress) * (game.now - game.fastAt) / rule.fastFallMs);
    grape.style.left = `${game.x * 100}%`;
    grape.style.top = `${8 + progress * 72}%`;
    grape.hidden = false;
    discard.disabled = false;
    baskets.forEach((basket, index) => {
      basket.dataset.under = String(index === Math.min(rule.baskets - 1, Math.floor(game.x * rule.baskets)));
    });
  }
  function update(action) {
    if (!game || finished || destroyed) return;
    if (doc.hidden) return finish(true);
    try {
      const previous = game.index;
      game = action ? input(game, action, clock()) : advance(game, clock());
      if (game.index > previous) {
        feedback.textContent = text[game.feedback];
        field.dataset.feedback = game.feedback;
        void audio?.play(["squashed", "wasted"].includes(game.feedback) ? "squish"
          : game.feedback === "correct" ? "success" : "caught");
      }
      render();
    } catch (reason) {
      console.error("Harvest action failed:", reason);
      finish(true, true);
    }
  }
  function steer() {
    const directions = new Set([...held, ...pointers.values()]);
    const direction = Number(directions.has("right")) - Number(directions.has("left"));
    update(direction < 0 ? "left" : direction > 0 ? "right" : "stop");
  }
  function stopSteering() {
    held.clear();
    pointers.clear();
    actionSource = null;
    update("abort-press");
    update("stop");
  }
  listen(start, "click", () => {
    if (game || finished || destroyed) return;
    if (doc.hidden) return finish(true);
    try { game = createGame({ level, now: clock(), ...options }); }
    catch (reason) { console.error("Harvest start failed:", reason); finish(true, true); return; }
    start.disabled = true;
    left.disabled = right.disabled = false;
    root.focus({ preventScroll: true });
    field.scrollIntoView?.({ block: "center" });
    timer = view.setInterval(() => update(), 20);
    render();
  });
  listen(cancel, "click", () => finish(true));
  function press(source) {
    if (!game || finished || actionSource !== null) return;
    actionSource = source;
    update("press");
  }
  function releaseAction(source, cancelled = false) {
    if (actionSource !== source) return;
    actionSource = null;
    update(cancelled ? "abort-press" : "release");
  }
  listen(discard, "pointerdown", event => {
    if (event.button !== 0 || !game || finished) return;
    event.preventDefault();
    discard.setPointerCapture(event.pointerId);
    pointerClick = true;
    press(event.pointerId);
  });
  listen(discard, "lostpointercapture", event => releaseAction(event.pointerId, true));
  listen(discard, "click", () => {
    if (pointerClick) { pointerClick = false; return; }
    press("click");
    releaseAction("click");
  });
  const arrow = key => key === "ArrowLeft" ? "left" : key === "ArrowRight" ? "right" : null;
  listen(root, "keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") { event.preventDefault(); finish(true); }
    else if (game && !finished && event.key === " ") {
      event.preventDefault();
      if (!event.repeat) press("keyboard");
    }
    else if (game && !finished && arrow(event.key)) {
      event.preventDefault();
      if (!held.has(arrow(event.key))) { held.add(arrow(event.key)); steer(); }
    }
  });
  listen(doc, "keyup", event => {
    if (event.key === " ") { event.preventDefault(); releaseAction("keyboard"); }
    if (held.delete(arrow(event.key))) { event.preventDefault(); steer(); }
  });
  for (const [element, direction] of [[left, "left"], [right, "right"]]) {
    listen(element, "pointerdown", event => {
      if (event.button !== 0 || !game || finished) return;
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, direction);
      steer();
    });
    listen(element, "lostpointercapture", event => {
      if (pointers.delete(event.pointerId)) steer();
    });
  }
  const release = (event, cancelled = false) => {
    releaseAction(event.pointerId, cancelled);
    if (pointers.delete(event.pointerId)) steer();
  };
  listen(doc, "pointerup", release);
  listen(doc, "pointercancel", event => release(event, true));
  listen(root, "focusout", event => { if (!root.contains(event.relatedTarget)) stopSteering(); });
  if (doc.defaultView) {
    listen(view, "blur", stopSteering);
    listen(view, "pagehide", () => { finish(true); audio?.stop(); });
  }
  listen(doc, "visibilitychange", () => { if (doc.hidden && game) finish(true); if (doc.hidden) audio?.stop(); });
  container.append(root);
  decorateResonance(root, "harvest", resonance, language);
  return { destroy() {
    if (destroyed) return;
    finish(true);
    destroyed = true;
    cleanup();
    audio?.stop();
    root.remove();
  } };
}
