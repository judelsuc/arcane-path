import assert from "node:assert/strict";
import test from "node:test";
import { createChunkStream, createChunkPrefetcher, neighborDownloads, visibleDownloads } from "../travel-stream.mjs";

test("neighbor downloads favor heading, then nearby boundaries, including negative chunks", () => {
  assert.deepEqual(neighborDownloads(6, 1, 1, 0), [
    { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 },
  ]);
  assert.deepEqual(neighborDownloads(6, 1, -1, 0), [
    { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: 1, y: 0 },
  ]);
  assert.deepEqual(neighborDownloads(-1, -1, 0, -1), [
    { x: -1, y: -2 }, { x: 0, y: -1 }, { x: -2, y: -1 }, { x: -1, y: 0 },
  ]);
  assert.deepEqual(neighborDownloads(6, 1)[0], { x: 0, y: -1 });
});

test("stationary camera requests all eight visible neighbors, including the four corners", () => {
  for (const [col, row] of [[6, 1], [-1, -1], [16, 16]]) {
    const neighbors = visibleDownloads(col, row, 1, 0);
    assert.equal(neighbors.length, 8);
    assert.equal(new Set(neighbors.map(({ x, y }) => `${x},${y}`)).size, 8);
    assert.deepEqual(neighbors.slice(0, 4), neighborDownloads(col, row, 1, 0));
    const x = Math.floor(col / 8), y = Math.floor(row / 8);
    assert.ok(neighbors.every(p => Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1 &&
      (p.x !== x || p.y !== y)));
  }
});

const flush = () => new Promise(resolve => setImmediate(resolve));
function backgroundHarness(fetcher) {
  let clock = 0, id = 0;
  const timers = new Map(), errors = [], loaded = [];
  const stream = createChunkStream("firmi", { fetcher });
  const background = createChunkPrefetcher(stream, {
    now: () => clock, onError: error => errors.push(error), onLoad: data => loaded.push(data),
    setTimer(fn, delay) { timers.set(++id, { fn, at: clock + delay }); return id; },
    clearTimer(timer) { timers.delete(timer); },
  });
  return { stream, background, timers, errors, loaded,
    async advance(ms) {
      const end = clock + ms;
      while ([...timers.values()].some(t => t.at <= end)) {
        const [timerId, timer] = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        timers.delete(timerId);
        clock = timer.at;
        timer.fn();
        await flush();
      }
      clock = end;
    },
    stop() { background.stop(); stream.stop(); },
  };
}

test("idle background completes all eight chunks without movement and reuses cached results", async () => {
  const started = [];
  const h = backgroundHarness(async url => {
    const params = new URL(url, "http://localhost").searchParams;
    const x = Number(params.get("x")), y = Number(params.get("y"));
    started.push(`${x},${y}`);
    return new Response(JSON.stringify(chunk(x, y)));
  });
  try {
    h.background.update(visibleDownloads(4, 4));
    await flush();
    assert.equal(started.length, 8);
    assert.equal(h.loaded.length, 8);
    h.background.update(visibleDownloads(4, 4));
    await h.advance(60_000);
    assert.equal(started.length, 8);
    assert.equal(h.timers.size, 0);
  } finally { h.stop(); }
});

test("idle provider failures retry after cooldown, without blocking other chunks or game time", async () => {
  const attempts = new Map();
  const h = backgroundHarness(async url => {
    const params = new URL(url, "http://localhost").searchParams;
    const x = Number(params.get("x")), y = Number(params.get("y")), key = `${x},${y}`;
    const count = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, count);
    if (x === 1 && y === 1 && count < 3) return new Response("Unavailable", { status: 503 });
    return new Response(JSON.stringify(chunk(x, y)));
  });
  try {
    const state = { elapsedMinutes: 0, col: 4, row: 4 };
    h.background.update(visibleDownloads(state.col, state.row));
    await flush();
    assert.equal(h.stream.chunks.size, 7);
    assert.equal(h.errors.length, 1);
    await h.advance(29_999);
    assert.equal(attempts.get("1,1"), 1);
    await h.advance(1);
    assert.equal(attempts.get("1,1"), 2);
    await h.advance(59_999);
    assert.equal(attempts.get("1,1"), 2);
    await h.advance(1);
    assert.equal(attempts.get("1,1"), 3);
    assert.equal(h.stream.chunks.size, 8);
    assert.deepEqual(state, { elapsedMinutes: 0, col: 4, row: 4 });
  } finally { h.stop(); }
});

test("permanent failures wait for manual retry and stopping cancels future background retries", async () => {
  let attempts = 0;
  const h = backgroundHarness(async () => {
    attempts++;
    return new Response(JSON.stringify({ error: "Invalid map" }), { status: 400 });
  });
  try {
    h.background.update([{ x: 0, y: 0 }]);
    await flush();
    await h.advance(300_000);
    assert.equal(attempts, 1);
    assert.equal(h.errors.length, 1);
    h.background.retry();
    await flush();
    assert.equal(attempts, 2);
    h.stop();
    assert.equal(h.timers.size, 0);
    await h.advance(300_000);
    assert.equal(attempts, 2);
  } finally { h.stop(); }
});

test("turning reorders queued downloads without displacing foreground or restarting active work", async () => {
  const started = [], release = [];
  const stream = createChunkStream("firmi", { fetcher: async url => {
    const x = Number(new URL(url, "http://localhost").searchParams.get("x"));
    started.push(x);
    await new Promise(resolve => release.push(resolve));
    return new Response(JSON.stringify(chunk(x, 0)));
  } });
  const work = [0, 1, 2, 3, 4].map(x => stream.load(x, 0));
  work.push(stream.load(5, 0, true));
  stream.prioritize([{ x: 4, y: 0 }, { x: 3, y: 0 }, { x: 2, y: 0 }]);
  assert.deepEqual(started, [0, 1]);
  for (let i = 0; i < work.length; i++) {
    release.shift()();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  await Promise.all(work);
  assert.deepEqual(started, [0, 1, 5, 4, 3, 2]);
  stream.stop();
});

function chunk(x, y) {
  return { chunk: { region: "firmi", x, y }, width: 8, height: 8,
    rows: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ terrain: "grass" }))) };
}

test("cached neighbors render before and during two stalled downloads without using download slots", async () => {
  const started = [], release = [], loaded = [], errors = [];
  let lookups = 0, updates = 0;
  const stream = createChunkStream("firmi", {
    onUpdate: () => updates++,
    fetcher: async url => {
      const parsed = new URL(url, "http://localhost");
      if (parsed.pathname === "/api/chunks-cached") {
        lookups++;
        assert.equal(parsed.searchParams.get("region"), "firmi");
        const positions = JSON.parse(parsed.searchParams.get("positions"));
        return new Response(JSON.stringify({ chunks: positions.filter(([x]) => x >= 2)
          .map(([x, y]) => chunk(x, y)) }));
      }
      const x = Number(parsed.searchParams.get("x"));
      started.push(x);
      await new Promise(resolve => release.push(resolve));
      return new Response(JSON.stringify(chunk(x, 0)));
    },
  });
  const background = createChunkPrefetcher(stream, {
    cached: targets => stream.restoreCached(targets),
    onLoad: data => loaded.push(data.chunk.x), onError: error => errors.push(error),
  });
  try {
    background.update([0, 1, 2, 3].map(x => ({ x, y: 0 })));
    await flush();
    assert.deepEqual(started, [0, 1]);
    assert.deepEqual(loaded, [2, 3]);
    assert.ok(stream.get(2, 0));
    assert.ok(stream.get(3, 0));
    background.update([0, 1, 2, 3, 4].map(x => ({ x, y: 0 })));
    await flush();
    assert.ok(stream.get(4, 0));
    assert.deepEqual(started, [0, 1]);
    assert.equal(lookups, 2);
    assert.ok(updates >= 2);
    assert.deepEqual(errors, []);
  } finally {
    background.stop();
    stream.stop();
    for (const resolve of release) resolve();
    await flush();
  }
});

test("cache lookup rejects malformed, duplicate and unsolicited chunks without partial restoration", async () => {
  for (const body of [
    {}, { chunks: [chunk(2, 0)] }, { chunks: [chunk(0, 0), chunk(0, 0)] },
    { chunks: [chunk(0, 0), { ...chunk(1, 0), rows: [] }] },
  ]) {
    const stream = createChunkStream("firmi", {
      fetcher: async () => new Response(JSON.stringify(body)),
    });
    try {
      await assert.rejects(stream.restoreCached([{ x: 0, y: 0 }, { x: 1, y: 0 }]));
      assert.equal(stream.chunks.size, 0);
    } finally { stream.stop(); }
  }
});

test("failed cache lookup is reported and does not prevent ordinary chunk loading", async () => {
  const errors = [], loaded = [];
  const stream = createChunkStream("firmi", {
    fetcher: async url => url.startsWith("/api/chunks-cached?")
      ? new Response(JSON.stringify({ error: "Cache lookup failed" }), { status: 500 })
      : new Response(JSON.stringify(chunk(0, 0))),
  });
  const background = createChunkPrefetcher(stream, {
    cached: targets => stream.restoreCached(targets),
    onError: error => errors.push(error), onLoad: data => loaded.push(data),
  });
  try {
    background.update([{ x: 0, y: 0 }]);
    await flush();
    assert.equal(errors[0].message, "Cache lookup failed");
    assert.equal(loaded.length, 1);
  } finally { background.stop(); stream.stop(); }
});

test("stream deduplicates requests, bounds concurrency at two and prioritizes foreground work", async () => {
  let running = 0, peak = 0;
  const started = [], release = [];
  const stream = createChunkStream("firmi", { fetcher: async url => {
    const parsed = new URL(url, "http://localhost"), x = Number(parsed.searchParams.get("x"));
    started.push(x);
    running++;
    peak = Math.max(peak, running);
    await new Promise(resolve => release.push(resolve));
    running--;
    return new Response(JSON.stringify(chunk(x, 0)));
  } });
  const a = stream.load(0, 0), b = stream.load(1, 0), c = stream.load(2, 0);
  const d = stream.load(3, 0, true);
  assert.equal(a, stream.load(0, 0));
  assert.deepEqual(started, [0, 1]);
  release.shift()();
  await a;
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(started, [0, 1, 3]);
  release.shift()();
  await b;
  await new Promise(resolve => setTimeout(resolve, 0));
  release.shift()();
  await d;
  release.shift()();
  await c;
  assert.equal(peak, 2);
  assert.equal((await stream.load(0, 0)).chunk.x, 0);
  assert.equal(started.length, 4);
  stream.stop();
});

test("stream fails visibly on provider failure or malformed chunks", async () => {
  for (const response of [
    () => new Response(JSON.stringify({ error: "OSM unavailable" }), { status: 502 }),
    () => new Response(JSON.stringify(chunk(99, 0))),
  ]) {
    const stream = createChunkStream("firmi", { fetcher: async () => response() });
    await assert.rejects(stream.load(0, 0));
    stream.stop();
  }
});

test("stream cancellation rejects queued work and prevents new work", async () => {
  const stream = createChunkStream("firmi", { fetcher: async (_, options) =>
    new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason))) });
  const work = [stream.load(0, 0), stream.load(1, 0), stream.load(2, 0)];
  const rejected = Promise.all(work.map(p => assert.rejects(p)));
  stream.stop();
  await rejected;
  await assert.rejects(stream.load(3, 0));
});

test("stream caps in-memory chunks at 25 while allowing durable-cache reloads", async () => {
  const stream = createChunkStream("firmi", { fetcher: async url => {
    const parsed = new URL(url, "http://localhost");
    return new Response(JSON.stringify(chunk(Number(parsed.searchParams.get("x")), 0)));
  } });
  for (let x = 0; x < 30; x++) await stream.load(x, 0);
  assert.equal(stream.chunks.size, 25);
  assert.equal(stream.get(0, 0), undefined);
  assert.equal((await stream.load(0, 0)).chunk.x, 0);
  stream.stop();
});

test("pending map markers update when work starts, succeeds, fails or is cancelled", async () => {
  let release;
  let updates = 0;
  const stream = createChunkStream("firmi", { onUpdate: () => updates++,
    fetcher: async () => {
      await new Promise(resolve => { release = resolve; });
      return new Response(JSON.stringify(chunk(0, 0)));
    } });
  assert.equal(stream.isPending(0, 0), false);
  const loading = stream.load(0, 0);
  assert.equal(stream.isPending(0, 0), true);
  assert.equal(updates, 1);
  release();
  await loading;
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(stream.isPending(0, 0), false);
  assert.ok(updates >= 2);
  stream.stop();
  const failed = createChunkStream("firmi", { fetcher: async () =>
    new Response(JSON.stringify({ error: "Offline" }), { status: 502 }) });
  await assert.rejects(failed.load(0, 0), /Offline/);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(failed.isPending(0, 0), false);
  failed.stop();
});
