import test from "node:test";
import assert from "node:assert/strict";
import { discoveryNotebookEntries, renderDiscoveryNotebook } from "../discovery-ui.mjs";
import { authoredCopy, authoredHint, dreamNotebookEntries } from "../discovery-authored.mjs";
import { discoveryIdentity } from "../discovery.mjs";
import { translate } from "../i18n.mjs";
import { readFileSync } from "node:fs";

const base = (type, kind, precision, facts, id = "hermit") => ({
  targetType: type, targetId: id, targetRevision: "1", evidenceKey: "location",
  kind, precision, facts, observedMinutes: 0, channels: ["npc"], source: "test",
  availability: "current", contentVersion: "authored-v1",
});
const stateWith = entries => ({ elapsedMinutes: 480, discovery: { version: 1, entries },
  lore: { dreams: { version: 1, episodes: [] }, interpretations: entries.map(entry =>
    ({ evidence: discoveryIdentity(entry), source: "npc", observedMinutes: 0 })) } });
class Element {
  children = []; events = {}; textContent = ""; hidden = false;
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(name, handler) { this.events[name] = handler; }
  set innerHTML(value) { throw new Error(`Unsafe HTML: ${value}`); }
}
const allNodes = node => [node, ...node.children.flatMap(allNodes)];

for (const locale of ["fr", "en"]) {
  const t = (key, args) => translate(locale, key, args);
  test(`${locale} authored ladders stay inside each earned precision, including all explanation levels`, () => {
    const facts = { artifact: "hermit", region: "Occitanie" };
    for (const precision of ["region", "town", "marker", "local"]) {
      if (precision === "town") facts.place = "Firmi";
      if (precision === "marker") facts.marker = "virtual:hermit";
      if (precision === "local") Object.assign(facts, { col: 14, row: 11 });
      const entry = base("artifact", "location", precision, { ...facts });
      const state = stateWith([entry]);
      const record = discoveryNotebookEntries(state, t, { authored: true })[0];
      const text = JSON.stringify(record.ladder);
      assert.doesNotMatch(text, /undefined|\{[a-z]+\}|virtual:hermit|Secret future town/);
      assert.match(text, /Occitanie|Firmi/);
      if (precision === "region") assert.doesNotMatch(text, /Firmi|14, 11/);
      if (precision !== "local") assert.doesNotMatch(text, /14, 11/);
      if (precision === "local") assert.match(record.ladder.plain, /14, 11/);
      assert.notEqual(record.ladder.evocative, record.ladder.explanation);
      assert.notEqual(record.ladder.explanation, record.ladder.plain);
    }
  });

  test(`${locale} six distinct patterns per domain do not repeat consecutively or change on reread/append`, () => {
    for (const [type, kind, precision, facts, id] of [
      ["artifact", "location", "region", { region: "Occitanie" }, "hermit"],
      ["parent-trail", "prefix", "vague", { prefix: "Fi" }, "stage:0"],
      ["abandoned-journal", "rumour", "local", { parent: "<img src=x>" }, "a".repeat(32)],
    ]) {
      const entries = Array.from({ length: 6 }, (_, n) => ({
        ...base(type, kind, precision, facts, id), targetRevision: String(n + 1),
      }));
      const state = stateWith(entries);
      const first = discoveryNotebookEntries(state, t, { authored: true });
      assert.equal(new Set(first.map(record => record.ladder.evocative)).size, 6);
      assert.deepEqual(discoveryNotebookEntries(structuredClone(state), t, { authored: true }), first);
      const extended = discoveryNotebookEntries(stateWith([...entries, {
        ...entries[0], targetRevision: "7",
      }]), t, { authored: true });
      assert.deepEqual(extended.slice(0, 6), first);
    }
  });

  test(`${locale} dream imagery covers every card without changing clue facts or claiming missed dreams are evidence`, () => {
    const cards = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url))).tarot;
    const entry = base("parent-trail", "prefix", "vague", { prefix: "Fi" }, "stage:0");
    for (const { id } of cards) {
      const episode = { id: 1, startedMinutes: 0, wokeMinutes: 480, birthCard: id,
        dailyCard: id, clue: discoveryIdentity(entry), outcome: "clue" };
      const state = stateWith([{ ...entry, channels: ["dream"] }]);
      state.lore.dreams.episodes.push(episode);
      const record = discoveryNotebookEntries(state, t, { authored: true })[0];
      assert.doesNotMatch(JSON.stringify(record.ladder), /undefined|\{[a-z]+\}|Firmi/);
      assert.match(record.ladder.plain, /Fi/);
      assert.ok(dreamNotebookEntries(state, locale)[0].text.length > 50);
      state.discovery.entries[0].availability = "historical";
      assert.match(dreamNotebookEntries(state, locale)[0].text, locale === "fr" ? /historique/ : /history/);
      episode.outcome = "miss";
      assert.match(dreamNotebookEntries(state, locale)[0].text, locale === "fr" ? /Aucun nouvel indice/ : /No new clue/);
    }
  });

  test(`${locale} explanation and plain guidance are safe, free UI-only operations and survive rerender`, context => {
    const original = globalThis.document;
    context.after(() => { globalThis.document = original; });
    globalThis.document = { createElement: () => new Element() };
    const container = new Element(), copy = authoredCopy(locale);
    const state = stateWith([base("parent-trail", "prefix", "vague", { prefix: "<b>Fi</b>" }, "stage:0")]);
    const before = structuredClone(state);
    renderDiscoveryNotebook(container, state, t, { authored: true });
    const buttons = allNodes(container).filter(node => node.type === "button");
    assert.deepEqual(buttons.map(node => node.textContent), [copy.explain, copy.plain]);
    buttons[0].events.click();
    buttons[1].events.click();
    assert.deepEqual(state, before);
    renderDiscoveryNotebook(container, state, t, { authored: true });
    const plain = allNodes(container).find(node => node.textContent ===
      discoveryNotebookEntries(state, t, { authored: true })[0].ladder.plain);
    assert.equal(plain.hidden, false);
    assert.match(plain.textContent, /<b>Fi<\/b>/);
  });

  test(`${locale} locked guidance cannot be revealed by Explain or stale open UI progress`, context => {
    const original = globalThis.document;
    context.after(() => { globalThis.document = original; });
    globalThis.document = { createElement: () => new Element() };
    const container = new Element(), copy = authoredCopy(locale);
    const state = stateWith([base("parent-trail", "prefix", "vague", { prefix: "Fi" }, "stage:0")]);
    renderDiscoveryNotebook(container, state, t, { authored: true });
    allNodes(container).find(node => node.textContent === copy.plain).events.click();
    state.lore.interpretations = [];
    const before = structuredClone(state);
    renderDiscoveryNotebook(container, state, t, { authored: true });
    const buttons = allNodes(container).filter(node => node.type === "button");
    assert.deepEqual(buttons.map(node => node.textContent), [copy.explain]);
    buttons[0].events.click();
    assert.equal(discoveryNotebookEntries(state, t, { authored: true })[0].ladder.plain, null);
    assert.deepEqual(state, before);
    let requested;
    renderDiscoveryNotebook(container, state, t, { authored: true,
      interpretationOffer: { status: "paid", available: true, minutes: 10, cents: 140 },
      onInterpret: evidence => { requested = evidence; } });
    allNodes(container).find(node => node.textContent === copy.interpret).events.click();
    assert.equal(requested, discoveryIdentity(state.discovery.entries[0]));
    assert.deepEqual(state, before);
    assert.ok(allNodes(container).some(node => node.textContent.includes("1.40")));
  });
}

test("unsupported authored locales, precisions and incomplete facts fail explicitly", () => {
  assert.throws(() => authoredCopy("xx"), /locale/);
  const t = (key, args) => translate("en", key, args);
  for (const precision of ["unknown", "local"]) {
    const entry = base("artifact", "location", precision, { region: "Region" });
    assert.throws(() => authoredHint(entry, stateWith([entry]), t, "plain", 0));
  }
});
