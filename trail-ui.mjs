import { trailTarget, atTrailTarget } from "./trail.mjs";
import { distanceMeters } from "./cell-content.mjs";
import { createContentService } from "./cell-content.mjs";
import { openContentCache } from "./content-cache.mjs";
import { clueActions, CLUE_ACTIONS, searchClueOptions, prepareClueSearch } from "./trail-actions.mjs";
import { marketPrice } from "./economy.mjs";
import { parentSighting } from "./parent-story.mjs";
import { DIRECTIONS_RULES, directionsChance } from "./directions.mjs";
import { fieldSearchAvailable, fieldSearchRules, prepareFieldSearch, fieldClueText, vagueLead,
  recognitionHint, prepareRecognition } from "./trail-search.mjs";

export function parentClueText(state, discovery, t) {
  if (!discovery.nextName) return t("trailReunion", { parent: state.trail.parentName });
  if (state.trail.exploration && discovery.step >= state.trail.exploration.firstStage && !discovery.pending) {
    const hint = state.trail.exploration.hints.find(h => h.stage === discovery.step + 1);
    return t("fieldLead", { clue: hint ? fieldClueText(state, hint, t) : vagueLead(state, discovery.step + 1, t) });
  }
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
  if (trail.exploration && trail.exploration.knownStage !== trail.index) {
    const hints = trail.exploration.hints.filter(h => h.stage === trail.index);
    const best = hints.find(h => h.kind === "place") ??
      hints.find(h => h.precision === "partial" && h.kind === "prefix") ??
      hints.find(h => h.kind === "prefix") ?? hints.find(h => h.kind === "direction");
    return best ? fieldClueText(state, best, t) : vagueLead(state, trail.index, t);
  }
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
  if (state.trail.exploration && state.trail.exploration.knownStage !== state.trail.index) {
    return trailReminder(state, t);
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

export function setupTrail(t, { context, interview, discover, askDirections, searchField, recognizeField }) {
  const dialog = document.querySelector("#trail-dialog");
  const hintDialog = document.querySelector("#hint-dialog");
  const action = document.querySelector("#trail-interview");
  const photo = document.querySelector("#trail-clue-photo");
  const ask = document.querySelector("#hint-ask");
  let directionsOutcome;
  let searching = false, searchGeneration = 0, preparedPhoto, photoUnavailable = false;
  let photoKey, objectUrl, photoGeneration = 0, service;
  let searchController, fieldPhoto, fieldPhotoUnavailable = false;
  let viewedFieldPhoto;

  function clearPhoto() {
    photoGeneration++;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = photoKey = undefined;
    photo.replaceChildren();
  }
  async function resolveCluePhoto(state, index, currentTarget = false) {
    const place = state.trail.stages[index + (currentTarget ? 0 : 1)] ?? state.trail.stages[index];
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
  async function availablePhoto(state, index, currentTarget = false) {
    try {
      return await resolveCluePhoto(state, index, currentTarget);
    } catch (error) {
      console.error("Clue photo unavailable:", error);
      return null;
    }
  }
  async function renderPhoto(state, discovery, unannotated = false, currentTarget = unannotated) {
    const key = `${discovery.step}:${unannotated}:${currentTarget}:${document.documentElement.lang}`;
    if (photoKey === key) return;
    clearPhoto();
    photoKey = key;
    const generation = photoGeneration;
    paragraph(photo, t("cluePhotoLoading"));
    try {
      const prepared = currentTarget ? fieldPhoto : preparedPhoto;
      const content = prepared?.step === discovery.step && prepared.content
        ? prepared.content : await availablePhoto(state, discovery.step, currentTarget);
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
      paragraph(photo, t("contentCredit", unannotated ? { ...content, title: t("fieldClue.photo") } : content));
      for (const [url, label] of [[content.sourceUrl, unannotated ? t("fieldPhotoSource") : content.title],
        [content.licenseUrl, t("contentLicense")]]) {
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
  function reportText(report) {
    return t(`fieldReport.${report.outcome === "suggestion" ? report.kind : report.outcome}`, {
      place: report.town?.name,
    });
  }
  async function askCollectedClue(hint) {
    const current = context();
    if (!current || current.blocked || searching) return;
    searching = true;
    const generation = ++searchGeneration;
    const controller = searchController = new AbortController();
    document.querySelector("#hint-action-error").textContent = "";
    document.querySelector("#trail-action-error").textContent = "";
    localize();
    try {
      const prepared = await prepareRecognition(current.state, hint, controller.signal);
      if (generation !== searchGeneration || context()?.state !== current.state || context()?.blocked) return;
      recognizeField(prepared);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Clue recognition failed:", error);
      for (const selector of ["#hint-action-error", "#trail-action-error"]) {
        document.querySelector(selector).textContent = t("fieldRecognitionError", { error: error.message });
      }
    } finally {
      if (generation === searchGeneration) {
        searching = false;
        localize();
      }
    }
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
        next: trail.exploration && rumor.stage >= trail.exploration.firstStage
          ? vagueLead(state, rumor.stage + 1, t) : trail.stages[rumor.stage + 1].name,
      }));
      records.append(item);
    }
  }
  function localize() {
    const current = context();
    document.querySelector("#open-hint").disabled = !current?.state.trail || current.blocked || Boolean(current.state.ended);
    if (current?.state.trail) {
      ask.disabled = current.blocked || Boolean(current.state.ended) || searching;
      document.querySelector("#hint-cost").textContent = t("hintCost", {
        minutes: DIRECTIONS_RULES.minutes, fatigue: DIRECTIONS_RULES.fatigue,
        chance: Math.round(directionsChance(current.cell) * 100),
      });
      const report = current.state.trail.exploration?.lastReport;
      document.querySelector("#hint-guidance").textContent = report?.stage === current.state.trail.index
        ? reportText(report)
        : directionsOutcome === "helped" ? playerHint(current.state, current.info, t)
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
        const progressive = trail.exploration && index >= trail.exploration.firstStage;
        paragraph(item, `${t(progressive && facts.clueKind === "photo" ? "fieldClue.photo" : `clueFound.${facts.clueKind}`)} — ${t(progressive ? "fieldClueAt" : "clueHistory", {
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
    for (const hint of trail.exploration?.hints ?? []) {
      const item = document.createElement("li");
      paragraph(item, fieldClueText(state, hint, t));
      if (hint.kind === "photo") {
        const view = document.createElement("button");
        view.type = "button";
        view.textContent = t("fieldViewPhoto");
        view.addEventListener("click", () => {
          viewedFieldPhoto = hint.stage;
          photo.hidden = false;
          void renderPhoto(state, { step: hint.stage }, true);
        });
        item.append(view);
      }
      if (hint.stage === trail.index && ["prefix", "photo"].includes(hint.kind) && !state.ended) {
        const askButton = document.createElement("button");
        askButton.type = "button";
        askButton.textContent = t("fieldAsk");
        askButton.disabled = blocked || searching;
        askButton.addEventListener("click", () => askCollectedClue(hint));
        item.append(askButton);
      }
      history.append(item);
    }
    for (const report of trail.exploration?.reports ?? []) {
      const item = document.createElement("li");
      paragraph(item, reportText(report));
      history.append(item);
    }
    const actions = document.querySelector("#trail-actions");
    actions.replaceChildren();
    const lastReport = trail.exploration?.lastReport;
    if (lastReport?.stage === trail.index) paragraph(actions, reportText(lastReport));
    if (modern && !atTrailTarget(state) && !trail.completed && !trail.exploration) paragraph(actions, t("clueTravelFirst"));
    if (fieldSearchAvailable(state, current.cell) && !atTrailTarget(state)) {
      const item = document.createElement("div"), button = document.createElement("button");
      const rules = fieldSearchRules(state);
      button.id = "clue-field-search";
      button.type = "button";
      button.textContent = t(searching ? "clueSearchLoading" : "clueSearch");
      button.disabled = blocked || searching || !state.serverJourney;
      paragraph(item, t("fieldSearchCosts", rules));
      if (!state.serverJourney) paragraph(item, t("fieldSearchServer"));
      const last = trail.exploration.lastSearch;
      if (last?.stage === trail.index) {
        paragraph(item, t(`fieldOutcome.${last.outcome}`, last));
        if (fieldPhotoUnavailable) paragraph(item, t("fieldPhotoFallback"));
      }
      button.addEventListener("click", async () => {
        const latest = context();
        if (searching || !latest || latest.blocked || latest.state !== state) return;
        searching = true;
        fieldPhotoUnavailable = false;
        const controller = searchController = new AbortController();
        const generation = ++searchGeneration;
        document.querySelector("#trail-action-error").textContent = "";
        localize();
        try {
          const found = await prepareFieldSearch(state, current.cell, availablePhoto, controller.signal);
          if (generation !== searchGeneration) return;
          const latest = context();
          if (!latest || latest.blocked || latest.state !== state) return;
          fieldPhoto = found.content ? { step: found.stage, content: found.content } : undefined;
          viewedFieldPhoto = found.content ? found.stage : undefined;
          fieldPhotoUnavailable = found.photoUnavailable;
          searchField(found);
        } catch (error) {
          if (controller.signal.aborted) return;
          console.error("Field clue search failed:", error);
          document.querySelector("#trail-action-error").textContent = t("fieldSearchError", { error: error.message });
        } finally {
          if (generation === searchGeneration) {
            searching = false;
            localize();
          }
        }
      });
      item.append(button);
      actions.append(item);
    }
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
        paragraph(item, `${t(kind === "photo" && trail.exploration ? "fieldClue.photo" : `clueFound.${kind}`)} — ${t("clueCost", {
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
      document.querySelector("#trail-discovery-title").textContent =
        t(discovery.kind === "photo" && trail.exploration ? "fieldClue.photo" : `clueFound.${discovery.kind}`);
      document.querySelector("#trail-discovery-text").textContent =
        `${photoUnavailable ? `${t("cluePhotoFallback")} ` : ""}${parentClueText(state, discovery, t)}`;
    }
    const last = trail.exploration?.lastSearch;
    const latestPhoto = trail.exploration?.hints.find(h => h.kind === "photo" &&
      h.elapsedMinutes === last?.elapsedMinutes);
    if (viewedFieldPhoto !== undefined || latestPhoto && last.stage === trail.index && last.outcome === "found") {
      photo.hidden = false;
      void renderPhoto(state, { step: viewedFieldPhoto ?? latestPhoto.stage }, true);
    } else if (discovery?.kind === "photo") {
      photo.hidden = false;
      void renderPhoto(state, discovery, Boolean(trail.exploration), false);
    } else {
      photo.hidden = true;
      clearPhoto();
    }
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
    const hint = recognitionHint(current.state);
    if (hint) {
      void askCollectedClue(hint);
      return;
    }
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
    if (dialog.open) return;
    if (searching) {
      searchController?.abort();
      searchGeneration++;
      searching = false;
    }
  });
  hintDialog.addEventListener("close", () => {
    if (hintDialog.open) return;
    if (searching) {
      searchController?.abort();
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
    searchController?.abort();
    searchGeneration++;
    searching = false;
    preparedPhoto = undefined;
    fieldPhoto = undefined;
    viewedFieldPhoto = undefined;
    fieldPhotoUnavailable = false;
    photoUnavailable = false;
    dialog.close();
    hintDialog.close();
    directionsOutcome = undefined;
    clearPhoto();
  } };
}
