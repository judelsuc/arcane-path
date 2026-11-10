import copy
import json
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from journeys import JourneyConflict, JourneyRequest
from legend_search import generate_search, prepared_cells, search_clues, LANDMARKS, GROUPS, MARKS, MATERIALS, CARRIERS, DETAILS
from town_legends import TownLegends
import test_town_legends as fixtures


class LegendSearchGenerationTests(unittest.TestCase):
    def test_variety_has_measurable_bounds_not_only_wording_changes(self):
        entrances, structures = set(), set()
        for group, terrain in (("woodland", "forest"), ("cultivated", "field"), ("open", "grass"),
                               ("rocky", "hill"), ("built", "building"), ("wayside", "road")):
            cells = {(col, row): {"terrain": terrain} for row in range(-3, 4)
                     for col in range(-3, 4) if (col, row) != (0, 0)}
            for seed in range(32):
                plan = generate_search(seed, f"node/{seed + 1}", {"col": 0, "row": 0}, cells)
                self.assertEqual(plan, generate_search(seed, f"node/{seed + 1}", {"col": 0, "row": 0}, cells))
                signatures = [(cell["group"], cell["landmark"], cell["mark"], cell["material"], cell["count"])
                              for cell in plan["cells"]]
                self.assertEqual(len(set(signatures)), 48)
                self.assertEqual(len({cell["description"]["en"] for cell in plan["cells"]}), 48)
                self.assertEqual(len({cell["description"]["fr"] for cell in plan["cells"]}), 48)
                for start in range(0, 48, 8):
                    self.assertEqual(len({cell["landmark"] for cell in plan["cells"][start:start + 8]}), 8)
                for left, right in zip(plan["cells"], plan["cells"][1:]):
                    self.assertNotEqual(left["landmark"], right["landmark"])
                target = plan["cells"][0]
                self.assertEqual(plan["entrance"], {"col": target["col"], "row": target["row"]})
                self.assertEqual(target["group"], group)
                for language in ("en", "fr"):
                    self.assertTrue(all(isinstance(clue, str) and clue for clue in plan["clues"][language]))
                    self.assertIn(str(target["count"]), plan["clues"][language][2])
                    self.assertIn(LANDMARKS[group][target["landmark"]][language == "fr"], target["description"][language])
                    clues = " ".join(plan["clues"][language])
                    self.assertNotRegex(clues.lower(), r"map cells|cases de carte|fiction|combina[ti]|terrain suivant")
                    for choices, key in ((LANDMARKS[group], "landmark"), (MARKS, "mark"),
                                         (MATERIALS, "material"), (CARRIERS, "carrier"), (DETAILS, "pattern")):
                        self.assertIn(choices[target[key]][language == "fr"], clues)
                entrances.add(target["description"]["en"])
                structures.add((group, target["landmark"], target["mark"], target["carrier"], target["pattern"]))
        self.assertGreaterEqual(len(entrances), 185, "at least 185 distinct entrances in 192 town/terrain fixtures")
        self.assertGreaterEqual(len(structures), 180)

    def test_natural_directions_cover_axes_and_diagonals_in_both_languages(self):
        plan = generate_search(42, "node/42", {"col": 0, "row": 0},
                               {(col, 0): {"terrain": "forest"} for col in range(1, 5)})
        for dc, dr, english, french in (
                (0, -1, "north", "au nord"), (0, 1, "south", "au sud"),
                (1, 0, "east", "à l'est"), (-1, 0, "west", "à l'ouest"),
                (1, -1, "north-east", "au nord-est"), (-1, -1, "north-west", "au nord-ouest"),
                (1, 1, "south-east", "au sud-est"), (-1, 1, "south-west", "au sud-ouest")):
            plan["origin"] = {"col": plan["entrance"]["col"] - dc, "row": plan["entrance"]["row"] - dr}
            clues = search_clues(plan)
            self.assertIn(f"to the {english} of town, in the woods", clues["en"][0])
            self.assertIn(f"{french} du bourg, dans les bois", clues["fr"][0])

    def test_prepared_dry_connected_terrain_only_no_water_or_unsafe_transport(self):
        grid = {"width": 7, "height": 7, "rows": [[{"terrain": "forest"} for _ in range(7)] for _ in range(7)]}
        grid["rows"][3][3] = {"terrain": "place"}
        for row in grid["rows"]:
            row[4] = {"terrain": "water"}
        grid["rows"][2][2] = {"terrain": "major_road"}
        grid["rows"][1][1] = {"terrain": "rail"}
        grid["rows"][2][3] = {"terrain": "forest", "unavailable": True}
        chunks = SimpleNamespace(bases={"test": grid}, read=Mock(return_value=None))
        origin = {"col": 3, "row": 3}
        cells = prepared_cells(chunks, "test", origin)
        self.assertTrue(cells)
        self.assertTrue(all(col < 4 and cell["terrain"] in GROUPS for (col, _), cell in cells.items()))
        self.assertNotIn((3, 2), cells)
        self.assertLessEqual(chunks.read.call_count, 4)
        plan = generate_search(123, "node/42", origin, cells)
        self.assertEqual(len(plan["cells"]), len(cells))
        self.assertIsNone(generate_search(123, "node/42", origin, {(2, 3): {"terrain": "forest"}}))


class LegendSearchStorageTests(unittest.TestCase):
    def setUp(self):
        fixture = fixtures.TownLegendsTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.fixture = fixture
        self.service = fixture.service
        self.origin = {"col": 3, "row": 3}
        grid = {"width": 8, "height": 8, "cellSizeMeters": 250,
                "bounds": {"minLatitude": 44.98, "maxLatitude": 45, "minLongitude": 2, "maxLongitude": 2.03},
                "rows": [[{"terrain": ("forest", "grass", "field", "hill", "building", "road")[col % 6]}
                          for col in range(8)] for _ in range(8)]}
        grid["rows"][3][3] = fixture.cell
        fixture.journeys.chunks.bases["firmi"] = grid
        self.base = grid

    def call(self, action, player=1, **fields):
        journey = f"{player:032x}"
        defaults = {"cursor": None} if action == "list" else {"location": self.origin}
        return self.service.request({"journey": journey, "action": action, **defaults, **fields}, f"private-{journey}")

    def plan(self):
        with self.fixture.assets.catalogue.connection() as db:
            return self.service.search(db, "node/42")[1]

    def test_arrival_cell_describes_known_search_without_becoming_a_false_entrance_or_recorded_trace(self):
        entry = self.call("discover")["entry"]
        before = copy.deepcopy(self.plan())
        observations = self.call("look", target=self.origin)["observations"]
        self.assertEqual(len(observations), 1)
        observation = observations[0]
        self.assertTrue(observation["contextual"])
        self.assertFalse(observation["matches"])
        self.assertFalse(observation["found"])
        self.assertNotIn("entry", observation)
        self.assertEqual(observation["location"], self.origin)
        for language in ("en", "fr"):
            for clue in entry["exploration"]["clues"][language]:
                self.assertIn(clue, observation["description"][language])
        self.assertIn("Use Look", observation["description"]["en"])
        self.assertIn("Utilisez Regarder", observation["description"]["fr"])
        self.assertEqual(self.call("look", player=2, target=self.origin)["observations"], [])
        self.assertEqual(self.call("list")["entries"][0]["exploration"]["observations"], [])
        with self.assertRaises(JourneyConflict):
            self.call("inspect", townId="node/42")
        self.assertEqual(self.plan(), before)
        entrance = self.call("look", target=before["entrance"])["observations"][0]
        self.assertTrue(entrance["matches"])
        self.assertNotIn("contextual", entrance)

    def test_one_retained_shared_entrance_private_look_and_inspection_survive_restart(self):
        entry = self.call("discover")["entry"]
        self.assertEqual(entry["exploration"]["status"], "searching")
        self.assertEqual(entry["exploration"]["observations"], [])
        self.assertNotIn("entrance", entry["exploration"])
        plan = self.plan()
        matches = []
        for detail in plan["cells"]:
            target = {key: detail[key] for key in ("col", "row")}
            result = self.call("look", target=target)["observations"]
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]["description"], detail["description"])
            if result[0]["matches"]:
                matches.append(target)
        self.assertEqual(matches, [plan["entrance"]])
        self.assertEqual(len(self.call("list")["entries"][0]["exploration"]["observations"]), 48)
        self.assertEqual(self.call("look", player=2, target=plan["entrance"])["observations"], [])
        other = self.call("discover", player=2)["entry"]
        self.assertEqual(other["exploration"]["clues"], entry["exploration"]["clues"])
        self.assertEqual(other["exploration"]["observations"], [])
        with self.assertRaises(JourneyConflict):
            self.call("inspect", player=2, townId="node/42", location=plan["entrance"])
        result = self.call("inspect", townId="node/42", location=plan["entrance"])
        self.assertEqual(result["entry"]["exploration"]["status"], "found")
        self.assertEqual(sum(item["found"] for item in result["entry"]["exploration"]["observations"]), 1)
        self.service = TownLegends(self.fixture.journeys, fixtures.Authorization(), randbelow=Mock(side_effect=AssertionError("reroll")))
        retained = self.call("look", target=plan["entrance"])["observations"][0]
        self.assertTrue(retained["found"])
        self.assertEqual(self.plan(), plan)
        # Map cache refreshes cannot replace the retained fictional search details.
        self.base["rows"][0][0] = {"terrain": "field"}
        self.assertEqual(self.call("discover")["entry"]["exploration"]["clues"], entry["exploration"]["clues"])

    def test_old_clue_copy_is_reworded_without_replacing_retained_facts_or_observations(self):
        self.call("discover")
        plan = self.plan()
        expected = search_clues(plan)
        plan["clues"] = {
            "en": ["Search within three map cells.", "Fictional landmarks.", "Only the complete combination."],
            "fr": ["Cherchez à trois cases de carte.", "Repères fictifs.", "Seule la combinaison complète."],
        }
        catalogue = self.fixture.assets.catalogue
        with catalogue.connection() as db:
            db.execute(catalogue.sql("UPDATE town_legend_searches SET payload=? WHERE town_id=?"),
                       (json.dumps(plan), "node/42"))
        detail = next(cell for cell in plan["cells"]
                      if (cell["col"], cell["row"]) == (plan["entrance"]["col"], plan["entrance"]["row"]))
        self.call("look", target=plan["entrance"])
        self.call("inspect", townId="node/42", location=plan["entrance"])
        for result in (self.call("discover")["entry"], self.call("list")["entries"][0]):
            self.assertEqual(result["exploration"]["clues"], expected)
            self.assertEqual(result["exploration"]["status"], "found")
            self.assertEqual(result["exploration"]["observations"], [
                {**plan["entrance"], "description": detail["description"], "found": True}])
        self.assertEqual(self.plan(), plan)

    def test_remote_inspection_forgery_and_paced_entry_from_town_or_decoy_are_rejected(self):
        self.call("discover")
        plan = self.plan()
        target = plan["entrance"]
        with self.assertRaises(JourneyConflict):
            self.call("inspect", townId="node/42", location=target)
        self.call("look", target=target)
        with self.assertRaises(JourneyConflict):
            self.call("inspect", townId="node/42")
        with self.assertRaises(JourneyRequest):
            self.call("inspect", townId="node/42", target=target)
        decoy = next(cell for cell in plan["cells"] if (cell["col"], cell["row"]) != (target["col"], target["row"]))
        decoy_location = {key: decoy[key] for key in ("col", "row")}
        with self.assertRaises(JourneyConflict):
            self.call("inspect", townId="node/42", location=decoy_location)
        journey, token = f"{1:032x}", f"private-{1:032x}"
        for position in (self.origin, target, decoy_location):
            with self.assertRaises(JourneyConflict):
                self.service.trial_definition(journey, position, token, local=True, entrance=True, town_id="node/42")
        self.call("inspect", townId="node/42", location=target)
        self.assertEqual(self.service.trial_definition(
            journey, target, token, local=True, entrance=True, town_id="node/42")["seed"], 123456)
        cell = self.base["rows"][target["row"]][target["col"]]
        cell["unavailable"] = True
        try:
            with self.assertRaises(JourneyConflict):
                self.call("look", target=target)
            with self.assertRaises(JourneyConflict):
                self.service.trial_definition(journey, target, token, local=True, entrance=True, town_id="node/42")
        finally:
            del cell["unavailable"]
        for extra in ({"found": True}, {"description": "invented"}, {"seed": 1}):
            with self.assertRaises(JourneyRequest):
                self.call("look", target=target, **extra)
        with self.assertRaises(JourneyRequest):
            self.call("look", target={"col": True, "row": 0})

    def test_concurrent_preparation_and_inspection_publish_one_plan(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.call("discover"), range(12)))
        self.assertTrue(all(item == results[0] for item in results))
        target = self.plan()["entrance"]
        self.call("look", target=target)
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.call("inspect", townId="node/42", location=target), range(12)))
        self.assertTrue(all(item == results[0] for item in results))
        self.assertEqual(self.fixture.random.call_count, 3)

    def test_pending_search_retries_without_rerolling_eligibility(self):
        rows = copy.deepcopy(self.base["rows"])
        self.base["rows"] = [[{"terrain": "water"} for _ in range(8)] for _ in range(8)]
        self.base["rows"][3][3] = self.fixture.cell
        pending = self.call("discover")["entry"]
        self.assertEqual(pending["exploration"]["status"], "pending")
        self.base["rows"] = rows
        self.assertEqual(self.call("discover")["entry"]["exploration"]["status"], "searching")
        self.assertEqual(self.fixture.random.call_count, 3)

    def test_shared_location_is_geographic_not_tied_to_a_journeys_grid_origin(self):
        self.call("discover")
        target = self.plan()["entrance"]
        shifted = copy.deepcopy(self.base)
        from journey_storage import geographic_position, grid_position
        latitude, longitude = geographic_position(self.base, 0, 0)
        step = self.base["bounds"]["maxLatitude"] - latitude
        shifted["bounds"]["maxLatitude"] += step * 2
        authorization = Mock()
        authorization.authorize.return_value = {"region": "shifted"}
        self.fixture.journeys.chunks.bases["shifted"] = shifted
        service = TownLegends(self.fixture.journeys, authorization)
        col, row = grid_position(shifted, *geographic_position(self.base, target["col"], target["row"]))
        result = service.request({"journey": f"{1:032x}", "action": "look",
                                  "location": {"col": 3, "row": 3}, "target": {"col": col, "row": row}}, "token")
        self.assertTrue(result["observations"][0]["matches"])
        self.assertEqual(result["observations"][0]["location"], {"col": col, "row": row})
