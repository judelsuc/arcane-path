// Central feed of conversation topics. Game layers register topics; the
// conversation window builds its choices from this registry.
// Kinds: "action" proxies an existing game button; "exchange" asks the
// character service; "local" renders a reply computed client-side.
const providers = new Map();

export const CORE_TOPICS = Object.freeze([
  { layer: "characters", id: "parent", kind: "exchange", order: 10 },
  { layer: "investigation", id: "clues", kind: "exchange", order: 20 },
  { layer: "journals", id: "notebooks", kind: "exchange", order: 30 },
  { layer: "artifacts", id: "artifacts", kind: "exchange", order: 40 },
  { layer: "legends", id: "legends", kind: "exchange", order: 50 },
  { layer: "services", id: "services", kind: "exchange", order: 60 },
  { layer: "travel", id: "shelter", kind: "action", target: "sleep-travel", order: 70 },
  { layer: "travel", id: "food", kind: "action", target: "eat-travel", order: 80 },
  { layer: "travel", id: "work", kind: "action", target: "open-earn-money", order: 90 },
  { layer: "travel", id: "transport", kind: "action", target: "open-journey-world", order: 100 },
  { layer: "travel", id: "town", kind: "action", target: "open-town", order: 110 },
]);

export function registerConversationTopics(layer, topics) {
  if (typeof layer !== "string" || !layer) throw new TypeError("A topic layer needs a name.");
  for (const topic of topics) {
    if (!topic?.id || !["action", "exchange", "local"].includes(topic.kind))
      throw new TypeError("Topics need an id and a known kind.");
    if (topic.kind === "local" && typeof topic.reply !== "function")
      throw new TypeError("Local topics need a reply function.");
  }
  providers.set(layer, topics.map(topic => ({ order: 1000, ...topic, layer })));
}

export function unregisterConversationTopics(layer) {
  providers.delete(layer);
}

/** All topics whose layer considers them available in the current context. */
export function conversationTopics(context) {
  const all = [...CORE_TOPICS, ...[...providers.values()].flat()];
  return all.filter(topic => {
    try {
      return !topic.available || Boolean(topic.available(context));
    } catch {
      return false;
    }
  }).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/**
 * Stable per-character variant index so each character phrases the same
 * information their own way, consistently across reopenings and reloads.
 */
export function characterVariant(character, count) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError("Variant count must be a positive integer.");
  let hash = 0;
  for (const char of String(character?.id ?? "")) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return hash % count;
}
