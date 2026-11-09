import { createInvestigation, investigate } from "./legend-adventure.mjs";
import { adventureCosts, dungeonCosts } from "./adventure-costs.mjs";
import { restSurvival } from "./survival.mjs";
import { actionInterrupted, finishAction } from "./economy.mjs";
import { generateInvestigation, createGeneratedInvestigation, stepInvestigation } from "./minigames/legend-investigation.mjs";
import { generateDungeon, createDungeon, stepDungeon } from "./minigames/legend-dungeon.mjs";
import { generatePlatformLevel } from "./minigames/legend-layout.mjs";
import { createPlatformer, stepPlatformer } from "./minigames/legend-platformer.mjs";
import { treasureEquipment, effectiveAdventureCosts } from "./legend-rewards.mjs";

export const LEGEND_SESSION_VERSION = "cinema-investigation-v1";
export const GENERATED_INVESTIGATION_VERSION = "seeded-investigation-v1";
export const DUNGEON_SESSION_VERSION = "seeded-dungeon-v1";
export const DUNGEON_FOOD_VERSION = "seeded-dungeon-v2";
export const DUNGEON_FOOD_KCAL = 150;
export const LOCAL_PLATFORM_VERSION = "seeded-platform-v1";
export const LOCAL_INVESTIGATION_VERSION = "seeded-investigation-v2";
export const LOCAL_DUNGEON_VERSION = "seeded-dungeon-v3";
export const PACED_PLATFORM_VERSION = "seeded-platform-v2";
export const PACED_INVESTIGATION_VERSION = "seeded-investigation-v3";
export const PACED_DUNGEON_VERSION = "seeded-dungeon-v4";
export const TREASURE_PLATFORM_VERSION = "treasure-platform-v1";
export const TREASURE_INVESTIGATION_VERSION = "treasure-investigation-v1";
export const TREASURE_DUNGEON_VERSION = "treasure-dungeon-v1";
export const isTreasureSession = version =>
  [TREASURE_PLATFORM_VERSION, TREASURE_INVESTIGATION_VERSION, TREASURE_DUNGEON_VERSION].includes(version);
export const isPacedLegendSession = version =>
  [PACED_PLATFORM_VERSION, PACED_INVESTIGATION_VERSION, PACED_DUNGEON_VERSION].includes(version) || isTreasureSession(version);
export const isPlatformSession = version => [LOCAL_PLATFORM_VERSION, PACED_PLATFORM_VERSION, TREASURE_PLATFORM_VERSION].includes(version);
export const isLocalLegendSession = version =>
  [LOCAL_PLATFORM_VERSION, LOCAL_INVESTIGATION_VERSION, LOCAL_DUNGEON_VERSION].includes(version) || isPacedLegendSession(version);
export const isDungeonSession = version => [DUNGEON_SESSION_VERSION, DUNGEON_FOOD_VERSION, LOCAL_DUNGEON_VERSION, PACED_DUNGEON_VERSION, TREASURE_DUNGEON_VERSION].includes(version);
export const isGeneratedInvestigation = version => [GENERATED_INVESTIGATION_VERSION, LOCAL_INVESTIGATION_VERSION, PACED_INVESTIGATION_VERSION, TREASURE_INVESTIGATION_VERSION].includes(version);
export const hasDungeonFood = version => [DUNGEON_FOOD_VERSION, LOCAL_DUNGEON_VERSION, PACED_DUNGEON_VERSION, TREASURE_DUNGEON_VERSION].includes(version);
const supportedVersion = version => [LEGEND_SESSION_VERSION, GENERATED_INVESTIGATION_VERSION].includes(version) ||
  isLocalLegendSession(version) || isDungeonSession(version);
export const MAX_INVESTIGATION_ACTIONS = 1024;
export const MAX_PLATFORM_PACKETS = 8192;
export const MAX_PLATFORM_TICKS = 216000;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join();

export function validateLegendActivity(state) {
  const marker = state?.legendAdventure;
  if (marker !== undefined && marker !== null &&
      (!exact(marker, ["version", "runId"]) || marker.version !== 1 || !uuid.test(marker.runId) ||
        state.artifactWorld !== "main-artifacts-v1" || !state.serverJourney || state.ended ||
        state.miniGamePending || state.cafePending || state.theftPending || state.performancePending ||
        state.events?.pending || state.transport?.booking?.status === "active" ||
        state.equipment?.dogEncounter === "pending")) {
    throw new Error("Invalid active legend adventure.");
  }
}

export function replayInvestigation(actions) {
  if (!Array.isArray(actions) || actions.length > MAX_INVESTIGATION_ACTIONS) {
    throw new Error("Invalid investigation input history.");
  }
  let state = createInvestigation();
  for (const action of actions) {
    if (!(action?.type === "travel" ? exact(action, ["type", "location"]) : exact(action, ["type", "target"])) ||
        !["travel", "act"].includes(action.type) || state.completed) {
      throw new Error("Invalid investigation input.");
    }
    try { state = investigate(state, action); }
    catch (error) {
      if (!(error instanceof RangeError)) throw error;
      throw new Error(error.message);
    }
  }
  return state;
}

export function replayLegendSession({ contentVersion, seed, actions, weapon }) {
  if (contentVersion === LEGEND_SESSION_VERSION) return replayInvestigation(actions);
  const dungeon = isDungeonSession(contentVersion);
  const platform = isPlatformSession(contentVersion);
  const paced = isPacedLegendSession(contentVersion);
  if ((!dungeon && !platform && !isGeneratedInvestigation(contentVersion)) ||
      dungeon && !["none", "knife", ...(isTreasureSession(contentVersion) ? ["sword"] : [])].includes(weapon) ||
      !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff ||
      !Array.isArray(actions) || actions.length > (platform ? MAX_PLATFORM_PACKETS : MAX_INVESTIGATION_ACTIONS)) {
    throw new Error("Invalid investigation content or input history.");
  }
  try {
    let state = platform ? createPlatformer({ level: generatePlatformLevel({ seed, tier: "modest", paced }), healthMode: "journey" }) : dungeon
      ? createDungeon({ level: generateDungeon({ seed, tier: "modest", paced,
        ...(isLocalLegendSession(contentVersion) ? {} : { roomCount: 4 }) }), weapon, healthMode: "journey" })
      : createGeneratedInvestigation({ level: generateInvestigation({ seed, tier: "modest", paced,
        ...(isLocalLegendSession(contentVersion) ? {} : { roomCount: 4 }) }) });
    let ticks = 0;
    for (const action of actions) {
      if (state.completed) throw new Error("Invalid investigation input after completion.");
      if (platform) {
        validatePlatformPacket(action);
        ticks += action.ticks;
        if (ticks > MAX_PLATFORM_TICKS) throw new Error("Platform input limit reached.");
        for (let tick = 0; tick < action.ticks; tick++) {
          if (state.completed) throw new Error("Invalid platform input after completion.");
          state = stepPlatformer(state, action.controls);
        }
        continue;
      }
      if (dungeon && (!exact(action, ["type"]) ||
          !["up", "right", "down", "left", "interact", "attack", "wait", "retry"].includes(action.type))) {
        throw new Error("Invalid dungeon input.");
      }
      state = dungeon ? stepDungeon(state, action) : stepInvestigation(state, action);
    }
    return state;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw new Error(error.message);
  }
}

export function validateLegendSessionView(session, state) {
  if (session === undefined || session === null) {
    if (state.legendAdventure) throw new Error("Missing authoritative legend session.");
    return;
  }
  if (!exact(session, ["version", "contentVersion", "runId", "townId", "town", "seed", "col", "row",
    "actions", "status", "costs", "metrics",
    ...(isDungeonSession(session?.contentVersion) ? ["weapon"] : []),
    ...(hasDungeonFood(session?.contentVersion) ? ["foodKcal"] : [])]) || session.version !== 1 ||
      hasDungeonFood(session.contentVersion) &&
        (!Number.isFinite(session.foodKcal) || session.foodKcal < 0 || session.foodKcal > DUNGEON_FOOD_KCAL) ||
      !supportedVersion(session.contentVersion) || !uuid.test(session.runId) ||
      !/^(?:node|way|relation)\/[1-9]\d{0,19}$/.test(session.townId) ||
      typeof session.town !== "string" || !session.town.trim() || session.town.length > 200 ||
      !Number.isSafeInteger(session.seed) || session.seed < 0 || session.seed > 0xffffffff ||
      ![session.col, session.row].every(value => Number.isSafeInteger(value) && Math.abs(value) <= 8000) ||
      !["active", "completed", "left", "interrupted"].includes(session.status)) {
    throw new Error("Invalid authoritative legend session.");
  }
  const progress = replayLegendSession(session);
  const costs = isDungeonSession(session.contentVersion) ? dungeonCosts(progress.metrics) : adventureCosts(progress.metrics);
  if (!exact(session.costs, Object.keys(costs)) ||
      Object.keys(costs).some(key => session.costs[key] !== costs[key]) ||
      !exact(session.metrics, ["roomEntries", "roomsVisited", "trapHits",
        ...(isDungeonSession(session.contentVersion) ? ["creatureHits"] : [])]) ||
      session.metrics.creatureHits !== progress.metrics.creatureHits ||
      session.metrics.roomEntries !== progress.metrics.roomEntries ||
      session.metrics.trapHits !== progress.metrics.trapHits ||
      JSON.stringify(session.metrics.roomsVisited) !== JSON.stringify(progress.metrics.roomsVisited) ||
      session.status === "completed" && !progress.completed ||
      session.status === "active" && (progress.completed || state.legendAdventure?.runId !== session.runId ||
        isLocalLegendSession(session.contentVersion) && session.actions.length > 0 ||
        state.col !== session.col || state.row !== session.row) ||
      session.status !== "active" && state.legendAdventure) {
    throw new Error("Inconsistent authoritative legend progress.");
  }
}

export function settleAdventureCosts(state, costs, { survival, economy, info, paidCosts }) {
  if (!exact(costs, ["minutes", "fatigue", "health", "dirt"]) ||
      Object.values(costs).some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("Invalid adventure cost increment.");
  }
  if (!costs.minutes) {
    if (Object.values(costs).some(Boolean)) throw new Error("Adventure damage requires elapsed time.");
    return state;
  }
  const paid = paidCosts ?? { minutes: 0, fatigue: 0, health: 0, dirt: 0 };
  const total = effectiveAdventureCosts(state, Object.fromEntries(Object.keys(costs)
    .map(key => [key, costs[key] + paid[key]])));
  const previous = effectiveAdventureCosts(state, paid);
  costs = Object.fromEntries(Object.keys(costs).map(key => [key, total[key] - previous[key]]));
  const rested = restSurvival({ ...state, lastExpenseCents: 0,
    fatigue: Math.min(100, state.fatigue + costs.fatigue) },
  { ...survival, rest_minutes: costs.minutes, rest_fatigue_recovery: 0 });
  const next = finishAction(state, { ...rested, health: Math.max(0, rested.health - costs.health) },
    info, economy, { survival, sheltered: true, activity: "legend-adventure" });
  return { ...next, pressures: { ...next.pressures,
    cleanliness: Math.max(0, next.pressures.cleanliness - costs.dirt) } };
}

export function advanceLegendSession(runtime, action, { definition, runId, info }) {
  const previous = runtime.adventure;
  let session, progress;
  if (action.type === "legend-start") {
    if (runtime.state.ended || runtime.state.legendAdventure || previous?.status === "active" ||
        runtime.state.lore?.work) throw new Error("Another adventure or activity is already active.");
    const dungeon = isDungeonSession(action.contentVersion);
    if (!definition?.eligible || !dungeon && !isLocalLegendSession(action.contentVersion) && definition.format !== "investigation" ||
        action.townId !== definition.townId || !supportedVersion(action.contentVersion) ||
        !uuid.test(runId)) throw new Error("This investigation trial is unavailable.");
    session = { version: 1, contentVersion: action.contentVersion, runId,
      townId: definition.townId, town: definition.town, seed: definition.seed,
      col: runtime.state.col, row: runtime.state.row, actions: [], status: "active" };
    if (dungeon) session.weapon = (isTreasureSession(action.contentVersion) ?
      treasureEquipment(runtime.state).weapon?.weapon : null) ??
      (runtime.state.equipment.items.some(item => item.id === "knife" && item.condition > 0) ? "knife" : "none");
    progress = replayLegendSession(session);
  } else {
    if (!previous || previous.status !== "active" || action.runId !== previous.runId ||
        !supportedVersion(previous.contentVersion)) throw new Error("No matching active investigation.");
    if (runtime.state.ended || runtime.state.col !== previous.col || runtime.state.row !== previous.row) {
      throw new Error("The journey has left this adventure.");
    }
    session = structuredClone(previous);
    if (isLocalLegendSession(session.contentVersion)) {
      if (action.type === "legend-restart") {
        session.actions = [];
        const progress = replayLegendSession(session);
        const costs = isDungeonSession(session.contentVersion) ? dungeonCosts(progress.metrics) : adventureCosts(progress.metrics);
        const before = runtime.state;
        const state = settleAdventureCosts(before, costs, { ...runtime, info });
        session = { ...session, costs, metrics: progress.metrics,
          ...(hasDungeonFood(session.contentVersion) ? { foodKcal: 0 } : {}),
          status: actionInterrupted(before, state) ? "interrupted" : "active" };
        return { ...runtime, adventure: session, state: { ...state,
          legendAdventure: session.status === "active" ? { version: 1, runId: session.runId } : null },
        revision: runtime.revision + 1,
        worldMinutes: runtime.worldMinutes + state.elapsedMinutes - before.elapsedMinutes };
      }
      if (action.type !== "legend-finish" || !Array.isArray(action.actions) ||
          action.actions.length > (isPlatformSession(session.contentVersion) ? MAX_PLATFORM_PACKETS : MAX_INVESTIGATION_ACTIONS)) {
        throw new Error("Local adventures require a bounded final input transcript.");
      }
      let attempt = createLocalLegendAttempt(session, { ...runtime, info });
      try {
        for (const input of action.actions) attempt = stepLocalLegendAttempt(attempt, input);
      } catch (reason) {
        if (!(reason instanceof RangeError)) throw reason;
        throw new Error(reason.message);
      }
      session = { ...session, actions: action.actions, costs: attempt.costs, metrics: attempt.progress.metrics,
        ...(hasDungeonFood(session.contentVersion) ? { foodKcal: attempt.foodKcal } : {}),
        status: attempt.interrupted ? "interrupted" : attempt.progress.completed ? "completed" : "left" };
      return { ...runtime, adventure: session, state: { ...attempt.state, legendAdventure: null },
        revision: runtime.revision + 1,
        worldMinutes: runtime.worldMinutes + attempt.state.elapsedMinutes - runtime.state.elapsedMinutes };
    }
    if (action.type === "legend-input") {
      session.actions.push(action.input);
      progress = replayLegendSession(session);
    } else if (action.type === "legend-leave") {
      progress = replayLegendSession(session);
      session.status = "left";
    } else throw new Error("Unknown investigation command.");
  }

  const costs = isDungeonSession(session.contentVersion) ? dungeonCosts(progress.metrics) : adventureCosts(progress.metrics);
  const paid = action.type === "legend-start"
    ? { minutes: 0, fatigue: 0, health: 0, dirt: 0 } : previous.costs;
  const increment = Object.fromEntries(Object.keys(costs).map(key => [key, costs[key] - paid[key]]));
  const before = runtime.state;
  let state = settleAdventureCosts(before, increment, { ...runtime, info, paidCosts: paid });
  if (actionInterrupted(before, state)) session.status = "interrupted";
  else if (progress.completed) session.status = "completed";
  if (hasDungeonFood(session.contentVersion)) session.foodKcal = 0;
  if (session.contentVersion === DUNGEON_FOOD_VERSION && action.type === "legend-input") {
    const earlier = replayLegendSession(previous);
    if (session.status !== "interrupted" && progress.defeated.some(id => !earlier.defeated.includes(id))) {
      const reserveKcal = Math.min(runtime.survival.reserve_kcal, state.reserveKcal + DUNGEON_FOOD_KCAL);
      session.foodKcal = reserveKcal - state.reserveKcal;
      state = { ...state, reserveKcal };
    }
  }
  session.costs = costs;
  session.metrics = progress.metrics;
  state = { ...state, legendAdventure: session.status === "active" ? { version: 1, runId: session.runId } : null };
  return { ...runtime, state, adventure: session, revision: runtime.revision + 1,
    worldMinutes: runtime.worldMinutes + state.elapsedMinutes - before.elapsedMinutes };
}

function validatePlatformPacket(input) {
  if (!exact(input, ["controls", "ticks"]) || !Number.isSafeInteger(input.ticks) ||
      input.ticks < 1 || input.ticks > 60 || !input.controls || typeof input.controls !== "object" ||
      Array.isArray(input.controls) || Object.entries(input.controls).some(([key, value]) =>
        !["left", "right", "up", "down", "jump", "interact", "retry"].includes(key) || value !== true)) {
    throw new Error("Invalid platform input packet.");
  }
}

export function createLocalLegendAttempt(session, runtime) {
  if (!isLocalLegendSession(session.contentVersion) || session.status !== "active" || session.actions.length) {
    throw new Error("Expected an unplayed local adventure.");
  }
  return { ...runtime, contentVersion: session.contentVersion, progress: replayLegendSession(session),
    costs: session.costs, foodKcal: 0, interrupted: false, ticks: 0, inputs: 0 };
}

export function stepLocalLegendAttempt(attempt, input) {
  const platform = isPlatformSession(attempt.contentVersion);
  if (attempt.interrupted || attempt.progress.completed) throw new Error("Adventure has already stopped.");
  if (platform) validatePlatformPacket(input);
  else if (attempt.inputs >= MAX_INVESTIGATION_ACTIONS) throw new Error("Adventure input limit reached.");
  const ticks = platform ? input.ticks : 1;
  if (platform && attempt.ticks + ticks > MAX_PLATFORM_TICKS) throw new Error("Platform input limit reached.");
  let next = { ...attempt, inputs: attempt.inputs + 1, foodKcal: 0 };
  for (let tick = 0; tick < ticks; tick++) {
    if (next.interrupted || next.progress.completed) throw new Error("Input after adventure stopped.");
    const previous = next.progress;
    if (platform) next.progress = stepPlatformer(previous, input.controls);
    else if (isDungeonSession(attempt.contentVersion)) {
      if (!exact(input, ["type"]) || !["up", "right", "down", "left", "interact", "attack", "wait", "retry"].includes(input.type)) {
        throw new Error("Invalid dungeon input.");
      }
      next.progress = stepDungeon(previous, input);
    } else next.progress = stepInvestigation(previous, input);
    const costs = isDungeonSession(attempt.contentVersion) ? dungeonCosts(next.progress.metrics) : adventureCosts(next.progress.metrics);
    const increment = Object.fromEntries(Object.keys(costs).map(key => [key, costs[key] - next.costs[key]]));
    const before = next.state;
    next.state = settleAdventureCosts(before, increment, { ...next, paidCosts: next.costs });
    next.interrupted = actionInterrupted(before, next.state);
    if (hasDungeonFood(attempt.contentVersion) && !next.interrupted &&
        next.progress.defeated.some(id => !previous.defeated.includes(id))) {
      const reserveKcal = Math.min(next.survival.reserve_kcal, next.state.reserveKcal + DUNGEON_FOOD_KCAL);
      next.foodKcal = reserveKcal - next.state.reserveKcal;
      next.state = { ...next.state, reserveKcal };
    }
    next.costs = costs;
    next.ticks++;
  }
  return next;
}
