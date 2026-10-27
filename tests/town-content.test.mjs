import test from "node:test";
import assert from "node:assert/strict";
import { createTownContentClient } from "../town-content.mjs";
import { setupTowns } from "../towns-ui.mjs";
import { translate } from "../i18n.mjs";

const view = { settlement: { osmId: "node/10" } };
const state = { serverJourney: { id: "a".repeat(32) }, journalAccess: "private", col: -2, row: 3 };
const photo = number => ({
  imageId: String(number), title: `File:Town ${number}.jpg`, caption: `Town view ${number}`,
  sourceUrl: `https://commons.wikimedia.org/wiki/File:Town_${number}.jpg`,
  attribution: "Photo Author", license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  association: number ? "nearby" : "town",
});
const result = (photos = [], overrides = {}) => ({
  identity: "node/10", language: "fr", content: {
    text: "Description de la ville.", title: "Firmi", sourceUrl: "https://fr.wikipedia.org/wiki/Firmi",
    language: "fr", attribution: "Wikipedia contributors", license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  }, photos, loading: false, errors: [], retrievedAt: new Date().toISOString(),
  expiresAt: Date.now() + 86400000, ...overrides,
});
function cache() {
  const values = new Map();
  return { values, get: async key => values.get(key), put: async (key, value) => values.set(key, value) };
}

test("town client polls progressive content, uses private image route and reuses town-language browser cache", async () => {
  const calls = [], progress = [], localCache = cache();
  let polls = 0;
  const client = createTownContentClient({ context: () => state, cache: localCache, wait: async () => {},
    fetcher: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      assert.equal(url, "/api/town-content");
      assert.equal(options.headers["X-Journal-Capability"], "private");
      assert.deepEqual(body.location, { col: -2, row: 3 });
      if (body.image) return new Response(new Blob(["photo"], { type: "image/jpeg" }));
      return Response.json(result(polls++ ? [photo(0)] : [], { loading: polls === 1 }));
    } });
  const resolved = await client.resolve(view, "fr", false, value => progress.push(value));
  assert.equal(progress.length, 2);
  assert.equal(progress[0].content.text, "Description de la ville.");
  assert.ok(resolved.photos[0].blob instanceof Blob);
  state.col--;
  const cached = await client.resolve(view, "fr");
  assert.equal(cached.cached, true);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].refresh, false);
  assert.doesNotMatch([...localCache.values.keys()].join(""), /private|aaaa/);
});

test("failed photograph stays labelled without hiding good prose, credits or other images", async t => {
  t.mock.method(console, "error", () => {});
  const client = createTownContentClient({ context: () => state, cache: cache(),
    fetcher: async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.image === "1") return Response.json({ error: "Photo offline" }, { status: 503 });
      if (body.image) return new Response(new Blob(["photo"], { type: "image/jpeg" }));
      return Response.json(result([photo(0), photo(1)]));
    } });
  const resolved = await client.resolve(view, "fr");
  assert.ok(resolved.content);
  assert.equal(resolved.photos[1].failed, true);
  assert.equal(resolved.photos[1].attribution, "Photo Author");
  assert.ok(resolved.errors.some(error => /Photo offline/.test(error)));
});

test("town requests can be cancelled and invalid or endless server results fail explicitly", async () => {
  const aborted = new AbortController();
  aborted.abort();
  const client = createTownContentClient({ context: () => state, cache: cache(),
    fetcher: () => { throw new Error("Unexpected fetch"); } });
  await assert.rejects(client.resolve(view, "fr", false, () => {}, aborted.signal), { name: "AbortError" });
  const invalid = createTownContentClient({ context: () => state, cache: cache(),
    fetcher: async () => Response.json(result([], { identity: "node/99" })) });
  await assert.rejects(invalid.resolve(view, "fr"), /Invalid town/);
  const pending = createTownContentClient({ context: () => state, cache: cache(), wait: async () => {},
    fetcher: async () => Response.json(result([], { loading: true })) });
  await assert.rejects(pending.resolve(view, "fr"), /still pending/);
});

class Element {
  children = [];
  events = {};
  open = false;
  hidden = false;
  disabled = false;
  textContent = "";
  addEventListener(type, handler) { this.events[type] = handler; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  showModal() { this.open = true; }
  close() { this.open = false; this.events.close?.(); }
  focus() {}
}
function fixture(t, resolve, pinPhoto) {
  const nodes = new Map(), revoked = [];
  const previous = globalThis.document;
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  globalThis.document = {
    documentElement: { lang: "fr" }, createElement: () => new Element(),
    querySelector: selector => selector === "dialog[open]"
      ? [...nodes.values()].find(el => el.open) ?? null : node(selector),
  };
  t.after(() => { globalThis.document = previous; });
  let urls = 0;
  t.mock.method(URL, "createObjectURL", () => `blob:town-${++urls}`);
  t.mock.method(URL, "revokeObjectURL", url => revoked.push(url));
  let language = "fr";
  const ui = setupTowns((key, args) => translate(language, key, args), { service: { resolve }, pinPhoto });
  const cell = { terrain: "place", settlements: [{ osmId: "node/10", name: "Firmi" }] };
  const map = { width: 3, height: 1, cellSizeMeters: 250,
    bounds: { minLatitude: 44.543, maxLatitude: 44.547, minLongitude: 2.303, maxLongitude: 2.32 },
    rows: [[cell, structuredClone(cell), { terrain: "forest" }]] };
  const text = el => [el.textContent, ...el.children.map(child =>
    typeof child === "string" ? child : text(child))].join(" ");
  return { ui, node, map, text, revoked, language: value => { language = value; ui.localize(value); } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("same-town movement neither reopens arrival nor refetches; leaving and returning can reopen", async t => {
  let calls = 0;
  const f = fixture(t, async () => { calls++; return result(); });
  f.ui.update(f.map, 0, 0);
  await settle();
  assert.equal(f.node("#town-dialog").open, true);
  f.node("#town-dialog").close();
  f.ui.update(f.map, 0, 1);
  assert.equal(f.node("#town-dialog").open, false);
  assert.equal(calls, 1);
  f.node("#open-town").events.click();
  assert.equal(f.node("#town-dialog").open, true);
  assert.equal(calls, 1);
  f.ui.update(f.map, 0, 2);
  assert.equal(f.node("#town-dialog").open, false);
  f.ui.update(f.map, 0, 0);
  await settle();
  assert.equal(f.node("#town-dialog").open, true);
  assert.equal(calls, 2);
});

test("another modal is never displaced, manual town access remains available", async t => {
  let calls = 0;
  const f = fixture(t, async () => { calls++; return result(); });
  f.node("#other-dialog").open = true;
  f.ui.update(f.map, 0, 0);
  assert.equal(f.node("#town-dialog").open, false);
  assert.equal(calls, 0);
  f.node("#other-dialog").open = false;
  f.node("#open-town").events.click();
  await settle();
  assert.equal(calls, 1);
});

test("a different town in the same cell replaces the content and discards late arrivals", async t => {
  let release, oldSignal;
  const f = fixture(t, async (view, locale, refresh, progress, signal) => {
    if (view.settlement.osmId === "node/10") {
      oldSignal = signal;
      return new Promise(resolve => { release = resolve; });
    }
    return result([], { identity: "node/20", content: { ...result().content, text: "Other town." } });
  });
  f.ui.update(f.map, 0, 0);
  f.map.rows[0][0].settlements = [{ osmId: "node/20", name: "Other town" }];
  f.ui.update(f.map, 0, 0);
  await settle();
  assert.equal(oldSignal.aborted, true);
  assert.match(f.text(f.node("#town-welcome")), /Other town/);
  release(result());
  await settle();
  assert.match(f.text(f.node("#town-welcome")), /Other town/);
  f.ui.reset();
});

for (const count of [0, 1, 5]) {
  test(`gallery renders ${count} photos with attribution, nearby labels and object URL cleanup`, async t => {
    const photos = Array.from({ length: count }, (_, n) => ({
      ...photo(n), blob: new Blob(["photo"], { type: "image/jpeg" }),
    }));
    const f = fixture(t, async () => result(photos));
    f.ui.update(f.map, 0, 0);
    await settle();
    assert.equal(f.node("#town-gallery").children.length, count);
    if (count) {
      const text = f.text(f.node("#town-gallery"));
      assert.match(text, /Photo Author/);
      assert.match(text, /CC BY-SA 4.0/);
      if (count > 1) assert.match(text, /environs/);
    } else assert.match(f.node("#town-gallery-status").textContent, /Aucune photographie/);
    f.node("#town-dialog").close();
    assert.equal(f.revoked.length, count);
    f.node("#open-town").events.click();
    if (count) assert.match(f.node("#town-gallery").children[0].children[0].src, /^blob:town-/);
    f.ui.reset();
    assert.equal(f.revoked.length, count * 2);
  });
}

test("locale changes load requested sources, label fallback and keep services usable during slow requests", async t => {
  let finish;
  const calls = [];
  const f = fixture(t, async (view, locale, refresh, progress) => {
    calls.push(locale);
    if (calls.length > 1) return result([], { language: locale });
    progress(result([], { loading: true }));
    return new Promise(resolve => { finish = resolve; });
  });
  f.ui.update(f.map, 0, 0);
  assert.equal(f.node("#town-refresh").disabled, true);
  assert.equal(f.node("#town-services").disabled, false);
  assert.match(f.text(f.node("#town-welcome")), /Description de la ville/);
  f.language("en");
  await settle();
  assert.deepEqual(calls, ["fr", "en"]);
  assert.match(f.text(f.node("#town-welcome")), /source language \(fr\)/);
  finish(result([], { content: { ...result().content, text: "Stale French response." } }));
  await settle();
  assert.doesNotMatch(f.text(f.node("#town-welcome")), /Stale French response/);
  f.ui.reset();
});

test("source failure preserves partial prose and shows an explicit warning", async t => {
  t.mock.method(console, "error", () => {});
  const f = fixture(t, async (view, locale, refresh, progress) => {
    progress(result([], { loading: true }));
    throw new Error("Fixture outage");
  });
  f.ui.update(f.map, 0, 0);
  await settle();
  const text = f.text(f.node("#town-welcome"));
  assert.match(text, /Description de la ville/);
  assert.match(text, /Fixture outage/);
  assert.equal(f.node("#town-refresh").disabled, false);
  f.ui.reset();
});

test("photo decoding failure is visible and stale errors after closing cannot recreate URLs", async t => {
  t.mock.method(console, "error", () => {});
  const f = fixture(t, async () => result([{ ...photo(0),
    blob: new Blob(["photo"], { type: "image/jpeg" }) }]));
  f.ui.update(f.map, 0, 0);
  await settle();
  const image = f.node("#town-gallery").children[0].children[0];
  image.events.error();
  assert.match(f.text(f.node("#town-gallery")), /Photographie indisponible/);
  assert.equal(f.revoked.length, 1);
  f.node("#town-dialog").close();
  image.events.error();
  assert.equal(f.revoked.length, 1);
  f.ui.reset();
});

test("loaded town photographs can be pinned to the journal with source and licence; failed ones cannot", async t => {
  const pins = [];
  const blob = new Blob(["photo"], { type: "image/jpeg" });
  const f = fixture(t, async () => result([{ ...photo(0), blob }, { ...photo(1), failed: true }]),
    (container, picture, options) => pins.push({ container, picture, options }));
  f.ui.update(f.map, 0, 0);
  await settle();
  assert.equal(pins.length, 1);
  assert.equal(pins[0].picture.blob, blob);
  assert.equal(pins[0].picture.sourceUrl, photo(0).sourceUrl);
  assert.equal(pins[0].picture.licenseUrl, photo(0).licenseUrl);
  assert.equal(pins[0].picture.attribution, "Photo Author");
  assert.deepEqual(pins[0].options, { caption: "Town view 0" });
  const caption = f.node("#town-gallery").children[0].children[1];
  assert.ok(caption.children.includes(pins[0].container));
  f.ui.reset();
});
