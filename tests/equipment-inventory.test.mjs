import test from "node:test";
import assert from "node:assert/strict";
import { ITEMS, createEquipment, restoreEquipment, validateEquipment, equipmentAction } from "../equipment.mjs";
import { BAG, fits, firstPlacement, restorePlacements } from "../equipment-inventory.mjs";

const act = (state, action) => equipmentAction(state, action, {
  expectedRevision: state.revision, elapsedMinutes: state.elapsedMinutes,
  walletCents: 20000, atShop: true,
});
const buy = (state, itemId) => act(state, { type: "buy", itemId }).state;

test("worn equipment consumes weight but no bag cells; buying packs and discarding frees space", () => {
  let state = buy(buy(createEquipment(), "raincoat"), "camera");
  assert.equal(state.placements.length, 1);
  assert.equal(state.placements[0].id, "camera");
  assert.equal(ITEMS.find(item => item.id === "raincoat").slot, "body");
  const next = act(state, { type: "discard", itemId: "camera" }).state;
  assert.deepEqual(next.placements, []);
  assert.equal(state.placements.length, 1);
});

test("inventory moves and rotations are atomic, free and preserved by exact saves", () => {
  let state = buy(buy(createEquipment(), "tent"), "camera");
  const before = structuredClone(state);
  assert.throws(() => act(state, { type: "move", itemId: "camera", x: 0, y: 0, rotated: false }), /move/);
  assert.deepEqual(state, before);
  const moved = act(state, { type: "move", itemId: "camera", x: 5, y: 1, rotated: true });
  assert.equal(moved.timeMinutes, 0);
  assert.equal(moved.costCents, 0);
  assert.equal(moved.state.revision, state.revision + 1);
  assert.equal(moved.state.elapsedMinutes, state.elapsedMinutes);
  assert.deepEqual(restoreEquipment(JSON.parse(JSON.stringify(moved.state)),
    { elapsedMinutes: moved.state.elapsedMinutes }), moved.state);
  for (const action of [
    { itemId: "camera", x: 5, y: 3, rotated: true },
    { itemId: "camera", x: 0.5, y: 0, rotated: false },
    { itemId: "camera", x: 0, y: 0, rotated: "yes" },
    { itemId: "boots", x: 0, y: 0, rotated: false },
  ]) assert.throws(() => act(state, { type: "move", ...action }), /move/);
});

test("fragmentation blocks purchase even with spare weight; rearrangement makes purchase possible", () => {
  let state = buy(createEquipment(), "camera");
  state = act(state, { type: "move", itemId: "camera", x: 2, y: 1, rotated: false }).state;
  assert.throws(() => buy(state, "tent"), /space/);
  state = act(state, { type: "move", itemId: "camera", x: 0, y: 0, rotated: false }).state;
  assert.doesNotThrow(() => buy(state, "tent"));
});

test("legacy equipment saves pack deterministically; forged layouts reject", () => {
  const state = buy(createEquipment(), "camera");
  const legacy = structuredClone(state);
  delete legacy.placements;
  assert.deepEqual(restoreEquipment(legacy, { elapsedMinutes: legacy.elapsedMinutes }).placements, state.placements);
  for (const placements of [null, [], [{ ...state.placements[0], x: -1 }],
    [...state.placements, { ...state.placements[0] }],
    [{ ...state.placements[0], id: "boots" }]]) {
    assert.throws(() => validateEquipment({ ...state, placements }));
  }
});

test("catalogue-defined footprints support future artifacts without item-specific packing logic", () => {
  const artifacts = [{ id: "arcane-key", footprint: [1, 4] }, { id: "arcane-mirror", footprint: [2, 2] }];
  const placements = [firstPlacement([], artifacts[0], artifacts)];
  placements.push(firstPlacement(placements, artifacts[1], artifacts));
  assert.equal(BAG.columns, 6);
  assert.equal(BAG.rows, 4);
  assert.deepEqual(restorePlacements(artifacts, placements, artifacts), placements);
  assert.equal(fits(placements, artifacts[1], { x: 0, y: 0, rotated: false }, artifacts), false);
  assert.ok(ITEMS.every(item => Object.isFrozen(item.footprint)));
});
