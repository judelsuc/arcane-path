import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLoreState, applyLoreAction, loreView, loreBag } from "../lore-engine.mjs";
import { startSurvival, walkSurvival, basalEnergy } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { LORE_ITEMS } from "../lore-catalogue.mjs";
import { applyLoreWalking } from "../lore-walking.mjs";
import { deliverAutomaticDiscovery, selectDiscoveryCandidate, validateDiscoverySchedule } from "../discovery-policy.mjs";
import { learnDiscovery, discoveryIdentity } from "../discovery.mjs";
import { plainGuidancePermitted } from "../discovery-interpretation.mjs";
import { translate } from "../i18n.mjs";
import { discoveryNotebookEntries } from "../discovery-ui.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const map = json("../public/map.json"), survival = json("../public/config.json").survival;
const economy = json("../public/economy.json"), journey = "a".repeat(32);
function start() {
  const genesis = { ...startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 19, 12),
    "balanced", survival), economy, () => 0), trail: createTrail(map, 14, 10, () => 0) };
  return { state: createLoreState(genesis, map, economy), survival, economy, revision: 1, worldMinutes: 0 };
}
function world() {
  return LORE_ITEMS.map(item => ({ id: item.id, col: 14, row: 10, town: "Firmi",
    marker: `virtual:${item.id}`, generation: 1, owner: null, placement: null, cooldownUntil: 0 }));
}
async function step(runtime, instances, action) {
  return applyLoreAction(runtime, instances, journey, map, action);
}
async function own(id) {
  let runtime = start(), instances = world();
  if (id === "chariot") runtime.state.distanceMeters = 1000;
  if (id === "temperance") runtime.state.lore.shared = ["hermit", "chariot"];
  ({ runtime, instances } = await step(runtime, instances, { type: "inquire", id }));
  return step(runtime, instances, { type: "claim", id });
}

test("server-owned inquiry and claim preserve original inputs and atomically fill the actual bag", async () => {
  const original = start(), instances = world(), before = structuredClone(original);
  const heard = await step(original, instances, { type: "inquire", id: "hermit" });
  assert.equal(heard.runtime.state.elapsedMinutes, 2);
  assert.deepEqual(original, before);
  assert.equal(instances[0].owner, null);
  const claimed = await step(heard.runtime, heard.instances, { type: "claim", id: "hermit" });
  assert.equal(claimed.runtime.state.elapsedMinutes, 12);
  assert.equal(claimed.instances[0].owner, journey);
  assert.equal(loreBag(claimed.runtime.state, claimed.instances, journey).grams, 1415);
  const view = loreView(claimed.runtime, claimed.instances, journey, map);
  assert.deepEqual(view.bag.placements, [{ id: "hermit", x: 0, y: 0, rotated: false }]);
  assert.equal(view.owned.length, 1);
  assert.ok(view.state.discovery.entries.some(entry => entry.kind === "inscription"));
  assert.equal(view.state.trail, undefined);
  assert.equal(view.visionTargets.includes("hermit"), false);
});

test("claims enforce proximity, learned generation and non-circular discovery prerequisites", async () => {
  let runtime = start(), instances = world();
  await assert.rejects(step(runtime, instances, { type: "claim", id: "hermit" }), /local clue/);
  ({ runtime, instances } = await step(runtime, instances, { type: "inquire", id: "chariot" }));
  await assert.rejects(step(runtime, instances, { type: "claim", id: "chariot" }), /1 km/);
  ({ runtime, instances } = await step(runtime, instances, { type: "inquire", id: "temperance" }));
  await assert.rejects(step(runtime, instances, { type: "claim", id: "temperance" }), /two distinct/);
  instances[0].owner = "b".repeat(32);
  await assert.rejects(step(runtime, instances, { type: "claim", id: "hermit" }), /taken/);
});

test("Hermit grants exact new knowledge, charges once and cannot reveal a holder", async () => {
  const owned = await own("hermit"), before = owned.runtime.state;
  owned.instances[1].col = 25;
  const used = await step(owned.runtime, owned.instances, { type: "use", id: "hermit", target: "chariot" });
  const state = used.runtime.state;
  assert.equal(state.elapsedMinutes, before.elapsedMinutes + 1);
  assert.equal(state.fatigue, before.fatigue + 10);
  const clue = state.discovery.entries.find(entry => entry.targetId === "chariot");
  assert.equal(clue.precision, "local");
  assert.equal(clue.facts.col, 25);
  assert.equal(plainGuidancePermitted(state, clue), true);
  assert.equal(state.lore.interpretations[0].source, "hermit");
  assert.equal(state.lore.interpretations.length, 1);
  assert.equal(used.instances[0].cooldownUntil, used.runtime.worldMinutes + 1440);
  await assert.rejects(step(used.runtime, used.instances, { type: "use", id: "hermit", target: "chariot" }), /cooling/);
  const readyAgain = structuredClone(used.runtime);
  readyAgain.worldMinutes = used.instances[0].cooldownUntil;
  await assert.rejects(step(readyAgain, used.instances, { type: "use", id: "hermit", target: "chariot" }), /No new/);
  assert.equal(loreView(readyAgain, used.instances, journey, map).visionTargets.includes("chariot"), false);
  owned.instances[1].owner = "b".repeat(32);
  await assert.rejects(step(owned.runtime, owned.instances, { type: "use", id: "hermit", target: "chariot" }), /unowned/);
  for (const locale of ["fr", "en"]) {
    const text = discoveryNotebookEntries(state, (key, args) => translate(locale, key, args))
      .map(record => record.text).join(" ");
    assert.doesNotMatch(text, /undefined|\{[a-z]+\}/);
  }
});

test("NPC interpretation authorizes only earned evidence, charges its quote and never raises precision", async () => {
  let runtime = start(), instances = world();
  ({ runtime, instances } = await step(runtime, instances, { type: "inquire", id: "hermit" }));
  const entry = runtime.state.discovery.entries.find(entry => entry.targetId === "hermit");
  const action = { type: "interpret-clue", evidence: discoveryIdentity(entry) };
  await assert.rejects(step(runtime, instances, action), /outside/);
  await assert.rejects(step(runtime, instances, { ...action, evidence: "invented" }), /earned/);
  runtime.state.col = 14;
  runtime.state.row = 11;
  for (const status of ["free", "paid", "refused"]) {
    let offer;
    const candidate = structuredClone(runtime);
    for (let day = 0; day < 365; day++) {
      candidate.state.startedAt = runtime.state.startedAt + day * 86400000;
      offer = loreView(candidate, instances, journey, map).interpretation;
      if (offer.status === status) break;
    }
    assert.equal(offer.status, status);
    if (status === "refused") {
      await assert.rejects(step(candidate, instances, action), /refused/);
      continue;
    }
    const before = structuredClone(candidate);
    const result = await step(candidate, instances, action), state = result.runtime.state;
    assert.deepEqual(candidate, before);
    assert.equal(state.elapsedMinutes, before.state.elapsedMinutes + 10);
    assert.equal(state.walletCents, before.state.walletCents - offer.cents);
    assert.equal(state.lastExpenseCents, offer.cents);
    assert.deepEqual(state.discovery.entries, before.state.discovery.entries);
    assert.ok(plainGuidancePermitted(state, entry));
    assert.equal(state.lore.interpretations[0].source, "npc");
    await assert.rejects(step(result.runtime, result.instances, action), /already interpreted/);
    if (status === "paid") {
      candidate.state.walletCents = 0;
      await assert.rejects(step(candidate, instances, action), /unaffordable/);
    }
  }
});

test("interrupted NPC interpretation spends time but does not grant plain guidance", async () => {
  let runtime = start(), instances = world();
  ({ runtime, instances } = await step(runtime, instances, { type: "inquire", id: "hermit" }));
  runtime.state.col = 14;
  runtime.state.row = 11;
  runtime.state.awakeHours = survival.sleep_limit_hours - 0.001;
  for (let day = 0; day < 365; day++) {
    runtime.state.startedAt = Date.UTC(2026, 9, 19 + day, 12);
    if (loreView(runtime, instances, journey, map).interpretation.available) break;
  }
  const entry = runtime.state.discovery.entries.find(entry => entry.targetId === "hermit");
  const result = await step(runtime, instances, { type: "interpret-clue", evidence: discoveryIdentity(entry) });
  assert.equal(result.runtime.state.lore.outcome, "interrupted");
  assert.equal(plainGuidancePermitted(result.runtime.state, entry), false);
});

test("Temperance really restores 40 health and fatigue, spends 500 kcal plus metabolism", async () => {
  const owned = await own("temperance");
  owned.runtime.state.health = 40;
  owned.runtime.state.fatigue = 70;
  const before = structuredClone(owned.runtime.state);
  const used = await step(owned.runtime, owned.instances, { type: "use", id: "temperance" });
  assert.equal(used.runtime.state.health, 80);
  assert.equal(used.runtime.state.fatigue, 30);
  assert.ok(Math.abs(used.runtime.state.reserveKcal -
    (before.reserveKcal - 500 - basalEnergy(before, 1, survival))) < 1e-8);
  assert.equal(used.runtime.state.energyKcal - before.energyKcal,
    500 + basalEnergy(before, 1, survival));
});

test("Temperance caps benefits, rejects a no-op and cannot consume the last reserve", async () => {
  const owned = await own("temperance");
  await assert.rejects(step(owned.runtime, owned.instances, { type: "use", id: "temperance" }), /no health/);
  owned.runtime.state.health = 95;
  owned.runtime.state.fatigue = 5;
  const capped = await step(owned.runtime, owned.instances, { type: "use", id: "temperance" });
  assert.equal(capped.runtime.state.health, 100);
  assert.equal(capped.runtime.state.fatigue, 0);
  for (const reserve of [500, 500 + basalEnergy(owned.runtime.state, 1, survival) / 2]) {
    owned.runtime.state.reserveKcal = reserve;
    await assert.rejects(step(owned.runtime, owned.instances, { type: "use", id: "temperance" }), /resources/);
  }
});

test("a real sleep collapse settles its elapsed time without activating or charging the power", async () => {
  const owned = await own("chariot");
  owned.runtime.state.awakeHours = survival.sleep_limit_hours - 0.001;
  const before = structuredClone(owned.runtime);
  const interrupted = await step(owned.runtime, owned.instances, { type: "use", id: "chariot" });
  assert.equal(interrupted.runtime.state.lore.effects, null);
  assert.equal(interrupted.instances[1].cooldownUntil, 0);
  assert.equal(interrupted.runtime.state.lore.outcome, "interrupted");
  assert.ok(interrupted.runtime.state.elapsedMinutes >= before.state.elapsedMinutes + 481);
  assert.equal(interrupted.runtime.state.fatigue, 40);
  assert.equal(interrupted.instances[1].owner, journey);
  assert.deepEqual(owned.runtime, before);
});

test("Chariot uses the real walking reducer: quarter time, quarter effort and quarter fatigue", async () => {
  const owned = await own("chariot");
  const used = await step(owned.runtime, owned.instances, { type: "use", id: "chariot" });
  const state = used.runtime.state, cell = { terrain: "road", elevationMeters: 100 };
  const plain = walkSurvival({ ...state, lore: { ...state.lore, effects: null } },
    1, 0, cell, cell, survival);
  const fast = walkSurvival(state, 1, 0, cell, cell, survival);
  assert.equal(fast.lastMove.minutes, plain.lastMove.minutes / 4);
  assert.equal(fast.lastMove.energyKcal, plain.lastMove.energyKcal / 4);
  assert.equal(fast.lastMove.fatigueGain, plain.lastMove.fatigueGain / 4);
  assert.equal(fast.distanceMeters, plain.distanceMeters);
  assert.equal(fast.lore.effects.remainingMeters, 19750);
  assert.ok(Math.abs((state.reserveKcal - fast.reserveKcal) * 4 -
    (state.reserveKcal - plain.reserveKcal)) < 1e-8);
});

test("Chariot splits both distance and simulated expiry boundaries without discounting the uncovered part", () => {
  const state = { elapsedMinutes: 10, fatigue: 20,
    lore: { effects: { remainingMeters: 100, expiresMinutes: 100 } } };
  const moved = { lastMove: { meters: 250, minutes: 8, energyKcal: 40, fatigueGain: 4 } };
  const split = applyLoreWalking(state, moved);
  assert.ok(Math.abs(split.moved.lastMove.minutes - 5.6) < 1e-9);
  assert.equal(split.effect, null);
  state.lore.effects = { remainingMeters: 20000, expiresMinutes: 11 };
  const timed = applyLoreWalking(state, moved);
  assert.equal(timed.moved.lastMove.minutes, 5);
  assert.equal(timed.effect, null);
  state.lore.effects.expiresMinutes = 10;
  assert.equal(applyLoreWalking(state, moved).moved, moved);
});

test("malformed Chariot effects fail explicitly, including already-expired malformed effects", () => {
  for (const effect of [
    { remainingMeters: 100, expiresMinutes: -1 },
    { remainingMeters: -1, expiresMinutes: 10 },
    { remainingMeters: Infinity, expiresMinutes: 0 },
    { remainingMeters: 20001, expiresMinutes: 10 },
    { remainingMeters: 20000 },
  ]) {
    assert.throws(() => applyLoreWalking({ elapsedMinutes: 10, lore: { effects: effect } },
      { lastMove: { meters: 250, minutes: 8 } }), /Invalid seven-league/);
  }
});

test("packing rotates the actual unique artifact and checks collisions with the common inventory", async () => {
  const owned = await own("chariot");
  const moved = await step(owned.runtime, owned.instances, { type: "pack", id: "chariot",
    x: 4, y: 3, rotated: true });
  assert.deepEqual(moved.instances[1].placement, { id: "chariot", x: 4, y: 3, rotated: true });
  assert.equal(moved.runtime.state.elapsedMinutes, owned.runtime.state.elapsedMinutes);
  await assert.rejects(step(owned.runtime, owned.instances, { type: "pack", id: "chariot",
    x: 5, y: 3, rotated: true }), /exceeds/);
  owned.instances[0].owner = journey;
  owned.instances[0].placement = { id: "hermit", x: 1, y: 0, rotated: false };
  await assert.rejects(step(owned.runtime, owned.instances, { type: "pack", id: "chariot",
    x: 1, y: 0, rotated: false }), /overlaps/);
});

test("abandonment recaches all held artifacts once, without clearing their cooldowns", async () => {
  const owned = await own("hermit");
  owned.instances[0].cooldownUntil = 10000;
  const next = await step(owned.runtime, owned.instances, { type: "abandon" });
  assert.equal(next.runtime.state.ended, "abandoned");
  assert.equal(next.instances[0].owner, null);
  assert.equal(next.instances[0].placement, null);
  assert.equal(next.instances[0].cooldownUntil, 10000);
  assert.equal(next.instances[0].generation, owned.instances[0].generation + 1);
  assert.equal(loreView(next.runtime, next.instances, journey, map).owned.length, 0);
  await assert.rejects(step(next.runtime, next.instances, { type: "rest" }), /ended/);
});

test("shared automatic delivery has a single walking budget, supports all domains and deduplicates retellings", () => {
  const clue = { targetType: "artifact", targetId: "hermit", targetRevision: "1", evidenceKey: "location",
    kind: "location", precision: "town", facts: { place: "Firmi" }, source: "test",
    observedMinutes: 60, channels: ["npc"], availability: "current", contentVersion: "template-v1" };
  const previous = { elapsedMinutes: 0, discoverySchedule: { walkingMinutes: 0, lastAutomaticMinutes: 0 } };
  const candidates = ["artifact", "parent-trail", "abandoned-journal"].map((targetType, index) => ({
    priority: 0, distanceMeters: index * 100, clue: { ...clue, targetType },
  }));
  const short = deliverAutomaticDiscovery(previous, { elapsedMinutes: 59 }, candidates, 59);
  assert.equal(short.discovery, undefined);
  const delivered = deliverAutomaticDiscovery(short, { ...short, elapsedMinutes: 60 }, candidates, 1);
  assert.equal(delivered.discovery.entries.length, 1);
  assert.equal(delivered.discovery.entries[0].targetType, "artifact");
  assert.equal(delivered.discoverySchedule.lastAutomaticMinutes, 60);
  const parent = selectDiscoveryCandidate(delivered, candidates, { targetType: "parent-trail" });
  assert.equal(parent.targetType, "parent-trail");
  assert.equal(learnDiscovery(delivered, [clue]), delivered);
  validateDiscoverySchedule(delivered);
  assert.throws(() => validateDiscoverySchedule({ ...delivered,
    discoverySchedule: { walkingMinutes: 61, lastAutomaticMinutes: 0 } }), /schedule/);
});
