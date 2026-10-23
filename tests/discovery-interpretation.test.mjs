import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interpretationOffer, grantInterpretation, plainGuidancePermitted,
  validateInterpretations } from "../discovery-interpretation.mjs";
import { learnDiscovery, discoveryIdentity } from "../discovery.mjs";
import { beginPressures, changeReputation } from "../pressures.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { tarotEventFactor } from "../tarot-effects.mjs";

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const economy = json("../public/economy.json"), survival = json("../public/config.json").survival;
const cell = json("../public/map.json").rows[11][14];
const info = { latitude: 44.54, longitude: 2.31 };
const entry = { targetType: "artifact", targetId: "hermit", targetRevision: "1",
  evidenceKey: "location", kind: "location", precision: "region", facts: { region: "Occitanie" },
  observedMinutes: 0, channels: ["npc"], source: "test", availability: "current", contentVersion: "template-v1" };
function state(day = 0) {
  return learnDiscovery({ ...beginPressures(startEconomy(startSurvival(14, 11,
    Date.UTC(2026, 9, 19 + day, 12), "balanced", survival), economy, () => 0), economy),
  lore: { interpretations: [] } }, [entry]);
}

test("interpretations are permanent exact-evidence grants, not target-wide precision or revision unlocks", () => {
  const original = state(), before = structuredClone(original);
  assert.equal(plainGuidancePermitted(original, entry), false);
  const granted = grantInterpretation(original, entry, "npc");
  assert.deepEqual(original, before);
  assert.equal(plainGuidancePermitted(granted, entry), true);
  assert.equal(grantInterpretation(granted, entry, "hermit"), granted);
  assert.equal(plainGuidancePermitted(granted, { ...entry, precision: "town" }), false);
  assert.equal(plainGuidancePermitted(granted, { ...entry, targetRevision: "2" }), false);
  const restored = JSON.parse(JSON.stringify(granted));
  restored.discovery.entries[0].availability = "historical";
  validateInterpretations(restored);
  assert.equal(plainGuidancePermitted(restored, entry), true);
  assert.deepEqual(restored.discovery.entries[0].facts, original.discovery.entries[0].facts);
});

test("invalid grants and corrupted permission histories fail explicitly", () => {
  assert.throws(() => grantInterpretation(state(), { ...entry, targetId: "unknown" }, "npc"), /unknown/);
  assert.throws(() => grantInterpretation(state(), entry, "dream"), /unknown/);
  const granted = grantInterpretation(state(), entry, "hermit");
  for (const permissions of [null, [{}], [...granted.lore.interpretations, ...granted.lore.interpretations],
    [{ evidence: discoveryIdentity(entry), source: "npc", observedMinutes: 1 }]]) {
    assert.throws(() => validateInterpretations({ ...granted, lore: { interpretations: permissions } }), /Invalid/);
  }
  const old = state();
  delete old.lore.interpretations;
  validateInterpretations(old);
  assert.equal(plainGuidancePermitted(old, entry), false);
});

test("NPCs can offer free or paid help or refuse, with stable settlement/day offers", () => {
  const statuses = new Set();
  for (let day = 0; day < 180; day++) {
    const player = state(day), before = structuredClone(player);
    const offer = interpretationOffer(player, cell, info, economy);
    assert.deepEqual(interpretationOffer(structuredClone(player), cell, info, economy), offer);
    assert.deepEqual(player, before);
    statuses.add(offer.status);
    if (offer.available) {
      assert.equal(offer.minutes, 10);
      assert.equal(offer.cents === 0, offer.status === "free");
      assert.ok(offer.cents >= 0);
    }
    if (offer.status === "paid") {
      player.walletCents = offer.cents - 1;
      assert.deepEqual(interpretationOffer(player, cell, info, economy),
        { ...offer, available: false, status: "unaffordable" });
      player.walletCents = offer.cents;
      assert.equal(interpretationOffer(player, cell, info, economy).available, true);
    }
  }
  assert.deepEqual([...statuses].sort(), ["free", "paid", "refused"]);
  assert.equal(interpretationOffer(state(), { terrain: "road" }, info, economy).status, "outside");
  assert.equal(interpretationOffer({ ...state(), ended: "abandoned" }, cell, info, economy).status, "ended");
});

test("reputation, fatigue, cleanliness and birth/day tarot influence interpretation conditions", () => {
  let reputationChanged = false, fatigueChanged = false, cleanlinessChanged = false, cardsChanged = false;
  for (let day = 0; day < 180; day++) {
    const player = state(day), offer = interpretationOffer(player, cell, info, economy);
    const differs = candidate => JSON.stringify(interpretationOffer(candidate, cell, info, economy)) !== JSON.stringify(offer);
    reputationChanged ||= differs(changeReputation(player, 25));
    fatigueChanged ||= differs({ ...player, fatigue: 80 });
    cleanlinessChanged ||= differs({ ...player, pressures: { ...player.pressures, cleanliness: 10 } });
    for (const { id } of economy.tarot) {
      for (const key of ["birthCard", "dailyCard"]) {
        const changed = { ...player, [key]: id };
        changed.pressures = { ...player.pressures, tarotFactor: tarotEventFactor(changed, economy) };
        cardsChanged ||= differs(changed);
      }
    }
  }
  assert.ok(reputationChanged && fatigueChanged && cleanlinessChanged && cardsChanged);
});
