import { ITEMS, CAPACITY_GRAMS, beginEquipment } from "./equipment.mjs";
import { firstPlacement, restorePlacements, fits } from "./equipment-inventory.mjs";
import { restSurvival, walkSurvival } from "./survival.mjs";
import { finishAction, restEconomy, sleepEconomy, buyMeal, mealOffers, actionInterrupted } from "./economy.mjs";
import { beginPressures, policePresence, refreshPressureTarot } from "./pressures.mjs";
import { beginExploration, prepareFieldSearch, applyFieldSearch } from "./trail-search.mjs";
import { synchronizeParentDiscovery, parentDiscoveryCandidates, journalDiscoveryCandidates } from "./discovery-targets.mjs";
import { discoveryIdentity, learnDiscovery, reconcileDiscoveryAvailability } from "./discovery.mjs";
import { deliverAutomaticDiscovery, selectDiscoveryCandidate, discoveryKnown } from "./discovery-policy.mjs";
import { loreItem, LORE_ITEMS, LORE_WORLD } from "./lore-catalogue.mjs";
import { publicDreams, settleDream, validateDreams } from "./discovery-dreams.mjs";
import { grantInterpretation, interpretationOffer, plainGuidancePermitted,
  validateInterpretations } from "./discovery-interpretation.mjs";
import { recordTrailArrival } from "./trail.mjs";
import { journeyDate } from "./travel.mjs";
import { HEALTH } from "./health.mjs";
import { activePower, armPower, cancelPower, validateLoreEffects } from "./lore-effects.mjs";
import { inscriptionEntries, thread, fragmentOptions, learnFragments, parentTruth, revealTruth,
  parentPath, worldTargets, refundableDebits, knownParentLanding } from "./lore-knowledge.mjs";
import { workOffer, earningOffers, workView, startWork, answerWork, magicWork } from "./lore-work.mjs";
import { askDirections } from "./directions.mjs";
import { fieldClueFacts } from "./trail-search.mjs";
import { TAROT_CARDS } from "./tarot-cards.mjs";
import { loreCell, loreViewport } from "./lore-map.mjs";

const PACKING = [...ITEMS, ...LORE_ITEMS];
function artifactWeight(instances, journey) {
  return instances.filter(instance => instance.owner === journey)
    .reduce((sum, instance) => sum + loreItem(instance.id).grams, 0);
}

function cellAt(map, col, row) {
  const cell = loreCell(map, col, row);
  if (!Number.isSafeInteger(col) || !Number.isSafeInteger(row) || !cell || cell.unavailable) {
    throw new Error("This cell is not prepared. Prepare the route or load nearby terrain before moving.");
  }
  return cell;
}

function infoAt(map, state) {
  const step = map.cellSizeMeters / 6371008.8 * 180 / Math.PI;
  const projection = map.projectionLatitude ?? (map.bounds.minLatitude + map.bounds.maxLatitude) / 2;
  const cell = cellAt(map, state.col, state.row);
  return { latitude: map.bounds.maxLatitude - (state.row + 0.5) * step,
    longitude: map.bounds.minLongitude + (state.col + 0.5) * step / Math.cos(projection * Math.PI / 180),
    terrain: cell.terrain, police: policePresence(cell) };
}

function settlementAt(map, col, row, state) {
  const cell = cellAt(map, col, row);
  return (cell.terrain === "place" ? cell.settlements?.find(place => place.name?.trim()) : null) ??
    (state && cell.terrain !== "water" ? knownParentLanding(state, col, row) : null);
}

function validateVisited(state, map) {
  const visited = state.lore.visitedSettlements === undefined ? [] : state.lore.visitedSettlements;
  if (!Array.isArray(visited) || visited.length > map.width * map.height + 64 * Object.keys(map.loreChunks ?? {}).length) {
    throw new Error("Invalid visited settlement history.");
  }
  const seen = new Set();
  for (const visit of visited) {
    const key = JSON.stringify([visit?.col, visit?.row]);
    if (!visit || Object.keys(visit).sort().join() !== "col,observedMinutes,row,town" ||
        !Number.isFinite(visit.observedMinutes) || visit.observedMinutes < 0 ||
        visit.observedMinutes > state.elapsedMinutes || seen.has(key) ||
        settlementAt(map, visit.col, visit.row, state)?.name !== visit.town) {
      throw new Error("Invalid visited settlement history.");
    }
    seen.add(key);
  }
  return visited;
}

function recordSettlement(state, map) {
  const visited = validateVisited(state, map), place = settlementAt(map, state.col, state.row, state);
  if (!place || visited.some(visit => visit.col === state.col && visit.row === state.row)) return state;
  return { ...state, lore: { ...state.lore, visitedSettlements: [...visited,
    { col: state.col, row: state.row, town: place.name, observedMinutes: state.elapsedMinutes }] } };
}

export function discoveryRequirement(state, id) {
  loreItem(id);
  if (id === "chariot" && state.distanceMeters < 1000) return "walking";
  if (id === "temperance" && state.lore.shared.length < 2) return "sharing";
  if (id === "wheel" && !state.discovery.entries.some(entry => entry.targetType === "artifact" &&
      entry.kind === "location" && entry.availability === "historical")) return "historical";
  if (id === "sun") {
    const hour = journeyDate(state).getUTCHours();
    if (hour < 6 || hour >= 20) return "daylight";
    if (!state.discovery.entries.some(entry => entry.targetType === "artifact" &&
        entry.kind === "inscription")) return "inscription";
  }
  const hour = journeyDate(state).getUTCHours(), inscriptions = inscriptionEntries(state);
  if (id === "magician" && !(state.lore.earnedActivities > 0)) return "earning";
  if (id === "priestess" && state.lore.shared.length < 1) return "one-sharing";
  if (id === "empress" && !(state.lore.paidMeals > 0)) return "paid-meal";
  if (id === "emperor" && !(Math.max(state.lore.longestLocalMinutes ?? 0,
    state.pressures?.localMinutes ?? 0) >= 30)) return "locality";
  if (id === "hierophant" && new Set(inscriptions.map(entry => entry.targetId)).size < 2) return "two-inscriptions";
  if (id === "lovers" && (state.lore.testimonyTowns ?? []).length < 2) return "testimony";
  if (id === "justice" && (!(state.lore.earnedActivities > 0) || !(state.lore.paidActions > 0))) return "paid-earned";
  if (id === "strength" && !(state.faints > 0 || state.pressures?.placements.length > 0)) return "collapse";
  if (id === "hanged" && (hour < 18 || hour >= 20)) return "evening";
  if (id === "nameless" && !state.discovery.entries.some(entry =>
    entry.targetType === "artifact" && entry.kind === "location" && entry.availability !== "current")) return "closed";
  if (id === "devil" && !(state.lore.voluntaryCaches > 0)) return "deposit";
  if (id === "tower" && (hour < 6 || hour >= 20)) return "daylight";
  if (id === "star" && (hour < 6 || hour >= 8)) return "dawn";
  if (id === "moon" && hour >= 6 && hour < 20) return "night";
  if (id === "judgement" && !(state.lore.sleptSixty > 0)) return "sleep";
  if (id === "world" && (new Set(inscriptions.map(entry => entry.targetId)).size < 6 ||
    new Set(inscriptions.map(entry => thread(entry.targetId))).size < 3)) return "threads";
  return null;
}

function returnTargets(state, map) {
  return validateVisited(state, map).filter(visit => visit.col !== state.col || visit.row !== state.row)
    .map(visit => ({ id: JSON.stringify([visit.col, visit.row]), ...visit }));
}

function recallTargets(instances, journey) {
  return instances.filter(instance => instance.id !== "wheel" && instance.owner === null &&
    instance.recallJourney === journey && instance.marker.startsWith("cache:"));
}

export function createLoreState(genesis, map, economy) {
  cellAt(map, genesis.col, genesis.row);
  return recordSettlement(synchronizeParentDiscovery(beginPressures(beginExploration(beginEquipment({
    ...structuredClone(genesis), lore: { version: 1, effects: null, outcome: "started", shared: [], carriedGrams: 0,
      dreams: { version: 1, episodes: [] }, interpretations: [], visitedSettlements: [],
      start: { col: genesis.col, row: genesis.row },
      lastSettlement: { col: genesis.col, row: genesis.row,
        town: settlementAt(map, genesis.col, genesis.row)?.name ?? map.name } },
    discovery: { version: 1, entries: [] },
    discoverySchedule: { walkingMinutes: 0, lastAutomaticMinutes: 0 },
  })), economy)), map);
}

export function loreBag(state, instances, journey) {
  const owned = instances.filter(instance => instance.owner === journey);
  const items = [...state.equipment.items, ...owned.map(instance => ({ id: instance.id }))];
  const placements = [...state.equipment.placements,
    ...owned.map(instance => ({ ...instance.placement, id: instance.id }))];
  const grams = items.reduce((sum, item) => sum + PACKING.find(entry => entry.id === item.id).grams, 0);
  if (grams > CAPACITY_GRAMS) throw new Error("The bag exceeds 5,500 g.");
  restorePlacements(items, placements, PACKING);
  return { items, placements, grams };
}

function artifactClue(state, instance, tier, facts, channel = "npc") {
  return { targetType: "artifact", targetId: instance.id, targetRevision: String(instance.generation),
    evidenceKey: "location", kind: "location", precision: tier, facts,
    source: channel === "collector" ? "hermit-revelation" : "artifact-rumour",
    observedMinutes: state.elapsedMinutes, channels: [channel], availability: "current",
    contentVersion: "template-v1" };
}

function artifactFacts(instance, map, tier) {
  const facts = { artifact: instance.id, region: map.name };
  if (tier !== "region") facts.place = instance.town;
  if (["marker", "local"].includes(tier)) facts.marker = instance.marker;
  if (tier === "local") Object.assign(facts, { col: instance.col, row: instance.row });
  return facts;
}

function hermitClue(state, instance, map) {
  return selectDiscoveryCandidate(state, [{
    priority: 0, distanceMeters: Math.hypot(state.col - instance.col, state.row - instance.row) * map.cellSizeMeters,
    clue: artifactClue(state, instance, "local", artifactFacts(instance, map, "local"), "collector"),
  }]);
}

export function artifactCandidates(state, instances, map) {
  const candidates = [];
  for (const instance of instances) {
    if (instance.owner !== null) continue;
    const meters = Math.hypot(state.col - instance.col, state.row - instance.row) * map.cellSizeMeters;
    if (meters > 300000) continue;
    const tier = meters <= 250 ? "local" : meters <= 3000 ? "marker" : meters <= 30000 ? "town" : "region";
    candidates.push({ distanceMeters: meters, priority: 0, dreamProximity: Math.max(0, 1 - meters / 300000),
      clue: artifactClue(state, instance, tier, artifactFacts(instance, map, tier)) });
  }
  return candidates;
}

export function loreCandidates(state, instances, map, journalContext) {
  return [...artifactCandidates(state, instances, map), ...parentDiscoveryCandidates(state),
    ...journalDiscoveryCandidates(state, journalContext)];
}

function reconcileArtifacts(state, instances, journey) {
  const updates = (state.discovery?.entries ?? []).filter(entry =>
    entry.targetType === "artifact" && entry.evidenceKey === "location")
    .map(entry => {
      const instance = instances.find(value => value.id === entry.targetId);
      const availability = !instance || String(instance.generation) !== entry.targetRevision ? "historical"
        : instance.owner !== null && instance.owner !== journey ? "unavailable" : "current";
      return { targetType: entry.targetType, targetId: entry.targetId,
        targetRevision: entry.targetRevision, availability };
    });
  return reconcileDiscoveryAvailability(state, updates);
}

export function loreView(runtime, instances, journey, map, { nowMillis = Date.now(), journalContext } = {}) {
  const reconciled = reconcileArtifacts(runtime.state, instances, journey);
  validateInterpretations(reconciled);
  const state = { ...reconciled, lore: { ...reconciled.lore,
    carriedGrams: artifactWeight(instances, journey), dreams: publicDreams(reconciled), work: undefined } };
  if (state.lore.moon) {
    state.lore.moon = { expiresMinutes: state.lore.moon.expiresMinutes,
      domains: state.lore.moon.clues.map(clue => clue.targetType) };
  }
  validateLoreEffects(reconciled);
  const bag = loreBag(state, instances, journey);
  const owned = instances.filter(instance => instance.owner === journey);
  const currentCell = cellAt(map, state.col, state.row);
  const search = state.trail?.exploration?.lastSearch;
  return { version: 1, world: LORE_WORLD, revision: runtime.revision,
    worldMinutes: runtime.worldMinutes, journeyUtc: journeyDate(state).toISOString(),
    viewport: loreViewport(state, map),
    parentSearch: search ? { outcome: search.outcome, minutes: search.minutes, repeated: Boolean(search.repeated) } : null,
    interpretation: interpretationOffer(reconciled, currentCell, infoAt(map, reconciled), runtime.economy),
    state: Object.fromEntries(["name", "col", "row", "elapsedMinutes", "distanceMeters", "reserveKcal",
      "health", "fatigue", "awakeHours", "walletCents", "ended", "dailyCard", "lore",
      "discovery", "discoverySchedule"].map(key => [key, state[key]])),
    bag: { grams: bag.grams, placements: bag.placements },
    owned: owned.map(instance => ({ id: instance.id, cooldownUntil: instance.cooldownUntil,
      blocked: powerUnavailable(reconciled, instance.id, instances, map, runtime.economy, journalContext) })),
    offers: instances.filter(instance => instance.owner === null &&
      Math.hypot(state.col - instance.col, state.row - instance.row) * map.cellSizeMeters <= 250 &&
      state.discovery.entries.some(entry => entry.targetType === "artifact" && entry.targetId === instance.id &&
        entry.targetRevision === String(instance.generation) && entry.precision === "local"))
      .map(instance => ({ id: instance.id, minutes: 10, grams: loreItem(instance.id).grams,
        blocked: discoveryRequirement(state, instance.id) })),
    returnTargets: returnTargets(state, map),
    recallTargets: recallTargets(instances, journey).map(instance => instance.id),
    worldTargets: owned.some(item => item.id === "world") ? worldTargets(state, map) : [],
    truthTargets: truthTargets(reconciled, journalContext).map(clue => ({
      id: discoveryIdentity(clue), domain: clue.targetType, label: clue.targetType === "parent-trail"
        ? "parent-trail" : clue.facts.parent,
    })),
    fragments: owned.some(item => item.id === "hierophant")
      ? fragmentOptions(state).map(({ id, source, qualifies }) => ({ id, source, qualifies })) : [],
    refundCents: refundableDebits(state).reduce((sum, debit) => sum + debit.cents, 0),
    mystery: { inscriptions: new Set(inscriptionEntries(state).map(entry => entry.targetId)).size,
      threads: new Set(inscriptionEntries(state).map(entry => thread(entry.targetId))).size },
    workOffer: workOffer(reconciled, currentCell, infoAt(map, state), runtime.economy),
    earningOffers: earningOffers(reconciled, currentCell, infoAt(map, state), runtime.economy),
    work: workView(reconciled, nowMillis),
    workResult: state.lastJourneyMiniGame ?? null,
    route: state.lore.route?.stage === runtime.state.trail?.index ? state.lore.route : null,
    compass: state.lore.compass && state.lore.compass.stage === runtime.state.trail?.index
      ? { remainingMinutes: state.lore.compass.remainingMinutes, signal: state.lore.compass.signal,
        direction: parentPath(reconciled, map)?.direction ?? null } : null,
    visionTargets: instances.filter(instance => instance.owner === null && hermitClue(state, instance, map))
      .map(instance => instance.id),
    meals: state.ended ? [] : mealOffers(state, currentCell, infoAt(map, state), runtime.economy)
      .filter(meal => meal.id === "basic-meal").map(({ id, cents, reserveKcal }) => ({ id, cents, reserveKcal })),
    reserveMaximum: runtime.survival.reserve_kcal };
}

function truthTargets(state, context) {
  const parent = parentTruth(state);
  return [...(parent ? [parent] : []), ...(context?.truths ?? []).filter(clue =>
    !state.discovery.entries.some(entry => discoveryIdentity(entry) === discoveryIdentity(clue)))];
}

function moonTargets(state, instances, map, context) {
  const truths = truthTargets(state, context), artifact = instances.filter(item => item.owner === null)
    .map(item => hermitClue(state, item, map)).find(Boolean);
  return [truths.find(clue => clue.targetType === "parent-trail"), artifact,
    truths.find(clue => clue.targetType === "abandoned-journal")].filter(Boolean);
}

function powerUnavailable(state, id, instances, map, economy, context) {
  if (activePower(state, id)) return "already-active";
  if (id === "magician" && !earningOffers(state, cellAt(map, state.col, state.row), infoAt(map, state), economy).length) return "no-work";
  if (id === "priestess" && !truthTargets(state, context).length) return "no-truth";
  if (id === "hierophant" && !fragmentOptions(state).length) return "no-fragments";
  if (["star", "lovers"].includes(id) && !parentPath(state, map)) return "no-path";
  if (id === "lovers" && state.lore.compass) return "already-active";
  if (id === "justice" && !refundableDebits(state).length) return "no-refund";
  if (id === "moon") {
    const hour = journeyDate(state).getUTCHours();
    if (hour >= 6 && hour < 20) return "night";
    if (state.lore.moon) return "already-active";
    if (!moonTargets(state, instances, map, context).length) return "no-truth";
  }
  if (id === "world" && !worldTargets(state, map).length) return "no-destination";
  return null;
}

function boundaryMinutes(state, remaining) {
  const date = journeyDate(state);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return Math.min(remaining, (midnight - date.getTime()) / 60000,
    ...Object.values(state.lore.protections ?? {}).map(effect => effect.expiresMinutes - state.elapsedMinutes)
      .filter(minutes => minutes > 1e-8));
}

function settleMinutes(state, minutes, map, survival, economy) {
  let remaining = minutes, next = state;
  while (remaining > 1e-8) {
    const duration = boundaryMinutes(next, remaining), before = next;
    next = finishAction(before, restSurvival({ ...before, lastExpenseCents: 0 },
      { ...survival, rest_minutes: duration, rest_fatigue_recovery: 0 }),
    infoAt(map, before), economy, { survival });
    remaining -= duration;
    if (actionInterrupted(before, next)) break;
  }
  return next;
}

async function searchParent(state, cell, info, map, survival, economy) {
  const prepared = await prepareFieldSearch(state, cell, async () => null, new AbortController().signal, {
    proximity: async () => ({ destinationDistanceMeters: Math.hypot(
      state.col - state.trail.stages[state.trail.index].col,
      state.row - state.trail.stages[state.trail.index].row) * map.cellSizeMeters }),
  });
  return applyFieldSearch(state, prepared, cell, info, survival, economy);
}

function releaseArtifacts(state, instances, journey) {
  for (const instance of instances.filter(value => value.owner === journey)) {
    Object.assign(instance, { owner: null, placement: null, col: state.lore.lastSettlement.col,
      row: state.lore.lastSettlement.row, town: state.lore.lastSettlement.town,
      marker: `cache:${instance.id}`,
      generation: instance.generation + 1, recallJourney: journey });
  }
}

export async function applyLoreAction(runtime, originalInstances, journey, map, action,
  { journalContext, random = Math.random, nowMillis = Date.now() } = {}) {
  if (!action || typeof action !== "object" || Array.isArray(action)) throw new Error("Invalid lore action.");
  let state = recordSettlement(structuredClone(runtime.state), map);
  state = reconcileArtifacts(state, originalInstances, journey);
  const instances = structuredClone(originalInstances), previous = state;
  state.lore.carriedGrams = artifactWeight(instances, journey);
  const { survival, economy } = runtime;
  const cell = cellAt(map, state.col, state.row), info = infoAt(map, state);
  const instance = action.id === undefined ? null : instances.find(value => value.id === action.id);
  if (state.ended) throw new Error("This playtest journey has ended.");
  validateLoreEffects(state);
  if (state.lore.compass && (state.lore.compass.stage !== state.trail?.index || state.trail?.completed)) {
    state.lore.compass = null;
  }
  if (state.lore.work && action.type !== "work-move" && action.type !== "abandon") {
    throw new Error("Complete or cancel the current bookshop session first.");
  }
  if (activePower(state, "emperor") && !["rest", "sleep"].includes(action.type)) state = cancelPower(state, "emperor");
  const boundaryState = state;
  if (action.type === "walk") {
    const to = cellAt(map, state.col + action.dc, state.row + action.dr);
    if (to.terrain === "water") throw new Error("Water crossing is disabled in this playtest.");
    const beforePath = state.lore.compass ? parentPath(state, map) : null;
    const destinationState = { ...state, col: state.col + action.dc, row: state.row + action.dr };
    const afterPath = state.lore.compass ? parentPath(destinationState, map) : null;
    state = walkSurvival(state, action.dc, action.dr, cell, to, survival, info);
    const walkedMinutes = state.lastMove.minutes, walkedCol = state.col, walkedRow = state.row;
    state = finishAction(boundaryState, state, { ...infoAt(map, state) }, economy, { survival });
    if (state.lore.compass) {
      const minutes = walkedMinutes, compass = state.lore.compass;
      const usable = minutes <= compass.remainingMinutes && state.col === walkedCol && state.row === walkedRow;
      const signal = usable ? !beforePath || !afterPath ? "unavailable" :
        afterPath.distanceMeters < beforePath.distanceMeters ? "warmer" :
          afterPath.distanceMeters > beforePath.distanceMeters ? "colder" : "unchanged" : null;
      state = { ...state, lore: { ...state.lore, compass: compass.remainingMinutes <= minutes ? null :
        { ...compass, remainingMinutes: compass.remainingMinutes - minutes, signal },
      compassReceipts: [...(state.lore.compassReceipts ?? []),
        { revision: runtime.revision + 1, minutes, signal, stage: compass.stage }] } };
    }
    state = recordTrailArrival(state);
    state = deliverAutomaticDiscovery(previous, state,
      actionInterrupted(previous, state) ? [] : loreCandidates(state, instances, map, journalContext),
      state.lastMove?.minutes ?? 0);
  } else if (action.type === "rest") {
    let remaining = survival.rest_minutes;
    while (remaining > 1e-8) {
      const minutes = boundaryMinutes(state, remaining), before = state;
      state = activePower(state, "emperor")
        ? finishAction(state, restSurvival(state, { ...survival, rest_minutes: minutes,
          rest_fatigue_recovery: survival.rest_fatigue_recovery * minutes / survival.rest_minutes }),
        info, economy, { survival, sheltered: true })
        : restEconomy(state, info, survival, economy, { minutes });
      remaining -= minutes;
      if (actionInterrupted(before, state)) break;
    }
  } else if (action.type === "sleep") {
    let remaining = survival.sleep_hours * 60, sleeps = state.sleeps;
    let dailyCardAtCheck;
    while (remaining > 1e-8 && !state.ended) {
      const expiry = Object.values(state.lore.protections ?? {}).map(effect => effect.expiresMinutes - state.elapsedMinutes)
        .filter(value => value > 1e-8);
      const utc = journeyDate(state), midnight = Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(),
        utc.getUTCDate() + 1);
      const untilMidnight = (midnight - utc.getTime()) / 60000;
      const untilDream = previous.elapsedMinutes + 60 - state.elapsedMinutes;
      const minutes = Math.min(remaining, untilMidnight, ...(untilDream > 1e-8 ? [untilDream] : []), ...expiry);
      const before = state;
      state = sleepEconomy(state, cell, info, null, survival, economy, { minutes });
      if (Math.abs(state.elapsedMinutes - previous.elapsedMinutes - 60) < 1e-6) dailyCardAtCheck = state.dailyCard;
      remaining -= minutes;
      if (actionInterrupted(before, state)) break;
    }
    state = { ...state, sleeps: sleeps + 1 };
    if (!actionInterrupted(previous, state) && state.elapsedMinutes - previous.elapsedMinutes >= 60) {
      state.lore.sleptSixty = (state.lore.sleptSixty ?? 0) + 1;
      const moon = previous.lore.moon;
      if (moon && previous.elapsedMinutes < moon.expiresMinutes) {
        const receipts = [];
        for (const clue of moon.clues) {
          const valid = clue.targetType === "parent-trail" ? clue.targetId === `stage:${state.trail.index}`
            : clue.targetType === "artifact" ? instances.some(item => item.id === clue.targetId &&
              item.owner === null && String(item.generation) === clue.targetRevision)
            : (journalContext?.truths ?? []).some(item => discoveryIdentity(item) === discoveryIdentity(clue));
          state = revealTruth(state, { ...clue, availability: valid ? "current" : "historical" });
          receipts.push({ evidence: discoveryIdentity(clue), availability: valid ? "current" : "historical" });
        }
        state.lore.moon = null;
        state.lore.moonReceipts = [...(state.lore.moonReceipts ?? []),
          { observedMinutes: state.elapsedMinutes, clues: receipts }];
      }
    }
    state = settleDream(previous, state, loreCandidates(previous, instances, map, journalContext)
      .filter(candidate => !discoveryKnown(state, candidate.clue)),
    { interrupted: actionInterrupted(previous, state), random, dailyCardAtCheck });
  } else if (action.type === "meal") {
    state = buyMeal(state, cell, info, "basic-meal", survival, economy);
    if (!actionInterrupted(previous, state)) state.lore.paidMeals = (state.lore.paidMeals ?? 0) + 1;
  } else if (action.type === "work-start") {
    state = startWork(state, cell, info, survival, economy, action.language, nowMillis);
  } else if (action.type === "work-move") {
    state = answerWork(state, action.move, nowMillis);
  } else if (action.type === "dismiss-compass") {
    if (!state.lore.compass) throw new Error("No active compass.");
    state.lore.compass = null;
  } else if (action.type === "archive") {
    if (!settlementAt(map, state.col, state.row, state) || state.lore.archiveUntil > state.elapsedMinutes ||
        !state.discovery.entries.some(entry => entry.targetType === "artifact")) {
      throw new Error("The collector needs an earned artifact rumour and offers one historical copy per 1,440 minutes.");
    }
    const entries = inscriptionEntries(state);
    const item = [...LORE_ITEMS].filter(item => !entries.some(entry => entry.targetId === item.id))
      .sort((a, b) => entries.filter(entry => thread(entry.targetId) === thread(a.id)).length -
        entries.filter(entry => thread(entry.targetId) === thread(b.id)).length ||
        TAROT_CARDS.indexOf(a.id) - TAROT_CARDS.indexOf(b.id))[0];
    if (!item) throw new Error("All inscription copies are already recorded.");
    state = settleMinutes(state, 10, map, survival, economy);
    if (!actionInterrupted(previous, state)) {
      state = learnFragments(state, [{ id: `archive:${item.id}`, source: "collector", target: item.id,
        qualifies: true, ...item.inscription }]);
      state.lore.archiveUntil = state.elapsedMinutes + 1440;
    }
  } else if (action.type === "parent-search") {
    state = await searchParent(state, cell, info, map, survival, economy);
  } else if (action.type === "parent-inquiry") {
    const reply = askDirections(state, cell, info, survival, economy, random);
    state = reply.state;
    state.lore.lastTestimony = { outcome: reply.outcome, observedMinutes: state.elapsedMinutes };
    if (!actionInterrupted(previous, state)) {
      const town = settlementAt(map, previous.col, previous.row, previous);
      if (town) state.lore.testimonyTowns = [...new Set([...(state.lore.testimonyTowns ?? []),
        town.osmId ?? JSON.stringify([previous.col, previous.row, town.name])])];
      if (reply.outcome === "helped") {
        state = learnDiscovery(state, [{ targetType: "parent-trail", targetId: `stage:${state.trail.index}`,
          targetRevision: `trail:${state.trail.version}`, evidenceKey: `testimony:${previous.col}:${previous.row}`,
          kind: "direction", precision: "vague",
          facts: fieldClueFacts(state, { stage: state.trail.index, kind: "direction", col: previous.col, row: previous.row }),
          observedMinutes: state.elapsedMinutes, channels: ["npc"], source: "parent-directions",
          availability: "current", contentVersion: "template-v1" }]);
      }
    }
  } else if (action.type === "interpret-clue") {
    const entry = state.discovery.entries.find(entry => discoveryIdentity(entry) === action.evidence);
    if (!entry || entry.kind === "inscription") throw new Error("No earned clue to interpret.");
    if (plainGuidancePermitted(state, entry)) throw new Error("This clue is already interpreted.");
    const offer = interpretationOffer(state, cell, info, economy);
    if (!offer.available) throw new Error(`Clue interpretation unavailable: ${offer.status}.`);
    state = settleMinutes({ ...state, walletCents: state.walletCents - offer.cents },
      offer.minutes, map, survival, economy);
    state.lastExpenseCents = offer.cents;
    if (!actionInterrupted(previous, state)) state = grantInterpretation(state, entry, "npc");
  } else if (action.type === "inquire" || action.type === "inquire-clue") {
    const candidate = selectDiscoveryCandidate(state, loreCandidates(state, instances, map, journalContext),
      action.type === "inquire" ? { targetType: "artifact", targetId: action.id } : {});
    if (!candidate) throw new Error("No new clue is eligible here.");
    if (candidate.targetType === "parent-trail") {
      state = await searchParent(state, cell, info, map, survival, economy);
    } else {
      if (candidate.targetType === "artifact") state = settleMinutes(state, 2, map, survival, economy);
      if (!actionInterrupted(previous, state)) {
        state = learnDiscovery(state, [{ ...candidate, observedMinutes: state.elapsedMinutes }]);
      }
    }
  } else if (action.type === "claim") {
    if (!instance || instance.owner !== null) throw new Error("This artifact is already taken or unavailable.");
    if (Math.hypot(state.col - instance.col, state.row - instance.row) * map.cellSizeMeters > 250 ||
        !state.discovery.entries.some(entry => entry.targetType === "artifact" &&
          entry.targetId === instance.id && entry.targetRevision === String(instance.generation) &&
          entry.precision === "local")) throw new Error("Earn the current local clue and approach the artifact first.");
    const bag = loreBag(state, instances, journey), item = loreItem(instance.id);
    const blocked = discoveryRequirement(state, instance.id);
    const failures = { walking: "Walk at least 1 km before discovering the shoelace.",
      sharing: "Share two distinct inscription copies before discovering the stopper.",
      historical: "Keep a historical artifact location clue before discovering the spool.",
      daylight: "Search for the handkerchief during day [06:00, 20:00) UTC.",
      inscription: "Record an artifact inscription before discovering the handkerchief." };
    if (blocked) throw new Error(failures[blocked] ?? `Discovery requirement not met: ${blocked}.`);
    if (bag.grams + item.grams > CAPACITY_GRAMS) throw new Error("The bag exceeds 5,500 g.");
    const placement = firstPlacement(bag.placements, item, PACKING);
    state = settleMinutes(state, 10, map, survival, economy);
    if (!actionInterrupted(previous, state)) {
      Object.assign(instance, { owner: journey, placement, generation: instance.generation + 1,
        recallJourney: null });
      state = learnDiscovery(state, [{ targetType: "artifact", targetId: instance.id,
        targetRevision: "inscription:1", evidenceKey: "inscription", kind: "inscription",
        precision: "text", facts: { artifact: instance.id, fr: item.inscription.fr, en: item.inscription.en },
        observedMinutes: state.elapsedMinutes, channels: ["notebook"], source: "artifact-inscription",
        availability: "current", contentVersion: "template-v1" }]);
    }
  } else if (action.type === "cache") {
    if (!instance || instance.owner !== journey) throw new Error("You do not carry this artifact.");
    const settlement = settlementAt(map, state.col, state.row, state);
    if (!settlement) throw new Error("Leave a cache at a mapped settlement.");
    state = settleMinutes(state, 10, map, survival, economy);
    if (!actionInterrupted(previous, state)) {
      Object.assign(instance, { owner: null, placement: null, col: state.col, row: state.row,
        town: settlement.name, marker: `cache:${instance.id}`, generation: instance.generation + 1,
        recallJourney: journey });
      state.lore.voluntaryCaches = (state.lore.voluntaryCaches ?? 0) + 1;
    }
  } else if (action.type === "share") {
    if (!LORE_ITEMS.some(item => item.id === action.id) ||
        !state.discovery.entries.some(entry => entry.targetType === "artifact" &&
          entry.targetId === action.id && entry.kind === "inscription") ||
        state.lore.shared.includes(action.id)) throw new Error("No new inscription copy to share.");
    if (!settlementAt(map, state.col, state.row, state)) throw new Error("Contact the virtual collector in a settlement.");
    state = settleMinutes(state, 5, map, survival, economy);
    if (!actionInterrupted(previous, state)) state.lore.shared.push(action.id);
  } else if (action.type === "pack") {
    if (!instance || instance.owner !== journey) throw new Error("You do not carry this artifact.");
    const placement = { id: instance.id, x: action.x, y: action.y, rotated: action.rotated };
    if (!fits(loreBag(state, instances, journey).placements, loreItem(instance.id), placement, PACKING)) {
      throw new Error("Inventory overlaps or exceeds the bag.");
    }
    instance.placement = placement;
  } else if (action.type === "use") {
    if (!instance || instance.owner !== journey) throw new Error("You do not carry this artifact.");
    if (instance.cooldownUntil > runtime.worldMinutes) throw new Error("This artifact is cooling down.");
    const item = loreItem(instance.id);
    const unavailable = powerUnavailable(state, instance.id, instances, map, economy, journalContext);
    if (unavailable) throw new Error(`Artifact power unavailable: ${unavailable}.`);
    if (instance.id === "chariot" && state.lore.effects) throw new Error("Seven-league stride is already active.");
    if (["temperance", "sun"].includes(instance.id) && state.health >= HEALTH.maximum && state.fatigue <= 0) {
      throw new Error("There is no health or fatigue to restore.");
    }
    const destination = ["fool", "world"].includes(instance.id)
      ? (instance.id === "fool" ? returnTargets(state, map) : worldTargets(state, map))
        .find(place => place.id === action.target) : null;
    if (["fool", "world"].includes(instance.id) && !destination) throw new Error(
      instance.id === "fool" ? "Choose a different, personally visited settlement." : "Choose an earned validated settlement.");
    const truth = instance.id === "priestess"
      ? truthTargets(state, journalContext).find(clue => discoveryIdentity(clue) === action.target) : null;
    if (instance.id === "priestess" && !truth) throw new Error("Choose a current eligible clue.");
    const fragments = instance.id === "hierophant" ? (action.targets ?? []).map(id =>
      fragmentOptions(state).find(fragment => fragment.id === id)) : [];
    if (instance.id === "hierophant" && (!fragments.length || fragments.length > 3 ||
      fragments.some(fragment => !fragment) || new Set(action.targets).size !== fragments.length)) {
      throw new Error("Choose one to three distinct genuinely unread fragments.");
    }
    const path = ["star", "lovers"].includes(instance.id) ? parentPath(state, map) : null;
    const moon = instance.id === "moon" ? moonTargets(state, instances, map, journalContext) : null;
    const earning = instance.id === "magician" ? earningOffers(state, cell, info, economy)
      .find(offer => offer.id === action.target) : null;
    if (instance.id === "magician" && !earning) throw new Error("Choose an available earning offer.");
    const refund = instance.id === "justice" ? refundableDebits(state) : null;
    let rescueMarker;
    if (instance.id === "nameless") {
      const visited = validateVisited(state, map), last = state.lore.lastSettlement;
      const safe = visited.find(visit => visit.col === last?.col && visit.row === last?.row) ?? visited.at(-1) ?? state.lore.start;
      if (!safe || cellAt(map, safe.col, safe.row).terrain === "water") throw new Error("No validated rescue marker.");
      rescueMarker = { col: safe.col, row: safe.row };
    }
    if (instance.id === "judgement" && !LORE_ITEMS.some(item => item.id === action.target)) {
      throw new Error("Choose one of the 22 daily cards.");
    }
    const recalled = instance.id === "wheel"
      ? recallTargets(instances, journey).find(item => item.id === action.target) : null;
    let recalledPlacement;
    if (instance.id === "wheel") {
      if (!recalled) throw new Error("Choose your own still-unclaimed publicly cached artifact.");
      const bag = loreBag(state, instances, journey), item = loreItem(recalled.id);
      if (bag.grams + item.grams > CAPACITY_GRAMS) throw new Error("The bag exceeds 5,500 g.");
      recalledPlacement = firstPlacement(bag.placements, item, PACKING);
    }
    const target = instance.id === "hermit" ? instances.find(value =>
      value.id === action.target && value.owner === null && value.id !== instance.id) : null;
    if (instance.id === "hermit" && !target) throw new Error("Choose a currently unowned artifact.");
    const revelation = target ? hermitClue(state, target, map) : null;
    if (instance.id === "hermit" && !revelation) throw new Error("No new artifact clue is eligible here.");
    if (state.fatigue + item.fatigue >= 100 || state.reserveKcal <= item.kcal ||
        state.walletCents < (item.cents ?? 0)) {
      throw new Error("Insufficient resources for the artifact price.");
    }
    state = settleMinutes(state, 1, map, survival, economy);
    if (!actionInterrupted(previous, state)) {
      if (state.fatigue + item.fatigue >= 100 || state.reserveKcal <= item.kcal ||
          state.walletCents < (item.cents ?? 0)) {
        throw new Error("Insufficient resources after activation metabolism.");
      }
      state = { ...state, fatigue: state.fatigue + item.fatigue,
        reserveKcal: state.reserveKcal - item.kcal, energyKcal: state.energyKcal + item.kcal,
        walletCents: state.walletCents - (item.cents ?? 0) };
      if (instance.id === "hermit") {
        state = learnDiscovery(state, [{ ...revelation, observedMinutes: state.elapsedMinutes }]);
        state = grantInterpretation(state, revelation, "hermit");
      } else if (instance.id === "temperance") {
        state = { ...state, health: Math.min(100, state.health + 40), fatigue: Math.max(0, state.fatigue - 40) };
      } else if (instance.id === "chariot") {
        state = { ...state, lore: { ...state.lore,
          effects: { remainingMeters: 20000, expiresMinutes: state.elapsedMinutes + 1440 } } };
      } else if (instance.id === "fool" || instance.id === "world") {
        state = recordTrailArrival({ ...state, col: destination.col, row: destination.row });
      } else if (instance.id === "wheel") {
        Object.assign(recalled, { owner: journey, placement: recalledPlacement,
          generation: recalled.generation + 1, recallJourney: null });
      } else if (instance.id === "sun") {
        state = { ...state, health: HEALTH.maximum, fatigue: 0 };
      } else if (["empress", "emperor", "strength", "hanged", "nameless", "devil", "tower"].includes(instance.id)) {
        state = armPower(state, instance.id, instance.id === "emperor" ? { col: state.col, row: state.row } :
          instance.id === "nameless" ? { marker: rescueMarker } : {});
        if (instance.id === "empress") state.reserveKcal = survival.reserve_kcal;
        if (instance.id === "strength") state.fatigue = 0;
        if (["emperor", "tower"].includes(instance.id)) state.pressures.vigilance = 0;
      } else if (instance.id === "judgement") {
        state = armPower(state, "judgement", { card: action.target, naturalCard: state.dailyCard });
        state = refreshPressureTarot({ ...state, dailyCard: action.target }, economy);
      } else if (instance.id === "justice") {
        const cents = refund.reduce((sum, debit) => sum + debit.cents, 0);
        state.walletCents += cents;
        state.lore.debits = state.lore.debits.map(debit => ({ ...debit,
          reclaimedCents: debit.reclaimedCents + (refund.find(item => item.id === debit.id)?.cents ?? 0) }));
        state.lore.credits = [...(state.lore.credits ?? []),
          { id: `justice:${runtime.revision + 1}`, cents, observedMinutes: state.elapsedMinutes, debits: refund }];
      } else if (instance.id === "magician") {
        state = magicWork(state, earning);
      } else if (instance.id === "priestess") {
        state = revealTruth(state, truth);
      } else if (instance.id === "star") {
        const clue = parentTruth(state);
        if (clue) state = revealTruth(state, clue);
        state.lore.route = path;
        if (state.trail.exploration) state.trail.exploration.knownStage = state.trail.index;
      } else if (instance.id === "lovers") {
        state.lore.compass = { stage: path.stage, remainingMinutes: 180, signal: null };
      } else if (instance.id === "moon") {
        state.lore.moon = { expiresMinutes: state.elapsedMinutes + 1440, clues: moon };
      } else if (instance.id === "hierophant") {
        instance.cooldownUntil = runtime.worldMinutes + state.elapsedMinutes - previous.elapsedMinutes + item.cooldown;
        const beforeConcentration = state;
        state = settleMinutes(state, 10, map, survival, economy);
        if (!actionInterrupted(beforeConcentration, state)) state = learnFragments(state, fragments);
      }
      if (instance.id !== "hierophant") {
        instance.cooldownUntil = runtime.worldMinutes + state.elapsedMinutes - previous.elapsedMinutes + item.cooldown;
      }
    }
  } else if (action.type === "abandon") {
    state = { ...state, ended: "abandoned" };
  } else throw new Error("Unknown lore action.");
  const minutes = state.elapsedMinutes - previous.elapsedMinutes;
  if (previous.col === state.col && previous.row === state.row) {
    state.lore.localMinutes = (previous.lore.localMinutes ?? 0) + minutes;
  } else state.lore.localMinutes = 0;
  state.lore.longestLocalMinutes = Math.max(state.lore.longestLocalMinutes ?? 0,
    state.pressures?.localMinutes ?? 0);
  const spentCents = ["meal", "interpret-clue"].includes(action.type) ? state.lastExpenseCents ?? 0 : 0;
  if (spentCents > 0) {
    state.lore.debits = [...(state.lore.debits ?? []), { id: `expense:${runtime.revision + 1}`,
      observedMinutes: state.elapsedMinutes, cents: spentCents, reclaimedCents: 0, kind: action.type }];
    if (!actionInterrupted(previous, state)) state.lore.paidActions = (state.lore.paidActions ?? 0) + 1;
  }
  if (state.lore.compass?.stage !== state.trail?.index || state.trail?.completed) state.lore.compass = null;
  if (state.lore.moon?.expiresMinutes <= state.elapsedMinutes) state.lore.moon = null;
  if (!actionInterrupted(previous, state)) state = recordSettlement(state, map);
  const settlement = settlementAt(map, state.col, state.row, state);
  if (settlement) {
    state.lore.lastSettlement = { col: state.col, row: state.row, town: settlement.name };
    const rescue = activePower(state, "nameless");
    if (rescue) rescue.marker = { col: state.col, row: state.row };
  }
  if (state.ended) releaseArtifacts(state, instances, journey);
  state.lore.carriedGrams = artifactWeight(instances, journey);
  if (state.lore.effects?.expiresMinutes <= state.elapsedMinutes) state.lore.effects = null;
  state = synchronizeParentDiscovery(state);
  validateDreams(state);
  validateInterpretations(state);
  state = reconcileArtifacts(state, instances, journey);
  state.lore.outcome = actionInterrupted(previous, state) ? "interrupted" : action.type;
  loreBag(state, instances, journey);
  return { runtime: { ...runtime, state, revision: runtime.revision + 1,
    worldMinutes: runtime.worldMinutes + state.elapsedMinutes - previous.elapsedMinutes }, instances };
}
