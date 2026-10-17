import { trailTarget, atTrailTarget } from "./trail.mjs";
import { distanceMeters } from "./cell-content.mjs";
import { createContentService } from "./cell-content.mjs";
import { openContentCache } from "./content-cache.mjs";
import { clueActions, CLUE_ACTIONS } from "./trail-actions.mjs";
import { marketPrice } from "./economy.mjs";
import { createParentPathLoader } from "./parent-path.mjs";

export function trailDirections(state, target, t) {
  const east = target.col - state.col, south = target.row - state.row;
  const parts = [];
  if (east) parts.push(t(east > 0 ? "trailEast" : "trailWest", { count: Math.abs(east) }));
  if (south) parts.push(t(south > 0 ? "trailSouth" : "trailNorth", { count: Math.abs(south) }));
  return parts.length ? parts.join(t("trailDirectionJoin")) : t("trailAlreadyHere");
}

export function playerHint(state, info, t) {
  if (state.ended) return t("hintEnded");
  const target = trailTarget(state);
  if (!target) return t("hintEnded");
  if (atTrailTarget(state)) {
    if (state.trail.discovery?.pending) return t("hintDirections", { venue: state.trail.discovery.venue });
    return t(state.trail.version === 2 ? "hintInvestigate" : "hintInterview", { place: target.name });
  }
  const meters = state.trail.version === 2
    ? distanceMeters(info, target.latitude, target.longitude)
    : Math.hypot(target.col - state.col, target.row - state.row) * 250;
  return t("hintTravel", { place: target.name, directions: trailDirections(state, target, t),
    km: (meters / 1000).toFixed(1) });
}

export function setupTrail(t, { context, interview, discover }) {
  const dialog = document.querySelector("#trail-dialog");
  const hintDialog = document.querySelector("#hint-dialog");
  const action = document.querySelector("#trail-interview");
  const photo = document.querySelector("#trail-clue-photo");
  let photoKey, objectUrl, photoGeneration = 0, service;
  const pathLoader = createParentPathLoader({ onUpdate: renderPath });
  function renderPath() {
    const status = pathLoader.status;
    const element = document.querySelector("#parent-path-status");
    element.textContent = t(`parentPath.${status.status}`, {
      chunks: status.chunks ?? 0, downloads: status.downloads ?? 0,
      expanded: status.expanded ?? 0, error: status.error ?? "",
      km: ((status.distanceMeters ?? 0) / 1000).toFixed(1),
      hours: ((status.walkingMinutes ?? 0) / 60).toFixed(1),
    });
    if (status.status === "ready" && !status.elevationComplete) {
      element.textContent += ` ${t("parentPath.noElevation")}`;
    }
    document.querySelector("#parent-path-retry").hidden = status.status !== "error";
    document.querySelector("#parent-path-prepare").hidden = status.status !== "idle";
  }
  document.querySelector("#parent-path-retry").addEventListener("click", () => pathLoader.retry());
  document.querySelector("#parent-path-prepare").addEventListener("click", () => pathLoader.prepare());

  function clearPhoto() {
    photoGeneration++;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = photoKey = undefined;
    photo.replaceChildren();
  }
  async function renderPhoto(state, discovery) {
    const place = discovery.nextName
      ? state.trail.stages[discovery.step + 1] : state.trail.stages[discovery.step];
    const key = `${discovery.step}:${place.osmId ?? `geoname/${place.geonameId}`}:${document.documentElement.lang}`;
    if (photoKey === key) return;
    clearPhoto();
    photoKey = key;
    const generation = photoGeneration;
    paragraph(photo, t("cluePhotoLoading"));
    const step = 250 / 6371008.8 * 180 / Math.PI;
    const lonStep = step / Math.cos(place.latitude * Math.PI / 180);
    const info = { latitude: place.latitude, longitude: place.longitude, meters: 250,
      bounds: { west: place.longitude - lonStep / 2, east: place.longitude + lonStep / 2,
        south: place.latitude - step / 2, north: place.latitude + step / 2 },
      contentSources: [], pois: [], names: [] };
    try {
      service ??= createContentService({ cache: openContentCache(), maxPhotos: 1 });
      const result = await service.resolve(info, document.documentElement.lang, "photo");
      if (generation !== photoGeneration) return;
      photo.replaceChildren();
      const content = result.content;
      if (!content?.blob || content.nature) {
        paragraph(photo, t("cluePhotoMissing"));
        if (result.errors?.length) console.warn("Clue photo unavailable:", result.errors);
        return;
      }
      objectUrl = URL.createObjectURL(content.blob);
      const image = document.createElement("img");
      image.src = objectUrl;
      image.alt = t("cluePhotoAlt");
      image.onerror = () => { if (generation === photoGeneration) paragraph(photo, t("cluePhotoMissing")); };
      photo.append(image);
      paragraph(photo, t("cluePhotoDisclaimer", { distance: content.distance ?? 0 }));
      paragraph(photo, t("contentCredit", content));
      for (const [url, label] of [[content.sourceUrl, content.title], [content.licenseUrl, t("contentLicense")]]) {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") throw new Error("Unsafe clue-photo source.");
        const link = document.createElement("a");
        link.href = parsed.href;
        link.textContent = label;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        photo.append(link, " ");
      }
    } catch (error) {
      if (generation !== photoGeneration) return;
      console.error("Clue photo failed:", error);
      photo.replaceChildren();
      paragraph(photo, t("cluePhotoMissing"));
    }
  }

  function paragraph(container, text) {
    const p = document.createElement("p");
    p.textContent = text;
    container.append(p);
  }
  function renderStory(state) {
    const { trail } = state, story = trail.story;
    document.querySelector("#parent-story").hidden = !story;
    if (!story) return;
    document.querySelector("#parent-story-summary").textContent = t("parentStory.summary", {
      parent: trail.parentName, motive: t(`parentStory.motive.${story.motive}`),
      mode: t(`parentStory.mode.${story.mode}`),
      orientation: t(`parentStory.${story.orientation}`),
    });
    document.querySelector("#parent-story-motion").textContent =
      t(`parentStory.${story.finalState}`);
    const records = document.querySelector("#parent-story-records");
    records.replaceChildren();
    for (const [index, facts] of trail.history.entries()) {
      const visit = story.visits[index], item = document.createElement("li");
      paragraph(item, t("parentStory.visit", {
        place: facts.place, arrival: new Date(visit.arrival).toISOString().slice(0, 10),
        departure: new Date(visit.departure).toISOString().slice(0, 10),
        nights: visit.nights, purchases: visit.purchases,
      }));
      const lore = story.lore.find(entry => entry.stage === index);
      if (lore) paragraph(item, t(`parentStory.lore.${lore.kind}`));
      records.append(item);
    }
    for (const rumor of trail.rumors ?? []) {
      const branch = story.falseLeads.find(entry => entry.stage === rumor.stage);
      const item = document.createElement("li");
      paragraph(item, t("parentStory.falseLead", {
        traveler: branch.traveler, place: trail.stages[rumor.stage].name,
        next: trail.stages[rumor.stage + 1].name,
      }));
      records.append(item);
    }
  }
  function localize() {
    const current = context();
    document.querySelector("#open-hint").disabled = !current?.state.trail || current.blocked;
    if (current?.state.trail) {
      document.querySelector("#hint-guidance").textContent = playerHint(current.state, current.info, t);
    }
    document.querySelector("#open-trail").disabled = !current?.state.trail;
    document.querySelector("#town-trail").disabled = !current?.state.trail;
    if (!current?.state.trail) return;
    const { state, blocked } = current;
    pathLoader.update(state);
    renderPath();
    const trail = state.trail;
    renderStory(state);
    const modern = trail.version === 2;
    document.querySelector("#trail-save-status").textContent = current.saveStatus ?? "";
    const target = trailTarget(state);
    document.querySelector("#trail-title").textContent = t(trail.completed ? "trailReunionTitle" : "trailTitle");
    document.querySelector("#trail-intro").textContent = t(trail.version === 2 ? "trailTownIntro" : "trailIntro",
      { parent: trail.parentName, total: trail.stages.length });
    const local = trail.stages.some(stage => stage.geonameId !== undefined);
    document.querySelector("#trail-catalogue-credit").hidden = !local;
    if (local) document.querySelector("#trail-intro").textContent += ` ${t("trailLocalSummary")}`;
    document.querySelector("#trail-target").textContent = target
      ? t("trailTarget", { step: trail.index + 1, total: trail.stages.length, place: target.name,
        directions: modern && atTrailTarget(state) ? t("clueChooseAction") : trailDirections(state, target, t) })
      : t("trailReunion", { parent: trail.parentName });
    if (target && trail.version === 2) {
      document.querySelector("#trail-target").textContent += ` ${t("trailTownDistance", {
        km: (distanceMeters(current.info, target.latitude, target.longitude) / 1000).toLocaleString(
          document.documentElement.lang, { maximumFractionDigits: 1 }),
        leg: Math.round(target.legMeters / 1000),
      })}`;
    }
    if (trail.discovery?.pending) {
      document.querySelector("#trail-target").textContent = t("clueAskDirections", {
        venue: trail.discovery.venue,
      });
    }
    const mapLink = document.querySelector("#trail-map-link");
    mapLink.hidden = !target || Boolean(trail.discovery?.pending);
    if (target) mapLink.href = target.geonameId
      ? `https://www.openstreetmap.org/?mlat=${target.latitude}&mlon=${target.longitude}#map=14/${target.latitude}/${target.longitude}`
      : `https://www.openstreetmap.org/${target.osmId}`;
    action.disabled = blocked || !atTrailTarget(state);
    action.hidden = modern;
    action.nextElementSibling.hidden = modern;
    action.textContent = t(trail.index === trail.stages.length - 1 ? "trailMeet" : "trailInterview");
    const history = document.querySelector("#trail-history");
    history.replaceChildren();
    for (const facts of trail.history) {
      const item = document.createElement("li");
      if (facts.next && modern) paragraph(item, `${t(`clueAction.${facts.clueKind}`)} — ${t("clueHistory", {
        place: facts.place, next: facts.next.name,
      })}`);
      else if (facts.next) paragraph(item, t("trailDialogue", {
        parent: facts.parentName, place: facts.place, next: facts.next.name,
      }));
      else paragraph(item, t("trailReunion", { parent: facts.parentName }));
      paragraph(item, t("trailFacts", { id: facts.witnessId, place: facts.place,
        next: facts.next?.name ?? t("trailReunionTitle") }));
      history.append(item);
    }
    const actions = document.querySelector("#trail-actions");
    actions.replaceChildren();
    if (modern && !atTrailTarget(state) && !trail.completed) paragraph(actions, t("clueTravelFirst"));
    for (const kind of clueActions(state)) {
      const rule = CLUE_ACTIONS[kind];
      const button = document.createElement("button");
      button.id = `clue-${kind}`;
      button.type = "button";
      button.textContent = t(`clueAction.${kind}`);
      button.disabled = blocked;
      button.addEventListener("click", () => {
        document.querySelector("#trail-action-error").textContent = "";
        discover(kind);
        localize();
      });
      const item = document.createElement("div");
      item.append(button);
      paragraph(item, t("clueCost", { minutes: rule.minutes, fatigue: rule.fatigue, kcal: rule.kcal,
        money: ((rule.mealUnits ? marketPrice(current.cell, rule.mealUnits, current.data, current.info).cents : 0) / 100).toFixed(2) }));
      actions.append(item);
    }
    const discovery = trail.discovery;
    document.querySelector("#trail-discovery").hidden = !discovery;
    if (discovery) {
      document.querySelector("#trail-discovery-title").textContent = t(`clueAction.${discovery.kind}`);
      document.querySelector("#trail-discovery-text").textContent = discovery.nextName
        ? t(`clueText.${discovery.kind}`, {
          hint: discovery.pending ? discovery.venue : discovery.nextName,
          parent: trail.parentName,
        }) : t("trailReunion", { parent: trail.parentName });
      photo.hidden = discovery.kind !== "photo";
      if (discovery.kind === "photo") void renderPhoto(state, discovery);
      else clearPhoto();
    } else clearPhoto();
  }
  function open() {
    if (!context()?.state.trail || document.querySelector("dialog[open]")) return;
    dialog.showModal();
    localize();
  }
  document.querySelector("#open-trail").addEventListener("click", open);
  document.querySelector("#open-hint").addEventListener("click", () => {
    const current = context();
    if (!current?.state.trail || current.blocked || document.querySelector("dialog[open]")) return;
    localize();
    hintDialog.showModal();
  });
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
  return { open, localize, reset() {
    pathLoader.stop();
    dialog.close();
    hintDialog.close();
    clearPhoto();
  } };
}
