import { createInvestigation, investigate, investigationHint, INVESTIGATION_ACTIONS } from "../legend-adventure.mjs";
import { COPY } from "../legend-adventure-copy.mjs";
import { createPlatformer, stepPlatformer, platformHazardActive, platformRoomSolved,
  ROOMS, WIDTH, HEIGHT, STEP } from "./legend-platformer.mjs";
import { generatePlatformLevel } from "./legend-layout.mjs";
import { adventureCosts, dungeonCosts } from "../adventure-costs.mjs";
import { replayInvestigation, replayLegendSession, isDungeonSession,
  hasDungeonFood, isPlatformSession, isGeneratedInvestigation, isTreasureSession } from "../legend-session.mjs";
import { createDungeon, generateDungeon, stepDungeon, dungeonCreature, dungeonGateOpen,
  dungeonSpikesActive, DUNGEON_DIRECTIONS, dungeonMechanisms, dungeonTarget } from "./legend-dungeon.mjs";
import { drawPixelSprite, drawPixelDoor, drawStoneTile, pixelSet } from "./legend-pixel-art.mjs";
import { generateInvestigation, createGeneratedInvestigation, stepInvestigation,
  investigationCommands, generatedInvestigationHint } from "./legend-investigation.mjs";
import { INVESTIGATION_COPY } from "./legend-investigation-copy.mjs";

function rectangle(ctx, color, x, y, width, height) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

function person(ctx, x, y, name = "explorer", scale = 2) {
  drawPixelSprite(ctx, name, x - 5, y + 26 - 15 * scale, scale);
}

function reel(ctx, x, y) {
  drawPixelSprite(ctx, "reel", x - 16, y - 16);
}

function backdrop(ctx, image, set) {
  rectangle(ctx, "#141827", 0, 0, WIDTH, HEIGHT);
  for (let y = 0; y < 288; y += 32) for (let x = 0; x < WIDTH; x += 32) {
    drawStoneTile(ctx, x, y, 32, true, (x + y) % 64 === 0, set);
  }
  rectangle(ctx, "rgba(20,24,39,.45)", 0, 32, WIDTH, 256);
  if (image) {
    const height = image.naturalWidth * 288 / WIDTH;
    ctx.drawImage(image, 0, (image.naturalHeight - height) / 2, image.naturalWidth, height, 0, 0, WIDTH, 288);
    rectangle(ctx, "rgba(20,24,39,.65)", 0, 0, WIDTH, 288);
  } else {
    for (let x = 40; x < WIDTH - 40; x += 144) {
      rectangle(ctx, "#141827", x - 4, 56, 64, 96);
      rectangle(ctx, "#a4acc2", x, 60, 56, 84);
      rectangle(ctx, "#326878", x + 4, 64, 48, 76);
      rectangle(ctx, "#66b8c5", x + 8, 68, 8, 40);
      rectangle(ctx, "#141827", x + 24, 64, 4, 76);
      rectangle(ctx, "#141827", x + 4, 100, 48, 4);
      rectangle(ctx, "#a4acc2", x - 8, 144, 72, 8);
      drawPixelSprite(ctx, set.prop, x + 72, 100, 2, { set });
    }
  }
  rectangle(ctx, "#a4acc2", 0, 284, WIDTH, 4);
  for (let x = 0; x < WIDTH; x += 32) drawStoneTile(ctx, x, 288, 32, false, x % 64 === 0, set);
}

function drawPlatform(ctx, state, images, set) {
  const room = (state.level?.rooms ?? ROOMS)[state.room];
  backdrop(ctx, images[room.background ?? "passage"] ?? images.passage ?? images.interior, set);
  for (const platform of room.platforms) {
    rectangle(ctx, "#141827", platform.x, platform.y, platform.width, platform.height);
    rectangle(ctx, "#e8b65c", platform.x, platform.y, platform.width, 3);
    rectangle(ctx, "#b87848", platform.x, platform.y + 3, platform.width, platform.height - 5);
    for (let x = platform.x + 16; x < platform.x + platform.width; x += 24) {
      rectangle(ctx, "#704333", x, platform.y + 4, 2, platform.height - 4);
    }
  }
  for (const ladder of [room.ladder, room.challengeLadder].filter(Boolean)) {
    const { x, top, bottom } = ladder;
    rectangle(ctx, "#141827", x - 13, top, 6, bottom - top);
    rectangle(ctx, "#141827", x + 9, top, 6, bottom - top);
    rectangle(ctx, "#e8b65c", x - 11, top, 3, bottom - top);
    rectangle(ctx, "#e8b65c", x + 11, top, 3, bottom - top);
    for (let y = top + 4; y < bottom; y += 14) {
      rectangle(ctx, "#141827", x - 10, y + 2, 23, 4);
      rectangle(ctx, "#b87848", x - 10, y, 23, 3);
    }
  }
  for (const hazard of room.hazards) {
    rectangle(ctx, "#111c1b", hazard.x, 278, hazard.width, 42);
    if (platformHazardActive(hazard, state.ticks ?? 0)) {
      for (let offset = 0; offset < hazard.width; offset += 16) {
        drawPixelSprite(ctx, "spikes", Math.min(hazard.x + offset, hazard.x + hazard.width - 16), 276, 1);
      }
    } else {
      rectangle(ctx, "#a4acc2", hazard.x, 284, hazard.width, 4);
    }
    rectangle(ctx, "#141827", hazard.x - 12, 259, 8, 24);
    rectangle(ctx, "#fff09b", hazard.x - 10, 261, 4, 12);
    rectangle(ctx, "#db6656", hazard.x - 10, 277, 4, 4);
  }
  if (state.level) {
    for (const door of room.connections) {
      drawPixelDoor(ctx, door.x - 14, door.y - 22, { direction: door.direction, scale: 3, set,
        open: door.target < room.id || platformRoomSolved(state, room) });
    }
    if (room.challenge && !platformRoomSolved(state, room)) {
      for (const [index, point] of (room.challenges ?? [room.challenge]).entries()) {
        if (state.activated?.includes(`${room.id}:${index}`)) continue;
        const sprite = { switch: "lever", key: "key", jump: "bell", timing: "lever" }[point.family];
        drawPixelSprite(ctx, sprite, point.x - 6, point.y - 4);
      }
    }
    if (room.treasure && !state.completed) reel(ctx, room.treasure.x + 9, room.treasure.y + 9);
    if (room.pickup && state.health !== null && !state.collected.includes(state.room)) {
      drawPixelSprite(ctx, "supply", room.pickup.x - 6, room.pickup.y - 4);
    }
    person(ctx, state.x, state.y);
    return;
  }
  const doorOpen = state.room === 0 ? state.switchOn : state.room === 1 ? state.key : true;
  drawPixelDoor(ctx, 590, 240, { open: Boolean(doorOpen), scale: 3, set });
  if (state.room === 0) {
    drawPixelSprite(ctx, "lever", 140, 156, 2, { active: state.switchOn });
  } else if (state.room === 1 && !state.key) {
    drawPixelSprite(ctx, "key", 344, 252);
  } else if (state.room === 2) {
    rectangle(ctx, "#a28a62", 500, 280, 50, 8);
    if (!state.completed) reel(ctx, 528, 266);
  }
  person(ctx, state.x, state.y);
}

function drawInvestigation(ctx, state, images, set) {
  backdrop(ctx, images[state.location === "foyer" ? "passage" : "interior"] ?? images.passage ?? images.interior, set);
  if (state.location === "foyer") {
    rectangle(ctx, "#141827", 104, 144, 88, 76);
    rectangle(ctx, "#e8b65c", 108, 148, 80, 68);
    rectangle(ctx, "#704333", 112, 152, 72, 60);
    rectangle(ctx, "#326878", 116, 156, 64, 52);
    drawPixelSprite(ctx, "bell", 126, 158, 3);
    person(ctx, 230, 262, "caretaker", 3);
    person(ctx, 450, 262, "repairer", 3);
    drawPixelSprite(ctx, "crate", 382, 240, 3);
    drawPixelSprite(ctx, "lever", 390, 228, 2);
    drawPixelDoor(ctx, 530, 192, { set, scale: 6 });
    rectangle(ctx, "#141827", 38, 224, 112, 40);
    rectangle(ctx, "#db6656", 42, 228, 104, 8);
    for (let x = 46; x < 142; x += 20) rectangle(ctx, "#e8b65c", x, 244, 12, 12);
    rectangle(ctx, "#704333", 38, 264, 8, 24);
    rectangle(ctx, "#704333", 142, 264, 8, 24);
  } else if (state.location === "archive") {
    rectangle(ctx, "#141827", 240, 120, 160, 168);
    rectangle(ctx, "#b87848", 244, 124, 152, 164);
    rectangle(ctx, "#323852", 252, 132, 136, 148);
    for (let y = 160; y < 280; y += 36) {
      for (let x = 260; x < 380; x += 14) {
        rectangle(ctx, x % 3 ? "#704333" : "#326878", x, y - 22, 10, 22);
        rectangle(ctx, "#e8b65c", x + 2, y - 18, 6, 2);
      }
      rectangle(ctx, "#e8b65c", 252, y, 136, 4);
    }
    if (!state.archiveOpen) {
      drawPixelDoor(ctx, 272, 152, { open: false, scale: 6, set });
    }
    if (state.archiveOpen && !state.inventory.includes("key")) {
      drawPixelSprite(ctx, "key", 292, 184, 3);
    }
    drawPixelSprite(ctx, "crate", 100, 240, 3);
    drawPixelSprite(ctx, "reel", 108, 216, 2);
    drawPixelSprite(ctx, "cobweb", 404, 136, 3);
  } else {
    rectangle(ctx, "#141827", 302, 260, 146, 28);
    rectangle(ctx, "#b87848", 306, 260, 138, 8);
    rectangle(ctx, "#704333", 312, 268, 8, 20);
    rectangle(ctx, "#704333", 430, 268, 8, 20);
    if (!state.completed) reel(ctx, 380, 246);
    rectangle(ctx, "#141827", 78, 208, 84, 60);
    rectangle(ctx, "#59617c", 82, 212, 76, 48);
    drawPixelSprite(ctx, "reel", 70, 180, 3);
    drawPixelSprite(ctx, "reel", 116, 180, 3);
    rectangle(ctx, "#a4acc2", 156, 226, 20, 16);
    rectangle(ctx, "#e8b65c", 86, 248, 8, 8);
    rectangle(ctx, "#323852", 92, 268, 8, 20);
    rectangle(ctx, "#323852", 144, 268, 8, 20);
    if (!state.boothOpen) {
      rectangle(ctx, "#859383", 274, 140, 8, 148);
      rectangle(ctx, "#859383", 470, 140, 8, 148);
      rectangle(ctx, "#859383", 274, 140, 204, 8);
      for (let x = 290; x < 470; x += 25) rectangle(ctx, "#859383", x, 148, 4, 140);
      drawPixelSprite(ctx, "key", 270, 218, 2);
    }
  }
  person(ctx, 192, 262, "explorer", 3);
}

export function mount(container, { format, language = "en", seed = 1, backgrounds = {},
  tier = "modest", weapon = "none", generatedInvestigation = false, paced = false,
  onFinish = () => {}, onError = () => {}, authoritative } = {}) {
  if (!["platform", "investigation", "dungeon"].includes(format)) throw new RangeError("Unknown legend adventure format.");
  if (generatedInvestigation && (format !== "investigation" || authoritative)) {
    throw new Error("Generated investigation is available only in the isolated preview.");
  }
  const generated = generatedInvestigation || isGeneratedInvestigation(authoritative?.contentVersion);
  const liveDungeon = isDungeonSession(authoritative?.contentVersion);
  const local = Boolean(authoritative?.local);
  const livePlatform = isPlatformSession(authoritative?.contentVersion);
  if (liveDungeon && (format !== "dungeon" || tier !== "modest" || weapon !== "none")) {
    throw new Error("Live dungeon requires its canonical modest profile and equipment.");
  }
  if (generated && authoritative && (format !== "investigation" || tier !== "modest")) {
    throw new Error("Live generated investigation requires its fixed modest profile.");
  }
  if (!Object.hasOwn(COPY, language)) throw new RangeError("Unknown legend adventure language.");
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const copy = COPY[language];
  const art = pixelSet(seed);
  const root = doc.createElement("section");
  root.className = "legend-game";
  const listeners = [];
  function listen(target, event, callback) {
    target.addEventListener(event, callback);
    listeners.push(() => target.removeEventListener(event, callback));
  }
  function element(tag, text, parent = root) {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    parent.append(node);
    return node;
  }
  function button(text, callback, parent = root) {
    const node = element("button", text, parent);
    node.type = "button";
    listen(node, "click", callback);
    return node;
  }
  function shortcut(node, label, key, display = key) {
    node.textContent = label;
    node.setAttribute("aria-keyshortcuts", key);
    const hint = element("kbd", ` (${display})`, node);
    hint.setAttribute("aria-hidden", "true");
    node.setAttribute("aria-label", `${label} (${display})`);
    return node;
  }
  function directions(parent, callback) {
    const pad = element("div", undefined, parent);
    pad.className = "legend-dpad";
    pad.setAttribute("role", "group");
    pad.setAttribute("aria-label", copy.movement);
    const nodes = new Map();
    for (const [direction, key, symbol] of [
      ["up", "ArrowUp", "\u2191"], ["left", "ArrowLeft", "\u2190"],
      ["down", "ArrowDown", "\u2193"], ["right", "ArrowRight", "\u2192"],
    ]) {
      const node = shortcut(button(copy.directions[direction], () => callback(direction), pad),
        copy.directions[direction], key, symbol);
      node.className = "legend-control";
      node.dataset.direction = direction;
      nodes.set(direction, node);
    }
    return nodes;
  }
  const heading = element("h2", copy[format]);
  element("p", isTreasureSession(authoritative?.contentVersion) ? language === "fr"
    ? "Retrouvez le souvenir caché au bout des huit salles. Observez les passages, les mécanismes et les indices."
    : "Recover the hidden memento beyond the eight rooms. Watch the passages, mechanisms and clues."
    : livePlatform ? copy.platformLiveHelp : liveDungeon ? copy[local ? "dungeonLocalHelp" : "dungeonLiveHelp"] :
    generated ? INVESTIGATION_COPY[language][local ? "localHelp" : authoritative ? "liveHelp" : "help"] : copy[`${format}Help`]);
  if (hasDungeonFood(authoritative?.contentVersion)) element("p", copy.dungeonFoodHelp);
  const pacing = element("p");
  pacing.className = "legend-pacing";
  const canvas = element("canvas");
  canvas.width = format === "dungeon" ? 360 : WIDTH;
  canvas.height = format === "dungeon" ? 280 : HEIGHT;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", copy.scene);
  canvas.tabIndex = format === "investigation" ? -1 : 0;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering is unavailable.");
  ctx.imageSmoothingEnabled = false;
  const status = element("p");
  status.setAttribute("role", "status");
  const receipt = element("p");
  receipt.className = "legend-receipt";
  receipt.setAttribute("role", "status");
  receipt.hidden = true;
  const accounting = element("p");
  accounting.className = "legend-accounting";
  const symbols = element("details");
  symbols.className = "legend-symbols";
  element("summary", `${copy.symbols} — ${copy.artSets[art.id]}`, symbols);
  const symbolList = element("div", undefined, symbols);
  for (const [name, label] of [
    ["doorOpen", copy.spriteNames.door], ["doorClosed", copy.spriteNames.lockedDoor],
    ["key", copy.spriteNames.key], ["lever", copy.spriteNames.lever],
    ...(format === "dungeon" ? [[art.bat, copy.spriteNames.bat], [art.rat, copy.spriteNames.rat],
      ["crate", copy.spriteNames.block], ["plate", copy.spriteNames.plate]] : []),
    ...(format === "platform" ? [...(livePlatform ? [] : [["supply", copy.spriteNames.supply]]), ["bell", copy.spriteNames.bell]] : []),
    ["reel", copy.spriteNames.treasure],
    ...(format === "investigation" ? [] : [["spikes", copy.spriteNames.spikes]]),
  ]) {
    const item = element("span", undefined, symbolList);
    const icon = element("canvas", undefined, item);
    icon.width = icon.height = 32;
    icon.setAttribute("aria-hidden", "true");
    const iconContext = icon.getContext("2d");
    if (!iconContext) throw new Error("Sprite key rendering is unavailable.");
    if (name === "doorOpen" || name === "doorClosed") {
      drawPixelDoor(iconContext, 0, 0, { set: art, open: name === "doorOpen" });
    } else drawPixelSprite(iconContext, name, 0, 0, 2, { set: art });
    element("span", label, item);
  }
  let level = format === "platform" ? generatePlatformLevel({ seed, tier, paced }) :
    format === "dungeon" ? generateDungeon({ seed, tier, paced }) :
    generated ? generateInvestigation({ seed, tier, paced }) : null;
  if (authoritative && format !== "investigation" && !liveDungeon && !livePlatform) throw new Error("Unsupported live adventure.");
  let state = format === "platform" ? livePlatform ? replayLegendSession({ ...authoritative, seed }) : createPlatformer({ level }) :
    format === "dungeon" ? liveDungeon ? replayLegendSession({ ...authoritative, seed }) : createDungeon({ level, weapon }) :
    generated ? authoritative ? replayLegendSession({ contentVersion: authoritative.contentVersion,
      seed, actions: authoritative.actions }) : createGeneratedInvestigation({ level }) :
    authoritative ? replayInvestigation(authoritative.actions) : createInvestigation();
  if (authoritative && state.level) level = state.level;
  let images = backgrounds;
  let redraw = () => {};
  let reported = false;
  let destroyed = false;
  let frame = null;
  function localInput(input) {
    try {
      const result = authoritative.onAction(input);
      state = result.progress;
      authoritative.health = result.state.health;
      authoritative.foodKcal = result.foodKcal;
      authoritative.status = result.interrupted ? "interrupted" : state.completed ? "completed" : "active";
    } catch (error) {
      authoritative.disabled = true;
      receipt.hidden = false;
      receipt.setAttribute("role", "alert");
      receipt.textContent = `${language === "fr" ? "Erreur" : "Error"}: ${error.message}`;
      onError(error);
    }
  }
  function showAccounting() {
    const beat = state.level?.rooms[state.room]?.pacing;
    pacing.hidden = !beat;
    pacing.textContent = beat ? copy.pacing[beat.stage] : "";
    if (format === "dungeon" && !liveDungeon) {
      accounting.textContent = copy.dungeonAccounting(state.metrics);
      return;
    }
    const rawCosts = liveDungeon ? dungeonCosts(state.metrics) : adventureCosts(state.metrics);
    const costs = authoritative?.costModifier ? authoritative.costModifier(rawCosts) : rawCosts;
    const label = authoritative
      ? local ? language === "fr" ? "Coûts locaux à valider (survie incluse)" : "Local costs awaiting settlement (survival included)" :
        language === "fr" ? "Coûts de l'aventure appliqués (survie en supplément)"
        : "Adventure charges applied (survival also applies)"
      : language === "fr" ? "Bilan provisoire, non appliqué" : "Provisional costs, not applied";
    accounting.textContent = language === "fr"
      ? `${label} : ${state.metrics.roomEntries} entrées (${state.metrics.roomsVisited.length} salles différentes), ${state.metrics.trapHits} pièges. ${costs.minutes} min, ${costs.fatigue} fatigue, ${costs.health} santé perdue, ${costs.dirt} saleté.`
      : `${label}: ${state.metrics.roomEntries} entries (${state.metrics.roomsVisited.length} distinct rooms), ${state.metrics.trapHits} traps. ${costs.minutes} min, ${costs.fatigue} fatigue, ${costs.health} health lost, ${costs.dirt} dirt.`;
    if (liveDungeon) accounting.textContent += ` ${copy.dungeonHits(state.metrics.creatureHits)}`;
  }
  function finish() {
    if ((state.completed || local && authoritative.status === "interrupted") && !reported) {
      reported = true;
      receipt.hidden = false;
      receipt.textContent = local ? language === "fr" ? "Essai arrêté. Validation des effets du voyage…" : "Attempt stopped. Settling journey effects…" :
        authoritative ? liveDungeon ? copy.dungeonLiveComplete :
          language === "fr" ? "Enquête terminée. Aucun trésor attribué." : "Investigation complete. No treasure awarded."
        : copy.completed;
      if (local) { onFinish({ completed: state.completed }); return; }
      if (authoritative) return;
      onFinish({ completed: true, format, legendId: "last-screening", preview: true,
        metrics: state.metrics, costs: format === "dungeon" ? null : adventureCosts(state.metrics) });
    }
  }
  if (generated) {
    const c = INVESTIGATION_COPY[language];
    const progress = element("p");
    const navigation = element("nav");
    navigation.setAttribute("aria-label", c.title);
    const previous = shortcut(button(c.previous, () => travel(state.room - 1), navigation), c.previous, "[");
    const next = shortcut(button(c.next, () => travel(state.room + 1), navigation), c.next, "]");
    previous.dataset.legendAction = "previous";
    next.dataset.legendAction = "next";
    const evidence = element("p");
    const inventory = element("p");
    const actions = element("div");
    actions.className = "legend-actions";
    const actionButtons = Array.from({ length: 5 }, (_, i) => button("", () => act(i), actions));
    const hint = element("p");
    hint.setAttribute("role", "status");
    const hintButton = shortcut(button(copy.hint, () => {
      const step = generatedInvestigationHint(state);
      hint.textContent = c.hints[step];
      if (["choose", "sequence", "seal"].includes(step)) hint.textContent += ` ${evidence.textContent}`;
    }), copy.hint, "I");
    hintButton.dataset.legendAction = "hint";
    function submit(action) {
      if (authoritative) {
        if (!authoritative.disabled && authoritative.status === "active") {
          if (local) { localInput(action); hint.textContent = ""; render(); }
          else authoritative.onAction(action);
        }
        return;
      }
      state = stepInvestigation(state, action);
      hint.textContent = "";
      render();
    }
    function travel(room) {
      submit({ type: "travel", room });
    }
    function act(index) {
      const command = investigationCommands(state)[index];
      if (!command || state.completed) return;
      submit({ type: "act", command });
    }
    function render() {
      const room = level.rooms[state.room], current = state.progress[state.room];
      const symbols = c.symbols[room.variant], supplies = c.parts[room.variant], controls = c.controls[room.variant];
      heading.textContent = `${c.title} — ${c.site} ${state.room + 1}/${level.rooms.length}: ${c.families[room.family][room.variant]}`;
      progress.textContent = authoritative
        ? `${c.liveProgress}: ${state.progress.filter(entry => entry.solved).length}/${level.rooms.length}`
        : `${copy.tiers[tier]}: ${level.rooms.length} ${copy.rooms}, ${copy.rewardBudget} ${level.rewardBudget}/3 | ${state.progress.filter(entry => entry.solved).length}/${level.rooms.length}`;
      status.textContent = c.messages[state.message];
      const clues = [];
      if (current.inspected && room.family === "evidence") clues.push(c.evidence(room.variant, symbols[room.answer]));
      if (current.inspected && room.family === "sequence") clues.push(c.sequenceClue(room.order.map(index => controls[index])));
      if (room.family === "witnesses") {
        for (const witness of current.witnesses) clues.push(c.witnessText(room.variant, witness, symbols[room.answer]));
      }
      if (room.seal !== undefined) {
        const reference = level.rooms[room.reference];
        const symbols = c.symbols[reference.variant];
        clues.push(c.sealRule(room.reference + 1, symbols, room.shift));
      }
      if (level.version === 2) {
        const notes = level.rooms.filter(item => state.progress[item.id].solved)
          .map(item => c.archiveEntry(item.id + 1, c.symbols[item.variant][item.answer]));
        if (notes.length) clues.push(`${c.archive}: ${notes.join("; ")}.`);
      }
      evidence.textContent = `${c.clues}: ${clues.join(" ") || copy.empty}`;
      inventory.textContent = `${copy.inventory}: ${current.parts.map(index => supplies[index]).join(", ") || copy.empty}${room.family === "sequence" ? ` | ${c.step}: ${current.sequence.length}/${room.order.length}` : ""}`;
      const disabled = state.completed || Boolean(authoritative && (authoritative.disabled || authoritative.status !== "active"));
      previous.disabled = disabled || state.room === 0;
      next.disabled = disabled || state.room === level.rooms.length - 1 || !current.solved;
      for (let index = 0; index < actionButtons.length; index++) {
        const node = actionButtons[index], command = investigationCommands(state)[index];
        node.hidden = command === undefined;
        node.disabled = disabled || current.solved;
        node.dataset.legendAction = `act:${command}`;
        if (!command) continue;
        const [type, indexText] = command.split(":"), item = Number(indexText);
        const label = type === "verify" ? `${c.verify}: ${c.symbols[level.rooms[room.reference].variant][item]}` :
          type === "inspect" ? c.inspect : type === "combine" ? c.combine :
          type === "witness" ? c.witness[item] :
          `${type === "choose" ? c.choose : type === "press" ? c.press : c.take}: ${type === "choose" ? symbols[item] : type === "press" ? controls[item] : supplies[item]}`;
        shortcut(node, label, String.fromCharCode(65 + index));
      }
      backdrop(ctx, images.interior ?? images.passage, art);
      drawPixelDoor(ctx, 534, 192, { set: art, scale: 6, open: current.solved });
      person(ctx, 220, 262, "explorer", 3);
      if (room.family === "witnesses") {
        person(ctx, 330, 262, "caretaker", 3);
        person(ctx, 430, 262, "repairer", 3);
      } else {
        rectangle(ctx, "#141827", 300, 240, 160, 12);
        rectangle(ctx, "#b87848", 304, 240, 152, 8);
        rectangle(ctx, "#704333", 308, 252, 8, 36);
        rectangle(ctx, "#704333", 440, 252, 8, 36);
        if (room.family === "assembly") {
          drawPixelSprite(ctx, room.variant ? "books" : "crate", 318, 196, 3);
          drawPixelSprite(ctx, "lever", 388, 208, 2, { active: current.solved });
        } else if (room.family === "sequence") {
          for (let index = 0; index < 3; index++) {
            drawPixelSprite(ctx, room.variant ? "bell" : "lever", 306 + index * 48, 204, 2,
              { active: current.sequence.includes(index) });
          }
        } else {
          drawPixelSprite(ctx, room.variant ? "books" : "bell", 350, 190, 3);
        }
      }
      if (state.room === level.rooms.length - 1 && !state.completed) reel(ctx, 498, 266);
      canvas.setAttribute("aria-label", `${heading.textContent}. ${evidence.textContent}`);
      showAccounting();
      finish();
    }
    listen(root, "keydown", event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const key = event.key.toUpperCase();
      const node = [...actionButtons, previous, next, hintButton]
        .find(item => item.getAttribute("aria-keyshortcuts") === key);
      if (!node || node.hidden || node.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      node.click();
    });
    redraw = render;
    render();
  } else if (format === "investigation") {
    const navigation = element("nav");
    navigation.setAttribute("aria-label", copy.investigation);
    const inventory = element("p");
    const actions = element("div");
    actions.className = "legend-actions";
    const hint = element("p");
    hint.setAttribute("role", "status");
    const navButtons = new Map();
    const actionButtons = new Map();
    function render() {
      heading.textContent = `${copy.investigation} - ${copy.locations[state.location]}`;
      status.textContent = copy.messages[state.message];
      inventory.textContent = `${copy.inventory}: ${state.inventory.map(item => copy.items[item]).join(", ") || copy.empty}`;
      for (const [location, node] of navButtons) {
        node.setAttribute("aria-current", location === state.location ? "location" : "false");
        node.disabled = state.completed || Boolean(authoritative && (authoritative.disabled || authoritative.status !== "active"));
      }
      for (const [target, node] of actionButtons) {
        node.hidden = !INVESTIGATION_ACTIONS[state.location].includes(target);
        node.disabled = state.completed || Boolean(authoritative && (authoritative.disabled || authoritative.status !== "active"));
      }
      drawInvestigation(ctx, state, images, art);
      showAccounting();
      finish();
    }
    function act(action) {
      if (authoritative) { authoritative.onAction(action); return; }
      state = investigate(state, action);
      hint.textContent = "";
      render();
    }
    for (const [index, location] of Object.keys(INVESTIGATION_ACTIONS).entries()) {
      const node = button(copy.locations[location], () => act({ type: "travel", location }), navigation);
      shortcut(node, copy.locations[location], String(index + 1));
      node.dataset.legendAction = `travel:${location}`;
      navButtons.set(location, node);
    }
    for (const [index, target] of Object.values(INVESTIGATION_ACTIONS).flat().entries()) {
      const node = button(copy.actions[target], () => act({ type: "act", target }), actions);
      shortcut(node, copy.actions[target], String.fromCharCode(65 + index));
      node.dataset.legendAction = `act:${target}`;
      actionButtons.set(target, node);
    }
    const hintButton = shortcut(button(copy.hint, () => {
      hint.textContent = copy.hints[investigationHint(state)];
    }), copy.hint, "I");
    listen(root, "keydown", event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const key = event.key.toUpperCase();
      const node = [...navButtons.values(), ...actionButtons.values(), hintButton]
        .find(item => item.getAttribute("aria-keyshortcuts") === key);
      if (!node || node.hidden || node.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      node.click();
    });
    redraw = render;
    render();
  } else if (format === "dungeon") {
    const progress = element("p");
    const objective = element("p");
    const controls = element("div");
    controls.className = "legend-controls";
    let paused = false;
    const dungeonWeapon = state.weapon;
    function act(type) {
      if (paused || state.completed || state.failed || type === "attack" && dungeonWeapon === "none" ||
          authoritative && (authoritative.disabled || authoritative.status !== "active")) return;
      if (liveDungeon) {
        if (local) { localInput({ type }); render(); }
        else authoritative.onAction({ type });
        return;
      }
      state = stepDungeon(state, { type });
      render();
    }
    const pad = directions(controls, act);
    for (const [direction, node] of pad) node.dataset.legendAction = direction;
    const actions = element("div", undefined, controls);
    actions.className = "legend-action-controls";
    const interact = shortcut(button(copy.interact, () => act("interact"), actions), copy.interact, "E");
    const attack = shortcut(button(copy.attack, () => act("attack"), actions), copy.attack, "X");
    const wait = shortcut(button(copy.wait, () => act("wait"), actions), copy.wait, "Space", copy.space);
    const retry = shortcut(button(copy.retry, () => act("retry")), copy.retry, "R");
    for (const [node, action] of [[interact, "interact"], [attack, "attack"], [wait, "wait"], [retry, "retry"]]) {
      node.dataset.legendAction = action;
    }
    const pause = shortcut(button(copy.pause, () => {
      paused = !paused;
      render();
    }), copy.pause, "P");
    pause.setAttribute("aria-pressed", "false");
    const bindings = { ArrowUp: "up", ArrowRight: "right", ArrowDown: "down", ArrowLeft: "left",
      e: "interact", E: "interact", x: "attack", X: "attack", " ": "wait", r: "retry", R: "retry" };
    listen(root, "keydown", event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (event.key === " " && event.target?.tagName === "BUTTON") return;
      if (event.key.toLowerCase() === "p") {
        event.preventDefault(); event.stopPropagation(); pause.click(); return;
      }
      if (!bindings[event.key]) return;
      event.preventDefault();
      event.stopPropagation();
      act(bindings[event.key]);
    });
    const suspend = () => { if (!state.completed && !state.failed) { paused = true; render(); } };
    listen(win, "blur", suspend);
    listen(doc, "visibilitychange", () => { if (doc.hidden) suspend(); });
    function render() {
      heading.textContent = `${copy.dungeon} - ${copy.room} ${state.room + 1}/${level.rooms.length}`;
      const room = level.rooms[state.room];
      status.textContent = paused ? copy.paused :
        liveDungeon && copy.dungeonLiveHits[state.message] || copy.dungeonMessages[state.message];
      if (!paused && state.message === "defeated" && hasDungeonFood(authoritative?.contentVersion)) {
        status.textContent = copy.dungeonFoodDefeated(authoritative.foodKcal);
      }
      const mechanisms = dungeonMechanisms(room);
      const patrolling = room.creature && !state.defeated.includes(state.room);
      objective.textContent = `${mechanisms.map(mechanism => room.mechanisms && ["switch", "key"].includes(mechanism)
        ? copy.dungeonTarget(mechanism, dungeonTarget(room, mechanism)) : copy.mechanisms[mechanism]).join(" ")} ${
        patrolling ? (room.mechanisms ? copy.creatureNames : copy.creatures)[room.creature] : copy.noCreature}${
        room.mechanisms && patrolling ? `; ${copy.patrols[room.patrol]}` : ""}. ${copy.exits}: ${room.connections.map(door =>
        copy.directions[door.direction]).join(", ")}. ${copy.gate}: ${dungeonGateOpen(state) ? copy.open : copy.closed}`;
      progress.textContent = liveDungeon
        ? `${copy.health}: ${authoritative.health}/100 | ${copy.weapons[dungeonWeapon]} | ${level.rooms.length} ${copy.rooms}`
        : `${copy.health}: ${state.health}/3 | ${copy.weapons[weapon]} | ${copy.tiers[tier]}: ${level.rooms.length} ${copy.rooms}, ${copy.rewardBudget} ${level.rewardBudget}/3`;
      rectangle(ctx, "#15221d", 0, 0, WIDTH, HEIGHT);
      const tile = 40, ox = 0, oy = 0;
      const square = (color, x, y, inset = 2) =>
        rectangle(ctx, color, ox + x * tile + inset, oy + y * tile + inset, tile - inset * 2, tile - inset * 2);
      for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) {
        drawStoneTile(ctx, x * tile, y * tile, tile, x === 0 || x === 8 || y === 0 || y === 6,
          (x + y + state.room) % 2 === 0, art);
      }
      if (images.interior) {
        ctx.globalAlpha = .15;
        ctx.drawImage(images.interior, ox + tile, oy + tile, tile * 7, tile * 5);
        ctx.globalAlpha = 1;
      }
      for (const [x, y] of [[1, 0], [7, 0], [0, 5], [8, 1]]) {
        drawPixelSprite(ctx, art.prop, x * tile + 4, y * tile + 4, 2, { set: art });
      }
      for (const door of room.connections) {
        const [x, y] = DUNGEON_DIRECTIONS[door.direction].door;
        drawPixelDoor(ctx, x * tile + 4, y * tile + 4, {
          open: door.target < state.room || dungeonGateOpen(state), direction: door.direction, set: art,
        });
      }
      if (mechanisms.includes("switch")) {
        const target = dungeonTarget(room, "switch");
        drawPixelSprite(ctx, "lever", target.x * tile + 4, target.y * tile + 4, 2,
          { active: room.mechanisms ? state.activated.includes(`${room.id}:switch`) : state.solved.includes(state.room) });
      }
      if (mechanisms.includes("key") && !(room.mechanisms
        ? state.activated.includes(`${room.id}:key`) : state.solved.includes(state.room))) {
        const target = dungeonTarget(room, "key");
        drawPixelSprite(ctx, "key", target.x * tile + 4, target.y * tile + 4);
      }
      if (mechanisms.includes("block")) {
        drawPixelSprite(ctx, "plate", 204, 124);
        drawPixelSprite(ctx, "crate", state.blocks[state.room].x * tile + 4, 124);
      }
      if (mechanisms.includes("spikes")) {
        square("#141827", 4, 3, 4);
        if (dungeonSpikesActive(state)) drawPixelSprite(ctx, "spikes", 164, 124);
        else for (const x of [170, 182]) rectangle(ctx, "#a4acc2", x, 146, 6, 4);
      }
      if (state.room === level.treasureRoom && !state.completed) reel(ctx, ox + 6.5 * tile, oy + 3.5 * tile);
      const creature = dungeonCreature(state);
      if (creature) {
        const upcoming = dungeonCreature({ ...state, tick: state.tick + 1 });
        for (const [dx, dy] of [[4, 4], [28, 4], [4, 28], [28, 28]]) {
          rectangle(ctx, "#fff09b", upcoming.x * tile + dx, upcoming.y * tile + dy, 6, 6);
        }
        rectangle(ctx, "#141827", creature.x * tile + 8, creature.y * tile + 30, 24, 4);
        drawPixelSprite(ctx, art[creature.kind], creature.x * tile + 4, creature.y * tile + 4, 2, { set: art });
      }
      person(ctx, ox + state.x * tile + 9, oy + state.y * tile + 7);
      const facing = DUNGEON_DIRECTIONS[state.facing];
      rectangle(ctx, "#f5e1b5", (state.x + .5) * tile + facing.x * 15 - 2,
        (state.y + .5) * tile + facing.y * 15 - 2, 4, 4);
      canvas.setAttribute("aria-label", `${copy.scene}. ${objective.textContent}`);
      const stopped = paused || state.completed || state.failed ||
        Boolean(authoritative && (authoritative.disabled || authoritative.status !== "active"));
      for (const node of [...pad.values(), interact, wait, retry]) node.disabled = stopped;
      attack.disabled = stopped || dungeonWeapon === "none";
      pause.disabled = state.completed || state.failed;
      shortcut(pause, paused ? copy.resume : copy.pause, "P");
      pause.setAttribute("aria-pressed", String(paused));
      showAccounting();
      finish();
    }
    redraw = render;
    render();
  } else {
    const progress = element("p");
    const exits = element("p");
    const map = element("canvas");
    map.width = WIDTH;
    map.height = 144;
    map.className = "legend-map";
    map.setAttribute("role", "img");
    map.setAttribute("aria-label", copy.map);
    const mapContext = map.getContext("2d");
    if (!mapContext) throw new Error("Adventure map rendering is unavailable.");
    const controls = element("div");
    controls.className = "legend-controls";
    const pad = directions(controls, () => {});
    const actionControls = element("div", undefined, controls);
    actionControls.className = "legend-action-controls";
    const held = new Set();
    const keyboardHeld = new Set();
    const taps = new Set();
    let paused = false;
    let last = null;
    let accumulator = 0;
    const clear = () => { held.clear(); keyboardHeld.clear(); taps.clear(); last = null; accumulator = 0; };
    const pause = button(copy.pause, () => {
      paused = !paused;
      clear();
      shortcut(pause, paused ? copy.resume : copy.pause, "P");
      pause.setAttribute("aria-pressed", String(paused));
      status.textContent = paused ? copy.paused : copy.platformMessages[state.message];
      render();
    });
    shortcut(pause, copy.pause, "P");
    pause.setAttribute("aria-pressed", "false");
    const retry = button(copy.retry, () => { if (!paused && !state.completed) taps.add("retry"); });
    shortcut(retry, copy.retry, "R");
    for (const control of ["left", "right", "up", "down", "jump", "interact"]) {
      const node = pad.get(control) ?? button(copy[control], () => {
        if (control === "jump" || control === "interact") taps.add(control);
      }, actionControls);
      node.className = "legend-control";
      if (["jump", "interact"].includes(control)) {
        shortcut(node, copy[control], control === "jump" ? "Space" : "E", control === "jump" ? copy.space : "E");
        continue;
      }
      const release = () => held.delete(control);
      listen(node, "pointerdown", event => {
        event.preventDefault();
        node.setPointerCapture(event.pointerId);
        held.add(control);
      });
      listen(node, "pointerup", release);
      listen(node, "pointercancel", release);
      listen(node, "lostpointercapture", release);
      listen(node, "keydown", event => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          held.add(control);
        }
      });
      listen(node, "keyup", event => {
        if (event.key === " " || event.key === "Enter") release();
      });
      listen(node, "blur", release);
    }
    const keyMap = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", " ": "jump", e: "interact", E: "interact" };
    listen(root, "keydown", event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === " " && event.target?.tagName === "BUTTON") return;
      if (["p", "P", "r", "R"].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) (event.key.toLowerCase() === "p" ? pause : retry).click();
        return;
      }
      const control = keyMap[event.key];
      if (!control) return;
      event.preventDefault();
      event.stopPropagation();
      if (control === "jump" || control === "interact") {
        if (!event.repeat) taps.add(control);
      } else keyboardHeld.add(control);
    });
    listen(win, "keyup", event => { keyboardHeld.delete(keyMap[event.key]); });
    listen(canvas, "blur", () => { keyboardHeld.clear(); });
    listen(win, "blur", clear);
    listen(doc, "visibilitychange", clear);
    function render() {
      heading.textContent = `${copy.platform} - ${copy.room} ${state.room + 1}/${level.rooms.length}`;
      if (!paused && status.dataset.message !== state.message) {
        status.textContent = copy.platformMessages[state.message];
        status.dataset.message = state.message;
      }
      progress.textContent = livePlatform
        ? `${copy.health}: ${authoritative.health}/100 | ${copy.checkpoint}: ${state.retries} | ${level.mainRooms} ${copy.rooms}`
        : `${copy.health}: ${state.health}/3 | ${copy.checkpoint}: ${state.retries} | ${copy.seed}: ${seed} | ${copy.tiers[tier]}: ${level.mainRooms} ${copy.rooms}, ${copy.rewardBudget} ${level.rewardBudget}/3`;
      const room = level.rooms[state.room];
      exits.textContent = `${room.challenge ? (room.challenges ?? [room.challenge])
        .map((point, index) => `${point.family === "timing" && room.pacing && room.hazards.length
          ? `${copy.platformTiming(room.hazards[0].activeTicks * STEP, (room.hazards[0].period - room.hazards[0].activeTicks) * STEP)} ${copy.platformLever}`
          : point.family === "timing" && room.pacing ? copy.platformLever : copy.platformChallenges[point.family]}${
          state.activated?.includes(`${room.id}:${index}`) ? ` (${copy.open})` : ""}`).join(" ") + ". " +
        copy.gate + ": " + (platformRoomSolved(state, room) ? copy.open : copy.closed) + ". " : ""}${copy.exits}: ${room.connections.map(door =>
        `${copy.directions[door.direction]} (${door.target + 1})`).join(", ")}${room.main ? "" : ` - ${copy.deadEnd}`}`;
      if (room.pacing && room.hazards.length && room.challenge.family !== "timing") {
        const hazard = room.hazards[0];
        exits.textContent += ` ${copy.platformTiming(hazard.activeTicks * STEP, (hazard.period - hazard.activeTicks) * STEP)}`;
      }
      map.setAttribute("aria-label", `${copy.map}. ${copy.room} ${state.room + 1}. ${exits.textContent}`);
      const minCol = Math.min(...level.rooms.map(item => item.col));
      const minRow = Math.min(...level.rooms.map(item => item.row));
      const spanCol = Math.max(...level.rooms.map(item => item.col)) - minCol + 1;
      const spanRow = Math.max(...level.rooms.map(item => item.row)) - minRow + 1;
      const size = Math.min(42, (WIDTH - 16) / spanCol, 128 / spanRow);
      const position = item => ({ x: 8 + (item.col - minCol) * size, y: 8 + (item.row - minRow) * size });
      rectangle(mapContext, "#202e2c", 0, 0, WIDTH, 144);
      for (const edge of level.edges) {
        const from = position(level.rooms[edge.from]), to = position(level.rooms[edge.to]);
        rectangle(mapContext, "#8d7956", Math.min(from.x, to.x) + size / 2,
          Math.min(from.y, to.y) + size / 2, Math.abs(to.x - from.x) + 2, Math.abs(to.y - from.y) + 2);
      }
      for (const item of level.rooms) {
        const point = position(item);
        rectangle(mapContext, item.id === state.room ? "#e5c779" : item.main ? "#8ba780" : "#6b7770",
          point.x + 3, point.y + 3, size - 6, size - 6);
        if (item.treasure) rectangle(mapContext, "#f5e1b5", point.x + size / 2 - 2, point.y + size / 2 - 2, 4, 4);
      }
      drawPlatform(ctx, state, images, art);
      showAccounting();
      const stopped = state.completed || Boolean(authoritative && (authoritative.disabled || authoritative.status !== "active"));
      pause.disabled = stopped;
      retry.disabled = stopped || paused;
      for (const node of [...pad.values(), ...actionControls.children]) node.disabled = stopped || paused;
      finish();
    }
    redraw = render;
    function tick(now) {
      if (destroyed) return;
      try {
        const visible = !doc.hidden && (!root.checkVisibility || root.checkVisibility());
        if (!visible) clear();
        if (!paused && visible && !(authoritative && (authoritative.disabled || authoritative.status !== "active"))) {
          if (last !== null) accumulator += Math.min((now - last) / 1000, 0.1);
          while (accumulator >= STEP) {
            const input = Object.fromEntries([...held, ...keyboardHeld, ...taps].map(key => [key, true]));
            if (local) localInput({ controls: input, ticks: 1 });
            else state = stepPlatformer(state, input);
            taps.clear();
            accumulator -= STEP;
            if (state.completed || local && (authoritative.disabled || authoritative.status !== "active")) break;
          }
          render();
        }
        last = now;
        if (!state.completed) frame = win.requestAnimationFrame(tick);
      } catch (error) {
        clear();
        status.textContent = `${language === "fr" ? "Erreur" : "Error"}: ${error.message}`;
        status.setAttribute("role", "alert");
        onError(error);
      }
    }
    render();
    frame = win.requestAnimationFrame(tick);
  }
  container.append(root);
  return {
    setBackgrounds(value) {
      if (destroyed) return;
      images = value;
      redraw();
    },
    destroy() {
      destroyed = true;
      if (frame !== null) win.cancelAnimationFrame(frame);
      for (const remove of listeners) remove();
      root.remove();
    },
  };
}
