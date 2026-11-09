import test from "node:test";
import assert from "node:assert/strict";
import { PIXEL_SPRITES, PIXEL_SETS, pixelSet, drawPixelSprite, drawPixelDoor, drawStoneTile } from "../minigames/legend-pixel-art.mjs";

function context() {
  const calls = [];
  return { calls, fillRect(...rect) { calls.push([this.fillStyle, ...rect]); } };
}
const geometry = ctx => ctx.calls.map(([, ...rect]) => rect);

test("original 16x16 sprite catalogue has bounded palette, transparent silhouettes and distinct creatures", () => {
  assert.ok(Object.keys(PIXEL_SPRITES).length >= 20);
  for (const [name, rows] of Object.entries(PIXEL_SPRITES)) {
    assert.equal(rows.length, 16, name);
    for (const row of rows) {
      assert.equal(row.length, 16, name);
      assert.match(row, /^[.osmhwgybtrpvcdlnf]+$/);
    }
    const ctx = context();
    drawPixelSprite(ctx, name, 5, 7);
    assert.ok(ctx.calls.length > 10, name);
    assert.ok(ctx.calls.every(([color, x, y, w, h]) =>
      /^#[a-f0-9]{6}$/.test(color) && Number.isInteger(x) && Number.isInteger(y) &&
      x >= 5 && x < 37 && y >= 7 && y < 39 && w === 2 && h === 2), name);
  }
  for (const [a, b] of [["bat", "rat"], ["bat", "batFolded"], ["rat", "ratAlert"],
    ["doorOpen", "doorClosed"], ["explorer", "caretaker"]]) {
    assert.notDeepEqual(PIXEL_SPRITES[a].map(row => row.replace(/[^.]/g, "x")),
      PIXEL_SPRITES[b].map(row => row.replace(/[^.]/g, "x")));
  }
});

test("eight seeded sets differ in door construction, props and tile geometry, not only colours", () => {
  assert.equal(PIXEL_SETS.length, 8);
  assert.deepEqual(PIXEL_SETS.slice(4).map(set => set.id), ["sewer", "glacier", "forge", "library"]);
  const wallGeometry = [], doorGeometry = [], floorGeometry = [];
  for (let seed = 0; seed < PIXEL_SETS.length; seed++) {
    const set = pixelSet(seed);
    assert.equal(pixelSet(seed + PIXEL_SETS.length), set);
    assert.ok(Object.isFrozen(set));
    for (const name of [set.bat, set.rat, set.prop]) assert.ok(PIXEL_SPRITES[name]);
    const walls = context(), doors = context(), floor = context();
    drawStoneTile(walls, 0, 0, 32, true, false, set);
    drawPixelDoor(doors, 0, 0, { set, open: false });
    drawStoneTile(floor, 0, 0, 32, false, true, set);
    wallGeometry.push(JSON.stringify(geometry(walls)));
    doorGeometry.push(JSON.stringify(geometry(doors)));
    floorGeometry.push(JSON.stringify(geometry(floor)));
    for (const ctx of [walls, doors, floor]) {
      assert.ok(ctx.calls.every(([, x, y, w, h]) =>
        Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x + w <= 32 && y + h <= 32));
    }
  }
  assert.equal(new Set(wallGeometry).size, 8);
  assert.equal(new Set(doorGeometry).size, 8);
  assert.equal(new Set(floorGeometry).size, 8);
  assert.equal(new Set(PIXEL_SETS.slice(4).map(set => set.prop)).size, 4);
  assert.throws(() => pixelSet(-1), RangeError);
  assert.throws(() => pixelSet(NaN), RangeError);
});

test("doors expose distinct open/closed silhouettes and sprites draw crisp rotated pixels", () => {
  for (const set of PIXEL_SETS) {
    for (const direction of ["up", "right", "down", "left"]) {
      const open = context(), closed = context();
      drawPixelDoor(open, 0, 0, { set, direction });
      drawPixelDoor(closed, 0, 0, { set, direction, open: false });
      assert.notDeepEqual(open.calls, closed.calls);
      assert.ok(open.calls.every(([, x, y, w, h]) => x >= 0 && y >= 0 && x + w <= 32 && y + h <= 32));
    }
    for (const active of [false, true]) {
      const ctx = context();
      drawPixelSprite(ctx, "lever", 0, 0, 1, { active });
      assert.ok(ctx.calls.length);
    }
  }
  assert.throws(() => drawPixelSprite(context(), "dragon", 0, 0), RangeError);
  assert.throws(() => drawPixelSprite(context(), "bat", 0, 0, .5), RangeError);
});
