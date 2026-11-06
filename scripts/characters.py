"""Persistent fictional characters with shared identity and journey-private memories."""

from contextlib import contextmanager
import hashlib
import json
import logging
import math
import re
import sqlite3
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from content_factory import IMAGE_MODEL
from asset_storage import AssetRecord
from content_storage import clock as database_clock
from character_encounters import SCHEMAS as ENCOUNTER_SCHEMAS
from shared_images import SharedImages
from journey_storage import StoreConnection, cached_journey_cell
from journeys import JourneyCapacity, JourneyConflict, JourneyRequest, character_name
from main_artifacts import geographic_position
from quest_wording import character_quest
from lore_playtest import ARTIFACTS

WORLD = "roadside-characters-v1"
PORTRAIT_VERSION = "character-portrait-v1"
FACT_VERSION = 1
REQUEST_ID = re.compile(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")
CHARACTER_ID = re.compile(r"[a-f0-9]{32}")
OSM_ID = re.compile(r"(?:node|way)/\d+")
CONTRACT_ID = re.compile(r"[a-f0-9]{32}")
TOPICS = {"parent", "clues", "notebooks", "artifacts", "services",
          "shelter", "food", "work", "transport", "town"}
CONTRACT_EVENTS = {"offered", "accepted", "declined", "advanced", "completed", "abandoned"}
MAX_TOWN_CHARACTERS = 4
MAX_ROADSIDE_CHARACTERS = 1
MAX_REGION_CHARACTERS = 1000
MAX_WORLD_CHARACTERS = 5000
COUNTRYSIDE_CHUNK = 8
PRESENCE_PHASES = ("day", "dawn", "dusk", "night")
# Chance that someone is around, by place and journey time of day.
PRESENCE_CHANCES = {
    "town": {"day": .95, "dawn": .8, "dusk": .8, "night": .45},
    "road": {"day": .75, "dawn": .5, "dusk": .5, "night": .2},
    "countryside": {"day": .5, "dawn": .3, "dusk": .3, "night": .1},
}
MAX_PRIVATE_MEMORIES_PER_JOURNEY = 1000
MAX_PENDING_PORTRAITS = 16
PORTRAIT_PENDING_SECONDS = 1800
NAMING_LOCALES = {"firmi": "fr-FR", "paris": "fr-FR",
                  "alps": "fr-FR", "tahiti": "fr-FR"}
COUNTRY_NAMING_LOCALES = {
    "GB": "en-GB", "IE": "en-GB", "US": "en-US", "CA": "en-US",
    "ES": "es-ES", "IT": "it-IT", "DE": "de-DE", "AT": "de-DE",
    "CH": "de-DE", "PL": "pl-PL", "FI": "fi-FI", "FR": "fr-FR",
    "BE": "fr-FR", "LU": "fr-FR", "MC": "fr-FR",
}
NAMES = {
    "fr-FR": {
        "given": ("Anaïs", "Camille", "Émile", "Inès", "Jules", "Lucie",
                  "Maëlle", "Noémie", "Raphaël", "Zoé", "Adrien", "Agathe",
                  "Alice", "Amélie", "Antoine", "Baptiste", "Basile", "Céleste",
                  "Charlotte", "Clément", "Diane", "Élise", "Estelle", "Étienne",
                  "Gabriel", "Hugo", "Jeanne", "Léonie", "Louis", "Louise",
                  "Marion", "Mathilde", "Nadia", "Nicolas", "Paul", "Salomé",
                  "Samuel", "Sarah", "Simon", "Yasmine"),
        "family": ("Aubry", "Bazin", "Collet", "Delaunay", "Fabre",
                   "Leroux", "Mercier", "Perrin", "Roussel", "Vidal", "Arnaud",
                   "Barbier", "Bertrand", "Bonnet", "Boucher", "Brun", "Caron",
                   "Chevalier", "Clerc", "Colin", "David", "Delmas", "Dubois",
                   "Dufour", "Dupont", "Faure", "Fontaine", "Garnier", "Gauthier",
                   "Girard", "Guérin", "Lambert", "Laurent", "Legrand", "Marchand",
                   "Moreau", "Petit", "Renard", "Roche", "Vincent"),
    },
    "en-GB": {
        "given": ("Ada", "Arthur", "Beatrice", "Elliot", "Florence", "Iris",
                  "Oliver", "Rowan", "Thomas", "Violet", "Agnes", "Alistair",
                  "Amelia", "Archie", "Beth", "Callum", "Cecily", "Daisy",
                  "Edith", "Edward", "Elsie", "Felix", "Fraser", "Freya",
                  "George", "Harriet", "Hazel", "Henry", "Imogen", "Isla",
                  "Jasper", "Leo", "Lewis", "Mabel", "Maisie", "Nathan",
                  "Phoebe", "Reuben", "Ruth", "Zachary"),
        "family": ("Ainsworth", "Bennett", "Clarke", "Ellis", "Fletcher",
                   "Hughes", "Marlow", "Parker", "Turner", "Wells", "Abbott",
                   "Barker", "Bell", "Blackwood", "Brown", "Campbell", "Chapman",
                   "Collins", "Davies", "Edwards", "Evans", "Foster", "Graham",
                   "Green", "Hall", "Harris", "Hill", "Jones", "Lawson",
                   "Mitchell", "Morris", "Palmer", "Reid", "Robinson", "Scott",
                   "Shaw", "Spencer", "Walker", "Ward", "Wood"),
    },
    "en-US": {
        "given": ("Avery", "Casey", "Eleanor", "Emmett", "Harper", "Jordan",
                  "Morgan", "Quinn", "Riley", "Sage", "Abigail", "Adrian",
                  "Amara", "Audrey", "Benjamin", "Blake", "Cameron", "Cora",
                  "Daniel", "Delilah", "Drew", "Elijah", "Evelyn", "Gabriel",
                  "Grace", "Isaac", "Jade", "Julian", "Leah", "Logan",
                  "Maya", "Micah", "Naomi", "Noah", "Peyton", "Ruby",
                  "Savannah", "Theo", "Vivian", "Wesley"),
        "family": ("Brooks", "Carter", "Ellis", "Hayes", "Morgan",
                   "Parker", "Reed", "Rivera", "Taylor", "Woods", "Adams",
                   "Allen", "Anderson", "Bailey", "Baker", "Bell", "Bennett",
                   "Campbell", "Coleman", "Cooper", "Davis", "Diaz", "Foster",
                   "Garcia", "Gray", "Griffin", "Harris", "Jackson", "Kelly",
                   "Lee", "Lewis", "Martinez", "Miller", "Mitchell", "Nguyen",
                   "Price", "Ramirez", "Richardson", "Sullivan", "Washington"),
    },
    "es-ES": {
        "given": ("Alba", "Clara", "Diego", "Elena", "Inés", "Lucía",
                  "Mateo", "Nicolás", "Pablo", "Vega", "Adrián", "Aitana",
                  "Alejandro", "Ana", "Andrés", "Beatriz", "Carmen", "Daniel",
                  "Eva", "Gabriel", "Hugo", "Irene", "Jaime", "Javier",
                  "Jimena", "Jorge", "Julia", "Laura", "Leire", "Luis",
                  "Manuel", "Marina", "Martín", "Nerea", "Paula", "Raquel",
                  "Rubén", "Sara", "Sergio", "Teresa"),
        "family": ("Alonso", "Blanco", "Castro", "García", "López",
                   "Martín", "Navarro", "Ortega", "Ruiz", "Santos", "Aguilar",
                   "Álvarez", "Cabrera", "Calvo", "Cano", "Cortés", "Delgado",
                   "Díaz", "Domínguez", "Ferrer", "Flores", "Gil", "Gómez",
                   "Guerrero", "Herrera", "Iglesias", "León", "Lozano", "Marín",
                   "Medina", "Molina", "Montero", "Morales", "Muñoz", "Pascual",
                   "Prieto", "Ramos", "Romero", "Serrano", "Vega"),
    },
    "it-IT": {
        "given": ("Alessia", "Andrea", "Carlo", "Elena", "Giorgio", "Luca",
                  "Marta", "Nadia", "Paolo", "Sofia", "Alberto", "Anna",
                  "Beatrice", "Bianca", "Chiara", "Claudio", "Davide", "Elisa",
                  "Enrico", "Federica", "Filippo", "Francesca", "Gabriele", "Giada",
                  "Giovanni", "Giulia", "Ilaria", "Leonardo", "Lorenzo", "Lucia",
                  "Marco", "Matteo", "Michele", "Pietro", "Rebecca", "Riccardo",
                  "Sara", "Simone", "Valentina", "Viola"),
        "family": ("Bianchi", "Conti", "Costa", "Esposito", "Ferrari",
                   "Gallo", "Greco", "Marino", "Romano", "Rossi", "Barbieri",
                   "Bellini", "Benedetti", "Bernardi", "Bruno", "Colombo", "De Luca",
                   "Fabbri", "Farina", "Ferrara", "Fontana", "Galli", "Gentile",
                   "Giordano", "Leone", "Lombardi", "Longo", "Mancini", "Marchetti",
                   "Martini", "Moretti", "Neri", "Pellegrini", "Ricci", "Rinaldi",
                   "Rizzo", "Rossetti", "Santoro", "Serra", "Vitale"),
    },
    "de-DE": {
        "given": ("Amalia", "Anton", "Emil", "Greta", "Hanna", "Jonas",
                  "Lena", "Mila", "Theo", "Yara", "Adrian", "Anja",
                  "Ben", "Clara", "David", "Elisa", "Erik", "Felix",
                  "Frieda", "Hannes", "Ida", "Jakob", "Johanna", "Julius",
                  "Karl", "Klara", "Lea", "Leonie", "Lukas", "Marlene",
                  "Matteo", "Nele", "Nils", "Oskar", "Paula", "Philipp",
                  "Romy", "Simon", "Sophie", "Tobias"),
        "family": ("Bauer", "Becker", "Fischer", "Hoffmann", "Keller",
                   "Koch", "Meyer", "Schneider", "Schulz", "Weber", "Beck",
                   "Berger", "Braun", "Busch", "Fuchs", "Graf", "Hahn",
                   "Hartmann", "Herrmann", "Jung", "Kaiser", "Klein", "Krause",
                   "Krüger", "Lang", "Lange", "Lehmann", "Lorenz", "Ludwig",
                   "Meier", "Neumann", "Peters", "Richter", "Roth", "Schmidt",
                   "Schmitt", "Schröder", "Schubert", "Vogel", "Wolf"),
    },
    "pl-PL": {
        "given": ("Adam", "Agnieszka", "Ania", "Jan", "Kasia", "Marek",
                  "Marta", "Piotr", "Tomasz", "Zofia", "Aleksandra", "Alicja",
                  "Andrzej", "Antoni", "Barbara", "Bartosz", "Celina", "Damian",
                  "Dorota", "Elżbieta", "Ewa", "Filip", "Gabriela", "Grzegorz",
                  "Hanna", "Helena", "Iga", "Jakub", "Joanna", "Julia",
                  "Karol", "Klara", "Lena", "Łukasz", "Magdalena", "Natalia",
                  "Oskar", "Paweł", "Wiktor", "Zuzanna"),
        "family": ("Dąbrowski", "Kowalski", "Kozłowski", "Lewandowski", "Mazur",
                   "Nowak", "Szymański", "Woźniak", "Zieliński", "Żuk", "Baran",
                   "Bąk", "Cebula", "Czajka", "Duda", "Gajda", "Jabłoński",
                   "Kaczmarek", "Kalinowski", "Kamiński", "Kowalczyk", "Król", "Kubiak",
                   "Lis", "Maj", "Malinowski", "Michalak", "Nowakowski", "Olszewski",
                   "Pawlak", "Piątek", "Rutkowski", "Sikora", "Sobczak", "Stępień",
                   "Szulc", "Witkowski", "Wójcik", "Zając", "Zawadzki"),
    },
    "fi-FI": {
        "given": ("Aino", "Eero", "Helmi", "Ilmari", "Kaisa", "Lauri",
                  "Matti", "Noora", "Sanni", "Veikko", "Aada", "Aleksi",
                  "Anni", "Antti", "Eeva", "Elias", "Emilia", "Hanna",
                  "Henrik", "Iida", "Jaakko", "Johanna", "Juho", "Kerttu",
                  "Kuutti", "Laura", "Leevi", "Liisa", "Lotta", "Maija",
                  "Mika", "Oona", "Oskari", "Paavo", "Petri", "Riikka",
                  "Saara", "Tapio", "Tuomas", "Venla"),
        "family": ("Aalto", "Heikkinen", "Hämäläinen", "Järvinen", "Korhonen",
                   "Laine", "Nieminen", "Virtanen", "Vuori", "Äijälä", "Aaltonen",
                   "Ahonen", "Anttila", "Hakala", "Heikkilä", "Hiltunen", "Hirvonen",
                   "Jokinen", "Kallio", "Karjalainen", "Kinnunen", "Koivisto", "Koskinen",
                   "Laakso", "Laaksonen", "Lehtinen", "Lehto", "Lehtonen", "Mäkinen",
                   "Mattila", "Niemi", "Ojala", "Rantanen", "Räsänen", "Saarinen",
                   "Salminen", "Salonen", "Toivonen", "Tuominen", "Vainio"),
    },
}
ROLES = (
    ("artisan", "patient", "keeps a small repair workshop"),
    ("gardener", "curious", "tends a shared garden"),
    ("bookseller", "thoughtful", "looks after a bookstall"),
    ("traveller", "observant", "takes familiar local roads"),
    ("baker", "warm", "bakes bread for the neighbourhood"),
    ("innkeeper", "welcoming", "runs a small inn"),
    ("farmer", "practical", "works a small farm"),
    ("courier", "energetic", "carries letters between nearby towns"),
    ("musician", "expressive", "plays music at village gatherings"),
    ("herbalist", "attentive", "grows and dries aromatic herbs"),
    ("carpenter", "meticulous", "makes and repairs wooden furniture"),
    ("teacher", "encouraging", "teaches at a local school"),
    ("beekeeper", "gentle", "tends beehives and gathers honey"),
    ("shepherd", "watchful", "looks after a flock of sheep"),
    ("potter", "creative", "makes clay bowls and jugs"),
    ("weaver", "steady", "weaves cloth on a handloom"),
    ("tailor", "precise", "makes and mends clothes"),
    ("cobbler", "resourceful", "repairs worn shoes and boots"),
    ("blacksmith", "resolute", "forges and repairs metal tools"),
    ("miller", "methodical", "grinds grain into flour"),
    ("cook", "generous", "prepares meals in a village kitchen"),
    ("grocer", "sociable", "keeps a small grocery shop"),
    ("florist", "cheerful", "arranges flowers in a small shop"),
    ("guide", "patient", "leads walkers along local paths"),
    ("fisher", "calm", "catches fish for the local market"),
    ("cheesemaker", "careful", "makes cheese from local milk"),
    ("orchardist", "hopeful", "tends fruit trees in an orchard"),
    ("vintner", "dedicated", "tends vines and makes wine"),
    ("brewer", "inventive", "brews small batches of beer"),
    ("barista", "friendly", "prepares coffee in a small cafe"),
    ("painter", "imaginative", "paints landscapes and village scenes"),
    ("sculptor", "reflective", "carves small sculptures from stone"),
    ("photographer", "observant", "photographs the changing countryside"),
    ("storyteller", "animated", "tells stories at local gatherings"),
    ("librarian", "helpful", "cares for the village library"),
    ("archivist", "thorough", "preserves old public records"),
    ("clockmaker", "precise", "repairs clocks and watches"),
    ("locksmith", "reliable", "makes keys and repairs locks"),
    ("mason", "steadfast", "builds and repairs stone walls"),
    ("roofer", "cautious", "repairs village roofs"),
    ("cooper", "patient", "makes wooden barrels"),
    ("wheelwright", "ingenious", "makes and repairs cart wheels"),
    ("basketmaker", "nimble", "weaves baskets from willow"),
    ("leatherworker", "diligent", "makes bags and belts from leather"),
    ("soapmaker", "thoughtful", "makes scented soaps"),
    ("candlemaker", "quiet", "makes wax candles"),
    ("ferryman", "watchful", "takes passengers across a river"),
    ("stationmaster", "punctual", "looks after a small railway station"),
)
ROLE_KNOWLEDGE = {
    "artisan": (["services", "work"], ["own_workshop"]),
    "gardener": (["services", "town"], ["own_garden"]),
    "bookseller": (["services", "town"], ["own_bookstall"]),
    "traveller": (["transport", "town"], ["familiar_local_roads"]),
    "baker": (["services", "food", "work"], ["own_bakery"]),
    "innkeeper": (["services", "shelter", "food"], ["own_inn"]),
    "farmer": (["services", "food", "work"], ["own_farm"]),
    "courier": (["services", "transport", "work"], ["own_deliveries"]),
    "musician": (["services", "work", "town"], ["own_music"]),
    "herbalist": (["services", "work", "town"], ["own_herbs"]),
    "carpenter": (["services", "work"], ["own_carpentry"]),
    "teacher": (["services", "town"], ["own_school"]),
    "beekeeper": (["services", "food", "work"], ["own_hives"]),
    "shepherd": (["services", "work", "town"], ["own_flock"]),
    "potter": (["services", "work"], ["own_pottery"]),
    "weaver": (["services", "work"], ["own_weaving"]),
    "tailor": (["services", "work"], ["own_tailoring"]),
    "cobbler": (["services", "work"], ["own_shoe_repairs"]),
    "blacksmith": (["services", "work"], ["own_forge"]),
    "miller": (["services", "food", "work"], ["own_mill"]),
    "cook": (["services", "food", "work"], ["own_kitchen"]),
    "grocer": (["services", "food", "town"], ["own_grocery"]),
    "florist": (["services", "work", "town"], ["own_flowers"]),
    "guide": (["services", "transport", "town"], ["own_guiding"]),
    "fisher": (["services", "food", "work"], ["own_fishing"]),
    "cheesemaker": (["services", "food", "work"], ["own_cheese"]),
    "orchardist": (["services", "food", "work"], ["own_orchard"]),
    "vintner": (["services", "work", "town"], ["own_vineyard"]),
    "brewer": (["services", "work", "town"], ["own_brewery"]),
    "barista": (["services", "food", "town"], ["own_cafe"]),
    "painter": (["services", "work", "town"], ["own_painting"]),
    "sculptor": (["services", "work"], ["own_sculpture"]),
    "photographer": (["services", "work", "town"], ["own_photography"]),
    "storyteller": (["services", "town"], ["own_stories"]),
    "librarian": (["services", "town"], ["own_library"]),
    "archivist": (["services", "town"], ["own_archives"]),
    "clockmaker": (["services", "work"], ["own_clocks"]),
    "locksmith": (["services", "work"], ["own_locks"]),
    "mason": (["services", "work"], ["own_masonry"]),
    "roofer": (["services", "work", "shelter"], ["own_roofing"]),
    "cooper": (["services", "work"], ["own_barrels"]),
    "wheelwright": (["services", "work", "transport"], ["own_wheels"]),
    "basketmaker": (["services", "work"], ["own_baskets"]),
    "leatherworker": (["services", "work"], ["own_leatherwork"]),
    "soapmaker": (["services", "work"], ["own_soap"]),
    "candlemaker": (["services", "work"], ["own_candles"]),
    "ferryman": (["services", "transport", "town"], ["own_ferry"]),
    "stationmaster": (["services", "transport", "town"], ["own_station"]),
}
FACT_TOPICS = {
    "own_workshop": {"services", "work"},
    "own_garden": {"services", "town"},
    "own_bookstall": {"services", "town"},
    "familiar_local_roads": {"transport", "town"},
    "own_bakery": {"services", "food", "work"},
    "own_inn": {"services", "shelter", "food"},
    "own_farm": {"services", "food", "work"},
    "own_deliveries": {"services", "transport", "work"},
    "own_music": {"services", "work", "town"},
    "own_herbs": {"services", "work", "town"},
    "own_carpentry": {"services", "work"},
    "own_school": {"services", "town"},
    "own_hives": {"services", "food", "work"},
    "own_flock": {"services", "work", "town"},
    "own_pottery": {"services", "work"},
    "own_weaving": {"services", "work"},
    "own_tailoring": {"services", "work"},
    "own_shoe_repairs": {"services", "work"},
    "own_forge": {"services", "work"},
    "own_mill": {"services", "food", "work"},
    "own_kitchen": {"services", "food", "work"},
    "own_grocery": {"services", "food", "town"},
    "own_flowers": {"services", "work", "town"},
    "own_guiding": {"services", "transport", "town"},
    "own_fishing": {"services", "food", "work"},
    "own_cheese": {"services", "food", "work"},
    "own_orchard": {"services", "food", "work"},
    "own_vineyard": {"services", "work", "town"},
    "own_brewery": {"services", "work", "town"},
    "own_cafe": {"services", "food", "town"},
    "own_painting": {"services", "work", "town"},
    "own_sculpture": {"services", "work"},
    "own_photography": {"services", "work", "town"},
    "own_stories": {"services", "town"},
    "own_library": {"services", "town"},
    "own_archives": {"services", "town"},
    "own_clocks": {"services", "work"},
    "own_locks": {"services", "work"},
    "own_masonry": {"services", "work"},
    "own_roofing": {"services", "work", "shelter"},
    "own_barrels": {"services", "work"},
    "own_wheels": {"services", "work", "transport"},
    "own_baskets": {"services", "work"},
    "own_leatherwork": {"services", "work"},
    "own_soap": {"services", "work"},
    "own_candles": {"services", "work"},
    "own_ferry": {"services", "transport", "town"},
    "own_station": {"services", "transport", "town"},
    "general_local_services": {"services", "work"},
    "public_places": {"services", "town"},
    "local_routes": {"transport", "town"},
}
FACT_TEXT = {
    "own_workshop": "I keep a small repair workshop.",
    "own_garden": "I tend a shared garden.",
    "own_bookstall": "I look after a bookstall.",
    "familiar_local_roads": "I travel familiar local roads, but I have no verified route details to share.",
    "own_bakery": "I bake bread for the neighbourhood.",
    "own_inn": "I run a small inn.",
    "own_farm": "I work a small farm.",
    "own_deliveries": "I carry letters between nearby towns.",
    "own_music": "I play music at village gatherings.",
    "own_herbs": "I grow and dry aromatic herbs.",
    "own_carpentry": "I make and repair wooden furniture.",
    "own_school": "I teach at a local school.",
    "own_hives": "I tend beehives and gather honey.",
    "own_flock": "I look after a flock of sheep.",
    "own_pottery": "I make clay bowls and jugs.",
    "own_weaving": "I weave cloth on a handloom.",
    "own_tailoring": "I make and mend clothes.",
    "own_shoe_repairs": "I repair worn shoes and boots.",
    "own_forge": "I forge and repair metal tools.",
    "own_mill": "I grind grain into flour.",
    "own_kitchen": "I prepare meals in a village kitchen.",
    "own_grocery": "I keep a small grocery shop.",
    "own_flowers": "I arrange flowers in a small shop.",
    "own_guiding": "I lead walkers along local paths.",
    "own_fishing": "I catch fish for the local market.",
    "own_cheese": "I make cheese from local milk.",
    "own_orchard": "I tend fruit trees in an orchard.",
    "own_vineyard": "I tend vines and make wine.",
    "own_brewery": "I brew small batches of beer.",
    "own_cafe": "I prepare coffee in a small cafe.",
    "own_painting": "I paint landscapes and village scenes.",
    "own_sculpture": "I carve small sculptures from stone.",
    "own_photography": "I photograph the changing countryside.",
    "own_stories": "I tell stories at local gatherings.",
    "own_library": "I care for the village library.",
    "own_archives": "I preserve old public records.",
    "own_clocks": "I repair clocks and watches.",
    "own_locks": "I make keys and repair locks.",
    "own_masonry": "I build and repair stone walls.",
    "own_roofing": "I repair village roofs.",
    "own_barrels": "I make wooden barrels.",
    "own_wheels": "I make and repair cart wheels.",
    "own_baskets": "I weave baskets from willow.",
    "own_leatherwork": "I make leather bags and belts.",
    "own_soap": "I make scented soaps.",
    "own_candles": "I make wax candles.",
    "own_ferry": "I take passengers across a river.",
    "own_station": "I look after a small railway station.",
    "general_local_services": "I keep a small repair workshop.",
    "public_places": "I tend a shared garden or bookstall; I do not have a verified public-place list.",
    "local_routes": "I travel familiar local roads, but I have no verified route details to share.",
}
PORTRAIT_ROLE_PROMPTS = {
    "artisan": "a fictional adult craftsperson who repairs small everyday objects",
    "gardener": "a fictional adult community gardener",
    "bookseller": "a fictional adult bookseller",
    "traveller": "a fictional adult local traveller",
    "baker": "a fictional adult village baker wearing a flour-dusted apron",
    "innkeeper": "a fictional adult innkeeper wearing a simple waistcoat",
    "farmer": "a fictional adult smallholder wearing practical farm clothes",
    "courier": "a fictional adult walking courier carrying a plain letter satchel",
    "musician": "a fictional adult village musician carrying an acoustic instrument",
    "herbalist": "a fictional adult herb grower holding a small bundle of aromatic herbs",
    "carpenter": "a fictional adult carpenter wearing a woodworking apron",
    "teacher": "a fictional adult village schoolteacher",
    "beekeeper": "a fictional adult beekeeper wearing a protective veil folded back",
    "shepherd": "a fictional adult shepherd wearing a wool cloak",
    "potter": "a fictional adult potter wearing a clay-stained apron",
    "weaver": "a fictional adult weaver holding a small skein of yarn",
    "tailor": "a fictional adult tailor wearing a measuring tape around the shoulders",
    "cobbler": "a fictional adult cobbler wearing a leather work apron",
    "blacksmith": "a fictional adult blacksmith wearing a soot-marked apron",
    "miller": "a fictional adult miller wearing flour-dusted work clothes",
    "cook": "a fictional adult village cook wearing a simple kitchen apron",
    "grocer": "a fictional adult village grocer wearing a shop apron",
    "florist": "a fictional adult florist holding a small bunch of flowers",
    "guide": "a fictional adult walking guide wearing a weathered jacket and small backpack",
    "fisher": "a fictional adult fisher wearing a weatherproof coat",
    "cheesemaker": "a fictional adult cheesemaker wearing a clean work apron",
    "orchardist": "a fictional adult orchard keeper holding a small fruit basket",
    "vintner": "a fictional adult vine grower wearing vineyard work clothes",
    "brewer": "a fictional adult small-scale brewer wearing a work apron",
    "barista": "a fictional adult cafe barista wearing a simple apron",
    "painter": "a fictional adult landscape painter holding a paintbrush",
    "sculptor": "a fictional adult stone sculptor wearing dusty work clothes",
    "photographer": "a fictional adult countryside photographer carrying a camera",
    "storyteller": "a fictional adult village storyteller with an expressive face",
    "librarian": "a fictional adult village librarian holding a plain closed book",
    "archivist": "a fictional adult archivist holding a plain document folder",
    "clockmaker": "a fictional adult clockmaker wearing a jeweller's loupe",
    "locksmith": "a fictional adult locksmith wearing a work vest",
    "mason": "a fictional adult stonemason wearing a stone-dusted work jacket",
    "roofer": "a fictional adult roofer wearing sturdy work clothes",
    "cooper": "a fictional adult barrel maker wearing a woodworking apron",
    "wheelwright": "a fictional adult cart wheel maker wearing a leather apron",
    "basketmaker": "a fictional adult basket weaver holding a small willow basket",
    "leatherworker": "a fictional adult leatherworker wearing a workshop apron",
    "soapmaker": "a fictional adult soapmaker wearing a clean apron",
    "candlemaker": "a fictional adult candlemaker holding an unlit wax candle",
    "ferryman": "a fictional adult river ferry operator wearing a weathered coat",
    "stationmaster": "a fictional adult railway station keeper wearing a plain uniform cap",
}


def portrait_request(character_id):
    return hashlib.sha256(
        f"{PORTRAIT_VERSION}:{IMAGE_MODEL}:{character_id}".encode()
    ).hexdigest()


def portrait_gender(location_id, slot):
    offset = int(hashlib.sha256(f"portrait-gender:{location_id}".encode()).hexdigest()[:8], 16)
    return ("woman", "man")[(offset + slot) % 2]


def portrait_prompt(role, gender=None):
    if role not in PORTRAIT_ROLE_PROMPTS:
        raise ValueError("Unknown portrait role.")
    if gender is not None and gender not in {"woman", "man"}:
        raise ValueError("Unknown portrait gender.")
    return {"prompt": (
        f"An original illustrated bust portrait of {PORTRAIT_ROLE_PROMPTS[role]}, "
        + (f"depicted as an adult {gender}, " if gender else "") +
        "with generic non-identifiable features, gentle expression, simple role-appropriate clothing, "
        "soft watercolor and ink on warm paper, restrained indigo and ochre palette. "
        "One fictional adult only; no name, place, readable text, symbols, maps, realism, "
        "photographic likeness, or reference to any real person."
    )}


class Characters:
    def __init__(self, journeys, authorization, *, clock=time.time, writer=None, quests=None, artifacts=None):
        self.journeys, self.authorization, self.clock = journeys, authorization, clock
        self.quests = quests
        self.artifacts = artifacts
        self.assets = getattr(journeys, "assets", None)
        self.writer = writer if self.assets is not None else None
        self.portrait_pool = (ThreadPoolExecutor(max_workers=1, thread_name_prefix="character-portrait")
                             if self.writer else None)
        self.portrait_tasks = set()
        self.portrait_lock = threading.Lock()
        self.path = journeys.path.parent / "characters.sqlite3"
        if self.assets is None:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.connect() as db:
                db.executescript("""
                    CREATE TABLE IF NOT EXISTS journey_store_locks(name TEXT PRIMARY KEY);
                    INSERT INTO journey_store_locks(name) VALUES('character-registry')
                        ON CONFLICT(name) DO NOTHING;
                    CREATE TABLE IF NOT EXISTS world_characters (
                        character_id TEXT PRIMARY KEY, world_id TEXT NOT NULL, region TEXT NOT NULL,
                        location_id TEXT NOT NULL, location_kind TEXT NOT NULL, location_name TEXT NOT NULL,
                        naming_locale TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
                        profile TEXT NOT NULL, knowledge TEXT NOT NULL, needs TEXT NOT NULL,
                        portrait_ref TEXT, portrait_status TEXT NOT NULL, portrait_model TEXT,
                        portrait_provenance TEXT NOT NULL,
                        portrait_revision INTEGER NOT NULL, revision INTEGER NOT NULL, slot INTEGER NOT NULL,
                        created_at DOUBLE PRECISION NOT NULL, UNIQUE(world_id,location_id,slot));
                    CREATE INDEX IF NOT EXISTS world_characters_location
                        ON world_characters(world_id,region,location_id,slot);
                    CREATE TABLE IF NOT EXISTS character_creation_requests (
                        journey TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
                        character_id TEXT NOT NULL, created_at DOUBLE PRECISION NOT NULL,
                        PRIMARY KEY(journey,request_id));
                    CREATE TABLE IF NOT EXISTS character_private_memories (
                        journey TEXT NOT NULL, character_id TEXT NOT NULL, event_id TEXT NOT NULL,
                        event_type TEXT NOT NULL, topic TEXT, created_at DOUBLE PRECISION NOT NULL,
                        PRIMARY KEY(journey,event_id));
                    CREATE INDEX IF NOT EXISTS character_private_memories_history
                        ON character_private_memories(journey,character_id,created_at);
                    CREATE TABLE IF NOT EXISTS character_private_exchanges (
                        journey TEXT NOT NULL, event_id TEXT NOT NULL, character_id TEXT NOT NULL,
                        topic TEXT NOT NULL, fact_ids TEXT NOT NULL,
                        fact_version INTEGER NOT NULL DEFAULT 1, created_at DOUBLE PRECISION NOT NULL,
                        PRIMARY KEY(journey,event_id));
                    CREATE TABLE IF NOT EXISTS character_quest_contracts (
                        journey TEXT NOT NULL, character_id TEXT NOT NULL, contract_id TEXT NOT NULL,
                        status TEXT NOT NULL, step INTEGER NOT NULL, total_steps INTEGER NOT NULL,
                        outcome TEXT, updated_at DOUBLE PRECISION NOT NULL,
                        PRIMARY KEY(journey,contract_id));
                    CREATE TABLE IF NOT EXISTS character_quest_events (
                        journey TEXT NOT NULL, event_id TEXT NOT NULL, character_id TEXT NOT NULL,
                        contract_id TEXT NOT NULL, event TEXT NOT NULL, step INTEGER NOT NULL,
                        total_steps INTEGER NOT NULL, created_at DOUBLE PRECISION NOT NULL,
                        PRIMARY KEY(journey,event_id), UNIQUE(journey,contract_id,event,step));
                    CREATE INDEX IF NOT EXISTS character_quest_contracts_history
                        ON character_quest_contracts(journey,character_id,updated_at);
                """)
                self._ensure_exchange_version(db)
                for schema in ENCOUNTER_SCHEMAS:
                    db.execute(schema)
            self.path.chmod(0o600)
        if self.assets is not None:
            self._resume_portraits()

    @staticmethod
    def _ensure_exchange_version(db):
        columns = {row[1] for row in db.execute(
            "PRAGMA table_info(character_private_exchanges)").fetchall()}
        if "fact_version" not in columns:
            db.execute(
                "ALTER TABLE character_private_exchanges "
                "ADD COLUMN fact_version INTEGER NOT NULL DEFAULT 1")

    @contextmanager
    def connect(self):
        if self.assets is not None:
            with self.assets.catalogue.connection() as db:
                yield StoreConnection(db, self.assets.catalogue, mapping=True)
        else:
            db = sqlite3.connect(self.path, timeout=10)
            db.row_factory = sqlite3.Row
            try:
                with db:
                    yield db
            finally:
                db.close()

    def _begin(self, db):
        if self.assets is None:
            db.execute("BEGIN IMMEDIATE")
        else:
            db.begin("character-registry")

    def _authorized_journey(self, request, token):
        journey = request.get("journey")
        if not isinstance(journey, str) or not CHARACTER_ID.fullmatch(journey):
            raise JourneyRequest("Invalid character journey.")
        genesis = self.authorization.authorize(journey, token)
        region = genesis["region"]
        chunks = self.journeys.chunks
        chunks.require_origin(region)
        base = chunks.bases.get(region)
        return journey, genesis, region, base

    def _authorized_location(self, request, token):
        journey, genesis, region, base = self._authorized_journey(request, token)
        chunks = self.journeys.chunks
        _, _, cell, _, _ = cached_journey_cell(chunks, region, request.get("location"))
        col, row = request["location"]["col"], request["location"]["row"]
        if cell.get("unavailable") or cell.get("terrain") == "water":
            raise JourneyConflict("No character encounter is available in this cell.")
        settlements = sorted(
            (place for place in cell.get("settlements", [])
             if isinstance(place, dict) and isinstance(place.get("osmId"), str)
             and OSM_ID.fullmatch(place["osmId"]) and place["osmId"].startswith(("node/", "way/"))
             and isinstance(place.get("name"), str) and place["name"].strip()),
            key=lambda place: place["osmId"])
        if settlements and cell.get("terrain") == "place":
            town = settlements[0]
            location = {"id": "town:" + town["osmId"], "kind": "town",
                        "name": town["name"].strip(), "col": col, "row": row}
        elif cell.get("terrain") == "major_road":
            location = {"id": f"road:{region}:{col}:{row}", "kind": "roadside",
                        "name": base.get("name", region), "col": col, "row": row}
        else:
            # One wandering character per map chunk keeps the countryside population bounded.
            location = {"id": f"wild:{region}:{col // COUNTRYSIDE_CHUNK}:{row // COUNTRYSIDE_CHUNK}",
                        "kind": "countryside", "name": base.get("name", region), "col": col, "row": row}
        location["terrain"] = cell.get("terrain")
        country_codes = cell.get("countryCodes", [])
        if not isinstance(country_codes, list):
            country_codes = []
        country_codes = sorted({code for code in country_codes
                                if isinstance(code, str) and re.fullmatch(r"[A-Z]{2}", code)})
        naming_locale = cell.get("namingLocale")
        if "namingLocale" in cell:
            naming_locale = naming_locale if isinstance(naming_locale, str) and naming_locale in NAMES else None
        elif country_codes:
            naming_locale = next((COUNTRY_NAMING_LOCALES[code] for code in country_codes
                                  if code in COUNTRY_NAMING_LOCALES), None)
        elif 0 <= col < base["width"] and 0 <= row < base["height"]:
            explicit = base.get("namingLocale")
            naming_locale = (explicit if isinstance(explicit, str) and explicit in NAMES
                             else NAMING_LOCALES.get(region) if explicit is None else None)
        if (naming_locale is None and "namingLocale" not in cell and not country_codes
                and request.get("action") in {"list", "create"}
                and getattr(chunks, "places", None) is not None):
            try:
                country = chunks.places.country(*geographic_position(base, col, row))
            except (OSError, ValueError) as error:
                logging.warning("Character location country lookup failed: %s", error)
                raise JourneyConflict(
                    "The current location's country could not be verified; please try again.") from error
            naming_locale = COUNTRY_NAMING_LOCALES.get(country["countryCode"])
        if naming_locale not in NAMES:
            location["canCreate"] = False
        else:
            location["canCreate"] = True
        location["namingLocale"] = naming_locale
        return journey, genesis, region, location

    @staticmethod
    def _character(row, memories=(), position=None):
        location = {"id": row["location_id"], "kind": row["location_kind"],
                    "name": row["location_name"]}
        current = {**location}
        if position:
            current.update({key: position[key] for key in ("col", "row")})
            current["region"] = position.get("region", row["region"])
        profile = json.loads(row["profile"])
        if "quest" not in profile:
            profile["quest"] = character_quest(row["character_id"], row["role"])
        knowledge = json.loads(row["knowledge"])
        knowledge.pop("artifacts", None)
        return {
            "id": row["character_id"], "name": row["name"], "role": row["role"],
            "location": location, "home": location, "current": current,
            "availability": "present",
            "availabilityClock": "shared-world-static-v1",
            "namingLocale": row["naming_locale"],
            "profile": profile, "knowledge": knowledge,
            "needs": json.loads(row["needs"]),
            "portrait": {"ref": row["portrait_ref"], "status": row["portrait_status"],
                         "model": row["portrait_model"],
                         "provenance": json.loads(row["portrait_provenance"]),
                         "revision": row["portrait_revision"]},
            "revision": row["revision"], "memories": list(memories), "contracts": [],
        }

    def _memories(self, db, journey, character_id):
        rows = db.execute(self._sql(
            "SELECT m.event_type,m.topic,m.created_at,e.fact_ids,e.fact_version "
            "FROM character_private_memories m "
            "LEFT JOIN character_private_exchanges e ON e.journey=m.journey AND e.event_id=m.event_id "
            "WHERE m.journey=? AND m.character_id=? ORDER BY m.created_at DESC,m.event_id DESC LIMIT 20"),
            (journey, character_id)).fetchall()
        return [{"type": row["event_type"], "topic": row["topic"], "at": row["created_at"],
                 **({"facts": json.loads(row["fact_ids"]),
                     "factVersion": row["fact_version"]} if row["fact_ids"] is not None else {})}
                for row in reversed(rows)]

    def _contracts(self, db, journey, character_id):
        rows = db.execute(self._sql(
            "SELECT contract_id,status,step,total_steps,outcome,updated_at FROM character_quest_contracts "
            "WHERE journey=? AND character_id=? ORDER BY updated_at DESC,contract_id DESC LIMIT 20"),
            (journey, character_id)).fetchall()
        return [{"id": row["contract_id"], "status": row["status"], "step": row["step"],
                 "totalSteps": row["total_steps"], "outcome": row["outcome"], "updatedAt": row["updated_at"]}
                for row in reversed(rows)]

    def _sql(self, query):
        return query

    @staticmethod
    def _visitor_name(genesis):
        value = genesis.get("state", {}).get("name")
        try:
            name = character_name(value)
        except (JourneyRequest, UnicodeError):
            return None
        if any(char in "<>" for char in name):
            return None
        return name

    def _encounter_clock(self, db):
        if self.assets:
            return float(db.execute("SELECT " + database_clock(self.assets.catalogue)).fetchone()[0])
        return self.clock()

    def _backfill_encounters(self, journey, genesis):
        name = self._visitor_name(genesis)
        with self.connect() as db:
            self._begin(db)
            if name:
                db.execute(self._sql(
                    "INSERT INTO character_visitor_identities(journey,fictional_name) VALUES(?,?) "
                    "ON CONFLICT(journey) DO NOTHING"), (journey, name))
            db.execute(self._sql(
                "INSERT INTO character_encounter_events(journey,event_id,character_id,seen_at) "
                "SELECT journey,event_id,character_id,created_at FROM character_private_memories "
                "WHERE journey=? AND event_type='met' "
                "ON CONFLICT(journey,event_id) DO NOTHING"), (journey,))
            db.execute(self._sql(
                "INSERT INTO character_encounters(character_id,journey,first_seen,last_seen,meeting_count) "
                "SELECT character_id,journey,MIN(seen_at),MAX(seen_at),COUNT(*) "
                "FROM character_encounter_events WHERE journey=? GROUP BY character_id,journey "
                "ON CONFLICT(character_id,journey) DO UPDATE SET "
                "first_seen=excluded.first_seen,last_seen=excluded.last_seen,"
                "meeting_count=excluded.meeting_count"), (journey,))

    def _familiarity(self, db, journey, character_id):
        row = db.execute(self._sql(
            "SELECT meeting_count FROM character_encounters WHERE character_id=? AND journey=?"),
            (character_id, journey)).fetchone()
        return {"known": row is not None, "meetings": row["meeting_count"] if row else 0}

    def _visitors(self, db, journey, character_id, cursor=None, limit=3, offset=0):
        rows = db.execute(self._sql(
            "SELECT DISTINCT i.fictional_name FROM character_encounters e "
            "JOIN character_visitor_identities i ON i.journey=e.journey "
            "WHERE e.character_id=? AND e.journey<>? "
            "AND i.fictional_name<>COALESCE((SELECT fictional_name FROM character_visitor_identities "
            "WHERE journey=?),'') AND i.fictional_name>? ORDER BY i.fictional_name LIMIT ? OFFSET ?"),
            (character_id, journey, journey, cursor or "", limit + 1, offset)).fetchall()
        return {"facts": [{"name": row["fictional_name"], "type": "met"}
                          for row in rows[:limit]],
                "nextCursor": rows[limit - 1]["fictional_name"] if len(rows) > limit else None}

    def _visitor_mention(self, db, journey, character_id, seed):
        if seed % 3:
            return []
        count = db.execute(self._sql(
            "SELECT COUNT(DISTINCT i.fictional_name) FROM character_encounters e "
            "JOIN character_visitor_identities i ON i.journey=e.journey "
            "WHERE e.character_id=? AND e.journey<>? "
            "AND i.fictional_name<>COALESCE((SELECT fictional_name FROM character_visitor_identities "
            "WHERE journey=?),'')"), (character_id, journey, journey)).fetchone()[0]
        if not count:
            return []
        return self._visitors(db, journey, character_id, limit=1, offset=(seed // 3) % count)["facts"]

    def _visitor_page(self, journey, location, character_id, cursor, limit):
        if (type(limit) is not int or not 1 <= limit <= 20 or
                cursor is not None and (not isinstance(cursor, str) or
                                        len(cursor) > 40 or self._visitor_name(
                                            {"state": {"name": cursor}}) != cursor)):
            raise JourneyRequest("Invalid visitor page.")
        with self.connect() as db:
            row = db.execute(self._sql(
                "SELECT 1 FROM world_characters WHERE character_id=? AND world_id=? AND location_id=?"),
                (character_id, WORLD, location["id"])).fetchone()
            if row is None:
                raise JourneyConflict("That character is not available at this location.")
            return self._visitors(db, journey, character_id, cursor, limit)

    def _list(self, journey, region, location):
        if self.assets:
            with self.connect() as db:
                pending = db.execute(self._sql(
                    "SELECT character_id FROM world_characters WHERE world_id=? AND location_id=? "
                    "AND portrait_status IN ('pending','failed') ORDER BY slot LIMIT ?"),
                    (WORLD, location["id"], MAX_TOWN_CHARACTERS)).fetchall()
            for row in pending:
                self._reconcile_portrait(row["character_id"])
        with self.connect() as db:
            rows = db.execute(self._sql(
                "SELECT * FROM world_characters WHERE world_id=? AND location_id=? ORDER BY slot"),
                (WORLD, location["id"])).fetchall()
            characters = []
            for row in rows:
                character = self._character(
                    row, self._memories(db, journey, row["character_id"]), {**location, "region": region})
                character["contracts"] = self._contracts(db, journey, row["character_id"])
                character["familiarity"] = self._familiarity(db, journey, row["character_id"])
                character["visitorFacts"] = self._visitors(db, journey, row["character_id"])["facts"]
                characters.append(character)
        limit = MAX_TOWN_CHARACTERS if location["kind"] == "town" else MAX_ROADSIDE_CHARACTERS
        location = {key: value for key, value in location.items() if key not in ("namingLocale", "terrain")}
        return {"location": location, "characters": characters,
                "canCreate": bool(location.get("canCreate") and len(characters) < limit),
                "unavailableReason": None if location.get("canCreate") else "naming-locale-unavailable",
                "limit": limit}

    @staticmethod
    def _presence_chance(location, phase):
        if location["kind"] == "town":
            group = "town"
        elif location["kind"] == "roadside" or location.get("terrain") == "road":
            group = "road"
        else:
            group = "countryside"
        return PRESENCE_CHANCES[group][phase]

    def _encounter(self, journey, region, location, presence):
        if (not isinstance(presence, dict) or set(presence) != {"phase", "hour"}
                or presence["phase"] not in PRESENCE_PHASES
                or type(presence["hour"]) is not int or not 0 <= presence["hour"] < 2 ** 40):
            raise JourneyRequest("Invalid character presence request.")
        # Deterministic per journey, place and journey hour: reopening never rerolls.
        seed = hashlib.sha256(f"presence:{journey}:{location['id']}:{presence['hour']}".encode()).hexdigest()
        if int(seed[:8], 16) / 2 ** 32 >= self._presence_chance(location, presence["phase"]):
            result = self._list(journey, region, location)
            return {**result, "characters": [], "absent": True}
        result = self._list(journey, region, location)
        if result["characters"] or not location["canCreate"]:
            return result
        request_id = "-".join((seed[8:16], seed[16:20], seed[20:24], seed[24:28], seed[28:40]))
        try:
            arrived = self._create(journey, region, location, request_id)
        except JourneyConflict:
            result = self._list(journey, region, location)
            return result if result["characters"] else {**result, "canCreate": False, "absent": True}
        return {**self._list(journey, region, location), "arrived": arrived["id"]}

    @staticmethod
    def _artifact_knowledge(character_id, clues):
        seed = hashlib.sha256(f"character-artifacts-v1:{character_id}".encode()).hexdigest()
        ordered = sorted(ARTIFACTS, key=lambda identity: hashlib.sha256(
            f"{seed}:{identity}".encode()).hexdigest())
        return [{"id": identity, "clue": clues.get(identity)}
                for identity in ordered[:1 + int(seed[:8], 16) % 3]]

    @staticmethod
    def _spontaneous_rumour(knowledge, character_id, journey, event_id):
        known = knowledge.get("artifacts", ())
        if not known:
            return None
        seed = hashlib.sha256(
            f"character-conversation-v1:{character_id}:{journey}:{event_id}".encode()).hexdigest()
        if int(seed[:8], 16) % 100 >= 35:
            return None
        return {"characterId": character_id, "eventId": event_id,
                "artifactId": known[int(seed[8:16], 16) % len(known)]["id"]}

    def _ensure_artifact_knowledge(self, journey, region, location, character_id):
        if self.artifacts is None:
            return
        with self.connect() as db:
            row = db.execute(self._sql(
                "SELECT knowledge FROM world_characters WHERE character_id=? AND world_id=? AND location_id=?"),
                (character_id, WORLD, location["id"])).fetchone()
        if row is None or "artifacts" in json.loads(row["knowledge"]):
            return
        clues = self.artifacts.character_knowledge(journey, region, location)
        with self.connect() as db:
            self._begin(db)
            row = db.execute(self._sql(
                "SELECT knowledge FROM world_characters WHERE character_id=?"),
                (character_id,)).fetchone()
            knowledge = json.loads(row["knowledge"])
            if "artifacts" not in knowledge:
                knowledge["artifacts"] = self._artifact_knowledge(character_id, clues)
                db.execute(self._sql("UPDATE world_characters SET knowledge=? WHERE character_id=?"),
                           (json.dumps(knowledge), character_id))

    def artifact_rumour(self, journey, character_id, event_id, position, token):
        _, _, _, location = self._authorized_location(
            {"journey": journey, "location": position}, token)
        with self.connect() as db:
            row = db.execute(self._sql(
                "SELECT knowledge FROM world_characters WHERE character_id=? AND world_id=? AND location_id=?"),
                (character_id, WORLD, location["id"])).fetchone()
            event = db.execute(self._sql(
                "SELECT character_id FROM character_encounter_events WHERE journey=? AND event_id=?"),
                (journey, event_id)).fetchone()
            if event is None:
                event = db.execute(self._sql(
                    "SELECT character_id FROM character_private_exchanges WHERE journey=? AND event_id=?"),
                    (journey, event_id)).fetchone()
            if row is None or event is None or event["character_id"] != character_id:
                raise JourneyConflict("This character has not shared an artifact rumour in this conversation.")
            knowledge = json.loads(row["knowledge"])
        selected = self._spontaneous_rumour(knowledge, character_id, journey, event_id)
        if selected is None:
            raise JourneyConflict("No artifact rumour was shared in this conversation.")
        return next(item for item in knowledge["artifacts"] if item["id"] == selected["artifactId"])

    def _new_name(self, db, region, location, seed):
        names = NAMES[location["namingLocale"]]
        rows = db.execute(self._sql(
            "SELECT name,location_id FROM world_characters WHERE world_id=? AND (region=? OR location_id=?)"),
            (WORLD, region, location["id"])).fetchall()
        used = {row["name"] for row in rows}
        nearby = {row["name"] for row in rows if row["location_id"] == location["id"]}
        given_here = {given for given in names["given"]
                      if any(name.startswith(given + " ") for name in nearby)}
        family_here = {family for family in names["family"]
                       if any(name.endswith(" " + family) for name in nearby)}
        total = len(names["given"]) * len(names["family"])
        start = int(seed[:16], 16) % total
        step = int(seed[16:32], 16) % total or 1
        while math.gcd(step, total) != 1:
            step += 1
        fallback = None
        for offset in range(total):
            index = (start + offset * step) % total
            given = names["given"][index % len(names["given"])]
            family = names["family"][index // len(names["given"])]
            name = given + " " + family
            if name in used:
                continue
            if given not in given_here and family not in family_here:
                return name
            if fallback is None:
                fallback = name
        if fallback is not None:
            return fallback
        raise JourneyCapacity("This region has exhausted its available character names.")

    def _create(self, journey, region, location, request_id):
        if not location["canCreate"]:
            raise JourneyConflict("Character creation is unavailable until this place has a supported naming locale.")
        fingerprint = hashlib.sha256(json.dumps(
            [WORLD, location["id"]], separators=(",", ":")).encode()).hexdigest()
        artifact_clues = self.artifacts.character_knowledge(journey, region, location) if self.artifacts else {}
        schedule_portrait = False
        with self.connect() as db:
            self._begin(db)
            receipt = db.execute(self._sql(
                "SELECT fingerprint,character_id FROM character_creation_requests "
                "WHERE journey=? AND request_id=?"), (journey, request_id)).fetchone()
            if receipt:
                if receipt["fingerprint"] != fingerprint:
                    raise JourneyConflict("This character request id already belongs to another location.")
                row = db.execute(self._sql(
                    "SELECT * FROM world_characters WHERE character_id=?"), (receipt["character_id"],)).fetchone()
                if row is None:
                    raise JourneyConflict("The requested character is no longer available.")
                character_id = row["character_id"]
                result = self._character(
                    row, self._memories(db, journey, row["character_id"]), {**location, "region": region})
                schedule_portrait = row["portrait_status"] == "pending"
            else:
                limit = MAX_TOWN_CHARACTERS if location["kind"] == "town" else MAX_ROADSIDE_CHARACTERS
                rows = db.execute(self._sql(
                    "SELECT slot,role FROM world_characters WHERE world_id=? AND location_id=? ORDER BY slot"),
                    (WORLD, location["id"])).fetchall()
                if len(rows) >= limit:
                    raise JourneyConflict("This place has reached its character limit; choose someone already here.")
                if db.execute(self._sql(
                        "SELECT count(*) FROM world_characters WHERE region=?"), (region,)).fetchone()[0] >= MAX_REGION_CHARACTERS:
                    raise JourneyConflict("This region has reached its character population limit.")
                if db.execute(self._sql(
                        "SELECT count(*) FROM world_characters WHERE world_id=?"), (WORLD,)).fetchone()[0] >= MAX_WORLD_CHARACTERS:
                    raise JourneyConflict("The shared character population limit has been reached.")
                occupied = {row["slot"] for row in rows}
                slot = next(slot for slot in range(limit) if slot not in occupied)
                seed = hashlib.sha256(f"{WORLD}:{region}:{location['id']}:{slot}".encode()).hexdigest()
                character_id = seed[:32]
                name = self._new_name(db, region, location, seed)
                occupied_roles = {row["role"] for row in rows}
                choices = [entry for entry in ROLES if entry[0] not in occupied_roles] or ROLES
                role, trait, need = choices[int(seed[16:24], 16) % len(choices)]
                profile = {"trait": trait, "version": 1,
                           "portraitGender": portrait_gender(location["id"], slot),
                           "quest": character_quest(character_id, role)}
                topics, facts = ROLE_KNOWLEDGE[role]
                knowledge = {
                    "topics": topics, "facts": [{"id": item, "scope": "public"} for item in facts],
                    "parentWitnesses": [],
                    "artifacts": self._artifact_knowledge(character_id, artifact_clues),
                }
                needs = {"description": need, "version": 1}
                pending = bool(self.writer and db.execute(self._sql(
                    "SELECT count(*) FROM world_characters WHERE portrait_status='pending'")).fetchone()[0]
                    < MAX_PENDING_PORTRAITS)
                portrait_status = "pending" if pending else "failed"
                provenance = ({"source": "pending", "reason": "generation-queued", "version": PORTRAIT_VERSION}
                              if pending else {
                                  "source": "not-generated",
                                  "reason": "portrait-provider-not-configured" if not self.writer
                                  else "portrait-queue-full",
                                  "version": PORTRAIT_VERSION,
                              })
                db.execute(self._sql(
                    "INSERT INTO world_characters(character_id,world_id,region,location_id,location_kind,"
                    "location_name,naming_locale,name,role,profile,knowledge,needs,portrait_ref,portrait_status,"
                    "portrait_model,portrait_provenance,portrait_revision,revision,slot,created_at) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,NULL,?,1,1,?,?)"),
                    (character_id, WORLD, region, location["id"], location["kind"], location["name"],
                     location["namingLocale"], name,
                     role, json.dumps(profile), json.dumps(knowledge), json.dumps(needs), portrait_status,
                     json.dumps(provenance), slot, self.clock()))
                db.execute(self._sql(
                    "INSERT INTO character_creation_requests(journey,request_id,fingerprint,character_id,created_at) "
                    "VALUES(?,?,?,?,?)"), (journey, request_id, fingerprint, character_id, self.clock()))
                row = db.execute(self._sql(
                    "SELECT * FROM world_characters WHERE character_id=?"), (character_id,)).fetchone()
                result = self._character(row, position={**location, "region": region})
                schedule_portrait = pending
        if schedule_portrait:
            self._schedule_portrait(character_id)
        if self.quests is not None:
            result["quest"] = self._quest_offer(journey, region, location, result)
        return result

    def _quest_offer(self, journey, region, location, character, *, retry=False):
        if self.quests is None:
            raise JourneyCapacity("Character quests are unavailable.")
        with self.connect() as db:
            db.execute(self._sql("UPDATE world_characters SET profile=? WHERE character_id=?"),
                       (json.dumps(character["profile"]), character["id"]))
        try:
            return self.quests.character_offer(journey, region, location, character, retry=retry)
        except JourneyCapacity as error:
            logging.warning("Character quest preparation deferred: %s", error)
            return {"status": "busy", "retryAfter": 2, "error": str(error)}

    def _resume_portraits(self):
        with self.connect() as db:
            rows = db.execute(self._sql(
                "SELECT character_id FROM world_characters WHERE portrait_status IN ('pending','failed') "
                "ORDER BY created_at,character_id LIMIT ?"), (MAX_WORLD_CHARACTERS,)).fetchall()
        for row in rows:
            self._reconcile_portrait(row["character_id"], schedule=True)

    def _reconcile_portrait(self, character_id, *, schedule=False, failed=False):
        request = portrait_request(character_id)
        should_schedule = False
        with self.connect() as db:
            self._begin(db)
            row = db.execute(self._sql(
                "SELECT portrait_status,portrait_provenance,created_at "
                "FROM world_characters WHERE character_id=?"),
                (character_id,)).fetchone()
            if row is None or row["portrait_status"] == "ready":
                return
            if row["portrait_status"] == "failed" and json.loads(row["portrait_provenance"]).get(
                    "reason") not in {"generation-failed", "dispatch-uncertain",
                                      "worker-lease-expired", "pending-expired"}:
                return
            lock = " FOR UPDATE" if self.assets.catalogue.postgres else ""
            now_sql = database_clock(self.assets.catalogue)
            job = db.execute(self._sql(
                "SELECT status,expires FROM worker_jobs "
                "WHERE kind=? AND request=?" + lock),
                ("image-character-portrait", request)).fetchone()
            now = float(db.execute("SELECT " + now_sql).fetchone()[0])
            published = db.execute(self._sql(
                "SELECT payload FROM asset_catalogue WHERE scope=? AND request=?"),
                ("character-portrait", request)).fetchone()
            if published:
                record = AssetRecord(**json.loads(published["payload"]))
                self.assets._verify(record, self.assets.blobs.get(record.key))
                provenance = record.provenance
                db.execute(self._sql(
                    "UPDATE world_characters SET portrait_ref=?,portrait_status='ready',portrait_model=?,"
                    "portrait_provenance=? WHERE character_id=?"),
                    (request, provenance.get("source"), json.dumps(provenance), character_id))
                if job:
                    db.execute(self._sql(
                        "UPDATE worker_jobs SET status='ready',error=NULL WHERE kind=? AND request=?"),
                        ("image-character-portrait", request))
                return
            if (job and job["status"] in {"leased", "dispatched"}
                    and job["expires"] is not None and job["expires"] > now):
                return
            if row["portrait_status"] == "failed":
                return
            expired = now >= row["created_at"] + PORTRAIT_PENDING_SECONDS
            if job and job["status"] in {"leased", "dispatched"}:
                status = "uncertain" if job["status"] == "dispatched" else "failed"
                db.execute(self._sql(
                    "UPDATE worker_jobs SET status=?,error='Portrait lease expired; no automatic retry' "
                    "WHERE kind=? AND request=?"),
                    (status, "image-character-portrait", request))
                reason = "dispatch-uncertain" if status == "uncertain" else "worker-lease-expired"
            elif job and job["status"] in {"failed", "uncertain", "ready"}:
                reason = "dispatch-uncertain" if job["status"] == "uncertain" else "generation-failed"
            elif failed or expired or not self.writer:
                reason = ("generation-failed" if failed else "pending-expired" if expired
                          else "portrait-provider-not-configured")
                if job and job["status"] == "queued":
                    db.execute(self._sql(
                        "UPDATE worker_jobs SET status='failed',error=? WHERE kind=? AND request=?"),
                        (reason, "image-character-portrait", request))
            else:
                should_schedule = schedule
                reason = None
            if reason:
                db.execute(self._sql(
                    "UPDATE world_characters SET portrait_status='failed',portrait_ref=NULL,"
                    "portrait_model=NULL,portrait_provenance=? WHERE character_id=? AND portrait_status='pending'"),
                    (json.dumps({"source": "not-generated", "reason": reason,
                                 "version": PORTRAIT_VERSION}), character_id))
        if should_schedule:
            self._schedule_portrait(character_id)

    def _schedule_portrait(self, character_id):
        if not self.portrait_pool:
            return
        with self.portrait_lock:
            if character_id in self.portrait_tasks or len(self.portrait_tasks) >= MAX_PENDING_PORTRAITS:
                return
            self.portrait_tasks.add(character_id)
        try:
            future = self.portrait_pool.submit(self._generate_portrait, character_id)
        except RuntimeError:
            self._portrait_finished(character_id)
            return
        future.add_done_callback(lambda _: self._portrait_finished(character_id))

    def _portrait_finished(self, character_id):
        with self.portrait_lock:
            self.portrait_tasks.discard(character_id)

    def _generate_portrait(self, character_id):
        request = portrait_request(character_id)
        images = SharedImages(self.assets)
        try:
            with self.connect() as db:
                self._begin(db)
                row = db.execute(self._sql(
                    "SELECT role,profile,portrait_status FROM world_characters WHERE character_id=?"),
                    (character_id,)).fetchone()
                if row is None or row["portrait_status"] != "pending":
                    return
                brief = portrait_prompt(row["role"], json.loads(row["profile"]).get("portraitGender"))
                images.jobs.enqueue("image-character-portrait", request,
                                    {"brief": brief, "model": IMAGE_MODEL, "version": PORTRAIT_VERSION},
                                    provider="images", connection=db.db)
            images.generate(
                "character-portrait", request, brief, self.writer,
                version=PORTRAIT_VERSION)
            record = self.assets.catalogue.find("character-portrait", request)
            if record is None:
                raise RuntimeError("Portrait was not durably published.")
            provenance = record[1].provenance
            with self.connect() as db:
                db.execute(self._sql(
                    "UPDATE world_characters SET portrait_ref=?,portrait_status='ready',portrait_model=?,"
                    "portrait_provenance=? WHERE character_id=? AND portrait_status='pending'"),
                    (request, provenance.get("source"), json.dumps(provenance), character_id))
        except Exception as error:
            logging.warning("Character portrait %s failed without blocking dialogue: %s",
                            character_id, str(error)[:300])
            self._reconcile_portrait(character_id, failed=True)

    def _portrait_image(self, location, character_id):
        if not self.assets:
            raise JourneyConflict("Portrait storage is unavailable.")
        with self.connect() as db:
            row = db.execute(self._sql(
                "SELECT portrait_ref,portrait_status FROM world_characters "
                "WHERE character_id=? AND world_id=? AND location_id=?"),
                (character_id, WORLD, location["id"])).fetchone()
        if row is None:
            raise JourneyConflict("That character is not available at this location.")
        if (row["portrait_status"] != "ready" or not isinstance(row["portrait_ref"], str)
                or not re.fullmatch(r"[a-f0-9]{64}", row["portrait_ref"])):
            raise JourneyConflict("This character portrait is not ready.")
        return self.assets.read("character-portrait", row["portrait_ref"])[1]

    def close(self):
        if self.portrait_pool:
            self.portrait_pool.shutdown(wait=True)

    def _record(self, journey, region, location, request_id, character_id, event_type, topic=None):
        with self.connect() as db:
            self._begin(db)
            row = db.execute(self._sql(
                "SELECT * FROM world_characters WHERE character_id=? AND world_id=? AND location_id=?"),
                (character_id, WORLD, location["id"])).fetchone()
            if row is None:
                raise JourneyConflict("That character is not available at this location.")
            encounter = db.execute(self._sql(
                "SELECT character_id FROM character_encounter_events WHERE journey=? AND event_id=?"),
                (journey, request_id)).fetchone()
            if encounter is not None and encounter["character_id"] != character_id:
                raise JourneyConflict("This encounter event id belongs to another character.")
            memory = db.execute(self._sql(
                "SELECT character_id,event_type,topic FROM character_private_memories "
                "WHERE journey=? AND event_id=?"), (journey, request_id)).fetchone()
            if memory is not None and (
                    memory["character_id"], memory["event_type"], memory["topic"]
            ) != (character_id, event_type, topic):
                raise JourneyConflict("This memory event id already belongs to another exchange.")
            if encounter is None:
                now = self._encounter_clock(db)
                db.execute(self._sql(
                    "INSERT INTO character_encounter_events(journey,event_id,character_id,seen_at) "
                    "VALUES(?,?,?,?)"), (journey, request_id, character_id, now))
                db.execute(self._sql(
                    "INSERT INTO character_encounters(character_id,journey,first_seen,last_seen,meeting_count) "
                    "VALUES(?,?,?,?,1) ON CONFLICT(character_id,journey) DO UPDATE SET "
                    "last_seen=CASE WHEN excluded.last_seen>character_encounters.last_seen "
                    "THEN excluded.last_seen ELSE character_encounters.last_seen END,"
                    "meeting_count=character_encounters.meeting_count+1"),
                    (character_id, journey, now, now))
            if memory is None:
                count = db.execute(self._sql(
                    "SELECT count(*) FROM character_private_memories WHERE journey=?"), (journey,)).fetchone()[0]
                if count < MAX_PRIVATE_MEMORIES_PER_JOURNEY:
                    db.execute(self._sql(
                        "INSERT INTO character_private_memories(journey,character_id,event_id,event_type,topic,created_at) "
                        "VALUES(?,?,?,?,?,?)"), (journey, character_id, request_id, event_type, topic,
                                                 self._encounter_clock(db)))
            return {"recorded": True, "type": event_type, "characterId": character_id,
                    "familiarity": self._familiarity(db, journey, character_id),
                    "artifactRumour": self._spontaneous_rumour(
                        json.loads(row["knowledge"]), character_id, journey, request_id)}

    def _exchange(self, journey, location, request_id, character_id, topic):
        with self.connect() as db:
            self._begin(db)
            row = db.execute(self._sql(
                "SELECT * FROM world_characters WHERE character_id=? AND world_id=? AND location_id=?"),
                (character_id, WORLD, location["id"])).fetchone()
            if row is None:
                raise JourneyConflict("That character is not available at this location.")
            met = db.execute(self._sql(
                "SELECT 1 FROM character_encounters WHERE journey=? AND character_id=?"),
                (journey, character_id)).fetchone()
            if met is None:
                raise JourneyConflict("Meet this character before beginning a conversation.")
            knowledge = json.loads(row["knowledge"])
            allowed = set(knowledge.get("topics", ()))
            facts = sorted({
                item.get("id") for item in knowledge.get("facts", ())
                if isinstance(item, dict) and item.get("scope") == "public"
                and item.get("id") in FACT_TEXT and topic in FACT_TOPICS[item["id"]]
            }) if topic in allowed else []
            existing = db.execute(self._sql(
                "SELECT character_id,event_type,topic FROM character_private_memories "
                "WHERE journey=? AND event_id=?"), (journey, request_id)).fetchone()
            if db.execute(self._sql(
                    "SELECT 1 FROM character_encounter_events WHERE journey=? AND event_id=?"),
                    (journey, request_id)).fetchone():
                raise JourneyConflict("This event id already belongs to a meeting.")
            if existing is not None:
                if (existing["character_id"], existing["event_type"], existing["topic"]) != (
                        character_id, "exchanged", topic):
                    raise JourneyConflict("This memory event id already belongs to another exchange.")
                recorded = db.execute(self._sql(
                    "SELECT fact_ids,fact_version FROM character_private_exchanges "
                    "WHERE journey=? AND event_id=?"), (journey, request_id)).fetchone()
                if recorded is None:
                    raise JourneyConflict("The original exchange record is incomplete or inconsistent.")
                facts = json.loads(recorded["fact_ids"])
                fact_version = recorded["fact_version"]
                if not isinstance(facts, list) or type(fact_version) is not int or fact_version < 1:
                    raise JourneyConflict("The original exchange record is incomplete or inconsistent.")
            else:
                count = db.execute(self._sql(
                    "SELECT count(*) FROM character_private_memories WHERE journey=?"),
                    (journey,)).fetchone()[0]
                if count >= MAX_PRIVATE_MEMORIES_PER_JOURNEY:
                    raise JourneyConflict("This journey has reached its character-memory limit.")
                now = self.clock()
                db.execute(self._sql(
                    "INSERT INTO character_private_memories(journey,character_id,event_id,event_type,topic,created_at) "
                    "VALUES(?,?,?,'exchanged',?,?)"), (journey, character_id, request_id, topic, now))
                db.execute(self._sql(
                    "INSERT INTO character_private_exchanges(journey,event_id,character_id,topic,fact_ids,"
                    "fact_version,created_at) VALUES(?,?,?,?,?,?,?)"),
                    (journey, request_id, character_id, topic, json.dumps(facts), FACT_VERSION, now))
                fact_version = FACT_VERSION
            seed = int(hashlib.sha256(f"{character_id}:{journey}:{topic}".encode()).hexdigest()[:8], 16)
            mention = self._visitor_mention(db, journey, character_id, seed)
        return {"recorded": True, "type": "exchanged", "characterId": character_id,
                "topic": topic, "factIds": facts, "factVersion": fact_version, "visitorFacts": mention,
                "artifactRumour": self._spontaneous_rumour(knowledge, character_id, journey, request_id)}

    @staticmethod
    def _contract_status(event):
        return {
            "offered": ("offered", "offered"),
            "accepted": ("active", "accepted"),
            "declined": ("declined", "declined"),
            "advanced": ("active", "advanced"),
            "completed": ("completed", "completed"),
            "abandoned": ("abandoned", "abandoned"),
        }[event]

    def _contract(self, data, token):
        journey, genesis, _, _ = self._authorized_journey(data, token)
        self._backfill_encounters(journey, genesis)
        contract = data["contract"]
        if not isinstance(contract, dict) or set(contract) != {"id", "event", "step", "totalSteps"}:
            raise JourneyRequest("Invalid character quest contract fields.")
        position = data.get("location")
        if (not isinstance(position, dict) or set(position) != {"col", "row"}
                or any(type(position[key]) is not int or not -8000 <= position[key] <= 8007
                       for key in ("col", "row"))):
            raise JourneyRequest("A current map position is required.")
        character_id, contract_id, event = data["characterId"], contract.get("id"), contract.get("event")
        step, total = contract.get("step"), contract.get("totalSteps")
        if (not isinstance(character_id, str) or not CHARACTER_ID.fullmatch(character_id)
                or not isinstance(contract_id, str) or not CONTRACT_ID.fullmatch(contract_id)
                or not isinstance(event, str) or event not in CONTRACT_EVENTS
                or type(step) is not int or type(total) is not int
                or not 1 <= total <= 3 or not 0 <= step <= total):
            raise JourneyRequest("Invalid character quest contract.")
        request_id = data["requestId"]
        if event == "offered":
            _, _, _, location = self._authorized_location(data, token)
            with self.connect() as db:
                row = db.execute(self._sql(
                    "SELECT 1 FROM world_characters WHERE character_id=? AND world_id=? AND location_id=?"),
                    (character_id, WORLD, location["id"])).fetchone()
                met = db.execute(self._sql(
                    "SELECT 1 FROM character_encounters WHERE journey=? AND character_id=?"),
                    (journey, character_id)).fetchone()
            if row is None:
                raise JourneyConflict("This character cannot offer a quest away from their location.")
            if met is None:
                raise JourneyConflict("A character quest cannot be attributed before the characters meet.")

        status, outcome = self._contract_status(event)
        event_type = f"quest_{event}"
        with self.connect() as db:
            self._begin(db)
            character = db.execute(self._sql(
                "SELECT 1 FROM world_characters WHERE character_id=? AND world_id=?"),
                (character_id, WORLD)).fetchone()
            if character is None:
                raise JourneyConflict("That character is no longer available.")
            if db.execute(self._sql(
                    "SELECT 1 FROM character_encounter_events WHERE journey=? AND event_id=?"),
                    (journey, request_id)).fetchone():
                raise JourneyConflict("This event id already belongs to a meeting.")
            repeated = db.execute(self._sql(
                "SELECT character_id,contract_id,event,step,total_steps FROM character_quest_events "
                "WHERE journey=? AND event_id=?"), (journey, request_id)).fetchone()
            if repeated is not None:
                if (repeated["character_id"], repeated["contract_id"], repeated["event"],
                        repeated["step"], repeated["total_steps"]) != (
                        character_id, contract_id, event, step, total):
                    raise JourneyConflict("This event id already belongs to a different quest contract change.")
                return {"recorded": True, "status": status, "step": step, "contractId": contract_id}
            same_transition = db.execute(self._sql(
                "SELECT character_id,total_steps FROM character_quest_events "
                "WHERE journey=? AND contract_id=? AND event=? AND step=?"),
                (journey, contract_id, event, step)).fetchone()
            if same_transition is not None:
                if (same_transition["character_id"], same_transition["total_steps"]) != (character_id, total):
                    raise JourneyConflict("This quest transition belongs to a different contract.")
                return {"recorded": True, "status": status, "step": step, "contractId": contract_id}
            current = db.execute(self._sql(
                "SELECT character_id,status,step,total_steps FROM character_quest_contracts "
                "WHERE journey=? AND contract_id=?"), (journey, contract_id)).fetchone()
            if current is None:
                if event != "offered" or step != 0:
                    raise JourneyConflict("A character quest must be offered before it can change.")
                count = db.execute(self._sql(
                    "SELECT count(*) FROM character_private_memories WHERE journey=?"),
                    (journey,)).fetchone()[0]
                if count >= MAX_PRIVATE_MEMORIES_PER_JOURNEY:
                    raise JourneyConflict("This journey has reached its character-memory limit.")
                db.execute(self._sql(
                    "INSERT INTO character_quest_contracts(journey,character_id,contract_id,status,step,"
                    "total_steps,outcome,updated_at) VALUES(?,?,?,'offered',0,?,NULL,?)"),
                    (journey, character_id, contract_id, total, self.clock()))
            else:
                if current["character_id"] != character_id or current["total_steps"] != total:
                    raise JourneyConflict("This quest id belongs to another character or contract.")
                prior_status, prior_step = current["status"], current["step"]
                valid = (
                    event == "accepted" and prior_status == "offered" and step == 0
                    or event == "declined" and prior_status == "offered" and step == 0
                    or event == "advanced" and prior_status == "active" and step == prior_step + 1
                    and step < total
                    or event == "completed" and prior_status == "active" and step == total
                    and step == prior_step + 1
                    or event == "abandoned" and prior_status == "active" and step == prior_step
                )
                if not valid:
                    raise JourneyConflict("This character quest cannot make that state transition.")
                db.execute(self._sql(
                    "UPDATE character_quest_contracts SET status=?,step=?,outcome=?,updated_at=? "
                    "WHERE journey=? AND contract_id=?"),
                    (status, step, outcome if status in {"completed", "declined", "abandoned"} else None,
                     self.clock(), journey, contract_id))
            memory_count = db.execute(self._sql(
                "SELECT count(*) FROM character_private_memories WHERE journey=?"),
                (journey,)).fetchone()[0]
            if memory_count >= MAX_PRIVATE_MEMORIES_PER_JOURNEY:
                raise JourneyConflict("This journey has reached its character-memory limit.")
            now = self.clock()
            db.execute(self._sql(
                "INSERT INTO character_quest_events(journey,event_id,character_id,contract_id,event,step,"
                "total_steps,created_at) VALUES(?,?,?,?,?,?,?,?)"),
                (journey, request_id, character_id, contract_id, event, step, total, now))
            db.execute(self._sql(
                "INSERT INTO character_private_memories(journey,character_id,event_id,event_type,topic,created_at) "
                "VALUES(?,?,?,?,?,?)"),
                (journey, character_id, request_id, event_type, contract_id, now))
        return {"recorded": True, "status": status, "step": step, "contractId": contract_id}

    def request(self, data, token):
        if not isinstance(data, dict) or data.get("action") not in {
                "list", "create", "meet", "exchange", "contract", "portrait", "visitors", "quest"}:
            raise JourneyRequest("Invalid character registry request.")
        action = data["action"]
        expected = {"action", "journey", "location"}
        if action == "create":
            expected |= {"requestId"}
        elif action == "list" and "presence" in data:
            expected.add("presence")
        elif action in {"meet", "exchange", "portrait", "visitors", "quest"}:
            expected |= {"characterId"}
            if action == "quest":
                expected.add("retry")
            if action == "visitors":
                expected |= {"cursor", "limit"}
            if action in {"meet", "exchange"}:
                expected.add("requestId")
            if action == "exchange":
                expected.add("topic")
        elif action == "contract":
            expected |= {"requestId", "characterId"}
            expected.add("contract")
        if set(data) != expected:
            raise JourneyRequest("Invalid character registry request fields.")
        if action == "contract":
            if not isinstance(data["requestId"], str) or not REQUEST_ID.fullmatch(data["requestId"]):
                raise JourneyRequest("Invalid character request id.")
            return self._contract(data, token)
        journey, genesis, region, location = self._authorized_location(data, token)
        self._backfill_encounters(journey, genesis)
        if action == "list":
            if "presence" in data:
                return self._encounter(journey, region, location, data["presence"])
            return self._list(journey, region, location)
        if action in {"portrait", "visitors", "quest"}:
            character_id = data["characterId"]
            if not isinstance(character_id, str) or not CHARACTER_ID.fullmatch(character_id):
                raise JourneyRequest("Invalid character identity.")
            if action == "portrait":
                return self._portrait_image(location, character_id)
            if action == "quest":
                if type(data["retry"]) is not bool:
                    raise JourneyRequest("Invalid character quest retry.")
                with self.connect() as db:
                    row = db.execute(self._sql(
                        "SELECT * FROM world_characters WHERE character_id=? AND world_id=? AND location_id=?"),
                        (character_id, WORLD, location["id"])).fetchone()
                    if row is None:
                        raise JourneyConflict("That character is not available at this location.")
                    if not self._familiarity(db, journey, character_id)["known"]:
                        raise JourneyConflict("Meet this character before hearing their request.")
                    character = self._character(row)
                return self._quest_offer(journey, region, location, character, retry=data["retry"])
            return self._visitor_page(journey, location, character_id, data["cursor"], data["limit"])
        if not isinstance(data["requestId"], str) or not REQUEST_ID.fullmatch(data["requestId"]):
            raise JourneyRequest("Invalid character request id.")
        if action == "create":
            return self._create(journey, region, location, data["requestId"])
        character_id = data["characterId"]
        if not isinstance(character_id, str) or not CHARACTER_ID.fullmatch(character_id):
            raise JourneyRequest("Invalid character identity.")
        if action == "meet":
            self._ensure_artifact_knowledge(journey, region, location, character_id)
            return self._record(journey, region, location, data["requestId"],
                                character_id, "met")
        topic = data["topic"]
        if not isinstance(topic, str) or topic not in TOPICS:
            raise JourneyRequest("Unknown character conversation topic.")
        self._ensure_artifact_knowledge(journey, region, location, character_id)
        return self._exchange(journey, location, data["requestId"], character_id, topic)
