import test from "node:test";
import assert from "node:assert/strict";
import { weatherPanelState, updateWeatherPanel } from "../weather-panel.mjs";
import { readFileSync } from "node:fs";

test("one compact panel owns the clock, background sky and keyboard-accessible weather tooltip", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const panel = html.slice(html.indexOf('id="journey-atmosphere"'), html.indexOf('<section class="player-needs"'));
  for (const id of ["travel-clock", "weather-display", "travel-sky", "sky-marker", "weather-effects"]) {
    assert.ok(panel.includes(`id="${id}"`));
    assert.equal(html.split(`id="${id}"`).length - 1, 1);
  }
  assert.match(panel, /id="weather-display" tabindex="0" aria-describedby="weather-effects"/);
  assert.match(panel, /id="weather-effects" role="tooltip"/);
  assert.doesNotMatch(html, /class="travel-atmosphere"/);
});

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
