import test from "node:test";
import assert from "node:assert/strict";
import { trailPageRecords, trailEntryDate } from "../trail-ui.mjs";
import { recordTrailArrival } from "../trail.mjs";
import { translate } from "../i18n.mjs";

test("stage pages merge clues, signs, witness reports and reached destinations newest first", () => {
  const state = { startedAt: Date.UTC(2026, 9, 17, 23, 50), trail: {
    history: [{ elapsedMinutes: 70, next: { name: "Next destination" } }, {}],
    arrivals: [{ stage: 0, elapsedMinutes: 65 }],
    exploration: {
      hints: [{ stage: 0, elapsedMinutes: 10 }, { stage: 0, elapsedMinutes: 40 },
        { stage: 1, elapsedMinutes: 80 }],
      signs: [{ stage: 0, elapsedMinutes: 30 }],
      reports: [{ stage: 0, elapsedMinutes: 50 }],
    },
  } };
  assert.deepEqual(trailPageRecords(state, 0).map(r => r.value.elapsedMinutes), [65, 50, 40, 30, 10]);
  assert.deepEqual(trailPageRecords(state, 1).map(r => r.value.elapsedMinutes), [80, 70, undefined]);
  for (const language of ["fr", "en"]) {
    const t = (key, args) => translate(language, key, args);
    assert.match(trailEntryDate(state, 30, language, t), /18\/10\/2026.*00:20 UTC/);
    assert.equal(trailEntryDate(state, undefined, language, t), t("trailDateUnknown"));
  }
});

test("town evidence belongs to the destination it points to, not the town where it was collected", () => {
  const state = { trail: {
    history: [{ place: "First town", next: { name: "Second town" }, elapsedMinutes: 40 },
      { place: "Second town", next: { name: "Third town" }, elapsedMinutes: 90 }],
    discovery: { step: 2, pending: true, venue: "Cafe", elapsedMinutes: 120 },
    rumors: [{ stage: 0, elapsedMinutes: 70 }],
    arrivals: [{ stage: 1, elapsedMinutes: 80 }],
  } };
  assert.equal(trailPageRecords(state, 0).length, 0);
  assert.deepEqual(trailPageRecords(state, 1).map(r => r.kind), ["arrival", "rumor", "history"]);
  assert.equal(trailPageRecords(state, 1)[2].value.place, "First town");
  assert.equal(trailPageRecords(state, 2)[0].value.place, "Second town");
  assert.equal(trailPageRecords(state, 3)[0].kind, "discovery");
});

test("arrival is recorded once at the reached target without advancing the quest or inventing earlier times", () => {
  const initial = { col: 0, row: 0, elapsedMinutes: 25,
    trail: { version: 2, index: 0, completed: false, stages: [{ col: 4, row: 0 }] } };
  assert.equal(recordTrailArrival(initial), initial);
  const arrived = recordTrailArrival({ ...initial, col: 4 });
  assert.deepEqual(arrived.trail.arrivals, [{ stage: 0, elapsedMinutes: 25 }]);
  assert.equal(arrived.trail.index, 0);
  assert.equal(recordTrailArrival({ ...arrived, elapsedMinutes: 50 }).trail.arrivals[0].elapsedMinutes, 25);
});
