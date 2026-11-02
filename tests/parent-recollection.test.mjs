import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recordParentRecollection, parentRecollectionVisible, parentRecollectionText,
  validateParentRecollection, PARENT_RECOLLECTION_INTERVAL, parentIntuitionText } from "../parent-recollection.mjs";
import { setupParentRecollection, parentRecollectionGuidance } from "../parent-recollection-ui.mjs";
import { citedTownDirections } from "../trail-ui.mjs";
import { beginExploration, openingClueText, clueDirection } from "../trail-search.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { parentIntimacy } from "../parent-intimacy.mjs";
import { translate } from "../i18n.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const survival = json("../public/config.json").survival;
const economy = json("../public/economy.json"), map = json("../public/map.json");
function start() {
  const state = startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 17, 0),
    "balanced", survival), economy, () => 0);
  return { ...state, trail: createTrail(map, 14, 10, () => 0) };
}
const after = (state, minutes) => ({ ...state, elapsedMinutes: state.elapsedMinutes + minutes });

test("periodic recollections work far off the parent's path, without search, sleep or cost", () => {
  const initial = { ...start(), col: 1000, row: -1000 };
  assert.equal(PARENT_RECOLLECTION_INTERVAL, 720);
  assert.equal(recordParentRecollection(after(initial, 719.999)).parentRecollection, undefined);
  const due = after(initial, 720), result = recordParentRecollection(due);
  assert.deepEqual(result, { ...due, parentRecollection: { stage: 0, elapsedMinutes: 720, variant: 0,
    intuition: { col: due.col, row: due.row, direction: clueDirection(due, due.trail.stages[0]) } } });
  assert.equal(parentRecollectionVisible(result), true);
  assert.equal(recordParentRecollection(result), result, "rerender/save cannot reroll");
  assert.equal(recordParentRecollection(after(result, 719)).parentRecollection, result.parentRecollection);
  const next = recordParentRecollection(after(result, 720));
  assert.equal(next.parentRecollection.variant, 1);
  const longAction = recordParentRecollection(after(next, 10000));
  assert.equal(longAction.parentRecollection.variant, 2, "one notice, not a backlog");
  assert.equal(recordParentRecollection(after(longAction, 720)).parentRecollection.variant, 0);
});

test("zero-clue rescue begins at exactly 720 minutes and persists the current-position bearing without rerolls", () => {
  const initial = start();
  const stages = initial.trail.stages.map((town, index) => ({ ...town,
    name: `Hidden town ${index}`, col: 100 + index * 100, row: 0 }));
  const state = beginExploration({ ...initial, col: 1000, row: 1000,
    trail: { ...initial.trail, version: 2, stages, origin: { col: 0, row: 0 } } });
  const due = recordParentRecollection(after(state, 720));
  assert.equal(recordParentRecollection(after(state, 719.999)).parentRecollection, undefined);
  assert.equal(due.parentRecollection.intuition.direction, "northwest");
  assert.notEqual(due.parentRecollection.intuition.direction, clueDirection(state.trail.origin, stages[0]));
  assert.deepEqual(due.trail.exploration.hints, [], "help does not masquerade as witness/search evidence");
  const restored = JSON.parse(JSON.stringify(due));
  validateParentRecollection(restored);
  assert.equal(recordParentRecollection(restored), restored);
  const moved = { ...restored, col: -1000, row: -1000, elapsedMinutes: 721 };
  assert.equal(recordParentRecollection(moved).parentRecollection.intuition.direction, "northwest");
  const later = recordParentRecollection({ ...moved, elapsedMinutes: 1440 });
  assert.equal(later.parentRecollection.intuition.direction, "southeast");
  assert.equal(later.parentRecollection.variant, 1);
  assert.equal(later.parentRecollection.intuition.col, -1000);
  for (const language of ["fr", "en"]) {
    const t = (key, args) => translate(language, key, args);
    const text = parentRecollectionGuidance(due, null, t);
    assert.ok(text.includes(t("hintCompass.northwest")));
    assert.match(text, /intuition/i);
    assert.doesNotMatch(text, /Hidden town|1000|latitude|longitude|node\/|fictional-traveler/);
    assert.equal(parentIntuitionText(moved, t), parentIntuitionText(due, t),
      "saved direction stays anchored to the position where it was earned");
  }
  const changedStage = { ...later, trail: { ...later.trail, index: 1 } };
  assert.equal(parentIntuitionText(changedStage, (key, args) => translate("en", key, args)), "");
  for (const help of [null, { col: 1, row: 1, direction: "south" },
    { col: Infinity, row: 1, direction: "northwest" }, { ...due.parentRecollection.intuition, extra: true }]) {
    assert.throws(() => validateParentRecollection({ ...due,
      parentRecollection: { ...due.parentRecollection, intuition: help } }), /intuition/);
  }
});

test("earned progress restarts the delay, hides stale notices and never revives a finished journey", () => {
  const first = recordParentRecollection(after(start(), 720));
  for (const channel of ["hints", "signs", "reports"]) {
    const updated = { ...first, elapsedMinutes: 730, trail: { ...first.trail,
      exploration: { hints: [], [channel]: [{ stage: 0, elapsedMinutes: 730 }] } } };
    assert.equal(parentRecollectionVisible(updated), false, channel);
    assert.equal(recordParentRecollection(after(updated, 719)).parentRecollection, first.parentRecollection);
    assert.equal(recordParentRecollection(after(updated, 720)).parentRecollection.elapsedMinutes, 1450);
  }
  for (const progress of [
    { arrivals: [{ stage: 0, elapsedMinutes: 730 }] },
    { dreams: { checks: [{ stage: 0, elapsedMinutes: 730, outcome: "guidance" }] } },
    { discovery: { elapsedMinutes: 730 } },
    { index: 1, history: [{ elapsedMinutes: 730 }] },
  ]) {
    const updated = { ...first, elapsedMinutes: 730, trail: { ...first.trail, ...progress } };
    assert.equal(parentRecollectionVisible(updated), false);
    assert.equal(recordParentRecollection(after(updated, 719)).parentRecollection, first.parentRecollection);
  }
  for (const state of [null, { elapsedMinutes: 720 }, { ...first, ended: "health" },
    { ...first, trail: { ...first.trail, completed: true } }]) {
    assert.equal(recordParentRecollection(state), state);
    assert.equal(parentRecollectionVisible(state), false);
  }
});

test("the latest recollection survives exact save/resume, with validation and no replayed cadence", () => {
  const initial = start();
  const state = recordParentRecollection(after({ ...initial, trail: { ...initial.trail,
    stages: initial.trail.stages.map(town => ({ ...town, latitude: undefined, longitude: undefined })) } }, 720));
  const save = createSave({ region: "firmi", map, state, survival, economy }, 1);
  const restored = validateSave(JSON.parse(JSON.stringify(save))).state;
  assert.deepEqual(restored.parentRecollection, state.parentRecollection);
  assert.ok(restored.parentRecollection.intuition, "the earned help is part of the validated save");
  assert.equal(recordParentRecollection(restored), restored);
  for (const change of [{ elapsedMinutes: -1 }, { elapsedMinutes: 721 }, { stage: 10 },
    { stage: 1 }, { variant: 3 }, { variant: 0.5 }, { unexpected: true }]) {
    const invalid = structuredClone(save);
    Object.assign(invalid.state.parentRecollection, change);
    assert.throws(() => validateSave(invalid), /Invalid parent recollection/);
  }
  const legacy = start();
  validateParentRecollection(legacy);
  assert.equal(parentRecollectionVisible(legacy), false);
  const oldNotice = structuredClone(save);
  delete oldNotice.state.parentRecollection.intuition;
  assert.doesNotThrow(() => validateSave(oldNotice), "previous reminder-only receipts remain compatible");
  const corrupted = structuredClone(save);
  corrupted.state.parentRecollection.intuition.direction = "invalid";
  assert.throws(() => validateSave(corrupted), /intuition/);
});

for (const language of ["fr", "en"]) {
  const t = (key, args) => translate(language, key, args);
  test(`${language}: recollection prose uses known biography facts and retains the earned clue verbatim`, () => {
    const state = recordParentRecollection(after(start(), 720));
    state.trail.story = { intimacy: { card: "fool" } };
    const profile = parentIntimacy(state);
    for (const [variant, field] of [[0, "letter"], [1, "memory"], [2, "desire"]]) {
      state.parentRecollection.variant = variant;
      const text = parentRecollectionText(state, t, "EARNED CLUE");
      assert.ok(text.includes(profile[field][language]));
      assert.ok(text.includes("EARNED CLUE"));
      assert.doesNotMatch(text, /undefined|parentRecollection\.|\{[a-z]+\}/);
      assert.doesNotMatch(text, /fictional-traveler|Secret Town/);
    }
    delete state.trail.story;
    assert.ok(parentRecollectionText(state, t, "EARNED CLUE").includes(t("parentRecollection.fallback")));
  });

  test(`${language}: map notice is nonblocking, localized, opens the trail and never invents an off-path witness`, tTest => {
    const original = globalThis.document;
    tTest.after(() => { globalThis.document = original; });
    const nodes = new Map(), node = id => {
      if (!nodes.has(id)) nodes.set(id, { hidden: false, textContent: "",
        addEventListener(name, callback) { this[name] = callback; } });
      return nodes.get(id);
    };
    globalThis.document = { querySelector: node };
    let state = beginExploration({ ...start(), trail: { ...start().trail, version: 2,
      origin: { col: 14, row: 10 } } });
    state = recordParentRecollection({ ...state, col: 1000, row: -1000, elapsedMinutes: 720 });
    const before = structuredClone(state);
    let opened = 0;
    const ui = setupParentRecollection(t, { context: () => state ? { state } : null,
      openTrail: () => { opened++; } });
    ui.update();
    assert.equal(node("#parent-recollection").hidden, false);
    assert.ok(node("#parent-recollection-text").textContent.includes(openingClueText(state, t)));
    assert.ok(node("#parent-recollection-text").textContent.includes(t("parentRecollection.search")));
    assert.equal(node("#parent-recollection-open").textContent, t("parentRecollection.open"));
    node("#parent-recollection-open").click();
    assert.equal(opened, 1);
    assert.deepEqual(state, before);
    state = { ...state, trail: { ...state.trail, index: 1 } };
    ui.update();
    assert.equal(node("#parent-recollection").hidden, true);
    state = null; ui.update();
    assert.equal(node("#parent-recollection").hidden, true);
  });

  test(`${language}: actionable bearings use only earned towns and retain unconfirmed status`, () => {
    const initial = start();
    const state = beginExploration({ ...initial, col: 1000, row: -1000,
      trail: { ...initial.trail, version: 2, origin: { col: 14, row: 10 },
        stages: initial.trail.stages.map((town, index) => ({ ...town,
          name: `Hidden town ${index}`, latitude: 44 + index, longitude: 2 })) } });
    const info = { latitude: 43, longitude: 1 };
    assert.equal(parentRecollectionGuidance(state, info, t), t("parentRecollection.search"));
    state.trail.exploration.hints = [{ stage: 0, kind: "prefix", precision: "vague",
      col: 14, row: 10, elapsedMinutes: 10 }];
    assert.equal(parentRecollectionGuidance(state, info, t), t("parentRecollection.recognize"));
    state.trail.exploration.reports = [{ stage: 0, outcome: "suggestion", elapsedMinutes: 20,
      town: { name: "Earned suggestion", latitude: 45, longitude: 3 } }];
    let guidance = parentRecollectionGuidance(state, info, t);
    assert.ok(guidance.includes(citedTownDirections({
      name: "Earned suggestion", latitude: 45, longitude: 3, status: "suggested" }, info, t)));
    assert.ok(guidance.includes(t("hintTownUnconfirmed")));
    assert.doesNotMatch(guidance, /Hidden town/);
    state.trail.exploration.knownStage = 0;
    const earned = recordParentRecollection({ ...state, elapsedMinutes: 740 });
    assert.equal(earned.parentRecollection.intuition, undefined, "confirmed town guidance takes precedence");
    guidance = parentRecollectionGuidance(state, info, t);
    assert.ok(guidance.includes("Hidden town 0"), "known destination is authorized");
    assert.doesNotMatch(guidance, /Hidden town [1-9]/);
    assert.notEqual(guidance, parentRecollectionGuidance(state, { latitude: 46, longitude: 4 }, t),
      "bearing follows current player position only for earned town coordinates");
    const target = state.trail.stages[0];
    assert.equal(parentRecollectionGuidance({ ...state, col: target.col, row: target.row }, info, t),
      t("parentRecollection.investigate"));
  });
}

test("ordinary saves, persistent quest mutations and localization wire the reminder into the actual game", () => {
  const source = readFileSync(new URL("../travel-ui.mjs", import.meta.url), "utf8");
  assert.match(source, /state = recordParentRecollection\(synchronizeParentDiscovery\(state\)\)/);
  assert.match(source, /const next = recordParentRecollection\(synchronizeParentDiscovery\(transform\(state\)\)\)/);
  assert.match(source, /parentRecollectionUI\.update\(\)/);
  assert.match(source, /setupParentRecollection\(t, \{[\s\S]*?openTrail: \(\) => trailUI\.open\(\)/);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="parent-recollection" hidden/);
  assert.match(html, /id="parent-recollection-text" role="status" aria-atomic="true"/);
});
