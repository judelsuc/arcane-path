import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from transport_fictional import fictional_timetable
from transport_sources import EUROPE

BASE = {"cellSizeMeters": 250, "bounds": {
    "minLatitude": 44, "maxLatitude": 47, "minLongitude": 3}, "projectionLatitude": 45}
TOWNS = [
    {"id": "town-a", "name": "Test town A", "country": "FR", "latitude": 45.19,
     "longitude": 5.71, "source": "Synthetic unit-test coordinates, not an actual town"},
    {"id": "town-b", "name": "Test town B", "country": "FR", "latitude": 45.76,
     "longitude": 4.86, "source": "Synthetic unit-test coordinates, not an actual town"},
]


class FictionalTransportTests(unittest.TestCase):
    def generate(self, towns=None, day="2026-10-19", zone="Europe/Paris"):
        return fictional_timetable(towns or TOWNS, BASE, "test-grid", day, zone)

    def test_deterministic_finite_dated_coaches_not_rail_or_operator_services(self):
        feed = self.generate()
        self.assertEqual(feed, self.generate())
        self.assertEqual(feed, self.generate(list(reversed(TOWNS))))
        self.assertEqual(len(feed["trips"]), 8)
        self.assertEqual(feed["kind"], "fictional-service")
        self.assertEqual(feed["geographyKind"], "abstract-town-link")
        self.assertIn("not a verified road itinerary", feed["fictionalNotice"])
        self.assertTrue(all(trip["mode"] == "bus" and trip["timingQuality"] == "fictional-estimate" and
                            trip["fare"]["kind"] == "estimated-game" for trip in feed["trips"]))
        self.assertNotEqual(feed["revision"], self.generate(day="2026-10-20")["revision"])
        self.assertEqual(feed["validFrom"], feed["validThrough"])

    def test_persisted_example_exactly_matches_generator_and_attributed_real_places(self):
        folder = Path(__file__).resolve().parents[1] / "data/transport/examples/grenoble-lyon"
        load = lambda name: json.loads((folder / f"{name}.json").read_text())
        towns, base = load("towns"), load("map")
        actual = fictional_timetable(towns, base, "grenoble-lyon-example-v1", "2026-10-19", "Europe/Paris")
        self.assertEqual(actual, load("fictional-timetable"))
        self.assertTrue(all("SNCF" in town["source"] and "odbl" in town["licenseUrl"] for town in towns))

    def test_country_independent_including_microstates_and_cross_border_pairs(self):
        for country in EUROPE:
            towns = copy.deepcopy(TOWNS)
            towns[0]["country"] = country
            towns[1]["country"] = "GB"
            with self.subTest(country=country):
                self.assertEqual(len(self.generate(towns)["trips"]), 8)

    def test_fares_and_time_follow_published_policy(self):
        feed = self.generate()
        trip = feed["trips"][0]
        self.assertGreater(trip["estimatedDistanceMeters"], 100000)
        self.assertEqual(trip["fareCents"] % 50, 0)
        self.assertGreaterEqual(trip["fareCents"], 250)
        self.assertGreater(trip["calls"][1]["arrivalServiceSeconds"], trip["calls"][0]["departureServiceSeconds"])
        changed = copy.deepcopy(TOWNS)
        changed[1]["longitude"] += .1
        self.assertNotEqual(self.generate(changed)["revision"], feed["revision"])

    def test_invalid_towns_and_unbounded_batches_fail_without_success_fallback(self):
        for mutate in [
            lambda towns: towns[0].update(country="US"),
            lambda towns: towns[0].update(source=""),
            lambda towns: towns[0].update(latitude=float("nan")),
            lambda towns: towns[1].update(id=towns[0]["id"]),
            lambda towns: towns[0].update(longitude=True),
            lambda towns: towns[1].update(latitude=towns[0]["latitude"], longitude=towns[0]["longitude"]),
            lambda towns: towns[1].update(longitude=12),
        ]:
            towns = copy.deepcopy(TOWNS)
            mutate(towns)
            with self.subTest(mutate=mutate), self.assertRaises(ValueError):
                self.generate(towns)
        with self.assertRaises(ValueError):
            self.generate(TOWNS * 11)
        for base in [{}, {"bounds": {}}, {**BASE, "cellSizeMeters": 0},
                     {**BASE, "projectionLatitude": float("nan")}]:
            with self.subTest(base=base), self.assertRaises(ValueError):
                fictional_timetable(TOWNS, base, "grid", "2026-10-19", "Europe/Paris")
        with self.assertRaises(ValueError):
            self.generate([None, None])

    def test_unconnected_origins_are_reported_and_generation_is_bounded(self):
        towns = copy.deepcopy(TOWNS)
        towns.append({**towns[0], "id": "far-town", "longitude": 20})
        result = self.generate(towns)
        self.assertEqual(result["generation"]["unconnectedTownIds"], ["far-town"])
        self.assertEqual(len(result["trips"]), 8)

    def test_cli_persists_timetable_and_invalid_input_has_explicit_error(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            towns, base, output = folder / "towns.json", folder / "map.json", folder / "feed.json"
            towns.write_text(json.dumps(TOWNS))
            base.write_text(json.dumps(BASE))
            arguments = [sys.executable, str(root / "scripts/transport_fictional.py"),
                         "--towns", str(towns), "--map", str(base), "--grid-id", "cli-grid",
                         "--date", "2026-10-19", "--time-zone", "Europe/Paris", "--output", str(output)]
            result = subprocess.run(arguments, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            actual = json.loads(output.read_text())
            self.assertEqual(actual["kind"], "fictional-service")
            base.write_text("{}")
            result = subprocess.run(arguments, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn("Fictional transport error:", result.stderr)
            self.assertEqual(json.loads(output.read_text()), actual)

    def test_dst_generated_schedule_passes_actual_reducer(self):
        feeds = [self.generate(day=day) for day in ["2026-03-29", "2026-10-25"]]
        script = """
import fs from 'node:fs';
import {importTimetable} from './layers/transport/transport.mjs';
for(const feed of JSON.parse(fs.readFileSync(0,'utf8')))
  importTimetable(feed,{allowFictional:true});
"""
        result = subprocess.run(["node", "--input-type=module", "-e", script],
                                cwd=Path(__file__).resolve().parents[1], input=json.dumps(feeds),
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
