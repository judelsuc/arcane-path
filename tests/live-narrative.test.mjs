import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLiveNarrative, NARRATIVE_BRIEFS } from "../live-narrative.mjs";
import { setupJourneyEvents } from "../journey-events-ui.mjs";
import { translate } from "../i18n.mjs";
import { EVENT_CATALOGUE } from "../journey-events.mjs";

const flush = () => new Promise(resolve => setImmediate(resolve));
const state = { serverJourney: { id: "a".repeat(32) }, journalAccess: "c".repeat(64),
  name: "PRIVATE NAME", notes: "SECRET", col: 123, row: 456 };
const generated = { en: "A passer-by offers you coins for the road.", fr: "Un passant vous offre des pièces pour la route." };
const reply = (brief, status = "ready", enabled = true) => ({
  ok: true, json: async () => ({ brief, enabled, status, text: status === "ready" ? generated : null }),
});

test("only registered public ids and owner capability are sent; stable bilingual snapshot", async () => {
  const requests = [];
  const client = createLiveNarrative({ fetcher: async (url, options) => {
    requests.push({ url, options });
    return reply(JSON.parse(options.body).brief);
  } });
  client.prefetch(state, ["event.coins", "lore.artifact", "PRIVATE PROMPT"]);
  await flush();
  assert.equal(requests.length, 1);
  const { url, options } = requests[0];
  assert.equal(url, "/api/live-narrative");
  assert.deepEqual(JSON.parse(options.body), { journey: state.serverJourney.id, brief: "event.coins" });
  assert.equal(options.headers["X-Journal-Capability"], state.journalAccess);
  assert.ok(!options.body.includes("PRIVATE"));
  assert.ok(!options.body.includes("SECRET"));
  assert.deepEqual(client.snapshot(state, "event.coins"), generated);
  const copy = client.snapshot(state, "event.coins");
  copy.en = "mutated";
  assert.equal(client.snapshot(state, "event.coins").en, generated.en);
  client.prefetch(state, ["event.coins"]);
  await flush();
  assert.equal(requests.length, 1);
});

test("pending polls durable result, failures are explicit and never retried", async () => {
  const jobs = [];
  let calls = 0;
  const client = createLiveNarrative({
    schedule: fn => { jobs.push(fn); return jobs.length; }, cancel() {},
    fetcher: async () => reply("event.coins", ++calls === 1 ? "running" : "ready"),
  });
  client.prefetch(state, ["event.coins"]);
  await flush();
  assert.equal(client.snapshot(state, "event.coins"), null);
  assert.match(client.status(state, "event.coins", "en"), /prepared/);
  assert.equal(jobs.length, 1);
  jobs.shift()();
  await flush();
  assert.deepEqual(client.snapshot(state, "event.coins"), generated);
  assert.equal(calls, 2);
  let failures = 0;
  const failing = createLiveNarrative({ fetcher: async () => { failures++; throw new Error("offline"); } });
  failing.prefetch(state, ["event.food"]);
  await flush();
  failing.prefetch(state, ["event.food"]);
  await flush();
  assert.equal(failures, 1);
  assert.match(failing.status(state, "event.food", "fr"), /Échec/);
});

test("disabled mode stops prefetch without a key; local saves never request", async () => {
  let calls = 0;
  const client = createLiveNarrative({ fetcher: async (_, options) => {
    calls++;
    return reply(JSON.parse(options.body).brief, "disabled", false);
  } });
  client.prefetch({}, Object.keys(NARRATIVE_BRIEFS));
  assert.equal(calls, 0);
  assert.match(client.status({}, "event.food", "en"), /local journey/);
  client.prefetch(state, Object.keys(NARRATIVE_BRIEFS));
  await flush();
  assert.equal(calls, 1);
  assert.match(client.status(state, "event.food", "en"), /disabled/);
  client.reset();
});

test("ownership switch ignores stale responses and never shares generated wording", async () => {
  let release;
  const client = createLiveNarrative({ fetcher: () => new Promise(resolve => { release = resolve; }) });
  client.prefetch(state, ["event.coins"]);
  const other = { ...state, journalKeeper: "b".repeat(32), journalAccess: "d".repeat(64) };
  assert.equal(client.snapshot(other, "event.coins"), null);
  release(reply("event.coins"));
  await flush();
  assert.equal(client.snapshot(other, "event.coins"), null);
  assert.match(client.status(other, "event.coins", "en"), /prepared/);
});

test("registry excludes all story events, dog choices and lore; NPC authored speech is bilingual", () => {
  for (const [id, brief] of Object.entries(NARRATIVE_BRIEFS)) {
    assert.equal(typeof brief.facts, "string");
    assert.ok(brief.facts.length < 500);
    if (id.startsWith("event.")) {
      assert.notEqual(EVENT_CATALOGUE[id.slice(6)].polarity, "story");
      assert.notEqual(id, "event.dogEncounter");
    } else {
      assert.ok(id.startsWith("npc.hospitality."));
      assert.equal(typeof brief.en, "string");
      assert.equal(typeof brief.fr, "string");
    }
  }
});

for (const language of ["en", "fr"]) {
  test(`${language}: travel UI freezes active introduction; effects, cards and acknowledge remain authored`, async t => {
    class Element {
      handlers = {}; open = false; textContent = ""; dataset = {}; style = {};
      replaceChildren(...children) { this.children = children; this.textContent = children.map(c => typeof c === "string" ? c : c.textContent).join(""); }
      addEventListener(name, fn) { this.handlers[name] = fn; }
      setAttribute() {}
      before(node) { this.beforeNode = node; }
      showModal() { this.open = true; }
      close() { this.open = false; }
      focus() {}
    }
    const original = { document: globalThis.document, MutationObserver: globalThis.MutationObserver };
    t.after(() => Object.assign(globalThis, original));
    const nodes = new Map(), el = id => {
      if (!nodes.has(id)) nodes.set(id, new Element());
      return nodes.get(id);
    };
    globalThis.document = { documentElement: { lang: language }, createElement: () => new Element(),
      querySelector: id => id === "dialog[open]" ? [...nodes.values()].find(e => e.open) : el(id) };
    globalThis.MutationObserver = class { observe() {} };
    let cached = null, subscriber;
    const narrative = {
      prefetch() {}, snapshot: () => cached,
      status: () => "Wording status", subscribe(fn) { subscriber = fn; },
    };
    const event = { id: 1, kind: "coins", birthCard: "star", dailyCard: "moon",
      occurrence: 0.315, positive: 0.55, minutes: 0, foodKcal: 0, moneyCents: 150, fatigue: 0, reputation: 0 };
    const current = { state: { ...state, ended: null, tarotDay: "2026-10-18", dailyTarotSeenDay: "2026-10-18",
      events: { pending: 1, history: [event] } }, busy: false, saveStatus: "Saved",
      economy: JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url))) };
    let acknowledged = 0;
    const ui = setupJourneyEvents((key, args) => translate(language, key, args), {
      context: () => current, narrative, acknowledge() { acknowledged++; current.state.events.pending = null; },
    });
    ui.update();
    await flush();
    const authored = el("#journey-event-text").textContent;
    assert.ok(authored.startsWith(translate(language, "journeyEvent.coins")));
    cached = generated;
    subscriber();
    assert.equal(el("#journey-event-text").textContent, authored);
    el("#journey-event-continue").handlers.click();
    assert.equal(acknowledged, 1);
    current.state.events = { pending: 2, history: [{ ...event, id: 2 }] };
    ui.update();
    await flush();
    const dynamic = el("#journey-event-text").textContent;
    assert.ok(dynamic.startsWith(generated[language]));
    assert.equal(dynamic.slice(generated[language].length + 1),
      authored.slice(translate(language, "journeyEvent.coins").length + 1));
    assert.ok(el("#journey-event-cards").textContent.includes("32"));
  });
}
