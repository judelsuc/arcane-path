import { tarotEventFactor } from "./tarot-effects.mjs";
import { actionInterrupted, finishAction } from "./economy.mjs";
import { restSurvival, sleepSurvival } from "./survival.mjs";
import { changeReputation } from "./pressures.mjs";
import { healthValue } from "./health.mjs";

export const EVENT_CATALOGUE = Object.freeze({
  food: { polarity: "positive", food: 300 },
  coins: { polarity: "positive", money: 150 },
  encouragement: { polarity: "positive", fatigue: -5, reputation: 1 },
  waterBreak: { polarity: "positive", fatigue: -8 },
  catNap: { polarity: "positive", minutes: 20, sleep: true },
  clearHead: { polarity: "positive", awake: -1 },
  tailwind: { polarity: "positive", speed: 1.15, duration: 90 },
  bandage: { polarity: "positive", health: 12 },
  picnic: { polarity: "positive", food: 600, minutes: 10 },
  friendlyAdvice: { polarity: "positive", reputation: 2, speed: 1.1, duration: 60 },
  dogEncounter: { polarity: "positive" },
  delay: { polarity: "negative", minutes: 15 },
  lostCoins: { polarity: "negative", money: -150 },
  strain: { polarity: "negative", fatigue: 5 },
  tornBag: { polarity: "negative", food: -250 },
  restlessThoughts: { polarity: "negative", awake: 2 },
  headwind: { polarity: "negative", speed: 0.8, duration: 120 },
  blisters: { polarity: "negative", health: -8, speed: 0.9, duration: 90 },
  forestBoar: { polarity: "negative", terrains: ["forest"], health: -15, fatigue: 8 },
  forestDogs: { polarity: "negative", terrains: ["forest"], health: -10, fatigue: 6 },
  chills: { polarity: "negative", health: -5, fatigue: 4 },
  whiteDeer: { polarity: "story", terrains: ["forest"] },
  silentBell: { polarity: "story", terrains: ["church", "place"] },
  impossibleShadow: { polarity: "story" },
  repeatingStone: { polarity: "story", terrains: ["road", "major_road"] },
  stranger: { polarity: "story" },
  stars: { polarity: "story" },
  ribbon: { polarity: "story", terrains: ["forest"] },
  reflection: { polarity: "story", terrains: ["water"] },
});
const kinds = polarity => Object.keys(EVENT_CATALOGUE).filter(k => EVENT_CATALOGUE[k].polarity === polarity);
export function eventPlaytestEnabled(location = globalThis.location) {
  return Boolean(location && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) &&
    new URLSearchParams(location.search).get("eventPlaytest") === "1");
}

export const JOURNEY_EVENTS = Object.freeze({ intervalMinutes: eventPlaytestEnabled() ? 5 : 90, historyLimit: 32,
  storyChance: 0.25, positive: Object.freeze(kinds("positive")),
  negative: Object.freeze(kinds("negative")), story: Object.freeze(kinds("story")) });
const reputation = state => state.pressures?.reputation.find(r =>
  r.locality === `${Math.floor(state.col / 8)},${Math.floor(state.row / 8)}`)?.value ?? 0;

export function eventChances(state, economy) {
  const factor = tarotEventFactor(state, economy);
  return { occurrence: 0.35 * factor, positive: 1 - factor / 2 };
}

function draw(state, opportunity, channel) {
  const identity = JSON.stringify([state.serverJourney?.seed ?? state.startedAt,
    state.startedAt, opportunity, channel]);
  let hash = 2166136261;
  for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  hash = Math.imul(hash ^ hash >>> 16, 0x85ebca6b);
  hash = Math.imul(hash ^ hash >>> 13, 0xc2b2ae35);
  return ((hash ^ hash >>> 16) >>> 0) / 2 ** 32;
}

export function selectJourneyEvent(state, economy, occurrence, polarity, variant, info = {}, story = 1 - Number.EPSILON) {
  if ([occurrence, polarity, variant, story].some(n => !Number.isFinite(n) || n < 0 || n >= 1)) {
    throw new Error("Invalid journey event draw.");
  }
  const chances = eventChances(state, economy);
  if (occurrence >= chances.occurrence) return null;
  const pool = story < JOURNEY_EVENTS.storyChance ? JOURNEY_EVENTS.story
    : polarity < chances.positive ? JOURNEY_EVENTS.positive : JOURNEY_EVENTS.negative;
  const eligible = pool.filter(k => (k !== "dogEncounter" ||
    state.equipment && !state.equipment.dog && state.equipment.dogEncounter === null &&
    info.terrain !== "water") && (!EVENT_CATALOGUE[k].terrains ||
    EVENT_CATALOGUE[k].terrains.includes(info.terrain)));
  return eligible[Math.floor(variant * eligible.length)];
}

export function applyJourneyEvent(state, kind, info, survival, economy, random = Math.random) {
  if (!Object.hasOwn(EVENT_CATALOGUE, kind)) throw new Error("Unknown journey event.");
  if (state.ended) throw new Error("Cannot apply an event to an ended journey.");
  const rule = EVENT_CATALOGUE[kind];
  if (kind === "dogEncounter") {
    if (!state.equipment || state.equipment.dog || state.equipment.dogEncounter !== null ||
        info.terrain === "water") throw new Error("Dog encounter unavailable.");
    return { ...state, equipment: { ...state.equipment,
      revision: state.equipment.revision + 1, dogEncounter: "pending" } };
  }
  if (rule.terrains && !rule.terrains.includes(info.terrain)) throw new Error("Event unavailable on this terrain.");
  if (rule.polarity === "story") return state;
  let next = { ...state,
    reserveKcal: Math.max(0, Math.min(survival.reserve_kcal, state.reserveKcal + (rule.food ?? 0))),
    walletCents: Math.max(0, state.walletCents + (rule.money ?? 0)),
    fatigue: Math.max(0, Math.min(100, state.fatigue + (rule.fatigue ?? 0))),
    awakeHours: Math.max(0, Math.min(survival.sleep_limit_hours, state.awakeHours + (rule.awake ?? 0))),
    health: Math.max(0, Math.min(100, healthValue(state) + (rule.health ?? 0))),
  };
  if (rule.reputation) next = changeReputation(next, rule.reputation);
  if (rule.speed) next.speedEffect = { factor: rule.speed, expiresMinutes: state.elapsedMinutes + rule.duration };
  if (next.health === 0) return { ...next, ended: "health" };
  if (rule.minutes || next.fatigue >= 100 || next.awakeHours >= survival.sleep_limit_hours) {
    const timed = rule.sleep ? sleepSurvival(next, { ...survival, sleep_hours: rule.minutes / 60 })
      : restSurvival(next, { ...survival, rest_minutes: rule.minutes ?? 0, rest_fatigue_recovery: 0 });
    next = finishAction(next, timed, info, economy, { survival, random });
    next = { ...next, lastMove: state.lastMove };
  }
  return next;
}

export function advanceJourneyEvents(previous, moved, info, survival, economy) {
  if (previous.events?.pending) throw new Error("A journey event must be acknowledged before travelling.");
  if (previous.ended || actionInterrupted(previous, moved) ||
      previous.col === moved.col && previous.row === moved.row) return moved;
  const minutes = moved.elapsedMinutes - previous.elapsedMinutes;
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error("Invalid journey event travel duration.");
  const ledger = previous.events ?? { version: 1, walkedMinutes: 0, checks: 0, count: 0,
    pending: null, history: [] };
  const walkedMinutes = ledger.walkedMinutes + minutes;
  const checks = Math.floor(walkedMinutes / JOURNEY_EVENTS.intervalMinutes);
  let next = { ...moved, events: { ...ledger, walkedMinutes, checks } };
  if (checks === ledger.checks) return next;
  const kind = selectJourneyEvent(moved, economy, draw(moved, checks, "occurrence"),
    draw(moved, checks, "polarity"), draw(moved, checks, "variant"), info, draw(moved, checks, "story"));
  if (!kind) return next;
  const birthCard = moved.birthCard, dailyCard = moved.dailyCard;
  const chances = eventChances(moved, economy);
  next = applyJourneyEvent(next, kind, info, survival, economy, () => draw(moved, checks, "daily-card"));
  const count = ledger.count + 1;
  const previousWording = ledger.history.findLast(event => event.kind === kind)?.wordingVariant;
  const record = { id: count, opportunity: checks, kind, birthCard, dailyCard,
    wordingVariant: ((previousWording ?? -1) + 1) % 3,
    ...chances, elapsedMinutes: moved.elapsedMinutes, col: moved.col, row: moved.row, terrain: info.terrain,
    minutes: next.elapsedMinutes - moved.elapsedMinutes,
    foodKcal: next.reserveKcal - moved.reserveKcal,
    moneyCents: next.walletCents - moved.walletCents, fatigue: next.fatigue - moved.fatigue,
    reputation: reputation(next) - reputation(moved),
    health: healthValue(next) - healthValue(moved), awakeHours: next.awakeHours - moved.awakeHours,
    ...(EVENT_CATALOGUE[kind].speed ? { speedEffect: { ...next.speedEffect } } : {}) };
  return { ...next, events: { version: 1, walkedMinutes, checks, count, pending: count,
    history: [...ledger.history, record].slice(-JOURNEY_EVENTS.historyLimit) } };
}

export function acknowledgeJourneyEvent(state) {
  if (!state.events?.pending) throw new Error("No journey event to acknowledge.");
  return { ...state, events: { ...state.events, pending: null } };
}

export function journeyEventText(record, t) {
  return journeyEventTextParts(record, t).map(part => typeof part === "string" ? part : part.text).join("");
}

export function journeyEventTextParts(record, t) {
  const signed = (n, digits = 0) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
  const narrative = `${record.wording?.[t("discovery.inscriptionLanguage")] ?? t(`journeyEvent.${record.kind}`)} `;
  if (EVENT_CATALOGUE[record.kind].polarity === "story") return [narrative, t("journeyEventStoryOnly")];
  const template = (key, values, benefits) => t(key,
    Object.fromEntries(Object.keys(values).map(name => [name, `{${name}}`])))
    .split(/(\{\w+\})/).filter(Boolean).map(text => {
      const name = text.slice(1, -1);
      if (!Object.hasOwn(values, name) || text !== `{${name}}`) return text;
      return { text: values[name], feedback: benefits[name] > 0 ? "success" : benefits[name] < 0 ? "failure" : "" };
    });
  const parts = [narrative, ...template("journeyEventEffects", {
    minutes: record.minutes.toFixed(0), food: signed(record.foodKcal),
    money: signed(record.moneyCents / 100, 2), fatigue: signed(record.fatigue, 1),
    reputation: signed(record.reputation), health: signed(record.health ?? 0, 1),
    sleep: signed(record.awakeHours ?? 0, 1),
  }, { minutes: -record.minutes, food: record.foodKcal, money: record.moneyCents,
    fatigue: -record.fatigue, reputation: record.reputation, health: record.health ?? 0,
    sleep: -(record.awakeHours ?? 0) })];
  if (record.speedEffect) parts.push(" ", ...template("journeyEventSpeed", {
    percent: signed((record.speedEffect.factor - 1) * 100),
    minutes: Math.round(record.speedEffect.expiresMinutes - record.elapsedMinutes),
  }, { percent: record.speedEffect.factor - 1 }));
  return parts;
}

export function validateJourneyEvents(state, economy, survival) {
  const e = state.events;
  if (e === undefined) return;
  const fail = () => { throw new Error("Invalid saved journey events."); };
  const nonnegative = n => Number.isFinite(n) && n >= 0;
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  if (!e || e.version !== 1 || !nonnegative(e.walkedMinutes) || e.walkedMinutes > state.elapsedMinutes ||
      !integer(e.checks) || e.checks !== Math.floor(e.walkedMinutes / JOURNEY_EVENTS.intervalMinutes) ||
      !integer(e.count) || e.count > e.checks ||
      !(e.pending === null || integer(e.pending) && e.pending > 0 && e.pending === e.count) ||
      !Array.isArray(e.history) || e.history.length !== Math.min(e.count, JOURNEY_EVENTS.historyLimit)) fail();
  let lastTime = -1, lastOpportunity = 0;
  for (let i = 0; i < e.history.length; i++) {
    const r = e.history[i];
    if (!r || r.id !== e.count - e.history.length + i + 1 ||
        !integer(r.opportunity) || r.opportunity <= lastOpportunity || r.opportunity > e.checks ||
        !Object.hasOwn(EVENT_CATALOGUE, r.kind) ||
        r.wordingVariant !== undefined && (!integer(r.wordingVariant) || r.wordingVariant >= 3) ||
        r.wording !== undefined && r.wording !== null &&
          (typeof r.wording !== "object" || Array.isArray(r.wording) ||
            Object.keys(r.wording).length !== 2 || !["fr", "en"].every(language =>
              typeof r.wording[language] === "string" && r.wording[language].trim() &&
              r.wording[language].length <= 400)) ||
        !nonnegative(r.elapsedMinutes) || r.elapsedMinutes < lastTime ||
        !nonnegative(r.minutes) || r.elapsedMinutes + r.minutes > state.elapsedMinutes ||
        !Number.isSafeInteger(r.col) || Math.abs(Math.floor(r.col / 8)) > 1000 ||
        !Number.isSafeInteger(r.row) || Math.abs(Math.floor(r.row / 8)) > 1000 ||
        !Number.isFinite(r.foodKcal) || Math.abs(r.foodKcal) > survival.reserve_kcal ||
        !Number.isSafeInteger(r.moneyCents) || !Number.isFinite(r.fatigue) || Math.abs(r.fatigue) > 100 ||
        !Number.isInteger(r.reputation) || Math.abs(r.reputation) > 50 ||
        r.health !== undefined && (!Number.isFinite(r.health) || Math.abs(r.health) > 100) ||
        r.awakeHours !== undefined && (!Number.isFinite(r.awakeHours) || Math.abs(r.awakeHours) > survival.sleep_limit_hours) ||
        r.speedEffect !== undefined && (!EVENT_CATALOGUE[r.kind].speed ||
          r.speedEffect?.factor !== EVENT_CATALOGUE[r.kind].speed ||
          r.speedEffect?.expiresMinutes !== r.elapsedMinutes + EVENT_CATALOGUE[r.kind].duration)) fail();
    const chances = eventChances(r, economy);
    if (r.occurrence !== chances.occurrence || r.positive !== chances.positive) fail();
    const rule = EVENT_CATALOGUE[r.kind];
    if (rule.terrains && !rule.terrains.includes(r.terrain)) fail();
    if (rule.polarity === "story" && [r.minutes, r.foodKcal, r.moneyCents, r.fatigue,
      r.reputation, r.health ?? 0, r.awakeHours ?? 0].some(n => n !== 0)) fail();
    lastTime = r.elapsedMinutes + r.minutes;
    lastOpportunity = r.opportunity;
  }
}
