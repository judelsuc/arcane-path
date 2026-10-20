const validName = name => typeof name === "string" && name.trim() === name &&
  name.length > 0 && name.length <= 120 && !/[\u0000-\u001f<>]/.test(name);

export function recordJourneyVisit(state, cell) {
  if (!state || state.ended) return state;
  const names = (cell?.settlements ?? []).map(place => place.name?.trim()).filter(validName);
  const visits = [...(state.journeyVisits ?? [])];
  for (const name of names) {
    if (visits.some(visit => visit.name === name) || visits.length >= 128) continue;
    visits.push({ name, elapsedMinutes: state.elapsedMinutes });
  }
  return visits.length === (state.journeyVisits?.length ?? 0) ? state : { ...state, journeyVisits: visits };
}

export function validateJourneyVisits(state) {
  if (state?.journeyVisits === undefined) return;
  if (!Array.isArray(state.journeyVisits) || state.journeyVisits.length > 128 ||
      state.journeyVisits.some(visit => !visit || !validName(visit.name) ||
        !Number.isFinite(visit.elapsedMinutes) || visit.elapsedMinutes < 0 ||
        visit.elapsedMinutes > state.elapsedMinutes) ||
      new Set(state.journeyVisits.map(visit => visit.name)).size !== state.journeyVisits.length) {
    throw new Error("Invalid saved journey visits.");
  }
}

export function closingJourneyVisits(state) {
  const records = [
    ...(state.journeyVisits ?? []),
    ...(state.trail?.origin?.name ? [{ name: state.trail.origin.name, elapsedMinutes: 0 }] : []),
    ...(state.hospitalityAttempts ?? []).filter(attempt => !attempt.placeKind).map(attempt =>
      ({ name: attempt.townName, elapsedMinutes: attempt.startedMinutes })),
  ].filter(visit => validName(visit.name) && Number.isFinite(visit.elapsedMinutes) &&
    visit.elapsedMinutes >= 0 && visit.elapsedMinutes <= state.elapsedMinutes)
    .sort((a, b) => a.elapsedMinutes - b.elapsedMinutes);
  const known = new Set();
  return records.filter(visit => {
    if (known.has(visit.name)) return false;
    known.add(visit.name);
    return true;
  }).slice(0, 32).map(visit => ({ name: visit.name, elapsedMinutes: Math.round(visit.elapsedMinutes) }));
}
