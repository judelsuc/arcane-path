import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupTrailDream } from "../trail-dream-ui.mjs";
import { translate } from "../i18n.mjs";

for (const language of ["fr", "en"]) {
  test(`${language}: dreams wait for other dialogs, preserve gameplay, persist in the journal and do not replay`, async t => {
    const original = { document: globalThis.document, MutationObserver: globalThis.MutationObserver };
    t.after(() => Object.assign(globalThis, original));
    class Element {
      events = {}; open = false; shows = 0;
      addEventListener(name, fn) { this.events[name] = fn; }
      showModal() { this.open = true; this.shows++; }
      close() { this.open = false; }
      focus() { this.focused = true; }
    }
    const elements = new Map();
    const element = key => {
      if (!elements.has(key)) elements.set(key, new Element());
      return elements.get(key);
    };
    let observer, busy = false, otherDialog = false, opened = 0;
    globalThis.document = { body: {}, querySelector: key => key === "dialog[open]"
      ? otherDialog || element("#trail-dream-dialog").open : element(key) };
    globalThis.MutationObserver = class { constructor(fn) { observer = fn; } observe() {} };
    let state = { ended: null, trail: { index: 0, dreams: { version: 1, checks: [] } } };
    const ui = setupTrailDream((key, args) => translate(language, key, args), {
      context: () => ({ state, busy }), openTrail: () => { opened++; },
    });
    state.trail.dreams.checks.push({ stage: 0, outcome: "miss", checkMinutes: 60 });
    ui.update(); await Promise.resolve();
    const dialog = element("#trail-dream-dialog");
    assert.equal(dialog.open, false);
    state.trail.dreams.checks.push({ stage: 0, outcome: "guidance", direction: "west", checkMinutes: 780 });
    const before = structuredClone(state);
    busy = true; ui.update(); await Promise.resolve();
    assert.equal(dialog.open, false);
    busy = false; otherDialog = true; ui.update(); await Promise.resolve();
    assert.equal(dialog.open, false);
    otherDialog = false; observer(); await Promise.resolve();
    assert.equal(dialog.open, true);
    assert.equal(element("#trail-dream-title").textContent, translate(language, "trailDreamTitle"));
    assert.ok(element("#trail-dream-text").textContent.includes(translate(language, "hintCompass.west")));
    assert.equal(element("#trail-dream-journal").focused, true);
    assert.deepEqual(state, before);
    element("#trail-dream-journal").events.click();
    assert.equal(opened, 1);
    ui.update(); await Promise.resolve();
    assert.equal(dialog.shows, 1);
    ui.reset(state); ui.update(); await Promise.resolve();
    assert.equal(dialog.shows, 1, "historical dreams remain in journal without reopening on resume");
    state.trail.dreams.checks.push({ stage: 0, outcome: "guidance", direction: "east", checkMinutes: 1500 });
    ui.update(); await Promise.resolve();
    assert.equal(dialog.shows, 2);
    element("#trail-dream-continue").events.click();
    assert.equal(element("#ascii-map").focused, true);
    otherDialog = true;
    state.trail.dreams.checks.push({ stage: 0, outcome: "guidance", direction: "east", checkMinutes: 2220 });
    ui.update(); await Promise.resolve();
    state.trail.index = 1; otherDialog = false;
    observer(); await Promise.resolve();
    assert.equal(dialog.shows, 2, "old-stage guidance must not interrupt a later stage");
    ui.reset(); ui.update(); ui.reset();
    await Promise.resolve();
    assert.equal(dialog.open, false);
  });
}

test("actual journey wires dreams only to completed economy sleeps and preserves notice priority/resume", () => {
  const source = readFileSync(new URL("../travel-ui.mjs", import.meta.url), "utf8");
  assert.match(source, /if \(action.kind !== "meal"\)[\s\S]*?settleTrailDream\(previous, next,[\s\S]*?state = next;\s*autosave\(\)/);
  assert.match(source, /startedMinutes: previous.elapsedMinutes \+ \(hosted \? HOSPITALITY_RULES.minutes : 0\)/);
  assert.ok(source.indexOf("trailDreamUI.update()") > source.indexOf("needsNotices.update()"));
  assert.ok(source.indexOf("trailDreamUI.update()") > source.indexOf("journeyEventsUI.update()"));
  assert.match(source, /trailDreamUI\.reset\(restored \? state : undefined\)/);
  assert.match(source, /trailDreamUI\.reset\(\)/);
  assert.match(source, /previous\.trail\.dreams\?\.checks[\s\S]*?trailDreamText\(check, t\)/);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="trail-dream-dialog" aria-labelledby="trail-dream-title" aria-describedby="trail-dream-text"/);
});
