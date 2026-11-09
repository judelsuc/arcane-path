import { mapAppearance } from "../map-appearance.mjs";
import { LEGEND_THEMES } from "../legend-rewards.mjs";

const currentTheme = () => LEGEND_THEMES.find(theme => theme.id === mapAppearance().skin);
const PALETTE = Object.freeze({
  ".": null, o: "#141827", s: "#323852", m: "#59617c", h: "#a4acc2",
  w: "#f4e4c1", g: "#e8b65c", y: "#fff09b", b: "#704333", t: "#b87848",
  r: "#db6656", p: "#8e6db5", v: "#d1a2e3", c: "#66b8c5", d: "#326878",
  l: "#92c875", n: "#416b51", f: "#e7ae89",
});

export const PIXEL_SPRITES = Object.freeze(Object.fromEntries(Object.entries({
  explorer: [
    ".....oooooo.....", "....obbbbboo....", "...obttttttbo...", "...oggggggggo...",
    "....offffofo....", "....offffffo....", ".....offffo.....", "....ooddddoo....",
    "...offdccdffo...", "...offdccdffo...", "....ooddddoo....",
    ".....obbbbo.....", ".....obobbo.....", "....ooboobbo....", "....ooooooo.....",
    "................",
  ],
  caretaker: [
    ".....oooooo.....", "....ohhhhhoo....", "...ohhhhhhhho...", "...ohfffffhho...",
    "....offofffo....", "....offffffo....", ".....offffo.....", "....oonnnnoo....",
    "...offnllnffo...", "...offnllnffo...", "....oonnnnoo....", "....onnnnnno....",
    "...onnnnnnnno...", "...oooooooooo...", ".....oo..oo.....", "................",
  ],
  repairer: [
    ".....oooooo.....", "....orrrrroo....", "...orrrrrrrro...", "...oooooooooo...",
    "....offofffo....", "....offffffo....", ".....obbbbo.....", "....oottttoo....",
    "...offtddtffo...", "...offddddffo...", "....ooddddoo....", ".....oddddo.....",
    ".....odo.do.....", "....oodo.odo....", "....oooo.ooo....", "................",
  ],
  bat: [
    "................", ".oo..........oo.", ".opo........opo.", ".ovpo..oo..opvo.",
    ".ovvpooppoopvvo.", "..ovvppppppvvo..", "..ovvpowwopvvo..", "...ovpowwopvo...",
    "...oppppppppo...", "..opopprrppopo..", "..oo.oppppo.oo..", "......oooo......",
    "......o..o......", "................", "................", "................",
  ],
  rat: [
    "................", "................", ".....oo..oo.....", "....otrootro....",
    "...obttttttbo...", "..obttttttttbo..", "..obttttofttbo..", ".obttttttttttbo.",
    ".obtttttttttfro.", ".obttttttttttoo.", "..obbbbbbbbo....", "...oo.oo.oo.....",
    "oooo........o...", "orrrrrrrrrroo...", ".oooooooooo.....", "................",
  ],
  doorOpen: [
    "..oooooooooooo..", ".ohhhhhhhhhhhho.", "ohhmmmmmmmmmmhho", "ohmoooooooooomho",
    "ohmo........omho", "ohmo........omho", "ohmo........omho", "ohmo........omho",
    "ohmo........omho", "ohmo........omho", "ohmo........omho", "ohmo........omho",
    "ohmo........omho", "ohmllllllllllmho", "ohhhhhhhhhhhhhho", "oooooooooooooooo",
  ],
  doorClosed: [
    "..oooooooooooo..", ".ohhhhhhhhhhhho.", "ohhmmmmmmmmmmhho", "ohmobttbttbtomho",
    "ohmobttbttbtomho", "ohmohhhhhhhhomho", "ohmobttbttbtomho", "ohmobttbttbtomho",
    "ohmobtoggobtomho", "ohmobtoggobtomho",
    "ohmobttbttbtomho", "ohmohhhhhhhhomho", "ohmobttbttbtomho", "ohmobttbttbtomho",
    "ohhhhhhhhhhhhhho", "oooooooooooooooo",
  ],
  key: [
    "................", "................", "..oooooo........", ".oggggggo.......",
    ".ogoooggo.......", ".ogoooggo.......", ".oggggggooooooo.", "..oooooggggggggo",
    "......ooooogoogo", "..........ogoogo", "..........oooooo", "................",
    "................", "................", "................", "................",
  ],
  reel: [
    ".....oooooo.....", "...oohhhhhhoo...", "..ohhwwwwwwhho..", ".ohwwwoooowwwho.",
    ".ohwwoossowwwho.", "ohwwwoossowwwwho", "ohwoowwwwwwoowho", "ohwsswwggwwsswho",
    "ohwsswwggwwsswho", "ohwoowwwwwwoowho", "ohwwwoossowwwwho", ".ohwwoossowwwho.",
    ".ohwwwoooowwwho.", "..ohhwwwwwwhho..", "...oohhhhhhoo...", ".....oooooo.....",
  ],
  lever: [
    "................", ".........ooo....", "........orrro...",
    "........orrro...", ".......omooo....", "......omho......", ".....omho.......",
    "....omho........", "...oomhooooo....", "..ohmhohhhho....", "..ohmmmmmmho....",
    "..ohmmmmmmho....", "..ohhgggghho....", "..ohhhhhhhho....", "..oooooooooo....", "................",
  ],
  crate: [
    "oooooooooooooooo", "oggggggggggggggo", "ogbbbbbbbbbbbbgo",
    "ogbtbttttttbtbgo", "ogbbtbttttbtbbgo", "ogbbbtbttbtbbbgo",
    "ogbbbbtbbtbbbbgo", "ogbbbbbttbbbbbgo",
    "ogbbbbbttbbbbbgo", "ogbbbbtbbtbbbbgo",
    "ogbbbtbttbtbbbgo", "ogbbtbttttbtbbgo", "ogbtbttttttbtbgo",
    "ogbbbbbbbbbbbbgo", "oggggggggggggggo", "oooooooooooooooo",
  ],
  plate: [
    "................", "................", "................", "..oooooooooooo..",
    ".ohhhhhhhhhhhho.", "ohmnnnnnnnnnnmho", "ohmnllllllllnmho", "ohmnlnnnnnnlnmho",
    "ohmnlnnnnnnlnmho", "ohmnllllllllnmho", "ohmnnnnnnnnnnmho", ".ohhhhhhhhhhhho.",
    "..oooooooooooo..", "................", "................", "................",
  ],
  spikes: [
    "................", "................", "...oo......oo...", "...who.....who..",
    "..owhho...owhho.", "..owmhho..owmhho", ".owmmmhhoowmmmho", ".oooooooooooooo.",
    "......oo........", ".....owho.......", "....owhhho......", "...owhmmhho.....",
    "..owhmmmmhho....", ".owhmmmmmmhho...", ".oooooooooooo...", "................",
  ],
  supply: [
    "................", ".....oooooo.....", "....ohhhhhho....", "...oooooooooo...",
    "..owwwwwwwwwwo..", "..owwwrrrwwwwo..", "..owwwrrrwwwwo..", "..owrrrrrrrwwo..",
    "..owrrrrrrrwwo..", "..owwwrrrwwwwo..", "..owwwrrrwwwwo..", "..owwwwwwwwwwo..",
    "..ohhhhhhhhhho..", "...oooooooooo...", "................", "................",
  ],
  bell: [
    ".......oo.......", "......oggo......", ".....ooggoo.....", "....oggggggo....",
    "...ogyygggggo...", "...ogyggggggo...", "...ogyggggggo...", "...ogyggggggo...",
    "..ogyygggggggo..", "..oggggggggggo..", ".oggggggggggggo.", ".oooooooooooooo.",
    "......oggo......", "......oooo......", "................", "................",
  ],
  batFolded: [
    "................", "....oo....oo....", "...oppo..oppo...", "..opvvpoopvvpo..",
    "..opvvppppvvpo..", "..opvpowwopvpo..", "..opvpowwopvpo..", "..oppppppppppo..",
    "...opprrrrppo...", "....oppppppo....", ".....oppppo.....", ".....oppppo.....",
    "......oooo......", "......o..o......", "................", "................",
  ],
  ratAlert: [
    "................", ".........oo.....", "........otro....", "....oo.obttbo...",
    "...otroobttbo...", "..obtttttttfbo..", ".obttttttttffro.", ".obtttttttttfro.",
    ".obttttttttttoo.", "..obbbbbbbbo....", "...obboobbo.....", "...oooo.ooo.....",
    "oo..........o...", "orrrrrrrrrroo...", ".oooooooooo.....", "................",
  ],
  torch: [
    ".......r........", "......ryr.......", ".....ryyyr......", "....rywwwyr.....",
    "....rywwwyr.....", ".....ryyyr......", "......rrr.......", ".....ooooo......",
    ".....ohhho......", "......oto.......", "......oto.......", ".....ommo.......",
    ".....ommo.......", "......oto.......", "......ooo.......", "................",
  ],
  vase: [
    "................", ".....oooooo.....", ".....oggggo.....", "......otto......",
    ".....otttto.....", "....otttttto....", "...otttttttto...", "...otggggggto...",
    "...otttttttto...", "...otttttttto...", "....otttttto....", "....otggggto....",
    ".....oooooo.....", "................", "................", "................",
  ],
  cobweb: [
    "h......h.......h", ".h.....h......h.", "..h....h.....h..", "...h...h....h...",
    "....h..h...h....", "hhhhh.hhh.hhhhhh", ".....hhhhh......", "hhhhhhhhhhhhhhhh",
    ".....hhhhh......", "hhhhh.hhh.hhhhhh", "....h..h...h....", "...h...h....h...",
    "..h....h.....h..", ".h.....h......h.", "h......h.......h", ".......h........",
  ],
  pipe: [
    ".....oooooo.....", "....ohhhhho.....", "...ohmmmho......", "...ohmmo........",
    "...ohmmo........", "..oohmmoo.......", "..ohhhhhho......", "..ommmmmmo......",
    "..oooooooo......", "....occo........", "....occo........", ".....oo.........",
    ".....cc.........", "....cccc........", ".....cc.........", "................",
  ],
  crystal: [
    ".......oo.......", "......ocwo......", "......ocwo......", ".....odccwo.....",
    "..oo.odccwo.....", ".ocwodcccwwo....", ".ocwodcccwwo.oo.",
    ".odcddcccwwocwo.", ".odcddcccwwocwo.", "..odddcccwodcwo.",
    "..odddcccwodcwo.", "...oddcccwodco..", "...oddcccwdco...",
    "....oddddddo....", ".....oooooo.....", "................",
  ],
  anvil: [
    "................", "................", "..oooooooooooo..", ".ohhhhhhhhhhhho.",
    "ohhmmmmmmmmmmho.", ".ohmmmmmmmmmmo..", "..ooooommmmoo...",
    "......ommmmo....", "......ommmmo....", ".....ommmmmmo...",
    "....ommmmmmmmo..", "...ohhhhhhhhhho.", "...oooooooooooo.",
    "................", "................", "................",
  ],
  books: [
    "................", "................", "..ooooooooooo...", ".orrrrrrrrrrro..",
    ".orwwwwwwwwrro..", "..ooooooooooo...", "...oddddddddddo.",
    "...odwwwwwwwddo.", "...oooooooooooo.", ".ogggggggggggo..",
    ".ogwwwwwwwwggo..", ".ogwwwwwwwwggo..", ".ogggggggggggo..",
    "..ooooooooooo...", "................", "................",
  ],
}).map(([name, rows]) => [name, Object.freeze(rows)])));

export const PIXEL_SETS = Object.freeze([
  Object.freeze({ id: "crypt", masonry: "brick", door: "iron", prop: "torch",
    bat: "bat", rat: "ratAlert", wall: "#505872", floor: "#35404b", accent: "#66b8c5" }),
  Object.freeze({ id: "ruins", masonry: "blocks", door: "arch", prop: "vase",
    bat: "batFolded", rat: "rat", wall: "#747254", floor: "#424d42", accent: "#92c875" }),
  Object.freeze({ id: "cellar", masonry: "timber", door: "wood", prop: "cobweb",
    bat: "batFolded", rat: "ratAlert", wall: "#79533e", floor: "#463b3d", accent: "#e8b65c" }),
  Object.freeze({ id: "cinema", masonry: "panels", door: "curtain", prop: "torch",
    bat: "bat", rat: "rat", wall: "#614b68", floor: "#3d394d", accent: "#db6656" }),
  Object.freeze({ id: "sewer", masonry: "drains", door: "grate", prop: "pipe",
    bat: "batFolded", rat: "rat", wall: "#416b65", floor: "#293e42", accent: "#66b8c5" }),
  Object.freeze({ id: "glacier", masonry: "ice", door: "frost", prop: "crystal",
    bat: "bat", rat: "ratAlert", wall: "#648da7", floor: "#354e68", accent: "#a4dce7" }),
  Object.freeze({ id: "forge", masonry: "rivets", door: "steel", prop: "anvil",
    bat: "batFolded", rat: "ratAlert", wall: "#65545a", floor: "#403239", accent: "#ef9254" }),
  Object.freeze({ id: "library", masonry: "shelves", door: "carved", prop: "books",
    bat: "bat", rat: "rat", wall: "#67513e", floor: "#41453f", accent: "#d8bc75" }),
]);

export function pixelSet(seed) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError("Invalid pixel-art seed.");
  const set = PIXEL_SETS[seed % PIXEL_SETS.length], theme = currentTheme();
  return theme ? { ...set, wall: theme.wall, floor: theme.floor, accent: theme.accent,
    masonry: theme.masonry, prop: theme.prop, trim: theme.trim, door: theme.door ?? set.door } : set;
}

export function drawPixelSprite(ctx, name, x, y, scale = 2, { direction = "up", active = false, set } = {}) {
  const rows = PIXEL_SPRITES[name];
  const theme = currentTheme();
  const palette = theme ? { ...PALETTE, o: theme.dark, w: theme.light, g: theme.accent,
    d: theme.wall, c: theme.accent } : PALETTE;
  if (!rows || !Number.isInteger(scale) || scale < 1) throw new RangeError("Invalid pixel sprite or scale.");
  for (let row = 0; row < 16; row++) for (let col = 0; col < 16; col++) {
    const pixel = rows[row][col];
    if (!PALETTE[pixel]) continue;
    let px = col, py = row;
    if (direction === "right") { px = 15 - row; py = col; }
    if (direction === "down") { px = 15 - col; py = 15 - row; }
    if (direction === "left") { px = row; py = 15 - col; }
    ctx.fillStyle = active && pixel === "g" ? palette.l : set && pixel === "p" ? set.accent : palette[pixel];
    ctx.fillRect(Math.round(x) + px * scale, Math.round(y) + py * scale, scale, scale);
  }
}

export function drawPixelDoor(ctx, x, y, { open = true, direction = "up", scale = 2, set = PIXEL_SETS[0] } = {}) {
  ctx.fillStyle = "#141827";
  ctx.fillRect(x, y, 16 * scale, 16 * scale);
  drawPixelSprite(ctx, open ? "doorOpen" : "doorClosed", x, y, scale, { direction });
  const rect = (color, dx, dy, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + dx * scale, y + dy * scale, w * scale, h * scale);
  };
  if (set.door === "curtain") {
    rect("#704333", 1, 0, 14, 2);
    rect("#db6656", 2, 2, open ? 2 : 6, 12);
    rect("#8b3e50", open ? 12 : 8, 2, open ? 2 : 6, 12);
    rect("#e8b65c", 1, 7, 3, 1);
    rect("#e8b65c", 12, 7, 3, 1);
  } else if (set.door === "arch") {
    rect("#141827", 1, 1, 3, 2);
    rect("#141827", 12, 1, 3, 2);
    rect("#e8b65c", 6, 0, 4, 3);
    rect("#747254", 1, 5, 2, 2);
    rect("#747254", 13, 9, 2, 2);
  } else if (set.door === "wood") {
    rect("#b87848", 1, 1, 2, 13);
    rect("#b87848", 13, 1, 2, 13);
    rect("#e8b65c", 1, 1, 14, 2);
    for (const px of [1, 13]) for (const py of [4, 11]) rect("#141827", px, py, 1, 1);
  } else if (set.door === "grate") {
    rect("#416b65", 0, 3, 3, 11);
    rect("#416b65", 13, 3, 3, 11);
    rect("#66b8c5", 3, 0, 10, 2);
    if (!open) {
      for (const py of [4, 7, 10, 13]) rect("#7f9d99", 3, py, 10, 1);
      for (const px of [4, 7, 10]) rect("#7f9d99", px, 3, 1, 11);
    }
  } else if (set.door === "frost") {
    rect("#a4dce7", 0, 0, 16, 2);
    for (const [px, length] of [[2, 4], [5, 2], [10, 3], [13, 5]]) {
      rect("#f4e4c1", px, 1, 1, length);
      rect("#66b8c5", px + 1, 1, 1, Math.max(1, length - 1));
    }
    rect("#648da7", 0, 5, 2, 9);
    rect("#a4dce7", 14, 6, 2, 8);
    if (!open) for (const py of [5, 9, 12]) rect("#66b8c5", 4, py, 8, 1);
  } else if (set.door === "steel") {
    rect("#323852", 0, 1, 3, 14);
    rect("#323852", 13, 1, 3, 14);
    for (const px of [1, 14]) for (const py of [2, 6, 10, 13]) rect("#e8b65c", px, py, 1, 1);
    rect("#ef9254", 3, 0, 10, 2);
    if (!open) {
      rect("#59617c", 4, 3, 8, 11);
      for (const py of [4, 7, 10]) rect("#141827", 5, py, 6, 1);
    }
  } else if (set.door === "carved") {
    rect("#b87848", 0, 1, 3, 14);
    rect("#b87848", 13, 1, 3, 14);
    for (const px of [1, 14]) {
      rect("#d8bc75", px, 3, 1, 3);
      rect("#d8bc75", px, 10, 1, 3);
    }
    rect("#d8bc75", 3, 0, 10, 2);
    rect("#704333", 5, 1, 6, 2);
    if (!open) for (const px of [4, 9]) {
      rect("#704333", px, 4, 3, 9);
      rect("#d8bc75", px, 4, 3, 1);
    }
  } else if (!open) {
    for (const px of [5, 8, 11]) rect("#a4acc2", px, 4, 1, 9);
  }
  if (!open) {
    rect("#141827", 5, 5, 6, 9);
    rect("#a4acc2", 6, 6, 4, 4);
    rect("#141827", 7, 7, 2, 2);
    rect("#e8b65c", 6, 9, 4, 3);
    rect("#141827", 7, 10, 1, 1);
  }
  if (open) {
    const arrows = { up: [[7, 5], [6, 6], [8, 6], [7, 7], [7, 8], [7, 9]],
      down: [[7, 10], [6, 9], [8, 9], [7, 8], [7, 7], [7, 6]],
      left: [[5, 7], [6, 6], [6, 8], [7, 7], [8, 7], [9, 7]],
      right: [[10, 7], [9, 6], [9, 8], [8, 7], [7, 7], [6, 7]] };
    ctx.fillStyle = "#fff09b";
    for (const [px, py] of arrows[direction]) ctx.fillRect(x + px * scale, y + py * scale, scale, scale);
  }
}

export function drawStoneTile(ctx, x, y, size, wall, alternate = false, set = PIXEL_SETS[0]) {
  const unit = size / 16;
  const rect = (color, dx, dy, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + dx * unit, y + dy * unit, w * unit, h * unit);
  };
  rect("#141827", 0, 0, 16, 16);
  if (wall) {
    rect(set.wall, 1, 1, 14, 14);
    rect("#a4acc2", 1, 1, 14, 1);
    rect("#7f8aa2", 1, 2, 1, 12);
    rect("#323852", 1, 14, 14, 1);
    if (set.masonry === "timber") {
      for (const dx of [4, 8, 12]) {
        rect("#323852", dx, 2, 1, 12);
        rect("#b87848", dx + 1, 3, 1, 8);
      }
      rect("#141827", 1, 11, 14, 2);
    } else if (set.masonry === "panels") {
      rect("#323852", 3, 3, 10, 10);
      rect(set.accent, 4, 4, 8, 1);
      rect(set.accent, 4, 5, 1, 6);
    } else if (set.masonry === "blocks") {
      rect("#323852", alternate ? 4 : 11, 1, 1, 14);
      rect("#92c875", 2, alternate ? 12 : 3, 3, 1);
      rect("#416b51", 1, alternate ? 13 : 4, 2, 2);
    } else if (set.masonry === "drains") {
      rect("#28313f", 1, 6, 14, 1);
      rect("#28313f", alternate ? 6 : 10, 1, 1, 13);
      for (const dx of [3, 6, 9, 12]) rect("#141827", dx, 9, 1, 4);
      rect("#66b8c5", 2, 14, 12, 1);
    } else if (set.masonry === "ice") {
      rect("#a4dce7", 3, 2, 1, 5);
      rect("#a4dce7", 4, 7, 4, 1);
      rect("#326878", 8, 8, 1, 6);
      rect("#a4dce7", alternate ? 10 : 12, 3, 2, 1);
      rect("#f4e4c1", 11, 2, 1, 3);
      rect("#66b8c5", 2, 11, 3, 2);
    } else if (set.masonry === "rivets") {
      rect("#323852", 3, 3, 10, 10);
      for (const dx of [2, 12]) for (const dy of [2, 12]) rect("#e8b65c", dx, dy, 2, 2);
      for (const dy of [5, 8, 11]) rect(alternate ? "#ef9254" : "#141827", 5, dy, 6, 1);
    } else if (set.masonry === "shelves") {
      rect("#141827", 2, 2, 12, 11);
      for (const dx of [3, 6, 9, 12]) {
        rect(dx % 2 ? "#704333" : "#326878", dx, alternate ? 3 : 4, 2, alternate ? 8 : 7);
        rect("#d8bc75", dx, 6, 2, 1);
      }
      rect("#b87848", 1, 12, 14, 2);
    } else {
      rect("#323852", alternate ? 5 : 10, 2, 1, 5);
      rect("#323852", 1, 7, 14, 1);
      rect("#323852", alternate ? 11 : 5, 8, 1, 6);
    }
  } else {
    rect(set.floor, 0, 0, 16, 16);
    rect("#4b5963", 1, 1, 14, 1);
    rect("#28313f", 0, 15, 16, 1);
    rect("#28313f", 15, 0, 1, 16);
    rect("#59616b", alternate ? 4 : 11, alternate ? 11 : 5, 2, 1);
    if (set.masonry === "timber") for (const dy of [4, 8, 12]) rect("#28313f", 0, dy, 16, 1);
    if (set.masonry === "panels" && alternate) rect("#614b68", 4, 4, 8, 8);
    if (set.masonry === "blocks") {
      rect("#28313f", 6, 5, 1, 5);
      rect("#28313f", 7, 10, 3, 1);
    }
    if (set.masonry === "drains") {
      for (const dx of [3, 6, 9, 12]) rect("#141827", dx, 4, 1, 8);
      rect("#416b65", 2, 13, 12, 1);
    }
    if (set.masonry === "ice") {
      rect("#648da7", 2, 3, 10, 1);
      rect("#a4dce7", 4, 4, 7, 1);
      rect("#648da7", 8, 5, 1, 6);
      rect("#66b8c5", 9, 10, 3, 1);
    }
    if (set.masonry === "rivets") {
      for (const [dx, dy] of [[2, 2], [12, 2], [2, 12], [12, 12]]) rect("#7f8aa2", dx, dy, 1, 1);
      rect("#28313f", 7, 2, 1, 12);
      rect("#65545a", 8, 2, 1, 12);
    }
    if (set.masonry === "shelves") {
      rect(alternate ? "#704333" : "#67513e", 1, 2, 13, 12);
      rect("#d8bc75", 3, 3, 9, 1);
      rect("#d8bc75", 3, 3, 1, 8);
      rect("#d8bc75", 3, 11, 9, 1);
      rect("#d8bc75", 11, 3, 1, 8);
    }
  }
  for (const [dx, dy, width, height] of set.trim ?? []) rect(set.accent, dx, dy, width, height);
}
