import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLiveNarrative, NARRATIVE_BRIEFS, LOST_PLAYER_DREAM, JOURNAL_SUBTITLE } from "../live-narrative.mjs";
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

test("journal subtitle uses only canonical server facts, stays bilingual and rejects oversized output", async () => {
  let calls = 0;
  const client = createLiveNarrative({ fetcher: async (_, options) => {
    calls++;
    assert.deepEqual(JSON.parse(options.body), { journey: state.serverJourney.id, brief: JOURNAL_SUBTITLE });
    return reply(JOURNAL_SUBTITLE);
  } });
  client.prefetch(state, [JOURNAL_SUBTITLE]);
  await flush();
  assert.deepEqual(client.snapshot(state, JOURNAL_SUBTITLE), generated);
  client.prefetch(state, [JOURNAL_SUBTITLE]);
  assert.equal(calls, 1);
  const invalid = createLiveNarrative({ fetcher: async () => ({
    ok: true, json: async () => ({ brief: JOURNAL_SUBTITLE, enabled: true, status: "ready",
      text: { en: "x".repeat(161), fr: "Texte." } }),
  }) });
  invalid.prefetch(state, [JOURNAL_SUBTITLE]);
  await flush();
  assert.equal(invalid.snapshot(state, JOURNAL_SUBTITLE), null);
  assert.match(invalid.status(state, JOURNAL_SUBTITLE, "en"), /failed/);
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

test("contextual event sets evolve each game day and name consent changes only future contextual requests", async () => {
  const calls = [];
  const client = createLiveNarrative({ fetcher: async (_, options) => {
    calls.push(JSON.parse(options.body));
    return reply("event.clearHead");
  } });
  let current = { ...state, elapsedMinutes: 1500, distanceMeters: 12345, sleeps: 1,
    dailyCard: "star", events: { count: 2 }, storyNameFlavour: false };
  client.prefetch(current, ["event.clearHead"]);
  await flush();
  assert.deepEqual(calls[0], { journey: state.serverJourney.id, brief: "event.clearHead",
    context: { day: 1, walkingKm: 12, sleeps: 1, encounters: 2, daily: "star" } });
  current = { ...current, distanceMeters: 14000 };
  client.prefetch(current, ["event.clearHead"]);
  await flush();
  assert.equal(calls.length, 1);
  current = { ...current, storyNameFlavour: true };
  client.prefetch(current, ["event.clearHead"]);
  await flush();
  assert.equal(calls[1].nameFlavour, true);
  assert.ok(!JSON.stringify(calls).includes("PRIVATE NAME"));
  current = { ...current, elapsedMinutes: 3000 };
  assert.equal(client.snapshot(current, "event.clearHead"), null);
  client.prefetch(current, ["event.clearHead"]);
  await flush();
  assert.equal(calls.length, 3);
  assert.equal(calls[2].context.day, 2);
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

test("three cached bilingual introductions rotate without new calls or mutable snapshots", async () => {
  const alternatives = [
    { en: "Some coins are offered to you.", fr: "On vous offre quelques pièces." },
    { en: "You receive coins for the journey.", fr: "Vous recevez des pièces pour le voyage." },
  ];
  let calls = 0;
  const client = createLiveNarrative({ fetcher: async (_, options) => {
    calls++;
    return { ok: true, json: async () => ({ brief: JSON.parse(options.body).brief,
      enabled: true, status: "ready", text: generated, alternatives }) };
  } });
  client.prefetch(state, ["event.coins"]);
  await flush();
  for (let index = 0; index < 6; index++) {
    const expected = [generated, ...alternatives][index % 3];
    const result = client.snapshot(state, "event.coins", index);
    assert.deepEqual(result, expected);
    result.fr = "mutation";
    assert.deepEqual(client.snapshot(state, "event.coins", index), expected);
    assert.match(client.introductionStatus(state, "event.coins", "en", true, index),
      new RegExp(`version ${index % 3 + 1}/3`));
    assert.match(client.introductionStatus(state, "event.coins", "fr", true, index), /IA.*inchangés/);
    client.prefetch(state, ["event.coins"]);
  }
  assert.equal(calls, 1);
  assert.match(client.introductionStatus(state, "event.coins", "en", false), /Authored introduction.*next encounter/);
  const legacy = createLiveNarrative({ fetcher: async () => reply("event.coins") });
  legacy.prefetch(state, ["event.coins"]);
  await flush();
  assert.deepEqual(legacy.snapshot(state, "event.coins", 2), generated);
  assert.match(legacy.introductionStatus(state, "event.coins", "en", true, 2), /1\/1/);
});

test("invalid or oversized variant sets fail explicitly without automatic retries", async () => {
  for (const alternatives of [null, {}, [generated], [generated, { en: "x".repeat(401), fr: "Texte." }]]) {
    let calls = 0;
    const client = createLiveNarrative({ fetcher: async () => {
      calls++;
      return { ok: true, json: async () => ({ enabled: true, brief: "event.coins", status: "ready",
        text: generated, alternatives }) };
    } });
    client.prefetch(state, ["event.coins"]);
    await flush();
    assert.equal(client.snapshot(state, "event.coins"), null);
    assert.match(client.status(state, "event.coins", "en"), /failed/);
    client.prefetch(state, ["event.coins"]);
    assert.equal(calls, 1);
  }
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
    } else if (id === LOST_PLAYER_DREAM) {
      assert.equal(brief.kind, "dream");
      assert.match(brief.facts, /not a real sighting/);
    } else {
      assert.ok(id.startsWith("npc.hospitality."));
      assert.equal(typeof brief.en, "string");
      assert.equal(typeof brief.fr, "string");
    }
  }
});

test("dream factory caches three bilingual introductions using only the registered id", async () => {
  const requests = [], alternatives = [
    { en: "In your dream, a thread glimmers.", fr: "Dans votre rêve, un fil luit." },
    { en: "A faded thread returns in your sleep.", fr: "Un fil effacé revient dans votre sommeil." },
  ];
  const client = createLiveNarrative({ fetcher: async (_, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ brief: LOST_PLAYER_DREAM, status: "ready",
      enabled: true, text: generated, alternatives }) };
  } });
  client.prefetch(state, [LOST_PLAYER_DREAM]);
  await flush();
  for (let variant = 0; variant < 6; variant++) {
    assert.deepEqual(client.snapshot(state, LOST_PLAYER_DREAM, variant), [generated, ...alternatives][variant % 3]);
  }
  client.prefetch(state, [LOST_PLAYER_DREAM]);
  await flush();
  assert.deepEqual(requests, [{ journey: state.serverJourney.id, brief: LOST_PLAYER_DREAM }]);
});

test("dream factory rejects incomplete version sets without automatic retries", async () => {
  let calls = 0;
  const client = createLiveNarrative({ fetcher: async () => { calls++; return reply(LOST_PLAYER_DREAM); } });
  client.prefetch(state, [LOST_PLAYER_DREAM]);
  await flush();
  assert.equal(client.snapshot(state, LOST_PLAYER_DREAM), null);
  assert.match(client.status(state, LOST_PLAYER_DREAM, "en"), /failed/);
  client.prefetch(state, [LOST_PLAYER_DREAM]);
  await flush();
  assert.equal(calls, 1);
});

for (const language of ["en", "fr"]) {
  test(`${language}: travel UI freezes active introduction; effects, cards and acknowledge remain authored`, async t => {
    class Element {
      handlers = {}; open = false; textContent = ""; dataset = {}; style = {};
      replaceChildren(...children) { this.children = children; this.textContent = children.map(c => typeof c === "string" ? c : c.textContent).join(""); }
      addEventListener(name, fn) { this.handlers[name] = fn; }
      setAttribute() {}
      before(node) { nodes.set(`#${node.id}`, node); }
      querySelector(selector) { return nodes.get(selector); }
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
    const snapshots = [];
    const narrative = {
      prefetch() {}, snapshot: (_, brief, variant) => { snapshots.push({ brief, variant }); return cached; },
      pending: () => cached === null,
      introductionStatus: (_, brief, language, generated, variant) => `${generated ? "GENERATED" : "AUTHORED"} ${variant}`,
      subscribe(fn) { subscriber = fn; },
    };
    const event = { id: 1, kind: "coins", birthCard: "star", dailyCard: "moon",
      occurrence: 0.315, positive: 0.55, minutes: 0, foodKcal: 0, moneyCents: 150, fatigue: 0, reputation: 0 };
    const current = { state: { ...state, ended: null, tarotDay: "2026-10-18", dailyTarotSeenDay: "2026-10-18",
      events: { pending: 1, history: [event] } }, busy: false, saveStatus: "Saved",
      economy: JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url))) };
    let acknowledged = 0;
    const remembered = [], pinned = [];
    const ui = setupJourneyEvents((key, args) => translate(language, key, args), {
      context: () => current, narrative, acknowledge() { acknowledged++; current.state.events.pending = null; },
      rememberWording(id, wording) {
        remembered.push(wording);
        current.state.events.history = current.state.events.history.map(event =>
          event.id === id ? { ...event, wording } : event);
      },
      pinEvent(container, state, economy, wording) { pinned.push(wording); },
    });
    ui.update();
    await flush();
    const authored = el("#journey-event-text").textContent;
    assert.ok(authored.startsWith(translate(language, "journeyEvent.coins")));
    assert.equal(el("#journey-event-wording-status").textContent, "AUTHORED 0");
    assert.equal(el("#journey-event-wording-status").ariaBusy, "true");
    cached = generated;
    subscriber();
    assert.equal(el("#journey-event-text").textContent, authored);
    assert.equal(el("#journey-event-wording-status").ariaBusy, "false");
    el("#journey-event-continue").handlers.click();
    assert.equal(acknowledged, 1);
    current.state.events = { pending: 2, history: [{ ...event, id: 2, wordingVariant: 1 }] };
    ui.update();
    await flush();
    const dynamic = el("#journey-event-text").textContent;
    assert.ok(dynamic.startsWith(generated[language]));
    assert.equal(el("#journey-event-wording-status").textContent, "GENERATED 1");
    assert.deepEqual(remembered, [null, generated]);
    assert.deepEqual(pinned.at(-1), generated);
    cached = { en: "Different later wording.", fr: "Un autre texte plus tard." };
    ui.reset();
    ui.update();
    await flush();
    assert.equal(el("#journey-event-text").textContent, dynamic);
    assert.deepEqual(snapshots, [{ brief: "event.coins", variant: 0 }, { brief: "event.coins", variant: 1 }]);
    assert.equal(dynamic.slice(generated[language].length + 1),
      authored.slice(translate(language, "journeyEvent.coins").length + 1));
    assert.ok(el("#journey-event-cards").textContent.includes("32"));
  });
}
