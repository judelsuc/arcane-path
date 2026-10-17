import test from "node:test";
import assert from "node:assert/strict";
import { buttonBindings, shortcutCode } from "../button-shortcuts.mjs";

test("fixed shortcuts and dynamic menu options have distinct keys in each dialog", () => {
  const buttons = [{ close: true }, ...["town-refresh", "town-services", "town-music", "town-trail"]
    .map(id => ({ id })), ...Array.from({ length: 25 }, () => ({}))];
  const bindings = buttonBindings(buttons);
  assert.equal(new Set(bindings.map(b => b.key)).size, buttons.length);
  assert.equal(bindings[0].key, "Escape");
  assert.equal(bindings[1].key, "U");
  assert.equal(bindings[5].key, "1");
  assert.deepEqual(buttonBindings(buttons), bindings);
});

test("directions, reveal, rhythm and photo controls retain meaningful bindings", () => {
  for (const [button, expected] of [
    [{ move: "0,-1" }, "ArrowUp"], [{ id: "birth-tarot-draw" }, "D"],
    [{ id: "birth-tarot-continue" }, "Enter"], [{ id: "music-tap" }, "Space"],
    [{ id: "previous-photo" }, "ArrowLeft"], [{ id: "audio-toggle" }, "M"],
    [{ id: "open-options" }, "K"], [{ id: "search-place" }, "G"],
    [{ id: "use-location" }, "V"], [{ id: "back-title" }, "Escape"],
    [{ id: "cancel-place" }, "Z"],
    [{ id: "open-controls" }, "?"],
  ]) assert.equal(buttonBindings([button])[0].key, expected);
  assert.throws(() => buttonBindings(Array.from({ length: 37 }, () => ({}))), /Too many/);
});

test("single keys follow the keyboard layout and retain the legacy Alt+Shift alias", () => {
  const event = { altKey: true, shiftKey: true, code: "KeyS", key: "Í" };
  assert.equal(shortcutCode(event), "S");
  assert.equal(shortcutCode({ ...event, code: "Digit1" }), "1");
  assert.equal(shortcutCode({ ...event, code: "Enter" }), "Enter");
  for (const change of [{ shiftKey: false }, { ctrlKey: true }, { metaKey: true }, { code: "Tab" }]) {
    assert.equal(shortcutCode({ ...event, ...change }), null);
  }
  assert.equal(shortcutCode({ key: "j", code: "KeyJ" }), "J");
  assert.equal(shortcutCode({ key: "a", code: "KeyQ" }), "A");
  assert.equal(shortcutCode({ key: "J", code: "KeyJ", shiftKey: true }), "J");
  assert.equal(shortcutCode({ key: "1", code: "Digit1" }), "1");
  assert.equal(shortcutCode({ key: "ArrowUp", code: "ArrowUp" }), "ArrowUp");
  assert.equal(shortcutCode({ key: "j", code: "KeyJ", ctrlKey: true }), null);
  assert.equal(shortcutCode({ key: "j", code: "KeyJ", isComposing: true }), null);
  assert.equal(shortcutCode({ key: "?", code: "Slash", shiftKey: true }), "?");
  assert.equal(shortcutCode({ key: "?", code: "Comma", shiftKey: true }), "?");
  assert.equal(shortcutCode({ key: "?", code: "Slash", ctrlKey: true }), null);
});

test("cell services and clue forms keep stable, non-conflicting action keys", () => {
  const cellIds = ["cell-buy", "cell-rest", "cell-sleep", "cell-music", "cell-clues",
    "choice-forage", "choice-beg", "choice-steal"];
  const cell = buttonBindings(cellIds.map(id => ({ id })));
  assert.equal(new Set(cell.map(b => b.key)).size, cellIds.length);
  for (const [toolbar, menu] of [["eat-travel", "cell-buy"], ["rest-travel", "cell-rest"],
    ["sleep-travel", "cell-sleep"], ["open-music", "cell-music"], ["open-trail", "cell-clues"]]) {
    assert.equal(buttonBindings([{ id: toolbar }])[0].key, buttonBindings([{ id: menu }])[0].key);
  }
  const clues = ["clue-discuss", "clue-photo", "clue-letter", "clue-search",
    "clue-buy", "clue-guestbook", "clue-ticket", "clue-directions"];
  const original = new Map(buttonBindings(clues.map(id => ({ id }))).map(b => [b.button.id, b.key]));
  assert.equal(new Set(original.values()).size, clues.length);
  for (const id of clues) assert.equal(buttonBindings([{ id }])[0].key, original.get(id));
});
