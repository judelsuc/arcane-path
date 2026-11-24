import test from "node:test";
import assert from "node:assert/strict";
import { PLAYER_ICONS, themePlayerIcon, playerIcon, drawPlayerIcon, playerIconSource } from "../player-icons.mjs";
import { LEGEND_THEMES, treasureId } from "../legend-rewards.mjs";
import { renderJourneyMarker, isDeath } from "../death.mjs";
import { translate } from "../i18n.mjs";

test("eight original bounded pixel silhouettes have distinct geometry, bilingual names and shared SVG/canvas pixels", () => {
  const shapes = new Set();
  for (const icon of PLAYER_ICONS) {
    assert.equal(playerIcon(icon.id), icon);
    assert.equal(icon.pixels.length, 12);
    assert.ok(icon.en && icon.fr);
    for (const row of icon.pixels) assert.match(row, /^[.ocas]{12}$/);
    shapes.add(icon.pixels.join("").replace(/[cas]/g, "x"));
    const rects = [], context = { fillRect: (...args) => rects.push([context.fillStyle, ...args]) };
    drawPlayerIcon(context, icon.id, 0, 0, 12);
    assert.ok(rects.length > 30);
    assert.ok(rects.every(([color, x, y, width, height]) =>
      /^#[a-f0-9]{6}$/.test(color) && x >= 0 && y >= 0 && x + width <= 12 && y + height <= 12));
    const svg = decodeURIComponent(playerIconSource(icon.id).split(",")[1]);
    assert.match(svg, /viewBox="0 0 12 12"/);
    assert.equal((svg.match(/<rect /g) ?? []).length, rects.length);
    for (const [color, x, y] of rects) {
      assert.ok(svg.includes(`<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`));
    }
    assert.doesNotMatch(svg, /script|href|onload|foreignObject/);
  }
  assert.equal(shapes.size, 8, "icons differ in construction, not just colour");
  assert.equal(new Set(LEGEND_THEMES.map(theme => themePlayerIcon(theme.id))).size, 8);
  assert.throws(() => playerIcon("unknown"), /Unknown/);
  assert.throws(() => themePlayerIcon("unknown"), /Unknown/);
});

test("custom live markers keep their fallback character, accessible location, death cross and other marker classes", () => {
  for (const language of ["en", "fr"]) {
    const attributes = {}, classes = new Set(["tile--look", "tile--selected", "tile--quest"]);
    const tile = { setAttribute: (key, value) => { attributes[key] = value; },
      classList: { toggle: (key, on) => { if (on) classes.add(key); else classes.delete(key); } } };
    const id = treasureId("node/42", 2);
    for (const ended of [null, "health", "hunger", "fatigue", "sleep", "placement", "reunion", null]) {
      const state = { ended, treasures: { inventory: [{ id }], iconEquipped: id } };
      renderJourneyMarker(tile, state, key => translate(language, key));
      assert.equal(tile.textContent, isDeath(state) ? "†" : "@");
      assert.equal(attributes["data-player-icon"], isDeath(state) ? "default" : "ranger");
      assert.equal(attributes["aria-current"], "location");
      assert.equal(attributes["aria-label"], translate(language, isDeath(state) ? "deathMarker" : "playerMarker"));
      for (const name of ["tile--look", "tile--selected", "tile--quest"]) assert.ok(classes.has(name));
    }
    renderJourneyMarker(tile, { treasures: { inventory: [], iconEquipped: id } }, key => translate(language, key));
    assert.equal(attributes["data-player-icon"], "default");
    assert.equal(tile.textContent, "@");
  }
});
