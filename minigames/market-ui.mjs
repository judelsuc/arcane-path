import { createGame, difficulty, input, advance, result } from "./market.mjs";
import { marketArt, moneyArt } from "./market-art.mjs";
import { resolveResonance, decorateResonance } from "../arcane-resonance.mjs";

const TEXT = {
  fr: {
    title: "Étal du marché — exercice fictif", start: "Commencer", cancel: "Annuler",
    instructions: "Préparez chaque panier avec les quantités demandées (0 pour les autres produits), puis rendez la monnaie en euros (par exemple 5,05). Entrée valide le formulaire ; Tab parcourt les champs et boutons. Trois erreurs ou le temps écoulé terminent l’exercice. Annuler, quitter ou masquer cet onglet annule tout gain. Aucun achat ni paiement réel.",
    potential: "Potentiel de récompense (intégration future)", level: "Niveau", order: "Commande",
    basket: "Liste à préparer", stock: "Quantités du panier", check: "Vérifier le panier",
    total: "Total fictif", tender: "Somme fictive reçue", change: "Monnaie à rendre (€)",
    clear: "Effacer la monnaie", submit: "Rendre la monnaie", score: "Score", mistakes: "Erreurs",
    seconds: "Secondes restantes", completed: "Service terminé !", failed: "Exercice terminé sans réussite.",
    cancelled: "Exercice annulé — aucun gain.", coin: "Ajouter", unit: "l’unité",
    apple: "Pomme", bread: "Pain", carrot: "Carotte", cheese: "Fromage",
    egg: "Œuf", honey: "Miel", pear: "Poire", tomato: "Tomate",
    "wrong-basket": "Panier incorrect : vérifiez aussi les produits non demandés.",
    "wrong-change": "Monnaie incorrecte : soustrayez le total de la somme reçue.",
    "invalid-action": "Valeur invalide : utilisez des entiers dans les limites indiquées.",
    "invalid-time": "Horloge invalide.", timeout: "Temps écoulé.",
    drawer: "Fond de caisse", remaining: "disponibles", selected: "choisis", remove: "Retirer",
    ask: "Demander l’appoint", extra: "Appoint demandé (€)", selectedTotal: "Monnaie préparée",
    "customer-refused": "Le client n’a pas les pièces nécessaires et refuse cet appoint.",
    "customer-agreed": "Le client accepte : l’appoint rejoint la caisse. Recalculez la monnaie.",
    "insufficient-cash": "La caisse ne peut pas composer ce montant. Choisissez d’autres pièces ou demandez un appoint.",
    "empty-denomination": "Il ne reste plus de cette pièce ou de ce billet.",
    invalidMoney: "Montant invalide : utilisez des euros avec au plus deux décimales (exemple : 5,05).",
  },
  en: {
    title: "Market stall — fictional exercise", start: "Start", cancel: "Cancel",
    instructions: "Pack each basket with the requested quantities (0 for other products), then give change in euros (for example 5.05). Enter submits the form; Tab visits fields and buttons. Three mistakes or the time limit end the exercise. Cancelling, leaving, or hiding this tab forfeits all earnings. No real purchases or payments.",
    potential: "Potential reward (future integration)", level: "Level", order: "Order",
    basket: "Shopping list", stock: "Basket quantities", check: "Check basket",
    total: "Fictional total", tender: "Fictional cash received", change: "Change to return (€)",
    clear: "Clear change", submit: "Give change", score: "Score", mistakes: "Mistakes",
    seconds: "Seconds remaining", completed: "Service completed!", failed: "Exercise ended unsuccessfully.",
    cancelled: "Exercise cancelled — no earnings.", coin: "Add", unit: "each",
    apple: "Apple", bread: "Bread", carrot: "Carrot", cheese: "Cheese",
    egg: "Egg", honey: "Honey", pear: "Pear", tomato: "Tomato",
    "wrong-basket": "Incorrect basket: also check products not requested.",
    "wrong-change": "Incorrect change: subtract the total from the cash received.",
    "invalid-action": "Invalid value: use whole numbers within the displayed limits.",
    "invalid-time": "Invalid clock.", timeout: "Time is up.",
    drawer: "Cash drawer", remaining: "available", selected: "selected", remove: "Remove",
    ask: "Ask for extra coins", extra: "Extra amount requested (€)", selectedTotal: "Prepared change",
    "customer-refused": "The customer does not have the required coins and declines.",
    "customer-agreed": "The customer agrees: extra coins added to the drawer. Recalculate the change.",
    "insufficient-cash": "The drawer cannot make that amount. Choose different coins or ask for extra coins.",
    "empty-denomination": "None of that coin or note remains in the drawer.",
    invalidMoney: "Invalid amount: use euros with at most two decimal places (for example 5.05).",
  },
};

export function mount(container, { level = 0, language = "fr", onFinish, audio, journey = false, ...cards } = {}) {
  if (!container?.ownerDocument || typeof container.append !== "function") throw new TypeError("Expected a DOM container.");
  if (onFinish !== undefined && typeof onFinish !== "function") throw new TypeError("Invalid onFinish.");
  const doc = container.ownerDocument;
  const view = doc.defaultView ?? globalThis;
  const baseText = TEXT[language === "en" ? "en" : "fr"];
  const t = journey ? (language === "en" ? {
    ...baseText,
    title: "Market stall",
    instructions: "Pack each order with the requested quantities, then give the correct change in euros. Enter submits the form; Tab visits fields and buttons. Three mistakes or the time limit end the shift. Cancelling or leaving ends the shift without a score. Products and transactions are simulated; no real purchases or payments occur.",
    potential: "Journey reward depends on your score",
    total: "Order total", tender: "Cash received",
  } : {
    ...baseText,
    title: "Étal du marché",
    instructions: "Préparez chaque commande avec les quantités demandées, puis rendez la monnaie correcte en euros. Entrée valide le formulaire ; Tab parcourt les champs et boutons. Trois erreurs ou le temps écoulé terminent le service. Annuler ou quitter termine le service sans score. Les produits et transactions sont simulés ; aucun achat ni paiement réel n’a lieu.",
    potential: "La récompense du voyage dépend de votre score",
    total: "Total de la commande", tender: "Somme reçue",
  }) : baseText;
  const rules = difficulty(level);
  const resonance = resolveResonance("market", cards);
  let game = null;
  let timer = null;
  let finished = false;
  let destroyed = false;
  let phaseKey = "";
  let packed = null;
  let scaleReadout = null;
  let scaleBeam = null;
  let basketTotal = null;
  let drawerSummary = null;
  let tenderSummary = null;
  let tenderArt = null;
  let selectedSummary = null;
  let cashControls = [];
  const now = () => Math.floor(view.performance?.now() ?? Date.now());
  const root = doc.createElement("section");
  root.lang = language === "en" ? "en" : "fr";
  root.setAttribute("aria-label", t.title);
  const el = (tag, text, parent = root) => {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    parent.append(node);
    return node;
  };
  const button = (text, parent, handler, type = "button") => {
    const node = el("button", text, parent);
    node.type = type;
    if (handler) node.addEventListener("click", handler);
    return node;
  };
  const moneyFormat = new Intl.NumberFormat(language === "en" ? "en-GB" : "fr-FR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false,
  });
  const money = cents => `${moneyFormat.format(cents / 100)} €`;
  const parseChange = value => {
    const match = /^(\d{1,4})(?:[,.](\d{1,2}))?$/.exec(value.trim());
    if (!match) return NaN;
    const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
    return cents <= 100000 ? cents : NaN;
  };
  el("h2", t.title);
  el("p", t.instructions).className = "game-help-text";
  el("p", language === "en"
    ? "The finite drawer lasts for the whole shift. Payments replenish it; selected change is reserved until you serve. Coin buttons let you choose and remove individual coins or notes. Entering an amount composes it automatically from available cash. Ask for a specific extra amount up to €5 to simplify change: the customer has a limited purse and may refuse. Extra money increases both cash received and change owed, never your earnings. Clear restores all reserved cash. Refusals and unavailable coins do not count as mistakes; wrong submitted change does."
    : "Le fond de caisse limité dure tout le service. Les paiements le remplissent ; la monnaie choisie est réservée jusqu’au service. Choisissez et retirez les pièces ou billets avec les boutons. Saisir un montant le compose automatiquement avec la caisse disponible. Demandez un appoint précis jusqu’à 5 € pour faciliter la monnaie : le client a une bourse limitée et peut refuser. L’appoint augmente la somme reçue et la monnaie due, jamais vos gains. Effacer libère les pièces réservées. Les refus et pièces indisponibles ne comptent pas comme erreurs, contrairement à une monnaie incorrecte validée.").className = "game-help-text";
  if (resonance) el("p", language === "en"
    ? "Justice: weigh one customer's produce using standard weights. Add or remove weights until the scale balances, then pack the other products and return change normally. Resonance increases successful gains by 10%, once even if both cards match."
    : "Justice : pesez un produit du premier client avec les poids étalons. Ajoutez ou retirez des poids pour équilibrer la balance, puis préparez les autres produits et rendez la monnaie. La résonance augmente les gains réussis de 10 %, une seule fois même si les deux cartes concordent.").className = "game-help-text";
  el("p", `${t.level} ${rules.level} · ${t.potential} ×${rules.rewardMultiplier}`).className = "game-help-text";
  const status = el("p", "");
  status.setAttribute("role", "status");
  const error = el("p", "");
  error.setAttribute("role", "alert");
  const customerReply = el("p", "");
  customerReply.setAttribute("role", "status");
  const clock = el("p", "");
  clock.setAttribute("role", "timer");
  const panel = el("div");
  const start = button(t.start, root, () => {
    if (game || finished || destroyed) return;
    if (doc.hidden) return cancel();
    game = createGame({ level: rules.level, resonance, now: now() });
    void audio?.unlock();
    start.disabled = true;
    timer = view.setInterval(() => {
      game = advance(game, now());
      render();
    }, 250);
    render();
  });
  const cancelButton = button(t.cancel, root, () => cancel());
  const cleanup = () => {
    if (timer !== null) view.clearInterval(timer);
    timer = null;
    audio?.stop();
    doc.removeEventListener("visibilitychange", visibility);
    view.removeEventListener("pagehide", cancel);
    root.removeEventListener("keydown", keydown);
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    cleanup();
    start.disabled = true;
    cancelButton.disabled = true;
    if (game.status !== "cancelled") void audio?.play(game.status === "completed" ? "complete" : "failed");
    onFinish?.(result(game));
  };
  const act = action => {
    if (finished || destroyed) return;
    if (doc.hidden) return cancel();
    const before = game;
    game = input(game, action, now());
    render();
    if (!finished) {
      if (game.error) void audio?.play("mistake");
      else if (action.type === "quantity" && (before.basket[action.item] ?? 0) !== action.quantity) void audio?.play("pick");
      else if (action.type === "weight") void audio?.play("pick");
      else if (action.type === "coin") void audio?.play("coin");
      else if (game.score > before.score) void audio?.play(before.phase === "basket" ? "basket" : "serve");
    }
  };
  function cancel() {
    if (finished || destroyed) return;
    game ??= createGame({ level: rules.level, resonance, now: now() });
    game = input(game, { type: "cancel" }, now());
    render();
  }
  const visibility = () => { if (doc.hidden) cancel(); };
  const keydown = event => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };
  function render() {
    status.textContent = `${t.score}: ${game.score}/${game.maxScore} · ${t.mistakes}: ${game.mistakes}/${rules.maxMistakes}`;
    error.textContent = game.error ? t[game.error] : "";
    customerReply.textContent = game.notice ? t[game.notice] : "";
    clock.textContent = `${t.seconds}: ${Math.max(0, Math.ceil((game.deadline - game.updatedAt) / 1000))}`;
    updateScale();
    updateCash();
    if (packed && game.phase === "basket") {
      packed.replaceChildren();
      for (const product of game.products) {
        const quantity = game.basket[product.id] ?? 0;
        if (!quantity) continue;
        const item = el("span", undefined, packed);
        item.append(marketArt(doc, product.id));
        el("span", `${quantity} × ${t[product.id]}`, item);
      }
    }
    if (game.status !== "playing") {
      panel.replaceChildren();
      packed = null;
      scaleReadout = null;
      scaleBeam = null;
      basketTotal = null;
      el("p", t[game.status], panel);
      finish();
      return;
    }
    // Do not rebuild fields on clock ticks or edits: preserve focus and typed input.
    const key = `${game.orderIndex}:${game.phase}`;
    if (key === phaseKey) return;
    phaseKey = key;
    panel.replaceChildren();
    packed = null;
    scaleReadout = null;
    scaleBeam = null;
    basketTotal = null;
    drawerSummary = null;
    tenderSummary = null;
    tenderArt = null;
    selectedSummary = null;
    cashControls = [];
    const order = game.orders[game.orderIndex];
    const weighed = order.lines.find(line => line.grams !== undefined);
    el("h3", `${t.order} ${game.orderIndex + 1}/${rules.orders} — ${t.basket}`, panel);
    drawerSummary = el("p", "", panel);
    drawerSummary.className = "market-drawer-summary";
    drawerSummary.setAttribute("role", "status");
    const list = el("ul", undefined, panel);
    list.className = "market-shopping-list";
    for (const line of order.lines) {
      const item = el("li", undefined, list);
      item.append(marketArt(doc, line.id));
      el("span", line.grams !== undefined
        ? `${line.grams} g ${t[line.id]} — ${money(line.centsPerKg)}/kg`
        : `${line.quantity} × ${t[line.id]} — ${money(line.cents)} ${t.unit}`, item);
    }
    const form = el("form", undefined, panel);
    if (game.phase === "basket") {
      const preview = el("div", undefined, form);
      preview.className = "market-packed-basket";
      preview.append(marketArt(doc, "basket"));
      packed = el("div", undefined, preview);
      packed.setAttribute("aria-label", t.stock);
      if (weighed) {
        const scale = el("div", undefined, form);
        scale.className = "market-scale";
        scale.setAttribute("aria-label", language === "en" ? "Justice's scales" : "Balance de Justice");
        const svgNode = (tag, attributes, parent) => {
          const node = doc.createElementNS("http://www.w3.org/2000/svg", tag);
          for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
          parent.append(node);
          return node;
        };
        const svg = svgNode("svg", { viewBox: "0 0 300 130", "aria-hidden": "true" }, scale);
        svgNode("path", { d: "M150 24V116M108 119H192", stroke: "#d2b36e", "stroke-width": "8" }, svg);
        scaleBeam = svgNode("g", {}, svg);
        svgNode("path", { d: "M45 44H255M45 44L20 91H70ZM255 44L230 91H280Z", fill: "#6d9d87", stroke: "#e1c477", "stroke-width": "4" }, scaleBeam);
        scaleReadout = el("p", "", scale);
        scaleReadout.setAttribute("role", "status");
        for (const grams of game.weights) {
          for (const sign of [1, -1]) {
            const control = button(`${sign > 0 ? "+" : "−"} ${grams} g`, scale, () => {
              if (phaseKey !== key) return;
              act({ type: "weight", grams: sign * grams });
            });
            control.dataset.grams = String(sign * grams);
          }
        }
      }
      basketTotal = el("p", "", form);
      el("p", t.stock, form);
      const crates = el("div", undefined, form);
      crates.className = "market-crates";
      const fields = game.products.filter(product => product.id !== weighed?.id).map(product => {
        const label = el("label", undefined, crates);
        label.append(marketArt(doc, product.id));
        el("span", `${t[product.id]} · ${money(product.cents)} ${t.unit}`, label);
        const field = el("input", undefined, label);
        field.setAttribute("aria-label", `${t[product.id]} (0–${rules.maxQuantity})`);
        field.type = "number";
        field.min = "0";
        field.max = String(rules.maxQuantity);
        field.step = "1";
        field.required = true;
        field.value = "0";
        field.name = product.id;
        field.addEventListener("input", () => {
          if (phaseKey !== key) return;
          const quantity = field.value.trim() === "" ? NaN : Number(field.value);
          act({ type: "quantity", item: product.id, quantity });
        });
        return { product, field };
      });
      button(t.check, form, null, "submit");
      form.addEventListener("submit", event => {
        event.preventDefault();
        if (finished || destroyed || phaseKey !== key) return;
        for (const { product, field } of fields) {
          const quantity = field.value.trim() === "" ? NaN : Number(field.value);
          if (!Number.isInteger(quantity) || quantity < 0 || quantity > rules.maxQuantity) {
            error.textContent = t["invalid-action"];
            void audio?.play("mistake");
            field.focus();
            return;
          }
          act({ type: "quantity", item: product.id, quantity });
          if (finished) return;
        }
        act({ type: "submit" });
      });
      updateScale();
      updateCash();
      fields[0].field.focus();
    } else {
      tenderSummary = el("p", "", form);
      const tender = el("div", undefined, form);
      tender.className = "market-tender";
      tenderArt = el("span", "", tender);
      const request = el("div", undefined, form);
      request.className = "market-extra";
      const requestLabel = el("label", `${t.extra} (0–5) `, request);
      const extraField = el("input", undefined, requestLabel);
      extraField.type = "text";
      extraField.inputMode = "decimal";
      extraField.name = "extra";
      extraField.value = moneyFormat.format(0);
      extraField.setAttribute("aria-label", t.extra);
      for (const step of [-5, 5]) {
        button(`${step < 0 ? "−" : "+"} ${money(5)}`, request, () => {
          if (finished || destroyed || phaseKey !== key) return;
          const cents = parseChange(extraField.value);
          if (!Number.isSafeInteger(cents) || cents > 500) {
            error.textContent = t.invalidMoney;
            void audio?.play("mistake");
            return;
          }
          extraField.value = moneyFormat.format(Math.max(0, Math.min(500, cents + step)) / 100);
        });
      }
      const askExtra = () => {
        if (finished || destroyed || phaseKey !== key) return;
        const cents = parseChange(extraField.value);
        if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 500) {
          error.textContent = t.invalidMoney;
          void audio?.play("mistake");
          return;
        }
        act({ type: "ask-extra", cents });
        if (game.notice === "customer-agreed") void audio?.play("coin");
      };
      button(t.ask, request, askExtra);
      extraField.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        askExtra();
      });
      const label = el("label", `${t.change} (0–1000) `, form);
      const field = el("input", undefined, label);
      field.type = "text";
      field.inputMode = "decimal";
      field.setAttribute("aria-label", t.change);
      field.required = true;
      field.value = moneyFormat.format(0);
      field.name = "change";
      const syncTypedChange = () => {
        const cents = parseChange(field.value);
        if (!Number.isSafeInteger(cents)) {
          error.textContent = t.invalidMoney;
          void audio?.play("mistake");
          return false;
        }
        if (cents !== game.changeCents || game.error) act({ type: "change", cents });
        return !game.error && !finished;
      };
      selectedSummary = el("p", "", form);
      selectedSummary.setAttribute("role", "status");
      const till = el("div", undefined, form);
      till.className = "market-till";
      for (const cents of game.denominations) {
        const slot = el("div", undefined, till);
        slot.className = "market-cash-slot";
        const coin = button(undefined, slot, () => {
        if (finished || destroyed || phaseKey !== key) return;
        if (!syncTypedChange()) return;
        act({ type: "coin", cents });
        field.value = moneyFormat.format(game.changeCents / 100);
        });
        coin.setAttribute("aria-label", `${t.coin} ${money(cents)}`);
        coin.append(moneyArt(doc, cents));
        el("span", money(cents), coin);
        const count = el("span", "", slot);
        const remove = button(`${t.remove} ${money(cents)}`, slot, () => {
          if (finished || destroyed || phaseKey !== key) return;
          if (!syncTypedChange()) return;
          act({ type: "remove-coin", cents });
          field.value = moneyFormat.format(game.changeCents / 100);
        });
        cashControls.push({ cents, coin, count, remove });
      }
      button(t.clear, form, () => {
        if (finished || destroyed || phaseKey !== key) return;
        act({ type: "clear-change" });
        field.value = moneyFormat.format(0);
      });
      button(t.submit, form, null, "submit");
      form.addEventListener("submit", event => {
        event.preventDefault();
        if (finished || destroyed || phaseKey !== key) return;
        if (syncTypedChange()) act({ type: "submit" });
      });
      updateCash();
      field.focus();
    }
    function updateCash() {
      if (!game || game.status !== "playing") return;
      const total = game.denominations.reduce((sum, cents) => sum + cents * (game.drawer[cents] ?? 0), 0);
      if (drawerSummary) drawerSummary.textContent = `${t.drawer}: ${money(total)} · ${game.denominations
        .filter(cents => game.drawer[cents] > 0)
        .map(cents => `${money(cents)} × ${game.drawer[cents]}`).join(" · ")}`;
      if (game.phase !== "change") return;
      const order = game.orders[game.orderIndex];
      if (tenderSummary) tenderSummary.textContent = `${t.total}: ${money(order.totalCents)} · ${t.tender}: ${money(order.tenderCents + game.extraCents)}`;
      if (tenderArt) {
        tenderArt.replaceChildren();
        for (const cents of game.denominations) {
          const paid = (order.payment[cents] ?? 0) + (order.purse[cents] ?? 0) - (game.customerPurse[cents] ?? 0);
          for (let count = 0; count < paid; count++) tenderArt.append(moneyArt(doc, cents));
        }
        el("span", money(order.tenderCents + game.extraCents), tenderArt);
      }
      if (selectedSummary) selectedSummary.textContent = `${t.selectedTotal}: ${money(game.changeCents)}`;
      for (const { cents, coin, count, remove } of cashControls) {
        const selected = game.selectedCash[cents] ?? 0;
        const available = (game.drawer[cents] ?? 0) - selected;
        coin.disabled = available === 0;
        remove.disabled = selected === 0;
        count.textContent = `${available} ${t.remaining} · ${selected} ${t.selected}`;
        coin.setAttribute("aria-label", `${t.coin} ${money(cents)}`);
      }
    }
  }
  function updateScale() {
    if (!game || game.phase !== "basket" || game.status !== "playing") return;
    const order = game.orders[game.orderIndex];
    const weighed = order.lines.find(line => line.grams !== undefined);
    if (scaleReadout && weighed) {
      const balanced = game.weightGrams === weighed.grams;
      scaleReadout.textContent = `${t[weighed.id]}: ${game.weightGrams} / ${weighed.grams} g · ${
        language === "en" ? (balanced ? "Balanced" : "Not balanced") : (balanced ? "Équilibrée" : "Non équilibrée")}`;
      scaleBeam.setAttribute("transform", `rotate(${Math.sign(game.weightGrams - weighed.grams) * 10} 150 44)`);
    }
    if (basketTotal) {
      const cents = game.products.reduce((sum, product) => sum + (product.id === weighed?.id
        ? weighed.centsPerKg * game.weightGrams / 1000 : product.cents * (game.basket[product.id] ?? 0)), 0);
      basketTotal.textContent = `${t.total}: ${money(cents)}`;
    }
  }
  doc.addEventListener("visibilitychange", visibility);
  view.addEventListener("pagehide", cancel);
  root.addEventListener("keydown", keydown);
  container.append(root);
  decorateResonance(root, "market", resonance, language);
  if (doc.hidden) cancel();
  return {
    destroy() {
      if (destroyed) return;
      try { cancel(); } finally {
        destroyed = true;
        cleanup();
        root.remove();
      }
    },
  };
}
