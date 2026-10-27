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
