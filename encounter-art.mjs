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
  const urls = new Map();
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
    if (busy || !state?.journalAccess || disabled || failed || !observations.size) return;
    const current = state, version = epoch, items = [...observations.values()];
    busy = true;
    let pending = false;
    try {
      for (let offset = 0; offset < items.length; offset += 16) {
        const batch = items.slice(offset, offset + 16);
        const result = await request(current, { operation: "sync", items: batch });
        if (version !== epoch) return;
        if (typeof result.enabled !== "boolean" || !Array.isArray(result.entries) ||
            result.entries.length !== batch.length) throw new Error("Invalid encounter illustration response.");
        if (!result.enabled) { disabled = true; emit(); return; }
        const seen = new Set();
        for (const entry of result.entries) {
          const expected = batch.find(item => item.occurrence === entry.occurrence);
          if (!expected || seen.has(entry.occurrence) || entry.scene !== expected.scene ||
              !["pending", "ready"].includes(entry.status) ||
              entry.status === "ready" && (!/^[a-f0-9]{32}$/.test(entry.id) ||
                !Number.isFinite(entry.created) || entry.license !== IMAGE_LICENSE)) {
            throw new Error("Invalid encounter illustration entry.");
          }
          seen.add(entry.occurrence);
          if (entry.status === "pending") { pending = true; continue; }
          if (entry.renewing) pending = true;
          if (assets.get(entry.occurrence)?.id === entry.id) continue;
          const blob = await request(current, { operation: "image",
            occurrence: entry.occurrence, image: entry.id }, true);
          if (version !== epoch) return;
          if (!delivered.has(entry.occurrence)) {
            await onAsset(entry, blob, current);
            if (version !== epoch) return;
            delivered.add(entry.occurrence);
          }
          assets.set(entry.occurrence, { ...entry, blob });
          emit();
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
        if (!failed && !disabled && (pending || observations.size > items.length)) {
          timer = schedule(() => { timer = undefined; void sync(); }, 60000);
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
    for (const container of urls.keys()) release(container);
    cancel(timer);
    timer = undefined;
    owner = next;
    busy = disabled = false;
    failed = "";
    lastSync = -Infinity;
    observations.clear(); assets.clear(); delivered.clear();
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    observe(current) {
      activate(current);
      if (!owner) return;
      for (const record of encounterIllustrationRecords(current)) observations.set(record.occurrence, record);
      if (!busy && timer === undefined && Date.now() - lastSync > 60000) void sync();
    },
    render(container, current, scene, occurrence, t) {
      activate(current);
      container.hidden = !owner;
      if (!owner) return;
      const changed = !observations.has(occurrence);
      observations.set(occurrence, { scene, occurrence });
      const asset = assets.get(occurrence);
      if (asset) {
        if (container.dataset.image === asset.id) {
          const image = container.querySelector("img");
          if (image) image.alt = t("encounterIllustration");
          const link = container.querySelector("a");
          if (link) link.textContent = t("encounterIllustrationCredit");
          return;
        }
        release(container);
        const image = document.createElement("img");
        const url = URL.createObjectURL(asset.blob);
        image.src = url;
        image.alt = t("encounterIllustration");
        image.className = "encounter-illustration-image";
        urls.set(container, url);
        image.addEventListener("load", () => {
          if (urls.get(container) === url) release(container);
        }, { once: true });
        image.addEventListener("error", () => {
          if (urls.get(container) === url) release(container);
          const reason = new Error(t("journalImageError"));
          onError(reason);
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
      } else {
        release(container);
        container.dataset.image = "";
        const status = document.createElement("figcaption");
        status.className = "technical-text";
        status.textContent = failed ? t("journalError", { error: failed })
          : t(disabled ? "encounterIllustrationDisabled" : "encounterIllustrationPending");
        if (failed) status.dataset.feedback = "failure";
        container.replaceChildren(status);
      }
      if (changed && !busy && timer === undefined && !failed && !disabled) void sync();
    },
    refresh() {
      failed = ""; disabled = false;
      cancel(timer); timer = undefined;
      void sync();
    },
    stop() { activate(null); },
  };
}
