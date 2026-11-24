import test from "node:test";
import assert from "node:assert/strict";
import { INVESTIGATION_SCENES, investigationScene, drawInvestigationScenery } from "../minigames/legend-investigation-scenery.mjs";

function render(scene, options = {}) {
  const rectangles = [], images = [];
  const ctx = {
    fillRect(x, y, width, height) { rectangles.push([this.fillStyle, x, y, width, height]); },
    drawImage(...args) { images.push(args); },
  };
  drawInvestigationScenery(ctx, scene, options);
  return { rectangles, images };
}

test("each eight-site chapter visits eight distinct stable locations, with varied seeded orders", () => {
  const orders = new Set();
  for (let seed = 0; seed < 128; seed++) {
    for (let start = 0; start < 32; start += 8) {
      const scenes = Array.from({ length: 8 }, (_, i) => investigationScene(seed, start + i).id);
      assert.equal(new Set(scenes).size, 8);
      assert.deepEqual(scenes, Array.from({ length: 8 }, (_, i) => investigationScene(seed, start + i).id));
      orders.add(scenes.join(","));
      if (start) assert.notEqual(investigationScene(seed, start - 1).id, scenes[0]);
    }
  }
  assert.equal(orders.size, 32);
  for (const [seed, site] of [[-1, 0], [0, -1], [1.5, 0], [0, 32], [NaN, 0]]) {
    assert.throws(() => investigationScene(seed, site), RangeError);
  }
});

test("location diversity changes actual geometry, not only palettes, with and without shared illustrations", () => {
  for (const image of [undefined, { naturalWidth: 1024, naturalHeight: 1024 }]) {
    const geometries = new Set();
    for (const scene of INVESTIGATION_SCENES) {
      assert.ok(scene.en && scene.fr);
      const drawing = render(scene, { image });
      assert.deepEqual(drawing, render(scene, { image }));
      assert.equal(drawing.images.length, image ? 1 : 0);
      assert.ok(drawing.rectangles.every(([, x, y, w, h]) =>
        [x, y, w, h].every(Number.isFinite) && w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= 640 && y + h <= 320));
      geometries.add(JSON.stringify(drawing.rectangles.map(([, ...geometry]) => geometry)));
    }
    assert.equal(geometries.size, 8);
  }
  assert.throws(() => render({ id: "unknown", palette: 0 }), /Unknown investigation scenery/);
});
