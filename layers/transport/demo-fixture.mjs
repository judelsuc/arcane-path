// Deliberately imaginary stops, prices and times. Never enable as live service.
export function demoTimetable() {
  const call = (stopId, time) => ({ stopId, arrival: `2026-10-18T${time}:00+02:00`,
    departure: `2026-10-18T${time}:00+02:00`,
    arrivalServiceSeconds: Number(time.slice(0, 2)) * 3600 + Number(time.slice(3)) * 60,
    departureServiceSeconds: Number(time.slice(0, 2)) * 3600 + Number(time.slice(3)) * 60 });
  return { version: 1, id: "imaginary-demo", revision: "1", gridId: "imaginary-grid",
    kind: "synthetic-demo", timeZone: "Europe/Paris", validFrom: "2026-10-18", validThrough: "2026-10-18",
    source: { name: "Synthetic preview, not a real operator", reference: "local:imaginary-demo" },
    stops: [{ id: "a", name: "Demo A", col: 0, row: 0 },
      { id: "b", name: "Demo B", col: 3, row: 1 }, { id: "c", name: "Demo C", col: 7, row: 2 }],
    trips: [
      { id: "demo-bus", routeId: "fiction-bus", mode: "bus", currency: "EUR", fareCents: 240,
        serviceDate: "2026-10-18", calls: [call("a", "10:02"), call("b", "10:06"), call("c", "10:10")] },
      { id: "demo-train", routeId: "fiction-train", mode: "train", currency: "EUR", fareCents: 520,
        serviceDate: "2026-10-18", calls: [call("a", "10:04"), call("c", "10:08")] },
    ] };
}
export function demoJourney() {
  return { col: 0, row: 0, startedAt: Date.parse("2026-10-18T10:00:00+02:00"),
    elapsedMinutes: 0, walletCents: 1000, fatigue: 20, energyKcal: 0, reserveKcal: 100,
    awakeHours: 0, distanceMeters: 0, ended: null };
}
