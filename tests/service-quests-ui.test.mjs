import test from "node:test";
import assert from "node:assert/strict";
import { setupServiceQuests } from "../service-quests-ui.mjs";
import { QUEST_TEMPLATES, createServiceOffer, acceptServiceQuest,
  advanceServiceQuest } from "../service-quests.mjs";
import { translate } from "../i18n.mjs";

class Element {
  children = [];
  events = {};
  value = "local";
  textContent = "";
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, fn) { this.events[type] = fn; }
  get options() { return this.children; }
}
const settle = () => new Promise(resolve => setImmediate(resolve));

function offerFixture(t, prepare) {
  const previous = globalThis.document, nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  globalThis.document = { getElementById: get, createElement: () => new Element(),
    documentElement: { lang: "en" } };
  t.after(() => { globalThis.document = previous; });
  t.mock.method(console, "error", () => {});
  const template = QUEST_TEMPLATES[0], id = "c".repeat(32);
  let state = { col: 0, row: 0, elapsedMinutes: 0, walletCents: 0,
    serverJourney: { id: "a".repeat(32) }, journalAccess: "private" };
  let speaker = { id: "b".repeat(32), name: "Camille", profile: {
    quest: { version: 1, template: template.id, scope: "local" } } };
  const ready = { status: "ready", nonce: id, template: template.id, scope: "local",
    characterId: speaker.id, origin: { col: 0, row: 0 }, distanceKm: 20,
    destinations: template.roles.map((role, index) => ({
      id: `osm:node/${index + 1}`, name: `Destination ${index}`, latitude: 45,
      longitude: 2 + index * 0.01, col: 2 + index * 2, row: 3 + index,
      town: "Destination town", kind: role.kind,
      sourceUrl: `https://www.openstreetmap.org/node/${index + 1}`,
    })) };
  const calls = [];
  let blocked = false;
  const ui = setupServiceQuests((key, args) => translate("en", key, args), {
    context: () => ({ state, blocked, cell: { terrain: "grass" } }),
    mutate: transform => { state = transform(state); return true; }, character: () => speaker,
    destinations: { async characterOffer(...args) {
      calls.push(args);
      return prepare ? prepare(ready, ...args) : ready;
    } },
    narrative: {
      questSnapshot() { assert.fail("Quest dialogue must not consume LLM text"); },
      prefetchQuest() { assert.fail("Quest dialogue must not request LLM text"); },
      questStatus() { assert.fail("Quest dialogue must not show LLM status"); },
      subscribe() { assert.fail("Quest dialogue must not subscribe to LLM updates"); },
    },
  });
  return { ui, get, calls, state: () => state,
    blocked(value) { blocked = value; },
    speaker(value) { speaker = value; }, move() { state = { ...state, col: 1 }; },
    changeJourney() { state = { ...state, serverJourney: { id: "d".repeat(32) } }; } };
}

test("characters propose their assigned quest automatically without a radius or search form", async t => {
  const f = offerFixture(t);
  f.ui.characterChanged();
  await settle();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][1], "b".repeat(32));
  assert.equal(f.get("dialogue-services").children[0].children.length, 0);
  assert.equal(f.state().serviceQuests.offers.length, 1);
  assert.equal(f.state().serviceQuests.offers[0].characterId, "b".repeat(32));
  assert.match(f.get("dialogue-services").children[1].textContent, /Camille offers/);
  f.ui.localize();
  await settle();
  assert.equal(f.calls.length, 1);
  const section = f.get("dialogue-services").children[3].children[0];
  section.children.at(-1).children.find(node => node.textContent === "Accept").events.click();
  f.ui.localize();
  await settle();
  assert.equal(f.state().serviceQuests.quests[0].status, "active");
  assert.equal(f.calls.length, 1);
});

test("no selected character means no quest generation and no other character's offer in dialogue", async t => {
  const f = offerFixture(t);
  f.speaker(null);
  f.ui.localize();
  await settle();
  assert.equal(f.calls.length, 0);
  f.speaker({ id: "b".repeat(32), name: "Camille",
    profile: { quest: { template: QUEST_TEMPLATES[0].id, scope: "local" } } });
  f.ui.characterChanged();
  await settle();
  f.speaker({ id: "e".repeat(32), name: "Other person" });
  f.ui.characterChanged();
  assert.equal(f.get("dialogue-services").children[3].children.length, 0);
  assert.ok(f.get("quests-services").children.length > 0);
});

for (const language of ["en", "fr"]) {
  test(`${language} quest templates and accept/reject controls are ready without generated wording`, async t => {
    const f = offerFixture(t);
    document.documentElement.lang = language;
    f.ui.characterChanged();
    await settle();
    const section = f.get("dialogue-services").children[3].children[0];
    assert.equal(section.children[1].textContent, QUEST_TEMPLATES[0].request[language]);
    const controls = section.children.at(-1);
    assert.deepEqual(controls.children.map(node => node.textContent),
      language === "en" ? ["Accept", "Not this time"] : ["Accepter", "Pas cette fois"]);
    assert.ok(controls.children.every(node => !node.disabled));
    controls.children[0].events.click();
    assert.equal(f.state().serviceQuests.quests[0].status, "active");
    assert.match(f.get("dialogue-services").children[1].textContent,
      language === "en" ? /Thank you/ : /Merci/);
    assert.equal(f.get("dialogue-services").children[3].children.length, 0);
  });
}

test("provider failure has a retry for the same character, not a new random request", async t => {
  let failing = true;
  const f = offerFixture(t, ready => {
    if (failing) throw new Error("provider timed out");
    return ready;
  });
  f.ui.characterChanged();
  await settle();
  assert.equal(f.state().serviceQuests, undefined);
  assert.match(f.get("dialogue-services").children[2].textContent, /could not be prepared/);
  failing = false;
  const retry = f.get("dialogue-services").children[0].children[0];
  assert.equal(retry.textContent, "Retry this request");
  retry.events.click();
  await settle();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0][1], f.calls[1][1]);
  assert.equal(f.calls[1][2].retry, true);
  assert.equal(f.state().serviceQuests.offers.length, 1);
});

test("refusing a character's offer does not create another quest on reopening", async t => {
  const f = offerFixture(t);
  f.ui.characterChanged();
  await settle();
  const section = f.get("dialogue-services").children[3].children[0];
  section.children.at(-1).children.find(node => node.textContent === "Not this time").events.click();
  f.ui.reset();
  f.ui.characterChanged();
  await settle();
  assert.equal(f.calls.length, 1);
  assert.equal(f.state().serviceQuests.offers.length, 0);
  assert.equal(f.state().serviceQuests.quests[0].status, "declined");
});

test("a verified absence of compatible destinations never becomes an invented proposal or retry loop", async t => {
  const f = offerFixture(t, () => ({ status: "unavailable", reason: "No compatible POIs" }));
  f.ui.characterChanged();
  await settle();
  f.ui.localize();
  await settle();
  assert.equal(f.calls.length, 1);
  assert.equal(f.state().serviceQuests, undefined);
  assert.equal(f.get("dialogue-services").children[3].children.length, 0);
  assert.match(f.get("dialogue-services").children[1].textContent, /no quest to offer/);
});

test("switching speakers aborts the old preparation and accepts only the new speaker's response", async t => {
  const resolutions = new Map();
  const f = offerFixture(t, (ready, _state, characterId) => new Promise(resolve => {
    resolutions.set(characterId, () => resolve({ ...ready, characterId }));
  }));
  f.ui.characterChanged();
  await settle();
  f.speaker({ id: "e".repeat(32), name: "Other person",
    profile: { quest: { template: QUEST_TEMPLATES[0].id, scope: "local" } } });
  f.ui.characterChanged();
  await settle();
  assert.equal(f.calls[0][2].signal.aborted, true);
  resolutions.get("b".repeat(32))();
  await settle();
  assert.equal(f.state().serviceQuests, undefined);
  resolutions.get("e".repeat(32))();
  await settle();
  assert.equal(f.state().serviceQuests.offers.length, 1);
  assert.equal(f.state().serviceQuests.offers[0].characterId, "e".repeat(32));
});

test("a temporarily blocking event does not permanently stall the character's proposal", async t => {
  let resolve, attempts = 0;
  const f = offerFixture(t, ready => attempts++ === 0
    ? new Promise(done => { resolve = () => done(ready); }) : ready);
  f.ui.characterChanged();
  await settle();
  f.blocked(true);
  resolve();
  await settle();
  assert.equal(f.state().serviceQuests, undefined);
  f.blocked(false);
  f.ui.localize();
  await settle();
  assert.equal(f.calls.length, 2);
  assert.equal(f.state().serviceQuests.offers.length, 1);
});

test("preparing another character's quest does not block accepting an existing offer", async t => {
  let resolve, attempts = 0;
  const f = offerFixture(t, ready => attempts++ === 0 ? ready
    : new Promise(done => { resolve = () => done(ready); }));
  f.ui.characterChanged();
  await settle();
  f.speaker({ id: "e".repeat(32), name: "Other person",
    profile: { quest: { template: QUEST_TEMPLATES[1].id, scope: "local" } } });
  f.ui.characterChanged();
  await settle();
  const saved = f.get("quests-services").children[0];
  const accept = saved.children.at(-1).children.find(node => node.textContent === "Accept");
  assert.equal(accept.disabled, false);
  accept.events.click();
  assert.equal(f.state().serviceQuests.quests[0].status, "active");
  f.ui.reset();
  resolve();
  await settle();
});

for (const change of ["move", "changeJourney"]) {
  test(`a quest response cannot create an offer after ${change}`, async t => {
    let resolve;
    const f = offerFixture(t, ready => new Promise(done => { resolve = () => done(ready); }));
    f.ui.characterChanged();
    await settle();
    f[change]();
    f.ui.reset();
    resolve();
    await settle();
    assert.equal(f.state().serviceQuests, undefined);
  });
}

function fixture(t, contract, template = QUEST_TEMPLATES[0]) {
  const previous = globalThis.document, nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  globalThis.document = { getElementById: get, createElement: () => new Element(),
    documentElement: { lang: "en" } };
  t.after(() => { globalThis.document = previous; });
  t.mock.method(console, "error", () => {});
  const id = "c".repeat(32);
  let state = createServiceOffer({ col: 0, row: 0, elapsedMinutes: 0,
    walletCents: 0, serverJourney: { id: "a".repeat(32) }, journalAccess: "private" }, {
    id, characterId: "b".repeat(32), template: template.id, scope: "local", distanceKm: 20,
    destinations: template.roles.map((role, index) => ({
      id: `osm:node/${index + 1}`, name: `Destination ${index}`, latitude: 45,
      longitude: 2 + index * 0.01, col: 2 + index * 2, row: 3 + index,
      town: "Destination town", kind: role.kind,
      sourceUrl: `https://www.openstreetmap.org/node/${index + 1}`,
    })),
  });
  const ui = setupServiceQuests((key, args) => translate("en", key, args), {
    context: () => ({ state, blocked: false, cell: { settlements: [{ name: "Town" }] } }),
    mutate: transform => { state = transform(state); return true; }, storage: {},
    characters: { contract }, narrative: {
      questSnapshot() {}, prefetchQuest() {}, questStatus() { return ""; }, subscribe() {},
    },
  });
  return { ui, get, accept() { state = acceptServiceQuest(state, id); },
    complete() {
      state = acceptServiceQuest(state, id);
      while (state.serviceQuests.quests[0].status === "active") {
        const quest = state.serviceQuests.quests[0], destination = quest.destinations[quest.step];
        state = advanceServiceQuest({ ...state, col: destination.col, row: destination.row,
          elapsedMinutes: state.elapsedMinutes + 1 }, id, { social: template.roles[quest.step].social });
      }
    },
    state: () => state,
    diagnostics: () => get("dialogue-services").children[2].textContent,
    changeJourney() { state = { ...state, serverJourney: { id: "d".repeat(32) } }; } };
}

test("contract synchronization replays ordered history and displays/retries asynchronous failure", async t => {
  const calls = [];
  let fail = true;
  const f = fixture(t, async (state, character, contract, options) => {
    calls.push({ journey: state.serverJourney.id, character, contract, options });
    if (contract.event === "accepted" && fail) throw new Error("offline fixture");
  });
  f.accept();
  f.ui.localize();
  await settle();
  assert.deepEqual(calls.map(call => call.contract.event), ["offered", "accepted"]);
  assert.deepEqual(calls[0].options.location, { col: 0, row: 0 });
  assert.equal(calls[0].character, "b".repeat(32));
  assert.match(f.diagnostics(), /offline fixture/);
  fail = false;
  f.ui.localize();
  await settle();
  assert.deepEqual(calls.map(call => call.contract.event), ["offered", "accepted", "accepted"]);
  assert.equal(f.diagnostics(), "");
  f.ui.localize();
  await settle();
  assert.equal(calls.length, 3);
});

test("acceptance during an in-flight offer is synchronized without another UI refresh", async t => {
  let resolveOffer;
  const calls = [];
  const f = fixture(t, async (_, __, contract) => {
    calls.push(contract.event);
    if (contract.event === "offered") await new Promise(resolve => { resolveOffer = resolve; });
  });
  f.ui.localize();
  f.accept();
  f.ui.localize();
  assert.deepEqual(calls, ["offered"]);
  resolveOffer();
  await settle();
  assert.deepEqual(calls, ["offered", "accepted"]);
  assert.equal(f.diagnostics(), "");
});

test("a previous journey's asynchronous error does not appear in the new journey", async t => {
  let rejectOffer;
  const f = fixture(t, () => new Promise((_, reject) => { rejectOffer = reject; }));
  f.ui.localize();
  const rejectOld = rejectOffer;
  f.changeJourney();
  f.ui.localize();
  rejectOld(new Error("other journey private error"));
  await settle();
  assert.equal(f.diagnostics(), "");
});

for (const steps of [1, 2, 3]) {
test(`${steps}-step real quest completion persists and replays idempotently after retry/reload`, async t => {
  const template = QUEST_TEMPLATES.find(item => item.roles.length === steps);
  const contracts = new Map(), recorded = new Set(), calls = [];
  let simulateLostCompletion = true;
  const contract = async (_, character, change) => {
    calls.push(change);
    const key = `${change.id}:${change.event}:${change.step}`;
    if (!recorded.has(key)) {
      const current = contracts.get(change.id);
      if (!current) {
        assert.equal(change.event, "offered");
        assert.equal(change.step, 0);
      } else {
        assert.equal(current.character, character);
        assert.equal(current.totalSteps, change.totalSteps);
        const valid = change.event === "accepted" && current.status === "offered" && change.step === 0
          || change.event === "advanced" && current.status === "active"
            && change.step === current.step + 1 && change.step < change.totalSteps
          || change.event === "completed" && current.status === "active"
            && change.step === change.totalSteps && change.step === current.step + 1;
        assert.equal(valid, true, `Invalid server transition: ${JSON.stringify(change)}`);
      }
      contracts.set(change.id, { character, totalSteps: change.totalSteps, step: change.step,
        status: change.event === "offered" ? "offered"
          : change.event === "completed" ? "completed" : "active",
        outcome: change.event === "completed" ? "completed" : null });
      recorded.add(key);
    }
    if (change.event === "completed" && simulateLostCompletion) {
      simulateLostCompletion = false;
      throw new Error("completion response lost");
    }
  };
  const f = fixture(t, contract, template);
  f.complete();
  const history = f.state().serviceQuests.quests[0].history;
  assert.equal(history.at(-2).event, "advance");
  assert.equal(history.at(-1).event, "complete");
  f.ui.localize();
  await settle();
  const total = f.state().serviceQuests.quests[0].destinations.length;
  assert.equal(contracts.get("c".repeat(32)).outcome, "completed");
  assert.match(f.diagnostics(), /completion response lost/);
  f.ui.localize();
  await settle();
  assert.equal(f.diagnostics(), "");
  const reload = fixture(t, contract, template);
  reload.complete();
  reload.ui.localize();
  await settle();
  assert.equal(reload.diagnostics(), "");
  assert.deepEqual(contracts.get("c".repeat(32)), {
    character: "b".repeat(32), totalSteps: total, step: total, status: "completed", outcome: "completed",
  });
  assert.equal(recorded.size, total + 2);
  assert.equal(calls.some(change => change.event === "advanced" && change.step === total), false);
});
}
