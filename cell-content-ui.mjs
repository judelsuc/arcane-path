import { cellInfo } from "./cell-info.mjs";
import { createContentService } from "./cell-content.mjs";
import { openContentCache } from "./content-cache.mjs";

export function setupCellContent(t) {
  const cache = openContentCache();
  let servicePromise;
  function contentService() {
    if (!servicePromise) {
      servicePromise = fetch("./public/config.json", { cache: "no-cache" }).then(async response => {
        if (!response.ok) throw new Error(`Photo configuration: HTTP ${response.status}`);
        const config = await response.json();
        if (!Number.isInteger(config.photos?.max_per_cell)) {
          throw new Error("Photo configuration requires photos.max_per_cell.");
        }
        return createContentService({ cache, maxPhotos: config.photos?.max_per_cell });
      }).catch(error => {
        servicePromise = undefined;
        throw error;
      });
    }
    return servicePromise;
  }
  const description = document.querySelector("#cell-description");
  const photo = document.querySelector("#cell-photo");
  const dialog = document.querySelector("#photo-dialog");
  const show = document.querySelector("#show-photo");
  const refresh = document.querySelector("#refresh-content");
  const position = document.querySelector("#content-position");
  const pois = document.querySelector("#cell-pois");
  const poiList = document.querySelector("#cell-pois-list");
  const navigation = document.querySelector("#photo-navigation");
  const previous = document.querySelector("#previous-photo");
  const next = document.querySelector("#next-photo");
  let photoIndex = 0;
  let selected, locale, generation = 0, objectUrl, displayedBlob;
  let descriptionResult, photoResult;
  let photoNeedsRefresh = false;
  const pending = new Set();

  function renderPhoto() {
    const photos = photoResult?.photos ?? [];
    const focusedButton = document.activeElement;
    navigation.hidden = photos.length === 0;
    navigation.setAttribute("aria-label", t("photoNavigation"));
    previous.disabled = photoIndex <= 0;
    next.disabled = photoIndex >= photos.length - 1;
    if (focusedButton === next && next.disabled && !previous.disabled) previous.focus();
    if (focusedButton === previous && previous.disabled && !next.disabled) next.focus();
    document.querySelector("#photo-count").textContent = photos.length
      ? t("photoCount", { index: photoIndex + 1, count: photos.length }) : "";
    render(photo, photos.length
      ? { ...photoResult, content: photos[photoIndex] } : photoResult);
  }

  function movePhoto(offset) {
    const count = photoResult?.photos?.length ?? 0;
    if (photoIndex + offset < 0 || photoIndex + offset >= count) return;
    photoIndex += offset;
    renderPhoto();
  }
  previous.addEventListener("click", () => movePhoto(-1));
  next.addEventListener("click", () => movePhoto(1));
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      movePhoto(event.key === "ArrowLeft" ? -1 : 1);
    }
  });

  function renderPois() {
    const points = selected?.pois ?? [];
    pois.hidden = points.length === 0;
    document.querySelector("#cell-pois-summary").textContent =
      t("cellPoiCount", { count: points.length });
    poiList.replaceChildren();
    for (const poi of points) {
      const item = document.createElement("li");
      const category = t(`poi.${poi.category}`);
      item.textContent = poi.name ? `${poi.name} (${category})` : category;
      poiList.append(item);
    }
  }

  function revoke() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
    displayedBlob = undefined;
  }

  function paragraph(container, text) {
    const p = document.createElement("p");
    p.textContent = text;
    container.append(p);
  }

  function link(container, url, text) {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Unsafe source URL.");
    const a = document.createElement("a");
    a.href = parsed.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = text;
    container.append(a, " ");
  }

  function render(container, result) {
    container.replaceChildren();
    if (!result) return;
    if (result.failed) {
      paragraph(container, t("contentError"));
      return;
    }
    const content = result.content;
    if (content) {
      if (content.blob) {
        if (displayedBlob !== content.blob) {
          revoke();
          objectUrl = URL.createObjectURL(content.blob);
          displayedBlob = content.blob;
        }
        const image = document.createElement("img");
        image.src = objectUrl;
        image.alt = content.title;
        image.onerror = () => paragraph(container, t("contentError"));
        container.append(image);
      } else {
        paragraph(container, content.text);
        paragraph(container, t("contentLanguage", { language: content.language }));
      }
      paragraph(container, content.nearby
        ? t("contentNearby", { distance: content.distance }) : t("contentLocal"));
      if (content.nature) paragraph(container, t("contentNature", { provider: content.provider }));
      if (content.aerial) paragraph(container, t("contentAerial", { provider: content.provider }));
      link(container, content.sourceUrl, t("contentSource", { title: content.title }));
      paragraph(container, t("contentCredit", content));
      link(container, content.licenseUrl, t("contentLicense"));
    } else {
      paragraph(container, t(result.errors.length ? "contentError" : "contentMissing"));
    }
    if (result.errors.length) {
      paragraph(container, t("contentWarnings", { errors: result.errors.join("; ") }));
    }
    if (result.loading) {
      paragraph(container, t("contentLoading"));
    } else if (content || !result.errors.length) {
      paragraph(container, t(result.cached ? "contentCached" : "contentStored", {
        date: new Date(result.retrievedAt).toLocaleString(locale),
      }));
    }
  }

  async function load(kind, force = false) {
    if (!selected) return;
    const current = generation;
    const pendingKey = `${current}:${kind}`;
    if (pending.has(pendingKey)) return;
    pending.add(pendingKey);
    const container = kind === "photo" ? photo : description;
    if (kind === "photo") {
      photoIndex = 0;
      navigation.hidden = true;
      revoke();
    }
    container.replaceChildren();
    paragraph(container, t("contentLoading"));
    try {
      const service = await contentService();
      const result = await service.resolve(selected, locale, kind, force, progress => {
        if (current !== generation || kind !== "photo") return;
        photoResult = progress;
        if (dialog.open) renderPhoto();
      });
      if (current !== generation) return;
      if (kind === "photo") {
        photoResult = result;
        photoIndex = Math.min(photoIndex, Math.max(0, result.photos.length - 1));
        photoNeedsRefresh = false;
      } else {
        descriptionResult = result;
      }
      if (kind === "photo") renderPhoto();
      else render(container, result);
    } catch (error) {
      if (current !== generation) return;
      console.error("Unable to retrieve or cache cell content:", error);
      const result = { failed: true };
      if (kind === "photo") photoResult = result;
      else descriptionResult = result;
      render(container, result);
    } finally {
      pending.delete(pendingKey);
    }
  }

  function reset() {
    dialog.close();
    generation++;
    selected = undefined;
    document.querySelector("#content-hint").hidden = false;
    pois.open = false;
    renderPois();
    descriptionResult = photoResult = undefined;
    photoNeedsRefresh = false;
    photoIndex = 0;
    navigation.hidden = true;
    show.disabled = refresh.disabled = true;
    description.replaceChildren();
    photo.replaceChildren();
    position.textContent = "";
    document.querySelector(".tile--selected")?.classList.remove("tile--selected");
    revoke();
  }

  function localize(nextLocale) {
    const changed = locale && locale !== nextLocale;
    locale = nextLocale;
    if (!selected) return;
    position.textContent = t("contentPosition", selected);
    renderPois();
    if (changed) {
      generation++;
      descriptionResult = photoResult = undefined;
      photoIndex = 0;
      navigation.hidden = true;
      revoke();
      photo.replaceChildren();
      load("description");
      if (dialog.open) load("photo");
    } else {
      if (descriptionResult) render(description, descriptionResult);
      if (photoResult && dialog.open) renderPhoto();
    }
  }

  function select(map, tile) {
    if (!map || !tile?.matches(".tile")) return;
    const info = cellInfo(map, Number(tile.dataset.row), Number(tile.dataset.col));
    if (selected?.latitude === info.latitude && selected?.longitude === info.longitude &&
        selected?.meters === info.meters) {
      tile.classList.add("tile--selected");
      return;
    }
    reset();
    selected = info;
    document.querySelector("#content-hint").hidden = true;
    renderPois();
    tile.classList.add("tile--selected");
    show.disabled = refresh.disabled = false;
    position.textContent = t("contentPosition", selected);
    load("description");
  }

  function openPhoto() {
    if (!selected) return;
    if (!dialog.open) dialog.showModal();
    if (photoResult) renderPhoto();
    else load("photo", photoNeedsRefresh);
  }
  show.addEventListener("click", openPhoto);
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.key.toLowerCase() !== "p" || event.ctrlKey || event.metaKey ||
        event.altKey || event.repeat ||
        document.querySelector("dialog[open]") ||
        event.target.closest("input, select, textarea, [contenteditable]")) return;
    if (selected) {
      event.preventDefault();
      openPhoto();
    }
  });
  dialog.addEventListener("close", revoke);
  refresh.addEventListener("click", () => {
    if (pending.has(`${generation}:description`) || pending.has(`${generation}:photo`)) return;
    descriptionResult = photoResult = undefined;
    photoNeedsRefresh = true;
    load("description", true);
    if (dialog.open) load("photo", true);
  });
  document.querySelector("#clear-content").addEventListener("click", async () => {
    const status = document.querySelector("#cache-status");
    if (pending.size) {
      status.textContent = t("contentLoading");
      return;
    }
    try {
      await cache.clear();
      reset();
      status.textContent = t("cacheCleared");
    } catch (error) {
      console.error("Unable to clear content cache:", error);
      status.textContent = t("contentError");
    }
  });
  return { select, reset, localize };
}
