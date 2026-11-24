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

test("shelter, survival and town copy stays immersive while retaining gameplay rules", () => {
  for (const language of ["en", "fr"]) {
    for (const key of ["buildingSleepNote", "buildingSleepAction", "survivalChoicesFiction", "townFiction"]) {
      assert.doesNotMatch(translate(language, key, { minutes: 10, hours: 8 }),
        /fiction|ficti[fnv]|occupancy|occupation réelle|accusation/i);
    }
    const note = translate(language, "buildingSleepNote", { minutes: 10, hours: 8 });
    assert.match(note, /10 min/);
    assert.match(note, /8 h/);
    assert.match(note, /\+5 vigilance/);
  }
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

test("all rasterizer POI categories, including streamed leisure venues, have bilingual labels", () => {
  for (const locale of ["fr", "en"]) {
    for (const category of ["amenity", "shop", "tourism", "historic", "leisure", "station", "cable_station", "summit"]) {
      assert.ok(translate(locale, `poi.${category}`).trim(), `${locale}: ${category}`);
    }
  }
  assert.equal(translate("fr", "poi.leisure"), "Loisirs");
  assert.equal(translate("en", "poi.leisure"), "Leisure");
});

test("every starting tarot card has a symbolic reading in both languages", () => {
  const economy = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url), "utf8"));
  for (const card of economy.tarot) {
    for (const locale of ["fr", "en"]) {
      assert.ok(translate(locale, `tarotMeaning.${card.id}`).length > 30);
    }
  }
});
