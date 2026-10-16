import assert from "node:assert/strict";
import test from "node:test";
import { estimatedTemperature, skyState, altitudeTemperatureOffset } from "../sky.mjs";
import { initialJourney, journeyDate, restJourney } from "../travel.mjs";

test("estimated temperature reaches historical low at sunrise and high in solar afternoon", () => {
  const cycle = skyState(new Date("2026-10-17T12:00:00Z"), 44.54, 2.3);
  const temperature = time => estimatedTemperature(new Date(time), 44.54, 2.3, 8, 20);
  assert.ok(Math.abs(temperature(cycle.sunrise) - 8) < 1e-6);
  assert.ok(Math.abs(temperature(cycle.noon + 3 * 3_600_000) - 20) < 1e-6);
  assert.ok(temperature(cycle.sunrise + 2 * 3_600_000) >
    temperature(cycle.sunrise + 3_600_000));
  assert.ok(temperature(cycle.sunset + 2 * 3_600_000) < temperature(cycle.sunset));
});

test("Tahiti uses local solar time rather than UTC hour", () => {
  const coordinates = [-17.55, -149.56];
  const cycle = skyState(new Date("2026-10-17T00:00:00Z"), ...coordinates);
  assert.ok(Math.abs(estimatedTemperature(new Date(cycle.sunrise), ...coordinates, 20, 30) - 20) < 1e-6);
  assert.ok(Math.abs(estimatedTemperature(new Date(cycle.noon + 10_800_000),
    ...coordinates, 20, 30) - 30) < 1e-6);
});

test("temperatures stay bounded through midnight, seasons and polar periods", () => {
  for (const latitude of [-89, -17.55, 44.54, 89]) {
    for (const longitude of [-179, -149.56, 2.3, 179]) {
      for (const month of [0, 5, 9, 11]) {
        for (let hour = 0; hour < 48; hour++) {
          const temperature = estimatedTemperature(new Date(Date.UTC(2026, month, 17, hour)),
            latitude, longitude, -10, 10);
          assert.ok(temperature >= -10 && temperature <= 10);
        }
      }
    }
  }
  const before = estimatedTemperature(new Date("2026-10-17T23:59:59Z"), 44.54, 2.3, 8, 20);
  const after = estimatedTemperature(new Date("2026-10-18T00:00:00Z"), 44.54, 2.3, 8, 20);
  assert.ok(Math.abs(after - before) < 0.1);
});

test("rest changes estimated temperature while unchanged simulated time stays deterministic", () => {
  const state = initialJourney(0, 0, Date.parse("2026-10-17T08:00:00Z"));
  const at = state => estimatedTemperature(journeyDate(state), 44.54, 2.3, 8, 20);
  assert.equal(at(state), at(state));
  assert.ok(at(restJourney(state)) > at(state));
  assert.equal(estimatedTemperature(journeyDate(state), 44.54, 2.3, 12, 12), 12);
});

test("invalid historical temperature ranges fail explicitly", () => {
  for (const range of [[20, 10], [NaN, 10], [0, Infinity]]) {
    assert.throws(() => estimatedTemperature(new Date(), 44.54, 2.3, ...range), /Invalid temperature/);
  }
});

test("altitude correction uses reference elevation rather than double-counting altitude", () => {
  assert.equal(altitudeTemperatureOffset(1000, 1000), 0);
  assert.equal(altitudeTemperatureOffset(2000, 1000), -6.5);
  assert.equal(altitudeTemperatureOffset(0, 1000), 6.5);
  for (const pair of [[NaN, 0], [100, undefined], [10000, 0]]) {
    assert.throws(() => altitudeTemperatureOffset(...pair), /Invalid temperature elevation/);
  }
});
