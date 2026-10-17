const KEYS = {
  "audio-toggle": "M", "enter-world": "Enter",
  "start-travel": "N", "resume-travel": "C", "open-osm": "O",
  "restart-travel": "N", "rest-travel": "R", "sleep-travel": "H",
  "eat-travel": "E", "open-town": "T", "open-music": "B",
  "open-trail": "J", "save-travel": "S", "look-travel": "L",
  "retry-travel": "Y", "stop-travel": "Q", "show-photo": "P",
  "refresh-content": "U", "clear-content": "X",
  "birth-tarot-draw": "D", "birth-tarot-continue": "Enter",
  "daily-tarot-draw": "D", "daily-tarot-continue": "Enter",
  "previous-photo": "ArrowLeft", "next-photo": "ArrowRight",
  "town-refresh": "U", "town-services": "E", "town-music": "B",
  "town-trail": "J", "music-start": "Enter", "music-tap": "Space",
  "trail-interview": "I", "trail-restart": "N",
  "open-survival-choices": "F", "town-survival-choices": "F",
  "choice-forage": "F", "choice-beg": "B", "choice-steal": "T",
};
const DIRECTIONS = { "0,-1": "ArrowUp", "1,0": "ArrowRight", "0,1": "ArrowDown", "-1,0": "ArrowLeft" };

export function buttonBindings(buttons) {
  const bindings = buttons.map(button => ({
    button,
    key: KEYS[button.id] ?? DIRECTIONS[button.move] ?? (button.close ? "Escape" : null),
  }));
  const used = new Set(bindings.map(binding => binding.key));
  const available = [..."1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ"].filter(key => !used.has(key));
  for (const binding of bindings) {
    if (!binding.key) {
      binding.key = available.shift();
      if (!binding.key) throw new Error("Too many buttons in shortcut scope.");
    }
  }
  return bindings;
}

export function shortcutCode(event) {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return null;
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  return ["Enter", "Escape", "Space", "ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"]
    .includes(event.code) ? event.code : null;
}

export function setupButtonShortcuts(t) {
  const tooltip = document.createElement("div");
  tooltip.id = "button-tooltip";
  tooltip.role = "tooltip";
  tooltip.hidden = true;
  document.body.append(tooltip);
  let current;
  function bindings(scope) {
    return buttonBindings([...scope.querySelectorAll("button")].map(button => ({
      id: button.id, move: button.dataset.move,
      close: button.closest("form")?.getAttribute("method") === "dialog", element: button,
    })));
  }
  function label(key) {
    return key.length === 1 ? key : t(`shortcutKey.${key}`);
  }
  function refresh() {
    for (const scope of [document.querySelector("main"), ...document.querySelectorAll("dialog")]) {
      for (const { button, key } of bindings(scope)) {
        const element = button.element;
        const text = t("buttonTooltip", {
          action: element.textContent.trim(), key: label(key),
        });
        element.title = text;
        element.setAttribute("aria-keyshortcuts", `Alt+Shift+${key}`);
      }
    }
    if (current?.isConnected && !tooltip.hidden) tooltip.textContent = current.title;
    else tooltip.hidden = true;
  }
  function show(event) {
    const button = event.target.closest?.("button");
    if (!button) return;
    current = button;
    tooltip.textContent = button.title;
    const host = button.closest("dialog") ?? document.body;
    if (tooltip.parentElement !== host) host.append(tooltip);
    tooltip.hidden = false;
    button.setAttribute("aria-describedby",
      [...new Set([...(button.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean), tooltip.id])].join(" "));
    const rect = button.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - tooltip.offsetWidth - 8))}px`;
    tooltip.style.top = `${Math.max(8, rect.top - tooltip.offsetHeight - 8)}px`;
  }
  function hide() {
    if (current) {
      const ids = (current.getAttribute("aria-describedby") ?? "").split(" ").filter(id => id && id !== tooltip.id);
      if (ids.length) current.setAttribute("aria-describedby", ids.join(" "));
      else current.removeAttribute("aria-describedby");
    }
    current = undefined;
    tooltip.hidden = true;
  }
  document.addEventListener("pointerover", show);
  document.addEventListener("focusin", show);
  document.addEventListener("pointerout", hide);
  document.addEventListener("focusout", hide);
  document.addEventListener("click", hide);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
  document.addEventListener("keydown", event => {
    const key = shortcutCode(event);
    if (!key || event.defaultPrevented || event.repeat ||
        event.target.closest?.("input,select,textarea,[contenteditable]")) return;
    const dialogs = [...document.querySelectorAll("dialog[open]")];
    const scope = dialogs.find(dialog => dialog.contains(document.activeElement)) ??
      dialogs.at(-1) ?? document.querySelector("main");
    const match = bindings(scope).find(binding => binding.key === key &&
      binding.button.element.getClientRects().length && !binding.button.element.closest("[hidden],[inert]"));
    const button = match?.button.element;
    if (!button || button.disabled || !button.getClientRects().length ||
        button.closest("[hidden],[inert]")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    hide();
    button.click();
  }, true);
  new MutationObserver(records => {
    if (records.some(record => record.target !== tooltip && !tooltip.contains(record.target))) refresh();
  }).observe(document.body, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ["hidden", "disabled", "open", "lang"],
  });
  refresh();
}
