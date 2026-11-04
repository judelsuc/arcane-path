import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TAROT_CARDS, tarotArtwork, tarotJournalEntry, createTarotJournalPinner } from "../tarot-cards.mjs";
import { translate } from "../i18n.mjs";

const data = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));
const state = { startedAt: Date.UTC(2026, 9, 17, 12), birthCard: "justice",
  dailyCard: "strength", tarotDay: "2026-10-18", serverJourney: { id: "a".repeat(32) } };
const t = (key, args) => translate("fr", key, args);

test("all 22 game cards map to the matching historical Marseille illustrations and local JPEGs", () => {
  assert.deepEqual(TAROT_CARDS, data.tarot.map(c => c.id));
  for (const id of [...TAROT_CARDS, null]) {
    const art = tarotArtwork(id);
    const bytes = readFileSync(new URL(`..${art.url}`, import.meta.url));
    assert.equal(bytes.readUInt16BE(), 0xffd8);
    assert.ok(bytes.length > 1000);
    assert.match(art.sourceUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:Jean_Dodal_Tarot_/);
    assert.equal(art.license, "Public domain");
  }
  assert.match(tarotArtwork("justice").sourceUrl, /08\.jpg$/);
  assert.match(tarotArtwork("strength").sourceUrl, /11\.jpg$/);
  assert.match(tarotArtwork("fool").sourceUrl, /Fool\.jpg$/);
  assert.throws(() => tarotArtwork("invented"), /Unknown/);
});

test("birth and daily draws have stable distinct identities, dates, names and meanings in both languages", () => {
  for (const locale of ["fr", "en"]) {
    const tr = (key, args) => translate(locale, key, args);
    const birth = tarotJournalEntry(state, "birth", data, tr, locale);
    const daily = tarotJournalEntry(state, "daily", data, tr, locale);
    assert.match(birth.title, /2026-10-17/);
    assert.match(daily.title, /2026-10-18/);
    assert.match(birth.title, new RegExp(data.tarot.find(c => c.id === "justice")[locale]));
    assert.equal(birth.note, tr("tarotMeaning.justice"));
    assert.notEqual(birth.id, daily.id);
    assert.notEqual(daily.id, tarotJournalEntry({ ...state, tarotDay: "2026-10-19" },
      "daily", data, tr, locale).id);
    assert.notEqual(birth.id, tarotJournalEntry({ ...state, serverJourney: { id: "b".repeat(32) } },
      "birth", data, tr, locale).id);
    assert.equal(birth.id, tarotJournalEntry(structuredClone(state), "birth", data, tr, locale).id);
  }
});

test("automatic pins persist each draw once, preserve notes on resume and keep repeated cards on different days", async () => {
  const rows = new Map();
  let requests = 0;
  const store = { async get(id) { return rows.get(id); },
    async pin(photo, options) {
      if (rows.has(options.id)) return false;
      rows.set(options.id, { ...photo, ...options });
      return true;
    } };
  const pin = createTarotJournalPinner(store, async () => {
    requests++;
    return new Response(new Blob(["jpeg fixture"], { type: "image/jpeg" }));
  });
  const entry = tarotJournalEntry(state, "daily", data, t, "fr");
  assert.equal(await pin(entry), true);
  rows.get(entry.id).note = "My own note";
  assert.equal(await pin(entry), false);
  assert.equal(requests, 1);
  assert.equal(rows.get(entry.id).note, "My own note");
  assert.equal(rows.get(entry.id).caption, entry.title);
  assert.equal(rows.get(entry.id).blob.type, "image/jpeg");
  await pin(tarotJournalEntry({ ...state, tarotDay: "2026-10-19" }, "daily", data, t, "fr"));
  await pin(tarotJournalEntry(state, "birth", data, t, "fr"));
  assert.equal(rows.size, 3);
});

test("image and storage failures reject explicitly so the UI can offer retry", async () => {
  const entry = tarotJournalEntry(state, "daily", data, t, "fr");
  const store = { async get() {}, async pin() { throw new Error("Storage full"); } };
  await assert.rejects(createTarotJournalPinner(store, async () => new Response("", { status: 404 }))(entry),
    /HTTP 404/);
  await assert.rejects(createTarotJournalPinner(store, async () =>
    new Response(new Blob(["jpeg"], { type: "image/jpeg" })))(entry), /Storage full/);
});
