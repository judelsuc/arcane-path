import { treasureItem, LEGEND_THEMES } from "./legend-rewards.mjs";
import BASE_TILES from "./public/tilesets/path-pixel.json" with { type: "json" };
import { themedPixelPack } from "./legend-theme-tiles.mjs";
import { drawPixelTile } from "./map-appearance.mjs";
import { drawStoneTile } from "./minigames/legend-pixel-art.mjs";
import { themePlayerIcon, playerIcon, drawPlayerIcon } from "./player-icons.mjs";

export function renderTreasureInventory(host, { state, language, blocked, onAction, getState = () => state,
  onRefresh = () => {} }) {
  const doc = host.ownerDocument, en = language === "en";
  const text = (tag, value, parent = host) => {
    const node = doc.createElement(tag);
    node.textContent = value;
    parent.append(node);
    return node;
  };
  if (!state.treasures?.inventory.length) return;
  text("h3", en ? "Treasures" : "Trésors");
  const feedback = text("p", "");
  feedback.setAttribute("role", "status");
  const buttons = [];
  function button(parent, label, action) {
    const node = text("button", label, parent);
    node.type = "button";
    node.disabled = blocked;
    buttons.push(node);
    node.addEventListener("click", async () => {
      if (node.disabled) return;
      buttons.forEach(button => { button.disabled = true; });
      feedback.textContent = en ? "Saving…" : "Enregistrement…";
      try {
        const latest = getState();
        if (latest?.serverJourney?.id !== state.serverJourney?.id || latest?.artifactRevision !== state.artifactRevision) {
          throw new Error(en ? "The journey changed. Reopen inventory." : "Le voyage a changé. Rouvrez l'inventaire.");
        }
        const result = await onAction(typeof action === "function" ? action() : action);
        if (!result || result.error) throw new Error(result?.error ?? (en ? "Action unavailable." : "Action indisponible."));
        feedback.textContent = en ? "Saved." : "Enregistré.";
        onRefresh();
      } catch (reason) {
        console.error("Treasure inventory action failed:", reason);
        feedback.textContent = reason.message;
        feedback.setAttribute("role", "alert");
      } finally { buttons.forEach(button => { button.disabled = blocked; }); }
    });
  }
  for (const owned of state.treasures.inventory) {
    const item = treasureItem(owned.id, owned.reward), theme = LEGEND_THEMES.find(theme => theme.id === item.theme);
    const section = text("section", "");
    section.className = "treasure-inventory-item";
    text("h4", item[language], section);
    text("p", `${item.grams} g · ${item.footprint.join(" × ")}`, section);
    if (item.effect) text("p", item.effect[language], section);
    if (owned.reward && !owned.reward.name) text("p", en ? "Its name is still being deciphered." : "Son nom reste à déchiffrer.", section);
    if (["cosmetic", "icon"].includes(item.kind)) {
      const preview = text("div", item.kind === "cosmetic" ? theme[language] : "", section);
      preview.className = "treasure-theme-preview";
      preview.style.backgroundColor = theme.dark;
      preview.style.color = theme.light;
      preview.style.borderColor = theme.accent;
      if (item.kind === "cosmetic") {
        const interfaceSample = text("div", en ? "Journal · Inventory · Dialogue" : "Journal · Inventaire · Dialogue", preview);
        interfaceSample.className = "treasure-ui-preview";
        interfaceSample.style.backgroundColor = theme.floor;
        interfaceSample.style.borderColor = theme.accent;
        interfaceSample.style.borderRadius = ["ice", "rivets", "panels"].includes(theme.masonry) ? "2px" : "10px";
        text("span", en ? "A new page of the journey…" : "Une nouvelle page du voyage…", interfaceSample);
        const canvas = doc.createElement("canvas");
        canvas.width = 192; canvas.height = 64;
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", en ? `${theme.en}: map tiles and adventure walls`
          : `${theme.fr} : tuiles de carte et murs d'aventure`);
        preview.append(canvas);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Treasure preview canvas unavailable.");
        const pack = themedPixelPack(BASE_TILES, theme.id);
        for (const [index, kind] of ["forest", "water", "hill", "field", "place", "road"].entries()) {
          drawPixelTile(ctx, pack, kind, index % 3 * 32, Math.floor(index / 3) * 32, 32);
        }
        drawStoneTile(ctx, 112, 0, 32, true, false, theme);
        drawStoneTile(ctx, 144, 0, 32, true, true, theme);
        drawStoneTile(ctx, 112, 32, 32, false, false, theme);
        drawStoneTile(ctx, 144, 32, 32, false, true, theme);
      }
      const icon = playerIcon(owned.reward?.icon ?? themePlayerIcon(theme.id));
      const iconPreview = doc.createElement("canvas");
      iconPreview.width = iconPreview.height = 48;
      iconPreview.setAttribute("role", "img");
      iconPreview.setAttribute("aria-label", icon[language]);
      preview.append(iconPreview);
      const iconContext = iconPreview.getContext("2d");
      if (!iconContext) throw new Error("Player icon preview canvas unavailable.");
      drawPlayerIcon(iconContext, owned.reward?.icon ?? icon.id, 0, 0, 48);
      text("p", icon[language], preview);
      text("p", item.kind === "icon" ? (en ? "Leaving this object removes its player icon." :
        "Déposer cet objet retire son icône de personnage.") :
        en ? "Choose the UI skin, map/adventure look and player icon separately. Leaving the item removes the appearances it supplies."
          : "Choisissez séparément l'interface, la carte/aventures et l'icône du personnage. Déposer l'objet retire les apparences qu'il fournit.", section);
      if (item.kind === "cosmetic") {
        button(section, state.treasures.equipped === item.id ? en ? "Remove map/adventure look" : "Retirer l'apparence carte/aventures"
          : en ? "Equip map/adventure look" : "Utiliser l'apparence carte/aventures", { type: "treasure-equip", id: item.id });
        button(section, state.treasures.uiEquipped === item.id ? en ? "Remove UI skin" : "Retirer l'habillage de l'interface"
          : en ? "Equip UI skin" : "Habiller l'interface", { type: "treasure-equip-ui", id: item.id });
      }
      button(section, state.treasures.iconEquipped === item.id ? en ? "Remove player icon" : "Retirer l'icône du personnage"
        : en ? "Equip player icon" : "Utiliser l'icône du personnage", { type: "treasure-equip-icon", id: item.id });
    }
    if (["weapon", "jewellery"].includes(item.kind)) {
      const field = item.kind === "weapon" ? "weaponEquipped" : "jewelEquipped";
      button(section, state.treasures[field] === item.id ? en ? "Unequip" : "Retirer" :
        en ? "Equip" : "Équiper", { type: "treasure-equip-gear", id: item.id });
    }
    if (["money", "clue"].includes(item.kind)) button(section, item.kind === "money" ?
      (en ? `Open · €${(item.cents / 100).toFixed(2)}` : `Ouvrir · ${(item.cents / 100).toFixed(2)} €`) :
      (en ? "Read chart" : "Lire la carte"), { type: "treasure-use", id: item.id });
    button(section, en ? "Leave at this place" : "Déposer en ce lieu", { type: "treasure-drop", id: item.id });
    const packing = text("details", "", section);
    text("summary", en ? "Arrange in bag" : "Ranger dans le sac", packing);
    const positions = ["x", "y"].map(axis => {
      const label = text("label", axis.toUpperCase(), packing), input = doc.createElement("input");
      input.type = "number"; input.min = "1"; input.max = axis === "x" ? "6" : "4";
      input.value = String(owned.placement[axis] + 1);
      label.append(input);
      return input;
    });
    const label = text("label", en ? "Rotate" : "Tourner", packing), rotated = doc.createElement("input");
    rotated.type = "checkbox"; rotated.checked = owned.placement.rotated; label.append(rotated);
    button(packing, en ? "Pack" : "Ranger", () => ({ type: "treasure-pack", id: item.id,
      x: Number(positions[0].value) - 1, y: Number(positions[1].value) - 1, rotated: rotated.checked }));
  }
}
