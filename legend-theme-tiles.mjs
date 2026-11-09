import { LEGEND_THEMES } from "./legend-rewards.mjs";

function tint(color, theme) {
  const channels = hex => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
  const source = channels(color), dark = channels(theme.dark), light = channels(theme.light);
  const luminance = (source[0] * .2126 + source[1] * .7152 + source[2] * .0722) / 255;
  return "#" + source.map((value, index) => Math.round(value * .25 +
    (dark[index] + (light[index] - dark[index]) * luminance) * .75)
    .toString(16).padStart(2, "0")).join("");
}
export function themedPixelPack(base, themeId) {
  const theme = LEGEND_THEMES.find(theme => theme.id === themeId);
  if (!theme) throw new Error("Unknown treasure theme.");
  const pack = structuredClone(base);
  pack.credit = `${base.credit} — ${theme.en}`;
  for (const [kind, tile] of Object.entries(pack.tiles)) {
    // Keep mapped water and transport colours distinct, regardless of the collectible palette.
    if (!["water", "harbour", "road", "major_road", "rail", "cable", "cable_station"].includes(kind)) {
      tile.background = tint(tile.background, theme);
      tile.rects = tile.rects.map(([x, y, w, h, color]) => [x, y, w, h, tint(color, theme)]);
    }
    const patterns = {
      sepia: [[0, 0, 16, 1, theme.dark], [0, 15, 16, 1, theme.dark], [1, 1, 1, 1, theme.accent]],
      moonlit: [[0, 0, 2, 1, theme.accent], [0, 1, 1, 2, theme.accent], [14, 14, 1, 1, theme.light]],
      verdant: [[0, 0, 1, 5, theme.dark], [1, 1, 2, 1, theme.accent], [0, 4, 2, 1, theme.accent],
        [14, 13, 1, 3, theme.accent], [13, 14, 3, 1, theme.accent]],
      ember: [[0, 0, 2, 2, theme.accent], [14, 14, 2, 2, theme.accent], [1, 1, 1, 1, theme.light],
        [15, 15, 1, 1, theme.dark]],
    };
    tile.rects.push(...(patterns[theme.id] ?? theme.trim.map(rect => [...rect, theme.accent])));
  }
  return pack;
}
