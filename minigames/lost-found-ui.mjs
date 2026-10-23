import { advance, createGame, difficulty, input, result } from "./lost-found.mjs";
import { objectIllustration } from "./lost-found-art.mjs";
import { resolveResonance, decorateResonance } from "../arcane-resonance.mjs";

const copy = {
  fr: {
    title: "Objets trouvés — enquête fictive", instructions: "Lisez chaque déclaration et observez les objets dessinés. Une seule réponse convient. Vous avez 15 secondes après Commencer pour tout retrouver ; trois erreurs terminent aussi la partie. Tab puis Entrée ou Espace pour choisir ; Échap pour annuler.",
    start: "Commencer", cancel: "Annuler", gifts: "Afficher un cadeau de remerciement fictif (facultatif)",
    score: "Score", errors: "Erreurs", mismatch: "Ce détail ne correspond pas. Relisez la déclaration.",
    success: "Tous les objets ont retrouvé leur propriétaire !", failed: "Trois erreurs : enquête terminée.",
    cancelled: "Enquête annulée — aucun cadeau.", gift: "Remerciement imaginaire : carte illustrée. Multiplicateur fictif",
    fiction: "Objets et propriétaires inventés. Aucun argent, inventaire ou cadeau réel n’est attribué.",
    object: "Objet", ready: "Limite : 0:15, à partir de Commencer.",
    time: "Temps restant", timedOut: "Temps écoulé : enquête incomplète.",
  },
  en: {
    title: "Lost and found — fictional detective", instructions: "Read each report and examine the illustrated objects. Exactly one fits. You have 15 seconds after Start to find them all; three mistakes also end the game. Tab then Enter or Space to choose; Escape to cancel.",
    start: "Start", cancel: "Cancel", gifts: "Show a fictional thank-you gift (optional)",
    score: "Score", errors: "Mistakes", mismatch: "That detail does not match. Read the report again.",
    success: "Every object has found its owner!", failed: "Three mistakes: investigation ended.",
    cancelled: "Investigation cancelled — no gift.", gift: "Imaginary thanks: illustrated card. Fictional multiplier",
    fiction: "Invented objects and owners. No money, inventory or real gifts are awarded.",
    object: "Object", ready: "Time limit: 0:15, starting when you press Start.",
    time: "Time left", timedOut: "Time is up: investigation incomplete.",
  },
};

/** Standalone UI. Host must call available(currentCell) before offering entry. */
export function mount(container, { level = 0, language = "fr", onFinish = () => {}, journey = false, ...options } = {}) {
  const resonance = resolveResonance("lostfound", options);
  const settings = difficulty(level);
  if (!container?.ownerDocument || typeof onFinish !== "function") throw new TypeError("Invalid mount options.");
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const now = () => Math.max(Math.floor(win.performance.now()), game?.now ?? 0);
  const lang = language === "en" ? "en" : "fr";
  const baseText = copy[lang];
  const t = journey ? {
    ...baseText,
    title: lang === "en" ? "Lost and found" : "Objets trouvés",
    cancelled: lang === "en" ? "Investigation cancelled." : "Enquête annulée.",
    fiction: "",
    gifts: "",
  } : baseText;
  const root = doc.createElement("section");
  root.lang = lang;
  let game = null, finished = false, destroyed = false, observer, timer = null;
  const make = (tag, text, parent = root) => {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    parent.append(node);
    return node;
  };
  const button = (text, action, parent = root) => {
    const node = make("button", text, parent);
    node.type = "button";
    node.dataset.action = action;
    return node;
  };
  make("h2", t.title);
  make("p", t.instructions).className = "game-help-text";
  if (resonance) make("p", lang === "en"
    ? "Moon: two blue umbrellas look almost alike. Inspect their moon medallions in close-up: one has one engraved dot, the other two. The same detail is described in text. Inspection costs no mistake; Confirm answers the report. The same 15-second clock keeps running, including inspection."
    : "La Lune : deux parapluies bleus se ressemblent. Inspectez leur médaillon lune en gros plan : un point gravé ou deux. Le même détail est décrit en texte. Inspecter ne coûte aucune erreur ; Confirmer répond à la déclaration. Le même chronomètre de 15 secondes continue, même pendant l’inspection.").className = "game-help-text";
  let gifts;
  if (!journey) {
    make("p", t.fiction).className = "game-help-text";
    const giftLabel = make("label", "");
    gifts = make("input", "", giftLabel);
    gifts.type = "checkbox";
    make("span", t.gifts, giftLabel);
  }
  const start = button(t.start, "start");
  const countdown = make("p", t.ready);
  countdown.className = "lost-found-timer";
  countdown.setAttribute("role", "timer");
  countdown.setAttribute("aria-live", "off");
  const status = make("p", "");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const report = make("p", "");
  report.tabIndex = -1;
  const choices = make("div", "");
  choices.className = "lost-found-choices";
  const inspection = make("div", "");
  inspection.className = "lost-found-inspection";
  inspection.hidden = true;
  inspection.setAttribute("role", "group");
  inspection.setAttribute("aria-label", lang === "en" ? "Close-up inspection" : "Inspection en gros plan");
  const cancel = button(t.cancel, "cancel");
  decorateResonance(root, "lostfound", resonance, lang);
  container.append(root);
  const hidden = () => doc.hidden || Boolean(root.closest("[hidden], [aria-hidden='true']")) ||
    !root.isConnected || (() => {
      const style = doc.defaultView?.getComputedStyle;
      if (!style) return false;
      for (let node = root; node?.nodeType === 1; node = node.parentElement) {
        const computed = style.call(doc.defaultView, node);
        if (computed.display === "none" || ["hidden", "collapse"].includes(computed.visibility)) return true;
      }
      return false;
    })();
  function cleanup() {
    if (timer !== null) win.clearInterval(timer);
    timer = null;
    root.removeEventListener("click", click);
    root.removeEventListener("keydown", keydown);
    doc.removeEventListener("visibilitychange", visibility);
    win.removeEventListener?.("pagehide", pagehide);
    observer?.disconnect();
  }
  function finish(cancelled = false) {
    if (finished) return;
    if (cancelled) {
      game ??= createGame({ level, now: now(), resonance });
      game = input(game, { type: "cancel" }, now());
    }
    finished = true;
    cleanup();
    choices.replaceChildren();
    inspection.replaceChildren();
    inspection.hidden = true;
    report.textContent = "";
    start.disabled = cancel.disabled = true;
    if (gifts) gifts.disabled = true;
    const outcome = result(game);
    renderTimer();
    const message = outcome.cancelled ? t.cancelled : outcome.completed ? t.success : outcome.timedOut ? t.timedOut : t.failed;
    status.textContent = `${message} ${t.score}: ${outcome.score}/${outcome.maxScore}. ${t.errors}: ${game.mistakes}/3.`;
    if (!journey && outcome.completed && gifts.checked) make("p", `${t.gift}: ×${settings.rewardMultiplier}.`);
    onFinish(outcome);
  }
  function renderTimer() {
    const seconds = Math.max(0, Math.ceil((game.timeLimitMs - (game.now - game.startedAt)) / 1000));
    countdown.textContent = `${t.time}: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    countdown.dataset.urgent = String(game.status === "playing" && seconds <= 10);
  }
  function render() {
    renderTimer();
    status.textContent = `${t.score}: ${game.score}/${game.objects.length}. ${t.errors}: ${game.mistakes}/3. ${game.error ? t.mismatch : ""}`;
    report.textContent = game.reports[game.index].description[lang];
    choices.replaceChildren();
    for (const [index, object] of game.objects.entries()) {
      if (!game.remaining.includes(object.id)) continue;
      const node = button("", object.inspectRequired ? "inspect" : "match", choices);
      node.dataset.objectId = object.id;
      node.setAttribute("aria-label", `${index + 1}. ${object.label[lang]}${object.inspectRequired ? lang === "en" ? " — Inspect" : " — Inspecter" : ""}`);
      node.append(objectIllustration(doc, object.id, { resonance }));
      make("span", `${t.object} ${index + 1}${object.inspectRequired ? lang === "en" ? " · Inspect" : " · Inspecter" : ""}`, node);
    }
    inspection.replaceChildren();
    inspection.hidden = !game.inspected;
    if (game.inspected) {
      const object = game.objects.find(item => item.id === game.inspected);
      make("h3", lang === "en" ? "Close-up inspection" : "Inspection en gros plan", inspection);
      inspection.append(objectIllustration(doc, object.id, { resonance, closeup: true }));
      make("p", object.detail?.[lang] ?? object.label[lang], inspection);
      const confirm = button(lang === "en" ? "Confirm this object" : "Confirmer cet objet", "confirm", inspection);
      confirm.setAttribute("aria-label", `${confirm.textContent} — ${object.detail?.[lang] ?? object.label[lang]}`);
      confirm.dataset.objectId = object.id;
      confirm.focus();
    } else report.focus();
  }
  function click(event) {
    const node = event.target.closest?.("button");
    if (!node || !root.contains(node) || node.disabled || finished) return;
    if (hidden()) return finish(true);
    if (node.dataset.action === "cancel") return finish(true);
    if (node.dataset.action === "start" && !game) {
      game = createGame({ level, now: now(), resonance });
      start.disabled = true;
      if (gifts) gifts.disabled = true;
      render();
      timer = win.setInterval(tick, 100);
    } else if (["match", "inspect", "confirm"].includes(node.dataset.action) && game?.status === "playing") {
      game = input(game, { type: node.dataset.action, objectId: node.dataset.objectId }, now());
      if (game.status !== "playing") finish();
      else render();
    }
    function tick() {
      if (finished || !game) return;
      if (hidden()) return finish(true);
      game = advance(game, now());
      renderTimer();
      if (game.status !== "playing") finish();
    }
  }
  function keydown(event) {
    if (event.key === "Escape") { event.preventDefault(); finish(true); }
  }
  function visibility() { if (hidden()) finish(true); }
  function pagehide() { finish(true); }
  root.addEventListener("click", click);
  root.addEventListener("keydown", keydown);
  doc.addEventListener("visibilitychange", visibility);
  win.addEventListener?.("pagehide", pagehide);
  const Observer = doc.defaultView?.MutationObserver;
  if (Observer) {
    observer = new Observer(visibility);
    observer.observe(doc.documentElement, { attributes: true, childList: true, subtree: true,
      attributeFilter: ["hidden", "aria-hidden", "style", "class"] });
  }
  visibility();
  return { destroy() {
    if (destroyed) return;
    destroyed = true;
    try { finish(true); } finally { cleanup(); root.remove(); }
  } };
}
