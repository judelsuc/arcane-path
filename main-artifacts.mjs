import { applyLoreAction, createArtifactProgress, deliverMoonDream, loreView } from "./lore-engine.mjs";
import { mapIdentity, SAVE_VERSION, validateSave } from "./journey-save.mjs";
import { beginEquipment } from "./equipment.mjs";
import { beginPressures } from "./pressures.mjs";
import { synchronizeParentDiscovery } from "./discovery-targets.mjs";
import { reconcileDiscoveryAvailability } from "./discovery.mjs";
import { MAIN_ARTIFACT_WORLD } from "./lore-catalogue.mjs";
import { loreCell } from "./lore-map.mjs";
import { parentPath } from "./lore-knowledge.mjs";

export async function mainArtifactRequest(input) {
  const { genesis, map, journey, snapshot, action, journalContext } = input;
  validateSave({ version: SAVE_VERSION, region: genesis.region, mapIdentity: mapIdentity(map),
    revision: 1, savedAt: new Date(input.nowMillis).toISOString(), state: snapshot,
    survival: genesis.survival, economy: genesis.economy });
  if (snapshot.serverJourney?.id !== journey || snapshot.startedAt !== genesis.state.startedAt ||
      snapshot.performancePending || snapshot.cafePending || snapshot.theftPending ||
      snapshot.miniGamePending || snapshot.events?.pending ||
      snapshot.transport?.booking?.status === "active" || snapshot.equipment?.dogEncounter === "pending") {
    throw new Error("Artifact interactions require the current, unoccupied main journey.");
  }
  const previous = input.runtime;
  if ((snapshot.artifactRevision ?? 0) !== (previous?.revision ?? 0)) {
    throw new Error("Artifact state changed; reload the current journey before continuing.");
  }
  if (previous && snapshot.elapsedMinutes < previous.state.elapsedMinutes) {
    throw new Error("The main journey predates its last artifact action. Start a new journey.");
  }
  const lore = previous ? structuredClone(previous.state.lore) : createArtifactProgress(snapshot, map);
  const elapsed = snapshot.elapsedMinutes - (previous?.state.elapsedMinutes ?? snapshot.elapsedMinutes);
  if (lore.effects) {
    const remainingMeters = lore.effects.remainingMeters -
      Math.max(0, snapshot.distanceMeters - previous.state.distanceMeters);
    lore.effects = remainingMeters > 0 && lore.effects.expiresMinutes > snapshot.elapsedMinutes
      ? { ...lore.effects, remainingMeters } : null;
  }
  for (const id of Object.keys(lore.protections ?? {})) {
    if (!snapshot.lore?.protections?.[id]) delete lore.protections[id];
  }
  // Normal travel remains client-owned; artifact custody and learned artifact facts do not.
  const artifactEntries = previous?.state.discovery?.entries.filter(entry => entry.targetType === "artifact") ?? [];
  let state = synchronizeParentDiscovery(beginPressures(beginEquipment({
    ...structuredClone(snapshot), lore,
    discovery: { version: 1, entries: [
      ...(snapshot.discovery?.entries ?? []).filter(entry => entry.targetType !== "artifact"), ...artifactEntries,
    ] },
    artifactWorld: MAIN_ARTIFACT_WORLD, artifactRevision: (previous?.revision ?? 0) + 1,
  }), genesis.economy));
  state.lore.paidMeals = Math.max(lore.paidMeals ?? 0, state.meals);
  state.lore.sleptSixty = Math.max(lore.sleptSixty ?? 0, state.sleeps);
  state.lore.earnedActivities = Math.max(lore.earnedActivities ?? 0, state.performances ?? 0,
    state.cafeShifts ?? 0, state.journeyMiniGamesPlayed ?? 0,
    state.serviceQuests?.quests.filter(quest => quest.status === "completed").length ?? 0);
  state.lore.testimonyTowns = [...new Set([...(lore.testimonyTowns ?? []),
    ...state.trail.history.map(entry => entry.place).filter(Boolean)])];
  if (previous && elapsed > 0 && state.lastExpenseCents > 0) {
    const cents = Math.min(state.lastExpenseCents, previous.state.walletCents - state.walletCents);
    if (cents > 0) {
      state.lore.debits = [...(lore.debits ?? []), { id: `main:${previous.revision}:${state.elapsedMinutes}`,
        observedMinutes: state.elapsedMinutes, cents, reclaimedCents: 0, kind: "ordinary" }];
      state.lore.paidActions = (lore.paidActions ?? 0) + 1;
    }
  }
  const visits = new Map((lore.visitedSettlements ?? []).map(visit => [`${visit.col},${visit.row}`, visit]));
  for (const visit of snapshot.lore?.visitedSettlements ?? []) {
    const cell = loreCell(map, visit.col, visit.row);
    if (cell?.terrain !== "place" || !cell.settlements?.some(place => place.name === visit.town) ||
        !Number.isFinite(visit.observedMinutes) || visit.observedMinutes < 0 || visit.observedMinutes > state.elapsedMinutes) {
      throw new Error("Invalid personally visited settlement.");
    }
    visits.set(`${visit.col},${visit.row}`, visit);
  }
  state.lore.visitedSettlements = [...visits.values()];
  if (previous && snapshot.sleeps > previous.state.sleeps) {
    state = deliverMoonDream(previous.state, state, input.instances, journalContext);
  }
  if (previous?.state.lore.compass && snapshot.distanceMeters > previous.state.distanceMeters) {
    const before = parentPath(previous.state, map), after = parentPath(state, map);
    const minutes = snapshot.lastMove?.minutes ?? elapsed, compass = lore.compass;
    const usable = minutes <= compass.remainingMinutes;
    const signal = !usable ? null : !before || !after ? "unavailable" :
      after.distanceMeters < before.distanceMeters ? "warmer" :
        after.distanceMeters > before.distanceMeters ? "colder" : "unchanged";
    state.lore.compass = compass.remainingMinutes > minutes
      ? { ...compass, remainingMinutes: compass.remainingMinutes - minutes, signal } : null;
    state.lore.compassReceipts = [...(lore.compassReceipts ?? []),
      { revision: (previous?.revision ?? 0) + 1, minutes, signal, stage: compass.stage }];
  }
  const runtime = { state, economy: genesis.economy, survival: genesis.survival,
    revision: previous?.revision ?? 0, worldMinutes: input.worldMinutes + elapsed };
  let result = { runtime, instances: input.instances };
  if (action) {
    result = await applyLoreAction(runtime, input.instances, journey, map, action,
      { nowMillis: input.nowMillis, journalContext });
  } else {
    runtime.revision++;
    const weights = input.instances.filter(item => item.owner === journey);
    if (state.ended && weights.length) {
      result = await applyLoreAction({ ...runtime, state: { ...state, ended: null } },
        input.instances, journey, map, { type: "abandon" }, { nowMillis: input.nowMillis, journalContext });
      result.runtime.state.ended = state.ended;
    }
  }
  state = result.runtime.state;
  state.artifactRevision = result.runtime.revision;
  const view = loreView(result.runtime, result.instances, journey, map, { nowMillis: input.nowMillis, journalContext });
  state.lore.carriedGrams = view.state.lore.carriedGrams;
  state.lore.inventory = result.instances.filter(item => item.owner === journey)
    .map(({ id, placement, cooldownUntil }) => ({ id, placement, cooldownUntil }));
  state = reconcileDiscoveryAvailability(state, view.state.discovery.entries.filter(entry => entry.targetType === "artifact")
    .map(({ targetType, targetId, targetRevision, availability }) => ({ targetType, targetId, targetRevision, availability })));
  const step = map.cellSizeMeters / 6371008.8 * 180 / Math.PI;
  const projection = map.projectionLatitude ?? (map.bounds.minLatitude + map.bounds.maxLatitude) / 2;
  state.discovery.entries = state.discovery.entries.map(entry =>
    entry.targetType === "artifact" && entry.precision === "local" && entry.kind === "location" ? {
      ...entry, facts: { ...entry.facts,
        latitude: map.bounds.maxLatitude - (entry.facts.row + 0.5) * step,
        longitude: map.bounds.minLongitude + (entry.facts.col + 0.5) * step / Math.cos(projection * Math.PI / 180) },
    } : entry);
  result.runtime.state = state;
  validateSave({ version: SAVE_VERSION, region: genesis.region, mapIdentity: mapIdentity(map),
    revision: 1, savedAt: new Date(input.nowMillis).toISOString(), state,
    survival: genesis.survival, economy: genesis.economy });
  return { ...result, view: { ...view, world: MAIN_ARTIFACT_WORLD, revision: result.runtime.revision, state } };
}
