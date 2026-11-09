import test from "node:test";
import assert from "node:assert/strict";
import { mount } from "../minigames/legend-adventure-ui.mjs";
import { generateInvestigation } from "../minigames/legend-investigation.mjs";
import { GENERATED_INVESTIGATION_VERSION, replayLegendSession, DUNGEON_SESSION_VERSION, DUNGEON_FOOD_VERSION,
  LOCAL_DUNGEON_VERSION, LOCAL_INVESTIGATION_VERSION, LOCAL_PLATFORM_VERSION, isDungeonSession,
  isPacedLegendSession, PACED_INVESTIGATION_VERSION, PACED_DUNGEON_VERSION, PACED_PLATFORM_VERSION,
  TREASURE_INVESTIGATION_VERSION, TREASURE_DUNGEON_VERSION, TREASURE_PLATFORM_VERSION } from "../legend-session.mjs";
import { stepDungeon } from "../minigames/legend-dungeon.mjs";
import { stepInvestigation } from "../minigames/legend-investigation.mjs";
import { stepPlatformer } from "../minigames/legend-platformer.mjs";
import { dungeonCompletionActions, findDungeonRoute } from "./helpers/legend-dungeon-route.mjs";
import { setupLegendSession } from "../legend-session-ui.mjs";
import { composedReward, treasureId } from "../legend-rewards.mjs";

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
  getContext() { return { fillRect() {}, drawImage() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {} }; }
  click() { if (!this.disabled) this.dispatch("click"); }
  setPointerCapture() {}
}

function fixture(format, language = "en", options = {}) {
  const win = new Target();
  const frames = new Map();
  let serial = 0;
  win.requestAnimationFrame = fn => { frames.set(++serial, fn); return serial; };
  win.cancelAnimationFrame = id => frames.delete(id);
  const doc = new Target();
  doc.defaultView = win;
  doc.hidden = false;
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
        node.dataset.legendAction !== "hint").every(node => node.disabled));
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
    for (const data of [{ key: " ", target: { tagName: "BUTTON" } }, { key: "a", ctrlKey: true },
      { key: "a", metaKey: true }, { key: "a", altKey: true }, { key: "a", repeat: true }]) {
      root.dispatch("keydown", { ...data, preventDefault: () => assert.fail("not a game command") });
      assert.equal(status.textContent, "Inspect this site's evidence. Nothing essential can be lost.");
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
      assert.ok(paused.nodes.filter(node => node.dataset.legendAction).every(node => node.disabled));
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
