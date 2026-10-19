/** Keep explanatory sources intact; show their current copy in an accessible help modal. */
export function setupWindowHelp(doc, {
  sources: sourceSelector, hosts: hostSelector, contextual = true,
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
  const timing = doc.createElement("p");
  dialog.append(heading, close, content, timing);
  doc.body.append(dialog);
  const hidden = new Map(), triggers = new Map();
  let opener = null, activeHost = null, signature = "";

  function sync() {
    const words = getWords();
    dialog.setAttribute("aria-label", words.help);
    if (heading.textContent !== words.help) heading.textContent = words.help;
    if (close.textContent !== words.close) close.textContent = words.close;
    if (timing.textContent !== words.timing) timing.textContent = words.timing;
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
      if (!host.isConnected) {
        button.removeEventListener("click", open);
        triggers.delete(host);
      } else if (button.textContent !== words.help) button.textContent = words.help;
    }
    for (const host of doc.querySelectorAll(hostSelector)) {
      if (host === dialog || dialog.contains(host) || triggers.has(host)) continue;
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
      if (dialog.contains(record.target)) return false;
      const target = record.target.nodeType === 3 ? record.target.parentElement : record.target;
      if (target?.closest?.(sourceSelector)) return true;
      return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
        (node.matches(sourceSelector) || node.querySelector(sourceSelector) ||
          node.matches(hostSelector) || node.querySelector(hostSelector)));
    });
    if (changed) sync();
  });
  observer.observe(doc.body, { childList: true, characterData: true, subtree: true });
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
      dialog.remove();
    },
  };
}
