import { openContentCache } from "./content-cache.mjs";

function pause(signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, 1000);
    function done() { signal?.removeEventListener("abort", aborted); resolve(); }
    function aborted() {
      clearTimeout(timer);
      signal.removeEventListener("abort", aborted);
      reject(signal.reason);
    }
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}

export function createTownContentClient({
  context, cache = openContentCache(), fetcher = fetch, wait = pause,
} = {}) {
  async function send(state, town, language, details, signal) {
    if (!state?.serverJourney?.id || !state.journalAccess) {
      throw new Error("A server journey and private capability are required for town sources.");
    }
    const response = await fetcher("/api/town-content", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Journal-Capability": state.journalAccess },
      body: JSON.stringify({ journey: state.serverJourney.id,
        location: { col: state.col, row: state.row }, town, language, ...details }),
      signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(10000)]),
    });
    const result = details.image && response.ok ? await response.blob() : await response.json();
    if (!response.ok) throw new Error(result.error ?? `Town documentary HTTP ${response.status}`);
    return result;
  }

  async function resolve(view, language, refresh = false, onProgress = () => {}, signal) {
    const town = view.settlement.osmId;
    const key = `town-document-v1:${town}:${language}`;
    const cached = await cache.get(key);
    if (!refresh && cached && !cached.loading && cached.expiresAt > Date.now()) {
      return { ...cached, cached: true };
    }
    const state = structuredClone(context());
    const photos = new Map((cached?.photos ?? []).filter(photo => photo.blob)
      .map(photo => [photo.imageId, photo]));
    for (let poll = 0; poll < 150; poll++) {
      signal?.throwIfAborted();
      const result = await send(state, town, language, { refresh: refresh && poll === 0 }, signal);
      if (result.identity !== town || result.language !== language || !Array.isArray(result.photos) ||
          result.photos.length > 5 || !Array.isArray(result.errors) || typeof result.loading !== "boolean") {
        throw new Error("Invalid town documentary response.");
      }
      const errors = [...result.errors];
      const loaded = [];
      for (const photo of result.photos) {
        let saved = photos.get(photo.imageId);
        if (!saved) {
          try {
            const blob = await send(state, town, language, { image: photo.imageId }, signal);
            if (!blob.size || blob.size > 12_000_000 ||
                !["image/jpeg", "image/png", "image/webp"].includes(blob.type)) {
              throw new Error("Invalid documentary photograph.");
            }
            saved = { ...photo, blob };
          } catch (error) {
            if (signal?.aborted) throw error;
            console.error("Town documentary photograph unavailable:", error);
            saved = { ...photo, failed: true, error: error.message };
          }
          photos.set(photo.imageId, saved);
        }
        loaded.push(saved);
        if (saved.failed) errors.push(`Photo: ${saved.error}`);
      }
      const progress = { ...result, photos: loaded, errors, cached: Boolean(result.cached) };
      onProgress(progress);
      if (!result.loading) {
        const complete = { ...progress,
          expiresAt: errors.length ? Math.min(result.expiresAt, Date.now() + 300000) : result.expiresAt };
        await cache.put(key, complete);
        return complete;
      }
      await wait(signal);
    }
    throw new Error("Town documentary sources are still pending. Please retry later.");
  }
  return { resolve };
}
