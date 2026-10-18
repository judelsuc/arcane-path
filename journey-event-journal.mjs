import { journeyEventArt } from "./journey-event-art.mjs";
import { journeyEventText } from "./journey-events.mjs";

export function journeyEventJournalEntry(state, t, doc = document) {
  const event = state.events?.history.at(-1);
  if (!event) throw new Error("No journey event to pin.");
  const date = new Date(state.startedAt + event.elapsedMinutes * 60000).toISOString();
  const lines = journeyEventArt(event.kind).split("\n");
  const canvas = doc.createElement("canvas");
  canvas.width = 1000;
  canvas.height = Math.max(500, (lines.length + 2) * 40);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to draw journey event artwork.");
  context.fillStyle = "#f5ead3";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#30291f";
  context.font = "32px monospace";
  const width = Math.max(...lines.map(line => context.measureText(line).width));
  lines.forEach((line, i) => context.fillText(line, (canvas.width - width) / 2, (i + 1) * 40));
  const identity = state.serverJourney?.id ?? String(state.startedAt);
  return {
    id: `event:${identity}:${event.id}`,
    url: canvas.toDataURL("image/png"),
    title: `${t("journeyEventTitle")} · ${date.slice(0, 16).replace("T", " ")}`,
    note: journeyEventText(event, t),
    sourceUrl: "https://github.com/judelsuc/arcane-path",
    attribution: "Les Arcanes du Chemin · original ASCII illustration",
    license: "Original game artwork",
    licenseUrl: "https://github.com/judelsuc/arcane-path",
  };
}
