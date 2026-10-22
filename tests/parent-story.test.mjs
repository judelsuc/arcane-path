import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parentStage, parentSighting, validateParentStory } from "../parent-story.mjs";
import { parentClueText } from "../trail-ui.mjs";
import { translate } from "../i18n.mjs";
import { trailClue, clueActions } from "../trail-actions.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { startEconomy } from "../economy.mjs";
import { startSurvival } from "../survival.mjs";
import { trailTarget } from "../trail.mjs";

const root = new URL("../", import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, root)));
const survival = json("public/config.json").survival, economy = json("public/economy.json");
const map = json("public/map.json");
const info = { latitude: 44.54, longitude: 2.3 }, cell = { terrain: "place", countryCodes: ["FR"] };
const startedAt = Date.UTC(2026, 9, 17, 12);
const python = existsSync(new URL(".venv/bin/python", root)) ? ".venv/bin/python" : "python3";
function state(mobile = true, intimate = false) {
  const initial = startEconomy(startSurvival(0, 0, startedAt, "balanced", survival), economy, () => 0);
  const origin = { ...info, col: 14, row: 10 };
  const step = 45000 / 6371008.8 * 180 / Math.PI / Math.cos(info.latitude * Math.PI / 180);
  const stages = Array.from({ length: mobile ? 13 : 10 }, (_, i) => ({
    ...origin, col: -166 - i * 180, longitude: info.longitude - (i + 1) * step,
    name: `Town ${i + 1}`, osmId: `node/${i + 1}`, placeType: "town", legMeters: 45000,
    sourceUrl: "https://overpass-api.de/api/interpreter", retrievedAt: "2026-10-17T12:00:00Z",
    witnessId: `fictional-traveler-${i + 1}`,
  }));
  const trail = { version: 2, origin, stages, parentName: "Camille", index: 0, history: [], completed: false };
  trail.story = JSON.parse(execFileSync(python, ["-c", `
import json,sys
sys.path.insert(0,"scripts")
from parent_story import build_parent_story, story_profile
trail=json.loads(sys.argv[1])
print(json.dumps(build_parent_story(trail, "fixed", sys.argv[2], int(sys.argv[3]),
    {**(story_profile("fixed", sys.argv[2]) if sys.argv[5] == "yes" else {"motive":"family"}),
     "mode":"walk","orientation":"upright","finalState":sys.argv[4]})))
`, JSON.stringify(trail), initial.birthCard, String(startedAt), mobile ? "mobile" : "stationary", intimate ? "yes" : "no"],
  { cwd: root, encoding: "utf8" }));
  return { ...initial, ...stages[0], trail };
}
const save = s => createSave({ region: "firmi", map, state: s, survival, economy }, 1);

test("new Python cartomancer genesis validates and round-trips its independent intimate profile", () => {
  const s = state(false, true);
  assert.equal(s.trail.story.motive, "cartomancer");
  assert.equal(s.trail.story.intimacy.version, 1);
  const restored = validateSave(JSON.parse(JSON.stringify(save(s)))).state;
  assert.deepEqual(restored.trail.story.intimacy, s.trail.story.intimacy);
  for (const corrupt of [{ version: 1, card: "missing" }, { version: 2, card: "fool" }, null]) {
    const invalid = structuredClone(s);
    invalid.trail.story.intimacy = corrupt;
    assert.throws(() => validateParentStory(invalid.trail), /Invalid/);
  }
});

test("witness memories age at seven and thirty days without mutating story facts or rerolling voice", () => {
  const s = state(false), before = structuredClone(s);
  const visit = s.trail.story.visits[0];
  for (const [days, precision] of [[0, "recent"], [6.999, "recent"], [7, "weeks"],
    [29.999, "weeks"], [30, "old"], [200, "old"]]) {
    const at = { ...s, elapsedMinutes: (visit.departure - s.startedAt) / 60_000 + days * 1440 };
    assert.equal(parentSighting(at, 0).precision, precision);
    assert.equal(parentSighting(at, 0).variant, parentSighting(s, 0).variant);
    assert.deepEqual(parentSighting(structuredClone(at), 0), parentSighting(at, 0));
  }
  assert.deepEqual(s, before);
  const variants = new Set(s.trail.stages.map((_, i) => parentSighting(s, i).variant));
  assert.equal(variants.size, 3);
});

test("localized testimony keeps precise leads, hides pending destinations and never invents legacy dates", () => {
  const s = state(false);
  const discovery = { kind: "discuss", step: 0, pending: false, nextName: "Known next town" };
  for (const language of ["fr", "en"]) {
    const t = (key, args) => translate(language, key, args);
    for (const days of [0, 8, 40]) {
      const at = { ...s, elapsedMinutes: (s.trail.story.visits[0].departure - s.startedAt) / 60_000 + days * 1440 };
      const text = parentClueText(at, discovery, t);
      assert.ok(text.includes(discovery.nextName));
      assert.ok(text.includes(t(`parentStory.motive.${s.trail.story.motive}`)));
      assert.ok(text.includes(t(`parentWitness.${parentSighting(at, 0).precision}`)));
      assert.doesNotMatch(text, /parentWitness\.|undefined|\{hint\}/);
      assert.equal(parentClueText(structuredClone(at), discovery, t), text);
    }
    const pending = parentClueText(s, { ...discovery, pending: true, venue: "Known venue" }, t);
    assert.ok(pending.includes("Known venue"));
    assert.ok(!pending.includes(discovery.nextName));
    const legacy = structuredClone(s);
    delete legacy.trail.story;
    assert.equal(parentSighting(legacy, 0).precision, null);
    const legacyText = parentClueText(legacy, discovery, t);
    for (const key of ["recent", "weeks", "old"]) {
      assert.ok(!legacyText.includes(t(`parentWitness.${key}`)));
    }
    assert.ok(!legacyText.includes(t("parentWitness.reason", {
      motive: t(`parentStory.motive.${s.trail.story.motive}`),
    })));
    for (const kind of ["letter", "photo", "buy", "search", "ticket", "guestbook"]) {
      assert.equal(parentClueText(s, { ...discovery, kind }, t),
        t(`clueText.${kind}`, { parent: s.trail.parentName, hint: discovery.nextName }));
    }
    assert.equal(parentClueText(s, { ...discovery, nextName: null }, t),
      t("trailReunion", { parent: s.trail.parentName }));
  }
});

function encounter(s) {
  const target = s.trail.stages[s.trail.index];
  const fresh = { ...s, col: target.col, row: target.row, reserveKcal: survival.reserve_kcal,
    awakeHours: 0, fatigue: 0 };
  const kind = clueActions(fresh).find(k => !["photo", "buy", "rumor"].includes(k));
  return trailClue(fresh, kind, cell, info, survival, economy);
}

test("Python story data validates and exact save resumes without changing its chronology", () => {
  for (const mobile of [false, true]) {
    const s = state(mobile);
    validateParentStory(s.trail);
    assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save(s)))).state, s);
  }
});

test("mobile parent advances on game time and is caught at town ten before the first departure", () => {
  let s = state();
  assert.equal(parentStage(s), 9);
  assert.equal(parentStage({ ...s, elapsedMinutes: 7 * 1440 - 0.01 }), 9);
  assert.equal(parentStage({ ...s, elapsedMinutes: 7 * 1440 }), 10);
  assert.equal(parentStage({ ...s, elapsedMinutes: 99 * 1440 }), 12);
  for (let i = 0; i < 10; i++) {
    s = encounter(s);
    save(s);
  }
  assert.equal(s.ended, "reunion");
  assert.equal(s.trail.index, 10);
  assert.equal(s.trail.history.at(-1).next, null);
  assert.equal(trailTarget(s), null);
});

test("slow pursuit reaches extra real towns and is guaranteed to finish at town thirteen", () => {
  let s = state();
  s = { ...s, elapsedMinutes: 21 * 1440, tarotDay: "2026-11-07", dailyTarotSeenDay: "2026-11-07" };
  for (let i = 0; i < 13; i++) {
    s = encounter(s);
    assert.equal(s.ended, i === 12 ? "reunion" : null);
    save(s);
  }
  assert.equal(s.trail.index, 13);
});

test("optional false leads cost time, record a contact once and do not consume the main clue", () => {
  let s = state(false);
  const branch = s.trail.story.falseLeads[0];
  while (s.trail.index < branch.stage) s = encounter(s);
  const target = s.trail.stages[s.trail.index];
  s = { ...s, col: target.col, row: target.row };
  assert.ok(clueActions(s).includes("rumor"));
  const next = trailClue(s, "rumor", cell, info, survival, economy);
  assert.equal(next.elapsedMinutes - s.elapsedMinutes, 15);
  assert.equal(next.trail.index, s.trail.index);
  assert.equal(next.trail.history.length, s.trail.history.length);
  assert.equal(next.trail.rumors[0].stage, branch.stage);
  assert.ok(!clueActions(next).includes("rumor"));
  assert.deepEqual(validateSave(save(next)).state, next);
  assert.equal(encounter(next).trail.index, next.trail.index + 1);
});

test("corrupt story facts, mobility, ownership and false-lead progress are rejected", () => {
  for (const change of [
    s => { s.trail.story.visits[0].arrival = s.trail.story.visits[0].departure; },
    s => { s.trail.story.movement[0].elapsedMinutes = 1; },
    s => { s.trail.story.visits[0].clues = ["buy"]; },
    s => { s.trail.story.birthCard = "not-a-card"; },
    s => { s.trail.story.generatedAt++; },
    s => { s.trail.rumors = [{ stage: 12, elapsedMinutes: 15 }]; },
  ]) {
    const s = state();
    change(s);
    assert.throws(() => save(s), /parent|Parent/);
  }
});
