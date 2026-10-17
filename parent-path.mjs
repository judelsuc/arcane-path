export function createParentPathLoader({ fetcher = fetch, onUpdate = () => {},
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let key, controller, timer, generation = 0, status = { status: "legacy" };
  function stop() {
    generation++;
    controller?.abort();
    clearTimer(timer);
    timer = controller = undefined;
  }
  async function poll(journey, stage, retry = false) {
    const current = generation;
    controller = new AbortController();
    try {
      const query = new URLSearchParams({ journey, stage: String(stage) });
      if (retry) query.set("retry", "1");
      const response = await fetcher(`/api/parent-path?${query}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      });
      if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
        throw new Error("The updated game server is required to prepare parent paths.");
      }
      const data = await response.json();
      if (current !== generation) return;
      if (response.status === 429) {
        status = { status: "queued" };
      } else if (response.status === 202) {
        if (data.status !== "loading" || data.stage !== stage ||
            !["expanded", "chunks", "downloads"].every(k => Number.isSafeInteger(data[k]) && data[k] >= 0)) {
          throw new Error("Invalid parent-path progress.");
        }
        status = data;
      } else if (response.status === 200) {
        if (data.status !== "ready" || data.stage !== stage || data.version !== "grid-walk-v1" ||
            !Number.isSafeInteger(data.distanceMeters) || data.distanceMeters < 0 ||
            data.distanceMeters % 250 !== 0 || !Number.isFinite(data.walkingMinutes) || data.walkingMinutes < 0 ||
            typeof data.elevationComplete !== "boolean") throw new Error("Invalid prepared parent path.");
        status = data;
      } else {
        throw new Error(data.error ?? `Parent path: HTTP ${response.status}`);
      }
      onUpdate(status);
      if (status.status !== "ready") timer = setTimer(() => { void poll(journey, stage); }, 3000);
    } catch (error) {
      if (current !== generation) return;
      console.error("Parent path preparation failed:", error);
      status = { status: "error", error: error.message };
      onUpdate(status);
    }
  }
  return {
    update(state) {
      const journey = state?.serverJourney?.id;
      const eligible = journey && !state.ended && state.trail?.version === 2 && !state.trail.completed;
      const next = eligible ? `${journey}:${state.trail.index}` : undefined;
      if (next === key) return;
      stop();
      key = next;
      status = { status: eligible ? "idle" : "legacy" };
      onUpdate(status);
    },
    prepare() {
      if (!key || status.status !== "idle") return;
      const [journey, stage] = key.split(":");
      status = { status: "queued" };
      onUpdate(status);
      void poll(journey, Number(stage));
    },
    retry() {
      if (!key || status.status !== "error") return;
      const [journey, stage] = key.split(":");
      stop();
      status = { status: "queued" };
      onUpdate(status);
      void poll(journey, Number(stage), true);
    },
    stop() {
      stop();
      key = undefined;
      status = { status: "legacy" };
    },
    get status() { return status; },
  };
}
