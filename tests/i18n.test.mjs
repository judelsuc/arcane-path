import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveLocale, translate, translations } from "../i18n.mjs";

test("selects a supported browser language with French as default", () => {
  assert.equal(resolveLocale(["en-GB", "fr-FR"]), "en");
  assert.equal(resolveLocale(["de-DE", "fr-CA"]), "fr");
  assert.equal(resolveLocale(["EN-US"]), "en");
  assert.equal(resolveLocale(["de-DE"]), "fr");
  assert.equal(resolveLocale([]), "fr");
});

test("catalogs contain the same keys and interpolation parameters", () => {
  assert.deepEqual(Object.keys(translations.en).sort(), Object.keys(translations.fr).sort());
  for (const key of Object.keys(translations.fr)) {
    const parameters = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(parameters(translations.en[key]), parameters(translations.fr[key]), key);
  }
});

test("translates terrain names and interpolates map measurements", () => {
  assert.equal(translate("en", "terrain.field"), "Field");
  assert.equal(translate("fr", "terrain.field"), "Champ");
  assert.equal(translate("en", "terrain.rail"), "Railway");
  assert.equal(translate("fr", "terrain.mountain"), "Montagne");
  assert.equal(translate("en", "scale", { meters: 250 }), "250 m per cell");
  assert.equal(translate("fr", "size", { width: 37, height: 21 }), "37 × 21 cases");
});

test("every generated terrain has translations in each language", () => {
  const map = JSON.parse(readFileSync(new URL("../public/map.json", import.meta.url), "utf8"));
  const terrains = new Set([
    ...map.legend.map((entry) => entry.terrain),
    ...map.rows.flat().map((cell) => cell.terrain),
  ]);
  for (const locale of Object.keys(translations)) {
    for (const terrain of terrains) {
      assert.ok(translate(locale, `terrain.${terrain}`).length > 0);
    }
    for (const row of map.rows) {
      for (const cell of row) {
        for (const poi of cell.pois ?? []) {
          assert.ok(translate(locale, `poi.${poi.category}`).length > 0);
        }
      }
    }
  }
});

test("reports missing translations and parameters explicitly", () => {
  assert.throws(() => translate("en", "missing"), /Missing translation/);
  assert.throws(() => translate("de", "headline"), /Missing translation/);
  assert.throws(() => translate("en", "scale"), /Missing parameter/);
});
