import test from "node:test";
import assert from "node:assert/strict";
import { setupAbandonedJournals } from "../abandoned-journals-ui.mjs";

class Element {
  dataset = {};
  children = [];
  listeners = {};
  hidden = false;
  disabled = false;
  textContent = "";
  replaceChildren(...items) { this.children = items; }
  append(...items) { this.children.push(...items); }
  addEventListener(kind, action) { this.listeners[kind] = action; }
}

test("SIDEQUEST pickup, progress, delivery and death publication never alter own parent trail", async () => {
  const globals = Object.fromEntries(["document", "window", "localStorage", "fetch"]
    .map(key => [key, globalThis[key]]));
  const nodes = Object.fromEntries(["abandoned-journals", "abandoned-status", "abandoned-list",
    "abandoned-refresh"].map(id => [id, new Element()]));
  const data = new Map(), sent = [];
  globalThis.document = { querySelector: id => nodes[id.slice(1)], createElement: () => new Element() };
  globalThis.window = { addEventListener() {} };
  globalThis.localStorage = { getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value) };
  const ownTrail = { parentName: "Own parent", index: 4, stages: ["Own town"] };
  let state = { serverJourney: { id: "1".repeat(32) }, journalAccess: "2".repeat(64),
    col: 0, row: 0, elapsedMinutes: 0, ended: null, trail: structuredClone(ownTrail),
    photos: ["PRIVATE"], notes: "PRIVATE" };
  const quest = { id: "3".repeat(32), parent: "Other parent", history: ["Earlier town"],
    stages: [{ name: "Other town", latitude: 44, longitude: 2 }], step: 0, delivered: false };
  let held = false, delivered = false;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    sent.push(body);
    assert.equal(url, "/api/abandoned-journals");
    if (body.action === "claim") held = true;
    if (body.action === "advance") delivered = true;
    return new Response(JSON.stringify({ sidequests: held ? [{ ...quest, delivered }] : [],
      nearby: held ? [] : [quest], published: body.ended === "fatigue" }));
  };
  const t = (key, values = {}) => `${key} ${Object.values(values).join(" ")}`;
  try {
    const ui = setupAbandonedJournals(t, {
      context: () => state,
      persist(sidequests, published) {
        state = { ...state, sidequests, ...(published ? { journalPublished: true } : {}) };
      },
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.match(nodes["abandoned-list"].children[0].textContent, /Other parent/);
    await nodes["abandoned-list"].children[0].children[1].listeners.click();
    assert.equal(state.sidequests[0].id, quest.id);
    assert.deepEqual(state.trail, ownTrail);
    assert.match(nodes["abandoned-list"].children[0].textContent, /Other town/);
    await nodes["abandoned-list"].children[0].children[1].listeners.click();
    assert.equal(state.sidequests[0].delivered, true);
    assert.match(nodes["abandoned-list"].children[0].textContent, /abandoned.delivered/);
    state = { ...state, ended: "fatigue", elapsedMinutes: 10 };
    ui.update();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.journalPublished, true);
    assert.match(nodes["abandoned-status"].textContent, /abandoned.published/);
    assert.equal(JSON.stringify(sent).includes("PRIVATE"), false);
    assert.deepEqual(state.trail, ownTrail);
  } finally {
    for (const [key, value] of Object.entries(globals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
