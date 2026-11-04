export function createBike(grid) {
  if (!Number.isInteger(grid) || grid < 3 || grid > 5) throw new Error("Invalid bike grid.");
  return { grid, x: 0, y: 0, heading: 90, distance: 0 };
}

export function rideBike(bike, horizontal, vertical, seconds) {
  if (![horizontal, vertical].every(value => [-1, 0, 1].includes(value)) ||
      !Number.isFinite(seconds) || seconds < 0) throw new Error("Invalid bike movement.");
  const length = Math.hypot(horizontal, vertical);
  if (!length || !seconds) return bike;
  const step = 1.6 * seconds / length;
  const x = Math.max(0, Math.min(bike.grid - 1, bike.x + horizontal * step));
  const y = Math.max(0, Math.min(bike.grid - 1, bike.y + vertical * step));
  return { ...bike, x, y, heading: Math.atan2(vertical, horizontal) * 180 / Math.PI + 90,
    distance: bike.distance + Math.abs(x - bike.x) + Math.abs(y - bike.y) };
}

export function bikeHouse(bike) {
  const col = Math.round(bike.x), row = Math.round(bike.y);
  return Math.hypot(bike.x - col, bike.y - row) <= 0.36 ? row * bike.grid + col : null;
}

export function bikeRouteDistance(bike, completed) {
  return bike.distance + (completed ? bike.x + bike.y : 0);
}
