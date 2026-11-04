import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupEquipment } from "../equipment-ui.mjs";
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
