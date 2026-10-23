import test from "node:test";
import assert from "node:assert/strict";
import { setupPhotoJournal, validateJournalPhoto, biographyJournalEntries } from "../photo-journal.mjs";
import { translate } from "../i18n.mjs";
import { readFileSync } from "node:fs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { COVER_ART_ID } from "../journal-art.mjs";
import { JOURNAL_SUBTITLE } from "../live-narrative.mjs";
import { createJourneyStore } from "../journey-save.mjs";
import { createTrail } from "../trail.mjs";
import { CLOSING_STORY, closingStoryText } from "../closing-story.mjs";

const photo = (id = 1) => ({ blob: new Blob(["image fixture"], { type: "image/png" }),
  title: `Secret photo ${id}`, attribution: "Photographer", license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  sourceUrl: `https://example.org/photo/${id}`, note: "", pinnedAt: `2026-10-17T12:00:0${id}Z` });

for (const language of ["fr", "en"]) {
  for (const ended of ["health", "hunger", "fatigue", "sleep", "reunion", "placement"]) {
    test(`${language}/${ended} saved ending recovers in the journal and PDF without changing gameplay`, async test => {
      const original = { document: globalThis.document, confirm: globalThis.confirm };
      test.after(() => Object.assign(globalThis, original));
      class Element {
        dataset = {}; children = []; events = {}; open = false; textContent = "";
        append(...children) { this.children.push(...children); }
        replaceChildren(...children) { this.children = children; }
        addEventListener(type, callback) { this.events[type] = callback; }
        showModal() { this.open = true; }
        close() { this.open = false; this.events.close?.(); }
      }
      const elements = new Map(), element = selector => {
        if (!elements.has(selector)) elements.set(selector, new Element());
        return elements.get(selector);
      };
      globalThis.document = { documentElement: { lang: language }, createElement: () => new Element(),
        querySelector: selector => selector === "dialog[open]"
          ? [...elements.values()].find(e => e.open) ?? null : element(selector) };
      const survival = JSON.parse(readFileSync(new URL("../public/config.json", import.meta.url))).survival;
      const economy = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));
      const state = { ...startEconomy(startSurvival(1, 2, Date.UTC(2026, 9, 17),
        "balanced", survival), economy, () => 0), ended, distanceMeters: 12500, elapsedMinutes: 3000,
        trail: { index: 0, stages: [{ name: "Known village" }, { name: "Unvisited village" }],
          arrivals: [{ stage: 0, elapsedMinutes: 120 }], history: [] } };
      const before = structuredClone(state), requests = [];
      let generated = null, notify, exported, pending = true, rewrites = 0;
      const tr = (key, args) => translate(document.documentElement.lang, key, args);
      const ui = setupPhotoJournal(tr, {
        narrative: {
          prefetch(state, ids) { requests.push(...ids); },
          snapshot(state, id) { return id === CLOSING_STORY ? generated : null; },
          status() { return pending ? "Writing" : generated ? "Ready" : "Writing failed"; },
          pending(state, id) { return id === CLOSING_STORY && pending; },
          subscribe(listener) { notify = listener; },
          regenerateClosing(owner) {
            assert.equal(owner, state);
            rewrites++;
            pending = true;
            notify();
          },
        },
        store: { list: async () => [], get: async () => null },
        makePdf: async input => { exported = input; return new Blob(["PDF"]); }, downloadPdf() {},
      });
      ui.updateStats({ state, survival, economy });
      element("#open-journal").events.click();
      await new Promise(resolve => setImmediate(resolve));
      const expected = closingStoryText(state, tr, null, language, { includePlacement: true });
      assert.equal(element("#journal-closing-story").hidden, false);
      assert.equal(element("#journal-closing-text").textContent, expected);
      assert.match(expected, /12\.50/);
      assert.ok(expected.includes("Known village"));
      assert.ok(!expected.includes("Unvisited village"));
      assert.equal(requests.includes(CLOSING_STORY), true);
      assert.equal(element("#journal-closing-status").ariaBusy, "true");
      await element("#journal-export-pdf").events.click();
      assert.equal(exported.backCover.text, expected, "PDF ends with the complete closing account");
      assert.ok(!exported.clues.includes(expected), "closing account is not duplicated among clues");
      assert.equal(element("#journal-pages").hidden, true);
      assert.equal(element("#journal-count").textContent, tr("journalBackCoverPage"));
      element("#journal-cover-page").events.click();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(element("#journal-closing-story").hidden, true);
      assert.equal(element("#journal-pages").hidden, false);
      element("#journal-back-cover-page").events.click();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(element("#journal-closing-story").hidden, false);
      pending = false;
      notify();
      assert.equal(element("#journal-closing-text").textContent, expected, "failed generation keeps authored summary");
      {
        generated = { fr: "La chronique complète du voyage.", en: "The complete journey chronicle." };
        notify();
        assert.equal(element("#journal-closing-text").textContent, generated[language]);
        await new Promise(resolve => setImmediate(resolve));
        await element("#journal-export-pdf").events.click();
        assert.equal(exported.backCover.text, generated[language]);
        state.journalAccess = "a".repeat(64);
        state.serverJourney = { id: "b".repeat(32) };
        ui.localize();
        assert.equal(element("#journal-closing-rewrite").hidden, false);
        globalThis.confirm = () => false;
        element("#journal-closing-rewrite").events.click();
        assert.equal(rewrites, 0);
        globalThis.confirm = () => true;
        element("#journal-closing-rewrite").events.click();
        assert.equal(rewrites, 1);
        assert.equal(element("#journal-closing-rewrite").disabled, true);
        assert.equal(element("#journal-closing-text").textContent, generated[language]);
        element("#journal-closing-rewrite").events.click();
        assert.equal(rewrites, 1);
        pending = false;
        notify();
        delete state.journalAccess;
        delete state.serverJourney;
        document.documentElement.lang = language === "fr" ? "en" : "fr";
        ui.localize();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(element("#journal-closing-text").textContent, generated[document.documentElement.lang]);
      }
      element("#photo-journal-dialog").close();
      await ui.showAbandoned([], ["Another traveller's account"]);
      assert.equal(element("#journal-closing-story").hidden, true, "never leak own ending into another notebook");
      await element("#journal-export-pdf").events.click();
      assert.deepEqual(exported.clues, ["Another traveller's account"]);
      assert.equal(exported.backCover, null);
      element("#photo-journal-dialog").close();
      ui.updateStats(null);
      assert.equal(element("#journal-closing-story").hidden, true);
      ui.updateStats({ state: { ...state, ended: null }, survival, economy });
      assert.equal(element("#journal-closing-story").hidden, true, "ongoing journeys have no ending");
      assert.deepEqual(state, before);
    });
  }
}

test("biographies keep complete bilingual revisions in the scoped notebook, PDF and shared snapshot", async test => {
  const original = { document: globalThis.document, fetch: globalThis.fetch };
  test.after(() => Object.assign(globalThis, original));
  class Element {
    dataset = {}; children = []; events = {}; open = false;
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(type, callback) { this.events[type] = callback; }
    showModal() { this.open = true; }
  }
  const elements = new Map(), element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  globalThis.document = { documentElement: { lang: "en" }, createElement: () => new Element(),
    querySelector: element };
  let imageCalls = 0, fail = false, exported;
  globalThis.fetch = async url => {
    imageCalls++;
    assert.equal(url, "/public/tarot/star.jpg");
    return new Response(new Blob(["image"], { type: "image/jpeg" }));
  };
  const books = new Map();
  const store = { async scope(owner) {
    if (!books.has(owner)) books.set(owner, new Map());
    const entries = books.get(owner);
    return {
      async list() { return [...entries.keys()].map(id => ({ id })); },
      async get(id) { return entries.get(id); },
      async pin(photo, options) {
        if (fail) throw new Error("Biography storage full");
        if (entries.has(options.id)) return false;
        entries.set(options.id, { ...photo, ...options });
        return true;
      },
    };
  } };
  const ui = setupPhotoJournal((key, args) => translate("en", key, args), {
    store, makePdf: async input => { exported = input; return new Blob(["pdf"]); }, downloadPdf() {},
  });
  const state = { serverJourney: { id: "journey-a" }, birthCard: "star" };
  const wording = { fr: "Un récit complet. ".repeat(100), en: "A complete story. ".repeat(100) };
  await ui.useJourney(state);
  const pending = ui.pinBiography(state, wording);
  assert.equal(ui.pinBiography(state, wording), pending);
  const snapshot = await ui.snapshot(state);
  await pending;
  assert.deepEqual(snapshot.map(entry => entry.note), [wording.fr, wording.en]);
  assert.equal(imageCalls, 2);
  element("#photo-journal-dialog").open = true;
  await element("#journal-export-pdf").events.click();
  assert.deepEqual(exported.photos.map(entry => entry.note), [wording.fr, wording.en]);
  element("#photo-journal-dialog").open = false;
  const revised = { fr: "Un nouveau récit.", en: "A new story." };
  fail = true;
  await assert.rejects(ui.pinBiography(state, revised), /Biography storage full/);
  await assert.rejects(ui.snapshot(state), /Biography storage full/);
  assert.match(element("#journal-status").textContent, /Biography storage full/);
  fail = false;
  await ui.pinBiography(state, revised);
  assert.deepEqual((await ui.snapshot(state)).map(entry => entry.note),
    [wording.fr, wording.en, revised.fr, revised.en]);
  assert.deepEqual(await ui.snapshot({ serverJourney: { id: "journey-b" } }), []);
  assert.deepEqual(await biographyJournalEntries(state, wording), await biographyJournalEntries(state, wording));
  const authored = await biographyJournalEntries(state, wording, false);
  assert.deepEqual(authored.map(entry => entry.note), [wording.fr, wording.en]);
  assert.ok(authored.every(entry => !/AI|IA|OVH/.test(entry.title)));
  await assert.rejects(biographyJournalEntries(state, { en: "Incomplete" }), /Invalid journal biography/);
  await ui.showAbandoned(snapshot, []);
  assert.deepEqual(element("#journal-pages").children.map(page =>
    page.children.find(child => child.className === "journal-narrative-text").textContent),
  [wording.fr, wording.en]);
});

test("archived notebook selector reads preserved photos without changing or publishing the new notebook", async test => {
  const original = { document: globalThis.document, localStorage: globalThis.localStorage };
  test.after(() => Object.assign(globalThis, original));
  class Element {
    dataset = {}; children = []; events = {}; open = false; textContent = ""; value = "";
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(type, callback) { this.events[type] = callback; }
    insertAdjacentElement(position, child) { this.children.push(child); }
    showModal() { this.open = true; }
  }
  const elements = new Map(), element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  globalThis.document = { documentElement: { lang: "en" }, createElement: () => new Element(),
    querySelector: selector => selector === "dialog[open]"
      ? [...elements.values()].find(e => e.open) ?? null : element(selector) };
  const rows = new Map();
  globalThis.localStorage = { get length() { return rows.size; }, key: i => [...rows.keys()][i] ?? null,
    getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value) };
  const map = JSON.parse(readFileSync(new URL("../public/map.json", import.meta.url)));
  const survival = JSON.parse(readFileSync(new URL("../public/config.json", import.meta.url))).survival;
  const economy = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));
  const state = { ...startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 20),
    "balanced", survival), economy, () => 0), name: "Archived Alex", ended: "hunger",
    trail: createTrail(map, 14, 10, () => 0) };
  const saved = createJourneyStore(localStorage);
  saved.read("firmi");
  saved.archive(saved.write({ region: "firmi", map, state, survival, economy }));
  const scopes = [], calls = [];
  const oldPhoto = { ...photo(7), caption: "Old notebook photo", id: "old" };
  const ui = setupPhotoJournal((key, args) => translate("en", key, args), { store: {
    scope: async scope => { scopes.push(scope); return {
      list: async () => [{ id: "old" }], get: async id => id === "old" ? oldPhoto : null,
    }; },
  }, makePdf: async input => { calls.push(input); return new Blob(["PDF"]); }, downloadPdf() {} });
  ui.localize();
  const select = element("#journal-export-pdf").children[0];
  assert.equal(select.hidden, false);
  select.value = select.children[1].value;
  await select.events.change();
  await element("#journal-export-pdf").events.click();
  assert.deepEqual(scopes, [`local:${state.startedAt}`]);
  assert.equal(calls[0].photos[0].caption, "Old notebook photo");
  assert.equal(calls[0].title, "Archived notebooks");
  assert.match(element("#journal-abandoned-clues").children[1].textContent, /Archived Alex/);
  assert.equal(calls[0].backCover.text, closingStoryText(state,
    (key, args) => translate("en", key, args), null, "en", { includePlacement: true }));
  assert.equal(rows.size, 2);
});

test("own cover image and generated bilingual subtitle appear on the cover and in its PDF", async test => {
  const original = globalThis.document;
  test.after(() => { globalThis.document = original; });
  class Element {
    dataset = {}; children = []; events = {}; open = false; textContent = "";
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(type, callback) { this.events[type] = callback; }
    showModal() { this.open = true; }
  }
  const elements = new Map(), element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  globalThis.document = { documentElement: { lang: "en" }, createElement: () => new Element(),
    querySelector: selector => selector === "dialog[open]"
      ? [...elements.values()].find(e => e.open) ?? null : element(selector) };
  let generated = null, notify, exported;
  const subtitle = { en: "A lantern on the autumn road.", fr: "Une lanterne sur le chemin d'automne." };
  const artwork = photo(99), reads = [];
  const narrative = {
    prefetch(state, ids) { assert.deepEqual(ids, [JOURNAL_SUBTITLE]); },
    snapshot() { return generated; },
    status() { return generated ? "Generated subtitle ready" : "Subtitle pending"; },
    subscribe(listener) { notify = listener; },
  };
  const ui = setupPhotoJournal((key, args) => translate(document.documentElement.lang, key, args), {
    narrative,
    store: { list: async () => [], get: async id => { reads.push(id); return id === COVER_ART_ID ? artwork : null; } },
    makePdf: async input => { exported = input; return new Blob(["pdf"]); }, downloadPdf() {},
  });
  const survival = JSON.parse(readFileSync(new URL("../public/config.json", import.meta.url))).survival;
  const economy = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));
  const state = { ...startEconomy(startSurvival(1, 2, Date.UTC(2026, 9, 20),
    "balanced", survival), economy, () => 0), name: "Alex",
    birthCard: "hermit", dailyCard: "moon", trail: { origin: { name: "Firmi" } } };
  ui.updateStats({ state, survival, economy });
  element("#open-journal").events.click();
  await new Promise(resolve => setImmediate(resolve));
  const page = () => element("#journal-pages").children[0];
  assert.ok(page().children.some(child => child.textContent === "From Firmi, following a parent's trail."));
  assert.ok(page().children.some(child => child.className === "journal-cover-art"));
  generated = subtitle;
  notify();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(page().children.some(child => child.textContent === subtitle.en));
  document.documentElement.lang = "fr";
  ui.localize();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(page().children.some(child => child.textContent === subtitle.fr));
  await element("#journal-export-pdf").events.click();
  assert.equal(exported.cover.subtitle, subtitle.fr);
  assert.equal(exported.cover.artwork, artwork);
  assert.ok(reads.every(id => id === COVER_ART_ID));
});

for (const locale of ["fr", "en"]) {
  test(`${locale} PDF exports every page, saves unblurred drafts, includes statistics and isolates found notebooks`, async test => {
    const original = globalThis.document;
    test.after(() => { globalThis.document = original; });
    class Element {
      dataset = {}; children = []; events = {}; open = false; textContent = "";
      append(...children) { this.children.push(...children); }
      replaceChildren(...children) { this.children = children; }
      addEventListener(event, callback) { this.events[event] = callback; }
      showModal() { this.open = true; }
      close() { this.open = false; this.events.close?.(); }
    }
    const elements = new Map(), element = selector => {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    };
    globalThis.document = { documentElement: { lang: locale }, createElement: () => new Element(),
      querySelector: selector => selector === "dialog[open]"
        ? [...elements.values()].find(e => e.open) ?? null : element(selector) };
    const rows = new Map([1, 2, 3].map(id => [String(id), photo(id)]));
    let failWrite = false, failPdf = false, calls = [], downloads = 0, finishPdf;
    const ui = setupPhotoJournal((key, args) => translate(locale, key, args), { store: {
      list: async () => [...rows.keys()].map(id => ({ id, pinnedAt: rows.get(id).pinnedAt })),
      get: async id => rows.get(id),
      note: async (id, note) => {
        if (failWrite) throw new Error("Storage full");
        rows.set(id, { ...rows.get(id), note });
      },
    }, makePdf: async input => {
      calls.push(input);
      if (failPdf) throw new Error("PDF encoding failed");
      if (finishPdf) await finishPdf;
      return new Blob(["PDF"]);
    },
    downloadPdf: () => { downloads++; } });
    const survival = JSON.parse(readFileSync(new URL("../public/config.json", import.meta.url))).survival;
    const economy = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));
    const state = { ...startEconomy(startSurvival(1, 2, Date.UTC(2026, 9, 17),
      "balanced", survival), economy, () => 0), trail: { index: 0 } };
    ui.updateStats({ state, survival, economy });
    element("#open-journal").events.click();
    await new Promise(resolve => setImmediate(resolve));
    element("#journal-photos-page").events.click();
    await new Promise(resolve => setImmediate(resolve));
    const note = element("#journal-pages").children[0].children[0].children[1].children[0].children[0];
    note.value = "Unblurred PDF note";
    note.events.input();
    await element("#journal-export-pdf").events.click();
    assert.equal(downloads, 1);
    assert.equal(calls[0].photos.length, 3);
    assert.equal(calls[0].photos[0].note, "Unblurred PDF note");
    assert.ok(calls[0].groups.length);
    assert.ok(calls[0].route);
    assert.ok(calls[0].cover.title);
    assert.deepEqual(calls[0].clues, []);
    assert.equal(element("#journal-export-pdf").disabled, false);
    failWrite = true;
    note.value = "Cannot save this draft";
    note.events.input();
    await element("#journal-export-pdf").events.click();
    assert.equal(downloads, 1);
    assert.match(element("#journal-status").textContent, /Storage full/);
    failWrite = false;
    element("#photo-journal-dialog").close();
    await ui.showAbandoned([{ ...photo(4), id: "found" }], ["Previously collected clue"]);
    await element("#journal-export-pdf").events.click();
    assert.equal(downloads, 2);
    assert.equal(calls[1].photos.length, 1);
    assert.deepEqual(calls[1].groups, []);
    assert.equal(calls[1].route, null);
    assert.equal(calls[1].cover, null);
    assert.deepEqual(calls[1].clues, ["Previously collected clue"]);
    failPdf = true;
    await element("#journal-export-pdf").events.click();
    assert.equal(downloads, 2);
    assert.match(element("#journal-status").textContent, /PDF encoding failed/);
    assert.equal(element("#journal-export-pdf").disabled, false);
    failPdf = false;
    let release;
    finishPdf = new Promise(resolve => { release = resolve; });
    const pending = element("#journal-export-pdf").events.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(element("#journal-export-pdf").disabled, true);
    element("#photo-journal-dialog").close();
    release();
    await pending;
    assert.equal(downloads, 2);
  });
}

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
