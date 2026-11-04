import "./public/vendor/html-to-image-1.11.13.js";
import { diagnosticSnapshot } from "./change-request-snapshot.mjs";

function frozenView(doc, width, height) {
  const host = doc.createElement("div");
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;overflow:hidden;pointer-events:none;`;
  host.setAttribute("aria-hidden", "true");
  host.dataset.changeRequestCapture = "true";
  const root = doc.createElement("div");
  root.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;`;
  host.append(root);
  const resources = new Map();
  let nodeId = 0;
  function resource(url, apply) {
    if (!resources.has(url)) resources.set(url, []);
    resources.get(url).push(apply);
  }
  function background(style, update = () => {}) {
    const matches = [...style.backgroundImage.matchAll(/url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/g)];
    if (/url\(/i.test(style.backgroundImage) && !matches.length) {
      throw new Error("Unsupported visible background image.");
    }
    for (const match of matches) resource(match[1] ?? match[2] ?? match[3], encoded => {
      style.backgroundImage = style.backgroundImage.replace(match[0], `url("${encoded}")`);
      update();
    });
  }
  function clone(node, modal = false) {
    if (node.nodeType === 3) return node.cloneNode();
    if (node.nodeType !== 1 || node.matches(
      "script,style,link,audio,[data-change-request-capture],#change-request-dialog") ||
      node.tagName === "DIALOG" && !modal || node.hidden) return null;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return null;
    const rect = node.getBoundingClientRect();
    const onScreen = rect.bottom > 0 && rect.right > 0 && rect.top < height && rect.left < width;
    if (onScreen && node.matches("video,iframe")) throw new Error("Visible embedded video or frames cannot be captured safely.");
    let copy;
    if (node.tagName === "CANVAS") {
      copy = doc.createElement("img");
      copy.src = node.toDataURL("image/png");
    } else copy = node.tagName === "DIALOG" || node.tagName === "BODY"
      ? doc.createElement("div") : node.cloneNode(false);
    for (const property of style) copy.style.setProperty(property, style.getPropertyValue(property));
    copy.style.animation = "none";
    copy.style.transition = "none";
    if (onScreen) background(copy.style);
    else copy.style.backgroundImage = "none";
    if (node.id) copy.id = `change-request-capture-${node.id}`;
    copy.removeAttribute("autofocus");
    if (node.matches("input,textarea")) {
      const redact = node.matches('input[type="password"],input[type="hidden"]');
      copy.value = redact ? "" : node.value;
      if (redact) copy.removeAttribute("value");
      if (node.matches('input[type="checkbox"],input[type="radio"]')) {
        copy.toggleAttribute("checked", node.checked);
      }
    }
    if (node.tagName === "OPTION") copy.toggleAttribute("selected", node.selected);
    if (node.tagName !== "CANVAS") for (const child of node.childNodes) {
      const rendered = clone(child);
      if (rendered) copy.append(rendered);
    }
    for (const attribute of copy.attributes) {
      let value = attribute.value.replace(/url\((["']?)#([^)"']+)\1\)/g,
        (_, quote, id) => `url(${quote}#change-request-capture-${id}${quote})`);
      if (["href", "xlink:href"].includes(attribute.name) && value.startsWith("#")) {
        value = `#change-request-capture-${value.slice(1)}`;
      }
      if (value !== attribute.value) copy.setAttribute(attribute.name, value);
    }
    if (node.tagName === "IMG") {
      copy.removeAttribute("srcset");
      if (onScreen) {
        if (!node.complete || !node.naturalWidth) throw new Error("A visible image has not loaded.");
        copy.src = node.currentSrc || node.src;
        resource(copy.src, encoded => { copy.src = encoded; });
      } else {
        copy.removeAttribute("src");
        copy.style.width = `${rect.width}px`;
        copy.style.height = `${rect.height}px`;
      }
    }
    if (node.tagName === "DIALOG") {
      copy.style.cssText += `;position:absolute;inset:auto;left:${rect.left}px;top:${rect.top}px;margin:0;width:${rect.width}px;height:${rect.height}px;box-sizing:border-box;`;
      copy.removeAttribute("open");
    }
    if (node.scrollTop || node.scrollLeft) {
      // SVG foreignObject does not retain DOM scroll offsets; freeze the scrolled content as geometry.
      const content = doc.createElement("div");
      for (const property of style) content.style.setProperty(property, style.getPropertyValue(property));
      content.style.cssText += `;position:relative;inset:auto;margin:0;border:0;box-sizing:border-box;width:${node.clientWidth}px;height:auto;min-height:0;max-height:none;overflow:visible;transform:translate(${-node.scrollLeft}px,${-node.scrollTop}px);`;
      content.style.background = "none";
      content.append(...copy.childNodes);
      copy.style.padding = "0";
      copy.style.overflow = "hidden";
      copy.append(content);
    }
    for (const pseudo of ["::before", "::after"]) {
      const computed = getComputedStyle(node, pseudo);
      if (computed.content === "none" || computed.content === "normal" || computed.display === "none") continue;
      const declaration = doc.createElement("span").style;
      for (const property of computed) declaration.setProperty(property, computed.getPropertyValue(property));
      declaration.animation = "none";
      declaration.transition = "none";
      const id = String(++nodeId);
      copy.setAttribute(`data-capture-${pseudo.slice(2)}`, id);
      const rule = doc.createElement("style");
      const update = () => {
        rule.textContent = `[data-capture-${pseudo.slice(2)}="${id}"]${pseudo}{${declaration.cssText}}`;
      };
      if (onScreen) background(declaration, update);
      else declaration.backgroundImage = "none";
      update();
      root.append(rule);
    }
    return copy;
  }
  const body = clone(doc.body);
  body.style.cssText += `;position:absolute;inset:auto;left:${-globalThis.scrollX}px;top:${-globalThis.scrollY}px;margin:0;width:${width}px;`;
  root.style.backgroundColor = getComputedStyle(doc.body).backgroundColor;
  root.append(body);
  for (const dialog of doc.querySelectorAll("dialog[open]")) {
    const backdrop = doc.createElement("div");
    backdrop.style.cssText = `position:absolute;inset:0;background:${getComputedStyle(dialog, "::backdrop").backgroundColor};`;
    root.append(backdrop);
    const copy = clone(dialog, true);
    if (copy) root.append(copy);
  }
  doc.body.append(host);
  return { host, root, resources };
}

export function freezeEvidence(state, build, { doc = document } = {}) {
  const snapshot = diagnosticSnapshot(state, { doc, build });
  const { width, height } = snapshot.viewport;
  if (width < 100 || height < 100 || width > 8192 || height > 8192) {
    throw new Error("Unsupported game viewport dimensions.");
  }
  const frozen = frozenView(doc, width, height);
  return {
    snapshot,
    async image() {
      try {
        await doc.fonts.ready;
        // Check every visible resource first: html-to-image otherwise hides some failed downloads.
        await Promise.all([...frozen.resources].map(async ([value, targets]) => {
          const response = await fetch(value, { signal: AbortSignal.timeout(10000) });
          if (!response.ok) throw new Error(`Visible image capture failed: HTTP ${response.status}`);
          const blob = await response.blob();
          const encoded = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          const decoded = new Image();
          decoded.src = encoded;
          await decoded.decode();
          for (const apply of targets) apply(encoded);
        }));
        const ratio = Math.min(2, 2048 / Math.max(width, height));
        const blob = await globalThis.htmlToImage.toBlob(frozen.root, {
          width, height, pixelRatio: ratio, skipFonts: true,
          backgroundColor: frozen.root.style.backgroundColor,
          filter: node => node.tagName !== "SCRIPT",
        });
        if (!blob?.size || blob.size > 3_000_000) throw new Error("Empty or oversized screenshot (maximum 3 MB).");
        return blob;
      } finally {
        frozen.host.remove();
      }
    },
  };
}
