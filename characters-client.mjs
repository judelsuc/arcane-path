const TOPICS = new Set(["parent", "clues", "notebooks", "artifacts", "services",
  "shelter", "food", "work", "transport", "town"]);

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (!bytes.some(Boolean)) {
    for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createCharactersClient({ fetcher = fetch, newRequestId = requestId } = {}) {
  async function send(state, action, details = {}) {
    if (!state?.serverJourney?.id || !state.journalAccess) {
      throw new Error("A server journey and private capability are required.");
    }
    const response = await fetcher("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Journal-Capability": state.journalAccess },
      body: JSON.stringify({ action, journey: state.serverJourney.id,
        location: { col: state.col, row: state.row }, ...details }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = action === "portrait" && response.ok
      ? await response.blob() : await response.json();
    if (!response.ok) throw new Error(result.error ?? `Character registry HTTP ${response.status}`);
    return result;
  }
  return {
    newRequestId,
    list: state => send(state, "list"),
    create: (state, request = newRequestId()) => send(state, "create", { requestId: request }),
    meet: (state, characterId, request = newRequestId()) =>
      send(state, "meet", { characterId, requestId: request }),
    exchange: (state, characterId, topic, request = newRequestId()) => {
      if (!TOPICS.has(topic)) throw new Error("Unknown character conversation topic.");
      return send(state, "exchange", { characterId, topic, requestId: request });
    },
    contract: (state, characterId, contract, options = {}) =>
      send(state, "contract", { characterId, contract,
        requestId: options.requestId ?? newRequestId(),
        ...(options.location ? { location: options.location } : {}) }),
    portrait: (state, characterId) => send(state, "portrait", { characterId }),
    visitors: (state, characterId, { cursor = null, limit = 20 } = {}) =>
      send(state, "visitors", { characterId, cursor, limit }),
  };
}
