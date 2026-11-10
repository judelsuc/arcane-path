const freeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

const definitions = [
  { kind: "switch", formats: ["platform", "dungeon"], slot: "reachable-object", sprite: "lever",
    clue: { en: "The brass arm wakes the silent gate.", fr: "Le bras de laiton réveille la porte muette." },
    help: { en: "Operate the nearby lever.", fr: "Actionnez le levier proche." } },
  { kind: "key", formats: ["platform", "dungeon"], slot: "reachable-object", sprite: "key",
    clue: { en: "A brass tooth fits the waiting lock.", fr: "Une dent de laiton rejoint la serrure qui attend." },
    help: { en: "Collect the nearby key.", fr: "Prenez la clé proche." } },
  { kind: "plate", formats: ["platform", "dungeon"], slot: "supported-floor", sprite: "plate",
    clue: { en: "The stone bows beneath a traveller's weight.", fr: "La pierre s'incline sous le poids d'un voyageur." },
    help: { en: "Stand on the marked pressure stone.", fr: "Marchez sur la dalle marquée." } },
  { kind: "crank", formats: ["platform", "dungeon"], slot: "reachable-object", sprite: "lever",
    clue: { en: "The wheel asks for patience, not a passing touch.", fr: "La roue réclame de la patience, pas un geste en passant." },
    help: { en: "Hold Interact for one second on platforms; operate three times in a dungeon.",
      fr: "Maintenez Interagir une seconde en plateformes ; actionnez trois fois en donjon." } },
  { kind: "crate", formats: ["platform"], slot: "clear-horizontal-rail", sprite: "crate",
    clue: { en: "Footsteps fade; the wooden weight must keep the marked stone company.",
      fr: "Les pas s'effacent ; le poids de bois doit rester auprès de la pierre marquée." },
    help: { en: "Push the crate along its rail onto the pressure plate. It catches there; Retry resets an unsolved crate.",
      fr: "Poussez la caisse sur son rail jusqu'à la dalle. Elle s'y fixe ; Réessayer replace une caisse non résolue." } },
  { kind: "bridge", formats: ["platform"], slot: "timed-crossing", sprite: "lever",
    clue: { en: "Turn the hourglass arm; cross its borrowed stones and wake the far seal before the sand sleeps.",
      fr: "Tourne le bras du sablier ; traverse ses pierres prêtées et réveille le sceau lointain avant que le sable ne dorme." },
    help: { en: "Operate the hourglass lever, cross the temporary bridge and operate the far seal within 12 seconds. Falling is safe; return to the ladder and try again.",
      fr: "Actionnez le levier au sablier, traversez le pont temporaire et actionnez le sceau opposé avant 12 secondes. Une chute est sans danger ; revenez à l'échelle pour réessayer." } },
  { kind: "mirror", formats: ["dungeon"], slot: "clear-beam-path", sprite: "mirror",
    clue: { en: "The silver face turns the dawn toward the golden eye. Follow the painted ray.",
      fr: "La face d'argent tourne l'aube vers l'œil doré. Suis le rayon peint." },
    help: { en: "Operate the mirror to rotate it a quarter-turn. Route the harmless beam into the golden receiver.",
      fr: "Actionnez le miroir pour le tourner d'un quart de tour. Dirigez le rayon inoffensif vers le récepteur doré." } },
  { kind: "weight", formats: ["dungeon"], slot: "clear-horizontal-rail", sprite: "crate",
    clue: { en: "The wooden weight belongs on the square marked with its twin.",
      fr: "Le poids de bois appartient au carré portant son jumeau." },
    help: { en: "Push the crate right along its rail onto the marked square. The rail prevents corner traps.",
      fr: "Poussez la caisse vers la droite sur son rail jusqu'au carré marqué. Le rail empêche de la coincer dans un angle." } },
  { kind: "tool", formats: ["investigation"], slot: "clued-workbench", sprite: "books",
    clue: { en: "The maintenance sketch pairs each tool with the shape of its fitting.",
      fr: "Le dessin d'entretien associe chaque outil à la forme de son empreinte." },
    help: { en: "Inspect the fitting, collect the matching tool, then use it. Wrong tools remain available.",
      fr: "Examinez l'empreinte, prenez l'outil correspondant puis utilisez-le. Un outil inadapté reste disponible." } },
  { kind: "repair", formats: ["investigation"], slot: "clued-workbench", sprite: "lever",
    clue: { en: "Two labelled parts, one repair plan, and an empty socket await a patient hand.",
      fr: "Deux pièces étiquetées, un plan de réparation et un logement vide attendent une main patiente." },
    help: { en: "Read the repair plan, collect both parts, assemble them, then install the repair. No part is consumed by a failed step.",
      fr: "Lisez le plan, prenez les deux pièces, assemblez-les puis installez la réparation. Une erreur ne consomme aucune pièce." } },
  { kind: "overlay", formats: ["investigation"], slot: "clued-workbench", sprite: "books",
    clue: { en: "Neither sheet tells the whole story; their matching corners ask to meet.",
      fr: "Aucune feuille ne raconte tout ; leurs coins assortis demandent à se rejoindre." },
    help: { en: "Collect both sheets and align them to reveal the missing symbol, then answer.",
      fr: "Prenez les deux feuilles et superposez-les pour révéler le symbole manquant, puis répondez." } },
];

export const MECHANISMS = freeze(Object.fromEntries(definitions.map(entry =>
  [entry.kind, { id: `legend-${entry.kind}`, version: 1, ...entry }])));
export const mechanismDefinition = kind => {
  if (typeof kind !== "string" || !Object.hasOwn(MECHANISMS, kind)) {
    throw new RangeError(`Unknown adventure mechanism: ${String(kind)}`);
  }
  return MECHANISMS[kind];
};

export function createMechanism(format, kind, variant = 0) {
  const definition = mechanismDefinition(kind);
  if (!definition.formats.includes(format) || !Number.isSafeInteger(variant) || variant < 0 || variant > 2) {
    throw new RangeError("Invalid mechanism format or variant.");
  }
  const recipe = { version: 1, kind, format, variant, slot: definition.slot,
    prerequisites: [], output: "unlock", reset: "retain-solved" };
  if (kind === "crate") Object.assign(recipe, { start: 144 + variant * 16, target: 256 + variant * 16,
    rail: { min: 112, max: 368 }, y: 256, width: 32, height: 32,
    links: [{ from: "crate", event: "weight", to: "plate" }, { from: "plate", event: "activate", to: "gate" }] });
  if (kind === "bridge") Object.assign(recipe, { duration: 720,
    lever: { x: 128, y: 166 }, receiver: { x: 448 + variant * 32, y: 166 },
    span: { x: 224, y: 192, width: 160 + variant * 32, height: 12 },
    links: [{ from: "lever", event: "activate", to: "bridge" }, { from: "receiver", event: "activate", to: "gate" }] });
  if (kind === "mirror") Object.assign(recipe, { source: { x: 1, y: 2 }, mirror: { x: 4, y: 2 },
    receiver: { x: 4, y: variant === 1 ? 1 : 5 }, answer: variant === 1 ? 3 : 1,
    links: [{ from: "mirror", event: "light", to: "receiver" }, { from: "receiver", event: "activate", to: "gate" }] });
  if (kind === "weight") Object.assign(recipe, { start: { x: 3, y: 3 }, target: { x: 5, y: 3 },
    links: [{ from: "crate", event: "weight", to: "plate" }, { from: "plate", event: "activate", to: "gate" }] });
  if (["tool", "repair", "overlay"].includes(kind)) Object.assign(recipe, {
    answer: variant, prerequisites: kind === "repair" ? ["inspect", "parts", "assemble", "install"] :
      kind === "overlay" ? ["sheets", "align", "answer"] : ["inspect", "tool", "use"],
    links: [{ from: "evidence", event: "unlock", to: "solution" }],
  });
  recipe.solution = ({
    switch: ["operate"], key: ["operate"], plate: ["weight"], crank: ["operate-until-latched"],
    crate: ["approach-left", "push-to-plate"], bridge: ["operate-lever", "cross-span", "operate-receiver"],
    mirror: kind === "mirror" ? Array(recipe.answer).fill("rotate") : [], weight: ["approach-left", "push-to-plate"],
    tool: ["inspect", `take:${variant}`, `use:${variant}`], repair: ["inspect", "take:0", "take:1", "combine", "install"],
    overlay: ["take:0", "take:1", "combine", `choose:${variant}`],
  })[kind];
  return freeze(recipe);
}

export const initialMechanismState = () => ({ solved: false, progress: 0, until: 0,
  angle: 0, inspected: false, items: [], assembled: false, revealed: false });

// Engines supply geometry predicates; the catalogue owns only bounded state transitions.
export function advanceMechanism(recipe, state, input) {
  const next = { ...state, items: [...state.items] };
  if (state.solved) return { state: next, message: "already", mistake: false };
  let message = "nothing", mistake = false;
  switch (recipe.kind) {
    case "switch": case "key":
      next.solved = !!input.operate; break;
    case "plate": case "crate": case "weight":
      next.solved = !!input.weight; break;
    case "crank":
      next.progress = input.operate ? state.progress + 1 : recipe.format === "platform" ? 0 : state.progress;
      next.solved = next.progress >= (recipe.format === "platform" ? 60 : 3);
      if (input.operate) message = "cranking";
      break;
    case "bridge":
      if (input.operate) { next.until = input.tick + recipe.duration; message = "bridgeOpen"; }
      if (input.receive && input.tick < next.until) next.solved = true;
      else if (input.receive) message = "bridgeClosed";
      break;
    case "mirror":
      if (input.operate) {
        next.angle = (state.angle + 1) % 4;
        next.solved = next.angle === recipe.answer;
        message = "mirrorTurn";
      }
      break;
    case "tool": case "repair": case "overlay": {
      const [command, indexText] = (input.command ?? "").split(":");
      const index = Number(indexText);
      if (command === "inspect") { next.inspected = true; message = "clue"; }
      if (command === "take") { next.items = [...new Set([...state.items, index])]; message = "supplies"; }
      if (command === "combine") {
        if (state.items.length < 2 || recipe.kind === "repair" && !state.inspected) message = "needParts";
        else if (recipe.kind === "repair") { next.assembled = true; message = "assembled"; }
        else { next.revealed = true; message = "overlayRevealed"; }
      }
      if (command === "install") {
        next.solved = state.assembled;
        message = next.solved ? "solved" : "needParts";
      }
      if (command === "use" || command === "choose") {
        const ready = recipe.kind === "tool" ? state.inspected && state.items.includes(index) : state.revealed;
        next.solved = ready && index === recipe.answer;
        message = !ready ? "needEvidence" : next.solved ? "solved" : "wrong";
        mistake = ready && !next.solved;
      }
      break;
    }
    default: throw new RangeError("Unsupported mechanism transition.");
  }
  if (next.solved) message = "challengeSolved";
  return { state: next, message, mistake };
}

export function mechanismCommands(recipe, state) {
  if (recipe.kind === "tool") return ["inspect", ...[0, 1, 2].map(i =>
    `${state.items.includes(i) ? "use" : "take"}:${i}`)];
  if (recipe.kind === "repair") return ["inspect", "take:0", "take:1", state.assembled ? "install" : "combine"];
  if (recipe.kind === "overlay") return state.revealed ? ["choose:0", "choose:1", "choose:2"] :
    ["take:0", "take:1", "combine"];
  throw new RangeError("This mechanism has no investigation command list.");
}

export function investigationHotspots(recipe, state, labels) {
  if (!["tool", "repair", "overlay"].includes(recipe.kind)) throw new RangeError("No point-and-click recipe.");
  const sprites = recipe.kind === "tool" ? ["roundKey", "squareKey", "starKey"] :
    recipe.kind === "repair" ? ["wheel", "axle"] : ["document", "document"];
  return [
    ...labels.items.flatMap((label, index) => state.items.includes(index) ? [] : [{
      id: `item:${index}`, label, sprite: sprites[index], x: 72 + index * 64, y: 196,
      width: 48, height: 48, command: `take:${index}`,
    }]),
    { id: "target", label: labels.target, sprite: recipe.kind === "tool" ? "key" :
      recipe.kind === "repair" ? "lever" : "books", x: 328, y: 192, width: 64, height: 64 },
  ];
}

export function validateMechanismPlacement(recipe, room) {
  if (recipe.version !== 1 || !mechanismDefinition(recipe.kind).formats.includes(recipe.format)) {
    throw new RangeError("Invalid mechanism recipe.");
  }
  if (recipe.kind === "crate" && (recipe.start >= recipe.target || recipe.target > recipe.rail.max ||
      recipe.start < recipe.rail.min || room.hazards.length || room.animal || room.arrowTrap ||
      room.connections.some(door => door.y === 262 && door.x >= recipe.rail.min - 28 &&
        door.x <= recipe.rail.max + recipe.width + 28))) {
    throw new Error("Crate recipe needs a clear, reversible rail.");
  }
  if (recipe.kind === "bridge" && (!room.platforms.some(p => p.x === 80 && p.y === 192 && p.width === 144) ||
      !room.platforms.some(p => p.x === recipe.span.x + recipe.span.width && p.y === 192 && p.width === 144) ||
      room.ladders.length !== 1 || room.ladders[0].x !== 128 || room.hazards.length || room.animal || room.arrowTrap)) {
    throw new Error("Bridge recipe needs its supported boarding and landing slots.");
  }
  if (recipe.kind === "mirror" && room.walls.some(p =>
    p.y === 2 && p.x >= 1 && p.x <= 4 || p.x === 4 && p.y >= 1 && p.y <= 5)) {
    throw new Error("Mirror recipe has a blocked beam path.");
  }
  if (recipe.kind === "weight" && room.walls.some(p => p.y === 3 && p.x >= 2 && p.x <= 6)) {
    throw new Error("Weight recipe has a blocked rail.");
  }
  return true;
}

export const MECHANISM_COPY = {
  en: {
    point: { examine: "Examine", combine: "Combine", use: "Use", cancel: "Cancel",
      target: { tool: "Lock fitting", repair: "Broken drive", overlay: "Reading desk" },
      with: (item, target) => `Use ${item} with ${target}`,
      combineWith: item => `Combine ${item} with…`, useWith: item => `Use ${item} with…`,
      noMatch: "Those objects do not fit together. Nothing is lost.",
      help: "Click loose objects to collect them. Highlighted objects open a small contextual menu. Click an inventory icon to examine, use or combine it, then choose a target. Escape or empty scenery cancels. Tab and Enter operate hotspots; existing A–E shortcuts remain available.",
    },
    families: { tool: ["The locked fitting", "The maintenance sketch"], repair: ["The broken mechanism", "The missing drive"],
      overlay: ["The divided chart", "The two transparencies"] },
    tools: ["round key", "square key", "star key"], shapes: ["round", "square", "star"],
    parts: { repair: ["wheel", "axle"], overlay: ["inked sheet", "pierced sheet"] },
    combined: { repair: "Wheel on its axle", overlay: "Aligned chart" },
    use: "Use", install: "Install repair", align: "Align sheets",
    messages: { bridgeOpen: "The hourglass stones awaken.", bridgeClosed: "The sand has run out.",
      mirrorTurn: "The silver face turns.", supplies: "The object joins your satchel.",
      assembled: "The wheel turns freely on its axle.", overlayRevealed: "A symbol emerges between the lines.",
      inspectRepair: "You have both parts. Examine the broken drive to read its repair plan before assembling them.",
      assembleRepair: "You have both parts. Assemble the wheel and axle before installing the repair." },
    toolClue: shape => `A maintenance sketch shows a ${shape} fitting and a key with the same outline.`,
    repairClue: "The repair plan shows a wheel threaded onto an axle, then the pair inside the empty drive.",
    overlayClue: "Matching corner marks frame the same empty space on both sheets.",
    overlayReading: symbol => `The aligned pages reveal a ${symbol}. The reading desk asks: “Which symbol appears when the pages overlap?”`,
    revealed: symbol => `Between the inked lines: ${symbol}.`,
  },
  fr: {
    point: { examine: "Observer", combine: "Assembler", use: "Utiliser", cancel: "Annuler",
      target: { tool: "Empreinte de serrure", repair: "Entraînement brisé", overlay: "Pupitre de lecture" },
      with: (item, target) => `Utiliser ${item} avec ${target}`,
      combineWith: item => `Assembler ${item} avec…`, useWith: item => `Utiliser ${item} avec…`,
      noMatch: "Ces objets ne s'accordent pas. Rien n'est perdu.",
      help: "Cliquez sur les objets libres pour les prendre. Les objets surlignés ouvrent un petit menu contextuel. Cliquez sur une icône d'inventaire pour observer, utiliser ou assembler, puis choisissez une cible. Échap ou le décor vide annule. Tab et Entrée activent les objets ; les raccourcis A–E restent disponibles.",
    },
    families: { tool: ["L'empreinte verrouillée", "Le dessin d'entretien"], repair: ["Le mécanisme brisé", "L'entraînement manquant"],
      overlay: ["La carte divisée", "Les deux transparents"] },
    tools: ["clé ronde", "clé carrée", "clé étoilée"], shapes: ["ronde", "carrée", "étoilée"],
    parts: { repair: ["roue", "axe"], overlay: ["feuille encrée", "feuille percée"] },
    combined: { repair: "Roue montée sur son axe", overlay: "Carte superposée" },
    use: "Utiliser", install: "Installer la réparation", align: "Superposer les feuilles",
    messages: { bridgeOpen: "Les pierres du sablier s'éveillent.", bridgeClosed: "Le sable s'est écoulé.",
      mirrorTurn: "La face d'argent tourne.", supplies: "L'objet rejoint votre sacoche.",
      assembled: "La roue tourne librement sur son axe.", overlayRevealed: "Un symbole émerge entre les lignes.",
      inspectRepair: "Vous avez les deux pièces. Observez l'entraînement brisé pour lire son plan de réparation avant de les assembler.",
      assembleRepair: "Vous avez les deux pièces. Assemblez la roue et l'axe avant d'installer la réparation." },
    toolClue: shape => `Un dessin d'entretien montre une empreinte ${shape} et une clé de même contour.`,
    repairClue: "Le plan montre une roue enfilée sur un axe, puis l'ensemble dans l'entraînement vide.",
    overlayClue: "Les mêmes repères d'angle encadrent un espace vide sur les deux feuilles.",
    overlayReading: symbol => `Les pages superposées révèlent le symbole : ${symbol}. Le pupitre demande : « Quel symbole apparaît lorsque les pages se superposent ? »`,
    revealed: symbol => `Entre les lignes encrées : ${symbol}.`,
  },
};
