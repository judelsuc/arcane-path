"""Authenticated first-discovery decisions for shared local legends; no reward claims yet."""

import re
import secrets
import json
import hashlib

from asset_storage import AssetError, local_storage
from content_storage import clock
from journey_storage import cached_journey_cell, geographic_position, grid_position
from journeys import JourneyConflict, JourneyRequest
from legend_search import prepared_cells, generate_search, search_clues
import legend_wording
from legend_rewards import choose_reward
from reward_names import enqueue_name, KIND as NAME_KIND, request_key
from durable_jobs import DurableJobs

TOWN_ID = re.compile(r"(?:node|way|relation)/[1-9]\d{0,19}")
PAGE_SIZE = 30
# One town in four hosts a legend. Towns decided before the rate was raised from
# one in ten get a single top-up roll at one in six: 1/10 + 9/10 * 1/6 = 1/4.
LEGEND_ODDS = 4
TOPUP_ODDS = 6
LEGEND_RATE_RAISED_AT = 1795451026


class TownLegends:
    def __init__(self, journeys, authorization, *, randbelow=secrets.randbelow):
        self.journeys, self.authorization, self.randbelow = journeys, authorization, randbelow
        self.assets = getattr(journeys, "assets", None)
        self.owns_assets = self.assets is None
        if self.owns_assets:
            self.assets = local_storage(journeys.path.parent / "town-legends")

    def close(self):
        if self.owns_assets:
            self.assets.catalogue.close()

    @staticmethod
    def view(row):
        eligible = bool(row[2])
        return {"townId": row[0], "town": row[1], "eligible": eligible,
                "seed": row[3], "format": row[4],
                "contentStatus": "unprepared" if eligible else "none"}

    def town_at(self, region, location):
        _, _, cell, _, _ = cached_journey_cell(self.journeys.chunks, region, location)
        if cell.get("unavailable") or cell.get("terrain") != "place":
            raise JourneyConflict("Town legends can only be discovered in a prepared named town.")
        settlements = [place for place in cell.get("settlements", [])
                       if isinstance(place, dict) and isinstance(place.get("osmId"), str)
                       and TOWN_ID.fullmatch(place["osmId"]) and isinstance(place.get("name"), str)
                       and place["name"].strip() and len(place["name"]) <= 200]
        if not settlements:
            raise JourneyConflict("No stable named town identity is available here.")
        return min(settlements, key=lambda place: place["osmId"])

    def search(self, db, town_id):
        row = db.execute(self.assets.catalogue.sql(
            "SELECT map_geometry,payload FROM town_legend_searches WHERE town_id=?"), (town_id,)).fetchone()
        return (json.loads(row[0]), json.loads(row[1])) if row else None

    def gameplay(self, db, row):
        retained = db.execute(self.assets.catalogue.sql(
            "SELECT format FROM town_legend_gameplay WHERE town_id=?"), (row[0],)).fetchone()
        return (*row[:4], retained[0]) if retained else row

    @staticmethod
    def position_in(source, target, location):
        col, row = grid_position(target, *geographic_position(source, location["col"], location["row"]))
        return {"col": col, "row": row}

    def exploration_view(self, db, row, journey, base):
        row = self.gameplay(db, row)
        result = self.view(row)
        if not row[2]:
            return result
        reward = db.execute(self.assets.catalogue.sql("SELECT payload FROM town_legend_rewards WHERE town_id=?"),
                            (row[0],)).fetchone()
        if reward:
            result["reward"] = json.loads(reward[0])
        retained = self.search(db, row[0])
        if retained is None:
            result["exploration"] = {"status": "pending", "clues": None, "observations": []}
            return result
        geometry, plan = retained
        records = db.execute(self.assets.catalogue.sql(
            "SELECT col,row,found FROM town_legend_observations WHERE journey=? AND town_id=? ORDER BY row,col"),
            (journey, row[0])).fetchall()
        cells = {(cell["col"], cell["row"]): cell for cell in plan["cells"]}
        result["exploration"] = {"status": "searching", "clues": search_clues(plan), "observations": []}
        for col, cell_row, found in records:
            detail = cells[col, cell_row]
            location = self.position_in(geometry, base, detail)
            result["exploration"]["observations"].append({
                **location, "description": detail["description"], "found": bool(found)})
            if found:
                result["exploration"]["status"] = "found"
        # The legend itself waits for an inhabitant to tell it; the player's own
        # recorded cell notes remain visible.
        if result["exploration"]["status"] == "searching" and not self.told(db, journey, row[0]):
            result["exploration"] = {**result["exploration"], "status": "untold", "clues": None}
        return result

    def told(self, db, journey, town_id):
        """A journey knows the legend once an inhabitant has told it; journeys
        that already found the entrance before disclosure existed stay told."""
        sql = self.assets.catalogue.sql
        if db.execute(sql("SELECT 1 FROM town_legend_disclosures WHERE journey=? AND town_id=?"),
                      (journey, town_id)).fetchone():
            return True
        return db.execute(sql(
            "SELECT 1 FROM town_legend_observations WHERE journey=? AND town_id=? AND found=1"),
            (journey, town_id)).fetchone() is not None

    def prepare_search(self, db, row, region, location):
        if self.search(db, row[0]) is not None:
            return
        chunks = self.journeys.chunks
        # Ineligible towns receive ambient decoy details too, so surrounding
        # descriptions never betray whether a legend exists; their plans are
        # never surfaced as clues, entrances or inspections.
        seed = row[3] if row[2] else int.from_bytes(
            hashlib.sha256(f"legend-ambient-v1:{row[0]}".encode()).digest()[:4], "big")
        plan = generate_search(seed, row[0], location, prepared_cells(chunks, region, location))
        if plan is None:
            return
        base = chunks.bases[region]
        geometry = {key: base[key] for key in ("cellSizeMeters", "bounds")}
        if "projectionLatitude" in base:
            geometry["projectionLatitude"] = base["projectionLatitude"]
        db.execute(self.assets.catalogue.sql(
            "INSERT INTO town_legend_searches(town_id,map_geometry,payload) VALUES(?,?,?) "
            "ON CONFLICT(town_id) DO NOTHING"),
            (row[0], json.dumps(geometry), json.dumps(plan, ensure_ascii=False)))

    def trial_definition(self, journey, location, token, *, dungeon=False, local=False, town_id=None, entrance=False):
        genesis = self.authorization.authorize(journey, token)
        if entrance:
            base, _, cell, _, _ = cached_journey_cell(self.journeys.chunks, genesis["region"], location)
            if cell.get("unavailable"):
                raise JourneyConflict("Prepare the entrance cell before entering.")
        else:
            town_id = self.town_at(genesis["region"], location)["osmId"]
        catalogue = self.assets.catalogue
        with catalogue.connection() as db:
            row = db.execute(catalogue.sql(
                "SELECT t.town_id,t.town_name,t.eligible,t.seed,t.format FROM town_legends t "
                "JOIN town_legend_discoveries d ON d.town_id=t.town_id "
                "WHERE d.journey=? AND t.town_id=?"), (journey, town_id)).fetchone()
            if row is not None:
                row = self.gameplay(db, row)
            if entrance and row is not None:
                retained = self.search(db, town_id)
                if retained is None:
                    raise JourneyConflict("This adventure entrance is not prepared yet.")
                geometry, plan = retained
                position = self.position_in(base, geometry, location)
                found = db.execute(catalogue.sql(
                    "SELECT found FROM town_legend_observations WHERE journey=? AND town_id=? AND col=? AND row=?"),
                    (journey, town_id, position["col"], position["row"])).fetchone()
                if position != plan["entrance"] or found is None or not found[0]:
                    raise JourneyConflict("Reach and inspect the discovered adventure entrance before entering.")
        if row is None or not row[2] or not (dungeon or local) and row[4] != "investigation":
            raise JourneyConflict("No discovered investigation trial is available in this town.")
        result = self.view(row)
        with catalogue.connection() as db:
            reward = db.execute(catalogue.sql("SELECT payload FROM town_legend_rewards WHERE town_id=?"),
                                (row[0],)).fetchone()
        if reward:
            result["reward"] = json.loads(reward[0])
        return result

    def narrative_definition(self, journey, town_id, token):
        self.authorization.authorize(journey, token)
        if not isinstance(town_id, str) or not TOWN_ID.fullmatch(town_id):
            raise JourneyRequest("Invalid legend narrative town.")
        catalogue = self.assets.catalogue
        with catalogue.connection() as db:
            row = db.execute(catalogue.sql(
                "SELECT t.seed FROM town_legends t JOIN town_legend_discoveries d ON d.town_id=t.town_id "
                "WHERE t.town_id=? AND d.journey=? AND t.eligible=1"), (town_id, journey)).fetchone()
            retained = self.search(db, town_id) if row else None
            reward_row = db.execute(catalogue.sql("SELECT payload FROM town_legend_rewards WHERE town_id=?"),
                                    (town_id,)).fetchone() if row else None
        if retained is None:
            raise JourneyConflict("Discover a prepared town entrance search before requesting its legend.")
        reward = json.loads(reward_row[0]) if reward_row else None
        if reward and "name" not in reward:
            job = DurableJobs(catalogue).inspect(NAME_KIND, request_key(town_id))
            return {"namingStatus": job["status"] if job else "failed",
                    "namingError": job.get("error") if job else "Treasure naming job is missing."}
        return legend_wording.wording(retained[1], row[0], reward)

    def request(self, data, token):
        if not isinstance(data, dict) or data.get("action") not in ("discover", "list", "look", "inspect", "disclose"):
            raise JourneyRequest("Invalid town legend request.")
        expected = {"journey", "action", "location"} | (
            {"target"} if data["action"] == "look" else {"townId"} if data["action"] == "inspect" else set())
        if data["action"] == "list":
            expected = {"journey", "action", "cursor"}
        if set(data) != expected or not isinstance(data.get("journey"), str) or not re.fullmatch(
                r"[a-f0-9]{32}", data["journey"]):
            raise JourneyRequest("Invalid town legend request fields.")
        genesis = self.authorization.authorize(data["journey"], token)
        catalogue = self.assets.catalogue
        sql = catalogue.sql
        base = self.journeys.chunks.bases[genesis["region"]]
        if data["action"] in ("look", "inspect"):
            return self.observe(data, genesis["region"])
        if data["action"] == "disclose":
            # An inhabitant tells the legend: from now on this journey sees the
            # clues, the town's contextual hints and may inspect the entrance.
            town = self.town_at(genesis["region"], data["location"])
            with catalogue.connection() as db:
                row = db.execute(sql(
                    "SELECT t.town_id,t.town_name,t.eligible,t.seed,t.format FROM town_legends t "
                    "JOIN town_legend_discoveries d ON d.town_id=t.town_id "
                    "WHERE d.journey=? AND t.town_id=?"), (data["journey"], town["osmId"])).fetchone()
                if row is None or not row[2] or self.search(db, row[0]) is None:
                    raise JourneyConflict("No prepared town legend can be told here.")
                now = float(db.execute("SELECT " + clock(catalogue)).fetchone()[0])
                db.execute(sql(
                    "INSERT INTO town_legend_disclosures(journey,town_id,disclosed) VALUES(?,?,?) "
                    "ON CONFLICT(journey,town_id) DO NOTHING"), (data["journey"], town["osmId"], now))
                entry = self.exploration_view(db, row, data["journey"], base)
            return {"version": 1, "entry": entry}
        if data["action"] == "list":
            cursor = data["cursor"]
            if cursor is not None and (not isinstance(cursor, str) or not TOWN_ID.fullmatch(cursor)):
                raise JourneyRequest("Invalid town legend history cursor.")
            with catalogue.connection() as db:
                rows = db.execute(sql(
                    "SELECT t.town_id,t.town_name,t.eligible,t.seed,t.format FROM town_legends t "
                    "JOIN town_legend_discoveries d ON d.town_id=t.town_id "
                    "WHERE d.journey=? AND t.town_id>? ORDER BY t.town_id LIMIT ?"),
                    (data["journey"], cursor or "", PAGE_SIZE + 1)).fetchall()
                entries = [self.exploration_view(db, row, data["journey"], base) for row in rows[:PAGE_SIZE]]
            return {"version": 1, "entries": entries, "cursor": rows[PAGE_SIZE - 1][0] if len(rows) > PAGE_SIZE else None}
        town = self.town_at(genesis["region"], data["location"])
        with catalogue.connection() as db:
            if not catalogue.postgres:
                db.execute("BEGIN IMMEDIATE")
            row = db.execute(sql(
                "SELECT town_id,town_name,eligible,seed,format FROM town_legends WHERE town_id=?"),
                (town["osmId"],)).fetchone()
            decided = False
            if row is None:
                eligible = self.randbelow(LEGEND_ODDS) == 0
                seed = self.randbelow(2**32) if eligible else None
                format_name = ("platform", "investigation", "dungeon")[self.randbelow(3)] if eligible else None
                now = float(db.execute("SELECT " + clock(catalogue)).fetchone()[0])
                inserted = db.execute(sql(
                    "INSERT INTO town_legends(town_id,town_name,eligible,seed,format,created) "
                    "VALUES(?,?,?,?,?,?) ON CONFLICT(town_id) DO NOTHING RETURNING town_id"),
                    (town["osmId"], town["name"].strip(), int(eligible), seed,
                     "platform" if format_name == "dungeon" else format_name, now)).fetchone()
                if eligible and inserted:
                    db.execute(sql("INSERT INTO town_legend_gameplay(town_id,format) VALUES(?,?)"),
                               (town["osmId"], format_name))
                decided = True
            elif not row[2] and db.execute(sql("SELECT created FROM town_legends WHERE town_id=?"),
                                           (row[0],)).fetchone()[0] < LEGEND_RATE_RAISED_AT:
                eligible = self.randbelow(TOPUP_ODDS) == 0
                seed = self.randbelow(2**32) if eligible else None
                format_name = ("platform", "investigation", "dungeon")[self.randbelow(3)] if eligible else None
                now = float(db.execute("SELECT " + clock(catalogue)).fetchone()[0])
                # The created guard makes the top-up happen once, even across concurrent requests.
                updated = db.execute(sql(
                    "UPDATE town_legends SET eligible=?,seed=?,format=?,created=? "
                    "WHERE town_id=? AND eligible=0 AND created<? RETURNING town_id"),
                    (int(eligible), seed, "platform" if format_name == "dungeon" else format_name,
                     max(now, LEGEND_RATE_RAISED_AT), row[0], LEGEND_RATE_RAISED_AT)).fetchone()
                if eligible and updated:
                    db.execute(sql("INSERT INTO town_legend_gameplay(town_id,format) VALUES(?,?) "
                                   "ON CONFLICT(town_id) DO NOTHING"), (row[0], format_name))
                decided = True
            if decided:
                row = db.execute(sql(
                    "SELECT town_id,town_name,eligible,seed,format FROM town_legends WHERE town_id=?"),
                    (town["osmId"],)).fetchone()
                if row is None:
                    raise AssetError("The town discovery could not be retained.")
                if row[2]:
                    reward = choose_reward(db, sql, row[3])
                    db.execute(sql("INSERT INTO town_legend_rewards(town_id,payload) VALUES(?,?) "
                                   "ON CONFLICT(town_id) DO NOTHING"),
                               (row[0], json.dumps(reward, sort_keys=True)))
                    retained_reward = db.execute(sql("SELECT payload FROM town_legend_rewards WHERE town_id=?"),
                                                 (row[0],)).fetchone()
                    enqueue_name(catalogue, db, row[0], json.loads(retained_reward[0]))
            if catalogue.postgres:
                db.execute(sql("SELECT town_id FROM town_legends WHERE town_id=? FOR UPDATE"), (row[0],))
            self.prepare_search(db, row, genesis["region"], data["location"])
            now = float(db.execute("SELECT " + clock(catalogue)).fetchone()[0])
            db.execute(sql(
                "INSERT INTO town_legend_discoveries(journey,town_id,discovered) VALUES(?,?,?) "
                "ON CONFLICT(journey,town_id) DO NOTHING"), (data["journey"], town["osmId"], now))
            entry = self.exploration_view(db, row, data["journey"], base)
        return {"version": 1, "entry": entry}

    def observe(self, data, region):
        base, _, observer, _, _ = cached_journey_cell(self.journeys.chunks, region, data["location"])
        target = data.get("target", data["location"])
        _, _, cell, _, _ = cached_journey_cell(self.journeys.chunks, region, target)
        if observer.get("unavailable") or cell.get("unavailable"):
            raise JourneyConflict("Prepare the map cells before looking for an entrance.")
        if max(abs(target[key] - data["location"][key]) for key in ("col", "row")) > 16:
            raise JourneyRequest("Look is limited to the nearby map.")
        if data["action"] == "inspect" and (not isinstance(data["townId"], str) or not TOWN_ID.fullmatch(data["townId"])):
            raise JourneyRequest("Invalid adventure town identity.")
        catalogue, observations = self.assets.catalogue, []
        sql = catalogue.sql
        with catalogue.connection() as db:
            if not catalogue.postgres:
                db.execute("BEGIN IMMEDIATE")
            rows = db.execute(sql(
                "SELECT t.town_id,t.town_name,t.eligible,t.seed,t.format FROM town_legends t "
                "JOIN town_legend_discoveries d ON d.town_id=t.town_id "
                "JOIN town_legend_searches s ON s.town_id=t.town_id WHERE d.journey=?"),
                (data["journey"],)).fetchall()
            for row in rows:
                if data["action"] == "inspect" and row[0] != data["townId"]:
                    continue
                geometry, plan = self.search(db, row[0])
                position = self.position_in(base, geometry, target)
                # Clues, the entrance identity and inspection all wait until an
                # inhabitant has told the legend; plain cell descriptions and
                # ambient decoy details around any town remain visible.
                told = bool(row[2]) and self.told(db, data["journey"], row[0])
                if data["action"] == "look" and position == plan["origin"]:
                    if not told:
                        continue
                    clues = search_clues(plan)
                    description = {
                        "en": "The story told here points beyond the town. " + " ".join(clues["en"]) +
                              " Use Look to examine the surrounding ground, then approach the matching passage to inspect it.",
                        "fr": "L'histoire racontée ici mène aux alentours du bourg. " + " ".join(clues["fr"]) +
                              " Utilisez Regarder pour examiner les environs, puis rejoignez le passage correspondant pour l'inspecter.",
                    }
                    observations.append({"townId": row[0], "town": row[1], "location": target,
                                         "description": description, "matches": False, "found": False,
                                         "contextual": True})
                    continue
                detail = next((cell for cell in plan["cells"]
                               if (cell["col"], cell["row"]) == (position["col"], position["row"])), None)
                if detail is None:
                    continue
                matches = told and position == plan["entrance"]
                if data["action"] == "inspect":
                    if not told:
                        raise JourneyConflict("Hear the town's legend from an inhabitant before inspecting.")
                    seen = db.execute(sql(
                        "SELECT found FROM town_legend_observations WHERE journey=? AND town_id=? AND col=? AND row=?"),
                        (data["journey"], row[0], position["col"], position["row"])).fetchone()
                    if not matches or seen is None:
                        raise JourneyConflict("Look here and match the clues before inspecting the passage.")
                db.execute(sql(
                    "INSERT INTO town_legend_observations(journey,town_id,col,row,found) VALUES(?,?,?,?,?) "
                    "ON CONFLICT(journey,town_id,col,row) DO UPDATE SET found="
                    "CASE WHEN excluded.found=1 THEN 1 ELSE town_legend_observations.found END"),
                    (data["journey"], row[0], position["col"], position["row"], int(data["action"] == "inspect")))
                found = db.execute(sql(
                    "SELECT found FROM town_legend_observations WHERE journey=? AND town_id=? AND col=? AND row=?"),
                    (data["journey"], row[0], position["col"], position["row"])).fetchone()[0]
                observations.append({"townId": row[0], "town": row[1], "location": target,
                                     "description": detail["description"], "matches": matches, "found": bool(found)})
                if matches:
                    observations[-1]["entry"] = self.exploration_view(db, row, data["journey"], base)
                if data["action"] == "inspect":
                    return {"version": 1, "entry": self.exploration_view(db, row, data["journey"], base)}
        if data["action"] == "inspect":
            raise JourneyConflict("No discovered adventure passage can be inspected here.")
        return {"version": 1, "observations": observations}
