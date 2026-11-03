import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mainArtifactRequest } from "../main-artifacts.mjs";
import { startSurvival, walkSurvival } from "../survival.mjs";
import { startEconomy, finishAction, sleepEconomy } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { LORE_ITEMS } from "../lore-catalogue.mjs";
import { artifactCandidates } from "../lore-engine.mjs";
import { validateArtifactInventory } from "../artifact-inventory.mjs";
import { discoveryClueText } from "../discovery-ui.mjs";
import { authoredHint } from "../discovery-authored.mjs";
import { translate } from "../i18n.mjs";
import ARTIFACT_RUMOURS from "../public/artifact-rumours.json" with { type: "json" };

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const map = json("../public/map.json"), survival = json("../public/config.json").survival;
const economy = json("../public/economy.json"), journey = "a".repeat(32);
function input() {
  const startedAt = Date.UTC(2026, 9, 19, 12);
  const state = { ...startEconomy(startSurvival(14, 10, startedAt, "balanced", survival), economy, () => 0),
    trail: createTrail(map, 14, 10, () => 0),
    serverJourney: { id: journey, seed: "a".repeat(8), contentVersion: "b".repeat(64),
      createdAt: new Date(startedAt).toISOString() } };
  return { map, journey, genesis: { state, region: "firmi", economy, survival }, snapshot: state,
    nowMillis: startedAt, worldMinutes: 0,
    instances: LORE_ITEMS.map(item => ({ id: item.id, col: 14, row: 10, town: "Firmi",
      marker: `virtual:${item.id}`, generation: 1, owner: null, placement: null, cooldownUntil: 0 })) };
}

test("every artifact has a bilingual authored legend, not a fabricated location or inscription", () => {
  assert.deepEqual(Object.keys(ARTIFACT_RUMOURS).sort(), LORE_ITEMS.map(item => item.id).sort());
  for (const legend of Object.values(ARTIFACT_RUMOURS)) {
    assert.deepEqual(Object.keys(legend).sort(), ["en", "fr"]);
    assert.ok(legend.fr.length > 30 && legend.en.length > 30);
  }
});

test("a spontaneous character story earns a saved legend and only its pinned coarse lead, for free", async () => {
  const request = input();
  const clue = { targetType: "artifact", targetId: "hermit", targetRevision: "1",
    evidenceKey: "location", kind: "location", precision: "town",
    facts: { artifact: "hermit", region: map.name, place: "Firmi" }, source: "character-artifact-rumour",
    channels: ["npc"], availability: "current", contentVersion: "template-v1" };
  const rumour = { id: "hermit", characterId: "b".repeat(32), clue };
  const result = await mainArtifactRequest({ ...request, characterRumour: rumour });
  assert.equal(result.runtime.state.elapsedMinutes, request.snapshot.elapsedMinutes);
  assert.equal(result.runtime.state.walletCents, request.snapshot.walletCents);
  const entries = result.runtime.state.discovery.entries.filter(entry => entry.targetType === "artifact");
  assert.deepEqual(entries.map(entry => entry.kind), ["legend", "location"]);
  assert.equal(entries[1].precision, "town");
  assert.equal(entries[1].facts.col, undefined);
  assert.equal(entries[1].facts.marker, undefined);
  for (const lang of ["fr", "en"]) {
    const t = (key, values) => translate(lang, key, values);
    assert.equal(discoveryClueText(entries[0], result.runtime.state, t), ARTIFACT_RUMOURS.hermit[lang]);
    assert.equal(authoredHint(entries[0], result.runtime.state, t, "", 0), null);
  }
  const again = await mainArtifactRequest({ ...request, snapshot: result.runtime.state,
    runtime: result.runtime, characterRumour: rumour });
  assert.equal(again.runtime.state.discovery.entries.filter(entry => entry.targetType === "artifact").length, 2);
  const normal = await mainArtifactRequest({ ...request, snapshot: again.runtime.state, runtime: again.runtime });
  assert.equal(normal.runtime.state.discovery.entries.filter(entry => entry.targetType === "artifact").length, 2);
});

test("a character cannot reveal an object's new location or a private holder's whereabouts", async () => {
  const request = input();
  request.instances[0] = { ...request.instances[0], owner: "c".repeat(32), generation: 2,
    col: 19, row: 20, town: "Private new location" };
  const rumour = { id: "hermit", characterId: "b".repeat(32),
    clue: { targetType: "artifact", targetId: "hermit", targetRevision: "1",
      evidenceKey: "location", kind: "location", precision: "town",
      facts: { artifact: "hermit", region: "Old region", place: "Old public town" },
      source: "character-artifact-rumour", channels: ["npc"], availability: "current", contentVersion: "template-v1" } };
  const result = await mainArtifactRequest({ ...request, characterRumour: rumour });
  const clue = result.runtime.state.discovery.entries.find(entry => entry.kind === "location");
  assert.equal(clue.availability, "historical");
  assert.equal(clue.facts.place, "Old public town");
  assert.doesNotMatch(JSON.stringify(result.view.conversationRumour), /Private new location/);
  await assert.rejects(mainArtifactRequest({ ...request, characterRumour: {
    ...rumour, clue: { ...rumour.clue, precision: "local", facts: { ...rumour.clue.facts, col: 19 } },
  } }), /Invalid character artifact lead/);
});

test("a coarse character story neither overwrites earned facts nor attributes a known exact location to the speaker", async () => {
  const request = input();
  const first = await mainArtifactRequest({ ...request, action: { type: "inquire", id: "hermit" } });
  const precise = first.runtime.state.discovery.entries.find(entry => entry.targetId === "hermit");
  assert.equal(precise.precision, "local");
  const result = await mainArtifactRequest({ ...request, snapshot: first.runtime.state, runtime: first.runtime,
    characterRumour: { id: "hermit", characterId: "b".repeat(32), clue: { ...precise, precision: "town",
      facts: { artifact: "hermit", region: "Another public map name", place: "Firmi" } } } });
  const locations = result.runtime.state.discovery.entries.filter(entry =>
    entry.targetId === "hermit" && entry.kind === "location");
  assert.deepEqual(locations, [precise]);
  assert.equal(result.view.conversationRumour.clueRevision, null);
});

test("main compass accounts for ordinary walking and never mutates the canonical runtime", async () => {
  const request = input(), first = await mainArtifactRequest(request);
  first.runtime.state.lore.compass = { stage: first.runtime.state.trail.index, remainingMinutes: 180, signal: null };
  const before = first.runtime.state;
  const moved = walkSurvival(before, 0, 1, map.rows[10][14], map.rows[11][14], survival);
  const snapshot = finishAction(before, moved, { terrain: "place", latitude: 44.54, longitude: 2.3 },
    economy, { survival, random: () => 1 });
  const result = await mainArtifactRequest({ ...request, runtime: first.runtime, snapshot });
  assert.equal(result.runtime.state.lore.compass.remainingMinutes, 180 - snapshot.lastMove.minutes);
  assert.equal(result.runtime.state.lore.compassReceipts[0].minutes, snapshot.lastMove.minutes);
  assert.equal(first.runtime.state.lore.compass.remainingMinutes, 180);
  assert.equal(result.runtime.state.artifactRevision, 2);
});

test("Moon delivers its canonical truth after ordinary main-game sleep, once", async () => {
  const request = input(), first = await mainArtifactRequest(request);
  const clue = artifactCandidates(first.runtime.state, first.instances, map)
    .find(candidate => candidate.clue.targetId === "chariot").clue;
  first.runtime.state.lore.moon = { expiresMinutes: 1440, clues: [clue] };
  const snapshot = sleepEconomy(first.runtime.state, map.rows[10][14],
    { terrain: "place", latitude: 44.54, longitude: 2.3 }, null, survival, economy, { minutes: 60 });
  const second = await mainArtifactRequest({ ...request, runtime: first.runtime, snapshot });
  assert.equal(second.runtime.state.lore.moon, null);
  assert.equal(second.runtime.state.lore.moonReceipts.length, 1);
  assert.ok(second.runtime.state.discovery.entries.some(entry => entry.targetId === "chariot"));
  const third = await mainArtifactRequest({ ...request, runtime: second.runtime, snapshot: second.runtime.state });
  assert.equal(third.runtime.state.lore.moonReceipts.length, 1);
});

test("ordinary and magical inventory share packing cells and a weight limit", async () => {
  let request = input(), result;
  for (const action of [{ type: "inquire", id: "hermit" }, { type: "claim", id: "hermit" }]) {
    result = await mainArtifactRequest({ ...request, action });
    request = { ...request, runtime: result.runtime, snapshot: result.runtime.state, instances: result.instances };
  }
  const state = structuredClone(result.runtime.state);
  validateArtifactInventory(state);
  state.lore.inventory[0].placement = { ...state.equipment.placements[0] };
  assert.throws(() => validateArtifactInventory(state));
  state.lore.inventory[0].placement = result.runtime.state.lore.inventory[0].placement;
  state.lore.carriedGrams++;
  assert.throws(() => validateArtifactInventory(state), /weight/);
});
