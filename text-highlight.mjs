const COMPASS_POINTS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

export function compassTerms(t) {
  return COMPASS_POINTS.map(point => t(`hintCompass.${point}`));
}

export function highlightPattern(terms) {
  const escaped = [...new Set(terms)].filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return escaped.length ? new RegExp(`(?<!\\p{L})(?:${escaped.join("|")})(?!\\p{L})`, "gu") : null;
}

// Sets the element's text, wrapping important terms in <mark class="text-highlight">.
// The element's textContent is identical with or without highlighting.
export function setHighlightedText(element, text, pattern) {
  const value = String(text ?? "");
  element.textContent = value;
  const doc = element.ownerDocument ?? globalThis.document;
  if (!pattern || typeof doc?.createTextNode !== "function") return;
  pattern.lastIndex = 0;
  const matches = [...value.matchAll(pattern)];
  if (!matches.length) return;
  element.textContent = "";
  let last = 0;
  for (const match of matches) {
    if (match.index > last) element.append(doc.createTextNode(value.slice(last, match.index)));
    const mark = doc.createElement("mark");
    mark.className = "text-highlight";
    mark.textContent = match[0];
    element.append(mark);
    last = match.index + match[0].length;
  }
  if (last < value.length) element.append(doc.createTextNode(value.slice(last)));
}
