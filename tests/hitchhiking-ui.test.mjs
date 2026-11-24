import test from "node:test";
import assert from "node:assert/strict";
import { setupJourneyWorld } from "../journey-world-ui.mjs";
import { translate } from "../i18n.mjs";
import { hitchhikingActive } from "../hitchhiking.mjs";

for (const language of ["fr", "en"]) test(`${language}: ten-town choice, explicit attempt, surfaced map errors and reopen recovery`, async t => {
  const original = globalThis.document;
  t.after(() => { globalThis.document = original; });
  class Element {
    children = []; events = {}; open = false; disabled = false; textContent = "";
    constructor(tag = "") { this.tag = tag; }
    addEventListener(name, callback) { this.events[name] = callback; }
    append(...items) { this.children.push(...items); }
    before(node) { this.previous = node; }
    replaceChildren(...items) { this.children = items; }
    setAttribute() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  const nodes = new Map(), get = key => {
    if (!nodes.has(key)) nodes.set(key, new Element());
    return nodes.get(key);
  };
  globalThis.document = { documentElement: { lang: language },
    querySelector: selector => selector === "dialog[open]"
      ? [...nodes.values()].find(node => node.open) ?? null : get(selector),
    createElement: tag => new Element(tag) };
  let state = { col: 0, row: 0, startedAt: Date.parse("2026-10-18T10:00:00Z"),
    elapsedMinutes: 0, walletCents: 0 };
  const towns = Array.from({ length: 10 }, (_, n) => ({ id: `geoname:${100 + n}`, name: `Town ${n}`,
    col: n + 1, row: 1, latitude: 45, longitude: 3, distanceMeters: 1000 + n }));
  const requests = [], trans = (key, args) => translate(language, key, args);
  let calls = 0, townError = false;
  const ui = setupJourneyWorld(trans, {
    context: () => ({ state, cell: { terrain: "road" }, info: { latitude: 45, longitude: 3 },
      gridId: "firmi", busy: false, blocked: hitchhikingActive(state) }),
    saveEncounters() {}, reserve() {}, advance() {}, cancel() {},
    hitchhike(town) {
      calls++;
      state = { ...state, elapsedMinutes: state.elapsedMinutes + 30, hitchhiking: {
        status: "pending", outcome: "arrived", destination: town, stolenCents: 0, injury: 0 } };
      throw new Error(trans("hitch.mapError"));
    },
    resumeHitchhiking(stay) {
      assert.equal(stay, true);
      state = { ...state, hitchhiking: { ...state.hitchhiking, status: "complete", outcome: "recovered" } };
    },
    fetcher: async url => {
      requests.push(url);
      return { ok: !url.includes("hitchhiking") || !townError, status: townError ? 503 : 200,
        json: async () => url.includes("hitchhiking") ? townError ? { error: "Catalogue unavailable" } :
          { version: 1, gridId: "firmi", col: 0, row: 0, destinations: towns }
          : url.includes("living-world") ? { version: 1, importedAt: state.startedAt, records: [] }
            : { version: 1, gridId: "firmi", col: 0, row: 0, realFeeds: [], coverage: [] } };
    },
  });
  await get("#open-journey-world").events.click();
  assert.equal(requests.length, 3);
  assert.equal(state.elapsedMinutes, 0);
  const section = get("#journey-world-transports").previous;
  const label = section.children.find(node => node.tag === "label");
  const select = label.children[0];
  assert.equal(select.children.length, 10);
  select.value = towns[7].id; select.events.change();
  await section.children.find(node => node.tag === "button").events.click();
  assert.equal(calls, 1);
  assert.equal(state.hitchhiking.destination.id, towns[7].id);
  assert.equal(state.elapsedMinutes, 30);
  assert.equal(get("#journey-world-error").textContent, trans("hitch.mapError"));
  get("#journey-world-dialog").close();
  await get("#open-journey-world").events.click();
  assert.equal(get("#journey-world-dialog").open, true, "blocked pending ride must remain recoverable");
  assert.equal(requests.length, 3);
  await section.children.find(node => node.textContent === trans("hitch.stay")).events.click();
  assert.equal(state.elapsedMinutes, 30);
  assert.equal(state.hitchhiking.status, "complete");
  assert.equal(state.walletCents, 0);
  townError = true;
  await get("#journey-world-refresh").events.click();
  assert.match(get("#journey-world-error").textContent, /Catalogue unavailable/);
  assert.ok(section.children.some(node => node.textContent === trans("hitch.unloaded")));
  townError = false;
  await get("#journey-world-refresh").events.click();
  assert.equal(get("#journey-world-error").textContent, "");
  assert.equal(section.children.find(node => node.tag === "label").children[0].children.length, 10);
  ui.reset();
});
