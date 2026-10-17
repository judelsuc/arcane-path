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
