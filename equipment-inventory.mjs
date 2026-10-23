export const BAG = Object.freeze({ columns: 6, rows: 4 });

export function dimensions(item, rotated = false) {
  const [width, height] = item.footprint;
  return rotated ? { width: height, height: width } : { width, height };
}

export function fits(placements, item, candidate, catalogue) {
  const { x, y, rotated } = candidate;
  if (!Number.isInteger(x) || !Number.isInteger(y) || typeof rotated !== "boolean") return false;
  const { width, height } = dimensions(item, rotated);
  if (x < 0 || y < 0 || x + width > BAG.columns || y + height > BAG.rows) return false;
  return placements.filter(p => p.id !== item.id).every(p => {
    const other = catalogue.find(entry => entry.id === p.id);
    if (!other) throw new Error("Unknown inventory item.");
    const size = dimensions(other, p.rotated);
    return x + width <= p.x || p.x + size.width <= x ||
      y + height <= p.y || p.y + size.height <= y;
  });
}

export function firstPlacement(placements, item, catalogue) {
  for (const rotated of [false, true]) {
    for (let y = 0; y < BAG.rows; y++) for (let x = 0; x < BAG.columns; x++) {
      const candidate = { id: item.id, x, y, rotated };
      if (fits(placements, item, candidate, catalogue)) return candidate;
    }
  }
  throw new Error("No inventory space. Rearrange your bag first.");
}

export function restorePlacements(items, placements, catalogue) {
  const packed = items.filter(owned => !catalogue.find(item => item.id === owned.id).slot);
  if (placements === undefined) {
    const result = [];
    for (const owned of packed) result.push(firstPlacement(result,
      catalogue.find(item => item.id === owned.id), catalogue));
    return result;
  }
  if (!Array.isArray(placements) || placements.length !== packed.length) throw new Error("Invalid inventory layout.");
  const seen = new Set();
  for (const p of placements) {
    if (!p || Object.keys(p).sort().join() !== "id,rotated,x,y" ||
        seen.has(p.id) || !packed.some(item => item.id === p.id)) throw new Error("Invalid inventory placement.");
    seen.add(p.id);
    if (!fits(placements, catalogue.find(item => item.id === p.id), p, catalogue)) {
      throw new Error("Inventory overlaps or exceeds the bag.");
    }
  }
  return placements.map(p => ({ ...p }));
}
