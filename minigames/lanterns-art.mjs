const colors = ["#ecad48", "#80b7eb", "#d99cea", "#89c58b", "#ef8d76", "#79d0c8"];
const motifs = [
  "M50 43v-7m0 50v-7M28 61h-7m58 0h-7M34 45l-5-5m37 5l5-5M34 77l-5 5m37-5l5 5",
  "M60 40a22 22 0 1 0 0 42A25 25 0 0 1 60 40Z",
  "m50 38 7 15 17 2-12 12 3 17-15-8-15 8 3-17-12-12 17-2Z",
  "M32 80Q22 42 70 38Q80 76 32 80Zm0 0 27-29",
  "M31 72h38l-6-10V53a13 13 0 0 0-26 0v9Zm14 5a5 5 0 0 0 10 0M50 36v-4",
  "m50 36 20 25-20 22-20-22Zm0 0v47M30 61h40M50 83q-12 9 0 15",
];

export function lanternArt(doc, index) {
  if (!Number.isInteger(index) || index < 0 || index >= colors.length) throw new RangeError("Invalid lantern.");
  const node = (tag, attributes) => {
    const element = doc.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    return element;
  };
  const svg = node("svg", { viewBox: "0 0 100 145", "aria-hidden": "true", class: "lantern-art" });
  svg.append(
    node("path", { d: "M50 0v17M37 22v-8q13-10 26 0v8", fill: "none", stroke: "#cdb58a", "stroke-width": 3 }),
    node("ellipse", { cx: 50, cy: 65, rx: 38, ry: 46, fill: colors[index], class: "lantern-paper" }),
    node("path", { d: "M50 20v90M32 25q-17 40 0 80M68 25q17 40 0 80M15 48h70M13 72h74M22 96h56", fill: "none", stroke: "#34261e", "stroke-opacity": ".25", "stroke-width": 2 }),
    node("rect", { x: 32, y: 18, width: 36, height: 7, rx: 3, fill: "#5c4633" }),
    node("rect", { x: 32, y: 105, width: 36, height: 7, rx: 3, fill: "#5c4633" }),
    node("path", { d: motifs[index], fill: index === 0 || index === 3 ? "none" : "#fff3cf", stroke: "#fff3cf", "stroke-width": 3, "stroke-linejoin": "round" }),
    node("path", { d: "M50 112v13m-5-2v15m5-13v18m5-20v15", stroke: colors[index], "stroke-width": 3 }),
  );
  if (index === 0) svg.append(node("circle", { cx: 50, cy: 61, r: 12, fill: "#fff3cf" }));
  return svg;
}
