import { validateSurvivalConfig, characterProfile } from "./survival.mjs";
import { validateEconomy } from "./economy.mjs";
import { chunkPosition } from "./travel.mjs";

export const SAVE_VERSION = 1;
const PREFIX = "arcane-journey-v1:";

export function mapIdentity(map) {
  return JSON.stringify([map.width, map.height, map.cellSizeMeters, map.bounds, map.projectionLatitude ?? null]);
}

export function validateSave(save) {
  const fail = () => { throw new Error("Invalid or incompatible journey save."); };
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const nonnegative = value => finite(value) && value >= 0;
  const integer = value => Number.isSafeInteger(value);
  if (!save || save.version !== SAVE_VERSION || typeof save.region !== "string" ||
      !/^[a-z]+$/.test(save.region) || typeof save.mapIdentity !== "string" ||
      !integer(save.revision) || save.revision < 1 || typeof save.savedAt !== "string" ||
      !finite(Date.parse(save.savedAt))) fail();
  validateSurvivalConfig(save.survival);
  validateEconomy(save.economy);
  const s = save.state;
  if (!s || !integer(s.col) || !integer(s.row) ||
      Math.abs(chunkPosition(s.col, s.row).x) > 1000 ||
      Math.abs(chunkPosition(s.col, s.row).y) > 1000 || s.mode !== "walk" ||
      !finite(s.startedAt) || !finite(s.startedAt + s.elapsedMinutes * 60000) ||
      !finite(new Date(s.startedAt + s.elapsedMinutes * 60000).getTime()) ||
      !["distanceMeters", "elapsedMinutes", "fatigue", "energyKcal", "ascentMeters",
        "descentMeters", "reserveKcal", "awakeHours", "outdoorNightMinutes"].every(k => nonnegative(s[k])) ||
      s.fatigue > 100 || s.reserveKcal > save.survival.reserve_kcal ||
      !["meals", "sleeps", "walletCents", "lastExpenseCents"].every(k => integer(s[k]) && s[k] >= 0) ||
      (s.performances !== undefined && (!integer(s.performances) || s.performances < 0)) ||
      (s.lastEarningsCents !== undefined && (!integer(s.lastEarningsCents) || s.lastEarningsCents < 0)) ||
      ![null, "hunger", "fatigue", "sleep", "reunion"].includes(s.ended) ||
      (s.performancePending !== undefined && s.performancePending !== null) ||
      (s.profileId !== "tarot" && !Object.hasOwn(save.survival.profiles, s.profileId)) ||
      !save.economy.tarot.some(c => c.id === s.birthCard) ||
      !save.economy.tarot.some(c => c.id === s.dailyCard) ||
      s.tarotDay !== new Date(s.startedAt + s.elapsedMinutes * 60000).toISOString().slice(0, 10)) fail();
  const attributes = s.profileId === "tarot"
    ? save.economy.tarot.find(c => c.id === s.birthCard)?.attributes
    : save.survival.profiles[s.profileId];
  if (!attributes) fail();
  const character = characterProfile(attributes);
  if (!s.character || Object.entries(character).some(([k, v]) => s.character[k] !== v)) fail();
  if (s.lastMove !== null && (!s.lastMove || !["meters", "minutes", "speedKmh",
    "energyKcal", "fatigueGain", "ascentMeters", "descentMeters", "terrainCost"]
    .every(k => nonnegative(s.lastMove[k])) || typeof s.lastMove.elevationKnown !== "boolean")) fail();
  const trail = s.trail;
  if (!trail || trail.version !== 1 || typeof trail.parentName !== "string" || !trail.parentName.trim() ||
      !Array.isArray(trail.stages) || ![3, 10].includes(trail.stages.length) ||
      !integer(trail.index) || trail.index < 0 || trail.index > trail.stages.length ||
      trail.completed !== (trail.index === trail.stages.length) ||
      (s.ended === "reunion") !== trail.completed ||
      !Array.isArray(trail.history) || trail.history.length !== trail.index ||
      new Set(trail.stages.map(p => `${p?.col},${p?.row}`)).size !== trail.stages.length ||
      trail.stages.some((p, index) => !p || !integer(p.col) || !integer(p.row) || p.col < 0 || p.row < 0 ||
        typeof p.name !== "string" || !p.name.trim() || !/^(node|way)\/\d+$/.test(p.osmId) ||
        p.witnessId !== `fictional-traveler-${index + 1}`)) fail();
  for (let i = 0; i < trail.history.length; i++) {
    const fact = trail.history[i], stage = trail.stages[i], next = trail.stages[i + 1] ?? null;
    if (!fact || fact.fictional !== true || fact.parentName !== trail.parentName ||
        fact.witnessId !== stage.witnessId || fact.place !== stage.name ||
        JSON.stringify(fact.next) !== JSON.stringify(next)) fail();
  }
  if (s.ended === null && (s.reserveKcal <= 0 || s.fatigue >= 100 ||
      s.awakeHours >= save.survival.sleep_limit_hours)) fail();
  return save;
}

export function createSave({ region, map, state, survival, economy }, revision, now = new Date()) {
  const savedState = structuredClone(state);
  if (savedState.performancePending) {
    savedState.performancePending = null;
    savedState.lastEarningsCents = 0;
    savedState.performances = (savedState.performances ?? 0) + 1;
  }
  return validateSave({ version: SAVE_VERSION, region, mapIdentity: mapIdentity(map),
    revision, savedAt: now.toISOString(), state: savedState,
    survival: structuredClone(survival), economy: structuredClone(economy) });
}

export function createJourneyStore(storage) {
  const observed = new Map();
  const revisions = new Map();
  return {
    read(region) {
      const raw = storage.getItem(PREFIX + region);
      observed.set(region, raw);
      revisions.set(region, 0);
      if (raw === null) return null;
      const save = validateSave(JSON.parse(raw));
      if (save.region !== region) throw new Error("Journey save belongs to another region.");
      revisions.set(region, save.revision);
      return save;
    },
    write(details) {
      const { region } = details;
      if (!observed.has(region) || storage.getItem(PREFIX + region) !== observed.get(region)) {
        throw new Error("Journey save changed in another tab. Reload before saving.");
      }
      const revision = revisions.get(region) + 1;
      const save = createSave(details, revision);
      const raw = JSON.stringify(save);
      storage.setItem(PREFIX + region, raw);
      observed.set(region, raw);
      revisions.set(region, revision);
      return save;
    },
  };
}
