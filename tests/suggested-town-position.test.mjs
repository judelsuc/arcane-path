import test from "node:test";
import assert from "node:assert/strict";
import { suggestedTownPosition } from "../trail-ui.mjs";
import { translate } from "../i18n.mjs";

for (const locale of ["fr", "en"]) {
  test(`${locale} suggested town positions are explicit, relative to current player and unconfirmed`, () => {
    const t = (key, args) => translate(locale, key, args);
    const town = { name: "Possibly wrong town", latitude: 44, longitude: 2 };
    const fromWest = suggestedTownPosition(town, { latitude: 44, longitude: 1.99 }, t);
    assert.match(fromWest, /44\.000000, 2\.000000/);
    assert.match(fromWest, /800 m/);
    assert.match(fromWest, locale === "fr" ? /l'est/ : /east/);
    assert.match(fromWest, locale === "fr" ? /non confirmé/ : /unconfirmed/);
    assert.match(suggestedTownPosition(town, { latitude: 44, longitude: 2.01 }, t),
      locale === "fr" ? /l'ouest/ : /west/);
    assert.equal(town.name, "Possibly wrong town");
  });
}
