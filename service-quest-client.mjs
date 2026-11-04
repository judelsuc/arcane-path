import { createCharactersClient } from "./characters-client.mjs";

export function createQuestDestinationClient({ fetcher = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const characters = createCharactersClient({ fetcher });
  return {
    async characterOffer(state, characterId, { signal, retry = false } = {}) {
      if (!state.serverJourney?.id || !state.journalAccess) throw new Error("A server journey is required.");
      let failures = 0;
      for (let attempt = 0; attempt < 120; attempt++) {
        signal?.throwIfAborted();
        const result = await characters.quest(state, characterId, { signal, retry });
        if (result.status === "ready" || result.status === "unavailable") return result;
        if (result.status === "failed") {
          if (!result.retryable || failures++ >= 2) throw new Error(result.error ?? "Character quest preparation failed.");
          retry = true;
          console.warn("Retrying the same character quest after a provider failure:", result.error);
        } else {
          if (!["queued", "running", "busy"].includes(result.status)) throw new Error("Invalid character quest response.");
          retry = false;
        }
        await wait(result.status === "failed" ? 5000 : 2000);
      }
      throw new Error("Character quest preparation is still pending.");
    },
    async prepare(state, request, signal) {
      if (!state.serverJourney?.id || !state.journalAccess) throw new Error("A server journey is required.");
      const body = { journey: state.serverJourney.id,
        ...(state.journalKeeper ? { keeper: state.journalKeeper } : {}),
        origin: { col: state.col, row: state.row }, ...request };
      for (let attempt = 0; attempt < 120; attempt++) {
        signal?.throwIfAborted();
        const response = await fetcher("/api/quest-destinations", {
          method: "POST", headers: { "Content-Type": "application/json",
            "X-Journal-Capability": state.journalAccess },
          body: JSON.stringify(body), signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? `Quest destinations HTTP ${response.status}`);
        if (result.status === "ready") return result;
        if (["unavailable", "failed"].includes(result.status)) throw new Error(result.error ?? "No compatible reachable destinations.");
        if (!["queued", "running"].includes(result.status)) throw new Error("Invalid quest destination response.");
        await wait(2000);
      }
      throw new Error("Quest preparation is still pending. Retry this offer.");
    },
  };
}
