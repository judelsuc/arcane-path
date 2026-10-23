import { MAIN_ARTIFACT_WORLD } from "./lore-catalogue.mjs";

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
      return result;
    },
  };
}
