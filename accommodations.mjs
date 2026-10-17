import { distanceMeters } from "./cell-content.mjs";

export async function loadAccommodations(region, info, signal, fetcher = fetch, onProgress = () => {}) {
  signal = AbortSignal.any([signal, AbortSignal.timeout(240000)]);
  const started = Date.now();
  const progress = (phase, provider, cached) => onProgress({
    phase, provider, cached, elapsedSeconds: Math.floor((Date.now() - started) / 1000),
  });
  progress("queued");
  const query = new URLSearchParams({ region, latitude: info.latitude, longitude: info.longitude });
  for (;;) {
    signal.throwIfAborted();
    const response = await fetcher(`/api/accommodations?${query}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    });
    if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
      throw new Error("The updated game server is required to find accommodation.");
    }
    const result = await response.json();
    if (response.status === 202 || response.status === 429) {
      signal.throwIfAborted();
      const event = result?.progress;
      if (event !== undefined && (!event || typeof event !== "object" ||
          !["queued", "maps", "osm", "provider", "catalogue", "filtering", "saving"].includes(event.phase) ||
          (event.provider !== undefined && (typeof event.provider !== "string" || event.provider.length > 253)))) {
        throw new Error("Invalid accommodation search progress.");
      }
      if (event?.cached !== undefined) validateAccommodations(event.cached);
      progress(response.status === 429 ? "queued" : event?.phase ?? "queued", event?.provider, event?.cached);
      await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, 1500);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
      continue;
    }
    if (!response.ok) throw new Error(result?.error ?? `Accommodation lookup: HTTP ${response.status}`);
    validateAccommodations(result);
    signal.throwIfAborted();
    return result;
  }
}

function validateAccommodations(result) {
  if (!result || !Array.isArray(result.places) || result.places.length > 40 ||
        !Array.isArray(result.warnings) || result.warnings.some(w => typeof w !== "string") ||
        result.places.some(place => !place || typeof place.id !== "string" || typeof place.name !== "string" ||
          !Number.isFinite(place.latitude) || Math.abs(place.latitude) > 90 ||
          !Number.isFinite(place.longitude) || Math.abs(place.longitude) > 180 ||
          !Number.isSafeInteger(place.col) || !Number.isSafeInteger(place.row) ||
          !Number.isFinite(place.distance) || place.distance < 0 || place.distance > 5000 ||
          typeof place.source !== "string" || typeof place.credit !== "string" || typeof place.license !== "string" ||
          !(place.osmId === place.id && /^(node|way|relation)\/[1-9]\d*$/.test(place.id) ||
            place.id.startsWith("https://data.datatourisme.fr/")) ||
          !["hotel", "hostel", "guest_house", "motel", "alpine_hut"].includes(place.tags?.tourism) ||
          ![place.sourceUrl, place.licenseUrl].every(url => {
            try { return typeof url === "string" && new URL(url).protocol === "https:"; }
            catch { return false; }
          }))) {
    throw new Error("Invalid nearby accommodation results.");
  }
}

export function cachedAccommodations(base, chunks, info) {
  const places = new Map();
  for (const map of [base, ...chunks]) {
    for (const [row, cells] of map.rows.entries()) {
      for (const [col, cell] of cells.entries()) {
        for (const poi of cell.pois ?? []) {
          const tags = poi.tags ?? {};
          if (!["hotel", "hostel", "guest_house", "motel", "alpine_hut"].includes(tags.tourism) ||
              ["private", "no"].includes(tags.access) ||
              tags.disused && tags.disused !== "no" || tags.abandoned && tags.abandoned !== "no") continue;
          const distance = distanceMeters(info, poi.latitude, poi.longitude);
          if (distance > 5000) continue;
          places.set(poi.osmId, { ...poi, name: poi.name ?? "", id: poi.osmId, distance,
            col: (map.chunk?.x ?? 0) * 8 + col, row: (map.chunk?.y ?? 0) * 8 + row,
            source: "OpenStreetMap", sourceUrl: `https://www.openstreetmap.org/${poi.osmId}`,
            credit: "OpenStreetMap contributors", license: "ODbL",
            licenseUrl: "https://www.openstreetmap.org/copyright" });
        }
      }
    }
  }
  const result = mergeAccommodations({ places: [...places.values()], warnings: [] });
  validateAccommodations(result);
  return result;
}

export function mergeAccommodations(...results) {
  const places = new Map();
  for (const result of results) for (const place of result.places) places.set(place.id, place);
  return {
    places: [...places.values()].sort((a, b) => a.distance - b.distance ||
      a.id.localeCompare(b.id)).slice(0, 40),
    warnings: [...new Set(results.flatMap(result => result.warnings))], radiusMeters: 5000,
  };
}

export function withDiscoveredAccommodations(cell, places, col, row) {
  const existing = new Set((cell.pois ?? []).map(poi => poi.osmId));
  const extras = places.filter(place => place.col === col && place.row === row &&
    !existing.has(place.osmId ?? place.id));
  return extras.length ? { ...cell, pois: [...(cell.pois ?? []),
    ...extras.map(place => ({ ...place, osmId: place.osmId ?? place.id }))] } : cell;
}
