import test from "node:test";
import assert from "node:assert/strict";
import { setupArtifactQuests } from "../artifacts-ui.mjs";
import { translate } from "../i18n.mjs";
import RUMOURS from "../public/artifact-rumours.json" with { type: "json" };
import { generateInvestigation } from "../minigames/legend-investigation.mjs";
import { setupLegendSession } from "../legend-session-ui.mjs";

class Element {
  children = [];
  events = {};
  textContent = "";
  dataset = {};
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener(type, fn) { this.events[type] = fn; }
  removeEventListener(type) { delete this.events[type]; }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  getContext() { return { fillRect() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {} }; }
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, respond, { pending = false, storesRequest = false, beforeRequest } = {}) {
  const previous = globalThis.document, nodes = new Map(), calls = [], locks = [];
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, Object.assign(new Element(), { ownerDocument: globalThis.document }));
    return nodes.get(id);
  };
  globalThis.document = Object.assign(new Element(), { getElementById: get, createElement: () => Object.assign(new Element(), { ownerDocument: globalThis.document }),
    createTextNode: textContent => Object.assign(new Element(), { textContent }),
    documentElement: { lang: "en" }, defaultView: new Element() });
  t.after(() => { globalThis.document = previous; });
  t.mock.method(console, "error", () => {});
  let state = { col: 0, row: 0, elapsedMinutes: 0, serverJourney: { id: "a".repeat(32) },
    artifactRevision: 0, serviceQuests: { offers: [], quests: [] } };
  let speaker = { id: "b".repeat(32), name: "Camille" }, blocked = false, acknowledged = 0;
  const legend = { targetType: "artifact", targetId: "hermit", targetRevision: "legend:1",
    evidenceKey: "legend", kind: "legend", precision: "text", facts: {
      artifact: "hermit", ...RUMOURS.hermit }, source: "character-artifact-legend",
    observedMinutes: 0, channels: ["npc"], availability: "current", contentVersion: "template-v1" };
  const result = () => ({ state: { ...state, artifactRevision: 1,
    discovery: { version: 1, entries: [legend] } }, revision: 1, offers: [], owned: [],
    conversationRumour: { characterId: "b".repeat(32), artifactId: "hermit", clueRevision: null } });
  const ui = setupArtifactQuests((key, args) => translate("en", key, args), {
    context: () => ({ state, blocked }), mutate: transform => { state = transform(state); return true; },
    lock(value) { locks.push(value); }, beforeRequest, character: () => speaker, client: { pending: () => pending,
      acknowledge() { acknowledged++; pending = false; },
      async request(_state, action) {
        calls.push(action);
        if (storesRequest) pending = true;
        return respond ? respond(result(), action) : result();
      } },
  });

  return { ui, get, calls, locks, state: () => state, acknowledged: () => acknowledged,
    speaker(value) { speaker = value; }, blocked(value) { blocked = value; },
    changeJourney() { state = { ...state, serverJourney: { id: "c".repeat(32) } }; } };
}
const rumour = { characterId: "b".repeat(32), eventId: "00000000-0000-4000-8000-000000000001",
  artifactId: "hermit" };
const speaker = { id: "b".repeat(32), name: "Camille" };

test("active adventures open a dedicated modal, retain errors, and only return after settlement or reset", () => {
  const host = new Element(), dialog = new Element(), quests = new Element();
  const doc = { createElement: () => new Element(), querySelectorAll: () => [quests], activeElement: null };
  host.ownerDocument = doc;
  host.closest = () => dialog;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  quests.open = true;
  quests.close = () => { quests.open = false; };
  const ui = setupLegendSession({ host, request() {} });
  const state = { serverJourney: { id: "a".repeat(32) }, legendAdventure: { runId: "test" } };
  ui.render({ state, language: "en", error: "Connection lost" });
  assert.equal(quests.open, false);
  assert.equal(dialog.open, true);
  assert.ok(host.children.some(node => node.textContent === "Connection lost"));
  let prevented = false;
  dialog.events.cancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, "Escape cannot abandon unpaid local effects");
  ui.render({ state: { ...state, legendAdventure: null }, session: { status: "left", town: "Firmi", actions: [] },
    language: "en" });
  const back = host.children.find(node => node.textContent === "Back to the journey");
  assert.ok(back);
  back.events.click();
  assert.equal(dialog.open, false);
  ui.render({ state, language: "en" });
  assert.equal(dialog.open, true);
  ui.reset();
  assert.equal(dialog.open, false);
});

test("live investigation stays activity-blocking after acknowledgement and accepts only server-rendered progress", async t => {
  const runId = "00000000-0000-4000-8000-000000000001";
  let actions = [];
  const f = fixture(t, (result, action) => {
    if (action?.type === "legend-input") actions = [...actions, action.input];
    return { ...result, conversationRumour: null, revision: f.calls.length,
      state: { ...result.state, artifactRevision: f.calls.length, legendAdventure: { version: 1, runId } },
      adventure: { runId, status: "active", actions, town: "Firmi" } };
  }, { storesRequest: true });
  await f.ui.startLegend({ type: "legend-start", townId: "node/42", contentVersion: "cinema-investigation-v1" });
  assert.equal(f.acknowledged(), 1);
  assert.equal(f.ui.pending(f.state()), true, "active session is a journey activity, not an unacknowledged request");
  assert.equal(f.get("artifact-recovery").hidden, false);
  f.blocked(true);
  f.ui.localize();
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const archive = descendants(f.get("quests-legend-session")).find(node => node.textContent === "Archive");
  assert.equal(archive.disabled, false, "the session can bypass only its own activity lock");
  archive.events.click();
  await settle();
  assert.deepEqual(f.calls[1], { type: "legend-input", runId, input: { type: "travel", location: "archive" } });
  assert.equal(f.acknowledged(), 2);
  assert.ok(descendants(f.get("quests-legend-session")).some(node => node.textContent === "Investigation - Archive"));
  f.changeJourney();
  delete f.state().legendAdventure;
  f.ui.localize();
  assert.equal(f.get("quests-legend-session").children.length, 0, "private puzzle state never leaks to the next journey");
});

test("local dungeon keeps inputs in memory through rendering and sends only the final transcript", async t => {
  const runId = "00000000-0000-4000-8000-000000000001";
  const f = fixture(t, (result, action) => {
    const active = action?.type !== "legend-finish";
    return { ...result, conversationRumour: null, revision: f.calls.length,
      state: { ...result.state, health: 85, artifactRevision: f.calls.length,
        legendAdventure: active ? { version: 1, runId } : null },
      adventure: { contentVersion: "seeded-dungeon-v3", runId, seed: 4, weapon: "none", town: "Firmi",
        status: active ? "active" : "left", actions: active ? [] : action.actions,
        costs: { minutes: 3, fatigue: 1, health: 0, dirt: 1 } } };
  });
  f.ui.localize();
  await f.ui.startLegend({ type: "legend-start", townId: "node/42", contentVersion: "seeded-dungeon-v3" });
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const nodes = () => descendants(f.get("quests-legend-session"));
  nodes().find(node => node.dataset.legendAction === "left").events.click();
  assert.equal(f.calls.length, 1, "movement makes no request");
  assert.equal(f.ui.pending(f.state()), true, "ordinary journey actions stay locked");
  f.ui.localize();
  nodes().find(node => node.textContent === "Leave and settle costs").events.click();
  await settle();
  assert.deepEqual(f.calls[1], { type: "legend-finish", runId, actions: [{ type: "left" }] });
  assert.equal(f.state().legendAdventure, null);
});

test("a new UI instance offers a paid entrance restart instead of restoring local progress", t => {
  const f = fixture(t), runId = "00000000-0000-4000-8000-000000000001", requests = [];
  const host = f.get("reload-local-session");
  const ui = setupLegendSession({ host, request: action => { requests.push(action); } });
  const state = { serverJourney: { id: "a".repeat(32) }, artifactRevision: 3,
    legendAdventure: { version: 1, runId } };
  ui.render({ state, session: { contentVersion: "seeded-dungeon-v3", seed: 4, weapon: "none",
    runId, status: "active", actions: [], town: "Firmi" }, language: "en", blocked: false, pending: false });
  assert.ok(host.children.some(node => node.textContent.includes("Progress discarded on reload")));
  assert.ok(!host.children.some(node => node.className === "legend-game"));
  host.children.find(node => node.textContent.startsWith("Restart from entrance")).events.click();
  assert.deepEqual(requests, [{ type: "legend-restart", runId }]);
  host.children.find(node => node.textContent === "Leave without restarting").events.click();
  assert.deepEqual(requests[1], { type: "legend-finish", runId, actions: [] });
  ui.reset();
});

test("generated sessions retain their version and canonical seed through live quest rendering and request recovery", async t => {
  const runId = "00000000-0000-4000-8000-000000000001", seed = 4;
  const actions = [];
  const f = fixture(t, (result, action) => {
    if (action?.type === "legend-input") actions.push(action.input);
    return { ...result, conversationRumour: null, revision: f.calls.length,
      state: { ...result.state, artifactRevision: f.calls.length, legendAdventure: { version: 1, runId } },
      adventure: { contentVersion: "seeded-investigation-v1", seed, runId, status: "active",
        actions: [...actions], town: "Firmi" } };
  }, { storesRequest: true });
  await f.ui.startLegend({ type: "legend-start", townId: "node/42", contentVersion: "seeded-investigation-v1" });
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const nodes = () => descendants(f.get("quests-legend-session"));
  const firstRoom = generateInvestigation({ seed }).rooms[0];
  assert.ok(nodes().some(node => node.textContent === "Generated investigation trial (real costs, no reward)"));
  assert.ok(nodes().some(node => node.textContent.includes("Site 1/4")));
  const firstAction = nodes().find(node => node.dataset.legendAction === "act:inspect");
  assert.equal(firstRoom.family, "sequence");
  firstAction.events.click();
  await settle();
  assert.deepEqual(f.calls[1], { type: "legend-input", runId, input: { type: "act", command: "inspect" } });
  assert.equal(f.acknowledged(), 2);
  assert.ok(nodes().some(node => node.textContent.includes("instruction plate gives this exact order")));
  assert.equal(f.ui.pending(f.state()), true);
  f.changeJourney();
  delete f.state().legendAdventure;
  f.ui.localize();
  assert.equal(f.get("quests-legend-session").children.length, 0);
});

test("a timed-out prerequisite releases the action lock and exposes retry on the map", async t => {
  const f = fixture(t, undefined, { beforeRequest: async signal => {
    assert.ok(signal instanceof AbortSignal);
    throw new DOMException("Notebook synchronization timed out", "TimeoutError");
  } });
  f.ui.hear(rumour, speaker);
  await settle();
  assert.deepEqual(f.locks, [true, false]);
  assert.deepEqual(f.calls, []);
  const recovery = f.get("artifact-recovery");
  assert.equal(recovery.hidden, false);
  assert.equal(recovery.children[0].textContent, "Notebook synchronization timed out");
  assert.equal(recovery.children.find(node => node.type === "button").disabled, false);
});

test("live dungeon quest rendering preserves canonical equipment and sends discrete inputs", async t => {
  const runId = "00000000-0000-4000-8000-000000000001", actions = [];
  const f = fixture(t, (result, action) => {
    if (action?.type === "legend-input") actions.push(action.input);
    return { ...result, conversationRumour: null, revision: f.calls.length,
      state: { ...result.state, artifactRevision: f.calls.length, health: 89, legendAdventure: { version: 1, runId } },
      adventure: { contentVersion: "seeded-dungeon-v1", seed: 4, runId, status: "active", weapon: "knife",
        actions: [...actions], town: "Firmi" } };
  }, { storesRequest: true });
  await f.ui.startLegend({ type: "legend-start", townId: "node/42", contentVersion: "seeded-dungeon-v1" });
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const nodes = () => descendants(f.get("quests-legend-session"));
  assert.ok(nodes().some(node => node.textContent === "Dungeon trial (real costs, no treasure)"));
  assert.ok(nodes().some(node => node.textContent.includes("89/100")));
  const up = nodes().find(node => node.dataset.legendAction === "up");
  up.events.click();
  await settle();
  assert.deepEqual(f.calls[1], { type: "legend-input", runId, input: { type: "up" } });
  assert.equal(f.acknowledged(), 2);
  assert.equal(f.ui.pending(f.state()), true);
  assert.ok(descendants(f.get("artifact-recovery")).some(node => node.textContent === "Resume adventure"));
});

test("pending artifact commands can recover from the map while Dialogue and Quests are blocked", async t => {
  const f = fixture(t, undefined, { pending: true });
  f.blocked(true);
  f.ui.localize();
  const recovery = f.get("artifact-recovery");
  assert.equal(recovery.hidden, false);
  assert.match(recovery.children[0].textContent, /awaiting confirmation/);
  const retry = recovery.children.find(node => node.textContent === "Retry pending command");
  assert.equal(retry.disabled, false, "pending command can bypass its own action lock");
  retry.events.click();
  await settle();
  assert.deepEqual(f.calls, [null], "retry replays the pending request, not a new action");
  assert.equal(f.acknowledged(), 1);
  assert.equal(f.ui.pending(f.state()), false);
  assert.equal(recovery.hidden, true);
});

test("routine artifact syncs explain the action lock on the map while in flight", async t => {
  let release, observedHidden;
  const f = fixture(t, async result => {
    observedHidden = f.get("artifact-recovery").hidden;
    await new Promise(resolve => { release = resolve; });
    return result;
  }, { storesRequest: true });
  f.ui.hear(rumour, speaker);
  await settle();
  f.ui.localize();
  assert.equal(f.ui.pending(f.state()), true, "the in-flight command is stored for crash recovery");
  assert.equal(f.get("artifact-recovery").hidden, false);
  assert.equal(observedHidden, false);
  assert.equal(f.get("artifact-recovery").children[0].textContent, "Contacting the artifact world…");
  assert.equal(f.get("artifact-recovery").children.find(node => node.type === "button").disabled, true);
  release();
  await settle();
  assert.equal(f.get("artifact-recovery").hidden, true);
});

test("failed recovery stays visible and retryable without discarding the pending transaction", async t => {
  let failing = true;
  const f = fixture(t, result => {
    if (failing) throw new Error("Connection unavailable");
    return result;
  }, { pending: true });
  f.blocked(true);
  f.ui.localize();
  const recovery = f.get("artifact-recovery");
  recovery.children.find(node => node.textContent === "Retry pending command").events.click();
  await settle();
  assert.equal(recovery.hidden, false);
  assert.equal(recovery.children[0].textContent, "Connection unavailable");
  assert.equal(f.ui.pending(f.state()), true);
  assert.equal(f.acknowledged(), 0);
  const retry = recovery.children.find(node => node.textContent === "Retry pending command");
  assert.equal(retry.disabled, false);
  failing = false;
  retry.events.click();
  await settle();
  assert.equal(f.acknowledged(), 1);
  assert.equal(recovery.hidden, true);
});

test("artifact knowledge appears spontaneously outside its topic, is saved, and has no object-search selector", async t => {
  const f = fixture(t);
  f.ui.hear(rumour, speaker);
  await settle();
  assert.deepEqual(f.calls, [{ type: "character-rumour", characterId: speaker.id, eventId: rumour.eventId }]);
  assert.equal(f.acknowledged(), 1);
  assert.equal(f.state().discovery.entries[0].kind, "legend");
  assert.equal(f.get("conversation-artifact-rumour").hidden, false);
  assert.equal(f.get("conversation-artifact-rumour").children[0].textContent, RUMOURS.hermit.en);
  assert.ok(f.get("quests-artifacts").children.some(node => node.textContent === RUMOURS.hermit.en));
  assert.ok(!f.get("dialogue-artifacts").children.some(node => /Ask for news/.test(node.textContent)));
  f.speaker({ id: "d".repeat(32), name: "Another person" });
  f.ui.localize();
  assert.equal(f.get("conversation-artifact-rumour").hidden, true);
});

test("artifact actions live in the investigation panel while Quests keeps an action-free record", async t => {
  const f = fixture(t, result => ({
    ...result,
    state: { ...result.state, lore: { inventory: [
      { id: "temperance", placement: { x: 0, y: 0, rotated: false } },
    ], shared: [] } },
    offers: [{ id: "hermit" }],
    owned: [{ id: "temperance", cooldownUntil: 0 }],
    worldMinutes: 0,
  }));
  f.ui.localize();
  f.get("dialogue-artifacts").children.find(node => node.textContent === "Refresh artifacts").events.click();
  await settle();
  const treeText = node => [node.textContent, ...node.children.map(treeText)].join(" ");
  const investigation = treeText(f.get("dialogue-artifacts"));
  const journal = treeText(f.get("quests-artifacts"));
  assert.match(investigation, /Search and collect/);
  assert.match(investigation, /Use power/);
  assert.doesNotMatch(journal, /Search and collect|Use power|Leave in a cache|Pack artifact/);
  assert.match(journal, /The pierced thimble/);
  assert.match(journal, /The pierced stopper/);
});

test("temporarily blocked conversation speech waits without losing its fixed event", async t => {
  const f = fixture(t);
  f.blocked(true);
  f.ui.hear(rumour, speaker);
  await settle();
  assert.equal(f.calls.length, 0);
  f.blocked(false);
  f.ui.localize();
  f.ui.localize();
  await settle();
  assert.equal(f.calls.length, 1);
});

test("an obsolete town lead is spoken as an old rumour, never as the object's new location", async t => {
  const f = fixture(t, result => ({ ...result, conversationRumour: {
    ...result.conversationRumour, clueRevision: "1", cluePrecision: "town",
  }, state: { ...result.state, discovery: { version: 1, entries: [...result.state.discovery.entries, {
    targetType: "artifact", targetId: "hermit", targetRevision: "1", evidenceKey: "location",
    kind: "location", precision: "town", facts: { artifact: "hermit", region: "Old region", place: "Old town" },
    source: "character-artifact-rumour", observedMinutes: 0, channels: ["npc"],
    availability: "historical", contentVersion: "template-v1",
  }] } } }));
  f.ui.hear(rumour, speaker);
  await settle();
  const line = f.get("conversation-artifact-rumour").children[1].textContent;
  assert.match(line, /lead is getting old/);
  assert.match(line, /Old town/);
  assert.doesNotMatch(line, /latitude|longitude/);
});

test("switching speakers during delivery never attributes the response to the new person", async t => {
  let resolve;
  const f = fixture(t, result => new Promise(done => { resolve = () => done(result); }));
  f.ui.hear(rumour, speaker);
  await settle();
  f.speaker({ id: "d".repeat(32), name: "Other person" });
  resolve();
  await settle();
  assert.equal(f.get("conversation-artifact-rumour").hidden, true);
  assert.equal(f.state().discovery.entries[0].kind, "legend");
});

test("a stale artifact reply cannot overwrite a different journey or be attributed to another speaker", async t => {
  let resolve;
  const f = fixture(t, result => new Promise(done => { resolve = () => done(result); }));
  f.ui.hear(rumour, speaker);
  await settle();
  f.changeJourney();
  f.ui.reset();
  resolve();
  await settle();
  assert.equal(f.state().discovery, undefined);
  assert.equal(f.acknowledged(), 0);
  assert.equal(f.get("conversation-artifact-rumour").hidden, true);
});

test("invalid speech cannot be acknowledged or saved as an earned clue", async t => {
  const f = fixture(t, result => ({ ...result, state: { ...result.state,
    discovery: { version: 1, entries: [] } } }));
  f.ui.hear(rumour, speaker);
  await settle();
  assert.equal(f.acknowledged(), 0);
  assert.equal(f.state().discovery, undefined);
  assert.match(f.get("conversation-artifact-rumour").children[0].textContent, /Missing earned/);
});
