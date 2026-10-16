import io
import json
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from weather import fetch_climate, condition
from travel_server import WeatherStore


def history():
    start, end = date(2021, 1, 1), date(2025, 12, 31)
    days = [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]
    count = len(days)
    return {"elevation": 200, "daily": {
        "time": days, "temperature_2m_mean": [12] * count,
        "temperature_2m_min": [6] * count, "temperature_2m_max": [18] * count,
        "precipitation_sum": [2] * count, "weather_code": [3] * count,
    }}


class WeatherTests(unittest.TestCase):
    def test_monthly_averages_use_five_full_years_including_leap_days(self):
        with patch("weather.urllib.request.urlopen", return_value=io.BytesIO(json.dumps(history()).encode())) as fetch:
            data = fetch_climate(44.5, 2.3, 2025)
        self.assertEqual(data["startYear"], 2021)
        self.assertEqual(data["endYear"], 2025)
        self.assertEqual(data["elevationMeters"], 200)
        self.assertEqual(len(data["months"]), 12)
        self.assertEqual(data["months"][1]["samples"], 141)
        self.assertEqual(data["months"][0], {
            "meanC": 12, "minC": 6, "maxC": 18, "rainMm": 2,
            "condition": "cloudy", "frequency": 100, "samples": 155,
        })
        self.assertIn("start_date=2021-01-01", fetch.call_args.args[0].full_url)

    def test_missing_values_incomplete_series_and_runtime_errors_fail(self):
        for kind in ("null", "short", "bad-date", "invalid-code", "elevation", "provider"):
            data = history()
            if kind == "null":
                data["daily"]["temperature_2m_mean"][0] = None
            elif kind == "short":
                data["daily"]["weather_code"].pop()
            elif kind == "bad-date":
                data["daily"]["time"][0] = "2020-01-01"
            elif kind == "invalid-code":
                data["daily"]["weather_code"][0] = 100
            elif kind == "elevation":
                data["elevation"] = None
            else:
                data = {"error": True, "reason": "Throttled"}
            with self.subTest(kind=kind), \
                    patch("weather.urllib.request.urlopen", return_value=io.BytesIO(json.dumps(data).encode())):
                with self.assertRaises(ValueError):
                    fetch_climate(44.5, 2.3, 2025)

    def test_cache_survives_restart_and_reuses_nearby_area_without_network(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch("travel_server.fetch_climate", return_value={"months": []}) as fetch:
                data = WeatherStore(Path(directory)).get(44.541, 2.31)
                self.assertEqual(fetch.call_count, 1)
            with patch("travel_server.fetch_climate", side_effect=AssertionError("Offline cache only")):
                self.assertEqual(WeatherStore(Path(directory)).get(44.54, 2.32), data)
            path = next(Path(directory).glob("*.json"))
            payload = json.loads(path.read_text())
            payload["data"]["months"] = ["tampered"]
            path.write_text(json.dumps(payload))
            with self.assertRaisesRegex(ValueError, "Corrupt weather cache"):
                WeatherStore(Path(directory)).get(44.54, 2.32)

    def test_provider_failure_is_not_cached_and_has_cooldown(self):
        with tempfile.TemporaryDirectory() as directory:
            store = WeatherStore(Path(directory))
            with patch("travel_server.fetch_climate", side_effect=OSError("Offline")) as fetch:
                with self.assertRaisesRegex(OSError, "Offline"):
                    store.get(44.5, 2.3)
                with self.assertRaisesRegex(ValueError, "cooling down"):
                    store.get(44.5, 2.3)
                self.assertEqual(fetch.call_count, 1)
            self.assertEqual(list(Path(directory).glob("*")), [])

    def test_all_supported_weather_groups_and_unknown_codes(self):
        for code, expected in [(0, "clear"), (2, "cloudy"), (45, "fog"),
                               (61, "rain"), (85, "snow"), (99, "storm")]:
            self.assertEqual(condition(code), expected)
        with self.assertRaises(ValueError):
            condition(999)
