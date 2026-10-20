import test from "node:test";
import assert from "node:assert/strict";
import { recordJourneyVisit, validateJourneyVisits, closingJourneyVisits } from "../journey-visits.mjs";
import { closingSummary, closingStoryText } from "../closing-story.mjs";
import { translate } from "../i18n.mjs";

test("named mapped visits are immutable, deduplicated, bounded and save validated", () => {
  const original = { elapsedMinutes: 30 };
  const cell = { settlements: [{ name: " Arles " }, { name: "" }, {}] };
  const next = recordJourneyVisit(original, cell);
  assert.deepEqual(next.journeyVisits, [{ name: "Arles", elapsedMinutes: 30 }]);
  assert.equal(original.journeyVisits, undefined);
  assert.equal(recordJourneyVisit(next, cell), next);
  assert.equal(recordJourneyVisit(next, undefined), next);
  assert.equal(recordJourneyVisit({ ...next, ended: "placement" }, cell).journeyVisits, next.journeyVisits);
  validateJourneyVisits(next);
  validateJourneyVisits(original);
  for (const journeyVisits of [null, [{}], [{ name: "Arles", elapsedMinutes: 31 }],
    [{ name: "Arles", elapsedMinutes: -1 }], [...next.journeyVisits, ...next.journeyVisits]]) {
    assert.throws(() => validateJourneyVisits({ ...next, journeyVisits }), /Invalid saved/);
  }
  const full = { elapsedMinutes: 30,
    journeyVisits: Array.from({ length: 128 }, (_, i) => ({ name: `Town ${i}`, elapsedMinutes: 0 })) };
  assert.equal(recordJourneyVisit(full, cell), full);
  validateJourneyVisits(full);
});

test("older saves recover origin and settlement hospitality, never suggestions or worship names as visited towns", () => {
  const state = { elapsedMinutes: 100, trail: { origin: { name: "Marseille" },
    exploration: { reports: [{ town: { name: "Unvisited lead" }, elapsedMinutes: 20 }] } },
    hospitalityAttempts: [
      { townName: "Arles", startedMinutes: 40 },
      { townName: "Notre-Dame", placeKind: "worship", startedMinutes: 60 },
      { townName: "Marseille", startedMinutes: 0 },
    ] };
  assert.deepEqual(closingJourneyVisits(state), [
    { name: "Marseille", elapsedMinutes: 0 }, { name: "Arles", elapsedMinutes: 40 },
  ]);
});

test("placement includes named adopted dog and recorded places without copying event rules", () => {
  const state = { ended: "placement", elapsedMinutes: 100, distanceMeters: 1000, ascentMeters: 0,
    meals: 1, sleeps: 0, equipment: { dog: { name: "Milou" } },
    journeyVisits: [{ name: "Arles", elapsedMinutes: 40 }],
    events: { history: [{ kind: "dogEncounter", elapsedMinutes: 30 }] } };
  assert.deepEqual(closingSummary(state).companion, { name: "Milou" });
  for (const language of ["fr", "en"]) {
    const t = (key, args) => translate(language, key, args);
    const fallback = closingStoryText(state, t, null, language);
    assert.ok(fallback.includes("Milou"));
    assert.ok(fallback.includes("Arles"));
    assert.ok(!fallback.includes(t("journeyEvent.dogEncounter")));
  }
  delete state.equipment;
  assert.equal(closingSummary(state).companion, undefined, "an encounter is not adoption");
  state.equipment = { dog: null };
  assert.equal(closingSummary(state).companion, undefined);
  for (const language of ["fr", "en"]) {
    const t = (key, args) => translate(language, key, args);
    assert.ok(!closingStoryText(state, t, null, language).includes(t("closingStoryCompanionUnnamed")));
  }
  state.equipment.dog = { hunger: 10 };
  assert.deepEqual(closingSummary(state).companion, { name: null });
  for (const language of ["fr", "en"]) {
    const t = (key, args) => translate(language, key, args);
    assert.ok(closingStoryText(state, t, null, language).includes(t("closingStoryCompanionUnnamed")));
    assert.ok(!closingStoryText(state, t, null, language).includes("Milou"));
  }
});
