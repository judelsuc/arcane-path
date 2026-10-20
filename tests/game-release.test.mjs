import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadGameRelease } from "../game-release.mjs";

const changelog = {
  version: "0.20.0",
  entries: [{ version: "0.20.0", fr: "Nouveautés", en: "What's new" }],
};
const deployment = {
  version: 1,
  commit: "b922147abcdef0123456789abcdef01234567890",
  packagedAt: "2026-10-20T04:00:00.000Z",
};
const jsonResponse = value => ({ ok: true, json: async () => value });
const logger = { error() {} };

test("tracked changelog declares a semantic game version and bilingual release notes", async () => {
  const actual = JSON.parse(await readFile(new URL("../public/changelog.json", import.meta.url)));
  assert.match(actual.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(actual.entries.map(entry => entry.version), ["0.20.9", "0.20.8", "0.20.7", "0.20.6", "0.20.5", "0.20.4", "0.20.3", "0.20.2", "0.20.1", "0.20.0", "0.19.0"]);
  assert.doesNotMatch(JSON.stringify(actual), /objets magiques|magical artifacts/);
  for (const entry of actual.entries) {
    assert.equal(typeof entry.fr, "string");
    assert.equal(typeof entry.en, "string");
  }
});

test("game release fetches changelog and optional deployment metadata without conflating schema version", async () => {
  const requests = [];
  const result = await loadGameRelease({
    fetcher: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse(url.includes("changelog") ? changelog : deployment);
    },
  });
  assert.deepEqual(result, { version: "0.20.0", entries: changelog.entries, deployment,
    errors: { changelog: null, deployment: null } });
  assert.deepEqual(requests.map(request => request.url).sort(),
    ["./public/changelog.json", "./public/release.json"]);
  assert.ok(requests.every(request => request.options.cache === "no-store"));
  assert.notEqual(result.version, deployment.version);
});

test("missing or invalid release metadata is explicitly unavailable without losing the game version", async () => {
  for (const unavailable of [
    { ok: false, status: 404 },
    { ok: true, json: async () => ({ version: 1, commit: "not-a-commit", packagedAt: "today" }) },
  ]) {
    const result = await loadGameRelease({
      logger,
      fetcher: async url => url.includes("changelog") ? jsonResponse(changelog) : unavailable,
    });
    assert.equal(result.version, "0.20.0");
    assert.equal(result.deployment, null);
  }
});

test("missing or invalid changelog version is reported as unavailable", async () => {
  for (const invalid of [
    { ok: false, status: 404 },
    jsonResponse({ version: "1.2", entries: [] }),
    jsonResponse({ version: "1.2.3", entries: [{ version: "1.2.3", fr: "OK" }] }),
  ]) {
    const result = await loadGameRelease({
      logger,
      fetcher: async url => url.includes("changelog") ? invalid : jsonResponse(deployment),
    });
    assert.equal(result.version, null);
    assert.deepEqual(result.entries, []);
    assert.equal(result.deployment.commit, deployment.commit);
  }
});

test("fetch and JSON errors degrade to explicit unavailable metadata", async () => {
  const result = await loadGameRelease({
    logger,
    fetcher: async () => { throw new Error("offline"); },
  });
  assert.deepEqual(result, { version: null, entries: [], deployment: null,
    errors: { changelog: { code: "network" }, deployment: { code: "network" } } });
});

test("per-file errors distinguish HTTP, JSON, network and malformed metadata and log failures", async () => {
  for (const [code, response] of [
    ["http", async () => ({ ok: false, status: 503 })],
    ["parse", async () => ({ ok: true, json: async () => { throw new SyntaxError("Bad JSON"); } })],
    ["network", async () => { throw new TypeError("Failed to fetch"); }],
    ["malformed", async () => jsonResponse({ version: "bad" })],
  ]) {
    const logged = [];
    const result = await loadGameRelease({
      fetcher: response, logger: { error: (...args) => logged.push(args) },
    });
    assert.equal(result.errors.changelog.code, code);
    assert.equal(result.errors.deployment.code, code);
    assert.equal(logged.length, 2);
  }
});

test("deployment 404 is explicit local/unavailable without an error log; changelog 404 is logged", async () => {
  const logged = [];
  const result = await loadGameRelease({
    fetcher: async () => ({ ok: false, status: 404 }),
    logger: { error: (...args) => logged.push(args) },
  });
  assert.deepEqual(result.errors, {
    changelog: { code: "missing", status: 404 },
    deployment: { code: "missing", status: 404 },
  });
  assert.equal(logged.length, 1);
});

test("hanging requests abort within the configured deadline and finish with timeout errors", async () => {
  const signals = [];
  const result = await loadGameRelease({
    timeoutMs: 10, logger,
    fetcher: async (_url, options) => {
      signals.push(options.signal);
      return new Promise(() => {});
    },
  });
  assert.ok(signals.every(signal => signal.aborted));
  assert.equal(result.errors.changelog.code, "timeout");
  assert.equal(result.errors.deployment.code, "timeout");
});

test("abort-aware fetch rejection and a stalled JSON body both report timeout", async () => {
  for (const fetcher of [
    async (_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }),
    async () => ({ ok: true, json: () => new Promise(() => {}) }),
  ]) {
    const result = await loadGameRelease({ fetcher, timeoutMs: 10, logger });
    assert.equal(result.errors.changelog.code, "timeout");
    assert.equal(result.errors.deployment.code, "timeout");
  }
});
