import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { tarotArt } from "../tarot-art.mjs";

const { tarot } = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));

test("each tarot has distinct original ASCII artwork within an aligned card border", () => {
  const drawings = tarot.map(card => tarotArt(card.id));
  assert.equal(new Set(drawings).size, 22);
  assert.ok(!drawings.includes(tarotArt()));
  for (const drawing of [tarotArt(), ...drawings]) {
    const rows = drawing.split("\n");
    assert.equal(rows.length, 8);
    assert.ok(rows.every(row => row.length === 13));
    assert.match(drawing, /^[\x20-\x7e\n]+$/);
    assert.ok(rows.slice(1, -1).every(row => row.startsWith("| ") && row.endsWith(" |")));
  }
});

test("the Tower has a tower and lightning, not the generic road, and invalid cards fail explicitly", () => {
  assert.ok(tarotArt("tower").includes("|#|"));
  assert.ok(tarotArt("tower").includes("/Z"));
  assert.notEqual(tarotArt("tower"), tarotArt());
  assert.throws(() => tarotArt("missing"), /Unknown tarot/);
});
