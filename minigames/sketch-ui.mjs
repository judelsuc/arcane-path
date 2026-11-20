import { advance, createGame, input, result, constellation, INK, tessellatePhoto, difficulty } from "./sketch.mjs";
import { resolveResonance, decorateResonance } from "../arcane-resonance.mjs";

const COPY = {
  fr: {
    title: "Croquis de carte postale", start: "Commencer", remember: "Dessiner maintenant",
    submit: "Terminer le croquis", clear: "Effacer", cancel: "Annuler",
    instructions: "Observez puis reproduisez les cases et leurs couleurs de mémoire. Choisissez une couleur puis cliquez les cases ; un second clic de même couleur efface. Tab et les flèches déplacent le focus, Espace ou Entrée peint une case. Échap annule. Le dessin est sans limite de temps.",
    fiction: "Motifs ASCII originaux et imaginaires : ni photos, ni représentation du lieu réel.",
    photoSource: "Motif tramé d’après une photo locale : {credit}.",
    photoReveal: "Photo d’origine",
    ready: "Prêt. Le modèle ne sera montré qu’après votre départ.",
    observe: "Mémorisez le motif. Il disparaîtra après {seconds} secondes ; vous pouvez commencer à dessiner plus tôt.",
    draw: "Reproduisez le motif caché et ses couleurs. Un point par case bien colorée, moins un par case incorrecte ; minimum zéro.",
    cancelled: "Croquis annulé. Aucune récompense.",
    score: "Score : {score}/{max}.", errors: "Cases différentes : {count}.",
    grid: "Grille de dessin, {size} lignes et {size} colonnes", row: "Ligne {row}",
    cell: "Ligne {row}, colonne {col}", model: "Modèle : point vide, # vert, O rouge, + bleu, * violet.",
    output: "Votre croquis imaginaire", reference: "Modèle",
    settings: "Niveau {level} : grille {size}×{size}, {colours} couleur(s), {seconds} secondes d’observation.",
    palette: "Couleurs", inks: ["Gomme", "Vert", "Rouge", "Bleu", "Violet"],
  },
  en: {
    title: "Postcard sketch", start: "Start", remember: "Draw now",
    submit: "Finish sketch", clear: "Clear", cancel: "Cancel",
    instructions: "Observe, then reproduce the squares and their colours from memory. Choose a colour, then click squares; clicking the same colour again erases it. Tab and arrows move focus, Space or Enter paints a square. Escape cancels. Drawing has no time limit.",
    fiction: "Original imaginary ASCII motifs: not photos or a depiction of the real location.",
    photoSource: "Motif tessellated from a local photo: {credit}.",
    photoReveal: "Original photo",
    ready: "Ready. The model appears only after you start.",
    observe: "Memorize the motif. It disappears after {seconds} seconds; you can start drawing earlier.",
    draw: "Reproduce the hidden motif and its colours. One point per correctly coloured square, minus one per incorrect painted square; minimum zero.",
    cancelled: "Sketch cancelled. No reward.",
    score: "Score: {score}/{max}.", errors: "Different squares: {count}.",
    grid: "Drawing grid, {size} rows and {size} columns", row: "Row {row}",
    cell: "Row {row}, column {col}", model: "Model: dot empty, # green, O red, + blue, * purple.",
    output: "Your imaginary sketch", reference: "Model",
    settings: "Level {level}: {size}×{size} grid, {colours} colour(s), {seconds} seconds to observe.",
    palette: "Colours", inks: ["Eraser", "Green", "Red", "Blue", "Purple"],
  },
};

/**
 * Standalone, intentionally not activated in the app. The caller must gate with available(cell).
 * No persistence or reward issuance. Individual playtest approval is required before activation.
 */
export function mount(container, { level = 0, language = "fr", onFinish, photo, ...options } = {}) {
  const resonance = resolveResonance("sketch", options);
  if (!container?.ownerDocument || typeof container.append !== "function")
    throw new TypeError("A DOM container is required");
  if (onFinish !== undefined && typeof onFinish !== "function") throw new TypeError("Invalid onFinish");
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const copy = COPY[language === "en" ? "en" : "fr"];
  const t = (key, values = {}) => copy[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name]));
  const clock = () => Math.floor(win.performance.now());
  let game = createGame({ level, now: clock(), ...options });
  let selectedColour = 1;
  let timer = null, observer = null, finished = false, destroyed = false;
  // While a photo model may still arrive, Start waits briefly so a quick
  // replay cannot race past the tessellated photo into the fallback motif.
  let modelPending = typeof photo === "function", modelTimer = null;
  const listeners = [];
  const listen = (node, type, handler) => {
    node.addEventListener(type, handler);
    listeners.push(() => node.removeEventListener(type, handler));
  };
  const element = (tag, text, parent) => {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    if (parent) parent.append(node);
    return node;
  };
  const root = element("section");
  root.lang = language === "en" ? "en" : "fr";
  root.setAttribute("aria-label", t("title"));
  element("h2", t("title"), root);
  element("p", t("instructions"), root).className = "game-help-text";
  if (resonance) {
    element("p", language === "en"
      ? "Star: three occupied landmarks sparkle while you observe. Faint stars remember only their positions while drawing, never their colours. Correctly coloured landmarks connect into a constellation."
      : "Étoile : trois repères occupés scintillent pendant l’observation. Des étoiles pâles gardent seulement leur position pendant le dessin, jamais leur couleur. Les repères bien colorés se relient en constellation.", root).className = "game-help-text";
    element("style", "@keyframes sketch-sparkle{50%{opacity:.3}}.sketch-landmark{position:relative}.sketch-landmark::after{content:'✦';position:absolute;right:0;top:-.5em;color:#ab9469;animation:sketch-sparkle 1.4s infinite}.sketch-star{position:absolute;right:2px;top:0;color:#ab9469;opacity:.45;pointer-events:none}@media(prefers-reduced-motion:reduce){.sketch-landmark::after{animation:none}}", root);
  }
  element("p", t("fiction"), root).className = "game-help-text";
  const sourceNote = element("p", "", root);
  sourceNote.className = "game-help-text";
  sourceNote.hidden = true;
  element("p", t("settings", { level, size: game.width, colours: game.colours, seconds: game.observeMs / 1000 }), root).className = "game-help-text";
  const status = element("p", "", root);
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.tabIndex = -1;
  const comparison = element("div", "", root);
  comparison.className = "sketch-comparison";
  comparison.style.gap = "12px";
  const modelPanel = element("div", "", comparison);
  modelPanel.style.minWidth = "0";
  const modelCaption = element("h3", t("reference"), modelPanel);
  const model = element("pre", "", modelPanel);
  const playerPanel = element("div", "", comparison);
  playerPanel.style.minWidth = "0";
  element("h3", t("output"), playerPanel);
  const playerDrawing = element("pre", "", playerPanel);
  playerDrawing.className = "sketch-player";
  playerDrawing.setAttribute("aria-label", t("output"));
  // The cropped photo behind a tessellated motif is revealed with the result.
  const photoPanel = element("div", "", comparison);
  photoPanel.className = "sketch-photo-panel";
  photoPanel.hidden = true;
  element("h3", t("photoReveal"), photoPanel);
  const photoImage = element("img", "", photoPanel);
  photoImage.className = "sketch-photo";
  let photoReady = false;
  const palette = element("div", "", root);
  palette.setAttribute("aria-label", t("palette"));
  const paints = Array.from({ length: game.colours + 1 }, (_, colour) => {
    const button = element("button", `${INK[colour].symbol} ${copy.inks[colour]}`, palette);
    button.type = "button";
    button.style.color = colour ? INK[colour].colour : "#423624";
    listen(button, "click", () => {
      selectedColour = colour;
      paints.forEach((paint, index) => paint.setAttribute("aria-pressed", String(index === selectedColour)));
    });
    return button;
  });
  const grid = element("div", "", root);
  if (resonance) { grid.style.position = "relative"; grid.style.width = "max-content"; }
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", t("grid", { size: game.width }));
  const buttons = [];
  for (let row = 0; row < game.height; row++) {
    const line = element("div", "", grid);
    line.style.display = "flex";
    for (let col = 0; col < game.width; col++) {
      const button = element("button", ".", line);
      button.type = "button";
      button.style.minWidth = "44px";
      button.style.minHeight = "44px";
      button.setAttribute("aria-label", t("cell", { row: row + 1, col: col + 1 }));
      listen(button, "click", () => act({ type: "toggle", row, col, colour: selectedColour }));
      listen(button, "keydown", event => {
        const size = game.width, index = row * size + col;
        const moves = { ArrowLeft: Math.max(row * size, index - 1),
          ArrowRight: Math.min(row * size + size - 1, index + 1),
          ArrowUp: Math.max(0, index - size), ArrowDown: Math.min(buttons.length - 1, index + size),
          Home: row * size, End: row * size + size - 1 };
        if (Object.hasOwn(moves, event.key)) {
          event.preventDefault();
          event.stopPropagation();
          buttons[moves[event.key]].focus();
        }
      });
      buttons.push(button);
    }
  }
  const constellationLayer = resonance ? doc.createElementNS("http://www.w3.org/2000/svg", "svg") : null;
  if (constellationLayer) {
    constellationLayer.setAttribute("viewBox", `0 0 ${game.width * 100} ${game.height * 100}`);
    constellationLayer.setAttribute("aria-hidden", "true");
    Object.assign(constellationLayer.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" });
    grid.append(constellationLayer);
  }
  const controls = {};
  for (const type of ["start", "remember", "clear", "submit", "cancel"]) {
    const button = element("button", t(type), root);
    button.type = "button";
    listen(button, "click", () => act({ type }));
    controls[type] = button;
  }

  function hidden() {
    if (doc.hidden || !root.isConnected) return true;
    for (let node = root; node; node = node.parentElement) {
      if (node.hidden || node.getAttribute("aria-hidden") === "true" ||
          (node.tagName === "DIALOG" && !node.open)) return true;
      const style = win.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse")
        return true;
    }
    return false;
  }
  function cleanup() {
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
    if (modelTimer !== null) win.clearTimeout(modelTimer);
    modelTimer = null;
    observer?.disconnect();
    for (const remove of listeners.splice(0)) remove();
  }
  function finish() {
    if (finished) return;
    finished = true;
    cleanup();
    onFinish?.(result(game));
  }
  function render() {
    const phase = game.phase;
    grid.hidden = phase !== "draw";
    model.hidden = !["observe", "completed"].includes(phase);
    comparison.hidden = model.hidden;
    comparison.className = phase === "completed" ? "sketch-comparison sketch-revealed" : "sketch-comparison";
    comparison.style.display = comparison.hidden ? "none" : phase === "completed" ? "grid" : "block";
    modelCaption.hidden = phase !== "completed";
    playerPanel.hidden = phase !== "completed";
    photoPanel.hidden = phase !== "completed" || !photoReady;
    for (const [drawing, marks] of [[model, model.hidden ? [] : game.target],
      [playerDrawing, phase === "completed" ? game.marks : []]]) {
      drawing.replaceChildren();
      marks.forEach((ink, index) => {
        const pixel = element("span", INK[ink].symbol, drawing);
        pixel.style.color = INK[ink].colour;
        if (phase === "observe" && game.landmarks.includes(index)) {
          pixel.className = "sketch-landmark";
        }
        if ((index + 1) % game.width === 0 && index < marks.length - 1) element("span", "\n", drawing);
      });
    }
    palette.hidden = phase !== "draw";
    paints.forEach((paint, index) => {
      paint.disabled = phase !== "draw";
      paint.setAttribute("aria-pressed", String(index === selectedColour));
    });
    model.setAttribute("aria-label", t("model"));
    status.textContent = phase === "completed"
      ? `${t("score", { score: result(game).score, max: result(game).maxScore })} ${
        t("errors", { count: game.marks.filter((ink, index) => ink !== game.target[index]).length })}`
      : t(phase, { seconds: game.observeMs / 1000 });
    for (const [type, button] of Object.entries(controls)) {
      button.hidden = type === "start" ? phase !== "ready"
        : type === "remember" ? phase !== "observe"
          : type === "cancel" ? ["completed", "cancelled"].includes(phase) : phase !== "draw";
      button.disabled = button.hidden || type === "start" && modelPending;
    }
    buttons.forEach((button, index) => {
      const ink = game.marks[index];
      button.textContent = INK[ink].symbol;
      button.style.color = INK[ink].colour;
      if (phase === "draw" && game.landmarks.includes(index)) {
        button.style.position = "relative";
        element("span", "☆", button).className = "sketch-star";
      }
      button.setAttribute("aria-label", `${t("cell", { row: Math.floor(index / game.width) + 1, col: index % game.width + 1 })}: ${copy.inks[ink]}`);
      button.setAttribute("aria-pressed", String(ink !== 0));
      button.disabled = phase !== "draw";
    });
    if (constellationLayer) {
      constellationLayer.replaceChildren();
      const correct = phase === "draw" ? constellation(game) : [];
      for (let index = 1; index < correct.length; index++) {
        const line = doc.createElementNS("http://www.w3.org/2000/svg", "line");
        for (const [point, cell] of [[1, correct[index - 1]], [2, correct[index]]]) {
          line.setAttribute(`x${point}`, String((cell % game.width + 0.5) * 100));
          line.setAttribute(`y${point}`, String((Math.floor(cell / game.width) + 0.5) * 100));
        }
        line.setAttribute("stroke", "#ab9469");
        line.setAttribute("stroke-width", "3");
        constellationLayer.append(line);
      }
    }
  }
  function act(action) {
    if (finished || destroyed) return;
    const oldPhase = game.phase;
    game = input(game, hidden() ? { type: "cancel" } : action, clock());
    if (timer !== null && game.phase !== "observe") {
      win.clearTimeout(timer);
      timer = null;
    }
    render();
    if (game.phase === "observe" && oldPhase !== "observe") {
      scheduleObservation();
      controls.remember.focus();
    } else if (game.phase === "draw" && oldPhase !== "draw") buttons[0].focus();
    if (["completed", "cancelled"].includes(game.phase)) {
      status.focus();
      finish();
    }
  }
  function scheduleObservation() {
    timer = win.setTimeout(() => {
      timer = null;
      if (hidden()) { act({ type: "cancel" }); return; }
      game = advance(game, clock());
      render();
      if (game.phase === "draw") buttons[0].focus();
      else scheduleObservation();
    }, Math.max(1, game.observeMs - (clock() - game.observedAt)));
  }
  const cancelHidden = () => { if (hidden()) act({ type: "cancel" }); };
  listen(doc, "visibilitychange", cancelHidden);
  listen(win, "pagehide", () => act({ type: "cancel" }));
  listen(win, "resize", cancelHidden);
  listen(root, "keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      act({ type: "cancel" });
    }
  });
  async function rasterize(blob) {
    const bitmap = await win.createImageBitmap(blob);
    try {
      // A random square crop keeps repeated games at the same place varied.
      const crop = Math.max(1, Math.floor(Math.min(bitmap.width, bitmap.height) * (0.6 + Math.random() * 0.4)));
      const sx = Math.floor(Math.random() * (bitmap.width - crop + 1));
      const sy = Math.floor(Math.random() * (bitmap.height - crop + 1));
      const canvas = doc.createElement("canvas");
      canvas.width = game.width;
      canvas.height = game.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, sx, sy, crop, crop, 0, 0, game.width, game.height);
      const image = ctx.getImageData(0, 0, game.width, game.height);
      // Keep a readable copy of the same crop to reveal with the result.
      const display = doc.createElement("canvas");
      display.width = display.height = 240;
      display.getContext("2d").drawImage(bitmap, sx, sy, crop, crop, 0, 0, 240, 240);
      return { data: image.data, width: image.width, height: image.height,
        view: display.toDataURL?.("image/jpeg", 0.85) };
    } finally {
      bitmap.close?.();
    }
  }
  if (typeof photo === "function") {
    // The motif becomes a tessellated local photo when one is available before
    // the player starts observing; otherwise the imaginary scene stands.
    const settleModel = () => {
      if (modelTimer !== null) win.clearTimeout(modelTimer);
      modelTimer = null;
      if (destroyed || finished) return;
      modelPending = false;
      render();
    };
    modelTimer = win.setTimeout(settleModel, 2500);
    Promise.resolve().then(photo).then(async source => {
      if (!source || destroyed || finished || game.phase !== "ready") return;
      const pixels = source.pixels ?? await rasterize(source.blob);
      if (destroyed || finished || game.phase !== "ready") return;
      const target = tessellatePhoto(pixels, difficulty(level));
      game = createGame({ level, now: clock(), target, ...options });
      const view = source.view ?? pixels.view;
      if (view) {
        photoImage.src = view;
        photoImage.alt = source.credit ?? t("photoReveal");
        photoReady = true;
      }
      if (source.credit) {
        sourceNote.textContent = t("photoSource", { credit: source.credit });
        sourceNote.hidden = false;
      }
      render();
    }).catch(error => console.warn("Sketch photo unavailable; using an imaginary motif:", error))
      .finally(settleModel);
  }
  container.append(root);
  decorateResonance(root, "sketch", resonance, language);
  render();
  observer = new win.MutationObserver(cancelHidden);
  observer.observe(doc.documentElement, { subtree: true, childList: true,
    attributes: true, attributeFilter: ["hidden", "aria-hidden", "style", "class", "open"] });
  cancelHidden();
  return { destroy() {
    if (destroyed) return;
    try {
      if (!finished) act({ type: "cancel" });
    } finally {
      destroyed = true;
      cleanup();
      root.remove();
    }
  } };
}
