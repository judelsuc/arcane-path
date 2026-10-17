import { trailTarget, atTrailTarget } from "./trail.mjs";
import { distanceMeters } from "./cell-content.mjs";
import { createContentService } from "./cell-content.mjs";
import { openContentCache } from "./content-cache.mjs";
import { clueActions, CLUE_ACTIONS, searchClueOptions, prepareClueSearch } from "./trail-actions.mjs";
import { marketPrice } from "./economy.mjs";
import { parentSighting } from "./parent-story.mjs";
import { DIRECTIONS_RULES, directionsChance } from "./directions.mjs";

export function parentClueText(state, discovery, t) {
  if (!discovery.nextName) return t("trailReunion", { parent: state.trail.parentName });
  const hint = discovery.pending ? discovery.venue : discovery.nextName;
  if (discovery.kind !== "discuss") {
    return t(`clueText.${discovery.kind}`, { hint, parent: state.trail.parentName });
  }
  const sighting = parentSighting(state, discovery.step);
  const parts = [t(`parentWitness.${sighting.variant}`, { parent: state.trail.parentName })];
  if (sighting.precision) parts.push(t(`parentWitness.${sighting.precision}`));
  if (state.trail.story) parts.push(t("parentWitness.reason", {
    motive: t(`parentStory.motive.${state.trail.story.motive}`),
  }));
  parts.push(t("parentWitness.lead", { hint }));
  return parts.join(" ");
}

export function trailReminder(state, t) {
  const trail = state.trail;
  if (trail.completed) return t("trailReunion", { parent: trail.parentName });
  if (trail.discovery?.pending) return t("clueAskDirections", { venue: trail.discovery.venue });
  return t("trailKnownDestination", { place: trailTarget(state).name });
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
  const east = target.col - state.col, north = state.row - target.row;
  const compass = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  const sector = (Math.round(Math.atan2(east, north) / (Math.PI / 4)) + 8) % 8;
  const distance = meters < 2000 ? "near" : meters < 10000 ? "short" : meters < 30000 ? "far" : "distant";
  return t("hintTravel", { place: target.name, direction: t(`hintCompass.${compass[sector]}`),
    distance: t(`hintDistance.${distance}`) });
}

export function setupTrail(t, { context, interview, discover, askDirections }) {
  const dialog = document.querySelector("#trail-dialog");
  const hintDialog = document.querySelector("#hint-dialog");
  const action = document.querySelector("#trail-interview");
  const photo = document.querySelector("#trail-clue-photo");
  const ask = document.querySelector("#hint-ask");
  let directionsOutcome;
  let searching = false, searchGeneration = 0, preparedPhoto, photoUnavailable = false;
  let photoKey, objectUrl, photoGeneration = 0, service;

  function clearPhoto() {
    photoGeneration++;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = photoKey = undefined;
    photo.replaceChildren();
  }
  async function resolveCluePhoto(state, index) {
    const place = state.trail.stages[index + 1] ?? state.trail.stages[index];
    const step = 250 / 6371008.8 * 180 / Math.PI;
    const lonStep = step / Math.cos(place.latitude * Math.PI / 180);
    const info = { latitude: place.latitude, longitude: place.longitude, meters: 250,
      bounds: { west: place.longitude - lonStep / 2, east: place.longitude + lonStep / 2,
        south: place.latitude - step / 2, north: place.latitude + step / 2 },
      contentSources: [], pois: [], names: [] };
    service ??= createContentService({ cache: openContentCache(), maxPhotos: 1 });
    const result = await service.resolve(info, document.documentElement.lang, "photo");
    if (result.errors?.length) console.warn("Clue photo sources:", result.errors);
    const content = result.content;
    if (!content?.blob || content.nature) return null;
    for (const url of [content.sourceUrl, content.licenseUrl]) {
      if (new URL(url).protocol !== "https:") throw new Error("Unsafe clue-photo source.");
    }
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(content.blob);
      bitmap.close();
    } else {
      const url = URL.createObjectURL(content.blob);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return content;
  }
  async function availablePhoto(state, index) {
    try {
      return await resolveCluePhoto(state, index);
    } catch (error) {
      console.error("Clue photo unavailable:", error);
      return null;
    }
  }
  async function renderPhoto(state, discovery) {
    const key = `${discovery.step}:${document.documentElement.lang}`;
    if (photoKey === key) return;
    clearPhoto();
    photoKey = key;
    const generation = photoGeneration;
    paragraph(photo, t("cluePhotoLoading"));
    try {
      const content = preparedPhoto?.step === discovery.step
        ? preparedPhoto.content : await availablePhoto(state, discovery.step);
      if (generation !== photoGeneration) return;
      photo.replaceChildren();
      if (!content) {
        paragraph(photo, t("cluePhotoMissing"));
        return;
      }
      objectUrl = URL.createObjectURL(content.blob);
      const image = document.createElement("img");
      image.src = objectUrl;
      image.alt = t("cluePhotoAlt");
      image.onerror = () => { if (generation === photoGeneration) paragraph(photo, t("cluePhotoMissing")); };
      photo.append(image);
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
      paragraph(item, t(visit.departure > state.startedAt + state.elapsedMinutes * 60_000
        ? "parentStory.currentVisit" : "parentStory.visit", {
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
    document.querySelector("#open-hint").disabled = !current?.state.trail || current.blocked || Boolean(current.state.ended);
    if (current?.state.trail) {
      ask.disabled = current.blocked || Boolean(current.state.ended);
      document.querySelector("#hint-cost").textContent = t("hintCost", {
        minutes: DIRECTIONS_RULES.minutes, fatigue: DIRECTIONS_RULES.fatigue,
        chance: Math.round(directionsChance(current.cell) * 100),
      });
      document.querySelector("#hint-guidance").textContent = directionsOutcome === "helped"
        ? playerHint(current.state, current.info, t)
        : t(directionsOutcome ? `hintOutcome.${directionsOutcome}` : "hintBeforeAsk");
    }
    document.querySelector("#open-trail").disabled = !current?.state.trail;
    document.querySelector("#town-trail").disabled = !current?.state.trail;
    if (!current?.state.trail) return;
    const { state, blocked } = current;
    const trail = state.trail;
    renderStory(state);
    const modern = trail.version === 2;
    document.querySelector("#trail-save-status").textContent = current.saveStatus ?? "";
    document.querySelector("#trail-title").textContent = t(trail.completed ? "trailReunionTitle" : "trailTitle");
    document.querySelector("#trail-intro").textContent = t("trailReminderIntro", { parent: trail.parentName });
    const local = trail.stages.some(stage => stage.geonameId !== undefined);
    document.querySelector("#trail-catalogue-credit").hidden = !local;
    document.querySelector("#trail-target").textContent = trailReminder(state, t);
    action.disabled = blocked || !atTrailTarget(state);
    action.hidden = modern;
    action.nextElementSibling.hidden = modern;
    action.textContent = t(trail.index === trail.stages.length - 1 ? "trailMeet" : "trailInterview");
    const history = document.querySelector("#trail-history");
    history.replaceChildren();
    for (const [index, facts] of trail.history.entries()) {
      const item = document.createElement("li");
      if (facts.next && modern) {
        paragraph(item, `${t(`clueFound.${facts.clueKind}`)} — ${t("clueHistory", {
          place: facts.place, next: facts.next.name,
        })}`);
        paragraph(item, parentClueText(state, {
          kind: facts.clueKind, step: index, nextName: facts.next.name, pending: false,
        }, t));
      }
      else if (facts.next) paragraph(item, t("trailDialogue", {
        parent: facts.parentName, place: facts.place, next: facts.next.name,
      }));
      else paragraph(item, t("trailReunion", { parent: facts.parentName }));
      history.append(item);
    }
    const actions = document.querySelector("#trail-actions");
    actions.replaceChildren();
    if (modern && !atTrailTarget(state) && !trail.completed) paragraph(actions, t("clueTravelFirst"));
    const available = clueActions(state);
    const options = searchClueOptions(state, current.cell, current.info, current.data);
    if (options.length) {
      const item = document.createElement("div"), button = document.createElement("button");
      button.id = "clue-investigate";
      button.type = "button";
      button.textContent = t(searching ? "clueSearchLoading" : "clueSearch");
      button.disabled = blocked || searching;
      button.addEventListener("click", async () => {
        const latest = context();
        if (searching || !latest || latest.blocked || latest.state !== state) return;
        searching = true;
        photoUnavailable = false;
        const generation = ++searchGeneration;
        document.querySelector("#trail-action-error").textContent = "";
        localize();
        try {
          const found = await prepareClueSearch(state, current.cell, current.info, current.data, availablePhoto);
          if (generation !== searchGeneration) return;
          const latest = context();
          if (!latest || latest.blocked || latest.state !== state) return;
          preparedPhoto = found.content ? { step: state.trail.index, content: found.content } : undefined;
          photoUnavailable = found.photoUnavailable;
          discover(found.kind);
        } catch (error) {
          console.error("Clue search failed:", error);
          document.querySelector("#trail-action-error").textContent = error.message;
        } finally {
          if (generation === searchGeneration) {
            searching = false;
            localize();
          }
        }
      });
      item.append(button);
      paragraph(item, t("clueSearchCosts"));
      for (const kind of options) {
        const rule = CLUE_ACTIONS[kind];
        paragraph(item, `${t(`clueFound.${kind}`)} — ${t("clueCost", {
          minutes: rule.minutes, fatigue: rule.fatigue, kcal: rule.kcal,
          money: ((rule.mealUnits ? marketPrice(current.cell, rule.mealUnits, current.data, current.info).cents : 0) / 100).toFixed(2),
        })}`);
      }
      actions.append(item);
    }
    for (const kind of available.filter(kind => ["directions", "rumor"].includes(kind))) {
      const rule = CLUE_ACTIONS[kind];
      const button = document.createElement("button");
      button.id = `clue-${kind}`;
      button.type = "button";
      button.textContent = t(`clueAction.${kind}`);
      button.disabled = blocked || searching;
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
      document.querySelector("#trail-discovery-title").textContent = t(`clueFound.${discovery.kind}`);
      document.querySelector("#trail-discovery-text").textContent =
        `${photoUnavailable ? `${t("cluePhotoFallback")} ` : ""}${parentClueText(state, discovery, t)}`;
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
    if (!current?.state.trail || current.blocked || current.state.ended || document.querySelector("dialog[open]")) return;
    directionsOutcome = undefined;
    document.querySelector("#hint-action-error").textContent = "";
    localize();
    hintDialog.showModal();
  });
  ask.addEventListener("click", () => {
    const current = context();
    if (!current || current.blocked || current.state.ended) return;
    document.querySelector("#hint-action-error").textContent = "";
    const outcome = askDirections();
    if (!outcome) return;
    directionsOutcome = outcome;
    localize();
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
  dialog.addEventListener("close", () => {
    if (searching) {
      searchGeneration++;
      searching = false;
    }
  });
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
    }
  });
  return { open, localize, reset() {
    searchGeneration++;
    searching = false;
    preparedPhoto = undefined;
    photoUnavailable = false;
    dialog.close();
    hintDialog.close();
    directionsOutcome = undefined;
    clearPhoto();
  } };
}
