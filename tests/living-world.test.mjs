import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS, importAgenda, calendar, localAgenda, transportDisruptions,
  emptyEncounterState, restoreEncounterState, encounterAgenda, acknowledgeEncounter } from "../layers/living-world/agenda.mjs";
import { syntheticAgenda } from "../layers/living-world/demo.mjs";

const start = Date.parse("2026-10-18T23:45:00Z");
const journey = (elapsedMinutes = 0) => ({ startedAt: start, elapsedMinutes });
const context = (elapsedMinutes = 0, position = { lat: 45.19, lon: 5.72 }) => ({
  journey: journey(elapsedMinutes), position,
});
const fixture = () => JSON.parse(JSON.stringify(syntheticAgenda(start)));
const demo = input => importAgenda(input ?? fixture(), { allowSynthetic: true });
const roundtrip = value => JSON.parse(JSON.stringify(value));

test("calendar follows actual journey start and action minutes in UTC, never host/idle time", () => {
  assert.equal(calendar(journey(), "fr").time, "23:45");
  assert.equal(calendar(journey(30), "en").iso, "2026-10-19T00:15:00.000Z");
  assert.equal(calendar(journey(), "en").weekday, "Sunday");
  assert.equal(calendar(journey(), "fr").weekday, "dimanche");
  const originalNow = Date.now;
  try {
    Date.now = () => start + 400 * 86400000;
    assert.equal(calendar(journey()).iso, new Date(start).toISOString());
    assert.equal(localAgenda(demo(), context()).length, 2);
  } finally { Date.now = originalNow; }
  for (const bad of [null, {}, journey(-1), journey(Infinity), { startedAt: Infinity, elapsedMinutes: 0 }]) {
    assert.throws(() => calendar(bad), /journey clock/);
  }
});

test("no imported source means explicit absence; fictional sources require opt-in", () => {
  const empty = importAgenda({ version: 1, importedAt: start, records: [] });
  assert.deepEqual(localAgenda(empty, context()), []);
  assert.throws(() => importAgenda(fixture()), /invalid record/);
  assert.throws(() => localAgenda(roundtrip(empty), context()), /importAgenda/);
  assert.equal(demo().records[0].reality, "synthetic");
});

test("public adapter requires explicit complete source URL/time/geography, never manufactures events", () => {
  const data = fixture();
  data.records.forEach(record => { record.reality = "public"; });
  assert.equal(importAgenda(data).records.length, 2);
  for (const modify of [
    record => { delete record.source; },
    record => { record.source.url = "http://example.org"; },
    record => { record.source.url = "https://secret:password@example.org"; },
    record => { record.source.observedAt = start + 1; },
    record => { record.source.validUntil = start; },
    record => { record.source.validUntil = start + LIMITS.sourceLifetimeMs + 1; },
    record => { delete record.area; },
    record => { record.area.lat = 91; },
    record => { record.area.lon = -181; },
    record => { record.area.radiusMeters = 0; },
    record => { record.area.radiusMeters = LIMITS.radiusMeters + 1; },
    record => { record.title.en = ""; },
    record => { record.endsAt = record.startsAt; },
    record => { record.endsAt = record.startsAt + LIMITS.durationMs + 1; },
  ]) {
    const invalid = roundtrip(data);
    modify(invalid.records[0]);
    assert.throws(() => importAgenda(invalid), /Living world/);
  }
});

test("active windows are half-open and exclude upcoming, expired, stale and out-of-area records", () => {
  const agenda = demo();
  assert.equal(localAgenda(agenda, context()).length, 2);
  assert.equal(localAgenda(agenda, context(59.99)).length, 2);
  assert.deepEqual(localAgenda(agenda, context(60)), []);
  assert.deepEqual(localAgenda(agenda, context(0, { lat: 46.19, lon: 5.72 })), []);
  const future = fixture();
  future.records.forEach(record => { record.startsAt += 60000; });
  assert.deepEqual(localAgenda(demo(future), context()), []);
  const stale = fixture();
  stale.records.forEach(record => { record.source.validUntil = start + 60000; });
  assert.deepEqual(localAgenda(demo(stale), context(1)), []);
  assert.deepEqual(transportDisruptions(demo(stale), context(1)), []);
  assert.throws(() => localAgenda(agenda, context(0, { lat: NaN, lon: 0 })), /geographic/);
});

test("source observations from simulated future cannot affect earlier game time", () => {
  const data = fixture();
  data.importedAt += 60000;
  data.records.forEach(record => { record.source.observedAt += 60000; });
  assert.deepEqual(localAgenda(demo(data), context()), []);
  assert.equal(localAgenda(demo(data), context(1)).length, 2);
});

test("geographic distance handles antimeridian and poles", () => {
  const data = fixture();
  data.records.forEach(record => {
    record.area = { lat: 0, lon: 179.999, radiusMeters: 1000 };
  });
  assert.equal(localAgenda(demo(data), context(0, { lat: 0, lon: -179.999 })).length, 2);
  data.records.forEach(record => {
    record.area = { lat: 90, lon: 180, radiusMeters: 1000 };
  });
  assert.equal(localAgenda(demo(data), context(0, { lat: 90, lon: -40 })).length, 2);
});

test("imports are bounded, duplicate-free, deeply immutable and deterministically sorted", () => {
  const data = fixture();
  const agenda = demo(data);
  data.records[0].title.fr = "mutated";
  assert.notEqual(agenda.records[0].title.fr, "mutated");
  assert.throws(() => { agenda.records[0].source.name = "changed"; }, TypeError);
  assert.deepEqual(demo({ ...fixture(), records: fixture().records.reverse() }), agenda);
  assert.throws(() => demo({ ...fixture(), records: Array(129).fill(fixture().records[0]) }), /invalid import/);
  assert.throws(() => demo({ ...fixture(), padding: "x".repeat(LIMITS.bytes) }), /too large/);
  assert.throws(() => demo({ ...fixture(), records: Array(2).fill(fixture().records[0]) }), /duplicate/);
  assert.throws(() => importAgenda(null), /invalid import/);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => importAgenda(cyclic), /invalid JSON/);
});

test("encounters and acknowledgements survive JSON save without replay or mutation", () => {
  const agenda = demo();
  const initial = emptyEncounterState(journey());
  const first = encounterAgenda(agenda, context(), initial);
  assert.deepEqual(initial.entries, []);
  assert.equal(first.encounters.length, 2);
  const key = first.encounters[0].key;
  const saved = acknowledgeEncounter(agenda, context(), roundtrip(first.state), key);
  assert.equal(first.state.entries[0].acknowledged, false);
  const resumed = encounterAgenda(demo(), context(30), roundtrip(saved));
  assert.equal(resumed.encounters.find(record => record.key === key).acknowledged, true);
  assert.equal(resumed.state.entries[0].firstSeenMinute, 0);
  assert.deepEqual(encounterAgenda(agenda, context(30), resumed.state).state, resumed.state);
  assert.equal(encounterAgenda(agenda, context(60), saved).encounters.length, 0);
  assert.throws(() => acknowledgeEncounter(agenda, context(60), saved, key), /not active/);
  assert.throws(() => acknowledgeEncounter(agenda, context(0, { lat: 0, lon: 0 }), saved, key), /not active/);
  assert.throws(() => acknowledgeEncounter(agenda, context(), initial, key), /not encountered/);
});

test("saved ledger rejects tampering, another journey, duplicates and future encounter times", () => {
  const state = encounterAgenda(demo(), context()).state;
  for (const modify of [
    saved => { saved.version = 2; },
    saved => { saved.startedAt++; },
    saved => { saved.entries[0].firstSeenMinute = 1; },
    saved => { saved.entries[0].acknowledged = "yes"; },
    saved => { saved.entries.push(saved.entries[0]); },
    saved => { saved.entries = Array(129).fill(saved.entries[0]); },
  ]) {
    const bad = roundtrip(state); modify(bad);
    assert.throws(() => restoreEncounterState(bad, journey()), /encounter/);
  }
});

test("full saved ledger is bounded and does not forget acknowledged history", () => {
  const state = emptyEncounterState(journey());
  state.entries = Array.from({ length: LIMITS.encounters }, (_, n) => ({
    key: `previous-${n}`, firstSeenMinute: 0, acknowledged: true,
  }));
  const result = encounterAgenda(demo(), context(), state);
  assert.equal(result.saturated, true);
  assert.equal(result.state.entries.length, LIMITS.encounters);
  assert.deepEqual(result.encounters, []);
  assert.deepEqual(result.state, state);
});

test("transport projection uses only active local canonical notices and exact scoped contract", () => {
  const agenda = demo();
  const [notice] = transportDisruptions(agenda, context());
  assert.deepEqual(notice, { id: agenda.records.find(record => record.kind === "disruption").key,
    startsAt: start, endsAt: start + 3600000, routeId: "demo-coach", delayMinutes: 15 });
  assert.deepEqual(transportDisruptions(agenda, context(60)), []);
  assert.deepEqual(transportDisruptions(agenda, context(0, { lat: 0, lon: 0 })), []);
  const shortValidity = fixture();
  shortValidity.records[1].source.validUntil = start + 60000;
  assert.equal(transportDisruptions(demo(shortValidity), context())[0].endsAt, start + 60000);
  const data = fixture();
  data.records[1].transport = { tripId: "train-17", stopId: "station-3", cancelled: true };
  assert.equal(transportDisruptions(demo(data), context())[0].cancelled, true);
});

test("transport notices reject ambiguous/unscoped/unbounded changes", () => {
  for (const transport of [{}, { cancelled: true }, { routeId: "x", cancelled: false },
    { routeId: "x", delayMinutes: -1 }, { routeId: "x", delayMinutes: LIMITS.delayMinutes + 1 },
    { routeId: "x", cancelled: true, delayMinutes: 1 }, { routeId: "", delayMinutes: 1 },
    { routeId: "x", delayMinutes: "5" }]) {
    const data = fixture(); data.records[1].transport = transport;
    assert.throws(() => demo(data), /invalid disruption/);
  }
});

test("standalone preview renders FR/EN absence, opt-in fiction, acknowledgement, geography and expiry", async () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.value = ""; this.disabled = false; }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text; }
    set innerHTML(_) { assert.fail("imported content must never use HTML injection"); }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; this.text = ""; }
  }
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const originalDocument = globalThis.document, originalNow = Date.now, originalFetch = globalThis.fetch;
  let sourceData, sourceFailure = false, pending = true, photoLicense = "https://example.org/no-reuse";
  globalThis.fetch = async url => {
    if (String(url).includes("commons.wikimedia.org")) return new Response(JSON.stringify({
      query: { pages: { 1: { title: "File:Nearby place.jpg", coordinates: [{ lat: 45.19, lon: 5.72 }],
        imageinfo: [{ thumburl: "https://upload.wikimedia.org/nearby.jpg",
          descriptionurl: "https://commons.wikimedia.org/wiki/File:Nearby_place.jpg",
          extmetadata: { Artist: { value: "Test photographer" }, LicenseShortName: { value: "CC BY 4.0" },
            LicenseUrl: { value: photoLicense } } }] } } },
    }));
    assert.match(url, /^\/api\/living-world\?lat=45.19&lon=5.72$/);
    if (sourceFailure) return new Response("provider unavailable", { status: 502 });
    if (pending) { pending = false; return new Response("{}", { status: 202 }); }
    return new Response(JSON.stringify(sourceData));
  };
  globalThis.document = {
    documentElement: { lang: "fr" }, getElementById: element,
    createElement: tag => new Element(tag),
  };
  try {
    Date.now = () => start;
    await import("../layers/living-world/preview.mjs");
    Date.now = originalNow;
    assert.match(element("events").textContent, /Aucune donnée/);
    assert.equal(element("clock").dateTime, new Date(start).toISOString());
    element("language").onchange({ target: { value: "en" } });
    assert.equal(document.documentElement.lang, "en");
    assert.match(element("events").textContent, /No active agenda/);
    element("demo").onclick();
    assert.equal(element("events").children.length, 2);
    assert.match(element("mode").textContent, /FICTIONAL/);
    const button = element("events").children[0].children.at(-1);
    button.onclick();
    assert.equal(element("events").children[0].children.at(-1).disabled, true);
    element("away").onclick();
    assert.match(element("events").textContent, /No active agenda/);
    element("away").onclick();
    assert.equal(element("events").children[0].children.at(-1).disabled, true);
    element("advance").onclick();
    element("advance").onclick();
    assert.match(element("events").textContent, /No active agenda/);
    assert.equal(element("clock").dateTime, "2026-10-19T00:45:00.000Z");
    await element("import").onchange({ target: {
      value: "bad.json", files: [{ size: 3, text: async () => "bad" }],
    } });
    assert.match(element("status").textContent, /Import rejected/);
    element("empty").onclick();
    assert.equal(element("mode").textContent, "No source imported.");
    sourceData = fixture();
    sourceData.records = [sourceData.records[0]];
    sourceData.records[0].reality = "public";
    sourceData.records[0].startsAt += 60000;
    sourceData.coverage = { provider: "OpenAgenda", sourceRows: 1, matchingRows: 100,
      rejectedRows: 0, truncated: true,
      license: { name: "Open Licence 1.0", url: "https://example.org/license" } };
    element("latitude").value = "45.19"; element("longitude").value = "5.72";
    Date.now = () => start;
    await element("connected-form").onsubmit({ preventDefault() {} });
    assert.equal(element("mode").textContent, "Imported public data — check its source.");
    assert.match(element("coverage").textContent, /1\/100.*partial coverage/);
    assert.equal(element("events").children.length, 1, "upcoming published events must still be shown");
    assert.ok(element("events").children[0].children.some(c => /not an active encounter/.test(c.textContent)));
    await element("events").children[0].children.at(-1).onclick();
    assert.match(element("events").children[0].children.at(-1).textContent, /No attributed openly licensed photo/);
    assert.equal(element("events").children[0].children.some(c => c.tag === "img"), false,
      "no image URL may be assigned before its explicit reuse licence is accepted");
    photoLicense = "https://creativecommons.org/licenses/by/4.0/";
    element("language").onchange({ target: { value: "en" } });
    await element("events").children[0].children.at(-1).onclick();
    assert.equal(element("events").children[0].children.find(c => c.tag === "img").src,
      "https://upload.wikimedia.org/nearby.jpg");
    assert.match(element("events").children[0].children.at(-1).textContent,
      /Illustrative nearby photo.*does not document this event.*Test photographer/);
    element("empty").onclick();
    sourceFailure = true;
    await element("connected-form").onsubmit({ preventDefault() {} });
    assert.match(element("status").textContent, /Source unavailable: HTTP 502/);
    assert.equal(element("mode").textContent, "No source imported.", "no fictional substitute on failure");
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
