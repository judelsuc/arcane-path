import { MAIN_ARTIFACT_WORLD } from "./lore-catalogue.mjs";
import { validateLegendSessionView } from "./legend-session.mjs";
import { validateTreasures, treasureItem } from "./legend-rewards.mjs";

export function createArtifactsClient({ storage = localStorage, fetcher = fetch } = {}) {
  const key = state => `arcane-main-artifact-pending-v1:${state.serverJourney.id}`;
  return {
    pending: state => Boolean(state?.serverJourney && storage.getItem(key(state))),
    acknowledge(state) { storage.removeItem(key(state)); },
    async request(state, action = null) {
      if (!state.serverJourney?.id || !state.journalAccess) throw new Error("A private main journey is required.");
      const saved = storage.getItem(key(state));
      if (saved && action !== null) throw new Error("Retry the pending artifact request first.");
      const body = saved ? JSON.parse(saved) : {
        journey: state.serverJourney.id, requestId: crypto.randomUUID(), state: structuredClone(state), action,
      };
      if (!saved) storage.setItem(key(state), JSON.stringify(body));
      const response = await fetcher("/api/artifacts", {
        method: "POST", headers: { "Content-Type": "application/json",
          "X-Journal-Capability": state.journalAccess },
        body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
      });
      if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
        throw new Error("The updated artifact server is required.");
      }
      const result = await response.json();
      if (!response.ok) {
        if ([400, 403, 409].includes(response.status)) storage.removeItem(key(state));
        throw new Error(result.error ?? `Artifacts HTTP ${response.status}`);
      }
      if (result?.world !== MAIN_ARTIFACT_WORLD || !Number.isSafeInteger(result.revision) ||
          result.revision < 1 || result.state?.serverJourney?.id !== state.serverJourney.id ||
          result.state?.artifactRevision !== result.revision ||
          !Array.isArray(result.owned) || !Array.isArray(result.offers)) {
        throw new Error("Invalid main artifact response; retry the pending request.");
      }
      // A successful network response is not acknowledged until its state is saved.
      validateLegendSessionView(result.adventure, result.state);
      validateTreasures(result.state);
      if (result.treasures !== undefined) {
        const rewards = result.treasures;
        if (!rewards || !Array.isArray(rewards.offers) || rewards.offers.some(offer =>
          !offer || typeof offer.place !== "string" || !treasureItem(offer.id, offer.reward)) ||
            rewards.result !== null && (!rewards.result ||
              !["collected", "left", "taken"].includes(rewards.result.outcome) || !treasureItem(rewards.result.id))) {
          throw new Error("Invalid treasure response; retry the pending request.");
        }
        if (result.caches !== undefined && (!result.caches || !Array.isArray(result.caches.offers) ||
            result.caches.offers.length > 20 || result.caches.offers.some(cache =>
              !cache || !/^(?:de|pl|uk):[A-Z]{2}[A-Z0-9]{1,14}$/.test(cache.id) ||
              typeof cache.name !== "string" || cache.name.length > 200 ||
              typeof cache.code !== "string" || typeof cache.attribution !== "string" ||
              typeof cache.annotation !== "string" || typeof cache.url !== "string" ||
              !/^https:\/\/(?:www\.opencaching\.de|opencaching\.de|opencaching\.pl|opencache\.uk)\//.test(cache.url)) ||
            result.caches.opened !== null && (!result.caches.opened ||
              !/^(?:de|pl|uk):[A-Z]{2}[A-Z0-9]{1,14}$/.test(result.caches.opened.id) ||
              !Number.isSafeInteger(result.caches.opened.cents) ||
              result.caches.opened.cents < 200 || result.caches.opened.cents > 600))) {
          throw new Error("Invalid OpenCaching response; retry the pending request.");
        }
      }
      return result;
    },
  };
}
