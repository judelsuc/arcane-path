import { ITEMS, CAPACITY_GRAMS } from "./equipment.mjs";
import { LORE_ITEMS } from "./lore-catalogue.mjs";
import { availablePlacement, firstPlacement, restorePlacements, fits } from "./equipment-inventory.mjs";
import { loreCell } from "./lore-map.mjs";
import { themePlayerIcon, validateGeneratedIcon } from "./player-icons.mjs";
import REWARDS from "./public/legend-rewards.json" with { type: "json" };
import { learnDiscovery } from "./discovery.mjs";

export const LEGEND_THEMES = Object.freeze([
  { id: "sepia", en: "Last light", fr: "Dernière lumière", dark: "#30251f", light: "#eddbb6",
    accent: "#d7a45e", wall: "#82664a", floor: "#493c30", masonry: "timber", prop: "books" },
  { id: "moonlit", en: "Moonlit paths", fr: "Chemins de lune", dark: "#17243d", light: "#d5e9f2",
    accent: "#8dc9e7", wall: "#586f95", floor: "#2b3c58", masonry: "ice", prop: "crystal" },
  { id: "verdant", en: "Wild garden", fr: "Jardin sauvage", dark: "#1d332c", light: "#e5edb8",
    accent: "#b1d87a", wall: "#627a52", floor: "#314e3b", masonry: "blocks", prop: "vase" },
  { id: "ember", en: "Copper embers", fr: "Braises de cuivre", dark: "#35232d", light: "#f5dcc1",
    accent: "#ef9254", wall: "#875f59", floor: "#4b303a", masonry: "rivets", prop: "anvil" },
  { id: "tide", en: "Tidekeeper", fr: "Gardien des marées", dark: "#162f3b", light: "#d7f0e8",
    accent: "#78d8ce", wall: "#497f89", floor: "#294d59", masonry: "drains", prop: "pipe", door: "grate",
    trim: [[0, 13, 4, 1], [4, 14, 4, 1], [8, 13, 4, 1], [12, 14, 4, 1]] },
  { id: "roseglass", en: "Roseglass theatre", fr: "Théâtre de verre rose", dark: "#38243c", light: "#f4dce8",
    accent: "#ee9ec9", wall: "#936b94", floor: "#513c59", masonry: "panels", prop: "vase", door: "curtain",
    trim: [[0, 0, 1, 7], [1, 0, 4, 1], [15, 9, 1, 7], [11, 15, 4, 1]] },
  { id: "sandstone", en: "Amber caravan", fr: "Caravane d'ambre", dark: "#392e24", light: "#f4e3ba",
    accent: "#edc66e", wall: "#ad8a56", floor: "#665139", masonry: "brick", prop: "vase", door: "arch",
    trim: [[0, 0, 3, 1], [0, 1, 1, 2], [13, 0, 3, 1], [15, 1, 1, 2], [5, 15, 6, 1]] },
  { id: "porcelain", en: "Porcelain morning", fr: "Matin de porcelaine", dark: "#243248", light: "#eef0db",
    accent: "#a9c7ee", wall: "#7b93b5", floor: "#3d506c", masonry: "panels", prop: "books", door: "carved",
    trim: [[0, 0, 2, 2], [14, 0, 2, 2], [0, 14, 2, 2], [14, 14, 2, 2]] },
  { id: "autumn", en: "Autumn letters", fr: "Lettres d'automne", dark: "#332c23", light: "#f1dfb8",
    accent: "#e5aa66", wall: "#927248", floor: "#534531", masonry: "shelves", prop: "books", door: "wood",
    trim: [[0, 0, 1, 6], [1, 1, 2, 1], [1, 4, 3, 1], [12, 15, 4, 1], [14, 12, 1, 3]] },
  { id: "aurora", en: "Northern ribbons", fr: "Rubans du nord", dark: "#202944", light: "#e0f4e6",
    accent: "#a4e7be", wall: "#527e8c", floor: "#304959", masonry: "ice", prop: "crystal", door: "frost",
    trim: [[0, 0, 3, 1], [3, 1, 4, 1], [7, 0, 4, 1], [11, 1, 5, 1], [0, 15, 6, 1]] },
  { id: "clockwork", en: "Clockmaker's road", fr: "Route de l'horloger", dark: "#2c2d34", light: "#eee1ba",
    accent: "#dcc47e", wall: "#787773", floor: "#434549", masonry: "rivets", prop: "anvil", door: "steel",
    trim: [[0, 0, 3, 1], [0, 0, 1, 3], [13, 0, 3, 1], [15, 0, 1, 3],
      [0, 13, 1, 3], [0, 15, 3, 1], [13, 15, 3, 1], [15, 13, 1, 3]] },
  { id: "lavender", en: "Lavender dusk", fr: "Crépuscule de lavande", dark: "#302b43", light: "#ede0f4",
    accent: "#c5a9ed", wall: "#80729e", floor: "#48415e", masonry: "blocks", prop: "cobweb", door: "arch",
    trim: [[0, 0, 1, 5], [1, 1, 1, 1], [1, 3, 2, 1], [13, 15, 3, 1], [14, 13, 1, 2]] },
  { id: "inkwash", en: "Ink and rain", fr: "Encre et pluie", dark: "#202e34", light: "#e7ebe4",
    accent: "#b1ccc8", wall: "#758b8a", floor: "#384a4d", masonry: "shelves", prop: "books", door: "carved",
    trim: [[0, 0, 1, 12], [1, 0, 8, 1], [15, 4, 1, 12], [7, 15, 8, 1]] },
  { id: "coral", en: "Coral harbour", fr: "Port de corail", dark: "#352936", light: "#f6dfd0",
    accent: "#f1ab9b", wall: "#a97572", floor: "#58414b", masonry: "drains", prop: "pipe", door: "grate",
    trim: [[0, 11, 1, 5], [1, 12, 2, 1], [1, 14, 3, 1], [15, 0, 1, 5], [12, 2, 3, 1]] },
  { id: "mosaic", en: "Mosaic courtyard", fr: "Cour aux mosaïques", dark: "#24353c", light: "#eee7c3",
    accent: "#e6ce7b", wall: "#638783", floor: "#3a5658", masonry: "panels", prop: "vase", door: "arch",
    trim: [[0, 0, 3, 1], [0, 1, 1, 2], [2, 1, 1, 2], [1, 2, 1, 1],
      [13, 13, 3, 1], [13, 14, 1, 2], [15, 14, 1, 2], [14, 15, 1, 1]] },
  { id: "starlight", en: "Stargazer's vigil", fr: "Veillée des étoiles", dark: "#24263d", light: "#e8e2fa",
    accent: "#c8b7f4", wall: "#716b9c", floor: "#3e3b60", masonry: "brick", prop: "crystal", door: "frost",
    trim: [[0, 1, 3, 1], [1, 0, 1, 3], [13, 14, 3, 1], [14, 13, 1, 3], [8, 0, 1, 1]] },
].map(theme => Object.freeze({ ...theme,
  ...(theme.trim ? { trim: Object.freeze(theme.trim.map(rect => Object.freeze(rect))) } : {}) })));
const NATURES = [
  { en: "Film reel", fr: "Bobine de film", grams: 180, footprint: [2, 1] },
  { en: "Star atlas", fr: "Atlas céleste", grams: 240, footprint: [1, 2] },
  { en: "Embroidered ribbon", fr: "Ruban brodé", grams: 20, footprint: [1, 1] },
  { en: "Copper medallion", fr: "Médaillon de cuivre", grams: 60, footprint: [1, 1] },
];
const ID = /^treasure:((?:node|way|relation)\/[1-9]\d{0,19}):(\d{1,10})(:v[23])?$/;
export function treasureId(townId, seed, composed = false) {
  const id = `treasure:${townId}:${seed}:${composed ? "v3" : "v2"}`;
  treasureItem(id);
  return id;
}
export function composedReward(seed) {
  const nature = REWARDS.natures[seed % REWARDS.natures.length], index = Math.floor(seed / REWARDS.natures.length);
  return { version: 1, nature: nature.id, effect: nature.effects[index % nature.effects.length],
    material: REWARDS.materials[Math.floor(index / 4) % REWARDS.materials.length],
    motif: REWARDS.motifs[Math.floor(index / 32) % REWARDS.motifs.length] };
}
export function validateReward(reward, seed) {
  if (!reward || Object.keys(reward).sort().join() !==
      ["version", "nature", "effect", "material", "motif", ...(reward.icon ? ["icon"] : []),
        ...(reward.name ? ["name"] : [])].sort().join() ||
      Object.entries(composedReward(seed)).some(([key, value]) => reward[key] !== value)) {
    throw new Error("Invalid retained treasure composition.");
  }
  if (reward.icon) {
    if (REWARDS.natures[seed % REWARDS.natures.length].kind !== "icon") throw new Error("Unexpected treasure artwork.");
    validateGeneratedIcon(reward.icon);
  }
  if (reward.name && (Object.keys(reward.name).sort().join() !== "en,fr" ||
      Object.values(reward.name).some(text => typeof text !== "string" || !text.trim() ||
        text.length > 100 || /[\u0000-\u001f\u007f<>]/.test(text)))) {
    throw new Error("Invalid generated treasure name.");
  }
  return reward;
}
export function treasureItem(id, reward) {
  const match = typeof id === "string" && ID.exec(id);
  const seed = match && Number(match[2]);
  if (!match || !Number.isSafeInteger(seed) || seed > 0xffffffff || String(seed) !== match[2]) {
    throw new Error("Invalid town treasure.");
  }
  // Unsuffixed originals pin the first four looks and their original physical nature.
  const theme = LEGEND_THEMES[seed % (match[3] ? 16 : 4)];
  if (match[3] === ":v3") {
    if (reward) validateReward(reward, seed);
    const composition = composedReward(seed);
    if (reward && Object.keys(composition).some(key => reward[key] !== composition[key])) {
      throw new Error("Treasure composition differs from its retained nature and effects.");
    }
    const nature = REWARDS.natures.find(item => item.id === composition.nature);
    const effect = REWARDS.effects.find(item => item.id === composition.effect);
    return { ...nature, id, townId: match[1], seed, theme: theme.id, effect,
      material: composition.material, motif: composition.motif,
      ...(nature.kind === "money" ? { cents: nature.id === "coffer" ? 2400 : 1200 } : {}),
      en: reward?.name?.en ?? nature.en, fr: reward?.name?.fr ?? nature.fr };
  }
  const nature = NATURES[Math.floor(seed / 4) % NATURES.length];
  return { ...nature, id, townId: match[1], seed, theme: theme.id, kind: "cosmetic",
    en: `${nature.en} — ${theme.en}`, fr: `${nature.fr} — ${theme.fr}` };
}
export const treasureItems = state => (state.treasures?.inventory ?? []).map(item => treasureItem(item.id, item.reward));
export const treasureGrams = state => treasureItems(state).reduce((sum, item) => sum + item.grams, 0);
export function carriedTheme(state) {
  const id = state?.treasures?.equipped;
  return id && state.treasures.inventory.some(item => item.id === id) ? treasureItem(id).theme : "default";
}
export function carriedUiTheme(state) {
  const id = state?.treasures?.uiEquipped;
  return id && state.treasures.inventory.some(item => item.id === id) ? treasureItem(id).theme : "default";
}
export function carriedPlayerIcon(state) {
  const id = state?.treasures?.iconEquipped;
  return id && state.treasures.inventory.some(item => item.id === id)
    ? carriedIconArtwork(state)?.id ?? themePlayerIcon(treasureItem(id).theme) : "default";
}
export function carriedIconArtwork(state) {
  return state?.treasures?.inventory.find(item => item.id === state.treasures.iconEquipped)?.reward?.icon;
}
export function treasureEquipment(state) {
  const value = state?.treasures;
  const equipped = slot => {
    const owned = value?.inventory.find(item => item.id === value[`${slot}Equipped`]);
    return owned ? treasureItem(owned.id, owned.reward) : null;
  };
  return { weapon: equipped("weapon"), jewel: equipped("jewel") };
}
export function effectiveAdventureCosts(state, costs) {
  const effect = treasureEquipment(state).jewel?.effect;
  return { ...costs, minutes: Math.ceil(costs.minutes * (effect?.minutePercent ?? 100) / 100),
    fatigue: Math.ceil(costs.fatigue * (effect?.fatiguePercent ?? 100) / 100),
    health: Math.ceil(costs.health * (effect?.healthPercent ?? 100) / 100) };
}
export function validateTreasures(state) {
  if (state.treasures === undefined) return;
  const value = state.treasures;
  if (state.artifactWorld !== "main-artifacts-v1" || !value || value.version !== 1 ||
      Object.keys(value).sort().join() !== ["equipped", "inventory", "version",
        ...(Object.hasOwn(value, "uiEquipped") ? ["uiEquipped"] : []),
        ...(Object.hasOwn(value, "iconEquipped") ? ["iconEquipped"] : []),
        ...(Object.hasOwn(value, "weaponEquipped") ? ["weaponEquipped"] : []),
        ...(Object.hasOwn(value, "jewelEquipped") ? ["jewelEquipped"] : [])].sort().join() ||
      !Array.isArray(value.inventory) || value.inventory.length > 256 ||
      new Set(value.inventory.map(item => item?.id)).size !== value.inventory.length ||
      value.inventory.some(item => !item || Object.keys(item).sort().join() !==
        ["id", "placement", ...(item.reward ? ["reward"] : [])].sort().join() ||
        item.placement?.id !== item.id) ||
      value.equipped !== null && !value.inventory.some(item => item.id === value.equipped) ||
      value.uiEquipped !== undefined && value.uiEquipped !== null &&
        !value.inventory.some(item => item.id === value.uiEquipped) ||
      value.iconEquipped !== undefined && value.iconEquipped !== null &&
        !value.inventory.some(item => item.id === value.iconEquipped)) {
    throw new Error("Invalid treasure inventory.");
  }
  const catalogue = treasureItems(state);
  for (const owned of value.inventory) {
    if (owned.id.endsWith(":v3") !== Boolean(owned.reward)) throw new Error("Missing or unexpected treasure composition.");
    if (owned.reward) validateReward(owned.reward, treasureItem(owned.id).seed);
  }
  for (const [field, kinds] of [["equipped", ["cosmetic"]], ["uiEquipped", ["cosmetic"]],
    ["iconEquipped", ["cosmetic", "icon"]], ["weaponEquipped", ["weapon"]], ["jewelEquipped", ["jewellery"]]]) {
    const item = catalogue.find(item => item.id === value[field]);
    if (value[field] != null && (!item || !kinds.includes(item.kind))) throw new Error("Invalid equipped treasure kind.");
  }
  restorePlacements(value.inventory, value.inventory.map(item => item.placement), catalogue);
}
export function treasureBag(state) {
  const owned = state.treasures?.inventory ?? [], artifacts = state.lore?.inventory ?? [];
  const catalogue = [...ITEMS, ...LORE_ITEMS, ...treasureItems(state)];
  const items = [...state.equipment.items, ...artifacts, ...owned];
  const placements = [...state.equipment.placements, ...artifacts.map(item => item.placement),
    ...owned.map(item => item.placement)];
  restorePlacements(items, placements, catalogue);
  const grams = items.reduce((sum, item) => sum + catalogue.find(candidate => candidate.id === item.id).grams, 0);
  if (grams > CAPACITY_GRAMS) throw new Error("The bag exceeds 5,500 g.");
  return { catalogue, placements, grams };
}
export function syncTreasures(state, instances, journey) {
  const inventory = instances.filter(item => item.owner === journey && !item.consumed)
    .map(({ id, placement, reward }) => ({ id, placement: structuredClone(placement),
      ...(reward ? { reward: structuredClone(reward) } : {}) }));
  const equipped = state.treasures?.equipped;
  const uiEquipped = state.treasures?.uiEquipped;
  const iconEquipped = state.treasures?.iconEquipped;
  const result = { ...state, treasures: { version: 1, inventory,
    equipped: inventory.some(item => item.id === equipped) ? equipped : null,
    uiEquipped: inventory.some(item => item.id === uiEquipped) ? uiEquipped : null,
    iconEquipped: inventory.some(item => item.id === iconEquipped) ? iconEquipped : null } };
  for (const slot of ["weapon", "jewel"]) {
    const id = state.treasures?.[`${slot}Equipped`];
    result.treasures[`${slot}Equipped`] = inventory.some(item => item.id === id) ? id : null;
  }
  return result;
}
export function rewardPlace(state, map) {
  const cell = loreCell(map, state.col, state.row);
  if (!cell || cell.unavailable) return null;
  return cell.settlements?.find(place => place.name)?.name ??
    cell.sites?.find(site => site.name && /^(node|way|relation)\/\d+$/.test(site.osmId))?.name ??
    (["building", "church", "station", "place"].includes(cell.terrain) ? cell.terrain : null);
}
function collect(state, instance, journey) {
  const bag = treasureBag(state), item = treasureItem(instance.id);
  if (bag.grams + item.grams > CAPACITY_GRAMS) throw new Error("The bag exceeds 5,500 g.");
  if ((state.treasures?.inventory.length ?? 0) >= 256) throw new Error("Treasure inventory capacity reached.");
  instance.placement = firstPlacement(bag.placements, item, [...bag.catalogue, item]);
  instance.owner = journey;
}
export function awardTreasure(state, instances, journey, session, reward) {
  const id = treasureId(session.townId, session.seed, !!reward);
  if (instances.some(item => treasureItem(item.id).townId === session.townId)) return { state, outcome: "taken", id };
  const instance = { id, owner: null, placement: null, col: state.col, row: state.row,
    place: session.town, firstClaimant: journey, ...(reward ? { reward } : {}) };
  const bag = treasureBag(state), item = treasureItem(id);
  const space = bag.grams + item.grams <= CAPACITY_GRAMS && (state.treasures?.inventory.length ?? 0) < 256;
  const placement = space ? availablePlacement(bag.placements, item, bag.catalogue) : null;
  if (placement) Object.assign(instance, { owner: journey, placement });
  instances.push(instance);
  return { state: syncTreasures(state, instances, journey), outcome: placement ? "collected" : "left", id };
}
export function treasureAction(state, instances, journey, map, action, artifacts = []) {
  if (state.ended) throw new Error("This journey has ended. Its treasures return to the last settlement.");
  const instance = instances.find(item => item.id === action.id);
  if (!instance || instance.consumed) throw new Error("This treasure is unavailable.");
  const item = treasureItem(instance.id, instance.reward);
  if (action.type === "treasure-pickup") {
    if (instance.owner !== null || instance.col !== state.col || instance.row !== state.row) {
      throw new Error("Reach the unclaimed treasure before collecting it.");
    }
    collect(state, instance, journey);
  } else {
    if (instance.owner !== journey) throw new Error("You do not carry this treasure.");
    if (action.type === "treasure-drop") {
      const place = rewardPlace(state, map);
      if (!place) throw new Error("Leave treasure at a mapped settlement or place.");
      Object.assign(instance, { owner: null, placement: null, col: state.col, row: state.row, place });
    } else if (action.type === "treasure-equip") {
      if (item.kind !== "cosmetic") throw new Error("This object supplies no map appearance.");
      state = { ...state, treasures: { ...state.treasures,
        equipped: state.treasures.equipped === instance.id ? null : instance.id } };
    } else if (action.type === "treasure-equip-ui") {
      if (item.kind !== "cosmetic") throw new Error("This object supplies no UI skin.");
      state = { ...state, treasures: { ...state.treasures,
        uiEquipped: state.treasures.uiEquipped === instance.id ? null : instance.id } };
    } else if (action.type === "treasure-equip-icon") {
      if (!["cosmetic", "icon"].includes(item.kind)) throw new Error("This object supplies no player icon.");
      state = { ...state, treasures: { ...state.treasures,
        iconEquipped: state.treasures.iconEquipped === instance.id ? null : instance.id } };
    } else if (action.type === "treasure-equip-gear") {
      if (!["weapon", "jewellery"].includes(item.kind)) throw new Error("This object cannot be equipped.");
      const field = item.kind === "weapon" ? "weaponEquipped" : "jewelEquipped";
      state = { ...state, treasures: { ...state.treasures,
        [field]: state.treasures[field] === item.id ? null : item.id } };
    } else if (action.type === "treasure-unlock") {
      if (item.kind !== "tool" || item.effect.id !== "unlock-cache") throw new Error("Carry a lockpick to open this cache.");
      Object.assign(instance, { consumed: true, owner: null, placement: null });
    } else if (action.type === "treasure-use") {
      if (item.kind === "money") {
        if (!Number.isSafeInteger(state.walletCents) || state.walletCents + item.cents > 1_000_000_000) {
          throw new Error("This purse cannot receive more money.");
        }
        state = { ...state, walletCents: state.walletCents + item.cents };
      } else if (item.kind === "clue") {
        const candidates = artifacts.filter(artifact => artifact.owner === null &&
          !state.discovery?.entries.some(entry => entry.targetId === artifact.id &&
            entry.targetRevision === String(artifact.generation) && entry.kind === "location" &&
            ["town", "marker", "local"].includes(entry.precision)))
          .sort((a, b) => a.id.localeCompare(b.id));
        if (!candidates.length) throw new Error("No new artifact location is available. Keep this chart for later.");
        const target = candidates[item.seed % candidates.length];
        state = learnDiscovery(state, [{ targetType: "artifact", targetId: target.id,
          targetRevision: String(target.generation), evidenceKey: "location", kind: "location", precision: "town",
          facts: { artifact: target.id, region: target.region ?? map.name, place: target.town },
          source: "treasure-chart", observedMinutes: state.elapsedMinutes, channels: ["notebook"],
          availability: "current", contentVersion: "template-v1" }]);
      } else throw new Error("This object has no direct use.");
      Object.assign(instance, { consumed: true, owner: null, placement: null });
    } else if (action.type === "treasure-pack") {
      const placement = { id: instance.id, x: action.x, y: action.y, rotated: action.rotated };
      const bag = treasureBag(state);
      if (!fits(bag.placements, treasureItem(instance.id), placement, bag.catalogue)) {
        throw new Error("Inventory overlaps or exceeds the bag.");
      }
      instance.placement = placement;
    } else throw new Error("Unknown treasure action.");
  }
  return syncTreasures(state, instances, journey);
}
