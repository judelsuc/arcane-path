import test from "node:test";
import assert from "node:assert/strict";
import { weatherPanelState, updateWeatherPanel } from "../weather-panel.mjs";

test("weather panel colors follow actual temperature at every boundary", () => {
  for (const [temperature, expected] of [[-20, "freezing"], [0, "freezing"], [0.1, "cold"],
    [9.9, "cold"], [10, "mild"], [25, "mild"], [25.1, "warm"], [30, "warm"], [30.1, "hot"]]) {
    assert.equal(weatherPanelState(temperature, "clear").temperature, expected);
  }
  assert.throws(() => weatherPanelState(NaN, "rain"), /temperature/);
});

test("rain and storms show drops; dry, snow and unavailable weather clear them", () => {
  const panel = { dataset: {} };
  for (const condition of ["rain", "storm"]) {
    updateWeatherPanel(panel, 8, condition);
    assert.deepEqual(panel.dataset, { temperature: "cold", raining: "true" });
  }
  for (const condition of ["clear", "cloudy", "fog", "snow"]) {
    updateWeatherPanel(panel, 20, condition);
    assert.deepEqual(panel.dataset, { temperature: "mild", raining: "false" });
  }
  updateWeatherPanel(panel, null, null);
  assert.deepEqual(panel.dataset, { temperature: "unknown", raining: "false" });
});
