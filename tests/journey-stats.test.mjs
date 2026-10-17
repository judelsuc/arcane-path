import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { journeyStats } from "../journey-stats.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { beginPressures } from "../pressures.mjs";
import { setupPhotoJournal } from "../photo-journal.mjs";
import { translate } from "../i18n.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const survival = json("../public/config.json").survival, economy = json("../public/economy.json");
function context() {
  const state = beginPressures(startEconomy(startSurvival(1, 2,
    Date.UTC(2026, 9, 17), "balanced", survival), economy, () => 0), economy);
  return { state: { ...state, name: "Alex", elapsedMinutes: 1503, distanceMeters: 12340,
    ascentMeters: 123, descentMeters: 45, walletCents: 1234, performances: 3, faints: 2,
    choiceCounts: { forage: 1, beg: 2, steal: 0 },
    trail: { index: 2, arrivals: [{ stage: 0 }, { stage: 1 }, { stage: 2 }],
      parentName: "Secret parent", stages: [{ name: "Hidden target" }] },
    serverJourney: { id: "secret-id" }, journalAccess: "secret-capability" }, survival, economy };
}

for (const locale of ["fr", "en"]) {
  test(`${locale} statistics show exact saved totals, needs, pressures and both cards without hidden clues`, () => {
    const current = context(), t = (key, args) => translate(locale, key, args);
    const groups = journeyStats(current, t, locale);
    const rows = new Map(groups.flatMap(g => g.rows.map(r => [r.label, r.value])));
    assert.equal(groups.length, 5);
    assert.equal(rows.get(t("statsElapsed")), t("statsDuration", { days: 1, hours: 1, minutes: 3 }));
    assert.equal(rows.get(t("statsDistance")), "12.34 km");
    assert.equal(rows.get(t("statsWallet")), "12.34 €");
    assert.equal(rows.get(t("statsReached")), "3");
    assert.equal(rows.get(t("statsMusic")), "3");
    assert.equal(rows.get(t("statsFaints")), "2");
    assert.equal(rows.get(t("statsVigilanceRate")), "100%");
    assert.equal(rows.get(t("statsBirthCard")), economy.tarot[0][locale]);
    assert.equal(rows.get(t("statsDailyCard")), economy.tarot[0][locale]);
    assert.doesNotMatch(JSON.stringify(groups), /Hidden target|Secret parent|secret-id|secret-capability/);
    const legacy = { ...current, state: { ...current.state, pressures: undefined } };
    assert.equal(journeyStats(legacy, t, locale).length, 4);
    const resumed = { ...current, state: { ...current.state,
      trail: { ...current.state.trail, arrivals: [{ stage: 2 }] } } };
    const reached = journeyStats(resumed, t, locale).flatMap(g => g.rows)
      .find(r => r.label === t("statsReached"));
    assert.equal(reached.value, "3");
    const ended = journeyStats({ ...current, state: { ...current.state, ended: "placement" } }, t, locale);
    assert.ok(JSON.stringify(ended).includes(t("journeyEnded.placement")));
  });

  test(`${locale} notebook statistics are live, separate, reset per journey and absent from found notebooks`, async test => {
    const original = globalThis.document;
    test.after(() => { globalThis.document = original; });
    class Element {
      dataset = {}; children = []; events = {}; open = false; textContent = "";
      append(...children) { this.children.push(...children); }
      replaceChildren(...children) { this.children = children; }
      addEventListener(event, callback) { this.events[event] = callback; }
      showModal() { this.open = true; }
      close() { this.open = false; this.events.close?.(); }
      getContext() {
        return { fillRect() {}, setLineDash() {}, beginPath() {}, moveTo() {}, lineTo() {},
          stroke() {}, fillText() {}, arc() {}, fill() {} };
      }
    }
    const elements = new Map(), element = selector => {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    };
    globalThis.document = { documentElement: { lang: locale }, createElement: () => new Element(),
      querySelector: selector => selector === "dialog[open]"
        ? [...elements.values()].find(e => e.open) ?? null : element(selector) };
    const t = (key, args) => translate(locale, key, args);
    let writes = 0;
    const ui = setupPhotoJournal(t, { store: {
      list: async () => [], get: async () => null, scope: async function() { return this; },
      pin: async () => { writes++; },
    } });
    const current = context();
    await ui.useJourney(current.state);
    ui.updateStats(current);
    element("#open-journal").events.click();
    await new Promise(resolve => setImmediate(resolve));
    element("#journal-stats-page").events.click();
    const text = node => [node.textContent, ...node.children.map(text)].join(" ");
    assert.equal(element("#journal-pages").dataset.statistics, "true");
    assert.match(text(element("#journal-pages")), /12\.34 km/);
    assert.equal(element("#journal-next").disabled, true);
    assert.equal(element("#journal-previous").disabled, true);
    assert.equal(writes, 0);
    ui.updateStats({ ...current, state: { ...current.state, walletCents: 9876 } });
    assert.match(text(element("#journal-pages")), /98\.76/);
    element("#journal-map-page").events.click();
    assert.equal(element("#journal-pages").dataset.mapping, "true");
    assert.equal(element("#journal-next").disabled, true);
    assert.ok(text(element("#journal-pages")).includes(t("journalMapNote")));
    assert.doesNotMatch(text(element("#journal-pages")), /Hidden target|Secret parent/);
    element("#journal-photos-page").events.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(element("#journal-pages").dataset.statistics, "false");
    assert.ok(text(element("#journal-pages")).includes(t("journalEmpty")));
    await ui.useJourney({ ...current.state, serverJourney: { id: "new-journey" } });
    ui.updateStats(context());
    assert.equal(element("#journal-pages").dataset.statistics, "false");
    element("#photo-journal-dialog").close();
    await ui.showAbandoned([], ["A shared clue"]);
    assert.equal(element("#journal-stats-page").hidden, true);
    assert.equal(element("#journal-map-page").hidden, true);
    element("#journal-map-page").events.click();
    element("#journal-stats-page").events.click();
    assert.doesNotMatch(text(element("#journal-pages")), /98\.76|12\.34 km/);
    assert.equal(writes, 0);
  });
}
