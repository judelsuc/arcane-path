"""Prepare one retained six-icon collection per Paris day, with one provider dispatch."""

import argparse
from datetime import datetime
import json
import logging
import os
from pathlib import Path
import secrets
import sqlite3
from zoneinfo import ZoneInfo

from admin_console import save_collection, silhouette, validate_collection
from asset_storage import AssetError, configured_storage
from content_factory import OvhWriter, WorkshopError, NoRedirect, verify_free_text_model
from cosmetic_themes import THEMES, PALETTES
from durable_jobs import DurableJobs
from journey_storage import StoreConnection
from journeys import JourneyRequest
from terraform_ovh import private_file
import urllib.request

PARIS = ZoneInfo("Europe/Paris")
MODEL = "Mistral-Small-3.2-24B-Instruct-2506"
KIND = "daily-cosmetic-icons"
PROVIDER = "ovh-daily-cosmetic-icons"
SCHEMAS = (
    """CREATE TABLE IF NOT EXISTS cosmetic_days (
        day TEXT PRIMARY KEY, cycle INTEGER NOT NULL, theme TEXT NOT NULL,
        family TEXT NOT NULL, palette TEXT NOT NULL, brief TEXT NOT NULL,
        usage TEXT, response_model TEXT, UNIQUE(cycle,theme))""",
)


def choose_theme(history):
    """Draw from the unused deck, preferring recent-family and palette diversity."""
    cycle = max((row["cycle"] for row in history), default=0)
    used = {row["theme"] for row in history if row["cycle"] == cycle}
    if len(used) == len(THEMES):
        cycle += 1
        used = set()
    recent = sorted(history, key=lambda row: row["day"], reverse=True)
    last_family = recent[0]["family"] if recent else None
    available = [theme for theme in THEMES if theme["id"] not in used]
    eligible = [theme for theme in available if theme["family"] != last_family] or available
    recent_families = [row["family"] for row in recent[:7]]
    score = min(recent_families.count(theme["family"]) for theme in eligible)
    theme = secrets.choice([theme for theme in eligible if recent_families.count(theme["family"]) == score])
    recent_palettes = {row["palette"] for row in recent[:4]}
    palette = secrets.choice([palette for palette in PALETTES if palette[0] not in recent_palettes])
    return cycle, theme, palette


def make_brief(day, theme, palette):
    return {"version": 1, "day": day, "collection": f"daily-icons-{day}",
            "theme": {**theme, "roles": list(theme["roles"])},
            "palette": {"id": palette[0], "coat": palette[1], "accent": palette[2]},
            "model": MODEL}


def provider_request(brief, model):
    icon_schema = {"type": "object", "additionalProperties": False, "required": ["id", "en", "fr", "pixels"],
                   "properties": {"id": {"type": "string"}, "en": {"type": "string"}, "fr": {"type": "string"},
                                  "pixels": {"type": "array", "minItems": 12, "maxItems": 12,
                                             "items": {"type": "string", "pattern": "^[.ocas]{12}$"}}}}
    return {"model": model, "stream": False, "max_tokens": 6000, "temperature": .85,
            "messages": [
                {"role": "system", "content": (
                    "Design six ORIGINAL cohesive tiny pixel characters for a fictional walking game. "
                    "Return only the requested JSON. No existing franchises, logos, text in artwork or copied characters. "
                    "Each sprite is exactly 12 rows of 12 characters. Alphabet: .=transparent, o=dark outline, "
                    "c=shared coat colour, a=shared accent, s=warm skin. Front/three-quarter view, full body, feet "
                    "on the last row, same scale, no background. Use 24-130 occupied pixels including an outline. "
                    "Keep at least 3 coat pixels and readable heads, bodies and feet. "
                    "Plan one different silhouette, hat and accessory for each supplied role BEFORE drawing. "
                    "Use different silhouettes, not recolours or one-pixel edits. Keep the shared palette and "
                    "proportions. Accessories must fit the supplied theme. Bilingual original names, max 100 "
                    "characters each. Icon IDs must be role-1 through role-6 in role order. "
                    "No executable code, SVG, instructions, gameplay effects or real people.")},
                {"role": "user", "content": json.dumps(brief, ensure_ascii=False)},
            ],
            "response_format": {"type": "json_schema", "json_schema": {
                "name": "daily_icon_collection", "strict": True,
                "schema": {"type": "object", "additionalProperties": False, "required": ["icons"],
                           "properties": {"icons": {"type": "array", "minItems": 6, "maxItems": 6,
                                                    "items": icon_schema}}}}}}


def validate_response(response, brief):
    choices = response.get("choices") if isinstance(response, dict) else None
    if (not isinstance(choices, list) or len(choices) != 1 or not isinstance(choices[0], dict)
            or choices[0].get("finish_reason") != "stop"):
        raise JourneyRequest("The model did not finish one complete six-icon set.")
    message = choices[0].get("message")
    if not isinstance(message, dict) or message.get("refusal") or not isinstance(message.get("content"), str):
        raise JourneyRequest("The model returned no usable icon set.")
    try:
        value = json.loads(message["content"])
    except (ValueError, UnicodeError) as error:
        raise JourneyRequest("The model returned invalid icon JSON.") from error
    if not isinstance(value, dict) or set(value) != {"icons"} or not isinstance(value["icons"], list) or len(value["icons"]) != 6:
        raise JourneyRequest("Daily sets must contain exactly six icons.")
    icons = []
    for index, icon in enumerate(value["icons"]):
        if (not isinstance(icon, dict) or set(icon) != {"id", "en", "fr", "pixels"}
                or icon["id"] != f"role-{index + 1}"):
            raise JourneyRequest("Daily icon roles do not match the retained brief.")
        icons.append({**icon, "coat": brief["palette"]["coat"], "accent": brief["palette"]["accent"]})
    collection = validate_collection({"version": 1, "id": brief["collection"], "theme": brief["theme"]["title"],
                                      "model": brief["model"], "icons": icons})
    masks = [silhouette(icon) for icon in icons]
    for index, mask in enumerate(masks):
        if any((mask & other).bit_count() / (mask | other).bit_count() >= .9 for other in masks[:index]):
            raise JourneyRequest("Daily set contains nearly identical silhouettes; not queued for approval.")
        if "".join(icons[index]["pixels"]).count("c") < 3:
            raise JourneyRequest("Daily icons must use the shared coat palette.")
    usage = response.get("usage")
    if (not isinstance(usage, dict) or any(type(usage.get(key)) is not int or usage[key] < 0
                                         for key in ("prompt_tokens", "completion_tokens", "total_tokens"))
            or usage["total_tokens"] != usage["prompt_tokens"] + usage["completion_tokens"]):
        raise JourneyRequest("The model returned invalid token accounting.")
    actual = response.get("model")
    if not isinstance(actual, str) or not 1 <= len(actual) <= 160:
        raise JourneyRequest("The model returned invalid provenance.")
    return collection, {key: usage[key] for key in ("prompt_tokens", "completion_tokens", "total_tokens")}, actual


class FreeIconWriter:
    def __init__(self, token, request_builder=provider_request):
        self.writer = OvhWriter(token, MODEL, request_builder, timeout=180)
        self.opener = urllib.request.build_opener(NoRedirect())

    def __call__(self, brief):
        if brief["model"] != MODEL or brief["version"] != 1:
            raise WorkshopError("Retained daily brief needs its original model and prompt version; generation refused.", 503)
        verify_free_text_model(self.opener, MODEL)
        return self.writer(brief)


class DailyCosmetics:
    def __init__(self, assets):
        self.assets, self.queue = assets, DurableJobs(assets.catalogue)

    def prepare(self, day):
        key = day.isoformat()
        with self.assets.catalogue.connection() as raw:
            db = StoreConnection(raw, self.assets.catalogue, mapping=True)
            db.begin("admin-console")
            row = db.execute("SELECT brief FROM cosmetic_days WHERE day=?", (key,)).fetchone()
            if row:
                return json.loads(row["brief"])
            if db.execute("SELECT COUNT(*) FROM admin_collections").fetchone()[0] >= 5000:
                raise JourneyRequest("Cosmetic collection capacity reached; generation stopped.")
            history = db.execute("SELECT day,cycle,theme,family,palette FROM cosmetic_days ORDER BY day").fetchall()
            cycle, theme, palette = choose_theme(history)
            brief = make_brief(key, theme, palette)
            db.execute("INSERT INTO cosmetic_days(day,cycle,theme,family,palette,brief) VALUES(?,?,?,?,?,?)",
                       (key, cycle, theme["id"], theme["family"], palette[0], json.dumps(brief, sort_keys=True)))
            self.queue.enqueue(KIND, key, brief, provider=PROVIDER, max_attempts=1, connection=raw)
            return brief

    def generate(self, day, writer):
        brief = self.prepare(day)
        key = day.isoformat()
        job = self.queue.acquire(KIND, request=key, seconds=600)
        if job is None:
            return self.queue.inspect(KIND, key)
        try:
            self.queue.dispatch(job)
            response = writer(brief)
            collection, usage, actual = validate_response(response, brief)
            with self.assets.catalogue.connection() as raw:
                db = StoreConnection(raw, self.assets.catalogue, mapping=True)
                db.begin("admin-console")
                previous = db.execute("SELECT payload FROM admin_collections WHERE status IN ('draft','published')").fetchall()
                known = [silhouette(icon) for row in previous for icon in json.loads(row["payload"])["icons"]]
                for icon in collection["icons"]:
                    mask = silhouette(icon)
                    if any((mask & other).bit_count() / (mask | other).bit_count() >= .95 for other in known):
                        raise JourneyRequest("Generated set repeats a previous icon silhouette.")
                save_collection(db, collection)
                db.execute("UPDATE cosmetic_days SET usage=?,response_model=? WHERE day=?",
                           (json.dumps(usage), actual, key))
                completed = db.execute(
                    "UPDATE worker_jobs SET status='ready',error=NULL WHERE kind=? AND request=? AND token=? "
                    "AND status='dispatched' AND expires>(" + self.queue._clock() + ") RETURNING request",
                    (KIND, key, job["token"])).fetchone()
                if completed is None:
                    raise AssetError("Daily icon lease expired; no draft was published.")
        except (AssetError, WorkshopError, JourneyRequest, ValueError, OSError, sqlite3.Error) as error:
            logging.error("Daily icon generation failed for %s: %s", key, error)
            current = self.queue.inspect(KIND, key)
            if current["status"] in ("leased", "dispatched"):
                with self.assets.catalogue.connection() as raw:
                    db = StoreConnection(raw, self.assets.catalogue)
                    db.execute("UPDATE worker_jobs SET status='failed',error=? WHERE kind=? AND request=? AND token=? "
                               "AND status IN ('leased','dispatched') AND expires>(" + self.queue._clock() + ")",
                               (str(error)[:2000], KIND, key, job["token"]))
            raise
        return self.queue.inspect(KIND, key)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    path = os.environ.get("ARCANE_LIVE_TEXT_TOKEN_FILE")
    if not path:
        parser.error("ARCANE_LIVE_TEXT_TOKEN_FILE must select a private server token file.")
    token = private_file(Path(path)).strip()
    if not token or not token.isascii() or any(char.isspace() for char in token):
        parser.error("Invalid private model access token.")
    assets = configured_storage()
    if assets is None:
        parser.error("Shared asset storage must be configured.")
    try:
        result = DailyCosmetics(assets).generate(datetime.now(PARIS).date(), FreeIconWriter(token))
        print(json.dumps(result))
        if result["status"] in ("failed", "uncertain"):
            raise SystemExit(1)
    except (AssetError, WorkshopError, JourneyRequest, ValueError, OSError, sqlite3.Error):
        logging.exception("Daily cosmetic generation stopped; no automatic retry.")
        raise SystemExit(1)
    finally:
        assets.catalogue.close()


if __name__ == "__main__":
    main()
