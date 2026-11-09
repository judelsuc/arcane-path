import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { awardTreasure, treasureAction, treasureId, treasureItem, validateTreasures,
  carriedTheme, carriedUiTheme, carriedPlayerIcon, carriedIconArtwork, composedReward,
  effectiveAdventureCosts, treasureEquipment, LEGEND_THEMES, treasureBag } from "../legend-rewards.mjs";
import { PLAYER_ICONS } from "../player-icons.mjs";
import { createEquipment } from "../equipment.mjs";
import { validatePixelPack } from "../map-appearance.mjs";
import { themedPixelPack } from "../legend-theme-tiles.mjs";

const journey = "a".repeat(32), other = "b".repeat(32);
const session = { townId: "node/42", seed: 1, town: "Firmi" };
const state = () => ({ col: 0, row: 0, artifactWorld: "main-artifacts-v1",
  equipment: createEquipment(), lore: { inventory: [] },
  treasures: { version: 1, inventory: [], equipped: null } });
const map = { width: 2, height: 1, rows: [[{ terrain: "place", settlements: [{ name: "Firmi" }] },
  { terrain: "forest" }]] };

function composed(seed, initial = state()) {
  const instances = [], reward = composedReward(seed);
  const result = awardTreasure(initial, instances, journey, { ...session, seed }, reward);
  return { ...result, instances, reward };
}

test("composed rewards select nature before compatible effects and characteristics, not prewritten names", () => {
  const natures = new Set(), effects = new Set();
  for (let seed = 0; seed < 2048; seed++) {
    const reward = composedReward(seed), item = treasureItem(treasureId("node/42", seed, true), reward);
    natures.add(reward.nature); effects.add(reward.effect);
    assert.ok(item.effects.includes(reward.effect));
    assert.equal(item.id.endsWith(":v3"), true);
    assert.equal(reward.name, undefined);
    assert.ok(reward.material && reward.motif);
  }
  assert.equal(natures.size, 16);
  assert.equal(effects.size, 10);
  assert.throws(() => treasureItem(treasureId("node/42", 1, true),
    { ...composedReward(1), effect: "coins" }), /composition/);
});

test("equipment has one weapon and one jewel, explicit curses, exact cumulative modifiers and free removal", () => {
  let owned = composed(49); // Ring, fourth compatible effect: blood-price.
  const id = owned.id;
  assert.equal(treasureItem(id).effect.cursed, true);
  owned.state = treasureAction(owned.state, owned.instances, journey, map, { type: "treasure-equip-gear", id });
  assert.equal(treasureEquipment(owned.state).jewel.id, id);
  assert.deepEqual(effectiveAdventureCosts(owned.state, { minutes: 20, fatigue: 10, health: 10, dirt: 4 }),
    { minutes: 20, fatigue: 6, health: 15, dirt: 4 });
  validateTreasures(owned.state);
  assert.throws(() => treasureAction(owned.state, owned.instances, journey, map, { type: "treasure-equip-ui", id }),
    /no UI/);
  let removed = treasureAction(owned.state, owned.instances, journey, map, { type: "treasure-equip-gear", id });
  assert.equal(treasureEquipment(removed).jewel, null);
  assert.deepEqual(effectiveAdventureCosts(removed, { minutes: 20, fatigue: 10, health: 10, dirt: 4 }),
    { minutes: 20, fatigue: 10, health: 10, dirt: 4 });
  removed = treasureAction(owned.state, owned.instances, journey, map, { type: "treasure-drop", id });
  assert.equal(removed.treasures.jewelEquipped, null);
  removed = treasureAction({ ...state(), treasures: { version: 1, inventory: [], equipped: null } },
    owned.instances, other, map, { type: "treasure-pickup", id });
  assert.equal(removed.treasures.jewelEquipped, null);
  assert.equal(removed.treasures.inventory[0].reward.effect, "blood-price");
});

test("money remains a transferable physical container until opened exactly once", () => {
  const owned = composed(2, { ...state(), walletCents: 500 });
  assert.equal(owned.state.walletCents, 500);
  let next = treasureAction(owned.state, owned.instances, journey, map, { type: "treasure-drop", id: owned.id });
  next = treasureAction({ ...state(), walletCents: 100 }, owned.instances, other, map,
    { type: "treasure-pickup", id: owned.id });
  next = treasureAction(next, owned.instances, other, map, { type: "treasure-use", id: owned.id });
  assert.equal(next.walletCents, 1300);
  assert.equal(next.treasures.inventory.length, 0);
  assert.equal(owned.instances[0].consumed, true);
  assert.throws(() => treasureAction(next, owned.instances, other, map,
    { type: "treasure-use", id: owned.id }), /unavailable/);
  assert.equal(awardTreasure(next, owned.instances, other, { ...session, seed: 2 }, composedReward(2)).outcome, "taken");
});

test("charts reveal existing unowned artifact towns without coordinates, and keep the chart if no new lead exists", () => {
  const initial = { ...state(), elapsedMinutes: 0, discovery: { version: 1, entries: [] } };
  const owned = composed(5, initial), artifacts = [
    { id: "star", owner: null, generation: 3, town: "Paris", region: "France" },
    { id: "moon", owner: other, generation: 1, town: "Rome", region: "Italy" },
  ];
  assert.throws(() => treasureAction(owned.state, owned.instances, journey, map,
    { type: "treasure-use", id: owned.id }, []), /Keep this chart/);
  assert.equal(owned.instances[0].owner, journey);
  const next = treasureAction(owned.state, owned.instances, journey, map, { type: "treasure-use", id: owned.id }, artifacts);
  assert.equal(next.discovery.entries.length, 1);
  assert.deepEqual(next.discovery.entries[0].facts, { artifact: "star", region: "France", place: "Paris" });
  assert.equal(next.discovery.entries[0].targetRevision, "3");
  assert.equal(next.treasures.inventory.length, 0);
});

test("approved generated artwork and names survive transfer without changing nature or mechanics", () => {
  const reward = { ...composedReward(6), icon: { ...PLAYER_ICONS[0], id: "generated:test-day:role-1" },
    name: { en: "Lantern of Copper Leaves", fr: "Lanterne aux feuilles de cuivre" } };
  const instances = [];
  let result = awardTreasure(state(), instances, journey, { ...session, seed: 6 }, reward);
  assert.equal(treasureItem(result.id, reward).kind, "icon");
  assert.equal(treasureItem(result.id, reward).en, reward.name.en);
  result.state = treasureAction(result.state, instances, journey, map, { type: "treasure-equip-icon", id: result.id });
  assert.equal(carriedPlayerIcon(result.state), reward.icon.id);
  assert.deepEqual(carriedIconArtwork(result.state), reward.icon);
  validateTreasures(result.state);
  const dropped = treasureAction(result.state, instances, journey, map, { type: "treasure-drop", id: result.id });
  assert.equal(carriedPlayerIcon(dropped), "default");
  const picked = treasureAction(state(), instances, other, map, { type: "treasure-pickup", id: result.id });
  assert.deepEqual(picked.treasures.inventory[0].reward, reward);
});

test("composed rewards reach sixteen looks with real footprints/weights", () => {
  const looks = new Set(), natures = new Set();
  for (let seed = 0; seed < 16; seed++) {
    const id = treasureId("relation/123", seed), item = treasureItem(id);
    assert.deepEqual(treasureItem(id), item);
    assert.equal(item.townId, "relation/123");
    looks.add(item.theme);
    natures.add(item.en.split(" — ")[0]);
    assert.ok(item.grams > 0 && item.footprint.every(value => value > 0));
    assert.ok(item.en && item.fr);
  }
  assert.equal(looks.size, 16);
  assert.equal(natures.size, 4);
  for (const id of ["treasure:node/42:01", "treasure:node/0:1", "treasure:node/42:4294967296",
    "treasure:node/42:-1", "treasure:node/42:1:v4", "treasure:node/42:01:v2",
    "treasure:node/42:4294967296:v2", "moonlit", null]) assert.throws(() => treasureItem(id));
});

test("legacy originals retain their exact nature, name, weight, footprint and theme", () => {
  const themes = ["sepia", "moonlit", "verdant", "ember"];
  const natures = [["Film reel", "Bobine de film", 180, [2, 1]],
    ["Star atlas", "Atlas céleste", 240, [1, 2]],
    ["Embroidered ribbon", "Ruban brodé", 20, [1, 1]],
    ["Copper medallion", "Médaillon de cuivre", 60, [1, 1]]];
  for (const seed of [...Array(64).keys(), 123456789, 4294967295]) {
    const item = treasureItem(`treasure:way/123:${seed}`), theme = LEGEND_THEMES[seed % 4];
    const [en, fr, grams, footprint] = natures[Math.floor(seed / 4) % 4];
    assert.equal(item.theme, themes[seed % 4]);
    assert.equal(item.en, `${en} — ${theme.en}`);
    assert.equal(item.fr, `${fr} — ${theme.fr}`);
    assert.equal(item.grams, grams);
    assert.deepEqual(item.footprint, footprint);
  }
  const instances = [{ id: "treasure:node/42:123", owner: null }];
  assert.equal(awardTreasure(state(), instances, journey, session).outcome, "taken");
  assert.equal(instances.length, 1, "new catalogue cannot duplicate an older original");
});

test("UI skins and map looks mix independently, persist, and follow carried custody", () => {
  const instances = [];
  let owned = awardTreasure(state(), instances, journey, session).state;
  const first = owned.treasures.inventory[0].id;
  owned = awardTreasure(owned, instances, journey, { ...session, townId: "way/123", seed: 12 }).state;
  const second = owned.treasures.inventory[1].id;
  owned = treasureAction(owned, instances, journey, map, { type: "treasure-equip", id: first });
  owned = treasureAction(owned, instances, journey, map, { type: "treasure-equip-ui", id: second });
  validateTreasures(JSON.parse(JSON.stringify(owned)));
  assert.equal(carriedTheme(owned), "moonlit");
  assert.equal(carriedUiTheme(owned), "inkwash");
  owned = treasureAction(owned, instances, journey, map, { type: "treasure-equip-ui", id: second });
  assert.equal(carriedUiTheme(owned), "default");
  assert.equal(carriedTheme(owned), "moonlit");
  owned = treasureAction(owned, instances, journey, map, { type: "treasure-equip-ui", id: second });
  const invalid = structuredClone(owned);
  invalid.treasures.uiEquipped = treasureId("way/999", 2);
  assert.throws(() => validateTreasures(invalid), /treasure/);
  owned = treasureAction(owned, instances, journey, map, { type: "treasure-drop", id: second });
  assert.equal(carriedUiTheme(owned), "default");
  assert.equal(carriedTheme(owned), "moonlit", "dropping UI source retains a different map source");
  let next = treasureAction(state(), instances, other, map, { type: "treasure-pickup", id: second });
  assert.equal(carriedUiTheme(next), "default");
  next = treasureAction(next, instances, other, map, { type: "treasure-equip-ui", id: second });
  assert.equal(carriedUiTheme(next), "inkwash");
  assert.equal(carriedTheme(next), "default");
});
test("one original is inventoried, equipped, deposited, transferred and never duplicated", () => {
  const instances = [];
  let owned = awardTreasure(state(), instances, journey, session);
  assert.equal(owned.outcome, "collected");
  assert.equal(instances[0].firstClaimant, journey);
  assert.equal(owned.state.treasures.inventory.length, 1);
  validateTreasures(owned.state);
  assert.equal(treasureBag(owned.state).grams, 1400 + treasureItem(owned.id).grams);
  assert.equal(carriedTheme(owned.state), "default", "finding a reward does not force its appearance");
  let next = treasureAction(owned.state, instances, journey, map, { type: "treasure-equip", id: owned.id });
  assert.equal(carriedTheme(next), "moonlit");
  const before = structuredClone(instances);
  assert.throws(() => treasureAction(next, instances, other, map, { type: "treasure-drop", id: owned.id }), /carry/);
  assert.throws(() => treasureAction({ ...next, col: 1 }, instances, journey, map,
    { type: "treasure-drop", id: owned.id }), /mapped/);
  assert.deepEqual(instances, before);
  next = treasureAction(next, instances, journey, map, { type: "treasure-drop", id: owned.id });
  assert.equal(next.treasures.inventory.length, 0);
  assert.equal(carriedTheme(next), "default");
  assert.equal(instances[0].owner, null);
  assert.throws(() => treasureAction({ ...next, ended: "health" }, instances, journey, map,
    { type: "treasure-pickup", id: owned.id }), /journey has ended/);
  assert.equal(awardTreasure(state(), instances, other, session).outcome, "taken");
  let recipient = treasureAction(state(), instances, other, map, { type: "treasure-pickup", id: owned.id });
  recipient = treasureAction(recipient, instances, other, map, { type: "treasure-equip", id: owned.id });
  assert.equal(carriedTheme(recipient), "moonlit");
  assert.equal(instances[0].firstClaimant, journey);
  assert.equal(instances.length, 1);
});

test("player icons toggle separately, follow custody and leave other carried cosmetic sources untouched", () => {
  const instances = [];
  let owned = awardTreasure(state(), instances, journey, session).state;
  const first = owned.treasures.inventory[0].id;
  owned = awardTreasure(owned, instances, journey, { ...session, townId: "way/123", seed: 2 }).state;
  const second = owned.treasures.inventory[1].id;
  owned = treasureAction(owned, instances, journey, map, { type: "treasure-equip", id: first });
  owned = treasureAction(owned, instances, journey, map, { type: "treasure-equip-ui", id: first });
  assert.equal(carriedPlayerIcon(owned), "default");
  owned = treasureAction(owned, instances, journey, map, { type: "treasure-equip-icon", id: second });
  assert.equal(carriedPlayerIcon(owned), "ranger");
  validateTreasures(JSON.parse(JSON.stringify(owned)));
  owned = treasureAction(owned, instances, journey, map, { type: "treasure-equip-icon", id: second });
  assert.equal(carriedPlayerIcon(owned), "default");
  assert.equal(carriedUiTheme(owned), "moonlit");
  owned = treasureAction(owned, instances, journey, map, { type: "treasure-equip-icon", id: second });
  const invalid = structuredClone(owned);
  invalid.treasures.iconEquipped = treasureId("way/999", 2);
  assert.throws(() => validateTreasures(invalid), /treasure/);
  assert.throws(() => treasureAction(owned, instances, other, map,
    { type: "treasure-equip-icon", id: second }), /carry/);
  owned = treasureAction(owned, instances, journey, map, { type: "treasure-drop", id: second });
  assert.equal(carriedPlayerIcon(owned), "default");
  assert.equal(carriedUiTheme(owned), "moonlit");
  assert.equal(carriedTheme(owned), "moonlit");
  let next = treasureAction(state(), instances, other, map, { type: "treasure-pickup", id: second });
  assert.equal(carriedPlayerIcon(next), "default");
  next = treasureAction(next, instances, other, map, { type: "treasure-equip-icon", id: second });
  assert.equal(carriedPlayerIcon(next), "ranger");
});

test("full bags leave the recovered original at the entrance, visibly collectible after making space", () => {
  const full = state();
  full.equipment.items.push({ id: "tent", condition: 100 }, { id: "sleepingBag", condition: 100 },
    { id: "knife", condition: 100 });
  full.equipment.placements = [{ id: "tent", x: 0, y: 0, rotated: false },
    { id: "sleepingBag", x: 3, y: 0, rotated: false }, { id: "knife", x: 4, y: 2, rotated: false }];
  full.lore.inventory.push({ id: "hierophant", placement: { id: "hierophant", x: 4, y: 0, rotated: false } });
  const instances = [];
  const result = awardTreasure(full, instances, journey, { ...session, seed: 4 });
  assert.equal(result.outcome, "left");
  assert.equal(instances[0].owner, null);
  assert.equal(instances[0].col, full.col);
  assert.equal(result.state.treasures.inventory.length, 0);
  assert.throws(() => treasureAction(full, instances, journey, map,
    { type: "treasure-pickup", id: result.id }), /5,500/);
  const collected = treasureAction(state(), instances, journey, map, { type: "treasure-pickup", id: result.id });
  assert.equal(collected.treasures.inventory.length, 1);
});

test("treasure layout rejects overlap, invalid saved ownership and unsupported placement changes", () => {
  const instances = [], awarded = awardTreasure(state(), instances, journey, session);
  const packed = treasureAction(awarded.state, instances, journey, map,
    { type: "treasure-pack", id: awarded.id, x: 2, y: 1, rotated: true });
  validateTreasures(packed);
  assert.equal(packed.treasures.inventory[0].placement.rotated, true);
  const invalid = structuredClone(packed);
  invalid.treasures.equipped = treasureId("node/43", 2);
  assert.throws(() => validateTreasures(invalid), /treasure/);
  const invalidPlacement = structuredClone(packed);
  invalidPlacement.treasures.inventory[0].placement.id = "camera";
  assert.throws(() => validateTreasures(invalidPlacement), /treasure/);
  assert.throws(() => treasureAction(packed, instances, journey, map,
    { type: "treasure-pack", id: awarded.id, x: 6, y: 0, rotated: false }), /Inventory/);
});

test("a spatially full but light bag leaves the original at its entrance without overlapping items", () => {
  const full = state();
  full.treasures.inventory = Array.from({ length: 24 }, (_, index) => {
    const id = treasureId(`node/${index + 100}`, 8);
    return { id, placement: { id, x: index % 6, y: Math.floor(index / 6), rotated: false } };
  });
  validateTreasures(full);
  const instances = full.treasures.inventory.map(item => ({ ...item, owner: journey }));
  const result = awardTreasure(full, instances, journey, session);
  assert.equal(result.outcome, "left");
  assert.equal(result.state.treasures.inventory.length, 24);
  assert.equal(instances.at(-1).owner, null);
  assert.throws(() => treasureAction(full, instances, journey, map,
    { type: "treasure-pickup", id: result.id }), /inventory space/);
});

test("sixteen tile variants differ in palette AND geometry with full coverage and preserved source data", () => {
  const base = JSON.parse(readFileSync(new URL("../public/tilesets/path-pixel.json", import.meta.url)));
  const before = structuredClone(base), variants = new Set(), geometries = new Set();
  for (const theme of LEGEND_THEMES) {
    const pack = validatePixelPack(themedPixelPack(base, theme.id));
    variants.add(JSON.stringify(pack.tiles));
    geometries.add(JSON.stringify(pack.tiles.forest.rects.map(rect => rect.slice(0, 4))));
    for (const [kind, tile] of Object.entries(pack.tiles)) {
      assert.notDeepEqual(tile, base.tiles[kind], `${theme.id}:${kind}`);
    }
    assert.equal(pack.tiles.water.background, base.tiles.water.background);
    assert.equal(pack.tiles.rail.background, base.tiles.rail.background);
  }
  assert.equal(variants.size, 16);
  assert.equal(geometries.size, 16);
  assert.deepEqual(base, before);
});
