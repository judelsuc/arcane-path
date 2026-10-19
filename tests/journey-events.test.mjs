import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { JOURNEY_EVENTS, EVENT_CATALOGUE, eventChances, selectJourneyEvent, advanceJourneyEvents,
  acknowledgeJourneyEvent, validateJourneyEvents, journeyEventText, journeyEventTextParts, applyJourneyEvent, eventPlaytestEnabled } from "../journey-events.mjs";
import { startEconomy, finishAction } from "../economy.mjs";
import { startSurvival, restSurvival } from "../survival.mjs";
import { beginPressures } from "../pressures.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { createTrail } from "../trail.mjs";
import { journeyStats } from "../journey-stats.mjs";
import { translate } from "../i18n.mjs";
import { beginEquipment } from "../equipment.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const economy = json("../public/economy.json"), survival = json("../public/config.json").survival;
const map = json("../public/map.json");
const info = { latitude: 44.54, longitude: 2.3, terrain: "road" };
function start(seed = 0) {
  const s = startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 17, 12) + seed,
    "balanced", survival), economy, () => 0);
  return beginPressures({ ...s, reserveKcal: 1000, fatigue: 20,
    trail: createTrail(map, 14, 10, () => 0) }, economy);
}
function move(s, minutes = 90) {
  const moved = restSurvival(s, { ...survival, rest_minutes: minutes, rest_fatigue_recovery: 0 });
  return { ...finishAction(s, moved, info, economy, { survival, random: () => 0.1 }),
    col: s.col + 1 };
}
const step = (s, minutes = 90) => advanceJourneyEvents(s, move(s, minutes), info, survival, economy);
test("effect numbers distinguish benefits, harms and neutral values in both languages", () => {
  for (const language of ["fr", "en"]) {
    const t = (key, args) => translate(language, key, args);
    const record = { kind: "tornBag", minutes: 15, foodKcal: -250, moneyCents: 150,
      fatigue: -5, reputation: -1, health: 12, awakeHours: -2, elapsedMinutes: 90,
      speedEffect: { factor: 0.8, expiresMinutes: 210 } };
    const numbers = journeyEventTextParts(record, t).filter(p => typeof p !== "string");
    assert.deepEqual(numbers.map(p => p.feedback),
      ["failure", "failure", "success", "success", "success", "success", "failure", "failure", ""]);
    assert.equal(numbers[1].text, "-250");
    assert.equal(numbers[7].text, "-20");
    const neutral = journeyEventTextParts({ ...record, minutes: 0, foodKcal: 0,
      moneyCents: 0, fatigue: 0, reputation: 0, health: 0, awakeHours: 0,
      speedEffect: undefined }, t).filter(p => typeof p !== "string");
    assert.ok(neutral.every(p => p.feedback === ""));
    assert.ok(journeyEventTextParts({ ...record, kind: "stranger" }, t).every(p => typeof p === "string"));
  }
});
test("accelerated event playtest is explicit and restricted to local hosts", () => {
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.equal(eventPlaytestEnabled({ hostname, search: "?eventPlaytest=1" }), true);
    assert.equal(eventPlaytestEnabled({ hostname, search: "" }), false);
    assert.equal(eventPlaytestEnabled({ hostname, search: "?eventPlaytest=0" }), false);
  }
  assert.equal(eventPlaytestEnabled({ hostname: "arcane-path.eu", search: "?eventPlaytest=1" }), false);
  assert.equal(eventPlaytestEnabled({ hostname: "localhost.example.org", search: "?eventPlaytest=1" }), false);
  assert.equal(eventPlaytestEnabled(null), false);
  assert.equal(JOURNEY_EVENTS.intervalMinutes, 90);
});
test("local playtest checks at exactly five minutes and saves outside normal journey slots", () => {
  execFileSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { readFileSync } from "node:fs";
    globalThis.location = { hostname: "127.0.0.1", search: "?eventPlaytest=1" };
    const { JOURNEY_EVENTS, advanceJourneyEvents, acknowledgeJourneyEvent } = await import("./journey-events.mjs");
    const { JOURNEY_SAVE_PREFIX, createJourneyStore } = await import("./journey-save.mjs");
    const { startSurvival, restSurvival } = await import("./survival.mjs");
    const { startEconomy, finishAction } = await import("./economy.mjs");
    const { createTrail } = await import("./trail.mjs");
    const economy = JSON.parse(readFileSync("public/economy.json"));
    const survival = JSON.parse(readFileSync("public/config.json")).survival;
    const map = JSON.parse(readFileSync("public/map.json"));
    const info = { latitude: 44.54, longitude: 2.3, terrain: "road" };
    let state = startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 18, 12), "balanced", survival), economy, () => 0);
    state = { ...state, trail: createTrail(map, 14, 10, () => 0) };
    const step = minutes => {
      const moved = finishAction(state, restSurvival(state, { ...survival, rest_minutes: minutes,
        rest_fatigue_recovery: 0 }), info, economy, { survival, random: () => 0 });
      state = advanceJourneyEvents(state, { ...moved, col: state.col + 1 }, info, survival, economy);
    };
    assert.equal(JOURNEY_EVENTS.intervalMinutes, 5);
    step(4.99); assert.equal(state.events.checks, 0);
    step(0.01); assert.equal(state.events.checks, 1);
    const data = new Map([["arcane-journey-v1:firmi", "normal save untouched"]]);
    const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
    const store = createJourneyStore(storage);
    assert.equal(store.read("firmi"), null);
    store.write({ region: "firmi", map, state, survival, economy });
    assert.equal(data.get("arcane-journey-v1:firmi"), "normal save untouched");
    assert.equal(JOURNEY_SAVE_PREFIX, "arcane-event-playtest-v1:");
    assert.deepEqual(createJourneyStore(storage).read("firmi").state.events, state.events);
    if (state.events.pending) state = acknowledgeJourneyEvent(state);
    step(5); assert.equal(state.events.checks, 2);
  `], { cwd: new URL("..", import.meta.url), stdio: "pipe" });
});
function example(kind, transform = s => s) {
  for (let seed = 0; seed < 2000; seed++) {
    const previous = transform(kind === "dogEncounter" ? beginEquipment(start(seed)) : start(seed)), moved = move(previous);
    const next = advanceJourneyEvents(previous, moved,
      { ...info, terrain: EVENT_CATALOGUE[kind].terrains?.[0] ?? info.terrain }, survival, economy);
    if (next.events?.history.at(-1)?.kind === kind) return { previous, moved, next };
  }
  throw new Error(`Missing deterministic fixture for ${kind}`);
}

test("wording versions rotate per event kind without extra random draws or changed effects", () => {
  const { previous, moved, next } = example("coins");
  assert.equal(next.events.history.at(-1).wordingVariant, 0);
  for (const last of [undefined, 0, 1, 2]) {
    const history = [{ kind: "coins", wordingVariant: last }, { kind: "food", wordingVariant: 2 }];
    const before = { ...previous, events: { version: 1, walkedMinutes: 0, checks: 0,
      count: 2, pending: null, history } };
    const result = advanceJourneyEvents(before, moved, info, survival, economy);
    const event = result.events.history.at(-1);
    assert.equal(event.kind, "coins");
    assert.equal(event.wordingVariant, last === undefined ? 0 : (last + 1) % 3);
    const { events: _, ...actual } = result, { events: __, ...expected } = next;
    assert.deepEqual(actual, expected, "presentation variants must not alter authoritative effects");
    assert.deepEqual(history, before.events.history);
  }
  validateJourneyEvents(next, economy, survival);
  const legacy = structuredClone(next);
  delete legacy.events.history.at(-1).wordingVariant;
  validateJourneyEvents(legacy, economy, survival);
  for (const value of [-1, 3, 1.5, "1", null]) {
    const invalid = structuredClone(next);
    invalid.events.history.at(-1).wordingVariant = value;
    assert.throws(() => validateJourneyEvents(invalid, economy, survival));
  }
  const saved = createSave({ region: "firmi", map, state: next, survival, economy }, 1);
  assert.equal(validateSave(JSON.parse(JSON.stringify(saved))).state.events.history.at(-1).wordingVariant, 0);
});

test("both starting and daily cards affect occurrence and polarity with exact thresholds", () => {
  const calm = { ...start(), birthCard: "star", dailyCard: "sun" };
  const birthTrouble = { ...calm, birthCard: "tower" };
  const dailyTrouble = { ...calm, dailyCard: "moon" };
  const trouble = { ...birthTrouble, dailyCard: "moon" };
  assert.ok(eventChances(birthTrouble, economy).occurrence > eventChances(calm, economy).occurrence);
  assert.ok(eventChances(dailyTrouble, economy).occurrence > eventChances(calm, economy).occurrence);
  assert.ok(eventChances(trouble, economy).positive < eventChances(calm, economy).positive);
  assert.ok(Math.abs(eventChances(calm, economy).occurrence - 0.245) < 1e-9);
  assert.ok(Math.abs(eventChances(trouble, economy).occurrence - 0.385) < 1e-9);
  for (const birth of economy.tarot) for (const daily of economy.tarot) {
    const s = { ...calm, birthCard: birth.id, dailyCard: daily.id };
    const chance = eventChances(s, economy);
    assert.equal(selectJourneyEvent(s, economy, chance.occurrence, 0, 0), null);
    assert.equal(selectJourneyEvent(s, economy, 0, chance.positive - 1e-9, 0), "food");
    assert.equal(selectJourneyEvent(s, economy, 0, chance.positive, 0), "delay");
  }
  assert.throws(() => selectJourneyEvent(calm, economy, NaN, 0, 0), /draw/);
  assert.throws(() => selectJourneyEvent(calm, economy, 0, 1, 0), /draw/);
  assert.throws(() => eventChances({ ...calm, birthCard: "unknown" }, economy), /card/);
});

test("only actual completed travel counts; exact interval, legacy resume and opportunities with no event persist", () => {
  const s = start();
  assert.equal(advanceJourneyEvents(s, { ...s, elapsedMinutes: 1000 }, info, survival, economy).events, undefined);
  const before = step(s, 89.99);
  assert.equal(before.events.checks, 0);
  const next = step(before, 0.01);
  assert.equal(next.events.checks, 1);
  assert.equal(next.events.walkedMinutes, 90);
  const legacy = step({ ...s, elapsedMinutes: 5000 }, 1);
  assert.equal(legacy.events.walkedMinutes, 1);
  assert.equal(legacy.events.checks, 0);
  for (const change of [{ ended: "hunger" }, { faints: 1 }]) {
    const moved = { ...move(s), ...change };
    assert.equal(advanceJourneyEvents(s, moved, info, survival, economy), moved);
  }
  const moved = move(s);
  const placed = { ...moved, pressures: { ...moved.pressures, placements: [{}] } };
  assert.equal(advanceJourneyEvents(s, placed, info, survival, economy), placed);
  assert.throws(() => advanceJourneyEvents(s, { ...s, col: 15 }, info, survival, economy), /duration/);
});

test("all gameplay events apply bounded effects and save their original cards and actual changes", () => {
  for (const kind of [...JOURNEY_EVENTS.positive, ...JOURNEY_EVENTS.negative]) {
    const { previous, moved, next } = example(kind);
    const r = next.events.history[0];
    assert.equal(next.events.count, 1);
    assert.equal(next.events.pending, r.id);
    assert.equal(r.birthCard, moved.birthCard);
    assert.equal(r.dailyCard, moved.dailyCard);
    assert.equal(r.foodKcal, next.reserveKcal - moved.reserveKcal);
    assert.equal(r.moneyCents, next.walletCents - moved.walletCents);
    assert.equal(r.fatigue, next.fatigue - moved.fatigue);
    if (kind === "food") assert.equal(r.foodKcal, 300);
    if (kind === "coins") assert.equal(r.moneyCents, 150);
    if (kind === "encouragement") { assert.equal(r.fatigue, -5); assert.equal(r.reputation, 1); }
    if (kind === "lostCoins") assert.equal(r.moneyCents, -150);
    if (kind === "delay") { assert.equal(r.minutes, 15); assert.ok(r.foodKcal < 0); }
    if (kind === "strain") assert.equal(r.fatigue, 5);
    assert.deepEqual(next, advanceJourneyEvents(previous, moved,
      { ...info, terrain: EVENT_CATALOGUE[kind].terrains?.[0] ?? info.terrain }, survival, economy));
    assert.equal(previous.events, undefined);
    validateJourneyEvents(next, economy, survival);
  }
  const broke = example("lostCoins", s => ({ ...s, walletCents: 0 })).next;
  assert.equal(broke.walletCents, 0);
  assert.equal(broke.events.history[0].moneyCents, 0);
  const full = example("food", s => ({ ...s, reserveKcal: survival.reserve_kcal })).next;
  assert.equal(full.reserveKcal, survival.reserve_kcal);
});

test("pending and acknowledged events roundtrip without reapplying effects or rerolling; malformed saves reject", () => {
  const { next } = example("coins");
  const save = createSave({ region: "firmi", map, state: next, survival, economy }, 1);
  const restored = validateSave(JSON.parse(JSON.stringify(save))).state;
  assert.deepEqual(restored.events, next.events);
  assert.equal(restored.walletCents, next.walletCents);
  assert.throws(() => step(restored), /acknowledged/);
  const done = acknowledgeJourneyEvent(restored);
  assert.equal(done.walletCents, restored.walletCents);
  assert.equal(done.events.pending, null);
  assert.throws(() => acknowledgeJourneyEvent(done), /No journey event/);
  const continued = step(done, 1);
  assert.equal(continued.events.count, 1);
  assert.equal(continued.walletCents, done.walletCents);
  for (const mutate of [
    e => { e.version = 2; }, e => { e.walkedMinutes = -1; }, e => { e.checks++; },
    e => { e.pending = 99; }, e => { e.count++; }, e => { e.history = []; },
    e => { e.history[0].kind = "invented"; }, e => { e.history[0].moneyCents = NaN; },
    e => { e.history[0].birthCard = "unknown"; }, e => { e.history[0].positive = 0; },
    e => { e.history[0].elapsedMinutes = 1e9; }, e => { e.history[0].reputation = 99; },
  ]) {
    const invalid = structuredClone(save);
    mutate(invalid.state.events);
    assert.throws(() => validateSave(invalid));
  }
});

test("extra fatigue can cause fainting or hunger; no recovery event revives an already interrupted walk", () => {
  const faint = example("strain", s => ({ ...s, fatigue: 97 })).next;
  assert.equal(faint.faints, 1);
  assert.equal(faint.fatigue, 40);
  assert.equal(faint.events.history[0].minutes, 480);
  assert.ok(faint.events.history[0].foodKcal < 0);
  validateJourneyEvents(faint, economy, survival);
  const dead = example("delay", s => ({ ...s, reserveKcal: 65, health: 0.01 })).next;
  assert.equal(dead.ended, "health");
  assert.equal(dead.events.history[0].kind, "delay");
  const { previous } = example("delay");
  const lingering = { ...previous, elapsedMinutes: 85,
    pressures: { ...previous.pressures, vigilance: 99.9 },
    events: { version: 1, walkedMinutes: 85, checks: 0, count: 0, pending: null, history: [] } };
  const placed = step(lingering, 5);
  assert.equal(placed.pressures.placements.length, 1);
  assert.equal(placed.events.history[0].minutes, 1455);
  assert.equal(placed.ended, null);
  validateJourneyEvents(placed, economy, survival);
});

test("a delay crossing midnight retains triggering cards and draws the next daily card deterministically", () => {
  const fixture = example("delay", s => ({ ...s, startedAt: s.startedAt + (10 * 60 + 25) * 60000 }));
  const { previous, moved, next } = fixture;
  assert.equal(moved.tarotDay, "2026-10-17");
  assert.equal(next.tarotDay, "2026-10-18");
  assert.equal(next.dailyTarotSeenDay, "2026-10-17");
  assert.equal(next.events.history[0].dailyCard, moved.dailyCard);
  assert.deepEqual(advanceJourneyEvents(previous, moved, info, survival, economy), next);
  const saved = createSave({ region: "firmi", map, state: next, survival, economy }, 1);
  assert.deepEqual(validateSave(saved).state.events, next.events);
});

test("no-event opportunities are saved and cannot be rerolled by an extra short step", () => {
  let next;
  for (let seed = 0; seed < 100; seed++) {
    const candidate = step(start(seed));
    if (candidate.events.count === 0) { next = candidate; break; }
  }
  assert.ok(next);
  const saved = createSave({ region: "firmi", map, state: next, survival, economy }, 1);
  const after = step(validateSave(saved).state, 1);
  assert.equal(after.events.checks, 1);
  assert.equal(after.events.count, 0);
  assert.equal(after.events.pending, null);
});

test("long journeys retain total counts and only the most recent 32 events; notebook/PDF text is localized", () => {
  let state = { ...start(), pressures: undefined };
  for (let i = 0; i < 250; i++) {
    if (state.events?.pending) state = acknowledgeJourneyEvent(state);
    state = step({ ...state, reserveKcal: survival.reserve_kcal, fatigue: 0, awakeHours: 0 });
  }
  assert.ok(state.events.count > 32);
  assert.equal(state.events.history.length, 32);
  validateJourneyEvents(state, economy, survival);
  for (const lang of ["fr", "en"]) {
    const t = (key, args) => translate(lang, key, args);
    const text = journeyEventText(state.events.history[0], t);
    assert.doesNotMatch(text, /journeyEvent\.|undefined|NaN/);
    const stats = journeyStats({ state, survival, economy }, t, lang);
    const group = stats.find(g => g.title === t("journeyEventHistory"));
    assert.equal(group.rows.length, 34);
    assert.equal(group.rows[0].value, String(state.events.count));
  }
});

test("catalogue has twenty mechanical events, an optional dog and eight story-only encounters", () => {
  assert.equal(JOURNEY_EVENTS.positive.length + JOURNEY_EVENTS.negative.length, 21);
  assert.equal(JOURNEY_EVENTS.story.length, 8);
  for (const lang of ["fr", "en"]) for (const kind of Object.keys(EVENT_CATALOGUE)) {
    assert.notEqual(translate(lang, `journeyEvent.${kind}`), `journeyEvent.${kind}`);
  }
  for (const terrain of ["road", "forest", "place", "water", "plain", "church"]) {
    const selected = new Set();
    for (let i = 0; i < 100; i++) for (const polarity of [0, 0.999]) {
      const k = selectJourneyEvent(start(), economy, 0, polarity, i / 100, { ...info, terrain });
      selected.add(k);
      const rule = EVENT_CATALOGUE[k];
      assert.ok(!rule.terrains || rule.terrains.includes(terrain));
    }
    if (terrain !== "forest") {
      assert.ok(!selected.has("forestBoar"));
      assert.ok(!selected.has("forestDogs"));
    } else {
      assert.ok(selected.has("forestBoar") && selected.has("forestDogs"));
    }
  }
  for (const kind of JOURNEY_EVENTS.story) {
    const s = start(), eventInfo = { ...info, terrain: EVENT_CATALOGUE[kind].terrains?.[0] ?? info.terrain };
    assert.equal(applyJourneyEvent(s, kind, eventInfo, survival, economy), s);
    const fixture = example(kind);
    const r = fixture.next.events.history[0];
    assert.equal(r.kind, kind);
    for (const field of ["health", "awakeHours", "minutes", "foodKcal", "moneyCents", "fatigue", "reputation"]) {
      assert.equal(r[field], 0);
    }
    for (const lang of ["fr", "en"]) {
      const t = (key, args) => translate(lang, key, args);
      assert.ok(journeyEventText(r, t).includes(t("journeyEventStoryOnly")));
    }
    const saved = createSave({ region: "firmi", map, state: fixture.next, survival, economy }, 1);
    saved.state.events.history[0].health = 1;
    assert.throws(() => validateSave(saved));
  }
});

test("forest attacks injure, health events obey bounds, sleep effects recover and fatigue/sleep can collapse", () => {
  const s = { ...start(), health: 50 };
  const forest = { ...info, terrain: "forest" };
  const attack = applyJourneyEvent(s, "forestBoar", forest, survival, economy);
  assert.equal(attack.health, 35);
  assert.equal(attack.fatigue, s.fatigue + 8);
  assert.throws(() => applyJourneyEvent(s, "forestBoar", info, survival, economy), /terrain/);
  const death = applyJourneyEvent({ ...s, health: 10 }, "forestBoar", forest, survival, economy);
  assert.equal(death.health, 0);
  assert.equal(death.ended, "health");
  assert.throws(() => applyJourneyEvent(death, "bandage", forest, survival, economy), /ended/);
  assert.equal(applyJourneyEvent({ ...s, health: 99 }, "bandage", info, survival, economy).health, 100);
  const nap = applyJourneyEvent({ ...s, awakeHours: 10 }, "catNap", info, survival, economy);
  assert.ok(nap.awakeHours < 10);
  assert.ok(nap.health > s.health);
  assert.equal(nap.elapsedMinutes, 20);
  assert.equal(applyJourneyEvent({ ...s, awakeHours: 0.1 }, "clearHead", info, survival, economy).awakeHours, 0);
  const collapse = applyJourneyEvent({ ...s, awakeHours: survival.sleep_limit_hours - 1 },
    "restlessThoughts", info, survival, economy);
  assert.equal(collapse.faints, 1);
  assert.equal(collapse.lastFaint.reason, "sleep");
  const fast = applyJourneyEvent(s, "tailwind", info, survival, economy);
  assert.deepEqual(fast.speedEffect, { factor: 1.15, expiresMinutes: 90 });
  const slow = applyJourneyEvent(fast, "headwind", info, survival, economy);
  assert.deepEqual(slow.speedEffect, { factor: 0.8, expiresMinutes: 120 });
});
