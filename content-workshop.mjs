export function attemptStatus(attempt) {
  if (attempt.status === "pending") return "Pending or interrupted: outcome unknown. No automatic retry / En attente ou interrompu, sans relance.";
  if (attempt.status === "failed") return attempt.error;
  return attempt.acceptedAt ? "Accepted locally / Relu et enregistré localement" : "Draft: factual review required / Brouillon à vérifier";
}

export function tokenSummary(result) {
  if (!result?.usage) return "Token usage unavailable / Consommation de jetons indisponible";
  return `${result.usage.prompt_tokens} input + ${result.usage.completion_tokens} output = ${result.usage.total_tokens} tokens`;
}

export function setupWorkshop(doc = document, fetcher = fetch) {
  const select = doc.querySelector("#brief");
  const generate = doc.querySelector("#generate");
  const refresh = doc.querySelector("#refresh");
  const error = doc.querySelector("#error");
  let snapshot = null, busy = false;
  function node(tag, text, parent) {
    const element = doc.createElement(tag);
    if (text !== undefined) element.textContent = text;
    parent.append(element);
    return element;
  }
  function showError(message) {
    error.textContent = message;
    error.hidden = !message;
  }
  function controls() {
    generate.disabled = busy || !snapshot?.liveEnabled || snapshot.remaining <= 0;
    refresh.disabled = busy;
    select.disabled = busy;
  }
  function facts() {
    const host = doc.querySelector("#facts");
    host.replaceChildren();
    const brief = snapshot?.briefs.find(value => value.id === select.value);
    if (!brief) return;
    node("p", brief.facts.en, host).lang = "en";
    node("p", brief.facts.fr, host).lang = "fr";
    node("p", brief.constraints, host);
  }
  async function request(path, body) {
    const response = await fetcher(path, body ? {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Workshop-Token": snapshot.csrf },
      body: JSON.stringify(body),
    } : { cache: "no-store" });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? `Workshop HTTP ${response.status}`);
    return value;
  }
  async function load() {
    snapshot = await request("/api/workshop");
    const previous = select.value;
    select.replaceChildren();
    for (const brief of snapshot.briefs) {
      const option = node("option", brief.title, select);
      option.value = brief.id;
    }
    if (snapshot.briefs.some(brief => brief.id === previous)) select.value = previous;
    doc.querySelector("#status").textContent = `${snapshot.liveEnabled
      ? `LIVE / EN DIRECT · ${snapshot.model}` : "Live generation DISABLED / Génération en direct DÉSACTIVÉE"
    } · ${snapshot.used}/${snapshot.limit} attempts used / essais utilisés · ${snapshot.remaining} remaining / restants`;
    facts();
    const host = doc.querySelector("#attempts");
    host.replaceChildren();
    for (const attempt of snapshot.attempts) {
      const article = node("article", undefined, host);
      node("h3", attempt.brief.title, article);
      node("p", attemptStatus(attempt), article);
      node("p", `${attempt.createdAt} · ${attempt.model} · prompt v${attempt.promptVersion}`, article).className = "metadata";
      if (!attempt.result) continue;
      node("p", tokenSummary(attempt.result), article).className = "metadata";
      if (attempt.result.responseModel) {
        node("p", `Provider model / Modèle retourné : ${attempt.result.responseModel}`, article).className = "metadata";
      }
      const locales = node("div", undefined, article);
      locales.className = "locales";
      for (const language of ["en", "fr"]) {
        const column = node("div", undefined, locales);
        column.lang = language;
        node("h4", language === "en" ? "English" : "Français", column);
        node("h5", language === "en" ? "Permitted facts" : "Faits autorisés", column);
        node("p", attempt.brief.facts[language], column);
        node("h5", language === "en" ? "Rumour" : "Rumeur", column);
        node("p", attempt.result.drafts[language].rumour, column);
        node("h5", language === "en" ? "Riddle" : "Énigme", column);
        node("p", attempt.result.drafts[language].riddle, column);
      }
      if (attempt.acceptedAt) continue;
      const label = node("label", undefined, article);
      const check = node("input", undefined, label);
      check.type = "checkbox";
      label.append(doc.createTextNode("I reviewed both languages: no invented facts, extra precision or unlocked guidance. / J'ai vérifié les deux langues et les limites d'information."));
      const accept = node("button", "Accept locally / Enregistrer après relecture", article);
      accept.type = "button";
      accept.disabled = true;
      check.addEventListener("change", () => { accept.disabled = !check.checked || busy; });
      accept.addEventListener("click", () => operate(async () => {
        await request("/api/accept", { id: attempt.id, reviewed: check.checked });
      }));
    }
    controls();
  }
  async function operate(action) {
    if (busy) return;
    busy = true;
    controls();
    for (const button of doc.querySelectorAll("#attempts button")) button.disabled = true;
    showError("");
    try {
      await action();
    } catch (failure) {
      showError(failure.message);
    } finally {
      try { await load(); }
      catch (failure) {
        snapshot = null;
        showError(`${error.textContent ? error.textContent + " · " : ""}${failure.message}`);
      }
      busy = false;
      controls();
    }
  }
  select.addEventListener("change", facts);
  generate.addEventListener("click", () => operate(async () => {
    await request("/api/generate", { id: crypto.randomUUID(), briefId: select.value });
  }));
  refresh.addEventListener("click", () => operate(async () => {}));
  return operate(async () => {});
}

if (typeof document !== "undefined") void setupWorkshop();
