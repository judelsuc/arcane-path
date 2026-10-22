import { trailTarget, atTrailTarget } from "./trail.mjs";
import { distanceMeters } from "./cell-content.mjs";
import { createContentService } from "./cell-content.mjs";
import { openContentCache } from "./content-cache.mjs";
import { clueActions, CLUE_ACTIONS, searchClueOptions, prepareClueSearch } from "./trail-actions.mjs";
import { marketPrice } from "./economy.mjs";
import { parentSighting, parentReunion } from "./parent-story.mjs";
import { DIRECTIONS_RULES, directionsChance, citedTowns } from "./directions.mjs";
import { questDirectionTargets } from "./quest-knowledge.mjs";
import { setFeedback } from "./feedback.mjs";
import { witnessCooling } from "./pressures.mjs";
import { trailDreamText, trailDreamVariant } from "./trail-dreams.mjs";
import { LOST_PLAYER_DREAM } from "./live-narrative.mjs";
import { intimateWitness, parentIntimacy } from "./parent-intimacy.mjs";
import { fieldSearchAvailable, fieldSearchRules, prepareFieldSearch, fieldClueText, vagueLead,
  recognitionHint, prepareRecognition, openingClue, openingClueText } from "./trail-search.mjs";

export function parentClueText(state, discovery, t) {
  const testimony = ["discuss", "buy"].includes(discovery.kind) ? intimateWitness(state, discovery.step, t) : "";
  const text = parentLeadText(state, discovery, t);
  return testimony ? `${testimony} ${text}` : text;
}

function parentLeadText(state, discovery, t) {
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
  if (state.trail.story && !parentIntimacy(state)) parts.push(t("parentWitness.reason", {
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
    const dream = trail.dreams?.checks.findLast(check => check.stage === trail.index && check.outcome === "guidance");
    if (dream && !hints.some(hint => hint.kind === "place" ||
        hint.precision === "partial" && hint.elapsedMinutes >= dream.elapsedMinutes)) return trailDreamText(dream, t);
    const best = hints.find(h => h.kind === "place") ??
      hints.find(h => h.precision === "partial" && h.kind === "prefix") ??
      hints.find(h => h.kind === "prefix") ?? hints.find(h => h.kind === "direction");
    return best ? fieldClueText(state, best, t)
      : trail.index === 0 && openingClue(state) ? openingClueText(state, t)
        : vagueLead(state, trail.index, t);
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

function townPosition(town, info, t) {
  const east = Math.sin((town.longitude - info.longitude) * Math.PI / 180) *
    Math.cos(town.latitude * Math.PI / 180);
  const north = Math.cos(info.latitude * Math.PI / 180) * Math.sin(town.latitude * Math.PI / 180) -
    Math.sin(info.latitude * Math.PI / 180) * Math.cos(town.latitude * Math.PI / 180) *
    Math.cos((town.longitude - info.longitude) * Math.PI / 180);
  const sectors = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  return {
    meters: distanceMeters(info, town.latitude, town.longitude),
    direction: t(`hintCompass.${sectors[(Math.round(Math.atan2(east, north) / (Math.PI / 4)) + 8) % 8]}`),
    latitude: town.latitude.toFixed(6), longitude: town.longitude.toFixed(6),
  };
}

export function suggestedTownPosition(town, info, t) {
  return t("fieldSuggestedPosition", townPosition(town, info, t));
}

export function citedTownDirections(town, info, t) {
  return t("hintTownDirections", { place: town.name, ...townPosition(town, info, t) }) +
    (town.status === "suggested" ? ` ${t("hintTownUnconfirmed")}` : "");
}

export function trailPageRecords(state, stage) {
  const trail = state.trail;
  return [
    ...(openingClue(state) ? [{ kind: "opening", stage: 0, value: openingClue(state) }] : []),
    ...trail.history.map((value, index) => ({
      kind: "history", stage: value.next ? index + 1 : index, value, index,
    })),
    ...(trail.discovery?.pending ? [{
      kind: "discovery", stage: trail.discovery.step + 1, value: trail.discovery,
    }] : []),
    ...(trail.exploration?.hints ?? []).map(value => ({ kind: "hint", stage: value.stage, value })),
    ...(trail.exploration?.signs ?? []).map(value => ({ kind: "sign", stage: value.stage, value })),
    ...(trail.exploration?.reports ?? []).map(value => ({ kind: "report", stage: value.stage, value })),
    ...(trail.rumors ?? []).map(value => ({ kind: "rumor", stage: value.stage + 1, value })),
    ...(trail.arrivals ?? []).map(value => ({ kind: "arrival", stage: value.stage, value })),
    ...(trail.dreams?.checks ?? []).filter(value => value.outcome === "guidance")
      .map(value => ({ kind: "dream", stage: value.stage, value })),
  ].filter(record => record.stage === stage).map((record, order) => ({ ...record, order }))
    .sort((a, b) => (b.value.elapsedMinutes ?? -1) - (a.value.elapsedMinutes ?? -1) || b.order - a.order);
}

export function trailEntryDate(state, minutes, language, t) {
  if (minutes === undefined) return t("trailDateUnknown");
  return `${new Intl.DateTimeFormat(language === "en" ? "en-GB" : "fr-FR", {
    timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(state.startedAt + minutes * 60_000))} UTC`;
}

export function setupTrail(t, { context, interview, discover, askDirections, searchField, recognizeField, pinPhoto, narrative }) {
  const dialog = document.querySelector("#trail-dialog");
  const hintDialog = document.querySelector("#conversation-dialog");
  const action = document.querySelector("#trail-interview");
  const actionCost = action.nextElementSibling;
  const photo = document.querySelector("#trail-clue-photo");
  const ask = document.querySelector("#hint-ask");
  let directionsOutcome, directionsTown, selectedTownKey;
  let searching = false, searchGeneration = 0, preparedPhoto, photoUnavailable = false;
  let photoKey, objectUrl, photoGeneration = 0, service;
  let searchController, fieldPhoto, fieldPhotoUnavailable = false;
  let viewedFieldPhoto;
  let viewedStage, lastActiveStage, pageJourney, section = "current";

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
    if (!content?.blob || content.nature || content.aerial) return null;
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
      const provenance = document.createElement("div");
      provenance.className = "technical-text";
      paragraph(provenance, t("contentCredit", unannotated ? { ...content, title: t("fieldClue.photo") } : content));
      for (const [url, label] of [[content.sourceUrl, unannotated ? t("fieldPhotoSource") : content.title],
        [content.licenseUrl, t("contentLicense")]]) {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") throw new Error("Unsafe clue-photo source.");
        const link = document.createElement("a");
        link.href = parsed.href;
        link.textContent = label;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        provenance.append(link, " ");
      }
      photo.append(provenance);
      pinPhoto?.(photo, content, { unannotated });
    } catch (error) {
      if (generation !== photoGeneration) return;
      console.error("Clue photo failed:", error);
      photo.replaceChildren();
      paragraph(photo, t("cluePhotoMissing"));
    }
  }

  function paragraph(container, text, outcome = "", className = "") {
    const p = document.createElement("p");
    p.textContent = text;
    p.className = className;
    setFeedback(p, outcome);
    container.append(p);
  }
  function photoButton(container, state, stage) {
    const view = document.createElement("button");
    view.type = "button";
    view.textContent = t("fieldViewPhoto");
    view.addEventListener("click", () => {
      viewedFieldPhoto = stage;
      photo.hidden = false;
      void renderPhoto(state, { step: stage }, Boolean(state.trail.exploration), true);
    });
    container.append(view);
  }
  function reportText(report) {
    const text = t(`fieldReport.${report.outcome === "suggestion" ? report.kind : report.outcome}`, {
      place: report.town?.name,
    });
    return report.outcome === "suggestion"
      ? `${text} ${suggestedTownPosition(report.town, context().info, t)}` : text;
  }
  async function askCollectedClue(hint) {
    const current = context();
    if (!current || current.blocked || searching) return;
    directionsOutcome = directionsTown = undefined;
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
    const intimate = parentIntimacy(state);
    if (intimate) document.querySelector("#parent-story-summary").textContent += ` ${
      intimate.desire[t("languageCode")]} · ${intimate.object[t("languageCode")]}`;
    document.querySelector("#parent-story-motion").textContent =
      t(`parentStory.${story.finalState}`);
    const records = document.querySelector("#parent-story-records");
    records.replaceChildren();
    for (const [index, facts] of trail.history.entries()) {
      if (index !== viewedStage) continue;
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
  }
  function localize() {
    const current = context();
    if (current?.state.trail) {
      ask.disabled = current.blocked || Boolean(current.state.ended) || searching;
      document.querySelector("#hint-cost").textContent = t("hintCost", {
        minutes: DIRECTIONS_RULES.minutes, fatigue: DIRECTIONS_RULES.fatigue,
        chance: Math.round(directionsChance(current.cell, current.state) * 100),
      });
      const report = current.state.trail.exploration?.lastReport;
      setFeedback(document.querySelector("#hint-guidance"), directionsTown && directionsOutcome
        ? directionsOutcome === "helped" ? "success" : "failure"
        : report?.stage === current.state.trail.index
        ? report.outcome === "suggestion" ? "" : "failure"
        : directionsOutcome ? directionsOutcome === "helped" ? "success" : "failure" : "");
      document.querySelector("#hint-guidance").textContent = directionsTown && directionsOutcome
        ? directionsOutcome === "helped" ? citedTownDirections(directionsTown, current.info, t)
          : t(`hintOutcome.${directionsOutcome}`)
        : report?.stage === current.state.trail.index
        ? reportText(report)
        : directionsOutcome === "helped" ? playerHint(current.state, current.info, t)
          : t(directionsOutcome ? `hintOutcome.${directionsOutcome}` : "hintBeforeAsk");
      const clues = document.querySelector("#hint-clues");
      clues.replaceChildren();
      for (const hint of current.state.trail.exploration?.hints ?? []) {
        if (hint.stage !== current.state.trail.index || !["prefix", "photo"].includes(hint.kind)) continue;
        const item = document.createElement("li"), button = document.createElement("button");
        paragraph(item, fieldClueText(current.state, hint, t));
        button.type = "button";
        button.textContent = t("fieldAsk");
        button.disabled = current.blocked || searching || Boolean(current.state.ended);
        button.addEventListener("click", () => askCollectedClue(hint));
        item.append(button);
        clues.append(item);
      }
      const towns = questDirectionTargets(current.state), select = document.querySelector("#hint-town");
      document.querySelector("#hint-towns").hidden = towns.length === 0;
      select.replaceChildren();
      for (const town of towns) {
        const option = document.createElement("option");
        option.value = town.key;
        option.textContent = `${town.town ? `${town.town} — ` : ""}${town.name} · ${
          town.references.map(reference => reference.startsWith("service:") ? t("quests.services")
            : reference.startsWith("journal:") || reference.startsWith("abandoned-journal:")
              ? t("quests.journals") : reference.startsWith("artifact:")
                ? t("quests.artifacts") : t("quests.parent")).join(", ")}`;
        select.append(option);
      }
      selectedTownKey = towns.some(town => town.key === selectedTownKey) ? selectedTownKey : towns[0]?.key;
      select.value = selectedTownKey ?? "";
      document.querySelector("#hint-town-ask").disabled = !towns.length || current.blocked ||
        Boolean(current.state.ended) || searching;
    }
    document.querySelector("#open-quests").disabled = !current?.state.trail;
    if (!current?.state.trail) return;
    const { state, blocked } = current;
    const trail = state.trail;
    const awaitingLead = !trail.completed && !parentReunion(state) &&
      (atTrailTarget(state) || trail.arrivals?.some(a => a.stage === trail.index));
    const activeStage = trail.completed ? Math.max(0, trail.index - 1)
      : Math.min(trail.index + (awaitingLead ? 1 : 0), trail.stages.length - 1);
    const journeyKey = state.serverJourney?.id ?? state.startedAt;
    if (pageJourney !== journeyKey || lastActiveStage !== activeStage || viewedStage === undefined) {
      if (pageJourney !== journeyKey || section !== "actions") section = "current";
      viewedStage = activeStage;
      lastActiveStage = activeStage;
      pageJourney = journeyKey;
      viewedFieldPhoto = undefined;
    }
    if (section !== "past") viewedStage = activeStage;
    const currentPage = viewedStage === activeStage;
    for (const name of ["current", "past"]) {
      const button = document.querySelector(`#trail-section-${name}`);
      button.setAttribute("aria-pressed", String(section === name));
      button.disabled = name === "past" && activeStage === 0;
    }
    document.querySelector("#trail-investigation-page").hidden = false;
    document.querySelector("#trail-evidence-page").hidden = section === "actions";
    document.querySelector("#trail-archive-pages").hidden = section !== "past";
    document.querySelector("#trail-main-title").textContent = t(
      section === "actions" ? "trailSectionActions" : section === "past" ? "trailSectionPast" : "trailSectionCurrent");
    document.querySelector("#trail-page-previous").disabled = viewedStage === 0;
    document.querySelector("#trail-page-next").disabled = viewedStage >= activeStage;
    document.querySelector("#trail-page-current").disabled = currentPage;
    const reached = viewedStage < trail.index || trail.arrivals?.some(a => a.stage === viewedStage) ||
      viewedStage === trail.index && atTrailTarget(state);
    const knownDestination = viewedStage === trail.index &&
      (!trail.exploration || trail.exploration.knownStage === trail.index) && !trail.discovery?.pending;
    document.querySelector("#trail-page-status").textContent = t(
      currentPage && awaitingLead ? "trailPageAwaiting" : reached ? "trailPageReached" : "trailPageActive", {
      page: viewedStage + 1, place: currentPage && awaitingLead ? trail.stages[trail.index].name
        : reached ? trail.stages[viewedStage].name : "",
    }) + (knownDestination && !awaitingLead && !reached
      ? ` — ${trail.stages[viewedStage].name}` : "");
    setFeedback(document.querySelector("#trail-page-status"), reached ? "success" : "");
    renderStory(state);
    document.querySelector("#parent-story").hidden = section !== "past" || !trail.story;
    const modern = trail.version === 2;
    document.querySelector("#trail-save-status").textContent = current.saveStatus ?? "";
    document.querySelector("#trail-title").textContent = t(trail.completed ? "trailReunionTitle" : "trailTitle");
    document.querySelector("#trail-intro").textContent = t("trailReminderIntro", { parent: trail.parentName });
    const local = trail.stages.some(stage => stage.geonameId !== undefined);
    document.querySelector("#trail-catalogue-credit").hidden = !local;
    document.querySelector("#trail-target").textContent = currentPage
      ? awaitingLead ? t("trailPageAwaiting", { page: viewedStage + 1, place: trail.stages[trail.index].name })
        : trailReminder(state, t)
      : t("trailPageReached", { page: viewedStage + 1, place: trail.stages[viewedStage].name });
    action.disabled = blocked || !atTrailTarget(state);
    action.hidden = modern;
    actionCost.hidden = modern;
    action.textContent = t(trail.index === trail.stages.length - 1 ? "trailMeet" : "trailInterview");
    const history = document.querySelector("#trail-history");
    history.replaceChildren();
    const records = trailPageRecords(state, viewedStage);
    const latestClue = records.find(record => record.kind !== "arrival" && record.value.elapsedMinutes !== undefined);
    document.querySelector("#trail-evidence-summary").textContent = t(
      records.length ? "trailEvidenceOrder" : section === "past" ? "trailArchiveEmpty" : "trailEvidenceEmpty");
    for (const record of records) {
      const item = document.createElement("li");
      const { value: facts, index } = record;
      const date = document.createElement("time");
      date.className = "trail-entry-date";
      date.textContent = trailEntryDate(state, facts.elapsedMinutes, document.documentElement.lang, t);
      if (facts.elapsedMinutes !== undefined) date.dateTime =
        new Date(state.startedAt + facts.elapsedMinutes * 60_000).toISOString();
      item.append(date);
      if (record === latestClue) paragraph(item, t("trailLatestRecord"), "success");
      paragraph(item, t("trailEvidenceFor", { page: viewedStage + 1 }));
      if (record.kind === "history") {
        if (facts.next && modern) {
          const progressive = trail.exploration && index >= trail.exploration.firstStage;
          paragraph(item, `${t(progressive && facts.clueKind === "photo" ? "fieldClue.photo" : `clueFound.${facts.clueKind}`)} — ${t(progressive ? "fieldClueAt" : "clueHistory", {
            place: facts.place, next: facts.next.name,
          })}`);
          if (!progressive) paragraph(item, parentClueText(state, {
            kind: facts.clueKind, step: index, nextName: facts.next.name, pending: false,
          }, t));
          else if (parentIntimacy(state) && ["discuss", "buy"].includes(facts.clueKind)) {
            paragraph(item, intimateWitness(state, index, t));
          }
          if (!progressive && facts.clueKind === "photo") photoButton(item, state, viewedStage);
        }
        else if (facts.next) paragraph(item, t("trailDialogue", {
          place: facts.place, next: facts.next.name,
          parent: facts.parentName,
        }));
        else paragraph(item, t("trailReunion", { parent: facts.parentName }));
      } else if (record.kind === "discovery") {
        paragraph(item, t(`clueFound.${facts.kind}`));
        paragraph(item, parentClueText(state, facts, t));
        if (facts.kind === "photo") photoButton(item, state, viewedStage);
      } else if (record.kind === "opening") {
        paragraph(item, t("trailOpeningClueTitle"));
        paragraph(item, openingClueText(state, t));
      } else if (record.kind === "dream") {
        paragraph(item, t("trailDreamTitle"));
        paragraph(item, trailDreamText(facts, t,
          narrative?.snapshot(state, LOST_PLAYER_DREAM, trailDreamVariant(state, facts)),
          document.documentElement.lang));
        paragraph(item, t("fieldRecordedAt", {
          col: facts.col, row: facts.row, minutes: Math.round(facts.elapsedMinutes),
        }));
      } else if (record.kind === "hint") {
        const hint = facts;
        paragraph(item, t("fieldEvidence"));
        paragraph(item, fieldClueText(state, hint, t));
        paragraph(item, t("fieldRecordedAt", {
          col: hint.col, row: hint.row, minutes: Math.round(hint.elapsedMinutes),
        }));
        if (hint.kind === "photo") photoButton(item, state, hint.stage);
      } else if (record.kind === "sign") {
        const sign = facts;
        paragraph(item, t("fieldSignTitle"));
        paragraph(item, t("fieldSign", { parent: trail.parentName }), "success");
        paragraph(item, t("fieldRecordedAt", {
          col: sign.col, row: sign.row, minutes: Math.round(sign.elapsedMinutes),
        }));
      } else if (record.kind === "report") {
        paragraph(item, t("fieldSuggestionTitle"));
        paragraph(item, reportText(facts));
      } else if (record.kind === "rumor") {
        const branch = trail.story.falseLeads.find(entry => entry.stage === facts.stage);
        paragraph(item, t("parentStory.falseLead", {
          traveler: branch.traveler, place: trail.stages[facts.stage].name,
          next: trail.exploration && facts.stage >= trail.exploration.firstStage
            ? vagueLead(state, facts.stage + 1, t) : trail.stages[facts.stage + 1].name,
        }));
      } else {
        paragraph(item, t("trailPageReached", { page: viewedStage + 1,
          place: trail.stages[viewedStage].name }), "success");
      }
      history.append(item);
    }
    const actions = document.querySelector("#trail-actions");
    const socialActions = document.querySelector("#dialogue-parent");
    if (socialActions) {
      socialActions.replaceChildren();
      socialActions.append(action, actionCost);
    }
    actions.hidden = !currentPage;
    action.hidden = modern;
    actionCost.hidden = modern;
    actions.replaceChildren();
    if (awaitingLead && !atTrailTarget(state)) paragraph(actions, t("clueTravelFirst"));
    if (modern && !atTrailTarget(state) && !trail.completed && !trail.exploration) paragraph(actions, t("clueTravelFirst"));
    if (fieldSearchAvailable(state, current.cell) && !atTrailTarget(state) && !awaitingLead) {
      const item = document.createElement("div"), button = document.createElement("button");
      const rules = fieldSearchRules(state);
      button.id = "clue-field-search";
      button.type = "button";
      button.textContent = t(searching ? "clueSearchLoading" : "clueSearch");
      button.disabled = blocked || searching || !state.serverJourney;
      const help = document.createElement("details"), summary = document.createElement("summary");
      summary.textContent = t("fieldSearchHelp");
      help.className = "window-help-text";
      help.append(summary);
      paragraph(help, t("fieldSearchCosts", rules));
      paragraph(help, t("fieldSearchSupport"));
      if (state.pressures) paragraph(help, t(`fieldCooling.${witnessCooling(state)}`));
      item.append(button);
      paragraph(item, t("fieldSearchCostSummary", rules));
      item.append(help);
      if (!state.serverJourney) paragraph(item, t("fieldSearchServer"), "", "technical-text");
      const last = trail.exploration.lastSearch;
      if (last?.stage === trail.index) {
        if (last.destinationBased) paragraph(item, t("fieldDestinationSearch"), "", "window-help-text");
        paragraph(item, t(`fieldOutcome.${last.repeated ? "repeated" : last.outcome}`, last),
          !last.repeated && ["found", "sign"].includes(last.outcome) ? "success" : "failure");
        if (last.outcome === "nothing") paragraph(item, t("fieldNothingAdvice"), "", "window-help-text");
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
      actions.append(item);
    }
    const available = clueActions(state);
    const options = searchClueOptions(state, current.cell, current.info, current.data)
      .filter(kind => !["discuss", "buy"].includes(kind));
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
          const found = await prepareClueSearch(state, current.cell, current.info, current.data, availablePhoto, Math.random, options);
          if (generation !== searchGeneration) return;
          const latest = context();
          if (!latest || latest.blocked || latest.state !== state) return;
          preparedPhoto = found.content ? { step: state.trail.index, content: found.content } : undefined;
          photoUnavailable = found.photoUnavailable;
          if (discover(found.kind)) section = "current";
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
    for (const kind of available.filter(kind => ["discuss", "buy", "directions", "rumor"].includes(kind))) {
      const rule = CLUE_ACTIONS[kind];
      const button = document.createElement("button");
      button.id = `clue-${kind}`;
      button.type = "button";
      button.textContent = t(`clueAction.${kind}`);
      button.disabled = blocked || searching;
      button.addEventListener("click", () => {
        document.querySelector("#trail-action-error").textContent = "";
        if (discover(kind)) section = "current";
        localize();
      });
      const item = document.createElement("div");
      item.append(button);
      paragraph(item, t("clueCost", { minutes: rule.minutes, fatigue: rule.fatigue, kcal: rule.kcal,
        money: ((rule.mealUnits ? marketPrice(current.cell, rule.mealUnits, current.data, current.info).cents : 0) / 100).toFixed(2) }));
      (socialActions ?? actions).append(item);
    }
    const discovery = trail.discovery;
    document.querySelector("#trail-discovery").hidden = true;
    if (discovery) {
      if (socialActions && parentIntimacy(state) && ["discuss", "buy"].includes(discovery.kind)) {
        paragraph(socialActions, `${discovery.place} · ${
          trailEntryDate(state, discovery.elapsedMinutes, document.documentElement.lang, t)}`);
        paragraph(socialActions, parentClueText(state, discovery, t));
      }
      document.querySelector("#trail-discovery-date").textContent =
        trailEntryDate(state, discovery.elapsedMinutes, document.documentElement.lang, t);
      document.querySelector("#trail-discovery-title").textContent =
        t(discovery.kind === "photo" && trail.exploration ? "fieldClue.photo" : `clueFound.${discovery.kind}`);
      document.querySelector("#trail-discovery-text").textContent =
        `${photoUnavailable ? `${t("cluePhotoFallback")} ` : ""}${parentClueText(state, discovery, t)}`;
    }
    const last = trail.exploration?.lastSearch;
    const latestPhoto = trail.exploration?.hints.find(h => h.kind === "photo" &&
      h.elapsedMinutes === last?.elapsedMinutes);
    if (section !== "actions" && (viewedFieldPhoto !== undefined || currentPage && latestPhoto && latestPhoto.stage === viewedStage &&
        last.stage === trail.index && last.outcome === "found")) {
      photo.hidden = false;
      void renderPhoto(state, { step: viewedFieldPhoto ?? latestPhoto.stage }, Boolean(trail.exploration), true);
    } else if (section !== "actions" && discovery?.kind === "photo" && currentPage &&
        discovery.step + 1 === viewedStage) {
      photo.hidden = false;
      void renderPhoto(state, discovery, Boolean(trail.exploration), false);
    } else {
      photo.hidden = true;
      clearPhoto();
    }
  }
  function open() {
    if (!context()?.state.trail || document.querySelector("dialog[open]")) return;
    section = "current";
    dialog.showModal();
    localize();
  }
  function changePage(stage) {
    viewedStage = stage;
    section = stage === lastActiveStage ? "current" : "past";
    viewedFieldPhoto = undefined;
    localize();
  }
  document.querySelector("#trail-page-previous").addEventListener("click", () => {
    if (viewedStage > 0) changePage(viewedStage - 1);
  });
  document.querySelector("#trail-page-next").addEventListener("click", () => {
    if (viewedStage < lastActiveStage) changePage(viewedStage + 1);
  });
  document.querySelector("#trail-page-current").addEventListener("click", () => changePage(lastActiveStage));
  for (const name of ["current", "past"]) {
    document.querySelector(`#trail-section-${name}`).addEventListener("click", () => {
      section = name;
      viewedStage = name === "past" ? Math.max(0, lastActiveStage - 1) : lastActiveStage;
      viewedFieldPhoto = undefined;
      localize();
    });
  }
  ask.addEventListener("click", () => {
    const current = context();
    if (!current || current.blocked || current.state.ended) return;
    directionsTown = undefined;
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
  document.querySelector("#hint-town").addEventListener("change", event => {
    selectedTownKey = event.target.value;
  });
  document.querySelector("#hint-town-ask").addEventListener("click", () => {
    const current = context();
    if (!current || current.blocked || current.state.ended || searching) return;
    const town = questDirectionTargets(current.state).find(town => town.key === selectedTownKey);
    if (!town) {
      document.querySelector("#hint-action-error").textContent = t("hintTownUnavailable");
      return;
    }
    document.querySelector("#hint-action-error").textContent = "";
    const outcome = askDirections(town);
    if (!outcome) return;
    directionsTown = town;
    directionsOutcome = outcome;
    localize();
  });
  action.addEventListener("click", () => {
    if (!interview()) return;
    section = "current";
    localize();
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
    viewedStage = lastActiveStage = pageJourney = undefined;
    section = "current";
    fieldPhotoUnavailable = false;
    photoUnavailable = false;
    dialog.close();
    hintDialog.close();
    directionsOutcome = directionsTown = selectedTownKey = undefined;
    clearPhoto();
  } };
}
