import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyJournalDiscovery, synchronizeParentDiscovery } from "../discovery-targets.mjs";
import { discoveryClueText, discoveryNotebookEntries, renderDiscoveryNotebook } from "../discovery-ui.mjs";
import { setupPhotoJournal } from "../photo-journal.mjs";
import { translate } from "../i18n.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";

test("the main notebook contains the shared-discovery host", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const notebook = html.slice(html.indexOf('<dialog id="photo-journal-dialog"'));
  assert.match(notebook.slice(0, notebook.indexOf("</dialog>")),
    /<details id="journal-discovery" hidden><\/details>/);
  assert.equal(html.match(/id="journal-discovery"/g)?.length, 1);
});

class Element {
  children = [];
  events = {};
  dataset = {};
  textContent = "";
  open = false;
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(event, callback) { this.events[event] = callback; }
  showModal() { this.open = true; }
  close() { this.open = false; this.events.close?.(); }
  set innerHTML(value) { throw new Error(`Unsafe HTML: ${value}`); }
}
function fixture() {
  return applyJournalDiscovery(synchronizeParentDiscovery({
    elapsedMinutes: 30, trail: { version: 2, index: 0, parentName: "Camille",
      completed: false, history: [], stages: [{ name: "Secret destination", col: 180, row: 0 }],
      exploration: { firstStage: 0, knownStage: null, hints: [
        { stage: 0, kind: "prefix", precision: "vague", col: 0, row: 0, elapsedMinutes: 10 },
      ] } },
  }), [], [{ id: "a".repeat(32), parent: "<b>Other parent</b>", history: [],
    stages: [{ name: "Unrevealed journal town", latitude: 44, longitude: 2 }],
    step: 0, delivered: false }]);
}
const texts = node => [node.textContent, ...node.children.flatMap(texts)].join(" ");

for (const locale of ["fr", "en"]) {
  const t = (key, args) => translate(locale, key, args);
  test(`${locale} shared notebook renders earned facts from both targets, newest first, as safe text`, test => {
    const original = globalThis.document;
    test.after(() => { globalThis.document = original; });
    globalThis.document = { createElement: () => new Element() };
    const container = new Element(), state = fixture();
    container.open = true;
    renderDiscoveryNotebook(container, state, t);
    assert.equal(container.hidden, false);
    assert.equal(container.open, true);
    assert.match(texts(container), /<b>Other parent<\/b>/);
    assert.doesNotMatch(texts(container), /Secret destination|Unrevealed journal town/);
    const records = discoveryNotebookEntries(state, t);
    assert.deepEqual(records.map(record => record.observedMinutes), [30, 10]);
    assert.ok(records.every(record => !record.text.startsWith("discovery.")));
    renderDiscoveryNotebook(container, { ...state, discovery: undefined }, t);
    assert.match(texts(container), new RegExp(t("discovery.empty")));
    renderDiscoveryNotebook(container, null, t);
    assert.equal(container.hidden, true);
    assert.equal(container.children.length, 0);
  });

  test(`${locale} actual notebook exports shared clues and isolates them from a found notebook`, async test => {
    const original = globalThis.document;
    test.after(() => { globalThis.document = original; });
    const nodes = new Map(), element = selector => {
      if (!nodes.has(selector)) nodes.set(selector, new Element());
      return nodes.get(selector);
    };
    globalThis.document = { documentElement: { lang: locale },
      createElement: () => new Element(),
      querySelector: selector => selector === "dialog[open]"
        ? [...nodes.values()].find(node => node.open) ?? null : element(selector) };
    const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
    const survival = json("../public/config.json").survival, economy = json("../public/economy.json");
    const actual = startEconomy(startSurvival(1, 2, Date.UTC(2026, 9, 17),
      "balanced", survival), economy, () => 0);
    const state = { ...actual, elapsedMinutes: 30, trail: { index: 0 },
      discovery: fixture().discovery };
    const exported = [];
    const ui = setupPhotoJournal(t, { store: { list: async () => [], get: async () => null },
      makePdf: async input => { exported.push(input); return new Blob(["PDF"]); },
      downloadPdf() {} });
    ui.updateStats({ state, survival, economy });
    element("#open-journal").events.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(element("#journal-discovery").hidden, false);
    assert.doesNotMatch(texts(element("#journal-discovery")), /Secret destination/);
    await element("#journal-export-pdf").events.click();
    assert.equal(exported[0].clues.length, 2);
    assert.doesNotMatch(exported[0].clues.join(" "), /Secret destination|Unrevealed journal town/);
    element("#photo-journal-dialog").close();
    await ui.showAbandoned([], ["Only the explicitly shared clue"]);
    assert.equal(element("#journal-discovery").hidden, true);
    await element("#journal-export-pdf").events.click();
    assert.deepEqual(exported[1].clues, ["Only the explicitly shared clue"]);
  });
}

test("unsupported clue presentation is an explicit error, not a success-shaped fallback", () => {
  for (const kind of ["unknown", "constructor", "toString"]) {
    assert.throws(() => discoveryClueText({ targetType: "parent-trail", kind, facts: {} },
      fixture(), key => key), /Unsupported discovery/);
  }
});
