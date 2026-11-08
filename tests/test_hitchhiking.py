import json
import math
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from journey_transport import JourneyTransport
from town_trail import distance, grid_position


class HitchhikingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = json.loads((Path(__file__).resolve().parents[1] / "public/map.json").read_text())
        cls.service = JourneyTransport(SimpleNamespace(bases={"firmi": cls.base}))

    def test_exact_ten_nearest_catalogue_towns_without_radius_or_fictional_destinations(self):
        col, row = 12, 8
        result = self.service.hitchhiking("firmi", col, row)
        projection = (self.base["bounds"]["minLatitude"] + self.base["bounds"]["maxLatitude"]) / 2
        step = self.base["cellSizeMeters"] / 6371008.8 * 180 / math.pi
        point = {"latitude": self.base["bounds"]["maxLatitude"] - (row + .5) * step,
                 "longitude": self.base["bounds"]["minLongitude"] + (col + .5) * step /
                 math.cos(math.radians(projection))}
        all_towns = [
            {"id": f"geoname:{identity}", "name": name, "latitude": lat, "longitude": lon}
            for rows in self.service.towns.buckets.values()
            for identity, name, lat, lon, _, _ in rows
            if grid_position(self.base, lat, lon) != {"col": col, "row": row}
        ]
        expected = sorted(all_towns, key=lambda town: (distance(point, town), town["id"]))[:10]
        self.assertEqual([town["id"] for town in result["destinations"]], [town["id"] for town in expected])
        self.assertEqual(len(result["destinations"]), 10)
        for town in result["destinations"]:
            self.assertEqual({key: town[key] for key in ("col", "row")},
                             grid_position(self.base, town["latitude"], town["longitude"]))
        self.assertEqual(result, self.service.hitchhiking("firmi", col, row))

    def test_strict_coordinates_and_no_fake_success_when_catalogue_is_too_small(self):
        for args in [("bad", 0, 0), ("firmi", True, 0), ("firmi", 9000, 0), ("firmi", 1.5, 0)]:
            with self.assertRaises(ValueError):
                self.service.hitchhiking(*args)
        service = JourneyTransport(SimpleNamespace(bases={"firmi": self.base}))
        service.towns.buckets = {}
        with self.assertRaisesRegex(ValueError, "Ten nearby towns"):
            service.hitchhiking("firmi", 0, 0)


if __name__ == "__main__":
    unittest.main()
