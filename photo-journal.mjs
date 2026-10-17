const STORE = "photos";

import { setFeedback } from "./feedback.mjs";

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
  return {
    list() {
      return transaction("readonly", (store, done) => {
        const entries = [], request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { done(entries.sort((a, b) => a.pinnedAt.localeCompare(b.pinnedAt))); return; }
          entries.push({ id: cursor.key, pinnedAt: cursor.value.pinnedAt });
          cursor.continue();
        };
      });
    },
    get(id) {
      return transaction("readonly", (store, done) => {
        const request = store.get(id);
        request.onsuccess = () => done(request.result);
      });
    },
    pin(photo, { unannotated = false } = {}) {
      validateJournalPhoto(photo);
      return transaction("readwrite", (store, done) => {
        const request = store.get(photo.sourceUrl);
        request.onsuccess = () => {
          if (request.result) { done(false); return; }
          store.add({ blob: photo.blob, title: photo.title, sourceUrl: photo.sourceUrl,
            attribution: photo.attribution, license: photo.license, licenseUrl: photo.licenseUrl,
            unannotated, note: "", pinnedAt: new Date().toISOString() }, photo.sourceUrl);
          done(true);
        };
      });
    },
    note(id, note) {
      if (typeof note !== "string" || note.length > 2000) throw new Error("Journal note is too long.");
      return transaction("readwrite", (store, done) => {
        const request = store.get(id);
        request.onsuccess = () => {
          if (!request.result) { store.transaction.abort(); return; }
          store.put({ ...request.result, note }, id);
          done(true);
        };
      });
    },
    remove: id => transaction("readwrite", (store, done) => { store.delete(id); done(true); }),
  };
}

export function setupPhotoJournal(t, { store = createPhotoJournalStore() } = {}) {
  const dialog = document.querySelector("#photo-journal-dialog");
  const pages = document.querySelector("#journal-pages");
  const status = document.querySelector("#journal-status");
  const previous = document.querySelector("#journal-previous");
  const next = document.querySelector("#journal-next");
  let entries = [], spread = 0, generation = 0, loading = false, error = "";
  const urls = new Set();
  const drafts = new Map();
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
    previous.textContent = t("journalPrevious");
    next.textContent = t("journalNext");
    document.querySelector("#journal-retry").textContent = t("journalRetry");
    previous.disabled = loading || spread === 0;
    next.disabled = loading || (spread + 1) * 2 >= entries.length;
    document.querySelector("#journal-count").textContent =
      t("journalCount", { spread: spread + 1, total: Math.max(1, Math.ceil(entries.length / 2)) });
    status.textContent = error ? t("journalError", { error }) : loading ? t("journalLoading") : "";
    setFeedback(status, error ? "failure" : "");
  }
  async function render() {
    const current = ++generation;
    loading = true;
    error = "";
    localize();
    try {
      const photos = await Promise.all(entries.slice(spread * 2, spread * 2 + 2).map(entry => store.get(entry.id)));
      if (current !== generation || !dialog.open) return;
      revoke();
      pages.replaceChildren();
      for (let side = 0; side < 2; side++) {
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
          label.append(note);
          const save = document.createElement("button");
          save.type = "button";
          save.textContent = t("journalSaveNote");
          const noteStatus = document.createElement("span");
          noteStatus.role = "status";
          async function saveNote() {
            const value = note.value;
            drafts.set(entry.id, value);
            save.disabled = true;
            try {
              await store.note(entry.id, value);
              if (drafts.get(entry.id) === value) drafts.delete(entry.id);
              noteStatus.textContent = t("journalNoteSaved");
              setFeedback(noteStatus, "success");
            } catch (reason) { failure(reason); }
            finally { save.disabled = false; }
          }
          note.addEventListener("input", () => {
            drafts.set(entry.id, note.value);
            noteStatus.textContent = t("journalNoteUnsaved");
            setFeedback(noteStatus);
          });
          note.addEventListener("change", () => { void saveNote(); });
          save.addEventListener("click", () => { void saveNote(); });
          caption.append(label, save, noteStatus);
          frame.append(image, caption);
          page.append(frame);
          const credit = document.createElement("p");
          credit.className = "journal-credit";
          credit.textContent = `${photo.attribution} · ${photo.license} `;
          for (const [href, text] of [[photo.sourceUrl, t("journalSource")], [photo.licenseUrl, t("contentLicense")]]) {
            const link = document.createElement("a");
            link.href = href; link.textContent = text; link.target = "_blank"; link.rel = "noopener noreferrer";
            credit.append(link, " ");
          }
          page.append(credit);
          const remove = document.createElement("button");
          remove.type = "button";
          remove.textContent = t("journalUnpin");
          remove.addEventListener("click", async () => {
            if (!confirm(t("journalUnpinConfirm"))) return;
            remove.disabled = true;
            try { await store.remove(entry.id); drafts.delete(entry.id); await load(); }
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
    dialog.showModal();
    void load();
  });
  previous.addEventListener("click", () => { if (!loading && spread > 0) { spread--; void render(); } });
  next.addEventListener("click", () => {
    if (!loading && (spread + 1) * 2 < entries.length) { spread++; void render(); }
  });
  document.querySelector("#journal-retry").addEventListener("click", () => { if (!loading) void load(); });
  dialog.addEventListener("close", () => { generation++; loading = false; revoke(); pages.replaceChildren(); });
  return {
    localize() { localize(); if (dialog.open) void render(); },
    pinButton(container, photo, options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pin-photo";
      button.textContent = t("journalPin");
      const feedback = document.createElement("span");
      feedback.role = "status";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const added = await store.pin(photo, options);
          feedback.textContent = t(added ? "journalPinned" : "journalAlreadyPinned");
          setFeedback(feedback, "success");
        } catch (reason) {
          console.error("Could not pin photo:", reason);
          feedback.textContent = t("journalError", { error: reason.message });
          setFeedback(feedback, "failure");
          button.disabled = false;
        }
      });
      container.append(button, feedback);
    },
  };
}
