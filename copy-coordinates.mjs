export function coordinateText(info) {
  if (!info || !Number.isFinite(info.latitude) || Math.abs(info.latitude) > 90 ||
      !Number.isFinite(info.longitude) || Math.abs(info.longitude) > 180) {
    throw new Error("No valid cell coordinates selected.");
  }
  return `${info.latitude.toFixed(6)}, ${info.longitude.toFixed(6)}`;
}

export function setupCopyCoordinates(t, selected, clipboard = navigator.clipboard) {
  const button = document.querySelector("#copy-coordinates");
  const status = document.querySelector("#copy-coordinates-status");
  let last = "";
  function update() {
    const info = selected();
    button.disabled = !info;
    const current = info ? coordinateText(info) : "";
    if (current !== last) status.textContent = "";
    last = current;
  }
  button.addEventListener("click", async () => {
    try {
      const text = coordinateText(selected());
      if (!clipboard?.writeText) throw new Error(t("copyCoordinatesUnavailable"));
      await clipboard.writeText(text);
      if (selected() && coordinateText(selected()) === text) {
        status.textContent = t("coordinatesCopied", { coordinates: text });
      }
    } catch (error) {
      console.error("Coordinate copy failed:", error);
      status.textContent = t("coordinatesCopyError", { error: error.message });
    }
  });
  return { update };
}
