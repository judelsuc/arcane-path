export const DISCOVERY_VERSION = 1;
export const DISCOVERY_LIMIT = 20000;
export const DISCOVERY_TARGETS = Object.freeze(["parent-trail", "artifact", "abandoned-journal"]);
export const DISCOVERY_CHANNELS = Object.freeze(["npc", "search", "news", "collector", "dream", "notebook"]);

const AVAILABILITY = ["current", "historical", "unavailable"];
const ENTRY_FIELDS = ["targetType", "targetId", "targetRevision", "evidenceKey", "kind",
  "precision", "facts", "source", "observedMinutes", "channels", "availability", "contentVersion"];
const text = value => typeof value === "string" && value.length > 0 && value.length <= 500;
const object = value => value !== null && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

function fail() {
  throw new Error("Invalid discovery knowledge.");
}

function factValue(value) {
  return typeof value === "string" && value.length <= 1000 ||
    typeof value === "boolean" || value === null ||
    typeof value === "number" && Number.isFinite(value);
}

function validateEntry(entry, elapsedMinutes) {
  if (!object(entry) || Object.keys(entry).length !== ENTRY_FIELDS.length ||
      Object.keys(entry).some(key => !ENTRY_FIELDS.includes(key)) ||
      !DISCOVERY_TARGETS.includes(entry.targetType) ||
      !["targetId", "targetRevision", "evidenceKey", "kind", "precision", "source",
        "contentVersion"].every(key => text(entry[key])) ||
      !Number.isFinite(entry.observedMinutes) || entry.observedMinutes < 0 ||
      entry.observedMinutes > elapsedMinutes ||
      !AVAILABILITY.includes(entry.availability) ||
      !Array.isArray(entry.channels) || !entry.channels.length ||
      entry.channels.some(channel => !DISCOVERY_CHANNELS.includes(channel)) ||
      new Set(entry.channels).size !== entry.channels.length ||
      !object(entry.facts) || Object.keys(entry.facts).length > 16 ||
      Object.entries(entry.facts).some(([key, value]) =>
        !/^[a-z][a-zA-Z0-9]{0,39}$/.test(key) || !factValue(value))) fail();
}

export function discoveryIdentity(entry) {
  return JSON.stringify([entry.targetType, entry.targetId, entry.targetRevision,
    entry.evidenceKey, entry.precision]);
}

function factsIdentity(facts) {
  return JSON.stringify(Object.keys(facts).sort().map(key => [key, facts[key]]));
}

export function validateDiscovery(state) {
  if (state.discovery === undefined) return;
  const ledger = state.discovery;
  if (object(ledger) && ledger.version !== undefined && ledger.version !== DISCOVERY_VERSION) {
    throw new Error("Invalid discovery save version. Start a new journey or restore a compatible save.");
  }
  if (!Number.isFinite(state.elapsedMinutes) || state.elapsedMinutes < 0 ||
      !object(ledger) || Object.keys(ledger).length !== 2 ||
      ledger.version !== DISCOVERY_VERSION || !Array.isArray(ledger.entries) ||
      ledger.entries.length > DISCOVERY_LIMIT) fail();
  const identities = new Set();
  for (const entry of ledger.entries) {
    validateEntry(entry, state.elapsedMinutes);
    const id = discoveryIdentity(entry);
    if (identities.has(id)) fail();
    identities.add(id);
  }
}

export function discoveryEntries(state, { targetType, availability } = {}) {
  if (targetType !== undefined && !DISCOVERY_TARGETS.includes(targetType) ||
      availability !== undefined && !AVAILABILITY.includes(availability)) fail();
  return (state.discovery?.entries ?? []).filter(entry =>
    (targetType === undefined || entry.targetType === targetType) &&
    (availability === undefined || entry.availability === availability));
}

// Domain adapters authorize facts; this ledger never decides targets, costs or truth.
export function learnDiscovery(state, clues) {
  validateDiscovery(state);
  if (!Number.isFinite(state.elapsedMinutes) || state.elapsedMinutes < 0 || !Array.isArray(clues)) fail();
  const entries = [...(state.discovery?.entries ?? [])];
  const indices = new Map(entries.map((entry, index) => [discoveryIdentity(entry), index]));
  let changed = state.discovery === undefined;
  for (const clue of clues) {
    validateEntry(clue, state.elapsedMinutes);
    const id = discoveryIdentity(clue), index = indices.get(id);
    if (index === undefined) {
      if (entries.length === DISCOVERY_LIMIT) throw new Error("Discovery knowledge capacity reached.");
      indices.set(id, entries.length);
      entries.push(structuredClone(clue));
      changed = true;
      continue;
    }
    const previous = entries[index];
    if (previous.kind !== clue.kind || factsIdentity(previous.facts) !== factsIdentity(clue.facts)) {
      throw new Error("Conflicting discovery evidence; a new target or evidence revision is required.");
    }
    const channels = [...new Set([...previous.channels, ...clue.channels])];
    const earlier = clue.observedMinutes < previous.observedMinutes;
    if (channels.length !== previous.channels.length || earlier) {
      entries[index] = { ...previous, channels,
        ...(earlier ? { observedMinutes: clue.observedMinutes, source: clue.source,
          contentVersion: clue.contentVersion } : {}) };
      changed = true;
    }
  }
  return changed ? { ...state, discovery: { version: DISCOVERY_VERSION, entries } } : state;
}

export function reconcileDiscoveryAvailability(state, updates) {
  validateDiscovery(state);
  if (!Array.isArray(updates)) fail();
  const statuses = new Map();
  for (const update of updates) {
    if (!object(update)) fail();
    const { targetType, targetId, targetRevision, availability } = update;
    if (!DISCOVERY_TARGETS.includes(targetType) || !text(targetId) || !text(targetRevision) ||
        !AVAILABILITY.includes(availability)) fail();
    const key = JSON.stringify([targetType, targetId, targetRevision]);
    if (statuses.has(key) && statuses.get(key) !== availability) {
      throw new Error("Conflicting discovery availability.");
    }
    statuses.set(key, availability);
  }
  let changed = false;
  const entries = (state.discovery?.entries ?? []).map(entry => {
    const availability = statuses.get(JSON.stringify([entry.targetType, entry.targetId, entry.targetRevision]));
    if (availability === undefined || entry.availability === availability) return entry;
    changed = true;
    return { ...entry, availability };
  });
  return changed ? { ...state, discovery: { version: DISCOVERY_VERSION, entries } } : state;
}

export function updateDiscoveryAvailability(state, targetType, targetId, targetRevision, availability) {
  return reconcileDiscoveryAvailability(state, [{ targetType, targetId, targetRevision, availability }]);
}
