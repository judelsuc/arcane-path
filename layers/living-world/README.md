# Layer 18: living calendar and local agenda

Connected standalone preview using the original canonical agenda and existing
transport explorer/hybrid. No changes to normal journey saves, health, rewards
or travel rules. `agenda.mjs` remains the single active-selection mechanism.

## Connected public sources (R-122)

Run the normal travel server, then open the preview from the game's Options.
The explicit search uses `/api/living-world?lat=...&lon=...`, backed by the
public OpenAgenda dataset on Opendatasoft under Open Licence 1.0. Entered
coordinates are rounded to 0.01 degrees before being sent to the provider.
No player name, save, private notes or itinerary is submitted.

Requests are limited to 64 source rows, 128 normalized occurrences, 4 MB,
20 km and seven days. A separate one-worker/four-job queue avoids blocking map
downloads. Successful results are checksum-cached for six hours across restarts;
observations expire for encounters after 24 hours. Provider failures are visible,
not replaced with fictional events. Rejected rows and truncation are reported.
The catalogue is contributor-dependent, not complete European coverage.
Original French-field titles are retained in both UI languages, not falsely
presented as translated. Source times/links and reuse licence remain visible.
The 1 km encounter radius is an explicit preview rule, not an event footprint.

OpenAgenda publicity images are not requested or republished: a credit alone
does not establish image reuse permission. The photo button explicitly searches
Commons within 2 km, reusing the game's metadata adapter, and displays only
attributed CC BY/CC BY-SA/CC0/public-domain-mark candidates. These are labelled
**illustrative nearby photographs**, never evidence of the event. Missing
photos or photo-source failures do not hide valid events.

The transport link reuses the verified European catalogue (1,732 feeds in
41 countries, gaps shown across the 47-country scope), six dated samples and
the already implemented real-first Grenoble-Lyon/fictional-coach preview.
These are sourced dated schedules, not live service/disruption guarantees;
normal online journey boarding is not enabled by this preview.

## Preview / Aperçu

Serve the **repository root** with the normal travel server, then visit
`/layers/living-world/preview.html`. ES modules require HTTP, not `file:`.
The preview starts a new journey at the actual opening instant and displays UTC,
using the existing `journeyDate` and `agendaClock` conventions. Only the explicit
30-minute action advances it. FR/EN language selection, area switching, source
provenance and acknowledgement are interactive. Waiting has no effect.

The default is **no imported data**, not a false claim of no local activity.
The deliberately fictional demonstration requires a separate button and labels
every record fictional. Its URL is reserved `example.invalid`, not a real source.
It expires after one simulated hour. Preview state is memory-only and never
touches the existing game's save.

## Explicit public import adapter

`importAgenda(input)` accepts an offline JSON document supplied by a trusted
operator/user who has permission to reuse that public source. No built-in real
events are embedded in the offline adapter itself. It validates structure and bounds,
**not the truth, licensing or editorial reliability of supplied claims**. Check
the original source before import. Do not import private/user data.

```js
{
  version: 1,
  importedAt: 1792368000000, // UTC epoch milliseconds, operator import time
  records: [{
    id: "stable-provider-occurrence-id",
    kind: "event", // or "disruption"
    reality: "public", // "synthetic" requires {allowSynthetic:true}
    title: {fr: "Titre fourni par la source", en: "Source-provided title"},
    startsAt: 1792368000000,
    endsAt: 1792371600000,
    area: {lat: 45.19, lon: 5.72, radiusMeters: 1000},
    source: {
      id: "stable-provider-id",
      name: "Publisher name",
      url: "https://publisher.example/event", // replace with actual public page
      observedAt: 1792368000000,
      validUntil: 1792454400000
    }
  }]
}
```

The above is a **schema illustration, not a factual agenda**. Source URL must be
HTTPS without credentials; time fields must be finite epoch milliseconds.
Geo coordinates use WGS84; the affected radius is explicitly supplied, not inferred
from title, town name or map cells. Convert map position to `{lat, lon}` at the
integration boundary. Source observation cannot postdate import. Validity lasts
at most seven days; stale records require explicit refreshed import.

Limits: 128 records, 256 KiB serialized JSON, 240 characters per title/source name,
80-character stable IDs, 50 km radius, 62-day event window, 1440-minute maximum
delay. Invalid input fails atomically with an error; no silent clipping,
fabricated dates, geocoding or unknown-timezone assumptions. Records and nested
objects are copied, normalized, deterministically sorted and frozen.

## Integration exports

```js
import {
  importAgenda, calendar, localAgenda, transportDisruptions,
  emptyEncounterState, restoreEncounterState, encounterAgenda, acknowledgeEncounter,
} from "./layers/living-world/agenda.mjs";

const agenda = importAgenda(operatorSuppliedJSON);
const context = {journey, position: {lat, lon}};
const clock = calendar(journey, "fr"); // existing startedAt + elapsedMinutes
const result = encounterAgenda(agenda, context, savedLivingWorld);
savedLivingWorld = result.state;
// Display result.encounters (localized record.title.fr/en and source metadata).
// On an explicit player acknowledgement:
savedLivingWorld = acknowledgeEncounter(agenda, context, savedLivingWorld, record.key);
const notices = transportDisruptions(agenda, context);
```

`localAgenda` is the authoritative active selection: half-open `[startsAt, endsAt)`,
source observation <= simulated now < source validity, within great-circle
radius. Expired, upcoming, stale, future-observed and out-of-area records cannot
create encounters or projected disruption effects. Acknowledgement does **not**
cancel a transport disruption. No random draws or wall-time reads occur.
In particular, importing today's data into a past simulated journey will not
retroactively create events before their observation.

Persist `result.state` in a future **versioned save integration**; that shared
schema is deliberately not changed here. JSON round-trips are supported through
`restoreEncounterState` and checked against the journey's original start.
Occurrence identity is the JSON tuple `[source.id, record.id, startsAt]`; refreshed
titles or source freshness do not replay an encounter. Providers must retain
stable IDs. Entries remember first seen simulated minute and acknowledged flag.
There is no hidden stat/reward effect to replay. Limit: 128 saved occurrences;
at capacity history is not evicted, new encounters are omitted and `saturated`
is true. A future save migration can extend this bounded policy explicitly.
An invalid/mismatched save is an error, never silently reset. Imported agendas
can be serialized, but must pass `importAgenda` again when restored.

## Transport boundary (agreed with transport implementation)

Canonical `kind: "disruption"` records additionally carry:

```js
transport: {routeId: "provider-route", delayMinutes: 15}
// OR {tripId: "provider-trip", stopId: "provider-stop", cancelled: true}
```

At least one of `tripId`, `routeId`, `stopId` is required. IDs must match the
transport dataset; no name guessing or global cancellation. Exactly one of
`cancelled: true` or a finite nonnegative `delayMinutes` is permitted.
`transportDisruptions` returns only the active local projection:
`{id, startsAt, endsAt, tripId?, routeId?, stopId?, cancelled? | delayMinutes?}`.
Transport evaluates the half-open notice at **scheduled departure** and applies
its own selector matching. Projection windows are intersected with source freshness
(`startsAt >= observedAt`, `endsAt <= validUntil`), so a later departure cannot
reuse an expired source observation. Source and geographic metadata remain on the canonical
record; the projection is not another ingestion source. Recompute after every
simulated time or position change; do not cache across player actions.

This milestone deliberately projects **current** notices only. Future journey
planning, route-wide disruption scope, recurrence, GTFS service calendars,
fares, route selection, DST conversion and timetable imports belong to transport
or later integration. No infrastructure changes are included.

## Tests

`node --test tests/living-world.test.mjs tests/agenda-clock.test.mjs`

Covers UTC midnight/start/no idle advancement; real-vs-demo import boundaries;
required source metadata; atomic bounds/immutability; temporal/source/geographic
exclusions; antimeridian/poles; deterministic JSON-save acknowledgement;
bounded ledger; scoped transport projection and malformed disruptions.
The preview module is exercised with a minimal DOM harness (FR/EN, absence,
fiction opt-in, acknowledgement, area switching, expiry, import failure).
