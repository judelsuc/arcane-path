"""Versioned fictional search details grounded in retained, prepared map cells."""

import hashlib
import random

RADIUS = 3
GROUPS = {
    "forest": "woodland", "park": "woodland",
    "field": "cultivated", "vineyard": "cultivated",
    "plain": "open", "grass": "open",
    "hill": "rocky", "mountain": "rocky",
    "place": "built", "building": "built", "church": "built", "station": "built",
    "road": "wayside",
}
LANDMARKS = {
    "woodland": [
        ("a hollow stump", "une souche creuse"), ("a fallen trunk", "un tronc couché"),
        ("a charcoal mound", "une ancienne charbonnière"), ("a root-covered stone", "une pierre sous les racines"),
        ("a forester's shelter", "un abri forestier"), ("a split oak", "un chêne fendu"),
        ("a fern-covered hollow", "un creux couvert de fougères"), ("a low hunting blind", "un petit affût")],
    "cultivated": [
        ("a disused tool shelter", "un ancien abri à outils"), ("a boundary stone", "une borne parcellaire"),
        ("a collapsed trellis", "un treillage affaissé"), ("a dry irrigation trough", "une rigole sèche"),
        ("a field gate", "une barrière de champ"), ("a heap of cleared stones", "un amas de pierres d'épierrage"),
        ("a storage niche", "une niche de rangement"), ("a weathered scarecrow post", "un piquet d'épouvantail usé")],
    "open": [
        ("a low cairn", "un petit cairn"), ("a solitary boulder", "un rocher isolé"),
        ("a sunken stone ring", "un cercle de pierres enfoncé"), ("a shepherd's shelter", "un abri de berger"),
        ("a grassy mound", "un tertre herbeux"), ("a leaning post", "un poteau incliné"),
        ("a collapsed enclosure", "un enclos effondré"), ("a shallow earth hollow", "une cuvette de terre")],
    "rocky": [
        ("a narrow rock cleft", "une étroite faille"), ("a ledge beneath an overhang", "une corniche sous un surplomb"),
        ("a scree-side cairn", "un cairn au bord d'un éboulis"), ("a dry stone recess", "un renfoncement de pierre sèche"),
        ("a split boulder", "un bloc rocheux fendu"), ("an old quarry notch", "une ancienne entaille de carrière"),
        ("a sheltered rock shelf", "une banquette rocheuse abritée"), ("a low retaining wall", "un petit mur de soutènement")],
    "built": [
        ("a shuttered workshop", "un atelier aux volets clos"), ("a bricked-up arch", "une arche murée"),
        ("a service courtyard", "une cour de service"), ("a boarded cellar hatch", "une trappe de cave condamnée"),
        ("a disused washhouse niche", "une niche d'ancien lavoir"), ("a worn stairwell", "une cage d'escalier usée"),
        ("an old storage doorway", "une ancienne porte de réserve"), ("a walled garden gate", "une porte de jardin clos")],
    "wayside": [
        ("a milestone", "une borne routière"), ("a ditch-side recess", "un renfoncement au bord du fossé"),
        ("an old signpost base", "un ancien socle de panneau"), ("a roadside shelter", "un abri au bord du chemin"),
        ("a culvert mouth", "une bouche de ponceau"), ("a low parapet", "un petit parapet"),
        ("a disused gatepost", "un ancien pilier de portail"), ("a wheel-rutted lay-by", "un renfoncement marqué d'ornières")],
}
MARKS = [
    ("a crescent", "un croissant"), ("a bell", "une cloche"), ("a spiral", "une spirale"),
    ("a swallow", "une hirondelle"), ("an hourglass", "un sablier"), ("a fern", "une fougère"),
    ("an anchor", "une ancre"), ("a fox", "un renard"), ("a lantern", "une lanterne"),
    ("an open hand", "une main ouverte"), ("a wheeled sun", "un soleil à rayons"),
    ("a fish", "un poisson"), ("a feather", "une plume"), ("a key", "une clé"),
    ("a crown", "une couronne"), ("a moth", "un papillon de nuit"),
]
MATERIALS = [
    ("slate", "ardoise"), ("copper", "cuivre"), ("oak", "chêne"), ("iron", "fer"),
    ("clay", "argile"), ("limestone", "calcaire"), ("brass", "laiton"), ("glass", "verre"),
]
CARRIERS = [
    ("plaque", "plaque"), ("disc", "rondelle"), ("tablet", "tablette"),
    ("strip", "bande"), ("small panel", "petite plaque"), ("lozenge", "pastille"),
]
DETAILS = [
    ("small holes", "petits trous"), ("parallel strokes", "traits parallèles"),
    ("round dots", "points ronds"), ("short notches", "encoches courtes"),
    ("small triangles", "petits triangles"), ("concentric rings", "anneaux concentriques"),
]
CONDITIONS = [
    ("The edges are chipped.", "Les bords sont ébréchés."),
    ("One corner has been carefully repaired.", "Un angle a été réparé avec soin."),
    ("Fine scratches cross the surface.", "De fines rayures traversent la surface."),
    ("Pale lichen outlines its base.", "Du lichen pâle souligne sa base."),
    ("The sheltered side has kept its colour.", "Le côté abrité a gardé sa couleur."),
    ("A faded cord is knotted nearby.", "Une cordelette décolorée est nouée à proximité."),
    ("Tiny pebbles have been arranged beneath it.", "De petits cailloux sont alignés au-dessous."),
    ("A square of the surface looks recently cleaned.", "Un carré de la surface semble nettoyé récemment."),
]
TRACES = [
    ("A loose chain taps in the breeze.", "Une chaîne lâche tinte dans la brise."),
    ("Dust gathers in a thin sheltered line.", "La poussière forme une fine ligne à l'abri."),
    ("A dry leaf turns in a shallow groove.", "Une feuille sèche tourne dans une rainure."),
    ("A beetle disappears into a joint.", "Un scarabée disparaît dans un joint."),
    ("Small pale feathers lie nearby.", "De petites plumes pâles reposent à proximité."),
    ("A thread of cobweb catches the light.", "Un fil de toile accroche la lumière."),
    ("The ground bears an old curved scrape.", "Le sol porte une ancienne trace courbe."),
    ("A rusted ring rests against the base.", "Un anneau rouillé repose contre la base."),
    ("A smooth pebble sits in a small notch.", "Un galet poli occupe une petite encoche."),
    ("A broken cord trails into the dust.", "Un cordon rompu traîne dans la poussière."),
    ("A faded ribbon is caught on an edge.", "Un ruban passé est accroché à un bord."),
    ("A small chip reveals a lighter surface.", "Un éclat révèle une surface plus claire."),
]
GROUND = {
    "woodland": ("Among the trees", "Parmi les arbres"),
    "cultivated": ("On this cultivated ground", "Sur ce terrain cultivé"),
    "open": ("Across this open ground", "Sur ce terrain dégagé"),
    "rocky": ("Among the rocks", "Parmi les rochers"),
    "built": ("Among the buildings", "Parmi les constructions"),
    "wayside": ("Beside the road", "Au bord de la route"),
}
TERRAIN = {
    "forest": ("in the woods", "dans les bois"), "park": ("in the park", "dans le parc"),
    "field": ("among the fields", "au milieu des champs"), "vineyard": ("among the vines", "parmi les vignes"),
    "plain": ("on open ground", "en terrain découvert"), "grass": ("in the grassland", "dans la prairie"),
    "hill": ("on the hillside", "sur la colline"), "mountain": ("among the mountain rocks", "dans les rochers de la montagne"),
    "place": ("among the houses", "parmi les maisons"), "building": ("among the buildings", "parmi les bâtiments"),
    "church": ("near a church", "près d'une église"), "station": ("near a station", "près d'une gare"),
    "road": ("beside the road", "au bord de la route"),
}


def random_source(seed, town_id):
    digest = hashlib.sha256(f"legend-search-v1:{town_id}:{seed}".encode()).digest()
    return random.Random(int.from_bytes(digest, "big"))


def prepared_cells(chunks, region, origin):
    """Only use already prepared dry cells connected by ordinary orthogonal steps."""
    base = chunks.bases[region]
    grids, cells = {}, {}
    for row in range(max(-8000, origin["row"] - RADIUS), min(8007, origin["row"] + RADIUS) + 1):
        for col in range(max(-8000, origin["col"] - RADIUS), min(8007, origin["col"] + RADIUS) + 1):
            key = col // 8, row // 8
            if key not in grids:
                grids[key] = chunks.read(region, *key)
            grid = grids[key]
            if grid is not None:
                cell = grid["rows"][row % 8][col % 8]
            elif 0 <= col < base["width"] and 0 <= row < base["height"]:
                cell = base["rows"][row][col]
            else:
                continue
            if not cell.get("unavailable") and cell.get("terrain") in GROUPS:
                cells[col, row] = cell
    origin_key = origin["col"], origin["row"]
    reached, pending = set(), [origin_key]
    while pending:
        key = pending.pop()
        if key in reached or key not in cells:
            continue
        reached.add(key)
        col, row = key
        pending.extend(((col - 1, row), (col + 1, row), (col, row - 1), (col, row + 1)))
    return {key: cells[key] for key in sorted(reached) if key != origin_key}


def generate_search(seed, town_id, origin, cells):
    if len(cells) < 4:
        return None
    rng = random_source(seed, town_id)
    positions = list(sorted(cells))
    rng.shuffle(positions)
    target = positions[0]
    bags, previous, details, signatures = {}, {}, [], set()
    def draw(name, size):
        if not bags.get(name):
            bags[name] = list(range(size))
            rng.shuffle(bags[name])
            if bags[name][-1] == previous.get(name):
                bags[name][0], bags[name][-1] = bags[name][-1], bags[name][0]
        previous[name] = bags[name].pop()
        return previous[name]
    for col, row in positions:
        cell = cells[col, row]
        group = GROUPS[cell["terrain"]]
        landmark_index = draw(group, len(LANDMARKS[group]))
        mark = draw("marks", len(MARKS))
        material = draw("materials", len(MATERIALS))
        carrier = rng.randrange(len(CARRIERS))
        pattern = rng.randrange(len(DETAILS))
        count = rng.randrange(2, 8)
        while (group, landmark_index, mark, material, count) in signatures:
            mark = (mark + 1) % len(MARKS)
        signatures.add((group, landmark_index, mark, material, count))
        condition, trace = CONDITIONS[draw("conditions", len(CONDITIONS))], TRACES[draw("traces", len(TRACES))]
        landmark = LANDMARKS[group][landmark_index]
        description = {}
        for index, language in enumerate(("en", "fr")):
            plaque = (f"A {MATERIALS[material][index]} {CARRIERS[carrier][index]} shows {MARKS[mark][index]}, "
                      f"with {count} {DETAILS[pattern][index]} beneath it." if language == "en" else
                      f"Une {CARRIERS[carrier][index]} en {MATERIALS[material][index]} représente {MARKS[mark][index]}, "
                      f"avec {count} {DETAILS[pattern][index]} au-dessous.")
            sentences = [f"{GROUND[group][index]}, {landmark[index]}.", plaque, condition[index], trace[index]]
            if (col + row + seed) % 2:
                sentences[2], sentences[3] = sentences[3], sentences[2]
            description[language] = " ".join(sentences)
        details.append({"col": col, "row": row, "terrain": cell["terrain"], "group": group,
                        "landmark": landmark_index, "mark": mark, "material": material, "count": count,
                        "carrier": carrier, "pattern": pattern,
                        "description": description})
    plan = {"version": 1, "origin": origin, "entrance": {"col": target[0], "row": target[1]},
            "cells": details}
    plan["clues"] = search_clues(plan)
    return plan


def search_clues(plan):
    """Reword retained structural facts without moving or regenerating the search."""
    entrance = next(cell for cell in plan["cells"]
                    if (cell["col"], cell["row"]) == (plan["entrance"]["col"], plan["entrance"]["row"]))
    dc = entrance["col"] - plan["origin"]["col"]
    dr = entrance["row"] - plan["origin"]["row"]
    directions = (("north" if dr < 0 else "south") if dr else "") + (
        ("-" if dr else "") + ("west" if dc < 0 else "east") if dc else "")
    french = {"north": "nord", "south": "sud", "east": "est", "west": "ouest"}
    direction_fr = "-".join(french[part] for part in directions.split("-"))
    direction_fr = ("à l'" if directions in ("east", "west") else "au ") + direction_fr
    landmark = LANDMARKS[entrance["group"]][entrance["landmark"]]
    return {
        "en": [f"It's not far to the {directions} of town, {TERRAIN[entrance['terrain']][0]}.",
               f"I remember {landmark[0]} and a {MATERIALS[entrance['material']][0]} "
               f"{CARRIERS[entrance['carrier']][0]}.",
               f"It bore {MARKS[entrance['mark']][0]}, with {entrance['count']} "
               f"{DETAILS[entrance['pattern']][0]} beneath it."],
        "fr": [f"Ce n'est pas loin, {direction_fr} du bourg, "
               f"{TERRAIN[entrance['terrain']][1]}.",
               f"Il y avait {landmark[1]} et une {CARRIERS[entrance['carrier']][1]} "
               f"en {MATERIALS[entrance['material']][1]}.",
               f"Elle portait {MARKS[entrance['mark']][1]}, avec {entrance['count']} "
               f"{DETAILS[entrance['pattern']][1]} au-dessous."],
    }
