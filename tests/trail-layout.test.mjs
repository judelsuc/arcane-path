import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { translate } from "../i18n.mjs";

test("parent trail separates guidance from investigation while keeping action/result hooks intact", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const dialog = html.split('<dialog id="trail-dialog"')[1].split("</dialog>")[0];
  assert.doesNotMatch(dialog, /trail-restart|journeyRestart/);
  assert.match(html, /id="restart-travel"[^>]*data-i18n="journeyRestart"/);
  const guide = dialog.split('<aside class="trail-guide"')[1].split("</aside>")[0];
  const main = dialog.split('<section class="trail-main"')[1];
  for (const id of ["trail-intro", "trail-target", "parent-story", "trail-save-status"]) {
    assert.match(guide, new RegExp(`id="${id}"`));
  }
  for (const id of ["trail-actions", "trail-discovery", "trail-clue-photo", "trail-action-error", "trail-history"]) {
    assert.doesNotMatch(guide, new RegExp(`id="${id}"`));
    assert.match(main, new RegExp(`id="${id}"`));
  }
  assert.match(main, /id="trail-interview"[^>]*><\/button>\s*<p data-i18n="trailCost"/);
  assert.ok(main.indexOf('id="trail-discovery"') < main.indexOf('id="trail-history"'));
  assert.ok(main.indexOf('id="trail-history"') < main.indexOf('id="trail-actions"'));
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.trail-layout\s*\{[^}]*grid-template-columns:/);
  assert.match(css, /@media \(max-width: 760px\)\s*\{\s*\.trail-layout\s*\{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 760px\)[^}]*\}[^}]*\}\s*\.trail-main \{ grid-row: 1;/);
  for (const language of ["fr", "en"]) {
    for (const key of ["trailGuideTitle", "trailMainTitle", "trailHistoryTitle"]) {
      assert.ok(translate(language, key).length);
    }
  }
});
