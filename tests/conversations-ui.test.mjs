import test from "node:test";
import assert from "node:assert/strict";
import { setupConversations } from "../conversations-ui.mjs";
import { translate } from "../i18n.mjs";

class Element {
  disabled = false;
  hidden = false;
  open = false;
  textContent = "";
  events = {};
  setAttribute(name, value) { this[name] = value; }
  addEventListener(type, callback) { this.events[type] = callback; }
  click() { if (!this.disabled) return this.events.click?.(); }
  showModal() { this.open = true; }
  close() { this.open = false; this.events.close?.(); }
  focus() { this.focused = true; }
}

for (const language of ["fr", "en"]) {
  test(`${language} inhabitants present all topics without changing the journey and forward to existing actions`, t => {
    const previous = globalThis.document, nodes = new Map();
    const get = id => {
      if (!nodes.has(id)) nodes.set(id, new Element());
      return nodes.get(id);
    };
    globalThis.document = { getElementById: get,
      querySelector: () => [...nodes.values()].find(node => node.open) ?? null };
    t.after(() => { globalThis.document = previous; });
    const current = { cell: { terrain: "place", settlements: [{ osmId: "node/123", name: "Firmi" }] },
      state: { elapsedMinutes: 60, walletCents: 1000, ended: null }, blocked: false };
    const before = structuredClone(current);
    const ui = setupConversations((key, args) => translate(language, key, args), { context: () => current });
    ui.localize();
    assert.equal(translate(language, "conversation.clues"),
      language === "fr" ? "Demander son chemin" : "Ask for directions");
    get("open-conversation").click();
    assert.equal(get("conversation-dialog").open, true);
    assert.match(get("conversation-context").textContent, /Firmi/);
    get("conversation-artifacts").click();
    assert.equal(get("conversation-reply").hidden, false);
    assert.match(get("conversation-reply").textContent, language === "fr" ? /ami d’un ami.*très loin/ : /friend of a friend.*long way/);
    assert.deepEqual(current, before);
    for (const [topic, pane] of Object.entries({ parent: "dialogue-parent", clues: "dialogue-directions",
      notebooks: "dialogue-journals", artifacts: "dialogue-artifacts", services: "dialogue-services" })) {
      get(`conversation-${topic}`).click();
      assert.equal(get("conversation-dialog").open, true);
      assert.equal(get(pane).hidden, false);
    }
    for (const [topic, target] of Object.entries({
      shelter: "sleep-travel", food: "eat-travel", work: "open-earn-money",
      transport: "open-journey-world", town: "open-town",
    })) {
      let invoked = false;
      get(target).events.click = () => {
        assert.equal(get("conversation-dialog").open, false);
        invoked = true;
      };
      get(`conversation-${topic}`).click();
      assert.equal(invoked, true, topic);
      get("open-conversation").click();
    }
    get("conversation-parent").click();
    assert.equal(get("conversation-reply").hidden, true);
    get("conversation-close").click();
    assert.equal(get("open-conversation").focused, true);
    get("town-dialog").showModal();
    get("town-conversation").click();
    assert.equal(get("town-dialog").open, false);
    assert.equal(get("conversation-dialog").open, true);
    ui.reset();
    current.cell = { terrain: "forest" };
    ui.localize();
    assert.equal(get("open-conversation").disabled, false);
    assert.equal(get("town-conversation").disabled, false);
    get("open-conversation").click();
    assert.equal(get("conversation-dialog").open, true);
    current.cell = before.cell;
    current.blocked = true;
    ui.localize();
    assert.equal(get("conversation-transport").disabled, true);
  });
}
