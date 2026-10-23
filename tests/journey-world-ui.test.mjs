import test from "node:test";
import assert from "node:assert/strict";
import { setupJourneyWorld } from "../journey-world-ui.mjs";
import { translate } from "../i18n.mjs";
import { demoTimetable, demoJourney } from "../layers/transport/demo-fixture.mjs";

for (const language of ["fr", "en"]) {
  test(`${language}: real agenda acknowledgements persist; offer selection never books or mutates the clock implicitly`, async t => {
    const original = globalThis.document;
    t.after(() => { globalThis.document = original; });
    class Element {
      children = []; events = {}; open = false; disabled = false; textContent = "";
      addEventListener(name, callback) { this.events[name] = callback; }
      append(...items) { this.children.push(...items); }
      replaceChildren(...items) { this.children = items; }
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
      createElement: () => new Element() };
    const raw = demoTimetable(); raw.kind = "supplied";
    let state = demoJourney(), booked = 0, requests = 0;
    const now = state.startedAt + state.elapsedMinutes * 60000;
    const source = { id: "public-test", name: "Public fixture", url: "https://example.org/public",
      observedAt: now - 1000, validUntil: now + 86400000 };
    const agenda = { version: 1, importedAt: now, coverage: { matchingRows: 1 }, records: [{
      id: "dated-event", kind: "event", reality: "public", title: { fr: "Concert public", en: "Public concert" },
      startsAt: now, endsAt: now + 3600000, area: { lat: 45, lon: 3, radiusMeters: 1000 }, source,
    }] };
    const before = structuredClone(state);
    let eventFailure = false;
    const ui = setupJourneyWorld((key, args) => translate(language, key, args), {
      context: () => ({ state, info: { latitude: 45, longitude: 3 }, gridId: raw.gridId, busy: false, blocked: false }),
      saveEncounters: encounters => { state = { ...state, worldEncounters: encounters }; },
      reserve: () => { booked++; }, advance() {}, cancel() {},
      fetcher: async url => {
        requests++;
        return { ok: !eventFailure || !url.includes("living-world"), status: eventFailure ? 502 : 200,
          json: async () => url.includes("living-world")
            ? eventFailure ? { error: "Explicit public provider failure" } : agenda
            : { version: 1, gridId: raw.gridId, col: state.col, row: state.row,
              realFeeds: [raw], fictionalFeed: null, coverage: [] } };
      },
    });
    ui.update();
    assert.equal(requests, 0);
    await get("#open-journey-world").events.click();
    assert.equal(get("#journey-world-dialog").open, true);
    assert.equal(requests, 2);
    assert.equal(state.elapsedMinutes, before.elapsedMinutes);
    assert.equal(state.walletCents, before.walletCents);
    assert.equal(state.worldEncounters.entries.length, 1);
    assert.equal(state.worldEncounters.entries[0].acknowledged, false);
    const event = get("#journey-world-events").children[1];
    assert.equal(event.children[1].className, "technical-text");
    assert.equal(event.children[1].children[0].href, source.url);
    assert.doesNotMatch(event.children[0].textContent, /observed|observée|validity|valable/);
    await event.children[2].events.click();
    assert.equal(state.worldEncounters.entries[0].acknowledged, true);
    const list = get("#journey-world-transports");
    const offer = list.children.find(node => node.textContent.includes("EUR"));
    assert.ok(offer); offer.events.click();
    assert.equal(booked, 0);
    list.children.at(-1).events.click();
    assert.equal(booked, 1);
    assert.equal(state.walletCents, before.walletCents);
    get("#journey-world-dialog").close();
    await get("#open-journey-world").events.click();
    assert.equal(requests, 2, "rereading the same place/day does not repeat the search");
    eventFailure = true;
    await get("#journey-world-refresh").events.click();
    assert.match(get("#journey-world-error").textContent, /Explicit public provider failure/);
    assert.equal(state.worldEncounters.entries.length, 1);
    ui.reset(); ui.update();
    assert.equal(get("#journey-world-dialog").open, false);
  });
}
