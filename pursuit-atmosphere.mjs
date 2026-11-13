import { skyState, estimatedTemperature } from "./sky.mjs";
import { PLAYER } from "./minigames/legend-platformer.mjs";

const PHASES = ["day", "dawn", "dusk", "night", "unknown"];
const PRECIPITATION = ["none", "rain", "storm", "snow", "unknown"];
const FOG = ["none", "light", "dense"];

export function createPursuitAtmosphere(state, cell, info, seed) {
  const date = new Date(state.startedAt + state.elapsedMinutes * 60_000);
  if (!Number.isFinite(date.getTime()) || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error("Invalid escape atmosphere context.");
  }
  const located = info?.latitude !== undefined && info?.longitude !== undefined;
  const phase = located ? skyState(date, info.latitude, info.longitude).background : "unknown";
  const month = info?.weather?.months?.[date.getUTCMonth()];
  if (info?.weather && !month) throw new Error("Missing escape weather month.");
  if (month && !["clear", "cloudy", "fog", "rain", "snow", "storm"].includes(month.condition)) {
    throw new Error("Invalid escape weather condition.");
  }
  const precipitation = !month ? "unknown" : ["rain", "storm", "snow"].includes(month.condition) ? month.condition : "none";
  const cool = located && month ? estimatedTemperature(date, info.latitude, info.longitude,
    month.minC, month.maxC) < 12 : false;
  const wet = ["rain", "storm"].includes(precipitation) || month?.condition === "cloudy";
  let fogSeed = seed;
  for (const char of `${date.toISOString().slice(0, 10)}:${state.col}:${state.row}:${cell.terrain}`) {
    fogSeed = Math.imul(fogSeed ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  const roll = fogSeed % 100;
  const mistTime = ["dawn", "night"].includes(phase);
  const fog = month?.condition === "fog" ? mistTime && roll < 30 ? "dense" : "light"
    : !month || !located ? "none" : mistTime && cool && wet && roll < 30 ? "dense"
    : cool && (mistTime || wet) && roll < 60 ? "light" : "none";
  return { version: 1, phase, precipitation, fog, seed: fogSeed };
}

export function validatePursuitAtmosphere(atmosphere) {
  if (!atmosphere || Object.keys(atmosphere).sort().join() !== "fog,phase,precipitation,seed,version" ||
      atmosphere.version !== 1 || !PHASES.includes(atmosphere.phase) ||
      !PRECIPITATION.includes(atmosphere.precipitation) || !FOG.includes(atmosphere.fog) ||
      !Number.isSafeInteger(atmosphere.seed) || atmosphere.seed < 0 || atmosphere.seed > 0xffffffff) {
    throw new Error("Invalid saved escape atmosphere.");
  }
}

export function pursuitVisibility(atmosphere, condition, speed) {
  validatePursuitAtmosphere(atmosphere);
  const { health, fatigue, awakeHours, level } = condition;
  if (![health, fatigue, awakeHours, speed].every(Number.isFinite) || speed <= 0 ||
      health < 0 || health > 100 || fatigue < 0 || fatigue > 100 || awakeHours < 0 ||
      !Number.isInteger(level) || level < 1 || level > 10) {
    throw new Error("Invalid escape visibility condition.");
  }
  const strain = ((100 - health) + fatigue + Math.min(100, awakeHours / 24 * 100)) / 300;
  const impaired = strain > 0.5 || atmosphere.phase !== "day" && atmosphere.phase !== "unknown" ||
    atmosphere.fog !== "none" || ["rain", "storm", "snow"].includes(atmosphere.precipitation);
  const warningSeconds = impaired ? Math.max(1.2, 1.65 - strain * 0.45) : 1.65;
  // Expert carts can approach the runner at another 60 px/s.
  const approachSpeed = speed + (level >= 8 ? 60 : 0);
  return {
    warningSeconds, clearDistancePx: PLAYER.width + Math.ceil(approachSpeed * warningSeconds),
    nearOpacity: impaired ? Math.min(0.20, 0.08 + strain * 0.12) : strain * 0.08,
    darkness: atmosphere.phase === "night" ? 0.72 : ["dawn", "dusk"].includes(atmosphere.phase) ? 0.32 : 0,
    fogOpacity: atmosphere.fog === "dense" ? 0.84 : atmosphere.fog === "light" ? 0.55 : 0,
  };
}

export function drawPursuitAtmosphere(ctx, atmosphere, condition, speed, tick, reducedMotion, layer) {
  const visibility = pursuitVisibility(atmosphere, condition, speed);
  const frame = reducedMotion ? 0 : tick;
  const rect = (color, opacity, x, y, width, height) => {
    ctx.fillStyle = `rgba(${color},${opacity})`;
    ctx.fillRect(Math.round(x), Math.round(y), width, height);
  };
  if (layer === "background") {
    if (visibility.darkness) rect("8,17,36", visibility.darkness, 0, 0, 640, 320);
    if (visibility.fogOpacity) {
      rect("162,182,185", visibility.fogOpacity * 0.55, 0, 0, 640, 270);
      for (let i = 0; i < 4; i++) {
        const x = ((atmosphere.seed % 640 + i * 173 + frame * 0.3) % 880) - 240;
        rect("190,204,204", 0.08, x, 118 + i * 30, 240, 13);
      }
    }
    return;
  }
  if (layer !== "foreground") throw new Error("Invalid escape atmosphere layer.");
  // Keep the full obstacle height and at least 1.2 s of approach within the capped-opacity zone.
  const clearEnd = 100 + visibility.clearDistancePx;
  for (let x = 0; x < 640; x += 8) {
    const fade = Math.max(0, Math.min(1, (x - clearEnd) / 96));
    const dark = visibility.nearOpacity * (visibility.darkness ? 1 : 0) +
      (visibility.darkness - visibility.nearOpacity) * (visibility.darkness ? fade : 0);
    if (dark) rect("8,17,36", dark, x, 0, 8, 320);
    const fog = visibility.fogOpacity * fade;
    if (fog) rect("178,194,194", fog, x, 0, 8, 320);
    if (visibility.nearOpacity && !visibility.darkness) {
      rect("55,70,78", visibility.nearOpacity, x, 0, 8, 320);
    }
  }
  const rain = ["rain", "storm"].includes(atmosphere.precipitation);
  if (rain) {
    const drops = atmosphere.precipitation === "storm" ? 64 : 40;
    for (let i = 0; i < drops; i++) {
      const x = ((atmosphere.seed % 700 + i * 137 - frame * 3) % 700 + 700) % 700 - 30;
      const y = (i * 97 + frame * 9) % 360 - 30;
      rect("188,214,222", 0.12, x, y, 1, 8);
      rect("188,214,222", 0.12, x - 1, y + 8, 1, 5);
      if ((Math.floor(frame) + i) % 30 < 4) rect("188,214,222", 0.12, x, 269, 4, 1);
    }
  }
  if (atmosphere.precipitation === "snow") {
    for (let i = 0; i < 32; i++) {
      rect("220,232,230", 0.16, (atmosphere.seed % 640 + i * 137 + frame) % 640,
        (i * 97 + frame * 2) % 320, 2, 2);
    }
  }
}
