import { applyLoreAction, createArtifactProgress, deliverMoonDream, loreView, infoAt } from "./lore-engine.mjs";
import { advanceLegendSession, isTreasureSession, isExpandedLegendSession, replayLegendSession } from "./legend-session.mjs";
import { syncTreasures, treasureAction, awardTreasure } from "./legend-rewards.mjs";
import { mapIdentity, SAVE_VERSION, validateSave } from "./journey-save.mjs";
import { beginEquipment } from "./equipment.mjs";
import { beginPressures } from "./pressures.mjs";
import { synchronizeParentDiscovery } from "./discovery-targets.mjs";
import { learnDiscovery, reconcileDiscoveryAvailability } from "./discovery.mjs";
import { discoveryKnown } from "./discovery-policy.mjs";
import ARTIFACT_RUMOURS from "./public/artifact-rumours.json" with { type: "json" };
import { MAIN_ARTIFACT_WORLD } from "./lore-catalogue.mjs";
import { loreCell } from "./lore-map.mjs";
import { parentPath } from "./lore-knowledge.mjs";

export async function mainArtifactRequest(input) {
  const { genesis, map, journey, action, journalContext } = input;
  let { snapshot } = input;
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
  const treasureInstances = structuredClone(input.treasureInstances ?? []);
  if ((snapshot.artifactRevision ?? 0) !== (previous?.revision ?? 0)) {
    throw new Error("Artifact state changed; reload the current journey before continuing.");
  }
  if (previous && snapshot.elapsedMinutes < previous.state.elapsedMinutes) {
    throw new Error("The main journey predates its last artifact action. Start a new journey.");
  }
  const legendAction = ["legend-start", "legend-input", "legend-leave", "legend-finish", "legend-restart"].includes(action?.type);
  if (previous?.adventure?.status === "active") {
    if (action && !legendAction) throw new Error("Finish or leave the active legend adventure first.");
    if (snapshot.col !== previous.state.col || snapshot.row !== previous.state.row ||
        snapshot.elapsedMinutes !== previous.state.elapsedMinutes) {
      throw new Error("The journey moved during an active legend adventure.");
    }
    snapshot = previous.state;
  } else if (snapshot.legendAdventure) throw new Error("No matching authoritative legend adventure.");
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
    treasures: previous?.state.treasures ?? { version: 1, inventory: [], equipped: null },
    discovery: { version: 1, entries: [
      ...(snapshot.discovery?.entries ?? []).filter(entry => entry.targetType !== "artifact"), ...artifactEntries,
    ] },
    artifactWorld: MAIN_ARTIFACT_WORLD, artifactRevision: (previous?.revision ?? 0) + 1,
  }), genesis.economy));
  state = syncTreasures(state, treasureInstances, journey);
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
    revision: previous?.revision ?? 0, worldMinutes: input.worldMinutes + elapsed,
    ...(previous?.adventure ? { adventure: previous.adventure } : {}) };
  let result = { runtime, instances: input.instances };
  let treasureOutcome = null;
  let conversationClue;
  if (input.characterRumour) {
    const rumour = input.characterRumour, legend = ARTIFACT_RUMOURS[rumour.id];
    if (!legend) throw new Error("Unknown character artifact knowledge.");
    const clues = [{
      targetType: "artifact", targetId: rumour.id, targetRevision: "legend:1",
      evidenceKey: "legend", kind: "legend", precision: "text",
      facts: { artifact: rumour.id, fr: legend.fr, en: legend.en },
      source: "character-artifact-legend", observedMinutes: state.elapsedMinutes,
      channels: ["npc"], availability: "current", contentVersion: "template-v1",
    }];
    if (rumour.clue) {
      const instance = input.instances.find(item => item.id === rumour.id);
      if (!instance || rumour.clue.targetId !== rumour.id ||
          !["region", "town"].includes(rumour.clue.precision) ||
          Object.keys(rumour.clue.facts).some(key => !["artifact", "region", "place"].includes(key))) {
        throw new Error("Invalid character artifact lead.");
      }
      const current = instance.owner === null && String(instance.generation) === rumour.clue.targetRevision;
      if (!discoveryKnown(state, rumour.clue)) {
        conversationClue = { ...rumour.clue, observedMinutes: state.elapsedMinutes,
          availability: current ? "current" : "historical" };
        clues.push(conversationClue);
      }
    }
    state = learnDiscovery(state, clues);
    runtime.state = state;
  }
  if (legendAction) {
    result.runtime = advanceLegendSession(runtime, action, {
      definition: input.legendDefinition, runId: input.requestId, info: infoAt(map, state),
    });
    const session = result.runtime.adventure;
    if (action.type === "legend-finish" && session.status === "completed" &&
        isTreasureSession(session.contentVersion) && !result.runtime.state.ended) {
      const awarded = awardTreasure(result.runtime.state, treasureInstances, journey, session,
        input.legendReward ?? input.legendDefinition?.reward);
      result.runtime.state = awarded.state;
      treasureOutcome = { id: awarded.id, outcome: awarded.outcome };
      if (awarded.outcome !== "taken" && isExpandedLegendSession(session.contentVersion)) {
        const progress = replayLegendSession(session);
        const finds = progress.stashes.map(id => progress.level.rooms[id].stash);
        const cents = finds.filter(stash => stash.kind === "money").length * 100;
        const kcal = finds.filter(stash => stash.kind === "food").length * 150;
        const state = result.runtime.state;
        if (!Number.isSafeInteger(state.walletCents) || state.walletCents + cents > 1_000_000_000) {
          throw new Error("This purse cannot receive the secret stash.");
        }
        const reserveKcal = Math.min(genesis.survival.reserve_kcal, state.reserveKcal + kcal);
        result.runtime.state = { ...state, walletCents: state.walletCents + cents, reserveKcal };
        treasureOutcome.stash = { cents, foodKcal: reserveKcal - state.reserveKcal };
      }
    }
  } else if (action?.type === "cache-open") {
    const cache = input.geocache;
    if (!cache || cache.id !== action.cacheId) throw new Error("No available OpenCaching cache at this location.");
    result.runtime.state = treasureAction(state, treasureInstances, journey, map,
      { type: "treasure-unlock", id: action.lockpick });
    const cents = cache.cents;
    if (!Number.isSafeInteger(cents) || cents < 200 || cents > 600 ||
        result.runtime.state.walletCents + cents > 1_000_000_000) throw new Error("Invalid cache reward.");
    result.runtime.state.walletCents += cents;
    result.runtime.revision++;
  } else if (action?.type?.startsWith("treasure-")) {
    result.runtime.state = treasureAction(state, treasureInstances, journey, map, action, input.instances);
    result.runtime.revision++;
  } else if (action) {
    result = await applyLoreAction(runtime, input.instances, journey, map, action,
      { nowMillis: input.nowMillis, journalContext });
  } else {
    runtime.revision++;
  }
  state = result.runtime.state;
  if (state.ended) {
    const last = state.lore.lastSettlement;
    for (const item of treasureInstances.filter(item => item.owner === journey)) {
      Object.assign(item, { owner: null, placement: null, col: last.col, row: last.row, place: last.town });
    }
  }
  state = syncTreasures(state, treasureInstances, journey);
  result.runtime.state = state;
  if (state.ended && result.instances.some(item => item.owner === journey)) {
    result = await applyLoreAction({ ...result.runtime, state: { ...state, ended: null } },
      result.instances, journey, map, { type: "abandon" }, { nowMillis: input.nowMillis, journalContext });
    result.runtime.state.ended = state.ended;
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
  return { ...result, treasureInstances, view: { ...view, world: MAIN_ARTIFACT_WORLD, revision: result.runtime.revision, state,
    treasures: { offers: treasureInstances.filter(item => item.owner === null && !item.consumed &&
      item.col === state.col && item.row === state.row).map(({ id, place, reward }) =>
      ({ id, place, ...(reward ? { reward } : {}) })),
    result: treasureOutcome },
    caches: { offers: (input.geocacheOffers ?? []).filter(cache => cache.id !== input.geocache?.id),
      opened: input.geocache ? { id: input.geocache.id, cents: input.geocache.cents } : null },
    adventure: result.runtime.adventure ?? null,
    conversationRumour: input.characterRumour ? { artifactId: input.characterRumour.id,
      characterId: input.characterRumour.characterId,
      clueRevision: conversationClue?.targetRevision ?? null,
      cluePrecision: conversationClue?.precision ?? null } : null } };
}
