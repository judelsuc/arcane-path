import { drawIconPixels, PLAYER_ICONS } from "./player-icons.mjs";

const $ = id => document.getElementById(id);
let csrf = "", busy = false, feedbackOffset = 0, collectionOffset = 0, imageUrl;
let viewVersion = 0;
const status = (message, error = false) => {
  $("status").textContent = message;
  $("status").setAttribute("role", error ? "alert" : "status");
};
function clearPrivateView() {
  viewVersion++;
  csrf = "";
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = undefined;
  for (const id of ["feedback-list", "feedback-detail", "collection-list", "generation-status"]) $(id).replaceChildren();
  $("console").hidden = true;
  $("login").hidden = false;
  $("identity").textContent = "";
}
async function request(data, image = false) {
  const version = viewVersion;
  const response = await fetch("/api/admin", { method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", ...(csrf ? { "X-Admin-CSRF": csrf } : {}) },
    body: JSON.stringify(data) });
  if (version !== viewVersion) throw new Error("Administrator view closed. Reload before continuing.");
  if (!response.ok) {
    if (response.status === 401) clearPrivateView();
    const body = await response.json();
    throw new Error(body.error ?? `Administrator request failed (${response.status}).`);
  }
  return image ? response.blob() : response.json();
}
async function run(operation) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button").forEach(button => { button.disabled = true; });
  status("Loading…");
  try { await operation(); status("Ready."); }
  catch (error) { console.error("Administrator operation failed:", error); status(error.message, true); }
  finally {
    busy = false;
    document.querySelectorAll("button").forEach(button => { button.disabled = button.dataset.unavailable === "true"; });
  }
}
function node(tag, text, parent) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  parent?.append(element);
  return element;
}
function button(parent, label, action) {
  const element = node("button", label, parent);
  element.type = "button";
  element.addEventListener("click", () => { void run(action); });
  return element;
}
function pageButtons(prefix, offset, more) {
  for (const [suffix, unavailable] of [["previous", offset === 0], ["next", !more]]) {
    const element = $(`${prefix}-${suffix}`);
    element.dataset.unavailable = String(unavailable);
    element.disabled = unavailable;
  }
}
function showTab(name) {
  $("feedback").hidden = name !== "feedback";
  $("collections").hidden = name !== "collections";
  $("feedback-tab").setAttribute("aria-pressed", String(name === "feedback"));
  $("collections-tab").setAttribute("aria-pressed", String(name === "collections"));
}
async function feedbackList() {
  const data = await request({ action: "feedback-list", status: $("feedback-filter").value, offset: feedbackOffset });
  const host = $("feedback-list");
  host.replaceChildren();
  for (const item of data.items) {
    button(host, `${item.review_status} · ${new Date(item.created * 1000).toLocaleString()}\n${item.comment}`,
      () => feedbackDetail(item.id));
  }
  if (!data.items.length) node("p", "No current reports in this view.", host);
  pageButtons("feedback", feedbackOffset, data.hasMore);
}
async function feedbackDetail(id) {
  const data = await request({ action: "feedback-detail", id });
  const host = $("feedback-detail");
  host.replaceChildren();
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = undefined;
  node("h3", "Player report", host);
  node("p", data.comment, host);
  const details = node("details", undefined, host);
  node("summary", "Game context", details);
  node("pre", JSON.stringify(data.snapshot, null, 2), details);
  const image = node("img", undefined, host);
  image.alt = "Player-confirmed game screenshot";
  image.className = "evidence";
  const label = node("label", "Review status", host), select = node("select", undefined, label);
  for (const value of ["new", "investigating", "resolved", "dismissed"]) {
    const option = node("option", value, select);
    option.value = value;
  }
  select.value = data.status;
  const noteLabel = node("label", "Private review note", host), note = node("textarea", undefined, noteLabel);
  note.maxLength = 2000;
  note.value = data.note;
  button(host, "Save review", async () => {
    await request({ action: "feedback-update", id, revision: data.revision, status: select.value, note: note.value });
    await feedbackList();
    await feedbackDetail(id);
  });
  imageUrl = URL.createObjectURL(await request({ action: "feedback-image", id }, true));
  image.addEventListener("error", () => {
    console.error("Administrator screenshot failed to load.");
    status("The private screenshot could not be displayed. Refresh the report to retry.", true);
  });
  image.src = imageUrl;
}
function drawIcon(canvas, icon, background) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Icon preview canvas unavailable.");
  if (background) { context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height); }
  drawIconPixels(context, icon, 0, 0, canvas.width);
}
export function silhouetteSimilarity(first, second) {
  const a = first.pixels.join(""), b = second.pixels.join("");
  let overlap = 0, occupied = 0;
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== "." || b[index] !== ".") occupied++;
    if (a[index] !== "." && b[index] !== ".") overlap++;
  }
  return occupied ? overlap / occupied : 1;
}
async function collectionList() {
  const data = await request({ action: "collection-list", offset: collectionOffset });
  const generation = $("generation-status");
  generation.replaceChildren();
  node("h3", "Daily server generation", generation);
  if (!data.generation.length) node("p", "No daily run recorded yet. The server timer must be enabled by the operator.", generation);
  for (const attempt of data.generation) {
    const details = node("details", undefined, generation);
    node("summary", `${attempt.day} · ${attempt.title} · ${attempt.status}`, details);
    node("p", `Family: ${attempt.family} · Palette: ${attempt.palette}`, details);
    if (attempt.response_model) node("p", `Model: ${attempt.response_model}`, details);
    if (attempt.usage) node("p", `Tokens: ${attempt.usage.total_tokens}`, details);
    if (attempt.error) node("p", attempt.error, details).className = "warning";
    if (attempt.status === "uncertain") node("p",
      "The provider dispatch was interrupted; its outcome or billing may be unknown. No automatic retry.", details).className = "warning";
  }
  const host = $("collection-list");
  host.replaceChildren();
  const allIcons = [...PLAYER_ICONS.map(icon => ({ ...icon, collection: "original icons" })),
    ...data.items.flatMap(collection => collection.icons.map(icon => ({ ...icon, collection: collection.id })))];
  for (const collection of data.items) {
    const section = node("article", undefined, host);
    section.className = "collection";
    node("h3", collection.theme, section);
    node("p", `${collection.id} · ${collection.model} · ${collection.status} · revision ${collection.revision}`, section);
    const grid = node("div", undefined, section);
    grid.className = "icon-grid";
    let warnings = 0;
    for (const icon of collection.icons) {
      const card = node("section", undefined, grid);
      card.className = "icon-card";
      node("h4", `${icon.en} / ${icon.fr}`, card);
      node("p", collection.decisions[icon.id] ?? "Awaiting review", card);
      const large = node("canvas", undefined, card);
      large.width = large.height = 96;
      large.setAttribute("role", "img");
      large.setAttribute("aria-label", `${icon.en}, enlarged pixel preview`);
      drawIcon(large, icon);
      const samples = node("div", undefined, card);
      samples.className = "map-samples";
      for (const background of ["#314c35", "#28516a", "#9d9458"]) {
        const small = node("canvas", undefined, samples);
        small.width = small.height = 24;
        small.setAttribute("role", "img");
        small.setAttribute("aria-label", `${icon.en}, actual-size map sample`);
        drawIcon(small, icon, background);
      }
      const similar = collection.warnings[icon.id] ?? allIcons.find(other =>
        !(other.collection === collection.id && other.id === icon.id) && silhouetteSimilarity(icon, other) >= .9);
      if (similar) {
        warnings++;
        const warning = node("p", `Similar silhouette: ${similar.en} (${similar.collection}).`, card);
        warning.className = "warning";
      }
      if (collection.status === "draft") {
        const actions = node("div", undefined, card);
        actions.className = "actions";
        for (const [label, decision] of [["Approve", "approved"], ["Reject", "rejected"]]) {
          button(actions, label, async () => {
            await request({ action: "collection-review", id: collection.id, revision: collection.revision, icon: icon.id, decision });
            await collectionList();
          });
        }
      }
    }
    if (collection.status === "draft") {
      const approved = Object.values(collection.decisions).filter(value => value === "approved").length;
      node("p", `${approved} approved; ${collection.icons.length - Object.keys(collection.decisions).length} unreviewed.`, section);
      if (warnings) node("p", "Similar silhouettes found. Compare the artwork before approving; a recolour is not a new icon.", section).className = "warning";
      const label = node("label", undefined, section), confirmation = node("input", undefined, label);
      confirmation.type = "checkbox";
      label.append(document.createTextNode(" I checked consistency, distinct silhouettes and map readability."));
      const publish = button(section, "Publish approved icons to library", async () => {
        if (!confirmation.checked) throw new Error("Confirm the visual review before publishing.");
        await request({ action: "collection-publish", id: collection.id, revision: collection.revision });
        await collectionList();
      });
      publish.dataset.unavailable = String(approved === 0 || Object.keys(collection.decisions).length !== collection.icons.length);
    } else {
      node("p", "Immutable approved library entry. Rejected icons are not approved for distribution.", section);
      button(section, "Download approved collection", async () => {
        const approved = await request({ action: "collection-export", id: collection.id });
        const url = URL.createObjectURL(new Blob([JSON.stringify(approved, null, 2)], { type: "application/json" }));
        const link = node("a");
        link.href = url;
        link.download = `${collection.id}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    }
  }
  if (!data.items.length) node("p", "No drafts awaiting review yet. Daily server generation places validated sets here automatically.", host);
  pageButtons("collections", collectionOffset, data.hasMore);
}
async function loggedIn(data) {
  csrf = data.csrf;
  $("login").reset();
  $("login").hidden = true;
  $("console").hidden = false;
  $("identity").textContent = `Administrator: ${data.username}`;
  showTab("feedback");
  await feedbackList();
}
$("login").addEventListener("submit", event => {
  event.preventDefault();
  void run(async () => {
    const form = new FormData($("login"));
    try { await loggedIn(await request({ action: "login", username: form.get("username"), password: form.get("password") })); }
    finally { $("login").elements.password.value = ""; }
  });
});
$("logout").addEventListener("click", () => { void run(async () => { await request({ action: "logout" }); clearPrivateView(); }); });
for (const name of ["feedback", "collections"]) {
  const load = name === "feedback" ? feedbackList : collectionList;
  $(`${name}-tab`).addEventListener("click", () => { void run(async () => { showTab(name); await load(); }); });
  $(`${name}-refresh`).addEventListener("click", () => { void run(load); });
  for (const [direction, delta] of [["previous", -20], ["next", 20]]) {
    $(`${name}-${direction}`).addEventListener("click", () => { void run(async () => {
      if (name === "feedback") feedbackOffset = Math.max(0, feedbackOffset + delta);
      else collectionOffset = Math.max(0, collectionOffset + delta);
      await load();
    }); });
  }
}
$("feedback-filter").addEventListener("change", () => { void run(async () => { feedbackOffset = 0; await feedbackList(); }); });
window.addEventListener("pagehide", clearPrivateView);
void run(async () => {
  try { await loggedIn(await request({ action: "session" })); }
  catch (error) {
    if (!$("console").hidden) throw error;
    status(error.message, true);
    throw error;
  }
});
