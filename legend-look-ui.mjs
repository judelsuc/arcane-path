import { createTownLegendsClient } from "./town-legends.mjs";

const COPY = {
  en: {
    title: "Traces of an old story", loading: "Looking around…",
    error: "Legend search failed:", retry: "Retry Look", inspect: "Inspect the passage",
    travel: "This could be the passage they spoke of. Come closer to inspect it.",
    found: "Entrance discovered.",
    open: "Open the adventure entrance",
    enter: "Enter the adventure",
    explore: "Explore",
    nothing: "You find nothing unusual here.",
  },
  fr: {
    title: "Traces d'une ancienne histoire", loading: "Observation des alentours…",
    error: "Échec de recherche de légende :", retry: "Réessayer Regarder", inspect: "Inspecter le passage",
    travel: "Ce pourrait être le passage dont on vous a parlé. Approchez pour l'inspecter.",
    found: "Entrée découverte.",
    open: "Ouvrir l'entrée de l'aventure",
    enter: "Entrer dans l'aventure",
    explore: "Explorer",
    nothing: "Vous ne trouvez rien d'inhabituel ici.",
  },
};

export function setupLegendLook({ context, host, action, status, client = createTownLegendsClient(), onEntry, onObservation, openEntrance } = {}) {
  const doc = host.ownerDocument;
  let controller, key, target, observations = [], error = "", loading = false;
  const identity = state => state?.serverJourney?.id && state.journalAccess
    ? `${state.serverJourney.id}:${state.journalAccess}` : null;
  // Exploring is a permanent map action beside the others: it inspects a
  // matching passage, enters a discovered one, and otherwise simply reports
  // that nothing unusual is here.
  function actionTarget() {
    const captured = context(), state = captured?.state;
    const here = state && target && state.col === target.col && state.row === target.row;
    return { captured, observation: here ? observations.find(item => item.matches) : null };
  }
  function clearFeedback() {
    if (!status) return;
    status.hidden = true;
    status.textContent = "";
  }
  function renderAction() {
    if (!action) return;
    const language = doc.documentElement.lang === "en" ? "en" : "fr", c = COPY[language];
    const { captured, observation } = actionTarget();
    action.hidden = false;
    action.textContent = observation?.found ? c.enter : observation ? c.inspect : c.explore;
    action.disabled = loading || !captured?.state || !!captured.blocked;
  }
  action?.addEventListener("click", () => {
    const language = doc.documentElement.lang === "en" ? "en" : "fr", c = COPY[language];
    const { captured, observation } = actionTarget();
    if (loading || !captured?.state || captured.blocked) return;
    clearFeedback();
    if (!observation) {
      if (status) {
        status.textContent = c.nothing;
        status.hidden = false;
      }
      return;
    }
    if (observation.found) openEntrance?.();
    else void inspect(observation);
  });
  function node(tag, value) {
    const result = doc.createElement(tag);
    result.textContent = value;
    host.append(result);
    return result;
  }
  function button(label, callback, disabled = false) {
    const result = node("button", label);
    result.type = "button";
    result.disabled = disabled;
    result.addEventListener("click", callback);
  }
  function render() {
    const language = doc.documentElement.lang === "en" ? "en" : "fr", c = COPY[language];
    renderAction();
    host.replaceChildren();
    // Most looked-at cells carry no legend detail: opening the panel while the
    // answer is pending made it flash and vanish, so it only opens with content.
    host.hidden = !error && !observations.length;
    if (host.hidden) return;
    node("h3", c.title);
    if (loading) node("p", c.loading).setAttribute("role", "status");
    if (error) {
      node("p", `${c.error} ${error}`).setAttribute("role", "alert");
      button(c.retry, () => { void request(); }, loading);
    }
    for (const observation of observations) {
      node("h4", observation.town);
      node("p", observation.description[language]);
      if (!observation.matches) continue;
      const captured = context(), state = captured?.state;
      const here = state?.col === target.col && state?.row === target.row;
      if (observation.found) {
        node("p", here ? c.found : c.travel).setAttribute("role", "status");
        // Entering is the map's Explore action (also in the cell menu) and the quest journal, not this panel.
      }
      else if (!here) node("p", c.travel);
      else button(c.inspect, () => { void inspect(observation); }, loading || !!captured?.blocked);
    }
  }
  async function request(inspecting) {
    const captured = context(), owner = identity(captured?.state);
    if (!owner || !target || captured.blocked) return;
    controller?.abort();
    const current = new AbortController(), requestedKey = key;
    controller = current;
    loading = true;
    error = "";
    render();
    try {
      const result = inspecting
        ? await client.inspect(captured.state, inspecting.townId, current.signal)
        : await client.look(captured.state, target, current.signal);
      const state = context()?.state;
      if (current.signal.aborted || key !== requestedKey || identity(state) !== owner ||
          state.col !== captured.state.col || state.row !== captured.state.row) return;
      if (inspecting) {
        if (result.entry.townId !== inspecting.townId || result.entry.exploration?.status !== "found") {
          throw new Error("Invalid inspected entrance response.");
        }
        onEntry?.(result.entry);
        observations = observations.map(item => item.townId === inspecting.townId ? { ...item, found: true } : item);
      } else {
        observations = result.observations;
        for (const observation of observations) {
          if (observation.entry) onEntry?.(observation.entry);
          if (!observation.contextual) onObservation?.(observation);
        }
      }
    } catch (reason) {
      if (current.signal.aborted) return;
      console.error("Legend Look unavailable:", reason);
      error = reason.message;
    } finally {
      if (!current.signal.aborted) { loading = false; render(); }
    }
  }
  async function inspect(observation) {
    const state = context()?.state;
    if (!target || state?.col !== target.col || state?.row !== target.row) return;
    await request(observation);
  }
  return {
    update(position, refresh = false) {
      const captured = context(), owner = identity(captured?.state);
      const next = owner && position ? `${owner}:${captured.state.col},${captured.state.row}:${position.col},${position.row}` : null;
      if (next !== key || refresh) {
        controller?.abort();
        controller = undefined;
        key = next;
        target = position;
        observations = [];
        error = "";
        loading = false;
        clearFeedback();
        if (next && !captured.blocked) void request();
      } else if (next && !captured.blocked && !loading && !error && !observations.length && controller === undefined) {
        void request();
      }
      render();
    },
    reset() {
      controller?.abort();
      controller = undefined;
      key = target = null;
      observations = [];
      loading = false;
      error = "";
      clearFeedback();
      render();
    },
  };
}
