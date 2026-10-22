import json
from datetime import datetime, timezone
from pathlib import Path
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from abandoned_journals import AbandonedJournals, JournalForbidden
from journal_art import JournalArt
from journeys import JourneyStore, JourneyRequest, JourneyConflict
from quest_destinations import QuestDestinations, normalize, acquire
from quest_wording import catalogue
from travel_server import ChunkStore, ChunkJobs, atomic_write, make_handler


def poi(identity, tags, latitude=47.99887585, longitude=None):
    longitude = longitude if longitude is not None else 2.001680 + (identity % 10) * .004
    return {"type": "node", "id": identity, "lat": latitude, "lon": longitude,
            "tags": {"name": f"Real mapped POI {identity}", **tags}}


class QuestDestinationsTests(unittest.TestCase):
    def setUp(self):
        (ROOT / ".cache").mkdir(exist_ok=True)
        directory = tempfile.TemporaryDirectory(dir=ROOT / ".cache", prefix="quest-test-")
        self.addCleanup(directory.cleanup)
        self.base = {"bounds": {"maxLatitude": 48, "minLatitude": 47.9, "minLongitude": 2},
                     "cellSizeMeters": 250, "projectionLatitude": 48}
        self.chunks = SimpleNamespace(bases={"test": self.base},
                                      read=Mock(return_value={"rows": [
                                          [{"terrain": "plain"} for _ in range(8)] for _ in range(8)]}),
                                      build=Mock())
        self.owner = "a" * 32
        journeys = SimpleNamespace(path=Path(directory.name) / "journeys.sqlite3")
        self.auth = SimpleNamespace(journeys=journeys, authorize=Mock(
            return_value=(self.owner, {"region": "test"})))
        self.towns = SimpleNamespace(buckets={(47, 2): [
            [1, "Mapped town", 47.99887585, 2.001680, "FR", 5000]]})
        self.fetcher = Mock(return_value=[
            poi(11, {"tourism": "hotel"}), poi(12, {"amenity": "post_office"}),
            poi(13, {"amenity": "place_of_worship", "religion": "christian", "building": "church"}),
        ])
        self.transport = Mock()
        self.service = QuestDestinations(self.chunks, self.auth, self.transport,
                                          fetcher=self.fetcher, towns=self.towns)
        self.addCleanup(self.service.close)
        self.data = {"journey": self.owner, "template": "fool.first-address",
                     "origin": {"col": 0, "row": 0}, "scope": "local", "nonce": "c" * 32}

    def settle(self, data=None):
        data = data or self.data
        for _ in range(100):
            result = self.service.request(data, "capability")
            if result["status"] not in {"queued", "running"}:
                return result
            self.service.future.result(timeout=5)
            time.sleep(.001)
        self.fail("Quest discovery did not settle.")

    def test_catalogue_real_pois_stable_identity_roles_and_grid_paths(self):
        self.assertEqual(len(catalogue()), 44)
        result = self.settle()
        self.assertEqual(result["status"], "ready")
        self.assertEqual([value["kind"] for value in result["destinations"]], ["hotel", "post_office"])
        self.assertEqual(result["destinations"][0]["id"], "osm:node/11")
        self.assertEqual(result["destinations"][0]["sourceUrl"], "https://www.openstreetmap.org/node/11")
        self.assertTrue(all(leg["mode"] == "walk" for leg in result["route"]["legs"]))
        self.assertEqual(result["route"]["verified"], "game-route-topology")
        self.transport.lookup.assert_not_called()
        self.fetcher.assert_called_once()
        self.assertEqual(self.settle(), result)
        self.service.close()
        reopened = QuestDestinations(self.chunks, self.auth, self.transport,
                                     fetcher=self.fetcher, towns=self.towns)
        self.addCleanup(reopened.close)
        self.assertEqual(reopened.request(self.data, "capability"), result)
        self.assertEqual(self.service.path.stat().st_mode & 0o777, 0o600)

    def test_nonce_conflicts_and_strict_request_validation(self):
        self.settle()
        for change in [{"origin": {"col": 1, "row": 0}}, {"scope": "far"},
                       {"template": "fool.first-stop"}]:
            with self.assertRaises(JourneyConflict):
                self.service.request({**self.data, **change}, "capability")
        for change in [{"prompt": "invent"}, {"nonce": "bad"}, {"scope": []},
                       {"origin": {"col": True, "row": 0}}, {"origin": {"col": 8008, "row": 0}},
                       {"template": "unknown", "nonce": "d" * 32}]:
            with self.assertRaises(JourneyRequest):
                self.service.request({**self.data, **change}, "capability")
        self.auth.authorize.side_effect = JournalForbidden("No capability")
        with self.assertRaises(JournalForbidden):
            self.service.request(self.data, None)

    def test_missing_categories_do_not_fabricate_and_cache_negative_results(self):
        self.fetcher.return_value = []
        result = self.settle()
        self.assertEqual(result["status"], "unavailable")
        self.assertNotIn("destinations", result)
        self.assertEqual(self.settle({**self.data, "nonce": "d" * 32})["status"], "unavailable")
        self.fetcher.assert_called_once()

    def test_provider_failure_is_explicit_durable_and_not_retried(self):
        self.fetcher.side_effect = OSError("Offline")
        with self.assertLogs(level="ERROR"):
            result = self.settle()
        self.assertEqual(result["status"], "failed")
        self.assertEqual(self.settle(), result)
        self.fetcher.assert_called_once()

    def test_same_nonce_in_flight_deduplicates(self):
        entered, release = threading.Event(), threading.Event()
        values = self.fetcher.return_value
        def fetch(town):
            entered.set()
            if not release.wait(5):
                raise OSError("Test timed out")
            return values
        self.fetcher.side_effect = fetch
        self.service.request(self.data, "capability")
        try:
            self.assertTrue(entered.wait(5))
            self.assertEqual(self.service.request(self.data, "capability")["status"], "running")
        finally:
            release.set()
        self.assertEqual(self.settle()["status"], "ready")
        self.fetcher.assert_called_once()

    def test_unavailable_grid_and_bounded_downloads_never_prove_reachability(self):
        self.chunks.read.return_value = {"rows": [[{"terrain": "plain", "unavailable": True}
                                                   for _ in range(8)] for _ in range(8)]}
        self.assertEqual(self.settle()["status"], "unavailable")

    def test_distant_town_requires_actual_transport_edges_not_distance(self):
        self.towns.buckets[(48, 2)] = [[2, "Distant town", 48.5, 2.1, "FR", 5000]]
        self.fetcher.return_value = [poi(11, {"tourism": "hotel"}, 48.5, 2.1),
                                    poi(12, {"amenity": "post_office"}, 48.5, 2.104)]
        self.transport.lookup.return_value = {"realFeeds": [], "fictionalFeed": None}
        self.assertEqual(self.settle({**self.data, "scope": "regional"})["status"], "unavailable")
        self.transport.lookup.assert_called()

    def test_transport_graph_follows_only_pickup_and_dropoff_edges(self):
        start = {"id": "a", "name": "A", "col": 0, "row": 0, "latitude": 48, "longitude": 2}
        goal = {"id": "b", "name": "B", "col": 5, "row": 0, "latitude": 48, "longitude": 2.02}
        trip = {"id": "trip", "mode": "bus", "calls": [
            {"stopId": "a", "departure": "2026-10-22T10:00:00+00:00", "pickupType": 0},
            {"stopId": "b", "arrival": "2026-10-22T11:00:00+00:00", "dropOffType": 0}]}
        self.transport.lookup.return_value = {"realFeeds": [], "fictionalFeed": {
            "id": "feed", "kind": "fictional-service", "stops": [start, goal], "trips": [trip]}}
        result = self.service.connections("test", [start], goal, "2026-10-22", lambda: None)
        self.assertEqual(result[1][0]["tripId"], "trip")
        trip["calls"][1]["dropOffType"] = 1
        self.assertIsNone(self.service.connections("test", [start], goal, "2026-10-22", lambda: None))

    def test_distant_ready_has_real_edges_and_feasible_scheduled_transfers(self):
        from town_trail import grid_position
        self.towns.buckets[(48, 2)] = [[2, "Distant town", 48.5, 2.1, "FR", 5000]]
        start = {"id": "a", "name": "A", "col": 0, "row": 0,
                 "latitude": 47.99887585, "longitude": 2.001680}
        goal = {"id": "b", "name": "B", "latitude": 48.5, "longitude": 2.1,
                **grid_position(self.base, 48.5, 2.1)}
        self.fetcher.return_value = [poi(11, {"tourism": "hotel"}, 48.5, 2.1),
                                    poi(12, {"amenity": "post_office"}, 48.5, 2.104)]
        def lookup(region, col, row, day):
            return {"realFeeds": [], "fictionalFeed": {
                "id": "feed:" + day, "kind": "fictional-service", "stops": [start, goal],
                "trips": [{"id": "trip:" + day, "mode": "bus", "estimatedDistanceMeters": 70000, "calls": [
                    {"stopId": "a", "departure": day + "T10:00:00+00:00"},
                    {"stopId": "b", "arrival": day + "T11:00:00+00:00"}]}]}}
        self.transport.lookup.side_effect = lookup
        result = self.settle({**self.data, "scope": "regional"})
        self.assertEqual(result["status"], "ready")
        self.assertTrue(result["route"]["scheduleVerified"])
        self.assertEqual([leg["mode"] for leg in result["route"]["legs"]], ["walk", "bus", "walk", "walk"])
        self.assertEqual(result["route"]["legs"][1]["distanceKind"], "game-estimate")
        self.assertGreaterEqual(result["distanceKm"], 70)

    def test_schedule_waits_for_actual_next_day_calls_not_impossible_same_day_transfer(self):
        stops = [{"id": str(i), "name": str(i), "col": i, "row": 0,
                  "latitude": 48, "longitude": 2 + i * .01} for i in range(3)]
        def lookup(region, col, row, day):
            return {"realFeeds": [], "fictionalFeed": {
                "id": "feed:" + day, "kind": "fictional-service", "stops": stops,
                "trips": [{"id": f"trip:{day}:{i}", "mode": "bus", "calls": [
                    {"stopId": str(i), "departure": day + "T06:00:00+00:00"},
                    {"stopId": str(i + 1), "arrival": day + "T07:00:00+00:00"}]} for i in range(2)]}}
        self.transport.lookup.side_effect = lookup
        rides = [{"from": a, "to": b} for a, b in zip(stops, stops[1:])]
        result = self.service.schedule("test", rides, datetime(2026, 10, 22, 8, tzinfo=timezone.utc), lambda: None)
        self.assertEqual(result[0]["departure"], "2026-10-23T06:00:00+00:00")
        self.assertEqual(result[1]["departure"], "2026-10-24T06:00:00+00:00")
        self.assertGreater(datetime.fromisoformat(result[1]["departure"]), datetime.fromisoformat(result[0]["arrival"]))

    def test_repeated_roles_require_distinct_real_pois(self):
        self.assertEqual(self.settle({**self.data, "template": "emperor.winter-stop"})["status"], "unavailable")
        self.assertEqual(self.fetcher.call_count, 1)

    def test_authored_other_town_uses_distinct_towns_and_verified_intertown_connection(self):
        from town_trail import grid_position
        self.towns.buckets[(48, 2)] = [[2, "Second town", 48.08, 2.05, "FR", 5000]]
        start = {"id": "a", "name": "A", "col": 0, "row": 0,
                 "latitude": 47.99887585, "longitude": 2.001680}
        goal = {"id": "b", "name": "B", "latitude": 48.08, "longitude": 2.05,
                **grid_position(self.base, 48.08, 2.05)}
        self.fetcher.side_effect = lambda town: (
            [poi(11, {"railway": "station"})] if town["id"] == "geoname:1" else
            [poi(12, {"tourism": "hotel"}, 48.08, 2.054)])
        def lookup(region, col, row, day):
            return {"realFeeds": [], "fictionalFeed": {
                "id": "feed:" + day, "kind": "fictional-service", "stops": [start, goal],
                "trips": [{"id": "trip:" + day, "mode": "bus", "estimatedDistanceMeters": 12000, "calls": [
                    {"stopId": "a", "departure": day + "T10:00:00+00:00"},
                    {"stopId": "b", "arrival": day + "T11:00:00+00:00"}]}]}}
        self.transport.lookup.side_effect = lookup
        result = self.settle({**self.data, "template": "chariot.checked-passage"})
        self.assertEqual(result["status"], "ready")
        self.assertEqual([value["town"] for value in result["destinations"]], ["Mapped town", "Second town"])
        self.assertEqual(len({(value["col"], value["row"]) for value in result["destinations"]}), 2)
        self.assertEqual([leg["mode"] for leg in result["route"]["legs"]], ["walk", "walk", "bus", "walk"])
        self.assertEqual(self.fetcher.call_count, 2)

    def test_private_itinerary_metadata_never_leaves_destination_selection(self):
        result = self.settle()
        self.assertEqual(set(result["destinations"][0]), {
            "id", "name", "latitude", "longitude", "col", "row", "town", "kind", "sourceUrl"})
        for value in result["destinations"]:
            self.assertNotEqual((value["col"], value["row"]), (0, 0))

    def test_museum_documented_access_and_rental_are_not_inferred_from_generic_kind(self):
        self.fetcher.return_value = [
            poi(11, {"tourism": "museum", "access": "yes"}),
            poi(12, {"tourism": "information", "information": "office"})]
        self.assertEqual(self.settle({**self.data, "template": "hanged.other-entrance"})["status"], "unavailable")
        self.fetcher.return_value = [
            poi(11, {"amenity": "townhall"}), poi(12, {"shop": "convenience"})]
        with self.service.connect() as db:
            db.execute("DELETE FROM pois")
        self.assertEqual(self.settle({**self.data, "template": "devil.unclear-contract",
                                     "nonce": "e" * 32})["status"], "unavailable")

    def test_normalization_rejects_private_nonpotable_and_unverified_access(self):
        town = {"name": "Town", "latitude": 47.99887585, "longitude": 2.001680}
        values = [
            poi(1, {"tourism": "hotel", "access": "private"}),
            poi(2, {"amenity": "drinking_water", "drinking_water": "no"}),
            poi(3, {"tourism": "museum"}),
            poi(4, {"tourism": "museum", "access": "yes"}),
            poi(5, {"amenity": "place_of_worship", "religion": "muslim", "building": "mosque"}),
            {"type": "way", "id": 6, "center": {"lat": town["latitude"], "lon": town["longitude"]},
             "tags": {"name": "Library", "amenity": "library"}},
            poi(7, {"tourism": "hotel"}, 52, 3),
            poi(8, {"amenity": "cafe", "disused": "yes"}),
        ]
        result = normalize(values, town, self.base)
        self.assertEqual({value["id"] for value in result}, {"osm:node/4", "osm:way/6"})

    def test_acquisition_has_fixed_bounded_query_timeout_and_bytes(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = b'{"elements":[]}'
        town = {"latitude": 48, "longitude": 2}
        with patch("quest_destinations.urllib.request.urlopen", return_value=response) as network:
            self.assertEqual(acquire(town), [])
        request = network.call_args.args[0]
        self.assertEqual(network.call_args.kwargs["timeout"], 25)
        self.assertIn("around%3A2000", request.data.decode())
        response.read.assert_called_once_with(2_000_001)


class QuestEndpointTests(unittest.TestCase):
    def test_real_http_capability_conflicts_private_cache_and_origin_protection(self):
        (ROOT / ".cache").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=ROOT / ".cache", prefix="quest-http-") as directory:
            chunks = ChunkStore(cache=Path(directory))
            journeys = JourneyStore(chunks, atomic_write)
            record, _ = journeys.create({"requestId": str(uuid.uuid4()), "region": "firmi", "name": "PRIVATE"})
            owner = record["state"]["serverJourney"]["id"]
            abandoned = AbandonedJournals(journeys)
            token = "a" * 64
            abandoned.bind(owner, token)
            jobs = ChunkJobs(chunks)
            handler = make_handler(chunks, jobs)
            ready = {"status": "ready", "destinations": [{
                "id": "osm:node/1", "name": "Mapped fixture hotel", "latitude": 44.5, "longitude": 2.3,
                "col": 13, "row": 12, "town": "Mapped fixture town", "kind": "hotel",
                "sourceUrl": "https://www.openstreetmap.org/node/1"}, {
                "id": "osm:node/2", "name": "Mapped fixture post office", "latitude": 44.5, "longitude": 2.303,
                "col": 14, "row": 12, "town": "Mapped fixture town", "kind": "post_office",
                "sourceUrl": "https://www.openstreetmap.org/node/2"}],
                "distanceKm": .5, "route": {"verified": "game-route-topology", "scheduleVerified": True,
                    "legs": [{"mode": "walk", "points": [[12, 12], [13, 12], [14, 12]], "distanceMeters": 500}]}}
            handler.quest_destinations.build = Mock(return_value=ready)
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever)
            thread.start()
            url = f"http://127.0.0.1:{server.server_port}/api/quest-destinations"
            data = {"journey": owner, "template": "fool.first-address", "nonce": "d" * 32,
                    "origin": {"col": 12, "row": 12}, "scope": "regional"}
            def post(value, key=token, origin=None):
                headers = {"Content-Type": "application/json", "X-Journal-Capability": key}
                if origin:
                    headers["Origin"] = origin
                return urllib.request.urlopen(urllib.request.Request(
                    url, data=json.dumps(value).encode(), headers=headers), timeout=5)
            try:
                with post(data) as response:
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.headers["Cache-Control"], "no-store")
                handler.quest_destinations.future.result(timeout=5)
                with post(data) as response:
                    self.assertEqual(json.load(response), ready)
                for value, key, origin, status in [
                    (data, "b" * 64, None, 403), (data, token, "https://evil.example", 403),
                    ({**data, "origin": {"col": 13, "row": 12}}, token, None, 409),
                    ({**data, "keeper": "b" * 32}, token, None, 403),
                    ({**data, "prompt": "Invent"}, token, None, 400),
                ]:
                    with self.assertRaises(urllib.error.HTTPError) as error:
                        post(value, key, origin)
                    self.assertEqual(error.exception.code, status)
                    error.exception.close()
                handler.quest_destinations.build.assert_called_once()
            finally:
                server.shutdown()
                server.server_close()
                thread.join()
                handler.quest_destinations.close()
                handler.journal_art.close()
                handler.live_narrative.close()
                handler.living_world.pool.shutdown(wait=True)
                jobs.pool.shutdown(wait=True)


if __name__ == "__main__":
    unittest.main()
