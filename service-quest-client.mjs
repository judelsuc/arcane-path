export function createQuestDestinationClient({ fetcher = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  return {
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
