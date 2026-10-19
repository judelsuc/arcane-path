import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("calendar and player status share an overview before the map and secondary actions", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const overview = html.slice(html.indexOf('id="travel-overview"'), html.indexOf('<section class="travel-panel"'));
  assert.match(overview, /aria-labelledby="travel-title" hidden/);
  assert.ok(overview.indexOf('id="journey-atmosphere"') < overview.indexOf('class="player-needs"'));
  const needsStart = overview.indexOf('class="player-needs"');
  const firstMeter = overview.indexOf('id="needs-health"', needsStart);
  assert.doesNotMatch(overview.slice(needsStart, firstMeter), /<p\b|<button\b/);
  for (const id of ["player-name", "player-character", "player-wallet", "equipment-travel",
    "player-food", "player-tarot", "outdoor-status"]) {
    assert.ok(overview.indexOf(`id="${id}"`) > overview.indexOf('id="needs-warning"'));
  }
  for (const id of ["travel-title", "journey-play-save", "travel-clock", "needs-health",
    "needs-hunger", "needs-fatigue", "needs-sleep", "needs-warning"]) {
    assert.match(overview, new RegExp(`id="${id}"`));
    assert.equal(html.split(`id="${id}"`).length - 1, 1);
  }
  assert.doesNotMatch(overview, /id="travel-controls"|class="map-comparison"/);
  const collapsed = overview.slice(overview.indexOf('<details id="pressure-panel"'));
  for (const id of ["player-vigilance", "pressure-vigilance", "pressure-vigilance-value",
    "player-hygiene", "pressure-cleanliness", "wash-travel"]) {
    assert.match(overview, new RegExp(`id="${id}"`));
    assert.doesNotMatch(collapsed, new RegExp(`id="${id}"`));
    assert.equal(html.split(`id="${id}"`).length - 1, 1);
  }
  const script = readFileSync(new URL("../travel-ui.mjs", import.meta.url), "utf8");
  assert.match(script, /controls\.hidden = !active;\s*document\.querySelector\("#travel-overview"\)\.hidden = !active;/);
  assert.match(script, /document\.querySelector\("#player-vigilance"\)\.hidden = !pressures;/);
});

test("mobile layout places the overview above the map, retaining a desktop sidebar", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.travel-active \.travel-overview \{ grid-column: 2; grid-row: 1;/);
  assert.match(css, /\.travel-active \.map-comparison \{ grid-column: 1; grid-row: 1 \/ 3;/);
  const mobile = css.slice(css.indexOf("@media (max-width: 760px)", css.indexOf(".travel-active {")));
  assert.match(mobile, /\.travel-active \.travel-overview \{[^}]*grid-column: 1;[^}]*grid-row: 1;/);
  assert.match(mobile, /\.travel-active \.map-comparison \{ grid-column: 1; grid-row: 2;/);
  assert.match(mobile, /\.travel-active \.travel-panel \{[^}]*grid-row: 3;/);
});
