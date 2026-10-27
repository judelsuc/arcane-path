"""Town-only documentary sources and a shared, progressively populated cache."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import html
import io
import json
import logging
import math
import re
import threading
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid

from PIL import Image

from asset_storage import AssetError, local_storage
from content_storage import clock
from journey_storage import cached_journey_cell
from journeys import JourneyConflict, JourneyRequest

VERSION = "town-document-v1"
SCHEMA = """CREATE TABLE IF NOT EXISTS town_documents (
    cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched DOUBLE PRECISION NOT NULL,
    expires DOUBLE PRECISION NOT NULL, token TEXT, lease DOUBLE PRECISION NOT NULL)"""
MAX_PHOTOS = 5


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def plain(value):
    return html.unescape(re.sub(r"<[^>]*>", "", value or "")).strip()


def distance(a, b):
    lat, lon, other_lat, other_lon = map(math.radians, (*a, *b))
    hav = math.sin((other_lat - lat) / 2) ** 2 + math.cos(lat) * math.cos(
        other_lat) * math.sin((other_lon - lon) / 2) ** 2
    return 6371008.8 * 2 * math.asin(math.sqrt(min(1, hav)))


def coordinate(value):
    if (isinstance(value, (tuple, list)) and len(value) == 2
            and all(type(n) in (float, int) and math.isfinite(n) for n in value)
            and -90 <= value[0] <= 90 and -180 <= value[1] <= 180):
        return tuple(value)
    return None


def allowed_url(url, image=False):
    parsed = urllib.parse.urlsplit(url)
    hosts = ({"upload.wikimedia.org", "thumb.wikimedia.org"} if image
             else {"www.wikidata.org", "commons.wikimedia.org"})
    return (parsed.scheme == "https" and not parsed.username and not parsed.password
            and parsed.port in (None, 443) and (
                parsed.hostname in hosts or not image and
                re.fullmatch(r"[a-z][a-z0-9-]{0,19}\.wikipedia\.org", parsed.hostname or "")))


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        if not allowed_url(newurl, request.host in {"upload.wikimedia.org", "thumb.wikimedia.org"}):
            raise ValueError("Documentary source redirected outside Wikimedia.")
        return super().redirect_request(request, fp, code, message, headers, newurl)


class Wikimedia:
    def __init__(self):
        self.opener = urllib.request.build_opener(SafeRedirect())

    def read(self, url, image=False):
        if not allowed_url(url, image):
            raise ValueError("Unapproved documentary source URL.")
        request = urllib.request.Request(url, headers={
            "User-Agent": "ArcanePath/1.0 (documentary town welcome; https://arcane-path.eu)",
            "Accept": "image/jpeg,image/png,image/webp" if image else "application/json",
        })
        limit = 12_000_000 if image else 2_000_000
        with self.opener.open(request, timeout=8) as response:
            data = response.read(limit + 1)
            if not data or len(data) > limit:
                raise ValueError("Empty or oversized documentary source response.")
            if image:
                media = response.headers.get_content_type()
                if media not in {"image/jpeg", "image/png", "image/webp"}:
                    raise ValueError("Source is not a supported photograph.")
                with Image.open(io.BytesIO(data)) as picture:
                    if (picture.format not in {"JPEG", "PNG", "WEBP"}
                            or picture.width * picture.height > 16_000_000):
                        raise ValueError("Invalid or oversized photograph dimensions.")
                    picture.verify()
                return data, media
            return json.loads(data)

    def api(self, host, **parameters):
        result = self.read(f"https://{host}/w/api.php?" + urllib.parse.urlencode({
            "format": "json", **parameters,
        }))
        if result.get("error"):
            raise ValueError(result["error"].get("info", "Wikimedia API error"))
        return result


class DocumentarySources:
    def __init__(self, source):
        self.source = source

    def resolve(self, town, language, emit, publish_photo):
        result = {"identity": town["osmId"], "language": language, "content": None,
                  "photos": [], "errors": [], "loading": True}

        def attempt(label, work):
            try:
                return work()
            except (OSError, ValueError, KeyError, TypeError) as error:
                logging.warning("Town documentary source failed (%s): %s", label, error)
                result["errors"].append(f"{label}: {error}")
                emit(result)
                return None

        def pages(host, **params):
            return list(self.source.api(host, action="query", **params).get("query", {}).get("pages", {}).values())

        tags = town["tags"]
        wiki = re.fullmatch(r"([a-z][a-z0-9-]{0,19}):(.{1,300})", tags.get("wikipedia", ""))
        entity_id = tags.get("wikidata", "")
        entity = None
        if re.fullmatch(r"Q[1-9]\d{0,14}", entity_id):
            entities = attempt("Wikidata", lambda: self.source.api(
                "www.wikidata.org", action="wbgetentities", ids=entity_id,
                props="sitelinks|claims").get("entities", {}))
            entity = (entities or {}).get(entity_id)
        elif wiki:
            entities = attempt("Wikipedia identity", lambda: self.source.api(
                "www.wikidata.org", action="wbgetentities", sites=wiki[1] + "wiki",
                titles=wiki[2], props="sitelinks|claims").get("entities", {}))
            entity = next(iter((entities or {}).values()), None)
        if entity and entity.get("missing") is not None:
            entity = None
        claims = (entity or {}).get("claims", {})

        def values(prop):
            return [claim.get("mainsnak", {}).get("datavalue", {}).get("value")
                    for claim in claims.get(prop, [])[:10]
                    if claim.get("rank") != "deprecated"]

        entity_coords = next((coordinate((value.get("latitude"), value.get("longitude")))
                              for value in values("P625") if isinstance(value, dict)), None)
        if entity_coords and distance(town["coordinates"], entity_coords) > 50000:
            result["errors"].append("Wikidata: linked place is too far from the mapped town.")
            entity, claims = None, {}
        center = entity_coords if entity and entity_coords else town["coordinates"]
        sitelinks = (entity or {}).get("sitelinks", {})
        preferred = sitelinks.get(language + "wiki", {}).get("title")
        candidates = [(language, preferred)] if preferred else []
        if wiki and (wiki[1], wiki[2]) not in candidates:
            candidates.append((wiki[1], wiki[2]))
        if not candidates:
            for fallback_language in ("en", "fr"):
                fallback_title = sitelinks.get(fallback_language + "wiki", {}).get("title")
                if fallback_title:
                    candidates.append((fallback_language, fallback_title))
                    break
        if not candidates:
            candidates.append((language, None))
        article = None
        normalize = lambda text: re.sub(r"[_\s]+", " ", "".join(
            c for c in unicodedata.normalize("NFD", text).lower()
            if not unicodedata.combining(c))).strip()
        for source_language, title in candidates:
            found = attempt(f"Wikipedia ({source_language})", lambda: pages(
                f"{source_language}.wikipedia.org",
                **({"titles": title, "redirects": "1"} if title else {
                    "generator": "geosearch", "ggscoord": f"{center[0]}|{center[1]}",
                    "ggsradius": "2000", "ggslimit": "10", "ggsnamespace": "0"}),
                prop="extracts|coordinates|pageimages|info", exintro="1", explaintext="1",
                exsentences="3", exlimit="max", piprop="name", inprop="url", colimit="max"))
            matches = []
            for page in found or []:
                if "missing" in page or not page.get("extract", "").strip():
                    continue
                coords = next((coordinate((c.get("lat"), c.get("lon")))
                               for c in page.get("coordinates", [])), None)
                if coords and distance(center, coords) > (50000 if title else 2000):
                    continue
                if not title and (not coords or normalize(re.sub(
                        r"\s*\([^)]*\)$", "", page.get("title", ""))) != normalize(town["name"])):
                    continue
                url = page.get("fullurl", "")
                if not allowed_url(url) or urllib.parse.urlsplit(url).hostname != f"{source_language}.wikipedia.org":
                    continue
                matches.append(page)
            if not title and len(matches) > 1:
                result["errors"].append(f"Wikipedia ({source_language}): ambiguous nearby town articles.")
                continue
            for page in matches[:1]:
                article = page
                result["content"] = {
                    "text": page["extract"][:900], "title": page["title"], "sourceUrl": page["fullurl"],
                    "attribution": f"Wikipedia ({source_language}) contributors",
                    "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
                    "language": source_language,
                }
                break
            if article:
                break
        if not result["content"]:
            description = tags.get(f"description:{language}") or tags.get("description")
            fallback_language = language if tags.get(f"description:{language}") else "unspecified"
            if not description:
                fallback = next(((key.split(":", 1)[1], value) for key, value in sorted(tags.items())
                                 if key.startswith("description:") and value.strip()), None)
                if fallback:
                    fallback_language, description = fallback
            if description:
                result["content"] = {
                    "text": description.strip()[:900], "title": town["name"],
                    "sourceUrl": "https://www.openstreetmap.org/" + town["osmId"],
                    "attribution": "OpenStreetMap contributors", "license": "ODbL 1.0",
                    "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
                    "language": fallback_language,
                }
        emit(result)
        titles = []
        category = None
        for value in (tags.get("wikimedia_commons"), tags.get("image")):
            if isinstance(value, str):
                if value.startswith("https://commons.wikimedia.org/wiki/"):
                    value = urllib.parse.unquote(urllib.parse.urlsplit(value).path[len("/wiki/"):])
                if value.startswith("File:"):
                    titles.append(value)
                elif value.startswith("Category:"):
                    category = value
        titles.extend("File:" + value for value in values("P18") if isinstance(value, str))
        if article and article.get("pageimage"):
            titles.append("File:" + article["pageimage"])
        if not category:
            category = next(("Category:" + value for value in values("P373") if isinstance(value, str)), None)
        if not category:
            commons_link = sitelinks.get("commonswiki", {}).get("title", "")
            if commons_link.startswith("Category:"):
                category = commons_link
        if category:
            members = attempt("Commons category", lambda: self.source.api(
                "commons.wikimedia.org", action="query", list="categorymembers",
                cmtitle=category, cmnamespace="6", cmlimit="12").get("query", {}).get("categorymembers", []))
            titles.extend(member["title"] for member in members or [] if isinstance(member.get("title"), str))

        seen = set()

        def download(found, association):
            for page in found or []:
                if len(result["photos"]) >= MAX_PHOTOS:
                    break
                image = next(iter(page.get("imageinfo", [])), {})
                metadata = image.get("extmetadata", {})
                source_url, url = image.get("descriptionurl", ""), image.get("thumburl", "")
                sha = image.get("sha1") or source_url
                if sha in seen or source_url in seen:
                    continue
                seen.update((sha, source_url))
                author = plain(metadata.get("Artist", {}).get("value"))
                license_name = plain(metadata.get("LicenseShortName", {}).get("value"))
                license_url = metadata.get("LicenseUrl", {}).get("value", "")
                categories = metadata.get("Categories", {}).get("value", "")
                if re.search(r"AI.generated|synthetic media|drawings|paintings|maps of|flags of|coats of arms",
                             categories, re.IGNORECASE):
                    continue
                reusable = re.fullmatch(r"CC(?: BY(?:-SA)? [1-4]\.[05]|0(?: 1\.0)?)|Public domain",
                                        license_name, re.IGNORECASE)
                if (not author or not license_name or not re.match(r"^https?://", license_url)
                        or not reusable
                        or not allowed_url(source_url)
                        or urllib.parse.urlsplit(source_url).hostname != "commons.wikimedia.org"
                        or not allowed_url(url, True)
                        or image.get("mime") not in {"image/jpeg", "image/png", "image/webp"}):
                    continue
                caption = plain(metadata.get("ImageDescription", {}).get("value"))[:500] or page.get("title", "")
                photograph = {"title": page.get("title", ""), "caption": caption,
                              "sourceUrl": source_url, "attribution": author[:1000],
                              "license": license_name, "licenseUrl": license_url,
                              "association": association}
                if article and association == "town":
                    photograph["associationUrl"] = article["fullurl"]
                published = attempt("Photo download", lambda: publish_photo(url, photograph))
                if published:
                    result["photos"].append(published)
                    emit(result)

        titles = list(dict.fromkeys(titles))[:20]
        if titles:
            found = attempt("Commons associated photographs", lambda: pages(
                "commons.wikimedia.org", titles="|".join(titles), prop="imageinfo",
                iiprop="url|extmetadata|mime|sha1", iiurlwidth="1000", iiextmetadatalanguage=language))
            download(found, "town")
        if len(result["photos"]) < MAX_PHOTOS:
            found = attempt("Commons nearby photographs", lambda: pages(
                "commons.wikimedia.org", generator="geosearch",
                ggscoord=f"{center[0]}|{center[1]}", ggsradius="2000", ggsnamespace="6",
                ggslimit="10", prop="imageinfo|coordinates", colimit="max",
                iiprop="url|extmetadata|mime|sha1", iiurlwidth="1000", iiextmetadatalanguage=language))
            nearby = []
            for page in found or []:
                coords = next((coordinate((c.get("lat"), c.get("lon")))
                               for c in page.get("coordinates", [])), None)
                if coords and distance(center, coords) <= 2000:
                    nearby.append(page)
            download(nearby, "nearby")
        result["loading"] = False
        emit(result)
        return result


class TownContent:
    def __init__(self, journeys, authorization, *, source=None):
        self.journeys, self.authorization = journeys, authorization
        self.assets = getattr(journeys, "assets", None)
        self.owns_assets = self.assets is None
        if self.owns_assets:
            self.assets = local_storage(journeys.path.parent / "town-documentary")
        self.source = source or Wikimedia()
        self.pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="town-documentary")
        self.lock = threading.Lock()
        self.tasks = set()

    def close(self):
        self.pool.shutdown(wait=True)
        if self.owns_assets:
            self.assets.catalogue.close()

    def town(self, data, token):
        journey = data.get("journey")
        if not isinstance(journey, str) or not re.fullmatch(r"[a-f0-9]{32}", journey):
            raise JourneyRequest("A valid town journey is required.")
        genesis = self.authorization.authorize(journey, token)
        _, grid, cell, col, row = cached_journey_cell(
            self.journeys.chunks, genesis["region"], data.get("location"))
        settlements = sorted((s for s in cell.get("settlements", [])
                              if isinstance(s, dict) and isinstance(s.get("osmId"), str)
                              and re.fullmatch(r"(?:node|way|relation)/\d+", s["osmId"])
                              and isinstance(s.get("name"), str) and s["name"].strip()),
                             key=lambda s: s["osmId"])
        if cell.get("unavailable") or cell.get("terrain") != "place" or not settlements:
            raise JourneyConflict("No mapped town is available in this cell.")
        town = settlements[0]
        if data.get("town") != town["osmId"]:
            raise JourneyConflict("The requested town does not match the current mapped cell.")
        tags = {**town.get("tags", {})}
        source = next((s for s in cell.get("contentSources", []) if s.get("osmId") == town["osmId"]), {})
        tags.update(source.get("tags", {}))
        tags.update({k: town[k] for k in ("wikipedia", "wikidata") if town.get(k)})
        bounds = grid["bounds"]
        latitude_step = grid["cellSizeMeters"] / 6371008.8 * 180 / math.pi
        projection = grid.get("projectionLatitude", (bounds["minLatitude"] + bounds["maxLatitude"]) / 2)
        longitude_step = latitude_step / math.cos(math.radians(projection))
        center = coordinate((town.get("latitude"), town.get("longitude"))) or (
            bounds["maxLatitude"] - (row + .5) * latitude_step,
            bounds["minLongitude"] + (col + .5) * longitude_step)
        return {"osmId": town["osmId"], "name": town["name"], "tags": tags, "coordinates": center}

    def request(self, data, token):
        if (not isinstance(data, dict) or set(data) - {
                "journey", "location", "town", "language", "refresh", "image"}
                or not isinstance(data.get("language"), str)
                or not re.fullmatch(r"(?:fr|en)", data["language"])
                or type(data.get("refresh", False)) is not bool):
            raise JourneyRequest("Invalid town documentary request.")
        town = self.town(data, token)
        language = data["language"]
        key = digest([VERSION, town["osmId"], language])
        catalogue = self.assets.catalogue
        with catalogue.connection() as db:
            row = db.execute(catalogue.sql(
                "SELECT payload,fetched,expires,token,lease," + clock(catalogue) +
                " FROM town_documents WHERE cache_key=?"), (key,)).fetchone()
        payload = json.loads(row[0]) if row else {
            "identity": town["osmId"], "language": language, "content": None,
            "photos": [], "errors": [], "loading": True}
        if "image" in data:
            image = data["image"]
            if not isinstance(image, str) or not any(p["imageId"] == image for p in payload["photos"]):
                raise JourneyRequest("Photograph is not in this town's documentary gallery.")
            record, body = self.assets.read("town-photographs", image)
            return body, record.media_type
        if row and row[3] and row[4] > row[5]:
            return {**payload, "loading": True}
        if row and row[3] is None and row[2] > row[5] and (
                not data.get("refresh") or row[1] + 60 > row[5]):
            return {**payload, "cached": True,
                    **({"refreshAfter": (row[1] + 60) * 1000} if data.get("refresh") else {})}
        with self.lock:
            if key not in self.tasks and len(self.tasks) < 2:
                token = uuid.uuid4().hex
                with catalogue.connection() as db:
                    now = float(db.execute("SELECT " + clock(catalogue)).fetchone()[0])
                    db.execute(catalogue.sql(
                        "INSERT INTO town_documents(cache_key,payload,fetched,expires,token,lease) "
                        "VALUES(?,?,0,0,NULL,0) ON CONFLICT(cache_key) DO NOTHING"),
                        (key, json.dumps(payload)))
                    claimed = db.execute(catalogue.sql(
                        "UPDATE town_documents SET token=?,lease=? WHERE cache_key=? "
                        "AND (token IS NULL OR lease<?) "
                        "AND (expires<? OR fetched<? OR (token IS NOT NULL AND lease<?)) RETURNING cache_key"),
                        (token, now + 180, key, now, now,
                         now - 60 if data.get("refresh") else -1, now)).fetchone()
                if claimed:
                    self.tasks.add(key)
                    self.pool.submit(self._resolve, key, token, town, language)
        return {**payload, "loading": True}

    def _resolve(self, key, token, town, language):
        result = {"identity": town["osmId"], "language": language, "content": None,
                  "photos": [], "errors": [], "loading": True}

        def emit(value):
            result.update(value)
            with self.assets.catalogue.connection() as db:
                now = float(db.execute("SELECT " + clock(self.assets.catalogue)).fetchone()[0])
                result.update(retrievedAt=datetime.fromtimestamp(now, timezone.utc).isoformat(),
                              expiresAt=(now + (300 if result["errors"] else 7 * 86400)) * 1000)
                updated = db.execute(self.assets.catalogue.sql(
                    "UPDATE town_documents SET payload=?,fetched=?,expires=?,token=?,lease=? "
                    "WHERE cache_key=? AND token=? RETURNING cache_key"),
                    (json.dumps(result), now, result["expiresAt"] / 1000,
                     token if result["loading"] else None, now + 180 if result["loading"] else 0,
                     key, token)).fetchone()
                if updated is None:
                    raise AssetError("Town documentary cache lease was lost.")

        def publish_photo(url, metadata):
            body, media = self.source.read(url, image=True)
            image_id = digest([metadata, hashlib.sha256(body).hexdigest()])
            self.assets.publish("town-photographs", image_id, body, media_type=media,
                                retention="cache", provenance={
                                    "source": metadata["sourceUrl"], "license": metadata["license"],
                                    "version": VERSION})
            return {**metadata, "imageId": image_id}

        try:
            DocumentarySources(self.source).resolve(town, language, emit, publish_photo)
        except Exception:
            logging.exception("Town documentary worker failed for %s", town["osmId"])
            result["errors"].append("Town documentary processing failed; check server logs.")
            result["loading"] = False
            emit(result)
        finally:
            with self.lock:
                self.tasks.discard(key)
