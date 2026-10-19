const EARTH_RADIUS_METERS = 6_371_008.8;

export function cellInfo(map, row, col) {
  if (!Number.isInteger(row) || !Number.isInteger(col) ||
      row < 0 || col < 0 || row >= map.height || col >= map.width) {
    throw new Error("Cell position is outside the map.");
  }
  const bounds = map.bounds;
  const centerLatitude = map.projectionLatitude ?? (bounds.minLatitude + bounds.maxLatitude) / 2;
  const latitudeStep = map.cellSizeMeters / EARTH_RADIUS_METERS * 180 / Math.PI;
  const longitudeStep = latitudeStep / Math.cos(centerLatitude * Math.PI / 180);
  const north = bounds.maxLatitude - row * latitudeStep;
  const south = Math.max(bounds.minLatitude, north - latitudeStep);
  const west = bounds.minLongitude + col * longitudeStep;
  const east = Math.min(bounds.maxLongitude, west + longitudeStep);
  return {
    terrain: map.rows[row][col].terrain,
    countryCodes: map.rows[row][col].countryCodes ?? [],
    waterCoveragePercent: map.rows[row][col].waterCoveragePercent ?? 0,
    buildingCoveragePercent: map.rows[row][col].buildingCoveragePercent ?? 0,
    waterways: map.rows[row][col].waterways ?? [],
    names: map.rows[row][col].names ?? [],
    pois: map.rows[row][col].pois ?? [],
    contentSources: map.rows[row][col].contentSources ?? [],
    bounds: { west, south, east, north },
    row: row + 1,
    col: col + 1,
    latitude: (south + north) / 2,
    longitude: (west + east) / 2,
    meters: map.cellSizeMeters,
  };
}
