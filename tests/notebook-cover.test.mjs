import test from "node:test";
import assert from "node:assert/strict";
import { notebookCover } from "../notebook-cover.mjs";
import { translate } from "../i18n.mjs";

for (const language of ["fr", "en"]) {
  test(`${language} cover uses the real name, origin and UTC departure date without future clues`, () => {
    const t = (key, args) => translate(language, key, args);
    const context = { startingPoint: "Firmi", state: { name: "Alex", startedAt: Date.UTC(2026, 9, 17, 23, 59),
      trail: { origin: { col: 0, row: 0 }, stages: [{ name: "Secret future town" }] } } };
    const cover = notebookCover(context, t, language);
    assert.equal(cover.title, t("journalCoverTitle", { name: "Alex" }));
    assert.equal(cover.subtitle, t("journalCoverSubtitle", { point: "Firmi" }));
    assert.doesNotMatch(cover.subtitle, /blisters|ampoules/);
    const generated = { en: "A lantern on the autumn road.", fr: "Une lanterne sur le chemin d'automne." };
    assert.equal(notebookCover({ ...context, coverSubtitle: generated }, t, language).subtitle,
      generated[language]);
    assert.equal(cover.rows[0].value, "Firmi");
    assert.match(cover.rows[1].value, /17.*2026.*UTC/);
    assert.doesNotMatch(JSON.stringify(cover), /Secret future/);
    const legacy = notebookCover({ state: { startedAt: context.state.startedAt } }, t, language);
    assert.equal(legacy.rows[0].value, t("journalCoverUnknown"));
    assert.equal(legacy.title, t("journalCoverTitle", { name: t("unnamedCharacter") }));
    const coordinates = notebookCover({ state: { ...context.state,
      trail: { origin: { latitude: 44.5, longitude: 2.3 } } } }, t, language);
    assert.equal(coordinates.rows[0].value, "44.50000, 2.30000");
  });
}
