import { agendaClock } from "../../agenda-clock.mjs";
import { journeyDate } from "../../travel.mjs";

export const LIMITS = Object.freeze({
  records: 128, bytes: 262144, radiusMeters: 50000,
  durationMs: 62 * 86400000, sourceLifetimeMs: 7 * 86400000,
  encounters: 128, delayMinutes: 1440,
});
const agendas = new WeakSet();
const fail = message => { throw new Error(`Living world: ${message}`); };
const finite = value => typeof value === "number" && Number.isFinite(value);
const text = (value, max = 240) => typeof value === "string" &&
  value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f]/u.test(value);
const instant = value => finite(value) && Number.isFinite(new Date(value).getTime());
const id = value => typeof value === "string" && /^[a-zA-Z0-9._:-]{1,80}$/u.test(value);
const freeze = object => {
  for (const value of Object.values(object)) if (value && typeof value === "object") freeze(value);
  return Object.freeze(object);
};

function positionValid(position) {
  return position && finite(position.lat) && Math.abs(position.lat) <= 90 &&
    finite(position.lon) && Math.abs(position.lon) <= 180;
}

function urlValid(value) {
  if (!text(value, 2048)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

/** Explicit, offline import adapter. It never fetches or invents public events. */
export function importAgenda(input, { allowSynthetic = false } = {}) {
  let encoded;
  try { encoded = JSON.stringify(input); } catch { fail("invalid JSON"); }
  if (!encoded || new TextEncoder().encode(encoded).length > LIMITS.bytes) fail("input too large");
  const data = JSON.parse(encoded);
  if (!data || data.version !== 1 || !instant(data.importedAt) ||
      !Array.isArray(data.records) || data.records.length > LIMITS.records) fail("invalid import");
  const seen = new Set();
  const records = data.records.map(record => {
    if (!record || !id(record.id) || !["event", "disruption"].includes(record.kind) ||
        !["public", "synthetic"].includes(record.reality) ||
        (record.reality === "synthetic" && !allowSynthetic) ||
        !text(record.title?.fr) || !text(record.title?.en) ||
        !instant(record.startsAt) || !instant(record.endsAt) ||
        record.endsAt <= record.startsAt || record.endsAt - record.startsAt > LIMITS.durationMs ||
        !positionValid(record.area) || !finite(record.area.radiusMeters) ||
        record.area.radiusMeters <= 0 || record.area.radiusMeters > LIMITS.radiusMeters) fail("invalid record");
    const source = record.source;
    if (!source || !id(source.id) || !text(source.name) || !urlValid(source.url) ||
        !instant(source.observedAt) || !instant(source.validUntil) ||
        source.observedAt > data.importedAt || source.validUntil <= source.observedAt ||
        source.validUntil - source.observedAt > LIMITS.sourceLifetimeMs) fail("invalid source provenance");
    const key = JSON.stringify([source.id, record.id, record.startsAt]);
    if (seen.has(key)) fail("duplicate occurrence");
    seen.add(key);
    const result = {
      id: record.id, key, kind: record.kind, reality: record.reality,
      title: { fr: record.title.fr, en: record.title.en },
      startsAt: record.startsAt, endsAt: record.endsAt,
      area: { lat: record.area.lat, lon: record.area.lon, radiusMeters: record.area.radiusMeters },
      source: { id: source.id, name: source.name, url: source.url,
        observedAt: source.observedAt, validUntil: source.validUntil },
    };
    if (record.kind === "disruption") {
      const change = record.transport;
      if (!change || !["tripId", "routeId", "stopId"].some(field => change[field] !== undefined) ||
          !["tripId", "routeId", "stopId"].every(field => change[field] === undefined || id(change[field])) ||
          !((change.cancelled === true && change.delayMinutes === undefined) ||
            (change.cancelled === undefined && finite(change.delayMinutes) &&
             change.delayMinutes >= 0 && change.delayMinutes <= LIMITS.delayMinutes))) fail("invalid disruption");
      result.transport = {};
      for (const field of ["tripId", "routeId", "stopId", "cancelled", "delayMinutes"]) {
        if (change[field] !== undefined) result.transport[field] = change[field];
      }
    }
    return result;
  });
  records.sort((a, b) => a.startsAt - b.startsAt || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const agenda = freeze({ version: 1, importedAt: data.importedAt, records });
  agendas.add(agenda);
  return agenda;
}

export function calendar(journey, locale = "fr") {
  if (!journey || !instant(journey.startedAt) || !finite(journey.elapsedMinutes) ||
      journey.elapsedMinutes < 0 || !instant(journey.startedAt + journey.elapsedMinutes * 60000)) fail("invalid journey clock");
  return agendaClock(journeyDate(journey), locale === "en" ? "en" : "fr");
}

function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const sine = Math.sin((b.lat - a.lat) * rad / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, sine))));
}

/** One canonical selection for agenda, encounters and transport. No wall-clock reads. */
export function localAgenda(agenda, { journey, position }) {
  if (!agendas.has(agenda)) fail("use importAgenda first");
  const now = Date.parse(calendar(journey).iso);
  if (!positionValid(position)) fail("invalid geographic position");
  return agenda.records.filter(record =>
    record.startsAt <= now && now < record.endsAt &&
    record.source.observedAt <= now && now < record.source.validUntil &&
    distanceMeters(position, record.area) <= record.area.radiusMeters);
}

export function transportDisruptions(agenda, context) {
  return localAgenda(agenda, context).filter(record => record.kind === "disruption")
    .map(record => ({ id: record.key,
      startsAt: Math.max(record.startsAt, record.source.observedAt),
      endsAt: Math.min(record.endsAt, record.source.validUntil),
      ...record.transport }));
}

export function emptyEncounterState(journey) {
  calendar(journey);
  return { version: 1, startedAt: journey.startedAt, entries: [] };
}

/** Validate persisted state before use; no timers, random draws or hidden effects. */
export function restoreEncounterState(input, journey) {
  calendar(journey);
  if (!input || input.version !== 1 || input.startedAt !== journey.startedAt ||
      !Array.isArray(input.entries) || input.entries.length > LIMITS.encounters) fail("invalid encounter save");
  const keys = new Set();
  const entries = input.entries.map(entry => {
    if (!entry || !text(entry.key, 240) || keys.has(entry.key) ||
        !finite(entry.firstSeenMinute) || entry.firstSeenMinute < 0 ||
        entry.firstSeenMinute > journey.elapsedMinutes || typeof entry.acknowledged !== "boolean") fail("invalid encounter entry");
    keys.add(entry.key);
    return { key: entry.key, firstSeenMinute: entry.firstSeenMinute, acknowledged: entry.acknowledged };
  });
  return { version: 1, startedAt: journey.startedAt, entries };
}

export function encounterAgenda(agenda, context, saved = emptyEncounterState(context.journey)) {
  const state = restoreEncounterState(saved, context.journey);
  const active = localAgenda(agenda, context);
  for (const record of active) {
    if (!state.entries.some(entry => entry.key === record.key) && state.entries.length < LIMITS.encounters) {
      state.entries.push({ key: record.key, firstSeenMinute: context.journey.elapsedMinutes, acknowledged: false });
    }
  }
  return {
    state,
    encounters: active.flatMap(record => {
      const entry = state.entries.find(item => item.key === record.key);
      return entry ? [{ record, ...entry }] : [];
    }),
    saturated: active.some(record => !state.entries.some(entry => entry.key === record.key)),
  };
}

export function acknowledgeEncounter(agenda, context, saved, key) {
  const state = restoreEncounterState(saved, context.journey);
  if (!localAgenda(agenda, context).some(record => record.key === key)) fail("occurrence not active here");
  const entry = state.entries.find(item => item.key === key);
  if (!entry) fail("occurrence not encountered");
  entry.acknowledged = true;
  return state;
}
