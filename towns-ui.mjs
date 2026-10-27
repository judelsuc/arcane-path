import { settlementView } from "./towns.mjs";
import { createTownContentClient } from "./town-content.mjs";
import { cellInfo } from "./cell-info.mjs";
import { washingAvailable } from "./pressures.mjs";

export function setupTowns(t, { context = () => null, service = createTownContentClient({ context }), pinPhoto } = {}) {
  const dialog = document.querySelector("#town-dialog");
  const open = document.querySelector("#open-town");
  const welcome = document.querySelector("#town-welcome");
  const places = document.querySelector("#town-places");
  const detail = document.querySelector("#town-place-detail");
  const gallery = document.querySelector("#town-gallery");
  const gallerySection = document.querySelector("#town-gallery-section");
  const galleryStatus = document.querySelector("#town-gallery-status");
  let view, lastTown, locale = document.documentElement?.lang ?? "fr";
  let generation = 0, result, selectedPlace, loading = false, controller;
  const photoUrls = new Map();

  function releasePhotos() {
    for (const url of photoUrls.values()) URL.revokeObjectURL(url);
    photoUrls.clear();
  }

  function invalidate() {
    generation++;
    controller?.abort();
    controller = undefined;
    loading = false;
    releasePhotos();
  }

  function paragraph(container, text, className = "") {
    const p = document.createElement("p");
    p.textContent = text;
    p.className = className;
    container.append(p);
  }

  function link(container, url, text) {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Unsafe source URL.");
    const a = document.createElement("a");
    a.href = parsed.href;
    a.textContent = text;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    container.append(a, " ");
  }

  function renderDetail() {
    detail.replaceChildren();
    if (!selectedPlace) return;
    paragraph(detail, t("townPlace", { name: selectedPlace.name,
      category: t(`poi.${selectedPlace.category}`), distance: selectedPlace.distance }));
    link(detail, `https://www.openstreetmap.org/${selectedPlace.osmId}`, t("townOsm"));
    paragraph(detail, t("townVisitNote"), "window-help-text");
  }

  function renderGallery() {
    const renderGeneration = generation;
    gallery.replaceChildren();
    gallerySection.hidden = Boolean(view.servicesOnly);
    gallery.hidden = Boolean(view.servicesOnly);
    galleryStatus.hidden = Boolean(view.servicesOnly);
    if (view.servicesOnly) return;
    const photos = result?.photos ?? [];
    galleryStatus.textContent = t(loading ? "townGalleryLoading"
      : result?.failed ? "contentError" : photos.length ? "townGalleryCount" : "townGalleryEmpty",
    { count: photos.length });
    for (const photo of photos) {
      const figure = document.createElement("figure");
      figure.className = "town-photo";
      if (photo.blob && !photo.failed) {
        const image = document.createElement("img");
        if (!photoUrls.has(photo.imageId)) photoUrls.set(photo.imageId, URL.createObjectURL(photo.blob));
        image.src = photoUrls.get(photo.imageId);
        image.alt = photo.caption || photo.title;
        image.loading = "lazy";
        image.addEventListener("error", () => {
          if (generation !== renderGeneration || !dialog.open || image.isConnected === false) return;
          console.error("Town documentary photograph could not be decoded:", photo.sourceUrl);
          photo.failed = true;
          const url = photoUrls.get(photo.imageId);
          if (url) URL.revokeObjectURL(url);
          photoUrls.delete(photo.imageId);
          renderGallery();
        }, { once: true });
        figure.append(image);
      } else paragraph(figure, t("townPhotoFailed"));
      const caption = document.createElement("figcaption");
      paragraph(caption, photo.caption || photo.title);
      paragraph(caption, t(photo.association === "nearby" ? "townPhotoNearby" : "townPhotoAssociated"),
        "window-help-text");
      link(caption, photo.sourceUrl, t("contentSource", { title: photo.title }));
      paragraph(caption, t("contentCredit", photo), "technical-text");
      link(caption, photo.licenseUrl, `${t("contentLicense")} (${photo.license})`);
      if (photo.blob && !photo.failed && pinPhoto) {
        const pin = document.createElement("p");
        pin.className = "town-photo-pin";
        pinPhoto(pin, photo, { caption: photo.caption || photo.title });
        caption.append(pin);
      }
      figure.append(caption);
      gallery.append(figure);
    }
  }

  function localize(nextLocale = locale) {
    const changed = locale && nextLocale !== locale;
    locale = nextLocale;
    if (!view) return;
    if (changed) {
      invalidate();
      result = undefined;
    }
    document.querySelector("#town-refresh").disabled = loading || Boolean(view.servicesOnly);
    document.querySelector("#town-title").textContent = view.servicesOnly
      ? t("townLocalServices") : view.settlements.map(item => item.name).join(" · ");
    places.replaceChildren();
    for (const poi of view.places) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = t("townPlace", { name: poi.name, category: t(`poi.${poi.category}`),
        distance: poi.distance });
      button.addEventListener("click", () => {
        selectedPlace = poi;
        renderDetail();
      });
      item.append(button);
      places.append(item);
    }
    document.querySelector("#town-empty").hidden = view.places.length > 0;
    renderDetail();
    welcome.replaceChildren();
    renderGallery();
    if (view.servicesOnly) {
      paragraph(welcome, t("washHelp"));
      return;
    }
    const provenance = document.createElement("div");
    provenance.className = "technical-text";
    if (changed && dialog.open) {
      loadWelcome();
      return;
    }
    if (!result) paragraph(welcome, t("contentLoading"));
    else if (result.failed) paragraph(welcome, t("contentError"));
    else if (result.content) {
      const content = result.content;
      paragraph(welcome, content.text);
      paragraph(provenance, t("contentLanguage", { language: content.language }));
      if (content.language !== locale) paragraph(welcome,
        t("townLanguageFallback", { language: content.language }), "window-help-text");
      link(provenance, content.sourceUrl, t("contentSource", { title: content.title }));
      paragraph(provenance, t("contentCredit", content));
      link(provenance, content.licenseUrl, t("contentLicense"));
      if (result.retrievedAt) paragraph(provenance,
        t(result.cached ? "townSourcesCached" : "townSourcesRetrieved", {
          date: new Date(result.retrievedAt).toLocaleString(locale),
        }));
    } else paragraph(welcome, t(result.loading ? "contentLoading"
      : result.errors.length ? "contentError" : "townNoSummary"));
    if (result?.errors?.length) {
      if (result.content || result.photos?.length) paragraph(welcome, t("contentPartial"));
      paragraph(provenance, t("contentWarnings", { errors: result.errors.join("; ") }));
    }
    if (result?.refreshAfter > Date.now()) paragraph(provenance, t("townRefreshCooldown", {
      date: new Date(result.refreshAfter).toLocaleTimeString(locale),
    }), "window-help-text");
    welcome.append(provenance);
  }

  async function loadWelcome(force = false) {
    if (view?.servicesOnly || loading && !force) return;
    if (!force && result && !result.failed && !result.loading && result.expiresAt > Date.now()) return;
    invalidate();
    const current = ++generation;
    controller = new AbortController();
    const signal = controller.signal;
    if (force) result = undefined;
    loading = true;
    localize();
    try {
      const resolved = await service.resolve(view, locale, force, progress => {
        if (generation !== current) return;
        result = progress;
        localize();
      }, signal);
      if (generation !== current) return;
      result = resolved;
      loading = false;
      localize();
    } catch (error) {
      if (generation !== current) return;
      console.error("Unable to load settlement welcome:", error);
      result = { ...result, loading: false, expiresAt: 0,
        failed: !result?.content && !result?.photos?.length,
        errors: [...(result?.errors ?? []), error.message] };
      loading = false;
      localize();
    }
  }

  function enter() {
    if (!view || document.querySelector("dialog[open]")) return;
    dialog.showModal();
    localize();
    loadWelcome();
  }
  open.addEventListener("click", enter);
  document.querySelector("#town-refresh").addEventListener("click", () => loadWelcome(true));
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
    }
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    invalidate();
    if (result?.loading) result = undefined;
    document.querySelector("#ascii-map").focus({ preventScroll: true });
  });

  function update(map, row, col, allowEnter = true) {
    const next = settlementView(map, row, col) ?? (washingAvailable(map.rows[row]?.[col])
      ? { ...cellInfo(map, row, col), settlements: [], places: [], servicesOnly: true,
        identity: `washing:${row}:${col}` } : null);
    const identity = next?.identity ?? null;
    const entered = identity !== lastTown;
    lastTown = identity;
    if (entered) {
      invalidate();
      result = selectedPlace = undefined;
    }
    view = next;
    open.disabled = !view;
    if (!view) {
      if (dialog.open) dialog.close();
      return;
    }
    localize();
    if (entered && dialog.open && !view.servicesOnly) loadWelcome();
    else if (entered && allowEnter && !view.servicesOnly) enter();
  }
  function reset() {
    invalidate();
    view = lastTown = result = selectedPlace = undefined;
    open.disabled = true;
    dialog.close();
  }
  return { update, reset, localize };
}
