import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recordParentRecollection, parentRecollectionVisible, parentRecollectionText,
  validateParentRecollection, PARENT_RECOLLECTION_INTERVAL,
  PARENT_RECOLLECTION_FIRST_DELAY, parentIntuitionText } from "../parent-recollection.mjs";
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
  assert.equal(PARENT_RECOLLECTION_FIRST_DELAY, 60);
  assert.equal(PARENT_RECOLLECTION_INTERVAL, 180);
  assert.equal(recordParentRecollection(after(initial, 59.999)).parentRecollection, undefined);
  const due = after(initial, 60), result = recordParentRecollection(due);
  assert.deepEqual(result, { ...due, parentRecollection: { stage: 0, elapsedMinutes: 60, variant: 0,
    intuition: { col: due.col, row: due.row, direction: clueDirection(due, due.trail.stages[0]) } } });
  assert.equal(parentRecollectionVisible(result), true);
  assert.equal(recordParentRecollection(result), result, "rerender/save cannot reroll");
  assert.equal(recordParentRecollection(after(result, 179.999)).parentRecollection, result.parentRecollection);
  const next = recordParentRecollection(after(result, 180));
  assert.equal(next.parentRecollection.variant, 1);
  const longAction = recordParentRecollection(after(next, 10000));
  assert.equal(longAction.parentRecollection.variant, 2, "one notice, not a backlog");
  assert.equal(recordParentRecollection(after(longAction, 180)).parentRecollection.variant, 0);
});

test("zero-clue rescue begins at exactly 60 minutes and persists the current-position bearing without rerolls", () => {
  const initial = start();
  const stages = initial.trail.stages.map((town, index) => ({ ...town,
    name: `Hidden town ${index}`, col: 100 + index * 100, row: 0 }));
  const state = beginExploration({ ...initial, col: 1000, row: 1000,
    trail: { ...initial.trail, version: 2, stages, origin: { col: 0, row: 0 } } });
  const due = recordParentRecollection(after(state, 60));
  assert.equal(recordParentRecollection(after(state, 59.999)).parentRecollection, undefined);
  assert.equal(due.parentRecollection.intuition.direction, "northwest");
  assert.notEqual(due.parentRecollection.intuition.direction, clueDirection(state.trail.origin, stages[0]));
  assert.deepEqual(due.trail.exploration.hints, [], "help does not masquerade as witness/search evidence");
  const restored = JSON.parse(JSON.stringify(due));
  validateParentRecollection(restored);
  assert.equal(recordParentRecollection(restored), restored);
  const moved = { ...restored, col: -1000, row: -1000, elapsedMinutes: 61 };
  assert.equal(recordParentRecollection(moved).parentRecollection.intuition.direction, "northwest");
  const later = recordParentRecollection({ ...moved, elapsedMinutes: 240 });
  assert.equal(later.parentRecollection.intuition.direction, "southeast");
  assert.equal(later.parentRecollection.variant, 1);
  assert.equal(later.parentRecollection.intuition.col, -1000);
  for (const language of ["fr", "en"]) {
    const t = (key, args) => translate(language, key, args);
    const text = parentRecollectionGuidance(due, null, t);
    assert.ok(text.includes(t("hintCompass.northwest")));
    assert.match(text, /intuition|hunch/i);
    assert.doesNotMatch(text, /Hidden town|1000|latitude|longitude|node\/|fictional-traveler/);
    assert.doesNotMatch(text, /not a witness|pas un témoignage|not a new witness|nouveau témoignage/i);
    const movedText = parentIntuitionText(moved, t);
    assert.ok(movedText.includes(t("hintCompass.northwest")));
    assert.match(movedText, /from where this feeling|depuis l'endroit/);
    assert.doesNotMatch(movedText, /from here|depuis cet endroit/);
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
    assert.equal(recordParentRecollection(after(updated, 179.999)).parentRecollection, first.parentRecollection);
    assert.equal(recordParentRecollection(after(updated, 180)).parentRecollection.elapsedMinutes, 910);
  }
  for (const progress of [
    { arrivals: [{ stage: 0, elapsedMinutes: 730 }] },
    { dreams: { checks: [{ stage: 0, elapsedMinutes: 730, outcome: "guidance" }] } },
    { discovery: { elapsedMinutes: 730 } },
    { index: 1, history: [{ elapsedMinutes: 730 }] },
  ]) {
    const updated = { ...first, elapsedMinutes: 730, trail: { ...first.trail, ...progress } };
    assert.equal(parentRecollectionVisible(updated), false);
    assert.equal(recordParentRecollection(after(updated, 179.999)).parentRecollection, first.parentRecollection);
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

test("one-hour help validates through saves and old twelve-hour receipts adopt the three-hour cadence", () => {
  const initial = start();
  const state = { ...initial, trail: { ...initial.trail,
    stages: initial.trail.stages.map(town => ({ ...town, latitude: undefined, longitude: undefined })) } };
  const early = recordParentRecollection(after(state, 60));
  const restored = validateSave(JSON.parse(JSON.stringify(
    createSave({ region: "firmi", map, state: early, survival, economy }, 1)))).state;
  assert.equal(restored.parentRecollection.elapsedMinutes, 60);
  const notYet = after(restored, 179.999);
  assert.equal(recordParentRecollection(notYet), notYet);
  assert.equal(recordParentRecollection(after(restored, 180)).parentRecollection.elapsedMinutes, 240);
  const old = recordParentRecollection(after(state, 720));
  const saved = validateSave(JSON.parse(JSON.stringify(
    createSave({ region: "firmi", map, state: old, survival, economy }, 1)))).state;
  assert.equal(recordParentRecollection(after(saved, 179.999)).parentRecollection.elapsedMinutes, 720);
  assert.equal(recordParentRecollection(after(saved, 180)).parentRecollection.elapsedMinutes, 900);
  assert.throws(() => validateParentRecollection({ ...restored,
    parentRecollection: { ...restored.parentRecollection, elapsedMinutes: 59.999 } }), /recollection/);
  const progress = { ...state, elapsedMinutes: 30,
    trail: { ...state.trail, arrivals: [{ stage: 0, elapsedMinutes: 30 }] } };
  assert.equal(recordParentRecollection(after(progress, 59.999)).parentRecollection, undefined);
  assert.equal(recordParentRecollection(after(progress, 60)).parentRecollection.elapsedMinutes, 90);
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

  test(`${language}: journal reminder is nonblocking, localized, opens the trail and never invents an off-path witness`, tTest => {
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
    const journal = node("#photo-journal-dialog");
    journal.open = true;
    journal.close = () => { journal.open = false; };
    let opened = 0;
    const ui = setupParentRecollection(t, { context: () => state ? { state } : null,
      openTrail: () => { assert.equal(journal.open, false); opened++; } });
    ui.update();
    assert.equal(node("#parent-recollection").hidden, false);
    assert.ok(node("#parent-recollection-text").textContent.includes(openingClueText(state, t)));
    assert.ok(node("#parent-recollection-guidance").textContent.includes(t("parentRecollection.search")));
    assert.equal(node("#parent-recollection-title").textContent,
      t("parentRecollection.title", { parent: state.trail.parentName }));
    assert.equal(node("#parent-recollection-open").textContent, t("parentRecollection.open"));
    node("#parent-recollection-open").click();
    assert.equal(opened, 1);
    assert.equal(journal.open, false);
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
});

test("parent reminder is in the journal rather than above the map", () => {
  const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const journal = source.indexOf('<dialog id="photo-journal-dialog"');
  const journalEnd = source.indexOf("</dialog>", journal);
  const reminder = source.indexOf('id="parent-recollection"');
  const map = source.indexOf('<div class="map-comparison">');
  assert.ok(map >= 0 && journal > map && reminder > journal && reminder < journalEnd);
  assert.match(source, /id="parent-recollection" aria-labelledby="parent-recollection-title" hidden/);
  assert.match(source, /id="parent-recollection-guidance" role="status" aria-atomic="true"/);
});
