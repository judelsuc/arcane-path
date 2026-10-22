"""Deterministic fictional facts bound to a sourced town itinerary."""

from datetime import datetime, timezone
import math
import random
import json
from pathlib import Path

DAY = 86_400_000
MOTIVES = ("seasonal", "debt", "family", "departure", "collectors", "legend", "cartomancer")
INTIMACY = json.loads((Path(__file__).resolve().parents[1] / "public/parent-intimacy.json").read_text())
MODES = {"walk": 30, "hitch": 150, "bus": 200, "train": 300}
CLUES = (
    ("discuss", "photo", "letter", "buy"),
    ("search", "letter", "guestbook", "discuss"),
    ("ticket", "photo", "buy", "search"),
)

def intimate_story(trail):
    intimacy = trail.get("story", {}).get("intimacy")
    if not intimacy:
        return None
    profile = INTIMACY[intimacy["card"]]
    return {
        "card": intimacy["card"], **{key: profile[key] for key in ("desire", "memory", "object", "letter")},
        "encounter": "The cartomancer presented a card and asked for a personal object it evoked. "
                     "A real power appeared briefly. She hid the object, claiming its recovery must be deserved. "
                     "The adult expected a short absence, but kept postponing the return.",
        "child": "The child seeks the parent, not a magical object. The child's birth card does not "
                 "identify the adult's card or make the adult the original owner of a unique artifact.",
    }


def story_profile(seed, card):
    rng = random.Random(f"parent-story-v1:{seed}:{card}")
    # The adult's encounter is independent of the child's birth tarot.
    intimate_card = random.Random(f"parent-intimacy-v1:{seed}").choice(tuple(INTIMACY))
    return {"motive": "cartomancer", "intimacyCard": intimate_card,
            "orientation": rng.choice(("upright", "reversed")),
            "mode": rng.choice(tuple(MODES)),
            "finalState": rng.choice(("stationary", "mobile"))}


def build_parent_story(trail, seed, card, started_at, profile):
    rng = random.Random(f"parent-facts-v1:{seed}:{card}")
    count = len(trail["stages"])
    visits = [None] * count
    # The original ten stops predate the child's departure. Continuations are
    # future plans, activated only if the player has not caught the parent.
    departure = started_at - DAY
    if profile["motive"] == "seasonal":
        now = datetime.fromtimestamp(started_at / 1000, timezone.utc)
        season = datetime(now.year, 9, 30, 12, tzinfo=timezone.utc)
        if season.timestamp() * 1000 > departure:
            season = season.replace(year=now.year - 1)
        departure = int(season.timestamp() * 1000)
    for index in range(9, -1, -1):
        stage = trail["stages"][index]
        nights = rng.randint(1, 3)
        arrival = departure - nights * DAY
        visits[index] = {"arrival": arrival, "departure": departure,
                         "nights": nights, "purchases": nights + 1,
                         "clues": list(CLUES[index % len(CLUES)])}
        travel_days = max(1, math.ceil(stage["legMeters"] / (MODES[profile["mode"]] * 1000)))
        departure = arrival - travel_days * DAY
    movement = []
    for index in range(10, count):
        move_at = (index - 9) * 7 * DAY
        movement.append({"stage": index, "elapsedMinutes": move_at // 60_000})
        arrival = started_at + move_at
        visits[index] = {"arrival": arrival, "departure": arrival + DAY,
                         "nights": 1, "purchases": 2, "clues": list(CLUES[index % len(CLUES)])}
    false_stages = rng.sample(range(1, 9), rng.randint(1, 3))
    false_leads = [{"stage": index, "traveler": rng.choice(("Ari", "Lou", "Charlie")),
                    "reward": "contact"} for index in sorted(false_stages)]
    lore = [{"stage": index, "kind": rng.choice(("legend", "orphan"))}
            for index in sorted(rng.sample(range(1, 9), rng.randint(1, 2)))]
    story = {"version": 1, "birthCard": card, **profile, "visits": visits,
             "movement": movement, "falseLeads": false_leads, "lore": lore,
             "generatedAt": started_at, "fictional": True}
    if profile["motive"] == "cartomancer":
        story.pop("intimacyCard", None)
        story["intimacy"] = {"version": 1, "card": profile["intimacyCard"]}
    validate_parent_story(trail, story)
    return story


def validate_parent_story(trail, story):
    """Simulate clue access, finite pursuit and references, not terrain reachability."""
    def require(condition):
        if not condition:
            raise ValueError("Parent story is not narratively solvable.")
    count = len(trail["stages"])
    require(story["motive"] in MOTIVES and story["mode"] in MODES)
    if story["motive"] == "cartomancer":
        require(story.get("intimacy", {}).get("version") == 1
                and story["intimacy"].get("card") in INTIMACY)
    require(count == (13 if story["finalState"] == "mobile" else 10))
    require(len(story["visits"]) == count)
    for index, (stage, visit) in enumerate(zip(trail["stages"], story["visits"])):
        require(bool(stage.get("osmId") or stage.get("geonameId")) and bool(stage["name"]))
        require(visit["arrival"] < visit["departure"] and visit["nights"] >= 1)
        require(visit["purchases"] > 0 and len(set(visit["clues"])) >= 3)
        # No mandatory purchase, photo provider, skill or unique object.
        require(any(kind in {"discuss", "letter", "search", "ticket", "guestbook"}
                    for kind in visit["clues"]))
        if index:
            require(story["visits"][index - 1]["departure"] < visit["arrival"])
    require(story["visits"][9]["departure"] <= story["generatedAt"])
    require(len(story["movement"]) == count - 10)
    require(all(move["stage"] == 10 + i and move["elapsedMinutes"] == (i + 1) * 7 * 1440
                for i, move in enumerate(story["movement"])))
    require(1 <= len(story["falseLeads"]) <= 3 and 1 <= len(story["lore"]) <= 2)
    for branch in story["falseLeads"] + story["lore"]:
        require(0 <= branch["stage"] < 10)
    return {"narrativeSolvable": True, "terrainValidated": False,
            "mandatoryClueCents": 0, "mandatorySkills": [], "mandatoryUniqueObjects": [],
            "maximumStages": count}
