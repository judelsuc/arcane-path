import { PETANQUE, advance, boulePositions, createGame, difficulty, groundHeight, input, result } from "./petanque.mjs";
import { resolveResonance, decorateResonance, resonanceResult } from "../arcane-resonance.mjs";

const TEXT = {
  fr: {
    title: "Pétanque au village",
    rules: "Vous et l’ordinateur lancez chacun {boules} boules, à tour de rôle. Réglez la direction et la puissance. Le terrain ({terrain}, pente {slope}) ralentit et dévie les boules. Seul le gagnant marque : un point par boule plus proche du cochonnet que la meilleure boule adverse. Égalité : aucun point. Limite de trois minutes pour les lancers. Aucune mise : la partie est gratuite.",
    keys: "Clavier : ←/→ direction, ↑/↓ puissance (Maj = grands pas), Espace ou Entrée pour lancer, Échap pour abandonner. Les boules peuvent se percuter, se déplacer et sortir du terrain ; le comptage utilise leurs positions finales. Le cochonnet reste fixe.",
    start: "Commencer la partie", left: "Viser à gauche", right: "Viser à droite",
    weaker: "Moins fort", stronger: "Plus fort", throw: "Lancer la boule", quit: "Abandonner",
    angle: "Direction (degrés)", power: "Puissance (%)",
    pitch: "Terrain : cochonnet à {jx} m de côté et {jy} m devant. {count} boule(s) jouée(s).",
    ready: "Prêt ? Appuyez sur « Commencer la partie ».",
    aiming: "À vous — boule {n}/{boules} — direction {angle}°, puissance {power} %.",
    computer: "L’ordinateur prépare sa boule…",
    rolling: "{owner} : la boule roule…",
    out: "hors terrain",
    thrown: "{owner}, boule {n} : {distance}.", distance: "à {d} m du cochonnet",
    player: "Vous", opponent: "Ordinateur", playerSymbol: "V", opponentSymbol: "O",
    legend: "Vous : bleu (V) · Ordinateur : rouge (O) · Cochonnet : jaune",
    score: "Vous : {player} · Ordinateur : {computer}",
    finished: "Manche terminée. {score}", draw: "Égalité : aucun point.",
    counting: "Comptage — {owner} : {points} point(s).",
    counted: "Point {points} : {owner}, boule {n}, à {distance} m du cochonnet.",
    timedOut: "Temps écoulé : manche incomplète, aucun point.", cancelled: "Partie abandonnée, sans récompense.",
    error: "Action impossible : {message}",
    smooth: "lisse", gravel: "gravier", packed: "terre battue", sloped: "en pente", rough: "accidenté",
    flat: "nulle",
    relief: "Hauteur locale du sol : clair = bosse, sombre = creux ({count} reliefs). Leur nombre et leurs positions sont tirés au début de chaque partie et restent identiques pour les deux joueurs. La flèche montre la pente générale. Les niveaux supérieurs ajoutent du relief et rendent l’ordinateur plus précis.",
  },
  en: {
    title: "Village pétanque",
    rules: "You and the computer each throw {boules} boules, taking alternating turns. Set direction and power. The ground ({terrain}, slope {slope}) slows and deflects both sides’ boules. Only the winner scores: one point for each boule closer to the jack than the opponent’s best. Equal best distances: no points. Three-minute limit for throwing. No stake: playing is free.",
    keys: "Keyboard: ←/→ direction, ↑/↓ power (Shift = big steps), Space or Enter to throw, Escape to quit. Boules can collide, knock each other away and go out of bounds; scoring uses their final positions. The jack stays fixed.",
    start: "Start the game", left: "Aim left", right: "Aim right",
    weaker: "Softer", stronger: "Harder", throw: "Throw the boule", quit: "Quit",
    angle: "Direction (degrees)", power: "Power (%)",
    pitch: "Pitch: jack {jx} m sideways and {jy} m ahead. {count} boule(s) played.",
    ready: "Ready? Press “Start the game”.",
    aiming: "Your turn — boule {n}/{boules} — direction {angle}°, power {power}%.",
    computer: "The computer is lining up its boule…",
    rolling: "{owner}: the boule is rolling…",
    out: "out of bounds",
    thrown: "{owner}, boule {n}: {distance}.", distance: "{d} m from the jack",
    player: "You", opponent: "Computer", playerSymbol: "Y", opponentSymbol: "C",
    legend: "You: blue (Y) · Computer: red (C) · Jack: yellow",
    score: "You: {player} · Computer: {computer}",
    finished: "End finished. {score}", draw: "Equal best distances: no points.",
    counting: "Counting — {owner}: {points} point(s).",
    counted: "Point {points}: {owner}, boule {n}, {distance} m from the jack.",
    timedOut: "Time is up: incomplete end, no points.", cancelled: "Game abandoned, no reward.",
    error: "Action not possible: {message}",
    smooth: "smooth", gravel: "gravel", packed: "packed earth", sloped: "sloping", rough: "rough",
    flat: "none",
    relief: "Local ground height: light = bump, dark = hollow ({count} features). Their count and positions are drawn at the start of each match and shared by both players. The arrow shows the overall slope. Higher levels add relief and make the computer more accurate.",
  },
};

const ARROWS = ["→", "↗", "↑", "↖", "←", "↙", "↓", "↘"];

/** The global plane is shown by the slope arrow; pixels show height above/below that plane. */
export function terrainPixels(terrain, width = 80, height = 300) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new RangeError("Terrain raster dimensions must be positive integers.");
  const local = { ...terrain, slope: { x: 0, y: 0 } };
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const x = ((col + 0.5) / width - 0.5) * PETANQUE.pitch.width;
      const y = (1 - (row + 0.5) / height) * PETANQUE.pitch.length;
      const shade = Math.max(-1, Math.min(1, groundHeight(local, x, y) / 0.025)) * 85;
      const index = (row * width + col) * 4;
      data.set([195 + shade, 162 + shade, 107 + shade * 0.8, 255], index);
    }
  }
  return { width, height, data };
}

export function mount(container, { level = 0, language = "fr", onFinish, random = Math.random, clock, audio, ...options } = {}) {
  const resonance = resolveResonance("petanque", options);
  if (!container || typeof container.append !== "function") throw new TypeError("Pétanque needs a container element.");
  const rules = difficulty(level);
  const doc = container.ownerDocument ?? globalThis.document;
  const words = TEXT[language] ?? TEXT.fr;
  const now = typeof clock === "function" ? clock : () => globalThis.performance?.now?.() ?? Date.now();
  const t = (key, args = {}) => String(words[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(args[name] ?? ""));
  const number = value => language === "fr" ? String(value).replace(".", ",") : String(value);

  let game = null, timer = null, finished = false, destroyed = false, seen = 0;
  const bouleNodes = new Map();
  const ownerName = owner => t(owner === "player" ? "player" : "opponent");
  const ownerSymbol = owner => t(owner === "player" ? "playerSymbol" : "opponentSymbol");
  const ownerColor = owner => owner === "player" ? "#246bca" : "#bd3838";

  const make = (tag, props = {}, children = []) => {
    const node = doc.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "style") Object.assign(node.style ??= {}, value);
      else if (key.startsWith("aria-") || key === "role") node.setAttribute?.(key, value);
      else node[key] = value;
    }
    for (const child of children) node.append(child);
    return node;
  };
  const button = (label, onClick, className) => {
    const node = make("button", { type: "button", textContent: label, className, disabled: true });
    node.addEventListener("click", onClick);
    return node;
  };
  const range = (label, min, max, step, value, onInput) => {
    const node = make("input", { type: "range", min: String(min), max: String(max), step: String(step), value: String(value), disabled: true, "aria-label": label });
    node.addEventListener("input", () => onInput(Number(node.value)));
    return node;
  };

  const title = make("h2", { textContent: t("title") });
  const rulesText = make("p", { className: "petanque-rules game-help-text" });
  const keys = make("p", { className: "petanque-keys game-help-text", textContent: t("keys") });
  const start = button(t("start"), () => begin(), "petanque-start");
  start.disabled = false;
  const pitch = make("div", { className: "petanque-pitch", role: "img",
    style: { position: "relative", width: "min(12rem, 16vh)", aspectRatio: "4 / 15", background: "#c9a66b", border: "2px solid #7a5a2b", margin: "0.5rem auto" } });
  const marker = (color, size, label) => make("div", { className: `petanque-${label}`, "aria-hidden": "true",
    style: { position: "absolute", width: size, height: size, borderRadius: "50%", background: color, transform: "translate(-50%, -50%)", display: "none" } });
  const jack = marker("#f2c94c", "0.5rem", "jack");
  const ball = marker("#555", "0.9rem", "ball");
  const bouleSize = { width: `${PETANQUE.bouleRadius * 2 / PETANQUE.pitch.width * 100}%`,
    height: `${PETANQUE.bouleRadius * 2 / PETANQUE.pitch.length * 100}%` };
  Object.assign(ball.style, bouleSize);
  const aim = make("div", { className: "petanque-aim", "aria-hidden": "true",
    style: { position: "absolute", left: "50%", bottom: "0", width: "2px", height: "45%", background: "rgba(0,0,0,.45)", transformOrigin: "bottom center" } });
  const slopeSign = make("div", { className: "petanque-slope", style: { position: "absolute", right: "0.2rem", top: "0.2rem" } });
  const played = make("div", { className: "petanque-played" });
  const reliefLayer = make("canvas", { className: "petanque-relief", "aria-hidden": "true",
    width: 80, height: 300,
    style: { position: "absolute", inset: "0", width: "100%", height: "100%", imageRendering: "pixelated" } });
  pitch.append(reliefLayer, aim, jack, played, ball, slopeSign);

  const left = button(t("left"), () => act("left"), "petanque-left");
  const right = button(t("right"), () => act("right"), "petanque-right");
  const weaker = button(t("weaker"), () => act("down"), "petanque-weaker");
  const stronger = button(t("stronger"), () => act("up"), "petanque-stronger");
  const throwButton = button(t("throw"), () => act("throw"), "petanque-throw");
  const quit = button(t("quit"), () => cancel(), "petanque-quit");
  const angleInput = range(t("angle"), PETANQUE.angle.min, PETANQUE.angle.max, PETANQUE.angle.step, 0, value => act({ type: "setAngle", value }));
  const powerInput = range(t("power"), PETANQUE.power.min, PETANQUE.power.max, PETANQUE.power.step, 50, value => act({ type: "setPower", value }));
  const controls = make("div", { className: "petanque-controls", role: "group", "aria-label": t("title") }, [
    make("label", {}, [t("angle"), " ", angleInput]), left, right,
    make("label", {}, [t("power"), " ", powerInput]), weaker, stronger, throwButton, quit,
  ]);
  const status = make("p", { className: "petanque-status", role: "status", "aria-live": "polite", textContent: t("ready") });
  const feedback = make("p", { className: "petanque-feedback", "aria-live": "polite" });
  const error = make("p", { className: "petanque-error", role: "alert" });
  const score = make("p", { className: "petanque-score", "aria-live": "polite", textContent: t("score", { player: 0, computer: 0 }) });
  const reliefText = make("p", { className: "petanque-relief-rules game-help-text",
    textContent: t("relief", { count: `${rules.reliefCount.min}–${rules.reliefCount.max}` }) });
  const root = make("section", { className: "petanque-game", tabIndex: 0, "aria-label": t("title") },
    [title, rulesText, reliefText,
      keys, start, make("p", { className: "petanque-legend", textContent: t("legend") }), pitch, controls, status, feedback, score, error]);
  rulesText.textContent = t("rules", { boules: rules.boules, terrain: t(rules.terrain), slope: rules.slope ? number(rules.slope) : t("flat") });
  container.append(root);
  const steady = resonance ? button(language === "en" ? "Steady hand (once)" : "Main sûre (une fois)",
    () => act("steady"), "petanque-steady") : null;
  if (steady) {
    controls.append(steady);
    pitch.setAttribute("role", "group");
    root.append(make("p", { className: "game-help-text", textContent: language === "en"
      ? `Strength: once per match, click Steady hand, then a settled boule (or focus it with Tab and press Enter) to attempt a carreau at any power. Success (${Math.round(rules.carreauChance * 100)}%) replaces the target with your boule and knocks it out of bounds. Failure sends your boule out and leaves the target unchanged. Uses one remaining boule and your single attempt. Click Steady hand again to leave target selection without using it.`
      : `Force : une fois par partie, cliquez Main sûre, puis une boule arrêtée (ou Tab puis Entrée) pour tenter un carreau, à toute puissance. Réussite (${Math.round(rules.carreauChance * 100)} %) : votre boule remplace la cible, éjectée hors du terrain. Échec : votre boule sort, la cible reste en place. Consomme une boule restante et l’unique tentative. Recliquez Main sûre pour quitter la sélection sans la consommer.` }));
  }
  decorateResonance(root, "petanque", resonance, language);

  const place = (node, { x, y }) => {
    Object.assign(node.style, { left: `${((x + PETANQUE.pitch.width / 2) / PETANQUE.pitch.width) * 100}%`,
      top: `${(1 - y / PETANQUE.pitch.length) * 100}%`, display: "block" });
  };

  function render() {
    const aiming = !finished && game?.phase === "aiming";
    for (const control of [left, right, weaker, stronger, throwButton, angleInput, powerInput]) control.disabled = !aiming;
    quit.disabled = finished || !game;
    start.disabled = Boolean(game) || finished;
    if (steady) {
      steady.disabled = !aiming || game.steadyUsed || !game.throws.some(shot => !shot.out);
      steady.setAttribute("aria-pressed", String(Boolean(aiming && game.steadyActive)));
    }
    if (!game) return;
    angleInput.value = String(game.angle);
    powerInput.value = String(game.power);
    aim.style.transform = `translateX(-50%) rotate(${game.angle}deg)`;
    aim.style.height = `${Math.max(4, game.power * 0.6)}%`;
    aim.style.display = aiming ? "block" : "none";
    aim.style.background = "rgba(0,0,0,.45)";
    place(jack, game.jack);
    const { x, y } = game.terrain.slope;
    slopeSign.textContent = x || y ? ARROWS[Math.round(((Math.atan2(y, x) * 180 / Math.PI + 360) % 360) / 45) % 8] : "·";
    const counted = game.cancelled ? [] : game.counting?.indices.slice(0, game.counting.awarded) ?? [];
    const highlighted = counted.at(-1);
    const positions = new Map(boulePositions(game, Math.max(now(), game.updatedAt)).map(point => [point.id, point]));
    for (const shot of game.throws) {
      let dot = bouleNodes.get(shot.id);
      const position = positions.get(shot.id);
      if (shot.out || position?.out) {
        if (dot) dot.style.display = "none";
        continue;
      }
      if (!dot) {
        dot = marker(ownerColor(shot.owner), "1.1rem", "boule");
        if (resonance) {
          dot.setAttribute("aria-hidden", "false");
          dot.setAttribute("role", "button");
          dot.addEventListener("click", () => act({ type: "carreau", targetId: shot.id }));
          dot.addEventListener("keydown", event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            act({ type: "carreau", targetId: shot.id });
          });
        }
        dot.textContent = `${ownerSymbol(shot.owner)}${Math.floor(shot.id / 2) + 1}`;
        Object.assign(dot.style, bouleSize, { color: "#fff", fontSize: "8px", lineHeight: "1.2", textAlign: "center" });
        bouleNodes.set(shot.id, dot);
        played.append(dot);
      }
      dot.title = t("thrown", { owner: ownerName(shot.owner), n: Math.floor(shot.id / 2) + 1,
        distance: t("distance", { d: number(shot.distance.toFixed(2)) }) });
      if (resonance) {
        const selectable = Boolean(aiming && game.steadyActive);
        dot.tabIndex = selectable ? 0 : -1;
        dot.setAttribute("aria-disabled", String(!selectable));
        dot.setAttribute("aria-label", dot.title);
        dot.style.cursor = selectable ? "crosshair" : "default";
      }
      place(dot, position ?? shot.end);
      const active = shot.id === highlighted;
      dot.className = `petanque-boule petanque-${shot.owner}${counted.includes(shot.id) ? " petanque-counted" : ""}${active ? " petanque-highlight" : ""}`;
      dot.style.outline = active ? "3px solid #fff36b" : aiming && game.steadyActive ? "2px dashed #fff4b3" : counted.includes(shot.id) ? "1px solid #fff36b" : "none";
      dot.style.outlineOffset = active ? "4px" : "1px";
      dot.style.zIndex = active ? "4" : "2";
    }
    const position = game.rolling ? positions.get(game.rolling.throw.id) : null;
    if (position && !position.out) {
      ball.style.background = ownerColor(game.rolling.throw.owner);
      ball.textContent = ownerSymbol(game.rolling.throw.owner);
      Object.assign(ball.style, { color: "#fff", fontSize: "8px", lineHeight: "1.2", textAlign: "center" });
      place(ball, position);
    } else ball.style.display = "none";
    pitch.setAttribute?.("aria-label", t("pitch", { jx: number(game.jack.x), jy: number(game.jack.y), count: game.throws.length }));
    score.textContent = t("score", { player: game.score, computer: game.opponentScore });
    if (game.phase === "aiming")
      status.textContent = game.steadyActive
        ? (language === "en" ? `Choose a target boule — carreau chance ${Math.round(rules.carreauChance * 100)}%. Any power.`
          : `Choisissez une boule cible — réussite du carreau : ${Math.round(rules.carreauChance * 100)} %. Toute puissance.`)
        : t("aiming", { n: game.throws.filter(shot => shot.owner === "player").length + 1, boules: rules.boules, angle: number(game.angle), power: number(game.power) });
    else if (game.phase === "computer") status.textContent = t("computer");
    else if (game.phase === "rolling") status.textContent = t("rolling", { owner: ownerName(game.rolling.throw.owner) });
    else if (game.phase === "counting") status.textContent = game.counting.winner
      ? t("counting", { owner: ownerName(game.counting.winner), points: game.counting.awarded }) : t("draw");
    for (; seen < game.throws.length; seen++) {
      const shot = game.throws[seen];
      feedback.textContent = t("thrown", { n: Math.floor(seen / 2) + 1, owner: ownerName(shot.owner),
        distance: shot.out ? t("out") : t("distance", { d: number(shot.distance.toFixed(2)) }) });
      if (shot.carreau) feedback.textContent = language === "en"
        ? (shot.carreau.success ? "Carreau! Your boule replaces the target; the target is out." : "Carreau missed: your boule is out; the target stays put.")
        : (shot.carreau.success ? "Carreau ! Votre boule remplace la cible, éjectée hors du terrain." : "Carreau manqué : votre boule sort, la cible reste en place.");
    }
    if (highlighted !== undefined) {
      const shot = game.throws[highlighted];
      feedback.textContent = t("counted", { points: counted.length, owner: ownerName(shot.owner),
        n: Math.floor(shot.id / 2) + 1, distance: number(shot.distance.toFixed(2)) });
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    if (timer !== null) globalThis.clearInterval(timer);
    timer = null;
    const outcome = game ? result(game) : Object.freeze({ completed: false, score: 0, opponentScore: 0,
      winner: null, maxScore: rules.maxScore, cancelled: true, timedOut: false });
    if (outcome.cancelled || game?.timedOut) audio?.stop();
    status.textContent = outcome.cancelled ? t("cancelled") : game.timedOut ? t("timedOut")
      : t("finished", { score: t("score", { player: outcome.score, computer: outcome.opponentScore }) });
    render();
    if (typeof onFinish === "function") onFinish(Object.freeze(resonanceResult(outcome, resonance && !game?.timedOut)));
  }

  function update(next) {
    const previous = game;
    game = next;
    if (next.phase === "cancelled") audio?.stop();
    else if (next.throws.length > (previous?.throws.length ?? 0) && !next.timedOut) void audio?.play("land");
    if (next.phase !== "cancelled" && next.rolling && next.rolling !== previous?.rolling) void audio?.play("throw");
    else if (next.rolling && previous.updatedAt < next.rolling.startedAt + PETANQUE.flightMs &&
        next.updatedAt >= next.rolling.startedAt + PETANQUE.flightMs) void audio?.play("roll");
    if (next.rolling && next.rolling === previous?.rolling) {
      const crossedImpact = next.rolling.impacts.some(impact => {
        const at = next.rolling.startedAt + PETANQUE.flightMs + impact.timeMs;
        return previous.updatedAt < at && next.updatedAt >= at;
      });
      if (crossedImpact) void audio?.play("hit");
    }
    error.textContent = "";
    render();
    if (game.phase === "finished" || game.phase === "cancelled") finish();
  }

  function act(action) {
    if (!game || finished || destroyed) return;
    try { update(input(game, action, Math.max(now(), game.updatedAt))); }
    catch (problem) { fail(problem); }
  }

  function tick() {
    if (!game || finished) return;
    if (doc.hidden) { cancel(); return; }
    try { update(advance(game, Math.max(now(), game.updatedAt))); }
    catch (problem) { fail(problem); }
  }

  function fail(problem) {
    if (resonance) {
      if (game) update(input(game, "cancel", game.updatedAt));
      else finish();
    }
    error.textContent = t("error", { message: problem.message });
  }

  function begin() {
    if (game || finished || destroyed) return;
    if (doc.hidden) return;
    try {
      const created = createGame({ level, random, now: Math.max(0, now()), ...options });
      const context = reliefLayer.getContext("2d");
      if (!context) throw new Error("Canvas rendering is unavailable.");
      const raster = terrainPixels(created.terrain);
      const image = context.createImageData(raster.width, raster.height);
      image.data.set(raster.data);
      context.putImageData(image, 0, 0);
      game = created;
      reliefText.textContent = t("relief", { count: created.terrain.relief.length });
    } catch (problem) { fail(problem); return; }
    timer = globalThis.setInterval(tick, 50);
    render();
    root.focus?.();
  }

  function cancel() {
    if (finished) return;
    if (game) act("cancel");
    if (!finished) finish();
  }

  function onKey(event) {
    const tag = event.target?.tagName;
    const big = event.shiftKey ? 10 : 1;
    let action = null;
    if (event.key === "Escape") action = "quit";
    else if (tag === "INPUT" || tag === "BUTTON") return;
    else if (event.key === "ArrowLeft") action = { type: "setAngle", value: (game?.angle ?? 0) - PETANQUE.angle.step * big };
    else if (event.key === "ArrowRight") action = { type: "setAngle", value: (game?.angle ?? 0) + PETANQUE.angle.step * big };
    else if (event.key === "ArrowUp") action = { type: "setPower", value: (game?.power ?? 0) + PETANQUE.power.step * big };
    else if (event.key === "ArrowDown") action = { type: "setPower", value: (game?.power ?? 0) - PETANQUE.power.step * big };
    else if (event.key === " " || event.key === "Enter") action = game ? "throw" : "start";
    if (!action) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    if (action === "quit") { if (game) cancel(); }
    else if (action === "start") begin();
    else act(action);
  }

  function onVisibility() {
    if (doc.hidden) cancel();
    if (doc.hidden) audio?.stop();
  }
  const onPageHide = () => { cancel(); audio?.stop(); };

  root.addEventListener("keydown", onKey);
  doc.addEventListener?.("visibilitychange", onVisibility);
  doc.defaultView?.addEventListener("pagehide", onPageHide);

  return {
    destroy() {
      if (destroyed) return;
      cancel();
      destroyed = true;
      audio?.stop();
      root.removeEventListener?.("keydown", onKey);
      doc.removeEventListener?.("visibilitychange", onVisibility);
      doc.defaultView?.removeEventListener("pagehide", onPageHide);
      root.remove?.();
    },
  };
}
