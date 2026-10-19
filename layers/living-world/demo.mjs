/** Deliberately fictional; never imported unless the preview user chooses demo. */
export function syntheticAgenda(startedAt) {
  const source = { id: "demo", name: "Synthetic demo / Démonstration fictive",
    url: "https://example.invalid/living-world-demo", observedAt: startedAt,
    validUntil: startedAt + 86400000 };
  const common = { reality: "synthetic", startsAt: startedAt, endsAt: startedAt + 3600000,
    area: { lat: 45.19, lon: 5.72, radiusMeters: 1000 }, source };
  return { version: 1, importedAt: startedAt, records: [
    { ...common, id: "fictional-market", kind: "event",
      title: { fr: "Marché imaginaire : la place s’anime", en: "Imaginary market: the square comes alive" } },
    { ...common, id: "fictional-delay", kind: "disruption",
      title: { fr: "Car fictif : retard de 15 minutes", en: "Fictional coach: 15-minute delay" },
      transport: { routeId: "demo-coach", delayMinutes: 15 } },
  ] };
}
