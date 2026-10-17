import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupSurvivalChoices } from "../survival-choices-ui.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { translate } from "../i18n.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const survival = json("../public/config.json").survival;
const economy = json("../public/economy.json");
class Element {
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
        foodKcal: 450, moneyCents: 0, minutes: 30, detentionMinutes: 0 };
    },
  });
  ui.localize();
  get("#open-survival-choices").click();
  return { get, current, ui, fail: () => { fail = true; } };
}
for (const language of ["en", "fr"]) {
  test(`${language} food search focuses and scrolls the visible result, not the bottom save status`, t => {
    const h = harness(t, language);
    assert.equal(h.get("#survival-choice-result").hidden, true);
    h.get("#choice-forage").click();
    const result = h.get("#survival-choice-result");
    assert.equal(result.hidden, false);
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
