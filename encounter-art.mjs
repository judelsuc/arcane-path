import { IMAGE_LICENSE } from "./journal-art.mjs";

export function encounterIllustrationRecords(state) {
  return [
    ...(state?.events?.history ?? []).map(event =>
      ({ scene: `event.${event.kind}`, occurrence: `event:${event.id}` })),
    ...(state?.trail?.dreams?.checks ?? []).filter(check => check.outcome === "guidance").map(check =>
      ({ scene: "dream.lost-player", occurrence: `dream:${check.checkMinutes}` })),
    ...(state?.hospitalityAttempts ?? []).filter(attempt => ["hosted", "refused"].includes(attempt.outcome))
      .map(attempt => ({ scene: `npc.hospitality.${attempt.outcome}`,
        occurrence: `hospitality:${attempt.startedMinutes}` })),
  ];
}

export function createEncounterIllustrator({ fetcher = fetch, onAsset = async () => {},
  onError = () => {}, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let state, owner, epoch = 0, busy = false, timer, failed = "", disabled = false, lastSync = -Infinity;
  const observations = new Map(), assets = new Map(), listeners = new Set(), delivered = new Set();
  const urls = new Map(), blobs = new Map(), sceneFailures = new Map();
  function release(container) {
    const url = urls.get(container);
    if (url) { URL.revokeObjectURL(url); urls.delete(container); }
  }
  const emit = () => { for (const listener of listeners) listener(); };
  async function request(current, body, image = false) {
    const response = await fetcher("/api/encounter-art", {
      method: "POST", headers: { "Content-Type": "application/json",
        "X-Journal-Capability": current.journalAccess },
      body: JSON.stringify({ journey: current.serverJourney.id,
        ...(current.journalKeeper ? { keeper: current.journalKeeper } : {}), ...body }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Encounter illustration HTTP ${response.status}`);
    if (!image) return response.json();
    const blob = await response.blob();
    if (blob.type !== "image/webp" || !blob.size || blob.size > 2_000_000) {
      throw new Error("Invalid encounter illustration image.");
    }
    return blob;
  }
  async function sync() {
    if (busy || !state?.journalAccess || failed || !observations.size) return;
    const current = state, version = epoch, items = [...observations.values()]
      .filter(item => !sceneFailures.has(item.scene) &&
        (!assets.has(item.occurrence) || !delivered.has(item.occurrence)));
    busy = true;
    let pending = false;
    try {
      for (let offset = 0; offset < items.length; offset += 16) {
        const batch = items.slice(offset, offset + 16);
        const result = await request(current, { operation: "sync", items: batch });
        if (version !== epoch) return;
        if (typeof result.enabled !== "boolean" || !Array.isArray(result.entries) ||
            result.entries.length !== batch.length) throw new Error("Invalid encounter illustration response.");
        disabled = !result.enabled;
        if (disabled) emit();
        const seen = new Set();
        for (const entry of result.entries) {
          const expected = batch.find(item => item.occurrence === entry.occurrence);
          if (!expected || seen.has(entry.occurrence) || entry.scene !== expected.scene ||
              !["pending", "ready", "failed"].includes(entry.status) ||
              entry.status === "ready" && (!/^[a-f0-9]{32}$/.test(entry.id) ||
                !Number.isFinite(entry.created) || entry.license !== IMAGE_LICENSE)) {
            throw new Error("Invalid encounter illustration entry.");
          }
          seen.add(entry.occurrence);
          if (entry.status === "failed") {
            if (!sceneFailures.has(entry.scene)) {
              const reason = new Error(entry.error ?? "Encounter illustration generation failed.");
              sceneFailures.set(entry.scene, reason.message);
              console.error("Encounter scene illustration unavailable:", reason);
              onError(reason);
              emit();
            }
            continue;
          }
          if (entry.status === "pending") { pending = true; continue; }
          if (entry.renewing) pending = true;
          const known = assets.get(entry.occurrence);
          const blob = known?.id === entry.id ? known.blob : blobs.get(entry.id) ?? await request(current, { operation: "image",
            occurrence: entry.occurrence, image: entry.id }, true);
          if (version !== epoch) return;
          blobs.set(entry.id, blob);
          if (known?.id !== entry.id) {
            assets.set(entry.occurrence, { ...entry, blob });
            emit();
          }
          if (!delivered.has(entry.occurrence)) {
            await onAsset(entry, blob, current);
            if (version !== epoch) return;
            delivered.add(entry.occurrence);
          }
        }
      }
    } catch (reason) {
      if (version === epoch) {
        failed = reason.message;
        console.error("Encounter illustrations unavailable:", reason);
        onError(reason);
        emit();
      }
    } finally {
      if (version === epoch) {
        busy = false;
        lastSync = Date.now();
        const unfinished = [...observations.values()].some(item =>
          !sceneFailures.has(item.scene) &&
          (!assets.has(item.occurrence) || !delivered.has(item.occurrence)));
        if (!failed && !disabled && (pending || unfinished)) {
          timer = schedule(() => { timer = undefined; void sync(); }, 2000);
        }
      }
    }
  }
  function activate(current) {
    const next = current?.journalAccess && current?.serverJourney?.id
      ? `${current.journalKeeper ?? current.serverJourney.id}:${current.journalAccess}` : null;
    state = current;
    if (next === owner) return;
    epoch++;
    for (const container of urls.keys()) {
      release(container);
      container.dataset.image = "";
      container.dataset.ready = "";
    }
    cancel(timer);
    timer = undefined;
    owner = next;
    busy = disabled = false;
    failed = "";
    lastSync = -Infinity;
    observations.clear(); assets.clear(); delivered.clear(); blobs.clear(); sceneFailures.clear();
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    observe(current) {
      activate(current);
      if (!owner) return;
      let changed = false;
      for (const record of encounterIllustrationRecords(current)) {
        if (!observations.has(record.occurrence)) changed = true;
        observations.set(record.occurrence, record);
      }
      if (changed) { cancel(timer); timer = undefined; }
      if (!busy && timer === undefined && (changed || Date.now() - lastSync > 60000)) void sync();
    },
    render(container, current, scene, occurrence, t) {
      activate(current);
      container.hidden = !owner;
      if (!owner) return false;
      const changed = !observations.has(occurrence);
      observations.set(occurrence, { scene, occurrence });
      const asset = assets.get(occurrence);
      if (asset) {
        if (container.dataset.image === asset.id) {
          const image = container.querySelector("img");
          if (image) image.alt = t("encounterIllustration");
          const link = container.querySelector("a");
          if (link) link.textContent = t("encounterIllustrationCredit");
          return container.dataset.ready === asset.id;
        }
        release(container);
        const image = document.createElement("img");
        const url = URL.createObjectURL(asset.blob);
        image.src = url;
        image.alt = t("encounterIllustration");
        image.className = "encounter-illustration-image";
        urls.set(container, url);
        image.addEventListener("load", () => {
          if (urls.get(container) === url) {
            release(container);
            container.dataset.ready = asset.id;
            emit();
          }
        }, { once: true });
        image.addEventListener("error", () => {
          if (urls.get(container) !== url) return;
          release(container);
          container.dataset.ready = "";
          container.dataset.image = "";
          assets.delete(occurrence);
          const reason = new Error(t("journalImageError"));
          failed = reason.message;
          console.error("Encounter illustration could not be decoded:", reason);
          onError(reason);
          emit();
        }, { once: true });
        const credit = document.createElement("figcaption");
        credit.className = "technical-text";
        const link = document.createElement("a");
        link.href = IMAGE_LICENSE;
        link.textContent = t("encounterIllustrationCredit");
        link.target = "_blank"; link.rel = "noopener noreferrer";
        credit.append(link);
        container.replaceChildren(image, credit);
        container.dataset.image = asset.id;
        container.dataset.ready = "";
      } else {
        release(container);
        container.dataset.image = "";
        container.dataset.ready = "";
        const status = document.createElement("figcaption");
        status.className = "technical-text";
        const error = sceneFailures.get(scene) ?? failed;
        status.textContent = error ? t("journalError", { error })
          : t(disabled ? "encounterIllustrationDisabled" : "encounterIllustrationPending");
        if (error) status.dataset.feedback = "failure";
        container.replaceChildren(status);
      }
      if (changed && !busy && timer === undefined && !failed) void sync();
      return container.dataset.ready === asset?.id && Boolean(asset);
    },
    refresh() {
      failed = ""; disabled = false; sceneFailures.clear();
      cancel(timer); timer = undefined;
      void sync();
    },
    stop() { activate(null); },
  };
}
