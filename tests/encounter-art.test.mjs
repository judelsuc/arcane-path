import test from "node:test";
import assert from "node:assert/strict";
import { createEncounterIllustrator, encounterIllustrationRecords } from "../encounter-art.mjs";
import { IMAGE_LICENSE } from "../journal-art.mjs";
import { translate } from "../i18n.mjs";

const tick = () => new Promise(resolve => setImmediate(resolve));
const owner = { serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(64),
  name: "PRIVATE", col: 123, events: { history: [{ id: "one", kind: "food" }] } };
const ready = (item, id = "c".repeat(32)) => ({ ...item, id, created: Date.now() / 1000,
  status: "ready", license: IMAGE_LICENSE, renewing: false });
const image = () => ({ ok: true, blob: async () => new Blob(["webp fixture"], { type: "image/webp" }) });

test("encounters have per-occurrence identities without private narrative or coordinates", () => {
  const records = encounterIllustrationRecords({ ...owner,
    trail: { dreams: { checks: [{ outcome: "guidance", checkMinutes: 40 }, { outcome: "miss", checkMinutes: 10 }] } },
    hospitalityAttempts: [{ outcome: "hosted", startedMinutes: 50 }, { outcome: "refused", startedMinutes: 60 }] });
  assert.deepEqual(records, [
    { scene: "event.food", occurrence: "event:one" },
    { scene: "dream.lost-player", occurrence: "dream:40" },
    { scene: "npc.hospitality.hosted", occurrence: "hospitality:50" },
    { scene: "npc.hospitality.refused", occurrence: "hospitality:60" },
  ]);
  assert.doesNotMatch(JSON.stringify(records), /PRIVATE|123/);
});

test("ready images are private, pinned once per occurrence, and weekly renewal does not replace notebook images", async () => {
  let identity = "c".repeat(32);
  const calls = [], assets = [];
  const client = createEncounterIllustrator({ cancel() {}, schedule: () => 1,
    onAsset: async (...args) => assets.push(args),
    fetcher: async (_, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      assert.equal(options.headers["X-Journal-Capability"], owner.journalAccess);
      return body.operation === "image" ? image() : {
        ok: true, json: async () => ({ enabled: true, entries: body.items.map(item => ready(item, identity)) }),
      };
    } });
  const before = structuredClone(owner);
  client.observe(owner);
  await tick();
  assert.equal(assets.length, 1);
  assert.equal(assets[0][2], owner);
  identity = "d".repeat(32);
  client.refresh();
  await tick();
  assert.equal(assets.length, 1);
  assert.equal(calls.filter(call => call.operation === "image").length, 2);
  assert.deepEqual(owner, before);
  assert.doesNotMatch(JSON.stringify(calls), /PRIVATE|"col"/);
  client.stop();
});

test("pending and expired-but-ready entries are polled, with no model calls from the client", async () => {
  const jobs = [], assets = [];
  let available = false;
  const client = createEncounterIllustrator({ onAsset: async entry => assets.push(entry),
    schedule: callback => { jobs.push(callback); return jobs.length; }, cancel() {},
    fetcher: async (_, options) => {
      const body = JSON.parse(options.body);
      return body.operation === "image" ? image() : {
        ok: true, json: async () => ({ enabled: true, entries: body.items.map(item =>
          available ? { ...ready(item), renewing: true } : { ...item, id: null, status: "pending" }) }),
      };
    } });
  client.observe(owner);
  await tick();
  assert.equal(jobs.length, 1);
  available = true;
  jobs.shift()();
  await tick();
  assert.equal(assets.length, 1);
  assert.equal(jobs.length, 1);
  client.stop();
});

test("stale responses never deliver images to a different notebook", async () => {
  let complete;
  const assets = [];
  const client = createEncounterIllustrator({ onAsset: async (...args) => assets.push(args), cancel() {},
    fetcher: async () => new Promise(resolve => { complete = resolve; }) });
  client.observe(owner);
  client.stop();
  complete({ ok: true, json: async () => ({ enabled: true,
    entries: encounterIllustrationRecords(owner).map(item => ready(item)) }) });
  await tick();
  assert.equal(assets.length, 0);
});

test("invalid responses and pin failures surface once, stop polling and support explicit retry", async () => {
  let wrong = true;
  const errors = [], jobs = [];
  const client = createEncounterIllustrator({ onError: error => errors.push(error),
    schedule: callback => jobs.push(callback), cancel() {},
    fetcher: async (_, options) => {
      const body = JSON.parse(options.body);
      return body.operation === "image" ? image() : {
        ok: true, json: async () => ({ enabled: true, entries: body.items.map(item =>
          ready(wrong ? { ...item, scene: "event.coins" } : item)) }),
      };
    },
    onAsset: async () => { throw new Error("Storage full"); },
  });
  client.observe(owner);
  await tick();
  assert.equal(errors.length, 1);
  assert.equal(jobs.length, 0);
  client.observe(owner);
  await tick();
  assert.equal(errors.length, 1);
  wrong = false;
  client.refresh();
  await tick();
  assert.equal(errors.at(-1).message, "Storage full");
  assert.equal(jobs.length, 0);
  client.stop();
});

test("local journeys make no network request", async () => {
  const client = createEncounterIllustrator({ fetcher: () => { throw new Error("unexpected"); } });
  client.observe({ ...owner, journalAccess: undefined });
  await tick();
  client.stop();
});

test("images render in both languages and release object URLs even when a window is replaced before load", async test => {
  const original = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  test.after(() => {
    globalThis.document = original.document;
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  });
  class Element {
    constructor(tag) { this.tag = tag; }
    dataset = {}; children = []; events = {};
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(type, callback) { this.events[type] = callback; }
    querySelector(tag) {
      return this.children.find(child => child.tag === tag) ??
        this.children.map(child => child.querySelector(tag)).find(Boolean);
    }
  }
  globalThis.document = { createElement: tag => new Element(tag) };
  const revoked = [];
  URL.createObjectURL = () => "blob:encounter";
  URL.revokeObjectURL = url => revoked.push(url);
  const client = createEncounterIllustrator({ cancel() {}, schedule: () => 1,
    fetcher: async (_, options) => {
      const body = JSON.parse(options.body);
      return body.operation === "image" ? image() : {
        ok: true, json: async () => ({ enabled: true, entries: body.items.map(item => ready(item)) }),
      };
    } });
  const container = new Element("figure");
  client.observe(owner);
  await tick();
  for (const language of ["fr", "en"]) {
    const t = (key, args) => translate(language, key, args);
    client.render(container, owner, "event.food", "event:one", t);
    assert.equal(container.hidden, false);
    assert.equal(container.querySelector("img").alt, t("encounterIllustration"));
    assert.equal(container.querySelector("a").textContent, t("encounterIllustrationCredit"));
  }
  client.stop();
  assert.deepEqual(revoked, ["blob:encounter"]);
});
