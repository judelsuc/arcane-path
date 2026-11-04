import { freezeEvidence } from "./change-request-capture.mjs";

export function setupChangeRequests(t, {
  context, fetcher = fetch, capture = freezeEvidence, newId = () => crypto.randomUUID().replaceAll("-", ""),
} = {}) {
  const $ = id => document.getElementById(id);
  const dialog = $("change-request-dialog"), trigger = $("open-change-request");
  const comment = $("change-request-comment"), status = $("change-request-status");
  const preview = $("change-request-image"), details = $("change-request-snapshot");
  const confirm = $("change-request-confirm"), cancel = $("change-request-cancel");
  let draft, busy = false, capturing = false, url, build = { commit: "unavailable", version: 1 };
  let opener;
  fetcher("/public/release.json", { signal: AbortSignal.timeout(10000) }).then(async response => {
    if (response.status === 404) { build = { commit: "development", version: 1 }; return; }
    if (!response.ok) throw new Error(`Build metadata HTTP ${response.status}`);
    const value = await response.json();
    if (!/^[a-f0-9]{40}$/.test(value.commit) || value.version !== 1) throw new Error("Invalid build metadata.");
    build = { commit: value.commit, version: value.version };
  }).catch(error => console.error("Change request build metadata unavailable:", error));

  function localize() {
    preview.alt = t("changeRequest.preview");
    trigger.disabled = capturing || !context()?.serverJourney?.id;
    confirm.disabled = busy || !draft?.image || !comment.value.trim() || Boolean(draft?.acknowledged);
    cancel.disabled = busy;
    comment.disabled = busy || Boolean(draft?.payload);
  }
  function release() {
    if (url) URL.revokeObjectURL(url);
    url = undefined;
    preview.removeAttribute("src");
  }
  async function open() {
    if (busy || capturing || dialog.open || !context()?.serverJourney?.id) return;
    opener = document.activeElement;
    status.textContent = "";
    if (draft && !draft.acknowledged) {
      dialog.showModal();
      localize();
      return;
    }
    release();
    draft = undefined;
    comment.value = "";
    capturing = true;
    let evidence, captured;
    const state = context();
    try {
      // These synchronous operations precede the report modal and all asynchronous work.
      const identity = { journey: state.serverJourney.id, capability: state.journalAccess };
      const id = newId();
      evidence = capture(state, build);
      captured = { id, identity, snapshot: evidence.snapshot };
      localize();
      const image = await evidence.image();
      draft = { ...captured, image };
      url = URL.createObjectURL(image);
      preview.src = url;
      details.textContent = JSON.stringify(draft.snapshot, null, 2);
      status.textContent = t("changeRequest.ready");
      dialog.showModal();
    } catch (error) {
      console.error("Game evidence capture failed:", error);
      draft = undefined;
      status.textContent = t("changeRequest.captureFailed", { error: error.message });
      details.textContent = "";
      dialog.showModal();
    } finally {
      capturing = false;
      localize();
    }
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || !draft?.image || draft.acknowledged || !comment.value.trim()) return;
    const text = comment.value.trim();
    busy = true;
    status.textContent = t("changeRequest.sending");
    localize();
    try {
      if (!draft.payload) {
        const bytes = new Uint8Array(await draft.image.arrayBuffer());
        let binary = "";
        for (let index = 0; index < bytes.length; index += 8192) {
          binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
        }
        draft.payload = { id: draft.id, journey: draft.identity.journey,
          comment: text, snapshot: draft.snapshot, image: btoa(binary) };
      }
      const response = await fetcher("/api/change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json",
          "X-Journal-Capability": draft.identity.capability },
        body: JSON.stringify(draft.payload), signal: AbortSignal.timeout(45000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Change request HTTP ${response.status}`);
      if (result.id !== draft.id || result.status !== "submitted") throw new Error("Invalid submission acknowledgement.");
      draft.acknowledged = true;
      status.textContent = t("changeRequest.received", { id: result.id });
    } catch (error) {
      console.error("Change request submission failed:", error);
      status.textContent = t("changeRequest.sendFailed", { error: error.message });
    } finally {
      busy = false;
      localize();
    }
  }
  function discard() {
    if (busy) return;
    release();
    draft = undefined;
    comment.value = "";
    dialog.close();
  }
  trigger.addEventListener("click", open);
  $("change-request-form").addEventListener("submit", submit);
  comment.addEventListener("input", localize);
  cancel.addEventListener("click", discard);
  dialog.addEventListener("cancel", event => { event.preventDefault(); discard(); });
  dialog.addEventListener("close", () => { if (opener?.isConnected) opener.focus(); });
  dialog.addEventListener("keydown", event => event.stopPropagation());
  dialog.addEventListener("keyup", event => event.stopPropagation());
  const key = event => {
    if (event.altKey && event.shiftKey && event.code === "KeyF" &&
        !event.ctrlKey && !event.metaKey && !event.repeat) {
      event.preventDefault();
      event.stopImmediatePropagation();
      open();
    }
  };
  document.addEventListener("keydown", key, true);
  localize();
  return { localize, open };
}
