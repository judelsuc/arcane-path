import json
from pathlib import Path
import sys
import tempfile
import unittest
import threading
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from travel_server import ChunkStore, ChunkJobs, make_handler
from journey_transport import JourneyTransport
from town_trail import grid_position


class JourneyTransportTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.chunks = ChunkStore(cache=Path(self.directory.name))
        self.service = JourneyTransport(self.chunks)

    def test_regional_real_towns_generate_explicit_fictional_coaches_not_parent_targets(self):
        base = self.chunks.bases["firmi"]
        pos = grid_position(base, 44.5333, 2.3)
        first = self.service.lookup("firmi", pos["col"], pos["row"], "2026-10-20")
        self.assertIsNone(first["fictionalFeed"])
        self.assertTrue(first["nearbyStops"])
        stop = first["nearbyStops"][0]
        result = self.service.lookup("firmi", stop["col"], stop["row"], "2026-10-20")
        self.assertTrue(result["boardingTown"])
        feed = result["fictionalFeed"]
        self.assertEqual(feed["kind"], "fictional-service")
        self.assertEqual(feed["gridId"], "firmi")
        self.assertEqual(feed["timeZone"], "UTC")
        self.assertTrue(all(trip["mode"] == "bus" for trip in feed["trips"]))
        self.assertEqual(result["realFeeds"], [], "dated 19 October snapshots must not recur on the 20th")
        self.assertLess(len(json.dumps(result)), 1500000)
        self.assertNotIn("parent", json.dumps(result).lower())
        self.assertEqual(self.service.lookup("firmi", stop["col"], stop["row"], "2026-10-20"), result)

    def test_actual_dated_stop_compiles_real_source_in_current_host_grid(self):
        base = self.chunks.bases["firmi"]
        source = json.loads((self.chunks.root / "data/transport/samples/tdg-11492.json").read_text())
        origin = next(stop for stop in source["stops"] if stop["id"] == source["trips"][0]["calls"][0]["stopId"])
        pos = grid_position(base, origin["latitude"], origin["longitude"])
        result = self.service.lookup("firmi", pos["col"], pos["row"], source["serviceDate"])
        self.assertTrue(result["realFeeds"])
        feed = result["realFeeds"][0]
        self.assertEqual(feed["kind"], "supplied")
        self.assertEqual(feed["gridId"], "firmi")
        self.assertEqual(feed["source"]["id"], source["source"]["id"])
        self.assertTrue(result["coverage"])
        self.assertLessEqual(len(feed["trips"]), 50)

    def test_bad_region_position_date_rejected_without_synthetic_success(self):
        for args in [("bad", 0, 0, "2026-10-19"), ("firmi", 9000, 0, "2026-10-19"),
                     ("firmi", True, 0, "2026-10-19"), ("firmi", 0, 0, "2026-02-30")]:
            with self.assertRaises(ValueError):
                self.service.lookup(*args)

    def test_http_query_is_strict_and_live_route_returns_host_grid_only(self):
        jobs = ChunkJobs(self.chunks)
        self.addCleanup(lambda: jobs.pool.shutdown(wait=True))
        handler = make_handler(self.chunks, jobs)
        self.addCleanup(handler.journal_art.close)
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        url = f"http://127.0.0.1:{server.server_port}/api/journey-transport"
        with urllib.request.urlopen(url + "?region=firmi&col=0&row=0&day=2026-10-20") as response:
            result = json.load(response)
        self.assertEqual(result["gridId"], "firmi")
        self.assertEqual(result["day"], "2026-10-20")
        for query in ("region=firmi&col=0&row=0", "region=firmi&col=0&col=1&row=0&day=2026-10-20",
                      "region=firmi&col=0&row=0&day=2026-10-20&name=private"):
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(url + "?" + query)
            self.assertEqual(error.exception.code, 400)


if __name__ == "__main__":
    unittest.main()
