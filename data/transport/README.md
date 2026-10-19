# Real European transport sources

This is a **source acquisition milestone, not online journey activation**.
The real-route explorer is at
[`layers/transport/routes.html`](../../layers/transport/routes.html) when serving
the repository with an HTTP server. It supports French/English, country
selection, operator search, explicit gaps and attributed real-trip samples.
The older gameplay preview remains a separately labelled synthetic demo.

## What was actually obtained

The public [Mobility Database CSV v2](https://files.mobilitydatabase.org/feeds_v2.csv)
was retrieved on 19 October 2026. Its normalized European index contains
**1,732 GTFS feed entries across 41 country codes**, with explicit entries
for missing countries within the 47-country search scope. Europe is not
limited to EU membership: the UK, Switzerland, Norway, the Balkans and
eastern European countries are included.

[`europe-catalog.json`](europe-catalog.json) records source SHA-256, retrieval
time, operator names, catalogue status, public mirror, licence link and
catalogued bounding boxes. It is **not 1,732 downloaded or verified networks**.
Missing feeds do not imply missing transport. A bounding box does not establish
local coverage; 196 catalogue entries lack bounds and one has invalid upstream
bounds, explicitly marked rather than accepted as valid geography.
Geographic searches exclude these unlocated entries; country searches retain
them for manual investigation.

Six public archives were actually downloaded and imported for the supplied
service date **2026-10-19**, including weekday/exception calendars, not just
listed in an index:

| Country | Source / operator | Active imported routes | Stops | Dated trips |
|---|---|---:|---:|---:|
| France | `tdg-11492`, Transports Urbains du Bassin, Decazeville | 1 | 90 | 11 |
| Italy | `mdb-991`, ATP Nuoro | 14 | 312 | 241 |
| Poland | `mdb-2084`, MZK Wejherowo | 18 | 385 | 677 |
| Finland | `mdb-1127`, Kotka | 44 | 717 | 375 |
| United Kingdom | `mdb-1929`, Borders Buses | 19 | 1,273 | 430 |
| Poland | `mdb-2087`, Polregio railway | 3 | 1,921 | 2,259 |
| **Total** | **Six feeds, five countries** | **99** | **4,698** | **3,993** |

Stops are counted per feed, not deduplicated physical locations.
Counts describe this date and supported bus/rail modes, not every route an
operator runs. Each full import reported zero omitted trips for this day.
Italian, Finnish and British sample feeds contain **source-provided approximate
times**: these are preserved and labelled, not replaced with invented exact
times. No missing times are interpolated.

[`verified-feeds.json`](verified-feeds.json) records these measured counts,
archive hashes, source terms, retrieval timestamps and sample filenames.
The versioned [`samples/`](samples/) retain at most three **complete** actual
trips per feed, all imported active-route metadata, and the publisher's feed
information where provided. Samples explicitly say they are not the full
timetable. Raw ZIPs and full imported day timetables are not committed.
Use the import command below to retrieve a full supported feed.

## Reproduce / refresh

Use the project's existing Python environment (the compiler uses the existing
map projection and its PyYAML dependency). Discovery/import itself uses the
standard library. Run from the repository root:

```sh
python scripts/transport_sources.py refresh-catalog \
  --output data/transport/europe-catalog.json

# Public source metadata; does not download every archive.
python scripts/transport_sources.py search \
  --catalog data/transport/europe-catalog.json --country FR

# Bounding-box intersection, WEST SOUTH EAST NORTH.
python scripts/transport_sources.py search \
  --catalog data/transport/europe-catalog.json \
  --bounds 2.0 44.0 3.0 45.0

# Review THIS operator's reuse terms first. Date must be supplied by its feed.
python scripts/transport_sources.py import \
  --catalog data/transport/europe-catalog.json --feed tdg-11492 \
  --date 2026-10-19 --license-reviewed --output /tmp/tub-routes.json

# Optional --zip /path/to/already-downloaded.zip avoids another download.
# Optional repeated --route ROUTE_ID limits large feeds.
python scripts/transport_sources.py sample \
  --snapshot /tmp/tub-routes.json --trips 3 --output /tmp/tub-sample.json

# MAP is an existing generated map JSON with bounds/cellSizeMeters.
# GRID_ID must match the actual journey grid identity, not a guessed country.
python scripts/transport_sources.py compile \
  --snapshot /tmp/tub-routes.json --map /path/to/generated-map.json \
  --grid-id exact-journey-grid --output /tmp/tub-timetable.json
```

Mirror `latest.zip` is mutable: an operator may remove an old service day.
The sample archive hashes preserve which data were verified; reproducing a
historical day later requires that same archived ZIP, not an invented schedule.
For future dates, refresh and import the actual supplied calendar.

## Accuracy and intentional limits

- Operators' real route IDs, names, agency timezones, geographic stop coordinates,
  calls and service calendars are used. Stop sequences are **not rail/road
  shapes**; no imaginary road-following geometry is generated.
- `calendar_dates` additions/removals override weekdays. Service outside the
  supplied calendar or publisher feed validity is an explicit error.
  No recurrence is inferred from a single day.
- GTFS times use elapsed time from local noon minus 12 hours, then convert
  to explicit-offset instants and the existing transport reducer's civil
  service seconds. After-midnight calls and autumn folds are preserved.
  Calls that cannot fit the reducer's nonnegative 72-hour civil-day contract
  fail explicitly rather than shift silently to another day.
- Standard/extended bus and rail modes are supported. Tram, metro, ferry and
  other unsupported modes are counted as omitted. Frequency-based services,
  flexible/continuous-pickup services and trips with missing times are
  explicitly omitted. There is no invented interpolation or frequency expansion.
- Pickup/drop-off restrictions `1`, `2` and `3` cannot create ordinary
  boarding/alighting offers. Calls remain available as intermediate stops.
- Compiling requires one agency timezone per output, exact host grid identity
  and the existing map projection. Trips outside the reducer's supported
  coordinate range are counted/excluded as entire trips, never clipped into
  fabricated journeys. An empty compiled result is an explicit error.
- **Fares are not read from GTFS in this milestone.** All imported trips use
  the approved clearly labelled estimated game-fare path: EUR 2.50 bus /
  EUR 8 train, fixed per boarding even for an intermediate stop. These are
  balancing placeholders, including outside the eurozone, **not operator
  tariffs, conversions, ticket validity or purchasable tickets**. Official
  fare-rule import remains future work; estimates must remain visibly labelled.
  The compiled timetable and reducer offers retain this fare classification.
- Data are scheduled, not GTFS-realtime guarantees. Disruptions are not fetched.
  No transfers, international route planning, fare networks, reservations with
  an operator, national NeTEx import or paid API accounts are activated.
- Only the fixed public HTTPS Mobility Database mirror is fetched. No
  catalogue contact emails, credential-bearing provider URLs or query tokens
  are exported. Authentication-required sources remain marked, not bypassed.
- Limits: 64 MiB ZIP, 512 MiB uncompressed, 256 archive members, five million CSV
  rows, 20,000 selected active trips. Download failures, schema errors, invalid
  dates/coordinates/chronology and exceeded limits fail explicitly. Larger
  networks need reviewed regional/route partitioning, not automatic bulk fetch.
  No ZIP files are extracted to disk.

## Attribution and reuse

Catalogue metadata: **MobilityData / Mobility Database contributors**,
[`mobility-database-catalogs`](https://github.com/MobilityData/mobility-database-catalogs),
Apache-2.0; original licence retained in [`CATALOG-LICENSE`](CATALOG-LICENSE).
Changes: normalized public European metadata, removed direct URLs/contacts,
added explicit coverage/bounds status and retrieval/checksum metadata.
**The catalogue licence does not license the operators' GTFS data.**

The six sample feeds retain their separate catalogue-linked terms and
publisher attribution in each JSON:

- Transports Urbains du Bassin / Decazeville:
  [Etalab Open Licence 2.0](https://www.data.gouv.fr/pages/legal/licences/etalab-2.0).
- ATP Nuoro / publisher NUORO:
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.it).
- MZK Wejherowo / publisher **Mikolaj Kuranowski**:
  [CC0 1.0](http://creativecommons.org/publicdomain/zero/1.0/).
  This is a third-party-published feed, not represented as operator-authenticated.
- Kotka / Kotkan Seudun Liikenne and participating agencies:
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Borders Buses Limited:
  [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
  **Contains public sector information licensed under the Open Government Licence v3.0.**
- Polregio:
  [CC0 1.0](http://creativecommons.org/publicdomain/zero/1.0/).

Data were changed by filtering a supplied service day, normalizing times,
sampling trips and adding fictional game fares; operators do not endorse
this game. Missing licence links block import; `--license-reviewed` is an
explicit human acknowledgement, not automated legal clearance of all Europe.
Source authorship and catalogue official/non-official flags are retained.

## Verification

```sh
python -m unittest discover -s tests -p test_transport_sources.py
node --test tests/transport*.test.mjs
```

Tests use offline in-memory GTFS fixtures, including calendars/exceptions,
approximate and missing times, pickup restrictions, DST/after-midnight calls,
invalid feeds, download/ZIP bounds and atomic output. The Python suite also
compiles a supplied schedule and actually boards/rides it through the JavaScript
reducer, verifying one charge and unchanged walked distance.
