import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupStartArt } from "../start-art.mjs";
import { translate } from "../i18n.mjs";

function fixture(language = "en") {
  class Element {
    hidden = true; textContent = ""; attrs = {}; handlers = {};
    addEventListener(type, handler) { this.handlers[type] = handler; }
    getAttribute(key) { return this.attrs[key] ?? null; }
    set src(value) { this.attrs.src = value; }
  }
  const elements = new Map();
  const doc = { querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  } };
  doc.querySelector(".title-art").hidden = false;
  let payload = { version: 1, image: { day: "2026-10-19" }, lastAttempt: { status: "ready" } };
  const requests = [], errors = [];
  const api = setupStartArt((key, values) => translate(language, key, values), {
    doc, fetcher: async (...args) => {
      requests.push(args);
      return { ok: true, json: async () => payload };
    }, logger: { error: (...args) => errors.push(args) },
  });
  return { doc, api, requests, errors, setPayload(value) { payload = value; },
    setLanguage(value) { language = value; } };
}

for (const language of ["en", "fr"]) {
  test(`${language}: shared daily illustration loads without player data and replaces ASCII only when ready`, async () => {
    const { doc, api, requests } = fixture(language);
    await api.load();
    assert.deepEqual(requests, [["/api/start-art", { cache: "no-store" }]]);
    const image = doc.querySelector("#title-daily-image");
    assert.equal(image.getAttribute("src"), "/api/start-art/image?day=2026-10-19");
    assert.equal(doc.querySelector("#title-daily-art").hidden, true);
    assert.equal(doc.querySelector(".title-art").hidden, false);
    image.handlers.load();
    assert.equal(doc.querySelector("#title-daily-art").hidden, false);
    assert.equal(doc.querySelector(".title-art").hidden, true);
    assert.match(doc.querySelector("#title-art-credit").textContent, /2026-10-19/);
    assert.doesNotMatch(doc.querySelector("#title-art-credit").textContent, /OVH|SDXL/);
    assert.ok(image.alt.length > 20);
    assert.equal(doc.querySelector("#title-art-status").hidden, true);
  });
}

test("failed daily generation still shows previous ready image with localized notice", async () => {
  const { doc, api, setPayload, setLanguage } = fixture();
  setPayload({ version: 1, image: { day: "2026-10-18" }, lastAttempt: { status: "failed" } });
  await api.load();
  doc.querySelector("#title-daily-image").handlers.load();
  assert.equal(doc.querySelector("#title-daily-art").hidden, false);
  assert.match(doc.querySelector("#title-art-status").textContent, /previous illustration/);
  setLanguage("fr");
  api.localize();
  assert.match(doc.querySelector("#title-art-status").textContent, /précédente/);
});

test("first run without artwork keeps authored title usable", async () => {
  const { doc, api, setPayload } = fixture();
  setPayload({ version: 1, image: null, lastAttempt: null });
  await api.load();
  assert.equal(doc.querySelector(".title-art").hidden, false);
  assert.equal(doc.querySelector("#title-daily-image").getAttribute("src"), null);
  assert.match(doc.querySelector("#title-art-status").textContent, /not available yet/);
});

test("bad status and image failure are explicit; never blank title or trigger generation", async () => {
  const { doc, api, setPayload, errors, requests } = fixture();
  for (const payload of [{}, { version: 1, image: { day: "../private" } }]) {
    setPayload(payload);
    await api.load();
    assert.match(doc.querySelector("#title-art-status").textContent, /unavailable/);
    assert.equal(doc.querySelector(".title-art").hidden, false);
  }
  setPayload({ version: 1, image: { day: "2026-10-19" } });
  await api.load();
  doc.querySelector("#title-daily-image").handlers.error();
  assert.equal(doc.querySelector("#title-daily-art").hidden, true);
  assert.equal(doc.querySelector(".title-art").hidden, false);
  await api.load();
  assert.match(doc.querySelector("#title-art-status").textContent, /unavailable/);
  assert.equal(errors.length, 3);
  assert.ok(requests.every(([url]) => url === "/api/start-art"));
});

test("failed metadata refresh preserves existing loaded artwork", async () => {
  const { doc, api, setPayload, errors } = fixture();
  await api.load();
  doc.querySelector("#title-daily-image").handlers.load();
  setPayload(null);
  await api.load();
  assert.equal(doc.querySelector("#title-daily-art").hidden, false);
  assert.equal(doc.querySelector(".title-art").hidden, true);
  assert.match(doc.querySelector("#title-art-status").textContent, /unavailable/);
  assert.equal(errors.length, 1);
});

test("title image is responsive, credited and wired on initial display and return", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(html, /id="title-daily-art" hidden/);
  assert.match(html, /width="1024" height="1024"/);
  assert.match(html, /Open RAIL\+\+-M/);
  assert.match(css, /#title-daily-image\s*\{[^}]*width: 100%; height: auto/);
  assert.equal(app.match(/void startArt\.load\(\)/g).length, 2);
  assert.match(app, /startArt\.localize\(\)/);
});
