const STORE = "photos";

import { setFeedback, setGenerating } from "./feedback.mjs";
import { createTarotJournalPinner, tarotArtwork, tarotJournalEntry } from "./tarot-cards.mjs";
import { journeyEventJournalEntry } from "./journey-event-journal.mjs";
import { journeyStats } from "./journey-stats.mjs";
import { notebookPdf, downloadNotebookPdf } from "./notebook-pdf.mjs";
import { journeyMapView, journeyMapDescription, drawJourneyMap } from "./journey-map.mjs";
import { notebookCover } from "./notebook-cover.mjs";
import { renderDiscoveryNotebook, discoveryNotebookEntries } from "./discovery-ui.mjs";
import { createJournalIllustrator, illustrationScenes, COVER_ART_ID } from "./journal-art.mjs";
import { createLiveNarrative, JOURNAL_SUBTITLE } from "./live-narrative.mjs";
import { archivedJourneys } from "./journey-save.mjs";
import { translate } from "./i18n.mjs";

export async function biographyJournalEntries(state, wording, generated = true) {
  if (!wording || !["fr", "en"].every(language =>
    typeof wording[language] === "string" && wording[language].trim() && wording[language].length <= 1800)) {
    throw new Error("Invalid journal biography.");
  }
  const digest = await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(JSON.stringify([wording.fr, wording.en])));
  const revision = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return ["fr", "en"].map(language => ({
    ...tarotArtwork(state.birthCard ?? null),
    id: `biography:${notebookScope(state)}:${revision}:${language}`,
    title: `${translate(language, "openingStoryTitle")} · ${language.toUpperCase()}` +
      (generated ? ` · ${translate(language, "journalGeneratedText")}` : ""),
    note: wording[language],
  }));
}

export function validateJournalPhoto(photo) {
  if (!photo || typeof photo.sourceUrl !== "string" || typeof photo.licenseUrl !== "string" ||
      ![photo.sourceUrl, photo.licenseUrl].every(url => {
        try { return ["https:", "http:"].includes(new URL(url).protocol); }
        catch (error) { if (!(error instanceof TypeError)) throw error; return false; }
      }) || !["title", "attribution", "license"].every(k =>
        typeof photo[k] === "string" && photo[k].trim()) ||
      !(photo.blob instanceof Blob) || !photo.blob.type.startsWith("image/") ||
      !photo.blob.size || photo.blob.size > 12_000_000) {
    throw new Error("Invalid photo or missing source/license for journal.");
  }
}

export function notebookScope(state) {
  return state.serverJourney?.id ?? `local:${state.startedAt}`;
}

export function createPhotoJournalStore(index = indexedDB) {
  let database;
  function db() {
    database ??= new Promise((resolve, reject) => {
      const request = index.open("arcane-photo-journal", 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); database = undefined; };
        resolve(request.result);
      };
      request.onerror = () => { database = undefined; reject(request.error); };
      request.onblocked = () => {
        database = undefined;
        reject(new Error("Journal database upgrade blocked by another tab."));
      };
    });
    return database;
  }
  async function transaction(mode, work) {
    const connection = await db();
    return new Promise((resolve, reject) => {
      const tx = connection.transaction(STORE, mode);
      let result;
      work(tx.objectStore(STORE), value => { result = value; });
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new Error("Journal transaction aborted."));
      tx.onerror = () => reject(tx.error ?? new Error("Journal storage failed."));
    });
  }
  function scoped(owner) {
    const key = id => JSON.stringify([owner, id]);
    return {
    async scope(nextOwner, { adoptLegacy = false } = {}) {
      if (adoptLegacy) await transaction("readwrite", store => {
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (!cursor.value.owner) {
            store.put({ ...cursor.value, owner: nextOwner, entryId: cursor.key },
              JSON.stringify([nextOwner, cursor.key]));
            cursor.delete();
          }
          cursor.continue();
        };
      });
      return scoped(nextOwner);
    },
    list() {
      return transaction("readonly", (store, done) => {
        const entries = [], request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { done(entries.sort((a, b) => a.pinnedAt.localeCompare(b.pinnedAt))); return; }
          if (cursor.value.owner === owner && cursor.value.entryId !== COVER_ART_ID) entries.push({
            id: cursor.value.entryId, pinnedAt: cursor.value.pinnedAt });
          cursor.continue();
        };
      });
    },
    get(id) {
      return transaction("readonly", (store, done) => {
        const request = store.get(key(id));
        request.onsuccess = () => done(request.result);
      });
    },
    pin(photo, { unannotated = false, id = photo.sourceUrl, caption = "", note = "" } = {}) {
      validateJournalPhoto(photo);
      if (typeof id !== "string" || !id || typeof caption !== "string" ||
          typeof note !== "string" || note.length > 2000) throw new Error("Invalid journal entry.");
      return transaction("readwrite", (store, done) => {
        const request = store.get(key(id));
        request.onsuccess = () => {
          if (request.result) { done(false); return; }
          store.add({ blob: photo.blob, title: photo.title, sourceUrl: photo.sourceUrl,
            attribution: photo.attribution, license: photo.license, licenseUrl: photo.licenseUrl,
            owner, entryId: id, unannotated, caption, note, pinnedAt: new Date().toISOString() }, key(id));
          done(true);
        };
      });
    },
    note(id, note) {
      if (typeof note !== "string" || note.length > 2000) throw new Error("Journal note is too long.");
      return transaction("readwrite", (store, done) => {
        const request = store.get(key(id));
        request.onsuccess = () => {
          if (!request.result) { store.transaction.abort(); return; }
          store.put({ ...request.result, note }, key(id));
          done(true);
        };
      });
    },
    remove: id => transaction("readwrite", (store, done) => { store.delete(key(id)); done(true); }),
    };
  }
  return scoped("unassigned");
}

export function setupPhotoJournal(t, { store = createPhotoJournalStore(),
  makePdf = notebookPdf, downloadPdf = downloadNotebookPdf, narrative = createLiveNarrative() } = {}) {
  const rootStore = store;
  let liveStore = store, readOnly = false;
  const dialog = document.querySelector("#photo-journal-dialog");
  const pages = document.querySelector("#journal-pages");
  const status = document.querySelector("#journal-status");
  const previous = document.querySelector("#journal-previous");
  const next = document.querySelector("#journal-next");
  const photosButton = document.querySelector("#journal-photos-page");
  const coverButton = document.querySelector("#journal-cover-page");
  let covering = false;
  const statsButton = document.querySelector("#journal-stats-page");
  const mapButton = document.querySelector("#journal-map-page");
  const exportButton = document.querySelector("#journal-export-pdf");
  const archives = document.createElement("select");
  archives.id = "journal-archives";
  exportButton.insertAdjacentElement?.("afterend", archives);
  archives.addEventListener("change", async () => {
    if (!archives.value) return;
    try {
      const save = archivedJourneys(localStorage).find(save =>
        (save.state.serverJourney?.id ?? String(save.state.startedAt)) === archives.value);
      if (!save) throw new Error("Archived notebook is unavailable.");
      const photos = await api.snapshot(save.state);
      await api.showAbandoned(photos, [
        `${save.state.name ?? t("unnamedCharacter")} · ${save.savedAt}`,
        ...discoveryNotebookEntries(save.state, t).map(record => `${record.context} — ${record.text}`),
      ], t("journalArchives"));
    } catch (reason) { failure(reason); }
  });
  let exporting = false, exported = false, exportEpoch = 0;
  let abandonedClues = [];
  let foreignTitle;
  let statsContext = null, statistics = false;
  let mapping = false, animation;
  function stopAnimation() {
    if (animation !== undefined) cancelAnimationFrame(animation);
    animation = undefined;
  }
  let entries = [], spread = 0, generation = 0, loading = false, error = "";
  const urls = new Set();
  const drafts = new Map();
  const tarotPins = new WeakMap();
  let scope = "unassigned";
  let artStatus = "", artError = "";
  function coverContext() {
    return { ...statsContext, coverSubtitle: narrative.snapshot(statsContext.state, JOURNAL_SUBTITLE) };
  }
  narrative.subscribe(() => {
    if (dialog.open && covering && !readOnly && statsContext) void render();
  });
  const art = createJournalIllustrator({
    onStatus(status, message = "") {
      artStatus = status; artError = message;
      if (dialog.open && covering && !readOnly) void render();
    },
    async onAsset(entry, blob, owner) {
      const target = rootStore.scope ? await rootStore.scope(notebookScope(owner)) : rootStore;
      const id = entry.key === "cover" ? COVER_ART_ID : `journal-art:day:${entry.key}`;
      if (await target.get(id)) return;
      const title = entry.key === "cover" ? "Personal dream cover / Couverture onirique personnelle"
        : `${entry.key} (UTC) · Illustrated day / Journée illustrée`;
      const brief = entry.brief;
      const note = `Symbolic AI illustration, not evidence / Illustration IA symbolique, pas un indice. ` +
        `Tarot: ${brief.birth} / ${brief.daily}. ` +
        `Scenery / Décor: ${brief.scenes.join(", ") || "—"}. ` +
        `Recorded activities / Activités relevées: ${brief.activities.join(", ") || "—"}. ` +
        (brief.partial ? "Partial observation / Observation partielle." : "");
      await target.pin({
        blob, title, sourceUrl: "https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/stable-diffusion-xl/",
        attribution: "AI-generated / Généré par IA", license: "CreativeML Open RAIL++-M",
        licenseUrl: entry.license,
      }, { id, caption: title, note });
      if (scope === notebookScope(owner) && dialog.open && !readOnly) await load();
    },
  });
  const pendingPins = new Set();
  const failedPins = new Map();
  const biographyPins = new Map();
  function revoke() {
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
  }
  function failure(reason) {
    console.error("Photo journal failed:", reason);
    error = reason.message;
    status.textContent = t("journalError", { error });
    setFeedback(status, "failure");
  }
  function localize() {
    archives.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = t("journalArchives");
    archives.append(placeholder);
    archives.setAttribute?.("aria-label", t("journalArchives"));
    try {
      const saved = globalThis.localStorage ? archivedJourneys(localStorage) : [];
      archives.hidden = !saved.length;
      for (const save of saved) {
        const option = document.createElement("option");
        option.value = save.state.serverJourney?.id ?? String(save.state.startedAt);
        option.textContent = `${save.state.name ?? t("unnamedCharacter")} · ${save.savedAt}`;
        archives.append(option);
      }
    } catch (reason) {
      console.error("Archived notebooks unavailable:", reason);
      error = reason.message;
    }
    try {
      renderDiscoveryNotebook(document.querySelector("#journal-discovery"), readOnly ? null : statsContext?.state, t);
    } catch (reason) {
      failure(reason);
    }
    previous.textContent = t("journalPrevious");
    next.textContent = t("journalNext");
    document.querySelector("#journal-retry").textContent = t("journalRetry");
    photosButton.textContent = t("journalPhotosPage");
    coverButton.textContent = t("journalCoverPage");
    coverButton.hidden = readOnly;
    coverButton.disabled = covering || !statsContext;
    statsButton.textContent = t("journalStatsPage");
    mapButton.textContent = t("journalMapPage");
    photosButton.hidden = statsButton.hidden = mapButton.hidden = readOnly;
    photosButton.disabled = !statistics && !mapping && !covering;
    statsButton.disabled = statistics || !statsContext;
    mapButton.disabled = mapping || !statsContext;
    exportButton.textContent = t(exporting ? "journalPdfPreparing" : "journalExportPdf");
    exportButton.disabled = exporting || loading;
    previous.disabled = covering || mapping || statistics || loading || spread === 0;
    next.disabled = covering || mapping || statistics || loading || (spread + 1) * 2 >= entries.length;
    document.querySelector("#journal-count").textContent =
      covering ? t("journalCoverPage") : mapping ? t("journalMapPage") : statistics ? t("journalStatsPage") :
        t("journalCount", { spread: spread + 1, total: Math.max(1, Math.ceil(entries.length / 2)) });
    status.textContent = error ? t("journalError", { error }) : exporting ? t("journalPdfPreparing") :
      loading ? t("journalLoading") : exported ? t("journalPdfReady") : "";
    setFeedback(status, error ? "failure" : exported ? "success" : "");
  }
  async function render() {
    const current = ++generation;
    stopAnimation();
    loading = true;
    error = "";
    localize();
    try {
      pages.dataset.statistics = String(statistics);
      pages.dataset.mapping = String(mapping);
      pages.dataset.covering = String(covering);
      if (covering && statsContext && !readOnly) {
        revoke();
        const cover = notebookCover(coverContext(), t, document.documentElement.lang);
        const page = document.createElement("section");
        page.className = "notebook-page journal-cover";
        const title = document.createElement("h3"), subtitle = document.createElement("p");
        title.textContent = cover.title;
        subtitle.className = "journal-cover-subtitle";
        subtitle.textContent = cover.subtitle;
        page.append(title, subtitle);
        const wordingStatus = document.createElement("p");
        wordingStatus.className = "journal-cover-wording-status";
        wordingStatus.textContent = narrative.status(statsContext.state, JOURNAL_SUBTITLE,
          document.documentElement.lang);
        setGenerating(wordingStatus, narrative.pending?.(statsContext.state, JOURNAL_SUBTITLE));
        page.append(wordingStatus);
        const artwork = await store.get(COVER_ART_ID);
        if (current !== generation || !dialog.open) return;
        if (artwork) {
          const image = document.createElement("img");
          const url = URL.createObjectURL(artwork.blob);
          urls.add(url);
          image.src = url;
          image.alt = t("journalArtCoverAlt");
          image.className = "journal-cover-art";
          image.addEventListener("error", () => failure(new Error(t("journalImageError"))));
          page.append(image);
          const credit = document.createElement("a");
          credit.href = artwork.licenseUrl;
          credit.className = "technical-text";
          credit.textContent = `${artwork.attribution} · ${artwork.license}`;
          credit.rel = "noopener noreferrer"; credit.target = "_blank";
          page.append(credit);
        }
        if (artStatus) {
          const progress = document.createElement("p");
          progress.textContent = t(`journalArt.${artStatus}`, { error: artError });
          progress.className = artStatus === "pending" ? "" : "technical-text";
          setFeedback(progress, artStatus === "failed" ? "failure" : "");
          page.append(progress);
        }
        for (const row of cover.rows) {
          const paragraph = document.createElement("p");
          paragraph.textContent = `${row.label} : ${row.value}`;
          page.append(paragraph);
        }
        pages.replaceChildren(page);
        return;
      }
      if (mapping && statsContext && !readOnly) {
        revoke();
        pages.replaceChildren();
        const view = journeyMapView(statsContext.state, statsContext.cellSizeMeters);
        if (statsContext.mapTerrain) view.terrain = await statsContext.mapTerrain(view);
        if (current !== generation || !dialog.open) return;
        const page = document.createElement("section");
        page.className = "notebook-page journal-map";
        const title = document.createElement("h3");
        title.textContent = t("journalMapPage");
        const canvas = document.createElement("canvas");
        canvas.className = "journey-map-canvas";
        canvas.role = "img";
        canvas.ariaLabel = t("journalMapPage");
        drawJourneyMap(canvas, view, t);
        const note = document.createElement("p");
        note.textContent = journeyMapDescription(view, t);
        note.className = "window-help-text";
        const legend = document.createElement("ol");
        for (const stop of view.stops) {
          const item = document.createElement("li");
          item.textContent = stop.name ?? t(`journalMap.${stop.kind}`);
          legend.append(item);
        }
        const replay = document.createElement("button");
        replay.type = "button";
        replay.textContent = t("journalMapReplay");
        replay.disabled = view.points.length < 2;
        replay.addEventListener("click", () => {
          stopAnimation();
          if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            drawJourneyMap(canvas, view, t);
            return;
          }
          const started = performance.now();
          const frame = now => {
            const progress = Math.min(1, (now - started) / 4000);
            drawJourneyMap(canvas, view, t, progress);
            animation = progress < 1 ? requestAnimationFrame(frame) : undefined;
          };
          animation = requestAnimationFrame(frame);
        });
        page.append(title, canvas, note, legend, replay);
        pages.append(page);
        return;
      }
      if (statistics && statsContext && !readOnly) {
        revoke();
        pages.replaceChildren();
        const page = document.createElement("section");
        page.className = "notebook-page journal-statistics";
        const title = document.createElement("h3");
        title.textContent = t("journalStatsPage");
        page.append(title);
        const groups = document.createElement("div");
        groups.className = "journal-stats-groups";
        for (const group of journeyStats(statsContext, t, document.documentElement.lang)) {
          const section = document.createElement("section"), heading = document.createElement("h4");
          heading.textContent = group.title;
          section.append(heading);
          const list = document.createElement("dl");
          for (const row of group.rows) {
            const label = document.createElement("dt"), value = document.createElement("dd");
            label.textContent = row.label;
            value.textContent = row.value;
            list.append(label, value);
          }
          section.append(list);
          groups.append(section);
        }
        const note = document.createElement("p");
        note.textContent = t("journalStatsNote");
        note.className = "window-help-text";
        page.append(groups, note);
        pages.append(page);
        return;
      }
      const photos = await Promise.all(entries.slice(spread * 2, spread * 2 + 2).map(entry => store.get(entry.id)));
      if (current !== generation || !dialog.open) return;
      revoke();
      pages.replaceChildren();
      for (let side = 0; side < 2; side++) {
        const target = store;
        const page = document.createElement("section");
        page.className = "notebook-page";
        const photo = photos[side], entry = entries[spread * 2 + side];
        if (!photo) {
          if (entry) throw new Error("Pinned photo is missing. Reopen the journal to refresh.");
          const empty = document.createElement("p");
          empty.className = "notebook-empty";
          empty.textContent = t("journalEmpty");
          page.append(empty);
        } else {
          validateJournalPhoto(photo);
          if (photo.caption) {
            const title = document.createElement("h3");
            title.textContent = photo.caption;
            page.append(title);
          }
          const prose = /^(?:biography|event):/.test(entry.id) ? document.createElement("p") : null;
          if (prose) {
            prose.className = "journal-narrative-text";
            prose.textContent = drafts.get(entry.id) ?? photo.note;
            page.append(prose);
          }
          const frame = document.createElement("figure");
          frame.className = "journal-print";
          const image = document.createElement("img");
          const url = URL.createObjectURL(photo.blob);
          urls.add(url);
          image.src = url;
          image.alt = photo.unannotated ? t("fieldClue.photo") : photo.title;
          image.onerror = () => {
            image.onerror = null;
            failure(new Error(t("journalImageError")));
          };
          const caption = document.createElement("figcaption");
          const label = document.createElement("label");
          label.textContent = t("journalNote");
          const note = document.createElement("textarea");
          note.value = drafts.get(entry.id) ?? photo.note;
          note.placeholder = t("journalNotePlaceholder");
          note.maxLength = 2000;
          note.rows = 3;
          note.disabled = readOnly;
          label.append(note);
          const save = document.createElement("button");
          save.type = "button";
          save.hidden = readOnly;
          save.textContent = t("journalSaveNote");
          const noteStatus = document.createElement("span");
          noteStatus.role = "status";
          async function saveNote() {
            const value = note.value;
            drafts.set(entry.id, value);
            save.disabled = true;
            try {
              await target.note(entry.id, value);
              if (drafts.get(entry.id) === value) drafts.delete(entry.id);
              noteStatus.textContent = t("journalNoteSaved");
              setFeedback(noteStatus, "success");
            } catch (reason) { failure(reason); }
            finally { save.disabled = false; }
          }
          note.addEventListener("input", () => {
            drafts.set(entry.id, note.value);
            if (prose) prose.textContent = note.value;
            noteStatus.textContent = t("journalNoteUnsaved");
            setFeedback(noteStatus);
          });
          note.addEventListener("change", () => { void saveNote(); });
          save.addEventListener("click", () => { void saveNote(); });
          if (prose) {
            const editor = document.createElement("details"), summary = document.createElement("summary");
            summary.textContent = t("journalNote");
            editor.hidden = readOnly;
            editor.append(summary, label, save, noteStatus);
            caption.append(editor);
          } else caption.append(label, save, noteStatus);
          frame.append(image, caption);
          page.append(frame);
          const credit = document.createElement("p");
          credit.className = "journal-credit technical-text";
          credit.textContent = `${photo.attribution} · ${photo.license} `;
          for (const [href, text] of [[photo.sourceUrl, t("journalSource")], [photo.licenseUrl, t("contentLicense")]]) {
            const link = document.createElement("a");
            link.href = href; link.textContent = text; link.target = "_blank"; link.rel = "noopener noreferrer";
            credit.append(link, " ");
          }
          page.append(credit);
          const remove = document.createElement("button");
          remove.type = "button";
          remove.hidden = readOnly;
          remove.textContent = t("journalUnpin");
          remove.addEventListener("click", async () => {
            if (!confirm(t("journalUnpinConfirm"))) return;
            remove.disabled = true;
            try { await target.remove(entry.id); drafts.delete(entry.id); await load(); }
            catch (reason) { failure(reason); remove.disabled = false; }
          });
          page.append(remove);
        }
        pages.append(page);
      }
    } catch (reason) {
      if (current === generation) failure(reason);
    } finally {
      if (current === generation) { loading = false; localize(); }
    }
  }
  async function load() {
    const current = ++generation;
    loading = true; error = ""; localize();
    try {
      const result = await store.list();
      if (current !== generation || !dialog.open) return;
      entries = result;
      spread = Math.min(spread, Math.max(0, Math.ceil(entries.length / 2) - 1));
      await render();
    } catch (reason) {
      if (current === generation) { loading = false; failure(reason); localize(); }
    }
  }
  document.querySelector("#open-journal").addEventListener("click", () => {
    if (document.querySelector("dialog[open]")) return;
    covering = Boolean(statsContext);
    statistics = mapping = false;
    dialog.showModal();
    void load();
  });
  photosButton.addEventListener("click", () => {
    if (readOnly) return;
    statistics = false;
    mapping = false;
    covering = false;
    void load();
  });
  statsButton.addEventListener("click", () => {
    if (readOnly || !statsContext) return;
    statistics = true;
    mapping = false;
    covering = false;
    void render();
  });
  mapButton.addEventListener("click", () => {
    if (readOnly || !statsContext) return;
    mapping = true;
    statistics = false;
    covering = false;
    void render();
  });
  coverButton.addEventListener("click", () => {
    if (readOnly || !statsContext) return;
    covering = true;
    statistics = mapping = false;
    void render();
  });
  previous.addEventListener("click", () => { if (!statistics && !loading && spread > 0) { spread--; void render(); } });
  next.addEventListener("click", () => {
    if (!statistics && !loading && (spread + 1) * 2 < entries.length) { spread++; void render(); }
  });
  document.querySelector("#journal-retry").addEventListener("click", () => {
    if (!loading) { art.refresh(); void load(); }
  });
  exportButton.addEventListener("click", async () => {
    if (exporting || loading) return;
    exporting = true;
    exported = false;
    error = "";
    const target = store, owner = scope, foreign = readOnly, epoch = exportEpoch;
    const noteDrafts = [...drafts];
    const clues = [...abandonedClues];
    const stillCurrent = () => exportEpoch === epoch && store === target &&
      scope === owner && readOnly === foreign && dialog.open;
    localize();
    try {
      if (!foreign && statsContext) {
        clues.push(...discoveryNotebookEntries(statsContext.state, t)
          .map(record => `${record.context} — ${record.text}`));
      }
      const groups = !foreign && statsContext
        ? journeyStats(statsContext, t, document.documentElement.lang) : [];
      const cover = !foreign && statsContext ? notebookCover(coverContext(), t, document.documentElement.lang) : null;
      if (cover) {
        const artwork = await target.get(COVER_ART_ID);
        if (artwork) cover.artwork = artwork;
      }
      const route = !foreign && statsContext
        ? journeyMapView(statsContext.state, statsContext.cellSizeMeters) : null;
      if (route && statsContext.mapTerrain) route.terrain = await statsContext.mapTerrain(route);
      await Promise.all(pendingPins);
      if (!stillCurrent()) return;
      const failed = [...failedPins.values()].find(entry => entry.scope === owner);
      if (!foreign && failed) throw new Error(failed.message);
      if (!foreign) {
        for (const [id, note] of noteDrafts) {
          await target.note(id, note);
          if (stillCurrent() && drafts.get(id) === note) drafts.delete(id);
        }
      }
      const listed = await target.list();
      const photos = [];
      for (const entry of listed) {
        const photo = await target.get(entry.id);
        validateJournalPhoto(photo);
        photos.push({ ...photo });
      }
      if (!stillCurrent()) return;
      const pdf = await makePdf({ title: foreign ? foreignTitle ?? t("journalAbandonedTitle") : t("journalTitle"),
        photos, groups, clues, route, cover, t });
      if (!stillCurrent()) return;
      downloadPdf(pdf);
      exported = true;
    } catch (reason) {
      if (stillCurrent()) failure(reason);
    } finally {
      exporting = false;
      localize();
    }
  });
  dialog.addEventListener("close", () => {
    exportEpoch++;
    stopAnimation();
    generation++; loading = false; revoke(); pages.replaceChildren();
    store = liveStore;
    readOnly = false;
    statistics = false;
    mapping = false;
    covering = false;
    abandonedClues = [];
    exported = false;
    document.querySelector("#journal-abandoned-clues")?.replaceChildren();
  });
  const api = {
    updateStats(context) {
      const wasSpecialPage = statistics || mapping || covering;
      const unchangedMap = mapping && context?.state === statsContext?.state &&
        context?.mapTerrain === statsContext?.mapTerrain;
      statsContext = context;
      if (context) {
        narrative.prefetch(context.state, [JOURNAL_SUBTITLE]);
        try {
          art.observe(context.state, illustrationScenes(context.artTerrain, context.artWeather));
        } catch (reason) {
          console.error("Journal illustration observation failed:", reason);
          artStatus = "failed"; artError = reason.message;
        }
      }
      if (!context) statistics = mapping = covering = false;
      if (dialog.open && !readOnly) {
        if (unchangedMap) return;
        if (statistics || mapping || covering || wasSpecialPage) void render();
        else localize();
      }
    },
    async useJourney(state, adoptLegacy = false) {
      const nextScope = notebookScope(state);
      if (nextScope === scope) return;
      exportEpoch++;
      art.stop();
      narrative.reset();
      artStatus = artError = "";
      stopAnimation();
      for (const [id, note] of drafts) await liveStore.note(id, note);
      const scoped = rootStore.scope ? await rootStore.scope(nextScope, { adoptLegacy }) : rootStore;
      generation++;
      revoke();
      pages.replaceChildren();
      drafts.clear();
      entries = [];
      spread = 0;
      statistics = false;
      mapping = false;
      covering = false;
      statsContext = null;
      store = scoped;
      liveStore = scoped;
      readOnly = false;
      abandonedClues = [];
      exported = false;
      scope = nextScope;
      if (dialog.open) await load();
    },
    async snapshot(state) {
      await Promise.all(pendingPins);
      const failed = [...failedPins.values()].find(entry => entry.scope === notebookScope(state));
      if (failed) throw new Error(failed.message);
      const target = rootStore.scope ? await rootStore.scope(notebookScope(state), { adoptLegacy: true }) : rootStore;
      for (const [id, note] of drafts) if (scope === notebookScope(state)) await target.note(id, note);
      const entries = await target.list();
      const photos = await Promise.all(entries.map(async entry => ({ ...await target.get(entry.id), id: entry.id })));
      const cover = await target.get(COVER_ART_ID);
      if (cover) photos.unshift({ ...cover, id: COVER_ART_ID });
      return photos;
    },
    async showAbandoned(notebook, clues, title = t("journalAbandonedTitle")) {
      exportEpoch++;
      readOnly = true;
      statistics = false;
      mapping = false;
      covering = false;
      abandonedClues = [...clues];
      foreignTitle = title;
      exported = false;
      const evidence = document.querySelector("#journal-abandoned-clues");
      evidence.replaceChildren();
      const heading = document.createElement("h3");
      heading.textContent = title;
      evidence.append(heading);
      for (const text of clues) {
        const p = document.createElement("p");
        p.textContent = text;
        evidence.append(p);
      }
      dialog.showModal();
      const imported = new Map(notebook.map(photo => [photo.id, photo]));
      store = {
        list: async () => notebook.map(photo => ({ id: photo.id, pinnedAt: photo.pinnedAt })),
        get: async id => imported.get(id),
      };
      spread = 0;
      await load();
    },
    pinBiography(state, wording, generated = true) {
      const pinScope = notebookScope(state);
      const key = JSON.stringify([pinScope, wording, generated]);
      if (biographyPins.has(key)) return biographyPins.get(key);
      const pending = (async () => {
        const target = rootStore.scope ? await rootStore.scope(pinScope) : rootStore;
        const pin = createTarotJournalPinner(target);
        for (const entry of await biographyJournalEntries(state, wording, generated)) await pin(entry);
        failedPins.delete(key);
        if (scope === pinScope && dialog.open && !readOnly) await load();
      })();
      biographyPins.set(key, pending);
      pendingPins.add(pending);
      void pending.then(() => { pendingPins.delete(pending); }, reason => {
        pendingPins.delete(pending);
        biographyPins.delete(key);
        failedPins.set(key, { scope: pinScope, message: reason.message });
        failure(reason);
      });
      return pending;
    },
    pinTarot(container, state, role, data, wording) {
      const entry = role === "event" ? journeyEventJournalEntry(state, t, document, wording)
        : tarotJournalEntry(state, role, data, t,
          document.documentElement.lang === "en" ? "en" : "fr");
      const previous = tarotPins.get(container);
      if (previous?.id === entry.id) return;
      tarotPins.set(container, { id: entry.id });
      const pinTarot = createTarotJournalPinner(store);
      const pinScope = scope;
      const feedback = document.createElement("p"), retry = document.createElement("button");
      feedback.role = "status";
      retry.type = "button";
      retry.textContent = t("journalRetry");
      retry.hidden = true;
      container.replaceChildren(feedback, retry);
      async function save() {
        retry.hidden = true;
        feedback.className = "";
        feedback.textContent = t("journalLoading");
        setFeedback(feedback);
        try {
          await pinTarot(entry);
          failedPins.delete(entry.id);
          feedback.textContent = role === "event" ? t("journalPinned")
            : t("journalTarotPinned", { card: entry.title });
          setFeedback(feedback, "success");
        } catch (reason) {
          console.error("Could not pin notebook entry:", reason);
          failedPins.set(entry.id, { scope: pinScope, message: reason.message });
          feedback.textContent = t("journalError", { error: reason.message });
          feedback.className = "technical-text";
          setFeedback(feedback, "failure");
          retry.hidden = false;
        }
      }
      retry.addEventListener("click", () => { void save(); });
      const pending = save();
      pendingPins.add(pending);
      void pending.finally(() => pendingPins.delete(pending));
    },
    localize() { localize(); if (dialog.open) void render(); },
    pinButton(container, photo, options) {
      const target = store;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pin-photo";
      button.textContent = t("journalPin");
      const feedback = document.createElement("span");
      feedback.role = "status";
      button.addEventListener("click", async () => {
        button.disabled = true;
        feedback.className = "";
        try {
          const added = await target.pin(photo, options);
          feedback.textContent = t(added ? "journalPinned" : "journalAlreadyPinned");
          setFeedback(feedback, "success");
        } catch (reason) {
          console.error("Could not pin photo:", reason);
          feedback.textContent = t("journalError", { error: reason.message });
          feedback.className = "technical-text";
          setFeedback(feedback, "failure");
          button.disabled = false;
        }
      });
      container.append(button, feedback);
    },
  };
  return api;
}
