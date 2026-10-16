"""Offline-reusable monthly summaries of five complete years of reanalysis."""

import math
import urllib.parse
import urllib.request
import json
from collections import Counter
from datetime import date, timedelta

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FIELDS = ("temperature_2m_mean", "temperature_2m_min", "temperature_2m_max",
          "precipitation_sum", "weather_code")


def condition(code):
    if code == 0:
        return "clear"
    if code in (1, 2, 3):
        return "cloudy"
    if code in (45, 48):
        return "fog"
    if code in (51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82):
        return "rain"
    if code in (71, 73, 75, 77, 85, 86):
        return "snow"
    if code in (95, 96, 99):
        return "storm"
    raise ValueError(f"Unknown historical weather code: {code}")


def fetch_climate(latitude, longitude, end_year):
    start, end = date(end_year - 4, 1, 1), date(end_year, 12, 31)
    query = urllib.parse.urlencode({
        "latitude": latitude, "longitude": longitude,
        "start_date": start.isoformat(), "end_date": end.isoformat(),
        "daily": ",".join(FIELDS), "timezone": "UTC",
    })
    url = f"{ARCHIVE_URL}?{query}"
    request = urllib.request.Request(url, headers={"User-Agent": "ArcanePath/0.3 (local travel prototype)"})
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = json.load(response)
    elevation = payload.get("elevation")
    if (isinstance(elevation, bool) or not isinstance(elevation, (int, float))
            or not math.isfinite(elevation) or not -500 <= elevation <= 9000):
        raise ValueError("Historical weather returned missing or invalid reference elevation.")
    daily = payload.get("daily", {})
    count = (end - start).days + 1
    if any(not isinstance(daily.get(field), list) or len(daily[field]) != count
           for field in ("time", *FIELDS)):
        raise ValueError("Historical weather returned incomplete daily series.")
    groups = [[] for _ in range(12)]
    for index in range(count):
        day = start + timedelta(days=index)
        if daily["time"][index] != day.isoformat():
            raise ValueError("Historical weather returned unexpected dates.")
        values = [daily[field][index] for field in FIELDS]
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in values):
            raise ValueError("Historical weather contains missing or invalid values.")
        mean, low, high, rain, code = values
        if not -100 <= low <= mean <= high <= 70 or rain < 0:
            raise ValueError("Historical weather values are outside valid ranges.")
        groups[day.month - 1].append((mean, low, high, rain, condition(code)))
    months = []
    for samples in groups:
        common, frequency = Counter(sample[4] for sample in samples).most_common(1)[0]
        means = [round(sum(sample[i] for sample in samples) / len(samples), 1) for i in range(4)]
        months.append(dict(zip(("meanC", "minC", "maxC", "rainMm"), means),
                           condition=common, frequency=round(frequency / len(samples) * 100),
                           samples=len(samples)))
    return {
        "latitude": latitude, "longitude": longitude, "startYear": start.year, "endYear": end.year,
        "elevationMeters": elevation,
        "months": months, "source": "Open-Meteo / ERA5 reanalysis",
        "sourceUrl": "https://open-meteo.com/en/docs/historical-weather-api",
        "license": "CC BY 4.0", "sourceRequest": url,
    }
