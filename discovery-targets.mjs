import { discoveryEntries, learnDiscovery, reconcileDiscoveryAvailability } from "./discovery.mjs";
import { fieldClueFacts, fieldSearchRules } from "./trail-search.mjs";

function clue(targetType, targetId, targetRevision, evidenceKey, kind, precision,
  facts, observedMinutes, channel, source) {
  return { targetType, targetId, targetRevision, evidenceKey, kind, precision, facts,
    observedMinutes, channels: [channel], source, availability: "current",
    contentVersion: "template-v1" };
}

export function parentDiscoveryCandidates(state) {
  if (!state.trail?.exploration || state.trail.completed || state.ended) return [];
  const { precision } = fieldSearchRules(state), stage = state.trail.index;
  const target = state.trail.stages[stage];
  const meters = Math.hypot(state.col - target.col, state.row - target.row) * 250;
  const kinds = precision === "precise" ? ["place"] : ["prefix"];
  return kinds.map(kind => ({
    priority: 0, distanceMeters: meters,
    dreamProximity: precision === "precise" ? 1 : precision === "partial" ? 0.5 : 0,
    clue: clue("parent-trail", `stage:${stage}`, `trail:${state.trail.version}`,
      kind === "place" ? "destination" : `field:${kind}`, kind, precision,
      fieldClueFacts(state, { stage, kind, precision, col: state.col, row: state.row }),
      state.elapsedMinutes, "search", "parent-discovery"),
  }));
}

export function journalDiscoveryCandidates(state, context) {
  if (!context || context.col !== state.col || context.row !== state.row || state.ended) return [];
  return context.rumours.map(({ id, parent, distanceMeters }) => {
    if (!/^[a-f0-9]{32}$/.test(id) || typeof parent !== "string" || parent.length > 200 ||
        !Number.isFinite(distanceMeters) || distanceMeters < 0 || distanceMeters > 200) {
      throw new Error("Invalid authorized journal rumour.");
    }
    return { priority: 0, distanceMeters, dreamProximity: 1,
      clue: clue("abandoned-journal", id, "publication:1", "nearby", "rumour", "local",
        { parent, observedCol: state.col, observedRow: state.row },
        state.elapsedMinutes, "news", "journal-service") };
  });
}

export function synchronizeParentDiscovery(state) {
  const trail = state.trail;
  if (!trail) return state;
  const exploration = trail.exploration;
  const clues = [];
  const parentClue = (stage, key, kind, precision, facts, minutes, channel, source) => {
    if (!Number.isInteger(stage) || stage < 0 || stage >= trail.stages.length ||
        stage > trail.index) throw new Error("Invalid parent discovery stage.");
    clues.push(clue("parent-trail", `stage:${stage}`, `trail:${trail.version}`,
      key, kind, precision, facts, minutes, channel, source));
  };
  if (!trail.completed && (!exploration || exploration.knownStage === trail.index)) {
    parentClue(trail.index, "destination", "place", "precise",
      { place: trail.stages[trail.index].name }, state.elapsedMinutes, "notebook", "parent-known-stage");
  }
  if (trail.discovery?.pending) {
    parentClue(trail.index, "venue", "venue", "local",
      { venue: trail.discovery.venue }, trail.discovery.elapsedMinutes, "npc", "parent-witness");
  }
  for (const hint of exploration?.hints ?? []) {
    if (!["place", "prefix", "direction", "photo"].includes(hint.kind)) {
      throw new Error("Invalid parent discovery clue.");
    }
    parentClue(hint.stage, hint.kind === "place" ? "destination" : `field:${hint.kind}`,
      hint.kind, hint.precision, fieldClueFacts(state, hint), hint.elapsedMinutes,
      hint.channel ?? "notebook", hint.channel === "search" ? "parent-field-search"
        : hint.channel === "npc" ? "parent-stage-witness" : "parent-record");
  }
  for (const sign of exploration?.signs ?? []) {
    parentClue(sign.stage, `sign:${sign.col}:${sign.row}:${sign.elapsedMinutes}`, "sign", "vague",
      { sign: true }, sign.elapsedMinutes, "search", "parent-field-sign");
  }
  for (const report of exploration?.reports ?? []) {
    if (report.outcome !== "suggestion") continue;
    const facts = { place: report.town.name, latitude: report.town.latitude,
      longitude: report.town.longitude, confirmed: false };
    parentClue(report.stage, JSON.stringify(["report", report.kind, report.precision,
      report.town.name, report.town.latitude, report.town.longitude]), "suggestion",
    report.precision, facts, report.elapsedMinutes, "npc", "parent-recognition");
  }
  for (const [index, facts] of trail.history.entries()) {
    // Progressive witnesses earn the field clue above, not their hidden next town.
    if (!facts.next || exploration && index >= exploration.firstStage) continue;
    parentClue(index + 1, "destination", "place", "precise", { place: facts.next.name },
      facts.elapsedMinutes ?? state.elapsedMinutes, "npc", facts.elapsedMinutes === undefined
        ? "undated-parent-record" : "parent-witness");
  }
  const next = learnDiscovery(state, clues), updates = [];
  for (const entry of discoveryEntries(next, { targetType: "parent-trail", availability: "current" })) {
    const stage = Number(entry.targetId.slice("stage:".length));
    if (stage < trail.index || trail.completed) {
      updates.push({ targetType: entry.targetType, targetId: entry.targetId,
        targetRevision: entry.targetRevision, availability: "historical" });
    }
  }
  return reconcileDiscoveryAvailability(next, updates);
}

function validateJournal(journal) {
  if (!journal || !/^[a-f0-9]{32}$/.test(journal.id) ||
      typeof journal.parent !== "string" || journal.parent.length > 200 ||
      !Array.isArray(journal.history) || journal.history.length > 13 ||
      journal.history.some(place => typeof place !== "string" || place.length > 200) ||
      !Array.isArray(journal.stages) || journal.stages.length < 1 || journal.stages.length > 13 ||
      !Number.isInteger(journal.step) || journal.step < 0 || journal.step >= journal.stages.length ||
      typeof journal.delivered !== "boolean" || journal.stages.some(stage =>
        typeof stage?.name !== "string" || stage.name.length > 200 ||
        !Number.isFinite(stage.latitude) || Math.abs(stage.latitude) > 90 ||
        !Number.isFinite(stage.longitude) || Math.abs(stage.longitude) > 180)) {
    throw new Error("Invalid journal discovery response.");
  }
}

export function applyJournalDiscovery(state, sidequests, nearby, observedMinutes = state.elapsedMinutes) {
  if (!Array.isArray(sidequests) || sidequests.length > 1000 ||
      !Array.isArray(nearby) || nearby.length > 100 ||
      !Number.isFinite(observedMinutes) || observedMinutes < 0 ||
      observedMinutes > state.elapsedMinutes) throw new Error("Invalid journal discovery response.");
  for (const journal of [...sidequests, ...nearby]) validateJournal(journal);
  if (new Set([...sidequests, ...nearby].map(journal => journal.id)).size !== sidequests.length + nearby.length) {
    throw new Error("Duplicate journal discovery response.");
  }
  const clues = [];
  for (const journal of nearby) {
    clues.push(clue("abandoned-journal", journal.id, "publication:1", "nearby",
      "rumour", "local", { parent: journal.parent }, observedMinutes, "news", "journal-service"));
  }
  for (const journal of sidequests) {
    const target = journal.stages[journal.step];
    clues.push(clue("abandoned-journal", journal.id, `step:${journal.step}`, "destination",
      "place", "precise", { parent: journal.parent, place: target.name,
        latitude: target.latitude, longitude: target.longitude },
      observedMinutes, "notebook", "journal-service"));
  }
  const publicQuests = sidequests.map(journal => ({
    id: journal.id, parent: journal.parent, history: [...journal.history],
    stages: journal.stages.map(({ name, latitude, longitude }) => ({ name, latitude, longitude })),
    step: journal.step, delivered: journal.delivered,
  }));
  const next = learnDiscovery({ ...state, sidequests: publicQuests }, clues), updates = [];
  const held = new Map(sidequests.map(journal => [journal.id, journal]));
  const visible = new Set(nearby.map(journal => journal.id));
  for (const entry of discoveryEntries(next, { targetType: "abandoned-journal" })) {
    const quest = held.get(entry.targetId);
    const availability = quest
      ? quest.delivered || entry.targetRevision !== `step:${quest.step}` ? "historical" : "current"
      : visible.has(entry.targetId) && entry.targetRevision === "publication:1" ? "current" : "unavailable";
    updates.push({ targetType: entry.targetType, targetId: entry.targetId,
      targetRevision: entry.targetRevision, availability });
  }
  return reconcileDiscoveryAvailability(next, updates);
}
