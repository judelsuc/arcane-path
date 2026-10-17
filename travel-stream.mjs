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

export function createChunkStream(region, { fetcher = fetch, onUpdate = () => {} } = {}) {
  const chunks = new Map(), requests = new Map(), queue = [];
  const controller = new AbortController();
  let running = 0;

  const key = (x, y) => `${x},${y}`;
  async function retrieve(x, y) {
    const deadline = Date.now() + 180_000;
    while (!controller.signal.aborted) {
      const response = await fetcher(`/api/chunk?${new URLSearchParams({ region, x, y })}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      const data = await response.json();
      if (response.status !== 202 && response.status !== 429) {
        if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
        if (data.chunk?.x !== x || data.chunk?.y !== y || data.chunk?.region !== region ||
            data.width !== 8 || data.height !== 8 ||
            data.rows?.length !== 8 || data.rows.some(row => row.length !== 8)) {
          throw new Error("Invalid streamed chunk.");
        }
        return data;
      }
      if (Date.now() >= deadline) throw new Error("Chunk download timed out. Retry to resume cached preparation.");
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
        chunks.set(job.key, data);
        // Keep a small working set; durable copies remain in the server cache.
        if (chunks.size > 25) chunks.delete(chunks.keys().next().value);
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
