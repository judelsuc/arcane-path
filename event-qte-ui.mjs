import { eventChallenge, challengeOutcome, QTE_KEYS, REACTION_KEYS, reactionCue } from "./event-qte.mjs";
import { journeyEventArt } from "./journey-event-art.mjs";
import { eventQtePresentation, eventQteResult } from "./event-qte-copy.mjs";

const COPY = {
  en: {
    title: "React to the encounter", skip: "Skip challenge", retry: "Retry saving the result",
    retryStart: "Retry starting the encounter", act: "Space",
    help: "Help", close: "Resume", paused: "Paused",
    controls: "React as each key lights up. Arrow keys or Space; you can also tap the matching button. One attempt.",
    timing: "Press Space when the marker reaches the outlined middle zone.",
    waiting: "Watch the keys…", now: "Now:", progress: "Signals", finished: "Attempt finished.",
    benefits: "Success earns the reward or avoids the penalty. Failure or skipping gives no reward or the normal penalty. Story events remain mechanically neutral.",
    reloaded: "The interrupted challenge must be saved as unsuccessful before continuing.",
    startSaveFailed: "Unable to save the challenge start.", resultSaveFailed: "Unable to save the challenge result.",
    directions: ["Left", "Up", "Right", "Down"],
  },
  fr: {
    title: "Réagir à la rencontre", skip: "Passer le défi", retry: "Réessayer d'enregistrer le résultat",
    retryStart: "Réessayer de lancer la rencontre", act: "Espace",
    help: "Aide", close: "Reprendre", paused: "En pause",
    controls: "Réagissez à chaque touche illuminée : flèches ou Espace, ou touchez le bouton correspondant. Un seul essai.",
    timing: "Appuyez sur Espace quand le repère atteint la zone centrale encadrée.",
    waiting: "Surveillez les touches…", now: "Maintenant :", progress: "Signaux", finished: "Essai terminé.",
    benefits: "Réussir donne la récompense ou évite la pénalité. Échouer ou passer ne donne rien ou applique la pénalité habituelle. Les récits restent sans effet mécanique.",
    reloaded: "Le défi interrompu doit être enregistré sans réussite avant de continuer.",
    startSaveFailed: "Impossible d'enregistrer le début du défi.", resultSaveFailed: "Impossible d'enregistrer le résultat du défi.",
    directions: ["Gauche", "Haut", "Droite", "Bas"],
  },
};

export function mountEventChallenge(host, { event, language, begin, settle, illustration, onError = console.error }) {
  const doc = host.ownerDocument, view = doc.defaultView ?? globalThis, c = COPY[language];
  const presentation = eventQtePresentation(event, language);
  const root = doc.createElement("section");
  root.className = "event-qte";
  root.lang = language;
  root.tabIndex = -1;
  root.setAttribute("aria-label", c.title);
  host.append(root);
  let running = false, disposed = false, result, trace = [], startedAt, timer, rules, pausedAt;
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
  const scene = node("div");
  scene.className = "event-qte-scene";
  if (illustration) {
    illustration.className = "event-qte-illustration";
    scene.append(illustration);
  }
  const art = doc.createElement("pre");
  art.textContent = journeyEventArt(event.kind);
  scene.append(art);
  art.className = "event-qte-backdrop";
  art.setAttribute("aria-hidden", "true");
  const story = node("p", "");
  story.className = "event-qte-story";
  story.hidden = true;
  const action = node("p", presentation.action);
  action.className = "event-qte-action";
  const dialogue = node("ol");
  dialogue.className = "event-qte-dialogue";
  dialogue.hidden = !presentation.social;
  dialogue.setAttribute("aria-live", "polite");
  const narrativeResult = node("p", "");
  narrativeResult.className = "event-qte-result";
  narrativeResult.setAttribute("role", "status");
  const target = node("p", c.waiting);
  target.className = "event-qte-target";
  target.setAttribute("aria-live", "assertive");
  const meter = node("div", "");
  meter.className = "event-qte-meter";
  meter.hidden = true;
  meter.setAttribute("aria-hidden", "true");
  const marker = doc.createElement("span");
  marker.className = "event-qte-marker";
  meter.append(marker);
  const labels = [...c.directions, c.act], symbols = ["←", "↑", "→", "↓", "␣"];
  const actionButtons = REACTION_KEYS.map((key, index) => {
    const element = button(`${symbols[index]} ${labels[index]}`, () => input(key));
    element.className = "event-qte-key";
    element.setAttribute("aria-keyshortcuts", key);
    element.setAttribute("aria-pressed", "false");
    element.disabled = true;
    return element;
  });
  const status = node("p", "");
  status.setAttribute("role", "status");
  button(c.skip, () => { if (running) finish(true); });
  const retryStart = button(c.retryStart, launch);
  retryStart.hidden = true;
  const retry = button(c.retry, saveResult);
  retry.hidden = true;
  const helpButton = button(c.help, openHelp);
  const help = node("dialog");
  help.className = "event-qte-help";
  help.setAttribute("aria-label", c.help);
  for (const text of [c.controls, c.benefits]) {
    const paragraph = doc.createElement("p");
    paragraph.textContent = text;
    help.append(paragraph);
  }
  const details = doc.createElement("p");
  help.append(details);
  const closeHelp = doc.createElement("button");
  closeHelp.type = "button";
  closeHelp.textContent = c.close;
  closeHelp.setAttribute("data-shortcut-skip", "");
  closeHelp.addEventListener("click", () => { help.close(); resume(); });
  help.append(closeHelp);
  help.addEventListener("close", resume);
  function openHelp() {
    if (disposed || help.open) return;
    if (running) pausedAt = view.performance.now();
    help.showModal();
    if (running) status.textContent = c.paused;
  }
  function resume() {
    if (disposed) return;
    if (pausedAt !== undefined) {
      startedAt += view.performance.now() - pausedAt;
      pausedAt = undefined;
      tick();
      root.focus({ preventScroll: true });
    } else if (!running && !result) launch();
  }
  function elapsed() { return Math.min(86400000, Math.max(0, (pausedAt ?? view.performance.now()) - startedAt)); }
  function error(reason) {
    onError(reason);
    status.textContent = reason.message;
    status.setAttribute("role", "alert");
  }
  function launch() {
    if (disposed || running || result || doc.hidden || help.open || event.qte.status !== "ready") return;
    rules = eventChallenge(event, event.qte.mode ?? "normal");
    try {
      if (begin(rules.mode) !== true) throw new Error(c.startSaveFailed);
    } catch (reason) { error(reason); retryStart.hidden = false; return; }
    if (disposed) return;
    running = true;
    startedAt = view.performance.now();
    retryStart.hidden = true;
    actionButtons.forEach(element => { element.disabled = false; });
    meter.hidden = rules.type !== "timing";
    root.focus({ preventScroll: true });
    tick();
    if (running) timer = view.setInterval(tick, 25);
  }
  function tick() {
    if (!running || disposed) return;
    if (pausedAt !== undefined) { status.textContent = c.paused; return; }
    const time = elapsed();
    if (rules.durationMs !== null && time >= rules.durationMs ||
        rules.type === "reaction" && time >= reactionCue(rules, trace.length).endMs) { finish(); return; }
    let key;
    if (rules.type === "reaction") {
      if (time >= reactionCue(rules, trace.length).startMs) key = rules.keys[trace.length];
    } else if (rules.type === "timing") {
      marker.style.left = `${time % 2000 / 20}%`;
      if (time % 2000 >= 700 && time % 2000 <= 1300) key = "Space";
    } else key = rules.keys[trace.length];
    actionButtons.forEach((element, index) => {
      element.setAttribute("aria-pressed", String(REACTION_KEYS[index] === key));
    });
    target.textContent = rules.type === "timing" ? c.timing :
      key ? `${c.now} ${labels[REACTION_KEYS.indexOf(key)]}` : c.waiting;
    status.textContent = `${c.progress}: ${trace.length}/${rules.keys.length}`;
  }
  function input(key) {
    if (!running || disposed || pausedAt !== undefined) return;
    const atMs = elapsed();
    if (rules.durationMs !== null && atMs >= rules.durationMs) { finish(); return; }
    trace.push({ key, atMs });
    const index = trace.length - 1;
    const cue = rules.type === "reaction" ? reactionCue(rules, index) : null;
    const correct = rules.type !== "timing" && key === rules.keys[index] &&
      (!cue || atMs >= cue.startMs && atMs < cue.endMs);
    if (correct && presentation.social) {
      const line = doc.createElement("li");
      line.textContent = presentation.lines[index];
      dialogue.append(line);
    }
    if (rules.type === "timing" || !correct || trace.length === rules.keys.length) finish();
    else tick();
  }
  function finish(skipped = false) {
    if (!running || result) return;
    result = { trace: structuredClone(trace), elapsedMs: elapsed(), skipped };
    running = false;
    view.clearInterval(timer);
    buttons.forEach(element => { element.disabled = true; });
    helpButton.disabled = false;
    actionButtons.forEach(element => element.setAttribute("aria-pressed", "false"));
    target.textContent = c.finished;
    status.textContent = `${c.progress}: ${trace.length}/${rules.keys.length}`;
    narrativeResult.textContent = eventQteResult(event, language,
      challengeOutcome(event, rules.mode, result.trace, result.elapsedMs, skipped));
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
    if (!running || help.open || event.target?.tagName === "BUTTON" && event.target.className !== "event-qte-key" ||
        event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
        !["Space", " ", ...QTE_KEYS].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    input(event.key === " " ? "Space" : event.key);
  }
  function visibility() {
    if (doc.hidden && running) finish();
    else if (!doc.hidden && !running && !result) launch();
  }
  root.addEventListener("keydown", keydown);
  doc.addEventListener("visibilitychange", visibility);
  if (event.qte.status === "active") {
    status.textContent = c.reloaded;
    result = { trace: [], elapsedMs: eventChallenge(event, event.qte.mode).durationMs ?? 6000, skipped: false };
    retry.hidden = false;
  } else queueMicrotask(launch);
  return {
    updatePresentation({ text, imageReady = false, helpText = "" }) {
      if (disposed) return;
      if (text) {
        story.textContent = text;
        story.hidden = text.trim() === presentation.action;
      }
      art.hidden = imageReady;
      details.textContent = helpText;
    },
    destroy() {
      disposed = true;
      if (help.open) help.close();
      view.clearInterval(timer);
      root.removeEventListener("keydown", keydown);
      doc.removeEventListener("visibilitychange", visibility);
      root.remove();
    },
  };
}
