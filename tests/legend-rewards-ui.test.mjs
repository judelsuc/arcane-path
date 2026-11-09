import test from "node:test";
import assert from "node:assert/strict";
import { renderTreasureInventory } from "../legend-rewards-ui.mjs";
import { treasureId, composedReward } from "../legend-rewards.mjs";

class Element {
  children = [];
  events = {};
  style = {};
  attributes = {};
  textContent = "";
  constructor(tagName, doc) { this.tagName = tagName; this.ownerDocument = doc; }
  append(node) { this.children.push(node); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
  async click() { if (!this.disabled) await this.events.click?.(); }
  getContext() { return { fillRect() {} }; }
}
const descendants = node => [node, ...node.children.flatMap(descendants)];
function fixture(language = "en", respond = async () => ({ revision: 1 }), { seed, equipped = false } = {}) {
  const doc = { createElement: tag => new Element(tag, doc) };
  const host = new Element("section", doc), calls = [];
  const id = treasureId("node/42", seed ?? 1, seed !== undefined);
  const reward = seed === undefined ? undefined : { ...composedReward(seed),
    name: { en: "Copper Vigil", fr: "Veille de cuivre" } };
  let state = { serverJourney: { id: "a".repeat(32) }, artifactRevision: 1,
    treasures: { version: 1, equipped: null, jewelEquipped: equipped ? id : null,
      inventory: [{ id, ...(reward ? { reward } : {}), placement: { id, x: 0, y: 0, rotated: false } }] } };
  let refreshed = 0;
  renderTreasureInventory(host, { state, language, blocked: false,
    getState: () => state, onRefresh: () => { refreshed++; },
    onAction: async action => { calls.push(action); return respond(action); } });
  return { host, calls, id, refreshed: () => refreshed, state: value => { state = value; },
    button: label => descendants(host).find(node => node.tagName === "button" && node.textContent === label),
    text: () => descendants(host).map(node => node.textContent).join(" ") };
}
test("inventory shows physical cosmetic rewards, real map/adventure previews and equip/drop/packing controls in FR/EN", async () => {
  for (const language of ["en", "fr"]) {
    const f = fixture(language);
    assert.ok(descendants(f.host).find(node => node.tagName === "canvas" && node.attributes.role === "img"));
    assert.match(f.text(), /180 g/);
    await f.button(language === "en" ? "Equip map/adventure look" : "Utiliser l'apparence carte/aventures").click();
    assert.deepEqual(f.calls.at(-1), { type: "treasure-equip", id: f.id });
    await f.button(language === "en" ? "Equip UI skin" : "Habiller l'interface").click();
    assert.deepEqual(f.calls.at(-1), { type: "treasure-equip-ui", id: f.id });
    assert.ok(descendants(f.host).find(node => node.tagName === "canvas" &&
      node.attributes["aria-label"] === (language === "en" ? "Star watcher" : "Veilleur des étoiles")));
    await f.button(language === "en" ? "Equip player icon" : "Utiliser l'icône du personnage").click();
    assert.deepEqual(f.calls.at(-1), { type: "treasure-equip-icon", id: f.id });
    await f.button(language === "en" ? "Leave at this place" : "Déposer en ce lieu").click();
    assert.deepEqual(f.calls.at(-1), { type: "treasure-drop", id: f.id });
    await f.button(language === "en" ? "Pack" : "Ranger").click();
    assert.deepEqual(f.calls.at(-1), { type: "treasure-pack", id: f.id, x: 0, y: 0, rotated: false });
    assert.equal(f.refreshed(), 5);
  }
});
test("composed inventory presents named gear, consumables, lockpicks and icon-only rewards in both languages", async () => {
  for (const language of ["en", "fr"]) {
    const en = language === "en";
    for (const seed of [0, 49, 2, 5, 6, 10]) {
      const f = fixture(language, undefined, { seed });
      assert.match(f.text(), en ? /Copper Vigil/ : /Veille de cuivre/);
      assert.ok(f.button(en ? "Leave at this place" : "Déposer en ce lieu"));
      if ([0, 49].includes(seed)) {
        await f.button(en ? "Equip" : "Équiper").click();
        assert.deepEqual(f.calls.at(-1), { type: "treasure-equip-gear", id: f.id });
      } else if ([2, 5].includes(seed)) {
        await f.button(seed === 2 ? en ? "Open · €12.00" : "Ouvrir · 12.00 €" :
          en ? "Read chart" : "Lire la carte").click();
        assert.deepEqual(f.calls.at(-1), { type: "treasure-use", id: f.id });
      } else if (seed === 6) {
        const canvases = descendants(f.host).filter(node => node.tagName === "canvas");
        assert.equal(canvases.length, 1, "Icon rewards preview only their actual icon.");
        assert.equal(canvases[0].width, 48);
        assert.equal(f.button(en ? "Equip UI skin" : "Habiller l'interface"), undefined);
        assert.equal(f.button(en ? "Equip map/adventure look" : "Utiliser l'apparence carte/aventures"), undefined);
        await f.button(en ? "Equip player icon" : "Utiliser l'icône du personnage").click();
        assert.deepEqual(f.calls.at(-1), { type: "treasure-equip-icon", id: f.id });
      } else {
        assert.match(f.text(), /OpenCaching/);
        assert.equal(f.button(en ? "Equip" : "Équiper"), undefined);
      }
    }
    const cursed = fixture(language, undefined, { seed: 49, equipped: true });
    assert.match(cursed.text(), en ? /Cursed:.*40%.*50%.*only while equipped.*freely removable/ :
      /Maudit.*40 %.*50 %.*seulement équipé.*retrait libre/);
    await cursed.button(en ? "Unequip" : "Retirer").click();
    assert.deepEqual(cursed.calls.at(-1), { type: "treasure-equip-gear", id: cursed.id });
  }
});
test("treasure buttons cannot cross private journeys and errors remain visible without pretending success", async t => {
  t.mock.method(console, "error", () => {});
  const f = fixture();
  f.state({ serverJourney: { id: "b".repeat(32) }, artifactRevision: 1 });
  await f.button("Equip UI skin").click();
  assert.deepEqual(f.calls, []);
  assert.match(f.text(), /journey changed/);
  assert.equal(f.refreshed(), 0);
  const rejected = fixture("en", async () => ({ error: "Leave treasure at a mapped place." }));
  await rejected.button("Leave at this place").click();
  assert.match(rejected.text(), /mapped place/);
  assert.equal(rejected.refreshed(), 0);
  assert.equal(rejected.button("Leave at this place").disabled, false);
});
