export function notebookCover(context, t, language = "fr") {
  const state = context.state;
  const origin = state.trail?.origin;
  const point = context.startingPoint ?? origin?.name ??
    (Number.isFinite(origin?.latitude) && Number.isFinite(origin?.longitude)
      ? `${origin.latitude.toFixed(5)}, ${origin.longitude.toFixed(5)}` : t("journalCoverUnknown"));
  const date = new Date(state.startedAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid notebook starting date.");
  return {
    title: t("journalCoverTitle", { name: state.name ?? t("unnamedCharacter") }),
    subtitle: t("journalCoverSubtitle"),
    rows: [
      { label: t("journalCoverFrom"), value: point },
      { label: t("journalCoverDate"), value: `${date.toLocaleDateString(language === "en" ? "en-GB" : "fr-FR",
        { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })} (UTC)` },
    ],
  };
}
