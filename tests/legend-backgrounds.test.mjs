import test from "node:test";
import assert from "node:assert/strict";
import { loadLegendBackgrounds } from "../legend-backgrounds.mjs";

const manifest = () => ({
  version: 1, adventure: "last-screening", model: "stable-diffusion-xl-base-v10",
  license: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md",
  entries: [{ scene: "passage", status: "ready", file: "passage.webp" }, { scene: "interior", status: "not-generated" }],
});

test("background loader decodes only retained ready images and reports ungenerated artwork honestly", async () => {
  const statuses = [];
  let image;
  const result = await loadLegendBackgrounds({
    fetcher: async url => {
      assert.equal(url, "/public/legend-art/last-screening/manifest.json");
      return { ok: true, json: async () => manifest() };
    },
    createImage: () => (image = { naturalWidth: 1024, naturalHeight: 1024, decode: async () => {} }),
    onStatus: (...status) => statuses.push(status),
  });
  assert.equal(image.src, "/public/legend-art/last-screening/passage.webp");
  assert.equal(result.images.passage, image);
  assert.equal(result.failures.length, 0);
  assert.deepEqual(statuses.sort(), [["interior", "not-generated"], ["passage", "ready"]]);
});

test("art failure is explicit while other backgrounds can still load", async () => {
  const input = manifest();
  input.entries[1] = { scene: "interior", status: "ready", file: "interior.webp" };
  let count = 0;
  const statuses = [];
  const result = await loadLegendBackgrounds({
    fetcher: async () => ({ ok: true, json: async () => input }),
    createImage: () => ({ naturalWidth: ++count === 1 ? 40 : 1024, naturalHeight: 1024, decode: async () => {} }),
    onStatus: (...status) => statuses.push(status),
  });
  assert.equal(result.failures.length, 1);
  assert.ok(result.images.interior);
  assert.equal(result.images.passage, undefined);
  assert.ok(statuses.some(([scene, status]) => scene === "passage" && status === "error"));
});

test("background manifest rejects external paths, duplicates and HTTP failures", async () => {
  for (const change of [
    input => { input.entries[0].file = "https://example.com/image.webp"; },
    input => { input.entries[1].scene = "passage"; },
    input => { input.entries[0] = null; },
    input => { input.version = 2; },
  ]) {
    const input = manifest();
    change(input);
    await assert.rejects(loadLegendBackgrounds({ fetcher: async () => ({ ok: true, json: async () => input }) }),
      /Invalid legend background manifest/);
  }
  await assert.rejects(loadLegendBackgrounds({ fetcher: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
});

test("leaving the preview cancels an outstanding image decode without delivering stale artwork", async () => {
  const controller = new AbortController();
  let resolve;
  const image = { naturalWidth: 1024, naturalHeight: 1024, decode: () => new Promise(done => { resolve = done; }) };
  const statuses = [];
  const pending = loadLegendBackgrounds({
    fetcher: async () => ({ ok: true, json: async () => manifest() }),
    createImage: () => image, signal: controller.signal, onStatus: (...status) => statuses.push(status),
  });
  await new Promise(done => setImmediate(done));
  controller.abort();
  const result = await pending;
  assert.deepEqual(result, { images: {}, failures: [] });
  assert.equal(image.src, "");
  resolve();
  assert.ok(!statuses.some(([, status]) => status === "ready"));
});
