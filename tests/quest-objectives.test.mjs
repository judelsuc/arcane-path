import test from "node:test";
import assert from "node:assert/strict";
import { followQuest, followedQuest, questObjectives, objectiveCell, validateQuestTracking } from "../quest-objectives.mjs";
import { learnDiscovery } from "../discovery.mjs";

const point = { name: "Known POI", town: "Known town", col: 2, row: 3, latitude: 45, longitude: 3 };
function state() {
  return { elapsedMinutes: 20, trail: { index: 0, parentName: "Parent", stages: [point], history: [],
    exploration: { knownStage: null, hints: [], reports: [] } },
  serviceQuests: { tracked: null, quests: [{ id: "a".repeat(32), status: "active", step: 0, destinations: [point, { ...point, name: "Later" }] }] },
  sidequests: [{ id: "b".repeat(32), parent: "Journal parent", step: 0, delivered: false, stages: [point] }] };
}
function artifact(state, precision = "town") {
  return learnDiscovery(state, [{ targetType: "artifact", targetId: "hermit", targetRevision: "1",
    evidenceKey: "location", kind: "location", precision,
    facts: precision === "local" ? { place: "Known town", col: 8, row: 10 } : { place: "Known town" },
    source: "artifact-rumour", observedMinutes: 1, channels: ["npc"], availability: "current", contentVersion: "template-v1" }]);
}
test("one tracked objective covers all four quest families without revealing hidden parent or artifact cells", () => {
  let current = artifact(state());
  assert.equal(questObjectives(current).length, 4);
  current = followQuest(current, "parent");
  assert.equal(followedQuest(current).target, null);
  current = followQuest(current, "artifact:hermit");
  assert.equal(followedQuest(current).target, null);
  assert.equal(followedQuest(current).destination, "Known town");
  for (const id of [`service:${"a".repeat(32)}`, `journal:${"b".repeat(32)}`]) {
    current = followQuest(current, id);
    assert.equal(followedQuest(current).target, point);
    validateQuestTracking(current);
  }
  assert.equal(followedQuest(followQuest(current, null)), null);
});
test("tracking resolves current progress dynamically and clears completed or unavailable objectives", () => {
  let current = followQuest(state(), `service:${"a".repeat(32)}`);
  current.serviceQuests.quests[0].step = 1;
  assert.equal(followedQuest(current).name, "Later");
  current.serviceQuests.quests[0].status = "completed";
  assert.equal(followedQuest(current), null);
  assert.throws(() => followQuest(current, `service:${"a".repeat(32)}`), /no longer active/);
  current = followQuest(artifact(state(), "local"), "artifact:hermit");
  assert.deepEqual(objectiveCell(followedQuest(current).target, {}), { col: 8, row: 10 });
  current.discovery.entries[0].availability = "historical";
  assert.equal(followedQuest(current), null);
});
test("map projection supports distant and negative grid coordinates without inventing a path", () => {
  const map = { cellSizeMeters: 250, bounds: { minLongitude: 2, maxLatitude: 46, minLatitude: 44 } };
  assert.deepEqual(objectiveCell(null, map), null);
  assert.equal(objectiveCell({ latitude: 47, longitude: 1 }, map).col < 0, true);
  assert.throws(() => validateQuestTracking({ questTracking: { target: "secret" } }), /Invalid/);
});
