import { createGame, difficulty, input, advance, result, PARTS, COLOURS, samePart } from "./workshop.mjs";
import { bikeIllustration } from "./workshop-art.mjs";
import { resolveResonance, decorateResonance } from "../arcane-resonance.mjs";

const TEXT = {
  en: {
    title: "Build the model bike", intro: "Match the assembled reference bike before time runs out. The model stays visible. Choose each part, then select the same colour AND size. You can replace a part as often as you like; press Check bike when ready.",
    controls: "Click/touch the illustrated choices, or use Tab and Enter/Space. Keys 1–6 select a part category. Escape cancels. Hiding this tab cancels the round.",
    model: "Model to reproduce", yours: "Your bicycle", shelf: "Parts shelf", start: "Start building",
    cancel: "Cancel", submit: "Check bike", level: "Level", options: "choices per part",
    seconds: "seconds", remaining: "Time left", installed: "Parts installed", empty: "Not fitted",
    completed: "Perfect match — bicycle completed!", failed: "Time is up!",
    cancelled: "Round cancelled — no reward.", incomplete: "Fit all six parts before checking.",
    mismatch: "Not quite! Compare these parts with the model:", changed: "Part fitted. Compare both colour and size.",
    matched: "Every part matches the model!", ready: "Ready to build?", error: "Workshop error — round cancelled.",
    parts: { frame: "Frame", rearWheel: "Rear wheel", frontWheel: "Front wheel", seat: "Seat", pedals: "Pedals", handlebars: "Handlebars" },
    colours: { red: "Red", blue: "Blue", gold: "Gold", green: "Green" },
    sizes: { small: "Small", medium: "Medium", large: "Large" },
  },
  fr: {
    title: "Reconstituez le vélo modèle", intro: "Reproduisez le vélo assemblé avant la fin du temps. Le modèle reste visible. Choisissez chaque pièce, puis la même couleur ET la même taille. Vous pouvez remplacer les pièces autant que nécessaire ; validez avec Vérifier le vélo.",
    controls: "Cliquez/touchez les choix illustrés, ou utilisez Tab et Entrée/Espace. Les touches 1–6 sélectionnent une catégorie. Échap annule. Masquer cet onglet annule la partie.",
    model: "Modèle à reproduire", yours: "Votre vélo", shelf: "Étagère de pièces", start: "Commencer",
    cancel: "Annuler", submit: "Vérifier le vélo", level: "Niveau", options: "choix par pièce",
    seconds: "secondes", remaining: "Temps restant", installed: "Pièces montées", empty: "Non montée",
    completed: "Copie parfaite — vélo terminé !", failed: "Temps écoulé !",
    cancelled: "Partie annulée — aucune récompense.", incomplete: "Montez les six pièces avant de vérifier.",
    mismatch: "Pas tout à fait ! Comparez ces pièces avec le modèle :", changed: "Pièce montée. Comparez couleur et taille.",
    matched: "Toutes les pièces correspondent au modèle !", ready: "Prêt à construire ?", error: "Erreur de l’atelier — partie annulée.",
    parts: { frame: "Cadre", rearWheel: "Roue arrière", frontWheel: "Roue avant", seat: "Selle", pedals: "Pédales", handlebars: "Guidon" },
    colours: { red: "Rouge", blue: "Bleu", gold: "Doré", green: "Vert" },
    sizes: { small: "Petite", medium: "Moyenne", large: "Grande" },
  },
};

export function mount(container, { level = 0, language = "fr", onFinish, audio, ...options } = {}) {
  const resonance = resolveResonance("workshop", options);
  if (!container?.ownerDocument || typeof container.append !== "function" ||
      (onFinish !== undefined && typeof onFinish !== "function")) throw new TypeError("Invalid workshop mount options.");
  const rules = difficulty(level), text = TEXT[language] ?? TEXT.fr;
  const doc = container.ownerDocument, view = doc.defaultView ?? globalThis;
  const now = () => view.performance.now();
  let game = createGame({ level, now: now(), ...options }), activePart = PARTS[0], timer, finished = false, destroyed = false;
  const removers = [], categories = new Map();
  const root = doc.createElement("section");
  root.lang = TEXT[language] ? language : "fr";
  root.tabIndex = 0;
  root.setAttribute("aria-label", text.title);
  container.append(root);
  function node(tag, content, className, parent = root) {
    const element = doc.createElement(tag);
    if (content !== undefined) element.textContent = content;
    if (className) element.className = className;
    parent.append(element);
    return element;
  }
  function listen(element, type, handler) {
    element.addEventListener(type, handler);
    removers.push(() => element.removeEventListener(type, handler));
  }
  function button(label, action, parent = root) {
    const element = node("button", label, undefined, parent);
    element.type = "button";
    element.dataset.action = action;
    return element;
  }
  const description = value => `${text.colours[value.colour]} · ${text.sizes[value.size]}`;
  const bikeDescription = (label, assembly) => `${label}. ${PARTS.map(part =>
    `${text.parts[part]}: ${assembly[part] ? description(assembly[part]) : text.empty}`).join("; ")}`;
  node("h2", text.title);
  node("p", text.intro, "game-help-text");
  node("p", text.controls, "game-help-text");
  if (resonance) node("p", language === "en"
    ? "Magician: one part has no exact match. You can repaint ANY fitted part with the palette. Painting changes colour, never size; compare your bike with the visible model."
    : "Bateleur : une pièce n’a pas de copie exacte. Vous pouvez repeindre TOUTE pièce montée avec la palette. La peinture change la couleur, jamais la taille ; comparez votre vélo au modèle visible.", "game-help-text");
  node("p", `${text.level} ${level} · ${rules.options} ${text.options} · ${rules.timeMs / 1000} ${text.seconds}`, "game-help-text");
  const countdown = node("p", "", "workshop-countdown");
  countdown.setAttribute("role", "timer");
  const progress = node("p", "", "workshop-progress");
  const scene = node("div", undefined, "workshop-bikes");
  function bikePanel(title, className) {
    const panel = node("div", undefined, `workshop-bike-panel ${className}`, scene);
    node("h3", title, undefined, panel);
    return node("div", undefined, "workshop-bike-drawing", panel);
  }
  const modelDrawing = bikePanel(text.model, "workshop-model");
  modelDrawing.append(bikeIllustration(doc, game.model, bikeDescription(text.model, game.model)));
  const yourDrawing = bikePanel(text.yours, "workshop-assembly");
  const feedback = node("p", text.ready, "workshop-feedback");
  feedback.setAttribute("role", "status");
  const start = button(text.start, "start");
  const shelf = node("div", undefined, "workshop-shelf");
  shelf.hidden = true;
  node("h3", text.shelf, undefined, shelf);
  const categoryRow = node("div", undefined, "workshop-categories", shelf);
  PARTS.forEach((part, index) => {
    const element = button(`${index + 1}. ${text.parts[part]}`, "category", categoryRow);
    element.dataset.part = part;
    categories.set(part, element);
  });
  const choicesHeading = node("h4", "", undefined, shelf);
  const choices = node("div", undefined, "workshop-choices", shelf);
  const palette = node("div", undefined, "workshop-palette", shelf);
  const paints = resonance ? COLOURS.map(colour => {
    const paint = button(text.colours[colour], "repaint", palette);
    paint.dataset.colour = colour;
    return paint;
  }) : [];
  const submit = button(text.submit, "submit", shelf);
  const cancel = button(text.cancel, "cancel");
  function updateTimer() {
    const left = game.startedAt === null ? rules.timeMs : Math.max(0, rules.timeMs - (game.now - game.startedAt));
    countdown.textContent = `${text.remaining}: ${Math.ceil(left / 1000)} s`;
    countdown.dataset.urgent = String(left <= 10000);
  }
  function refreshChoices(focusChoice) {
    palette.hidden = !resonance;
    paints.forEach(paint => {
      paint.disabled = game.status !== "playing" ||
        !game.selected[activePart];
      paint.setAttribute("aria-pressed", String(game.selected[activePart]?.colour === paint.dataset.colour));
    });
    const nodes = game.choices[activePart].map((value, index) => {
      const element = doc.createElement("button");
      element.type = "button";
      element.dataset.action = "choose";
      element.dataset.part = activePart;
      element.dataset.choice = String(index);
      element.setAttribute("aria-pressed", String(samePart(value, game.selected[activePart])));
      element.setAttribute("aria-label", `${text.parts[activePart]}: ${description(value)}`);
      if (activePart === game.repaintPart && value.size === game.model[activePart].size) {
        const label = language === "en" ? "Repaintable" : "À repeindre";
        element.setAttribute("aria-label", `${text.parts[activePart]}: ${description(value)} — ${label}`);
        node("span", label, "workshop-repaintable", element);
      }
      element.disabled = game.status !== "playing";
      element.append(bikeIllustration(doc, { [activePart]: value }, description(value), { part: activePart }));
      node("span", description(value), undefined, element);
      return element;
    });
    choices.replaceChildren(...nodes);
    if (focusChoice !== undefined) nodes[focusChoice]?.focus({ preventScroll: true });
    choicesHeading.textContent = `${text.parts[activePart]} — ${game.selected[activePart]
      ? description(game.selected[activePart]) : text.empty}`;
    categories.forEach((element, part) => {
      element.setAttribute("aria-pressed", String(part === activePart));
      element.dataset.fitted = String(game.selected[part] !== null);
    });
  }
  function refreshBike() {
    yourDrawing.replaceChildren(bikeIllustration(doc, game.selected, bikeDescription(text.yours, game.selected)));
    const count = PARTS.filter(part => game.selected[part] !== null).length;
    progress.textContent = `${text.installed}: ${count}/${PARTS.length}`;
    submit.disabled = count < PARTS.length || game.status !== "playing";
  }
  function cleanup() {
    view.clearInterval(timer);
    timer = undefined;
    removers.splice(0).forEach(remove => remove());
  }
  function finish() {
    if (finished || ["ready", "playing"].includes(game.status)) return;
    finished = true;
    cleanup();
    if (game.status === "cancelled") audio?.stop();
    else void audio?.play(game.status === "completed" ? "success" : "caught");
    updateTimer();
    feedback.textContent = text[game.status];
    start.disabled = cancel.disabled = submit.disabled = true;
    categories.forEach(element => { element.disabled = true; });
    refreshChoices();
    onFinish?.(result(game));
  }
  function fail(reason) {
    console.error("Workshop action failed:", reason);
    game = input(game, { type: "cancel" }, game.now);
    finish();
    feedback.textContent = `${text.error} ${reason.message}`;
    feedback.setAttribute("role", "alert");
  }
  function act(action, focusChoice) {
    if (finished || destroyed) return;
    try {
      const previous = game;
      game = input(game, action, now());
      updateTimer();
      if (game.status === "playing" && previous.status === "ready") {
        start.hidden = true;
        shelf.hidden = false;
        timer = view.setInterval(tick, 100);
      }
      refreshBike();
      refreshChoices(focusChoice);
      if (game.feedback === "mismatch") {
        const wrong = PARTS.filter(part => !samePart(game.selected[part], game.model[part]));
        feedback.textContent = `${text.mismatch} ${wrong.map(part => text.parts[part]).join("; ")}.`;
      } else feedback.textContent = text[game.feedback] ?? text.ready;
      if (game.status === "playing") {
        if (action.type === "choose" && !samePart(previous.selected[action.part], game.selected[action.part])) {
          void audio?.play("success");
        } else if (action.type === "submit" && ["incomplete", "mismatch"].includes(game.feedback)) {
          void audio?.play("caught");
        }
      }
      finish();
    } catch (reason) { fail(reason); }
  }
  function tick() {
    if (finished || destroyed) return;
    if (doc.hidden) return act({ type: "cancel" });
    try { game = advance(game, now()); }
    catch (reason) { fail(reason); return; }
    updateTimer();
    finish();
  }
  listen(root, "click", event => {
    const target = event.target.closest?.("button");
    if (!target || !root.contains(target) || target.disabled) return;
    const action = target.dataset.action;
    if (doc.hidden && action === "start") return;
    if (doc.hidden && game.status === "playing") return act({ type: "cancel" });
    if (action === "category" && game.status === "playing") {
      activePart = target.dataset.part;
      refreshChoices();
    } else if (action === "choose") {
      const choice = Number(target.dataset.choice);
      act({ type: "choose", part: target.dataset.part, choice }, choice);
    } else if (action === "repaint") act({ type: "repaint", part: activePart, colour: target.dataset.colour });
    else if (["start", "submit", "cancel"].includes(action)) act({ type: action });
  });
  listen(root, "keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (event.key === "Escape") { event.preventDefault(); act({ type: "cancel" }); }
    else if (game.status === "playing") {
      const digit = /^(Digit|Numpad)[1-6]$/.test(event.code ?? "") ? event.code.slice(-1) : event.key;
      if (/^[1-6]$/.test(digit)) {
        event.preventDefault();
        activePart = PARTS[Number(digit) - 1];
        refreshChoices();
        categories.get(activePart).focus({ preventScroll: true });
      }
    }
  });
  listen(doc, "visibilitychange", () => { if (doc.hidden && game.status === "playing") act({ type: "cancel" }); });
  if (doc.defaultView) listen(view, "pagehide", () => act({ type: "cancel" }));
  updateTimer();
  refreshBike();
  refreshChoices();
  decorateResonance(root, "workshop", resonance, language);
  return { destroy() {
    if (destroyed) return;
    destroyed = true;
    try {
      if (!finished) {
        game = input(game, { type: "cancel" }, game.now);
        cleanup();
        root.remove();
        finish();
      }
    } finally { cleanup(); audio?.stop(); if (root.parentNode) root.remove(); }
  } };
}
