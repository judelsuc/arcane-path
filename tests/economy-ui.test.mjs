import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupEconomyUI } from "../economy-ui.mjs";
import { askHospitality } from "../hospitality.mjs";
import { startSurvival } from "../survival.mjs";
import { applyBirthTarot, startEconomy, mealOffers } from "../economy.mjs";
import { translate } from "../i18n.mjs";
import { NARRATIVE_BRIEFS } from "../live-narrative.mjs";
import { withDiscoveredAccommodations } from "../accommodations.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const economy = json("../public/economy.json");
const survival = json("../public/config.json").survival;
const info = { latitude: 44.54, longitude: 2.3 };
const town = { terrain: "place", countryCodes: ["FR"],
  settlements: [{ osmId: "node/123", name: "Firmi" }] };
const start = offset => applyBirthTarot(startEconomy(startSurvival(14, 10,
  Date.UTC(2026, 9, 17, 12) + offset, "balanced", survival), economy, () => 0), economy);

for (const language of ["en", "fr"]) {
  test(`${language} hospitality NPC speech uses cached public dialogue without rewording active choices`, async t => {
    let cached = null, notify;
    const requested = [];
    const narrative = {
      prefetch(_, ids) { requested.push(...ids); },
      snapshot: () => cached,
      status: () => "Optional OVH wording status",
      subscribe(fn) { notify = fn; },
    };
    const h = harness(t, language, undefined, undefined, narrative);
    const before = structuredClone(h.current().state);
    await h.ui.open("sleep");
    assert.equal(h.element("#economy-dream-help").hidden, false);
    assert.equal(h.element("#economy-dream-help").textContent, translate(language, "trailDreamRules"));
    const [speech, status] = h.element("#economy-shelter-context").siblings;
    assert.equal(speech.textContent, NARRATIVE_BRIEFS["npc.hospitality.greeting"][language]);
    const choices = h.buttons().map(button => button.textContent);
    cached = { en: "“What brings you along this road?”", fr: "« Qu'est-ce qui vous amène sur ce chemin ? »" };
    notify();
    h.ui.localize();
    assert.equal(speech.textContent, NARRATIVE_BRIEFS["npc.hospitality.greeting"][language]);
    assert.deepEqual(h.buttons().map(button => button.textContent), choices);
    assert.deepEqual(h.current().state, before);
    assert.match(status.textContent, /OVH/);
    h.ui.reset();
    await h.ui.open("sleep");
    assert.equal(speech.textContent, cached[language]);
    assert.ok(requested.every(id => id.startsWith("npc.hospitality.")));
    assert.equal(h.actions.length, 0);
    cached = null;
    h.buttons()[0].click();
    const outcome = h.current().state.hospitalityAttempts.at(-1).outcome;
    assert.ok(["hosted", "refused"].includes(outcome));
    assert.equal(speech.textContent, NARRATIVE_BRIEFS[`npc.hospitality.${outcome}`][language]);
    assert.ok(h.element("#economy-options").children[0].children[1].textContent.includes(
      translate(language, `hospitalityResult.${outcome}`, {
        town: "Firmi", day: "2026-10-17",
        minutes: Math.round(h.current().state.hospitalityAttempts.at(-1).finishedMinutes),
      }).split("Firmi")[0]));
    assert.equal(h.actions.length, 1);
    cached = { en: `“Cached ${outcome} speech.”`, fr: `« Parole ${outcome} en cache. »` };
    h.ui.reset();
    const afterAction = structuredClone(h.current().state);
    await h.ui.open("sleep");
    assert.equal(speech.textContent, cached[language]);
    assert.deepEqual(h.current().state, afterAction);
    assert.equal(h.actions.length, 1);
  });
}

class Element {
  children = [];
  events = {};
  textContent = "";
  disabled = false;
  open = false;
  dataset = {};
  append(...children) { this.children.push(...children); }
  after(...siblings) { this.siblings = siblings; }
  replaceChildren() { this.children = []; }
  addEventListener(type, listener) { this.events[type] = listener; }
  click() { if (!this.disabled) this.events.click?.(); }
  close() { this.open = false; }
  showModal() { this.open = true; }
  focus() { this.focused = true; }
  scrollIntoView(options) { this.scrolled = options; }
  setAttribute(name, value) { this[name] = value; }
}
function harness(t, language = "en", findAccommodations, selectAccommodation, narrative) {
  const original = globalThis.document;
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  globalThis.document = {
    documentElement: { lang: language },
    querySelector: selector => selector === "dialog[open]"
      ? [...elements.values()].find(e => e.open) ?? null
      : selector === "#economy-hospitality-feedback"
      ? element("#economy-options").children[0]?.children[1] ?? null : element(selector),
    getElementById: id => element("#economy-options").children
      .flatMap(li => li.children).find(child => child.id === id) ?? null,
    createElement: () => new Element(),
  };
  t.after(() => { globalThis.document = original; });
  let current = { state: start(0), cell: town, info, survival, data: economy, blocked: false };
  const actions = [];
  const ui = setupEconomyUI((key, args) => translate(language, key, args), {
    narrative,
    findAccommodations,
    selectAccommodation,
    context: () => current,
    act: action => {
      actions.push(action);
      if (action.kind === "hospitality") current = { ...current, state:
        askHospitality(current.state, current.cell, info, survival, economy, () => 0, action.id) };
      return true;
    },
  });
  return { ui, element, actions, set: value => { current = { ...current, ...value }; },
    current: () => current, buttons: () => element("#economy-options").children.map(li => li.children[0]) };
}

function rulesFor(h, index = 0) {
  const description = h.element("#economy-options").children[index].children[1];
  const rules = description.siblings?.find(node => node.className === "window-help-text")
    ?? (description.className === "window-help-text" ? description : null);
  assert.ok(rules, "rule explanations remain available to contextual Help");
  return rules.textContent;
}

for (const language of ["fr", "en"]) {
  test(`${language} sleep automatically finds nearby real lodging without offering remote sleep`, async t => {
    let calls = 0;
    const h = harness(t, language, async () => {
      calls++;
      return { places: [{ id: "relation/51", name: "Nearby hostel", col: 16, row: 10,
        distance: 500, credit: "OpenStreetMap contributors", license: "ODbL",
        source: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/relation/51",
        licenseUrl: "https://www.openstreetmap.org/copyright" }], warnings: [] };
    });
    await h.ui.open("sleep");
    assert.equal(calls, 1);
    const item = h.element("#accommodation-results").children[0];
    assert.match(item.children[0].textContent, /Nearby hostel/);
    assert.match(item.children[0].textContent, /500 m/);
    assert.match(item.children[0].textContent, language === "fr" ? /est/ : /east/);
    assert.ok(h.buttons().every(button => !button.textContent.includes("Nearby hostel")));
    assert.equal(h.element("#nearby-accommodation").hidden, false);
    h.ui.reset();
    await h.ui.open("eat");
    assert.equal(calls, 1);
    assert.equal(h.element("#nearby-accommodation").hidden, true);
  });
}

test("travel to accommodation selects the actual lodging and closes without moving, paying or sleeping", async t => {
  const place = { id: "node/42", name: "Hotel", col: 16, row: 10, distance: 500,
    credit: "OpenStreetMap contributors", license: "ODbL", source: "OpenStreetMap",
    sourceUrl: "https://www.openstreetmap.org/node/42", licenseUrl: "https://www.openstreetmap.org/copyright" };
  let selected;
  const h = harness(t, "en", async () => ({ places: [place], warnings: [] }), p => { selected = p; });
  const before = structuredClone(h.current().state);
  await h.ui.open("sleep");
  const go = h.element("#accommodation-results").children[0].children.at(-1);
  assert.match(go.textContent, /Travel to/);
  go.click();
  assert.equal(selected, place);
  assert.equal(h.element("#economy-dialog").open, false);
  assert.deepEqual(h.current().state, before);
  assert.deepEqual(h.actions, []);
});

for (const language of ["fr", "en"]) {
  test(`${language} listed churches and hotels explain walking first and remain visible after a sparse live result`, async t => {
    const church = { id: "way/53", osmId: "way/53", name: "Notre-Dame", col: 21, row: 10,
      latitude: 44.54, longitude: 2.32, distance: 1854, tags: { amenity: "place_of_worship" },
      source: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/way/53",
      credit: "OpenStreetMap contributors", license: "ODbL", licenseUrl: "https://www.openstreetmap.org/copyright" };
    const hotel = { ...church, id: "node/54", osmId: "node/54", name: "Hôtel des Voyageurs",
      col: 30, distance: 4045, tags: { tourism: "hotel" } };
    let selected;
    const h = harness(t, language, async (_signal, progress) => {
      progress({ phase: "maps", cached: { places: [church, hotel], warnings: [] }, elapsedSeconds: 0 });
      return { places: [], warnings: [] };
    }, place => { selected = place; });
    const before = structuredClone(h.current().state);
    await h.ui.open("sleep");
    const items = h.element("#accommodation-results").children;
    assert.equal(items.length, 2, "the live response must not discard already mapped destinations");
    assert.match(items[0].children[0].textContent, /Notre-Dame.*1854/);
    assert.equal(items[0].children[1].textContent, translate(language, "accommodationWalkWorship"));
    assert.equal(items[0].children[2].className, "technical-text");
    assert.match(items[1].children[0].textContent, /Voyageurs.*4045/);
    assert.equal(items[1].children[1].textContent, translate(language, "accommodationWalkLodging"));
    assert.ok(h.buttons().every(button => !/Notre-Dame|Voyageurs/.test(button.textContent)));
    items[0].children.at(-1).click();
    assert.equal(selected, church);
    assert.deepEqual(h.current().state, before);
    assert.equal(h.actions.length, 0);
    h.set({ state: { ...before, col: church.col, row: church.row },
      cell: withDiscoveredAccommodations(town, [church, hotel], church.col, church.row) });
    await h.ui.open("sleep");
    assert.ok(h.buttons().some(button => /Notre-Dame/.test(button.textContent) && !button.disabled));
    assert.equal(h.element("#economy-shelter-context").textContent, translate(language, "shelterCellOnly"));
    assert.ok(h.buttons().every(button => !/Voyageurs/.test(button.textContent)));
    const here = h.element("#accommodation-results").children[0];
    assert.ok(here.children[1].textContent.includes(translate(language, "accommodationHereWorship")));
    h.buttons().find(button => /Notre-Dame/.test(button.textContent)).click();
    assert.deepEqual(h.actions, [{ kind: "hospitality", id: church.id }]);
    const after = h.current().state;
    assert.equal(after.hospitalityAttempts.at(-1).placeKind, "worship");
    assert.equal(after.walletCents, before.walletCents);
  });
}

for (const language of ["fr", "en"]) {
  test(`${language} hotels on the player's cell lead nearby and sleep choices without reordering other offers`, async t => {
    const col = -14, row = 0;
    const lodging = (id, name, c, r, distance, tourism = "hotel") => ({
      id: `node/${id}`, osmId: `node/${id}`, name, col: c, row: r, distance, tags: { tourism },
      credit: "OpenStreetMap contributors", license: "ODbL", source: "OpenStreetMap",
      sourceUrl: `https://www.openstreetmap.org/node/${id}`,
      licenseUrl: "https://www.openstreetmap.org/copyright",
    });
    const remote = lodging(1, "Closer but in another cell", col + 1, row, 10);
    const sameCol = lodging(2, "Same column, different row", col, row + 1, 15);
    const hostel = lodging(3, "Local hostel", col, row, 20, "hostel");
    const hotel = lodging(4, "Your hotel", col, row, 150);
    const second = lodging(5, "Second local hotel", col, row, 180);
    const places = [remote, sameCol, hostel, hotel, second];
    const before = structuredClone(places);
    let complete, selected;
    const h = harness(t, language, (signal, onProgress) => {
      onProgress({ phase: "maps", cached: { places, warnings: [] }, elapsedSeconds: 0 });
      return new Promise(resolve => { complete = resolve; });
    }, place => { selected = place; });
    h.set({ state: { ...h.current().state, col, row, walletCents: 100000 },
      cell: { ...town, pois: [hostel, hotel, second] } });
    const initialState = structuredClone(h.current().state);
    const opening = h.ui.open("sleep");
    const names = () => h.element("#accommodation-results").children.map(item => item.children[0].textContent);
    assert.match(names()[0], /Your hotel/);
    assert.ok(names()[0].includes(translate(language, "accommodationHere")));
    assert.match(names()[1], /Second local hotel/);
    assert.match(names()[2], /Local hostel/);
    assert.match(names()[3], /Closer but in another cell/);
    assert.match(names()[4], /Same column, different row/);
    assert.match(h.buttons()[0].textContent, /Your hotel/);
    assert.match(h.buttons()[1].textContent, /Second local hotel/);
    assert.ok(h.buttons()[2].textContent.includes(translate(language, "hospitalityAsk")));
    assert.ok(h.buttons()[3].textContent.includes(translate(language, "outdoorSleep")));
    assert.match(h.buttons()[4].textContent, /Local hostel/);
    complete({ places, warnings: [] });
    await opening;
    const labels = h.buttons().map(button => button.textContent);
    h.ui.localize();
    assert.deepEqual(h.buttons().map(button => button.textContent), labels);
    assert.deepEqual(places, before, "display ordering must not mutate cached/provider results");
    assert.deepEqual(h.current().state, initialState);
    h.element("#accommodation-results").children[0].children.at(-1).click();
    assert.equal(selected, hotel);
    assert.deepEqual(h.actions, [], "selecting a destination must not sleep or charge");
    const reopening = h.ui.open("sleep");
    complete({ places, warnings: [] });
    await reopening;
    h.buttons()[0].click();
    assert.deepEqual(h.actions, [{ kind: "sleep", id: hotel.osmId }]);
  });
}

test("lodging lookup errors stay visible and the search can be retried", async t => {
  let calls = 0;
  const h = harness(t, "en", async () => {
    if (!calls++) throw new Error("Provider offline");
    return { places: [], warnings: ["Catalogue not imported"] };
  });

  await h.ui.open("sleep");
  assert.match(h.element("#accommodation-status").textContent, /Try again/);
  assert.doesNotMatch(h.element("#accommodation-status").textContent, /Provider/);
  assert.match(h.element("#accommodation-details").textContent, /Provider offline/);
  assert.equal(h.element("#accommodation-search").disabled, false);
  await h.element("#accommodation-search").events.click();
  assert.match(h.element("#accommodation-status").textContent, /few addresses/);
  assert.match(h.element("#accommodation-details").textContent, /Catalogue not imported/);
});

test("cached lodging is shown before online search finishes and stays available after cancellation", async t => {
  let report, complete;
  const cached = { places: [{ id: "node/42", name: "Cached hostel", col: 16, row: 10, distance: 500,
    credit: "OpenStreetMap contributors", license: "ODbL", source: "OpenStreetMap",
    sourceUrl: "https://www.openstreetmap.org/node/42", licenseUrl: "https://www.openstreetmap.org/copyright" }], warnings: [] };
  const h = harness(t, "en", (signal, onProgress) => {
    report = onProgress;
    onProgress({ phase: "maps", cached, elapsedSeconds: 0 });
    return new Promise(resolve => { complete = resolve; });
  });
  const opening = h.ui.open("sleep");
  assert.match(h.element("#accommodation-results").children[0].children[0].textContent, /Cached hostel/);
  assert.match(h.element("#accommodation-details").textContent, /Provisional/);
  const item = h.element("#accommodation-results").children[0];
  report({ phase: "provider", cached, provider: "overpass.example.org", elapsedSeconds: 10 });
  assert.equal(h.element("#accommodation-results").children[0], item);
  await h.element("#accommodation-search").events.click();
  assert.match(h.element("#accommodation-status").textContent, /cancelled/);
  assert.match(h.element("#accommodation-details").textContent, /Provisional/);
  assert.equal(h.element("#accommodation-results").children.length, 1);
  complete({ places: [], warnings: [] });
  await opening;
  assert.equal(h.element("#accommodation-results").children.length, 1);
});

for (const language of ["fr", "en"]) {
  test(`${language} accommodation progress displays phase, provider and elapsed time without stale updates`, async t => {
    let report;
    const h = harness(t, language, (signal, onProgress) => {
      report = onProgress;
      return new Promise(() => {});
    });
    void h.ui.open("sleep");
    const options = h.buttons();
    report({ phase: "provider", provider: "overpass.example.org", elapsedSeconds: 12 });
    assert.deepEqual(h.buttons(), options);
    assert.equal(h.element("#accommodation-status").textContent, translate(language, "accommodationLoading"));
    assert.match(h.element("#accommodation-details").textContent, /OpenStreetMap/);
    assert.match(h.element("#accommodation-details").textContent, /overpass.example.org/);
    assert.match(h.element("#accommodation-details").textContent, /12 s/);
    await h.element("#accommodation-search").events.click();
    report({ phase: "saving", elapsedSeconds: 15 });
    assert.doesNotMatch(h.element("#accommodation-details").textContent, /15 s|overpass.example.org/);
  });

  test(`${language} a pending lodging search remains cancellable and can be restarted safely`, async t => {
    const pending = [];
    const h = harness(t, language, signal => new Promise(resolve => pending.push({ signal, resolve })));
    const opening = h.ui.open("sleep");
    const button = h.element("#accommodation-search");
    assert.equal(button.disabled, false);
    assert.equal(button.dataset.i18n, "accommodationCancel");
    assert.match(button.textContent, language === "fr" ? /Annuler/ : /Cancel/);
    assert.equal(h.element("#accommodation-status").textContent, translate(language, "accommodationLoading"));
    await button.events.click();
    assert.equal(pending[0].signal.aborted, true);
    assert.equal(button.disabled, false);
    assert.equal(button.dataset.i18n, "accommodationSearch");
    assert.match(h.element("#accommodation-status").textContent, language === "fr" ? /annulée/ : /cancelled/);
    const retry = button.events.click();
    assert.equal(pending.length, 2);
    pending[0].resolve({ places: [], warnings: ["Stale result"] });
    await opening;
    assert.equal(button.dataset.i18n, "accommodationCancel");
    assert.doesNotMatch(h.element("#accommodation-status").textContent, /Stale result/);
    pending[1].resolve({ places: [], warnings: [] });
    await retry;
    assert.equal(button.dataset.i18n, "accommodationSearch");
    assert.equal(button.disabled, false);
    assert.doesNotMatch(h.element("#accommodation-status").textContent, /cancelled|annulée|4 minutes/);
  });
}

test("closing sleep cancels lookup and ignores late responses", async t => {
  let complete, signal;
  const h = harness(t, "en", currentSignal => {
    signal = currentSignal;
    return new Promise(resolve => { complete = resolve; });
  });
  const opening = h.ui.open("sleep");
  h.element("#economy-dialog").close();
  h.element("#economy-dialog").events.close();
  assert.equal(signal.aborted, true);
  complete({ places: [], warnings: ["Late result"] });
  await opening;
  assert.doesNotMatch(h.element("#accommodation-status").textContent, /Late result/);
});

for (const language of ["fr", "en"]) {
  test(`${language} meal menu shows the actual daily prices and matching calorie recovery without rerolls`, async t => {
    const h = harness(t, language);
    await h.ui.open("eat");
    const current = h.current();
    const offers = mealOffers(current.state, current.cell, current.info, current.data);
    const labels = h.buttons().map(button => button.textContent);
    assert.equal(labels.length, offers.length);
    offers.forEach((offer, i) => {
      assert.ok(labels[i].includes((offer.cents / 100).toFixed(2)));
      assert.ok(rulesFor(h, i).includes(`+${offer.reserveKcal}`));
      assert.doesNotMatch(h.element("#economy-options").children[i].children[1].textContent, /kcal/);
    });
    assert.match(h.element("#economy-pricing").textContent, /70–150/);
    h.ui.localize();
    assert.deepEqual(h.buttons().map(button => button.textContent), labels);
    h.buttons()[0].click();
    assert.deepEqual(h.actions[0], { kind: "meal", id: offers[0].id });
  });
}

test("sleep menu explains missing OSM lodging, offers hospitality, and saves/displays the outcome in place", async t => {
  const h = harness(t);
  await h.ui.open("sleep");
  assert.ok(h.element("#economy-shelter-context").textContent);
  assert.doesNotMatch(h.element("#economy-shelter-context").textContent, /250 m/);
  assert.match(h.buttons()[0].textContent, /Ask locals and sleep if welcomed/);
  assert.equal(h.buttons()[0].disabled, false);
  h.buttons()[0].click();
  assert.deepEqual(h.actions, [{ kind: "hospitality" }]);
  assert.equal(h.element("#economy-dialog").open, true);
  assert.equal(h.buttons()[0].disabled, true);
  assert.equal(h.element("#economy-hospitality-result").textContent, "");
  const feedback = h.element("#economy-options").children[0].children[1];
  assert.equal(feedback.dataset.feedback, h.current().state.hospitalityAttempts.at(-1).outcome === "hosted"
    ? "success" : "failure");
  assert.match(feedback.textContent, /Firmi, (?:on )?2026-10-17:/);
  assert.equal(feedback.focused, true);
  assert.deepEqual(feedback.scrolled, { block: "nearest" });
  assert.match(rulesFor(h), /Only one request/);
  assert.doesNotMatch(feedback.textContent, /Only one request/);
  h.buttons()[0].click();
  assert.equal(h.actions.length, 1);
  h.buttons()[1].click();
  assert.deepEqual(h.actions.at(-1), { kind: "sleep", id: null });
  assert.equal(h.element("#economy-dialog").open, false);
  assert.equal(h.element("#ascii-map").focused, true);
});

test("hospitality is absent outside named settlements and mapped accommodation stays usable", async t => {
  const h = harness(t, "fr");
  h.set({ cell: { terrain: "road", countryCodes: ["FR"], pois: [
    { osmId: "node/5", name: "Auberge", tags: { tourism: "hostel" } },
  ] } });
  await h.ui.open("sleep");
  assert.equal(h.buttons().length, 2);
  assert.match(h.element("#economy-shelter-context").textContent, /qui demander/);
  assert.doesNotMatch(h.element("#economy-shelter-context").textContent, /cartographi|250 m/);
  h.buttons()[1].click();
  assert.deepEqual(h.actions, [{ kind: "sleep", id: "node/5" }]);
  await h.ui.open("eat");
  assert.equal(h.element("#economy-shelter-context").textContent, "");
  assert.equal(h.element("#economy-hospitality-result").textContent, "");
  assert.ok(h.buttons().every(button => !button.textContent.includes("hospitalité")));
});

for (const language of ["fr", "en"]) {
  test(`${language} worship shelter works outside towns and displays immediate per-place feedback`, async t => {
    const h = harness(t, language);
    const cell = { terrain: "church", pois: [
      { osmId: "way/201", name: "Église", tags: { amenity: "place_of_worship" } },
      { osmId: "node/202", name: "Mosque", tags: { amenity: "place_of_worship", religion: "muslim" } },
      { osmId: "node/203", name: "Private", tags: { amenity: "place_of_worship", access: "private" } },
    ] };
    h.set({ cell });
    await h.ui.open("sleep");
    assert.equal(h.buttons().length, 3);
    assert.match(h.buttons()[0].textContent, /Mosque/);
    const note = h.element("#economy-options").children[0].children[1];
    assert.doesNotMatch(note.textContent, /ficti/i);
    assert.match(rulesFor(h), /30 min/);
    assert.match(h.buttons()[0].textContent, /30 min/);
    h.buttons()[0].click();
    assert.deepEqual(h.actions, [{ kind: "hospitality", id: "node/202" }]);
    assert.equal(h.buttons()[0].disabled, true);
    assert.equal(h.buttons()[1].disabled, false);
    assert.equal(h.element("#economy-dialog").open, true);
    const feedback = h.element("#economy-options").children[0].children[1];
    assert.doesNotMatch(feedback.textContent, /dans le jeu|game attempt|tarot|%/);
    assert.match(rulesFor(h), language === "fr" ? /même en cas de refus/ : /even if refused/);
    assert.equal(feedback.focused, true);
    assert.deepEqual(feedback.scrolled, { block: "nearest" });
    assert.equal(h.element("#economy-hospitality-result").textContent, "");
  });

  test(`${language} regional and national dishes expose their geographic scope and documentary source`, async t => {
    const h = harness(t, language);
    h.set({ info: { latitude: 40.42, longitude: -3.7 }, cell: { terrain: "place", countryCodes: ["ES"] } });
    await h.ui.open("eat");
    assert.match(h.buttons()[1].textContent, /Tortilla/);
    let item = h.element("#economy-options").children[1];
    assert.match(item.children[1].textContent, language === "fr" ? /Plat traditionnel/ : /Traditional dish/);
    assert.equal(item.children[2].href, "https://en.wikipedia.org/wiki/Spanish_omelette");
    h.ui.reset();
    h.set({ info: { latitude: 49.387, longitude: 3.005 }, cell: { terrain: "place", countryCodes: ["FR"] } });
    await h.ui.open("eat");
    item = h.element("#economy-options").children[1];
    assert.match(item.children[0].textContent, /Ficelle/);
    assert.match(item.children[1].textContent, /Picardie/);
  });

  test(`${language} hospitality opening is read-only and a refusal stays visible beside the disabled action`, async t => {
    const h = harness(t, language);
    let state;
    for (let offset = 0; offset < 100; offset++) {
      const candidate = start(offset);
      if (askHospitality(candidate, town, info, survival, economy).hospitalityAttempts[0].outcome === "refused") {
        state = candidate;
        break;
      }
    }
    assert.ok(state);
    h.set({ state });
    const before = structuredClone(state);
    await h.ui.open("sleep");
    assert.deepEqual(h.current().state, before);
    assert.deepEqual(h.actions, []);
    assert.equal(h.buttons()[0].disabled, false);
    h.buttons()[0].click();
    const feedback = h.element("#economy-options").children[0].children[1];
    assert.match(feedback.textContent, language === "fr" ? /Hospitalité refusée/ : /Hospitality refused/);
    assert.equal(feedback.dataset.feedback, "failure");
    assert.match(feedback.textContent, language === "fr" ? /Vous n'avez pas dormi/ : /You did not sleep/);
    assert.match(feedback.textContent, /30 min/);
    assert.match(rulesFor(h), language === "fr" ? /même en cas de refus/ : /even if refused/);
    assert.match(rulesFor(h), language === "fr" ? /prochain jour de jeu/ : /next game day/);
    assert.doesNotMatch(feedback.textContent, /tarot|%|UTC/);
    assert.equal(feedback.role, "status");
    assert.equal(feedback.focused, true);
    assert.deepEqual(feedback.scrolled, { block: "nearest" });
    assert.equal(h.buttons()[0].disabled, true);
    h.ui.reset();
    h.set({ cell: { ...town, settlements: [{ osmId: "node/456", name: "Next town" }] } });
    await h.ui.open("sleep");
    assert.equal(h.buttons()[0].disabled, false);
    assert.doesNotMatch(h.element("#economy-options").children[0].children[1].textContent,
      language === "fr" ? /déjà demandé/ : /already asked/);
    assert.equal(h.current().state.hospitalityAttempts.length, 1);
  });

  test(`${language} user's previous-day Tremblay refusal does not block the next day's request`, async t => {
    const h = harness(t, language);
    h.set({ state: { ...start(0), startedAt: 1792250169304, elapsedMinutes: 3881.4635429626146,
      hospitalityAttempts: [{
        townId: "node/26691640", townName: "Tremblay-en-France", day: "2026-10-19",
        outcome: "refused", startedMinutes: 2809.7234818739466, finishedMinutes: 2839.7234818739466,
      }],
    }, cell: { ...town, settlements: [{ osmId: "node/26691640", name: "Tremblay-en-France" }] } });
    await h.ui.open("sleep");
    assert.equal(h.buttons()[0].disabled, false);
    assert.doesNotMatch(h.element("#economy-options").children[0].children[1].textContent,
      language === "fr" ? /déjà demandé/ : /already asked/);
    assert.deepEqual(h.actions, []);
  });

  test(`${language} food menu offers basic meals beyond specialties and mapped restaurant names with sources`, async t => {
    const h = harness(t, language);
    h.set({ info: { latitude: 45.182, longitude: 5.616 }, cell: {
      ...town, pois: [{ osmId: "node/42", name: "Le Café du village", tags: { amenity: "restaurant" } }],
    } });
    await h.ui.open("eat");
    assert.equal(h.element("#economy-empty").hidden, true);
    assert.equal(h.buttons().length, 2);
    assert.match(h.buttons()[0].textContent, language === "fr" ? /Repas simple/ : /Basic meal/);
    assert.match(h.buttons()[1].textContent, /Le Café du village/);
    const item = h.element("#economy-options").children[1];
    assert.equal(item.children[2].href, "https://www.openstreetmap.org/node/42");
    assert.doesNotMatch(item.children[1].textContent, /ficti|not verified|non vérifiés/i);
    h.buttons()[1].click();
    assert.deepEqual(h.actions, [{ kind: "meal", id: "basic-meal@node/42" }]);
    h.set({ state: { ...h.current().state, walletCents: 0 } });
    await h.ui.open("eat");
    assert.ok(h.buttons().every(button => button.disabled));
  });

  test(`${language} time cost stays on the action while probability and sleep rules move to Help`, async t => {
    const h = harness(t, language);
    await h.ui.open("sleep");
    const note = rulesFor(h);
    assert.match(h.buttons()[0].textContent, /30 min/);
    assert.equal(h.element("#economy-options").children[0].children[1].textContent, "");
    assert.match(note, /30 min/);
    assert.match(note, /8 h/);
    assert.match(note, /UTC/);
    assert.match(note, /tarot/);
    assert.match(note, /%/);
    assert.match(note, language === "fr" ? /immédiatement/ : /immediately/);
    assert.match(note, language === "fr" ? /sans repas/ : /without a meal/);
    h.ui.reset();
  });
}
