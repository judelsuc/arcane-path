import { ITEMS, CAPACITY_GRAMS, equipmentModifiers, equipmentAction } from "./equipment.mjs";
import { equipmentShopAvailable } from "./equipment-journey.mjs";
import { renderInventory } from "./equipment-inventory-ui.mjs";
import { itemArt } from "./equipment-art.mjs";
import { dailyTarotPending } from "./economy.mjs";
import { journeyEventArt } from "./journey-event-art.mjs";
import { setFeedback } from "./feedback.mjs";

const copy = {
  fr: {
    title: "Sac et compagnon", close: "Fermer", load: "Charge", wallet: "Argent", condition: "État",
    boots: "Chaussures", backpack: "Sac à dos", raincoat: "Imperméable",
    sleepingBag: "Sac de couchage", tent: "Tente", camera: "Appareil photo",
    buy: "Acheter", repair: "Réparer", discard: "Abandonner sans remboursement", minutes: "min",
    shop: "Achats, réparations et provisions disponibles dans cette localité. Prix de jeu fixes.",
    noShop: "Rejoignez une localité pour acheter, réparer ou obtenir des provisions pour le chien.",
    bootsEffect: "Évite le malus de vitesse de 15 % des chaussures cassées.",
    backpackEffect: "Sac de 6 × 4 cases, charge totale maximale 5,5 kg, équipement porté compris.",
    raincoatEffect: "Réduit de 35 % les effets de la pluie sur la marche et la fatigue.",
    sleepingBagEffect: "Réduit de 20 % la fatigue nocturne ajoutée pendant le sommeil à la belle étoile.",
    tentEffect: "Permet de dormir sous tente dans un camping cartographié, pas de camper partout. Pas de repas inclus.",
    cameraEffect: "Bonus de qualité photo prévu : +10 %. Pas encore actif sur les photos du carnet.",
    rules: "Chaque kg ralentit de 2,5 %, augmente l'énergie de marche de 4 % et la fatigue de 6 %. Les objets s'usent en marchant ; cassés, ils restent lourds mais ne donnent plus de bonus. Réorganiser est gratuit ; abandonner est définitif.",
    dog: "Compagnon", noDog: "Pas de compagnon. Une rencontre sur le chemin peut vous proposer d'accueillir un chien.",
    encounter: "Rencontre sur le chemin", story: "Un chien sans collier vous suit et s'approche lorsque vous vous arrêtez. Voulez-vous voyager ensemble ?",
    name: "Nom du chien (1 à 40 caractères)", rename: "Nommer le chien",
    adopt: "Accueillir le chien", decline: "Continuer sans l'adopter", feed: "Nourrir", care: "Soigner et entretenir",
    hunger: "Faim", careNeed: "Besoin de soins", ready: "Bonus actifs : fatigue de marche ×0,95 ; chance d'indice +8 points ; revenus musicaux ×1,1 ; risque de vol lors d'un évanouissement nocturne ×0,9.",
    notReady: "Le chien a besoin d'attention : ses bonus sont suspendus (faim ou besoin de soins ≥65).",
    needs: "Faim : +4/h ; soins : +1/h et +0,8/km. Les besoins avancent avec tout le temps de jeu, jamais avec le temps réel. Nourrir enlève 55 points, entretenir 65 ; disponibles dès 20 points de besoin.",
    done: "Action effectuée et sauvegarde demandée.", error: "Action impossible", stale: "Le voyage a changé. Réessayez.",
  },
  en: {
    title: "Bag and companion", close: "Close", load: "Load", wallet: "Money", condition: "Condition",
    boots: "Boots", backpack: "Backpack", raincoat: "Raincoat",
    sleepingBag: "Sleeping bag", tent: "Tent", camera: "Camera",
    buy: "Buy", repair: "Repair", discard: "Discard without refund", minutes: "min",
    shop: "Purchases, repairs and supplies available in this settlement. Fixed game prices.",
    noShop: "Reach a settlement to buy equipment, repair it or obtain dog supplies.",
    bootsEffect: "Avoids the 15% speed penalty of broken boots.",
    backpackEffect: "6 × 4 bag, maximum total load 5.5 kg including worn equipment.",
    raincoatEffect: "Reduces rain effects on walking speed and fatigue by 35%.",
    sleepingBagEffect: "Reduces added night fatigue during outdoor sleep by 20%.",
    tentEffect: "Allows tent sleep at a mapped campsite, not camping anywhere. No meals included.",
    cameraEffect: "Planned photo quality bonus: +10%. Not yet active on notebook photos.",
    rules: "Each kg slows walking by 2.5%, increases walking energy by 4% and fatigue by 6%. Walking wears items; broken items stay heavy but lose their benefits. Rearranging is free; discarding is permanent.",
    dog: "Companion", noDog: "No companion. An encounter along the path may offer the chance to welcome a dog.",
    encounter: "An encounter on the path", story: "A dog without a collar follows you and approaches when you stop. Would you like to travel together?",
    name: "Dog name (1–40 characters)", rename: "Name the dog",
    adopt: "Welcome the dog", decline: "Continue without adopting", feed: "Feed", care: "Care and groom",
    hunger: "Hunger", careNeed: "Care need", ready: "Active bonuses: walking fatigue ×0.95; clue chance +8 points; music income ×1.1; robbery risk during night-time fainting ×0.9.",
    notReady: "The dog needs attention: bonuses are suspended (hunger or care need ≥65).",
    needs: "Hunger: +4/hour; care: +1/hour and +0.8/km. Needs advance with all game time, never real time. Feeding removes 55 points, care 65; available from 20 points of need.",
    done: "Action completed and save requested.", error: "Action unavailable", stale: "The journey changed. Try again.",
  },
};

export function setupEquipment(t, { context, act }) {
  const trigger = document.querySelector("#equipment-travel");
  const dialog = document.createElement("dialog");
  dialog.id = "equipment-dialog";
  dialog.setAttribute("aria-labelledby", "equipment-heading");
  document.body.append(dialog);
  let selected = null, renderedState, renderedLanguage, queued = false;
  const words = () => copy[document.documentElement.lang === "en" ? "en" : "fr"];
  const node = (tag, text, parent = dialog) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    parent.append(element);
    return element;
  };
  const button = (parent, label, callback, disabled = false) => {
    const element = node("button", label, parent);
    element.type = "button";
    element.disabled = disabled;
    element.addEventListener("click", callback);
    return element;
  };
  function run(action, revision) {
    const current = context();
    if (!current || current.blocked) return;
    const w = words();
    try {
      if (current.state.equipment.revision !== revision) throw new Error(w.stale);
      act(action);
      render();
      const feedback = dialog.querySelector(".equipment-status");
      feedback.textContent = `${w.done} ${context()?.saveStatus ?? ""}`;
      setFeedback(feedback, "success");
    } catch (reason) {
      console.error("Equipment action failed:", reason);
      const feedback = dialog.querySelector(".equipment-status");
      feedback.textContent = `${w.error}: ${reason.message}`;
      setFeedback(feedback, "failure");
    }
  }
  function render() {
    const current = context();
    if (!current?.state.equipment) return;
    const { state, cell } = current, gear = state.equipment, w = words();
    const language = document.documentElement.lang === "en" ? "en" : "fr";
    const money = cents => new Intl.NumberFormat(language, { style: "currency", currency: "EUR" }).format(cents / 100);
    const format = value => new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
    const modifiers = equipmentModifiers(gear), pending = gear.dogEncounter === "pending";
    const revision = gear.revision;
    renderedState = state;
    renderedLanguage = language;
    dialog.replaceChildren();
    node("h2", pending ? w.encounter : w.title).id = "equipment-heading";
    const feedback = node("p");
    feedback.className = "equipment-status";
    feedback.setAttribute("role", "status");
    if (!pending) button(dialog, w.close, () => dialog.close()).id = "equipment-close";
    node("p", `${w.load}: ${format(modifiers.carriedGrams / 1000)} / ${format(CAPACITY_GRAMS / 1000)} kg · ${w.wallet}: ${money(state.walletCents)}`);
    const controls = node("fieldset");
    controls.disabled = current.blocked;
    if (!pending) {
      renderInventory(controls, { state: gear, walletCents: state.walletCents, language, selected,
        itemName: id => w[id],
        onSelect(id) {
          selected = id;
          render();
          dialog.querySelector(`[data-item="${id}"]`)?.focus();
        },
        onMove(next, id) {
          selected = id;
          const placement = next.placements.find(p => p.id === id);
          run({ type: "move", itemId: id, x: placement.x, y: placement.y, rotated: placement.rotated }, revision);
          dialog.querySelector(`[data-item="${id}"]`)?.focus();
        },
      });
      node("p", w.rules, controls);
      node("p", equipmentShopAvailable(cell) ? w.shop : w.noShop, controls);
      const list = node("ul", "", controls);
      for (const item of ITEMS) {
        const row = node("li", "", list), art = node("span", "", row);
        art.className = "catalogue-art";
        art.append(itemArt(document, item.id));
        const owned = gear.items.find(entry => entry.id === item.id);
        node("strong", `${w[item.id]} · ${new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(item.grams / 1000)} kg${owned ? ` · ${w.condition}: ${format(owned.condition)}%` : ""}`, row);
        node("p", w[`${item.id}Effect`], row);
        const add = (type, label, cents, minutes) => {
          const action = { type, itemId: item.id };
          let available = !current.blocked;
          try {
            equipmentAction(gear, action, { expectedRevision: revision,
              elapsedMinutes: state.elapsedMinutes, walletCents: state.walletCents,
              atShop: equipmentShopAvailable(cell) });
          } catch { available = false; }
          button(row, `${label} · ${money(cents)} · ${minutes} ${w.minutes}`, () => run(action, revision), !available);
        };
        if (owned) {
          add("repair", w.repair, item.repairCents, 30);
          if (!item.essential) add("discard", w.discard, 0, 5);
        } else add("buy", w.buy, item.priceCents, 10);
      }
    }
    node("h3", w.dog, controls);
    if (pending) {
      const art = node("pre", journeyEventArt("dogEncounter"), controls);
      art.setAttribute("aria-hidden", "true");
      node("p", w.story, controls);
    }
    if (pending || gear.dog) {
      const label = node("label", w.name, controls);
      const input = node("input", "", label);
      input.type = "text";
      input.maxLength = 80;
      input.value = gear.dog?.name ?? "";
      input.autocomplete = "off";
      button(controls, pending ? `${w.adopt} · ${money(500)} · 30 ${w.minutes}` : w.rename,
        () => run({ type: pending ? "adoptDog" : "nameDog", name: input.value }, revision),
        pending && state.walletCents < 500);
      if (pending) button(controls, w.decline, () => run({ type: "declineDog" }, revision));
    } else node("p", w.noDog, controls);
    if (gear.dog) {
      node("p", `${gear.dog.name ?? w.dog} · ${w.hunger}: ${format(gear.dog.hunger)} / 100 · ${w.careNeed}: ${format(gear.dog.careNeed)} / 100`, controls);
      node("p", modifiers.dogReady ? w.ready : w.notReady, controls);
      for (const [type, label, need, cost, minutes] of [
        ["feedDog", w.feed, gear.dog.hunger, 150, 10],
        ["careDog", w.care, gear.dog.careNeed, 200, 20],
      ]) button(controls, `${label} · ${money(cost)} · ${minutes} ${w.minutes}`,
        () => run({ type }, revision), !equipmentShopAvailable(cell) || need < 20 || state.walletCents < cost);
    }
    node("p", w.needs, controls);
    node("p", current.saveStatus ?? "");
  }
  function update() {
    const current = context();
    trigger.disabled = !current?.state.equipment || current.blocked;
    if (dialog.open && (current?.state !== renderedState ||
        renderedLanguage !== document.documentElement.lang)) render();
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const next = context();
      if (!next || next.blocked || next.state.equipment?.dogEncounter !== "pending" ||
          dailyTarotPending(next.state) || document.querySelector("dialog[open]")) return;
      render();
      dialog.showModal();
      dialog.querySelector("input")?.focus();
    });
  }
  trigger.addEventListener("click", () => {
    if (!context() || context().blocked || document.querySelector("dialog[open]")) return;
    render();
    dialog.showModal();
  });
  dialog.addEventListener("cancel", event => {
    if (context()?.state.equipment?.dogEncounter === "pending") event.preventDefault();
  });
  dialog.addEventListener("close", update);
  new MutationObserver(update).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
  return { update, localize() { if (dialog.open) render(); update(); }, reset() { dialog.close(); selected = null; renderedState = undefined; } };
}
