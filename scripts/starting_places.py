"""Explicit, cached European place lookup through Nominatim."""

import json
import math
import threading
import time
import urllib.parse
import urllib.request

COUNTRIES = frozenset(
    "ad al at ax ba be bg by ch cy cz de dk ee es fi fo fr gb gg gi gr hr hu "
    "ie im is it je li lt lu lv mc md me mk mt nl no pl pt ro rs ru se si sj sk "
    "sm tr ua va xk".split()
)


def coordinates(latitude, longitude):
    latitude, longitude = float(latitude), float(longitude)
    if not (math.isfinite(latitude) and math.isfinite(longitude)
            and 34 <= latitude <= 72 and -32 <= longitude <= 60):
        raise ValueError("Choose a starting point in the supported European area (34–72 N, 32 W–60 E).")
    return round(latitude, 6), round(longitude, 6)


def european(latitude, longitude, country):
    coordinates(latitude, longitude)
    if (country not in COUNTRIES or
            (country == "tr" and not (latitude >= 40 and longitude <= 29)) or
            (country == "ru" and latitude < 41)):
        raise ValueError("This starting point is outside supported Europe.")


class PlaceLookup:
    def __init__(self):
        self.lock = threading.Lock()
        self.cache = {}
        self.next_request = 0

    def request(self, endpoint, parameters):
        query = urllib.parse.urlencode({**parameters, "format": "jsonv2",
                                        "addressdetails": 1, "accept-language": "en"})
        url = f"https://nominatim.openstreetmap.org/{endpoint}?{query}"
        with self.lock:
            if url in self.cache:
                return self.cache[url]
            time.sleep(max(0, self.next_request - time.monotonic()))
            request = urllib.request.Request(url, headers={
                "User-Agent": "ArcanePath/0.3 (https://github.com/judelsuc/arcane-path)",
            })
            try:
                with urllib.request.urlopen(request, timeout=20) as response:
                    data = json.load(response)
            finally:
                self.next_request = time.monotonic() + 1.1
            if len(self.cache) >= 128:
                self.cache.pop(next(iter(self.cache)))
            self.cache[url] = data
            return data

    @staticmethod
    def place(item, latitude=None, longitude=None):
        if not isinstance(item, dict) or not item.get("display_name"):
            raise ValueError("The place service returned no usable location.")
        latitude, longitude = coordinates(
            item.get("lat") if latitude is None else latitude,
            item.get("lon") if longitude is None else longitude)
        european(latitude, longitude, item.get("address", {}).get("country_code"))
        return {"latitude": latitude, "longitude": longitude,
                "name": item["display_name"][:240]}

    def search(self, query):
        query = query.strip()
        if not 2 <= len(query) <= 120:
            raise ValueError("Enter a place name between 2 and 120 characters.")
        data = self.request("search", {"q": query, "limit": 8,
                            "countrycodes": ",".join(sorted(COUNTRIES)),
                            "viewbox": "-32,72,60,34", "bounded": 1})
        if not isinstance(data, list):
            raise ValueError("The place service returned an invalid search response.")
        results = []
        for item in data:
            # Search can return overseas or transcontinental matches; never offer them.
            try:
                results.append(self.place(item))
            except ValueError:
                continue
        return results

    def reverse(self, latitude, longitude):
        latitude, longitude = coordinates(latitude, longitude)
        return self.place(self.request("reverse", {
            "lat": latitude, "lon": longitude, "zoom": 10,
        }), latitude, longitude)

    def country(self, latitude, longitude):
        latitude, longitude = coordinates(latitude, longitude)
        data = self.request("reverse", {"lat": latitude, "lon": longitude, "zoom": 3})
        code = data.get("address", {}).get("country_code") if isinstance(data, dict) else None
        if not isinstance(code, str) or len(code) != 2 or not code.isascii() or not code.isalpha():
            raise ValueError("The country service returned no usable country code.")
        return {"countryCode": code.upper(), "sourceUrl": "https://nominatim.openstreetmap.org/"}
