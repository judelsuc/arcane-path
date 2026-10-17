import test from "node:test";
import assert from "node:assert/strict";
import { lodgingGuidance } from "../lodging-guidance.mjs";
import { translate } from "../i18n.mjs";

for (const language of ["fr", "en"]) {
  test(`${language} accommodation guidance updates from actual player position without movement`, () => {
    const place = { name: "Hotel", col: 2, row: 0, latitude: 50, longitude: 4.005 };
    const state = { col: 0, row: 0, elapsedMinutes: 45, walletCents: 2000 };
    const before = structuredClone(state);
    const t = (key, args) => translate(language, key, args);
    assert.match(lodgingGuidance(place, state, { latitude: 50, longitude: 4 }, t), /est|east/);
    assert.match(lodgingGuidance(place, { ...state, col: 4 }, { latitude: 50, longitude: 4.01 }, t), /ouest|west/);
    assert.match(lodgingGuidance(place, { ...state, col: 2 }, place, t), /H/);
    assert.deepEqual(state, before);
  });
}
