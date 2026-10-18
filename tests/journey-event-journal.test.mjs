import test from "node:test";
import assert from "node:assert/strict";
import { journeyEventJournalEntry } from "../journey-event-journal.mjs";
import { journeyEventArt } from "../journey-event-art.mjs";
import { journeyEventText } from "../journey-events.mjs";
import { createTarotJournalPinner } from "../tarot-cards.mjs";
import { translate } from "../i18n.mjs";

test("events reuse notebook image storage, original drawing, effects and stable journey identity", async () => {
  const drawn = [];
  const doc = { createElement: () => ({
    getContext: () => ({ fillRect() {}, measureText: text => ({ width: text.length * 20 }),
      fillText: text => drawn.push(text) }),
    toDataURL: () => "data:image/png;base64,aW1hZ2U=",
  }) };
  const state = { startedAt: Date.UTC(2026, 9, 18, 12), serverJourney: { id: "journey-a" },
    events: { history: [{ id: 2, kind: "tornBag", elapsedMinutes: 15,
      minutes: 0, foodKcal: -250, moneyCents: 0, fatigue: 0, health: 0, awakeHours: 0, reputation: 0 }] } };
  const t = (key, args) => translate("fr", key, args);
  const entry = journeyEventJournalEntry(state, t, doc);
  assert.equal(drawn.join("\n"), journeyEventArt("tornBag"));
  assert.equal(entry.note, journeyEventText(state.events.history[0], t));
  assert.match(entry.title, /2026-10-18 12:15/);
  assert.equal(entry.id, "event:journey-a:2");
  assert.notEqual(journeyEventJournalEntry({ ...state, serverJourney: { id: "journey-b" } }, t, doc).id, entry.id);
  const saved = new Map();
  const store = { get: async id => saved.get(id),
    pin: async (photo, options) => { saved.set(options.id, { ...photo, ...options }); return true; } };
  const pin = createTarotJournalPinner(store, async () => new Response(new Blob(["image"], { type: "image/png" })));
  assert.equal(await pin(entry), true);
  assert.equal(await pin(entry), false);
  assert.equal(saved.size, 1);
  assert.equal(saved.get(entry.id).blob.type, "image/png");
  assert.equal(saved.get(entry.id).note, entry.note);
  assert.equal(saved.get(entry.id).caption, entry.title);
  assert.throws(() => journeyEventJournalEntry({}, t, doc), /No journey event/);
  assert.throws(() => journeyEventJournalEntry(state, t, {
    createElement: () => ({ getContext: () => null }),
  }), /Unable to draw/);
});
