import { eventChallenge, QTE_KEYS, QTE_PROMPTS } from "./event-qte.mjs";

const COPY = {
  en: {
    title: "React to the encounter", start: "Start · 6 seconds", relaxed: "Untimed accessible mode",
    skip: "Skip challenge", retry: "Retry saving the result", act: "Act · Space",
    timing: "Stop the marker inside the outlined middle zone (35–65%). One attempt.",
    sequence: "Follow these directions in order with the arrow keys or touch buttons. A wrong direction ends the attempt.",
    observe: "Match the indicated direction with an arrow key or touch button. One attempt.",
    controls: "Read first, then start. No timer runs before starting. Leaving this tab or reloading a started challenge ends it without success.",
    benefits: "Success earns the normal reward or avoids the penalty. Failure, timeout or skipping gives no reward or the normal penalty. Story events remain mechanically neutral.",
    active: "Challenge in progress", progress: "Correct steps", remaining: "Seconds left",
    reloaded: "The started challenge was interrupted. Its unsuccessful outcome must be saved before continuing.",
    startSaveFailed: "Unable to save the challenge start.",
    resultSaveFailed: "Unable to save the challenge result.",
    directions: ["Left", "Up", "Right", "Down"],
  },
  fr: {
    title: "Réagir à la rencontre", start: "Commencer · 6 secondes", relaxed: "Mode accessible sans limite de temps",
    skip: "Passer le défi", retry: "Réessayer d'enregistrer le résultat", act: "Agir · Espace",
    timing: "Arrêtez le repère dans la zone centrale encadrée (35–65 %). Un seul essai.",
    sequence: "Suivez ces directions dans l'ordre avec les flèches ou les boutons tactiles. Une erreur termine l'essai.",
    observe: "Reproduisez la direction indiquée avec une flèche ou un bouton tactile. Un seul essai.",
    controls: "Lisez avant de commencer. Aucun chrono avant le départ. Masquer cet onglet ou recharger un défi commencé termine l'essai sans réussite.",
    benefits: "Réussir donne la récompense habituelle ou évite la pénalité. Échouer, dépasser le délai ou passer ne donne rien ou applique la pénalité habituelle. Les récits restent sans effet mécanique.",
    active: "Défi en cours", progress: "Étapes correctes", remaining: "Secondes restantes",
    reloaded: "Le défi commencé a été interrompu. Son issue sans réussite doit être enregistrée avant de continuer.",
    startSaveFailed: "Impossible d'enregistrer le début du défi.",
    resultSaveFailed: "Impossible d'enregistrer le résultat du défi.",
    directions: ["Gauche", "Haut", "Droite", "Bas"],
  },
};

export function mountEventChallenge(host, { event, language, begin, settle, onError = console.error }) {
  const doc = host.ownerDocument, view = doc.defaultView ?? globalThis;
  const c = COPY[language], root = doc.createElement("section");
  root.className = "event-qte";
  root.lang = language;
  root.tabIndex = -1;
  root.setAttribute("aria-label", c.title);
  host.append(root);
  let running = false, disposed = false, result, trace = [], startedAt, timer, rules;
  const buttons = [];
  function node(tag, value) {
    const element = doc.createElement(tag);
    if (value !== undefined) element.textContent = value;
    root.append(element);
    return element;
  }
  function button(label, callback) {
    const element = node("button", label);
    element.type = "button";
    element.setAttribute("data-shortcut-skip", "");
    element.addEventListener("click", callback);
    buttons.push(element);
    return element;
  }
  node("h3", c.title);
  node("p", QTE_PROMPTS[event.kind][language === "en" ? 0 : 1]);
  node("p", c.controls);
  node("p", c.benefits);
  const instruction = node("p", ""), target = node("p", "");
  target.className = "event-qte-target";
  const meter = node("div", "");
  meter.className = "event-qte-meter";
  meter.hidden = true;
  meter.setAttribute("aria-hidden", "true");
  const marker = doc.createElement("span");
  marker.className = "event-qte-marker";
  meter.append(marker);
  const status = node("p", "");
  status.setAttribute("role", "status");
  const start = button(c.start, () => launch("normal"));
  const relaxed = button(c.relaxed, () => launch("relaxed"));
  const actionButtons = QTE_KEYS.map((key, index) => {
    const element = button(c.directions[index], () => input(key));
    element.setAttribute("aria-keyshortcuts", key);
    element.hidden = true;
    return element;
  });
  const act = button(c.act, () => input("Space"));
  act.hidden = true;
  act.setAttribute("aria-keyshortcuts", "Space");
  const skip = button(c.skip, () => {
    if (!running && !launch("normal", true)) return;
    if (running) finish(true);
  });
  const retry = button(c.retry, saveResult);
  retry.hidden = true;
  function describe(challenge) {
    instruction.textContent = c[challenge.type];
    target.textContent = challenge.type === "timing" ? "35–65%" :
      challenge.keys.map(key => c.directions[QTE_KEYS.indexOf(key)]).join(" → ");
    meter.hidden = challenge.type !== "timing";
  }
  describe(eventChallenge(event, event.qte.mode ?? "normal"));
  function elapsed() { return Math.min(86400000, Math.max(0, view.performance.now() - startedAt)); }
  function error(reason) {
    onError(reason);
    status.textContent = reason.message;
    status.setAttribute("role", "alert");
  }
  function launch(mode, immediateSkip = false) {
    if (disposed || running || result || event.qte.status !== "ready") return false;
    try {
      if (begin(mode) !== true) throw new Error(c.startSaveFailed);
    } catch (reason) { error(reason); return false; }
    rules = eventChallenge(event, mode);
    running = true;
    startedAt = view.performance.now();
    start.hidden = relaxed.hidden = true;
    describe(rules);
    actionButtons.forEach(element => { element.hidden = rules.type === "timing"; });
    act.hidden = rules.type !== "timing";
    root.focus({ preventScroll: true });
    tick();
    if (!immediateSkip && running) timer = view.setInterval(tick, 50);
    return true;
  }
  function tick() {
    if (!running || disposed) return;
    const time = elapsed();
    if (rules.durationMs !== null && time >= rules.durationMs) { finish(); return; }
    if (rules.type === "timing") marker.style.left = `${time % 2000 / 20}%`;
    const text = `${c.active}. ${c.progress}: ${trace.length}/${rules.keys.length}` +
      (rules.durationMs === null ? "" : `. ${c.remaining}: ${Math.ceil((rules.durationMs - time) / 1000)}`);
    if (status.textContent !== text) status.textContent = text;
  }
  function input(key) {
    if (!running || disposed) return;
    const atMs = elapsed();
    if (rules.durationMs !== null && atMs >= rules.durationMs) { finish(); return; }
    trace.push({ key, atMs });
    if (rules.type === "timing" || key !== rules.keys[trace.length - 1] || trace.length === rules.keys.length) finish();
    else tick();
  }
  function finish(skipped = false) {
    if (!running || result) return;
    result = { trace: structuredClone(trace), elapsedMs: elapsed(), skipped };
    running = false;
    view.clearInterval(timer);
    buttons.forEach(element => { element.disabled = true; });
    saveResult();
  }
  function saveResult() {
    if (disposed || !result) return;
    try {
      if (settle(result) !== true) throw new Error(c.resultSaveFailed);
      retry.hidden = true;
    } catch (reason) { error(reason); retry.hidden = false; retry.disabled = false; }
  }
  function keydown(event) {
    if (!running || event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
        !["Space", " ", ...QTE_KEYS].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    input(event.key === " " ? "Space" : event.key);
  }
  function hidden() { if (doc.hidden && running) finish(); }
  root.addEventListener("keydown", keydown);
  doc.addEventListener("visibilitychange", hidden);
  if (event.qte.status === "active") {
    start.hidden = relaxed.hidden = skip.hidden = true;
    status.textContent = c.reloaded;
    result = { trace: [], elapsedMs: 6000, skipped: false };
    retry.hidden = false;
    // Saving is explicit: mounting a restored dialog must not mutate its journey.
    retry.textContent = c.retry;
  }
  return {
    destroy() {
      disposed = true;
      view.clearInterval(timer);
      root.removeEventListener("keydown", keydown);
      doc.removeEventListener("visibilitychange", hidden);
      root.remove();
    },
  };
}
