import assert from "node:assert/strict";
import test from "node:test";
import { createChunkStream, neighborDownloads } from "../travel-stream.mjs";

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
