import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupTrailDream } from "../trail-dream-ui.mjs";
import { translate } from "../i18n.mjs";
import { trailDreamText, trailDreamVariant } from "../trail-dreams.mjs";
import { LOST_PLAYER_DREAM } from "../live-narrative.mjs";

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
    globalThis.document = { body: {}, documentElement: { lang: language }, querySelector: key => key === "dialog[open]"
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
  assert.match(source, /previous\.trail\.dreams\?\.checks[\s\S]*?trailDreamText\(check, t,/);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="trail-dream-dialog" aria-labelledby="trail-dream-title" aria-describedby="trail-dream-text"/);
});

test("dream introductions always retain canonical direction; only successful dreams rotate variants", () => {
  const checks = [
    { checkMinutes: 2880, outcome: "guidance", direction: "north" },
    { checkMinutes: 3600, outcome: "miss" },
    { checkMinutes: 5760, outcome: "guidance", direction: "southwest" },
  ];
  const state = { trail: { dreams: { checks } } };
  const wording = { en: "A thread returns in your dream.", fr: "Un fil revient dans votre rêve." };
  assert.equal(trailDreamVariant(state, checks[0]), 0);
  assert.equal(trailDreamVariant(state, checks[2]), 1);
  for (const language of ["en", "fr"]) {
    const t = (key, args) => translate(language, key, args);
    assert.equal(trailDreamText(checks[2], t, wording, language),
      `${wording[language]} ${trailDreamText(checks[2], t)}`);
  }
});

for (const language of ["fr", "en"]) {
  test(`${language}: factory wording freezes in an open dream, reports fallback and relocalizes`, async t => {
    class Element {
      events = {}; open = false; textContent = "";
      addEventListener(name, callback) { this.events[name] = callback; }
      setAttribute() {}
      before(node) { this.beforeNode = node; }
      showModal() { this.open = true; }
      close() { this.open = false; }
      focus() {}
    }
    const original = { document: globalThis.document, MutationObserver: globalThis.MutationObserver };
    t.after(() => Object.assign(globalThis, original));
    const nodes = new Map(), el = id => {
      if (!nodes.has(id)) nodes.set(id, new Element());
      return nodes.get(id);
    };
    globalThis.document = { documentElement: { lang: language }, body: {},
      createElement: () => new Element(),
      querySelector: id => id === "dialog[open]" ? [...nodes.values()].find(e => e.open) : el(id) };
    globalThis.MutationObserver = class { observe() {} };
    const current = { state: { trail: { index: 0, dreams: { checks: [] } } }, busy: false };
    const requested = [], snapshots = [];
    let cached = null, subscriber;
    const narrative = {
      prefetch: (_, ids) => requested.push(ids),
      snapshot: (_, id, variant) => { snapshots.push({ id, variant }); return cached; },
      introductionStatus: (_, id, lang, generated) => `${generated ? "GENERATED" : "AUTHORED"} ${lang}`,
      subscribe(fn) { subscriber = fn; },
    };
    const tr = (key, args) => translate(globalThis.document.documentElement.lang, key, args);
    const ui = setupTrailDream(tr, { context: () => current, narrative, openTrail() {} });
    ui.reset(current.state);
    const check = { stage: 0, checkMinutes: 2880, outcome: "guidance", direction: "west" };
    current.state.trail.dreams.checks.push(check);
    ui.update();
    await Promise.resolve();
    const authored = el("#trail-dream-text").textContent;
    assert.equal(authored, trailDreamText(check, tr));
    assert.equal(el("#trail-dream-continue").beforeNode.textContent, `AUTHORED ${language}`);
    cached = { en: "A thread shimmers in your dream.", fr: "Un fil scintille dans votre rêve." };
    subscriber();
    assert.equal(el("#trail-dream-text").textContent, authored);
    el("#trail-dream-continue").events.click();
    const second = { ...check, checkMinutes: 5760, direction: "northeast" };
    current.state.trail.dreams.checks.push(second);
    const before = structuredClone(current.state);
    ui.update();
    await Promise.resolve();
    assert.equal(el("#trail-dream-text").textContent, trailDreamText(second, tr, cached, language));
    assert.equal(el("#trail-dream-continue").beforeNode.textContent, `GENERATED ${language}`);
    const other = language === "fr" ? "en" : "fr";
    globalThis.document.documentElement.lang = other;
    subscriber();
    assert.equal(el("#trail-dream-text").textContent, trailDreamText(second, tr, cached, other));
    assert.deepEqual(snapshots, [{ id: LOST_PLAYER_DREAM, variant: 0 }, { id: LOST_PLAYER_DREAM, variant: 1 }]);
    assert.ok(requested.every(ids => ids.length === 1 && ids[0] === LOST_PLAYER_DREAM));
    assert.deepEqual(current.state, before);
    ui.reset(current.state);
    ui.update();
    await Promise.resolve();
    assert.equal(el("#trail-dream-dialog").open, false);
    current.state.ended = "hunger";
    const calls = requested.length;
    ui.update();
    assert.equal(requested.length, calls);
  });
}
