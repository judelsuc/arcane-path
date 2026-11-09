export const PLAYER_ICONS = Object.freeze([
  { id: "wanderer", en: "Lantern wanderer", fr: "Voyageur à la lanterne", coat: "#c79150", accent: "#ffda7c",
    pixels: ["............", "....oooo....", "...occcco...", "..occcccco..", "...ossoo....", "...ossso....",
      "..occcco.aa.", ".occccocoaao", ".osoccco.aa.", "...occco....", "...oo.oo....", "..ooo.ooo..."] },
  { id: "astronomer", en: "Star watcher", fr: "Veilleur des étoiles", coat: "#8e91d5", accent: "#d8edff",
    pixels: ["......a.....", ".....aaa....", "....oacco...", "...occccco..", "..occccccco.", "...ossso....",
      "...ossoo....", "..occccco...", "..ocacaco...", ".occccccco..", ".ooooooooo..", "...oo.oo...."] },
  { id: "ranger", en: "Woodland ranger", fr: "Éclaireur des bois", coat: "#6baf78", accent: "#d4e6a0",
    pixels: ["............", "....oooo....", "...occcco...", "..occcccco..", "..ocossoaa..", "..ocosso....",
      "..occccco.o.", ".occccccoco.", ".ocacccco.o.", "..occcco..o.", "...oo.oo....", "..ooo.ooo..."] },
  { id: "smith", en: "Copper smith", fr: "Forgeron de cuivre", coat: "#cd8870", accent: "#eee2ad",
    pixels: ["............", "....oooo....", "...occcco...", "...oaaaao...", "...ososo....", "....ssso..o.",
      "..occccco.oo", ".ocaaaaocoao", ".osaaaao..o.", "..occcco..o.", "...oo.oo....", "..ooo.ooo..."] },
  { id: "sailor", en: "Tide sailor", fr: "Marin des marées", coat: "#6eabbf", accent: "#fff1d2",
    pixels: ["............", "...oaaaao...", "..oaaaaaao..", "...oooooo...", "...ososo....", "...ossso....",
      "..occccco...", ".ocaaaacoo..", ".occccacos..", "..oaaaao....", "...oo.oo....", "..ooo.ooo..."] },
  { id: "bard", en: "Travelling bard", fr: "Barde des chemins", coat: "#c97aab", accent: "#efd38b",
    pixels: [".....a......", "....a.......", "...occco....", "..occcccoo..", "...ossoo....", "...ossso....",
      "..occcco....", ".occccocoo..", ".osccoaaaco.", "..occoaaaco.", "...oooocco..", "..ooo.ooo..."] },
  { id: "courier", en: "Letter courier", fr: "Messager des lettres", coat: "#d3b777", accent: "#f7e8ce",
    pixels: ["............", "....oooo....", "...occcco...", "..occcccoo..", "...ososo....", "...ossso....",
      "..occccco...", ".ocaccccoco.", ".osocaaaaco.", "..occaaoaco.", "...oo.oo....", "..ooo.ooo..."] },
  { id: "alchemist", en: "Wandering alchemist", fr: "Alchimiste errant", coat: "#ab8cd4", accent: "#a6ead0",
    pixels: ["......o.....", ".....oco....", "....occco...", "...occccco..", "..oooooooo..", "...ososo....",
      "...ossso..a.", "..occcco..a.", ".occcccooaaa", ".occccco.aaa", ".ooooooo....", "...oo.oo...."] },
].map(icon => Object.freeze({ ...icon, pixels: Object.freeze(icon.pixels) })));

const THEME_ICONS = Object.freeze({
  sepia: "wanderer", moonlit: "astronomer", verdant: "ranger", ember: "smith",
  tide: "sailor", roseglass: "bard", sandstone: "courier", porcelain: "alchemist",
  autumn: "courier", aurora: "astronomer", clockwork: "smith", lavender: "alchemist",
  inkwash: "wanderer", coral: "sailor", mosaic: "bard", starlight: "ranger",
});
export function themePlayerIcon(theme) {
  const id = THEME_ICONS[theme];
  if (!id) throw new Error("Unknown player icon theme.");
  return id;
}
export function playerIcon(id) {
  if (typeof id === "object") return validateGeneratedIcon(id);
  const icon = PLAYER_ICONS.find(icon => icon.id === id);
  if (!icon) throw new Error("Unknown player icon.");
  return icon;
}
export function validateGeneratedIcon(icon) {
  if (!icon || Object.keys(icon).sort().join() !== "accent,coat,en,fr,id,pixels" ||
      !/^generated:[a-z0-9][a-z0-9-]{0,79}:[a-z][a-z0-9-]{0,47}$/.test(icon.id) ||
      !["en", "fr"].every(key => typeof icon[key] === "string" && icon[key].trim() === icon[key] &&
        icon[key].length > 0 && icon[key].length <= 100 && !/[\u0000-\u001f\u007f]/.test(icon[key])) ||
      !["coat", "accent"].every(key => /^#[a-f0-9]{6}$/i.test(icon[key])) ||
      !Array.isArray(icon.pixels) || icon.pixels.length !== 12 ||
      icon.pixels.some(row => typeof row !== "string" || !/^[.ocas]{12}$/.test(row))) {
    throw new Error("Invalid generated player icon.");
  }
  const pixels = icon.pixels.join(""), occupied = pixels.replaceAll(".", "").length;
  if (occupied < 24 || occupied > 130 || !pixels.includes("o")) throw new Error("Invalid generated icon silhouette.");
  return icon;
}
function iconRects(icon) {
  const palette = { o: "#17212d", c: icon.coat, a: icon.accent, s: "#f3ceab" };
  return icon.pixels.flatMap((row, y) => [...row].flatMap((pixel, x) =>
    pixel === "." ? [] : [[x, y, palette[pixel]]]));
}
export function drawPlayerIcon(context, id, x, y, size) {
  drawIconPixels(context, playerIcon(id), x, y, size);
}
export function drawIconPixels(context, icon, x, y, size) {
  for (const [left, top, color] of iconRects(icon)) {
    context.fillStyle = color;
    context.fillRect(x + left * size / 12, y + top * size / 12, size / 12, size / 12);
  }
}
export function playerIconSource(id) {
  const rects = iconRects(playerIcon(id)).map(([x, y, color]) =>
    `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`).join("");
  return "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">${rects}</svg>`);
}
