import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EVENT_CATALOGUE } from "../journey-events.mjs";
import { journeyEventArt } from "../journey-event-art.mjs";

test("all 29 event kinds have distinct bounded ASCII illustrations, including the dog encounter", () => {
  const illustrations = Object.keys(EVENT_CATALOGUE).map(journeyEventArt);
  assert.equal(illustrations.length, 29);
  assert.equal(new Set(illustrations).size, 29);
  for (const art of illustrations) {
    assert.match(art, /^[\x20-\x7e\n]+$/);
    assert.ok(art.split("\n").length >= 4);
    assert.ok(art.split("\n").every(line => line.length <= 32));
  }
  for (const unknown of ["unknown", "__proto__", "toString", null]) {
    assert.throws(() => journeyEventArt(unknown), /illustration/);
  }
});

test("event popup presents decorative whitespace-preserving art beside accessible event text", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const dialog = /<dialog id="journey-event-dialog"[\s\S]*?<\/dialog>/.exec(html)[0];
  assert.match(dialog, /aria-describedby="journey-event-text"/);
  assert.match(dialog, /<pre id="journey-event-art" aria-hidden="true"><\/pre>/);
  assert.match(dialog, /journeyEventIllustration/);
  assert.match(css, /#journey-event-art\s*\{[^}]*overflow-x: auto;[^}]*white-space: pre;/);
});
