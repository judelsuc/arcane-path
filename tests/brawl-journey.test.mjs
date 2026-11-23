import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BRAWL_COOLDOWN_MINUTES, BRAWL_LOSS, beginBrawl, beginCampEncounter, brawlPending, campInterruption,
  settleBrawl, streetEncounter, validateBrawl } from "../brawl-journey.mjs";
import { startSurvival } from "../survival.mjs";
import { applyBirthTarot, startEconomy } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { createSave, validateSave } from "../journey-save.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const economy = json("../public/economy.json"), survival = json("../public/config.json").survival;
const map = json("../public/map.json");
const base = () => ({ ...applyBirthTarot(startEconomy(startSurvival(14, 10,
  Date.UTC(2026, 10, 13, 12), "balanced", survival), economy, () => 0), economy),
  trail: createTrail(map, 14, 10, () => 0) });
const town = { terrain: "place", settlements: [{ osmId: "node/1", name: "Firmi" }] };
const night = { latitude: 44.5, longitude: 2.3 };
const save = state => createSave({ region: "firmi", map, state, survival, economy }, 1);

// Walks back and forth through town until the first street fight starts.
function walkUntilFight(start, cell = town, limit = 4000) {
  let state = start;
  for (let step = 0; step < limit; step++) {
    const moved = { ...state, col: state.col + (step % 2 ? -1 : 1), elapsedMinutes: state.elapsedMinutes + 7 };
    const next = streetEncounter(state, moved, cell, night);
    if (brawlPending(next)) return next;
    state = moved;
  }
  return null;
}

test("walking through town eventually meets a bad encounter, never in the countryside or by a police station", () => {
  const fight = walkUntilFight(base());
  assert.ok(fight, "an urban walk meets a fight");
  const item = fight.brawl.pending;
  assert.equal(item.kind, "street");
  assert.ok(item.opponents >= 1 && item.opponents <= 3);
  assert.ok(item.level >= 1 && item.level <= 10 && item.breath >= 2 && item.breath <= 5);
  assert.equal(item.col, fight.col);
  assert.equal(walkUntilFight(base(), { terrain: "forest" }), null);
  assert.equal(walkUntilFight(base(), { ...town, pois: [{ tags: { amenity: "police" } }] }), null);
  validateBrawl(fight);
});

test("losing is a robbery and a beating, never death, and is verified by replay in saves", () => {
  const fight = walkUntilFight({ ...base(), walletCents: 4000, health: 60 });
  const active = beginBrawl(fight);
  assert.throws(() => beginBrawl(active), /cannot start/);
  const lost = settleBrawl(active, { changes: [], ticks: 0, abandoned: true });
  const record = lost.brawl.history.at(-1);
  assert.equal(record.outcome, "lost");
  assert.ok(record.stolenCents >= 1000 && record.stolenCents <= 2000);
  assert.equal(lost.walletCents, 4000 - record.stolenCents);
  assert.equal(lost.health, 60 - BRAWL_LOSS.health);
  assert.equal(lost.ended ?? null, null);
  assert.equal(brawlPending(lost), false);
  validateSave(save(lost));
  const weak = settleBrawl(beginBrawl(walkUntilFight({ ...base(), health: 5 })), { changes: [], ticks: 0, abandoned: true });
  assert.equal(weak.health, 1, "a beating never kills");
  const forged = structuredClone(lost);
  forged.brawl.history.at(-1).outcome = "won";
  assert.throws(() => validateBrawl(forged), /Invalid saved fight/);
});

test("fights are at most weekly and never stack on another pending event", () => {
  const fight = walkUntilFight(base());
  const done = settleBrawl(beginBrawl(fight), { changes: [], ticks: 0, abandoned: true });
  const soon = walkUntilFight(done, town, Math.floor((BRAWL_COOLDOWN_MINUTES - 60) / 7));
  assert.equal(soon, null, "no second fight within seven days");
  const later = walkUntilFight({ ...done, elapsedMinutes: done.elapsedMinutes + BRAWL_COOLDOWN_MINUTES });
  assert.ok(later && later.brawl.history.length === 1);
  assert.equal(walkUntilFight({ ...base(), events: { pending: { kind: "x" } } }), null);
});

test("sleeping without shelter can be cut short by prowlers, less often with the dog", () => {
  const nights = (state, count = 400) => Array.from({ length: count }, (_, i) =>
    campInterruption({ ...state, elapsedMinutes: state.elapsedMinutes + i * 1440 + 17 }, null, 480)).filter(v => v !== null);
  const alone = nights(base());
  assert.ok(alone.length > 20 && alone.length < 110, `${alone.length} interrupted nights out of 400`);
  assert.ok(alone.every(share => share >= 0.35 && share <= 0.75));
  assert.equal(campInterruption(base(), "node/5", 480), null, "a shelter is safe");
  const camp = beginCampEncounter(base(), night);
  assert.equal(camp.brawl.pending.kind, "camp");
  assert.equal(camp.brawl.pending.drowsy, true);
  validateBrawl(camp);
});
