# Public transport — bounded standalone milestone

Design: PDF layer 18 (real calendar, disruptions, buses/trains), R112 (paid
travel trading money/time for less effort), and R125 (real European routes).
The reducer accepts a validated, supplied, finite schedule. **No transport
is activated or deployed in the main journey.** Real source acquisition now
exists separately: [European catalogue, imports and attribution](../../data/transport/README.md).
The old gameplay preview below remains conspicuously synthetic and is
rejected without explicit demo opt-in. The new [source explorer](routes.html)
shows actual imported schedules and provider gaps, not playable live boarding.
The [hybrid preview](hybrid.html) demonstrates actual SNCF Grenoble-Lyon trips
and explicitly fictional coach fallback under R126. It is still standalone.

## Preview / aperçu FR + EN

Serve the repository with an existing static server and visit
`layers/transport/preview.html`. The page switches French/English, offers
bus/train departures from the current mapped cell, books, advances simulated
minutes, displays actual reached vehicle stops, demonstrates hunger stopping
arrival, cancellation/delay and local preview save/resume. Its 1 kcal/minute
metabolism is a **preview stub**, not the game's survival model.

Focused tests: `node --test tests/transport*.test.mjs` (engine, actual host
settlement integration, and FR/EN preview event-wiring DOM smoke test).

## Supplied timetable contract

`importTimetable(json)` validates and freezes a detached copy. Version 1:

```js
{
  version: 1, id: "provider-feed", revision: "immutable-content-revision",
  kind: "supplied", gridId: "exact-map-grid-identity",
  timeZone: "Europe/Paris", validFrom: "2026-10-18", validThrough: "2026-10-18",
  source: { name: "Actual supplier", reference: "actual source identifier" },
  stops: [{ id: "supplied-id", name: "Supplied stop", col: 12, row: 18 }, /* ... */],
  trips: [{
    id: "unique-dated-trip-id", routeId: "supplied-route", mode: "bus", // or train
    serviceDate: "2026-10-18", currency: "EUR", fareCents: 240,
    calls: [{
      stopId: "supplied-id",
      arrival: "2026-10-18T10:02:00+02:00",
      departure: "2026-10-18T10:02:00+02:00",
      arrivalServiceSeconds: 36120, departureServiceSeconds: 36120,
    }, /* at least one later supplied stop */],
  }],
}
```

Values above illustrate the schema, **not an actual route or fare**. Use
`demoTimetable()` only with `importTimetable(data, {allowDemo:true})` in a
standalone preview/test. Do not enable demo import in live offers.

This is an importer for **normalized, GTFS-derived dated schedules**, not
a raw GTFS ZIP/CSV parser. Supplier preprocessing must resolve calendar and
calendar_dates exceptions, route types (bus/train only), stop pickup/access
restrictions, fare policy, grid projection and service-day timezone ambiguities.
Optional call `pickupType`/`dropOffType` accept GTFS values 0-3; omitted means 0
for older supplied schedules. Only 0 creates ordinary boarding/alighting offers;
restricted calls can remain intermediate stops. Every dated trip must come
from the supplier; no inferred connection, daily recurrence or network fallback
exists here. A preprocessing step can supply explicitly labelled game fares,
never silently claim these as operator tariffs.

Normalized `*ServiceSeconds` are civil wall-clock seconds from local service
date (up to, but excluding, 72h). After-midnight calls use 24h+, never silently
move to another service day. Preprocessing **must convert raw GTFS time
semantics** to these normalized values and explicit offset-bearing instants,
especially around DST. Import checks the offset's actual IANA local wall
date/time, rejects nonexistent spring times, accepts explicitly resolved
autumn folds, and enforces chronological instants. Missing offsets,
invalid calendar dates, fractional cents, unknown stops and invalid zones
are errors. Revision must change whenever schedule, fare, mapping or source
changes. EUR only; whole-trip fare also applies to intermediate boarding.
Official segment fares would require correctly priced trip expansion.
The real-source importer currently uses fictional fixed boarding fares,
not official fare-rule parsing. It supplies `trip.fare` (`kind:"estimated-game"`,
`policy`, `currency`, `cents`) and nonempty `feed.fareNotice`; these must agree
with `fareCents`. Offers preserve `fareKind`, `fareNotice` and `timingQuality`
for honest host presentation. Source approximate timepoints are not exact times.

## Integration API (not activated)

```js
const feed = importTimetable(suppliedData);
const options = {gridId: currentGridIdentity, disruptions};
const offers = transportOffers(feed, journey, options);
const booked = bookTransit(feed, journey, offers[0].id, options);
const next = advanceTransit(feed, booked, booked.transport.booking.id, {
  ...options,
  settle(previous, proposed, metadata) {
    // REQUIRED: run the game's awake basal/hunger/health/sleep metabolism
    // for metadata.minutes on proposed, preserving its charged wallet.
    // Then return finishAction(previous, metabolized, info, economy,
    //   {survival, sheltered: metadata.sheltered, activity: metadata.activity});
    return hostSettle(previous, proposed, metadata);
  },
});
```

### Hybrid real-first selection

`hybridTransportOffers({realFeeds, fictionalFeed}, journey, options)` returns
`{offers, staleFeedIds, notice}`. Real inputs must be normal supplied schedules;
synthetic demos are rejected. The optional fictional input must use the
separate `kind:"fictional-service"` and explicit
`importTimetable(data, {allowFictional:true})` opt-in.

The [offline generator](../../scripts/transport_fictional.py) produces finite,
deterministic fictional bus schedules from attributed real towns and a specific
map/day/timezone. It does not invent rail infrastructure or assert road routing.
Full policy, bounds and balancing formulas are in the
[data documentation](../../data/transport/README.md).

Real coverage suppresses fictional offers for the same origin/destination cells
on the supplied service day, including missed/cancelled real trips. Expired
sources are listed explicitly, while invalid data and grid errors are thrown.
This is loaded-data coverage, not a claim that no other real service exists.
The hybrid result is not an automatic all-Europe data downloader.

Every offer carries `feedId` and `serviceKind`. Book and advance with that exact
canonical timetable. Do not recompute/switch feeds during a booking. Fictional
offers/itineraries retain `serviceNotice`, `geographyKind:"abstract-town-link"`,
`timingQuality:"fictional-estimate"` and an estimated fare. These labels must be
displayed by the host. Ride records and `transportRouteView` retain the fictional
classification so an abstract connection is not rendered as verified road/rail
geometry. The existing one-charge, minute settlement, interruption and
save/revision rules apply equally to both service kinds.

`settle` is a **required pure synchronous callback**, called in chunks of at
most one simulated minute (fractional minutes supported). `proposed` already
contains the advanced time and any boarding charge; do not advance time or
charge the fare twice. It adds no sleep, fatigue recovery, walking energy,
or duplicate survival rules. Waiting is exposed; riding sheltered, awake,
and zero *transport-added* fatigue. Basal metabolism and host consequences
must still run when hungry. Host may use lower time resolution if it needs
exact sub-minute terminal thresholds. `ended`, fainting, placement or host
position changes stop the ride before any next-stop displacement.
An optional `isInterrupted(previous,result)` supports additional host outcomes.
The parent's health-100, starvation-10h, fed-sleep-5h and hunger-slowdown rules
belong to that host callback; they are deliberately not copied here.
`ended: "health"` is handled like every other terminal outcome.

Every advance call performs one bounded step; persist each returned state.
Charge happens **once at boarding**, not reservation. A cancelled or
interrupted wait is uncharged. Paid in-flight disruptions do not teleport,
refund or invent a diversion: the frozen itinerary continues unless host
settlement interrupts it. Coordinates change only at a supplied reached stop
after successful settlement. Between stops the saved map coordinate is the
last reached stop (not a fabricated vehicle position). `distanceMeters`,
ascent and walking effort remain untouched.

`TransportError.code`: explicit `UNKNOWN_SERVICE_DATE`, `UNKNOWN_SERVICE`,
`GRID_MISMATCH`, `SERVICE_UNAVAILABLE_OR_STALE`, `STALE_BOOKING`,
`STALE_TIMETABLE`, `STALE_JOURNEY_CLOCK`, `INSUFFICIENT_FUNDS`,
`JOURNEY_ENDED`, plus `INVALID_*` validation errors. Empty offers **inside**
coverage mean no supplied departure from this cell, never a fabricated one.
Booking quotes are recalculated at reservation. Before boarding, cancelled
or changed-delay bookings close uncharged and require a fresh offer.

### Agenda disruption adapter (agreed with layer 18)

Transport does not ingest local agenda or fetch external notices. Pass
the layer-18 projection as:

```js
[{ id: "source-notice", startsAt: 1792300000000, endsAt: 1792303600000,
   tripId: "optional", routeId: "optional", stopId: "optional",
   cancelled: true /* OR delayMinutes: nonnegative integer */ }]
```

Epoch milliseconds UTC, half-open `[startsAt,endsAt)`, matched against the
**scheduled departure**. Defined selectors all must match. A selectorless
notice applies feed-wide; layer 18 deliberately requires selectors at its
ingestion boundary. Duplicated IDs/malformed notices are errors. Overlapping
delays take the maximum reported total, not their sum; cancellation wins.
Supply a consistent notice snapshot for the queried departures (including
known future notice windows), not merely currently active wall-clock notices.

### Save/resume, replay and path

Persist `journey.transport` atomically with the rest of the journey, and run
`validateTransportSave(journey)` on load. A monotonic booking sequence,
active status, paid flag, call index and exact progress clock prevent repeat
settlement/charges when continuing the latest saved state. Advance rechecks
the canonical schedule and mapped stops against the saved itinerary.
Different revision requires cancellation/rebooking by the host; no silent
schedule substitution. Integrators must serialize state mutations and use
their existing save revision/CAS protection: like all pure journey reducers,
this module cannot prevent replay of an entire **older** journey save, or
double execution of external effects inside an impure callback.

`transportRouteView(journey)` returns separate `walkedLegs` and typed `rides`
with only actually reached points. Boarding archives the current walked map;
each reached transport stop starts a new partial walked map, so existing
walking geometry cannot draw the ride as steps. The host's combined notebook
renderer must consume this API rather than interpreting these disconnected
legs or partial-map stop connections as one walked line. No shared renderer,
save schema, UI root, config or translation catalogue is changed here.

## Deliberate scope limits

No transfers/pathfinding, live network integration, seats/capacity,
on-demand services, partial fares, refunds, en-route rerouting, fare
concessions, automatic journey-cell discovery, main-menu activation or
deployment. This contract is finite supplied service, not unrestricted map
teleport. Provenance strings identify trusted supplied data; they do not
cryptographically certify the operator. Import and save trust/security remain
the host's responsibilities. The separate Python importer now provides raw GTFS
parsing, geographic stops and normalization for reviewed real feeds.
Subsequent activation still needs current locally relevant data,
save/route rendering adapters, host settlement and UI.
