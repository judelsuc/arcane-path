export function setupTrailArrival(t, { context, openTrail }) {
  const dialog = document.querySelector("#trail-arrival-dialog");
  let seen = new Set(), pending = [], showing, queued = false;

  function localize() {
    if (!dialog.open || !showing) return;
    document.querySelector("#trail-arrival-title").textContent = t("trailArrivalTitle");
    document.querySelector("#trail-arrival-text").textContent = t("trailArrivalText", showing);
    document.querySelector("#trail-arrival-investigate").textContent = t("trailArrivalInvestigate");
    document.querySelector("#trail-arrival-continue").textContent = t("trailArrivalContinue");
  }
  function update() {
    const current = context();
    if (current?.state.trail && !current.state.ended) {
      const { trail } = current.state;
      for (const arrival of trail.arrivals ?? []) {
        if (seen.has(arrival.stage)) continue;
        seen.add(arrival.stage);
        pending.push({ place: trail.stages[arrival.stage].name, parent: trail.parentName,
          page: arrival.stage + 1, total: trail.stages.length });
      }
    }
    localize();
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const current = context();
      if (!current || current.busy || current.state.ended || !pending.length ||
          document.querySelector("dialog[open]")) return;
      showing = pending.shift();
      dialog.showModal();
      localize();
      document.querySelector("#trail-arrival-investigate").focus();
    });
  }
  document.querySelector("#trail-arrival-investigate").addEventListener("click", () => {
    dialog.close();
    openTrail();
  });
  document.querySelector("#trail-arrival-continue").addEventListener("click", () => {
    dialog.close();
    document.querySelector("#ascii-map").focus({ preventScroll: true });
  });
  new MutationObserver(update).observe(document.body, {
    subtree: true, attributes: true, attributeFilter: ["open"],
  });
  return { update, reset(state) {
    seen = new Set((state?.trail?.arrivals ?? []).map(arrival => arrival.stage));
    pending = [];
    showing = undefined;
    dialog.close();
  } };
}
