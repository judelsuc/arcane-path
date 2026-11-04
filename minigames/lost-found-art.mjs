const OBJECTS = new Set([
  "umbrella-moon", "umbrella-star", "notebook-leaf", "notebook-flower",
  "keys-fish", "keys-bird", "pouch-square", "pouch-round",
]);

/** Original vector drawings; the distinctive details are shapes, not text or emoji. */
export function objectIllustration(doc, objectId, { resonance = false, closeup = false } = {}) {
  if (!OBJECTS.has(objectId)) throw new RangeError(`Unknown lost-property illustration: ${objectId}`);
  const node = (tag, attributes, parent) => {
    const element = doc.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    parent?.append(element);
    return element;
  };
  const pair = resonance && objectId.startsWith("umbrella-");
  const svg = node("svg", { viewBox: closeup && pair ? "86 94 51 48" : "0 0 180 160", class: "lost-found-art",
    "aria-hidden": "true", focusable: "false", "data-object": objectId });
  const group = node("g", { stroke: "#47382e", "stroke-width": 2.5,
    "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
  const path = (d, attrs = {}, parent = group) => node("path", { d, ...attrs }, parent);
  const circle = (cx, cy, r, attrs = {}, parent = group) => node("circle", { cx, cy, r, ...attrs }, parent);
  const rect = (x, y, width, height, attrs = {}, parent = group) =>
    node("rect", { x, y, width, height, ...attrs }, parent);
  node("ellipse", { cx: 90, cy: 146, rx: 59, ry: 6, fill: "#47382e", opacity: 0.12, stroke: "none" }, group);
  const [kind, detail] = objectId.split("-");
  if (kind === "umbrella") {
    path("M90 22V118Q90 140 110 132Q118 128 114 118", { fill: "none", stroke: "#a27145", "stroke-width": 9 });
    path("M20 70Q32 24 90 24Q148 24 160 70Q144 60 126 73Q108 58 90 73Q72 58 54 73Q38 60 20 70Z",
      { fill: "#4289ca", stroke: "#234e79" });
    path("M90 25Q64 34 54 70M90 25V70M90 25Q116 34 126 70", { fill: "none", stroke: "#82c5f0", "stroke-width": 2 });
    path("M90 17V23", { stroke: "#234e79", "stroke-width": 4 });
    circle(112, 117, 22, { fill: "#f5d996", stroke: "#846039", "data-detail": detail });
    if (detail === "moon" || pair) {
      path("M119 101A16 16 0 1 0 125 125A16 16 0 0 1 119 101Z", { fill: "#304b81", stroke: "none" });
    } else {
      path("M112 100L117 111L129 112L120 120L123 132L112 126L101 132L104 120L95 112L107 111Z",
        { fill: "#304b81", stroke: "none" });
    }
    if (pair) {
      const dots = objectId === "umbrella-moon" ? [112] : [107, 117];
      for (const x of dots) circle(x, 134, 2, { fill: "#304b81", stroke: "none", "data-detail": "engraved-dot" });
    }
  } else if (kind === "notebook") {
    rect(47, 25, 91, 116, { rx: 5, fill: "#fff8e4", stroke: "#90764f" });
    path("M53 131H134M53 135H134", { stroke: "#c8bca5", "stroke-width": 1 });
    rect(42, 20, 91, 112, { rx: 5, fill: "#4c8762", stroke: "#2c553e" });
    rect(42, 20, 12, 112, { rx: 4, fill: "#2e5e46", stroke: "none" });
    path("M61 29H123", { stroke: "#9acb94", "stroke-width": 2 });
    const mark = node("g", { "data-detail": detail }, group);
    if (detail === "leaf") {
      path("M77 104Q52 65 111 48Q125 95 77 104Z", { fill: "#d2e99b", stroke: "#234b34" }, mark);
      path("M70 113L105 60M82 95L82 76M91 82L106 80", { fill: "none", stroke: "#56834b", "stroke-width": 2 }, mark);
    } else {
      for (let petal = 0; petal < 5; petal++) {
        node("ellipse", { cx: 91, cy: 57, rx: 12, ry: 19, fill: "#ee9ca0", stroke: "#8d4855",
          transform: `rotate(${petal * 72} 91 79)` }, mark);
      }
      circle(91, 79, 12, { fill: "#f6d26d", stroke: "#8f622f" }, mark);
    }
    rect(126, 68, 12, 19, { rx: 3, fill: "#d3ae67", stroke: "#7b603c" });
  } else if (kind === "keys") {
    circle(62, 40, 23, { fill: "none", stroke: "#56646b", "stroke-width": 8 });
    circle(62, 40, 23, { fill: "none", stroke: "#c7d2d5", "stroke-width": 4 });
    path("M47 60L38 122L50 129L56 119L63 120L64 110L56 108L62 62Z", { fill: "#d3b263", stroke: "#8d7040" });
    circle(54, 63, 6, { fill: "#f0e3c4", stroke: "#8d7040" });
    path("M70 60L68 133H81V124H89V115H82V65Z", { fill: "#b9c5c9", stroke: "#66757c" });
    path("M78 54Q107 54 116 79", { fill: "none", stroke: "#75848b", "stroke-width": 4 });
    const mark = node("g", { "data-detail": detail, fill: "#d65c50", stroke: "#8e3e39" }, group);
    if (detail === "fish") {
      path("M99 100L77 82V118Z", {}, mark);
      node("ellipse", { cx: 121, cy: 100, rx: 29, ry: 21 }, mark);
      path("M115 81L124 70L134 83M116 120L126 130L132 118", {}, mark);
      path("M116 94L128 101L116 108Z", { fill: "#efad87" }, mark);
      circle(137, 95, 4, { fill: "#fff6df", stroke: "none" }, mark);
      circle(138, 95, 2, { fill: "#343332", stroke: "none" }, mark);
    } else {
      path("M100 104L79 98L89 119L107 116Z", {}, mark);
      node("ellipse", { cx: 119, cy: 105, rx: 24, ry: 22 }, mark);
      circle(134, 84, 15, {}, mark);
      path("M147 82L160 90L147 94", { fill: "#e4b652", stroke: "#996a36" }, mark);
      path("M103 102Q117 92 132 105Q118 126 103 102Z", { fill: "#efad87" }, mark);
      circle(138, 81, 3, { fill: "#fff6df", stroke: "none" }, mark);
      circle(139, 81, 1.5, { fill: "#343332", stroke: "none" }, mark);
      path("M118 125V135M128 125V135", { fill: "none" }, mark);
    }
  } else {
    path("M46 47Q33 68 30 124Q29 141 90 141Q151 141 150 124Q147 68 134 47Z",
      { fill: "#e8bd53", stroke: "#997434" });
    path("M46 48Q90 35 134 48L137 63Q90 75 43 63Z", { fill: "#f5d878", stroke: "#997434" });
    path("M57 55Q90 64 124 55M72 57Q49 33 37 52Q35 67 72 57Q45 83 38 91M106 57Q127 31 141 49Q147 66 106 57Q130 83 143 91",
      { fill: "none", stroke: "#76523a", "stroke-width": 3 });
    const attrs = { fill: "#ab6a4d", stroke: "#fce4a4", "stroke-width": 2.5,
      "stroke-dasharray": "4 4", "data-detail": detail };
    if (detail === "square") rect(68, 83, 44, 44, attrs);
    else circle(90, 105, 22, attrs);
  }
  return svg;
}
