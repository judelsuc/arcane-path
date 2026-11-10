import { mergeDiscoveredMeals } from "./economy.mjs";

function pause(signal) {
  return new Promise((resolve, reject) => {
    function done() { signal.removeEventListener("abort", aborted); resolve(); }
    function aborted() { clearTimeout(timer); reject(signal.reason); }
    const timer = setTimeout(done, 1000);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

export async function discoverTownMeals(state, town, economy, signal, {
  fetcher = fetch, wait = pause,
} = {}) {
  if (!state?.serverJourney?.id || !state.journalAccess) {
    throw new Error("A server journey and private capability are required for culinary discovery.");
  }
  async function send(details = {}) {
    signal.throwIfAborted();
    const response = await fetcher("/api/town-content", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Journal-Capability": state.journalAccess },
      body: JSON.stringify({ journey: state.serverJourney.id, location: { col: state.col, row: state.row },
        town, kind: "meals", ...details }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error ?? `Culinary discovery HTTP ${response.status}`);
    }
    return details.image ? response.blob() : response.json();
  }
  for (let poll = 0; poll < 360; poll++) {
    const result = await send();
    if (result.identity !== town || typeof result.loading !== "boolean" ||
        typeof result.error !== "string" || !Array.isArray(result.meals) ||
        result.meals.length > 6 || result.warnings !== undefined && (
          !Array.isArray(result.warnings) || result.warnings.some(w => typeof w !== "string"))) {
      throw new Error("Invalid culinary discovery response.");
    }
    if (result.error) throw new Error(result.error);
    if (result.loading) { await wait(signal); continue; }
    mergeDiscoveredMeals(economy, result.meals, town);
    const warnings = [...(result.warnings ?? [])];
    const photos = await Promise.all(result.meals.filter(meal => meal.photo).map(async meal => {
      const photo = meal.photo;
      if (!/^[a-f0-9]{64}$/.test(photo.imageId) ||
          !/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(photo.sourceUrl) ||
          !/^https?:\/\//.test(photo.licenseUrl) || !photo.attribution || !photo.license) {
        throw new Error("Invalid dish photograph provenance.");
      }
      try {
        const blob = await send({ image: photo.imageId });
        if (!blob.size || blob.size > 12_000_000 ||
            !["image/jpeg", "image/png", "image/webp"].includes(blob.type)) {
          throw new Error("Invalid documentary dish photograph.");
        }
        return { id: meal.id, blob };
      } catch (error) {
        if (signal.aborted) throw error;
        console.error("Dish photograph unavailable:", error);
        warnings.push(error.message);
        return null;
      }
    }));
    return { meals: result.meals, warnings, photos: photos.filter(Boolean) };
  }
  throw new Error("Culinary discovery is still pending. Please try again later.");
}
