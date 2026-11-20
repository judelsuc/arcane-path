import { eventChallenge, challengeOutcome, REACTION_KEYS, QTE_LETTERS, QTE_PREPARATION_MS,
  eventInputKeys, reactionCue } from "./event-qte.mjs";
import { journeyEventArt } from "./journey-event-art.mjs";
import { eventQtePresentation, eventQteResult } from "./event-qte-copy.mjs";

const COPY = {
  en: {
    title: "React to the encounter", skip: "Skip challenge", retry: "Retry saving the result",
    retryStart: "Retry starting the encounter", act: "Space",
    help: "Help", close: "Resume", paused: "Paused",
    controls: "After three seconds of preparation, release all held keys. React as each key lights up: arrows or Space, plus A, F, J, P, V and N at high difficulty. You can also tap the matching button. One attempt.",
    preparing: "Get ready…", release: "Release held keys to begin.",
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
    controls: "Après trois secondes de préparation, relâchez toutes les touches. Réagissez à chaque touche illuminée : flèches ou Espace, et A, F, J, P, V et N en difficulté élevée. Vous pouvez aussi toucher le bouton correspondant. Un seul essai.",
    preparing: "Préparez-vous…", release: "Relâchez les touches pour commencer.",
    timing: "Appuyez sur Espace quand le repère atteint la zone centrale encadrée.",
    waiting: "Surveillez les touches…", now: "Maintenant :", progress: "Signaux", finished: "Essai terminé.",
    benefits: "Réussir donne la récompense ou évite la pénalité. Échouer ou passer ne donne rien ou applique la pénalité habituelle. Les récits restent sans effet mécanique.",
    reloaded: "Le défi interrompu doit être enregistré sans réussite avant de continuer.",
    startSaveFailed: "Impossible d'enregistrer le début du défi.", resultSaveFailed: "Impossible d'enregistrer le résultat du défi.",
    directions: ["Gauche", "Haut", "Droite", "Bas"],
  },
};

function inputKey(key) {
  return key === " " ? "Space" : key?.length === 1 ? key.toLowerCase() : key;
}

const TRACKED_KEYS = new Set([...REACTION_KEYS, ...QTE_LETTERS]);
export const QTE_HELD_STALE_MS = 2500;

// Tracks which challenge keys are physically held. keyup events can be lost
// (OS shortcuts swallow them, focus moves away), so entries expire unless the
// key's auto-repeat keeps refreshing them; a stale phantom key must never
// block the challenge with "release held keys".
export function trackEventQteKeys(doc, now = () => Date.now()) {
  const held = new Map();
  const prune = () => {
    for (const [key, seenAt] of held) if (now() - seenAt > QTE_HELD_STALE_MS) held.delete(key);
  };
  const tracker = {
    add(key) {
      if (TRACKED_KEYS.has(key)) held.set(key, now());
    },
    delete(key) { held.delete(key); },
    clear() { held.clear(); },
    has(key) { prune(); return held.has(key); },
    get size() { prune(); return held.size; },
  };
  doc.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    tracker.add(inputKey(event.key));
  }, true);
  doc.addEventListener("keyup", event => held.delete(inputKey(event.key)), true);
  doc.defaultView?.addEventListener("blur", () => held.clear());
  return tracker;
}

export function mountEventChallenge(host, { event, language, begin, settle, illustration,
  heldKeys = new Set(), audio, presentation = eventQtePresentation(event, language),
  outcomeText = outcome => eventQteResult(event, language, outcome),
  backdrop = journeyEventArt(event.kind), onError = console.error }) {
  const doc = host.ownerDocument, view = doc.defaultView ?? globalThis, c = COPY[language];
  const root = doc.createElement("section");
  root.className = "event-qte";
  root.lang = language;
  root.tabIndex = -1;
  root.setAttribute("aria-label", c.title);
  host.append(root);
  let running = false, disposed = false, result, trace = [], startedAt, timer, rules, pausedAt;
  let preparing = true, readyAt, lastCue;
  const sound = kind => void audio?.play(kind);
  const buttons = [];
  function node(tag, value, parent = root) {
    const element = doc.createElement(tag);
    if (value !== undefined) element.textContent = value;
    parent.append(element);
    return element;
  }
  function button(label, callback, parent) {
    const element = node("button", label, parent);
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
  art.textContent = backdrop;
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
  // Prompt, meter and reaction keys live together so the running challenge can
  // overlay them front and centre on the screen, Shenmue-style.
  const prompt = node("div");
  prompt.className = "event-qte-prompt";
  const target = node("p", c.waiting, prompt);
  target.className = "event-qte-target";
  target.setAttribute("aria-live", "assertive");
  const meter = node("div", "", prompt);
  meter.className = "event-qte-meter";
  meter.hidden = true;
  meter.setAttribute("aria-hidden", "true");
  const marker = doc.createElement("span");
  marker.className = "event-qte-marker";
  meter.append(marker);
  const keys = eventInputKeys(event);
  const labels = [...c.directions, c.act, ...QTE_LETTERS.map(key => key.toUpperCase())];
  const symbols = ["←", "↑", "→", "↓", "␣", ...QTE_LETTERS.map(key => key.toUpperCase())];
  const actionButtons = keys.map((key, index) => {
    const element = button(index < REACTION_KEYS.length ? `${symbols[index]} ${labels[index]}` : labels[index],
      () => input(key), prompt);
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
      const pause = view.performance.now() - pausedAt;
      startedAt += pause;
      readyAt += pause;
      pausedAt = undefined;
      tick();
      root.focus({ preventScroll: true });
    } else if (!running && !result) launch();
  }
  function elapsed() { return preparing ? 0 :
    Math.min(86400000, Math.max(0, (pausedAt ?? view.performance.now()) - startedAt)); }
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
    root.setAttribute("data-live", "true");
    startedAt = view.performance.now();
    readyAt = startedAt + QTE_PREPARATION_MS;
    retryStart.hidden = true;
    meter.hidden = rules.type !== "timing";
    root.focus({ preventScroll: true });
    tick();
    if (running) timer = view.setInterval(tick, 25);
  }
  function tick() {
    if (!running || disposed) return;
    if (pausedAt !== undefined) { status.textContent = c.paused; return; }
    if (preparing) {
      const remaining = readyAt - view.performance.now();
      // A lost keyup must never block the start: waiting on held keys is
      // capped, and the challenge begins on its own once the window passes.
      if (remaining > 0 || heldKeys.size && view.performance.now() - readyAt < QTE_HELD_STALE_MS) {
        target.textContent = remaining > 0 ? `${c.preparing} ${Math.ceil(remaining / 1000)}` : c.release;
        status.textContent = "";
        return;
      }
      preparing = false;
      startedAt = view.performance.now();
      actionButtons.forEach(element => { element.disabled = false; });
      sound("go");
    }
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
      element.setAttribute("aria-pressed", String(keys[index] === key));
    });
    // A new lit cue gets a blip; steps can repeat the same key, so cue
    // identity follows progress rather than the key value.
    const cue = key === undefined ? undefined :
      rules.type === "timing" ? `zone:${Math.floor(time / 2000)}` : `step:${trace.length}`;
    if (cue !== lastCue) {
      lastCue = cue;
      if (key) sound("cue");
    }
    target.textContent = rules.type === "timing" ? c.timing :
      key ? `${c.now} ${labels[keys.indexOf(key)]}` : c.waiting;
    status.textContent = `${c.progress}: ${trace.length}/${rules.keys.length}`;
  }
  function input(key) {
    if (!running || disposed || preparing || pausedAt !== undefined) return;
    const atMs = elapsed();
    if (rules.durationMs !== null && atMs >= rules.durationMs) { finish(); return; }
    trace.push({ key, atMs });
    const index = trace.length - 1;
    const cue = rules.type === "reaction" ? reactionCue(rules, index) : null;
    const correct = rules.type !== "timing" && key === rules.keys[index] &&
      (!cue || atMs >= cue.startMs && atMs < cue.endMs);
    if (correct) sound("hit");
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
    root.setAttribute("data-live", "false");
    view.clearInterval(timer);
    buttons.forEach(element => { element.disabled = true; });
    helpButton.disabled = false;
    actionButtons.forEach(element => element.setAttribute("aria-pressed", "false"));
    target.textContent = c.finished;
    status.textContent = `${c.progress}: ${trace.length}/${rules.keys.length}`;
    const outcome = challengeOutcome(event, rules.mode, result.trace, result.elapsedMs, skipped);
    if (["success", "failure"].includes(outcome)) sound(outcome);
    narrativeResult.textContent = outcomeText(outcome);
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
    const key = inputKey(event.key);
    if (key && !event.altKey && !event.ctrlKey && !event.metaKey && keys.includes(key)) heldKeys.add(key);
    if (!running || help.open || event.target?.tagName === "BUTTON" && event.target.className !== "event-qte-key" ||
        event.altKey || event.ctrlKey || event.metaKey ||
        !keys.includes(key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    input(key);
  }
  function visibility() {
    if (doc.hidden && running) finish();
    else if (!doc.hidden && !running && !result) launch();
  }
  root.addEventListener("keydown", keydown);
  const keyup = event => heldKeys.delete(inputKey(event.key));
  doc.addEventListener("keyup", keyup);
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
      audio?.stop?.();
      if (help.open) help.close();
      view.clearInterval(timer);
      root.removeEventListener("keydown", keydown);
      doc.removeEventListener("keyup", keyup);
      doc.removeEventListener("visibilitychange", visibility);
      root.remove();
    },
  };
}
