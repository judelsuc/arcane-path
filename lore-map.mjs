export function loreCell(map, col, row) {
  if (!Number.isSafeInteger(col) || !Number.isSafeInteger(row) ||
      Math.abs(Math.floor(col / 8)) > 1000 || Math.abs(Math.floor(row / 8)) > 1000) return null;
  if (col >= 0 && col < map.width && row >= 0 && row < map.height) return map.rows[row]?.[col] ?? null;
  const chunk = map.loreChunks?.[`${Math.floor(col / 8)},${Math.floor(row / 8)}`];
  return chunk?.rows[((row % 8) + 8) % 8]?.[((col % 8) + 8) % 8] ?? null;
}

export function loreCells(map) {
  const cells = [];
  for (let row = 0; row < map.height; row++) for (let col = 0; col < map.width; col++) {
    cells.push({ col, row, cell: map.rows[row][col] });
  }
  for (const [key, chunk] of Object.entries(map.loreChunks ?? {})) {
    const [x, y] = key.split(",").map(Number);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const c = x * 8 + col, r = y * 8 + row;
      if (c < 0 || c >= map.width || r < 0 || r >= map.height) cells.push({ col: c, row: r, cell: chunk.rows[row][col] });
    }
  }
  return cells;
}

export function loreViewport(state, map) {
  const markers = state.discovery.entries.filter(entry => entry.targetType === "artifact" &&
    entry.kind === "location" && entry.precision === "local" && entry.availability === "current");
  const rows = [];
  for (let row = state.row - 8; row <= state.row + 8; row++) {
    let line = "";
    for (let col = state.col - 8; col <= state.col + 8; col++) {
      const cell = loreCell(map, col, row);
      line += col === state.col && row === state.row ? "@" :
        markers.some(entry => entry.facts.col === col && entry.facts.row === row) ? "*" :
          !cell || cell.unavailable ? "?" : cell.terrain === "water" ? "~" : cell.terrain === "place" ? "o" :
            ["road", "major_road"].includes(cell.terrain) ? "#" : ".";
    }
    rows.push(line);
  }
  return { originCol: state.col - 8, originRow: state.row - 8, rows };
}
