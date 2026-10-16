# Les Arcanes du Chemin

Prototype de la **couche 1 — Carte** : un extrait OSM local est rasterise en grille de cases de 250 m puis affiche en ASCII dans le navigateur. Cette version est volontairement fixe ; le deplacement commence a la couche 2.

Les ajouts au document de conception sont suivis dans [REQUIREMENTS.md](./REQUIREMENTS.md).

## Lancer le prototype

Depuis la racine du projet :

```sh
python3 scripts/prepare_regions.py
python3 -m http.server 8000
```

Ouvrir [http://localhost:8000](http://localhost:8000). Le serveur statique est necessaire pour charger le JSON de la carte. La grille ASCII utilise uniquement les fichiers locaux ; la vue OpenStreetMap de comparaison requiert une connexion Internet.

Le selecteur de region affiche de vrais extraits OSM de Paris, des Alpes pres de Chamonix et de Firmi en Aveyron. Les snapshots compresses dans [data/regions/](./data/regions/) et leurs grilles generees sont inclus : aucun telechargement n'est necessaire pour jouer ou tester.

### Comparaison avec OpenStreetMap

Le fond de carte OpenStreetMap est affiche a cote de la grille ASCII (en dessous sur petit ecran) et change avec la region. Les extraits de Firmi, Paris et Chamonix sont prepares automatiquement pour couvrir une vue standard de 518 x 360 pixels. Le cadrage de reference initial est conserve pour eviter qu'un nouvel ajustement fasse encore reculer le zoom. Un lien permet aussi de l'ouvrir separement si la vue integree ne se charge pas. Les titres et indications suivent la langue choisie.

Le deplacement, le zoom ou le redimensionnement du fond de carte ne lance pas automatiquement un nouveau telechargement. Le snapshot contient une couverture conservative preparee pour cette vue standard, pas une couverture illimitee de toute vue ulterieure.

Cette vue utilise le service officiel d'integration OpenStreetMap et ses tuiles en ligne ; elle n'est pas ajoutee au cache regional et peut montrer des mises a jour posterieures au snapshot. Le navigateur contacte OpenStreetMap pour cette comparaison. Les cellules ASCII de 250 m representent un type prioritaire, pas un pourcentage de couverture : un ruisseau traversant une cellule peut donc la faire apparaitre entierement comme de l'eau. Le comparateur ne change pas encore cette regle de rasterisation.

## Generer une carte depuis OSM

La commande commune prepare toutes les regions definies dans [data/regions.json](./data/regions.json) :

```sh
python3 scripts/prepare_regions.py
python3 scripts/prepare_regions.py --region paris --region alps
python3 scripts/prepare_regions.py --region firmi --width 800 --height 500
```

Les limites sont calculees en Web Mercator, avec un zoom entier arrondi vers le bas et une marge tenant compte de l'initialisation de la carte integree a 400 x 300 pixels. Le calcul couvre ensuite les dimensions demandees et arrondit les limites vers l'exterieur. Ce n'est pas une synchronisation exacte pixel par pixel avec le service OSM.

Le pipeline telecharge les vraies donnees OSM, subdivise les requetes refusees pour depassement du nombre de noeuds, fusionne les elements par ID puis genere les grilles avec noms et POI. Il reutilise les snapshots et grilles inchanges : une seconde execution ne contacte pas OSM et ne rasterise pas a nouveau. `--refresh` renouvelle les snapshots ; `--force` reconstruit les grilles. Les extraits inclus produisent actuellement Firmi 29 x 20, Paris 14 x 10 et Chamonix 28 x 20 cases.

La configuration centralise les cadrages, noms et chemins du pipeline. Ajouter une nouvelle region au selecteur du navigateur demande encore une entree cote interface.

Le pipeline utilise uniquement la bibliotheque standard Python et accepte un fichier OSM XML ou `.osm.gz` :

```sh
python3 scripts/build_map.py --input /chemin/vers/region.osm --output public/map.json --name "Ma region"
```

Les limites `<bounds>` du fichier fixent l'etendue de la grille ; en leur absence, elles sont calculees depuis les noeuds. La taille des cases peut etre modifiee avec `--cell-size` (en metres). Le rasteriseur reconnait l'eau, les routes, les voies ferrees, les montagnes, les batiments, les forets, les prairies, les vignes, les parcs, les lieux de culte, les gares et les localites. Les objets cartographiques sont combines avec une priorite stable afin que les grandes zones de terrain ne masquent pas les routes, batiments et points remarquables.

Les voies ferrees (`=`) proviennent des tags `railway=rail|light_rail|narrow_gauge|tram|subway` ; les voies abandonnees ou demantelees ne sont pas affichees. Les montagnes (`^`) proviennent des sommets (`natural=peak`), cretes (`ridge`, `arete`), roches nues (`bare_rock`), eboulis (`scree`) et glaciers (`glacier`). Ce sont des objets OSM explicites, pas un modele d'altitude : le relief complet necessitera des donnees d'elevation. Les routes et rails restent visibles sur le relief ; les gares ont priorite sur les rails.

Les champs verts (`:`) proviennent de `landuse=farmland`, distincts des prairies et des vignes. Aucun champ n'est invente si les donnees OSM n'en signalent pas.

Les telepheriques et remontees cablees OSM sont representes par `-` et leurs stations par `T`, distincts des rails (`=`) et gares ferroviaires (`≡`). Un simple tag `public_transport=station` ne suffit pas pour afficher une gare : il faut une indication ferroviaire explicite. Dans l'extrait alpin, le marqueur de l'Aiguille du Midi correspond a une station de telepherique, pas a une gare isolee.

Les collines utilisent `n` : ce sont les points `natural=hill` et, par convention de rendu, les sommets `natural=peak` avec une elevation OSM inferieure a 600 m. Sans elevation exploitable, un sommet reste `^` ; cette convention ne remplace pas une analyse du relief. Le snapshot de Firmi inclut le sommet du Puy de Wolf, indique a 479 m par OSM.

### Informations au survol

Survoler une case affiche son terrain, sa ligne/colonne (a partir de 1), les coordonnees du centre de sa portion dans l'extrait et la taille nominale des cases. Les noms OSM des localites, gares et points remarquables sont conserves si leur symbole est affiche dans cette case. Les POI OSM (services, commerces, tourisme, patrimoine, gares, stations de telepherique et sommets) sont listes independamment du symbole de terrain, meme quand leur batiment est masque. Les POI ponctuels utilisent leurs coordonnees ; les commerces et autres POI portes par un chemin utilisent le centre de sa boite englobante comme position representative. Les relations de POI ne sont pas encore prises en charge. Les IDs OSM, noms et categories sont mis en cache dans la grille, sans appel reseau au survol.

L'infobulle et le panneau sous la grille montrent les memes informations ; le panneau conserve la derniere case inspectee. Le focus clavier (Tab) et le toucher/clic permettent aussi l'inspection. Un changement de region efface l'inspection, et un changement de langue traduit ses libelles sans traduire les noms propres.

Ces informations utilisent les donnees locales ; elles ne sont pas les descriptions web encore prevues par R-006.

`data/region.osm` est une fixture illustrative au format OSM XML, pas un releve geographique reel. Remplacez-la par un extrait regional OSM avant de vous fier aux lieux affiches. Pour toute redistribution de donnees reelles, respectez la licence ODbL et affichez l'attribution OpenStreetMap appropriee.

Cette ancienne fixture sert uniquement aux tests de symboles ; elle n'est plus la carte par defaut. Les tests regionaux utilisent les vrais snapshots, sans inventer de champs ou de rails la ou l'extrait OSM n'en contient pas. Le pipeline lit les noeuds, chemins et relations multipolygones de couverture du sol. Il assemble les contours, meme inverses, et respecte les trous interieurs. Les relations incompletes dans l'extrait sont signalees et ignorees ; un modele d'elevation complet reste a prendre en charge.

### Hierarchie de la carte de voyage

A partir de 250 m par case, les batiments individuels et petites routes (rues, chemins, pistes et routes tertiaires) ne sont ni dessines ni proposes dans la legende. Ils redeviennent visibles sous ce seuil (par exemple a 50 m par case). Les localites restent representees par `○`, sans confondre leurs marqueurs avec les empreintes de batiments. Cette simplification laisse visibles les forets et prairies cartographiees, y compris celles decrites par des multipolygones OSM.

Les grands axes OSM (`motorway`, `trunk`, `primary`, `secondary` et leurs bretelles) utilisent un `+` dore distinct des petites routes (`·`). Ils restent visibles au-dessus des cellules d'eau et des rails qui les intersectent ; les gares et localites restent prioritaires. La D 840 de Firmi est testee a partir des coordonnees de ses vrais noeuds OSM.

Le test du grand extrait de Firmi exige au moins 35 % de cellules vertes (forets, prairies, champs ou parcs) a 250 m, sans petites routes ni batiments, et davantage de cellules vertes que de grands axes. Le seuil a ete ajuste a l'etendue agrandie : des relations de couverture du sol sont encore incompletes aux limites.

Cette priorite est une convention d'affichage a un seul symbole par cellule, pas une inference de pont ni de praticabilite. Une cellule partagee entre route et eau affiche donc la route ; sur un petit extrait urbain tres dense, l'eau peut n'etre visible qu'a une resolution plus fine. La couverture surfacique de l'eau n'est pas encore calculee.

### Telecharger et mettre en cache de vraies regions

```sh
python3 scripts/prepare_regions.py --refresh
```

Les limites sont dans l'ordre ouest, sud, est, nord. L'API officielle OSM fournit un petit extrait XML ; le script conserve les IDs, coordonnees, tags, references et informations de licence, sans les metadonnees de comptes contributeurs inutiles au rendu. La source et la date du telechargement sont enregistrees dans chaque snapshot.

Si l'API refuse un rectangle parce qu'il contient plus de 50 000 noeuds, le script le subdivise (jusqu'a quatre niveaux), puis fusionne les elements par type et ID OSM, en conservant la version la plus recente en cas de doublon. Les URLs des sous-extraits sont conservees dans les metadonnees. Les autres erreurs HTTP sont remontees sans etre masquees par une subdivision.

Les snapshots et cartes derivees sont des donnees [© les contributeurs OpenStreetMap](https://www.openstreetmap.org/copyright), distribuees sous [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Cette licence concerne les donnees OSM et leurs derives, pas une licence du code du projet.

Un snapshot correspondant est reutilise sans appel reseau ; `--refresh` force son telechargement. Une grille deja generee est reutilisee sans rasterisation si les empreintes SHA-256 de la source et du pipeline, la version du cache, le nom et la taille des cases n'ont pas change. `--force` force la regeneration. L'integrite du contenu est verifiee avant reutilisation et les fichiers sont remplaces atomiquement.

La synchronisation avec le futur serveur est suivie dans [REQUIREMENTS.md](./REQUIREMENTS.md#r-004--cache-generated-regions-and-synchronize-them-with-the-future-server). Elle n'est pas encore implementee ; le cache conserve les versions et empreintes necessaires a la comparaison des contenus.

Les descriptions courtes de chaque case provenant du web et les photos doivent aussi etre mises en cache, avec leurs sources et licences. Ces exigences sont suivies dans [REQUIREMENTS.md](./REQUIREMENTS.md#r-006--web-sourced-cell-descriptions-and-cached-cell-content) ; leur acquisition et leur cache ne sont pas encore implementes.

## Traductions

Le selecteur de langue permet de basculer entre francais et anglais sans recharger la carte. La langue initiale suit les preferences du navigateur parmi les langues disponibles, avec le francais par defaut. Le choix manuel s'applique a la page courante ; il n'est pas memorise.

Les textes d'interface, titres, attributs d'accessibilite, erreurs et noms de terrain sont centralises dans [i18n.mjs](./i18n.mjs). Pour ajouter une langue, ajouter un catalogue avec les memes cles et parametres, puis son option dans [index.html](./index.html). Les noms geographiques du fichier source ne sont pas traduits. Les labels historiques du JSON ne sont pas utilises par l'interface : celle-ci traduit les identifiants de terrain.

## Verifier

```sh
python3 scripts/prepare_regions.py
python3 -m unittest discover -s tests
node --test tests/*.test.mjs
```

Node.js est uniquement necessaire pour les tests de traduction, pas pour lancer le prototype.

Les tests regionaux couvrent les vrais snapshots de Paris, Chamonix et Firmi a 250 m et 50 m par case : provenance, licence, dimensions, presence des terrains attendus, glyphes, determinisme et reutilisation hors ligne. Les tests unitaires separes couvrent notamment les champs, les priorites de rendu, les limites geographiques, l'invalidation et la corruption du cache.
