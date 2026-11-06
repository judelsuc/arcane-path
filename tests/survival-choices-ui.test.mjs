import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupSurvivalChoices } from "../survival-choices-ui.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { translate } from "../i18n.mjs";
import { beginEquipment } from "../equipment.mjs";
import { companionRecord } from "../companion-presence.mjs";
import { beginPressures } from "../pressures.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const survival = json("../public/config.json").survival;
const economy = json("../public/economy.json");
class Element {
  dataset = {};
  textContent = "";
  disabled = false;
  hidden = false;
  events = {};
  open = false;
  addEventListener(type, handler) { this.events[type] = handler; }
  click() { if (!this.disabled) this.events.click?.(); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() { this.focused = true; }
  scrollIntoView(options) { this.scrolled = options; }
}
function harness(t, language = "en") {
  const previous = globalThis.document, elements = new Map();
  const get = key => {
    if (!elements.has(key)) elements.set(key, new Element());
    return elements.get(key);
  };
  globalThis.document = { getElementById: key => get(`#${key}`),
    querySelector: key => key === "dialog[open]"
      ? [...elements.values()].find(e => e.open) : get(key) };
  t.after(() => { globalThis.document = previous; });
  const current = { state: startEconomy(startSurvival(0, 0, Date.UTC(2026, 9, 17),
    "balanced", survival), economy, () => 0), cell: { terrain: "forest" },
    info: { names: [] }, data: economy, blocked: false };
  let fail = false;
  const ui = setupSurvivalChoices((key, args) => translate(language, key, args), {
    context: () => current,
    act: kind => {
      if (fail) { get("#survival-choice-error").textContent = "Action failed"; return; }
      current.state.lastSurvivalChoice = { kind, outcome: "food",
        foodKcal: kind === "hunt" ? 800 : 450, moneyCents: 0, minutes: 30, detentionMinutes: 0,
        ...(kind === "hunt" ? companionRecord(current.state) : {}) };
    },
  });
  ui.localize();
  get("#open-survival-choices").click();
  return { get, current, ui, fail: () => { fail = true; } };
}
for (const language of ["en", "fr"]) {
  test(`${language} hunting names the ready dog, explains suspended help and disables on unsuitable terrain`, t => {
    const h = harness(t, language);
    h.current.state = beginEquipment(h.current.state);
    h.current.state.equipment.dog = { name: "Étoile", hunger: 15, careNeed: 15 };
    h.ui.localize();
    assert.match(h.get("#choice-hunt-note").textContent, /Étoile/);
    assert.match(h.get("#choice-hunt-note").textContent, /15/);
    h.get("#choice-hunt").click();
    assert.match(h.get("#survival-choice-result").textContent, /Étoile/);
    assert.match(h.get("#survival-choice-result").textContent, /800/);
    assert.equal(h.get("#survival-choice-result").focused, true);
    h.current.state.equipment.dog.hunger = 65;
    h.ui.localize();
    assert.match(h.get("#choice-hunt-note").textContent, /65/);
    h.get("#choice-hunt").click();
    assert.match(h.get("#survival-choice-result").textContent, /65/);
    h.current.cell = { terrain: "place" };
    h.ui.localize();
    assert.equal(h.get("#choice-hunt").disabled, true);
    h.current.cell = { terrain: "forest" };
    h.current.blocked = true;
    h.ui.localize();
    assert.equal(h.get("#choice-hunt").disabled, true);
  });
  test(`${language} begging preview explains the current hygiene penalty and compassion bonus`, t => {
    const h = harness(t, language);
    h.current.state = beginPressures(h.current.state, economy);
    h.current.state.pressures.cleanliness = 0;
    h.ui.localize();
    assert.match(h.get("#choice-beg-note").textContent, /24\.0/);
    assert.match(h.get("#choice-beg-note").textContent, /12\.0/);
    h.current.state.lastSurvivalChoice = { kind: "beg", outcome: "money",
      foodKcal: 0, moneyCents: 100, minutes: 30, detentionMinutes: 0, hygieneBonus: 0.12 };
    h.ui.localize();
    assert.match(h.get("#survival-choice-result").textContent, /12\.0/);
    h.current.state.pressures.cleanliness = 100;
    h.ui.localize();
    assert.doesNotMatch(h.get("#choice-beg-note").textContent, /24\.0|12\.0/);
    assert.match(h.get("#survival-choice-result").textContent, /12\.0/);
  });
  test(`${language} food search focuses and scrolls the visible result, not the bottom save status`, t => {
    const h = harness(t, language);
    assert.equal(h.get("#survival-choice-result").hidden, true);
    h.get("#choice-forage").click();
    const result = h.get("#survival-choice-result");
    assert.equal(result.hidden, false);
    assert.equal(result.dataset.feedback, "success");
    assert.match(result.textContent, /450/);
    assert.equal(result.focused, true);
    assert.deepEqual(result.scrolled, { block: "nearest" });
    assert.equal(h.get("#survival-choice-save").scrolled, undefined);
  });
}
test("action errors are revealed and focused rather than hiding behind an older successful result", t => {
  const h = harness(t);
  h.get("#choice-forage").click();
  h.fail();
  h.get("#choice-forage").click();
  const error = h.get("#survival-choice-error");
  assert.equal(error.hidden, false);
  assert.equal(error.focused, true);
  assert.deepEqual(error.scrolled, { block: "nearest" });
  h.ui.reset();
  h.get("#open-survival-choices").click();
  assert.equal(error.textContent, "");
  assert.equal(error.hidden, true);
});
test("result and error are placed before the first action in the actual accessible modal", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(html.indexOf('id="survival-choice-result"') < html.indexOf('id="cell-buy"'));
  assert.ok(html.indexOf('id="survival-choice-error"') < html.indexOf('id="choice-forage"'));
  assert.match(html, /id="survival-choice-result" role="status" tabindex="-1" hidden/);
});

test("full-word cell actions forward to existing controls only after closing, respecting availability", t => {
  const h = harness(t);
  const source = h.get("#open-journey-world");
  let calls = 0;
  source.events.click = () => {
    assert.equal(h.get("#survival-choices-dialog").open, false);
    calls++;
  };
  source.disabled = true;
  h.ui.localize();
  assert.equal(h.get("#cell-transport").disabled, true);
  h.get("#cell-transport").click();
  assert.equal(calls, 0);
  source.disabled = false;
  h.ui.localize();
  h.get("#cell-transport").click();
  assert.equal(calls, 1);
  h.get("#open-survival-choices").click();
  h.current.blocked = true;
  h.get("#cell-transport").click();
  assert.equal(calls, 1);
  h.current.blocked = false;
  h.get("#dog-travel").hidden = true;
  h.ui.localize();
  assert.equal(h.get("#cell-dog").hidden, true);
  for (const [id, target] of [["cell-town", "open-town"], ["cell-equipment", "equipment-travel"],
    ["cell-journal", "open-journal"],
    ["cell-inscriptions", "open-inscriptions"],
    ["cell-photo", "show-photo"], ["cell-save", "save-travel"]]) {
    let invoked = false;
    h.get(`#${target}`).events.click = () => { invoked = true; };
    h.ui.localize();
    h.get(`#${id}`).click();
    assert.equal(invoked, true, target);
  }
});
