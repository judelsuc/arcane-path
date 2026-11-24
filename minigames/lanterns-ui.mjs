import { createGame, input, advance, result } from "./lanterns.mjs";
import { lanternArt } from "./lanterns-art.mjs";
import { resolveResonance, decorateResonance, resonanceResult } from "../arcane-resonance.mjs";

const copy = {
  fr: {
    title: "La répétition des lanternes",
    story: "Aide fictive dans ce lieu culturel cartographié : répétez une suite de lanternes. Aucune fête réelle ni rémunération n’est annoncée.",
    instructions: "Mémorisez une lanterne et répétez-la. La même suite s’allonge ensuite d’un élément à chaque manche : 1, puis 2, puis 3… Cliquez ou utilisez les chiffres pour répéter toute la suite après chaque démonstration. Une erreur termine la partie. Objectif : 7 éléments au niveau facile, puis un de plus par niveau, jusqu’à 11.",
    names: ["Soleil", "Lune", "Étoile", "Feuille", "Cloche", "Cerf-volant"],
    start: "Commencer", cancel: "Annuler", ready: "Prêt : commencez quand vous voulez.",
    watch: "Regardez et mémorisez — pas encore de réponse.",
    gap: "Pause — mémorisez la suite.", repeat: "À vous : reproduisez la suite.",
    correct: "Bonne réponse.", wrong: "Réponse incorrecte.", done: "Répétition terminée.",
    failed: "Séquence incorrecte — partie terminée.", round: "Manche", next: "Manche réussie ! La suite s’allonge…",
    cancelled: "Annulé — aucun gain.", score: "Score", step: "Étape", level: "Niveau",
    controls: "Lanternes — cliquez ou utilisez les chiffres", lit: "ALLUMÉE",
  },
  en: {
    title: "Lantern rehearsal",
    story: "Fictional help at this mapped cultural venue: repeat a lantern sequence. No real festival or payment is being advertised.",
    instructions: "Remember one lantern and repeat it. The same sequence then grows by one item each round: 1, then 2, then 3… Click or use number keys to repeat the whole sequence after each demonstration. One mistake ends the game. Reach 7 items on Easy, then one more per level, up to 11.",
    names: ["Sun", "Moon", "Star", "Leaf", "Bell", "Kite"],
    start: "Start", cancel: "Cancel", ready: "Ready: start whenever you like.",
    watch: "Watch and remember — do not answer yet.",
    gap: "Pause — remember the sequence.", repeat: "Your turn: repeat the sequence.",
    correct: "Correct answer.", wrong: "Wrong answer.", done: "Rehearsal complete.",
    failed: "Wrong sequence — game over.", round: "Round", next: "Round complete! One more lantern…",
    cancelled: "Cancelled — no reward.", score: "Score", step: "Step", level: "Level",
    controls: "Lanterns — click or use number keys", lit: "LIT",
  },
};

/**
 * Local-only UI. onFinish receives the
 * engine result once (including cancellation before Start or on teardown).
 * Keys 1–6 work within this panel; native buttons also support Enter/Space.
 */
export function mount(container, { level = 0, language = "fr", onFinish, audio, ...options } = {}) {
  const resonance = resolveResonance("lanterns", options);
  if (!container?.ownerDocument || typeof container.append !== "function") {
    throw new TypeError("Expected a DOM container.");
  }
  if (onFinish !== undefined && typeof onFinish !== "function") throw new TypeError("Invalid onFinish.");
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const clock = () => win.performance.now();
  let game = createGame({ level, now: clock(), resonance });
  const text = copy[language] ?? copy.fr;
  let timer = null;
  let feedbackTimer = null, answering = null;
  let finished = false;
  let destroyed = false;
  let aborted = false;
  const removers = [];
  const el = (tag, content) => {
    const node = doc.createElement(tag);
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const listen = (node, event, handler) => {
    node.addEventListener(event, handler);
    removers.push(() => node.removeEventListener(event, handler));
  };
  const root = el("section");
  root.lang = language === "en" ? "en" : "fr";
  root.tabIndex = -1;
  root.setAttribute("aria-label", text.title);
  const title = el("h2", text.title);
  const description = el("p", text.story);
  const instructions = el("p", text.instructions);
  const levelLabel = el("p", `${text.level} ${level} · ×${game.rules.rewardMultiplier}`);
  for (const note of [description, instructions, levelLabel]) note.className = "game-help-text";
  const status = el("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const score = el("p");
  const board = el("fieldset");
  const legend = el("legend", text.controls);
  legend.className = "sr-only";
  board.append(legend);
  const buttons = Array.from({ length: game.rules.lanternCount }, (_, index) => {
    const button = el("button");
    button.type = "button";
    button.className = "lantern-button";
    button.setAttribute("aria-keyshortcuts", String(index + 1));
    button.append(lanternArt(doc, index));
    const number = el("span", String(index + 1));
    number.className = "lantern-number";
    number.setAttribute("aria-hidden", "true");
    button.append(number);
    board.append(button);
    listen(button, "click", () => press(index));
    return button;
  });
  const start = el("button", text.start);
  const cancel = el("button", text.cancel);
  start.type = cancel.type = "button";
  root.append(title, description, instructions, levelLabel, status, score, board, start, cancel);
  let glow, glowTrail;
  if (resonance) {
    const help = el("p", language === "en"
      ? "Hermit: lanterns and numbers disappear during the demonstration. Only a small spark appears at each played position, with its tone; no connecting trail. Lanterns reappear for your answer and each choice illuminates the dimmed scene briefly. Same growing sequence: 7–11 elements, one mistake ends play."
      : "L’Hermite : lanternes et chiffres disparaissent pendant la démonstration. Seule une petite étincelle apparaît à chaque position jouée, avec sa note, sans trace reliant les positions. Les lanternes reviennent pour votre réponse ; chaque choix éclaire brièvement le décor assombri. Même suite croissante : 7 à 11 éléments, une erreur termine la partie.");
    help.className = "game-help-text";
    root.append(help);
    const style = el("style", `
      .hermit-scene{position:relative;isolation:isolate;background:#182a38;border-radius:16px;transition:background-color .2s}
      .hermit-scene::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;background:linear-gradient(165deg,transparent 65%,#3a514a 66%,#162c30 85%);opacity:.9}
      .hermit-scene[data-answering="true"]{background-color:#080f19}
      .hermit-scene[data-scene-lit="true"]{background-image:radial-gradient(ellipse at var(--glow-x) var(--glow-y),#ecd78a88,transparent 75%)}
      .hermit-glow{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
      .hermit-glow circle{filter:drop-shadow(0 0 3px #ffdf83)}
    `);
    root.append(style);
    board.className = "hermit-scene";
    const svg = tag => doc.createElementNS("http://www.w3.org/2000/svg", tag);
    glowTrail = svg("svg");
    glowTrail.setAttribute("class", "hermit-glow");
    glowTrail.setAttribute("viewBox", "0 0 1000 1000");
    glowTrail.setAttribute("preserveAspectRatio", "none");
    glowTrail.setAttribute("aria-hidden", "true");
    glow = svg("circle");
    glow.setAttribute("r", "1");
    glow.setAttribute("vector-effect", "non-scaling-stroke");
    glow.setAttribute("stroke", "#fff1bb");
    glow.setAttribute("stroke-width", "5");
    glow.setAttribute("fill", "#fff1bb");
    glowTrail.append(glow);
    board.append(glowTrail);
  }
  decorateResonance(root, "lanterns", resonance, language);
  container.append(root);

  function clearTimer() {
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
  }
  function cleanup() {
    clearTimer();
    if (feedbackTimer !== null) win.clearTimeout(feedbackTimer);
    feedbackTimer = null;
    answering = null;
    audio?.stop();
    removers.splice(0).forEach(remove => remove());
  }
  function hidden() {
    return doc.hidden || container.hidden || root.hidden || Boolean(root.closest?.("[hidden]"));
  }
  function render() {
    const phase = aborted ? "cancelled" : game.phase;
    if (resonance) {
      const selected = answering ?? game.litLantern;
      board.dataset.answering = String(phase === "input" || answering !== null);
      board.dataset.sceneLit = String(answering !== null);
      glowTrail.style.visibility = phase === "playback" && game.litLantern !== null ? "visible" : "hidden";
      if (selected !== null) {
        const bounds = board.getBoundingClientRect();
        const target = buttons[selected].getBoundingClientRect();
        const x = bounds.width ? (target.left + target.width / 2 - bounds.left) / bounds.width * 1000 : (selected + .5) / buttons.length * 1000;
        const y = bounds.height ? (target.top + target.height / 2 - bounds.top) / bounds.height * 1000 : 500;
        board.style.setProperty("--glow-x", `${x / 10}%`);
        board.style.setProperty("--glow-y", `${y / 10}%`);
        if (phase === "playback") {
          glow.setAttribute("cx", x);
          glow.setAttribute("cy", y);
          glowTrail.dataset.to = String(selected);
        }
      }
    }
    start.disabled = phase !== "ready";
    cancel.disabled = finished;
    buttons.forEach((button, index) => {
      const demonstratingHidden = resonance && phase === "playback";
      const lit = !demonstratingHidden && (game.litLantern === index || answering === index);
      button.style.visibility = demonstratingHidden ? "hidden" : "visible";
      button.setAttribute("aria-hidden", String(demonstratingHidden));
      button.setAttribute("data-lit", String(lit));
      button.setAttribute("aria-label", `${index + 1} · ${text.names[index]}${lit ? ` — ${text.lit}` : ""}`);
      button.disabled = phase !== "input" || finished;
      button.style.outline = lit ? "4px double currentColor" : "";
      button.style.fontWeight = lit ? "bold" : "normal";
    });
    const progress = `${text.round} ${game.round}/${game.rules.length} · ${text.step} ${Math.min(game.cursor + 1, game.round)}/${game.round}`;
    if (phase === "ready") status.textContent = text.ready;
    if (phase === "playback") status.textContent = game.litLantern === null
      ? `${text.watch} ${text.gap}`
      : `${text.watch} ${text.round} ${game.round}/${game.rules.length} · ${text.step} ${game.playbackIndex + 1}/${game.round}`;
    if (phase === "input") status.textContent = `${game.lastCorrect === null ? "" : game.lastCorrect ? text.correct : text.wrong} ${text.repeat} ${progress}`;
    if (phase === "done") status.textContent = `${game.lastCorrect ? text.correct : text.wrong} ${text.done}`;
    if (phase === "failed") status.textContent = `${text.wrong} ${text.failed}`;
    if (phase === "roundGap") status.textContent = `${text.next} ${text.round} ${game.round + 1}/${game.rules.length}`;
    if (phase === "cancelled") status.textContent = text.cancelled;
    score.textContent = `${text.score} : ${aborted ? 0 : game.score}/${game.rules.length}`;
  }
  function finish() {
    if (finished) return;
    finished = true;
    cleanup();
    render();
    const outcome = result(game);
    onFinish?.(resonanceResult(aborted ? { ...outcome, completed: false, score: 0, cancelled: true } : outcome, resonance));
  }
  function cancelGame() {
    if (finished) return;
    aborted = true;
    game = input(game, { type: "cancel" }, clock());
    finish();
  }
  function tick() {
    timer = null;
    if (finished) return;
    if (hidden()) return cancelGame();
    const previous = game.phase;
    const previousIndex = game.playbackIndex, previousLit = game.litLantern;
    game = advance(game, clock());
    if (game.litLantern !== null && (game.playbackIndex !== previousIndex || game.litLantern !== previousLit))
      void audio?.play(game.litLantern);
    render();
    if (previous === "playback" && game.phase === "input") buttons[0].focus();
    schedule();
  }
  function schedule() {
    clearTimer();
    if (!finished && game.nextAt !== null) timer = win.setTimeout(tick, Math.max(1, game.nextAt - clock()));
  }
  function press(index) {
    if (finished || game.phase !== "input") return;
    if (hidden()) return cancelGame();
    game = input(game, { type: "press", lantern: index }, clock());
    if (feedbackTimer !== null) win.clearTimeout(feedbackTimer);
    answering = index;
    void audio?.play(index);
    render();
    feedbackTimer = win.setTimeout(() => {
      feedbackTimer = null;
      answering = null;
      if (hidden()) return cancelGame();
      render();
      if (game.phase === "done" || game.phase === "failed") { root.focus(); finish(); }
    }, 260);
    schedule();
  }
  listen(start, "click", () => {
    if (finished || game.phase !== "ready") return;
    if (hidden()) return cancelGame();
    game = input(game, { type: "start" }, clock());
    void audio?.unlock?.();
    root.focus();
    render();
    schedule();
  });
  listen(cancel, "click", cancelGame);
  listen(root, "keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelGame();
      return;
    }
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey ||
        game.phase !== "input" || !/^[1-6]$/.test(event.key)) return;
    const index = Number(event.key) - 1;
    if (index < buttons.length) {
      event.preventDefault();
      press(index);
    }
  });
  listen(doc, "visibilitychange", () => { if (doc.hidden) cancelGame(); });
  listen(win, "pagehide", cancelGame);
  if (win.MutationObserver) {
    const observer = new win.MutationObserver(() => { if (hidden()) cancelGame(); });
    for (let node = root; node; node = node.parentElement) {
      observer.observe(node, { attributes: true, attributeFilter: ["hidden"] });
    }
    removers.push(() => observer.disconnect());
  }
  render();
  if (hidden()) cancelGame();
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try { cancelGame(); } finally { cleanup(); root.remove(); }
    },
  };
}
