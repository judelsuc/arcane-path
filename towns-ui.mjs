import { settlementView } from "./towns.mjs";
import { createContentService } from "./cell-content.mjs";
import { openContentCache } from "./content-cache.mjs";

export function setupTowns(t) {
  const dialog = document.querySelector("#town-dialog");
  const open = document.querySelector("#open-town");
  const welcome = document.querySelector("#town-welcome");
  const places = document.querySelector("#town-places");
  const detail = document.querySelector("#town-place-detail");
  const service = createContentService({ cache: openContentCache() });
  let view, lastPosition, locale, generation = 0, result, selectedPlace, loading = false;

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

  function localize(nextLocale = locale) {
    const changed = locale && nextLocale !== locale;
    locale = nextLocale;
    if (!view) return;
    document.querySelector("#town-refresh").disabled = loading;
    document.querySelector("#town-title").textContent = view.settlements.map(item => item.name).join(" · ");
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
      link(provenance, content.sourceUrl, t("contentSource", { title: content.title }));
      paragraph(provenance, t("contentCredit", content));
      link(provenance, content.licenseUrl, t("contentLicense"));
      paragraph(provenance, t(result.cached ? "contentCached" : "contentStored", {
        date: new Date(result.retrievedAt).toLocaleString(locale),
      }));
    } else paragraph(welcome, t(result.errors.length ? "contentError" : "townNoSummary"));
    if (result?.errors?.length) {
      if (result.content) paragraph(welcome, t("contentPartial"));
      paragraph(provenance, t("contentWarnings", { errors: result.errors.join("; ") }));
    }
    welcome.append(provenance);
  }

  async function loadWelcome(force = false) {
    const current = ++generation;
    result = undefined;
    loading = true;
    localize();
    try {
      const resolved = await service.resolve(view, locale, "settlement", force);
      if (generation !== current) return;
      result = resolved;
      loading = false;
      localize();
    } catch (error) {
      if (generation !== current) return;
      console.error("Unable to load settlement welcome:", error);
      result = { failed: true };
      loading = false;
      localize();
    }
  }

  function enter() {
    if (!view || document.querySelector("dialog[open]")) return;
    dialog.showModal();
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
    generation++;
    loading = false;
    document.querySelector("#ascii-map").focus({ preventScroll: true });
  });

  function update(map, row, col, allowEnter = true) {
    const next = settlementView(map, row, col);
    const position = next ? `${next.latitude},${next.longitude}` : null;
    const entered = position !== lastPosition;
    lastPosition = position;
    if (view?.identity !== next?.identity || entered) {
      generation++;
      result = selectedPlace = undefined;
      loading = false;
    }
    view = next;
    open.disabled = !view;
    if (!view) {
      if (dialog.open) dialog.close();
      return;
    }
    localize();
    if (entered && allowEnter) enter();
  }
  function reset() {
    generation++;
    view = lastPosition = result = selectedPlace = undefined;
    loading = false;
    open.disabled = true;
    dialog.close();
  }
  return { update, reset, localize };
}
