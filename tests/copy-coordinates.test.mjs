import test from "node:test";
import assert from "node:assert/strict";
import { coordinateText, setupCopyCoordinates } from "../copy-coordinates.mjs";

test("copyable cell centers retain six decimal places, including negative coordinates", () => {
  assert.equal(coordinateText({ latitude: 45.18234567, longitude: 5.61612345 }), "45.182346, 5.616123");
  assert.equal(coordinateText({ latitude: -17.5, longitude: -149.5 }), "-17.500000, -149.500000");
  for (const info of [null, {}, { latitude: NaN, longitude: 5 }, { latitude: 91, longitude: 5 }]) {
    assert.throws(() => coordinateText(info));
  }
});

test("copy button follows selection and reports success or clipboard failure explicitly", async t => {
  const original = globalThis.document;
  t.after(() => { globalThis.document = original; });
  let click, selected = null, copied;
  const button = { addEventListener(name, listener) { click = listener; } }, status = { textContent: "" };
  globalThis.document = { querySelector: id => id === "#copy-coordinates" ? button : status };
  const control = setupCopyCoordinates((key, args) => `${key}:${JSON.stringify(args)}`,
    () => selected, { async writeText(text) { copied = text; } });
  control.update();
  assert.equal(button.disabled, true);
  selected = { latitude: 45.18, longitude: 5.61 };
  control.update();
  assert.equal(button.disabled, false);
  await click();
  assert.equal(copied, "45.180000, 5.610000");
  assert.match(status.textContent, /coordinatesCopied/);
  selected = null;
  control.update();
  assert.equal(status.textContent, "");
  setupCopyCoordinates((key, args) => `${key}:${JSON.stringify(args)}`, () => ({ latitude: 1, longitude: 2 }), {});
  const report = console.error;
  console.error = () => {};
  try { await click(); } finally { console.error = report; }
  assert.match(status.textContent, /coordinatesCopyError/);
});
