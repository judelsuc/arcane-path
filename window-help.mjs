/** Keep explanatory sources intact; show their current copy in an accessible help modal. */
export function setupWindowHelp(doc, {
  sources: sourceSelector, foldedSources: foldedSelector, hosts: hostSelector, contextual = true,
  words: getWords, description = () => "", anchor: findAnchor,
} = {}) {
  const main = doc.querySelector("main");
  if (!main || !sourceSelector || !hostSelector || typeof getWords !== "function")
    throw new TypeError("Window help needs a main element, selectors and translated labels.");
  const dialog = doc.createElement("dialog");
  dialog.className = "window-help-dialog preview-help-dialog";
  const heading = doc.createElement("h2");
  const close = doc.createElement("button");
  close.type = "button";
  close.autofocus = true;
  const content = doc.createElement("div");
  const technicalHeading = doc.createElement("h3");
  const technicalBlock = doc.createElement("div");
  technicalBlock.className = "window-help-technical";
  const timing = doc.createElement("p");
  dialog.append(heading, close, content, technicalHeading, technicalBlock, timing);
  doc.body.append(dialog);
  const hidden = new Map(), triggers = new Map(), folded = new Map();
  let opener = null, activeHost = null, signature = "";

  // Alerts, failures and busy indicators must stay visible in place; everything
  // else technical lives in the on-demand help dialog instead of inline folds.
  const needsInline = node => node.getAttribute?.("role") === "alert" ||
    node.dataset?.feedback === "failure" || node.ariaBusy === "true";

  function sync() {
    const words = getWords();
    dialog.setAttribute("aria-label", words.help);
    if (heading.textContent !== words.help) heading.textContent = words.help;
    if (close.textContent !== words.close) close.textContent = words.close;
    if (timing.textContent !== words.timing) timing.textContent = words.timing;
    if (technicalHeading.textContent !== words.details) technicalHeading.textContent = words.details;
    for (const [node, meta] of folded) {
      if (!meta.placeholder.isConnected || !node.isConnected) {
        if (meta.holder.contains(node)) node.remove();
        meta.holder.remove();
        meta.placeholder.remove();
        folded.delete(node);
      } else if (!node.matches(foldedSelector) || needsInline(node)) {
        meta.placeholder.before(node);
        meta.placeholder.remove();
        meta.holder.remove();
        folded.delete(node);
      }
    }
    for (const node of foldedSelector ? doc.querySelectorAll(foldedSelector) : []) {
      if (dialog.contains(node) || node.matches(sourceSelector) || folded.has(node)) continue;
      if (needsInline(node)) continue;
      if (node.closest("details")) continue;
      const placeholder = doc.createElement("span");
      placeholder.hidden = true;
      node.before(placeholder);
      const holder = doc.createElement("div");
      holder.className = "window-help-technical-item";
      holder.append(node);
      technicalBlock.append(holder);
      folded.set(node, { placeholder, holder, host: placeholder.closest(hostSelector) });
    }
    let anyTechnical = false;
    for (const [node, meta] of folded) {
      const empty = node.hidden || !node.textContent.trim();
      const foreign = contextual && activeHost && meta.host !== activeHost;
      meta.holder.hidden = empty || Boolean(foreign);
      if (!meta.holder.hidden) anyTechnical = true;
    }
    technicalHeading.hidden = !anyTechnical;
    technicalBlock.hidden = !anyTechnical;
    const sources = [...doc.querySelectorAll(sourceSelector)].filter(node => !dialog.contains(node));
    for (const node of sources) {
      if (!hidden.has(node)) hidden.set(node, node.hidden);
      if (!node.hidden) node.hidden = true;
    }
    for (const node of hidden.keys()) if (!node.isConnected) hidden.delete(node);
    const relevant = contextual ? sources.filter(node => node.closest(hostSelector) === activeHost) : sources;
    const paragraphs = [activeHost ? description(activeHost) : "",
      ...relevant.map(node => node.textContent.trim())].filter(Boolean);
    const nextSignature = JSON.stringify(paragraphs);
    if (signature !== nextSignature) {
      signature = nextSignature;
      content.replaceChildren(...paragraphs.map(text => {
        const paragraph = doc.createElement("p");
        paragraph.textContent = text;
        return paragraph;
      }));
    }
    for (const [host, { button, open }] of triggers) {
      if (!host.isConnected || !button.isConnected) {
        button.removeEventListener("click", open);
        triggers.delete(host);
      } else if (button.textContent !== words.help) button.textContent = words.help;
    }
    for (const host of doc.querySelectorAll(hostSelector)) {
      if (host === dialog || dialog.contains(host) || host.dataset.customHelp === "true" || triggers.has(host)) continue;
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "window-help-button preview-help-button";
      button.textContent = words.help;
      button.setAttribute("aria-haspopup", "dialog");
      const open = () => {
        activeHost = host;
        sync();
        if (dialog.open) return;
        opener = button;
        dialog.showModal();
      };
      button.addEventListener("click", open);
      const anchor = findAnchor?.(host) ?? host.querySelector("h1, h2, h3");
      if (anchor) anchor.after(button);
      else host.prepend(button);
      triggers.set(host, { button, open });
    }
  }
  const restoreFocus = () => {
    if (opener?.isConnected && !opener.disabled) opener.focus();
    opener = null;
    activeHost = null;
  };
  const closeHelp = () => dialog.close();
  // Escape belongs to the help modal, not to the game underneath it.
  const containKeys = event => event.stopPropagation();
  close.addEventListener("click", closeHelp);
  dialog.addEventListener("close", restoreFocus);
  dialog.addEventListener("keydown", containKeys);
  dialog.addEventListener("keyup", containKeys);
  sync();
  const observer = new doc.defaultView.MutationObserver(records => {
    const changed = records.some(record => {
      const target = record.target.nodeType === 3 ? record.target.parentElement : record.target;
      if (dialog.contains(record.target) && !(target && technicalBlock.contains(target))) return false;
      if (folded.has(target)) return true;
      if (target?.closest?.(sourceSelector)) return true;
      if (foldedSelector && target?.closest?.(foldedSelector)) return true;
      return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
        (node.matches(sourceSelector) || node.querySelector(sourceSelector) ||
          foldedSelector && (node.matches(foldedSelector) || node.querySelector(foldedSelector)) ||
          node.matches(hostSelector) || node.querySelector(hostSelector)));
    });
    if (changed) sync();
  });
  observer.observe(doc.body, { childList: true, characterData: true, subtree: true,
    attributes: true, attributeFilter: ["hidden", "data-feedback", "aria-busy", "class"] });
  return {
    localize: sync,
    destroy() {
      observer.disconnect();
      if (dialog.open) dialog.close();
      close.removeEventListener("click", closeHelp);
      dialog.removeEventListener("close", restoreFocus);
      dialog.removeEventListener("keydown", containKeys);
      dialog.removeEventListener("keyup", containKeys);
      for (const { button, open } of triggers.values()) {
        button.removeEventListener("click", open);
        button.remove();
      }
      for (const [node, wasHidden] of hidden) node.hidden = wasHidden;
      for (const [node, { placeholder, holder }] of folded) {
        if (placeholder.isConnected) placeholder.before(node);
        placeholder.remove();
        holder.remove();
      }
      dialog.remove();
    },
  };
}
