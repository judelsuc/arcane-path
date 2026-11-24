import test from "node:test";
import assert from "node:assert/strict";
import { encodeNotebook, decodeNotebook } from "../notebook-transfer.mjs";
import { ensureJournalAccess, createJournalClient } from "../abandoned-journals.mjs";

test("notebook transfer retains exact image bytes, notes, credits, dates and vague-photo flag", async () => {
  const photo = { id: "one", title: "Title", sourceUrl: "https://example.org/photo",
    attribution: "Author", license: "CC0", licenseUrl: "https://example.org/license",
    note: "A shared note", caption: "Daily tarot — 2026-10-17", unannotated: true,
    pinnedAt: "2026-10-17T12:00:00Z", blob: new Blob([new Uint8Array([255, 216, 255, 0, 1])],
      { type: "image/jpeg" }) };
  const wire = await encodeNotebook([photo]);
  const [decoded] = decodeNotebook(JSON.parse(JSON.stringify(wire)));
  for (const key of ["title", "note", "caption", "unannotated", "attribution", "pinnedAt"]) {
    assert.equal(decoded[key], photo[key]);
  }
  assert.deepEqual(new Uint8Array(await decoded.blob.arrayBuffer()),
    new Uint8Array(await photo.blob.arrayBuffer()));
  assert.throws(() => decodeNotebook([{ ...wire[0], image: "%%%" }]));
});

test("legacy notebooks receive separate private identities without altering the original journey", () => {
  const state = { serverJourney: { id: "1".repeat(32) } };
  const migrated = ensureJournalAccess(state);
  assert.match(migrated.journalKeeper, /^[a-f0-9]{32}$/);
  assert.match(migrated.journalAccess, /^[a-f0-9]{64}$/);
  assert.notEqual(migrated.journalKeeper, state.serverJourney.id);
  assert.deepEqual(state, { serverJourney: { id: "1".repeat(32) } });
  assert.equal(ensureJournalAccess(migrated), migrated);
});

test("full notebook outbox survives offline publication, reload and a subsequent journey", async () => {
  const entries = new Map();
  const outbox = { async put(entry) { entries.set(entry.id, structuredClone(entry)); },
    async list() { return [...entries.values()]; }, async remove(id) { entries.delete(id); } };
  const state = { serverJourney: { id: "1".repeat(32) }, journalAccess: "a".repeat(64),
    col: 4, row: 5, elapsedMinutes: 50, ended: null, trail: { index: 0 } };
  const offline = createJournalClient({}, async () => { throw new Error("Offline"); }, { outbox });
  await assert.rejects(offline.publish(state, [{ note: "Retain full content" }], ["A clue"]), /Offline/);
  assert.equal(entries.size, 1);
  const sent = [];
  const online = createJournalClient({}, async (url, options) => {
    sent.push(JSON.parse(options.body));
    return new Response('{"published":true}');
  }, { outbox });
  await online.flushNotebooks();
  await online.flushNotebooks();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].row, 5);
  assert.equal(sent[0].notebook[0].note, "Retain full content");
  assert.deepEqual(sent[0].clues, ["A clue"]);
  assert.equal(entries.size, 0);
});
