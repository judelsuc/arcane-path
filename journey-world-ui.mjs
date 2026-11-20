import { importAgenda, encounterAgenda, acknowledgeEncounter, emptyEncounterState } from "./layers/living-world/agenda.mjs";
import { journeyTransportOptions, transitActive } from "./journey-world.mjs";
import { hitchhikingAvailable, hitchhikingActive, hitchhikingDestinations, hitchhikingStopChance } from "./hitchhiking.mjs";

/**
 * Plain sentences for an active booking: where the traveller waits and for how
 * long, or which stop comes next on board. Times are journey-clock UTC.
 */
export function transitNarration(booking, nowMillis, t, clock) {
  const minutes = at => Math.max(0, Math.ceil((at - nowMillis) / 60000));
  if (!booking.paid) {
    return [t("worldWaiting", { stop: booking.offer.from.name, time: clock(booking.offer.departureAt),
      minutes: minutes(booking.offer.departureAt) }), t("worldWaitingHow")];
  }
  const next = booking.calls[booking.nextCall];
  return [t("worldRiding", { to: booking.offer.to.name, time: clock(booking.offer.arrivalAt),
    minutes: minutes(booking.offer.arrivalAt) }),
  ...(next ? [t("worldNextStop", { stop: next.stop.name, time: clock(next.arrivalAt) })] : [])];
}

/** One sentence on what the last press of “continue” did. */
export function transitStepSummary(before, after, t) {
  const passed = Math.round(after.elapsedMinutes - before.elapsedMinutes);
  const booking = after.transport?.booking;
  if (booking?.status === "arrived") return t("worldStepArrived", { to: booking.offer.to.name, minutes: passed });
  if (booking?.status === "cancelled") return t("worldStepCancelled");
  if (booking?.status === "interrupted") return t("worldStepInterrupted", { minutes: passed });
  if (booking?.paid && !before.transport?.booking?.paid) return t("worldStepBoarded", { minutes: passed });
  return t(booking?.paid ? "worldStepRiding" : "worldStepWaited", { minutes: passed });
}

export function setupJourneyWorld(t, { context, saveEncounters, reserve, advance, cancel,
  hitchhike, resumeHitchhiking, fetcher = fetch }) {
  const $ = id => document.querySelector(`#${id}`);
  const dialog = $("journey-world-dialog");
  let agenda, payload, offers = [], selected, loading = false, error = "", coverage = "";
  let controller, generation = 0;
  let searchedDay;
  let hitchPayload, hitchSelected;
  let stepSummary = "";
  const hitchSection = hitchhike ? document.createElement("section") : null;
  if (hitchSection) $("journey-world-transports").before(hitchSection);
  const language = () => document.documentElement.lang === "en" ? "en" : "fr";
  const date = at => new Intl.DateTimeFormat(language() === "en" ? "en-GB" : "fr-FR",
    { timeZone: "UTC", dateStyle: "short", timeStyle: "short" }).format(new Date(at)) + " UTC";
  const agendaContext = current => ({ journey: current.state,
    position: { lat: current.info.latitude, lon: current.info.longitude } });
  function button(text, callback, disabled = false) {
    const node = document.createElement("button");
    node.type = "button"; node.textContent = text; node.disabled = disabled;
    node.addEventListener("click", callback);
    return node;
  }
  function link(text, url) {
    const node = document.createElement("a");
    node.textContent = text; node.href = url; node.target = "_blank"; node.rel = "noopener noreferrer";
    return node;
  }
  function update() {
    const current = context();
    $("open-journey-world").disabled = !current || current.busy || Boolean(current.state.ended);
    if (!current) return;
    let encounters = [], saturated = false;
    if (agenda && !current.state.ended) {
      const found = encounterAgenda(agenda, agendaContext(current), current.state.worldEncounters ??
        emptyEncounterState(current.state));
      encounters = found.encounters;
      saturated = found.saturated;
      if (JSON.stringify(found.state) !== JSON.stringify(current.state.worldEncounters)) saveEncounters(found.state);
    }
    const unread = encounters.filter(entry => !entry.acknowledged).length;
    $("journey-world-notice").textContent = saturated ? t("worldSaturated")
      : unread ? t("worldActive", { count: unread }) : "";
    if (!dialog.open) return;
    $("journey-world-title").textContent = t("worldTitle");
    $("journey-world-help").textContent = t("worldHelp");
    $("journey-world-refresh").textContent = t("worldRefresh");
    $("journey-world-refresh").disabled = loading || current.busy || transitActive(current.state);
    $("journey-world-error").textContent = error;
    $("journey-world-status").textContent = loading ? t("worldLoading") : !payload && !agenda ? t("worldUnloaded") : "";
    $("journey-world-coverage").textContent = coverage;
    if (hitchhike) {
      hitchSection.replaceChildren();
      const title = document.createElement("h3");
      title.textContent = t("hitch.title"); hitchSection.append(title);
      const ride = current.state.hitchhiking;
      if (ride) {
        const result = document.createElement("p");
        result.setAttribute("role", "status");
        result.textContent = t(`hitch.${ride.outcome}`, { town: ride.destination.name,
          money: (ride.stolenCents / 100).toFixed(2), injury: ride.injury });
        hitchSection.append(result);
      }
      if (hitchhikingActive(current.state)) {
        const pending = document.createElement("p");
        pending.textContent = t(current.busy ? "hitch.mapLoading" : "hitch.pending");
        hitchSection.append(pending,
          button(t("hitch.retry"), () => run(() => resumeHitchhiking()), current.busy),
          button(t("hitch.stay"), () => run(() => resumeHitchhiking(true)), current.busy));
      } else if (!hitchhikingAvailable(current.cell)) {
        const note = document.createElement("p"); note.textContent = t("hitch.roadOnly"); hitchSection.append(note);
      } else {
        const rules = document.createElement("p");
        rules.textContent = t("hitch.rules", { chance: Math.round(hitchhikingStopChance(current.state, current.info) * 100) });
        hitchSection.append(rules);
        if (hitchPayload?.col === current.state.col && hitchPayload?.row === current.state.row) {
          const towns = hitchhikingDestinations(hitchPayload, current.state, current.gridId);
          const label = document.createElement("label"), select = document.createElement("select");
          label.textContent = t("hitch.destination");
          select.setAttribute("aria-label", t("hitch.destination"));
          for (const town of towns) {
            const option = document.createElement("option");
            option.value = town.id; option.textContent = `${town.name} · ${(town.distanceMeters / 1000).toFixed(1)} km`;
            select.append(option);
          }
          if (!towns.some(town => town.id === hitchSelected)) hitchSelected = towns[0].id;
          select.value = hitchSelected;
          select.addEventListener("change", () => { hitchSelected = select.value; });
          select.disabled = loading || current.blocked;
          label.append(select);
          hitchSection.append(label, button(t("hitch.attempt"),
            () => run(() => hitchhike(towns.find(town => town.id === hitchSelected))), loading || current.blocked));
          hitchSection.append(link(t("hitch.source"), "https://www.geonames.org/"));
        } else {
          const note = document.createElement("p"); note.textContent = t("hitch.unloaded"); hitchSection.append(note);
        }
      }
    }
    const events = $("journey-world-events");
    events.replaceChildren();
    const clock = current.state.startedAt + current.state.elapsedMinutes * 60000;
    if (agenda) {
      const heading = document.createElement("li");
      const provenance = document.createElement("p");
      provenance.className = "technical-text";
      provenance.textContent = t("worldDates", { date: date(clock), imported: date(agenda.importedAt) });
      provenance.append(link(t("worldLicense"), "https://www.etalab.gouv.fr/wp-content/uploads/2014/05/Licence_Ouverte.pdf"));
      heading.append(provenance);
      events.append(heading);
      const published = agenda.records.filter(record => record.kind === "event" && record.endsAt > clock);
      if (!published.length) {
        const empty = document.createElement("li"); empty.textContent = t("worldNoEvents"); events.append(empty);
      }
      for (const record of published.slice(0, 32)) {
        const item = document.createElement("li"), text = document.createElement("p");
        const active = encounters.find(entry => entry.key === record.key);
        text.textContent = `${record.title[language()]} — ${date(record.startsAt)} – ${date(record.endsAt)} · ` +
          `${active ? t("worldHere") : t("worldPublished")}`;
        const source = document.createElement("p");
        source.className = "technical-text";
        source.textContent = `${record.area.lat}, ${record.area.lon} · ` +
          t("worldValidity", { observed: date(record.source.observedAt), expires: date(record.source.validUntil) });
        source.append(link(record.source.name, record.source.url));
        item.append(text, source);
        if (active) item.append(button(t(active.acknowledged ? "worldRead" : "worldAcknowledge"), () => {
          const now = context();
          saveEncounters(acknowledgeEncounter(agenda, agendaContext(now), now.state.worldEncounters, record.key));
          update();
        }, active.acknowledged || current.busy));
        events.append(item);
      }
    }
    const list = $("journey-world-transports");
    list.replaceChildren();
    const booking = current.state.transport?.booking;
    if (hitchhikingActive(current.state)) return;
    if (booking) {
      const status = document.createElement("p");
      status.textContent = t("worldBooking", { from: booking.offer.from.name, to: booking.offer.to.name,
        status: t(`worldRide.${booking.status}`), paid: (booking.paid ? booking.offer.fareCents / 100 : 0).toFixed(2) });
      list.append(status);
      if (stepSummary) {
        const summary = document.createElement("p");
        summary.className = "journey-world-step";
        summary.setAttribute("role", "status");
        summary.textContent = stepSummary;
        list.append(summary);
      }
      if (transitActive(current.state)) {
        const clock = at => new Intl.DateTimeFormat(language() === "en" ? "en-GB" : "fr-FR",
          { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }).format(new Date(at));
        for (const sentence of transitNarration(booking,
          current.state.startedAt + current.state.elapsedMinutes * 60000, t, clock)) {
          const line = document.createElement("p");
          line.className = "journey-world-transit";
          line.textContent = sentence;
          list.append(line);
        }
        list.append(button(t("worldAdvance"), () => run(async () => {
          const before = context()?.state;
          await advance();
          const after = context()?.state;
          stepSummary = before && after ? transitStepSummary(before, after, t) : "";
        }), current.busy));
        if (!booking.paid) list.append(button(t("worldCancel"), () => { stepSummary = ""; return run(cancel); }, current.busy));
        return;
      }
    }
    if (payload && payload.col === current.state.col && payload.row === current.state.row) {
      try { offers = journeyTransportOptions(payload, current.state, current.gridId).offers; }
      catch (reason) { console.error("Journey transport offers failed:", reason); error = reason.message; $("journey-world-error").textContent = error; offers = []; }
      const note = document.createElement("p");
      note.className = "window-help-text";
      note.textContent = t("worldTransportLimits");
      list.append(note);
      for (const stop of payload.nearbyStops ?? []) {
        const position = document.createElement("p");
        position.textContent = t("worldStop", { name: stop.name, col: stop.col, row: stop.row });
        list.append(position);
      }
      for (const source of payload.coverage) {
        const credit = document.createElement("p");
        credit.className = "technical-text";
        credit.append(link(`${source.provider} · ${source.serviceDate}`, source.source),
          link(t("worldLicense"), source.license));
        list.append(credit);
      }
      if (!offers.length) { const empty = document.createElement("p"); empty.textContent = t("worldNoTransport"); list.append(empty); }
      for (const offer of offers.slice(0, 24)) {
        list.append(button(`${offer.from.name} → ${offer.to.name} · ${date(offer.departureAt)} – ${date(offer.arrivalAt)} · ` +
          `${(offer.fareCents / 100).toFixed(2)} EUR`,
        () => { selected = offer; update(); }, current.busy || current.blocked));
        const origin = document.createElement("p");
        origin.className = "technical-text";
        origin.textContent = t(offer.serviceKind === "fictional-service" ? "worldFictional" : "worldReal");
        list.append(origin);
      }
      if (selected && offers.some(offer => offer.id === selected.id)) {
        const notice = document.createElement("p");
        notice.textContent = t("worldConfirm", { from: selected.from.name, to: selected.to.name,
          wait: Math.ceil(selected.waitMinutes), ride: Math.ceil(selected.rideMinutes),
          fare: (selected.fareCents / 100).toFixed(2) });
        list.append(notice, button(t("worldReserve"), () => run(() => {
          const feed = [...payload.realFeeds, ...(payload.fictionalFeed ? [payload.fictionalFeed] : [])]
            .find(feed => feed.id === selected.feedId);
          stepSummary = "";
          reserve(feed, selected.id);
          selected = undefined;
        }), current.busy || current.blocked || current.state.walletCents < selected.fareCents));
      }
    }
  }
  async function run(action) {
    let epoch = generation;
    try { error = ""; const pending = action(); epoch = generation; await pending; }
    catch (reason) {
      if (epoch !== generation) return;
      console.error("Journey world action failed:", reason); error = reason.message;
    }
    if (epoch === generation) update();
  }
  async function request(url, signal) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const response = await fetcher(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]) });
      if (response.status === 202) { await new Promise(resolve => setTimeout(resolve, 1000)); continue; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      return data;
    }
    throw new Error(t("worldTimeout"));
  }
  async function refresh() {
    const current = context();
    if (!current || current.busy || transitActive(current.state)) return;
    controller?.abort(); controller = new AbortController();
    const signal = controller.signal, epoch = ++generation;
    const day = new Date(current.state.startedAt + current.state.elapsedMinutes * 60000).toISOString().slice(0, 10);
    loading = true; agenda = payload = hitchPayload = undefined; selected = undefined; coverage = ""; update();
    const results = await Promise.allSettled([
      request(`/api/living-world?${new URLSearchParams({ lat: current.info.latitude.toFixed(2),
        lon: current.info.longitude.toFixed(2) })}`, signal),
      request(`/api/journey-transport?${new URLSearchParams({ region: current.gridId,
        col: current.state.col, row: current.state.row,
        day })}`, signal),
      ...(hitchhike && hitchhikingAvailable(current.cell) ? [
        request(`/api/hitchhiking?${new URLSearchParams({ region: current.gridId,
          col: current.state.col, row: current.state.row })}`, signal)] : []),
    ]);
    if (epoch !== generation) return;
    const latest = context();
    if (!latest || latest.state.col !== current.state.col || latest.state.row !== current.state.row ||
        latest.state.startedAt !== current.state.startedAt) { loading = false; throw new Error(t("worldBlocked")); }
    loading = false;
    const failures = [];
    if (results[2]) {
      try {
        if (results[2].status === "rejected") throw results[2].reason;
        hitchhikingDestinations(results[2].value, current.state, current.gridId);
        hitchPayload = results[2].value;
      } catch (reason) { failures.push(`${t("hitch.title")}: ${reason.message}`); }
    }
    try {
      if (results[0].status === "fulfilled") {
        agenda = importAgenda(results[0].value);
        coverage = t("worldCoverage", { records: agenda.records.length,
          total: results[0].value.coverage?.matchingRows ?? "?" });
      } else failures.push(String(results[0].reason));
      if (results[1].status === "fulfilled") {
        journeyTransportOptions(results[1].value, current.state, current.gridId);
        payload = results[1].value;
        searchedDay = day;
      } else failures.push(String(results[1].reason));
    } catch (reason) { console.error("Invalid journey world data:", reason); failures.push(reason.message); }
    if (failures.length) throw new Error(failures.join(" · "));
  }
  $("journey-world-refresh").addEventListener("click", () => run(refresh));
  $("open-journey-world").addEventListener("click", () => {
    const current = context();
    if (!current || current.busy || current.blocked && !transitActive(current.state) || document.querySelector("dialog[open]")) return;
    dialog.showModal();
    update();
    if (!loading && !transitActive(current.state) &&
        (!payload || payload.col !== current.state.col || payload.row !== current.state.row ||
          searchedDay !== new Date(current.state.startedAt + current.state.elapsedMinutes * 60000).toISOString().slice(0, 10))) return run(refresh);
  });
  return { update, reset() {
    generation++; controller?.abort(); loading = false; agenda = payload = selected = hitchPayload = hitchSelected = undefined;
    searchedDay = undefined;
    stepSummary = "";
    error = coverage = ""; offers = []; $("journey-world-notice").textContent = ""; dialog.close();
  } };
}
