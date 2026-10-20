import { validateSurvivalConfig, characterProfile, normalizeCharacterName } from "./survival.mjs";
import { validateEconomy, validateFainting } from "./economy.mjs";
import { chunkPosition } from "./travel.mjs";
import { validateTownTrail } from "./trail.mjs";
import { CLUE_ACTIONS } from "./trail-actions.mjs";
import { validateHospitality } from "./hospitality.mjs";
import { validateStoryProgress } from "./parent-story.mjs";
import { validateExploration } from "./trail-search.mjs";
import { validatePressures } from "./pressures.mjs";
import { validatePractice } from "./practice.mjs";
import { validateJourneyMap } from "./journey-map.mjs";
import { validateJourneyEvents, eventPlaytestEnabled } from "./journey-events.mjs";
import { validateHealth } from "./health.mjs";
import { restoreEquipment } from "./equipment.mjs";
import { validateJourneyMiniGames, abandonJourneyMiniGame } from "./journey-mini-games.mjs";
import { validateDiscovery } from "./discovery.mjs";
import { validateDiscoverySchedule } from "./discovery-policy.mjs";
import { validateTrailDreams } from "./trail-dreams.mjs";
import { validateJourneyWorld } from "./journey-world.mjs";
import { validateJourneyVisits } from "./journey-visits.mjs";

export const SAVE_VERSION = 1;
export const JOURNEY_SAVE_PREFIX = eventPlaytestEnabled() ? "arcane-event-playtest-v1:" : "arcane-journey-v1:";
const PREFIX = JOURNEY_SAVE_PREFIX;
export const JOURNEY_ARCHIVE_PREFIX = `${PREFIX}archive:`;

export function archivedJourneys(storage) {
  const saves = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(JOURNEY_ARCHIVE_PREFIX)) saves.push(validateSave(JSON.parse(storage.getItem(key))));
  }
  return saves.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function mapIdentity(map) {
  return JSON.stringify([map.width, map.height, map.cellSizeMeters, map.bounds, map.projectionLatitude ?? null]);
}

export function validateSave(save) {
  const fail = () => { throw new Error("Invalid or incompatible journey save."); };
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const nonnegative = value => finite(value) && value >= 0;
  const integer = value => Number.isSafeInteger(value);
  if (!save || save.version !== SAVE_VERSION || typeof save.region !== "string" ||
      !/^(?:[a-z]+|origin-[a-f0-9]{20})$/.test(save.region) || typeof save.mapIdentity !== "string" ||
      !integer(save.revision) || save.revision < 1 || typeof save.savedAt !== "string" ||
      !finite(Date.parse(save.savedAt))) fail();
  validateSurvivalConfig(save.survival);
  validateEconomy(save.economy);
  const s = save.state;
  if (s?.lore !== undefined) fail();
  validateJourneyMiniGames(s);
  if (s) validateDiscovery(s);
  if (s) validateDiscoverySchedule(s);
  validateTrailDreams(s);
  validateJourneyWorld(s);
  validateJourneyVisits(s);
  if (s?.storyNameFlavour !== undefined && typeof s.storyNameFlavour !== "boolean") fail();
  if (s?.equipment !== undefined) {
    const gear = restoreEquipment(s.equipment, { elapsedMinutes: s.elapsedMinutes });
    if (gear.walkedMeters > s.distanceMeters + 1e-6) fail();
  }
  for (const item of [...(s?.trail?.history ?? []),
    ...(s?.trail?.discovery ? [s.trail.discovery] : [])]) {
    if (item.elapsedMinutes !== undefined && (!nonnegative(item.elapsedMinutes) ||
        item.elapsedMinutes > s.elapsedMinutes)) fail();
  }
  if (s?.trail?.arrivals !== undefined && (!Array.isArray(s.trail.arrivals) ||
      s.trail.arrivals.length > s.trail.stages.length ||
      new Set(s.trail.arrivals.map(a => a?.stage)).size !== s.trail.arrivals.length ||
      s.trail.arrivals.some(a => !a || !integer(a.stage) || a.stage < 0 ||
        a.stage > s.trail.index || a.stage >= s.trail.stages.length ||
        !nonnegative(a.elapsedMinutes) || a.elapsedMinutes > s.elapsedMinutes))) fail();
  if (s?.journalAccess !== undefined && (typeof s.journalAccess !== "string" ||
      !/^[a-f0-9]{64}$/.test(s.journalAccess) || !s.serverJourney)) fail();
  if (s?.journalKeeper !== undefined && (typeof s.journalKeeper !== "string" ||
      !/^[a-f0-9]{32}$/.test(s.journalKeeper) || !s.journalAccess)) fail();
  if (s?.journalPublished !== undefined && typeof s.journalPublished !== "boolean") fail();
  if (s?.sidequests !== undefined && (!Array.isArray(s.sidequests) || s.sidequests.length > 1000 ||
      s.sidequests.some(q => !q || !/^[a-f0-9]{32}$/.test(q.id) ||
        typeof q.parent !== "string" || q.parent.length > 200 ||
        !Array.isArray(q.history) || q.history.length > 13 ||
        q.history.some(p => typeof p !== "string" || p.length > 200) ||
        !Array.isArray(q.stages) || q.stages.length < 10 || q.stages.length > 13 ||
        !integer(q.step) || q.step < 0 || q.step >= q.stages.length ||
        typeof q.delivered !== "boolean" || q.stages.some(p =>
          typeof p?.name !== "string" || p.name.length > 200 ||
          !finite(p.latitude) || Math.abs(p.latitude) > 90 ||
          !finite(p.longitude) || Math.abs(p.longitude) > 180)))) fail();
  if (s?.serverJourney !== undefined) {
    const metadata = s.serverJourney;
    if (!metadata || typeof metadata.id !== "string" || !/^[a-f0-9]{32}$/.test(metadata.id) ||
        typeof metadata.seed !== "string" || !/^[a-f0-9]{8}$/.test(metadata.seed) ||
        typeof metadata.contentVersion !== "string" || !/^[a-f0-9]{64}$/.test(metadata.contentVersion) ||
        typeof metadata.createdAt !== "string" ||
        !finite(Date.parse(metadata.createdAt)) || Date.parse(metadata.createdAt) !== s.startedAt) fail();
  }
  if (s?.name !== undefined && normalizeCharacterName(s.name) !== s.name) fail();
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
      (s.cafeShifts !== undefined && (!integer(s.cafeShifts) || s.cafeShifts < 0)) ||
      (s.lastEarningsCents !== undefined && (!integer(s.lastEarningsCents) || s.lastEarningsCents < 0)) ||
      ![null, "health", "hunger", "fatigue", "sleep", "reunion", "placement"].includes(s.ended) ||
      (s.performancePending !== undefined && s.performancePending !== null) ||
      (s.cafePending !== undefined && s.cafePending !== null) ||
      (s.theftPending !== undefined && s.theftPending !== null) ||
      (s.profileId !== "tarot" && !Object.hasOwn(save.survival.profiles, s.profileId)) ||
      !save.economy.tarot.some(c => c.id === s.birthCard) ||
      !save.economy.tarot.some(c => c.id === s.dailyCard) ||
      s.tarotDay !== new Date(s.startedAt + s.elapsedMinutes * 60000).toISOString().slice(0, 10)) fail();
  if (s.dailyTarotSeenDay !== undefined && (typeof s.dailyTarotSeenDay !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(s.dailyTarotSeenDay) ||
      !finite(Date.parse(`${s.dailyTarotSeenDay}T00:00:00Z`)) ||
      new Date(`${s.dailyTarotSeenDay}T00:00:00Z`).toISOString().slice(0, 10) !== s.dailyTarotSeenDay ||
      s.dailyTarotSeenDay > s.tarotDay)) fail();
  if (s.choiceCounts !== undefined && (!s.choiceCounts || typeof s.choiceCounts !== "object" ||
      Array.isArray(s.choiceCounts) || Object.entries(s.choiceCounts).some(([kind, count]) =>
        !["forage", "beg", "steal"].includes(kind) || !integer(count) || count < 0))) fail();
  if (s.lastSurvivalChoice !== undefined) {
    const result = s.lastSurvivalChoice;
    if (!result || !["forage", "beg", "steal"].includes(result.kind) ||
        !["food", "money", "nothing", "detained", "exhausted", "fainted", "placed"].includes(result.outcome) ||
        !["foodKcal", "moneyCents", "detentionMinutes", "minutes"].every(k => nonnegative(result[k])) ||
        !integer(result.moneyCents) || !s.choiceCounts?.[result.kind]) fail();
  }
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
  if (!trail || ![1, 2].includes(trail.version) || typeof trail.parentName !== "string" || !trail.parentName.trim() ||
      !Array.isArray(trail.stages) || !(trail.version === 2
        ? trail.stages.length === 10 || trail.story?.finalState === "mobile" && trail.stages.length === 13
        : [3, 10].includes(trail.stages.length)) ||
      !integer(trail.index) || trail.index < 0 || trail.index > trail.stages.length ||
      typeof trail.completed !== "boolean" ||
      (trail.completed ? trail.story?.finalState === "mobile" ? trail.index < 10 : trail.index !== trail.stages.length
        : trail.index >= trail.stages.length) ||
      (s.ended === "reunion") !== trail.completed ||
      !Array.isArray(trail.history) || trail.history.length !== trail.index ||
      new Set(trail.stages.map(p => `${p?.col},${p?.row}`)).size !== trail.stages.length ||
      trail.stages.some((p, index) => !p || !integer(p.col) || !integer(p.row) ||
        (trail.version === 1 && (p.col < 0 || p.row < 0)) ||
        typeof p.name !== "string" || !p.name.trim() ||
        !(trail.version === 2 && Number.isSafeInteger(p.geonameId) && p.geonameId > 0 ||
          /^(node|way)\/\d+$/.test(p.osmId)) ||
        p.witnessId !== `fictional-traveler-${index + 1}`)) fail();
  if (trail.version === 2) validateTownTrail(trail);
  validateStoryProgress(s);
  validatePractice(s);
  validateJourneyMap(s);
  validateJourneyEvents(s, save.economy, save.survival);
  validateHealth(s);
  if (s.lastCafe !== undefined) {
    const r = s.lastCafe;
    if (!r || !integer(r.level) || r.level < 0 || r.level > 4 || r.orders !== 5 + r.level ||
        !integer(r.served) || r.served < 0 || r.served > r.orders ||
        !integer(r.mistakes) || r.mistakes < 0 || typeof r.cancelled !== "boolean" ||
        !integer(r.rewardCents) || r.rewardCents < 0 || !nonnegative(r.foodKcal) || r.foodKcal > 600 ||
        !s.cafeShifts || (r.cancelled || r.served === 0) && (r.served !== 0 || r.rewardCents !== 0 || r.foodKcal !== 0)) fail();
  }
  validatePressures(s, save.economy);
  validateExploration(s);
  if (trail.version === 2 && trail.discovery !== undefined) {
    const d = trail.discovery;
    if (!d || !Object.hasOwn(CLUE_ACTIONS, d.kind) || ["directions", "rumor"].includes(d.kind) ||
        !integer(d.step) || d.step < 0 || d.step >= trail.stages.length || typeof d.pending !== "boolean" ||
        d.step !== (d.pending ? trail.index : trail.index - 1) ||
        d.place !== trail.stages[d.step].name ||
        d.nextName !== (trail.completed ? null : trail.stages[d.step + 1]?.name ?? null) ||
        d.venue !== (trail.completed ? null : trail.stages[d.step + 1]?.venue?.name ?? null) ||
        (d.pending && !d.venue)) fail();
  }
  for (let i = 0; i < trail.history.length; i++) {
    const fact = trail.history[i], stage = trail.stages[i],
      next = trail.completed && i === trail.index - 1 ? null : trail.stages[i + 1] ?? null;
    if (!fact || fact.fictional !== true || fact.parentName !== trail.parentName ||
        fact.witnessId !== stage.witnessId || fact.place !== stage.name ||
        JSON.stringify(fact.next) !== JSON.stringify(next)) fail();
    if (trail.version === 2 && (!Object.hasOwn(CLUE_ACTIONS, fact.clueKind) ||
        ["directions", "rumor"].includes(fact.clueKind) || typeof fact.usedDirections !== "boolean")) fail();
  }
  if (s.ended === null && (s.reserveKcal <= 0 && s.health === undefined || s.fatigue >= 100 ||
      s.awakeHours >= save.survival.sleep_limit_hours)) fail();
  validateHospitality(s, save.survival);
  validateFainting(s);
  return save;
}

export function createSave({ region, map, state, survival, economy }, revision, now = new Date()) {
  const savedState = structuredClone(state);
  if (savedState.miniGamePending) {
    Object.assign(savedState, abandonJourneyMiniGame(savedState));
  }
  if (savedState.theftPending) {
    const startedMinutes = savedState.theftPending.startedMinutes;
    savedState.theftPending = null;
    savedState.choiceCounts = { ...savedState.choiceCounts, steal: (savedState.choiceCounts?.steal ?? 0) + 1 };
    savedState.lastSurvivalChoice = { kind: "steal", outcome: "nothing", foodKcal: 0,
      moneyCents: 0, detentionMinutes: 0, minutes: savedState.elapsedMinutes - startedMinutes };
  }
  if (savedState.performancePending) {
    savedState.performancePending = null;
    savedState.lastEarningsCents = 0;
    savedState.performances = (savedState.performances ?? 0) + 1;
  }
  if (savedState.cafePending) {
    const shift = savedState.cafePending;
    savedState.cafePending = null;
    savedState.cafeShifts = (savedState.cafeShifts ?? 0) + 1;
    savedState.lastCafe = { served: 0, orders: shift.orders, mistakes: 0, cancelled: true,
      rewardCents: 0, foodKcal: 0, level: shift.level };
  }
  return validateSave({ version: SAVE_VERSION, region, mapIdentity: mapIdentity(map),
    revision, savedAt: now.toISOString(), state: savedState,
    survival: structuredClone(survival), economy: structuredClone(economy) });
}

export function createJourneyStore(storage) {
  const observed = new Map();
  const revisions = new Map();
  return {
    archive(save) {
      validateSave(save);
      const owner = save.state.serverJourney?.id ?? String(save.state.startedAt);
      const key = JOURNEY_ARCHIVE_PREFIX + owner;
      const previous = storage.getItem(key);
      if (previous !== null && previous !== JSON.stringify(save)) {
        throw new Error("An archive already exists for this journey; refusing to overwrite it.");
      }
      storage.setItem(key, JSON.stringify(save));
      if (storage.getItem(key) !== JSON.stringify(save)) throw new Error("Journey archive could not be verified.");
    },
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
