const DAY_MS = 86_400_000;
const RAD = Math.PI / 180;

function solarEvents(day, latitude, longitude) {
  const year = new Date(day).getUTCFullYear();
  const dayOfYear = (day - Date.UTC(year, 0, 1)) / DAY_MS + 1;
  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS;
  const angle = 2 * Math.PI * (dayOfYear - 1) / daysInYear;
  // NOAA's fractional-year approximation: equation of time and solar declination.
  const equation = 229.18 * (0.000075 + 0.001868 * Math.cos(angle) -
    0.032077 * Math.sin(angle) - 0.014615 * Math.cos(2 * angle) -
    0.040849 * Math.sin(2 * angle));
  const declination = 0.006918 - 0.399912 * Math.cos(angle) +
    0.070257 * Math.sin(angle) - 0.006758 * Math.cos(2 * angle) +
    0.000907 * Math.sin(2 * angle) - 0.002697 * Math.cos(3 * angle) +
    0.00148 * Math.sin(3 * angle);
  const cosine = (Math.cos(90.833 * RAD) - Math.sin(latitude * RAD) * Math.sin(declination)) /
    (Math.cos(latitude * RAD) * Math.cos(declination));
  const noon = day + (720 - 4 * longitude - equation) * 60_000;
  if (cosine < -1) return { sunrise: null, sunset: null, polar: "day", noon };
  if (cosine > 1) return { sunrise: null, sunset: null, polar: "night", noon };
  const halfDay = Math.acos(cosine) / RAD * 4 * 60_000;
  return { sunrise: Math.round(noon - halfDay), sunset: Math.round(noon + halfDay), polar: null, noon };
}

export function skyState(date, latitude, longitude) {
  const now = date.getTime();
  if (!Number.isFinite(now) || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error("Invalid sky date or coordinates.");
  }

  const localDay = new Date(now + longitude * 240_000);
  const day = Date.UTC(localDay.getUTCFullYear(), localDay.getUTCMonth(), localDay.getUTCDate());
  const events = solarEvents(day, latitude, longitude);
  let phase, progress;
  if (events.polar) {
    phase = events.polar;
    progress = ((now - events.noon + DAY_MS / 2) % DAY_MS + DAY_MS) % DAY_MS / DAY_MS;
  } else if (now >= events.sunrise && now < events.sunset) {
    phase = "day";
    progress = (now - events.sunrise) / (events.sunset - events.sunrise);
  } else {
    phase = "night";
    const start = now < events.sunrise
      ? solarEvents(day - DAY_MS, latitude, longitude).sunset : events.sunset;
    const end = now < events.sunrise
      ? events.sunrise : solarEvents(day + DAY_MS, latitude, longitude).sunrise;
    // At the edge of polar seasons a neighboring day may have no rise or set.
    progress = start !== null && end !== null
      ? (now - start) / (end - start)
      : ((now - events.noon + DAY_MS / 2) % DAY_MS + DAY_MS) % DAY_MS / DAY_MS;
  }
  progress = Math.max(0, Math.min(1, progress));
  const angle = Math.PI * (1 - progress);
  return { ...events, phase, progress,
    x: 100 + 76 * Math.cos(angle), y: 100 - 76 * Math.sin(angle) };
}

export function altitudeTemperatureOffset(playerMeters, referenceMeters) {
  if (![playerMeters, referenceMeters].every(value =>
    Number.isFinite(value) && value >= -500 && value <= 9000)) {
    throw new Error("Invalid temperature elevation.");
  }
  return (referenceMeters - playerMeters) * 0.0065;
}

export function estimatedTemperature(date, latitude, longitude, minC, maxC) {
  if (!Number.isFinite(minC) || !Number.isFinite(maxC) || minC > maxC) {
    throw new Error("Invalid temperature range.");
  }
  const cycle = skyState(date, latitude, longitude);
  // A repeating solar-day curve, not measured hourly weather.
  const lowAt = cycle.sunrise ?? cycle.noon - DAY_MS / 4;
  const warmingDuration = Math.max(3_600_000,
    Math.min(DAY_MS - 3_600_000, cycle.noon + 3 * 3_600_000 - lowAt));
  const elapsed = ((date.getTime() - lowAt) % DAY_MS + DAY_MS) % DAY_MS;
  const fraction = elapsed <= warmingDuration
    ? (1 - Math.cos(Math.PI * elapsed / warmingDuration)) / 2
    : (1 + Math.cos(Math.PI * (elapsed - warmingDuration) /
      (DAY_MS - warmingDuration))) / 2;
  return minC + (maxC - minC) * fraction;
}
