const drawings = {
  apple: [["path", { d: "M48 30C15 12 8 55 28 78q10 10 22 1 12 9 22-1 26-38-5-51-9-4-19 3", fill: "#d96951" }],
    ["path", { d: "M49 31q-2-18 9-23m-6 14q21 0 19-14-18-1-19 14", fill: "#91ab58", stroke: "#516a38", "stroke-width": 3 }]],
  bread: [["path", { d: "M12 68Q1 41 37 24q38-18 51 8 16 35-23 47-41 16-53-11Z", fill: "#d9a45c", stroke: "#8c572e", "stroke-width": 3 }],
    ["path", { d: "m32 30 8 18m12-25 9 19m9-20 9 16", stroke: "#f9dfaa", "stroke-width": 6 }]],
  carrot: [["path", { d: "M30 30q20-16 35 5L45 88Z", fill: "#ed974d", stroke: "#ad6432", "stroke-width": 2 }],
    ["path", { d: "m42 30-9-19m15 16 4-23m3 25L70 10", stroke: "#81ac54", "stroke-width": 7 }],
    ["path", { d: "m35 45 12 1m1 14 10 2", stroke: "#b86733", "stroke-width": 3 }]],
  cheese: [["path", { d: "m14 42 43-24 31 24v36H14Z", fill: "#dfac4e", stroke: "#a57132", "stroke-width": 3 }],
    ["path", { d: "m14 42 43-24 31 24Z", fill: "#f4d275" }],
    ...[[30, 58, 6], [65, 65, 8], [51, 49, 4]].map(([cx, cy, r]) => ["circle", { cx, cy, r, fill: "#b27d32" }])],
  egg: [["path", { d: "M50 10C32 10 11 48 19 68c12 30 61 25 64-5C85 42 65 10 50 10Z", fill: "#efe0bf", stroke: "#b9a17d", "stroke-width": 3 }],
    ["path", { d: "M35 28q-12 15-11 27", fill: "none", stroke: "#fff5de", "stroke-width": 5 }]],
  honey: [["rect", { x: 24, y: 24, width: 52, height: 61, rx: 10, fill: "#d79836", stroke: "#8c6532", "stroke-width": 3 }],
    ["rect", { x: 25, y: 15, width: 50, height: 16, rx: 4, fill: "#ad7440" }],
    ["path", { d: "m50 40 17 10v20L50 80 33 70V50Z", fill: "#f9d37a", stroke: "#a57934", "stroke-width": 2 }],
    ["path", { d: "m43 53 14 14m-14 0 14-14", stroke: "#a57934", "stroke-width": 3 }]],
  pear: [["path", { d: "M48 22c-15 0-12 18-23 31-23 34 42 52 55 17 5-17-18-26-19-39-1-8-6-10-13-9Z", fill: "#b8be59", stroke: "#7b8c3d", "stroke-width": 3 }],
    ["path", { d: "m51 24 6-17m-2 11q18 4 23-10-18-6-23 10", fill: "#7d9d47", stroke: "#596d33", "stroke-width": 3 }]],
  tomato: [["ellipse", { cx: 50, cy: 57, rx: 37, ry: 30, fill: "#db6550", stroke: "#a94738", "stroke-width": 3 }],
    ["path", { d: "m50 39-21-9 14-2 6-15 6 15 16-5-10 13 11 9-18-4-9 13Z", fill: "#719147" }]],
  basket: [["path", { d: "M22 44V32a28 28 0 0 1 56 0v12", fill: "none", stroke: "#a87f51", "stroke-width": 7 }],
    ["path", { d: "m8 40 12 47h60l12-47Z", fill: "#ad7d4c", stroke: "#684b30", "stroke-width": 3 }],
    ["path", { d: "m28 43 5 40m17-40v40m22-40-5 40M15 55h71M19 70h64", stroke: "#d3aa72", "stroke-width": 4 }]],
};

export function marketArt(doc, kind) {
  if (!Object.hasOwn(drawings, kind)) throw new RangeError("Unknown market illustration.");
  const element = (tag, attributes) => {
    const node = doc.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    return node;
  };
  const svg = element("svg", { viewBox: "0 0 100 100", "aria-hidden": "true", class: `market-art market-art-${kind}` });
  for (const [tag, attributes] of drawings[kind]) svg.append(element(tag, attributes));
  return svg;
}

export function moneyArt(doc, cents) {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new RangeError("Invalid market money.");
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 65");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "market-money-art");
  const shape = doc.createElementNS("http://www.w3.org/2000/svg", cents <= 200 ? "ellipse" : "rect");
  const attributes = cents <= 200 ? { cx: 50, cy: 32, rx: 27, ry: 27, fill: cents <= 5 ? "#bb7e54" : "#d4b467" }
    : { x: 4, y: 8, width: 92, height: 48, rx: 4, fill: cents <= 1000 ? "#bc9279" : "#7da6af" };
  for (const [name, value] of Object.entries({ ...attributes, stroke: "#f0dbad", "stroke-width": 2 })) shape.setAttribute(name, String(value));
  svg.append(shape);
  return svg;
}
