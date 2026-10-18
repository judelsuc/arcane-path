// Original cover motifs; no publisher art, external images or genre-coded colours.
const motifs = [
  "M50 15a30 30 0 1 0 0 60a30 30 0 1 0 0-60M20 45h60M50 15q-25 30 0 60q25-30 0-60M25 30h50M25 60h50",
  "M20 57h60L68 74H32ZM50 18v39M52 22l25 30H52ZM46 32 28 52h18M16 82q10-6 20 0t20 0t20 0",
  "M37 22a10 10 0 1 0 20 0a10 10 0 1 0-20 0M47 32v30M47 40 28 53M47 40l22 12M47 62 32 83M47 62l18 21M74 66v17m-5-12h10",
  "M19 62h62L67 77H33ZM50 17v45M51 20q30 18 0 35M12 84q12-8 24 0t24 0t24 0M21 20l3 5 5 1-4 4 1 5-5-3-5 3 1-5-4-4 5-1Z",
  "M21 73V22m0 17q17-22 26-16M79 73V22m0 17Q62 17 53 23M35 57l5-22 10 7 10-7 5 22-8 16H43ZM42 54h1m14 0h1M47 64h6",
  "M25 67 30 43l13-11 9 10 15-5 12 17-12 15H40ZM32 44l-5-17 15 8M57 40l6-16 6 13M40 53h2m17-1h2M14 80l15-10m42 9 15-9",
  "M22 78V46a28 28 0 0 1 56 0v32ZM29 78V47a21 21 0 0 1 42 0v31M50 32v46M25 57h50M42 75q-12-17-19-8m35 8q12-17 19-8",
  "M22 54 50 28l28 26M29 50v25h42V50M45 75V57h13v18M13 84q18-8 37 0t37 0M14 26v35m-9-17 9-15 9 15",
  "M58 46a22 22 0 1 0-44 0a22 22 0 1 0 44 0M52 62l23 23M25 44l8-10 11 8m-19 8h20",
  "M22 69 28 45l9-17 11 12 20 1 10 18-16 12H40ZM34 42l-4-15 12 10M70 48l14 7-11 6M28 69l-7 14m39-12 7 12M48 50h2",
  "m50 19 29 24-29 37-29-37ZM21 43h58M36 23l-5 20 19 37 19-37-5-20M31 43h38",
  "M24 80V26h52v54M32 34h36v36H32ZM54 51h4M50 20v-7m0 74v-7M16 49H9m82 0h-7",
  "M50 80V43m0 18Q22 62 20 44q25-6 30 17m0-9q25-19 31 0-7 17-31 0M50 40c-25-18-6-39 0-17 6-22 25-1 0 17Z",
  "M20 82Q44 30 70 18M29 67l-4-28m16 13-1-28m12 14 8-20M35 60l30-7M24 77l25-3M14 85h70",
  "M17 28q20-8 33 4 13-12 33-4v48q-20-8-33 4-13-12-33-4ZM50 32v48M24 42h16m-16 10h16m20-10h16m-16 10h16",
  "m21 48 10-22 14 14 11-5 20 13-9 23H36ZM32 43l-2-13 12 12M60 48l17 3-9 9M43 52h2M30 69Q9 79 15 53m37 15 9 14",
];
const colors = ["#385d72", "#8d543e", "#596b45", "#72567c", "#75613b", "#4b6d79", "#8a5864", "#48684d",
  "#685b80", "#39706a", "#936944", "#625663", "#804b5e", "#467180", "#76713f", "#8a593d"];

export function bookCoverArt(doc, id) {
  const index = Number(id.split("-")[1]) - 1;
  if (!/^book-\d+$/.test(id) || !Number.isInteger(index) || index < 0 || index >= motifs.length)
    throw new RangeError("Unknown book cover.");
  const element = (tag, attributes) => {
    const node = doc.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  };
  const svg = element("svg", { viewBox: "0 0 100 100", "aria-hidden": "true", class: "book-cover-art" });
  svg.append(
    element("rect", { x: 2, y: 2, width: 96, height: 96, rx: 2, fill: colors[index] }),
    element("rect", { x: 8, y: 8, width: 84, height: 84, rx: 1, fill: "none", stroke: "#e9d5a3", "stroke-opacity": ".5" }),
    element("path", { d: motifs[index], fill: "none", stroke: "#f0dfb5", "stroke-width": 2.3, "stroke-linecap": "round", "stroke-linejoin": "round" }),
  );
  return svg;
}
