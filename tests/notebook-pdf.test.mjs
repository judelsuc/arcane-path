import test from "node:test";
import assert from "node:assert/strict";
import { jpegPagesPdf, notebookPdf, downloadNotebookPdf } from "../notebook-pdf.mjs";
import { translate } from "../i18n.mjs";

test("PDF has correct byte offsets, page count and binary image lengths", async () => {
  const image = new Uint8Array([255, 216, 255, 224, 0, 0, 255, 217]);
  const pdf = jpegPagesPdf([image, image]);
  assert.equal(pdf.type, "application/pdf");
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  const text = new TextDecoder("latin1").decode(bytes);
  assert.match(text, /^%PDF-1.4/);
  assert.match(text, /\/Count 2 /);
  assert.equal(text.match(/\/Type \/Page /g).length, 2);
  const xref = Number(/startxref\n(\d+)/.exec(text)[1]);
  assert.equal(new TextDecoder().decode(bytes.slice(xref, xref + 4)), "xref");
  const rows = text.slice(xref).split("\n");
  for (let id = 1; id <= 8; id++) {
    const offset = Number(rows[id + 2].slice(0, 10));
    assert.equal(new TextDecoder().decode(bytes.slice(offset, offset + `${id} 0 obj`.length)), `${id} 0 obj`);
  }
  assert.throws(() => jpegPagesPdf([]), /empty/);
  assert.throws(() => jpegPagesPdf([new Uint8Array([0])]), /Invalid/);
});

for (const language of ["fr", "en"]) {
  test(`${language} PDF wraps notes and credits onto A4 pages and preserves hidden-photo anonymity`, async t => {
    const original = { document: globalThis.document, Image: globalThis.Image };
    t.after(() => Object.assign(globalThis, original));
    const lines = [], images = [];
    const context = {
      fillRect() {}, measureText: text => ({ width: [...text].length * 20 }),
      fillText(text, x, y) { assert.ok(y < 1674); lines.push(text); },
      drawImage(image, x, y, width, height) { assert.ok(y + height <= 1674); images.push(image); },
    };
    globalThis.document = { createElement: () => ({ getContext: () => context,
      toBlob(callback) { callback(new Blob([new Uint8Array([255, 216, 255, 217])])); } }) };
    globalThis.Image = class {
      naturalWidth = 800; naturalHeight = 1600;
      async decode() {}
    };
    const tr = (key, args) => translate(language, key, args);
    const pdf = await notebookPdf({ title: tr("journalTitle"), t: tr,
      groups: [{ title: "Statistics", rows: [{ label: "Distance", value: "12 km" }] }],
      photos: [{ title: "SECRET TOWN", unannotated: true,
        blob: new Blob(["fixture"], { type: "image/png" }),
        note: "é".repeat(6000), attribution: "Photographer", license: "CC BY",
        sourceUrl: `https://example.org/${"a".repeat(150)}`, licenseUrl: "https://example.org/license" }] });
    assert.equal(images.length, 1);
    assert.ok(lines.join("").includes(tr("fieldClue.photo")));
    assert.ok(!lines.some(line => line.includes("SECRET TOWN")));
    assert.ok(lines.includes("Distance: 12 km"));
    assert.ok(lines.includes("Photographer · CC BY"));
    assert.equal(lines.join("").match(/é/g).length, 6000);
    assert.ok(Number(/\/Count (\d+)/.exec(await pdf.text())[1]) > 3);
  });
}

test("image decoding and canvas failures reject instead of exporting missing content", async t => {
  const original = { document: globalThis.document, Image: globalThis.Image };
  t.after(() => Object.assign(globalThis, original));
  const tr = (key, args) => translate("en", key, args);
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  await assert.rejects(notebookPdf({ title: "Notebook", photos: [], t: tr }), /Unable to create PDF/);
  globalThis.document = { createElement: () => ({ getContext: () => ({
    fillRect() {}, measureText: () => ({ width: 0 }), fillText() {},
  }), toBlob(callback) { callback(new Blob([new Uint8Array([255, 216])])); } }) };
  globalThis.Image = class { async decode() { throw new Error("Broken image"); } };
  await assert.rejects(notebookPdf({ title: "Notebook", t: tr, photos: [{
    blob: new Blob(["broken"]), title: "Photo",
  }] }), /photo/i);
});

test("download uses a PDF filename and cleans up its link and object URL", test => {
  const original = { document: globalThis.document, setTimeout: globalThis.setTimeout,
    createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
  test.after(() => {
    globalThis.document = original.document;
    globalThis.setTimeout = original.setTimeout;
    URL.createObjectURL = original.createObjectURL;
    URL.revokeObjectURL = original.revokeObjectURL;
  });
  const blob = new Blob(["%PDF"], { type: "application/pdf" });
  let clicked = false, removed = false, appended = false, cleanup, revoked;
  const link = { click() { clicked = true; }, remove() { removed = true; } };
  globalThis.document = { createElement: () => link, body: { append() { appended = true; } } };
  globalThis.setTimeout = (callback, delay) => { assert.equal(delay, 60_000); cleanup = callback; };
  URL.createObjectURL = input => { assert.equal(input, blob); return "blob:pdf"; };
  URL.revokeObjectURL = url => { revoked = url; };
  downloadNotebookPdf(blob);
  assert.ok(clicked && appended && removed);
  assert.equal(link.download, "arcane-notebook.pdf");
  assert.equal(link.href, "blob:pdf");
  cleanup();
  assert.equal(revoked, "blob:pdf");
});
