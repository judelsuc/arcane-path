import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the travel HUD overlay keeps only vitals; identity and notices live in the side panel", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const overview = html.slice(html.indexOf('id="travel-overview"'), html.indexOf('<section class="travel-panel"'));
  assert.match(overview, /aria-labelledby="travel-title" hidden/);
  assert.ok(overview.indexOf('id="journey-atmosphere"') < overview.indexOf('class="player-needs"'));
  for (const id of ["travel-title", "travel-clock", "needs-health", "needs-hunger", "needs-fatigue",
    "needs-sleep", "player-vigilance", "pressure-vigilance", "pressure-vigilance-value",
    "player-hygiene", "pressure-cleanliness", "dog-travel"]) {
    assert.match(overview, new RegExp(`id="${id}"`));
    assert.equal(html.split(`id="${id}"`).length - 1, 1);
  }
  assert.doesNotMatch(overview, /id="travel-controls"|class="map-comparison"/);
  assert.doesNotMatch(overview,
    /id="(?:player-name|player-wallet|player-tarot|equipment-travel|needs-warning|pressure-panel|journey-ended)"/,
    "the overlay holds no identity lines, wallet, equipment or notices");
  const sidebar = html.slice(html.indexOf('<section class="travel-panel"'), html.indexOf('<div class="map-comparison"'));
  const status = sidebar.slice(sidebar.indexOf('id="traveller-status"'), sidebar.indexOf('id="travel-controls"'));
  for (const id of ["journey-play-save", "needs-speed-effect", "needs-warning", "player-name",
    "player-character", "player-wallet", "player-food", "player-tarot",
    "outdoor-status", "pressure-panel", "journey-ended", "closing-story", "restart-travel"]) {
    assert.match(status, new RegExp(`id="${id}"`));
    assert.equal(html.split(`id="${id}"`).length - 1, 1);
  }
  assert.match(overview, /id="pressure-cleanliness-value"><\/output><\/label>\s*<button id="dog-travel" type="button" hidden><\/button>/);
  assert.doesNotMatch(overview, /id="wash-travel"/);
  const town = html.split('<dialog id="town-dialog"')[1].split("</dialog>")[0];
  assert.match(town, /id="wash-travel"/);
  assert.equal(html.split('id="wash-travel"').length - 1, 1);
  assert.doesNotMatch(html, /id="cell-wash"/);
  assert.equal(html.split('id="dog-travel"').length - 1, 1);
  const script = readFileSync(new URL("../travel-ui.mjs", import.meta.url), "utf8");
  for (const selector of ["travel-toolbar", "travel-toolbar-help", "travel-overview"]) {
    assert.ok(script.includes(`document.querySelector("#${selector}").hidden = !active;`));
  }
  assert.match(script, /document\.querySelector\("#player-vigilance"\)\.hidden = !pressures;/);
});

test("console layout pins characteristics and map while secondary data scrolls, keeping the mobile stack", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /body\.is-travelling \{[^}]*height: 100dvh;[^}]*overflow: hidden;/,
    "the page itself must not scroll during travel");
  assert.match(css, /\.travel-active \.travel-overview \{ grid-column: 1 \/ -1; grid-row: 1;/,
    "the HUD bar spans the full width");
  assert.match(css, /\.travel-active \.map-comparison \{ grid-column: 1; grid-row: 2;/);
  assert.match(css, /\.travel-active \.travel-panel \{[^}]*grid-column: 2;[^}]*grid-row: 2;[^}]*overflow-y: auto/);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const sidebar = html.slice(html.indexOf('<section class="travel-panel"'), html.indexOf('<div class="map-comparison"'));
  assert.match(sidebar, /class="cell-content"/, "cell details are secondary data in the scrolling panel");
  assert.match(sidebar, /class="legend-card"/, "the map legend is secondary data in the scrolling panel");
  assert.equal(html.split('class="legend-card"').length - 1, 1);
  assert.equal(html.split('class="cell-content"').length - 1, 1);
  const mobile = css.slice(css.indexOf("@media (max-width: 760px)", css.indexOf(".travel-active {")));
  assert.match(mobile, /\.travel-active \.travel-overview \{[^}]*grid-column: 1;[^}]*grid-row: 2;/);
  assert.match(mobile, /\.travel-active \.map-comparison \{ grid-column: 1; grid-row: 1;/);
  assert.match(mobile, /\.travel-active \.map-viewport \{ max-height: 45dvh;/);
  assert.match(mobile, /\.travel-active \.travel-panel \{[^}]*grid-row: 3;/);
});

test("travel actions are a compact wrapping toolbar immediately below the map, not the sidebar", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const toolbar = html.slice(html.indexOf('<nav id="travel-toolbar"'), html.indexOf('</nav>', html.indexOf('<nav id="travel-toolbar"')));
  assert.match(html, /id="ascii-map"[^>]*><\/pre>\s*<\/div>\s*<p id="travel-blocker" role="status" hidden><\/p>\s*<p id="travel-streaming" role="status"><\/p>\s*<nav id="travel-toolbar"/);
  assert.equal(html.split('id="travel-blocker"').length - 1, 1);
  assert.equal(html.split('id="travel-streaming"').length - 1, 1);
  for (const id of ["rest-travel", "open-survival-choices", "open-conversation", "save-travel",
    "equipment-travel", "show-photo"]) {
    assert.match(toolbar, new RegExp(`id="${id}"`));
    assert.equal(html.split(`id="${id}"`).length - 1, 1);
  }
  const sidebar = html.slice(html.indexOf('<section class="travel-panel"'), html.indexOf('<div class="map-comparison"'));
  assert.doesNotMatch(sidebar, /class="travel-actions"|id="open-town"|data-move=/);
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.travel-toolbar:not\(\[hidden\]\)[^}]*flex-wrap: wrap/);
  assert.match(css, /\.travel-toolbar button\s*\{[^}]*width: 36px; height: 36px;/);
});

test("Dialogue and Quests replace specialized quest buttons and hidden action sources", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const toolbar = html.slice(html.indexOf('<nav id="travel-toolbar"'), html.indexOf('</nav>', html.indexOf('<nav id="travel-toolbar"')));
  const sources = html.match(/<div data-shortcut-sources="travel-toolbar" hidden>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(sources);
  for (const id of ["sleep-travel", "eat-travel", "open-town", "open-earn-money",
    "open-journey-world"]) {
    assert.doesNotMatch(toolbar, new RegExp(`id="${id}"`));
    assert.match(sources, new RegExp(`id="${id}"`));
    assert.equal(html.split(`id="${id}"`).length - 1, 1);
  }
  assert.match(toolbar, /id="open-quests"/);
  for (const id of ["open-trail", "open-hint", "open-abandoned-journals", "cell-clues",
    "cell-hint", "cell-notebooks", "town-trail"]) assert.ok(!html.includes(`id="${id}"`));
});

test("unloaded movement prepares terrain without acquiring the global action lock or advancing the journey", () => {
  const script = readFileSync(new URL("../travel-ui.mjs", import.meta.url), "utf8");
  const movement = script.slice(script.indexOf("async function move(dc, dr)"), script.indexOf("async function begin("));
  const preparation = movement.slice(movement.indexOf("if (!stream.get(to.x, to.y))"), movement.indexOf("busy = true;"));
  assert.match(preparation, /await stream\.load\(to\.x, to\.y, true\)/);
  assert.match(preparation, /transient = "travelTerrainPreparing"/);
  assert.match(preparation, /transient = "travelTerrainReady"/);
  assert.match(preparation, /currentToken === token && state === waitingState/);
  assert.match(preparation, /report\(reason\)/);
  assert.match(preparation, /return;\s*\}\s*$/);
  assert.doesNotMatch(preparation, /busy = true|\bstate =(?!=)|walkSurvival|autosave\(/);
  assert.match(script, /terrainWaitingState !== state\) \{\s*transient = "";/);
});

test("an active booking's blocker offers a clickable way into the transport window", () => {
  const source = readFileSync(new URL("../travel-ui.mjs", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  // The transport button itself sits in a hidden shortcut-only group.
  assert.match(readFileSync(new URL("../index.html", import.meta.url), "utf8"),
    /data-shortcut-sources="travel-toolbar" hidden>[\s\S]*id="open-journey-world"/);
  assert.match(source, /blocker === "transport"[\s\S]{0,400}querySelector\("#open-journey-world"\)\?\.click\(\)/);
  assert.match(styles, /#travel-blocker \.travel-blocker-action \{\s*pointer-events: auto;/);
});
