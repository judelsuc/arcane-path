import csv
import hashlib
import io
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from accommodations import Accommodations, import_datatourisme
from fetch_osm import fetch_accommodations
from town_trail import grid_position
from travel_server import ChunkStore, ChunkJobs, make_handler, atomic_write

ROOT = Path(__file__).resolve().parents[1]


class AccommodationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = json.loads((ROOT / "public/map.json").read_text())
        self.chunks = SimpleNamespace(cache=Path(self.temp.name), bases={"firmi": self.base},
                                      read=lambda *args: None)
        self.store = Accommodations(self.chunks, atomic_write)

    def element(self, identity=42, kind="node", latitude=44.54, longitude=2.3, **tags):
        point = {"lat": latitude, "lon": longitude}
        return {"id": identity, "type": kind, "tags": {"tourism": "hostel", "name": "Auberge", **tags},
                **(point if kind == "node" else {"center": point})}

    def build(self, elements, latitude=44.54, longitude=2.3):
        with patch.object(self.store, "mapped", return_value=[]), \
                patch.object(self.store, "osm", return_value=elements), \
                patch.object(self.store, "datatourisme", return_value=([], None)):
            return self.store.build("firmi", latitude, longitude)

    def test_global_query_includes_nodes_ways_relations_and_bounded_radius(self):
        progress = lambda event: None
        with patch("fetch_osm.fetch_catalogue", return_value={"elements": []}) as fetch:
            self.assertEqual(fetch_accommodations(50, 4, progress), [])
        query = fetch.call_args.args[0]
        self.assertIn("nwr(around:5000,50.000000,4.000000)", query)
        self.assertIn("hostel", query)
        self.assertIn('["amenity"="place_of_worship"]', query)
        self.assertTrue(query.startswith("[out:json][timeout:20];("))
        self.assertIn(";);out center tags;", query)
        self.assertIn("out center tags", query)
        self.assertIs(fetch.call_args.args[1], progress)

    def test_pending_jobs_expose_provider_progress_without_changing_completed_results(self):
        entered, release = threading.Event(), threading.Event()
        key = ("firmi", 44.54, 2.3)

        def source(latitude, longitude, update):
            update({"phase": "provider", "provider": "overpass.example.org"})
            entered.set()
            if not release.wait(5):
                raise ValueError("Test source was not released")
            return [self.element()]

        jobs = ChunkJobs(self.store)
        try:
            with patch.object(self.store, "mapped", return_value=[]), \
                    patch.object(self.store, "osm", side_effect=source), \
                    patch.object(self.store, "datatourisme", return_value=([], None)):
                self.assertEqual(jobs.request(*key)[0], 202)
                self.assertTrue(entered.wait(5))
                status, payload = jobs.request(*key)
                self.assertEqual(status, 202)
                self.assertEqual(payload["progress"]["phase"], "provider")
                self.assertEqual(payload["progress"]["provider"], "overpass.example.org")
                self.assertEqual(payload["progress"]["cached"]["places"], [])
                release.set()
                expected = jobs.jobs[key].result(timeout=5)
                self.assertEqual(jobs.request(*key), (200, expected))
                self.assertEqual(self.store.progress, {})
        finally:
            release.set()
            jobs.pool.shutdown()

    def test_cached_lodging_is_published_before_the_live_source_completes(self):
        key = ("firmi", 44.54, 2.3)

        def source(latitude, longitude, update):
            cached = self.store.get_progress(*key)["cached"]
            self.assertEqual([p["id"] for p in cached["places"]], ["node/42"])
            self.assertEqual(cached["places"][0]["distance"], 0)
            self.assertIsNone(self.store.read(*key))
            update({"phase": "provider", "provider": "overpass.example.org"})
            self.assertEqual(self.store.get_progress(*key)["cached"], cached)
            return [self.element(43)]

        with patch.object(self.store, "mapped", return_value=[self.element(),
                self.element(44, access="private"), self.element(45, longitude=3)]), \
                patch.object(self.store, "osm", side_effect=source), \
                patch.object(self.store, "datatourisme", return_value=([], None)):
            result = self.store.build(*key)
        self.assertEqual(len(result["places"]), 2)

    def test_progress_reports_real_stages_and_cleans_up_on_success_and_failure(self):
        key = ("firmi", 44.54, 2.3)
        self.assertEqual(self.store.get_progress(*key), {"phase": "queued"})
        phases = []

        def source(latitude, longitude, update):
            phases.append(self.store.get_progress(*key)["phase"])
            update({"phase": "provider", "provider": "overpass.example.org"})
            self.assertEqual(self.store.get_progress(*key)["provider"], "overpass.example.org")
            return [self.element()]

        def catalogue(*args):
            phases.append(self.store.get_progress(*key)["phase"])
            return [], None

        with patch.object(self.store, "mapped", return_value=[]), \
                patch.object(self.store, "osm", side_effect=source), \
                patch.object(self.store, "datatourisme", side_effect=catalogue):
            self.store.build(*key)
        self.assertEqual(phases, ["osm", "catalogue"])
        self.assertEqual(self.store.get_progress(*key), {"phase": "queued"})
        with patch.object(self.store, "mapped", side_effect=OSError("Map unavailable")):
            with self.assertRaises(OSError):
                self.store.build(*key)
        self.assertEqual(self.store.progress, {})

    def test_real_coordinates_filter_closed_private_and_far_places_and_are_cached(self):
        result = self.build([self.element(), self.element(43, "way", longitude=2.31),
                             self.element(44, "relation", longitude=2.32),
                             self.element(45, access="private"), self.element(46, disused="yes"),
                             self.element(47, abandoned="yes"), self.element(48, longitude=3)])
        self.assertEqual([p["id"] for p in result["places"]], ["node/42", "way/43", "relation/44"])
        first = result["places"][0]
        self.assertEqual(first["distance"], 0)
        self.assertEqual((first["col"], first["row"]), tuple(
            grid_position(self.base, 44.54, 2.3)[k] for k in ("col", "row")))
        self.assertEqual(first["sourceUrl"], "https://www.openstreetmap.org/node/42")
        self.assertEqual(self.store.read("firmi", 44.54, 2.3), result)
        path = self.store.path("firmi", 44.54, 2.3)
        os.utime(path, (0, 0))
        self.assertIsNone(self.store.read("firmi", 44.54, 2.3))
        self.assertIsNone(self.store.read("firmi", 44.54, 2.301))
        self.assertEqual(result["radiusMeters"], 5000)

    def test_results_are_sorted_bounded_and_reject_invalid_coordinates(self):
        result = self.build([self.element(i, longitude=2.3 + i * .00001) for i in range(1, 65)])
        self.assertEqual(len(result["places"]), 40)
        self.assertEqual([p["id"] for p in result["places"]], [f"node/{i}" for i in range(1, 41)])
        for coordinate in [float("nan"), True, 200]:
            with self.assertRaisesRegex(ValueError, "coordinates"):
                self.build([self.element(latitude=coordinate)])

    def test_churches_are_real_bounded_hosting_destinations_without_replacing_lodging_catalogue(self):
        churches = [self.element(i, tourism="", amenity="place_of_worship") for i in range(1, 7)]
        with patch.object(self.store, "mapped", return_value=churches), \
                patch.object(self.store, "osm", return_value=[
                    self.element(8, tourism="", amenity="place_of_worship", access="private"),
                    self.element(9, tourism="", amenity="place_of_worship", disused="yes"),
                    self.element(10, tourism="", amenity="place_of_worship", longitude=3)]), \
                patch.object(self.store, "datatourisme", return_value=([], None)) as catalogue:
            result = self.store.build("firmi", 44.54, 2.3)
        self.assertEqual(len(result["places"]), 6)
        self.assertTrue(all(p["tags"]["amenity"] == "place_of_worship" for p in result["places"]))
        catalogue.assert_called_once()
        legacy = hashlib.sha256(json.dumps(["firmi", 44.54, 2.3]).encode()).hexdigest()
        self.assertNotEqual(self.store.path("firmi", 44.54, 2.3).stem, legacy)

    def test_server_mapped_scan_includes_churches_and_preserves_osm_identity(self):
        church = {"osmId": "way/53", "latitude": 44.54, "longitude": 2.3,
                  "name": "Notre-Dame", "tags": {"amenity": "place_of_worship"}}
        self.chunks.bases["firmi"] = {**self.base, "rows": [[{"pois": [church]}]]}
        found = self.store.mapped("firmi", 44.54, 2.3)
        self.assertEqual(len(found), 1)
        self.assertEqual((found[0]["type"], found[0]["id"]), ("way", 53))
        self.assertEqual(self.store.osm_places(found)[0]["name"], "Notre-Dame")

    def test_unavailable_sources_warn_and_do_not_cache_empty_success(self):
        with patch.object(self.store, "mapped", return_value=[]), \
                patch.object(self.store, "osm", side_effect=ValueError("Provider offline")), \
                patch.object(self.store, "datatourisme", return_value=([], "Catalogue not imported")):
            result = self.store.build("firmi", 44.54, 2.3)
        self.assertEqual(result["places"], [])
        self.assertIn("OpenStreetMap live lookup unavailable", result["warnings"][0])
        self.assertEqual(result["warnings"][1], "Catalogue not imported")
        self.assertIsNone(self.store.read("firmi", 44.54, 2.3))
        with patch.object(self.store, "osm", return_value=[]), \
                patch.object(self.store, "datatourisme") as french:
            self.store.build("firmi", 50, 20)
            french.assert_not_called()

    def catalogue(self, **changes):
        row = {"Nom_du_POI": "Real hostel", "Categories_de_POI": "YouthHostelAndInternationalCenter",
               "Latitude": "44.54", "Longitude": "2.3", "Createur_de_la_donnee": "Tourism office",
               "Date_de_mise_a_jour": "2026-10-17", "URI_ID_du_POI": "https://data.datatourisme.fr/42",
               **changes}
        stream = io.StringIO()
        writer = csv.DictWriter(stream, fieldnames=row)
        writer.writeheader()
        writer.writerow(row)
        stream.seek(0)
        return stream

    def test_provider_outage_keeps_real_snapshot_and_cached_chunk_lodging(self):
        poi = {"osmId": "relation/9876", "name": "Cached hostel", "latitude": 44.54,
               "longitude": 2.3, "tags": {"tourism": "hostel"}}
        chunk = {"rows": [[{"pois": [poi]}]]}
        with patch.object(self.chunks, "read", return_value=chunk), \
                patch.object(self.store, "osm", side_effect=ValueError("Offline")), \
                patch.object(self.store, "datatourisme", return_value=([], None)):
            found = self.store.build("firmi", 44.54, 2.3)
        self.assertTrue(any(place["id"] == "relation/9876" for place in found["places"]))
        self.assertEqual(len({p["id"] for p in found["places"]}), len(found["places"]))
        self.assertTrue(found["warnings"])
        self.assertIsNone(self.store.read("firmi", 44.54, 2.3))

    def test_catalogue_import_is_atomic_credited_and_does_not_invent_mountain_resort_lodging(self):
        database = self.store.cache / "datatourisme.sqlite"
        self.assertEqual(import_datatourisme(database, self.catalogue()), 1)
        rows, warning = self.store.datatourisme(44.54, 2.3)
        self.assertIsNone(warning)
        self.assertEqual(rows[0]["tags"], {"tourism": "hostel"})
        self.assertEqual(rows[0]["credit"], "Tourism office")
        with self.assertRaises(ValueError):
            import_datatourisme(database, self.catalogue(Latitude="NaN"))
        with self.assertRaisesRegex(ValueError, "no accommodations"):
            import_datatourisme(database, self.catalogue(Categories_de_POI="MountainResort"))
        self.assertEqual(len(self.store.datatourisme(44.54, 2.3)[0]), 1)
        with patch.object(self.store, "osm", return_value=[]):
            found = self.store.build("firmi", 44.54, 2.3)
        self.assertEqual(found["places"][0]["source"], "DATAtourisme")
        self.assertEqual(found["places"][0]["distance"], 0)

    def test_http_reuses_cache_validates_arguments_and_does_not_expose_admin_operations(self):
        chunks = ChunkStore(cache=self.chunks.cache)
        # Prime the same coordinate-keyed cache used by the HTTP endpoint.
        result = self.build([self.element()])
        global_result = {"places": [], "warnings": [], "radiusMeters": 5000}
        global_store = Accommodations(chunks, atomic_write)
        atomic_write(global_store.path("tahiti", -17.55, -149.57), json.dumps(global_result).encode())
        jobs = ChunkJobs(chunks)
        paths = ThreadPoolExecutor(max_workers=1)
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(chunks, jobs, path_pool=paths))
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        url = f"http://127.0.0.1:{server.server_port}"
        try:
            with patch("accommodations.fetch_accommodations", side_effect=AssertionError("Cache missed")):
                with urllib.request.urlopen(url + "/api/accommodations?region=firmi&latitude=44.54&longitude=2.3") as response:
                    self.assertEqual(json.load(response), result)
                with urllib.request.urlopen(url + "/api/accommodations?region=tahiti&latitude=-17.55&longitude=-149.57") as response:
                    self.assertEqual(json.load(response), global_result)
            for suffix in ["region=unknown&latitude=44&longitude=2", "region=firmi&latitude=NaN&longitude=2",
                           "region=firmi&latitude=44&longitude=2&clear=true",
                           "region=firmi&latitude=44&longitude=2&longitude=3"]:
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(url + "/api/accommodations?" + suffix)
                self.assertEqual(error.exception.code, 400)
                error.exception.close()
            request = urllib.request.Request(url + "/api/accommodations", data=b"{}", method="POST")
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request)
            self.assertEqual(error.exception.code, 404)
            error.exception.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
            jobs.pool.shutdown()
            paths.shutdown()


if __name__ == "__main__":
    unittest.main()
