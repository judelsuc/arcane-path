import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupEconomyUI } from "../economy-ui.mjs";
import { askHospitality } from "../hospitality.mjs";
import { startSurvival } from "../survival.mjs";
import { applyBirthTarot, startEconomy } from "../economy.mjs";
import { translate } from "../i18n.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const economy = json("../public/economy.json");
const survival = json("../public/config.json").survival;
const info = { latitude: 44.54, longitude: 2.3 };
const town = { terrain: "place", countryCodes: ["FR"],
  settlements: [{ osmId: "node/123", name: "Firmi" }] };
const start = offset => applyBirthTarot(startEconomy(startSurvival(14, 10,
  Date.UTC(2026, 9, 17, 12) + offset, "balanced", survival), economy, () => 0), economy);

class Element {
  children = [];
  events = {};
  textContent = "";
  disabled = false;
  open = false;
  dataset = {};
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  addEventListener(type, listener) { this.events[type] = listener; }
  click() { if (!this.disabled) this.events.click?.(); }
  close() { this.open = false; }
  showModal() { this.open = true; }
  focus() { this.focused = true; }
  scrollIntoView(options) { this.scrolled = options; }
  setAttribute(name, value) { this[name] = value; }
}
function harness(t, language = "en") {
  const original = globalThis.document;
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  globalThis.document = {
    documentElement: { lang: language },
    querySelector: selector => selector === "dialog[open]"
      ? [...elements.values()].find(e => e.open) ?? null
      : selector === "#economy-hospitality-feedback"
      ? element("#economy-options").children[0]?.children[1] ?? null : element(selector),
    createElement: () => new Element(),
  };
  t.after(() => { globalThis.document = original; });
  let current = { state: start(0), cell: town, info, survival, data: economy, blocked: false };
  const actions = [];
  const ui = setupEconomyUI((key, args) => translate(language, key, args), {
    context: () => current,
    act: action => {
      actions.push(action);
      if (action.kind === "hospitality") current = { ...current, state:
        askHospitality(current.state, current.cell, info, survival, economy, () => 0) };
      return true;
    },
  });
  return { ui, element, actions, set: value => { current = { ...current, ...value }; },
    current: () => current, buttons: () => element("#economy-options").children.map(li => li.children[0]) };
}

test("sleep menu explains missing OSM lodging, offers hospitality, and saves/displays the outcome in place", async t => {
  const h = harness(t);
  await h.ui.open("sleep");
  assert.match(h.element("#economy-shelter-context").textContent, /250 m cell/);
  assert.match(h.buttons()[0].textContent, /Ask locals and sleep if welcomed/);
  assert.equal(h.buttons()[0].disabled, false);
  h.buttons()[0].click();
  assert.deepEqual(h.actions, [{ kind: "hospitality" }]);
  assert.equal(h.element("#economy-dialog").open, true);
  assert.equal(h.buttons()[0].disabled, true);
  assert.equal(h.element("#economy-hospitality-result").textContent, "");
  const feedback = h.element("#economy-options").children[0].children[1];
  assert.match(feedback.textContent, /Firmi, 2026-10-17:/);
  assert.equal(feedback.focused, true);
  assert.deepEqual(feedback.scrolled, { block: "nearest" });
  assert.match(h.element("#economy-options").children[0].children[1].textContent, /already asked/);
  h.buttons()[0].click();
  assert.equal(h.actions.length, 1);
  h.buttons()[1].click();
  assert.deepEqual(h.actions.at(-1), { kind: "sleep", id: null });
  assert.equal(h.element("#economy-dialog").open, false);
  assert.equal(h.element("#ascii-map").focused, true);
});

test("hospitality is absent outside named settlements and mapped accommodation stays usable", async t => {
  const h = harness(t, "fr");
  h.set({ cell: { terrain: "road", countryCodes: ["FR"], pois: [
    { osmId: "node/5", name: "Auberge", tags: { tourism: "hostel" } },
  ] } });
  await h.ui.open("sleep");
  assert.equal(h.buttons().length, 2);
  assert.match(h.element("#economy-shelter-context").textContent, /localité nommée/);
  h.buttons()[1].click();
  assert.deepEqual(h.actions, [{ kind: "sleep", id: "node/5" }]);
  await h.ui.open("eat");
  assert.equal(h.element("#economy-shelter-context").textContent, "");
  assert.equal(h.element("#economy-hospitality-result").textContent, "");
  assert.ok(h.buttons().every(button => !button.textContent.includes("hospitalité")));
});

for (const language of ["fr", "en"]) {
  test(`${language} hospitality opening is read-only and a refusal stays visible beside the disabled action`, async t => {
    const h = harness(t, language);
    let state;
    for (let offset = 0; offset < 100; offset++) {
      const candidate = start(offset);
      if (askHospitality(candidate, town, info, survival, economy).hospitalityAttempts[0].outcome === "refused") {
        state = candidate;
        break;
      }
    }
    assert.ok(state);
    h.set({ state });
    const before = structuredClone(state);
    await h.ui.open("sleep");
    assert.deepEqual(h.current().state, before);
    assert.deepEqual(h.actions, []);
    assert.equal(h.buttons()[0].disabled, false);
    h.buttons()[0].click();
    const feedback = h.element("#economy-options").children[0].children[1];
    assert.match(feedback.textContent, language === "fr" ? /personne n'a pu vous accueillir/ : /nobody could host you/);
    assert.match(feedback.textContent, /30 min/);
    assert.match(feedback.textContent, language === "fr" ? /déjà demandé/ : /already asked/);
    assert.equal(feedback.role, "status");
    assert.equal(feedback.focused, true);
    assert.deepEqual(feedback.scrolled, { block: "nearest" });
    assert.equal(h.buttons()[0].disabled, true);
    h.ui.reset();
    h.set({ cell: { ...town, settlements: [{ osmId: "node/456", name: "Next town" }] } });
    await h.ui.open("sleep");
    assert.equal(h.buttons()[0].disabled, false);
    assert.doesNotMatch(h.element("#economy-options").children[0].children[1].textContent,
      language === "fr" ? /déjà demandé/ : /already asked/);
    assert.equal(h.current().state.hospitalityAttempts.length, 1);
  });

  test(`${language} user's previous-day Tremblay refusal does not block the next day's request`, async t => {
    const h = harness(t, language);
    h.set({ state: { ...start(0), startedAt: 1792250169304, elapsedMinutes: 3881.4635429626146,
      hospitalityAttempts: [{
        townId: "node/26691640", townName: "Tremblay-en-France", day: "2026-10-19",
        outcome: "refused", startedMinutes: 2809.7234818739466, finishedMinutes: 2839.7234818739466,
      }],
    }, cell: { ...town, settlements: [{ osmId: "node/26691640", name: "Tremblay-en-France" }] } });
    await h.ui.open("sleep");
    assert.equal(h.buttons()[0].disabled, false);
    assert.doesNotMatch(h.element("#economy-options").children[0].children[1].textContent,
      language === "fr" ? /déjà demandé/ : /already asked/);
    assert.deepEqual(h.actions, []);
  });

  test(`${language} food menu offers basic meals beyond specialties and mapped restaurant names with sources`, async t => {
    const h = harness(t, language);
    h.set({ info: { latitude: 45.182, longitude: 5.616 }, cell: {
      ...town, pois: [{ osmId: "node/42", name: "Le Café du village", tags: { amenity: "restaurant" } }],
    } });
    await h.ui.open("eat");
    assert.equal(h.element("#economy-empty").hidden, true);
    assert.equal(h.buttons().length, 2);
    assert.match(h.buttons()[0].textContent, language === "fr" ? /Repas simple/ : /Basic meal/);
    assert.match(h.buttons()[1].textContent, /Le Café du village/);
    const item = h.element("#economy-options").children[1];
    assert.equal(item.children[2].href, "https://www.openstreetmap.org/node/42");
    assert.match(item.children[1].textContent, language === "fr" ? /non vérifiés/ : /not verified/);
    h.buttons()[1].click();
    assert.deepEqual(h.actions, [{ kind: "meal", id: "basic-meal@node/42" }]);
    h.set({ state: { ...h.current().state, walletCents: 0 } });
    await h.ui.open("eat");
    assert.ok(h.buttons().every(button => button.disabled));
  });

  test(`${language} menu discloses immediate sleep, time cost and tarot probability before requesting`, async t => {
    const h = harness(t, language);
    await h.ui.open("sleep");
    const note = h.element("#economy-options").children[0].children[1].textContent;
    assert.match(note, /30 min/);
    assert.match(note, /8 h/);
    assert.match(note, /UTC/);
    assert.match(note, /tarot/);
    assert.match(note, /%/);
    assert.match(note, language === "fr" ? /immédiatement/ : /immediately/);
    assert.match(note, language === "fr" ? /sans repas/ : /without a meal/);
    h.ui.reset();
  });
}
