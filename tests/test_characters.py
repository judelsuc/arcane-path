from contextlib import closing, contextmanager
import io
import json
import sqlite3
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import Mock, patch
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from abandoned_journals import JournalForbidden
from asset_storage import local_storage
from characters import Characters
import characters as character_module
from durable_jobs import DurableJobs
from journeys import JourneyConflict, JourneyRequest
from content_factory import CHARACTER_IMAGE_STYLE, IMAGE_ENDPOINT, IMAGE_MODEL, OvhImageWriter, WorkshopError


def fixture_map(locale="fr-FR", country_codes=None):
    return {
        "name": "Firmi", "namingLocale": locale, "width": 3, "height": 1,
        "rows": [[
            {"terrain": "place", "settlements": [{"osmId": "node/123", "name": "Firmi"}],
             **({"countryCodes": country_codes} if country_codes is not None else {})},
            {"terrain": "major_road", "settlements": []},
            {"terrain": "grass", "settlements": []},
        ]],
    }


class Chunks:
    def __init__(self):
        self.bases = {
            "firmi": fixture_map(), "origin-two": fixture_map("und", ["FR"]),
            "origin-country": fixture_map("und", ["PL"]),
            "origin-unknown": fixture_map("und", ["ZZ"]),
        }
        self.cached = {}
        self.reads = []

    def require_origin(self, region):
        if region not in self.bases:
            raise ValueError("missing region")

    def read(self, region, x, y):
        self.reads.append((region, x, y))
        return self.cached.get((region, x, y))

    def cache_cell(self, col, row, cell):
        x, y = col // 8, row // 8
        chunk = self.cached.setdefault(("firmi", x, y), {
            "width": 8, "height": 8, "rows": [
                [{"terrain": "grass", "settlements": []} for _ in range(8)] for _ in range(8)
            ],
        })
        chunk["rows"][row - y * 8][col - x * 8] = cell


class Journeys:
    def __init__(self, path, assets=None):
        self.path = path / "journeys.sqlite3"
        self.chunks = Chunks()
        self.assets = assets


class Authorization:
    def authorize(self, journey, token):
        if token != f"capability-{journey}":
            raise JournalForbidden("Invalid capability.")
        region = {"b": "origin-two", "c": "origin-country", "d": "origin-unknown"}.get(journey[0], "firmi")
        return {"region": region, "state": {"name": {
            "a": "Alex", "b": "Camille", "c": "Morgan", "d": "Robin",
        }.get(journey[0], "Visitor " + journey)}}


class CharactersTests(unittest.TestCase):
    def setUp(self):
        (ROOT / ".cache").mkdir(exist_ok=True)
        self.directory = tempfile.TemporaryDirectory(dir=ROOT / ".cache", prefix="character-registry-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.journeys = Journeys(self.root)
        self.auth = Authorization()
        self.service = Characters(self.journeys, self.auth)
        self.journey = "a" * 32
        self.token = f"capability-{self.journey}"

    def request(self, action, *, journey=None, location=(0, 0), token=None, **extra):
        journey = journey or self.journey
        return self.service.request({
            "action": action, "journey": journey,
            "location": {"col": location[0], "row": location[1]}, **extra,
        }, token or f"capability-{journey}")

    def create(self, request_id="00000000-0000-4000-8000-000000000001", location=(0, 0), journey=None):
        return self.request("create", location=location, journey=journey, requestId=request_id)

    def test_opening_registry_only_lists_and_does_not_create_people(self):
        listed = self.request("list")
        self.assertEqual(listed["characters"], [])
        self.assertTrue(listed["canCreate"])
        self.assertEqual(listed["location"]["id"], "town:node/123")
        with closing(sqlite3.connect(self.service.path)) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM world_characters").fetchone()[0], 0)

    def test_existing_sqlite_registry_recovers_new_private_tables_without_data_rewrite(self):
        created = self.create()
        with closing(sqlite3.connect(self.service.path)) as db:
            with db:
                for table in ("character_private_exchanges", "character_quest_contracts",
                              "character_quest_events"):
                    db.execute(f"DROP TABLE {table}")
        reopened = Characters(self.journeys, self.auth)
        listed = reopened.request({"action": "list", "journey": self.journey,
                                   "location": {"col": 0, "row": 0}}, self.token)
        self.assertEqual(listed["characters"][0]["id"], created["id"])
        with closing(sqlite3.connect(self.service.path)) as db:
            names = {row[0] for row in db.execute(
                "SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({"character_private_exchanges", "character_quest_contracts",
                         "character_quest_events"} <= names)

    def test_existing_exchange_rows_gain_a_persisted_fact_version(self):
        character = self.create()
        self.request("meet", characterId=character["id"],
                     requestId="00000000-0000-4000-8000-000000000060")
        self.request("exchange", characterId=character["id"], topic="services",
                     requestId="00000000-0000-4000-8000-000000000061")
        with closing(sqlite3.connect(self.service.path)) as db:
            with db:
                db.execute("DROP TABLE character_private_exchanges")
                db.execute(
                    "CREATE TABLE character_private_exchanges (journey TEXT NOT NULL, "
                    "event_id TEXT NOT NULL, character_id TEXT NOT NULL, topic TEXT NOT NULL, "
                    "fact_ids TEXT NOT NULL, created_at DOUBLE PRECISION NOT NULL, "
                    "PRIMARY KEY(journey,event_id))")
                db.execute(
                    "INSERT INTO character_private_exchanges VALUES(?,?,?,?,?,?)",
                    (self.journey, "00000000-0000-4000-8000-000000000061", character["id"],
                     "services", '["own_workshop"]', 1.0))
        reopened = Characters(self.journeys, self.auth)
        history = reopened.request(
            {"action": "list", "journey": self.journey, "location": {"col": 0, "row": 0}},
            self.token)["characters"][0]["memories"]
        exchange = next(item for item in history if item["type"] == "exchanged")
        self.assertEqual(exchange["facts"], ["own_workshop"])
        self.assertEqual(exchange["factVersion"], 1)

    def test_creation_is_persistent_stable_localized_and_idempotent(self):
        created = self.create()
        repeated = self.create()
        self.assertEqual(repeated, created)
        self.assertEqual(created["namingLocale"], "fr-FR")
        self.assertEqual(created["home"]["id"], created["current"]["id"])
        self.assertEqual((created["current"]["col"], created["current"]["row"]), (0, 0))
        self.assertEqual(created["availability"], "present")
        self.assertEqual(created["availabilityClock"], "shared-world-static-v1")
        self.assertEqual(created["portrait"], {
            "ref": None, "status": "failed", "model": None,
            "provenance": {"source": "not-generated", "reason": "portrait-provider-not-configured",
                           "version": "character-portrait-v1"},
            "revision": 1,
        })
        self.assertNotEqual(created["name"], "")
        reopened = Characters(self.journeys, self.auth)
        listed = reopened.request({"action": "list", "journey": self.journey,
                                   "location": {"col": 0, "row": 0}}, self.token)
        self.assertEqual(listed["characters"][0]["id"], created["id"])
        with self.assertRaises(JourneyConflict):
            self.create("00000000-0000-4000-8000-000000000001", location=(1, 0))

    def test_concurrent_creation_has_unique_bounded_identities(self):
        ids = [f"00000000-0000-4000-8000-{index:012x}" for index in range(2, 10)]
        def create(request_id):
            try:
                return self.create(request_id)["id"]
            except JourneyConflict:
                return None
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(create, ids))
        self.assertEqual(len({value for value in results if value}), 4)
        listed = self.request("list")
        self.assertEqual(len(listed["characters"]), 4)
        self.assertFalse(listed["canCreate"])
        self.assertEqual(len({person["id"] for person in listed["characters"]}), 4)

    def test_shared_characters_keep_private_meetings_and_topics_per_journey(self):
        character = self.create()
        self.request("meet", characterId=character["id"],
                     requestId="00000000-0000-4000-8000-000000000010")
        self.request("exchange", characterId=character["id"], topic="parent",
                     requestId="00000000-0000-4000-8000-000000000011")
        own = self.request("list")["characters"][0]["memories"]
        other = self.request("list", journey="b" * 32)["characters"][0]["memories"]
        self.assertEqual([item["type"] for item in own], ["met", "exchanged"])
        self.assertEqual(own[1]["topic"], "parent")
        self.assertEqual(own[1]["facts"], [])
        self.assertEqual(other, [])
        self.assertEqual(character["knowledge"]["parentWitnesses"], [])
        self.assertNotIn("PRIVATE", str(character))

    def test_same_osm_town_is_shared_across_origins_and_uses_next_slot(self):
        first = self.create()
        second_journey = "b" * 32
        other_view = self.request("list", journey=second_journey)
        self.assertEqual([person["id"] for person in other_view["characters"]], [first["id"]])
        self.assertTrue(other_view["canCreate"])

        second = self.request("create", journey=second_journey,
                              requestId="00000000-0000-4000-8000-000000000020")
        self.assertNotEqual(second["id"], first["id"])
        self.assertEqual(second["location"]["id"], first["location"]["id"])
        first_view = self.request("list")
        self.assertEqual({person["id"] for person in first_view["characters"]},
                         {first["id"], second["id"]})
        self.assertEqual([person["id"] for person in first_view["characters"]],
                         [first["id"], second["id"]])

        self.request("meet", journey=second_journey, characterId=first["id"],
                     requestId="00000000-0000-4000-8000-000000000021")
        memories = self.request("list", journey=second_journey)["characters"]
        first_memory = next(person["memories"] for person in memories if person["id"] == first["id"])
        self.assertEqual([event["type"] for event in first_memory], ["met"])
        self.assertEqual(self.request("list")["characters"][0]["memories"], [])
        self.request("meet", journey=second_journey, characterId=first["id"],
                     requestId="00000000-0000-4000-8000-000000000021")

    def test_memory_event_retries_are_idempotent_and_conflicts_are_rejected(self):
        first, second = self.create(), self.create("00000000-0000-4000-8000-000000000002")
        self.request("meet", characterId=first["id"],
                     requestId="00000000-0000-4000-8000-000000000008")
        self.request("meet", characterId=second["id"],
                     requestId="00000000-0000-4000-8000-000000000009")
        event_id = "00000000-0000-4000-8000-000000000010"
        self.request("exchange", characterId=first["id"], topic="parent", requestId=event_id)
        self.request("exchange", characterId=first["id"], topic="parent", requestId=event_id)
        with self.assertRaises(JourneyConflict):
            self.request("exchange", characterId=second["id"], topic="parent", requestId=event_id)

    def test_presence_depends_on_place_and_time_and_generates_someone_on_the_fly(self):
        def presence_rate(location, phase):
            found = 0
            for hour in range(200):
                result = self.request("list", journey=f"{hour:032x}", location=location,
                                      presence={"phase": phase, "hour": hour})
                found += not result.get("absent")
            return found / 200

        town_day, town_night = presence_rate((0, 0), "day"), presence_rate((0, 0), "night")
        field_day, field_night = presence_rate((2, 0), "day"), presence_rate((2, 0), "night")
        self.assertGreater(town_day, .85)
        self.assertGreater(town_day, town_night)
        self.assertGreater(town_night, field_night)
        self.assertGreater(field_day, field_night)
        self.assertLess(field_night, .25)

        journey = "e" * 32
        hour = next(h for h in range(500) if not self.request(
            "list", journey=journey, location=(2, 0), presence={"phase": "night", "hour": h}).get("absent"))
        met = self.request("list", journey=journey, location=(2, 0), presence={"phase": "night", "hour": hour})
        self.assertEqual(len(met["characters"]), 1)
        self.assertNotIn("arrived", met)
        absent = next(h for h in range(500) if self.request(
            "list", journey=journey, location=(2, 0), presence={"phase": "night", "hour": h}).get("absent"))
        hidden = self.request("list", journey=journey, location=(2, 0), presence={"phase": "night", "hour": absent})
        self.assertEqual((hidden["characters"], hidden["canCreate"]), ([], False))
        for presence in ({"phase": "noon", "hour": 1}, {"phase": "day", "hour": -1},
                         {"phase": "day", "hour": True}, {"phase": "day"}):
            with self.assertRaises(JourneyRequest):
                self.request("list", presence=presence)

    def test_first_presence_creates_one_persisted_character_idempotently(self):
        first = self.request("list", location=(1, 0), presence={"phase": "day", "hour": 7})
        if first.get("absent"):
            first = next(result for hour in range(8, 100) for result in [self.request(
                "list", location=(1, 0), presence={"phase": "day", "hour": hour})] if not result.get("absent"))
        self.assertEqual(len(first["characters"]), 1)
        self.assertEqual(first["arrived"], first["characters"][0]["id"])
        again = self.request("list", location=(1, 0), presence={"phase": "day", "hour": 7})
        self.assertLessEqual(len(again["characters"]), 1)
        with closing(sqlite3.connect(self.service.path)) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM world_characters").fetchone()[0], 1)

    def test_only_valid_town_or_roadside_position_is_eligible(self):
        road = self.request("list", location=(1, 0))
        self.assertEqual(road["location"]["kind"], "roadside")
        self.assertEqual(road["characters"], [])
        created = self.create("00000000-0000-4000-8000-000000000002", location=(1, 0))
        self.assertEqual(created["location"]["kind"], "roadside")
        self.assertFalse(self.request("list", location=(1, 0))["canCreate"])
        countryside = self.request("list", location=(2, 0))
        self.assertEqual((countryside["location"]["kind"], countryside["location"]["id"]),
                         ("countryside", "wild:firmi:0:0"))
        self.assertNotIn("terrain", countryside["location"])
        for location in ((3, 0), (-1, 0)):
            with self.assertRaises(JourneyConflict):
                self.request("list", location=location)
        with self.assertRaises(JourneyRequest):
            self.request("list", location=(8008, 0))
        with self.assertRaises(JournalForbidden):
            self.request("list", token="not-the-capability")

    def test_cached_streamed_cells_support_positive_and_negative_grid_positions(self):
        self.journeys.chunks.cache_cell(24, -9, {
            "terrain": "place",
            "settlements": [{"osmId": "way/456", "name": "Rivière"}],
        })
        town = self.request("list", location=(24, -9))
        self.assertEqual(town["location"]["id"], "town:way/456")
        self.assertEqual(town["location"]["name"], "Rivière")
        self.journeys.chunks.cache_cell(-17, -16, {
            "terrain": "major_road", "settlements": [],
        })
        road = self.request("list", location=(-17, -16))
        self.assertEqual(road["location"]["id"], "road:firmi:-17:-16")
        self.assertEqual(self.journeys.chunks.reads[-2:], [("firmi", 3, -2), ("firmi", -3, -2)])
        with self.assertRaises(JourneyConflict):
            self.request("list", location=(24, -8))

    def test_record_retries_work_with_shared_mapping_rows(self):
        character = self.create()

        class MappingCatalogue:
            postgres = False

            def sql(self, query):
                return query

            @contextmanager
            def connection(inner_self):
                db = sqlite3.connect(self.service.path, timeout=10)
                db.row_factory = sqlite3.Row
                try:
                    with db:
                        yield db
                finally:
                    db.close()

        class SharedAssets:
            catalogue = MappingCatalogue()

        self.service.assets = SharedAssets()
        self.request("meet", characterId=character["id"],
                     requestId="00000000-0000-4000-8000-000000000009")
        details = {"characterId": character["id"], "topic": "parent",
                   "requestId": "00000000-0000-4000-8000-000000000010"}
        self.request("exchange", **details)
        self.request("exchange", **details)
        with self.assertRaises(JourneyConflict):
            self.request("exchange", **{**details, "topic": "clues"})

    def test_shared_store_connection_adapts_character_queries_once(self):
        existing = self.create()
        service = self.service
        executed = []

        class PostgreSQLConnection:
            def __init__(self, connection):
                self.connection = connection

            def execute(self, statement, parameters=()):
                if "%%s" in statement:
                    raise AssertionError("A placeholder was adapted more than once.")
                executed.append(statement)
                statement = statement.replace(" FOR UPDATE", "").replace("%s", "?")
                statement = statement.replace("EXTRACT(EPOCH FROM clock_timestamp())",
                                              "(julianday('now') - 2440587.5) * 86400.0")
                return self.connection.execute(statement, parameters)

        class PostgreSQLCatalogue:
            postgres = True

            def sql(self, statement):
                return statement.replace("?", "%s")

            @contextmanager
            def connection(self):
                with closing(sqlite3.connect(service.path, timeout=10)) as db:
                    db.row_factory = sqlite3.Row
                    with db:
                        yield PostgreSQLConnection(db)

        class SharedAssets:
            catalogue = PostgreSQLCatalogue()

        service.assets = SharedAssets()
        listed = self.request("list")
        self.assertEqual([person["id"] for person in listed["characters"]], [existing["id"]])
        created = self.request(
            "create", requestId="00000000-0000-4000-8000-000000000030")
        self.request("meet", characterId=created["id"],
                     requestId="00000000-0000-4000-8000-000000000031")
        contract = {"id": "d" * 32, "event": "offered", "step": 0, "totalSteps": 2}
        details = {"characterId": created["id"], "contract": contract,
                   "requestId": "00000000-0000-4000-8000-000000000032"}
        self.request("contract", **details)
        self.request("contract", **details)
        self.assertGreater(len(executed), 5)
        self.assertTrue(all("?" not in statement for statement in executed))
        self.assertTrue(any("%s" in statement for statement in executed))

    def test_new_characters_are_disabled_without_a_supported_naming_locale(self):
        journey = "d" * 32
        listed = self.request("list", journey=journey)
        self.assertFalse(listed["canCreate"])
        with self.assertRaises(JourneyConflict):
            self.create(journey=journey)

    def test_custom_origin_country_metadata_selects_a_locale_independent_of_ui(self):
        journey = "c" * 32
        character = self.create(journey=journey)
        self.assertEqual(character["namingLocale"], "pl-PL")
        self.assertTrue(any(ord(char) > 127 for char in character["name"]))

    def test_country_and_explicit_cell_locale_override_origin_and_unsupported_country_blocks_creation(self):
        cell = self.journeys.chunks.bases["firmi"]["rows"][0][0]
        cell["countryCodes"] = ["DE"]
        first = self.create()
        self.assertEqual(first["namingLocale"], "de-DE")
        cell["countryCodes"] = ["ZZ"]
        self.assertFalse(self.request("list")["canCreate"])
        with self.assertRaises(JourneyConflict):
            self.create("00000000-0000-4000-8000-000000000002")
        cell["namingLocale"] = "pl-PL"
        second = self.create("00000000-0000-4000-8000-000000000002")
        self.assertEqual(second["namingLocale"], "pl-PL")
        for invalid in ("unknown", ["fr-FR"], None):
            cell["namingLocale"] = invalid
            self.assertFalse(self.request("list")["canCreate"])
        self.assertEqual(self.request("list")["characters"][0]["name"], first["name"])

    def test_streamed_cell_without_country_does_not_inherit_origin_locale(self):
        self.journeys.chunks.cache_cell(24, -9, {
            "terrain": "major_road", "settlements": [], "countryCodes": ["IT"]})
        character = self.create(location=(24, -9))
        self.assertEqual(character["namingLocale"], "it-IT")
        self.journeys.chunks.cache_cell(25, -9, {"terrain": "major_road", "settlements": []})
        self.assertFalse(self.request("list", location=(25, -9))["canCreate"])

    def test_exchange_is_real_factual_memory_after_meeting_only(self):
        character = self.create()
        with closing(sqlite3.connect(self.service.path)) as db:
            with db:
                db.execute("UPDATE world_characters SET role='artisan',knowledge=? WHERE character_id=?",
                           ('{"topics":["services","work"],"facts":[{"id":"own_workshop","scope":"public"}],'
                            '"parentWitnesses":[]}', character["id"]))
        with self.assertRaises(JourneyConflict):
            self.request("exchange", characterId=character["id"], topic="services",
                         requestId="00000000-0000-4000-8000-000000000010")
        self.request("meet", characterId=character["id"],
                     requestId="00000000-0000-4000-8000-000000000011")
        reply = self.request("exchange", characterId=character["id"], topic="services",
                             requestId="00000000-0000-4000-8000-000000000012")
        self.assertEqual(reply["factIds"], ["own_workshop"])
        self.assertEqual(reply["factVersion"], 1)
        history = self.request("list")["characters"][0]["memories"]
        exchange = next(item for item in history if item["type"] == "exchanged")
        self.assertEqual(exchange["facts"], reply["factIds"])
        self.assertEqual(exchange["factVersion"], reply["factVersion"])
        self.assertNotIn("parent", str(reply["factIds"]))

    def test_quest_contract_lifecycle_is_private_and_idempotent(self):
        character = self.create()
        contract_id = "c" * 32
        def record(event, step, request_number):
            return self.request("contract", characterId=character["id"],
                                contract={"id": contract_id, "event": event,
                                          "step": step, "totalSteps": 2},
                                requestId=f"00000000-0000-4000-8000-{request_number:012d}")

        with self.assertRaises(JourneyConflict):
            record("offered", 0, 39)
        self.request("meet", characterId=character["id"],
                     requestId="00000000-0000-4000-8000-000000000038")
        record("offered", 0, 40)
        record("accepted", 0, 41)
        record("advanced", 1, 42)
        record("advanced", 1, 43)
        result = record("completed", 2, 44)
        self.assertEqual((result["status"], result["step"]), ("completed", 2))
        with self.assertRaises(JourneyConflict):
            record("abandoned", 2, 45)
        own = self.request("list")["characters"][0]
        other = self.request("list", journey="b" * 32)["characters"][0]
        self.assertEqual(own["contracts"][0]["status"], "completed")
        self.assertEqual(own["contracts"][0]["outcome"], "completed")
        self.assertEqual(other["contracts"], [])
        events = [item["type"] for item in own["memories"]]
        self.assertEqual(events, ["met", "quest_offered", "quest_accepted", "quest_advanced", "quest_completed"])

    def test_portrait_is_generated_once_and_served_from_durable_provenance(self):
        assets = local_storage(self.root / "shared-assets")
        DurableJobs(assets.catalogue).configure_quota("images", daily=None, monthly=None)
        journeys = Journeys(self.root, assets)
        output = io.BytesIO()
        Image.new("RGB", (1024, 1024), "navy").save(output, "PNG")
        writer = Mock(return_value=output.getvalue())
        service = Characters(journeys, self.auth, writer=writer)
        data = {"action": "create", "journey": self.journey, "location": {"col": 0, "row": 0},
                "requestId": "00000000-0000-4000-8000-000000000050"}
        created = service.request(data, self.token)
        self.assertEqual(created["portrait"]["status"], "pending")
        service.close()
        listed = service.request({"action": "list", "journey": self.journey,
                                  "location": {"col": 0, "row": 0}}, self.token)
        portrait = listed["characters"][0]["portrait"]
        self.assertEqual(portrait["status"], "ready")
        self.assertEqual(portrait["model"], "stable-diffusion-xl-base-v10")
        self.assertEqual(portrait["model"], portrait["provenance"]["source"])
        self.assertEqual(portrait["provenance"]["version"], "character-portrait-v1")
        self.assertEqual(portrait["ref"], character_module.portrait_request(created["id"]))
        self.assertEqual(portrait["ref"], assets.catalogue.find(
            "character-portrait", portrait["ref"])[1].request)
        service.request({"action": "meet", "journey": self.journey,
                         "location": {"col": 0, "row": 0},
                         "characterId": created["id"],
                         "requestId": "00000000-0000-4000-8000-000000000051"}, self.token)
        reused = service.request({"action": "list", "journey": self.journey,
                                  "location": {"col": 0, "row": 0}}, self.token)
        self.assertEqual(reused["characters"][0]["portrait"]["ref"], portrait["ref"])
        image = service.request({"action": "portrait", "journey": self.journey,
                                 "location": {"col": 0, "row": 0},
                                 "characterId": created["id"]}, self.token)
        with Image.open(io.BytesIO(image)) as decoded:
            self.assertEqual(decoded.format, "WEBP")
        for field in ("PORTRAIT_VERSION", "IMAGE_MODEL"):
            with patch.object(character_module, field, "future-release-version"):
                pinned = service.request({"action": "portrait", "journey": self.journey,
                                          "location": {"col": 0, "row": 0},
                                          "characterId": created["id"]}, self.token)
                self.assertEqual(pinned, image)
                self.assertEqual(writer.call_count, 1)
        self.assertEqual(writer.call_count, 1)
        prompt = writer.call_args.args[0]["prompt"]
        self.assertNotIn(created["name"], prompt)
        self.assertNotIn("memories", prompt)
        with assets.catalogue.connection() as db:
            db.execute(assets.catalogue.sql(
                "UPDATE world_characters SET portrait_ref=NULL,portrait_status='pending' "
                "WHERE character_id=?"), (created["id"],))
        recovered = Characters(journeys, self.auth)
        recovered_list = recovered.request({"action": "list", "journey": self.journey,
                                            "location": {"col": 0, "row": 0}}, self.token)
        self.assertEqual(recovered_list["characters"][0]["portrait"]["ref"], portrait["ref"])
        self.assertEqual(writer.call_count, 1)

    def test_portrait_job_key_tracks_character_model_and_recipe_version(self):
        character_id = "a" * 32
        original_model, original_version = character_module.IMAGE_MODEL, character_module.PORTRAIT_VERSION
        original_request = character_module.portrait_request(character_id)
        try:
            character_module.IMAGE_MODEL = original_model + "-replacement"
            self.assertNotEqual(character_module.portrait_request(character_id), original_request)
            character_module.IMAGE_MODEL = original_model
            character_module.PORTRAIT_VERSION = original_version + "-replacement"
            self.assertNotEqual(character_module.portrait_request(character_id), original_request)
        finally:
            character_module.IMAGE_MODEL, character_module.PORTRAIT_VERSION = (
                original_model, original_version)

    def pending_portrait(self):
        assets = local_storage(self.root / "shared-assets")
        DurableJobs(assets.catalogue).configure_quota("images", daily=10, monthly=10)
        journeys = Journeys(self.root, assets)
        service = Characters(journeys, self.auth, writer=Mock())
        self.addCleanup(service.close)
        data = {"action": "create", "journey": self.journey, "location": {"col": 0, "row": 0},
                "requestId": "00000000-0000-4000-8000-000000000070"}
        with patch.object(service, "_schedule_portrait"):
            created = service.request(data, self.token)
        return assets, journeys, service, data, created

    def test_pending_creation_receipt_retry_reuses_character_and_does_not_duplicate_job(self):
        assets, _, service, data, created = self.pending_portrait()
        with patch.object(service, "_schedule_portrait") as schedule:
            repeated = service.request(data, self.token)
        self.assertEqual(repeated["id"], created["id"])
        self.assertEqual(repeated["portrait"]["status"], "pending")
        schedule.assert_called_once_with(created["id"])
        with assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM world_characters").fetchone()[0], 1)

    def portrait_job(self, assets, character, *, dispatched=False):
        jobs = DurableJobs(assets.catalogue)
        request = character_module.portrait_request(character["id"])
        jobs.enqueue("image-character-portrait", request, {
            "brief": character_module.portrait_prompt(character["role"]),
            "model": IMAGE_MODEL, "version": character_module.PORTRAIT_VERSION}, provider="images")
        job = jobs.acquire("image-character-portrait", request=request, seconds=900)
        if dispatched:
            jobs.dispatch(job)
        return jobs, job

    def listed_portrait(self, service):
        return service.request(
            {"action": "list", "journey": self.journey, "location": {"col": 0, "row": 0}},
            self.token)["characters"][0]["portrait"]

    def test_active_lease_survives_duplicate_startup_without_provider_or_schema_writes(self):
        assets, journeys, service, _, created = self.pending_portrait()
        self.portrait_job(assets, created, dispatched=True)
        statements = []
        connect = assets.catalogue.connect
        def traced_connect():
            db = connect()
            db.set_trace_callback(statements.append)
            return db
        with patch.object(assets.catalogue, "connect", traced_connect):
            reopened = Characters(journeys, self.auth)
        self.addCleanup(reopened.close)
        self.assertEqual(self.listed_portrait(reopened)["status"], "pending")
        self.assertFalse(any(query.lstrip().upper().startswith(("ALTER", "CREATE", "DROP"))
                             for query in statements))
        service.writer.assert_not_called()

    def test_portrait_reconciliation_never_checks_out_a_nested_catalogue_connection(self):
        assets, _, service, _, created = self.pending_portrait()
        jobs, job = self.portrait_job(assets, created, dispatched=True)
        original_connection = assets.catalogue.connection
        depth = 0

        @contextmanager
        def single_checkout():
            nonlocal depth
            self.assertEqual(depth, 0, "Nested checkout would deadlock a saturated PostgreSQL pool.")
            depth += 1
            try:
                with original_connection() as db:
                    yield db
            finally:
                depth -= 1

        with patch.object(assets.catalogue, "connection", single_checkout):
            service._reconcile_portrait(created["id"])
        self.assertEqual(self.listed_portrait(service)["status"], "pending")
        request = character_module.portrait_request(created["id"])
        assets.publish("character-portrait", request, b"verified-result",
                       media_type="image/webp", retention="durable",
                       provenance={"source": IMAGE_MODEL, "license": "fixture",
                                   "version": character_module.PORTRAIT_VERSION})
        with patch.object(assets.catalogue, "connection", single_checkout):
            service._reconcile_portrait(created["id"])
        self.assertEqual(self.listed_portrait(service)["status"], "ready")
        self.assertEqual(jobs.inspect(job["kind"], job["request"])["status"], "ready")

    def test_worker_crash_expires_to_uncertain_without_redispatch_and_late_result_recovers(self):
        assets, _, service, _, created = self.pending_portrait()
        service.writer.side_effect = RuntimeError("unexpected worker crash")
        service._generate_portrait(created["id"])
        self.assertEqual(self.listed_portrait(service)["status"], "pending")
        request = character_module.portrait_request(created["id"])
        with assets.catalogue.connection() as db:
            db.execute("UPDATE worker_jobs SET expires=0 WHERE request=?", (request,))
        self.assertEqual(self.listed_portrait(service)["status"], "failed")
        self.assertEqual(DurableJobs(assets.catalogue).inspect(
            "image-character-portrait", request)["status"], "uncertain")
        service._generate_portrait(created["id"])
        self.assertEqual(service.writer.call_count, 1)
        assets.publish("character-portrait", request, b"verified-result",
                       media_type="image/webp", retention="durable",
                       provenance={"source": IMAGE_MODEL, "license": "fixture",
                                   "version": character_module.PORTRAIT_VERSION})
        self.assertEqual(self.listed_portrait(service)["status"], "ready")

    def test_quota_error_text_cannot_clobber_another_workers_active_lease(self):
        assets, _, service, _, created = self.pending_portrait()
        _, job = self.portrait_job(assets, created)
        with patch("characters.SharedImages.generate", side_effect=RuntimeError("quota error")):
            service._generate_portrait(created["id"])
        self.assertEqual(self.listed_portrait(service)["status"], "pending")
        with assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT token FROM worker_jobs").fetchone()[0], job["token"])
            db.execute("UPDATE worker_jobs SET expires=0")
        self.assertEqual(self.listed_portrait(service)["status"], "failed")
        service.writer.assert_not_called()

    def test_orphan_pending_portrait_is_bounded_even_without_a_job(self):
        assets, _, service, _, created = self.pending_portrait()
        with assets.catalogue.connection() as db:
            db.execute("UPDATE world_characters SET created_at=0 WHERE character_id=?", (created["id"],))
        self.assertEqual(self.listed_portrait(service)["status"], "failed")
        service.writer.assert_not_called()

    def test_portrait_style_preserves_all_free_offer_guards(self):
        free = {key: "0" for key in ("completion", "image", "prompt", "request",
                                    "input_cache_reads", "input_cache_writes")}
        free["currency_unit"] = "USD"
        variants = [{"data": [{"id": IMAGE_MODEL, "pricing": {**free, key: "0.01"}}]}
                    for key in free if key != "currency_unit"]
        variants += [
            {"data": [{"id": IMAGE_MODEL, "pricing": {**free, "currency_unit": "EUR"}}]},
            {"data": [{"id": IMAGE_MODEL, "pricing": {**free, "image": 0}}]},
            {"data": [{"id": IMAGE_MODEL, "pricing": {"image": "0"}}]},
            {"data": [{"id": IMAGE_MODEL, "pricing": free}] * 2},
            {"data": []},
        ]
        for catalogue in variants:
            with self.subTest(catalogue=catalogue):
                writer = OvhImageWriter("fixture", style=CHARACTER_IMAGE_STYLE)
                response = Mock(status=200)
                response.read.return_value = json.dumps(catalogue).encode()
                writer.opener = Mock()
                writer.opener.open.return_value.__enter__ = Mock(return_value=response)
                writer.opener.open.return_value.__exit__ = Mock(return_value=False)
                with self.assertRaises(WorkshopError):
                    writer(character_module.portrait_prompt("artisan"))
                self.assertEqual(writer.opener.open.call_count, 1)

    def test_portrait_style_uses_the_same_verified_free_endpoint(self):
        pricing = {key: "0" for key in ("completion", "image", "prompt", "request",
                                       "input_cache_reads", "input_cache_writes")}
        pricing["currency_unit"] = "USD"
        catalogue = {"data": [{"id": IMAGE_MODEL, "pricing": pricing}]}
        output = io.BytesIO()
        Image.new("RGB", (1024, 1024), "navy").save(output, "PNG")
        writer = OvhImageWriter("fixture", style=CHARACTER_IMAGE_STYLE)
        response = Mock(status=200)
        response.read.side_effect = [json.dumps(catalogue).encode(), output.getvalue()]
        writer.opener = Mock()
        writer.opener.open.return_value.__enter__ = Mock(return_value=response)
        writer.opener.open.return_value.__exit__ = Mock(return_value=False)
        writer(character_module.portrait_prompt("artisan"))
        self.assertEqual(writer.opener.open.call_count, 2)
        request = writer.opener.open.call_args.args[0]
        self.assertEqual(request.full_url, IMAGE_ENDPOINT)
        self.assertTrue(json.loads(request.data)["prompt"].startswith(CHARACTER_IMAGE_STYLE))

    def meet(self, character, number, journey=None):
        return self.request("meet", journey=journey, characterId=character["id"],
                            requestId=f"00000000-0000-4000-8000-{number:012x}")

    def test_encounters_freeze_server_genesis_name_and_concurrently_count_once_over_years(self):
        character = self.create()
        self.service.clock = Mock(return_value=100.0)
        first = self.meet(character, 100)
        self.assertEqual(first["familiarity"], {"known": True, "meetings": 1})
        self.service.clock.return_value = 100.0 + 365 * 24 * 3600 * 8
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.meet(character, 101), range(12)))
        self.assertTrue(all(result["familiarity"]["meetings"] == 2 for result in results))
        original_authorize = self.auth.authorize
        with patch.object(self.auth, "authorize", side_effect=lambda journey, token: {
                **original_authorize(journey, token), "state": {"name": "Changed genesis fixture"}}):
            self.meet(character, 102)
        with closing(sqlite3.connect(self.service.path)) as db:
            row = db.execute(
                "SELECT first_seen,last_seen,meeting_count FROM character_encounters").fetchone()
            name = db.execute("SELECT fictional_name FROM character_visitor_identities").fetchone()[0]
        self.assertEqual(row, (100.0, self.service.clock.return_value, 3))
        self.assertEqual(name, "Alex")
        with self.assertRaises(JourneyRequest):
            self.request("meet", characterId=character["id"], name="Forged client name",
                         requestId="00000000-0000-4000-8000-000000000103")

    def test_shared_encounter_clock_ignores_journey_time_and_fake_service_clock(self):
        assets = local_storage(self.root / "shared-encounters")
        service = Characters(Journeys(self.root, assets), self.auth, clock=lambda: 1.0)
        self.addCleanup(service.close)
        data = {"action": "create", "journey": self.journey,
                "location": {"col": 0, "row": 0},
                "requestId": "00000000-0000-4000-8000-000000000110"}
        character = service.request(data, self.token)
        service.request({**data, "action": "meet", "characterId": character["id"],
                         "requestId": "00000000-0000-4000-8000-000000000111"}, self.token)
        with assets.catalogue.connection() as db:
            first, last = db.execute("SELECT first_seen,last_seen FROM character_encounters").fetchone()
        self.assertGreater(first, 1_700_000_000)
        self.assertEqual(first, last)

    def test_shared_visitors_only_expose_real_names_met_this_npc_and_never_private_data(self):
        character = self.create()
        other_npc = self.create("00000000-0000-4000-8000-000000000002")
        self.meet(character, 120)
        self.meet(character, 121, journey="b" * 32)
        self.meet(other_npc, 122, journey="c" * 32)
        self.request("exchange", journey="b" * 32, characterId=character["id"], topic="parent",
                     requestId="00000000-0000-4000-8000-000000000123")
        public = self.request("visitors", characterId=character["id"], cursor=None, limit=20)
        self.assertEqual(public, {"facts": [{"name": "Camille", "type": "met"}], "nextCursor": None})
        self.assertEqual(self.request("list")["characters"][0]["visitorFacts"], public["facts"])
        self.assertNotIn("Morgan", str(public))
        for forbidden in ("journey", "parent", "contract", "topic", "first_seen", "last_seen",
                          "location", "private", "121"):
            self.assertNotIn(forbidden, str(public))
        mentions = []
        for index, topic in enumerate(sorted(character_module.TOPICS)):
            reply = self.request("exchange", characterId=character["id"], topic=topic,
                                 requestId=f"00000000-0000-4000-8000-{130 + index:012x}")
            mentions.extend(reply["visitorFacts"])
        self.assertGreater(len(mentions), 0)
        self.assertLess(len(mentions), len(character_module.TOPICS))
        self.assertTrue(all(fact == {"name": "Camille", "type": "met"} for fact in mentions))
        other_private = self.request("list", journey="b" * 32)["characters"][0]
        self.assertFalse(any(memory.get("topic") != "parent"
                             for memory in other_private["memories"] if memory["type"] == "exchanged"))

    def test_uncapped_encounters_and_events_survive_private_limit_and_bounded_paginated_reads(self):
        character = self.create()
        self.meet(character, 150)
        with self.service.connect() as db:
            db.executemany(
                "INSERT INTO character_private_memories VALUES(?,?,?,'exchanged','town',?)",
                [(self.journey, character["id"], f"old-{index}", index)
                 for index in range(character_module.MAX_PRIVATE_MEMORIES_PER_JOURNEY - 1)])
            for index in range(1105):
                journey = f"{index + 2000:032x}"
                db.execute("INSERT INTO character_visitor_identities VALUES(?,?)",
                           (journey, f"Visitor {index:04d}"))
                db.execute("INSERT INTO character_encounters VALUES(?,?,1,2,1)",
                           (character["id"], journey))
        self.meet(character, 151)
        repeated = self.meet(character, 151)
        self.assertEqual(repeated["familiarity"]["meetings"], 2)
        listed = self.request("list")["characters"][0]
        self.assertEqual(listed["familiarity"], {"known": True, "meetings": 2})
        self.assertEqual(len(listed["memories"]), 20)
        self.assertLessEqual(len(listed["visitorFacts"]), 3)
        cursor, names = None, []
        while True:
            page = self.request("visitors", characterId=character["id"], cursor=cursor, limit=20)
            self.assertLessEqual(len(page["facts"]), 20)
            names.extend(fact["name"] for fact in page["facts"])
            cursor = page["nextCursor"]
            if cursor is None:
                break
        self.assertEqual(len(set(names)), 1105)
        with self.service.connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM character_encounters").fetchone()[0], 1106)
            self.assertEqual(db.execute("SELECT count(*) FROM character_private_memories").fetchone()[0], 1000)
            for index in (0, 20, 1000, 1104):
                mention = self.service._visitor_mention(db, self.journey, character["id"], index * 3)
                self.assertEqual(mention, [{"name": f"Visitor {index:04d}", "type": "met"}])
        for invalid in (0, 21, True, 10000):
            with self.assertRaises(JourneyRequest):
                self.request("visitors", characterId=character["id"], cursor=None, limit=invalid)
        with self.assertRaises(JourneyConflict):
            self.request("visitors", characterId=character["id"], cursor=None, limit=20, location=(1, 0))

    def test_old_encounters_backfill_only_authorized_genesis_names_without_deletion(self):
        character = self.create()
        with self.service.connect() as db:
            for journey in (self.journey, "b" * 32):
                db.execute("INSERT INTO character_private_memories VALUES(?,?,?,'met',NULL,?)",
                           (journey, character["id"], "old-meeting", 42.0))
        self.request("list")
        with self.service.connect() as db:
            self.assertIsNone(db.execute(
                "SELECT 1 FROM character_visitor_identities WHERE journey=?", ("b" * 32,)).fetchone())
        self.request("list", journey="b" * 32)
        self.assertEqual(self.request("list")["characters"][0]["visitorFacts"],
                         [{"name": "Camille", "type": "met"}])
        with self.service.connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM character_private_memories").fetchone()[0], 2)
            self.assertEqual(db.execute("SELECT count(*) FROM character_encounter_events").fetchone()[0], 2)

    def test_returning_player_is_known_after_reopen_without_recent_private_meeting_history(self):
        character = self.create()
        self.meet(character, 190)
        with self.service.connect() as db:
            db.executemany(
                "INSERT INTO character_private_memories VALUES(?,?,?,'exchanged','town',?)",
                [(self.journey, character["id"], f"later-{index}", 9_000_000_000 + index)
                 for index in range(999)])
        reopened = Characters(self.journeys, self.auth)
        listed = reopened.request(
            {"action": "list", "journey": self.journey, "location": {"col": 0, "row": 0}},
            self.token)["characters"][0]
        self.assertTrue(listed["familiarity"]["known"])
        self.assertTrue(all(item["type"] != "met" for item in listed["memories"]))
        result = reopened.request({
            "action": "meet", "journey": self.journey, "location": {"col": 0, "row": 0},
            "characterId": character["id"], "requestId": "00000000-0000-4000-8000-000000000191",
        }, self.token)
        self.assertEqual(result["familiarity"]["meetings"], 2)

    def test_unsafe_genesis_name_never_becomes_public_and_equal_names_are_deduplicated(self):
        character = self.create()
        self.meet(character, 160)
        original_authorize = self.auth.authorize
        for index, name in enumerate(("<script>bad</script>", "\x00bad", "Camille", "Camille", "Alex")):
            journey = f"{index + 3000:032x}"
            with patch.object(self.auth, "authorize", side_effect=lambda j, token, name=name: {
                    **original_authorize(j, token), "state": {"name": name}}):
                self.meet(character, 170 + index, journey=journey)
        public = self.request("visitors", characterId=character["id"], cursor=None, limit=20)
        self.assertEqual(public["facts"], [{"name": "Camille", "type": "met"}])
        with self.service.connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM character_encounters").fetchone()[0], 6)


if __name__ == "__main__":
    unittest.main()
