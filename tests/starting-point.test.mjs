import test from "node:test";
import assert from "node:assert/strict";
import { placeRequest, validateStartingMap, locatePosition } from "../starting-point-ui.mjs";
import { readFileSync } from "node:fs";

test("starting maps validate geometry without requiring ten nearby landmarks", () => {
  const map = JSON.parse(readFileSync(new URL("../public/map.json", import.meta.url)));
  assert.doesNotThrow(() => validateStartingMap(map));
  assert.doesNotThrow(() => validateStartingMap({
    width: 1, height: 1, cellSizeMeters: 250, rows: [[{ terrain: "grass" }]],
  }));
  assert.throws(() => validateStartingMap({ width: 1, height: 1, rows: [] }), /Invalid starting/);
});

test("location retries provider failures with higher accuracy, not permission denials", async () => {
  const signal = new AbortController().signal;
  const position = { coords: { latitude: 44.54, longitude: 2.3 } };
  const options = [], warnings = [];
  const location = {
    getCurrentPosition(success, failure, settings) {
      options.push(settings);
      if (options.length === 1) failure({ code: 3 });
      else success(position);
    },
  };
  assert.equal(await locatePosition(location, signal, error => warnings.push(error.code)), position);
  assert.deepEqual(warnings, [3]);
  assert.deepEqual(options, [
    { enableHighAccuracy: false, timeout: 20_000, maximumAge: 60_000 },
    { enableHighAccuracy: true, timeout: 60_000, maximumAge: 60_000 },
  ]);
  let attempts = 0;
  await assert.rejects(locatePosition({
    getCurrentPosition(success, failure) { attempts++; failure({ code: 1 }); },
  }, signal, () => assert.fail("Permission denial must not retry")), error => error.code === 1);
  assert.equal(attempts, 1);
  await assert.rejects(locatePosition({
    getCurrentPosition(success, failure) { failure({ code: 2 }); },
  }, signal, () => {}), error => error.code === 2);
});

test("cancelling location lookup prevents late results and retries", async () => {
  const controller = new AbortController();
  let failure;
  const pending = locatePosition({
    getCurrentPosition(success, reject) { failure = reject; },
  }, controller.signal, () => assert.fail("Aborted location must not retry"));
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  failure({ code: 3 });
});

test("place requests encode names, expose pending maps and preserve provider errors", async () => {
  const signal = new AbortController().signal;
  let request;
  const result = await placeRequest("/api/places", { q: "Le Puy & Lyon" }, signal,
    async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify([{ name: "Le Puy" }]), {
        headers: { "Content-Type": "application/json" },
      });
    });
  assert.equal(request.url, "/api/places?q=Le+Puy+%26+Lyon");
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.equal(result.pending, false);
  assert.equal(result.data[0].name, "Le Puy");
  assert.equal((await placeRequest("/api/origin", {}, signal, async () =>
    new Response('{"status":"loading"}', { status: 202,
      headers: { "Content-Type": "application/json" } }))).pending, true);
  await assert.rejects(placeRequest("/api/places", {}, signal, async () =>
    new Response('{"error":"Provider offline"}', { status: 502,
      headers: { "Content-Type": "application/json" } })), /Provider offline/);
  await assert.rejects(placeRequest("/api/places", {}, signal, async () =>
    new Response("<html>Static server</html>")), /local travel server/);
});
