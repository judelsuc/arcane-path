import test from "node:test";
import assert from "node:assert/strict";
import { setupGameRelease } from "../game-release-ui.mjs";
import { translate } from "../i18n.mjs";

class Element {
  constructor(document) {
    this.ownerDocument = document;
    this.children = [];
    this.textContent = "";
  }
  append(element) { this.children.push(element); }
  replaceChildren() { this.children = []; }
}

function harness(fetcher, language = "fr") {
  const document = { createElement: () => new Element(document) };
  const elements = Object.fromEntries(["version", "deployment", "entries", "status"]
    .map(name => [name, new Element(document)]));
  const ui = setupGameRelease({
    versionElement: elements.version,
    deploymentElement: elements.deployment,
    entriesElement: elements.entries,
    statusElement: elements.status,
    t: (key, parameters) => translate(language, key, parameters),
    language,
    fetcher,
    logger: { error() {} },
  });
  return { ...elements, ui };
}

const changelog = {
  version: "0.20.0",
  entries: [{ version: "0.20.0", fr: "Nouveautés", en: "What's new" }],
};
const deployment = {
  version: 1,
  commit: "b922147abcdef0123456789abcdef01234567890",
  packagedAt: "2026-10-20T04:00:00.000Z",
};
const jsonResponse = value => ({ ok: true, json: async () => value });

test("Options displays version, deployed commit/date and localized changelog entries", async () => {
  const h = harness(async url => jsonResponse(url.includes("changelog") ? changelog : deployment));
  await h.ui.loaded;
  assert.equal(h.version.textContent, "Version 0.20.0");
  assert.match(h.deployment.textContent, /b922147abcde/);
  assert.match(h.deployment.textContent, /2026/);
  assert.equal(h.status.textContent, translate("fr", "releaseAvailable"));
  assert.equal(h.entries.children[0].textContent, "Version 0.20.0 — Nouveautés");
  h.ui.localize("en");
  assert.equal(h.entries.children[0].textContent, "Version 0.20.0 — What's new");
  assert.equal(h.entries.children[0].lang, "en");
});

test("Options states plainly when version and deployment metadata are unavailable", async () => {
  const h = harness(async () => ({ ok: false, status: 404 }));
  await h.ui.loaded;
  assert.equal(h.version.textContent, translate("fr", "releaseVersionUnavailable"));
  assert.equal(h.deployment.textContent, translate("fr", "releaseLocal"));
  assert.match(h.status.textContent, /404/);
  assert.match(h.status.textContent, /indisponible/);
  assert.equal(h.entries.children.length, 0);
});

test("Options does not claim local builds have deployed metadata", async () => {
  const h = harness(async url => url.includes("changelog") ? jsonResponse(changelog) : ({ ok: false, status: 404 }));
  await h.ui.loaded;
  assert.equal(h.version.textContent, "Version 0.20.0");
  assert.equal(h.deployment.textContent, translate("fr", "releaseLocal"));
  assert.match(h.status.textContent, /build local possible/);
});

test("localized per-file metadata failures are visible without hiding a valid game version", async () => {
  for (const language of ["fr", "en"]) {
    const h = harness(async url => url.includes("changelog") ? jsonResponse(changelog)
      : jsonResponse({ version: 1 }), language);
    await h.ui.loaded;
    assert.match(h.version.textContent, /0.20.0/);
    assert.ok(h.status.textContent.includes(translate(language, "releaseError.malformed")));
    assert.ok(h.status.textContent.includes(translate(language, "releaseFile.deployment")));
  }
});
