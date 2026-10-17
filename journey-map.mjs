export const MAX_JOURNEY_POINTS = 8192;
const TERRAIN = {
  plain: ["#ddd5ac", "."], water: ["#8ebbc4", "~"], road: ["#c9b58f", "+"],
  major_road: ["#b8a07c", "+"], rail: ["#aaa49d", "="], cable: ["#bca68f", "-"],
  cable_station: ["#bca68f", "T"], mountain: ["#aca99a", "^"], hill: ["#b7b18d", "n"],
  forest: ["#8eab78", "♣"], grass: ["#bec594", '"'], field: ["#d9c28b", ":"],
  vineyard: ["#c2a2ac", "¥"], park: ["#a8bc87", ","], church: ["#cbbfa4", "†"],
  station: ["#b3aaa0", "≡"], place: ["#d2b79b", "○"], building: ["#c4b39e", "#"],
};

export function createJourneyTerrainLoader(region, chunks, fetcher = fetch) {
  const memo = new Map();
  return async view => {
    const all = [...view.points, ...view.stops];
    const minX = Math.floor(Math.min(...all.map(p => p.col)) / 8) - 1;
    const maxX = Math.floor(Math.max(...all.map(p => p.col)) / 8) + 1;
    const minY = Math.floor(Math.min(...all.map(p => p.row)) / 8) - 1;
    const maxY = Math.floor(Math.max(...all.map(p => p.row)) / 8) + 1;
    const width = maxX - minX + 1, height = maxY - minY + 1;
    const total = width * height, count = Math.min(256, total);
    const positions = new Map();
    const add = (x, y) => {
      if (Math.abs(x) <= 1000 && Math.abs(y) <= 1000) positions.set(`${x},${y}`, [x, y]);
    };
    for (let index = 0; index < count; index++) {
      const offset = count === 1 ? 0 : Math.floor(index * (total - 1) / (count - 1));
      add(minX + offset % width, minY + Math.floor(offset / width));
    }
    for (const stop of view.stops) add(Math.floor(stop.col / 8), Math.floor(stop.row / 8));
    for (const chunk of chunks.values()) {
      const { x, y } = chunk.chunk;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) add(x, y);
    }
    const requested = [...positions.values()];
    for (const [x, y] of requested) {
      const loaded = chunks.get(`${x},${y}`);
      if (loaded) memo.set(`${x},${y}`, loaded);
    }
    const missing = requested.filter(([x, y]) => !memo.has(`${x},${y}`));
    for (let offset = 0; offset < missing.length; offset += 9) {
      const batch = missing.slice(offset, offset + 9);
      const response = await fetcher(`/api/chunks-cached?${new URLSearchParams({
        region, positions: JSON.stringify(batch),
      })}`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Cached journey terrain: HTTP ${response.status}`);
      const data = await response.json();
      const allowed = new Set(batch.map(p => p.join(","))), seen = new Set();
      if (!Array.isArray(data.chunks) || data.chunks.length > batch.length) throw new Error("Invalid cached terrain response.");
      for (const chunk of data.chunks) {
        const key = `${chunk?.chunk?.x},${chunk?.chunk?.y}`;
        if (!allowed.has(key) || seen.has(key) || chunk.chunk.region !== region ||
            chunk.width !== 8 || chunk.height !== 8 || !Array.isArray(chunk.rows) ||
            chunk.rows.length !== 8 || chunk.rows.some(row => !Array.isArray(row) ||
              row.length !== 8 || row.some(cell => !cell || !Object.hasOwn(TERRAIN, cell.terrain)))) {
          throw new Error("Invalid cached terrain chunk.");
        }
        seen.add(key);
      }
      for (const chunk of data.chunks) memo.set(`${chunk.chunk.x},${chunk.chunk.y}`, chunk);
      for (const [x, y] of batch) if (!memo.has(`${x},${y}`)) memo.set(`${x},${y}`, null);
    }
    const cells = [];
    for (const [x, y] of requested) {
      const chunk = memo.get(`${x},${y}`);
      if (!chunk) continue;
      chunk.rows.forEach((row, r) => row.forEach((cell, col) => {
        if (!cell.unavailable) cells.push({ col: x * 8 + col, row: y * 8 + r, terrain: cell.terrain });
      }));
    }
    return { cells, sampled: total > count, missing: requested.some(([x, y]) => !memo.get(`${x},${y}`)) };
  };
}

const point = p => p && Number.isSafeInteger(p.col) && Number.isSafeInteger(p.row) &&
  p.col >= -8000 && p.col <= 8007 && p.row >= -8000 && p.row <= 8007;
const same = (a, b) => a.col === b.col && a.row === b.row;

export function validateJourneyMap(state) {
  const map = state.journeyMap;
  if (map === undefined) return;
  if (!map || map.version !== 1 || typeof map.partial !== "boolean" ||
      typeof map.simplified !== "boolean" || !Array.isArray(map.points) ||
      !map.points.length || map.points.length > MAX_JOURNEY_POINTS ||
      !map.points.every(point) || !same(map.points.at(-1), state)) {
    throw new Error("Invalid saved journey map.");
  }
}

export function recordJourneyPosition(state) {
  const position = { col: state.col, row: state.row };
  if (!point(position)) throw new Error("Invalid journey map position.");
  const old = state.journeyMap;
  if (!old) return { ...state, journeyMap: {
    version: 1, partial: state.distanceMeters > 0, simplified: false, points: [position],
  } };
  if (same(old.points.at(-1), position)) return state;
  let points = [...old.points, position], simplified = old.simplified;
  // Straight runs retain their exact geometry without storing every cell.
  if (points.length >= 3) {
    const [a, b, c] = points.slice(-3);
    const dx = b.col - a.col, dy = b.row - a.row;
    const ex = c.col - b.col, ey = c.row - b.row;
    if (dx * ey === dy * ex && dx * ex + dy * ey > 0) points.splice(-2, 1);
  }
  if (points.length > MAX_JOURNEY_POINTS) {
    points = points.filter((_, index) => index % 2 === 0 || index === points.length - 1);
    simplified = true;
  }
  return { ...state, journeyMap: { ...old, points, simplified } };
}

export function journeyMapView(state, cellSizeMeters = 250) {
  if (!(cellSizeMeters > 0) || !Number.isFinite(cellSizeMeters)) throw new Error("Invalid map scale.");
  const recorded = state.journeyMap;
  const points = recorded?.points ?? [{ col: state.col, row: state.row }];
  const stops = [];
  if (point(state.trail?.origin)) stops.push({
    col: state.trail.origin.col, row: state.trail.origin.row, kind: "start",
  });
  else if (!recorded?.partial && recorded) stops.push({ ...points[0], kind: "start" });
  for (const arrival of [...(state.trail?.arrivals ?? [])].sort((a, b) => a.elapsedMinutes - b.elapsedMinutes)) {
    const stage = state.trail.stages[arrival.stage];
    if (point(stage)) stops.push({ col: stage.col, row: stage.row, name: stage.name, kind: "town" });
  }
  stops.push({ col: state.col, row: state.row, kind: "current" });
  return { points: points.map(p => ({ col: p.col, row: p.row })), stops,
    partial: recorded?.partial ?? state.distanceMeters > 0, simplified: recorded?.simplified ?? false,
    cellSizeMeters };
}

export function journeyMapDescription(view, t) {
  return [t("journalMapNote"), ...(view.partial ? [t("journalMapPartial"), t("journalMapConnections")] : []),
    ...(view.simplified ? [t("journalMapSimplified")] : []),
    ...(view.terrain ? [t("journalMapCached"), ...(view.terrain.sampled || view.terrain.missing
      ? [t("journalMapTerrainGaps")] : [])] : [])].join(" ");
}

export function drawJourneyMap(canvas, view, t, progress = 1) {
  canvas.width = 1200;
  canvas.height = 800;
  const c = canvas.getContext("2d");
  if (!c) throw new Error(t("journalPdfCanvasError"));
  const all = [...view.points, ...view.stops];
  const minX = Math.min(...all.map(p => p.col)), maxX = Math.max(...all.map(p => p.col));
  const minY = Math.min(...all.map(p => p.row)), maxY = Math.max(...all.map(p => p.row));
  const scale = Math.min(1000 / Math.max(8, maxX - minX), 580 / Math.max(8, maxY - minY));
  const project = p => [600 + (p.col - (minX + maxX) / 2) * scale,
    400 + (p.row - (minY + maxY) / 2) * scale];
  c.fillStyle = "#eddfbb";
  c.fillRect(0, 0, 1200, 800);
  for (const cell of view.terrain?.cells ?? []) {
    const [x, y] = project(cell);
    if (x < 15 || y < 80 || x > 1185 || y > 690) continue;
    const [color, glyph] = TERRAIN[cell.terrain];
    c.fillStyle = color;
    c.fillRect(x - scale / 2, y - scale / 2, scale + 0.5, scale + 0.5);
    if (scale >= 12) {
      c.fillStyle = "#635c49";
      c.font = `${Math.min(24, scale * 0.65)}px monospace`;
      c.textAlign = "center";
      c.fillText(glyph, x, y + Math.min(8, scale / 4));
    }
  }
  c.strokeStyle = "#c9b78f";
  c.lineWidth = 1;
  c.setLineDash([]);
  for (let x = 40; x < 1200; x += 80) {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 800); c.stroke();
  }
  for (let y = 0; y < 800; y += 80) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(1200, y); c.stroke();
  }
  c.fillStyle = "#59472c";
  c.font = "bold 28px sans-serif";
  c.textAlign = "left";
  c.fillText(t("journalMapNorth"), 45, 55);
  c.font = "22px sans-serif";
  const km = 160 / scale * view.cellSizeMeters / 1000;
  c.fillText(`${km.toFixed(1)} km`, 45, 760);
  c.strokeStyle = "#59472c";
  c.beginPath(); c.moveTo(45, 725); c.lineTo(205, 725); c.stroke();
  if (view.partial && view.stops.length > 1) {
    c.strokeStyle = "#8b7048";
    c.lineWidth = 3;
    c.setLineDash([4, 9]);
    c.beginPath();
    c.moveTo(...project(view.stops[0]));
    for (const stop of view.stops.slice(1)) c.lineTo(...project(stop));
    c.stroke();
  }
  c.strokeStyle = "#ac3029";
  c.lineWidth = 5;
  c.setLineDash([14, 10]);
  c.beginPath();
  let remaining = Math.max(0, Math.min(1, progress)) * view.points.slice(1).reduce((sum, p, index) =>
    sum + Math.hypot(p.col - view.points[index].col, p.row - view.points[index].row), 0);
  c.moveTo(...project(view.points[0]));
  for (let i = 1; i < view.points.length; i++) {
    const a = view.points[i - 1], b = view.points[i];
    const distance = Math.hypot(b.col - a.col, b.row - a.row);
    const fraction = distance ? Math.min(1, remaining / distance) : 1;
    c.lineTo(...project({ col: a.col + (b.col - a.col) * fraction,
      row: a.row + (b.row - a.row) * fraction }));
    remaining -= distance;
    if (remaining <= 0) break;
  }
  c.stroke();
  c.setLineDash([]);
  view.stops.forEach((stop, index) => {
    const [x, y] = project(stop);
    c.fillStyle = stop.kind === "current" ? "#ac3029" : "#59472c";
    c.beginPath(); c.arc(x, y, stop.kind === "current" ? 12 : 8, 0, Math.PI * 2); c.fill();
    c.font = "bold 24px sans-serif";
    c.textAlign = "center";
    c.fillText(String(index + 1), x, y + (stop.kind === "current" ? 36 : -20));
  });
}

export async function journeyMapPhoto(view, t) {
  const canvas = document.createElement("canvas");
  drawJourneyMap(canvas, view, t);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error(t("journalPdfCanvasError"));
  return { blob, title: t("journalMapPage"), note: journeyMapDescription(view, t) + "\n" +
    view.stops.map((stop, index) => `${index + 1}. ${stop.name ?? t(`journalMap.${stop.kind}`)}`).join("\n") };
}
