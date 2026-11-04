import { CAFE, cafeVenues, cafeDifficulty, createCafeGame, advanceCafe, cafeInput, cafeFinished } from "./cafe.mjs";
import { setFeedback } from "./feedback.mjs";
import { outcomeReputation } from "./practice.mjs";
import { decorateResonance, resolveResonance } from "./arcane-resonance.mjs";

export function setupCafe(t, { context, begin, settle, audio, resonance = () => false }) {
  const dialog = document.querySelector("#cafe-dialog");
  const start = document.querySelector("#cafe-start");
  const venueSelect = document.querySelector("#cafe-venue");
  const result = document.querySelector("#cafe-result");
  const orders = document.querySelector("#cafe-orders");
  const traySlots = CAFE.ingredients.map(item => {
    const slot = document.createElement("span");
    slot.className = "cafe-tray-slot";
    const icon = document.createElement("span");
    icon.className = `cafe-item-art cafe-item-${item}`;
    const badge = document.createElement("span");
    badge.className = "cafe-tray-count";
    slot.append(icon, badge);
    return { item, slot, badge };
  });
  document.querySelector("#cafe-tray-art").replaceChildren(...traySlots.map(({ slot }) => slot));
  const customerButtons = Array.from({ length: 3 }, (_, slot) => {
    const button = document.createElement("button");
    button.id = `cafe-customer-${slot + 1}`;
    button.type = "button";
    const notice = document.createElement("span");
    notice.setAttribute("aria-live", "polite");
    button.append(document.createElement("span"), notice);
    button.addEventListener("click", () => {
      const order = game?.orders.find(o => o.id === Number(button.dataset.orderId) &&
        o.status === "waiting" && o.arrivesAt <= performance.now());
      if (order) input("select", order.id);
    });
    return button;
  });
  const text = (element, value) => { if (element.textContent !== value) element.textContent = value; };
  let game, timer, feedback = null, failure = "", decorated = false, decorationNodes = [];
  const instructions = document.querySelector("#cafe-dialog .window-help-text");
  const baseInstructions = instructions.textContent;
  const french = document.documentElement?.lang !== "en";
  function showVariantHelp(active) {
    instructions.textContent = active
      ? `${baseInstructions} ${french
        ? "Variante de Tempérance : certains clients ajoutent ou retirent un article à mi-préparation du plateau, une seule fois. Leur fréquence augmente avec le niveau (20 à 60 %). La commande modifiée est signalée ; le plateau reste inchangé. Ajoutez l'article manquant ou videz et refaites le plateau si nécessaire."
        : "Temperance variant: some customers add or remove one item halfway through tray preparation, once only. Their frequency increases with level (20 to 60%). Changed orders are highlighted; your tray stays unchanged. Add the missing item or clear and rebuild the tray if needed."}`
      : baseInstructions;
  }
  function setResonanceDecoration(active) {
    if (!active) {
      decorationNodes.forEach(node => node.remove?.());
      decorationNodes = [];
      dialog.className = (dialog.className || "").replace(/\barcane-resonance\b/g, "").trim();
      decorated = false;
      return;
    }
    if (decorated || !dialog.ownerDocument?.createElement || !dialog.append) return;
    const before = new Set(Array.from(dialog.children));
    decorateResonance(dialog, "cafe", true, french ? "fr" : "en");
    const style = dialog.ownerDocument.createElement("style");
    style.textContent = ".cafe-customer-changed{outline:2px solid #e8bf69}.cafe-customer>span{display:block}.cafe-customer>span+span{color:#ffe0a1;font-weight:bold}";
    dialog.append(style);
    decorationNodes = Array.from(dialog.children).filter(node => !before.has(node));
    decorated = true;
  }
  const available = () => {
    const current = context();
    return Boolean(current && !current.blocked && !current.state.cafePending &&
      !current.state.performancePending && cafeVenues(current.cell).length);
  };
  function resonanceActive() {
    const current = context();
    const state = current?.state;
    return Boolean(resonance() || state && resolveResonance("cafe", {
      journeyCard: state.journeyCard ?? null, birthCard: state.birthCard ?? null,
      dailyCard: state.dailyCard ?? null,
    }));
  }

  function localize() {
    document.querySelector("#open-cafe").disabled = !available();
    const current = context();
    start.disabled = Boolean(game) || !available();
    venueSelect.disabled = Boolean(game);
    orders.setAttribute("aria-label", t("cafeOrders"));
    const skill = current ? cafeDifficulty(current.state) : null;
    document.querySelector("#cafe-skill").textContent = skill ? t("cafeSkill", {
      ...skill, recipeMax: skill.recipeSize + 2,
      seconds: skill.patienceMs / 1000, bonus: Math.round((skill.multiplier - 1) * 100),
    }) : "";
    const active = Boolean(game && game.selected !== null);
    for (const id of [...CAFE.ingredients.map(i => `#cafe-${i}`), "#cafe-serve", "#cafe-clear"]) {
      document.querySelector(id).disabled = !active;
    }
    result.textContent = failure || (feedback ? t(feedback.cancelled ? "cafeCancelled" : "cafeReward", {
      ...feedback, money: (feedback.rewardCents / 100).toFixed(2),
    }) : "");
    if (!failure && feedback) result.textContent += ` ${t("minigameReputation", {
      amount: outcomeReputation(feedback.served, feedback.orders, false, feedback.cancelled),
    })}`;
    setFeedback(result, failure || feedback?.cancelled || feedback &&
      outcomeReputation(feedback.served, feedback.orders, false, feedback.cancelled) < 0 ? "failure"
      : feedback ? "success" : "");
    const resonant = Boolean(game?.resonance ?? resonanceActive());
    showVariantHelp(resonant);
    setResonanceDecoration(resonant);
  }

  function groupedItems(items) {
    return CAFE.ingredients.filter(item => items.includes(item)).map(item => {
      const count = items.filter(value => value === item).length;
      return { item, count, label: `${t(`cafeItem.${item}`)}${count > 1 ? ` x${count}` : ""}` };
    });
  }

  function clearTray() {
    document.querySelector("#cafe-tray").textContent = "";
    renderTray([]);
  }

  function renderTray(items) {
    for (const { item, slot, badge } of traySlots) {
      const count = items.filter(value => value === item).length;
      text(badge, String(count));
      slot.dataset.empty = String(count === 0);
    }
  }

  function render() {
    if (!game) return;
    const active = game.orders.filter(o => o.status === "waiting" && o.arrivesAt <= game.lastAt);
    for (let slot = 0; slot < 3; slot++) {
      const order = active[slot], button = customerButtons[slot];
      button.dataset.orderId = order ? String(order.id) : "";
      button.disabled = !order;
      button.className = `cafe-customer${order?.change ? " cafe-customer-changed" : ""}`;
      text(button.children[1], order?.change ? (french
        ? `Changement d'avis : ${order.change.kind === "add" ? "ajouter" : "retirer"} 1 ${t(`cafeItem.${order.change.item}`)}`
        : `Changed my mind: ${order.change.kind === "add" ? "add" : "remove"} 1 ${t(`cafeItem.${order.change.item}`)}`) : "");
      if (order) {
          const recipe = groupedItems(order.recipe).map(item => item.label).join(" + ");
          text(button.children[0], t("cafeOrder", { number: order.id + 1, recipe,
            seconds: Math.max(0, Math.ceil((order.deadline - game.lastAt) / 1000)) }));
      } else text(button.children[0], t("cafeWaiting"));
      button.setAttribute("aria-pressed", String(Boolean(order && order.id === game.selected)));
    }
    text(document.querySelector("#cafe-tray"), t("cafeTray", {
      items: groupedItems(game.tray).map(item => item.label).join(" + ") || t("cafeEmptyTray"),
    }));
    renderTray(game.tray);
    text(document.querySelector("#cafe-score"), t("cafeScore", {
      served: game.orders.filter(o => o.status === "served").length, total: game.orders.length,
      missed: game.orders.filter(o => o.status === "missed").length, mistakes: game.mistakes,
    }));
  }

  function finish(cancelled = false) {
    if (!game) return;
    audio?.stop();
    clearInterval(timer);
    timer = undefined;
    const served = game.orders.filter(o => o.status === "served").length, mistakes = game.mistakes;
    game = undefined;
    try {
      feedback = settle(served, mistakes, cancelled);
      if (!feedback) failure = t("cafeFailed");
    } catch (reason) {
      console.error("Unable to settle cafe shift:", reason);
      failure = t("cafeError", { error: reason.message });
    }
    orders.replaceChildren();
    clearTray();
    localize();
  }

  function input(kind, value) {
    if (!game) return;
    const previous = game;
    game = cafeInput(game, kind, value, performance.now());
    if (kind === "ingredient" && game.tray.length &&
        (game.selected !== previous.selected || game.tray.length > previous.tray.length)) void audio?.pickup(value);
    render();
    if (cafeFinished(game)) finish();
    localize();
  }

  function open() {
    if (document.querySelector("#earn-money-dialog")?.open) document.querySelector("#earn-money-dialog").close();
    if (!available() || document.querySelector("dialog[open]")) return;
    failure = "";
    feedback = null;
    const venues = cafeVenues(context().cell);
    venueSelect.replaceChildren();
    for (const venue of venues) {
      const option = document.createElement("option");
      option.value = venue.osmId;
      option.textContent = venue.name?.trim() || t(`cafeVenue.${venue.tags.amenity}`);
      venueSelect.append(option);
    }
    orders.replaceChildren();
    clearTray();
    document.querySelector("#cafe-score").textContent = "";
    dialog.showModal();
    localize();
  }

  start.addEventListener("click", () => {
    if (!available() || game) return;
    failure = "";
    feedback = null;
    try {
      const shift = begin(venueSelect.value);
      if (!shift) {
        failure = t("cafeFailed");
        localize();
        return;
      }
      const active = Boolean(shift.resonance);
      game = createCafeGame(shift, performance.now(), Math.random, { resonance: active });
      if (active) {
        showVariantHelp(true);
        setResonanceDecoration(true);
      }
      void audio?.start();
      orders.replaceChildren(...customerButtons);
      render();
      localize();
      document.querySelector("#cafe-coffee").focus();
      timer = setInterval(() => {
        const selected = game.selected;
        game = advanceCafe(game, performance.now());
        render();
        if (cafeFinished(game)) finish();
        else if (selected !== game.selected) localize();
      }, 200);
    } catch (reason) {
      console.error("Unable to start cafe shift:", reason);
      if (game || context()?.state.cafePending) {
        if (!game) game = { orders: [], mistakes: 0 };
        finish(true);
      }
      failure = t("cafeError", { error: reason.message });
      localize();
    }
  });
  for (const ingredient of CAFE.ingredients) {
    document.querySelector(`#cafe-${ingredient}`).addEventListener("click", () => input("ingredient", ingredient));
  }
  document.querySelector("#cafe-serve").addEventListener("click", () => input("serve"));
  document.querySelector("#cafe-clear").addEventListener("click", () => input("clear"));
  document.querySelector("#open-cafe").addEventListener("click", open);
  dialog.addEventListener("cancel", () => finish(true));
  dialog.addEventListener("close", () => finish(true));
  document.addEventListener("visibilitychange", () => { if (document.hidden) finish(true); });
  return { localize, open, reset() { finish(true); dialog.close(); feedback = null; failure = ""; } };
}
