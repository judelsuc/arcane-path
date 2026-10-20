import test from "node:test";
import assert from "node:assert/strict";
import { setupSaveFeedback } from "../save-feedback.mjs";
import { translate } from "../i18n.mjs";

function harness(t, language = "en") {
  const previous = globalThis.document;
  const status = { hidden: true, dataset: {}, children: [],
    setAttribute(name, value) { this[name] = value; },
    replaceChildren(...children) { this.children = children; } };
  const button = { addEventListener(type, handler) { this[type] = handler; } };
  globalThis.document = { documentElement: { lang: language },
    createElement: () => ({ textContent: "" }),
    querySelector: selector => selector === "#save-feedback" ? status : button };
  t.after(() => { globalThis.document = previous; });
  let enabled = true, result = { savedAt: "2026-10-17T15:00:01Z" }, calls = 0;
  const ui = setupSaveFeedback((key, args) => translate(language, key, args), {
    available: () => enabled, save: () => { calls++; return result; },
  });
  return { status, button, ui, calls: () => calls,
    setResult: value => { result = value; }, disable: () => { enabled = false; } };
}
for (const language of ["fr", "en"]) {
  test(`${language} manual save confirms only a successful write and reannounces repeated saves`, t => {
    const h = harness(t, language);
    h.button.click();
    assert.equal(h.calls(), 1);
    assert.equal(h.status.hidden, false);
    assert.equal(h.status.role, "status");
    assert.equal(h.status.dataset.state, "saved");
    assert.equal(h.status.dataset.feedback, "success");
    assert.match(h.status.children[0].textContent, language === "fr" ? /Carnet gardé/ : /Notebook kept/);
    assert.doesNotMatch(h.status.children[0].textContent, /navigateur|browser|server/);
    const first = h.status.children[0];
    h.button.click();
    assert.notEqual(h.status.children[0], first);
    h.ui.reset();
    assert.equal(h.status.hidden, true);
    assert.equal(h.status.children.length, 0);
  });
}
test("storage errors are alerts, never success confirmations; unavailable actions do not write", t => {
  const h = harness(t);
  h.setResult({ error: "Quota exceeded" });
  h.button.click();
  assert.equal(h.status.role, "alert");
  assert.equal(h.status.dataset.state, "error");
  assert.equal(h.status.dataset.feedback, "failure");
  assert.match(h.status.children[0].textContent, /could not be kept/);
  assert.doesNotMatch(h.status.children[0].textContent, /Quota/);
  assert.equal(h.status.children[1].className, "technical-text");
  assert.equal(h.status.children[1].textContent, "Quota exceeded");
  assert.doesNotMatch(h.status.children[0].textContent, /Notebook kept/);
  h.disable();
  h.button.click();
  assert.equal(h.calls(), 1);
});
