import { pursuitStatus } from "./pursuit.mjs";
import { createEscape, stepEscape, escapeObstacles, escapeCourse } from "./minigames/pursuit-escape.mjs";
import { STEP } from "./minigames/legend-platformer.mjs";
import { trackEventQteKeys } from "./event-qte-ui.mjs";
import { drawPursuitAtmosphere } from "./pursuit-atmosphere.mjs";

const COPY = {
  en: {
    title: "Someone is following you", grace: "Pursuit starts in {hours} game hours. Initial distance: 30 km.",
    distant: "Pursuer: {km} km away.", near: "The pursuer is getting closer: {km} km. Keep your distance.",
    danger: "Danger: only {km} km separate you. Be ready to escape!",
    escape: "The pursuer has caught up. You must escape.", captured: "You were caught. This journey has ended.",
    rules: "You run automatically. Press Space, Up or Jump to clear obstacles. Jump onto raised platforms, then over their crates. Falling into a gap costs one stumble and puts you back on the far side. Three stumbles mean capture and the end of this journey. Reach the end to regain a 30 km lead. Closing the tab or leaving a started escape counts as capture. Help pauses the challenge.",
    pace: "The pursuer moves at 2 km/h as game time passes, including rest and sleep. Shelters do not stop him. Moving away or taking transport can increase your lead.",
    normal: "Normal pace", accessible: "Slower accessible pace", start: "Start escape",
    controlsShort: "Space or Up: jump",
    paceShort: "Careful pace imposed by your condition.",
    difficultyShort: "Difficulty {level}/10.",
    paceImposed: "Weakened, you run carefully: the course unfolds more slowly.",
    jump: "Jump", help: "Help / pause", resume: "Resume", prepare: "Get ready",
    release: "Release held keys to begin.", retry: "Retry saving the result", close: "Continue",
    success: "The pursuer trips and falls. The boy escapes! You have regained a 30 km lead.", failed: "You were caught. Your journey ends here.",
    cornered: "He has caught you. There is no way out: defend yourself!",
    status: "{progress}% of the route · stumbles {hits}/3", paused: "Paused",
    woodland: "Woodland escape: jump fallen branches.", streets: "Street escape: jump low barriers.",
    rocky: "Rocky-ground escape: jump low rocks.", country: "Open-country escape: jump low mounds.",
    chase: "The pursuer runs behind you and gets closer after each stumble.",
    obstacles: "Clear stacked crates and paired hurdles, climb stepping ledges, and stay on the ground beneath overhead obstacles.",
    moving: "Levels 8–10 also include moving carts and bouncing obstacles. Watch their motion before jumping.",
    expert: "Expert route: much faster pace, tall stacks, wide gaps and quick-moving obstacles. Precise jump timing is essential.",
    atmosphere: "Atmosphere: {phase} · {rain} · {fog}. Your condition affects visibility; upcoming obstacles remain readable.",
    phase_day: "daylight", phase_dawn: "dawn", phase_dusk: "dusk", phase_night: "night",
    phase_unknown: "time-of-day data unavailable", rain_none: "no rain", rain_rain: "rain",
    rain_storm: "heavy rain", rain_snow: "snow", rain_unknown: "weather data unavailable",
    fog_none: "no fog", fog_light: "light fog", fog_dense: "dense fog",
    captureImage: "A frightening close-up of the pursuer's face. You were caught.",
    captureImageError: "The capture illustration could not be loaded.",
    demanding: "Low ceilings guard tall stacks: stay low, then time your jump. Three-step ledges require another jump. Each new impact can cost a stumble.",
    difficulty: "Difficulty {level}/10 · chase progression {base} (attempts and days since the pursuit began), condition adjustment {modifier}. Low health, fatigue and lack of sleep make escape harder; the pursuer grows bolder with each passing day.",
    save: "Unable to save the escape.", restored: "This started escape was interrupted and must be recorded as capture.",
  },
  fr: {
    title: "Quelqu'un vous suit", grace: "La poursuite commence dans {hours} heures de jeu. Distance initiale : 30 km.",
    distant: "Poursuivant : à {km} km.", near: "Le poursuivant se rapproche : {km} km. Gardez vos distances.",
    danger: "Danger : seulement {km} km vous séparent. Préparez-vous à fuir !",
    escape: "Le poursuivant vous a rejoint. Vous devez fuir.", captured: "Vous avez été rattrapé. Ce voyage est terminé.",
    rules: "Vous courez automatiquement. Appuyez sur Espace, Haut ou Sauter pour franchir les obstacles. Montez sur les plateformes, puis sautez leurs caisses. Tomber dans un trou coûte un trébuchement et vous replace de l'autre côté. Trois trébuchements entraînent la capture et la fin du voyage. Atteignez la sortie pour reprendre 30 km d'avance. Fermer l'onglet ou quitter une fuite commencée compte comme une capture. Aide met le défi en pause.",
    pace: "Le poursuivant avance à 2 km/h avec le temps du jeu, y compris pendant le repos et le sommeil. Les abris ne l'arrêtent pas. S'éloigner ou prendre un transport peut augmenter votre avance.",
    normal: "Vitesse normale", accessible: "Vitesse réduite accessible", start: "Commencer la fuite",
    controlsShort: "Espace ou Haut : sauter",
    paceShort: "Allure prudente imposée par votre état.",
    difficultyShort: "Difficulté {level}/10.",
    paceImposed: "Affaibli, vous courez avec prudence : le parcours défile plus lentement.",
    jump: "Sauter", help: "Aide / pause", resume: "Reprendre", prepare: "Préparez-vous",
    release: "Relâchez les touches pour commencer.", retry: "Réessayer d'enregistrer le résultat", close: "Continuer",
    success: "Le poursuivant trébuche et tombe. Le garçon s'échappe ! Vous reprenez 30 km d'avance.",
    failed: "Vous avez été rattrapé. Votre voyage s'arrête ici.",
    cornered: "Il vous a rattrapé. Plus d'issue : défendez-vous !",
    status: "{progress} % du parcours · trébuchements {hits}/3", paused: "En pause",
    woodland: "Fuite en forêt : sautez les branches tombées.", streets: "Fuite dans les rues : sautez les barrières basses.",
    rocky: "Fuite en terrain rocheux : sautez les petits rochers.", country: "Fuite en campagne : sautez les petites buttes.",
    chase: "Le poursuivant court derrière vous et se rapproche à chaque trébuchement.",
    obstacles: "Franchissez les caisses empilées et les doubles barrières, montez les marches et restez au sol sous les obstacles suspendus.",
    moving: "Les niveaux 8 à 10 ajoutent des chariots mobiles et des obstacles rebondissants. Observez leur mouvement avant de sauter.",
    expert: "Parcours expert : allure nettement plus rapide, piles hautes, grands trous et obstacles mobiles plus vifs. Le bon moment pour sauter est crucial.",
    atmosphere: "Ambiance : {phase} · {rain} · {fog}. Votre état influe sur la visibilité ; les obstacles proches restent lisibles.",
    phase_day: "jour", phase_dawn: "aube", phase_dusk: "crépuscule", phase_night: "nuit",
    phase_unknown: "heure solaire indisponible", rain_none: "sans pluie", rain_rain: "pluie",
    rain_storm: "forte pluie", rain_snow: "neige", rain_unknown: "météo indisponible",
    fog_none: "sans brouillard", fog_light: "brume légère", fog_dense: "brouillard dense",
    captureImage: "Gros plan inquiétant du visage du poursuivant. Vous avez été rattrapé.",
    captureImageError: "L'illustration de la capture n'a pas pu être chargée.",
    demanding: "Des plafonds bas précèdent les piles hautes : restez au sol, puis sautez au bon moment. Les escaliers à trois marches demandent un nouveau saut. Chaque nouvel impact peut coûter un trébuchement.",
    difficulty: "Difficulté {level}/10 · progression de la traque {base} (tentatives et jours depuis le début de la poursuite), adaptation à votre état {modifier}. Une santé faible, la fatigue et le manque de sommeil compliquent la fuite ; le poursuivant s'enhardit de jour en jour.",
    save: "Impossible d'enregistrer la fuite.", restored: "Cette fuite commencée a été interrompue et doit être enregistrée comme une capture.",
  },
};

export function setupPursuit({ context, act, doc = document }) {
  const held = trackEventQteKeys(doc), view = doc.defaultView;
  const language = () => doc.documentElement.lang === "en" ? "en" : "fr";
  const text = (key, values = {}) => COPY[language()][key].replace(/\{(\w+)\}/g, (_, key) => values[key]);
  const status = doc.createElement("p");
  status.id = "pursuit-status";
  status.setAttribute("role", "status");
  doc.querySelector("#needs-warning").after(status);
  const dialog = doc.createElement("dialog");
  dialog.className = "pursuit-dialog";
  dialog.id = "pursuit-dialog";
  dialog.setAttribute("data-native-controls", "");
  const title = doc.createElement("h2");
  let atmosphereText = "";
  dialog.setAttribute("aria-labelledby", "pursuit-title");
  title.id = "pursuit-title";
  // The pace is imposed by the traveller's condition, never chosen in the dialog.
  const imposedPace = () => {
    const pending = context()?.state.pursuit?.pending;
    return pending?.difficulty && pending.difficulty.modifier > 0 ? "accessible" : "normal";
  };
  const canvas = doc.createElement("canvas");
  canvas.width = 640; canvas.height = 320;
  canvas.setAttribute("role", "img");
  const captureImage = doc.createElement("img");
  captureImage.className = "pursuit-capture";
  captureImage.hidden = true;
  let captureImageFailed = false;
  const feedback = doc.createElement("p");
  feedback.setAttribute("role", "status");
  captureImage.addEventListener("error", () => {
    captureImageFailed = true;
    console.error("Pursuit capture illustration failed to load.");
    if (result && context()?.state.ended === "captured") {
      captureImage.hidden = true;
      canvas.hidden = false;
      feedback.textContent = `${text("failed")} ${text("captureImageError")}`;
    }
  });
  function button(run) {
    const node = doc.createElement("button");
    node.type = "button";
    node.setAttribute("data-shortcut-skip", "");
    node.addEventListener("click", run);
    return node;
  }
  const start = button(launch), jump = button(() => { jumpRequested = true; });
  const help = doc.createElement("dialog");
  help.className = "window-dialog";
  const helpText = doc.createElement("p"), resume = button(() => help.close());
  help.append(helpText, resume);
  let helpDetails = "";
  const helpButton = button(() => {
    if (help.open) return;
    helpText.textContent = helpDetails || text("rules");
    help.showModal();
  });
  const retry = button(saveResult), close = button(() => dialog.close());
  dialog.append(title, start, canvas, captureImage, feedback, jump, helpButton, retry, close);
  doc.body.append(dialog, help);
  let identity, attempt, engine, jumps = [], result, running = false, preparation = 0;
  let timer, last = 0, accumulated = 0, jumpRequested = false, errorText = "";
  let victoryElapsed;
  const clock = () => view.performance.now();
  function stop() { view.clearInterval(timer); timer = undefined; running = false; }
  function saveResult() {
    if (!result) return;
    try {
      if (act({ type: "settle", result }) !== true) throw new Error(text("save"));
      errorText = "";
      retry.hidden = true;
      close.disabled = false;
      const cornered = context()?.state.brawl?.pending?.kind === "pursuer";
      feedback.textContent = text(cornered ? "cornered" : context()?.state.ended === "captured" ? "failed" : "success");
      if (cornered) {
        // The capture now opens a fight with the pursuer in its own window.
        view.setTimeout(() => { if (dialog.open) dialog.close(); }, 1400);
      } else if (context()?.state.ended !== "captured") celebrate();
      else if (captureImageFailed) feedback.textContent += ` ${text("captureImageError")}`;
      else {
        canvas.hidden = true;
        captureImage.hidden = false;
        captureImage.scrollIntoView?.({ block: "center", behavior: "instant" });
      }
      close.focus();
    } catch (reason) {
      console.error("Pursuit result save failed:", reason);
      errorText = reason.message;
      feedback.textContent = errorText;
      retry.hidden = false;
    }
  }
  function finish(abandoned = false) {
    if (result) return;
    stop();
    jump.disabled = true;
    result = { jumps: [...jumps], ticks: engine?.tick ?? 0, abandoned };
    saveResult();
  }
  function celebrate() {
    if (victoryElapsed !== undefined) return;
    victoryElapsed = view.matchMedia?.("(prefers-reduced-motion: reduce)").matches || doc.hidden ? 2400 : 0;
    canvas.setAttribute("aria-label", text("success"));
    draw();
    if (victoryElapsed === 2400) return;
    let previous = clock();
    timer = view.setInterval(() => {
      const now = clock();
      if (!help.open) victoryElapsed = Math.min(2400, victoryElapsed + Math.min(100, Math.max(0, now - previous)));
      previous = now;
      draw();
      if (victoryElapsed === 2400) stop();
    }, 16);
  }
  function launch() {
    if (!attempt || attempt.status !== "ready" || running || result || doc.hidden) return;
    try {
      if (act({ type: "begin", mode: imposedPace() }) !== true) throw new Error(text("save"));
    } catch (reason) {
      console.error("Pursuit start save failed:", reason);
      feedback.textContent = reason.message;
      start.hidden = false;
      return;
    }
    attempt = context().state.pursuit.pending;
    engine = createEscape(attempt.seed, attempt.version, attempt.difficulty?.level);
    jumps = []; jumpRequested = false; accumulated = 0;
    preparation = 3000;
    start.hidden = true;
    start.disabled = true;
    running = true; last = clock();
    timer = view.setInterval(tick, 16);
    dialog.focus();
    tick();
  }
  // Short directions live inside the game view, Shenmue-style, instead of
  // paragraphs above the canvas.
  function overlay(big, lines) {
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.fillStyle = "rgba(8, 12, 18, 0.55)";
    ctx.fillRect(0, 86, canvas.width, 160);
    ctx.textAlign = "center";
    ctx.fillStyle = "#f4e9c8";
    if (big) {
      ctx.font = "bold 64px ui-monospace, monospace";
      ctx.fillText(big, canvas.width / 2, 152);
    }
    ctx.font = "15px ui-monospace, monospace";
    lines.forEach((line, index) => ctx.fillText(line, canvas.width / 2, 186 + index * 22));
    ctx.restore();
  }
  function directions() {
    const difficulty = attempt?.difficulty;
    return [
      text(attempt.terrain),
      `${difficulty ? text("difficultyShort", { level: difficulty.level }) : ""}${
        attempt.mode === "accessible" ? ` ${text("paceShort")}` : ""}`.trim(),
      text("controlsShort"),
    ].filter(Boolean);
  }
  function tick() {
    const now = clock(), delta = Math.min(100, Math.max(0, now - last));
    last = now;
    if (!running || help.open) return;
    if (preparation > 0) {
      preparation = Math.max(0, preparation - delta);
      feedback.textContent = "";
      draw();
      overlay(String(Math.ceil(preparation / 1000)), directions());
      jumpRequested = false;
      return;
    }
    if (held.size && engine.tick === 0) {
      draw();
      overlay("", [text("release")]);
      jumpRequested = false; return;
    }
    jump.disabled = false;
    accumulated += delta * (attempt.mode === "accessible" ? 0.65 : 1);
    while (accumulated >= STEP * 1000 && engine.status === "running") {
      const input = jumpRequested && engine.grounded;
      if (input) jumps.push(engine.tick + 1);
      jumpRequested = false;
      engine = stepEscape(engine, input);
      accumulated -= STEP * 1000;
    }
    feedback.textContent = text("status", {
      progress: Math.min(100, Math.floor(engine.x / escapeCourse(attempt.version, attempt.difficulty?.level).length * 100)), hits: engine.hits,
    });
    draw();
    if (engine.status !== "running") finish();
  }
  function draw() {
    const ctx = canvas.getContext("2d");
    const terrain = attempt.terrain, camera = engine.x - 100;
    const atmosphere = attempt.atmosphere;
    const reducedMotion = view.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const atmosphereFrame = engine.tick + (victoryElapsed ?? 0) * 60 / 1000;
    const atmosphereSpeed = escapeCourse(attempt.version, attempt.difficulty?.level).speed;
    const palette = {
      woodland: { sky: "#263f4c", haze: "#647c76", far: "#344e53", middle: "#456359", ground: "#524b3b", rim: "#95a36d" },
      streets: { sky: "#343d59", haze: "#bd9384", far: "#595e73", middle: "#77747b", ground: "#55545d", rim: "#b9a68c" },
      rocky: { sky: "#344b65", haze: "#b6aaa0", far: "#647487", middle: "#82908f", ground: "#655e59", rim: "#c5b49b" },
      country: { sky: "#3d6471", haze: "#c0b696", far: "#6d8d85", middle: "#8e9c70", ground: "#655640", rim: "#bdba7d" },
    }[terrain];
    function rect(color, x, y, width, height) {
      ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), width, height);
    }
    function shape(color, points) {
      ctx.fillStyle = color; ctx.beginPath();
      points.forEach(([x, y], index) => {
        if (index) ctx.lineTo(Math.round(x), Math.round(y));
        else ctx.moveTo(Math.round(x), Math.round(y));
      });
      ctx.fill();
    }
    function repeat(spacing, speed, paint) {
      const offset = ((camera * speed) % spacing + spacing) % spacing;
      const shift = Math.floor(camera * speed / spacing);
      for (let i = -1; i < Math.ceil(640 / spacing) + 1; i++) paint(i * spacing - offset, i + shift);
    }
    rect(palette.sky, 0, 0, 640, 320);
    rect(palette.haze, 0, 90, 640, 180);
    if (atmosphere?.phase === "night") {
      rect("#c9d6d5", 466, 40, 26, 34);
      rect(palette.sky, 475, 37, 22, 28);
      for (let i = 0; i < 12; i++) rect("#a9bdbc", (i * 137 + 41) % 640, 15 + i % 4 * 19, 2, 2);
    } else {
      rect("#d9b895", 458, 42, 42, 42);
      rect("#eed6a9", 464, 38, 30, 50);
    }
    repeat(220, 0.06, x => {
      rect("#a7aaa3", x + 24, 58, 64, 5);
      rect("#a7aaa3", x + 10, 63, 105, 4);
    });
    repeat(210, 0.14, (x, i) => {
      const peak = 112 + Math.abs(i % 3) * 17;
      shape(palette.far, [[x, 218], [x + 80, peak], [x + 135, peak + 30], [x + 210, 218]]);
      shape(palette.middle, [[x, 246], [x + 106, 170], [x + 210, 246]]);
    });
    rect(palette.middle, 0, 228, 640, 42);
    if (terrain === "woodland") {
      repeat(82, 0.3, x => {
        rect("#3b554f", x + 32, 132, 8, 118);
        shape("#3b554f", [[x, 197], [x + 36, 82], [x + 74, 197]]);
      });
      repeat(172, 0.55, (x, i) => {
        const top = 72 + Math.abs(i % 3) * 12;
        rect("#343c35", x + 57, top + 45, 15, 213 - top);
        rect("#776950", x + 64, top + 55, 4, 203 - top);
        shape("#2d493f", [[x + 3, top + 67], [x + 12, top + 24], [x + 39, top + 24],
          [x + 39, top], [x + 88, top], [x + 88, top + 18], [x + 122, top + 18],
          [x + 132, top + 68], [x + 96, top + 85], [x + 30, top + 85]]);
        rect("#52745b", x + 42, top + 5, 38, 9);
        rect("#456950", x + 14, top + 30, 27, 8);
        rect("#44634b", x + 91, top + 27, 27, 11);
      });
    } else if (terrain === "streets") {
      repeat(116, 0.5, (x, i) => {
        const roof = 115 + Math.abs(i % 3) * 18;
        rect("#4a4b60", x + 8, roof - 20, 12, 25);
        rect(i % 2 ? "#8f807e" : "#7e7c86", x, roof, 104, 126);
        shape("#494b5e", [[x - 5, roof], [x + 48, roof - 30], [x + 109, roof]]);
        rect("#b5a18e", x, roof, 104, 4);
        for (const column of [13, 43, 73]) {
          rect("#454b60", x + column - 2, roof + 18, 19, 26);
          rect("#e7bd87", x + column, roof + 20, 15, 20);
          rect("#797171", x + column + 6, roof + 20, 3, 20);
          rect("#797171", x + column, roof + 29, 15, 2);
        }
        rect("#4c4c58", x + 42, 211, 22, 35);
        rect("#b4a08b", x, 243, 104, 5);
      });
    } else if (terrain === "rocky") {
      repeat(170, 0.45, x => {
        shape("#53636c", [[x - 20, 249], [x + 34, 157], [x + 61, 143],
          [x + 121, 218], [x + 170, 249]]);
        shape("#9b9e93", [[x + 34, 157], [x + 61, 143], [x + 80, 188], [x + 48, 177]]);
        shape("#707e7d", [[x + 61, 143], [x + 121, 218], [x + 85, 211]]);
      });
    } else {
      repeat(240, 0.35, x => {
        shape("#a3a47a", [[x - 40, 250], [x + 80, 203], [x + 240, 250]]);
        shape("#71865e", [[x, 250], [x + 170, 218], [x + 270, 250]]);
      });
      repeat(46, 0.65, x => {
        rect("#665d49", x, 236, 4, 22);
        rect("#a69c73", x, 241, 46, 3);
        rect("#a69c73", x, 250, 46, 3);
      });
    }
    rect("#303d36", 0, 258, 640, 12);
    repeat(37, 0.8, x => {
      rect(palette.rim, x + 6, 254, 2, 8);
      rect(palette.middle, x + 10, 250, 3, 12);
    });
    rect(palette.ground, 0, 270, 640, 50);
    rect(palette.rim, 0, 270, 640, 3);
    rect("#34383a", 0, 273, 640, 3);
    repeat(48, 1, (x, i) => {
      rect("#877b66", x + 8, 283 + Math.abs(i % 3) * 5, 11, 2);
      rect("#393d3b", x + 28, 304, 16, 3);
      if (terrain === "streets") {
        rect("#8c8580", x, 277, 1, 17); rect("#8c8580", x, 294, 48, 1);
      }
    });
    if (atmosphere) drawPursuitAtmosphere(ctx, atmosphere, attempt.difficulty,
      atmosphereSpeed, atmosphereFrame, reducedMotion, "background");
    const victory = victoryElapsed === undefined ? null : victoryElapsed / 2400;
    const pursuerX = victory === null
      ? engine.status === "escaped" ? -28 : 16 + engine.hits * 24
      : 16 + engine.hits * 24 + Math.min(1, victory / 0.3) * 40;
    const fall = victory === null ? 0 : Math.max(0, Math.min(1, (victory - 0.2) / 0.3));
    const animationTick = engine.tick + (victoryElapsed ?? 0) * 60 / 1000;
    const pursuerStride = Math.floor(animationTick / 7) % 2;
    if (fall) {
      ctx.save();
      ctx.translate(pursuerX + 10, 268);
      ctx.rotate(fall * Math.PI / 2);
      ctx.translate(-pursuerX - 10, -268);
    }
    rect("#303533", pursuerX - 3, 268, 27, 2);
    rect("#252d39", pursuerX + 4, 258, 5, pursuerStride ? 8 : 10);
    rect("#252d39", pursuerX + 13, 258, 5, pursuerStride ? 10 : 7);
    rect("#949a9b", pursuerX + 2, pursuerStride ? 265 : 268, 8, 2);
    rect("#949a9b", pursuerX + 12, pursuerStride ? 268 : 263, 9, 2);
    shape("#9099a1", [[pursuerX + 5, 245], [pursuerX + 15, 245],
      [pursuerX + 22, 261], [pursuerX, 261]]);
    shape("#424e60", [[pursuerX + 6, 246], [pursuerX + 14, 246],
      [pursuerX + 20, 260], [pursuerX + 2, 260]]);
    rect("#697689", pursuerX + 5, 247, 3, 10);
    rect("#b5a28a", pursuerX + 16, 252 + pursuerStride * 2, 4, 4);
    rect("#b5a28a", pursuerX + 7, 236, 10, 9);
    rect("#303b4b", pursuerX + 5, 232, 12, 6);
    rect("#9099a1", pursuerX + 3, 237, 17, 2);
    rect("#252d39", pursuerX + 15, 241, 2, 1);
    if (fall) ctx.restore();
    if (fall === 1) {
      rect("#c7b394", pursuerX + 30, 260, 3, 3);
      rect("#c7b394", pursuerX + 39, 255, 4, 2);
      rect("#c7b394", pursuerX + 48, 263, 3, 2);
    }
    for (const obstacle of escapeObstacles(attempt.seed, attempt.version, attempt.difficulty?.level, engine.tick)) {
      const x = obstacle.x - camera, y = (obstacle.bottom ?? 270) - obstacle.height;
      const w = obstacle.width, h = obstacle.height;
      if (obstacle.kind === "gap") {
        rect("#202b35", x, 270, w, 50);
        rect("#111d28", x + 6, 279, w - 12, 41);
        rect("#b5a080", x - 3, 270, 3, 13);
        rect("#b5a080", x + w, 270, 3, 13);
        rect("#746b5c", x + 3, 292, 4, 12);
        rect("#746b5c", x + w - 8, 285, 4, 12);
        continue;
      }
      if (obstacle.kind === "overhead") {
        rect("#c4b38e", x, y, w, h);
        rect("#64513e", x + 2, y + 3, w - 4, h - 5);
        rect("#d8b16b", x + 6, y + h - 4, w - 12, 3);
        rect("#899c90", x + 9, y - 45, 3, 45);
        rect("#899c90", x + w - 12, y - 45, 3, 45);
        continue;
      }
      if (obstacle.kind === "cart" || obstacle.kind === "bouncer") {
        rect("#363c36", x - 3, 273, w + 6, 3);
        rect("#e7bd77", x, y, w, h);
        rect("#9a694c", x + 2, y + 3, w - 4, h - 5);
        rect("#efca87", x + 4, y + 5, w - 8, 3);
        if (obstacle.kind === "cart") {
          rect("#303746", x + 3, y + h - 6, 7, 6);
          rect("#303746", x + w - 10, y + h - 6, 7, 6);
          rect("#d8c49b", x + 5, y + h - 4, 3, 2);
          rect("#d8c49b", x + w - 8, y + h - 4, 3, 2);
        } else {
          for (let coil = y + h; coil < 270; coil += 4) {
            rect("#a9b5b1", x + (Math.floor(coil / 4) % 2 ? 10 : 14), coil, 7, 2);
          }
        }
        continue;
      }
      rect("#303533", x - 3, 273, w + 6, 3);
      rect("#ecd0a0", x, y, w, h);
      if (obstacle.kind === "crate" || obstacle.kind === "stack") {
        rect("#755038", x + 2, y + 2, w - 4, h - 2);
        rect("#be9563", x + 4, y + 3, w - 8, h - 5);
        rect("#816044", x + 7, y + 4, 2, h - 6);
        rect("#816044", x + w - 10, y + 4, 2, h - 6);
        shape("#e5c08b", [[x + 3, y + 3], [x + 7, y + 3], [x + w - 3, y + h - 3], [x + w - 7, y + h - 3]]);
        if (obstacle.kind === "stack") rect("#e5c08b", x + 2, y + Math.floor(h / 2), w - 4, 3);
      } else if (obstacle.kind === "hurdle") {
        rect("#c7b689", x, y, w, 5);
        rect("#827254", x + 2, y + 5, 4, h - 5);
        rect("#827254", x + w - 6, y + 5, 4, h - 5);
        rect("#314439", x + 6, y + 5, w - 12, h - 5);
      } else if (obstacle.kind === "platform") {
        rect(terrain === "streets" ? "#827a73" : "#6e7664", x + 2, y + 4, w - 4, h - 4);
        rect("#a9ac8a", x + 2, y + 2, w - 4, 3);
        for (let joint = 24; joint < w; joint += 32) rect("#4d5750", x + joint, y + 6, 2, h - 6);
      } else if (terrain === "woodland") {
        rect("#79543c", x + 2, y + 3, w - 4, h - 4);
        rect("#b98b55", x + 3, y + 5, w - 6, 2);
        rect("#d4ae73", x + w - 7, y + 2, 5, h - 4);
        rect("#805b40", x + w - 5, y + 5, 2, h - 9);
      } else if (terrain === "streets") {
        rect("#ae7750", x + 2, y + 2, w - 4, h - 2);
        rect("#54453e", x + 4, y + 7, w - 8, 3);
        rect("#e4c188", x + 4, y + 2, 3, h - 2);
        rect("#e4c188", x + w - 7, y + 2, 3, h - 2);
      } else {
        rect(terrain === "rocky" ? "#8d928e" : "#a28c5c", x + 2, y + 3, w - 4, h - 3);
        rect("#bbb69b", x + 4, y + 4, Math.floor(w / 2), 3);
        rect("#626961", x + w - 8, y + 7, 5, h - 7);
      }
    }
    const x = engine.x - camera + (victory ?? 0) * 560, y = victory === null ? Math.round(engine.y) : 244;
    const stride = victory !== null || engine.grounded ? Math.floor(animationTick / 7) % 2 : 1;
    rect("#363c36", x - 3, 268, 24, 2);
    rect("#30323e", x + 4, y + 18, 5, stride ? 6 : 8);
    rect("#30323e", x + 11, y + 18, 4, stride ? 8 : 5);
    rect("#d9be98", x + (stride ? 2 : 4), y + 24, 7, 2);
    rect("#d9be98", x + 11, y + (stride ? 24 : 21), 7, 2);
    rect("#453d38", x + 3, y + 9, 12, 12);
    rect(engine.tick < engine.invulnerableUntil ? "#e6b66e" : "#bb624c", x + 5, y + 10, 9, 10);
    rect("#e6bc8c", x + 12, y + 14, 4, 5);
    rect("#8e704c", x, y + 11, 5, 9);
    rect("#d2ab6d", x + 1, y + 12, 2, 6);
    rect("#e6bc8c", x + 7, y + 2, 9, 8);
    rect("#513e36", x + 6, y, 10, 4);
    rect("#513e36", x + 6, y + 3, 3, 4);
    rect("#292f39", x + 14, y + 5, 1, 2);
    rect("#e3bb6c", x + 3, y + 9, 11, 3);
    rect("#e3bb6c", x, y + 11 + stride, 4, 3);
    const exit = escapeCourse(attempt.version, attempt.difficulty?.level).length - camera;
    rect("#dfd5af", exit, 172, 4, 98);
    shape("#a4c99c", [[exit + 4, 174], [exit + 35, 182], [exit + 4, 195]]);
    if (atmosphere) drawPursuitAtmosphere(ctx, atmosphere, attempt.difficulty,
      atmosphereSpeed, atmosphereFrame, reducedMotion, "foreground");
  }
  dialog.addEventListener("keydown", event => {
    if (event.target?.tagName === "SELECT" || event.target?.tagName === "BUTTON" && event.target !== jump) return;
    if (![" ", "ArrowUp", "ArrowRight", "ArrowLeft", "ArrowDown"].includes(event.key) || help.open) return;
    event.preventDefault(); event.stopPropagation();
    if (!event.repeat && [" ", "ArrowUp"].includes(event.key)) jumpRequested = true;
  });
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    if (!context()?.state.pursuit?.pending) dialog.close();
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    stop(); if (help.open) help.close();
    doc.querySelector("#ascii-map")?.focus({ preventScroll: true });
  });
  doc.addEventListener("visibilitychange", () => {
    if (doc.hidden && running) finish(true);
    else if (!doc.hidden && dialog.open && !running && !result && attempt?.status === "ready") launch();
  });
  doc.addEventListener("close", () => queueMicrotask(update), true);
  function update() {
    const current = context(), state = current?.state, info = pursuitStatus(state);
    // The protected-day countdown is deliberately not surfaced: newspapers and
    // inhabitants hint at the pursuit in-world instead of a mechanical notice.
    const concealed = !info || info.stage === "grace";
    status.hidden = concealed;
    if (!info) return;
    if (!concealed) {
      status.textContent = text(info.stage, { hours: Math.ceil(info.grace / 60), km: info.gap.toFixed(1) });
      status.title = text("pace");
      status.dataset.feedback = ["near", "danger", "escape"].includes(info.stage) ? "failure" : "";
    }
    const pending = state.pursuit.pending;
    if (!pending) return;
    const next = `${state.startedAt}:${pending.id}`;
    if (identity === next) return;
    if (current.busy || current.otherPending || doc.querySelector("dialog[open]")) return;
    identity = next; attempt = pending; result = undefined; errorText = ""; victoryElapsed = undefined;
    title.textContent = text("title");
    const difficulty = pending.difficulty;
    const atmosphere = pending.atmosphere;
    atmosphereText = atmosphere ? text("atmosphere", {
      phase: text(`phase_${atmosphere.phase}`), rain: text(`rain_${atmosphere.precipitation}`),
      fog: text(`fog_${atmosphere.fog}`),
    }) : "";
    helpDetails = [
      text("escape"), atmosphereText,
      difficulty ? text("difficulty", {
        ...difficulty, modifier: difficulty.modifier > 0 ? `+${difficulty.modifier}` : difficulty.modifier,
      }) : "",
      difficulty && difficulty.modifier > 0 ? text("paceImposed") : "",
      pending.version >= 5 && difficulty.level >= 8 ? text("expert") : "",
      text("pace"), text("rules"), text("chase"),
      pending.version >= 4 ? `${text("obstacles")}${difficulty.level >= 8 ? ` ${text("moving")}` : ""}` : "",
      pending.version >= 7 && difficulty.level >= 4 ? text("demanding") : "",
    ].filter(Boolean).join(" ");
    canvas.setAttribute("aria-label", `${text(pending.terrain)} ${text("chase")} ${atmosphereText}`);
    canvas.hidden = false;
    captureImage.hidden = true;
    captureImage.alt = text("captureImage");
    if (!captureImage.src) captureImage.src = new URL("./public/pursuit-capture.png", import.meta.url).href;
    start.textContent = text("start"); jump.textContent = text("jump");
    helpButton.textContent = text("help"); resume.textContent = text("resume");
    retry.textContent = text("retry"); close.textContent = text("close");
    // The escape begins on its own after the in-game countdown; the start
    // button only reappears if saving the start fails.
    start.hidden = true;
    start.disabled = false;
    jump.disabled = close.disabled = true; retry.hidden = true;
    engine = createEscape(pending.seed, pending.version, pending.difficulty?.level); draw();
    feedback.textContent = "";
    if (pending.status === "active") {
      feedback.textContent = text("restored");
      result = { jumps: [], ticks: 0, abandoned: true };
      retry.hidden = false;
    }
    dialog.showModal();
    if (pending.status === "ready") queueMicrotask(launch);
  }
  function reset() {
    stop(); identity = undefined; result = undefined; victoryElapsed = undefined;
    canvas.hidden = false; captureImage.hidden = true;
    if (help.open) help.close();
    if (dialog.open) dialog.close();
    status.hidden = true;
  }
  return { update, reset };
}
