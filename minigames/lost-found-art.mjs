const OBJECTS = new Set([
  "umbrella-moon", "umbrella-star", "notebook-leaf", "notebook-flower",
  "keys-fish", "keys-bird", "pouch-square", "pouch-round",
  "scarf-stripes", "scarf-dots", "bottle-cork", "bottle-cup",
  "hat-ribbon", "hat-feather", "mitten-snowflake", "mitten-heart",
  "glasses-round", "glasses-square", "mug-anchor", "mug-boat",
  "lantern-red", "lantern-green", "basket-apples", "basket-mushrooms",
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
  } else if (kind === "scarf") {
    path("M55 30Q90 20 125 30L120 118Q90 128 60 118Z", { fill: "#c4524a", stroke: "#7e322d" });
    path("M62 118L59 138M74 121L73 139M88 124L88 140M102 121L103 139M116 118L119 138",
      { fill: "none", stroke: "#7e322d" });
    const mark = node("g", { "data-detail": detail }, group);
    if (detail === "stripes") {
      path("M57 52Q90 44 123 52M58 76Q90 68 122 76M59 100Q90 92 121 100",
        { fill: "none", stroke: "#f3e2c0", "stroke-width": 7 }, mark);
    } else {
      for (const [cx, cy] of [[72, 55], [104, 50], [88, 78], [68, 98], [110, 95]]) {
        circle(cx, cy, 7, { fill: "#f3e2c0", stroke: "none" }, mark);
      }
    }
  } else if (kind === "bottle") {
    path("M78 42H102V54Q122 62 122 92V126Q122 140 90 140Q58 140 58 126V92Q58 62 78 54Z",
      { fill: "#3f7fb5", stroke: "#24537a" });
    path("M58 96Q90 104 122 96", { fill: "none", stroke: "#8fc3e8", "stroke-width": 3 });
    path("M66 60Q90 70 114 60", { fill: "none", stroke: "#8a6a43", "stroke-width": 5 });
    const mark = node("g", { "data-detail": detail }, group);
    if (detail === "cork") {
      rect(76, 24, 28, 20, { rx: 4, fill: "#c8a06a", stroke: "#8a6a43" }, mark);
      path("M82 28V40M90 27V41M98 28V40", { fill: "none", stroke: "#8a6a43", "stroke-width": 1.5 }, mark);
    } else {
      rect(70, 20, 40, 24, { rx: 6, fill: "#c7d2d5", stroke: "#66757c" }, mark);
      path("M70 32H110", { fill: "none", stroke: "#9fadb2", "stroke-width": 2 }, mark);
    }
  } else if (kind === "hat") {
    node("ellipse", { cx: 90, cy: 103, rx: 64, ry: 20, fill: "#e8c979", stroke: "#9a7b3c" }, group);
    path("M52 100Q52 48 90 48Q128 48 128 100Q90 112 52 100Z", { fill: "#f2d98e", stroke: "#9a7b3c" });
    path("M60 72Q90 64 120 72", { fill: "none", stroke: "#c9a85c", "stroke-width": 2 });
    const mark = node("g", { "data-detail": detail }, group);
    if (detail === "ribbon") {
      path("M53 94Q90 104 127 94L127 82Q90 92 53 82Z", { fill: "#6b4a74", stroke: "#4a3252" }, mark);
    } else {
      path("M96 78Q122 38 140 36Q136 58 108 84Z", { fill: "#d9e5ee", stroke: "#66757c" }, mark);
      path("M100 80Q122 56 136 40", { fill: "none", stroke: "#66757c", "stroke-width": 1.5 }, mark);
    }
  } else if (kind === "mitten") {
    path("M58 48Q58 28 82 26Q112 24 114 48V96Q132 84 142 94Q152 104 136 116Q120 128 114 130Q110 140 86 140Q60 140 58 120Z",
      { fill: "#7f9bc5", stroke: "#4a618a" });
    rect(56, 118, 60, 22, { rx: 8, fill: "#e9edf5", stroke: "#8b97ad" });
    path("M66 120V138M78 120V138M90 120V138M102 120V138",
      { fill: "none", stroke: "#8b97ad", "stroke-width": 1.5 });
    const mark = node("g", { "data-detail": detail }, group);
    if (detail === "snowflake") {
      path("M86 58V98M69 68L103 88M103 68L69 88M80 60L86 66L92 60M80 96L86 90L92 96",
        { fill: "none", stroke: "#f2f6fc", "stroke-width": 4 }, mark);
    } else {
      path("M86 96Q62 76 72 62Q80 52 86 64Q92 52 100 62Q110 76 86 96Z",
        { fill: "#d65c73", stroke: "#8e3e50" }, mark);
    }
  } else if (kind === "glasses") {
    path("M30 82L18 60M150 82L162 60", { fill: "none", stroke: "#5a4632", "stroke-width": 5 });
    path("M82 86Q90 76 98 86", { fill: "none", stroke: "#5a4632", "stroke-width": 5 });
    const mark = node("g", { "data-detail": detail, fill: "#d4ecf5", stroke: "#5a4632", "stroke-width": 6 }, group);
    if (detail === "round") {
      circle(56, 92, 26, {}, mark);
      circle(124, 92, 26, {}, mark);
    } else {
      rect(30, 68, 52, 46, { rx: 3 }, mark);
      rect(98, 68, 52, 46, { rx: 3 }, mark);
    }
    path("M44 82Q50 76 58 78M112 82Q118 76 126 78", { fill: "none", stroke: "#ffffff", "stroke-width": 3 });
  } else if (kind === "mug") {
    path("M118 62Q148 62 148 90Q148 118 118 116", { fill: "none", stroke: "#2f5d8a", "stroke-width": 9 });
    rect(40, 42, 80, 96, { rx: 10, fill: "#f4f1e8", stroke: "#2f5d8a" });
    path("M40 52H120", { stroke: "#2f5d8a", "stroke-width": 7 });
    const mark = node("g", { "data-detail": detail, fill: "none", stroke: "#2f5d8a", "stroke-width": 4 }, group);
    if (detail === "anchor") {
      circle(80, 70, 6, {}, mark);
      path("M80 76V122M66 86H94M58 106Q62 124 80 124Q98 124 102 106M54 110L58 104L64 110M96 110L102 104L106 110", {}, mark);
    } else {
      path("M56 108H104L96 122H64Z", { fill: "#b8573f", stroke: "#7a3a2a" }, mark);
      path("M80 108V68", {}, mark);
      path("M82 70L102 102H82Z", { fill: "#e9dcc0", stroke: "#2f5d8a" }, mark);
      path("M50 128Q60 122 70 128Q80 134 90 128Q100 122 110 128", { "stroke-width": 2.5 }, mark);
    }
  } else if (kind === "lantern") {
    path("M70 30Q90 6 110 30", { fill: "none", stroke: "#3e3a36", "stroke-width": 5 });
    path("M64 30H116L124 46H56Z", { fill: "#55504a", stroke: "#2e2b28" });
    const glass = detail === "red" ? ["#e0705f", "#9e3b31"] : ["#79b56f", "#3e6f3a"];
    const mark = node("g", { "data-detail": detail }, group);
    rect(62, 46, 56, 74, { fill: glass[0], stroke: glass[1], opacity: 0.9 }, mark);
    path("M90 46V120M62 83H118", { fill: "none", stroke: "#2e2b28", "stroke-width": 3 }, mark);
    path("M90 110Q76 96 90 76Q104 96 90 110Z", { fill: "#f8d777", stroke: "#c98a2c", "stroke-width": 2 });
    path("M56 120H124L118 134H62Z", { fill: "#55504a", stroke: "#2e2b28" });
  } else if (kind === "basket") {
    path("M46 80Q46 28 90 28Q134 28 134 80", { fill: "none", stroke: "#9b7442", "stroke-width": 7 });
    const mark = node("g", { "data-detail": detail }, group);
    if (detail === "apples") {
      for (const [cx, cy] of [[62, 74], [90, 68], [118, 74], [76, 62], [104, 62]]) {
        circle(cx, cy, 14, { fill: "#cf4a3c", stroke: "#86302a" }, mark);
        path(`M${cx} ${cy - 14}Q${cx + 2} ${cy - 22} ${cx + 6} ${cy - 22}`, { fill: "none", stroke: "#5a3e22" }, mark);
      }
    } else {
      for (const [cx, cy] of [[64, 70], [92, 62], [118, 72]]) {
        rect(cx - 5, cy, 10, 16, { rx: 3, fill: "#f2e6cc", stroke: "#8a7552" }, mark);
        path(`M${cx - 18} ${cy + 2}Q${cx} ${cy - 22} ${cx + 18} ${cy + 2}Z`, { fill: "#a8643a", stroke: "#6b3d22" }, mark);
        circle(cx - 6, cy - 6, 2.5, { fill: "#f2e6cc", stroke: "none" }, mark);
      }
    }
    path("M36 80H144L130 138H50Z", { fill: "#d2a463", stroke: "#8a6430" });
    path("M40 96H140M44 112H136M47 126H133", { fill: "none", stroke: "#a87a3e", "stroke-width": 2 });
    path("M66 80L70 138M90 80V138M114 80L110 138", { fill: "none", stroke: "#a87a3e", "stroke-width": 2 });
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
