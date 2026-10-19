# Grenoble to Lyon: real SNCF verification and hybrid preview

**Service date: 19 October 2026.** This is a dated schedule, not a promise of
current operation or ticket availability. Online game boarding remains disabled.
Open [`layers/transport/hybrid.html`](../../../../layers/transport/hybrid.html)
through the repository's HTTP server for the FR/EN standalone preview.

## Actual acquisition and result

Source: **SNCF Voyageurs**, [national timetable publication](https://transport.data.gouv.fr/datasets/horaires-sncf),
GTFS resource 83582, retrieved through
[the Mobility Database mirror](https://files.mobilitydatabase.org/tdg-83582/latest.zip).
The archive is about 5.2 MiB compressed. Retrieval timestamp, archive SHA-256,
licence and publisher validity are retained in [`source.json`](source.json).
The publisher supplies validity 2026-10-18 to 2027-03-31; only the actual
calendar for 2026-10-19 is imported here.

Only route **K6**, GTFS ID
`FR:Line::D02BC35E-F58E-45E7-968F-42B8AB630E6E:`, was selected, not the full
national feed. It supplies **59 dated trips and 18 distinct source stops**,
including both directions and source calls at TER coach stops.
[`connections.json`](connections.json) contains **27 direct train journeys
from Grenoble to Lyon Part Dieu**, enforcing actual stop order, pickup and
drop-off restrictions. This is not an all-routes city-to-city planner.

Examples, local Europe/Paris times:

| Train | Grenoble departure | Lyon Part Dieu arrival | Duration |
|---|---|---|---|
| 17618 | 11:21 | 12:44 | 83 minutes |
| 17620 | 12:21 | 13:44 | 83 minutes |
| 17622 | 13:21 | 14:44 | 83 minutes |

Train 17618 calls at Grenoble, Voiron, La Tour-du-Pin, Bourgoin-Jallieu,
La Verpilliere and Lyon Part Dieu. Tests actually board this trip, save/resume
between steps, charge once and reach Lyon at 12:44 without adding walking
distance. **EUR 8 is the fictional game fare, not an SNCF ticket price.**

## Files and reproducibility

- [`source.json`](source.json): complete normalized **selected route/day**
  import, not the whole national feed or a three-trip sample.
- [`connections.json`](connections.json): all 27 eligible direct journeys.
- [`map.json`](map.json): explicit 250 m host-grid projection for the example.
- [`real-timetable.json`](real-timetable.json): compiled K6 reducer input.
- [`towns.json`](towns.json): real SNCF station-place coordinates for Grenoble,
  Lyon and Chambery, with source/licence attribution.
- [`fictional-timetable.json`](fictional-timetable.json): deterministic
  **fictional coach** schedules between those places, not SNCF services.

From the repository root, with the project's Python environment:

```sh
python scripts/transport_sources.py import \
  --catalog data/transport/europe-catalog.json --feed tdg-83582 \
  --date 2026-10-19 --license-reviewed \
  --route 'FR:Line::D02BC35E-F58E-45E7-968F-42B8AB630E6E:' \
  --output /tmp/sncf-k6.json

python scripts/transport_sources.py connections \
  --snapshot /tmp/sncf-k6.json \
  --from-stop 'StopPoint:OCETrain TER-87747006' \
  --to-stop 'StopPoint:OCETrain TER-87723197' \
  --after '2026-10-19T11:08:00+02:00' --output /tmp/grenoble-lyon.json

python scripts/transport_sources.py compile \
  --snapshot /tmp/sncf-k6.json \
  --map data/transport/examples/grenoble-lyon/map.json \
  --grid-id grenoble-lyon-example-v1 --output /tmp/sncf-timetable.json

python scripts/transport_fictional.py \
  --towns data/transport/examples/grenoble-lyon/towns.json \
  --map data/transport/examples/grenoble-lyon/map.json \
  --grid-id grenoble-lyon-example-v1 --date 2026-10-19 \
  --time-zone Europe/Paris --output /tmp/fictional-coaches.json
```

`latest.zip` changes. To reproduce these exact historical data, supply the
matching archive through `--zip`; a future mirror may no longer carry this day.
Exact stop IDs prevent confusing Grenoble's distinct rail/coach stop entries.
The generic `connections` command supports other imported pairs, but only
direct calls within supplied trips: no transfers or inferred connections.

## Hybrid demonstration

The preview starts in Grenoble at 11:00. Choose Lyon to book a real TER,
or Chambery to see an **explicitly fictional** fallback. Only K6 was loaded:
this does **not** assert that real Grenoble-Chambery trains do not exist.
Loading those real services would suppress the corresponding fictional offers.
The fallback is an abstract geographical connection, not an exact road trace
or an invented railway line.

The real and fictional timetables remain separate. Save/resume is local to the
preview with pinned timetable revisions, not the production journey save.
Minute settlement uses a documented 1 kcal/minute test stub; main-game health,
metabolism, map streaming and notebook integration are not activated here.

## Data licence and attribution

Contains information from **SNCF Voyageurs, Reseau SNCF TGV, Intercites et TER**,
available from the [official dataset](https://transport.data.gouv.fr/datasets/horaires-sncf)
under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1.0/).
The JSON example databases in this directory, including their modifications,
are made available under **ODbL 1.0**, without additional restrictions.
The normalized databases are supplied here in machine-readable form.
This does not relicense the application source code.

Changes: selected K6 and one supplied calendar day; converted explicit stop
times; projected coordinates; queried one direction; added explicitly fictional
game prices; generated a separate fictional coach example using attributed real
place coordinates. The fictional timetable is not attributed to SNCF as a
service or endorsed by SNCF. The importer and generator document the methods.
No national-feed completeness, live operation or official fare claim is made.
