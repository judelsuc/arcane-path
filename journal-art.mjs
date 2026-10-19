const DAY = 86400000;
const PREFIX = "arcane-journal-art-v1:";
const CARDS = new Set(["fool", "magician", "priestess", "empress", "emperor", "hierophant",
  "lovers", "chariot", "justice", "hermit", "wheel", "strength", "hanged", "nameless",
  "temperance", "devil", "tower", "star", "moon", "sun", "judgement", "world"]);
const SCENES = new Set(["mountains", "town", "forest", "countryside", "water", "rain", "snow"]);
const ACTIVITIES = new Set(["walking", "rest", "sleep", "meal", "music", "work", "forage", "encounter", "arrival"]);
export const COVER_ART_ID = "journal-art:cover";
const date = time => new Date(time).toISOString().slice(0, 10);

export function illustrationScenes(terrain, condition) {
  const scenes = [];
  if (["mountain", "hill"].includes(terrain)) scenes.push("mountains");
  else if (["place", "building", "church", "station"].includes(terrain)) scenes.push("town");
  else if (["forest", "park"].includes(terrain)) scenes.push("forest");
  else if (terrain === "water") scenes.push("water");
  else if (terrain) scenes.push("countryside");
  if (["rain", "storm", "showers"].includes(condition)) scenes.push("rain");
  if (condition === "snow") scenes.push("snow");
  return scenes;
}

const counters = state => ({
  walking: state.distanceMeters ?? 0, rest: state.rests ?? 0, sleep: state.sleeps ?? 0,
  meal: state.meals ?? 0, music: state.performances ?? 0,
  work: (state.cafeShifts ?? 0) + (state.journeyMiniGamesPlayed ?? 0),
  forage: state.choiceCounts?.forage ?? 0, encounter: state.events?.count ?? 0,
  arrival: state.trail?.arrivals?.length ?? 0,
});

export function observeIllustrationDay(previous, state, scenes) {
  const now = state.startedAt + state.elapsedMinutes * 60000;
  if (!Number.isFinite(now) || !CARDS.has(state.birthCard) || !CARDS.has(state.dailyCard) ||
      !Array.isArray(scenes) || scenes.some(scene => !SCENES.has(scene))) {
    throw new Error("Invalid journal illustration observation.");
  }
  const counts = counters(state), today = date(now);
  const brief = { key: today, birth: state.birthCard, daily: state.dailyCard,
    scenes: [...new Set(scenes)], activities: [], partial: state.elapsedMinutes > 0 };
  if (previous === null) return {
    version: 1, time: now, counts, current: brief, days: [],
    cover: { ...brief, key: "cover", activities: [] },
  };
  if (previous.version !== 1 || !Number.isFinite(previous.time) || !previous.counts ||
      !previous.current || !Array.isArray(previous.days) || !previous.cover ||
      previous.days.length > 366 || previous.time > now ||
      !Array.isArray(previous.current.activities) ||
      previous.current.activities.some(activity => !ACTIVITIES.has(activity)) ||
      !Array.isArray(previous.current.scenes) ||
      previous.current.scenes.some(scene => !SCENES.has(scene))) {
    throw new Error("Invalid or rewound illustration history; existing artwork was preserved.");
  }
  if (date(previous.time) !== previous.current.key) throw new Error("Inconsistent illustrated day.");
  const next = structuredClone(previous);
  const changed = Object.keys(counts).filter(key => counts[key] > previous.counts[key]);
  let midnight = (Math.floor(previous.time / DAY) + 1) * DAY;
  let current = next.current;
  // Crossing actions span both sides; only continuous walking/sleep are attributed to each touched day.
  const continuous = changed.filter(key => ["walking", "sleep"].includes(key));
  while (midnight <= now) {
    if (next.days.length >= 365) throw new Error("Journal illustration history has reached its one-year limit.");
    current.activities = [...new Set([...current.activities, ...continuous])];
    next.days.push(current);
    current = { ...brief, key: date(midnight), activities: [...continuous], partial: false };
    midnight += DAY;
  }
  current.activities = [...new Set([...current.activities, ...changed])];
  current.scenes = [...new Set([...current.scenes, ...scenes])];
  current.daily = state.dailyCard;
  next.current = current;
  next.time = now;
  next.counts = counts;
  return next;
}

export function createJournalIllustrator({
  storage, fetcher = fetch, onStatus = () => {},
  onAsset = async () => {}, schedule = setTimeout, cancel = clearTimeout,
} = {}) {
  let active = null, history = null, busy = false, timer, epoch = 0, disabled = false;
  let lastSync = -Infinity;
  const delivered = new Set();
  async function request(state, body, image = false) {
    const response = await fetcher("/api/journal-art", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Journal-Capability": state.journalAccess },
      body: JSON.stringify({ journey: state.serverJourney.id,
        ...(state.journalKeeper ? { keeper: state.journalKeeper } : {}), ...body }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error ?? `Journal artwork HTTP ${response.status}`);
    }
    if (image) {
      const blob = await response.blob();
      if (blob.type !== "image/webp" || !blob.size || blob.size > 2_000_000) {
        throw new Error("Invalid journal illustration image.");
      }
      return blob;
    }
    const result = await response.json();
    if (typeof result.enabled !== "boolean" || !Array.isArray(result.entries)) {
      throw new Error("Invalid journal illustration service response.");
    }
    return result;
  }
  async function sync() {
    if (busy || !active || disabled) return;
    busy = true;
    const owner = active, current = epoch, record = structuredClone(history);
    try {
      let result = await request(owner, { operation: "sync" });
      if (epoch !== current) return;
      if (!result.enabled) { disabled = true; onStatus("disabled"); return; }
      const keys = new Set(result.entries.map(entry => entry.key));
      for (const brief of [record.cover, ...record.days]) {
        if (epoch !== current) return;
        if (!keys.has(brief.key)) result = await request(owner, { operation: "enqueue", brief });
      }
      if (epoch !== current) return;
      for (const entry of result.entries) {
        if (entry.status !== "ready") continue;
        const delivery = `${owner.journalKeeper ?? owner.serverJourney.id}:${entry.key}`;
        if (delivered.has(delivery)) continue;
        const blob = await request(owner, { operation: "image", key: entry.key }, true);
        if (epoch !== current) return;
        await onAsset(entry, blob, owner);
        delivered.add(delivery);
      }
      if (epoch !== current) return;
      const failed = result.entries.find(entry => entry.status === "failed");
      if (failed) onStatus("failed", failed.error);
      else onStatus(result.entries.some(entry => ["queued", "running"].includes(entry.status)) ? "pending" : "ready");
      if (result.entries.some(entry => ["queued", "running"].includes(entry.status))) {
        timer = schedule(() => { timer = undefined; void sync(); }, 15000);
      }
    } catch (error) {
      if (epoch === current) {
        console.error("Journal illustration sync failed:", error);
        onStatus("failed", error.message);
      }
    } finally {
      busy = false;
      lastSync = Date.now();
      if (epoch === current && history.days.length !== record.days.length && timer === undefined) {
        timer = schedule(() => { timer = undefined; void sync(); }, 0);
      }
    }
  }
  return {
    observe(state, scenes) {
      if (!state?.serverJourney?.id || !state.journalAccess) return;
      storage ??= globalThis.localStorage;
      if (!storage) throw new Error("Browser storage is required to retain illustration observations.");
      const changed = active?.serverJourney.id !== state.serverJourney.id ||
        active?.journalKeeper !== state.journalKeeper;
      if (changed) {
        epoch++;
        if (timer !== undefined) cancel(timer);
        timer = undefined;
        disabled = false;
        const key = PREFIX + (state.journalKeeper ?? state.serverJourney.id);
        history = JSON.parse(storage.getItem(key) ?? "null");
      }
      active = state;
      const before = history?.days.length ?? 0;
      history = observeIllustrationDay(history, state, scenes);
      storage.setItem(PREFIX + (state.journalKeeper ?? state.serverJourney.id), JSON.stringify(history));
      if (!busy && !disabled && (changed || before !== history.days.length ||
          timer === undefined && Date.now() - lastSync > 60000)) void sync();
    },
    refresh() {
      disabled = false;
      if (timer !== undefined) cancel(timer);
      timer = undefined;
      void sync();
    },
    stop() {
      epoch++;
      if (timer !== undefined) cancel(timer);
      timer = undefined;
      active = history = null;
    },
  };
}
