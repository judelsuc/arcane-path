import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  QUEST_TEMPLATES, SERVICE_QUEST_KINDS, SERVICE_QUEST_LIMITS, SERVICE_QUEST_SCOPES,
  serviceQuestReward, createServiceOffer, acceptServiceQuest, declineServiceQuest,
  advanceServiceQuest, abandonServiceQuest, trackServiceQuest, validateServiceQuests,
  setServiceQuestWording, serviceQuestDestinations, chooseTemplate,
} from "../service-quests.mjs";

const cards = ["fool", "magician", "priestess", "empress", "emperor", "hierophant",
  "lovers", "chariot", "justice", "hermit", "wheel", "strength", "hanged", "nameless",
  "temperance", "devil", "tower", "star", "moon", "sun", "judgement", "world"];
const nonce = number => number.toString(16).padStart(32, "0");
const state = () => ({ col: 0, row: 0, elapsedMinutes: 12.5, walletCents: 100,
  ended: null, fatigue: 4, energyKcal: 18, reserveKcal: 2000, health: 100,
  inventory: ["unrelated"], events: { pending: null } });
const clone = value => structuredClone(value);
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function offerOptions(template = QUEST_TEMPLATES[0], number = 1, overrides = {}) {
  return { id: nonce(number), template: template.id, scope: "local", distanceKm: 20,
    destinations: template.roles.map((role, i) => ({
      id: `osm:node/${number * 100 + i + 1}`, name: `Place ${i + 1}`,
      latitude: 45, longitude: 2 + i * 0.01, col: 2 + i * 2, row: 4 + i,
      town: `Town ${i + 1}`, kind: role.kind,
      sourceUrl: `https://www.openstreetmap.org/node/${number * 100 + i + 1}`,
    })), ...overrides };
}
const offered = (template = QUEST_TEMPLATES[0], number = 1, initial = state()) =>
  createServiceOffer(initial, offerOptions(template, number));
const accepted = (template = QUEST_TEMPLATES[0], number = 1, initial = state()) =>
  acceptServiceQuest(offered(template, number, initial), nonce(number));
function atDestination(current, quest = current.serviceQuests.quests.at(-1)) {
  const destination = quest.destinations[quest.step];
  return { ...current, col: destination.col, row: destination.row,
    elapsedMinutes: current.elapsedMinutes + 1.25 };
}
function advance(current, id = current.serviceQuests.quests.at(-1).id) {
  const quest = current.serviceQuests.quests.find(item => item.id === id);
  return advanceServiceQuest(atDestination(current, quest), id, {
    social: QUEST_TEMPLATES.find(template => template.id === quest.template).roles[quest.step].social,
  });
}
function complete(current, id = current.serviceQuests.quests.at(-1).id) {
  while (current.serviceQuests.quests.find(quest => quest.id === id).status === "active") {
    current = advance(current, id);
    validateServiceQuests(current);
  }
  return current;
}

test("catalogue is the shared JSON array: exactly two bilingual authored templates per arcane", () => {
  assert.deepEqual(QUEST_TEMPLATES,
    JSON.parse(readFileSync(new URL("../public/quest-templates.json", import.meta.url), "utf8")));
  assert.equal(QUEST_TEMPLATES.length, 44);
  assert.equal(new Set(QUEST_TEMPLATES.map(template => template.id)).size, 44);
  assert.deepEqual([...new Set(QUEST_TEMPLATES.map(template => template.card))], cards);
  assert.deepEqual(new Set(QUEST_TEMPLATES.flatMap(template => template.roles.map(role => role.kind))),
    new Set(SERVICE_QUEST_KINDS));
  for (const card of cards) assert.equal(QUEST_TEMPLATES.filter(template => template.card === card).length, 2);
  for (const template of QUEST_TEMPLATES) {
    assert.deepEqual(Object.keys(template).sort(), ["id", "card", "roles", "title", "request", "conclusion"].sort());
    assert.match(template.id, new RegExp(`^${template.card}\\.[a-z-]+$`));
    assert.ok(template.roles.length >= 1 && template.roles.length <= 3);
    for (const field of ["title", "request", "conclusion"]) {
      assert.deepEqual(Object.keys(template[field]).sort(), ["en", "fr"]);
      assert.ok(template[field].fr.length > 5);
      assert.ok(template[field].en.length > 5);
      assert.notEqual(template[field].fr, template[field].en);
    }
    for (const role of template.roles) {
      assert.deepEqual(Object.keys(role).sort(), ["action", "kind", "social"]);
      assert.ok(SERVICE_QUEST_KINDS.includes(role.kind));
      assert.ok(["talk", "send", "collect", "deliver", "observe", "candle"].includes(role.action));
      assert.equal(typeof role.social, "boolean");
      if (role.action === "candle") assert.equal(role.kind, "church");
    }
  }
  assert.throws(() => { QUEST_TEMPLATES[0].roles[0].kind = "church"; }, TypeError);
  assert.throws(() => { QUEST_TEMPLATES.push({}); }, TypeError);
});

test("all 44 complete every ordered role at its exact cell, with no prerequisite possessions", () => {
  for (const [i, template] of QUEST_TEMPLATES.entries()) {
    const initial = freeze(state()), options = freeze(offerOptions(template, i + 1));
    let current = createServiceOffer(initial, options);
    assert.equal(current.serviceQuests.offers[0].rewardCents,
      500 + Math.ceil(20 * options.distanceKm) + 300 * (template.roles.length - 1));
    assert.equal(initial.serviceQuests, undefined);
    assert.equal(validateServiceQuests(current), current);
    current = acceptServiceQuest(freeze(current), options.id);
    const reward = current.serviceQuests.quests[0].rewardCents;
    for (let step = 0; step < template.roles.length; step++) {
      assert.equal(current.serviceQuests.quests[0].step, step);
      assert.throws(() => advanceServiceQuest(current, options.id, { social: template.roles[step].social }));
      const arrived = atDestination(freeze(current));
      assert.throws(() => advanceServiceQuest(arrived, options.id, { social: !template.roles[step].social }));
      current = advanceServiceQuest(freeze(arrived), options.id, { social: template.roles[step].social });
      validateServiceQuests(current);
      assert.equal(current.elapsedMinutes, arrived.elapsedMinutes);
      assert.equal(current.walletCents, 100 + (step === template.roles.length - 1 ? reward : 0));
    }
    const quest = current.serviceQuests.quests[0];
    assert.equal(quest.status, "completed");
    assert.equal(quest.step, template.roles.length);
    assert.equal(quest.completedMinutes, current.elapsedMinutes);
    assert.equal(current.serviceQuests.tracked, null);
    assert.equal(advanceServiceQuest(current, quest.id, { social: false }), current);
    assert.deepEqual(current.inventory, initial.inventory);
    for (const key of ["fatigue", "energyKcal", "reserveKcal", "health"]) assert.equal(current[key], initial[key]);
  }
});

test("reward uses the frozen uncapped formula, exact ceil precision and safe finite values", () => {
  for (const [distance, steps, result] of [[20, 1, 900], [100, 2, 2800],
    [500, 2, 10800], [1000, 3, 21100], [10000, 3, 201100],
    [1.000001, 2, 821], [0.000001, 1, 501]]) {
    assert.equal(serviceQuestReward(distance, steps), result);
  }
  assert.equal(serviceQuestReward(1, 1), 520);
  assert.equal(serviceQuestReward(1 + Number.EPSILON, 1), 521);
  for (const distance of [0, -1, NaN, Infinity, "20", Number.MAX_VALUE]) {
    assert.throws(() => serviceQuestReward(distance, 2));
  }
  for (const steps of [0, -1, 1.1, NaN, Infinity, "2"]) assert.throws(() => serviceQuestReward(20, steps));
  const options = offerOptions(QUEST_TEMPLATES[0], 1, { distanceKm: 1.000001 });
  const current = createServiceOffer(state(), options);
  assert.equal(current.serviceQuests.offers[0].distanceKm, options.distanceKm);
  assert.equal(current.serviceQuests.offers[0].rewardCents, 821);
});

test("first nonce appearance is immutable, copied from caller, never rerolled even after closure", () => {
  const options = offerOptions(), current = createServiceOffer(state(), options);
  options.destinations[0].name = "Changed externally";
  assert.equal(current.serviceQuests.offers[0].destinations[0].name, "Place 1");
  assert.equal(createServiceOffer(current, { ...options, distanceKm: 10000 }), current);
  let next = acceptServiceQuest(current, options.id);
  const snapshot = clone(next.serviceQuests.quests[0]);
  next = { ...next, col: 81, row: 61, elapsedMinutes: 19 };
  assert.deepEqual(next.serviceQuests.quests[0], snapshot);
  next = complete(next);
  assert.equal(createServiceOffer(next, { ...options, template: "unknown" }), next);
  const again = offered(QUEST_TEMPLATES[0], 2, next);
  assert.equal(again.serviceQuests.offers.length, 1);
  assert.notEqual(again.serviceQuests.offers[0].id, snapshot.id);
});

test("later steps and neighbouring cells cannot satisfy the active dependency", () => {
  const current = accepted(), quest = current.serviceQuests.quests[0];
  const last = quest.destinations[1];
  assert.throws(() => advanceServiceQuest({ ...current, col: last.col, row: last.row }, quest.id, { social: true }));
  const first = atDestination(current);
  assert.throws(() => advanceServiceQuest({ ...first, col: first.col + 1 }, quest.id, { social: true }));
  const next = advanceServiceQuest(first, quest.id, { social: true });
  assert.equal(next.serviceQuests.quests[0].step, 1);
  assert.throws(() => advanceServiceQuest(next, quest.id, { social: true }));
  assert.equal(next.walletCents, 100);
  assert.throws(() => advanceServiceQuest(next, quest.id, { social: true, action: "complete" }));
  const finished = complete(next);
  assert.equal(advanceServiceQuest(finished, quest.id, {}), finished);
  assert.throws(() => acceptServiceQuest(finished, quest.id));
});

test("decline and abandon never pay, preserve nonce history and allow new instances", () => {
  const initial = offered(), id = nonce(1);
  const declined = declineServiceQuest(freeze(initial), id);
  assert.equal(declined.serviceQuests.offers.length, 0);
  assert.equal(declined.serviceQuests.quests[0].status, "declined");
  assert.equal(declined.walletCents, initial.walletCents);
  validateServiceQuests(declined);
  assert.equal(createServiceOffer(declined, offerOptions()), declined);
  assert.throws(() => acceptServiceQuest(declined, id));
  const active = advance(accepted(QUEST_TEMPLATES[0], 2, declined));
  const abandoned = abandonServiceQuest(freeze(active), nonce(2));
  validateServiceQuests(abandoned);
  assert.equal(abandoned.walletCents, 100);
  assert.equal(abandoned.serviceQuests.tracked, null);
  assert.equal(abandoned.serviceQuests.quests.at(-1).status, "abandoned");
  assert.throws(() => advanceServiceQuest(abandoned, nonce(2), { social: true }));
  assert.throws(() => abandonServiceQuest(abandoned, nonce(2)));
  assert.equal(offered(QUEST_TEMPLATES[0], 3, { ...abandoned, col: 0, row: 0 }).serviceQuests.offers.length, 1);
});

test("offers/active caps, duplicate template and bounded history are enforced without eviction", () => {
  let current = state();
  for (let i = 0; i < 3; i++) current = offered(QUEST_TEMPLATES[i], i + 1, current);
  assert.throws(() => offered(QUEST_TEMPLATES[3], 4, current), /limit/);
  for (let i = 0; i < 3; i++) current = acceptServiceQuest(current, nonce(i + 1));
  current = offered(QUEST_TEMPLATES[3], 4, current);
  assert.throws(() => acceptServiceQuest(current, nonce(4)));
  assert.throws(() => offered(QUEST_TEMPLATES[0], 5, current), /duplicate/);
  const base = declineServiceQuest(offered(), nonce(1));
  const closed = base.serviceQuests.quests[0];
  const full = { ...base, serviceQuests: { ...base.serviceQuests,
    quests: Array.from({ length: SERVICE_QUEST_LIMITS.history }, (_, i) => ({ ...closed, id: nonce(i + 1) })) } };
  validateServiceQuests(full);
  assert.throws(() => offered(QUEST_TEMPLATES[1], 1001, full), /limit/);
  const over = clone(full);
  over.serviceQuests.quests.push({ ...closed, id: nonce(1001) });
  assert.throws(() => validateServiceQuests(over));
});

test("ended and pending gameplay blocks physical quest actions, without mutating the input", () => {
  const blockers = [{ ended: "health" }, { events: { pending: {} } }, { actionPending: true },
    { pendingAction: {} }, { transport: { booking: { status: "active" } } },
    { equipment: { dogEncounter: "pending" } }, { performancePending: {} }, { cafePending: {} },
    { theftPending: {} }, { miniGamePending: {} }];
  for (const blocker of blockers) {
    assert.throws(() => createServiceOffer(freeze({ ...state(), ...blocker }), offerOptions()));
    assert.throws(() => acceptServiceQuest(freeze({ ...offered(), ...blocker }), nonce(1)));
    assert.throws(() => declineServiceQuest(freeze({ ...offered(), ...blocker }), nonce(1)));
    assert.throws(() => advanceServiceQuest(freeze({ ...atDestination(accepted()), ...blocker }),
      nonce(1), { social: true }));
    assert.throws(() => abandonServiceQuest(freeze({ ...accepted(), ...blocker }), nonce(1)));
  }
});

test("legacy consultation is read-only; tracking and wording never alter gameplay", () => {
  const initial = freeze(state()), snapshot = clone(initial);
  assert.equal(validateServiceQuests(initial), initial);
  assert.deepEqual(serviceQuestDestinations(initial), []);
  assert.equal(trackServiceQuest(initial, null), initial);
  assert.equal(chooseTemplate(initial).id, QUEST_TEMPLATES[0].id);
  assert.deepEqual(initial, snapshot);
  const current = freeze(accepted()), before = clone(current);
  const pois = serviceQuestDestinations(current), quest = current.serviceQuests.quests[0];
  assert.equal(pois.length, 1);
  assert.deepEqual(pois[0], { ...quest.destinations[0], questId: quest.id, template: quest.template,
    step: 0, action: "talk", social: true, tracked: true });
  pois[0].name = "External mutation";
  assert.deepEqual(current, before);
  assert.equal(serviceQuestDestinations(offered()).length, 0);
  const untracked = trackServiceQuest(current, null);
  assert.equal(untracked.serviceQuests.tracked, null);
  assert.equal(trackServiceQuest(untracked, quest.id).serviceQuests.tracked, quest.id);
  assert.throws(() => trackServiceQuest(current, nonce(500)));
  const prose = { fr: "Une voix accueillante.", en: "A welcoming voice." };
  const written = setServiceQuestWording(current, quest.id, "arrival", prose);
  prose.fr = "Changed";
  assert.equal(written.serviceQuests.quests[0].wording.arrival.fr, "Une voix accueillante.");
  const { serviceQuests: a, ...gameplayBefore } = before;
  const { serviceQuests: b, ...gameplayAfter } = written;
  assert.deepEqual(gameplayAfter, gameplayBefore);
  assert.deepEqual(a.quests[0].destinations, b.quests[0].destinations);
  assert.equal(a.quests[0].step, b.quests[0].step);
  assert.equal(a.quests[0].rewardCents, b.quests[0].rewardCents);
  validateServiceQuests(written);
  for (const invalid of [{ fr: "Salut" }, { fr: " ", en: "Hello" },
    { fr: "x".repeat(2001), en: "Hello" }, { fr: "Salut\nici", en: "Hello" },
    { fr: "Salut", en: "Hello", rewardCents: 100000 }]) {
    assert.throws(() => setServiceQuestWording(current, quest.id, "arrival", invalid));
  }
  assert.throws(() => setServiceQuestWording(current, quest.id, "objectives", { fr: "Salut", en: "Hello" }));
  assert.throws(() => setServiceQuestWording(current, nonce(500), "offer", { fr: "Salut", en: "Hello" }));
});

test("template rotation is deterministic, read-only and skips offered/active entries", () => {
  const initial = freeze(state());
  assert.equal(chooseTemplate(initial), chooseTemplate(initial));
  assert.deepEqual(SERVICE_QUEST_SCOPES.map(scope => chooseTemplate(initial, scope).card),
    ["fool", "hierophant", "strength", "tower"]);
  const current = freeze(offered());
  assert.equal(chooseTemplate(current).id, QUEST_TEMPLATES[1].id);
  assert.equal(chooseTemplate(current), chooseTemplate(current));
  assert.throws(() => chooseTemplate(current, "moon"));
});

test("contract rejects invalid geography, kinds, identity, same-cell actions and impossible leg distances", () => {
  const cases = [
    options => { options.id = "not-a-nonce"; },
    options => { options.template = "unknown"; },
    options => { options.scope = "global"; },
    options => { options.distanceKm = 0; },
    options => { options.distanceKm = Infinity; },
    options => { options.distanceKm = 0.0001; },
    options => { options.rewardCents = 999999; },
    options => { options.destinations.pop(); },
    options => { options.destinations[0].kind = "church"; },
    options => { options.destinations[0].latitude = 91; },
    options => { options.destinations[0].longitude = NaN; },
    options => { options.destinations[0].longitude = -181; },
    options => { options.destinations[0].col = 1.5; },
    options => { options.destinations[0].row = Infinity; },
    options => { options.destinations[0].id = ""; },
    options => { options.destinations[0].town = ""; },
    options => { options.destinations[0].name = "\u0000bad"; },
    options => { options.destinations[0].sourceUrl = "javascript:alert(1)"; },
    options => { options.destinations[0].sourceUrl = "https://user:secret@example.org"; },
    options => { options.destinations[0].extra = "invented"; },
    options => { options.destinations[0].col = 0; options.destinations[0].row = 0; },
    options => { options.destinations[1].id = options.destinations[0].id; },
    options => { options.destinations[1].col = 2; options.destinations[1].row = 4; },
  ];
  for (const mutate of cases) {
    const options = offerOptions();
    mutate(options);
    assert.throws(() => createServiceOffer(state(), options), mutate.toString());
  }
  const single = QUEST_TEMPLATES.find(template => template.roles.length === 1);
  const options = offerOptions(single, 1, { distanceKm: 1 });
  assert.throws(() => createServiceOffer({ ...state(), latitude: 20, longitude: 10 }, options));
  const valid = createServiceOffer({ ...state(), latitude: 45, longitude: 2 }, options);
  assert.deepEqual(valid.serviceQuests.offers[0].origin, { col: 0, row: 0, latitude: 45, longitude: 2 });
  assert.throws(() => createServiceOffer({ ...state(), latitude: NaN, longitude: 2 }, options));
});

test("strict save validation rejects altered fields, state shapes, actions, histories and times", () => {
  const active = advance(accepted()), finished = complete(active);
  assert.deepEqual(validateServiceQuests(JSON.parse(JSON.stringify(finished))), finished);
  const corruptions = [
    s => { s.serviceQuests = null; },
    s => { s.serviceQuests.version = 2; },
    s => { s.serviceQuests.extra = true; },
    s => { s.serviceQuests.offers = {}; },
    s => { s.serviceQuests.tracked = nonce(500); },
    s => { s.serviceQuests.quests.push(clone(s.serviceQuests.quests[0])); },
    s => { s.serviceQuests.quests[0].rewardCents++; },
    s => { s.serviceQuests.quests[0].step = 0.5; },
    s => { s.serviceQuests.quests[0].step = 2; },
    s => { s.serviceQuests.quests[0].status = "paid"; },
    s => { s.serviceQuests.quests[0].template = "invented"; },
    s => { s.serviceQuests.quests[0].createdMinutes = -1; },
    s => { s.serviceQuests.quests[0].acceptedMinutes = null; },
    s => { s.serviceQuests.quests[0].acceptedMinutes = 1; },
    s => { s.serviceQuests.quests[0].completedMinutes = 13; },
    s => { s.serviceQuests.quests[0].closedMinutes = 13; },
    s => { s.serviceQuests.quests[0].origin.col = 0.5; },
    s => { s.serviceQuests.quests[0].origin.latitude = 45; },
    s => { s.serviceQuests.quests[0].origin.col = 10; },
    s => { s.serviceQuests.quests[0].destinations[0].kind = "church"; },
    s => { s.serviceQuests.quests[0].destinations[1].longitude = 100; },
    s => { s.serviceQuests.quests[0].history.pop(); },
    s => { s.serviceQuests.quests[0].history[2].action = "candle"; },
    s => { s.serviceQuests.quests[0].history[2].col = 1; },
    s => { s.serviceQuests.quests[0].history[2].minutes = 1; },
    s => { s.serviceQuests.quests[0].history[2].minutes = 999; },
    s => { s.serviceQuests.quests[0].history[2].extra = true; },
    s => { delete s.serviceQuests.quests[0].history[2]; },
    s => { s.serviceQuests.quests[0].wording.offer = { fr: "Bonjour" }; },
    s => { s.serviceQuests.quests[0].wording.rules = { fr: "Bonjour", en: "Hello" }; },
    s => { s.elapsedMinutes = 0; },
    s => { s.elapsedMinutes = Infinity; },
  ];
  for (const mutate of corruptions) {
    const damaged = clone(active);
    mutate(damaged);
    assert.throws(() => validateServiceQuests(damaged), mutate.toString());
  }
  for (const mutate of [
    s => { s.serviceQuests.quests[0].completedMinutes = null; },
    s => { s.serviceQuests.quests[0].history.at(-1).minutes += 0.1; },
    s => { s.serviceQuests.quests[0].history.at(-1).col += 1; },
    s => { s.serviceQuests.tracked = nonce(1); },
  ]) {
    const damaged = clone(finished);
    mutate(damaged);
    assert.throws(() => validateServiceQuests(damaged));
  }
  const damaged = offered();
  damaged.serviceQuests.offers[0].acceptedMinutes = 12.5;
  assert.throws(() => validateServiceQuests(damaged));
});

test("completion requires a valid wallet and cannot overflow or pay from invalid saves", () => {
  const candle = QUEST_TEMPLATES.find(template => template.roles.length === 1);
  const current = atDestination(accepted(candle));
  for (const walletCents of [undefined, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => advanceServiceQuest({ ...current, walletCents }, nonce(1), { social: false }));
  }
  const tampered = clone(current);
  tampered.serviceQuests.quests[0].rewardCents = 100000;
  assert.throws(() => advanceServiceQuest(tampered, nonce(1), { social: false }));
  assert.equal(current.walletCents, 100);
});
