import { estimatedTemperature, altitudeTemperatureOffset } from "./sky.mjs";
import { spendExtraEnergy } from "./health.mjs";
import { journeyEquipmentModifiers } from "./equipment.mjs";

export function temperatureModifiers(celsius) {
  if (!Number.isFinite(celsius)) throw new Error("Invalid exposure temperature.");
  return {
    extraCaloriesFactor: Math.min(1, Math.max(0, 10 - celsius) * 0.025),
    fatiguePerHour: Math.min(10, Math.max(0, celsius - 30) * 0.4),
  };
}

export function exposureTemperature(date, info) {
  if (!info.weather) return null;
  const month = info.weather.months[date.getUTCMonth()];
  const offset = Number.isFinite(info.elevationMeters) && Number.isFinite(info.weather.elevationMeters)
    ? altitudeTemperatureOffset(info.elevationMeters, info.weather.elevationMeters) : 0;
  return estimatedTemperature(date, info.latitude, info.longitude, month.minC + offset, month.maxC + offset);
}

export function precipitationModifiers(condition) {
  return condition === "rain" ? { fatiguePerHour: 2, speedFactor: 0.85 }
    : condition === "storm" ? { fatiguePerHour: 4, speedFactor: 0.75 }
    : { fatiguePerHour: 0, speedFactor: 1 };
}

export function weatherWalkingFactor(state, info) {
  if (!info?.weather) return 1;
  const date = new Date(state.startedAt + state.elapsedMinutes * 60_000);
  const speed = precipitationModifiers(info.weather.months[date.getUTCMonth()].condition).speedFactor;
  return 1 - (1 - speed) * journeyEquipmentModifiers(state).rainExposureMultiplier;
}

export function applyWeatherExposure(previous, next, info) {
  if (!info.weather) return next;
  const minutes = next.elapsedMinutes - previous.elapsedMinutes;
  if (minutes <= 0) return next;
  let calorieMinutes = 0, fatigue = 0;
  for (let offset = 0; offset < minutes; offset += 10) {
    const duration = Math.min(10, minutes - offset);
    const date = new Date(previous.startedAt + (previous.elapsedMinutes + offset + duration / 2) * 60_000);
    const effects = temperatureModifiers(exposureTemperature(date, info));
    const precipitation = precipitationModifiers(info.weather.months[date.getUTCMonth()].condition);
    calorieMinutes += effects.extraCaloriesFactor * duration;
    fatigue += (effects.fatiguePerHour + precipitation.fatiguePerHour *
      journeyEquipmentModifiers(previous).rainExposureMultiplier) * duration / 60;
  }
  const extraKcal = Math.max(0, next.energyKcal - previous.energyKcal) * calorieMinutes / minutes;
  return { ...spendExtraEnergy(next, extraKcal),
    fatigue: Math.min(100, next.fatigue + fatigue) };
}
