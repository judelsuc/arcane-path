import { PARTS } from "./workshop.mjs";

const PALETTE = { red: "#e96861", blue: "#60aee9", gold: "#efbf4f", green: "#72c491" };
const SCALE = { small: 0.8, medium: 1, large: 1.2 };
const CLOSEUPS = {
  frame: "80 45 165 115", rearWheel: "25 85 100 100", frontWheel: "205 85 100 100",
  seat: "92 15 76 50", pedals: "100 101 90 70", handlebars: "210 0 75 80",
};

function svgNode(doc, tag, attributes, parent) {
  const element = doc.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  parent?.append(element);
  return element;
}

function drawPart(doc, parent, part, value, ghost) {
  const scale = SCALE[value.size], colour = ghost ? "#6c7c79" : PALETTE[value.colour];
  const group = svgNode(doc, "g", { "data-part": part, "data-colour": value.colour,
    "data-size": value.size, opacity: ghost ? 0.25 : 1, fill: "none",
    stroke: colour, "stroke-width": 6, "stroke-linecap": "round", "stroke-linejoin": "round" }, parent);
  const path = (d, attributes = {}) => svgNode(doc, "path", { d, ...attributes }, group);
  const circle = (cx, cy, r, attributes = {}) => svgNode(doc, "circle", { cx, cy, r, ...attributes }, group);
  if (part === "rearWheel" || part === "frontWheel") {
    const x = part === "rearWheel" ? 75 : 255, radius = 36 * scale;
    circle(x, 135, radius, { stroke: "#1a252c", "stroke-width": 9 });
    circle(x, 135, radius - 1, { "stroke-width": 4 });
    for (let spoke = 0; spoke < 8; spoke++) {
      const angle = spoke * Math.PI / 4;
      path(`M${x} 135l${Math.cos(angle) * (radius - 5)} ${Math.sin(angle) * (radius - 5)}`,
        { stroke: "#b1c5c7", "stroke-width": 1.4 });
    }
    circle(x, 135, 4, { fill: colour, "stroke-width": 2 });
  } else if (part === "frame") {
    const top = 90 - 18 * scale;
    path(`M75 135L124 ${top} 145 135H75L223 ${top}H124M145 135L223 ${top} 255 135`,
      { "stroke-width": 7 });
    path(`M124 ${top}l-7-23M223 ${top}l-7-28`, { stroke: "#b9c6c5", "stroke-width": 5 });
    circle(145, 135, 8, { fill: "#263b40", "stroke-width": 3 });
  } else if (part === "seat") {
    const width = 28 * scale;
    path(`M117 57V38`, { stroke: "#bcc7c5", "stroke-width": 4 });
    path(`M${117 - width / 2} 33Q115 26 ${117 + width} 35L${117 + width} 41H${117 - width / 2}Z`,
      { fill: colour, stroke: "#28383e", "stroke-width": 2 });
    path(`M${117 - width / 2 + 3} 34L${117 + width - 4} 36`, { stroke: "#fff7", "stroke-width": 2 });
  } else if (part === "pedals") {
    const length = 19 * scale, width = 15 * scale;
    circle(145, 135, 11, { stroke: "#a6b5b8", "stroke-width": 3 });
    path(`M${145 - length} ${135 - length}L${145 + length} ${135 + length}`,
      { stroke: "#bdc8ca", "stroke-width": 4 });
    for (const sign of [-1, 1]) {
      svgNode(doc, "rect", { x: 145 + sign * length - width / 2, y: 135 + sign * length - 4,
        width, height: 8, rx: 2, fill: colour, stroke: "#233239", "stroke-width": 1.5 }, group);
    }
  } else if (part === "handlebars") {
    const width = { small: 14, medium: 30, large: 46 }[value.size];
    const top = { small: 26, medium: 19, large: 12 }[value.size];
    path(`M216 46L224 ${top}H${224 + width}Q${234 + width} ${top} ${234 + width} ${top + 10}`,
      { stroke: "#c8d4d0", "stroke-width": 5 });
    path(`M${234 + width} ${top + 8}v12M224 ${top}h${width * 0.7}`, { "stroke-width": 7 });
  }
  return group;
}

export function bikeIllustration(doc, assembly, label, { part } = {}) {
  const svg = svgNode(doc, "svg", { viewBox: part ? CLOSEUPS[part] : "8 0 320 200",
    role: "img", "aria-label": label, class: part ? "workshop-part-art" : "workshop-bike-art" });
  if (!part) {
    svgNode(doc, "ellipse", { cx: 165, cy: 185, rx: 143, ry: 6, fill: "#07191f", opacity: 0.3 }, svg);
  }
  for (const key of part ? [part] : [PARTS[1], PARTS[2], PARTS[0], ...PARTS.slice(3)]) {
    const value = assembly[key];
    drawPart(doc, svg, key, value ?? { colour: "blue", size: "medium" }, !value);
  }
  return svg;
}
