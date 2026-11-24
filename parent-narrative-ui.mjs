import { earnedParentEvidence, parentWordingKey, rememberParentWording } from "./parent-intimacy.mjs";

export function setupParentNarrative({ context, narrative, mutate, status, t }) {
  let scheduled = false;
  const failedSaves = new Set();
  function update() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const state = context();
      if (!state) { if (status) status.textContent = ""; return; }
      const saved = new Set(state.parentWording?.map(entry => entry.key));
      let pending = false, failed = false, disabled = false, storageFailed = false;
      for (const evidence of earnedParentEvidence(state)) {
        const key = parentWordingKey(evidence);
        if (saved.has(key)) continue;
        if (failedSaves.has(`${state.serverJourney?.id}:${key}`)) { storageFailed = true; continue; }
        const record = narrative.parentRecord(state, evidence);
        failed ||= record?.status === "failed";
        disabled ||= record?.status === "disabled";
        pending ||= !record || ["queued", "running"].includes(record.status);
        if (record?.status === "ready") {
          if (!mutate(latest => rememberParentWording(latest, evidence, record.text))) {
            storageFailed = true;
            failedSaves.add(`${state.serverJourney?.id}:${key}`);
            console.error("Unable to save generated parent evidence; authored clue retained:", key);
          }
        } else if (!record) narrative.prefetchParent(state, evidence);
      }
      if (status) status.textContent = storageFailed ? t("parentNarrativeSaveFailed") : failed ? t("parentNarrativeFailed")
        : disabled ? t("parentNarrativeDisabled") : pending ? t("parentNarrativePending") : "";
    });
  }
  narrative.subscribe(update);
  return { update };
}
