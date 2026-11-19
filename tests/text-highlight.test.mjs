import test from "node:test";
import assert from "node:assert/strict";
import { compassTerms, highlightPattern, setHighlightedText } from "../text-highlight.mjs";
import { translate } from "../i18n.mjs";

class Node {
  children = [];
  #text = "";
  constructor(doc, tag, text = "") { this.ownerDocument = doc; this.tagName = tag; this.#text = text; }
  append(...children) { this.children.push(...children); }
  set textContent(value) { this.#text = String(value); this.children = []; }
  get textContent() { return this.#text + this.children.map(child => child.textContent).join(""); }
}
const doc = {
  createElement: tag => new Node(doc, tag),
  createTextNode: text => new Node(doc, undefined, text),
};

for (const locale of ["fr", "en"]) {
  test(`${locale} compass directions in clue texts are wrapped in marks without changing the text`, () => {
    const t = (key, args) => translate(locale, key, args);
    const pattern = highlightPattern(compassTerms(t));
    const text = t("trailOpeningClue", { parent: "Sacha", letter: "Les papiers tiennent encore.",
      direction: t("hintCompass.north") });
    const element = new Node(doc, "p");
    setHighlightedText(element, text, pattern);
    assert.equal(element.textContent, text, "highlighting must not alter the visible text");
    const marks = element.children.filter(child => child.tagName === "mark");
    assert.equal(marks.length, 1);
    assert.equal(marks[0].textContent, t("hintCompass.north"));
    assert.equal(marks[0].className, "text-highlight");
  });

  test(`${locale} composite directions are highlighted whole, not as nested shorter matches`, () => {
    const t = (key, args) => translate(locale, key, args);
    const pattern = highlightPattern(compassTerms(t));
    const element = new Node(doc, "p");
    const text = t("fieldClue.direction", { direction: t("hintCompass.northeast") });
    setHighlightedText(element, text, pattern);
    const marks = element.children.filter(child => child.tagName === "mark");
    assert.deepEqual(marks.map(mark => mark.textContent), [t("hintCompass.northeast")]);
    assert.equal(element.textContent, text);
  });
}

test("text without directions and simplified test documents keep plain text content", () => {
  const pattern = highlightPattern(compassTerms((key, args) => translate("fr", key, args)));
  const plain = new Node(doc, "p");
  setHighlightedText(plain, "Un témoignage local désigne Firmi.", pattern);
  assert.equal(plain.children.length, 0);
  assert.equal(plain.textContent, "Un témoignage local désigne Firmi.");
  const bare = { textContent: "" };
  setHighlightedText(bare, "Une piste indique globalement le nord.", pattern);
  assert.equal(bare.textContent, "Une piste indique globalement le nord.");
});
