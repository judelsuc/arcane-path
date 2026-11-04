const PENDING = "arcane-lore-pending-v1:";

export function createLoreClient(source, storage, fetcher = fetch) {
  if (!/^[a-f0-9]{32}$/.test(source?.id) || !/^[a-f0-9]{64}$/.test(source?.capability)) {
    throw new Error("A private source-journey capability is required.");
  }
  const key = PENDING + source.id;
  async function request(body) {
    const response = await fetcher("/api/lore-playtest", {
      method: "POST", headers: { "Content-Type": "application/json",
        "X-Journal-Capability": source.capability },
      body: JSON.stringify({ ...body, journey: source.id }),
      signal: AbortSignal.timeout(20000),
    });
    if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
      throw new Error("The updated server is required for artifact playtesting.");
    }
    const result = await response.json();
    if (!response.ok) {
      if ([400, 403, 409].includes(response.status) && body.operation === "action") storage.removeItem(key);
      throw new Error(result.error ?? `Lore playtest: HTTP ${response.status}`);
    }
    if (body.operation === "map" ? !Array.isArray(result?.map?.rows) :
      result?.version !== 1 || result.world !== LORE_WORLD ||
      !Number.isSafeInteger(result.revision) || result.revision < 1 ||
      !result.state || typeof result.state !== "object" || Array.isArray(result.state)) {
      throw new Error("Invalid lore server response; retry the pending command.");
    }
    return result;
  }
  let working = false;
  async function replay(body) {
    const result = await request(body);
    storage.removeItem(key);
    return result;
  }
  return {
    pending: () => storage.getItem(key) !== null,
    async sync() {
      if (working) throw new Error("A lore command is already in flight.");
      working = true;
      try {
        const pending = storage.getItem(key);
        if (pending !== null) await replay(JSON.parse(pending));
        return await request({ operation: "start" });
      } finally { working = false; }
    },
    map: () => request({ operation: "map" }),
    route: (retry = false) => request({ operation: "route", retry }),
    terrain: () => request({ operation: "terrain" }),
    async act(expectedRevision, action) {
      if (working || storage.getItem(key) !== null) throw new Error("Refresh/retry the pending command first.");
      working = true;
      try {
        const body = { operation: "action", requestId: crypto.randomUUID(), expectedRevision, action };
        storage.setItem(key, JSON.stringify(body));
        return await replay(body);
      } finally { working = false; }
    },
  };
}
import { LORE_WORLD } from "./lore-catalogue.mjs";
