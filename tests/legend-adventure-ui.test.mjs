import test from "node:test";
import assert from "node:assert/strict";
import { mount } from "../minigames/legend-adventure-ui.mjs";
import { generateInvestigation } from "../minigames/legend-investigation.mjs";
import { GENERATED_INVESTIGATION_VERSION, replayLegendSession, DUNGEON_SESSION_VERSION, DUNGEON_FOOD_VERSION,
  LOCAL_DUNGEON_VERSION, LOCAL_INVESTIGATION_VERSION, LOCAL_PLATFORM_VERSION, isDungeonSession,
  isPacedLegendSession, PACED_INVESTIGATION_VERSION, PACED_DUNGEON_VERSION, PACED_PLATFORM_VERSION,
  TREASURE_INVESTIGATION_VERSION, TREASURE_DUNGEON_VERSION, TREASURE_PLATFORM_VERSION, VARIED_PLATFORM_VERSION } from "../legend-session.mjs";
import { EXPANDED_PLATFORM_VERSION, EXPANDED_DUNGEON_VERSION, EXPANDED_INVESTIGATION_VERSION } from "../legend-session.mjs";
import { CATALOGUE_PLATFORM_VERSION, CATALOGUE_DUNGEON_VERSION, CATALOGUE_INVESTIGATION_VERSION } from "../legend-session.mjs";
import { stepDungeon } from "../minigames/legend-dungeon.mjs";
import { stepInvestigation } from "../minigames/legend-investigation.mjs";
import { stepPlatformer, platformRoomSolved, platformAnimal, platformArrow } from "../minigames/legend-platformer.mjs";
import { drawPixelSprite, pixelSet } from "../minigames/legend-pixel-art.mjs";
import { dungeonCompletionActions, findDungeonRoute } from "./helpers/legend-dungeon-route.mjs";
import { setupLegendSession } from "../legend-session-ui.mjs";
import { composedReward, treasureId } from "../legend-rewards.mjs";
import { generatePlatformLevel } from "../minigames/legend-layout.mjs";
import { COPY } from "../legend-adventure-copy.mjs";
import { MECHANISMS, MECHANISM_COPY } from "../minigames/legend-mechanisms.mjs";
import { variedPlatformRoute } from "./helpers/legend-varied-platform-route.mjs";
import { expandedDungeonRoute, expandedInvestigationRoute } from "./helpers/legend-expanded-route.mjs";
import { investigationScene } from "../minigames/legend-investigation-scenery.mjs";
import { DECOY_INVESTIGATION_VERSION } from "../legend-session.mjs";
import { DECOY_COPY } from "../minigames/legend-decoys.mjs";
import { ENCOUNTER_COPY } from "../minigames/legend-encounters-copy.mjs";
import { INVESTIGATION_COPY } from "../minigames/legend-investigation-copy.mjs";

class Target {
  listeners = new Map();
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatch(type, data = {}) { for (const fn of this.listeners.get(type) ?? []) fn(data); }
}

class Element extends Target {
  children = [];
  attributes = {};
  dataset = {};
  textContent = "";
  disabled = false;
  hidden = false;
  constructor(tag, doc) { super(); this.tagName = tag; this.ownerDocument = doc; }
  append(node) { node.parent = this; this.children.push(node); }
  replaceChildren() { this.children = []; }
  remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  getContext() {
    if (!this.context) {
      const rectangles = this.rectangles = [];
      const capture = this.ownerDocument.captureCanvas;
      this.context = { fillRect(x, y, width, height) {
        if (capture) rectangles.push([this.fillStyle, x, y, width, height]);
      }, fillText() {}, drawImage() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {} };
    }
    return this.context;
  }
  click() { if (!this.disabled) this.dispatch("click"); }
  setPointerCapture() {}
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch("close"); }
  focus() { this.ownerDocument.activeElement = this; }
}

function fixture(format, language = "en", { captureCanvas = false, ...options } = {}) {
  const win = new Target();
  const frames = new Map();
  let serial = 0;
  win.requestAnimationFrame = fn => { frames.set(++serial, fn); return serial; };
  win.cancelAnimationFrame = id => frames.delete(id);
  const doc = new Target();
  doc.defaultView = win;
  doc.hidden = false;
  doc.captureCanvas = captureCanvas;
  doc.createElement = tag => new Element(tag, doc);
  const container = new Element("div", doc);
  const results = [];
  const errors = [];
  const api = mount(container, { format, language, onFinish: value => results.push(value), onError: error => errors.push(error), ...options });
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const nodes = descendants(container);
  const button = text => nodes.find(node => node.tagName === "button" && node.textContent === text);
  const run = now => {
    const [id, fn] = frames.entries().next().value;
    frames.delete(id);
    fn(now);
  };
  return { win, doc, container, api, frames, nodes, results, errors, button, run };
}

test("isolated dungeon preview can resume a replayed route at room eight", () => {
  const commands = { u: "up", r: "right", d: "down", l: "left", e: "interact" };
  const previewDungeonActions = [..."uleurrrrrurreeerddddddldeeeullelullllldrrddddrdrerrdeeerrrdeddddllull"]
    .map(key => ({ type: commands[key] }));
  const f = fixture("dungeon", "fr", { seed: 0, paced: true, expanded: true, catalogue: true, previewDungeonActions });
  assert.ok(f.nodes.find(node => node.tagName === "h2").textContent.includes("8/10"));
  const right = f.nodes.find(node => node.dataset.legendAction === "right");
  assert.equal(right.disabled, false);
  right.click();
  f.win.dispatch("blur");
  assert.equal(right.disabled, true);
  const resume = f.nodes.find(node => node.dataset.legendAction === "pause");
  assert.equal(resume.parent.className, "legend-controls");
  assert.equal(resume.disabled, false);
  resume.click();
  assert.equal(right.disabled, false);
  assert.equal(f.doc.activeElement.tagName, "canvas");
  right.click();
  assert.deepEqual(f.errors, []);
  f.api.destroy();
  assert.throws(() => fixture("investigation", "en", { previewDungeonActions }), /isolated preview/);
});

test("optional levers use neutral bilingual hotspots and menus, stay visible and obey Help and pending controls", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const language of ["en", "fr"]) for (let seed = 0; seed < 2; seed++) {
    const sent = [], d = DECOY_COPY[language];
    let progress = replayLegendSession({ contentVersion: DECOY_INVESTIGATION_VERSION, seed, actions: [] });
    const authoritative = {
      contentVersion: DECOY_INVESTIGATION_VERSION, local: true, actions: [], status: "active", health: 85,
      onAction(action) {
        sent.push(action);
        progress = stepInvestigation(progress, action);
        return { progress, state: { health: 85 }, foodKcal: 0, interrupted: false };
      },
    };
    const f = fixture("investigation", language, { seed, authoritative });
    const screen = f.nodes.find(node => node.width === 640);
    assert.equal(screen.dataset.trapFlash, undefined);
    const all = () => {
      const visit = node => [node, ...node.children.flatMap(visit)];
      return visit(f.container);
    };
    const lever = () => all().find(node => node.dataset.hotspot === "decoy");
    const menu = () => all().find(node => node.className === "legend-context");
    const verb = label => menu().children.find(node => node.textContent === label);
    assert.equal(lever().getAttribute("aria-label"), d.name);
    assert.equal(lever().children[0].textContent, d.name);
    lever().focus();
    lever().click();
    assert.equal(menu().hidden, false);
    verb(d.examine).click();
    assert.equal(sent.length, 0);
    assert.ok(all().some(node => node.textContent === d.description));
    lever().click();
    const pull = verb(d.operate);
    f.nodes.find(node => node.tagName === "dialog").showModal();
    pull.click();
    assert.equal(sent.length, 0);
    f.nodes.find(node => node.tagName === "dialog").close();
    lever().click();
    verb(d.operate).click();
    assert.deepEqual(sent, [{ type: "act", command: "decoy:pull" }]);
    assert.equal(progress.metrics.trapHits, seed);
    assert.equal(progress.metrics.wrongAttempts, 1 - seed);
    assert.equal(screen.dataset.trapFlash, "a");
    const impact = all().find(node => node.className === "legend-impact");
    assert.equal(impact.hidden, false);
    t.mock.timers.tick(3000);
    assert.equal(impact.hidden, true);
    assert.equal(screen.dataset.trapFlash, "");
    assert.equal(impact.getAttribute("role"), "alert");
    assert.equal(impact.dataset.kind, seed ? "trap" : "mistake");
    assert.ok(impact.children[1].textContent.includes(seed ? "−5" : "−0"));
    assert.ok(impact.children[1].textContent.includes(seed ? "+3" : "+1"));
    f.api.setBackgrounds({});
    assert.equal(screen.dataset.trapFlash, "");
    assert.equal(impact.hidden, true);
    assert.ok(all().some(node => node.textContent === (seed ? d.trap : d.mistake)));
    const bubble = all().find(node => node.className === "legend-scene-bubble");
    assert.equal(bubble.hidden, false);
    assert.equal(bubble.textContent, seed ? d.trap : d.mistake);
    assert.equal(bubble.getAttribute("role"), "status");
    assert.equal(bubble.parent.className, "legend-game");
    assert.ok(bubble.parent.children.indexOf(bubble) < bubble.parent.children.indexOf(screen.parent));
    assert.equal(lever().getAttribute("style"), "left:72.5%;top:52.5%;width:7.5%;height:15%");
    assert.ok(lever());
    lever().click();
    verb(d.operate).click();
    assert.equal(progress.message, "decoySpent");
    assert.equal(progress.metrics.trapHits + progress.metrics.wrongAttempts, 1);
    assert.equal(screen.dataset.trapFlash, "");
    assert.equal(impact.hidden, true);
    const old = lever();
    authoritative.disabled = true;
    f.api.setBackgrounds({});
    assert.equal(lever().disabled, true);
    lever().click();
    assert.equal(sent.length, 2);
    f.api.destroy();
    for (const node of [...f.nodes, old, pull, ...all()]) for (const handlers of node.listeners.values()) {
      assert.equal(handlers.size, 0);
    }
    assert.deepEqual(f.errors, []);
  }
});

test("alignment dials name their current symbols and the clue explains how to set and test them", () => {
  for (const language of ["en", "fr"]) {
    const seed = 0, route = expandedInvestigationRoute(seed);
    const actions = [];
    let checked = 0;
    for (const action of route.actions) {
      actions.push(action);
      const state = replayLegendSession({ contentVersion: EXPANDED_INVESTIGATION_VERSION, seed, actions });
      const room = state.level.rooms[state.room], current = state.progress[state.room];
      if (room.family !== "alignment" || current.resolved || current.solved ||
          room.concealed && !current.revealed) continue;
      const f = fixture("investigation", language, { seed, authoritative: {
        contentVersion: EXPANDED_INVESTIGATION_VERSION, actions: [...actions], status: "active", onAction() {},
      } });
      for (let index = 0; index < 3; index++) {
        const spot = f.nodes.find(node => node.dataset.hotspot === `scene:rotate:${index}`);
        const symbol = INVESTIGATION_COPY[language].symbols[room.variant][current.dials[index]];
        assert.ok(spot.getAttribute("aria-label").endsWith(`: ${symbol}`));
      }
      if (current.inspected) {
        const clue = ENCOUNTER_COPY[language].alignmentClue(room.order.map(index =>
          INVESTIGATION_COPY[language].symbols[room.variant][index]));
        assert.ok(f.nodes.some(node => node.textContent.includes(clue)));
      }
      checked++;
      f.api.destroy();
    }
    assert.ok(checked > 0);
  }
});

test("each site introduces its setting and distinguishes a pending archive seal from the completed main puzzle", () => {
  for (const language of ["en", "fr"]) {
    const seed = 0, route = expandedInvestigationRoute(seed, { catalogue: true });
    const actions = [];
    for (const action of route.actions) {
      actions.push(action);
      if (action.command?.startsWith("verify:")) continue;
      const progress = replayLegendSession({ contentVersion: CATALOGUE_INVESTIGATION_VERSION, seed, actions });
      if (action.type !== "travel" && progress.message !== "sealReady") continue;
      const f = fixture("investigation", language, { seed, authoritative: {
        contentVersion: CATALOGUE_INVESTIGATION_VERSION, actions: [...actions], status: "active",
        onAction() {},
      } });
      const introduction = f.nodes.find(node => node.className === "legend-site-introduction");
      const objective = f.nodes.find(node => node.className === "legend-site-objective");
      const bubble = f.nodes.find(node => node.className === "legend-scene-bubble");
      const room = progress.level.rooms[progress.room];
      if (!room.concealed || progress.progress[progress.room].revealed) {
        assert.ok(introduction.textContent.includes(INVESTIGATION_COPY[language].introductions[room.family][room.variant]));
      } else {
        assert.ok(introduction.textContent.includes(language === "fr" ? "panneaux de bois" : "wooden panels"));
      }
      assert.equal(bubble.hidden, false);
      if (progress.message === "arrival") {
        assert.equal(bubble.textContent, introduction.textContent);
        assert.equal(objective.hidden, !progress.progress[progress.room].resolved &&
          !progress.progress[progress.room].solved);
      }
      if (progress.message === "sealReady") {
        const reference = progress.level.rooms[room.reference], marks = INVESTIGATION_COPY[language].symbols[reference.variant];
        const context = INVESTIGATION_COPY[language].sealContext(reference.id + 1, marks[reference.answer], marks, room.shift);
        assert.ok(objective.textContent.includes(context));
        assert.ok(bubble.textContent.includes(context));
        assert.ok(objective.textContent.includes(INVESTIGATION_COPY[language].objectives.seal));
      }
      f.api.destroy();
    }
  }
});

test("repair feedback distinguishes missing parts from the unread plan and allows recovery without losing items", () => {
  for (const language of ["en", "fr"]) {
    const seed = 0, route = expandedInvestigationRoute(seed, { catalogue: true });
    const entry = route.actions.findIndex(action => action.type === "travel" && action.room === 3);
    const actions = [...route.actions.slice(0, entry + 1),
      { type: "act", command: "take:0" }, { type: "act", command: "take:1" },
      { type: "act", command: "combine" }];
    let progress = replayLegendSession({ contentVersion: CATALOGUE_INVESTIGATION_VERSION, seed, actions });
    const f = fixture("investigation", language, { seed, authoritative: {
      contentVersion: CATALOGUE_INVESTIGATION_VERSION, local: true, actions, status: "active", health: 85,
      onAction(action) {
        progress = stepInvestigation(progress, action);
        return { progress, state: { health: 85 }, foodKcal: 0, interrupted: false };
      },
    } });
    const all = () => {
      const visit = node => [node, ...node.children.flatMap(visit)];
      return visit(f.container);
    };
    const bubble = () => all().find(node => node.className === "legend-scene-bubble");
    const menuClick = label => all().find(node => node.className === "legend-context")
      .children.find(node => node.textContent === label).click();
    assert.equal(bubble().textContent, MECHANISM_COPY[language].messages.inspectRepair);
    assert.deepEqual(progress.progress[3].parts, [0, 1]);
    all().find(node => node.dataset.hotspot === "target").click();
    menuClick(MECHANISM_COPY[language].point.examine);
    assert.ok(bubble().textContent.includes(MECHANISM_COPY[language].repairClue));
    const slots = () => all().find(node => node.className === "legend-inventory")
      .children.find(node => node.tagName === "ul").children;
    slots()[0].click();
    menuClick(MECHANISM_COPY[language].point.combine);
    slots()[1].click();
    assert.equal(progress.progress[3].mechanism.assembled, true);
    assert.equal(slots().length, 1);
    assert.equal(progress.metrics.wrongAttempts, 0);
    f.api.destroy();
    assert.deepEqual(f.errors, []);
  }
});

test("every procedural puzzle family completes through scenery and contextual menus without bottom buttons", () => {
  const families = new Set();
  for (const language of ["en", "fr"]) for (let seed = 0; seed < 4; seed++) {
    const route = expandedInvestigationRoute(seed);
    let progress = replayLegendSession({ contentVersion: EXPANDED_INVESTIGATION_VERSION, seed, actions: [] });
    const sent = [];
    const f = fixture("investigation", language, { seed, authoritative: {
      contentVersion: EXPANDED_INVESTIGATION_VERSION, local: true, actions: [], status: "active", health: 85,
      onAction(action) {
        sent.push(action);
        progress = stepInvestigation(progress, action);
        return { progress, state: { health: 85 }, foodKcal: 0, interrupted: false };
      },
    } });
    const all = () => {
      const visit = node => [node, ...node.children.flatMap(visit)];
      return visit(f.container);
    };
    for (const action of route.actions) {
      families.add(progress.level.rooms[progress.room].family);
      assert.equal(all().find(node => node.className === "legend-actions").hidden, true);
      if (action.type === "travel") {
        all().find(node => node.dataset.hotspot === "next").click();
        continue;
      }
      const label = all().find(node => node.dataset.legendAction === `act:${action.command}`).textContent;
      let dispatched = false;
      for (const spot of all().filter(node => node.dataset.hotspot &&
          !["next", "previous", "decoy"].includes(node.dataset.hotspot) && !node.disabled)) {
        if (action.command.startsWith("search:") && spot.dataset.hotspot !==
            `panel:${action.command.split(":")[1]}`) continue;
        if (spot.dataset.hotspot.startsWith("item:") &&
            spot.dataset.hotspot !== `item:${action.command.split(":")[1]}`) continue;
        const before = sent.length;
        spot.click();
        if (sent.length > before) { dispatched = true; break; }
        const menu = all().find(node => node.className === "legend-context");
        const verb = !menu.hidden && menu.children.find(node => node.tagName === "button" &&
          (node.textContent === label || action.command === "inspect" &&
            node.textContent === MECHANISM_COPY[language].point.examine ||
            action.command.startsWith("search:") && node.textContent === ENCOUNTER_COPY[language].search ||
            action.command === "combine" && node.textContent === MECHANISM_COPY[language].point.combine));
        if (verb) { verb.click(); dispatched = true; break; }
      }
      assert.ok(dispatched, `${progress.room} ${action.command}`);
      assert.deepEqual(sent.at(-1), action);
    }
    assert.ok(progress.completed);
    assert.deepEqual(sent, route.actions);
    assert.deepEqual(f.errors, []);
    f.api.destroy();
  }
  assert.equal(families.size, 8);
});

test("concealed panels offer canonical observe/search clicks, exact bounds and safe pending/Help behavior", () => {
  for (const language of ["en", "fr"]) {
    const seed = 0, route = expandedInvestigationRoute(seed, { catalogue: true, decoys: true });
    const end = route.actions.findIndex(action => action.type === "travel" && action.room === 2);
    const actions = route.actions.slice(0, end + 1), sent = [];
    let progress = replayLegendSession({ contentVersion: DECOY_INVESTIGATION_VERSION, seed, actions });
    const correct = progress.level.rooms[2].order[0];
    const authoritative = {
      contentVersion: DECOY_INVESTIGATION_VERSION, local: true, actions, status: "active", health: 85,
      onAction(action) {
        sent.push(action);
        progress = stepInvestigation(progress, action);
        return { progress, state: { health: 85 }, foodKcal: 0, interrupted: false };
      },
    };
    const f = fixture("investigation", language, { seed, authoritative });
    const all = () => {
      const visit = node => [node, ...node.children.flatMap(visit)];
      return visit(f.container);
    };
    const panel = index => all().find(node => node.dataset.hotspot === `panel:${index}`);
    const choose = index => {
      panel(index).click();
      return all().find(node => node.className === "legend-context").children
        .filter(node => node.tagName === "button");
    };
    assert.ok(all().every(node => !node.textContent.includes("NaN")));
    for (let index = 0; index < 3; index++) assert.equal(panel(index).getAttribute("style"),
      `left:${(290 + index * 66) / 6.4}%;top:${142 / 3.2}%;width:${52 / 6.4}%;height:${126 / 3.2}%`);
    const wrong = (correct + 1) % 3;
    choose(wrong)[1].click();
    assert.equal(progress.message, "needEvidence");
    assert.equal(progress.metrics.wrongAttempts, 0);
    choose(correct)[0].click();
    assert.equal(progress.progress[2].inspected, true);
    const old = panel(wrong);
    choose(wrong)[1].click();
    assert.equal(progress.metrics.wrongAttempts, 1);
    assert.ok(panel(correct));
    const pull = choose(correct)[1];
    f.nodes.find(node => node.tagName === "dialog").showModal();
    pull.click();
    assert.equal(sent.length, 3);
    f.nodes.find(node => node.tagName === "dialog").close();
    authoritative.disabled = true;
    f.api.setBackgrounds({});
    assert.equal(panel(correct).disabled, true);
    panel(correct).click();
    assert.equal(sent.length, 3);
    authoritative.disabled = false;
    f.api.setBackgrounds({});
    choose(correct)[1].click();
    assert.equal(progress.progress[2].revealed, true);
    assert.equal(all().some(node => node.dataset.hotspot?.startsWith("panel:")), false);
    assert.equal(progress.metrics.wrongAttempts, 1);
    assert.deepEqual(sent, ["search:" + wrong, "inspect", "search:" + wrong, "search:" + correct]
      .map(command => ({ type: "act", command })));
    f.api.destroy();
    for (const node of [old, pull]) for (const handlers of node.listeners.values()) assert.equal(handlers.size, 0);
    assert.deepEqual(f.errors, []);
  }
});

test("ordinary assembly supplies have matching visible sprites and collectible hotspots, including map and paste", () => {
  const variants = new Set();
  for (const language of ["en", "fr"]) for (let seed = 0; seed < 32; seed++) {
    const initial = replayLegendSession({ contentVersion: DECOY_INVESTIGATION_VERSION, seed, actions: [] });
    if (initial.level.rooms[0].family !== "assembly") continue;
    let progress = initial;
    const sent = [];
    const f = fixture("investigation", language, { seed, captureCanvas: true, authoritative: {
      contentVersion: DECOY_INVESTIGATION_VERSION, local: true, actions: [], status: "active", health: 85,
      onAction(action) {
        sent.push(action);
        progress = stepInvestigation(progress, action);
        return { progress, state: { health: 85 }, foodKcal: 0, interrupted: false };
      },
    } });
    const all = () => {
      const visit = node => [node, ...node.children.flatMap(visit)];
      return visit(f.container);
    };
    const canvas = all().find(node => node.width === 640);
    const variant = initial.level.rooms[0].variant;
    variants.add(variant);
    for (let index = 0; index < 2; index++) {
      const spot = all().find(node => node.dataset.hotspot === `item:${index}`);
      assert.ok(spot && !spot.disabled);
      assert.equal(spot.getAttribute("style"), `left:${(72 + index * 64) / 6.4}%;top:61.25%;width:7.5%;height:15%`);
      const pixels = [];
      drawPixelSprite({ fillRect(x, y, w, h) { pixels.push([this.fillStyle, x, y, w, h]); } },
        (variant ? ["document", "paste"] : ["handle", "oil"])[index], 72 + index * 64, 196, 3);
      assert.ok(pixels.every(pixel => canvas.rectangles.some(actual => JSON.stringify(actual) === JSON.stringify(pixel))));
      spot.click();
      assert.equal(all().some(node => node.dataset.hotspot === `item:${index}`), false);
    }
    assert.deepEqual(sent, [{ type: "act", command: "take:0" }, { type: "act", command: "take:1" }]);
    all().find(node => node.dataset.hotspot === "target").click();
    const menu = all().find(node => node.className === "legend-context");
    menu.children.find(node => node.textContent === MECHANISM_COPY[language].point.combine).click();
    assert.equal(progress.progress[0].solved, true);
    assert.equal(sent.at(-1).command, "combine");
    f.api.destroy();
    assert.deepEqual(f.errors, []);
  }
  assert.deepEqual([...variants].sort(), [0, 1]);
});

test("point-and-click recipes and visible doors replay the same canonical route using only scene, inventory and context clicks", () => {
  const { actions } = expandedInvestigationRoute(1, { catalogue: true, mistakes: true });
  for (const language of ["en", "fr"]) {
    let progress = replayLegendSession({ contentVersion: CATALOGUE_INVESTIGATION_VERSION, seed: 1, actions: [] });
    const sent = [];
    const f = fixture("investigation", language, { seed: 1, authoritative: {
      contentVersion: CATALOGUE_INVESTIGATION_VERSION, local: true, actions: [], status: "active", health: 85,
      onAction(action) {
        sent.push(action);
        progress = stepInvestigation(progress, action);
        return { progress, state: { health: 85 }, foodKcal: 0, interrupted: false };
      },
    } });
    const all = () => {
      const visit = node => [node, ...node.children.flatMap(visit)];
      return visit(f.container);
    };
    const clickSpot = id => {
      const node = all().find(node => node.dataset.hotspot === id);
      assert.ok(node && !node.disabled, id);
      node.click();
    };
    const menuClick = label => {
      const menu = all().find(node => node.className === "legend-context");
      assert.equal(menu.hidden, false);
      const node = menu.children.find(node => node.tagName === "button" && node.textContent === label);
      assert.ok(node, label);
      node.click();
    };
    const inventoryClick = index => {
      const tray = all().find(node => node.className === "legend-inventory");
      const list = tray.children.find(node => node.tagName === "ul");
      const position = progress.progress[progress.room].parts.indexOf(index);
      assert.ok(position >= 0);
      list.children[position].dispatch("click");
    };
    const point = MECHANISM_COPY[language].point;
    for (const action of actions) {
      const room = progress.level.rooms[progress.room], current = progress.progress[progress.room];
      if (action.type === "travel") {
        clickSpot("next");
        continue;
      }
      if (!room.recipe || room.concealed && !current.revealed) {
        all().find(node => node.dataset.legendAction === `act:${action.command}`).click();
        continue;
      }
      assert.equal(all().find(node => node.className === "legend-actions").hidden, true);
      const [type, index] = action.command.split(":");
      if (type === "take") clickSpot(`item:${index}`);
      if (type === "inspect") { clickSpot("target"); menuClick(point.examine); }
      if (type === "use" || type === "install") {
        inventoryClick(type === "use" ? Number(index) : 0);
        menuClick(point.use);
        clickSpot("target");
      }
      if (type === "combine") {
        inventoryClick(0); menuClick(point.combine); inventoryClick(1);
        if (room.family === "overlay") {
          const bubble = () => all().find(node => node.className === "legend-scene-bubble");
          const symbols = language === "en" ? [["bell", "portrait", "lantern"], ["star", "moon", "sun"]] :
            [["cloche", "portrait", "lanterne"], ["étoile", "lune", "soleil"]];
          const reading = MECHANISM_COPY[language].overlayReading(symbols[room.variant][room.answer]);
          assert.equal(bubble().textContent, reading);
          assert.equal(bubble().hidden, false);
          const before = sent.length;
          inventoryClick(0); menuClick(point.examine);
          assert.equal(bubble().textContent, reading);
          clickSpot("target"); menuClick(point.examine);
          assert.equal(bubble().textContent, reading);
          assert.equal(sent.length, before);
        }
      }
      if (type === "choose" || type === "verify") {
        clickSpot("target");
        const labels = type === "verify" ? progress.level.rooms[room.reference] : room;
        const symbols = (language === "en" ? [["bell", "portrait", "lantern"], ["star", "moon", "sun"]] :
          [["cloche", "portrait", "lanterne"], ["étoile", "lune", "soleil"]])[labels.variant];
        menuClick(`${type === "verify" ? language === "en" ? "Set archive seal" : "Régler le sceau" :
          language === "en" ? "Answer" : "Répondre"}: ${symbols[Number(index)]}`);
      }
    }
    assert.deepEqual(sent, actions);
    assert.equal(progress.completed, true);
    assert.deepEqual(f.errors, []);
    f.api.destroy();
  }
});

test("point-and-click selection cancels safely, blocks during Help/pending, and keeps doors reversible", () => {
  const route = expandedInvestigationRoute(1, { catalogue: true });
  const entrance = route.actions.findIndex(action => action.type === "travel" && action.room === 1);
  const actions = route.actions.slice(0, entrance + 1);
  let progress = replayLegendSession({ contentVersion: CATALOGUE_INVESTIGATION_VERSION, seed: 1, actions });
  const sent = [], authoritative = {
    contentVersion: CATALOGUE_INVESTIGATION_VERSION, local: true, actions, status: "active", health: 85,
    onAction(action) {
      sent.push(action); progress = stepInvestigation(progress, action);
      return { progress, state: { health: 85 }, foodKcal: 0, interrupted: false };
    },
  };
  const f = fixture("investigation", "en", { seed: 1, authoritative });
  const root = f.nodes.find(node => node.className === "legend-game");
  const menu = f.nodes.find(node => node.className === "legend-context");
  const selection = f.nodes.find(node => node.className === "legend-selection");
  const tray = f.nodes.find(node => node.className === "legend-inventory");
  const list = tray.children.find(node => node.tagName === "ul");
  const hotspots = f.nodes.find(node => node.className === "legend-hotspots");
  const scene = f.nodes.find(node => node.tagName === "canvas" && node.width === 640 && node.height === 320);
  const spot = id => hotspots.children.find(node => node.dataset.hotspot === id);
  assert.equal(spot("next").disabled, true);
  spot("previous").click();
  assert.equal(progress.room, 0);
  spot("next").click();
  assert.equal(progress.room, 1);
  spot("item:0").click();
  assert.equal(sent.at(-1).command, "take:0");
  let calls = sent.length;
  const item = list.children[0];
  assert.equal(item.getAttribute("role"), "button");
  item.focus();
  item.dispatch("keydown", { key: "Enter", preventDefault() {}, stopPropagation() {} });
  assert.equal(menu.hidden, false);
  menu.children.find(node => node.textContent === "Examine").click();
  assert.equal(sent.length, calls);
  item.focus();
  item.dispatch("click");
  menu.children.find(node => node.textContent === "Use").click();
  assert.equal(selection.hidden, false);
  spot("target").dispatch("pointerenter");
  assert.match(selection.textContent, /Use round key with Lock fitting/);
  root.dispatch("keydown", { key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.equal(selection.hidden, true);
  assert.equal(menu.hidden, true);
  assert.equal(sent.length, calls);
  assert.equal(f.doc.activeElement === item, true);
  item.dispatch("click");
  menu.children.find(node => node.textContent === "Use").click();
  scene.dispatch("click");
  assert.equal(selection.hidden, true);
  assert.equal(sent.length, calls);
  root.dispatch("keydown", { key: "h", preventDefault() {}, stopPropagation() {} });
  spot("item:1").click();
  item.dispatch("click");
  assert.equal(sent.length, calls);
  assert.equal(menu.hidden, true);
  f.nodes.find(node => node.dataset.legendAction === "help-close").click();
  authoritative.disabled = true;
  spot("item:1").click();
  assert.equal(sent.length, calls);
  authoritative.disabled = false;
  spot("item:1").click();
  assert.equal(sent.length, calls + 1);
  assert.deepEqual(progress.progress[1].parts, [0, 1]);
  // Removed hotspots and inventory slots must release their handlers too.
  assert.equal([...item.listeners.values()].reduce((sum, entries) => sum + entries.size, 0), 0);
  f.api.destroy();
  for (const node of hotspots.children) {
    assert.equal([...node.listeners.values()].reduce((sum, entries) => sum + entries.size, 0), 0);
  }
});

test("investigation inventory renders labelled pixel objects and stays synchronized through collection, mistakes and revisits", () => {
  for (const language of ["en", "fr"]) {
    const f = fixture("investigation", language, { captureCanvas: true });
    const tray = f.nodes.find(node => node.className === "legend-inventory");
    assert.equal(tray.getAttribute("aria-label"), COPY[language].inventory);
    const list = tray.children.find(node => node.tagName === "ul");
    const empty = tray.children.find(node => node.className === "legend-inventory-empty");
    assert.equal(empty.hidden, false);
    for (const target of ["handle", "oil"]) {
      f.nodes.find(node => node.dataset.legendAction === `act:${target}`).click();
      const slot = list.children.at(-1), icon = slot.children[0];
      assert.equal(slot.children[1].textContent, COPY[language].items[target]);
      assert.equal(slot.getAttribute("tabindex"), "0");
      assert.equal(slot.getAttribute("aria-label"), COPY[language].items[target]);
      assert.equal(slot.children[1].className, "legend-inventory-tooltip");
      assert.equal(slot.children[1].getAttribute("aria-hidden"), "true");
      assert.equal(icon.width, 32);
      assert.equal(icon.height, 32);
      assert.equal(icon.getAttribute("style"), "width:32px;height:32px;max-width:32px;max-height:32px;flex:0 0 32px");
      assert.equal(icon.getAttribute("aria-hidden"), "true");
      assert.ok(icon.rectangles.length > 10);
      assert.ok(icon.rectangles.every(([, , , width, height]) => width === 1 && height === 1));
    }
    assert.equal(list.children.length, 2);
    assert.equal(empty.hidden, true);
    f.nodes.find(node => node.dataset.legendAction === "act:handle").click();
    assert.equal(list.children.length, 2);
    f.nodes.find(node => node.dataset.legendAction === "travel:archive").click();
    assert.equal(list.children.length, 2);
    f.api.destroy();
  }
  const { actions } = expandedInvestigationRoute(1, { catalogue: true, mistakes: true });
  for (const language of ["en", "fr"]) {
    let progress = replayLegendSession({ contentVersion: CATALOGUE_INVESTIGATION_VERSION, seed: 1, actions: [] });
    const f = fixture("investigation", language, { captureCanvas: true, seed: 1, authoritative: {
      contentVersion: CATALOGUE_INVESTIGATION_VERSION, local: true, health: 85, actions: [], status: "active",
      onAction(action) {
        progress = stepInvestigation(progress, action);
        return { progress, state: { health: 85 }, foodKcal: 0, interrupted: false };
      },
    } });
    const tray = f.nodes.find(node => node.className === "legend-inventory");
    const list = tray.children.find(node => node.tagName === "ul");
    const empty = tray.children.find(node => node.className === "legend-inventory-empty");
    const iconDrawings = new Map();
    for (const action of actions) {
      const target = action.type === "travel" ? "next" : `act:${action.command}`;
      f.nodes.find(node => node.dataset.legendAction === target && !node.hidden).click();
      const current = progress.progress[progress.room], room = progress.level.rooms[progress.room];
      const used = ["repair", "assembly"].includes(room.family) && (current.solved || current.resolved);
      const combined = room.family === "repair" && current.mechanism.assembled ||
        room.family === "overlay" && current.mechanism.revealed;
      const count = used ? 0 : combined ? 1 : current.parts.length;
      assert.equal(list.children.length, count);
      assert.equal(empty.hidden, count > 0);
      assert.equal(list.hidden, count === 0);
      const supplies = room.recipe ? room.family === "tool" ? MECHANISM_COPY[language].tools :
        MECHANISM_COPY[language].parts[room.family] : null;
      list.children.forEach((slot, index) => {
        const [icon, label] = slot.children;
        if (supplies) assert.equal(label.textContent, combined ? MECHANISM_COPY[language].combined[room.family] :
          supplies[current.parts[index]]);
        assert.ok(icon.rectangles.length > 10);
        if (room.recipe && !combined) iconDrawings.set(`${room.family}:${current.parts[index]}`, JSON.stringify(icon.rectangles));
      });
    }
    assert.notEqual(iconDrawings.get("repair:0"), iconDrawings.get("repair:1"));
    assert.notEqual(iconDrawings.get("tool:0"), iconDrawings.get("tool:1"));
    assert.deepEqual(f.errors, []);
    f.api.destroy();
  }
});

test("solved platform rooms still render live traps, projectiles, animals and uncollected side-room stashes", () => {
  for (const [contentVersion, catalogue] of [[EXPANDED_PLATFORM_VERSION, false], [CATALOGUE_PLATFORM_VERSION, true]]) {
    const { actions } = variedPlatformRoute(0, { expanded: true, catalogue, visitBranches: true });
    let state = replayLegendSession({ contentVersion, seed: 0, actions: [] });
    const prefix = [], snapshots = new Map();
    for (const packet of actions) {
      for (let tick = 0; tick < packet.ticks; tick++) {
        state = stepPlatformer(state, packet.controls);
        prefix.push({ controls: packet.controls, ticks: 1 });
        const room = state.level.rooms[state.room];
        const key = room.stash && !state.stashes.includes(room.id) ? "stash" :
          room.main && platformRoomSolved(state) && platformArrow(state) && platformAnimal(state) ? "solved-arrow" : null;
        if (key && !snapshots.has(key)) snapshots.set(key, { state, actions: [...prefix] });
      }
      if (snapshots.size === 2) break;
    }
    assert.equal(snapshots.size, 2);
    for (const { state, actions } of snapshots.values()) {
      assert.deepEqual(replayLegendSession({ contentVersion, seed: 0, actions }), state);
      const f = fixture("platform", "en", { captureCanvas: true, seed: 0, authoritative: {
        contentVersion, actions, local: true, health: 85, status: "active", onAction() {},
      } });
      const rectangles = f.nodes.find(node => node.tagName === "canvas" && node.width === 640 && node.height === 320).rectangles;
      const contains = expected => assert.ok(rectangles.some(actual => JSON.stringify(actual) === JSON.stringify(expected)),
        `missing visible pixels ${JSON.stringify(expected)}`);
      const room = state.level.rooms[state.room], animal = platformAnimal(state), arrow = platformArrow(state);
      const expectSprite = (name, x, y, set) => drawPixelSprite({
        fillRect(x, y, width, height) { contains([this.fillStyle, x, y, width, height]); },
      }, name, x, y, 1, { set });
      if (room.stash && !state.stashes.includes(room.id)) expectSprite("supply", room.stash.x, room.stash.y);
      if (room.arrowTrap) {
        const trap = room.arrowTrap;
        contains(["#db6656", trap.plate.x, trap.plate.y, trap.plate.width, trap.plate.height]);
        contains(["#141827", trap.x, trap.y - 6, 12, 16]);
      }
      if (arrow) contains(["#e8b65c", arrow.x, arrow.y, 20, 3]);
      if (animal) { const set = pixelSet(0); expectSprite(set[animal.kind], animal.x, animal.y, set); }
      assert.deepEqual(f.errors, []);
      f.api.destroy();
    }
  }
});

test("dungeon crates remain visible over active and retracted spikes", () => {
  for (const contentVersion of [EXPANDED_DUNGEON_VERSION, CATALOGUE_DUNGEON_VERSION]) {
    const catalogue = contentVersion === CATALOGUE_DUNGEON_VERSION;
    const route = expandedDungeonRoute(0, { catalogue, secrets: false });
    const actions = [];
    let state, checked = 0;
    for (const action of route.actions) {
      actions.push(action);
      state = replayLegendSession({ contentVersion, seed: 0, weapon: "none", actions });
      if (!state.level.rooms[state.room].mechanisms.includes("block") ||
          !state.level.rooms[state.room].mechanisms.includes("spikes") ||
          state.blocks[state.room].x !== 4) continue;
      for (let wait = 0; wait < 4; wait++) {
        const history = [...actions, ...Array.from({ length: wait }, () => ({ type: "wait" }))];
        const f = fixture("dungeon", "en", { seed: 0, captureCanvas: true, authoritative: {
          contentVersion, weapon: "none", actions: history, status: "active", onAction() {},
        } });
        const rectangles = f.nodes.find(node => node.width === 360).rectangles;
        const expected = [];
        drawPixelSprite({ fillRect(x, y, w, h) { expected.push([this.fillStyle, x, y, w, h]); } },
          "crate", 164, 124, 2);
        for (const [color, x, y] of expected) {
          const top = rectangles.findLast(([, left, top, width, height]) =>
            x >= left && x < left + width && y >= top && y < top + height);
          assert.equal(top?.[0], color, `crate pixel covered at ${x},${y}`);
        }
        assert.deepEqual(f.errors, []);
        f.api.destroy();
        checked++;
      }
      break;
    }
    assert.equal(checked, 4);
  }
});

test("catalogue investigation and dungeon controls complete actual routes with localized clues and Help", () => {
  for (const [format, contentVersion, route] of [
    ["investigation", CATALOGUE_INVESTIGATION_VERSION, expandedInvestigationRoute(1, { catalogue: true, mistakes: true })],
    ["dungeon", CATALOGUE_DUNGEON_VERSION, expandedDungeonRoute(1, { catalogue: true })],
  ]) for (const language of ["en", "fr"]) {
    let progress = replayLegendSession({ contentVersion, seed: 1, weapon: "none", actions: [] });
    const f = fixture(format, language, { seed: 1, authoritative: {
      contentVersion, local: true, weapon: "none", health: 85, actions: [], status: "active",
      onAction(action) {
        progress = format === "dungeon" ? stepDungeon(progress, action) : stepInvestigation(progress, action);
        return { progress, state: { health: 85 }, foodKcal: 0, interrupted: false };
      },
    } });
    const help = f.nodes.find(node => node.className === "legend-help");
    for (const action of route.actions) {
      const target = format === "dungeon" ? action.type : action.type === "travel" ? "next" : `act:${action.command}`;
      const node = f.nodes.find(node => node.dataset.legendAction === target && !node.hidden);
      assert.ok(node && !node.disabled, target);
      node.click();
      const room = progress.level.rooms[progress.room];
      if (format === "investigation") {
        const scene = f.nodes.find(node => node.tagName === "canvas" && node.width === 640 && node.height === 320);
        assert.ok(scene.getAttribute("aria-label").startsWith(investigationScene(1, progress.room)[language]));
      }
      if (format === "investigation" && room.recipe && progress.progress[progress.room].inspected &&
          room.family === "tool") {
        const text = f.nodes.map(node => node.textContent).join(" ");
        assert.ok(text.includes(MECHANISM_COPY[language].toolClue(MECHANISM_COPY[language].shapes[room.answer])));
      }
      for (const node of f.nodes) assert.doesNotMatch(String(node.textContent), /undefined|\[object Object\]/);
    }
    assert.ok(help.children.some(node => node.textContent.includes(MECHANISMS[format === "dungeon" ? "mirror" : "repair"].help[language])));
    assert.equal(progress.completed, true);
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.results, [{ completed: true }]);
    f.api.destroy();
  }
});

test("catalogue platform recipes draw their crate and timed crossing with diegetic clues and paused-only instructions", () => {
  const { actions } = variedPlatformRoute(0, { expanded: true, catalogue: true });
  let state = replayLegendSession({ contentVersion: CATALOGUE_PLATFORM_VERSION, seed: 0, actions: [] });
  const prefix = [], snapshots = new Map();
  for (const packet of actions) {
    for (let tick = 0; tick < packet.ticks; tick++) {
      state = stepPlatformer(state, packet.controls);
      prefix.push({ controls: packet.controls, ticks: 1 });
      const family = state.level.rooms[state.room].challenge?.family;
      const key = family === "crate" ? family : family === "bridge" && state.mechanisms[state.room][0].until > state.ticks ? family : null;
      if (key && !snapshots.has(key)) snapshots.set(key, [...prefix]);
      if (snapshots.size === 2) break;
    }
    if (snapshots.size === 2) break;
  }
  assert.equal(snapshots.size, 2);
  for (const language of ["en", "fr"]) for (const [kind, actions] of snapshots) {
    const f = fixture("platform", language, { seed: 0, authoritative: {
      contentVersion: CATALOGUE_PLATFORM_VERSION, actions, local: true, health: 85, status: "active", onAction() {},
    } });
    const inscription = f.nodes.find(node => node.className === "legend-inscription");
    assert.ok(inscription.children[1].textContent.includes(MECHANISMS[kind].clue[language]));
    const help = f.nodes.find(node => node.className === "legend-help");
    assert.ok(help.children.some(node => node.textContent.includes(MECHANISMS[kind].help[language])));
    for (const node of f.nodes) assert.doesNotMatch(String(node.textContent), /undefined|\[object Object\]/);
    assert.deepEqual(f.errors, []);
    f.api.destroy();
  }
});

test("expanded adventures render new mechanics and journey stakes in both languages without leaking instructions outside Help", () => {
  const families = new Set();
  for (const language of ["fr", "en"]) for (let seed = 0; seed < 256; seed++) {
    for (const [format, contentVersion] of [["platform", EXPANDED_PLATFORM_VERSION],
      ["investigation", EXPANDED_INVESTIGATION_VERSION], ["dungeon", EXPANDED_DUNGEON_VERSION]]) {
      const state = replayLegendSession({ contentVersion, seed, actions: [], weapon: "none" });
      if (format === "investigation") families.add(state.level.rooms[0].family);
      const f = fixture(format, language, { seed,
        authoritative: { contentVersion, local: true, health: 85, weapon: "none", actions: [],
          status: "active", onAction() {} },
      });
      const help = f.nodes.find(node => node.className === "legend-help");
      const helpText = help.children.map(node => node.textContent).join(" ");
      assert.match(helpText, /150 kcal/);
      assert.match(helpText, language === "en" ? /wrong answer.*2 minutes.*1 fatigue/ : /fausse.*2 minutes.*1 fatigue/);
      assert.match(helpText, language === "en" ? /first successful recovery/ : /première récupération réussie/);
      for (const node of f.nodes) assert.doesNotMatch(String(node.textContent), /undefined|\[object Object\]/);
      if (format !== "investigation") {
        const inscription = f.nodes.find(node => node.className === "legend-inscription");
        assert.ok(inscription.children[1].textContent.length);
        assert.doesNotMatch(inscription.children[1].textContent, /Hold E|maintenez E|press E|appuyez/);
      }
      assert.deepEqual(f.errors, []);
      f.api.destroy();
    }
  }
  assert.equal(families.size, 8);
});

test("new platform adventures render their varied architecture and keep location-neutral guidance inside Help", () => {
  for (const language of ["fr", "en"]) {
    const names = new Set();
    for (let seed = 0; seed < 32; seed++) {
      const room = replayLegendSession({ contentVersion: VARIED_PLATFORM_VERSION, seed, actions: [] }).level.rooms[0];
      const f = fixture("platform", language, { seed,
        authoritative: { contentVersion: VARIED_PLATFORM_VERSION, local: true, health: 85,
          actions: [], status: "active", onAction() {} },
      });
      const heading = f.nodes.find(node => node.tagName === "h2");
      assert.ok(heading.textContent.startsWith(COPY[language].platformArchitectures[room.archetype]));
      names.add(room.archetype);
      const help = f.nodes.find(node => node.className === "legend-help");
      const descriptions = help.children.map(node => node.textContent).join(" ");
      assert.doesNotMatch(descriptions, /left ladder|échelle de gauche|key on the right|clé en laiton à droite/);
      assert.deepEqual(f.errors, []);
      f.api.destroy();
    }
    assert.equal(names.size, 8);
  }
});

test("bell rooms offer an in-world riddle while commands, solutions and accounting live only in Help", () => {
  const seed = Array.from({ length: 64 }, (_, index) => index)
    .find(seed => generatePlatformLevel({ seed, tier: "modest", paced: true }).rooms[0].challenge.family === "jump");
  assert.notEqual(seed, undefined);
  for (const language of ["en", "fr"]) {
    let actions = 0;
    let progress = replayLegendSession({ contentVersion: TREASURE_PLATFORM_VERSION, seed, actions: [] });
    const f = fixture("platform", language, { seed,
      authoritative: { contentVersion: TREASURE_PLATFORM_VERSION, local: true, health: 85, actions: [], status: "active",
        onAction(input) {
          actions++;
          for (let tick = 0; tick < input.ticks; tick++) progress = stepPlatformer(progress, input.controls);
          return { progress, state: { health: 85 }, foodKcal: 0 };
        } } });
    const help = f.nodes.find(node => node.className === "legend-help");
    const inscription = f.nodes.find(node => node.className === "legend-inscription");
    assert.equal(inscription.children[1].textContent, COPY[language].riddles.jump);
    assert.doesNotMatch(inscription.children[1].textContent, /press|appuyez|Espace|Space|E\b/);
    const insideHelp = node => { for (let parent = node.parent; parent; parent = parent.parent) if (parent === help) return true; return false; };
    for (const name of ["legend-pacing", "legend-accounting", "legend-symbols", "legend-map"]) {
      assert.ok(insideHelp(f.nodes.find(node => node.className === name)), name);
    }
    const solution = f.nodes.find(node => node.textContent.includes(language === "fr" ? "appuyez sur E en montant" : "press E while rising"));
    assert.ok(solution && insideHelp(solution));
    f.run(0);
    f.run(100);
    const before = actions;
    f.button(COPY[language].helpTitle).click();
    assert.equal(help.open, true);
    f.run(200);
    f.run(300);
    assert.equal(actions, before, "reading Help does not advance physics or journey costs");
    f.button(COPY[language].helpClose).click();
    assert.equal(help.open, false);
    assert.equal(f.doc.activeElement, f.nodes.find(node => node.tagName === "canvas"));
    f.run(400);
    f.run(500);
    assert.ok(actions > before);
    f.api.destroy();
  }
});

test("dungeon Help contains shortcuts, blocks gameplay and preserves explicit settlement", () => {
  for (const language of ["en", "fr"]) {
    const sent = [];
    let left = false;
    const f = fixture("dungeon", language, {
      leaveLabel: "Leave adventure", onLeave: () => { left = true; },
      authoritative: { contentVersion: TREASURE_DUNGEON_VERSION, weapon: "none", health: 85, actions: [], status: "active",
        onAction: action => sent.push(action) },
    });
    const root = f.nodes.find(node => node.className === "legend-game");
    const help = f.nodes.find(node => node.className === "legend-help");
    const key = value => root.dispatch("keydown", { key: value, preventDefault() {}, stopPropagation() {} });
    key("h");
    assert.equal(help.open, true);
    key("ArrowUp");
    f.nodes.find(node => node.dataset.direction === "left").click();
    assert.deepEqual(sent, []);
    let contained = false;
    help.dispatch("keydown", { key: "Escape", stopPropagation() { contained = true; } });
    assert.equal(contained, true);
    f.button(COPY[language].helpClose).click();
    key("ArrowUp");
    assert.deepEqual(sent, [{ type: "up" }]);
    key("h");
    f.button(COPY[language].retry).click();
    assert.equal(help.open, false);
    assert.deepEqual(sent, [{ type: "up" }, { type: "retry" }]);
    const leave = f.button("Leave adventure");
    assert.equal(leave.parent, help);
    key("h");
    leave.click();
    assert.equal(left, true);
    f.api.destroy();
  }
});

test("local investigation and dungeon controls advance immediately and finish once without per-action requests", () => {
  for (const language of ["en", "fr"]) for (const contentVersion of [
    LOCAL_INVESTIGATION_VERSION, LOCAL_DUNGEON_VERSION, PACED_INVESTIGATION_VERSION, PACED_DUNGEON_VERSION,
    TREASURE_INVESTIGATION_VERSION, TREASURE_DUNGEON_VERSION,
  ]) {
    const seed = 4, dungeon = isDungeonSession(contentVersion), paced = isPacedLegendSession(contentVersion);
    let progress = replayLegendSession({ contentVersion, seed, weapon: "none", actions: [] });
    const accepted = [];
    const f = fixture(dungeon ? "dungeon" : "investigation", language, { seed,
      authoritative: { contentVersion, local: true, weapon: "none", health: 85, actions: [], status: "active",
        onAction(action) {
          accepted.push(action);
          progress = dungeon ? stepDungeon(progress, action) : stepInvestigation(progress, action);
          return { progress, state: { health: 85 }, foodKcal: 0, interrupted: false };
        } },
    });
    const actions = dungeon ? dungeonCompletionActions(seed, "none", 8, paced) :
      progress.level.rooms.flatMap(room => {
        const commands = ({
          evidence: ["inspect", `choose:${room.answer}`],
          witnesses: ["witness:0", "witness:1", `choose:${room.answer}`],
          assembly: ["take:0", "take:1", "combine"],
          sequence: ["inspect", ...room.order.map(index => `press:${index}`)],
        })[room.family];
        if (room.seal !== undefined) commands.push(`verify:${room.seal}`);
        return [...commands.map(command => ({ type: "act", command })),
          ...(room.id < 7 ? [{ type: "travel", room: room.id + 1 }] : [])];
      });
    for (const action of actions) {
      const target = dungeon ? action.type : action.type === "travel" ? "next" : `act:${action.command}`;
      const button = f.nodes.find(node => node.dataset.legendAction === target && !node.hidden);
      assert.ok(button && !button.disabled, target);
      button.click();
    }
    assert.deepEqual(accepted, actions);
    assert.equal(progress.completed, true);
    assert.deepEqual(f.results, [{ completed: true }]);
    f.api.setBackgrounds({});
    assert.equal(f.results.length, 1);
    f.api.destroy();
  }
});

test("all treasure formats show in-world objectives instead of no-reward trial instructions", () => {
  for (const language of ["en", "fr"]) for (const [format, contentVersion] of [
    ["platform", TREASURE_PLATFORM_VERSION], ["investigation", TREASURE_INVESTIGATION_VERSION],
    ["dungeon", TREASURE_DUNGEON_VERSION],
  ]) {
    const f = fixture(format, language, { seed: 1, authoritative: {
      contentVersion, local: true, weapon: "none", health: 85, actions: [], status: "active", onAction() {},
    } });
    const text = f.nodes.map(node => node.textContent).join(" ");
    assert.match(text, language === "en" ? /hidden memento/ : /souvenir caché/);
    assert.doesNotMatch(text, /no treasure|no reward|sans trésor|sans récompense|Aucun trésor|No item/i);
    f.api.destroy();
  }
});
test("adventure accounting shows equipment-adjusted totals without changing canonical metrics", () => {
  for (const language of ["en", "fr"]) for (const [format, contentVersion] of [
    ["investigation", TREASURE_INVESTIGATION_VERSION], ["dungeon", TREASURE_DUNGEON_VERSION],
    ["platform", TREASURE_PLATFORM_VERSION],
  ]) {
    const seen = [];
    const f = fixture(format, language, { seed: 1, authoritative: {
      contentVersion, local: true, weapon: "none", health: 85, actions: [], status: "active", onAction() {},
      costModifier(costs) {
        seen.push(structuredClone(costs));
        return { ...costs, minutes: 9, fatigue: 6, health: 2, dirt: 7 };
      },
    } });
    assert.ok(seen.length > 0);
    assert.deepEqual(seen[0], { minutes: 3, fatigue: 1, health: 0, dirt: 1 });
    assert.match(f.nodes.find(node => node.className === "legend-accounting").textContent,
      language === "en" ? /9 min, 6 fatigue, 2 health lost, 7 dirt/ : /9 min, 6 fatigue, 2 santé perdue, 7 saleté/);
    f.api.destroy();
  }
});
test("completed treasure console receipts report journey charges and accepted stash gains, including a full bag", () => {
  for (const language of ["en", "fr"]) for (const outcome of ["collected", "left", "taken"]) {
    const doc = { createElement: tag => new Element(tag, doc) }, host = new Element("section", doc);
    const ui = setupLegendSession({ host, request() {} });
    ui.render({ language, state: { serverJourney: { id: "a".repeat(32) }, artifactRevision: 1,
      treasures: { version: 1, inventory: [], equipped: null } },
    session: { runId: "c".repeat(32), town: "Firmi", status: "completed", contentVersion: EXPANDED_INVESTIGATION_VERSION,
      costs: { minutes: 34, fatigue: 14, health: 5, dirt: 12 } },
    rewardResult: { outcome, ...(outcome === "taken" ? {} : { stash: { cents: 100, foodKcal: 150 } }) } });
    const text = host.children.map(node => node.textContent).join(" ");
    assert.match(text, /34 min, 14 fatigue, 5/);
    if (outcome !== "taken") assert.match(text, /1.00.*150 kcal/);
    else assert.doesNotMatch(text, /150 kcal/);
    if (outcome === "left") assert.match(text, language === "en" ? /treasure waits at the entrance/ : /trésor attend à l'entrée/);
    ui.reset();
  }
});

test("reloaded adventure restart labels show the actual rounded entry costs of equipped jewellery", () => {
  for (const language of ["en", "fr"]) for (const { seed, minutes, fatigue } of [
    { seed: 1, minutes: 3, fatigue: 2 },
    { seed: 17, minutes: 4, fatigue: 1 },
    { seed: 49, minutes: 3, fatigue: 1 },
  ]) {
    const doc = { createElement: tag => new Element(tag, doc) }, host = new Element("section", doc);
    const actions = [], id = treasureId("node/42", seed, true);
    const session = { runId: "c".repeat(32), town: "Firmi", seed: 3, status: "active",
      contentVersion: TREASURE_INVESTIGATION_VERSION };
    const state = { serverJourney: { id: "a".repeat(32) }, artifactRevision: 1,
      legendAdventure: { runId: session.runId }, treasures: { version: 1, equipped: null, jewelEquipped: id,
        inventory: [{ id, reward: composedReward(seed), placement: { id, x: 0, y: 0, rotated: false } }] } };
    const ui = setupLegendSession({ host, request: action => { actions.push(action); } });
    ui.render({ state, session, blocked: false, pending: false, language });
    const restart = host.children.find(node => node.tagName === "button" &&
      node.textContent.startsWith(language === "en" ? "Restart" : "Recommencer"));
    assert.equal(restart.textContent, language === "en"
      ? `Restart from entrance (${minutes} min, ${fatigue} fatigue, 1 dirt)`
      : `Recommencer depuis l'entrée (${minutes} min, ${fatigue} fatigue, 1 saleté)`);
    restart.click();
    assert.deepEqual(actions, [{ type: "legend-restart", runId: session.runId }]);
    ui.reset();
  }
});

test("paced investigation clues, archive seals and hints support all tiers in both languages", () => {
  for (const language of ["en", "fr"]) for (const tier of ["modest", "notable", "exceptional"]) {
    const seed = 4, level = generateInvestigation({ seed, tier, paced: true });
    const f = fixture("investigation", language, { seed, tier, paced: true, generatedInvestigation: true });
    const root = f.nodes.find(node => node.className === "legend-game");
    const press = key => root.dispatch("keydown", { key, preventDefault() {}, stopPropagation() {} });
    const act = command => {
      const node = f.nodes.find(node => node.dataset.legendAction === `act:${command}` && !node.hidden);
      assert.ok(node && !node.disabled, command);
      node.click();
    };
    for (const room of level.rooms) {
      const commands = ({
        evidence: ["inspect", `choose:${room.answer}`],
        witnesses: ["witness:0", "witness:1", `choose:${room.answer}`],
        assembly: ["take:0", "take:1", "combine"],
        sequence: ["inspect", ...room.order.map(index => `press:${index}`)],
      })[room.family];
      for (const command of commands) act(command);
      if (room.seal !== undefined) {
        assert.ok(f.nodes.some(node => node.textContent.includes(language === "fr" ? "Marques conservées" : "Retained archive marks")));
        assert.ok(f.nodes.some(node => node.textContent.includes(`${room.reference + 1}`) &&
          node.textContent.includes(language === "fr" ? "sceau" : "seal")));
        press("I");
        assert.ok(f.nodes.some(node => node.textContent.includes(language === "fr" ? "cycle" : "cycle")));
        act(`verify:${(room.seal + 1) % 3}`);
        assert.equal(f.nodes.find(node => node.dataset.legendAction === "next").disabled, true);
        const seal = f.nodes.find(node => node.dataset.legendAction === `act:verify:${room.seal}`);
        const shortcut = seal.getAttribute("aria-keyshortcuts");
        press(shortcut);
      }
      assert.ok(f.nodes.every(node => !String(node.textContent).includes("undefined")));
      if (room.id < level.rooms.length - 1) press("]");
    }
    assert.equal(f.results.length, 1);
    assert.equal(f.results[0].metrics.roomEntries, level.rooms.length, "retained clues avoid forced backtracking");
    f.api.destroy();
  }
});

test("paced local dungeon renders compound targets and every patrol while keeping commands playable", () => {
  for (const language of ["en", "fr"]) for (const seed of [0, 3]) {
    const contentVersion = PACED_DUNGEON_VERSION;
    let progress = replayLegendSession({ contentVersion, seed, weapon: "none", actions: [] });
    const f = fixture("dungeon", language, { seed, authoritative: {
      contentVersion, local: true, weapon: "none", health: 85, actions: [], status: "active",
      onAction(action) {
        progress = stepDungeon(progress, action);
        return { progress, state: { health: 85 }, foodKcal: 0, interrupted: false };
      },
    } });
    for (const action of dungeonCompletionActions(seed, "none", 8, true)) {
      const node = f.nodes.find(node => node.dataset.legendAction === action.type);
      node.click();
      assert.ok(f.nodes.every(node => !String(node.textContent).includes("undefined")));
    }
    assert.equal(progress.completed, true);
    assert.equal(progress.metrics.creatureHits, 0);
    assert.equal(f.results.length, 1);
    f.api.destroy();
  }
  const f = fixture("platform", "en", { authoritative: {
    contentVersion: PACED_PLATFORM_VERSION, local: true, actions: [], health: 85, status: "active", disabled: true,
  } });
  assert.ok(f.nodes.some(node => node.textContent === "Discover: learn one mechanism at a time."));
  f.api.destroy();
});

test("local platform physics remains continuous, records frame inputs and stops while pending", () => {
  for (const disabled of [false, true]) {
    let progress = replayLegendSession({ contentVersion: LOCAL_PLATFORM_VERSION, seed: 1, actions: [] });
    const accepted = [];
    const f = fixture("platform", "en", { authoritative: {
      contentVersion: LOCAL_PLATFORM_VERSION, local: true, actions: [], health: 85, status: "active", disabled,
      onAction(input) {
        accepted.push(input);
        progress = stepPlatformer(progress, input.controls);
        return { progress, state: { health: 85 }, interrupted: false };
      },
    } });
    const root = f.nodes.find(node => node.className === "legend-game");
    root.dispatch("keydown", { key: "ArrowRight", preventDefault() {}, stopPropagation() {} });
    f.run(0); f.run(34);
    assert.equal(accepted.length, disabled ? 0 : 2);
    assert.ok(accepted.every(input => input.ticks === 1 && input.controls.right));
    root.checkVisibility = () => false;
    f.run(68);
    assert.equal(accepted.length, disabled ? 0 : 2, "closing the panel suspends physics");
    assert.equal(progress.health, null);
    assert.deepEqual(f.results, []);
    f.api.destroy();
    assert.equal(f.frames.size, 0);
  }
});

test("authoritative investigation sends only inputs and never advances or completes optimistically", () => {
  const sent = [];
  const { api, button, nodes, results } = fixture("investigation", "en", {
    authoritative: { actions: [{ type: "travel", location: "archive" }], status: "active",
      onAction: input => sent.push(input) },
  });
  button("Cinema foyer").click();
  button("Open the archive cabinet").click();
  assert.deepEqual(sent, [{ type: "travel", location: "foyer" }, { type: "act", target: "cabinet" }]);
  assert.ok(nodes.some(node => node.textContent === "Investigation - Archive"));
  assert.ok(nodes.some(node => node.textContent.startsWith("Adventure charges applied")));
  assert.deepEqual(results, []);
  api.destroy();
  const paused = fixture("investigation", "fr", {
    authoritative: { actions: [], status: "active", disabled: true, onAction: () => assert.fail("disabled") },
  });
  assert.equal(paused.button("Archives").disabled, true);
  paused.api.destroy();
});
test("investigation UI completes once, exposes localized feedback and removes listeners on destroy", () => {
  for (const language of ["en", "fr"]) {
    const fixtureState = fixture("investigation", language);
    const { button, api, results, nodes, container } = fixtureState;
    const click = (en, fr) => {
      const node = button(language === "fr" ? fr : en);
      assert.ok(node && !node.hidden, `visible action: ${en}`);
      node.click();
    };
    click("Inspect the photograph", "Examiner la photographie");
    click("Tell the caretaker: a bell", "Dire à la gardienne : une cloche");
    click("Ask the repairer for a handle", "Demander une poignée au réparateur");
    click("Ask the repairer for oil", "Demander de l'huile au réparateur");
    click("Archive", "Archives");
    click("Open the archive cabinet", "Ouvrir l'armoire des archives");
    click("Projection booth", "Cabine de projection");
    click("Use supplies on the door mechanism", "Utiliser les fournitures sur le mécanisme");
    click("Recover the film reel", "Récupérer la bobine");
    click("Recover the film reel", "Récupérer la bobine");
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], { completed: true, format: "investigation", legendId: "last-screening", preview: true,
      metrics: { roomEntries: 3, roomsVisited: ["foyer", "archive", "booth"], trapHits: 0 },
      costs: { minutes: 9, fatigue: 3, health: 0, dirt: 3 } });
    assert.ok(nodes.some(node => node.className === "legend-receipt" && !node.hidden));
    api.setBackgrounds({ interior: { naturalWidth: 1024, naturalHeight: 1024 } });
    assert.equal(results.length, 1, "late artwork never repeats completion or restarts the puzzle");
    api.destroy();
    assert.equal(container.children.length, 0);
    for (const node of nodes) {
      assert.equal([...node.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0), 0);
    }
  }
});

test("platform UI pauses, releases held input and stops animation/listeners when switching away", () => {
  const { win, doc, api, frames, button, run, errors, nodes } = fixture("platform");
  run(0);
  run(20);
  button("Pause").click();
  assert.equal(button("Resume").attributes["aria-pressed"], "true");
  run(20000);
  api.setBackgrounds({ passage: { naturalWidth: 1024, naturalHeight: 1024 } });
  button("Resume").click();
  win.dispatch("blur");
  doc.dispatch("visibilitychange");
  run(20020);
  assert.equal(errors.length, 0);
  assert.equal(frames.size, 1);
  api.destroy();
  assert.equal(frames.size, 0);
  for (const node of [...nodes, doc, win]) {
    assert.equal([...node.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0), 0);
  }
});

test("all game commands expose working scoped shortcuts, including investigation actions and hints", () => {
  for (const language of ["en", "fr"]) {
    const sent = [];
    const { api, nodes } = fixture("investigation", language, {
      authoritative: { actions: [], status: "active", onAction: input => sent.push(input) },
    });
    const root = nodes.find(node => node.className === "legend-game");
    const key = value => root.dispatch("keydown", { key: value, preventDefault() {}, stopPropagation() {} });
    root.dispatch("keydown", { key: " ", target: { tagName: "BUTTON" },
      preventDefault: () => assert.fail("preserve native button Space activation") });
    const buttons = nodes.filter(node => node.tagName === "button");
    assert.ok(buttons.every(node => node.attributes["aria-keyshortcuts"]));
    assert.ok(buttons.every(node => node.children.some(child => child.tagName === "kbd")));
    key("2");
    key("a");
    key("f"); // Cabinet is hidden in the foyer.
    key("i");
    assert.deepEqual(sent, [{ type: "travel", location: "archive" }, { type: "act", target: "photo" }]);
    api.destroy();
  }
  const { api, nodes, button } = fixture("platform");
  const root = nodes.find(node => node.className === "legend-game");
  root.dispatch("keydown", { key: " ", target: { tagName: "BUTTON" },
    preventDefault: () => assert.fail("preserve native button Space activation") });
  const key = value => root.dispatch("keydown", { key: value, preventDefault() {}, stopPropagation() {} });
  assert.ok(nodes.filter(node => node.tagName === "button").every(node => node.attributes["aria-keyshortcuts"]));
  assert.deepEqual(nodes.filter(node => node.dataset.direction).map(node => node.dataset.direction),
    ["up", "left", "down", "right"]);
  key("p");
  assert.equal(button("Resume").attributes["aria-pressed"], "true");
  key("P");
  assert.equal(button("Pause").attributes["aria-pressed"], "false");
  api.destroy();
});

test("dungeon UI localizes controls, gates combat by equipment and cleans up without animation", () => {
  for (const language of ["en", "fr"]) {
    for (const weapon of ["none", "knife", "sword"]) {
      const { api, nodes, frames, button, results, doc } = fixture("dungeon", language, { weapon, tier: "notable" });
      assert.equal(frames.size, 0, "discrete turns do not run while the page is hidden");
      const root = nodes.find(node => node.className === "legend-game");
      const controls = nodes.filter(node => node.tagName === "button");
      assert.ok(controls.every(node => node.attributes["aria-keyshortcuts"]));
      assert.equal(button(language === "fr" ? "Attaquer" : "Attack").disabled, weapon === "none");
      if (weapon === "none") {
        const accounting = nodes.find(node => node.className === "legend-accounting").textContent;
        const status = nodes.filter(node => node.attributes.role === "status").map(node => node.textContent);
        root.dispatch("keydown", { key: "x", preventDefault() {}, stopPropagation() {} });
        assert.equal(nodes.find(node => node.className === "legend-accounting").textContent, accounting);
        assert.deepEqual(nodes.filter(node => node.attributes.role === "status").map(node => node.textContent), status);
      }
      root.dispatch("keydown", { key: "ArrowUp", preventDefault() {}, stopPropagation() {} });
      button("Pause").click();
      assert.ok(nodes.filter(node => node.dataset.direction).every(node => node.disabled));
      button(language === "fr" ? "Reprendre" : "Resume").click();
      assert.ok(nodes.filter(node => node.dataset.direction).every(node => !node.disabled));
      doc.hidden = true;
      doc.dispatch("visibilitychange");
      assert.equal(button(language === "fr" ? "Reprendre" : "Resume").attributes["aria-pressed"], "true");
      assert.deepEqual(results, []);
      api.setBackgrounds({ interior: { naturalWidth: 1024, naturalHeight: 1024 } });
      api.destroy();
      for (const node of [...nodes, doc]) {
        assert.equal([...node.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0), 0);
      }
    }
  }
});

test("all three formats render every seeded sprite set with localized recognition keys", () => {
  for (const language of ["en", "fr"]) for (const format of ["platform", "investigation", "dungeon"]) {
    const themes = new Set();
    for (let seed = 0; seed < 8; seed++) {
      const { api, nodes, errors } = fixture(format, language, { seed });
      const summary = nodes.find(node => node.tagName === "summary");
      assert.ok(summary.textContent.startsWith(language === "fr" ? "Légende des sprites" : "Sprite key"));
      themes.add(summary.textContent);
      const symbolList = nodes.find(node => node.className === "legend-symbols");
      assert.ok(symbolList.children[1].children.every(item =>
        item.children[0].attributes["aria-hidden"] === "true" && item.children[1].textContent.length));
      api.setBackgrounds({ interior: { naturalWidth: 1024, naturalHeight: 1024 } });
      assert.deepEqual(errors, []);
      api.destroy();
    }
    assert.equal(themes.size, 8);
  }
});

test("platform reward tier changes required rooms and displayed budget rather than awarding items", () => {
  for (const [tier, rooms, budget] of [["modest", 8, 1], ["notable", 16, 2], ["exceptional", 32, 3]]) {
    const { api, nodes, results } = fixture("platform", "en", { tier });
    assert.ok(nodes.some(node => node.textContent.includes(`${rooms} required rooms, planned reward budget ${budget}/3`)));
    assert.ok(nodes.some(node => node.textContent.includes("Exits:")));
    assert.deepEqual(results, []);
    api.destroy();
  }
});

test("generated investigation UI completes every tier using visible commands in both languages", () => {
  for (const language of ["en", "fr"]) for (const tier of ["modest", "notable", "exceptional"]) {
    const seed = 4;
    const level = generateInvestigation({ seed, tier });
    const { api, nodes, results, errors } = fixture("investigation", language, {
      generatedInvestigation: true, seed, tier,
    });
    const root = nodes.find(node => node.className === "legend-game");
    const command = key => root.dispatch("keydown", {
      key, preventDefault() {}, stopPropagation() {},
    });
    const action = index => command(String.fromCharCode(65 + index));
    for (const room of level.rooms) {
      command("I");
      assert.ok(nodes.some(node => node.attributes.role === "status" && node.textContent.length));
      if (room.family === "evidence") { action(0); action(room.answer + 1); }
      if (room.family === "witnesses") { action(0); action(1); action(room.answer + 2); }
      if (room.family === "assembly") { action(0); action(1); action(2); }
      if (room.family === "sequence") { action(0); for (const index of room.order) action(index + 1); }
      if (room.id < level.rooms.length - 1) command("]");
    }
    assert.equal(results.length, 1);
    assert.equal(results[0].format, "investigation");
    assert.equal(results[0].preview, true);
    assert.equal(results[0].metrics.roomEntries, level.rooms.length);
    assert.equal(results[0].costs.minutes, level.rooms.length * 3);
    command("]");
    command("A");
    api.setBackgrounds({ interior: { naturalWidth: 1024, naturalHeight: 1024 } });
    assert.equal(results.length, 1);
    assert.deepEqual(errors, []);
    api.destroy();
    for (const node of nodes) {
      assert.equal([...node.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0), 0);
    }
  }
});

test("generated investigation cannot be mounted as an authoritative session or a different format", () => {
  assert.throws(() => fixture("investigation", "en", { generatedInvestigation: true,
    authoritative: { actions: [], status: "active", onAction() {} } }), /isolated preview/);
  assert.throws(() => fixture("platform", "en", { generatedInvestigation: true }), /isolated preview/);
});

test("live generated UI renders canonical replay and sends only inputs without optimistic progress", () => {
  for (const language of ["en", "fr"]) for (let seed = 0; seed < 8; seed++) {
    const sent = [], level = generateInvestigation({ seed });
    const first = level.rooms[0];
    const command = first.family === "assembly" ? "take:0" : first.family === "witnesses" ? "witness:0" : "inspect";
    const actions = [{ type: "act", command }];
    const f = fixture("investigation", language, { seed, authoritative: {
      contentVersion: GENERATED_INVESTIGATION_VERSION, actions, status: "active", onAction: action => sent.push(action),
    } });
    const root = f.nodes.find(node => node.className === "legend-game");
    const status = f.nodes.find(node => node.attributes.role === "status");
    const before = status.textContent;
    root.dispatch("keydown", { key: "a", preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(sent, [{ type: "act", command }]);
    assert.equal(status.textContent, before);
    assert.ok(f.nodes.some(node => node.textContent.startsWith(language === "fr" ? "Coûts de l'aventure appliqués" : "Adventure charges applied")));
    assert.ok(f.nodes.some(node => node.textContent.includes(language === "fr" ? "Essai procédural enregistré" : "A saved, four-site")));
    assert.ok(!f.nodes.some(node => node.textContent.includes("planned reward budget")));
    assert.deepEqual(f.results, []);
    f.api.destroy();
    for (const sessionStatus of ["active", "left", "interrupted"]) {
      const paused = fixture("investigation", language, { seed, authoritative: {
        contentVersion: GENERATED_INVESTIGATION_VERSION, actions, status: sessionStatus, disabled: true,
        onAction: () => assert.fail("disabled input"),
      } });
      assert.ok(paused.nodes.filter(node => node.tagName === "button" &&
        !["hint", "help", "help-close"].includes(node.dataset.legendAction)).every(node => node.disabled));
      paused.api.destroy();
    }
  }
  assert.throws(() => fixture("investigation", "en", { tier: "exceptional", authoritative: {
    contentVersion: GENERATED_INVESTIGATION_VERSION, actions: [], status: "active",
  } }), /fixed modest/);
});

test("live generated completion shows a no-reward receipt without firing preview rewards", () => {
  const seed = 4, level = generateInvestigation({ seed, roomCount: 4 }), actions = [];
  for (const room of level.rooms) {
    const commands = ({
      evidence: ["inspect", `choose:${room.answer}`],
      witnesses: ["witness:0", "witness:1", `choose:${room.answer}`],
      assembly: ["take:0", "take:1", "combine"],
      sequence: ["inspect", ...room.order.map(index => `press:${index}`)],
    })[room.family];
    actions.push(...commands.map(command => ({ type: "act", command })));
    if (room.id < 3) actions.push({ type: "travel", room: room.id + 1 });
  }
  assert.equal(replayLegendSession({ seed, contentVersion: GENERATED_INVESTIGATION_VERSION, actions }).completed, true);
  const f = fixture("investigation", "en", { seed, authoritative: {
    contentVersion: GENERATED_INVESTIGATION_VERSION, actions, status: "completed",
    onAction: () => assert.fail("completed input"),
  } });
  assert.ok(f.nodes.some(node => node.className === "legend-receipt" && node.textContent === "Investigation complete. No treasure awarded."));
  assert.deepEqual(f.results, []);
  f.api.setBackgrounds({ interior: { naturalWidth: 1024, naturalHeight: 1024 } });
  assert.deepEqual(f.results, []);
  f.api.destroy();
});

test("generated investigation renders all eight settings and ignores modified/native button shortcuts", () => {
  for (let seed = 0; seed < 8; seed++) {
    const { api, nodes, errors } = fixture("investigation", "en", { seed, generatedInvestigation: true });
    const root = nodes.find(node => node.className === "legend-game");
    const heading = nodes.find(node => node.tagName === "h2").textContent;
    const status = nodes.find(node => node.attributes.role === "status");
    const initialStatus = status.textContent;
    for (const data of [{ key: " ", target: { tagName: "BUTTON" } }, { key: "a", ctrlKey: true },
      { key: "a", metaKey: true }, { key: "a", altKey: true }, { key: "a", repeat: true }]) {
      root.dispatch("keydown", { ...data, preventDefault: () => assert.fail("not a game command") });
      assert.equal(status.textContent, initialStatus);
    }
    api.setBackgrounds({ interior: { naturalWidth: 1024, naturalHeight: 1024 } });
    assert.equal(nodes.find(node => node.tagName === "h2").textContent, heading);
    assert.deepEqual(errors, []);
    api.destroy();
  }
});

test("live dungeon UI derives equipment from canonical replay, locks pending inputs and never advances optimistically", () => {
  for (const language of ["en", "fr"]) for (const weapon of ["none", "knife"]) {
    const sent = [], seed = 4;
    const f = fixture("dungeon", language, { seed, authoritative: {
      contentVersion: DUNGEON_SESSION_VERSION, weapon, health: 87, actions: [{ type: "left" }],
      status: "active", onAction: action => sent.push(action),
    } });
    const root = f.nodes.find(node => node.className === "legend-game");
    const status = f.nodes.find(node => node.attributes.role === "status");
    const before = status.textContent;
    root.dispatch("keydown", { key: "ArrowUp", preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(sent, [{ type: "up" }]);
    assert.equal(status.textContent, before);
    assert.ok(f.nodes.some(node => node.textContent.includes("87/100")));
    assert.ok(!f.nodes.some(node => node.textContent.includes("/3 |")));
    assert.ok(f.nodes.some(node => node.textContent.startsWith(language === "fr" ? "Coûts de l'aventure appliqués" : "Adventure charges applied")));
    assert.equal(f.nodes.find(node => node.dataset.legendAction === "attack").disabled, weapon === "none");
    assert.deepEqual(f.results, []);
    f.api.destroy();
    for (const sessionStatus of ["active", "left", "interrupted"]) {
      const paused = fixture("dungeon", language, { seed, authoritative: {
        contentVersion: DUNGEON_SESSION_VERSION, weapon, health: 87, actions: [], status: sessionStatus,
        disabled: true, onAction: () => assert.fail("disabled"),
      } });
      assert.ok(paused.nodes.filter(node => node.dataset.legendAction &&
        !["help", "help-close"].includes(node.dataset.legendAction)).every(node => node.disabled));
      const game = paused.nodes.find(node => node.className === "legend-game");
      game.dispatch("keydown", { key: "ArrowUp", preventDefault() {}, stopPropagation() {} });
      paused.api.destroy();
    }
  }
  assert.throws(() => fixture("dungeon", "en", { weapon: "sword", authoritative: {
    contentVersion: DUNGEON_SESSION_VERSION, weapon: "none", health: 90, actions: [], status: "active",
  } }), /canonical/);
});

test("live dungeon completion is a terminal no-reward receipt and preserves the preview's separate health rules", () => {
  const actions = dungeonCompletionActions(4);
  const f = fixture("dungeon", "en", { seed: 4, authoritative: {
    contentVersion: DUNGEON_SESSION_VERSION, weapon: "none", health: 90, actions, status: "completed",
    onAction: () => assert.fail("terminal"),
  } });
  assert.ok(f.nodes.some(node => node.className === "legend-receipt" && node.textContent === "Dungeon complete. No treasure awarded."));
  f.api.setBackgrounds({ interior: { naturalWidth: 1024, naturalHeight: 1024 } });
  assert.deepEqual(f.results, []);
  f.api.destroy();
});

test("food-enabled live dungeons show accepted calorie gains in both languages without preview rewards", () => {
  const session = { contentVersion: DUNGEON_FOOD_VERSION, seed: 123, weapon: "knife", actions: [] };
  const route = findDungeonRoute(replayLegendSession(session), state => state.defeated.includes(0), { attack: true });
  for (const language of ["en", "fr"]) for (const foodKcal of [150, 0]) {
    const f = fixture("dungeon", language, { seed: 123, authoritative: {
      ...session, actions: route.actions, foodKcal, health: 85, status: "active", onAction() {},
    } });
    const status = f.nodes.find(node => node.attributes.role === "status");
    assert.ok(status.textContent.includes(foodKcal ? "+150 kcal" : language === "en" ? "No energy gained" : "Aucun gain"));
    assert.ok(f.nodes.some(node => node.textContent.includes(language === "en" ? "new attempt respawns" : "Un nouvel essai")));
    assert.deepEqual(f.results, []);
    f.api.destroy();
  }
});
