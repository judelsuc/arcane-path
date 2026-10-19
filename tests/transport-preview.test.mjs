import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

class Element {
  children = [];
  handlers = new Map();
  textContent = "";
  checked = false;
  disabled = false;
  value = "fr";
  attributes = {};
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, fn) { this.handlers.set(event, fn); }
  emit(event = "click") { this.handlers.get(event)?.(); }
}

// Small DOM harness: verifies the actual preview module's event wiring without browser dependencies.
test("FR/EN preview books, saves, resumes, reaches stops, handles hunger and cancellation", async () => {
  const html = readFileSync(new URL("../layers/transport/preview.html", import.meta.url), "utf8");
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  const stored = new Map();
  const oldDocument = globalThis.document;
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  globalThis.document = { documentElement: {}, getElementById: id => elements.get(id),
    createElement: () => new Element(), createElementNS: () => new Element() };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true,
    value: { setItem: (k, v) => stored.set(k, v), getItem: k => stored.get(k) ?? null } });
  try {
    await import("../layers/transport/preview.mjs");
    const get = id => elements.get(id);
    assert.match(get("warning").textContent, /SYNTHÉTIQUE/);
    assert.equal(get("offers").children.length, 3);
    get("language").value = "en"; get("language").emit("change");
    assert.match(get("warning").textContent, /SYNTHETIC/);
    get("offers").children[1].children[0].emit();
    get("step").emit(); get("step").emit(); get("step").emit();
    assert.match(get("state").textContent, /€7\.60/);
    get("save").emit();
    get("finish").emit(); assert.match(get("state").textContent, /Arrived/);
    get("resume").emit(); assert.match(get("state").textContent, /In progress/);
    get("finish").emit(); assert.match(get("state").textContent, /Cell 7,2/);
    assert.equal(get("step").disabled, true);
    assert.equal(get("error").textContent, "");
    get("hungry").emit(); get("offers").children[1].children[0].emit(); get("finish").emit();
    assert.match(get("state").textContent, /Ended: hunger/);
    assert.match(get("state").textContent, /Cell 0,0/);
    get("reset").emit(); get("offers").children[0].children[0].emit();
    get("cancel").checked = true; get("cancel").emit("change"); get("step").emit();
    assert.match(get("state").textContent, /Cancelled before payment/);
    assert.match(get("state").textContent, /€10\.00/);
    get("cancel").checked = false; get("reset").emit();
    get("delay").checked = true; get("delay").emit("change");
    assert.equal(get("offers").children.length, 3);
    get("language").value = "fr"; get("language").emit("change");
    assert.match(get("title").textContent, /aperçu indépendant/);
  } finally {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    else delete globalThis.localStorage;
  }
});

test("real-source explorer filters European providers, labels samples, and reports failed loads", async () => {
  const html = readFileSync(new URL("../layers/transport/routes.html", import.meta.url), "utf8");
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => {
    const element = new Element();
    element.value = id === "language" ? "fr" : "";
    element.disabled = ["country", "filter"].includes(id);
    return [id, element];
  }));
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  const get = id => elements.get(id);
  globalThis.document = { documentElement: {}, getElementById: get,
    createElement: () => new Element() };
  let failed = false;
  globalThis.fetch = async url => ({
    ok: !failed, status: failed ? 503 : 200,
    json: async () => JSON.parse(readFileSync(new URL(url,
      new URL("../layers/transport/routes.mjs", import.meta.url)), "utf8")),
  });
  try {
    await import("../layers/transport/routes.mjs");
    assert.equal(get("error").textContent, "");
    assert.equal(get("country").children.length, 47);
    assert.equal(get("feeds").children.length, 50);
    assert.equal(get("verified").children.length, 6);
    assert.equal(get("country").disabled, false);
    get("language").value = "en"; get("language").emit("change");
    assert.match(get("warning").textContent, /fictional game estimates/);
    assert.match(get("warning").textContent, /not yet activated/);
    get("country").value = "GB"; get("country").emit("change");
    get("filter").value = "Borders"; get("filter").emit("input");
    assert.equal(get("feeds").children.length, 1);
    assert.match(get("feeds").children[0].children[0].textContent, /Borders Buses/);
    get("country").value = "AD"; get("country").emit("change");
    assert.match(get("count").textContent, /No catalogued source/);
    assert.equal(get("feeds").children.length, 0);
    const paragraphs = get("verified").children.flatMap(article => article.children.map(child => child.textContent));
    assert.ok(paragraphs.some(value => value.includes("Source-supplied approximate times")));
    assert.ok(paragraphs.some(value => value.includes("Estimated fictional game fare")));

    failed = true;
    get("verified").replaceChildren();
    get("country").disabled = get("filter").disabled = true;
    await import("../layers/transport/routes.mjs?failed-load-test");
    assert.match(get("error").textContent, /503/);
    assert.equal(get("verified").children.length, 0);
    assert.equal(get("country").disabled, true);
  } finally {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    globalThis.fetch = oldFetch;
  }
});
