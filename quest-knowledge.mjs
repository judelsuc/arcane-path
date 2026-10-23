import { citedTowns } from "./directions.mjs";
import { discoveryEntries } from "./discovery.mjs";

export function questDirectionTargets(state) {
  const targets = new Map();
  function add(target) {
    if (!target || typeof target.name !== "string" || !Number.isFinite(target.latitude) ||
        Math.abs(target.latitude) > 90 || !Number.isFinite(target.longitude) ||
        Math.abs(target.longitude) > 180) return;
    const previous = targets.get(target.key);
    targets.set(target.key, previous ? { ...previous,
      references: [...new Set([...previous.references, ...target.references])] } : target);
  }
  for (const town of citedTowns(state)) add({ ...town, references: ["parent"] });
  for (const quest of state.serviceQuests?.quests ?? []) {
    if (quest.status !== "active") continue;
    for (const [index, poi] of quest.destinations.entries()) {
      if (index < quest.step) continue;
      add({ ...poi, key: `poi:${poi.id}`, status: "known",
        references: [`service:${quest.id}:${index + 1}`] });
    }
  }
  for (const journal of state.sidequests ?? []) {
    if (journal.delivered) continue;
    const town = journal.stages[journal.step];
    add({ ...town, key: `journal:${journal.id}:${journal.step}`,
      status: "known", references: [`journal:${journal.parent}`] });
  }
  for (const clue of discoveryEntries(state)) {
    if (clue.targetType === "parent-trail" || clue.availability !== "current") continue;
    const facts = clue.facts;
    // Only explicit earned coordinates qualify. A region or marker is not a pin.
    if (!["place", "location"].includes(clue.kind)) continue;
    add({ name: facts.place ?? facts.region, latitude: facts.latitude, longitude: facts.longitude,
      key: `evidence:${clue.targetType}:${clue.targetId}:${clue.targetRevision}`,
      status: "suggested", references: [`${clue.targetType}:${clue.targetId}`] });
  }
  return [...targets.values()];
}

export function recordQuestDirections(state, target, text, language) {
  if (!questDirectionTargets(state).some(candidate => candidate.key === target.key) ||
      !["en", "fr"].includes(language) || typeof text !== "string" || text.length > 1500) {
    throw new Error("Invalid earned directions.");
  }
  const entries = state.questDirections ?? [];
  return { ...state, questDirections: [...entries, { key: target.key, name: target.name,
    references: target.references, text, language, elapsedMinutes: state.elapsedMinutes }].slice(-1000) };
}

export function validateQuestDirections(state) {
  if (state.questDirections === undefined) return;
  if (!Array.isArray(state.questDirections) || state.questDirections.length > 1000 ||
      state.questDirections.some(entry => !entry || !["key", "name", "text"].every(key =>
        typeof entry[key] === "string" && entry[key].length > 0 && entry[key].length <= 1500) ||
        !["fr", "en"].includes(entry.language) || !Array.isArray(entry.references) ||
        entry.references.length > 100 || entry.references.some(value => typeof value !== "string" || value.length > 300) ||
        !Number.isFinite(entry.elapsedMinutes) || entry.elapsedMinutes < 0 ||
        entry.elapsedMinutes > state.elapsedMinutes)) throw new Error("Invalid saved quest directions.");
}
