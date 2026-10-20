import test from "node:test";
import assert from "node:assert/strict";
import { shortcutHelpRows, setupShortcutHelp } from "../shortcut-help.mjs";
import { translate } from "../i18n.mjs";

test("shortcut help uses actual bindings and localized usage, including rest versus sleep", () => {
  for (const locale of ["fr", "en"]) {
    const rows = shortcutHelpRows((key, args) => translate(locale, key, args));
    assert.equal(rows.length, 24);
    assert.equal(new Set(rows.map(row => row.key)).size, rows.length);
    assert.match(rows[0].usage, /250 m/);
    assert.equal(rows.find(row => row.key === "R").usage, translate(locale, "controls.rest"));
    assert.equal(rows.find(row => row.key === "H").usage, translate(locale, "controls.sleep"));
    assert.equal(rows.find(row => row.key === "?").usage, translate(locale, "controls.help"));
    assert.equal(rows.find(row => row.key === "A").usage, translate(locale, "controls.journal"));
    assert.equal(rows.find(row => row.key === "9").usage, translate(locale, "controls.notebooks"));
    assert.equal(rows.find(row => row.key === "6").usage, translate(locale, "controls.transport"));
    assert.equal(rows.find(row => row.key === "G").usage, translate(locale, "controls.conversation"));
    assert.ok(rows.every(row => row.usage && !row.usage.startsWith("controls.")));
  }
});

test("help welcomes once per page, can be reopened, and never stacks over another modal", t => {
  const original = globalThis.document;
  t.after(() => { globalThis.document = original; });
  let otherDialog = false, opens = 0, click;
  const list = { children: [], replaceChildren() { this.children = []; },
    append(row) { this.children.push(row); } };
  const dialog = { open: false, showModal() { this.open = true; opens++; } };
  globalThis.document = {
    querySelector(selector) {
      if (selector === "#controls-dialog") return dialog;
      if (selector === "#controls-list") return list;
      if (selector === "dialog[open]") return otherDialog || dialog.open ? {} : null;
      return { addEventListener(type, listener) { click = listener; } };
    },
    createElement() { return { children: [], append(...children) { this.children.push(...children); } }; },
  };
  let locale = "en";
  const help = setupShortcutHelp((key, args) => translate(locale, key, args));
  otherDialog = true;
  help.welcome();
  assert.equal(opens, 0);
  otherDialog = false;
  help.welcome();
  assert.equal(opens, 1);
  assert.equal(list.children.length, 24);
  dialog.open = false;
  help.welcome();
  assert.equal(opens, 1);
  click();
  assert.equal(opens, 2);
  const before = list.children[0].children[1].textContent;
  locale = "fr";
  help.localize();
  assert.notEqual(list.children[0].children[1].textContent, before);
  assert.equal(list.children.length, 24);
});
