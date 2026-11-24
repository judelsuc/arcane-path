"""Bounded Wikipedia atmosphere for decorative art, never article prose in prompts."""

from datetime import datetime, timezone
import logging
import math
import re
import urllib.parse

from journey_storage import cached_journey_cell
from town_content import Wikimedia, allowed_url, coordinate, distance, plain


FEATURES = (
    (r"\blakes?\b|\blacs?\b", "a lakeside landscape"),
    (r"\brivers?\b|\bfleuves?\b|\brivières?\b", "a river landscape"),
    (r"\bmountains?\b|\balps\b|\bmontagnes?\b|\balpes\b", "mountain scenery"),
    (r"\bvalleys?\b|\bvallées?\b", "a valley landscape"),
    (r"\bforests?\b|\bforêts?\b", "woodland"),
    (r"\bcoast(?:al)?\b|\blittoral\b|\bcôti[eè]r", "a coastal landscape"),
    (r"\bcanals?\b|\bcanaux\b", "canals"),
    (r"\bcastles?\b|\bchâteaux?\b", "a castle silhouette"),
    (r"\bcathedrals?\b|\bcathédrales?\b", "a cathedral silhouette"),
    (r"\bmedieval\b|\bmédiéval", "medieval architecture"),
    (r"\bbridges?\b|\bponts?\b", "bridges"),
    (r"\bvineyards?\b|\bvignobles?\b", "vineyards"),
    (r"\bharbou?rs?\b|\bports?\b", "a harbour"),
)


def setting_facts(text):
    # A finite vocabulary prevents retrieved instructions, names and prose reaching SDXL.
    sentences = re.split(r"[.!?;\n]+", plain(text)[:6000].lower())
    sentences = [s for s in sentences if not re.search(
        r"\b(no|not|without|never|sans|aucun|pas|ignore|instructions?|prompt|system)\b", s)]
    return [label for pattern, label in FEATURES
            if any(re.search(pattern, sentence) for sentence in sentences)][:6]


def setting_lookup(chunks, region, position):
    _, grid, cell, col, row = cached_journey_cell(chunks, region, position)
    if cell.get("unavailable"):
        return None
    bounds = grid["bounds"]
    step = math.degrees(grid["cellSizeMeters"] / 6371008.8)
    projection = grid.get("projectionLatitude", (bounds["minLatitude"] + bounds["maxLatitude"]) / 2)
    center = (bounds["maxLatitude"] - (row + .5) * step,
              bounds["minLongitude"] + (col + .5) * step / math.cos(math.radians(projection)))
    wiki = None
    for item in [*cell.get("settlements", []), *cell.get("contentSources", []), *cell.get("pois", [])]:
        value = item.get("wikipedia") or item.get("tags", {}).get("wikipedia", "")
        if isinstance(value, str) and re.fullmatch(r"(en|fr):[^\x00-\x1f]{1,300}", value):
            wiki = value
            break
    return {"center": center, "wikipedia": wiki}


def resolve_setting(lookup, source=None):
    result = {"status": "unavailable", "facts": [], "sources": [],
              "retrieved": datetime.now(timezone.utc).isoformat(),
              "reason": "No recorded setting location; tarot/scenery-only illustration."}
    if not lookup:
        return result
    source = source or Wikimedia()
    errors = []
    wiki = lookup.get("wikipedia")
    candidates = [wiki.split(":", 1)] if wiki else [(language, None) for language in ("en", "fr")]
    for language, title in candidates:
        try:
            response = source.api(
                f"{language}.wikipedia.org", action="query",
                **({"titles": title, "redirects": "1"} if title else {
                    "generator": "geosearch", "ggscoord": "|".join(map(str, lookup["center"])),
                    "ggsradius": "2000", "ggslimit": "3", "ggsnamespace": "0"}),
                prop="extracts|coordinates|info", exintro="1", explaintext="1",
                exsentences="6", exlimit="max", inprop="url", colimit="max")
            pages = response.get("query", {}).get("pages", {}).values()
            matches = []
            for page in pages:
                coords = next((coordinate((c.get("lat"), c.get("lon")))
                               for c in page.get("coordinates", [])), None)
                url = page.get("fullurl", "")
                if ("missing" in page or not allowed_url(url)
                        or urllib.parse.urlsplit(url).hostname != f"{language}.wikipedia.org"
                        or type(page.get("pageid")) is not int or page["pageid"] <= 0
                        or not coords or distance(lookup["center"], coords) > 2000):
                    continue
                facts = setting_facts(page.get("extract", ""))
                if facts:
                    matches.append((distance(lookup["center"], coords), page, facts))
            if matches:
                _, page, facts = min(matches, key=lambda match: (match[0], match[1]["pageid"]))
                return {**result, "status": "ready", "facts": facts, "reason": "",
                        "sources": [{
                            "title": plain(page["title"])[:300],
                            "sourceUrl": (page["fullurl"] if len(page["fullurl"]) <= 500
                                          else f"https://{language}.wikipedia.org/?curid={page['pageid']}"),
                            "attribution": f"Wikipedia ({language}) contributors",
                            "license": "CC BY-SA 4.0",
                            "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
                        }]}
        except (OSError, ValueError, KeyError, TypeError) as error:
            logging.warning("Wikipedia illustration setting unavailable: %s", error)
            errors.append(str(error)[:300])
    return {**result, "reason": ("Wikipedia lookup failed: " + "; ".join(errors) if errors
                               else "No nearby Wikipedia introduction with supported setting facts; "
                                    "tarot/scenery-only illustration.")}
