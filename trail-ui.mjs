import { trailTarget, atTrailTarget } from "./trail.mjs";

export function setupTrail(t, { context, interview }) {
  const dialog = document.querySelector("#trail-dialog");
  const action = document.querySelector("#trail-interview");

  function paragraph(container, text) {
    const p = document.createElement("p");
    p.textContent = text;
    container.append(p);
  }
  function localize() {
    const current = context();
    document.querySelector("#open-trail").disabled = !current?.state.trail;
    document.querySelector("#town-trail").disabled = !current?.state.trail;
    if (!current?.state.trail) return;
    const { state, blocked } = current;
    const trail = state.trail;
    const target = trailTarget(state);
    document.querySelector("#trail-title").textContent = t(trail.completed ? "trailReunionTitle" : "trailTitle");
    document.querySelector("#trail-intro").textContent = t("trailIntro", { parent: trail.parentName });
    document.querySelector("#trail-target").textContent = target
      ? t("trailTarget", { step: trail.index + 1, place: target.name,
        row: target.row + 1, col: target.col + 1,
        east: target.col - state.col, south: target.row - state.row })
      : t("trailReunion", { parent: trail.parentName });
    const mapLink = document.querySelector("#trail-map-link");
    mapLink.hidden = !target;
    if (target) mapLink.href = `https://www.openstreetmap.org/${target.osmId}`;
    action.disabled = blocked || !atTrailTarget(state);
    action.textContent = t(trail.index === 2 ? "trailMeet" : "trailInterview");
    const history = document.querySelector("#trail-history");
    history.replaceChildren();
    for (const facts of trail.history) {
      const item = document.createElement("li");
      if (facts.next) paragraph(item, t("trailDialogue", {
        parent: facts.parentName, place: facts.place, next: facts.next.name,
      }));
      else paragraph(item, t("trailReunion", { parent: facts.parentName }));
      paragraph(item, t("trailFacts", { id: facts.witnessId, place: facts.place,
        next: facts.next?.name ?? t("trailReunionTitle") }));
      history.append(item);
    }
  }
  function open() {
    if (!context()?.state.trail || document.querySelector("dialog[open]")) return;
    dialog.showModal();
    localize();
  }
  document.querySelector("#open-trail").addEventListener("click", open);
  document.querySelector("#town-trail").addEventListener("click", () => {
    document.querySelector("#town-dialog").close();
    open();
  });
  action.addEventListener("click", () => {
    if (!interview()) return;
    localize();
  });
  document.querySelector("#trail-restart").addEventListener("click", () => {
    dialog.close();
    document.querySelector("#restart-travel").click();
  });
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
    }
  });
  return { open, localize, reset: () => dialog.close() };
}
