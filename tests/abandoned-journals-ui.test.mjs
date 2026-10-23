import test from "node:test";
import assert from "node:assert/strict";
import { setupAbandonedJournals } from "../abandoned-journals-ui.mjs";
import { applyJournalDiscovery } from "../discovery-targets.mjs";
import { translate } from "../i18n.mjs";

class Element {
  setAttribute(name, value) { this[name] = value; }
  dataset = {};
  children = [];
  listeners = {};
  hidden = false;
  disabled = false;
  textContent = "";
  replaceChildren(...items) { this.children = items; }
  append(...items) { this.children.push(...items); }
  insertAdjacentElement(_position, item) { this.before = item; }
  addEventListener(kind, action) { this.listeners[kind] = action; }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.(); }
  focus() { this.focused = true; }
}

test("SIDEQUEST pickup, progress, delivery and death publication never alter own parent trail", async () => {
  const globals = Object.fromEntries(["document", "window", "localStorage", "fetch"]
    .map(key => [key, globalThis[key]]));
  const nodes = Object.fromEntries(["abandoned-journals", "abandoned-status", "abandoned-list",
    "abandoned-refresh", "dialogue-journals"].map(id => [id, new Element()]));
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
  let held = false, delivered = false, paused = false, atTarget = true;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    sent.push(body);
    assert.equal(url, "/api/abandoned-journals");
    if (body.action === "claim") held = true;
    if (body.action === "advance") delivered = true;
    return new Response(JSON.stringify({ sidequests: held ? [{ ...quest, delivered }] : [],
      nearby: held ? [] : [quest], published: body.ended === "fatigue",
      rumours: [{ id: quest.id, parent: quest.parent, bearing: "east", distanceBand: "within-1km",
        observedMinutes: 0, availability: "current", evidenceKey: "town:" + "4".repeat(32) }] }));
  };
  const t = (key, values = {}) => `${key} ${Object.values(values).join(" ")}`;
  try {
    const ui = setupAbandonedJournals(t, {
      context: () => state,
      blocked: () => paused,
      canHandover: () => atTarget,
      persist(sidequests, published, nearby, observedMinutes) {
        state = applyJournalDiscovery(state, sidequests, nearby, observedMinutes);
        if (published) state = { ...state, journalPublished: true };
      },
    });

    await ui.whenIdle();
    const sentBeforePause = sent.length;
    paused = true;
    ui.update();
    await nodes["abandoned-refresh"].listeners.click();
    assert.equal(sent.length, sentBeforePause);
    assert.equal(nodes["abandoned-refresh"].disabled, true);
    paused = false;
    ui.localize();
    assert.match(nodes["abandoned-list"].children[0].textContent, /Other parent/);
    assert.equal(state.discovery.entries[0].kind, "rumour");
    assert.equal(state.discovery.entries[0].observedMinutes, 0);
    await nodes["abandoned-list"].children[0].children[1].listeners.click();
    assert.equal(state.sidequests[0].id, quest.id);
    assert.equal(state.discovery.entries.length, 2);
    assert.deepEqual(state.trail, ownTrail);
    assert.match(nodes["abandoned-list"].children[0].textContent, /Other town/);
    atTarget = false;
    ui.localize();
    const distant = nodes["dialogue-journals"].children[2].children[0].children[0];
    assert.equal(distant.disabled, true);
    const beforeDistant = sent.length;
    await distant.listeners.click();
    assert.equal(sent.length, beforeDistant);
    atTarget = true;
    ui.localize();
    await nodes["dialogue-journals"].children[2].children[0].children[0].listeners.click();
    assert.equal(state.sidequests[0].delivered, true);
    assert.ok(state.discovery.entries.every(entry => entry.availability === "historical"));
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

test("story-led foldable town reports hide unmentioned positions, deduplicate notebooks and preserve pickup flow", async () => {
  const globals = Object.fromEntries(["document", "window", "localStorage", "fetch"]
    .map(key => [key, globalThis[key]]));
  const nodes = Object.fromEntries(["abandoned-journals", "abandoned-status", "abandoned-list",
    "abandoned-refresh", "dialogue-journals", "conversation-dialog", "trail-dialog", "open-quests"
    ].map(id => [id, new Element()]));
  const root = { lang: "en" }, data = new Map(), sent = [];
  globalThis.document = { documentElement: root, querySelector: id => nodes[id.slice(1)],
    createElement: () => new Element() };
  globalThis.window = { addEventListener() {} };
  globalThis.localStorage = { getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value) };
  let state = { serverJourney: { id: "1".repeat(32) }, journalAccess: "2".repeat(64),
    col: 0, row: 0, elapsedMinutes: 60, ended: null,
    trail: { parentName: "Own parent", index: 0, stages: ["Own town"] } };
  const report = { id: "3".repeat(32), parent: "Other parent", bearing: "east",
    distanceBand: "within-1km", observedMinutes: 60,
    availability: "current", evidenceKey: `town:${"4".repeat(32)}` };
  let earned = false, available = true;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    sent.push(body);
    if (body.action === "rumours") earned = true;
    return new Response(JSON.stringify({ nearby: [], sidequests: [], published: false,
      rumours: earned ? [{ ...report, availability: available ? "current" : "unavailable" },
        { ...report, observedMinutes: 0, evidenceKey: "town:" + "6".repeat(32) }] : [],
      indications: available ? [{ ...report, evidenceKey: `near:${"5".repeat(32)}` }] : [] }));
  };
  try {
    const ui = setupAbandonedJournals((key, args) => translate(root.lang, key, args), { context: () => state,
      persist(sidequests, _published, nearby, observed, rumours, indications) {
        state = applyJournalDiscovery(state, sidequests, nearby, observed, rumours, indications);
      } });
    await new Promise(resolve => setImmediate(resolve));
    const ask = nodes["dialogue-journals"].children.find(item => item.id === "abandoned-ask-town");
    assert.match(ask.textContent, /Listen.*stories/);
    const proximity = nodes["abandoned-journals"].children.find(item => item.id === "abandoned-proximity");
    const townText = nodes["abandoned-journals"].children.find(item => item.id === "abandoned-town-reports");
    assert.equal(proximity.hidden, true);
    assert.equal(nodes["abandoned-list"].children.length, 1);
    ui.open();
    assert.equal(nodes["trail-dialog"].open, true);
    nodes["trail-dialog"].close();
    assert.equal(nodes["open-quests"].focused, true);
    nodes["conversation-dialog"].showModal();
    await ask.listeners.click();
    assert.equal(sent.at(-1).action, "rumours");
    assert.ok(state.discovery.entries.some(entry => entry.channels.includes("npc")));
    const text = element => [element.textContent, ...element.children.map(child =>
      typeof child === "string" ? child : text(child))].join(" ");
    assert.equal(townText.id, "abandoned-town-reports");
    assert.equal(townText.open, true);
    assert.equal(nodes["conversation-dialog"].open, true);
    assert.equal(nodes["trail-dialog"].open, false);
    const list = townText.children[3];
    assert.equal(list.children.length, 1);
    assert.equal(list.children[0].children[0].open, false);
    assert.match(text(townText), /left a notebook.*east.*1 km.*not a guarantee/);
    assert.doesNotMatch(text(townText), /minute|latitude|longitude/);
    assert.equal(proximity.hidden, false);
    list.children[0].children[0].open = true;
    root.lang = "fr";
    ui.localize();
    assert.match(ask.textContent, /Écouter/);
    assert.match(text(townText), /est.*1 km.*pas une garantie/);
    assert.equal(list.children[0].children[0].open, true);
    available = false;
    await ask.listeners.click();
    assert.match(text(townText), /Disparu ou emporté/);
    assert.equal(proximity.hidden, true);
    state = { ...state, ended: "reunion" };
    ui.localize();
    assert.equal(ask.disabled, true);
    assert.equal(ask.hidden, true);
  } finally {
    for (const [key, value] of Object.entries(globals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
