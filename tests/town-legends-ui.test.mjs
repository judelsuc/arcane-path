import test from "node:test";
import assert from "node:assert/strict";
import { setupTownLegends } from "../town-legends-ui.mjs";
import { composedReward } from "../legend-rewards.mjs";

class Element {
  children = [];
  events = {};
  attributes = {};
  textContent = "";
  constructor(tag, doc) { this.tagName = tag; this.ownerDocument = doc; }
  append(node) { this.children.push(node); }
  replaceChildren() { this.children = []; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { this.events[name] = fn; }
  click() { if (!this.disabled) this.events.click?.(); }
}

const entry = { townId: "node/42", town: "Firmi", eligible: true, seed: 1, format: "platform", contentStatus: "unprepared" };
const flush = () => new Promise(resolve => setImmediate(resolve));
function enter(f, reward, format = "platform") {
  f.ui.acceptEntry({ ...entry, format, ...(reward ? { reward } : {}), exploration: { status: "found", clues: {
    en: ["Search the woodland.", "Find a slate disc.", "Match the bell and four dots."],
    fr: ["Cherchez dans les bois.", "Trouvez une rondelle en ardoise.", "Cloche et quatre points."],
  }, observations: [{ col: 1, row: 0, found: true, description: { en: "A bell.", fr: "Une cloche." } }] } });
  f.setContext({ ...f.getContext(), state: { ...f.getContext().state, col: 1 }, cell: { terrain: "forest" } });
  f.ui.localize();
}
test("entrances display the retained composed name and effect instead of a legacy cosmetic reward", async () => {
  for (const language of ["en", "fr"]) {
    const f = fixture({ discover: async () => ({ entry }) }, { startTrial() {} });
    f.doc.documentElement.lang = language;
    f.ui.localize();
    await flush();
    const reward = { ...composedReward(entry.seed), name: { en: "Copper Vigil", fr: "Veille de cuivre" } };
    enter(f, reward);
    assert.ok(f.text().includes(reward.name[language]));
    assert.match(f.text(), language === "en" ? /injury damage −20%; adventure fatigue \+25%/ :
      /blessure en aventure −20 % ; fatigue d'aventure \+25 %/);
    assert.doesNotMatch(f.text(), /Star atlas|Atlas céleste/);
  }
});
function fixture(client, options = {}) {
  const doc = { documentElement: { lang: "en" } };
  doc.createElement = tag => new Element(tag, doc);
  const host = new Element("section", doc);
  let context = { state: { serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(64), col: 0, row: 0 },
    cell: { terrain: "place", settlements: [{ osmId: entry.townId, name: entry.town }] }, blocked: false };
  const ui = setupTownLegends({ context: () => context, host, client, ...options });
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  return { ui, doc, host, setContext: next => { context = next; }, getContext: () => context,
    text: () => descendants(host).map(node => node.textContent).join(" "),
    button: text => descendants(host).find(node => node.tagName === "button" && node.textContent === text) };
}

test("a completed discovery refreshes local descriptions once without an observation feedback loop", async () => {
  let discoveries = 0;
  const f = fixture({ discover: async () => ({ entry }) }, { onDiscovery: () => discoveries++ });
  f.ui.localize();
  await flush();
  assert.equal(discoveries, 1);
  f.ui.acceptEntry(entry);
  f.ui.localize();
  assert.equal(discoveries, 1);
  f.ui.reset();
});

test("the assigned treasure adventure requires confirmation and respects activity blockers", async () => {
  const started = [], confirmations = [];
  let accepted = false;
  const f = fixture({ discover: async () => ({ entry: { ...entry, format: "investigation" } }) }, {
    startTrial: action => started.push(action),
    confirmTrial: message => { confirmations.push(message); return accepted; },
  });
  f.ui.localize();
  await flush();
  assert.equal(f.button("Try platforms (real costs, no treasure)"), undefined, "town arrival does not bypass search");
  enter(f);
  const trial = () => f.button("Recover the treasure");
  trial().click();
  assert.equal(started.length, 0);
  accepted = true;
  trial().click();
  assert.deepEqual(started, [{ type: "legend-start", townId: entry.townId, contentVersion: "treasure-platform-v1" }]);
  assert.match(confirmations[0], /3 minutes.*1 fatigue.*1 dirt.*-5 health/);
  assert.match(confirmations[0], /Reload discards.*entry again/);
  f.setContext({ ...f.getContext(), blocked: true });
  f.ui.localize();
  assert.equal(trial().disabled, true);
});

test("each retained format offers exactly one treasure action and no trial menu in both languages", async () => {
      for (const language of ["en", "fr"]) for (const format of ["platform", "investigation", "dungeon"]) {
        const actions = [], confirmations = [];
        const f = fixture({ discover: async () => ({ entry }) }, {
          startTrial: action => actions.push(action),
          confirmTrial: message => { confirmations.push(message); return true; },
        });
        f.doc.documentElement.lang = language;
        f.ui.localize();
        await flush();
        const label = language === "en" ? "Recover the treasure" : "Retrouver le trésor";
        assert.equal(f.button(`${label} — ${language === "en" ? "Platforms" : "Plateformes"}`), undefined);
        enter(f, undefined, format);
        f.button(label).click();
        assert.deepEqual(actions.map(action => action.contentVersion), [`treasure-${format}-v1`]);
        assert.doesNotMatch(f.text(), /Try platforms|Try a dungeon|Try a generated|Essayer|No item or money/);
        assert.ok(confirmations.every(message => message.includes("3 minutes")));
        assert.match(confirmations[0], language === "en" ? /first successful.*bag is full.*only while carried/ :
          /premier explorateur.*sac est plein.*uniquement tant qu'il est porté/);
        assert.doesNotMatch(confirmations[0], /No item|Aucun objet/);
        f.setContext({ ...f.getContext(), state: { ...f.getContext().state, col: 2 } });
        f.ui.localize();
        assert.equal(f.button(label), undefined);
      }
});
test("arrival records the town once per position and shows actual unprepared status in both languages", async () => {
  let calls = 0;
  const f = fixture({ discover: async () => { calls++; return { entry }; }, list: async () => ({ entries: [], cursor: null }) });
  f.ui.localize();
  await flush();
  assert.equal(calls, 1);
  assert.match(f.text(), /Firmi.*not prepared yet/);
  f.ui.localize();
  f.ui.localize();
  await flush();
  assert.equal(calls, 1);
  f.doc.documentElement.lang = "fr";
  f.ui.localize();
  assert.match(f.text(), /pas encore préparée/);
  assert.equal(calls, 1);
});


test("late replies cannot show a town left behind or another journey's private history", async () => {
  let resolve;
  const f = fixture({ discover: () => new Promise(done => { resolve = done; }), list: async () => ({ entries: [], cursor: null }) });
  f.ui.localize();
  f.setContext({ ...f.getContext(), cell: { terrain: "forest" } });
  f.ui.localize();
  resolve({ entry });
  await flush();
  assert.doesNotMatch(f.text(), /Firmi/);
  f.setContext(null);
  f.ui.localize();
  assert.match(f.text(), /private server journey/);
});

test("failure is visible, does not auto-reroll, and explicit retry can recover a retained decision", async () => {
  let calls = 0;
  const f = fixture({ discover: async () => {
    if (++calls === 1) throw new Error("Database unavailable");
    return { entry };
  }, list: async () => ({ entries: [], cursor: null }) });
  const previous = console.error;
  console.error = () => {};
  try {
    f.ui.localize();
    await flush();
    assert.match(f.text(), /Database unavailable/);
    f.ui.localize();
    await flush();
    assert.equal(calls, 1);
    f.button("Retry discovery").click();
    await flush();
    assert.equal(calls, 2);
    assert.match(f.text(), /Firmi.*not prepared yet/);
  } finally { console.error = previous; }
});

test("history pagination stays private across journey changes and pending actions defer discovery", async () => {
  const cursors = [];
  let calls = 0;
  const f = fixture({ discover: async () => { calls++; return { entry }; },
    list: async (_state, cursor) => {
      cursors.push(cursor);
      return cursor ? { entries: [{ ...entry, townId: "node/43", town: "Decazeville" }], cursor: null }
        : { entries: [entry], cursor: "node/42" };
    } });
  f.setContext({ ...f.getContext(), blocked: true });
  f.ui.localize();
  await flush();
  assert.equal(calls, 0);
  f.setContext({ ...f.getContext(), blocked: false });
  f.ui.localize();
  await flush();
  f.button("Load discovery history").click();
  await flush();
  f.button("Load more towns").click();
  await flush();
  assert.deepEqual(cursors, [null, "node/42"]);
  assert.match(f.text(), /Decazeville/);
  f.setContext({ ...f.getContext(), state: { ...f.getContext().state,
    serverJourney: { id: "c".repeat(32) }, journalAccess: "d".repeat(64) }, cell: { terrain: "forest" } });
  f.ui.localize();
  assert.doesNotMatch(f.text(), /Firmi|Decazeville/);
});

test("late history responses are ignored after changing private journey", async () => {
  let resolve;
  const f = fixture({ discover: async () => ({ entry }),
    list: () => new Promise(done => { resolve = done; }) });
  f.ui.localize();
  await flush();
  f.button("Load discovery history").click();
  f.setContext({ ...f.getContext(), state: { ...f.getContext().state,
    serverJourney: { id: "c".repeat(32) }, journalAccess: "d".repeat(64) }, cell: { terrain: "forest" } });
  f.ui.localize();
  resolve({ entries: [{ ...entry, town: "Private old journey town" }], cursor: null });
  await flush();
  assert.doesNotMatch(f.text(), /Private old journey town|Firmi/);
});

test("late history cannot erase a newly inspected entrance and old buttons cannot enter after moving away", async () => {
  let resolve;
  const starts = [];
  const f = fixture({ discover: async () => ({ entry }),
    list: () => new Promise(done => { resolve = done; }) }, {
    startTrial: action => starts.push(action), confirmTrial: () => true,
  });
  f.ui.localize();
  await flush();
  f.button("Load discovery history").click();
  enter(f);
  const trial = f.button("Recover the treasure");
  assert.ok(trial);
  resolve({ entries: [{ ...entry, exploration: { status: "searching", clues: {
    en: ["Search the woodland.", "Find a slate disc.", "Match the bell and four dots."],
    fr: ["Cherchez dans les bois.", "Trouvez une rondelle en ardoise.", "Cloche et quatre points."],
  }, observations: [] } }], cursor: null });
  await flush();
  assert.ok(f.button("Recover the treasure"));
  f.setContext({ ...f.getContext(), state: { ...f.getContext().state, col: 2 } });
  trial.click();
  assert.deepEqual(starts, []);
  f.ui.localize();
  assert.equal(f.button("Recover the treasure"), undefined);
});

test("shared story and stable NPC voices always retain all canonical clues in both languages", async () => {
  for (const language of ["en", "fr"]) {
      const clues = { en: ["Search the woodland.", "Find a slate disc.", "Match the bell and four dots."],
        fr: ["Cherchez dans les bois.", "Trouvez une rondelle en ardoise.", "Cloche et quatre points."] };
      const prepared = { ...entry, exploration: { status: "searching", clues, observations: [] } };
      let record;
      const requests = [], listeners = [];
      const narrative = {
        get: () => record, request: (_state, townId) => { requests.push(townId); },
        subscribe: listener => listeners.push(listener), reset() {},
      };
      const f = fixture({ discover: async () => ({ entry: prepared }) }, { narrative });
      f.doc.documentElement.lang = language;
      f.ui.localize();
      await flush();
      const speaker = { id: "a".repeat(32), role: "artisan" };
      const before = f.ui.telling(speaker, true);
      for (const clue of clues[language]) assert.ok(before.text.includes(clue));
      assert.deepEqual(requests, [entry.townId]);
      record = { status: "ready", text: { en: "A canonical shared story.", fr: "Un récit commun." },
        treasureName: { en: "Copper Vigil", fr: "Veille de cuivre" },
        alternatives: [
          { en: "Practical account.", fr: "Récit pratique." },
          { en: "Sentimental account.", fr: "Récit sentimental." },
          { en: "Sceptical account.", fr: "Récit sceptique." },
        ] };
      listeners[0]();
      assert.ok(f.text().includes(record.text[language]));
      assert.ok(f.text().includes(record.treasureName[language]));
      assert.doesNotMatch(f.text(), /fiction|fictif|AI-generated|générée? par IA|authoritative|référence|reroll|tir[ée] au sort|use Look|utilisez Regarder/i);
      const tellings = new Set();
      for (let index = 0; index < 24; index++) {
        const character = { id: index.toString(16).padStart(32, "0"), role: "artisan" };
        const telling = f.ui.telling(character);
        assert.deepEqual(f.ui.telling(character), telling);
        assert.equal(telling.status, "", "ready NPC accounts have no generation disclaimer");
        for (const clue of clues[language]) assert.ok(telling.text.includes(clue));
        assert.ok(telling.text.includes(record.treasureName[language]));
        tellings.add(telling.text);
      }
      assert.equal(tellings.size, 3);
      record = { status: "failed" };
      listeners[0]();
      assert.match(f.text(), language === "en" ? /No automatic retry/ : /Aucun nouvel essai automatique/);
      for (const clue of clues[language]) assert.ok(f.ui.telling(speaker).text.includes(clue));
      f.setContext({ ...f.getContext(), cell: { terrain: "forest" } });
      f.ui.localize();
      assert.match(f.ui.telling(speaker).text, language === "en" ? /do not know/ : /ne connais pas/);
  }
});
