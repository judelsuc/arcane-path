import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupEquipment, townBoutique } from "../equipment-ui.mjs";
import { beginEquipment, equipmentAction } from "../equipment.mjs";
import { translate } from "../i18n.mjs";

for (const language of ["fr", "en"]) {
  test(`${language} equipment purchases live in the town shop, not the inventory`, async t => {
    const originalDocument = globalThis.document, originalObserver = globalThis.MutationObserver;
    t.after(() => {
      globalThis.document = originalDocument;
      globalThis.MutationObserver = originalObserver;
    });
    class Element {
      children = []; events = {}; dataset = {}; style = {}; open = false; disabled = false; textContent = "";
      constructor(tagName, id) { this.tagName = tagName; this.id = id; }
      get ownerDocument() { return globalThis.document; }
      append(...children) { this.children.push(...children); }
      replaceChildren(...children) { this.children = children; }
      setAttribute(name, value) { this[name] = value; }
      removeAttribute(name) { delete this[name]; }
      addEventListener(type, callback) { this.events[type] = callback; }
      click() { if (!this.disabled) this.events.click?.(); }
      focus() {}
      showModal() { this.open = true; }
      close() { this.open = false; }
      descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
      querySelector(selector) {
        return this.descendants().find(child => selector.startsWith("#") ? child.id === selector.slice(1)
          : selector.startsWith(".") ? child.className?.split(" ").includes(selector.slice(1))
          : child.tagName === selector);
      }
    }
    const body = new Element("body");
    for (const id of ["equipment-travel", "dog-travel", "town-equipment-shop", "town-dialog"]) {
      body.append(new Element(id.endsWith("dialog") ? "dialog" : "button", id));
    }
    const $ = selector => selector === "dialog[open]"
      ? body.descendants().find(node => node.tagName === "dialog" && node.open)
      : body.querySelector(selector);
    globalThis.document = { body, documentElement: { lang: language }, querySelector: $,
      createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag) };
    globalThis.MutationObserver = class { observe() {} };
    let state = beginEquipment({ elapsedMinutes: 0, walletCents: 20000, ended: null });
    let cell = { terrain: "place" }, blocked = false;
    const actions = [];
    const ui = setupEquipment((key, args) => translate(language, key, args), {
      context: () => ({ state, cell, blocked }),
      act(action) {
        actions.push(action);
        const result = equipmentAction(state.equipment, action, {
          expectedRevision: state.equipment.revision, elapsedMinutes: state.elapsedMinutes,
          walletCents: state.walletCents, atShop: true,
        });
        state = { ...state, equipment: result.state, walletCents: state.walletCents + result.walletDeltaCents };
      },
    });
    const buttons = dialog => dialog.descendants().filter(node => node.tagName === "button");
    const buyButtons = () => buttons($("#equipment-shop-dialog"))
      .filter(node => node.textContent.startsWith(language === "fr" ? "Acheter ·" : "Buy ·"));
    ui.update();
    $("#equipment-travel").click();
    assert.equal($("#equipment-dialog").open, true);
    assert.ok(buttons($("#equipment-dialog")).every(node => !node.textContent.startsWith(language === "fr" ? "Acheter ·" : "Buy ·")));
    $("#equipment-dialog").close();
    $("#town-dialog").showModal();
    const before = structuredClone(state);
    $("#town-equipment-shop").click();
    assert.equal($("#town-dialog").open, false);
    assert.equal($("#equipment-shop-dialog").open, true);
    assert.equal($("#equipment-dialog").open, false);
    assert.deepEqual(state, before);
    assert.ok(buyButtons().length > 0);
    const effects = $("#equipment-shop-dialog").descendants().filter(node => node.className === "equipment-effect");
    assert.equal(effects.length, buyButtons().length, "each purchasable item shows its effect in the boutique");
    assert.ok(effects.some(node => node.textContent.includes("35")), "the raincoat effect is readable at purchase time");
    const count = buyButtons().length;
    buyButtons().find(button => !button.disabled).click();
    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, "buy");
    assert.ok(state.walletCents < before.walletCents);
    assert.equal(buyButtons().length, count - 1);
    assert.equal($("#equipment-shop-dialog").querySelector(".equipment-status").textContent,
      language === "fr" ? "C’est fait." : "Done.");
    $("#equipment-shop-dialog").close();
    cell = { terrain: "forest" };
    ui.update();
    assert.equal($("#town-equipment-shop").disabled, true);
    cell = { terrain: "place" };
    blocked = true;
    ui.update();
    assert.equal($("#town-equipment-shop").disabled, true);
    ui.reset();
    await Promise.resolve();
  });
}

test("town menu exposes the dedicated equipment shop", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const town = html.slice(html.indexOf('<dialog id="town-dialog"'), html.indexOf('<dialog id="conversation-dialog"'));
  assert.match(town, /id="town-equipment-shop"[^>]*aria-controls="equipment-shop-dialog"/);
});

test("the shop heading uses an equipment-relevant mapped boutique or a generic fallback", () => {
  const outdoor = { osmId: "node/9", name: "Au Vieux Campeur", category: "shop", tags: { shop: "outdoor" } };
  const bakery = { osmId: "node/2", name: "Boulangerie Rolland", category: "shop", tags: { shop: "bakery" } };
  const vacant = { osmId: "node/1", name: "Ancienne échoppe", category: "shop", tags: { shop: "vacant" } };
  const unnamed = { osmId: "node/3", name: " ", category: "shop", tags: { shop: "clothes" } };
  const cell = { terrain: "place", pois: [bakery, vacant, unnamed, outdoor] };
  assert.equal(townBoutique(cell), outdoor, "equipment-relevant shops outrank other named shops");
  assert.equal(townBoutique({ terrain: "place", pois: [bakery] }), bakery);
  assert.equal(townBoutique({ terrain: "place", pois: [vacant, unnamed] }), null);
  assert.equal(townBoutique({ terrain: "place" }), null);
});

test("the shop dialog is styled as a compact boutique with its own background", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const shop = css.slice(css.indexOf("#equipment-shop-dialog {"));
  assert.match(shop, /#equipment-shop-dialog \{[^}]*repeating-linear-gradient/, "a drawn shop background");
  assert.match(shop, /#equipment-shop-dialog \.catalogue-art svg \{ width: 44px; height: 40px; \}/,
    "shop item art stays small");
});
