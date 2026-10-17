import { chunkPosition } from "./travel.mjs";

export function neighborDownloads(col, row, dc = 0, dr = 0) {
  const p = chunkPosition(col, row);
  const neighbors = [
    { x: p.x, y: p.y - 1, distance: p.row + 1, heading: -dr },
    { x: p.x + 1, y: p.y, distance: 8 - p.col, heading: dc },
    { x: p.x, y: p.y + 1, distance: 8 - p.row, heading: dr },
    { x: p.x - 1, y: p.y, distance: p.col + 1, heading: -dc },
  ];
  return neighbors.sort((a, b) => b.heading - a.heading || a.distance - b.distance)
    .map(({ x, y }) => ({ x, y }));
}

export function visibleDownloads(col, row, dc = 0, dr = 0) {
  const p = chunkPosition(col, row);
  const corners = [-1, 1].flatMap(dx => [-1, 1].map(dy => ({
    x: p.x + dx, y: p.y + dy, heading: dx * dc + dy * dr,
  }))).sort((a, b) => b.heading - a.heading);
  return [...neighborDownloads(col, row, dc, dr), ...corners.map(({ x, y }) => ({ x, y }))];
}

class ChunkRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.retryable = status === 408 || status >= 500;
  }
}

export function createChunkPrefetcher(stream, {
  onError = console.error, onLoad = () => {}, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  cached,
} = {}) {
  let targets = [], timer, stopped = false, generation = 0;
  const failures = new Map();
  function tick() {
    if (stopped) return;
    clearTimer(timer);
    timer = undefined;
    let waiting = false;
    for (const { x, y } of targets) {
      const key = `${x},${y}`, failure = failures.get(key);
      if (stream.get(x, y) || failure?.permanent) continue;
      waiting = true;
      if (stream.isPending(x, y) || failure && failure.nextAt > now()) continue;
      stream.load(x, y).then(data => {
        failures.delete(key);
        if (!stopped && targets.some(p => p.x === x && p.y === y)) onLoad(data, x, y);
      }).catch(error => {
        if (stopped || !targets.some(p => p.x === x && p.y === y)) return;
        const attempts = (failures.get(key)?.attempts ?? 0) + 1;
        const retryable = error.retryable === true || error instanceof TypeError ||
          error.name === "TimeoutError";
        failures.set(key, { attempts, permanent: !retryable,
          nextAt: now() + Math.min(300_000, 30_000 * 2 ** Math.min(4, attempts - 1)) });
        onError(error);
      });
    }
    if (waiting) timer = setTimer(tick, 30_000);
  }
  return {
    update(next) {
      if (stopped) return;
      targets = next;
      const keys = new Set(targets.map(({ x, y }) => `${x},${y}`));
      for (const key of failures.keys()) if (!keys.has(key)) failures.delete(key);
      stream.prioritize(targets);
      const current = ++generation;
      if (cached) {
        clearTimer(timer);
        Promise.resolve().then(() => cached(next)).then(restored => {
          if (!stopped && current === generation) {
            for (const data of restored) onLoad(data, data.chunk.x, data.chunk.y);
          }
        }).catch(error => {
          if (!stopped && current === generation) onError(error);
        }).finally(() => {
          if (!stopped && current === generation) tick();
        });
      } else tick();
    },
    retry() { failures.clear(); tick(); },
    stop() { stopped = true; clearTimer(timer); failures.clear(); targets = []; },
  };
}

export function createChunkStream(region, { fetcher = fetch, onUpdate = () => {} } = {}) {
  const chunks = new Map(), requests = new Map(), queue = [];
  const controller = new AbortController();
  let running = 0;

  const key = (x, y) => `${x},${y}`;
  function validate(data, x, y) {
    if (!data || data.chunk?.x !== x || data.chunk?.y !== y || data.chunk?.region !== region ||
        data.width !== 8 || data.height !== 8 ||
        !Array.isArray(data.rows) || data.rows.length !== 8 ||
        data.rows.some(row => !Array.isArray(row) || row.length !== 8)) {
      throw new Error("Invalid streamed chunk.");
    }
    return data;
  }
  function remember(data) {
    chunks.set(key(data.chunk.x, data.chunk.y), data);
    if (chunks.size > 25) chunks.delete(chunks.keys().next().value);
  }
  async function retrieve(x, y) {
    const deadline = Date.now() + 180_000;
    while (!controller.signal.aborted) {
      const response = await fetcher(`/api/chunk?${new URLSearchParams({ region, x, y })}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      let data;
      try {
        data = await response.json();
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        if (!response.ok) throw new ChunkRequestError(`HTTP ${response.status}: invalid map response`, response.status);
        throw error;
      }
      if (response.status !== 202 && response.status !== 429) {
        if (!response.ok) throw new ChunkRequestError(data.error ?? `HTTP ${response.status}`, response.status);
        return validate(data, x, y);
      }
      if (Date.now() >= deadline) throw new ChunkRequestError(
        "Chunk download timed out. Retry to resume cached preparation.", 408);
      await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(controller.signal.reason); };
        const timer = setTimeout(() => {
          controller.signal.removeEventListener("abort", abort);
          resolve();
        }, 1000);
        controller.signal.addEventListener("abort", abort, { once: true });
      });
    }
    throw controller.signal.reason;
  }

  function pump() {
    while (running < 2 && queue.length && !controller.signal.aborted) {
      const job = queue.shift();
      running++;
      retrieve(job.x, job.y).then(data => {
        remember(data);
        job.resolve(data);
        onUpdate();
      }, job.reject).finally(() => {
        running--;
        requests.delete(job.key);
        pump();
        onUpdate();
      });
    }
  }

  function load(x, y, priority = false) {
    if (controller.signal.aborted) return Promise.reject(controller.signal.reason);
    const id = key(x, y);
    if (chunks.has(id)) return Promise.resolve(chunks.get(id));
    if (requests.has(id)) {
      if (priority) {
        const index = queue.findIndex(job => job.key === id);
        if (index >= 0) {
          const [job] = queue.splice(index, 1);
          job.priority = true;
          queue.unshift(job);
        }
      }
      return requests.get(id);
    }
    const promise = new Promise((resolve, reject) => {
      const job = { key: id, x, y, resolve, reject, priority };
      if (priority) queue.unshift(job);
      else queue.push(job);
    });
    requests.set(id, promise);
    pump();
    onUpdate();
    return promise;
  }

  return {
    chunks, load,
    async restoreCached(targets) {
      const missing = targets.filter(({ x, y }) => !chunks.has(key(x, y)));
      if (!missing.length) return [];
      const response = await fetcher(`/api/chunks-cached?${new URLSearchParams({
        region, positions: JSON.stringify(missing.map(({ x, y }) => [x, y])),
      })}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
      const data = await response.json();
      if (!response.ok) throw new ChunkRequestError(data.error ?? `HTTP ${response.status}`, response.status);
      if (!Array.isArray(data.chunks) || data.chunks.length > missing.length) {
        throw new Error("Invalid cached chunk response.");
      }
      const allowed = new Set(missing.map(({ x, y }) => key(x, y))), seen = new Set();
      for (const chunk of data.chunks) {
        const x = chunk?.chunk?.x, y = chunk?.chunk?.y, id = key(x, y);
        if (!allowed.has(id) || seen.has(id)) throw new Error("Unexpected cached chunk.");
        validate(chunk, x, y);
        seen.add(id);
      }
      controller.signal.throwIfAborted();
      for (const chunk of data.chunks) remember(chunk);
      onUpdate();
      return data.chunks;
    },
    prioritize(neighbors) {
      const ranks = new Map(neighbors.map(({ x, y }, index) => [key(x, y), index]));
      queue.sort((a, b) => Number(b.priority) - Number(a.priority) ||
        (ranks.get(a.key) ?? Infinity) - (ranks.get(b.key) ?? Infinity));
    },
    drop: (x, y) => chunks.delete(key(x, y)),
    get: (x, y) => chunks.get(key(x, y)),
    isPending: (x, y) => !controller.signal.aborted && requests.has(key(x, y)),
    stop() {
      controller.abort();
      for (const job of queue.splice(0)) job.reject(controller.signal.reason);
    },
  };
}
