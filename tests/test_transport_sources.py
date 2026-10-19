import copy
import csv
from datetime import date
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile
from zoneinfo import ZoneInfo
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from transport_sources import (
    build_catalog, find_feeds, feed_url, import_routes, compile_timetable, download,
    gtfs_instant, write_json, route_mode, service_seconds, sample_routes, direct_connections, main,
)


def archive(tables):
    target = io.BytesIO()
    with zipfile.ZipFile(target, "w") as zipped:
        for name, rows in tables.items():
            if isinstance(rows, str):
                zipped.writestr(name, rows)
                continue
            stream = io.StringIO(newline="")
            writer = csv.DictWriter(stream, list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
            zipped.writestr(name, stream.getvalue())
    return target.getvalue()


def tables():
    return {
        "agency.txt": [{"agency_id": "a", "agency_name": "Test only", "agency_timezone": "Europe/Paris"}],
        "routes.txt": [{"route_id": "R", "agency_id": "a", "route_short_name": "R",
                        "route_long_name": "Test route", "route_type": "3"}],
        "trips.txt": [{"trip_id": "T", "route_id": "R", "service_id": "weekday"}],
        "calendar.txt": [{"service_id": "weekday", "monday": "1", "tuesday": "1", "wednesday": "1",
                          "thursday": "1", "friday": "1", "saturday": "0", "sunday": "0",
                          "start_date": "20260101", "end_date": "20261231"}],
        "stops.txt": [
            {"stop_id": "s1", "stop_name": "Départ", "stop_lat": "44.54", "stop_lon": "2.30"},
            {"stop_id": "s2", "stop_name": "Arrivée", "stop_lat": "44.55", "stop_lon": "2.32"},
        ],
        "stop_times.txt": [
            {"trip_id": "T", "stop_id": "s1", "stop_sequence": "1",
             "arrival_time": "08:00:00", "departure_time": "08:00:00"},
            {"trip_id": "T", "stop_id": "s2", "stop_sequence": "2",
             "arrival_time": "08:10:00", "departure_time": "08:10:00"},
        ],
    }


SOURCE = {"id": "test", "country": "FR", "provider": "Synthetic unit-test provider",
          "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
          "licenseReviewed": True, "mirrorUrl": feed_url("test"), "status": "active",
          "authenticationRequired": False, "retrievedAt": "2026-10-19T08:00:00+00:00"}


def run_import(data=None, day="2026-10-19", **options):
    return import_routes(archive(data or tables()), SOURCE, day, **options)


class TransportSourceTests(unittest.TestCase):
    def test_real_schema_routes_stops_times_and_fares_are_distinct(self):
        result = run_import()
        self.assertEqual(result["kind"], "real-gtfs-routes")
        self.assertEqual(result["routes"][0]["shortName"], "R")
        self.assertEqual(result["stops"][0]["name"], "Départ")
        self.assertEqual(result["trips"][0]["calls"][0]["departure"], "2026-10-19T08:00:00+02:00")
        self.assertEqual(result["trips"][0]["fare"]["kind"], "estimated-game")
        self.assertEqual(result["trips"][0]["fare"]["cents"], 250)
        self.assertEqual(result["source"]["licenseUrl"], SOURCE["licenseUrl"])
        self.assertEqual(len(result["sha256"]), 64)

    def test_license_status_and_mirror_guards_precede_import(self):
        for change in [{"licenseReviewed": False}, {"licenseUrl": None}, {"status": "inactive"},
                       {"authenticationRequired": True}, {"mirrorUrl": "https://localhost/private"}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                import_routes(archive(tables()), {**SOURCE, **change}, "2026-10-19")

    def test_calendar_date_exceptions_override_weekdays(self):
        data = tables()
        data["calendar_dates.txt"] = [{"service_id": "weekday", "date": "20261019", "exception_type": "2"}]
        self.assertEqual(run_import(data)["trips"], [])
        data["calendar_dates.txt"][0] = {"service_id": "weekday", "date": "20261018", "exception_type": "1"}
        self.assertEqual(len(run_import(data, "2026-10-18")["trips"]), 1)
        self.assertEqual(run_import(day="2026-10-18")["trips"], [])

    def test_exception_only_calendar_and_out_of_range_are_explicit(self):
        data = tables()
        del data["calendar.txt"]
        data["calendar_dates.txt"] = [{"service_id": "weekday", "date": "20261019", "exception_type": "1"}]
        self.assertEqual(len(run_import(data)["trips"]), 1)
        with self.assertRaisesRegex(ValueError, "outside"):
            run_import(data, "2026-10-20")
        del data["calendar_dates.txt"]
        with self.assertRaisesRegex(ValueError, "no service calendar"):
            run_import(data)

    def test_no_invented_future_service(self):
        with self.assertRaisesRegex(ValueError, "outside"):
            run_import(day="2027-01-01")

    def test_after_midnight_and_gtfs_noon_semantics_across_dst(self):
        data = tables()
        data["stop_times.txt"][1]["arrival_time"] = "25:10:00"
        data["stop_times.txt"][1]["departure_time"] = "25:10:00"
        self.assertEqual(run_import(data)["trips"][0]["calls"][1]["arrival"], "2026-10-20T01:10:00+02:00")
        # On fall-back day GTFS 03:00 is noon-minus-12-hours + 3 elapsed hours.
        stamp, civil = gtfs_instant(date(2026, 10, 25), 3 * 3600, ZoneInfo("Europe/Paris"))
        self.assertEqual(stamp, "2026-10-25T03:00:00+01:00")
        self.assertEqual(civil, 3 * 3600)
        stamp, _ = gtfs_instant(date(2026, 10, 25), 2 * 3600, ZoneInfo("Europe/Paris"))
        self.assertEqual(stamp, "2026-10-25T02:00:00+01:00")
        stamp, _ = gtfs_instant(date(2026, 10, 25), 1 * 3600, ZoneInfo("Europe/Paris"))
        self.assertEqual(stamp, "2026-10-25T02:00:00+02:00")
        stamp, civil = gtfs_instant(date(2026, 3, 29), 2 * 3600, ZoneInfo("Europe/Paris"))
        self.assertEqual(stamp, "2026-03-29T01:00:00+01:00")
        self.assertEqual(civil, 3600)

    def test_frequencies_flex_and_missing_times_are_reported_not_invented(self):
        for reason in ("frequencyBasedTrips", "tripsWithUntimedStops", "flexibleServiceTrips"):
            data = tables()
            if reason == "frequencyBasedTrips":
                data["frequencies.txt"] = [{"trip_id": "T", "start_time": "08:00:00",
                                            "end_time": "12:00:00", "headway_secs": "600"}]
            elif reason == "tripsWithUntimedStops":
                data["stop_times.txt"][1]["arrival_time"] = ""
            else:
                data["routes.txt"][0]["continuous_pickup"] = "0"
            with self.subTest(reason=reason):
                result = run_import(data)
                self.assertEqual(result["trips"], [])
                self.assertEqual(result["omitted"][reason], 1)

    def test_supplied_approximate_time_remains_explicit_not_interpolated(self):
        data = tables()
        data["stop_times.txt"][0]["timepoint"] = "0"
        data["stop_times.txt"][1]["timepoint"] = "1"
        result = run_import(data)
        self.assertEqual(result["trips"][0]["timingQuality"], "source-approximate")
        self.assertEqual(result["trips"][0]["calls"][0]["departure"], "2026-10-19T08:00:00+02:00")

    def test_pickup_and_dropoff_restrictions_survive_normalization(self):
        data = tables()
        for call in data["stop_times.txt"]:
            call["pickup_type"], call["drop_off_type"] = "2", "1"
        result = run_import(data)
        self.assertEqual(result["trips"][0]["calls"][0]["pickupType"], 2)
        self.assertEqual(result["trips"][0]["calls"][0]["dropOffType"], 1)

    def test_supported_modes_only(self):
        for value in ("2", "100", "109"):
            self.assertEqual(route_mode(value), "train")
        for value in ("3", "700", "11", "200"):
            self.assertEqual(route_mode(value), "bus")
        for value in ("0", "1", "4", "6"):
            self.assertIsNone(route_mode(value))
        data = tables()
        data["routes.txt"][0]["route_type"] = "4"
        self.assertEqual(run_import(data)["omitted"]["unsupportedModeTrips"], 1)

    def test_invalid_or_ambiguous_feed_fails_atomically(self):
        cases = [
            lambda data: data["routes.txt"].append(copy.deepcopy(data["routes.txt"][0])),
            lambda data: data["stop_times.txt"][1].update(stop_id="unknown"),
            lambda data: data["trips.txt"][0].update(service_id="unknown"),
            lambda data: data["stop_times.txt"][1].update(stop_sequence="1"),
            lambda data: data["stop_times.txt"][1].update(arrival_time="07:00:00"),
            lambda data: data["stops.txt"][0].update(stop_lat="nan"),
            lambda data: data["agency.txt"][0].update(agency_timezone="not/a-zone"),
            lambda data: data["stop_times.txt"][0].update(departure_time="99:00:00"),
        ]
        for mutate in cases:
            data = tables()
            mutate(data)
            with self.subTest(mutate=mutate), self.assertRaises((ValueError, KeyError)):
                run_import(data)
        with self.assertRaisesRegex(ValueError, "Requested route"):
            run_import(route_ids=["unknown"])

    def test_size_row_and_duplicate_zip_guards(self):
        with patch("transport_sources.MAX_UNCOMPRESSED", 10), self.assertRaisesRegex(ValueError, "size/member"):
            run_import()
        with patch("transport_sources.MAX_ROWS", 1), self.assertRaisesRegex(ValueError, "row limit"):
            run_import()
        data = tables()
        data["other/agency.txt"] = data["agency.txt"]
        with self.assertRaisesRegex(ValueError, "Ambiguous duplicate"):
            run_import(data)
        with self.assertRaisesRegex(ValueError, "72-hour"):
            service_seconds("72:00:00")

    def test_fixed_whole_trip_game_fare_is_not_an_operator_price(self):
        data = tables()
        data["routes.txt"][0]["route_type"] = "2"
        result = run_import(data)
        self.assertEqual(result["trips"][0]["fare"]["cents"], 800)
        self.assertIn("not operator tickets", result["notice"])

    def test_compile_matches_actual_engine_and_does_not_change_walked_distance(self):
        snapshot = run_import()
        base = {"cellSizeMeters": 250, "projectionLatitude": 44.54,
                "bounds": {"minLongitude": 2.29, "minLatitude": 44.53, "maxLatitude": 44.56}}
        feed = compile_timetable(snapshot, base, "fixture-grid")
        root = Path(__file__).resolve().parents[1]
        script = """
import fs from 'node:fs';
import {importTimetable,transportOffers,bookTransit,advanceTransit} from './layers/transport/transport.mjs';
const feed=importTimetable(JSON.parse(fs.readFileSync(0,'utf8')));
let state={...feed.stops[0],startedAt:Date.parse(feed.trips[0].calls[0].departure)-60000,
elapsedMinutes:0,walletCents:10000,distanceMeters:123,ended:null};
const options={gridId:'fixture-grid',settle:(_previous,proposed)=>proposed};
const offers=transportOffers(feed,state,options);
state=bookTransit(feed,state,offers[0].id,options);
for(let i=0;i<30&&state.transport.booking.status==='active';i++)
state=advanceTransit(feed,state,state.transport.booking.id,options);
console.log(JSON.stringify({count:offers.length,fareKind:offers[0].fareKind,
notice:offers[0].fareNotice,status:state.transport.booking.status,
wallet:state.walletCents,walked:state.distanceMeters,col:state.col,row:state.row}));
"""
        result = subprocess.run(["node", "--input-type=module", "-e", script],
                                input=json.dumps(feed), text=True, cwd=root,
                                capture_output=True, check=True)
        actual = json.loads(result.stdout)
        self.assertEqual(actual["status"], "arrived")
        self.assertEqual(actual["fareKind"], "estimated-game")
        self.assertIn("fictional EUR game prices", actual["notice"])
        self.assertEqual(actual["wallet"], 9750)
        self.assertEqual(actual["walked"], 123)
        self.assertEqual((actual["col"], actual["row"]), (feed["stops"][1]["col"], feed["stops"][1]["row"]))
        with self.assertRaisesRegex(ValueError, "No complete trips fit"):
            compile_timetable(snapshot, {**base, "bounds": {
                "minLongitude": -150, "minLatitude": 70, "maxLatitude": 80}}, "far-grid")

    def test_publisher_validity_bounds_are_not_extended_by_calendar(self):
        data = tables()
        data["feed_info.txt"] = [{"feed_publisher_name": "Test publisher",
                                 "feed_publisher_url": "https://example.org", "feed_lang": "en",
                                 "feed_start_date": "20260101", "feed_end_date": "20261018"}]
        with self.assertRaisesRegex(ValueError, "publisher's feed validity"):
            run_import(data)

    def test_samples_preserve_complete_trips_and_full_source_hash(self):
        snapshot = run_import()
        sample = sample_routes(snapshot, 1)
        self.assertEqual(sample["trips"], snapshot["trips"])
        self.assertEqual(sample["sha256"], snapshot["sha256"])
        self.assertEqual(sample["sampling"]["totalTrips"], 1)
        self.assertIn("not the full imported", sample["sampling"]["notice"])
        with self.assertRaises(ValueError):
            sample_routes(snapshot, 0)

    def test_direct_query_respects_direction_access_and_explicit_departure_threshold(self):
        snapshot = run_import()
        report = direct_connections(snapshot, "s1", "s2")
        self.assertEqual(len(report["connections"]), 1)
        self.assertEqual(report["connections"][0]["durationMinutes"], 10)
        self.assertEqual(direct_connections(snapshot, "s2", "s1")["connections"], [])
        self.assertEqual(direct_connections(snapshot, "s1", "s2", "2026-10-19T08:01:00+02:00")["connections"], [])
        self.assertEqual(len(direct_connections(snapshot, "s1", "s2", "2026-10-19T06:00:00Z")["connections"]), 1)
        for origin, destination, after in [("unknown", "s2", None), ("s1", "s1", None),
                                            ("s1", "s2", "2026-10-19T08:00:00")]:
            with self.assertRaises(ValueError):
                direct_connections(snapshot, origin, destination, after)
        snapshot["trips"][0]["calls"][1]["dropOffType"] = 2
        self.assertEqual(direct_connections(snapshot, "s1", "s2")["connections"], [])
        snapshot["trips"][0]["calls"][1]["dropOffType"] = 0
        snapshot["trips"][0]["calls"][0]["pickupType"] = 1
        self.assertEqual(direct_connections(snapshot, "s1", "s2")["connections"], [])

    def test_persisted_grenoble_lyon_report_and_compilation_match_actual_source_calls(self):
        folder = Path(__file__).resolve().parents[1] / "data/transport/examples/grenoble-lyon"
        source = json.loads((folder / "source.json").read_text())
        report = json.loads((folder / "connections.json").read_text())
        self.assertEqual(direct_connections(source, report["from"]["id"], report["to"]["id"]), report)
        self.assertEqual(len(report["connections"]), 27)
        base = json.loads((folder / "map.json").read_text())
        actual = compile_timetable(source, base, "grenoble-lyon-example-v1")
        self.assertEqual(actual, json.loads((folder / "real-timetable.json").read_text()))
        self.assertEqual(source["source"]["licenseUrl"], "https://opendatacommons.org/licenses/odbl/1.0/")

    def test_atomic_output_does_not_replace_valid_snapshot_on_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "output.json"
            write_json(path, {"valid": 1})
            with self.assertRaises(ValueError):
                write_json(path, {"bad": float("nan")})
            self.assertEqual(json.loads(path.read_text()), {"valid": 1})
            self.assertEqual(list(Path(folder).glob(".transport-*")), [])

    def test_cli_search_import_sample_compile_and_error_exit(self):
        script = Path(__file__).resolve().parents[1] / "scripts/transport_sources.py"
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            catalog, zipped = folder / "catalog.json", folder / "source.zip"
            snapshot, sample = folder / "snapshot.json", folder / "sample.json"
            base, compiled = folder / "map.json", folder / "compiled.json"
            write_json(catalog, {"feeds": [SOURCE]})
            zipped.write_bytes(archive(tables()))
            write_json(base, {"cellSizeMeters": 250, "projectionLatitude": 44.54,
                             "bounds": {"minLongitude": 2.29, "minLatitude": 44.53, "maxLatitude": 44.56}})

            def command(*arguments, expected=0):
                result = subprocess.run([sys.executable, str(script), *map(str, arguments)],
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, expected, result.stderr)
                return result

            result = command("search", "--catalog", catalog, "--country", "FR")
            self.assertEqual(json.loads(result.stdout)[0]["id"], SOURCE["id"])
            arguments = ("import", "--catalog", catalog, "--feed", SOURCE["id"],
                         "--date", "2026-10-19", "--zip", zipped, "--output", snapshot)
            result = command(*arguments, expected=1)
            self.assertIn("explicitly pass --license-reviewed", result.stderr)
            self.assertFalse(snapshot.exists())
            command(*arguments, "--license-reviewed")
            command("sample", "--snapshot", snapshot, "--trips", "1", "--output", sample)
            self.assertEqual(len(json.loads(sample.read_text())["trips"]), 1)
            command("compile", "--snapshot", snapshot, "--map", base,
                    "--grid-id", "cli-grid", "--output", compiled)
            self.assertEqual(json.loads(compiled.read_text())["kind"], "supplied")
            command("connections", "--snapshot", snapshot, "--from-stop", "s1",
                    "--to-stop", "s2", "--output", folder / "connections.json")
            self.assertEqual(len(json.loads((folder / "connections.json").read_text())["connections"]), 1)
            result = command("import", "--catalog", catalog, "--feed", SOURCE["id"],
                             "--date", "2027-01-01", "--zip", zipped, "--output", folder / "invalid.json",
                             "--license-reviewed", expected=1)
            self.assertIn("Transport source error:", result.stderr)
            self.assertFalse((folder / "invalid.json").exists())

    def test_every_committed_real_sample_compiles_and_produces_legal_offers(self):
        root = Path(__file__).resolve().parents[1]
        folder = root / "data/transport"
        manifest = json.loads((folder / "verified-feeds.json").read_text())
        self.assertEqual(sum(feed["routes"] for feed in manifest["feeds"]), 99)
        self.assertEqual(sum(feed["trips"] for feed in manifest["feeds"]), 3993)
        feeds = []
        for entry in manifest["feeds"]:
            snapshot = json.loads((folder / entry["sampleFile"]).read_text())
            self.assertEqual(snapshot["sha256"], entry["sha256"])
            self.assertEqual(len(snapshot["trips"]), entry["sampleTrips"])
            self.assertEqual(snapshot["sampling"]["totalTrips"], entry["trips"])
            self.assertEqual(len(snapshot["routes"]), entry["routes"])
            stop = snapshot["stops"][0]
            base = {"cellSizeMeters": 250, "projectionLatitude": stop["latitude"],
                    "bounds": {"minLongitude": stop["longitude"] - .1,
                               "minLatitude": stop["latitude"] - .1,
                               "maxLatitude": stop["latitude"] + .1}}
            feeds.append(compile_timetable(snapshot, base, "verified-grid"))
        script = """
import fs from 'node:fs';
import {importTimetable,transportOffers} from './layers/transport/transport.mjs';
const results=JSON.parse(fs.readFileSync(0,'utf8')).map(raw=>{
  const feed=importTimetable(raw);
  const boardable=(trip,call,index)=>index<trip.calls.length-1&&call.pickupType===0&&
    trip.calls.slice(index+1).some(to=>to.dropOffType===0);
  const trip=feed.trips.find(t=>t.calls.some((c,i)=>boardable(t,c,i)));
  if(!trip)throw new Error('No normally boardable sample: '+feed.id);
  const call=trip.calls.find((c,i)=>boardable(trip,c,i));
  const stop=feed.stops.find(s=>s.id===call.stopId);
  const offers=transportOffers(feed,{...stop,startedAt:Date.parse(call.departure),
    elapsedMinutes:0,walletCents:10000,ended:null},{gridId:feed.gridId});
  if(!offers.length||offers.some(o=>o.fareKind!=='estimated-game'))
    throw new Error('Invalid real offers: '+feed.id);
  for(const offer of offers){
    const itinerary=feed.trips.find(t=>t.id===offer.tripId);
    if(itinerary.calls[offer.fromIndex].pickupType!==0||
      itinerary.calls[offer.toIndex].dropOffType!==0)throw new Error('Restricted stop');
  }
  return feed.id;
});
console.log(JSON.stringify(results));
"""
        result = subprocess.run(["node", "--input-type=module", "-e", script],
                                input=json.dumps(feeds), text=True, cwd=root, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(json.loads(result.stdout)), 6)


class CatalogTests(unittest.TestCase):
    def payload(self, **changes):
        row = {"id": "mdb-test", "data_type": "gtfs", "location.country_code": "FR",
               "provider": "Operator", "status": "active", "urls.latest": feed_url("mdb-test"),
               "urls.license": "https://example.org/license", "urls.authentication_type": "0",
               "location.bounding_box.minimum_latitude": "44", "location.bounding_box.maximum_latitude": "45",
               "location.bounding_box.minimum_longitude": "2", "location.bounding_box.maximum_longitude": "3"}
        row.update(changes)
        result = io.StringIO()
        writer = csv.DictWriter(result, row)
        writer.writeheader()
        writer.writerow(row)
        return result.getvalue().encode()

    def test_europe_only_no_implicit_eu_restriction_and_explicit_gaps(self):
        result = build_catalog(self.payload(), "2026-10-19T08:00:00Z")
        self.assertEqual(len(result["feeds"]), 1)
        self.assertIn("GB", result["coverage"])
        self.assertIn("NO", result["coverage"])
        self.assertIn("UA", result["coverage"])
        self.assertEqual(result["coverage"]["AD"]["status"], "no-catalogued-feed")
        self.assertEqual(build_catalog(self.payload(**{"location.country_code": "US"}), "")["feeds"], [])
        self.assertEqual(build_catalog(self.payload(data_type="gtfs-rt"), "")["feeds"], [])

    def test_country_and_bounding_box_search(self):
        catalog = build_catalog(self.payload(), "")
        self.assertEqual(len(find_feeds(catalog, "FR", [2.5, 44.5, 4, 46])), 1)
        self.assertEqual(find_feeds(catalog, "DE"), [])
        self.assertEqual(find_feeds(catalog, bounds=[10, 50, 11, 51]), [])
        with self.assertRaises(ValueError):
            find_feeds(catalog, "US")
        with self.assertRaises(ValueError):
            find_feeds(catalog, bounds=[3, 45, 2, 44])

    def test_bad_source_bounds_preserved_as_explicit_gap(self):
        catalog = build_catalog(self.payload(**{"location.bounding_box.minimum_latitude": "nan"}), "")
        self.assertEqual(catalog["feeds"][0]["boundsStatus"], "invalid-source-bounds")
        self.assertEqual(find_feeds(catalog, bounds=[2, 44, 3, 45]), [])
        self.assertEqual(len(find_feeds(catalog, "FR")), 1)

    def test_unknown_licenses_credentials_and_unsafe_urls_not_exported(self):
        catalog = build_catalog(self.payload(**{"urls.license": "https://example.org/license?token=secret",
                                                "urls.authentication_type": "1"}), "")
        self.assertIsNone(catalog["feeds"][0]["licenseUrl"])
        self.assertTrue(catalog["feeds"][0]["authenticationRequired"])
        self.assertNotIn("secret", json.dumps(catalog))
        self.assertEqual(catalog["coverage"]["FR"]["activePublicMirrorWithLicenseLink"], 0)
        for identity in ("../private", "bad?key=x", "name/extra"):
            with self.assertRaises(ValueError):
                feed_url(identity)
        with self.assertRaises(ValueError):
            download("http://127.0.0.1/private")

    def test_current_committed_catalogue_has_no_country_disguised_as_full_coverage(self):
        path = Path(__file__).resolve().parents[1] / "data/transport/europe-catalog.json"
        catalog = json.loads(path.read_text())
        self.assertGreater(len(catalog["feeds"]), 1000)
        self.assertTrue(all(row["status"] in ("catalogued-not-verified", "no-catalogued-feed")
                            for row in catalog["coverage"].values()))

    def test_refresh_cli_uses_public_catalogue_and_atomic_output(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "catalog.json"
            with patch("sys.argv", ["transport_sources.py", "refresh-catalog", "--output", str(output)]), \
                    patch("transport_sources.download", return_value=self.payload()) as fetch, \
                    redirect_stdout(io.StringIO()):
                main()
            self.assertIn("https://files.mobilitydatabase.org/", fetch.call_args.args[0])
            self.assertEqual(len(json.loads(output.read_text())["feeds"]), 1)


if __name__ == "__main__":
    unittest.main()
