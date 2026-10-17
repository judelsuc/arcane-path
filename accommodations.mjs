export async function loadAccommodations(region, info, signal, fetcher = fetch) {
  signal = AbortSignal.any([signal, AbortSignal.timeout(240000)]);
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

    signal.throwIfAborted();
    return result;
  }
}

export function withDiscoveredAccommodations(cell, places, col, row) {
  const existing = new Set((cell.pois ?? []).map(poi => poi.osmId));
  const extras = places.filter(place => place.col === col && place.row === row &&
    !existing.has(place.osmId ?? place.id));
  return extras.length ? { ...cell, pois: [...(cell.pois ?? []),
    ...extras.map(place => ({ ...place, osmId: place.osmId ?? place.id }))] } : cell;
}
