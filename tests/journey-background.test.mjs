import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initialJourney, journeyDate, restJourney } from "../travel.mjs";
import { skyState } from "../sky.mjs";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(channel => {
    const c = parseInt(channel, 16) / 255;
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  });
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}

test("all four journey palettes have readable text on the window and map surfaces", () => {
  const backgrounds = new Set();
  for (const phase of ["night", "dawn", "day", "dusk"]) {
    const block = css.match(new RegExp(`body\\.is-travelling\\[data-journey-phase="${phase}"\\] \\{([^}]+)\\}`))[1];
    backgrounds.add(block.match(/--journey-background: (#[a-f0-9]{6});/)[1]);
    for (const name of ["background", "glow", "surface"]) {
      const color = block.match(new RegExp(`--journey-${name}: (#[a-f0-9]{6});`))[1];
      for (const foreground of ["#e5e7d9", "#96a18f", "#e6b767"]) {
        const contrast = (luminance(foreground) + .05) / (luminance(color) + .05);
        assert.ok(contrast >= 4.5, `${phase} ${name}: ${foreground} contrast ${contrast}`);
      }
    }
  }
  assert.equal(backgrounds.size, 4);
});

test("only active journeys set the background; exit clears it and weather remains separate", () => {
  const ui = readFileSync(new URL("../travel-ui.mjs", import.meta.url), "utf8");
  assert.match(ui, /if \(active\) document\.body\.dataset\.journeyPhase = cycle\.background/);
  assert.match(ui, /if \(!active\) delete document\.body\.dataset\.journeyPhase/);
  assert.match(css, /body\.is-travelling\[data-journey-phase\] :is\(\.map-card, \.legend-card\)/);
  assert.match(css, /journey-atmosphere\[data-temperature="cold"\]/);
});

test("the background follows action time, never idle wall time", () => {
  const noon = skyState(new Date("2026-10-19T12:00:00Z"), 44.54, 2.3);
  const journey = initialJourney(0, 0, noon.sunset + 30 * 60_000);
  const before = structuredClone(journey);
  assert.equal(skyState(journeyDate(journey), 44.54, 2.3).background, "dusk");
  assert.equal(skyState(journeyDate(restJourney(journey)), 44.54, 2.3).background, "night");
  assert.deepEqual(journey, before);
});
