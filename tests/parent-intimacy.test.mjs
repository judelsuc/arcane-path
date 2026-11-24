import test from "node:test";
import assert from "node:assert/strict";
import { PARENT_PROFILES, intimateBiography, intimateWitness, parentWordingKey,
  rememberParentWording, validateParentWording } from "../parent-intimacy.mjs";
import { openingClueText, fieldClueText } from "../trail-search.mjs";
import { parentClueText } from "../trail-ui.mjs";
import { translate } from "../i18n.mjs";
import { setupParentNarrative } from "../parent-narrative-ui.mjs";
import { createLiveNarrative, PARENT_CLUE } from "../live-narrative.mjs";
import { synchronizeParentDiscovery } from "../discovery-targets.mjs";
import { discoveryNotebookEntries } from "../discovery-ui.mjs";

function state(card = "fool") {
  return { serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(64), elapsedMinutes: 0,
    trail: { version: 2, origin: { col: 0, row: 0 }, parentName: "Camille", index: 0,
      stages: [{ col: 100, row: 0, name: "HIDDEN DESTINATION" }], history: [],
      story: { intimacy: { version: 1, card } }, exploration: { firstStage: 0, knownStage: null, hints: [] } } };
}
const tr = language => (key, args) => translate(language, key, args);
const flush = () => new Promise(resolve => setImmediate(resolve));

test("all 22 adult profiles ground the biography and first letter in French and English", () => {
  assert.equal(Object.keys(PARENT_PROFILES).length, 22);
  for (const [card, profile] of Object.entries(PARENT_PROFILES)) {
    const s = state(card), before = structuredClone(s);
    for (const language of ["fr", "en"]) {
      const text = intimateBiography(s, language), letter = openingClueText(s, tr(language));
      assert.ok(text.includes(profile.desire[language]));
      assert.ok(text.includes(profile.memory[language]));
      assert.ok(text.includes(profile.object[language]));
      assert.ok(letter.includes(profile.letter[language]));
      const notebook = discoveryNotebookEntries(synchronizeParentDiscovery(s), tr(language));
      assert.ok(notebook.some(entry => entry.text === letter));
      assert.doesNotMatch(letter, /HIDDEN DESTINATION|undefined/);
      assert.equal(openingClueText({ ...s, col: 300, row: 100 }, tr(language)), letter);
      const known = structuredClone(s);
      known.trail.exploration.knownStage = 0;
      assert.equal(openingClueText(known, tr(language)), letter);
    }
    assert.deepEqual(s, before);
  }
});

test("witnesses reveal intimate motivations in phases even with progressive geographic clues", () => {
  const s = state("wheel"), profile = PARENT_PROFILES.wheel;
  for (const language of ["fr", "en"]) {
    for (const [stage, phase] of [[0, 0], [4, 1], [8, 2]]) {
      assert.equal(intimateWitness(s, stage, tr(language)), profile.witness[phase][language]);
    }
    s.trail.exploration.hints = [{ stage: 1, kind: "prefix", precision: "vague", col: 0, row: 0 }];
    s.trail.stages[1] = { col: 200, row: 0, name: "FUTURE SECRET" };
    const text = parentClueText(s, { kind: "discuss", step: 0, nextName: "FUTURE SECRET" }, tr(language));
    assert.ok(text.includes(profile.witness[0][language]));
    assert.doesNotMatch(text, /FUTURE SECRET/);
  }
});

test("generated riddles supplement a deterministic plain clue and survive serialization", () => {
  const s = state(), hint = { stage: 0, kind: "prefix", precision: "vague", col: 0, row: 0 };
  s.trail.exploration.hints.push(hint);
  const evidence = { ...hint, type: "riddle" }, text = { fr: "Un souvenir se tourne vers HI.", en: "A memory turns towards HI." };
  const next = rememberParentWording(s, evidence, text);
  const restored = JSON.parse(JSON.stringify(next));
  validateParentWording(restored);
  assert.equal(s.parentWording, undefined);
  for (const language of ["fr", "en"]) {
    const result = fieldClueText(restored, hint, tr(language));
    assert.ok(result.startsWith(text[language]));
    assert.ok(result.endsWith(fieldClueText(s, hint, tr(language))));
    assert.doesNotMatch(result, /HIDDEN DESTINATION/);
  }
  assert.throws(() => rememberParentWording(s, { type: "witness", stage: 5 }, text), /not been earned/);
  restored.parentWording[0].text.fr = "<script>";
  assert.throws(() => validateParentWording(restored), /Invalid/);
});

test("live parent wording is capability-owned, keyed per earned evidence and never sends the full state", async () => {
  const requests = [], s = state(), evidence = { type: "witness", stage: 0 };
  const live = createLiveNarrative({ fetcher: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    assert.equal(options.headers["X-Journal-Capability"], s.journalAccess);
    return new Response(JSON.stringify({ enabled: true, brief: PARENT_CLUE, status: "ready",
      text: { fr: "Le retour était promis.", en: "Returning was promised." }, alternatives: [] }));
  } });
  live.prefetchParent(s, evidence);
  await flush();
  assert.equal(live.parentRecord(s, evidence).status, "ready");
  live.prefetchParent(s, evidence);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], { journey: s.serverJourney.id, brief: PARENT_CLUE, evidence });
  assert.doesNotMatch(JSON.stringify(requests), /HIDDEN DESTINATION|journalAccess|intimacy/);
});

test("generated parent wording is displayed only after saving and failures retain authored evidence", async () => {
  let s = state(), record, listener, mutations = 0;
  s.trail.history.push({ clueKind: "discuss" });
  const evidence = { type: "witness", stage: 0 }, key = parentWordingKey(evidence);
  const text = { fr: "Le souvenir comptait.", en: "The memory mattered." };
  const status = {}, narrative = {
    subscribe(fn) { listener = fn; }, parentRecord() { return record; },
    prefetchParent() { record = { status: "queued" }; },
  };
  const ui = setupParentNarrative({ context: () => s, narrative, status, t: tr("en"),
    mutate(transform) { mutations++; s = transform(s); return true; } });
  ui.update(); await flush();
  assert.equal(s.parentWording, undefined);
  record = { status: "ready", text }; listener(); await flush();
  assert.equal(s.parentWording[0].key, key);
  assert.equal(intimateWitness(s, 0, tr("en")), text.en);
  ui.update(); await flush();
  assert.equal(mutations, 1);
  s = state(); s.trail.history.push({ clueKind: "discuss" }); record = { status: "failed" };
  listener(); await flush();
  assert.equal(s.parentWording, undefined);
  assert.match(status.textContent, /failed/);
  assert.equal(intimateWitness(s, 0, tr("fr")), PARENT_PROFILES.fool.witness[0].fr);
});

test("storage errors remain visible and never expose unsaved generated testimony", async () => {
  const s = state(), status = {};
  s.trail.history.push({ clueKind: "discuss" });
  const narrative = { subscribe() {}, parentRecord() {
    return { status: "ready", text: { fr: "Texte non sauvegardé.", en: "Unsaved text." } };
  } };
  let attempts = 0;
  const ui = setupParentNarrative({ context: () => s, narrative, status, t: tr("en"),
    mutate() { attempts++; return false; } });
  ui.update(); await flush();
  assert.equal(s.parentWording, undefined);
  assert.match(status.textContent, /could not be saved/);
  ui.update(); await flush();
  assert.equal(attempts, 1);
  assert.match(status.textContent, /reload/);
  assert.notEqual(intimateWitness(s, 0, tr("en")), "Unsaved text.");
});
