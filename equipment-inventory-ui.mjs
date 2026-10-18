import { ITEMS, equipmentAction } from "./equipment.mjs";
import { BAG, dimensions, restorePlacements } from "./equipment-inventory.mjs";
import { itemArt } from "./equipment-art.mjs";

const copy = {
  fr: { worn: "Équipement porté", bag: "Sac — 6 × 4 cases", empty: "Vide",
    feet: "Pieds", back: "Dos", body: "Vêtement", rotate: "Tourner (R)",
    instructions: "Sélectionnez un objet puis une case pour le déplacer. Glisser-déposer fonctionne aussi. Flèches : déplacer ; R : tourner. Réorganiser ne consomme ni temps ni argent.",
    blocked: "Placement impossible : bord du sac ou autre objet. Déplacez l'objet avant de le tourner.",
    selected: "Objet sélectionné", moved: "Objet déplacé.", cell: "Case" },
  en: { worn: "Worn equipment", bag: "Bag — 6 × 4 cells", empty: "Empty",
    feet: "Feet", back: "Back", body: "Clothing", rotate: "Rotate (R)",
    instructions: "Select an item, then a cell to move it. Drag and drop also works. Arrows: move; R: rotate. Rearranging costs no time or money.",
    blocked: "Cannot place here: bag edge or another item. Move the item before rotating it.",
    selected: "Selected item", moved: "Item moved.", cell: "Cell" },
};

export function renderInventory(parent, { state, walletCents, language, selected, onSelect, onMove, itemName = id => id }) {
  const doc = parent.ownerDocument, t = copy[language];
  const el = (tag, text, host = parent) => {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    host.append(node);
    return node;
  };
  el("h3", t.worn);
  const worn = el("div");
  worn.className = "worn-slots";
  for (const slot of ["feet", "back", "body"]) {
    const box = el("div", "", worn);
    box.className = "worn-slot";
    el("strong", t[slot], box);
    const item = ITEMS.find(item => item.slot === slot && state.items.some(owned => owned.id === item.id));
    if (item) box.append(itemArt(doc, item.id));
    else el("span", t.empty, box);
  }
  el("h3", t.bag);
  el("p", t.instructions);
  const feedback = el("p");
  feedback.setAttribute("role", "status");
  const placements = restorePlacements(state.items, state.placements, ITEMS);
  const active = placements.find(p => p.id === selected);
  const move = (x, y, rotated = active?.rotated, id = selected) => {
    const original = placements.find(p => p.id === id);
    if (!original) return;
    try {
      const outcome = equipmentAction(state, { type: "move", itemId: id, x, y, rotated: rotated ?? original.rotated },
        { expectedRevision: state.revision, elapsedMinutes: state.elapsedMinutes, walletCents });
      onMove(outcome.state, id);
    } catch (reason) {
      console.warn("Inventory move rejected:", reason);
      feedback.textContent = t.blocked;
    }
  };
  const grid = el("div");
  grid.className = "inventory-grid";
  for (let y = 0; y < BAG.rows; y++) for (let x = 0; x < BAG.columns; x++) {
    const cell = el("button", "", grid);
    cell.type = "button";
    cell.setAttribute("data-shortcut-skip", "");
    cell.className = "inventory-cell";
    cell.style.gridColumn = String(x + 1);
    cell.style.gridRow = String(y + 1);
    cell.setAttribute("aria-label", `${t.cell} ${x + 1}, ${y + 1}`);
    cell.addEventListener("click", () => move(x, y));
    cell.addEventListener("dragover", event => event.preventDefault());
    cell.addEventListener("drop", event => {
      event.preventDefault();
      const id = event.dataTransfer.getData("text/plain");
      const original = placements.find(p => p.id === id);
      if (original) move(x, y, original.rotated, id);
    });
  }
  for (const p of placements) {
    const item = ITEMS.find(item => item.id === p.id), size = dimensions(item, p.rotated);
    const button = el("button", "", grid);
    button.type = "button";
    button.setAttribute("data-shortcut-skip", "");
    button.draggable = true;
    button.className = "inventory-item";
    button.dataset.item = item.id;
    button.style.gridColumn = `${p.x + 1} / span ${size.width}`;
    button.style.gridRow = `${p.y + 1} / span ${size.height}`;
    button.setAttribute("aria-pressed", String(p.id === selected));
    button.setAttribute("aria-label", `${itemName(item.id)} · ${size.width} × ${size.height}`);
    button.append(itemArt(doc, item.id));
    el("span", `${size.width} × ${size.height}`, button);
    button.addEventListener("click", () => onSelect(item.id));
    button.addEventListener("dragstart", event => {
      event.dataTransfer.setData("text/plain", item.id);
    });
    button.addEventListener("keydown", event => {
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!delta && event.key.toLowerCase() !== "r") return;
      event.preventDefault();
      if (!active || active.id !== item.id) { onSelect(item.id); return; }
      if (delta) move(p.x + delta[0], p.y + delta[1]);
      else move(p.x, p.y, !p.rotated);
    });
  }
  const rotate = el("button", t.rotate);
  rotate.id = "equipment-rotate";
  rotate.type = "button";
  rotate.disabled = !active;
  rotate.addEventListener("click", () => move(active.x, active.y, !active.rotated));
}
