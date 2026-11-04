import { citedTowns } from "./directions.mjs";
import { discoveryEntries } from "./discovery.mjs";

export function questObjectives(state) {
  const objectives = [];
  if (state.trail && !state.trail.completed) {
    const town = citedTowns(state).find(target => target.stage === state.trail.index);
    objectives.push({ id: "parent", category: "parent", name: state.trail.parentName,
      destination: town?.name, target: town ?? null });
  }
  for (const quest of state.serviceQuests?.quests ?? []) {
    if (quest.status !== "active") continue;
    const poi = quest.destinations[quest.step];
    objectives.push({ id: `service:${quest.id}`, category: "services",
      name: poi.name, destination: poi.town, target: poi });
  }
  for (const quest of state.sidequests ?? []) {
    if (quest.delivered) continue;
    const town = quest.stages[quest.step];
    objectives.push({ id: `journal:${quest.id}`, category: "journals",
      name: quest.parent, destination: town.name, target: town });
  }
  const artifacts = new Map();
  const owned = new Set((state.lore?.inventory ?? []).map(item => item.id));
  for (const entry of discoveryEntries(state, { targetType: "artifact", availability: "current" })) {
    if (entry.kind !== "location" || owned.has(entry.targetId)) continue;
    const prior = artifacts.get(entry.targetId);
    const ranks = { region: 0, town: 1, marker: 2, local: 3 };
    if (prior && (ranks[prior.precision] ?? -1) >= (ranks[entry.precision] ?? -1)) continue;
    artifacts.set(entry.targetId, entry);
  }
  for (const [id, entry] of artifacts) {
    const exact = entry.precision === "local" && Number.isSafeInteger(entry.facts.col) && Number.isSafeInteger(entry.facts.row);
    objectives.push({ id: `artifact:${id}`, category: "artifacts", name: id,
      destination: entry.facts.place ?? entry.facts.region, target: exact ? { ...entry.facts, name: id } : null });
  }
  return objectives;
}

export function followQuest(state, id) {
  if (id !== null && !questObjectives(state).some(objective => objective.id === id)) {
    throw new Error("This quest objective is not known or is no longer active.");
  }
  return { ...state, questTracking: id };
}

export function followedQuest(state) {
  const id = state.questTracking === undefined && state.serviceQuests?.tracked
    ? `service:${state.serviceQuests.tracked}` : state.questTracking;
  return questObjectives(state).find(objective => objective.id === id) ?? null;
}

export function validateQuestTracking(state) {
  const id = state.questTracking;
  if (id !== undefined && id !== null && (typeof id !== "string" || !/^(parent|(?:service|journal):[a-f0-9]{32}|artifact:[a-z]+)$/.test(id))) {
    throw new Error("Invalid saved quest tracking.");
  }
}

export function objectiveCell(target, map) {
  if (!target) return null;
  if (Number.isSafeInteger(target.col) && Number.isSafeInteger(target.row)) return { col: target.col, row: target.row };
  if (!Number.isFinite(target.latitude) || !Number.isFinite(target.longitude)) return null;
  const latitudeStep = map.cellSizeMeters / 6371008.8 * 180 / Math.PI;
  const projection = map.projectionLatitude ?? (map.bounds.minLatitude + map.bounds.maxLatitude) / 2;
  return { col: Math.floor((target.longitude - map.bounds.minLongitude) /
    (latitudeStep / Math.cos(projection * Math.PI / 180))),
  row: Math.floor((map.bounds.maxLatitude - target.latitude) / latitudeStep) };
}
