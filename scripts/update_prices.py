"""Refresh national Big Mac observations and the European fallback mean."""

import csv
import io
import json
import math
import urllib.request
from pathlib import Path

from starting_places import COUNTRIES

SOURCE = "https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/source-data/big-mac-source-data-v2.csv"
COUNTRY_CODES = {
    "AND": "AD", "ALB": "AL", "AUT": "AT", "ALA": "AX", "BIH": "BA",
    "BEL": "BE", "BGR": "BG", "BLR": "BY", "CHE": "CH", "CYP": "CY",
    "CZE": "CZ", "DEU": "DE", "DNK": "DK", "EST": "EE", "ESP": "ES",
    "FIN": "FI", "FRO": "FO", "FRA": "FR", "GBR": "GB", "GGY": "GG",
    "GIB": "GI", "GRC": "GR", "HRV": "HR", "HUN": "HU", "IRL": "IE",
    "IMN": "IM", "ISL": "IS", "ITA": "IT", "JEY": "JE", "LIE": "LI",
    "LTU": "LT", "LUX": "LU", "LVA": "LV", "MCO": "MC", "MDA": "MD",
    "MNE": "ME", "MKD": "MK", "MLT": "MT", "NLD": "NL", "NOR": "NO",
    "POL": "PL", "PRT": "PT", "ROU": "RO", "SRB": "RS", "RUS": "RU",
    "SWE": "SE", "SVN": "SI", "SJM": "SJ", "SVK": "SK", "SMR": "SM",
    "TUR": "TR", "UKR": "UA", "VAT": "VA", "XKX": "XK", "USA": "US",
}


def build_pricing(rows, previous):
    if not rows:
        raise ValueError("Empty national pricing source.")
    date = max(row["date"] for row in rows)
    current = [row for row in rows if row["date"] == date]
    references = [row for row in current if row["iso_a3"] == "EUZ"]
    if len(references) != 1:
        raise ValueError("Missing or duplicate euro-area reference.")
    reference = references[0]
    reference_price, reference_exchange = float(reference["local_price"]), float(reference["dollar_ex"])
    if (reference["currency_code"] != "EUR" or
            not all(math.isfinite(v) and v > 0 for v in (reference_price, reference_exchange))):
        raise ValueError("Invalid euro-area reference.")
    markets = {}
    for row in current:
        code = COUNTRY_CODES.get(row["iso_a3"])
        if not code:
            continue
        price, exchange = float(row["local_price"]), float(row["dollar_ex"])
        if (code in markets or not all(math.isfinite(v) and v > 0 for v in (price, exchange))
                or not math.isfinite(price / exchange)):
            raise ValueError("Invalid national price observation.")
        markets[code] = {"name": row["name"], "dollarPrice": price / exchange,
                         "localPrice": price, "currency": row["currency_code"]}
    european = sorted(code for code in markets if code.lower() in COUNTRIES)
    if "IT" not in markets or len(european) < 10:
        raise ValueError("Incomplete national pricing source.")
    return {**previous, "date": date, "source": SOURCE,
            "referenceCents": round(reference_price * 100),
            "referenceDollarPrice": reference_price / reference_exchange,
            "markets": dict(sorted(markets.items())),
            "fallback": {"method": "european-national-arithmetic-mean",
                         "countries": european,
                         "dollarPrice": math.fsum(markets[code]["dollarPrice"] for code in european) / len(european)}}


if __name__ == "__main__":
    request = urllib.request.Request(SOURCE, headers={"User-Agent": "ArcanePath/0.4"})
    with urllib.request.urlopen(request, timeout=30) as response:
        rows = list(csv.DictReader(io.StringIO(response.read().decode())))
    path = Path(__file__).resolve().parents[1] / "public/economy.json"
    original = path.read_text()
    data = json.loads(original)
    data["pricing"] = build_pricing(rows, data["pricing"])
    start = original.index('  "pricing": ')
    end = original.index('  "rules": ', start)
    pricing = json.dumps(data["pricing"], ensure_ascii=False, indent=2).replace("\n", "\n  ")
    path.write_text(original[:start] + '  "pricing": ' + pricing + ",\n" + original[end:])
    print(f"Updated {len(data['pricing']['markets'])} national prices; "
          f"European mean from {len(data['pricing']['fallback']['countries'])} countries.")
    missing = sorted(code.upper() for code in COUNTRIES
                     if code.upper() not in data["pricing"]["markets"])
    print(f"No current national observation (European estimate applies): {', '.join(missing)}")
