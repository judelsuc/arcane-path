export function setupSaveFeedback(t, { save, available }) {
  const status = document.querySelector("#save-feedback");
  let result;
  function localize() {
    status.hidden = !result;
    if (!result) return;
    const failed = Boolean(result.error);
    status.dataset.state = failed ? "error" : "saved";
    status.setAttribute("role", failed ? "alert" : "status");
    const text = document.createElement("span");
    text.textContent = failed ? t("saveError", { error: result.error })
      : t("saveConfirmed", { time: new Date(result.savedAt).toLocaleTimeString(
        document.documentElement.lang, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) });
    status.replaceChildren(text);
  }
  document.querySelector("#save-travel").addEventListener("click", () => {
    if (!available()) return;
    result = save();
    localize();
  });
  return { localize, reset() { result = undefined; status.hidden = true; status.replaceChildren(); } };
}
