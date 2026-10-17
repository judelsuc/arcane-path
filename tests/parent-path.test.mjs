import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createParentPathLoader } from "../parent-path.mjs";
import { travelCost } from "../travel.mjs";

const root = new URL("../", import.meta.url);
const python = existsSync(new URL(".venv/bin/python", root)) ? ".venv/bin/python" : "python3";
const state = index => ({ serverJourney: { id: "a".repeat(32) },
  trail: { version: 2, index, completed: false }, ended: null });
const ready = stage => ({ status: "ready", version: "grid-walk-v1", stage,
  distanceMeters: 3500, walkingMinutes: 52, elevationComplete: true });
const loading = stage => ({ status: "loading", stage, chunks: 2, downloads: 1, expanded: 10 });
const response = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
const settle = () => new Promise(resolve => setImmediate(resolve));

test("Python routing cost matches actual JS movement for every terrain and extreme/missing slope", () => {
  const results = JSON.parse(execFileSync(python, ["-c", `
import json,sys
sys.path.insert(0,"scripts")
from parent_paths import GROUND_COST,walk_minutes
cases=[]
for a in GROUND_COST:
    for b in GROUND_COST:
        for h in [None,-200,-20,0,20,200]:
            source={"terrain":a,"elevationMeters":100}
            target={"terrain":b,"elevationMeters":None if h is None else 100+h}
            cases.append([source,target,walk_minutes(source,target)])
print(json.dumps(cases))
`], { cwd: root, encoding: "utf8", maxBuffer: 2_000_000 }));
  assert.equal(results.length, 18 * 18 * 6);
  for (const [from, to, minutes] of results) {
    assert.ok(Math.abs(travelCost(from, to, 250, 0).minutes - minutes) < 1e-10);
  }
});

test("polls bounded progress without blocking play, reuses the current request, stops on ready", async () => {
  const timers = [], urls = [], updates = [];
  const loader = createParentPathLoader({
    setTimer: (callback, delay) => { timers.push(callback); assert.equal(delay, 3000); },
    clearTimer: () => {},
    onUpdate: status => updates.push(status.status),
    fetcher: async url => { urls.push(url); return urls.length === 1
      ? response(loading(0), 202) : response(ready(0)); },
  });
  loader.update(state(0));
  loader.update(state(0));
  assert.equal(urls.length, 0);
  loader.prepare();
  await settle();
  assert.equal(urls.length, 1);
  assert.equal(loader.status.status, "loading");
  assert.match(urls[0], /journey=a{32}&stage=0/);
  timers.shift()();
  await settle();
  assert.equal(loader.status.status, "ready");
  assert.equal(timers.length, 0);
  assert.deepEqual(updates, ["idle", "queued", "loading", "ready"]);
  loader.stop();
});

test("stage changes and stop cancel stale responses; legacy or ended games never start downloads", async () => {
  const requests = [];
  const loader = createParentPathLoader({ fetcher: (url, options) => new Promise(resolve => {
    requests.push({ url, signal: options.signal, resolve });
  }) });
  loader.update({ trail: { version: 2 }, ended: null });
  loader.update({ ...state(0), ended: "hunger" });
  assert.equal(requests.length, 0);
  loader.update(state(0));
  loader.prepare();
  loader.update(state(1));
  loader.prepare();
  assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve(response(ready(0)));
  await settle();
  assert.equal(loader.status.status, "queued");
  loader.stop();
  assert.equal(requests[1].signal.aborted, true);
  requests[1].resolve(response(ready(1)));
  await settle();
  assert.equal(loader.status.status, "legacy");
});

test("queue saturation retries later; explicit failures require manual retry with no straight-line fallback", async () => {
  const timers = [], urls = [];
  const loader = createParentPathLoader({ setTimer: callback => { timers.push(callback); },
    clearTimer: () => {}, fetcher: async url => {
      urls.push(url);
      if (urls.length === 1) return response({ error: "Busy" }, 429);
      if (urls.length === 2) return response({ error: "Work limit reached" }, 422);
      return response(ready(0));
    } });
  loader.update(state(0));
  loader.prepare();
  await settle();
  assert.equal(loader.status.status, "queued");
  timers.shift()();
  await settle();
  assert.equal(loader.status.status, "error");
  assert.equal(loader.status.error, "Work limit reached");
  assert.equal(timers.length, 0);
  loader.retry();
  await settle();
  assert.match(urls[2], /retry=1/);
  assert.equal(loader.status.status, "ready");
  loader.stop();
});

test("malformed routes, progress, HTML and network errors are surfaced, never accepted as validated", async () => {
  for (const result of [
    () => response({ ...ready(0), walkingMinutes: -1 }),
    () => response({ ...ready(0), distanceMeters: 123 }),
    () => response({ ...ready(0), stage: 1 }),
    () => response({ ...loading(0), chunks: -1 }, 202),
    () => new Response("<html>Old server</html>"),
    () => { throw new Error("Network unavailable"); },
  ]) {
    const loader = createParentPathLoader({ fetcher: async () => result() });
    loader.update(state(0));
    loader.prepare();
    await settle();
    assert.equal(loader.status.status, "error");
    loader.stop();
  }
});
