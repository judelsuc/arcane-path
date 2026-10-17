# Les Arcanes du Chemin

Prototype jouable des **couches 1 a 8** : carte OSM, voyage, temps, besoins,
localites, economie, musique de rue et piste minimale du parent.
grille ASCII de 250 m, exploration a pied, horloge simulee, effort et streaming.

Les ajouts au document de conception sont suivis dans [doc/REQUIREMENTS.md](./doc/REQUIREMENTS.md).
Les prompts musicaux 8-bit et sons de jeu sont dans [audio-prompts](./audio-prompts/README.md).

## Lancer le prototype

Depuis la racine du projet :

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 scripts/prepare_regions.py
python3 scripts/travel_server.py
```

Ouvrir [http://127.0.0.1:8766](http://127.0.0.1:8766). Le serveur local utilise
la bibliotheque standard Python et PyYAML pour la configuration, et ecoute sur la boucle locale.
`--port` permet de choisir un autre port. Le parcours titre, preparation,
voyage necessite ce serveur : un serveur purement statique ne fournit ni
la recherche de lieux ni le streaming de voyage, et affiche une erreur explicite.

Le selecteur de region affiche de vrais extraits OSM de Paris, des Alpes pres
de Chamonix, de Firmi en Aveyron et de Tahiti autour de Papeete.
Tahiti permet aussi de tester latitude sud et longitude ouest avec le cadran
solaire et les moyennes saisonnieres. Les snapshots compresses dans
[data/regions/](./data/regions/) et leurs grilles sont inclus. La consultation
fixe et les tests sont hors ligne ; le premier voyage telecharge les altitudes
et les morceaux de carte situes hors des extraits inclus.

## Depart, localisation et options

L'ecran titre ouvre une **preparation du voyage distincte de la carte**.
Choisir une region, rechercher un lieu ou demander la position ne demarre
pas de partie et ne remplace aucune sauvegarde. **Commencer le voyage** et
**Reprendre la sauvegarde** sont regroupes ici ; revenir a la preparation
depuis le jeu conserve le progres sauvegarde.
Un **nom de personnage** est requis pour un nouveau voyage (1 a 40 caracteres).
Accents et autres alphabets sont acceptes ; espaces superflus et Unicode sont
normalises. Le nom apparait au tirage initial et dans le panneau du personnage,
et reste dans la sauvegarde locale. Reprendre une ancienne partie sans nom
reste possible, sans changer son tarot, ses caracteristiques ni sa progression.

- **Rechercher** (Alt + Maj + G) : saisir un nom, eventuellement avec le pays,
  puis choisir le bon resultat. Aucune recherche automatique pendant la frappe.
- **Utiliser ma position actuelle** (Alt + Maj + V) demande une seule position
  au navigateur, avec permission ; pas de suivi continu. Une position de moins
  d'une minute peut etre reutilisee. Apres 20 s sans position, un nouvel essai
  haute precision dispose de 60 s ; **Annuler la recherche** (Alt + Maj + Z)
  permet de revenir tout de suite a la saisie d'un lieu. La precision depend
  du navigateur/appareil. Refus, delai et indisponibilite sont distingues.
  Une permission accordee ne garantit pas un fournisseur de position utilisable :
  si le navigateur integre de VS Code expire, ouvrir la meme adresse dans
  Safari/Chrome et verifier les services de localisation du systeme.
- Le serveur prepare une carte OSM de 24 x 24 cases a 250 m. La case initiale
  est centree sur les coordonnees demandees (arrondies a six decimales),
  sans deplacement automatique vers un village ou une route.
- La nouvelle recherche est limitee a la zone europeenne prise en charge :
  34 a 72 N, 32 W a 60 E et liste de pays europeens. Les resultats ultramarins
  sont exclus ; Turquie limitee a >=40 N et <=29 E, Russie a >=41 N et <=60 E.
  C'est un filtre operationnel approximatif, pas une frontiere politique exacte.
  Les anciennes cartes de demonstration, dont Tahiti, restent disponibles.
- La premiere preparation demande Internet et peut prendre plusieurs minutes.
  L'interface interdit de lancer une autre partie pendant cette attente ;
  changer de region annule l'attente, sans supprimer le cache en preparation.
  Il faut dix cases avec lieux publics nommes pour la piste actuelle :
  une zone trop peu documentee est refusee explicitement, sans indices inventes.
- Les cartes et sources sont conservees dans `.cache/travel/origins/`.
  Apres redemarrage du serveur/rechargement, les depart prepares reparaissent
  dans le selecteur. Chaque couple de coordonnees a son propre emplacement de
  sauvegarde navigateur ; revenir au meme point ne redessine pas le tarot.
- Les recherches/coordonnees sont envoyees a Nominatim/OpenStreetMap, puis aux
  services d'altitude/meteo deja utilises pendant le voyage. Elles figurent
  aussi dans le cache et les journaux du serveur local. Nominatim est attribue,
  les requetes sont identifiees, serialisees et espacees d'au moins 1,1 s,
  avec reutilisation des recherches recentes. Aucun compte/jeton n'est requis.

Le bouton **Options** (Alt + Maj + K), disponible au titre, a la preparation
et pendant le jeu, regroupe **langue, musique et volume** dans un panneau
dedie. Fermer ou Echap revient au meme ecran, sans changer la partie.
La musique reste active par defaut a 25 %, sous reserve de l'autorisation de
lecture automatique du navigateur. Les boutons conservent leurs infobulles
et raccourcis. La preparation utilise une seule police, du texte/controles
a 16 px et un titre a 24 px ; deux colonnes sur grand ecran, une sur mobile.

## Sources photo supplementaires

Les galeries photo disposent aussi de deux sources naturalistes sans cle API :
iNaturalist puis GBIF, apres les sources OSM/Commons/Wikipedia. Ces photos sont
explicitement identifiees comme observations d'especes, pas comme vues generales
du paysage. Rayon maximal 2 km, precision geographique declaree <= 250 m,
positions masquees/generalisees rejetees. Seules les licences photo explicites
CC0, CC BY et CC BY-SA sont acceptees, avec auteur, lien source et licence.
Les hebergeurs d'images sont limites aux domaines verifies iNaturalist,
Naturalis et observation.org ; les autres sont ignores.

Le nombre maximal de photos par case est defini dans
`config.yml` par `photos.max_per_cell` (5 par defaut, de 1 a 20).
Le serveur expose cette configuration au navigateur ; recharger la page apres
modification. Pour un hebergement statique, `prepare_regions.py` exporte
`public/config.json`. La taille reste limitee a 12 Mo/image.
La premiere photo apparait des son telechargement, sans attendre la fin de la
galerie ; les fleches permettent de parcourir les photos deja pretes pendant
que les suivantes arrivent. Un indicateur de chargement reste visible.
Les octets sont caches dans IndexedDB ; les doublons iNaturalist/GBIF sont
elimines. Le cache photo v3 recherche les nouvelles sources tout en reutilisant
les octets des anciennes galeries v2/v1 et en les conservant en cas de panne.
Les erreurs fournisseur restent visibles. Aucun jeton ou compte n'est requis.

## Configuration et couverture d'eau

Le pays affiche provient des codes OSM de la case (adresses ou limites
administratives completes contenant son centre), jamais du nom de la region
test. Les noms de pays sont localises dans le navigateur. Une donnee absente
ou une limite incomplete ne permet pas de deviner le pays : l'interface
signale alors explicitement que le pays n'est pas renseigne.

[config.yml](./config.yml) contient `map.water_coverage_percent` (50 par defaut,
valeur strictement positive jusqu'a 100). Une case ne peut devenir `~` que si
la surface d'eau cartographiee atteint ce pourcentage ; les routes principales
et lieux gardent leurs priorites existantes.

La couverture est estimee par une grille de 20 x 20 echantillons par case :
union des polygones et cours d'eau avec largeur OSM numerique en metres,
sans compter deux fois les chevauchements et en excluant les iles/trous.
Les petites surfaces ne sont plus agrandies en peignant leurs contours.
Un cours d'eau sans largeur connue ne contribue pas a une surface inventee :
il reste signale dans les informations de la case. Les surfaces sont des
estimations des donnees OSM, pas des mesures hydrologiques exactes.

Apres modification, executer `python3 scripts/prepare_regions.py` puis
redemarrer le serveur. Les caches de grilles sont invalides automatiquement
par la configuration ; les sources OSM et altitudes restent reutilisees.

## Couche 2 : voyage a pied

- **Commencer le voyage** place le joueur `@` au centre de la region.
- Les **fleches** du clavier ou les boutons cardinaux avancent d'une case.
  Chaque pas vaut 250 m. Une courte animation ne represente pas le temps reel
  de marche : le jeu est au tour par tour.
- **R** ou le bouton de repos avance de 30 minutes et retire jusqu'a 20 points
  de fatigue. Le repos consomme encore de l'energie de base.
- La date et l'heure du jeu sont affichees en **UTC**, initialement a l'instant
  de depart, puis avancent selon la duree calculee des pas et repos, y compris
  lors du changement de jour. Le temps reel entre actions ne les fait pas avancer.
- Le panneau indique distance, duree, vitesse du dernier pas, fatigue sur 100,
  kcal cumulees et denivele positif/negatif. La couche 4 ajoute faim, sommeil,
  profils de personnage et repas ; la couche 6 ajoute leur achat. Aucun
  inventaire pour l'instant.
- Les commandes, l'horloge et les statistiques occupent une barre laterale a
  droite sur grand ecran, sous la carte sur mobile. Les explications du modele
  sont repliees dans « Aide et modele de voyage ».
- La fenetre de 24 x 24 cases tient integralement dans le panneau : cases
  carrees redimensionnees selon la largeur, sans defilement interne coupant
  la carte. Pendant le voyage, l'en-tete conserve Options et le nom du lieu,
  sans commandes de preparation ni introduction ; la page reste defilable.
- Il n'y a **aucune case bloquee par son terrain** a cette echelle. Eau,
  rochers, rails et batiments restent traversables dans le modele de jeu.
  Une case non telechargee attend ses donnees ; une erreur permet de reessayer
  sans deplacer le joueur ni consommer de temps ou d'energie.
- La camera suit le joueur ; les descriptions et la touche **P** concernent
  sa case, ou le curseur en mode L. La souris ne declenche pas d'inspection au survol.
  Les touches de marche ne sont
  pas actives dans une fenetre photo ou le tiroir OSM.
- La carte OSM du tiroir est recentree sur la case du joueur avec un marqueur,
  et le lien externe reprend cette position. Fermee, elle n'est pas rechargee.
- **Revenir a la preparation** ou recharger quitte la vue
  du voyage. La progression est sauvegardee automatiquement apres chaque
  action : **Reprendre la sauvegarde** restaure la partie de cette region.
  Les donnees geographiques, altitudes et contenus decouverts restent en cache.
  Les trains et bus ne sont pas encore implementes.

### Modele d'effort et altitude

Les constantes du modele sont dans [travel.mjs](./travel.mjs). La vitesse
de base est 4,5 km/h, divisee par le cout moyen des terrains de depart/arrivee
et par `1 + fatigue/100`. Le facteur de pente est
`exp(-3.5 * (abs(pente + 0.05) - 0.05))`, avec pente bornee a +/- 50 % ;
la vitesse finale reste entre 0,5 et 6 km/h. Le terrain affecte le cout meme
si la pente est inconnue. Il s'agit d'une approximation de jeu, pas d'un
calcul de securite de randonnee ou d'une recommandation medicale.

L'energie d'un pas est `40 * (0.75 * km * coutTerrain + 0.009 * monteeMetres
+ 0.002 * descenteMetres) * (1 + fatigue/200)` en kcal, pour une masse de jeu
de 40 kg. La fatigue gagne `minutes * 0.08 * coutTerrain + montee/80 +
descente/400`, bornee a 100 sans immobiliser le joueur. Le repos consomme
40 kcal/heure. Ces coefficients sont ajustables ; les terrains utilisent les
classes prioritaires OSM et ne deduisent pas de pont ni de passage reel.

Les altitudes des centres proviennent de l'API
[Open-Meteo / Copernicus DEM GLO-90](https://open-meteo.com/en/docs/elevation-api)
avec attribution [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Une requete groupe les 64 centres d'un morceau de carte. Le denivele est la
difference entre centres, pas la somme des variations du chemin reel.
Une altitude indisponible est explicitement signalee : le pas utilise une
estimation de pente nulle, et le compteur de pas estimes reste visible.
**Reessayer les telechargements** relance les altitudes manquantes.

## Couche 4 : personnage et besoins

Les regles suivantes decrivent le checkpoint `layer-4-needs`. Dans la version
actuelle, les repas sont payants et le sommeil dehors est penalise (couche 6).

Avant de partir, choisir **Equilibre**, **Robuste** ou **Endurant**. Le robuste
marche un peu plus vite et consomme davantage ; l'endurant accumule moins de
fatigue. Le profil reste fixe pendant un voyage. Le modele d'effort historique
reste la base ; le profil ajuste masse de jeu, allure et endurance.

- Les jauges affichent faim, fatigue et pression de sommeil (0 = bon etat).
- La faim suit une reserve d'energie, consommee par le metabolisme de base
  pendant toutes les actions et par l'effort de marche. Les kcal affichees sont
  des depenses cumulees ; un repas ne remet pas ce compteur a zero.
- Le repos de 30 min recupere la fatigue d'effort, pas la pression de sommeil.
- **Dormir** avance de 8 h, diminue fatigue et dette de sommeil, mais consomme
  encore de l'energie. Dormir sans manger indefiniment n'est pas une solution.
- **Repas** est disponible uniquement sur une case de localite `○` :
  20 min et 900 kcal de reserve (sans depasser sa capacite). Aide gratuite
  de prototype, pas une promesse de nourriture ou d'accueil dans le lieu reel.
  Les boutiques et l'argent viendront dans la couche economie.
- Les avertissements expliquent les besoins eleves. Faim et manque de sommeil
  ralentissent la marche. Reserve vide, fatigue a 100 ou 32 h d'eveil equivalent
  terminent le voyage avec une explication et **Nouveau voyage**.
- Les actions de survie sont desactivees en observation et dans les dialogues.
  Attendre reellement ou telecharger ne consomme aucune ressource.

Les profils et coefficients de besoins sont dans `config.yml`, section
`survival`, valides au demarrage du voyage et exposes par le serveur. Pas
de bonus invente depuis une photo ou une description Wikipedia ; les repas
utilisent uniquement le terrain OSM de la case du joueur. Ni meteo punitive,
ni blessures, ni eau potable, ni effets medicaux dans cette couche.

Voir [les choix, questions ouvertes et parcours de test](./doc/IMPLEMENTATION-CHOICES.md)
pour les hypotheses de jeu, les checkpoints Git et la verification couche par couche.

## Couche 5 : localites en menus

Entrer sur une case de localite nommee ouvre un **menu textuel**. Le bouton
**Visiter la localite** permet de le rouvrir apres fermeture. **Echap** ou
**Reprendre la route** revient a la meme position, sans temps ni cout.
L'observation d'une localite a distance n'ouvre pas ce menu.

- Accueil : resume Wikipedia associe au noeud OSM, ou article geographique
  portant le meme nom a moins de 2 km, avec langue, source et licence.
  Une absence ou une erreur est affichee explicitement ; un article voisin
  sans rapport n'est pas presente comme l'histoire de la localite.
- Lieux : vrais etablissements nommes a moins de 2 km, uniquement dans les
  cases deja chargees, cinq au maximum par grande categorie OSM. Les
  coordonnees des POI sont conservees pour calculer les distances.
  Les commerces vacants, lieux sans nom, acces prives/interdits et lieux
  explicitement abandonnes/desaffectes sont exclus. Les types retenus
  sont des lieux accueillant habituellement du public, pas des residences.
- Chaque entree ouvre une fiche textuelle et son lien OpenStreetMap.
  Aucun etablissement, prix, horaire, dialogue ou comportement n'est invente.
  Ni la presence dans OSM ni l'absence d'une restriction ne garantissent
  l'ouverture ou l'accueil reel. Les personnes reelles n'ont aucun role fictif.
- Ce rayon est un voisinage cartographique, **pas une limite communale** :
  les lieux proches peuvent appartenir a une autre commune. La liste
  s'enrichit pendant les chargements sans requete OSM supplementaire dediee.
- Consulter menus/fiches ne consomme rien et ne laisse pas passer les
  raccourcis de marche, repos ou photos vers la carte. Achats, travail et
  hebergement ne sont pas disponibles dans le checkpoint `layer-5-towns`.
  Dans la version actuelle, les commandes des couches 6 et 7 ajoutent les
  repas payants, le choix d'abri et la musique de rue.

Les identifiants, associations Wikipedia et restrictions proviennent du
rasteriseur. Apres modification du pipeline, `scripts/prepare_regions.py`
regenere les snapshots depuis les sources en cache ; redemarrer le serveur
regenere aussi les chunks rendus sans redemander les sources OSM ou altitudes.

## Couche 6 : tarot, repas locaux et nuits

Cette couche remplace les repas gratuits et le sommeil partout sans consequence
du checkpoint 4. Au depart, une des 22 arcanes majeures est tiree au hasard ;
sa dotation provisoire vaut 4 a 10 repas de reference, soit 24,76 a 61,90
euros **de jeu**. La carte du jour change au prochain jour UTC simule,
sans nouvelle dotation. Aucun tirage n'est payant.

**Repas locaux** propose une specialite documentee selon les coordonnees :
aligot autour de Firmi/Aveyron, croque-monsieur a Paris, tartiflette autour
de Chamonix/Savoie, poisson cru au lait de coco a Tahiti. Sources touristiques
et descriptions originales dans [public/economy.json](./public/economy.json).
Chaque repas vaut pour le jeu 900 kcal de reserve et 20 minutes ; ce ne sont
pas des mesures nutritionnelles. Les zones sont des boites de curation,
pas des frontieres culinaires exactes. Hors zone couverte, absence explicite.
Les repas restent limites aux cases de localite.

L'echelle des tarifs utilise les observations Big Mac du **1 juillet 2026**
publiees par The Economist, pas Eurostat. Les valeurs en dollars permettent
une comparaison entre marches, convertie en euros de jeu sur la reference
zone euro (6,19). Ce ne sont pas les prix reels de ces plats ou etablissements.
FR utilise l'observation zone euro, CH/GB/US leurs observations propres.
Pays cartographique absent/ambigu ou marche absent (notamment PF) :
**tarif de reference signale dans le menu**, jamais un pays devine ou
un faux indice local. Aucun change monetaire ni paiement reel.

**Sommeil et abri** propose les hebergements OSM de la case actuelle :
hotel, auberge, chambre d'hotes, motel ou refuge alpin. Tarif de jeu : quatre
repas de reference locale ; un abri n'est gratuit que si `fee=no` est
explicitement cartographie. Acces prive/interdit et lieux desaffectes exclus.
Un hotel dans le menu des environs n'est pas utilisable a distance.

Dormir dehors reste possible, mais sans recuperation de fatigue d'effort,
avec seulement 25 % de recuperation du besoin de sommeil. Toute action dehors
accumule +2 fatigue par heure nocturne (marche, repos et sommeil) ; le repos
nocturne ne recupere pas la fatigue. La nuit utilise le cycle solaire
geographique, pas une heure fixe. Les repas et nuits payees sont proteges.
Les futurs evenements nocturnes dangereux dependront du tarot du jour ;
leurs mini-jeux ne sont pas encore actifs. Attendre reellement ou regarder
la carte ne passe toujours pas de temps.

La base culinaire est remplie manuellement pour cette version. Un futur LLM
pourra proposer des entrees a partir de sources web, mais ne devra pas
inventer de specialite, de provenance, de tarif ou de promesse d'accueil.

## Couche 7 : musique de rue

Sur une case de localite, **Musique de rue** ouvre le premier mini-jeu.
Commencer depense immediatement 30 minutes, le metabolisme correspondant
et 4 points de fatigue (plus l'exposition nocturne eventuelle). Pas besoin
d'argent pour jouer, mais il faut encore pouvoir supporter cet effort.

Huit notes, espacees de 700 ms : appuyer sur **Espace** ou toucher le bouton
quand une case s'allume, avec une tolerance de +/-180 ms. Jeu visuel sans
audio pour ce premier prototype. Chaque note ne compte qu'une fois.
La prestation parfaite rapporte l'equivalent de deux repas au tarif courant ;
les gains sont proportionnels aux reussites, arrondis en centimes.

**Echap**, fermeture ou onglet masque annule les gains, pas le cout deja
depense. Aucun temps reel supplementaire ne passe pendant le jeu ; les
30 minutes sont comptabilisees au depart. Les autres commandes restent
bloquees par le dialogue. Les cadeaux ne sont pas attribues a de vraies
personnes ou etablissements ; ce n'est pas une autorisation de jouer sur place.

## Couche 8 : une courte piste du parent

Chaque nouveau voyage genere un parent fictif et dix etapes proches dans
la region de depart, a partir de localites ou de lieux publics nommes OSM.
Un carnet s'ouvre au depart. **Piste du parent** le rouvre sans cout.
Le carnet indique la prochaine etape et le nombre de cases est/ouest,
nord/sud a parcourir ; il ne revele pas d'avance les suivantes.

Sur la case cible, **Interroger le voyageur imaginaire** prend 5 minutes et
donne un indice ecrit a la main, base sur une fiche de faits : parent,
lieu de rencontre, prochaine destination. Les temoins sont entierement
inventes ; aucun habitant, employe ou proprietaire reel ne recoit de role.
Les fiches et dialogues trouves restent dans le carnet pendant ce voyage.

A la dixieme etape, **Retrouver votre parent** ouvre les retrouvailles :
objectif atteint, partie terminee, nouveau voyage possible. Les besoins
restent actifs pendant les rencontres : l'epuisement peut terminer le voyage
avant son objectif. Les etapes ne sont pas atteignables par le curseur Look.

Raccourcis assumes : parent immobile au dernier repere, quatre prenoms,
un seul modele de dialogue, dix etapes choisies parmi les quatre reperes
proches successifs, sans OSRM, fausses pistes ni calendrier du parent.
La generation fonctionne sur les quatre cartes incluses. La sauvegarde locale
permet maintenant de reprendre la piste apres rechargement ou changement de region.
Les anciennes sauvegardes a trois etapes gardent leur parcours et leur
progression ; commencer un nouveau voyage pour obtenir dix etapes.
Le serveur de voyage local existe deja, mais la creation serveur et les
parcours complets de la couche 9 ne sont pas encore implementes.

## Boutons et raccourcis

Survoler un bouton ou lui donner le focus avec Tab affiche son action et son
raccourci **Alt + Maj + touche** (Option + Maj sur Mac). Chaque bouton dispose
aussi de `title` et `aria-keyshortcuts`. Exemples : M musique, N nouveau
voyage, C reprise, E repas, H sommeil, T ville, B musique de rue, J journal,
S sauvegarde, Q retour preparation, K Options, G recherche, V position actuelle.
Entree ouvre la preparation depuis le titre ; D
revele le tarot, puis Entree continue (avec Alt + Maj pour ces raccourcis).

Dans les dialogues, seuls leurs boutons repondent ; les options dynamiques
utilisent 1-9, 0 puis les lettres disponibles, indiquees dans leurs info-bulles.
Les boutons caches/desactives et les appuis repetes sont ignores. Aucun
raccourci ne s'active pendant l'utilisation d'un champ ou selecteur.
Les commandes existantes restent disponibles sans modificateurs : fleches,
L observation, R repos, P photo, Espace rythme et Echap pour fermer.

## Ecran titre

Au chargement, un ecran titre presente le voyage avec une illustration ASCII
et une courte introduction (francais/anglais). **Preparer le voyage** donne
acces a l'ecran intermediaire de choix du depart et de reprise ; cette transition
ne cree aucune partie et ne remplace aucune sauvegarde. Langue et musique
restent accessibles dans Options. L'ecran revient a chaque rechargement.

## Autres moyens de subsister

En voyage ou dans le menu de ville, **Autres moyens de subsister**
(Alt + Maj + F) presente trois actions fictives avec leur cout et risque :

- **Chercher dans les bois** : foret uniquement, 30 min et +5 fatigue.
  En cas de succes, jusqu'a 450 kcal consommees sur place.
- **Faire la manche** : localite uniquement, 30 min et +2 fatigue.
  Don possible d'un demi-repas au tarif local ; aucun argent initial requis.
- **Voler de la nourriture** : uniquement si un magasin alimentaire OSM
  est dans la case du joueur, 10 min et +3 fatigue. Succes : jusqu'a
  900 kcal consommees. Arrestation : six heures de detention avec nourriture
  et sommeil de base, puis liberation dans la meme case, sans amende.

Les echecs coutent aussi du temps/metabolisme et de la fatigue ; la nuit
expose les tentatives, mais pas la detention. Le tarot de depart et celui
du jour modifient les probabilites affichees. Les resultats sont sauvegardes,
sans gain repete au rechargement. Une fatigue/faim terminale pendant la
tentative reste prioritaire sur le gain. Aucun inventaire alimentaire,
conseil de cueillette/vol ni simulation juridique realiste n'est propose.
Les dialogues n'accusent aucun commercant reel ; les donnees OSM ne servent
qu'a rendre disponible l'action fictive.

## Profil et tarot de depart

Au debut d'un nouveau voyage, apres le choix du depart, **Reveler ma carte**
presente le tarot de depart, sa lecture symbolique et la bourse exacte.
Un seul tirage par nouveau voyage : la revelation ne tire pas une autre carte.
**Prendre la route** ouvre ensuite le journal. Une reprise garde sa carte,
son profil et son budget ; elle ne repasse pas par un nouveau tirage.
Pour les nouveaux voyages, le tarot remplace le choix de profil : force,
endurance et allure sont definies par carte (9 points au total). Les anciennes
sauvegardes conservent leur profil. Chaque carte a son illustration ASCII.
Le tarot de depart et celui du jour donnent ensemble une tendance pour les
futurs evenements nocturnes ; aucun evenement n'est encore declenche.
Au changement de jour UTC du jeu, une fenetre permet de reveler la carte
quotidienne avec son dessin et sa signification. Elle attend la fermeture
des autres dialogues, conserve le tirage apres rechargement et ne change
ni la bourse ni les caracteristiques. Continuer memorise sa lecture.

## Musique

Telecharger les pistes dans [public/audio/music/](public/audio/music/) puis
la musique est activee par defaut. Si le navigateur bloque la lecture automatique,
le premier clic ou appui clavier la lance. Volume initial
25 %, reglable et pouvant etre coupe dans Options. WAV, MP3 et OGG sont acceptes ;
les noms `music-title.wav`, `01-music-title.wav` ou `01 - music-title.wav`
fonctionnent sans renommer les telechargements existants.

La musique suit le vrai joueur : carte fixe/titre, terrain, indices OSM, nuit
solaire, menus de ville/sommeil/journal et issue du voyage. Un curseur Look
ne change pas la musique selon la case inspectee. Une piste absente ou
illisible utilise `music-road-day`, puis `music-title`, puis le silence.
Le statut indique ce remplacement et les erreurs sont journalisees.
Couper/reactiver apres un nouveau telechargement pour reessayer les fichiers
manquants. Le jeu et les sauvegardes fonctionnent meme sans aucun fichier.

Pas de piste imposee par la region de depart : montagnes, foret, ville et
cote fonctionnent partout. Ville/cote exigent des tags OSM explicites
(`place=city/town`, `landuse=residential/commercial/retail`, `natural=coastline`) ;
sans ces indices, utiliser les ambiances generiques, sans deviner le lieu.
Les anciens noms `music-paris` et `music-tahiti` restent acceptes pour les
pistes generiques `music-city` et `music-coast`.

Les pistes bouclent, sans fondu ni correction automatique des raccords.
L'onglet masque et le dialogue du minijeu de rythme mettent la musique en
pause ; aucune piste Suno non synchronisee n'influence les notes/recompenses.
Les effets sonores et pistes `future-` ne sont pas encore connectes.
Un premier jeu de 27 effets courts est maintenant synthetise localement,
sans musique d'accompagnement :
[ecouter les effets](public/audio/sfx/index.html). Ils ne sont pas encore
declenches dans le jeu. Regeneration reproductible avec
`scripts/generate_sfx.py` (bibliotheque standard Python uniquement).

Une [chanson originale en anglais](audio-prompts/title-song.md) est prevue
uniquement sur l'ecran titre/carte fixe : generer dans Suno avec Instrumental
desactive, puis telecharger `music-title-song.wav` dans le dossier musique.
En son absence, le titre instrumental reste utilise, puis le silence.
Le voyage utilise uniquement les pistes instrumentales.

## Sauvegarde et reprise locales

- Une sauvegarde **par region et par origine navigateur** (hote + port).
  A la preparation, choisir la region puis **Reprendre la sauvegarde**.
  Le serveur local doit tourner pour recharger les chunks ; ce n'est pas
  une sauvegarde sur un compte ou sur le serveur.
- Sauvegarde automatique au depart puis apres chaque action reussie :
  marche, repos, repas, sommeil, musique et rencontre. **Sauvegarder maintenant**
  permet aussi de reessayer apres une erreur de stockage. Une date confirme
  le dernier enregistrement ; une erreur reste affichee et journalisee.
- Position globale (y compris hors snapshot), temps simule, profil, besoins,
  argent, tarot de depart/du jour, depenses/gains et piste complete sont
  conserves. Attendre reellement pendant une interruption ne coute rien.
- Les regles de survie et la base economique de la partie sont incluses :
  une modification de YAML ou des tarifs n'altere pas un voyage repris.
  Un nouveau voyage utilise la configuration courante.
- Une prestation interrompue est reprise **comme annulee** : couts conserves,
  aucun gain. Une prestation terminee conserve exactement ses gains,
  sans nouveau versement. Les retrouvailles et epuisements restent terminaux.
- **Nouveau voyage** demande confirmation avant de remplacer le slot courant.
  Changer de region, revenir a la preparation ou vider le cache des contenus
  ne supprime pas les sauvegardes. Effacer les donnees du site, changer de
  navigateur/port ou utiliser une session privee peut les rendre indisponibles.
- Format versionne et valide. Une sauvegarde endommagee, incompatible ou
  utilisant une autre geometrie de carte ne se recharge pas silencieusement
  et n'est pas effacee automatiquement. Pas encore d'import/export/migration.
- Eviter de jouer la meme region dans plusieurs onglets : un onglet qui
  detecte une sauvegarde modifiee ailleurs refuse de l'ecraser et demande
  un rechargement. Les slots de regions differentes sont independants.

Les dialogues, curseur Look, telechargements et images ne sont pas des etats
de jeu sauvegardes ; les menus se reconstruisent et les caches existants
restent separes. La sauvegarde est locale, pas un mecanisme anti-triche.

### Couche 3 : temps et cadran du ciel

Un cadran circulaire accompagne l'horloge pendant le voyage. Le soleil parcourt
l'arc superieur de gauche a droite entre lever et coucher ; une lune symbolique
fait de meme du coucher au lever suivant. La lune indique la progression de la
nuit, pas sa position ou sa phase astronomique reelle.

Les heures approximatives du soleil sont calculees localement selon la date
du jeu et la position du joueur (approximation NOAA, horizon degage, sans relief
ni meteo). Aucun service reseau n'est necessaire. Les heures sont affichees en
UTC, comme l'horloge. Le cadran avance en marchant ou en se reposant, pas pendant
l'attente ou l'observation. Les vitesses variables de la couche 2 sont conservees.
Les jours et nuits polaires sont signales. La carte reste lisible la nuit ;
aucun brouillard, besoin ou malus nocturne n'est ajoute a cette couche.

La meteo habituelle vient des donnees historiques Open-Meteo/ERA5 (CC BY 4.0),
avec une carte compacte a cote du cadran : icone, temperature et plage min/max.
Les statistiques completes et credits restent dans « Moyennes et sources ».
Il s'agit de moyennes historiques,
pas d'une prevision en direct : les cinq dernieres annees civiles completes
servent a calculer les moyennes par mois (temperature moyenne, moyenne des
minima/maxima journaliers, precipitation moyenne en mm/jour et condition la
plus frequente avec sa proportion). Le mois suit le calendrier du jeu.
Ces moyennes recentes ne sont pas des normales climatiques officielles sur 30 ans.

La grande temperature affichee suit une courbe jour/nuit estimee a partir
des minima/maxima du mois : minimum au lever du soleil, maximum trois heures
apres midi solaire, puis refroidissement jusqu'au prochain matin. Une courbe
cosinus assure des transitions douces, sans appel reseau supplementaire.
La position du joueur determine les heures solaires (y compris a Tahiti).
En periode polaire, le minimum est fixe a 6 h solaires.
Ce n'est pas une mesure ni une prevision horaire ; la moyenne historique
reste dans les details. Marche et repos font evoluer la temperature,
contrairement a l'attente reelle et au mode observation.

La temperature et sa plage min/max sont aussi ajustees de -0,65 degre par
100 m de difference entre l'altitude du joueur et l'altitude de reference
renvoyee par Open-Meteo. Cette difference evite de compter deux fois l'altitude.
C'est une approximation (sans inversions thermiques ni microclimats).
Les details affichent correction et altitudes, ou l'absence explicite
d'ajustement si l'une manque. Les statistiques historiques restent inchangees.
Le cache meteo v2 conserve l'altitude de reference ; les anciens fichiers v1
sont preserves mais necessitent une nouvelle requete pour obtenir cette donnee.

Une zone arrondie a 0,1 degre (environ 10 km) partage ses donnees, avec cache
disque controle par checksum dans `.cache/travel/weather/`. Les douze mois sont
prepares ensemble et reutilisables apres redemarrage, sans nouvel appel au
fournisseur ; une nouvelle periode de reference est prise chaque annee civile.
Les erreurs sont affichees et peuvent etre relancees avec **Reessayer les
telechargements**, apres un delai de protection d'une minute. La meteo est
informative : aucun effet supplementaire sur le voyage pour l'instant.

### Streaming et caches

Pendant le voyage, les informations suivent le joueur, sans effet au survol
de la souris. **L** (ou **Observer**) active un curseur d'observation :
les fleches explorent les cases de la fenetre sans deplacement, temps ni fatigue.
Descriptions, points d'interet et **P** suivent ce curseur. **Echap** ou **L**
revient au joueur. Les cases `?` restent explicitement non cartographiees.

Les morceaux de 8 x 8 cases suivent une grille geographique alignee par region,
avec projection constante, y compris aux indices negatifs. La fenetre affiche
24 x 24 cases autour du morceau courant. Les quatre voisins cardinaux sont
precharges en arriere-plan : direction de marche en premier, cotes selon
la proximite de leur frontiere, puis arriere. Un changement de direction
reordonne les demandes en attente sans interrompre celles en cours ni
retelecharger les morceaux en cache ; les diagonales inconnues apparaissent en `?`.
Le client limite les demandes simultanees a deux et conserve au plus 25 morceaux
en memoire. Les demandes de deplacement sont prioritaires devant celles encore
en file d'attente. Le serveur limite lui aussi ses travailleurs a deux et
sa file a dix travaux, avec deduplication des demandes identiques.

Les OSM compresses, altitudes, provenance et grilles sont conserves dans
[.cache/travel/](./.cache/travel/) (ignore par Git). Les extraits inclus sont
reutilises lorsque le morceau est entierement couvert ; sinon le serveur
telecharge OSM avec la subdivision existante. En cas d'indisponibilite,
deux API Overpass peuvent prendre le relais
de l'API OSM. Les delais HTTP et messages de limitation sont respectes par source
(60 secondes par defaut), avec acces reseau serialise et erreurs journalisees.
Les sources effectivement utilisees sont conservees dans le snapshot.
Ces services publics ne garantissent pas la disponibilite ; les caches restent
prioritaires. Les grilles terminees portent un
checksum et leur identite depend du pipeline, du snapshot initial et de la
resolution. Les remplacements sont atomiques. Les donnees deja en cache sont
servies sans requete fournisseur, meme apres redemarrage du serveur.
Une panne d'altitude ne fige pas une fausse altitude dans le cache final.

Le serveur local est un outil de prototype, pas le serveur multijoueur :
aucune synchronisation distante de cache ou autorite de jeu n'est implementee.
Les photos/descriptions restent dans IndexedDB, separement du cache disque.
Le cache navigateur depend du port : les contenus decouverts sur 8765 ne sont
pas automatiquement visibles sur 8766.

### Comparaison avec OpenStreetMap

Le bouton « Voir OpenStreetMap » ouvre le fond de carte dans un tiroir a droite,
ferme par defaut. « Fermer la carte » ou Echap le referme et rend le focus au
bouton d'ouverture. La grille ASCII utilise toute la largeur disponible.
Le tiroir s'adapte aux petits ecrans et suit la region choisie. L'iframe OSM
n'est chargee qu'a la premiere ouverture pour cette region ; la refermer ne
recharge pas les tuiles. Les extraits de Firmi, Paris et Chamonix sont prepares
pour une vue standard de 518 x 360 pixels, conservee dans le tiroir sur grand
ecran. Le cadrage de reference reste stable. Un lien ouvre aussi la carte
separement si l'integration echoue. Les libelles suivent la langue choisie.

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

Le survol utilise uniquement les donnees locales. Les descriptions et photos
en ligne sont chargees separement, sur selection explicite.
Les POI de la case selectionnee sont regroupes sous la description dans une
liste repliable avec compteur et defilement pour les cases tres denses.
L'infobulle de survol conserve aussi les POI, sans allonger le panneau de
coordonnees au-dessus de la description.

### Descriptions et photos des cases

Cliquer une case ou lui donner le focus clavier charge une courte description.
Appuyer sur **P** ou sur **Photo (P)** ouvre sa photo ; **Echap** ferme la fenetre.
La fenetre propose jusqu'a **5 photos distinctes par case**, avec compteur,
boutons precedent/suivant et touches fleche gauche/droite. Les fleches sont
limitees a la premiere/derniere image, sans rebouclage. Chaque image conserve
ses propres credits, licence et indication de proximite. Le plafond est defini
par `MAX_CELL_PHOTOS` dans [cell-content.mjs](./cell-content.mjs).
En carte fixe, le contenu suit la case selectionnee ; pendant le voyage, il
suit automatiquement le joueur.
Les indications d'utilisation sont visibles avant selection d'une case, puis
masquees des qu'une case est selectionnee. Elles reapparaissent au changement
de region ou lorsque la selection est effacee.

Sources par ordre de priorite :

- **Description :** tag OSM `description:fr`/`description:en`, puis
  `description` (langue non precisee), puis extrait Wikipedia d'un lieu dans
  la case, puis contexte Wikipedia a proximite, dans un rayon de 2 km.
- **Photo :** fichier Commons lie depuis OSM (`wikimedia_commons` ou reference
  Commons dans `image`), photo Commons geolocalisee dans la case, puis image
  Commons d'un article Wikipedia situe dans la case. A defaut, une photo
  Commons a proximite peut etre proposee dans un rayon de 2 km.

Le contenu hors de la case est explicitement marque « A proximite », avec la
distance au centre. La position d'un article ou d'un objet OSM est une association
geographique, pas une garantie du champ de vision de la photo. Les objets OSM
portes par un chemin utilisent toujours son centre de boite englobante.
Chaque contenu affiche sa source, ses credits et sa licence ; aucun texte ou
image sans source n'est invente pour combler un manque. Les relations OSM ne
fournissent pas encore de sources de contenu.

**Le cache contient les fichiers photo eux-memes**, pas seulement leurs URLs.
Toutes les images de la galerie sont telechargees et cachees lors de sa premiere
ouverture ; changer de photo ne contacte pas les fournisseurs. Les caches
historiques a une photo sont enrichis en galerie, avec reutilisation de leurs
octets si la meme image est retrouvee. En cas de panne reseau, leur ancienne
photo reste accessible avec un avertissement ; « Actualiser les sources »
permet de relancer la recherche.
Descriptions, blobs d'image, provenance, licences, date, langue et limites
geographiques sont conserves dans IndexedDB sur cet appareil. Apres une premiere
decouverte, ils sont reutilisables sans connexion aux fournisseurs, y compris
apres rechargement du prototype servi localement. Cela ne met pas l'application
entiere ni les tuiles de comparaison hors ligne.

Les cles distinguent les limites de la case, sa resolution, ses sources OSM,
la langue et la version du contenu. « Actualiser les sources » renouvelle
le contenu de la case selectionnee (la photo lors de sa prochaine ouverture).
« Vider le cache des contenus » supprime les descriptions et photos de cet
origin ; cela ne supprime pas les snapshots/grilles sur disque.

Le navigateur contacte Wikipedia et Wikimedia pour les recherches, et Wikimedia
pour les images. Les images sont limitees a 12 Mo chacune. Le cache n'a pas
d'expiration ni d'eviction automatique ; les limites et evictions du navigateur
s'appliquent. Un autre port, navigateur ou appareil dispose d'un cache distinct.
Les erreurs reseau et de stockage sont affichees ; un echec n'est pas memorise
comme une absence definitive. La synchronisation serveur reste a implementer.

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

La synchronisation avec le futur serveur est suivie dans [doc/REQUIREMENTS.md](./doc/REQUIREMENTS.md#r-004--cache-generated-regions-and-synchronize-them-with-the-future-server). Elle n'est pas encore implementee ; le cache conserve les versions et empreintes necessaires a la comparaison des contenus.

Les descriptions et photos decouvertes sont mises en cache dans le navigateur,
avec leurs sources et licences. Voir [R-006](./doc/REQUIREMENTS.md#r-006--web-sourced-cell-descriptions-and-cached-cell-content)
pour la politique de couverture, de cache et la future synchronisation.

## Traductions

Le selecteur de langue permet de basculer entre francais et anglais sans recharger la carte. La langue initiale suit les preferences du navigateur parmi les langues disponibles, avec le francais par defaut. Le choix manuel s'applique a la page courante ; il n'est pas memorise.

Les textes d'interface, titres, attributs d'accessibilite, erreurs et noms de terrain sont centralises dans [i18n.mjs](./i18n.mjs). Pour ajouter une langue, ajouter un catalogue avec les memes cles et parametres, puis son option dans [index.html](./index.html). Les noms geographiques du fichier source ne sont pas traduits. Les labels historiques du JSON ne sont pas utilises par l'interface : celle-ci traduit les identifiants de terrain.

## Verifier

```sh
python3 scripts/prepare_regions.py
python3 -m unittest discover -s tests
node --test tests/*.test.mjs
```

Node.js est necessaire pour les tests JavaScript, pas pour lancer le prototype.

Les tests regionaux couvrent les vrais snapshots de Paris, Chamonix et Firmi a 250 m et 50 m par case : provenance, licence, dimensions, presence des terrains attendus, glyphes, determinisme et reutilisation hors ligne. Les tests unitaires separes couvrent notamment les champs, les priorites de rendu, les limites geographiques, l'invalidation et la corruption du cache.
