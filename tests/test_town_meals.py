import copy
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from asset_storage import AssetError, local_storage
from content_factory import WorkshopError
from journeys import JourneyRequest
from town_meals import MealWriter, MealSources, TownMeals, selected_meals, documentary_meals, MODEL, PROVIDER


STEAK = ("Bistecca alla fiorentina is an Italian steak dish that is one of the most "
         "famous dishes in Tuscan cuisine. It is a thick T-bone steak cooked on a grill.")
TOWN = {"osmId": "node/10", "name": "Firenze", "coordinates": (43.7696, 11.2558),
        "tags": {"wikidata": "Q2044"}}


def claim(value):
    return {"mainsnak": {"datavalue": {"value": value}}}


class Sources:
    def __init__(self):
        self.calls = []
        self.entities = {
            "Q2044": {"id": "Q2044", "labels": {"en": {"value": "Florence"}},
                      "claims": {"P625": [claim({"latitude": 43.7696, "longitude": 11.2558})],
                                 "P17": [claim({"id": "Q38"})], "P131": [claim({"id": "Q1273"})],
                                 "P1549": [claim({"language": "en", "text": "Florentine"})]}},
            "Q1273": {"id": "Q1273", "labels": {"en": {"value": "Tuscany"}},
                      "claims": {"P131": [claim({"id": "Q38"})],
                                 "P1549": [claim({"language": "en", "text": "Tuscan"})]}},
            "Q38": {"id": "Q38", "claims": {"P297": [claim("IT")]}},
        }

    def api(self, host, **params):
        self.calls.append((host, params))
        if host == "www.wikidata.org":
            return {"entities": {params["ids"]: self.entities[params["ids"]]}}
        if host == "commons.wikimedia.org":
            return {"query": {"pages": {"1": {
                "title": "File:Steak.jpg", "imageinfo": [{
                    "descriptionurl": "https://commons.wikimedia.org/wiki/File:Steak.jpg",
                    "thumburl": "https://upload.wikimedia.org/steak.jpg",
                    "mime": "image/jpeg", "extmetadata": {
                        "Artist": {"value": "Photographer"},
                        "LicenseShortName": {"value": "CC BY-SA 4.0"},
                        "LicenseUrl": {"value": "https://creativecommons.org/licenses/by-sa/4.0/"},
                    }}]}}}}
        return {"query": {"pages": {
            "1": {"title": "Bistecca alla fiorentina", "extract": STEAK,
                  "fullurl": "https://en.wikipedia.org/wiki/Bistecca_alla_fiorentina",
                  "pageimage": "Steak.jpg", "index": 1, "links": [{"title": "Tuscany"}]},
            "2": {"title": "Pizza napoletana", "extract": "A dish originating in Naples.",
                  "fullurl": "https://en.wikipedia.org/wiki/Neapolitan_pizza", "index": 2},
        }}}

    def read(self, url, image=False):
        assert image
        return b"fixture-photograph", "image/jpeg"


def response(brief):
    origin = next(i for i, o in enumerate(brief["origins"]) if o["name"] == "Tuscany")
    return {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps({"dishes": [{
        "document": 0, "origin": origin, "evidence": 0,
        "fr": "Une épaisse pièce de bœuf avec son os, cuite au gril.",
        "en": "A thick bone-in cut of beef, cooked over a grill.",
    }]})}}]}


class MealSourceTests(unittest.TestCase):
    def test_documentary_fallback_requires_dish_definition_and_explicit_regional_association(self):
        brief = MealSources(Sources()).discover(TOWN)
        meals = documentary_meals(brief, TOWN)
        self.assertEqual([m["name"] for m in meals], ["Bistecca alla fiorentina"])
        self.assertEqual(meals[0]["area"], "Tuscany")
        self.assertEqual(meals[0]["originEvidence"], STEAK[:600])
        self.assertEqual(meals[0]["_image"], "Steak.jpg")
        self.assertNotIn("beef", meals[0]["en"])
        for text in (
            "Bistecca alla fiorentina is a dish mentioned by a chef in Tuscany.",
            "Bistecca alla fiorentina is a restaurant serving a steak in Tuscan cuisine.",
            "Bistecca alla fiorentina is an ingredient used in a Tuscan cuisine dish.",
            "Bistecca alla fiorentina is a dish not originating in Tuscany.",
            "Bistecca alla fiorentina is a chef known for a Tuscan cuisine dish.",
        ):
            with self.subTest(text=text):
                other = copy.deepcopy(brief)
                other["documents"][0]["evidence"] = [text]
                self.assertEqual(documentary_meals(other, TOWN), [])
        brief["documents"][0]["evidence"] = [
            "Bistecca alla fiorentina is a steak cooked on a grill.",
            "Wikipedia category: Cuisine of Tuscany.",
        ]
        self.assertEqual(documentary_meals(brief, TOWN)[0]["area"], "Tuscany")

    def test_documentary_fallback_is_bounded_and_uses_same_stable_ids_as_model(self):
        brief = MealSources(Sources()).discover(TOWN)
        self.assertEqual(documentary_meals(brief, TOWN)[0]["id"],
                         selected_meals(response(brief), brief, TOWN)[0]["id"])
        doc = brief["documents"][0]
        brief["documents"] = [{**doc, "url": doc["url"] + str(i)} for i in range(10)]
        self.assertEqual(len(documentary_meals(brief, TOWN)), 6)

    def test_florence_and_neighbour_resolve_tuscan_steak_without_naples_leak(self):
        for name in ("Firenze", "Fiesole"):
            source = Sources()
            town = copy.deepcopy(TOWN)
            town["name"] = name
            if name == "Fiesole":
                source.entities["Q2044"]["labels"]["en"]["value"] = "Fiesole"
            brief = MealSources(source).discover(town)
            self.assertEqual(brief["country"], "IT")
            self.assertEqual([o["name"] for o in brief["origins"]], [name if name == "Fiesole" else "Florence", "Tuscany"])
            self.assertEqual(len(brief["documents"]), 1)
            meals = selected_meals(response(brief), brief, town)
            self.assertEqual(meals[0]["name"], "Bistecca alla fiorentina")
            self.assertEqual(meals[0]["area"], "Tuscany")
            self.assertEqual(meals[0]["towns"], ["node/10"])
            self.assertTrue(any("Tuscany" in p.get("gsrsearch", "") for _, p in source.calls))

    def test_distant_identity_and_ambiguous_country_fail_without_guessing(self):
        source = Sources()
        source.entities["Q2044"]["claims"]["P625"] = [claim({"latitude": 48, "longitude": 2})]
        with self.assertRaisesRegex(ValueError, "too far"):
            MealSources(source).discover(TOWN)
        source = Sources()
        source.entities["Q2044"]["claims"]["P17"].append(claim({"id": "Q142"}))
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            MealSources(source).discover(TOWN)

    def test_historical_countries_and_regions_do_not_block_present_day_discovery(self):
        source = Sources()
        historic = {**claim({"id": "Q142"}), "qualifiers": {"P582": [{}]}, "rank": "normal"}
        source.entities["Q2044"]["claims"]["P17"].append(historic)
        source.entities["Q2044"]["claims"]["P131"].append(historic)
        self.assertEqual(MealSources(source).discover(TOWN)["country"], "IT")

    def test_several_parents_follow_the_official_subdivision_and_links_target_the_origins(self):
        source = Sources()
        source.entities["Q2044"]["claims"]["P131"] = [claim({"id": "Q900"}), claim({"id": "Q1273"})]
        source.entities["Q900"] = {"id": "Q900", "labels": {"en": {"value": "Metropolitan City"}}, "claims": {}}
        source.entities["Q1273"]["claims"]["P300"] = [claim("IT-52")]
        brief = MealSources(source).discover(TOWN)
        self.assertEqual([o["name"] for o in brief["origins"]], ["Florence", "Tuscany"])
        search = next(p for host, p in source.calls if host == "en.wikipedia.org")
        # Restricting links to the origin articles keeps every page's link evidence complete.
        self.assertEqual(search["pltitles"], "Florence|Tuscany")

    def test_suburbs_and_unlisted_hamlets_reach_the_nearby_capital_dishes(self):
        source = Sources()
        source.entities["Q500"] = {"id": "Q500", "labels": {"en": {"value": "Sesto"}},
                                   "claims": {"P625": [claim({"latitude": 43.83, "longitude": 11.2})],
                                              "P17": [claim({"id": "Q38"})], "P131": [claim({"id": "Q1273"})],
                                              "P1082": [claim({"amount": "+49000"})]}}
        source.entities["Q1273"]["claims"]["P36"] = [claim({"id": "Q2044"})]
        original = source.api
        def api(host, **params):
            if host == "www.wikidata.org" and "|" in params.get("ids", ""):
                return {"entities": {i: source.entities.get(i, {"missing": ""}) for i in params["ids"].split("|")}}
            if params.get("generator") == "geosearch":
                return {"query": {"pages": {"7": {"title": "Sesto", "pageprops": {"wikibase_item": "Q500"},
                                                  "coordinates": [{"lat": 43.83, "lon": 11.2}]}}}}
            return original(host, **params)
        source.api = api
        for tags in ({"wikidata": "Q500"}, {}):
            with self.subTest(tags=tags):
                hamlet = {"osmId": "node/11", "name": "Hamlet without article",
                          "coordinates": (43.835, 11.21), "tags": tags}
                brief = MealSources(source).discover(hamlet)
                self.assertEqual([o["name"] for o in brief["origins"]], ["Sesto", "Florence", "Tuscany"])
                self.assertTrue(any('"Florence"' in p.get("gsrsearch", "") for _, p in source.calls))

    def test_regional_cuisine_categories_ground_dishes_without_guessed_demonyms(self):
        source = Sources()
        del source.entities["Q1273"]["claims"]["P1549"]
        original = source.api
        def api(host, **params):
            value = original(host, **params)
            if host == "en.wikipedia.org":
                value["query"]["pages"]["1"]["categories"] = [{"title": "Category:Cuisine of Tuscany"}]
            return value
        source.api = api
        brief = MealSources(source).discover(TOWN)
        raw = response(brief)
        value = json.loads(raw["choices"][0]["message"]["content"])
        value["dishes"][0]["evidence"] = 1
        raw["choices"][0]["message"]["content"] = json.dumps(value)
        self.assertEqual(selected_meals(raw, brief, TOWN)[0]["area"], "Tuscany")

    def test_invented_origin_forged_evidence_duplicate_and_truncation_are_rejected(self):
        brief = MealSources(Sources()).discover(TOWN)
        for change in (
            lambda value: value["dishes"][0].update(document=-1),
            lambda value: value["dishes"][0].update(origin=0),
            lambda value: value["dishes"][0].update(evidence="Made up Tuscan origin."),
            lambda value: value["dishes"][0].update(evidence=99),
            lambda value: value["dishes"][0].update(evidence=True),
            lambda value: value["dishes"][0].update(fr="<script>untrusted text here</script>"),
            lambda value: value["dishes"].append(value["dishes"][0]),
        ):
            raw = response(brief)
            value = json.loads(raw["choices"][0]["message"]["content"])
            change(value)
            raw["choices"][0]["message"]["content"] = json.dumps(value)
            with self.assertRaisesRegex(ValueError, "ungrounded"):
                selected_meals(raw, brief, TOWN)
        raw = response(brief)
        raw["choices"][0]["finish_reason"] = "length"
        with self.assertRaises(ValueError):
            selected_meals(raw, brief, TOWN)

    def test_incidental_person_named_florence_is_not_geographic_evidence(self):
        source = Sources()
        original = source.api
        def api(host, **params):
            value = original(host, **params)
            if host == "en.wikipedia.org":
                value["query"]["pages"]["3"] = {
                    "title": "Foreign dish", "extract": "A dish described by Florence White.",
                    "fullurl": "https://en.wikipedia.org/wiki/Foreign_dish",
                    "links": [{"title": "Florence White"}],
                }
            return value
        source.api = api
        self.assertEqual(len(MealSources(source).discover(TOWN)["documents"]), 1)

    def test_unknown_or_more_expensive_offer_never_dispatches_generation(self):
        writer = MealWriter("fixture", MODEL)
        self.assertEqual(writer.writer.timeout, 180)
        writer.writer = Mock(model=MODEL)
        offer = Mock()
        offer.__enter__ = Mock(return_value=offer)
        offer.__exit__ = Mock(return_value=False)
        offer.status = 200
        offer.read.return_value = json.dumps({"data": [{"id": MODEL, "pricing": {}}]}).encode()
        writer.writer.opener.open.return_value = offer
        with self.assertRaises(WorkshopError):
            writer({})
        writer.writer.assert_not_called()
        pricing = {"currency_unit": "USD", "prompt": "0.0000001", "completion": "0.00000031",
                   "request": "0", "input_cache_reads": "0", "input_cache_writes": "0"}
        for invalid in (
            {**pricing, "prompt": "0.00000011"},
            {**pricing, "completion": "0.00000032"},
            {**pricing, "request": "0.001"},
            {**pricing, "currency_unit": "EUR"},
            {**pricing, "prompt": "NaN"},
        ):
            offer.read.return_value = json.dumps({"data": [{"id": MODEL, "pricing": invalid}]}).encode()
            with self.assertRaises(WorkshopError):
                writer({})
            writer.writer.assert_not_called()
        offer.read.return_value = json.dumps({"data": [{"id": MODEL, "pricing": pricing}]}).encode()
        writer({"documents": []})
        writer.writer.assert_called_once_with({"documents": []})


class TownMealTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        assets = local_storage(Path(self.tmp.name) / "assets")
        self.addCleanup(assets.catalogue.close)
        self.source = Sources()
        self.towns = SimpleNamespace(assets=assets, source=self.source,
                                     town=lambda data, token: copy.deepcopy(TOWN))
        self.writer = Mock(side_effect=response)
        self.service = TownMeals(self.towns, self.writer)
        self.service.jobs.configure_quota(PROVIDER, daily=100, monthly=3000)
        self.addCleanup(self.service.close)
        self.payload = {"kind": "meals", "town": "node/10", "journey": "a" * 32,
                        "location": {"col": 0, "row": 0}}

    def settled(self):
        for _ in range(500):
            result = self.service.request(self.payload, "capability")
            if not result["loading"]:
                return result
            time.sleep(.005)
        self.fail("Culinary discovery did not finish")

    def test_result_and_licensed_photo_retained_across_visits_and_instances(self):
        result = self.settled()
        self.assertEqual(result["error"], "")
        self.assertEqual(len(result["meals"]), 1)
        photo = result["meals"][0]["photo"]
        self.assertEqual(photo["attribution"], "Photographer")
        body, media = self.service.request({**self.payload, "image": photo["imageId"]}, "capability")
        self.assertEqual((body, media), (b"fixture-photograph", "image/jpeg"))
        with self.assertRaises(JourneyRequest):
            self.service.request({**self.payload, "image": "unknown"}, "capability")
        other = TownMeals(self.towns, self.writer)
        self.addCleanup(other.close)
        self.assertEqual(other.request(self.payload, "other-player"), result)
        self.writer.assert_called_once()
        with self.towns.assets.catalogue.connection() as db:
            usage = db.execute("SELECT calls FROM provider_usage WHERE provider=?", (PROVIDER,)).fetchall()
        self.assertEqual([row[0] for row in usage], [1, 1])

    def test_concurrent_requests_claim_once_and_errors_do_not_retry(self):
        entered, release = threading.Event(), threading.Event()
        def blocked(brief):
            entered.set()
            self.assertTrue(release.wait(5))
            raise ValueError("fixture generation failure")
        self.writer.side_effect = blocked
        with self.assertLogs(level="ERROR"):
            self.service.request(self.payload, "capability")
            self.assertTrue(entered.wait(5))
            for _ in range(5):
                self.assertTrue(self.service.request(self.payload, "capability")["loading"])
            release.set()
            result = self.settled()
        self.assertEqual(result["error"], "")
        self.assertEqual(result["mode"], "documentary")
        self.assertEqual(len(result["meals"]), 1)
        self.assertIn("photo", result["meals"][0])
        self.assertEqual(self.settled(), result)
        self.writer.assert_called_once()

    def test_photo_failure_keeps_dish_and_surfaces_warning(self):
        with patch.object(self.source, "read", side_effect=OSError("photo offline")), self.assertLogs(level="WARNING"):
            result = self.settled()
        self.assertEqual(len(result["meals"]), 1)
        self.assertNotIn("photo", result["meals"][0])
        self.assertTrue(result["warnings"])

    def test_asset_photo_failure_cannot_discard_the_documented_dish(self):
        with patch.object(self.service.assets, "publish", side_effect=AssetError("storage unavailable")), self.assertLogs(level="WARNING"):
            result = self.settled()
        self.assertEqual(len(result["meals"]), 1)
        self.assertEqual(result["error"], "")
        self.assertTrue(result["warnings"])

    def test_disabled_and_invalid_requests_are_explicit(self):
        disabled = TownMeals(self.towns)
        self.addCleanup(disabled.close)
        disabled.request(self.payload, "capability")
        result = self.settled()
        self.assertEqual(result["mode"], "documentary")
        self.assertEqual(len(result["meals"]), 1)
        self.writer.assert_not_called()
        with self.towns.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM provider_usage").fetchone()[0], 0)
        with self.assertRaises(JourneyRequest):
            self.service.request({**self.payload, "url": "https://example.com"}, "capability")

    def test_unconfigured_exhausted_daily_or_monthly_quota_prevents_any_model_call(self):
        for limits in (None, (0, 3000), (100, 0)):
            with self.subTest(limits=limits):
                with self.towns.assets.catalogue.connection() as db:
                    db.execute("DELETE FROM provider_quotas WHERE provider=?", (PROVIDER,))
                    db.execute("DELETE FROM worker_jobs WHERE kind='town-meals'")
                    db.execute("DELETE FROM town_documents")
                if limits is not None:
                    self.service.jobs.configure_quota(PROVIDER, daily=limits[0], monthly=limits[1])
                with self.assertLogs(level="ERROR"):
                    result = self.settled()
                self.assertEqual(result["error"], "")
                self.assertEqual(result["mode"], "documentary")
                self.assertEqual(len(result["meals"]), 1)
                self.writer.assert_not_called()
                self.assertEqual(self.settled(), result)

    def test_paid_dispatch_is_counted_even_if_the_provider_fails(self):
        self.writer.side_effect = OSError("Uncertain provider response")
        with self.assertLogs(level="ERROR"):
            result = self.settled()
        self.assertEqual(result["error"], "")
        self.assertEqual(result["mode"], "documentary")
        self.assertEqual(len(result["meals"]), 1)
        self.assertEqual(self.settled(), result)
        with self.towns.assets.catalogue.connection() as db:
            self.assertEqual([r[0] for r in db.execute(
                "SELECT calls FROM provider_usage WHERE provider=?", (PROVIDER,))], [1, 1])
            self.assertEqual(db.execute("SELECT status,attempts FROM worker_jobs WHERE kind='town-meals'").fetchone(),
                             ("failed", 1))
        self.writer.assert_called_once()

    def test_invalid_model_output_uses_fallback_and_persists_it_across_instances(self):
        self.writer.side_effect = lambda brief: {"choices": []}
        with self.assertLogs(level="ERROR"):
            result = self.settled()
        self.assertEqual(result["mode"], "documentary")
        self.assertEqual(len(result["meals"]), 1)
        other = TownMeals(self.towns, self.writer)
        self.addCleanup(other.close)
        self.assertEqual(other.request(self.payload, "another-player"), result)
        self.writer.assert_called_once()

    def test_fallback_with_no_proven_dish_is_explicit_empty_and_cached(self):
        self.writer.side_effect = OSError("offline")
        brief = MealSources(self.source).discover(TOWN)
        brief["documents"][0]["evidence"] = ["A restaurant in Tuscany."]
        with patch("town_meals.MealSources.discover", return_value=brief), self.assertLogs(level="ERROR"):
            result = self.settled()
        self.assertEqual(result["mode"], "documentary")
        self.assertEqual(result["meals"], [])
        self.assertEqual(result["error"], "")
        self.assertEqual(self.settled(), result)

    def test_source_failure_remains_explicit_and_never_redispatched(self):
        with patch("town_meals.MealSources.discover", side_effect=OSError("sources offline")) as discover:
            with self.assertLogs(level="ERROR"):
                result = self.settled()
            self.assertTrue(result["error"])
            self.assertEqual(self.settled(), result)
            discover.assert_called_once()
            self.writer.assert_not_called()

    def test_old_cached_failure_gets_one_source_only_recovery_without_paid_dispatch(self):
        from town_meals import CACHE_VERSION, digest
        with self.towns.assets.catalogue.connection() as db:
            db.execute("INSERT INTO town_documents(cache_key,payload,fetched,expires,token,lease) "
                       "VALUES(?,?,0,0,NULL,0)", (CACHE_VERSION + ":" + digest(TOWN["osmId"]),
                       json.dumps({"identity": TOWN["osmId"], "loading": False, "meals": [],
                                   "error": "Old provider failure", "warnings": []})))
        result = self.settled()
        self.assertEqual(result["mode"], "documentary")
        self.assertEqual(len(result["meals"]), 1)
        self.assertEqual(self.settled(), result)
        self.writer.assert_not_called()

    def test_town_authorization_is_required_even_for_cached_results_and_photos(self):
        self.settled()
        def denied(data, token):
            raise JourneyRequest("Invalid private capability")
        self.towns.town = denied
        for details in ({}, {"image": "a" * 64}):
            with self.assertRaisesRegex(JourneyRequest, "private capability"):
                self.service.request({**self.payload, **details}, "wrong")
        self.writer.assert_called_once()

    def test_expired_discovery_gets_source_only_recovery_without_paid_redispatch(self):
        catalogue = self.service.assets.catalogue
        with catalogue.connection() as db:
            from town_content import digest
            from town_meals import CACHE_VERSION
            key = CACHE_VERSION + ":" + digest(TOWN["osmId"])
            db.execute("INSERT INTO town_documents(cache_key,payload,fetched,expires,token,lease) "
                       "VALUES(?,?,0,0,'interrupted',1)",
                       (key, json.dumps({"identity": TOWN["osmId"], "loading": True,
                                         "meals": [], "error": "", "warnings": []})))
        result = self.settled()
        self.assertEqual(result["mode"], "documentary")
        self.assertEqual(len(result["meals"]), 1)
        self.assertEqual(self.settled(), result)
        self.writer.assert_not_called()


if __name__ == "__main__":
    unittest.main()
