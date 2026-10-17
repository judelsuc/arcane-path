import test from "node:test";
import assert from "node:assert/strict";
import { setupPhotoJournal, validateJournalPhoto } from "../photo-journal.mjs";
import { translate } from "../i18n.mjs";
import { readFileSync } from "node:fs";

const photo = (id = 1) => ({ blob: new Blob(["image fixture"], { type: "image/png" }),
  title: `Secret photo ${id}`, attribution: "Photographer", license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  sourceUrl: `https://example.org/photo/${id}`, note: "", pinnedAt: `2026-10-17T12:00:0${id}Z` });

test("field clue photo viewer is not nested in the hidden town-discovery section", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const discovery = /<section id="trail-discovery"[^>]*>([\s\S]*?)<\/section>/.exec(html);
  assert.ok(discovery);
  assert.doesNotMatch(discovery[1], /id="trail-clue-photo"/);
  assert.match(html, /<\/section>\s*<figure id="trail-clue-photo" hidden><\/figure>/);
});

test("journal accepts licensed images only, rejecting oversized blobs and unsafe links", () => {
  validateJournalPhoto(photo());
  for (const change of [{ blob: null }, { blob: new Blob(["not an image"]) },
    { blob: new Blob([new Uint8Array(12_000_001)], { type: "image/png" }) },
    { sourceUrl: "javascript:alert(1)" }, { licenseUrl: "file:///private" },
    { attribution: "" }, { license: "" }, { title: "" }]) {
    assert.throws(() => validateJournalPhoto({ ...photo(), ...change }), /Invalid photo/);
  }
});

for (const locale of ["fr", "en"]) {
  test(`${locale} pins all photo types, renders two notebook pages, saves notes and retains credits without clue titles`, async t => {
    const original = { document: globalThis.document, confirm: globalThis.confirm };
    t.after(() => { globalThis.document = original.document; globalThis.confirm = original.confirm; });
    class Element {
      dataset = {};
      children = []; events = {}; textContent = ""; open = false; value = "";
      addEventListener(type, callback) { this.events[type] = callback; }
      append(...children) { this.children.push(...children); }
      replaceChildren() { this.children = []; }
      showModal() { this.open = true; }
      close() { this.open = false; this.events.close?.(); }
    }
    const elements = new Map();
    const element = selector => {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    };
    globalThis.document = { createElement: () => new Element(),
      querySelector: selector => selector === "dialog[open]"
        ? [...elements.values()].find(e => e.open) ?? null : element(selector) };
    globalThis.confirm = () => true;
    const rows = new Map(), reads = [];
    const store = {
      async pin(p, options = {}) {
        validateJournalPhoto(p);
        if (rows.has(p.sourceUrl)) return false;
        rows.set(p.sourceUrl, { ...p, unannotated: options.unannotated ?? false });
        return true;
      },
      async list() { return [...rows].map(([id, p]) => ({ id, pinnedAt: p.pinnedAt })); },
      async get(id) { reads.push(id); return rows.get(id); },
      async note(id, note) { rows.set(id, { ...rows.get(id), note }); },
      async remove(id) { rows.delete(id); },
    };
    const tr = (key, args) => translate(locale, key, args);
    const ui = setupPhotoJournal(tr, { store });
    for (let i = 1; i <= 3; i++) {
      const container = new Element();
      ui.pinButton(container, photo(i), { unannotated: i === 2 });
      await container.children[0].events.click();
      assert.equal(container.children[1].textContent, tr("journalPinned"));
    }
    const duplicate = new Element();
    ui.pinButton(duplicate, photo(1));
    await duplicate.children[0].events.click();
    assert.equal(duplicate.children[1].textContent, tr("journalAlreadyPinned"));
    element("#open-journal").events.click();
    await new Promise(resolve => setImmediate(resolve));
    const pages = element("#journal-pages").children;
    assert.equal(pages.length, 2);
    assert.equal(reads.length, 2);
    assert.equal(element("#journal-previous").disabled, true);
    assert.equal(element("#journal-next").disabled, false);
    const flattened = node => typeof node === "string" ? [node] :
      [node.textContent, ...node.children.flatMap(flattened)];
    const text = pages.flatMap(flattened).join(" ");
    assert.match(text, /Photographer.*CC BY/);
    assert.doesNotMatch(text, /Secret photo 2/);
    assert.equal(pages[1].children[0].children[0].alt, tr("fieldClue.photo"));
    const caption = pages[0].children[0].children[1];
    const note = caption.children[0].children[0];
    note.value = "A useful handwritten memory";
    note.events.input();
    await note.events.change();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(rows.get(photo(1).sourceUrl).note, "A useful handwritten memory");
    element("#journal-next").events.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(element("#journal-next").disabled, true);
    assert.equal(element("#journal-pages").children.length, 2);
    assert.equal(reads.length, 3);
    assert.ok(flattened(element("#journal-pages")).join(" ").includes(tr("journalEmpty")));
    element("#journal-previous").events.click();
    await new Promise(resolve => setImmediate(resolve));
    const restored = element("#journal-pages").children[0].children[0].children[1].children[0].children[0];
    assert.equal(restored.value, "A useful handwritten memory");
    restored.value = "A draft not yet blurred";
    restored.events.input();
    await ui.useJourney({ startedAt: 0, serverJourney: { id: "b".repeat(32) } });
    assert.equal(rows.get(photo(1).sourceUrl).note, "A draft not yet blurred");
    element("#photo-journal-dialog").close();
    assert.equal(element("#journal-pages").children.length, 0);
  });
}

test("storage errors are visible and allow retry rather than claiming a successful pin", async t => {
  const original = globalThis.document;
  t.after(() => { globalThis.document = original; });
  class Element {
    dataset = {};
    children = []; events = {};
    append(...children) { this.children.push(...children); }
    addEventListener(type, callback) { this.events[type] = callback; }
  }
  const elements = new Map();
  globalThis.document = { createElement: () => new Element(), querySelector: selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  } };
  const ui = setupPhotoJournal((key, args) => `${key} ${args?.error ?? ""}`, {
    store: { async pin() { throw new Error("Quota exceeded"); } },
  });
  const container = new Element();
  ui.pinButton(container, photo());
  await container.children[0].events.click();
  assert.equal(container.children[0].disabled, false);
  assert.match(container.children[1].textContent, /journalError Quota exceeded/);
});

test("automatic tarot pins show storage failures with retry and do not pin again on repeated rendering", async t => {
  const original = { document: globalThis.document, fetch: globalThis.fetch };
  t.after(() => { globalThis.document = original.document; globalThis.fetch = original.fetch; });
  class Element {
    dataset = {}; children = []; events = {};
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(type, callback) { this.events[type] = callback; }
  }
  globalThis.document = { documentElement: { lang: "en" }, createElement: () => new Element(),
    querySelector: () => new Element() };
  globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(["jpeg"], { type: "image/jpeg" }) });
  const data = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));
  const state = { startedAt: Date.UTC(2026, 9, 17), birthCard: "sun", dailyCard: "moon",
    tarotDay: "2026-10-18", serverJourney: { id: "a".repeat(32) } };
  let calls = 0;
  const ui = setupPhotoJournal((key, args) => translate("en", key, args), {
    store: { async get() {}, async pin() {
      calls++;
      if (calls === 1) throw new Error("Storage full");
      return true;
    } },
  });
  const container = new Element();
  ui.pinTarot(container, state, "birth", data);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(container.children[0].textContent, /Storage full/);
  assert.equal(container.children[0].dataset.feedback, "failure");
  assert.equal(container.children[1].hidden, false);
  container.children[1].events.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(container.children[0].textContent, /Birth card.*2026-10-17.*pinned/);
  assert.equal(container.children[0].dataset.feedback, "success");
  assert.equal(container.children[1].hidden, true);
  ui.pinTarot(container, state, "birth", data);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
});
