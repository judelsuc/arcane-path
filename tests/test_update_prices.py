import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from update_prices import build_pricing, COUNTRY_CODES
from starting_places import COUNTRIES


class PriceImportTests(unittest.TestCase):
    def test_imports_same_date_national_observations_and_uses_only_europe_for_mean(self):
        def row(name, code, price, exchange="1", date="2026-07-01"):
            return {"name": name, "iso_a3": code, "local_price": price,
                    "dollar_ex": exchange, "currency_code": "EUR", "date": date}
        rows = [row("Euro area", "EUZ", "6.19"), row("Italy", "ITA", "6.56"),
                row("United States", "USA", "100")]
        for name, code in [("Austria", "AUT"), ("Belgium", "BEL"), ("Bulgaria", "BGR"),
                           ("Croatia", "HRV"), ("France", "FRA"), ("Germany", "DEU"),
                           ("Greece", "GRC"), ("Spain", "ESP"), ("Portugal", "PRT"),
                           ("Finland", "FIN")]:
            rows.append(row(name, code, "5"))
        rows.append(row("Italy", "ITA", "1", date="2025-07-01"))
        data = build_pricing(rows, {})
        self.assertEqual(data["markets"]["IT"]["localPrice"], 6.56)
        self.assertNotIn("US", data["fallback"]["countries"])
        self.assertAlmostEqual(data["fallback"]["dollarPrice"], (6.56 + 10 * 5) / 11)
        rows[1]["dollar_ex"] = "2"
        self.assertEqual(build_pricing(rows, {})["markets"]["IT"]["dollarPrice"], 3.28)
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            build_pricing(rows[:3], {})
        rows[1]["dollar_ex"] = "0"
        with self.assertRaisesRegex(ValueError, "Invalid"):
            build_pricing(rows, {})

    def test_every_supported_european_country_is_mapped_and_imported_by_code(self):
        self.assertEqual({code.lower() for code in COUNTRY_CODES.values()} - {"us"}, COUNTRIES)
        rows = [{"name": "Euro area", "iso_a3": "EUZ", "date": "2026-07-01",
                 "currency_code": "EUR", "local_price": "6.19", "dollar_ex": "1"}]
        for iso3, iso2 in COUNTRY_CODES.items():
            rows.append({"name": f"Source label for {iso2}", "iso_a3": iso3,
                         "date": "2026-07-01", "currency_code": "EUR",
                         "local_price": "6", "dollar_ex": "2"})
        data = build_pricing(rows, {})
        self.assertEqual(set(data["markets"]), set(COUNTRY_CODES.values()))
        self.assertEqual(set(data["fallback"]["countries"]), {code.upper() for code in COUNTRIES})
        self.assertEqual(data["markets"]["MD"]["dollarPrice"], 3)
        self.assertEqual(data["markets"]["LU"]["name"], "Source label for LU")
        self.assertEqual(data["fallback"]["dollarPrice"], 3)

    def test_rejects_missing_or_invalid_reference(self):
        with self.assertRaisesRegex(ValueError, "Empty"):
            build_pricing([], {})
        row = {"name": "Euro area", "iso_a3": "EUZ", "date": "2026-07-01",
               "currency_code": "EUR", "local_price": "6.19", "dollar_ex": "0"}
        with self.assertRaisesRegex(ValueError, "Invalid euro-area"):
            build_pricing([row], {})
        with self.assertRaisesRegex(ValueError, "Missing or duplicate"):
            build_pricing([row, row], {})
