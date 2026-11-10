import { drawPixelSprite, drawPixelDoor, drawStoneTile, pixelSet } from "./legend-pixel-art.mjs";

export const INVESTIGATION_SCENES = Object.freeze([
  Object.freeze({ id: "archive", en: "Archive stacks", fr: "Salle des archives", palette: 7 }),
  Object.freeze({ id: "workshop", en: "Clockmaker's workshop", fr: "Atelier de l'horloger", palette: 6 }),
  Object.freeze({ id: "observatory", en: "Roof observatory", fr: "Observatoire des toits", palette: 0 }),
  Object.freeze({ id: "conservatory", en: "Overgrown conservatory", fr: "Serre envahie", palette: 1 }),
  Object.freeze({ id: "vault", en: "Underground vault", fr: "Caveau souterrain", palette: 2 }),
  Object.freeze({ id: "gallery", en: "Portrait gallery", fr: "Galerie des portraits", palette: 3 }),
  Object.freeze({ id: "quay", en: "Canal warehouse", fr: "Entrepôt du canal", palette: 4 }),
  Object.freeze({ id: "theatre", en: "Abandoned theatre", fr: "Théâtre abandonné", palette: 3 }),
]);

export function investigationScene(seed, site) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff ||
      !Number.isSafeInteger(site) || site < 0 || site > 31) throw new RangeError("Invalid investigation scenery seed or site.");
  const stride = 1 + ((seed >>> 3) % 4) * 2;
  return INVESTIGATION_SCENES[(seed % 8 + site * stride) % 8];
}

export function drawInvestigationScenery(ctx, scene, { image, variant = 0 } = {}) {
  const set = pixelSet(scene.palette);
  const rect = (color, x, y, width, height) => {
    ctx.fillStyle = color; ctx.fillRect(x, y, width, height);
  };
  const sprite = (name, x, y, scale = 2) => drawPixelSprite(ctx, name, x, y, scale, { set });
  rect("#141827", 0, 0, 640, 320);
  for (let y = 0; y < 288; y += 32) for (let x = 0; x < 640; x += 32) {
    drawStoneTile(ctx, x, y, 32, true, (x + y) % 64 === 0, set);
  }
  if (image) {
    const height = image.naturalWidth * 288 / 640;
    ctx.drawImage(image, 0, (image.naturalHeight - height) / 2, image.naturalWidth, height, 0, 0, 640, 288);
  }
  rect("rgba(20,24,39,.7)", 0, 0, 640, 288);
  const shelf = (x, y, width) => {
    rect("#704333", x, y, width, 10);
    rect("#b87848", x, y, width, 3);
    for (let i = 8; i < width - 24; i += 32) sprite("books", x + i, y - 28);
  };
  switch (scene.id) {
    case "archive":
      for (const x of [24, 152]) {
        rect("#141827", x, 32, 112, 224);
        for (const y of [80, 144, 208]) shelf(x, y, 112);
      }
      shelf(408, 80, 96);
      break;
    case "workshop":
      rect("#704333", 24, 68, 232, 12);
      for (let x = 32; x < 248; x += 48) {
        rect("#a4acc2", x + 12, 80, 3, 32);
        sprite(x % 3 ? "wheel" : "axle", x, 100);
      }
      rect("#403239", 32, 200, 136, 88);
      sprite("anvil", 56, 168, 3);
      sprite("pipe", 456, 40, 4);
      break;
    case "observatory":
      rect("#101629", 24, 16, 472, 160);
      for (let i = 0; i < 30; i++) rect("#f4e4c1", 36 + i * 73 % 448, 24 + i * 47 % 140, 2, 2);
      rect("#a4acc2", 344, 36, 24, 24);
      rect("#101629", 352, 32, 24, 24);
      for (const x of [24, 248, 488]) rect("#59617c", x, 16, 8, 160);
      rect("#e8b65c", 64, 202, 112, 14);
      rect("#a4acc2", 116, 164, 52, 16);
      rect("#704333", 108, 216, 8, 72);
      break;
    case "conservatory":
      rect("#326878", 16, 16, 488, 168);
      for (let x = 16; x <= 504; x += 64) rect("#a4acc2", x, 16, 4, 168);
      for (let y = 16; y <= 184; y += 56) rect("#a4acc2", 16, y, 488, 4);
      for (const x of [40, 120, 440]) {
        sprite("vase", x, 224, 3);
        for (let i = 0; i < 5; i++) {
          rect("#416b51", x + 20, 156 + i * 12, 4, 68 - i * 12);
          rect("#92c875", x + (i % 2 ? 22 : 4), 156 + i * 12, 20, 8);
        }
      }
      break;
    case "vault":
      for (const x of [24, 176, 464]) {
        rect("#141827", x, 24, 40, 264);
        rect("#a4acc2", x + 8, 40, 24, 224);
        rect("#59617c", x + 16, 48, 8, 208);
        rect("#b87848", x, 24, 40, 16);
      }
      drawPixelDoor(ctx, 80, 48, { set, scale: 5, open: false });
      sprite("cobweb", 240, 16, 3);
      sprite("vase", 96, 224, 3);
      break;
    case "gallery":
      for (let x = 32; x < 500; x += 120) {
        rect("#e8b65c", x, 40, 80, 112);
        rect("#704333", x + 6, 46, 68, 100);
        sprite(x % 3 ? "caretaker" : "repairer", x + 16, 80, 3);
      }
      rect("#8e6db5", 24, 180, 480, 8);
      rect("#704333", 32, 256, 136, 12);
      break;
    case "quay":
      rect("#101629", 24, 32, 224, 160);
      rect("#326878", 24, 128, 224, 64);
      for (let i = 0; i < 12; i++) rect("#66b8c5", 32 + i * 43 % 200, 136 + i * 17 % 48, 24, 2);
      for (const x of [24, 128, 240]) rect("#704333", x, 32, 8, 160);
      sprite("crate", 32, 224, 4);
      sprite("crate", 96, 192, 3);
      rect("#b87848", 464, 24, 4, 128);
      sprite("wheel", 448, 132, 2);
      break;
    case "theatre":
      rect("#141827", 24, 24, 480, 156);
      rect("#f4e4c1", 112, 48, 304, 112);
      for (const x of [24, 432]) {
        rect("#8e3652", x, 24, 72, 168);
        for (let dx = 8; dx < 72; dx += 16) rect("#614b68", x + dx, 24, 8, 168);
      }
      for (const x of [24, 80, 136]) {
        rect("#8e3652", x, 220, 40, 48);
        rect("#704333", x - 4, 264, 48, 24);
      }
      break;
    default: throw new RangeError("Unknown investigation scenery.");
  }
  for (let x = 0; x < 640; x += 32) drawStoneTile(ctx, x, 288, 32, false, x % 64 === 0, set);
  rect(set.accent, 0, 284, 640, 4);
  if (variant) sprite(set.prop, 264, 48);
  return set;
}
