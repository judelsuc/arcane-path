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
  ]) assert.equal(buttonBindings([button])[0].key, expected);
  assert.throws(() => buttonBindings(Array.from({ length: 37 }, () => ({}))), /Too many/);
});

test("physical codes support Option/Alt layouts and require the complete modifier chord", () => {
  const event = { altKey: true, shiftKey: true, code: "KeyS", key: "Í" };
  assert.equal(shortcutCode(event), "S");
  assert.equal(shortcutCode({ ...event, code: "Digit1" }), "1");
  assert.equal(shortcutCode({ ...event, code: "Enter" }), "Enter");
  for (const change of [{ altKey: false }, { shiftKey: false }, { ctrlKey: true }, { metaKey: true }, { code: "Tab" }]) {
    assert.equal(shortcutCode({ ...event, ...change }), null);
  }
});
