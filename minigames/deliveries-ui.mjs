import { createGame, difficulty, input, advance, result } from "./deliveries.mjs";
import { createBike, rideBike, bikeHouse, bikeRouteDistance } from "./deliveries-bike.mjs";
import { decorateResonance, resonanceResult } from "../arcane-resonance.mjs";

const TEXT = {
  en: {
    title: "The bicycle delivery round",
    fiction: "Fictional village: no real addresses or movement on the world map.",
    instructions: "Deliver every parcel to the house that requested it. First memorize the parcel letters outside the houses. Then ride your bike with the arrow keys, select a parcel with 1–7 or its button, and press Space when a house lights up. A shorter ride improves your score. Three wrong deliveries end the round.",
    memoryHelp: "Remember where each parcel belongs. When ready, hide the labels and start riding!",
    routeHelp: "Hold the arrow keys to ride freely. The highlighted house is within delivery range. Space delivers the parcel in hand. House labels are hidden: use your memory!",
    homeMemory: "The parcel marked HOME belongs to your own house.",
    homeRouteHelp: "Hold Space for 3 seconds to show or hide the route home without delivering. Release sooner to deliver. Parcel assignments stay hidden.",
    start: "Start", ready: "I remember — ride! (R)", cancel: "Cancel round (Escape)",
    memory: "1. Memorize the houses", route: "2. Ride and deliver",
    completed: "All parcels delivered!", failed: "Round failed", cancelled: "Round cancelled",
    correct: "Delivered!", wrong: "Wrong house! Keep the parcel and try another house.",
    timeout: "Time is up.", score: "Score", distance: "Ride distance", optimum: "Shortest route",
    mistakes: "Mistakes", seconds: "Seconds left", parcel: "Parcel", depot: "Post office",
    selected: "in hand", delivered: "delivered", progress: "Parcels delivered", carrying: "Parcel in hand",
    home: "HOME", homeRoute: "Route home (hold Space 3 s)",
    nearby: "House in range — Space to deliver", away: "Ride closer to a house",
    deliver: "Deliver (Space)", level: "Level", parcels: "parcels", grid: "village",
    memoryTime: "seconds to memorize", routeTime: "seconds to deliver", multiplier: "potential reward",
    error: "Delivery action failed. Try again.", bike: "Your bicycle",
    left: "Ride left", right: "Ride right", up: "Ride up", down: "Ride down",
  },
  fr: {
    title: "La tournée à vélo",
    fiction: "Village fictif : aucune adresse réelle ni déplacement sur la carte du monde.",
    instructions: "Livrez chaque colis à la maison qui le demandait. Mémorisez d’abord les lettres devant les maisons. Puis conduisez avec les flèches, choisissez un colis avec 1–7 ou son bouton et appuyez sur Espace lorsqu’une maison s’illumine. Un trajet court améliore le score. Trois mauvaises livraisons terminent la partie.",
    memoryHelp: "Retenez où va chaque colis. Quand vous êtes prêt, masquez les étiquettes et prenez le vélo !",
    routeHelp: "Maintenez les flèches pour rouler librement. La maison illuminée est à portée. Espace livre le colis en main. Les étiquettes sont cachées : faites appel à votre mémoire !",
    homeMemory: "Le colis marqué CHEZ VOUS est destiné à votre maison.",
    homeRouteHelp: "Maintenez Espace 3 secondes pour afficher ou masquer le trajet vers chez vous sans livrer. Relâchez avant pour livrer. Les destinations des colis restent cachées.",
    start: "Commencer", ready: "J’ai mémorisé — en selle ! (R)", cancel: "Annuler (Échap)",
    memory: "1. Mémorisez les maisons", route: "2. Roulez et livrez",
    completed: "Tous les colis sont livrés !", failed: "Tournée échouée", cancelled: "Tournée annulée",
    correct: "Livré !", wrong: "Mauvaise maison ! Gardez le colis et essayez ailleurs.",
    timeout: "Temps écoulé.", score: "Score", distance: "Distance à vélo", optimum: "Trajet minimal",
    mistakes: "Erreurs", seconds: "Secondes restantes", parcel: "Colis", depot: "Poste",
    selected: "en main", delivered: "livré", progress: "Colis livrés", carrying: "Colis en main",
    home: "CHEZ VOUS", homeRoute: "Trajet vers chez moi (maintenir Espace 3 s)",
    nearby: "Maison à portée — Espace pour livrer", away: "Approchez-vous d’une maison",
    deliver: "Livrer (Espace)", level: "Niveau", parcels: "colis", grid: "village",
    memoryTime: "secondes pour mémoriser", routeTime: "secondes pour livrer", multiplier: "gain potentiel",
    error: "Action de livraison impossible. Réessayez.", bike: "Votre vélo",
    left: "Rouler à gauche", right: "Rouler à droite", up: "Rouler en haut", down: "Rouler en bas",
  },
};
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

export function mount(container, { level = 0, language = "fr", onFinish, audio, resonance = false } = {}) {
  const config = difficulty(level);
  if (!container?.ownerDocument || typeof container.append !== "function" ||
      typeof onFinish !== "function" || typeof resonance !== "boolean") {
    throw new TypeError("Invalid deliveries mount options");
  }
  const doc = container.ownerDocument, clock = doc.defaultView ?? globalThis;
  const t = TEXT[language] ?? TEXT.fr;
  const root = doc.createElement("section");
  root.tabIndex = 0;
  root.setAttribute("aria-label", t.title);
  container.append(root);
  let game, bike = createBike(config.grid), selected = 0, timer, lastTick, showHomeRoute = false;
  let spaceHold = null;
  let homeRouteButton, routeStatus;
  let finished = false, destroyed = false, board, bikeArt, nearStatus, liveStatus, scoreStatus, routeLine;
  const keys = new Set(), pointers = new Map();
  const houses = [];
  const letter = index => String.fromCharCode(65 + index);
  const terminal = () => game && ["completed", "failed", "cancelled"].includes(game.phase);
  const outcome = () => result(game, bikeRouteDistance(bike, game.phase === "completed"));
  const now = () => clock.performance?.now() ?? Date.now();
  function node(tag, text, className) {
    const element = doc.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function button(text, action, value, disabled = false) {
    const element = node("button", text);
    element.type = "button";
    element.dataset.action = action;
    if (value !== undefined) element.dataset.value = String(value);
    element.disabled = disabled;
    return element;
  }
  function art(kind) {
    const element = node("span", undefined, `delivery-art delivery-art-${kind}`);
    element.setAttribute("aria-hidden", "true");
    return element;
  }
  function clearMotion() { keys.clear(); pointers.clear(); spaceHold = null; }
  function updateBoard() {
    if (!game || !board) return;
    const cell = game.phase === "route" ? bikeHouse(bike) : null;
    houses.forEach((house, index) => {
      house.dataset.near = String(index === cell);
      house.dataset.here = String(index === bikeHouse(bike));
    });
    bikeArt.style.left = `${(bike.x + 0.5) / config.grid * 100}%`;
    bikeArt.style.top = `${(bike.y + 0.5) / config.grid * 100}%`;
    bikeArt.style.transform = `translate(-50%, -50%) rotate(${bike.heading}deg)`;
    if (routeLine && game.phase === "route" && showHomeRoute && game.homeParcel !== null) {
      const home = game.targets[game.homeParcel];
      const dx = (home % config.grid) - bike.x, dy = Math.floor(home / config.grid) - bike.y;
      routeLine.hidden = false;
      routeLine.style.left = `${(bike.x + 0.5) / config.grid * 100}%`;
      routeLine.style.top = `${(bike.y + 0.5) / config.grid * 100}%`;
      routeLine.style.width = `${Math.hypot(dx, dy) / config.grid * 100}%`;
      routeLine.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
    } else if (routeLine) routeLine.hidden = true;
    if (homeRouteButton) homeRouteButton.setAttribute("aria-pressed", String(showHomeRoute));
    if (routeStatus && game.phase === "route") {
      routeStatus.textContent = spaceHold && !spaceHold.toggled
        ? `${language === "en" ? "Hold Space" : "Maintenez Espace"} : ${Math.min(3,
          (game.lastNow - spaceHold.startedAt) / 1000).toFixed(1)} / 3 s`
        : language === "en" ? `Route home: ${showHomeRoute ? "shown" : "hidden"} — hold Space 3 s`
          : `Trajet vers chez vous : ${showHomeRoute ? "affiché" : "masqué"} — maintenir Espace 3 s`;
    }
    const message = cell !== null && cell !== 0 ? t.nearby : t.away;
    if (nearStatus.textContent !== message) nearStatus.textContent = message;
    const remaining = terminal() ? 0 : game.phase === "memory" ? config.memoryMs - (game.lastNow - game.startedAt)
      : config.routeMs - (game.lastNow - game.routeStartedAt);
    const timing = `${t.seconds}: ${Math.max(0, Math.ceil(remaining / 1000))}`;
    if (liveStatus.textContent !== timing) liveStatus.textContent = timing;
    liveStatus.dataset.urgent = String(!terminal() && remaining <= 10000);
    scoreStatus.textContent = `${t.score}: ${terminal() ? outcome().score : 0}/1000 · ${t.distance}: ${bikeRouteDistance(bike, game.phase === "completed").toFixed(1)} · ${t.mistakes}: ${game.mistakes}/3`;
  }
  function render() {
    const active = doc.activeElement;
    const focusKey = active && root.contains(active) ? [active.dataset.action, active.dataset.value] : null;
    const decorations = Array.from(root.children ?? []).filter(element =>
      ["arcane-banner", "arcane-backdrop"].includes(element.className) ||
      element.tagName?.toLowerCase() === "style");
    root.replaceChildren(node("h2", t.title), node("p", t.fiction, "game-help-text"), node("p", t.instructions, "game-help-text"),
      node("p", `${t.level} ${level}: ${config.parcels} ${t.parcels} · ${config.grid}×${config.grid} ${t.grid} · ${config.memoryMs / 1000} ${t.memoryTime} · ${config.routeMs / 1000} ${t.routeTime} · ×${config.rewardMultiplier} ${t.multiplier}`, "game-help-text"));
    board = undefined;
    homeRouteButton = routeStatus = undefined;
    if (!game) root.append(button(t.start, "start"));
    else {
      root.append(node("h3", t[game.phase]), node("p", `${t.progress}: ${game.delivered.filter(Boolean).length}/${config.parcels}`));
      if (!terminal()) {
        const guidance = game.phase === "memory" ? t.memoryHelp : t.routeHelp;
        root.append(node("p", `${guidance}${game.resonance
          ? ` ${game.phase === "memory" ? t.homeMemory : t.homeRouteHelp}` : ""}`,
        "delivery-guidance game-help-text"));
      }
      scoreStatus = node("p");
      liveStatus = node("p");
      liveStatus.className = "delivery-countdown";
      liveStatus.setAttribute("role", "timer");
      root.append(scoreStatus);
      if (game.feedback) {
        const feedback = node("p", t[game.feedback]);
        feedback.setAttribute("role", game.feedback === "wrong" ? "alert" : "status");
        root.append(feedback);
      }
      if (game.phase === "memory") root.append(button(t.ready, "ready"));
      if (terminal()) root.append(node("p", `${t.optimum}: ${outcome().optimalDistance}`));
      const parcels = node("div", undefined, "delivery-parcels");
      game.targets.forEach((_, index) => {
        const parcel = button(`${index + 1}: ${t.parcel} ${letter(index)} — ${
          game.delivered[index] ? t.delivered : selected === index ? t.selected : ""}`,
        "parcel", index, game.phase !== "route" || game.delivered[index]);
        parcel.setAttribute("aria-pressed", String(selected === index));
        parcel.append(art("parcel"));
        parcels.append(parcel);
      });
      root.append(parcels);
      if (game.phase === "route") {
        root.append(node("p", `${t.carrying}: ${letter(selected)}`, "delivery-carrying"));
      }
      board = node("div", undefined, "delivery-village");
      board.style.gridTemplateColumns = `repeat(${config.grid}, minmax(0, 1fr))`;
      board.setAttribute("aria-label", t.fiction);
      houses.length = 0;
      for (let cell = 0; cell < config.grid ** 2; cell++) {
        const house = node("div", undefined, "delivery-house");
        house.setAttribute("role", "img");
        house.append(art(cell === 0 ? "depot" : "house"));
        if (cell === 0) house.append(node("span", t.depot));
        const parcel = game.targets.indexOf(cell);
        const delivered = parcel >= 0 && game.delivered[parcel];
        house.setAttribute("aria-label", cell === 0 ? t.depot :
          `${language === "en" ? "House" : "Maison"} ${cell}${
            (game.phase === "memory" || delivered) && parcel >= 0
              ? `: ${t.parcel} ${letter(parcel)}${delivered ? ` — ${t.delivered}` : ""}` : ""}`);
        if (parcel >= 0 && (game.phase === "memory" || delivered)) {
          const label = node("span", `${letter(parcel)}${delivered ? " ✓" : ""}`, "delivery-house-label");
          label.dataset.delivered = String(delivered);
          label.append(art("parcel"));
          if (game.phase === "memory" && game.resonance && parcel === game.homeParcel) {
            label.append(node("span", t.home, "delivery-home-mark"));
          }
          house.append(label);
        }
        houses.push(house);
        board.append(house);
      }
      bikeArt = art("bike");
      bikeArt.className += " delivery-bike";
      bikeArt.setAttribute("role", "img");
      bikeArt.setAttribute("aria-label", t.bike);
      bikeArt.setAttribute("aria-hidden", "false");
      routeLine = undefined;
      if (game.phase === "route" && game.resonance && game.homeParcel !== null) {
        routeLine = node("span", undefined, "delivery-home-route");
        routeLine.setAttribute("aria-hidden", "true");
        Object.assign(routeLine.style, { position: "absolute", transformOrigin: "0 50%",
          borderTop: "2px dashed #e9d69a", opacity: "0.24", pointerEvents: "none", zIndex: "1" });
        board.append(routeLine);
      }
      board.append(bikeArt);
      root.append(liveStatus, board);
      nearStatus = node("p");
      nearStatus.setAttribute("role", "status");
      if (game.phase === "route") {
        const controls = node("div", undefined, "delivery-steering");
        for (const [key, caption] of [["ArrowLeft", t.left], ["ArrowUp", t.up], ["ArrowDown", t.down], ["ArrowRight", t.right]]) {
          controls.append(button(caption, "steer", key));
        }
        if (game.resonance && game.homeParcel !== null) {
          const hint = button(t.homeRoute, "home-route");
          hint.setAttribute("aria-pressed", String(showHomeRoute));
          homeRouteButton = hint;
          controls.append(hint);
          routeStatus = node("p");
          routeStatus.setAttribute("role", "status");
          root.append(routeStatus);
        }
        controls.append(button(t.deliver, "deliver"));
        root.append(nearStatus, controls);
      }
      updateBoard();
    }
    root.append(button(t.cancel, "cancel"));
    root.append(...decorations);
    if (focusKey) {
      const target = [...root.querySelectorAll("button")].find(element =>
        element.dataset.action === focusKey[0] && element.dataset.value === focusKey[1] && !element.disabled);
      (target ?? root).focus();
    }
  }
  function notify() {
    if (finished || !terminal()) return;
    finished = true;
    clock.clearInterval(timer);
    timer = undefined;
    clearMotion();
    onFinish(resonanceResult(outcome(), resonance));
  }
  function tick() {
    if (!game || finished || destroyed) return;
    if (doc.hidden) { act("cancel"); return; }
    const time = now(), previous = game.phase;
    const end = game.phase === "route" ? game.routeStartedAt + config.routeMs : lastTick;
    const seconds = Math.min(0.1, Math.max(0, Math.min(time, end) - lastTick) / 1000);
    if (game.phase === "route") {
      const held = new Set([...keys, ...pointers.values()]);
      bike = rideBike(bike, Number(held.has("ArrowRight")) - Number(held.has("ArrowLeft")),
        Number(held.has("ArrowDown")) - Number(held.has("ArrowUp")), seconds);
    }
    lastTick = time;
    game = advance(game, time);
    const toggleRoute = game.phase === "route" && spaceHold && !spaceHold.toggled &&
      time - spaceHold.startedAt >= 3000;
    if (toggleRoute) {
      spaceHold.toggled = true;
      showHomeRoute = !showHomeRoute;
    }
    if (previous !== game.phase) render();
    else updateBoard();
    notify();
  }
  function act(type, value) {
    if (destroyed || finished) return;
    try {
      if (type === "start" && !game) {
        lastTick = now();
        game = createGame({ level, now: lastTick, resonance });
        timer = clock.setInterval(tick, 20);
      } else if (type === "cancel") {
        game ??= createGame({ level, now: now() });
        game = input(game, { type: "cancel" }, now());
        audio?.stop();
      } else {
        tick();
        if (finished) return;
        if (type === "ready" && game) game = input(game, { type: "ready" }, now());
        else if (type === "home-route" && game?.phase === "route" && resonance) {
          showHomeRoute = !showHomeRoute;
        }
        else if (type === "parcel" && game?.phase === "route") {
          if (!Number.isInteger(value) || value < 0 || value >= config.parcels) throw new Error("Invalid parcel");
          if (!game.delivered[value]) selected = value;
        } else if (type === "deliver" && game?.phase === "route") {
          const cell = bikeHouse(bike);
          if (cell === null || cell === 0) return;
          game = input(game, { type: "deliver", parcel: selected, cell }, now());
          void audio?.play(game.feedback === "correct" ? "success" : "caught");
          if (game.delivered[selected]) selected = Math.max(0, game.delivered.indexOf(false));
        }
      }
      render();
      notify();
    } catch (reason) {
      console.error("Delivery action failed:", reason);
      const error = node("p", `${t.error} ${reason.message}`);
      error.setAttribute("role", "alert");
      root.append(error);
    }
  }
  function click(event) {
    const target = event.target.closest?.("button");
    if (!target || !root.contains(target) || target.disabled) return;
    if (target.dataset.action === "steer") return;
    act(target.dataset.action, Number(target.dataset.value));
  }
  function keydown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (game?.phase === "route" && Object.hasOwn(ARROWS, event.key)) {
      event.preventDefault();
      tick();
      keys.add(event.key);
    } else if (!event.repeat && event.key === "Escape") { event.preventDefault(); act("cancel"); }
    else if (!event.repeat && event.key.toLowerCase() === "r" && game?.phase === "memory") {
      event.preventDefault(); act("ready");
    } else if (!event.repeat && game?.phase === "route" &&
        (/^[1-7]$/.test(event.key) || /^(Digit|Numpad)[1-7]$/.test(event.code ?? ""))) {
      const digit = /^(Digit|Numpad)[1-7]$/.test(event.code ?? "") ? event.code.slice(-1) : event.key;
      if (Number(digit) <= config.parcels) {
        event.preventDefault(); act("parcel", Number(digit) - 1);
      }
    } else if (game?.phase === "route" && event.key === " ") {
      event.preventDefault();
      if (!event.repeat) {
        if (resonance) spaceHold ??= { startedAt: now(), toggled: false };
        else act("deliver");
      }
    }
  }
  function keyup(event) {
    if (keys.has(event.key)) { tick(); keys.delete(event.key); }
    if (event.key === " " && spaceHold) {
      event.preventDefault();
      tick();
      const deliver = spaceHold && !spaceHold.toggled && game?.phase === "route" && !finished;
      spaceHold = null;
      if (deliver) act("deliver");
      else updateBoard();
    }
  }
  function pointerdown(event) {
    const target = event.target.closest?.("button");
    if (game?.phase !== "route" || target?.dataset.action !== "steer" || event.button !== 0) return;
    event.preventDefault();
    tick();
    target.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, target.dataset.value);
  }
  function pointerup(event) {
    if (pointers.has(event.pointerId)) { tick(); pointers.delete(event.pointerId); }
  }
  const focusout = event => {
    if (!root.contains(event.relatedTarget)) { tick(); clearMotion(); }
  };
  const hidden = () => { if (doc.hidden && game) { act("cancel"); audio?.stop(); } };
  const pagehide = () => { if (game) act("cancel"); audio?.stop(); };
  root.addEventListener("click", click);
  root.addEventListener("keydown", keydown);
  root.addEventListener("pointerdown", pointerdown);
  root.addEventListener("lostpointercapture", pointerup);
  root.addEventListener("focusout", focusout);
  doc.addEventListener("keyup", keyup);
  doc.addEventListener("pointerup", pointerup);
  doc.addEventListener("pointercancel", pointerup);
  doc.addEventListener("visibilitychange", hidden);
  clock.addEventListener?.("blur", clearMotion);
  clock.addEventListener?.("pagehide", pagehide);
  if (resonance && root.ownerDocument?.createElement) decorateResonance(root, "deliveries", true, language);
  render();
  return { destroy() {
    if (destroyed) return;
    act("cancel");
    destroyed = true;
    clock.clearInterval(timer);
    clearMotion();
    audio?.stop();
    root.removeEventListener("click", click);
    root.removeEventListener("keydown", keydown);
    root.removeEventListener("pointerdown", pointerdown);
    root.removeEventListener("lostpointercapture", pointerup);
    root.removeEventListener("focusout", focusout);
    doc.removeEventListener("keyup", keyup);
    doc.removeEventListener("pointerup", pointerup);
    doc.removeEventListener("pointercancel", pointerup);
    doc.removeEventListener("visibilitychange", hidden);
    clock.removeEventListener?.("blur", clearMotion);
    clock.removeEventListener?.("pagehide", pagehide);
    root.remove();
  } };
}
