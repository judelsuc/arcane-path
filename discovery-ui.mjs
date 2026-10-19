import { discoveryEntries, discoveryIdentity } from "./discovery.mjs";
import { authoredHint, authoredCopy } from "./discovery-authored.mjs";

const explanationProgress = new WeakMap();

const TEXT_KEYS = Object.freeze({
  "parent-trail": {
    place: "discovery.place", prefix: "fieldClue.prefix", photo: "fieldClue.photo",
    direction: "discovery.direction", sign: "fieldSign", suggestion: "discovery.suggestion",
    venue: "discovery.venue",
  },
  "abandoned-journal": { rumour: "discovery.journalRumour", place: "discovery.journalPlace" },
  artifact: { location: "discovery.artifactLocation", inscription: "discovery.artifactInscription" },
});

export function discoveryClueText(entry, state, t) {
  if (entry.targetType === "parent-trail" && entry.source === "parent-sleep-dream") {
    return t("trailDreamText", { direction: t(`hintCompass.${entry.facts.direction}`) });
  }
  const templates = Object.hasOwn(TEXT_KEYS, entry.targetType) ? TEXT_KEYS[entry.targetType] : null;
  const key = templates && Object.hasOwn(templates, entry.kind) ? templates[entry.kind] : null;
  if (!key) throw new Error("Unsupported discovery presentation.");
  if (entry.targetType === "abandoned-journal" && entry.evidenceKey === "solution") {
    return `${t(key, entry.facts)} · ${entry.facts.marker} · ${entry.facts.latitude}, ${entry.facts.longitude}`;
  }
  if (entry.targetType === "artifact" && entry.kind === "inscription") {
    const text = entry.facts[t("discovery.inscriptionLanguage")];
    if (typeof text !== "string" || !text) throw new Error("Missing artifact inscription translation.");
    return t(key, { text });
  }
  const artifact = entry.targetType === "artifact" && entry.kind === "location"
    ? { artifact: t(`discovery.artifactName.${entry.targetId}`),
      detail: [entry.facts.region, entry.facts.place, entry.facts.marker,
        entry.facts.col === undefined ? null : `${entry.facts.col}, ${entry.facts.row}`].filter(Boolean).join(" · ") }
    : {};
  return t(key, { ...entry.facts, ...artifact, parent: entry.facts.parent ?? state.trail?.parentName ?? "",
    ...(entry.kind === "direction" ? { direction: t(`hintCompass.${entry.facts.direction}`) } : {}) });
}

export function discoveryNotebookEntries(state, t, { authored = false } = {}) {
  const counts = new Map();
  return discoveryEntries(state).map((entry, order) => {
    const family = entry.targetType, index = counts.get(family) ?? 0;
    counts.set(family, index + (entry.kind === "inscription" ? 0 : 1));
    const plain = discoveryClueText(entry, state, t);
    return {
      id: discoveryIdentity(entry), order, observedMinutes: entry.observedMinutes,
      text: plain,
      ladder: authored ? authoredHint(entry, state, t, plain, index) : null,
      context: `${t("discovery.context", {
        domain: t(`discovery.domain.${entry.targetType}`),
        status: t(`discovery.status.${entry.availability}`),
        minutes: Math.round(entry.observedMinutes),
      })}${(state.lore?.contradictedReports ?? []).includes(discoveryIdentity(entry))
        ? t("discovery.inscriptionLanguage") === "fr" ? " · Contredit par la vision" : " · Contradicted by the vision" : ""}`,
    };
  }).sort((a, b) => b.observedMinutes - a.observedMinutes || a.order - b.order);
}

export function renderDiscoveryNotebook(container, state, t, options = {}) {
  if (!container) return;
  container.hidden = !state;
  container.replaceChildren();
  if (!state) return;
  const summary = document.createElement("summary");
  summary.textContent = t("discovery.title");
  const note = document.createElement("p");
  note.textContent = t("discovery.help");
  const list = document.createElement("ol");
  const progress = explanationProgress.get(container) ?? new Map();
  explanationProgress.set(container, progress);
  for (const record of discoveryNotebookEntries(state, t, options)) {
    const item = document.createElement("li"), context = document.createElement("p");
    const text = document.createElement("p");
    context.textContent = record.context;
    text.textContent = record.ladder?.evocative ?? record.text;
    item.append(context, text);
    if (record.ladder) {
      const copy = authoredCopy(t("discovery.inscriptionLanguage"));
      const explanation = document.createElement("p"), plain = document.createElement("p");
      const explainButton = document.createElement("button"), plainButton = document.createElement("button");
      explanation.textContent = record.ladder.explanation;
      plain.textContent = record.ladder.plain ?? "";
      explainButton.type = plainButton.type = "button";
      explainButton.textContent = copy.explain;
      plainButton.textContent = copy.plain;
      const update = () => {
        explanation.hidden = (progress.get(record.id) ?? 0) < 1;
        plain.hidden = record.ladder.plain === null || (progress.get(record.id) ?? 0) < 2;
      };
      explainButton.addEventListener("click", () => {
        progress.set(record.id, Math.max(1, progress.get(record.id) ?? 0)); update();
      });
      plainButton.addEventListener("click", () => { progress.set(record.id, 2); update(); });
      update();
      item.append(explainButton, explanation);
      if (record.ladder.plain !== null) {
        item.append(plainButton, plain);
      } else {
        const offer = options.interpretationOffer ?? { status: "outside", available: false, minutes: 0, cents: 0 };
        const status = document.createElement("p");
        status.textContent = copy.interpretationStatus[offer.status];
        if (!status.textContent) throw new Error("Unsupported clue interpretation status.");
        item.append(status);
        if (offer.minutes > 0) {
          const price = document.createElement("p");
          price.textContent = copy.interpretationPrice.replace("{minutes}", String(offer.minutes))
            .replace("{price}", (offer.cents / 100).toFixed(2));
          item.append(price);
        }
        if (offer.available && options.onInterpret) {
          const interpretButton = document.createElement("button");
          interpretButton.type = "button";
          interpretButton.textContent = copy.interpret;
          interpretButton.disabled = Boolean(options.busy);
          interpretButton.addEventListener("click", () => options.onInterpret(record.id));
          item.append(interpretButton);
        }
      }
    }
    list.append(item);
  }
  container.append(summary, note, list);
  if (!list.children.length) {
    const empty = document.createElement("p");
    empty.textContent = t("discovery.empty");
    container.append(empty);
  }
}
