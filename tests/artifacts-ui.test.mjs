import test from "node:test";
import assert from "node:assert/strict";
import { setupArtifactQuests } from "../artifacts-ui.mjs";
import { translate } from "../i18n.mjs";
import RUMOURS from "../public/artifact-rumours.json" with { type: "json" };

class Element {
  children = [];
  events = {};
  textContent = "";
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener(type, fn) { this.events[type] = fn; }
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, respond, { pending = false, storesRequest = false, beforeRequest } = {}) {
  const previous = globalThis.document, nodes = new Map(), calls = [], locks = [];
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  globalThis.document = { getElementById: get, createElement: () => new Element(),
    createTextNode: textContent => Object.assign(new Element(), { textContent }),
    documentElement: { lang: "en" } };
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
        return respond ? respond(result()) : result();
      } },
  });
  return { ui, get, calls, locks, state: () => state, acknowledged: () => acknowledged,
    speaker(value) { speaker = value; }, blocked(value) { blocked = value; },
    changeJourney() { state = { ...state, serverJourney: { id: "c".repeat(32) } }; } };
}
const rumour = { characterId: "b".repeat(32), eventId: "00000000-0000-4000-8000-000000000001",
  artifactId: "hermit" };
const speaker = { id: "b".repeat(32), name: "Camille" };

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
