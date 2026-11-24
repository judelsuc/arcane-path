# Aventures de légende — génération systémique

Proposition du 24 novembre 2026. Rien n'est encore implémenté.

## Constat

Les trois formats (plateforme, enquête, donjon) sont déterministes à partir de
la graine de la ville, et la graine est bien aléatoire (`town_legends.seed`).
Mais le hasard ne fait que **réordonner un catalogue fixe** :

- `minigames/legend-layout.mjs` : une marche aléatoire place 8 salles et 2
  branches sur une grille, puis chaque salle reçoit une épreuve tirée parmi
  une dizaine de familles (`crate`, `bridge`, `plate`, `key`, `runes`…) dont
  la géométrie est figée (la caisse est toujours en (272, 262), le pont en
  (128, 166)).
- `minigames/legend-mechanisms.mjs` : chaque mécanisme est une recette
  complète (un objet, un emplacement, une solution, un texte d'indice).
- `minigames/legend-pacing.mjs` : le rythme est un motif de 8 temps répété.
- `minigames/legend-investigation.mjs` : 8 familles d'énigmes, même principe.

Résultat : deux aventures diffèrent par l'ordre des salles, pas par le
raisonnement demandé. Après deux ou trois parties, le joueur a tout vu.

## Principe

Générer **la logique avant l'espace**, à partir de **règles combinables**
plutôt que d'épreuves toutes faites, avec un **thème tiré du lieu réel**, et
**vérifier par un solveur** chaque aventure produite.

```
graine + ville + historique du joueur
      │
      ▼
  1. Thème local        (données OSM/Wikipedia de la ville → profil)
      │
      ▼
  2. Graphe d'énigmes   (construit à rebours depuis le trésor)
      │
      ▼
  3. Instanciation      (chaque verrou/clé → objets à propriétés, selon le thème)
      │
      ▼
  4. Spatialisation     (graphe → salles, géométrie paramétrique)
      │
      ▼
  5. Validation         (solveur abstrait + bot sur le vrai moteur ; sinon graine+1)
      │
      ▼
  6. Texte              (le modèle de langue nomme et raconte, ne structure jamais)
```

Tout reste déterministe : même graine et même version, même aventure, et le
serveur continue de rejouer la partie (`replayLegendSession`) pour la valider.

## Les briques

### 1. Règles combinables (moteur de propriétés)

Une petite couche commune aux trois formats, dans
`minigames/legend-rules.mjs` :

- **Objets à propriétés** : `lourd`, `poussable`, `portable`, `inflammable`,
  `conducteur`, `flottant`, `réfléchissant`, `lumineux`, `bruyant`, `fragile`.
- **Récepteurs** : dalle de pression (poids), brasero (feu), prise
  (courant), cuve (eau), œil (lumière), cloche (son), serrure (clé taillée).
- **Interactions** : l'eau éteint et fait flotter, le feu brûle et éclaire, le
  poids actionne, la lumière révèle les inscriptions, le son réveille ou fait
  fuir, ce qui est fragile casse en tombant.

Une même dalle peut alors s'activer par une caisse, le chien, de l'eau qui
monte ou un adversaire qu'on y attire. Les mécanismes actuels deviennent des
**recettes** exprimées avec ces règles et restent disponibles.

### 2. Graphe d'énigmes construit à rebours

`minigames/legend-graph.mjs` part du but (« le coffre ») et applique des
règles de réécriture, une grammaire de quêtes :

| Règle | Effet |
| --- | --- |
| verrou → clé | une porte exige un objet trouvé ailleurs |
| verrou → plusieurs clés | deux conditions à réunir (ET) |
| verrou → alternatives | deux solutions possibles (OU), dont l'une passe par l'inventaire du voyage |
| transformation | l'objet trouvé doit être modifié avant usage (allumer, remplir, assembler) |
| état partagé | un levier change l'état de plusieurs salles (niveau d'eau, lumière) |
| sens unique | un passage qui ne se refranchit pas oblige à planifier |
| réutilisation | un objet sert deux fois, dans deux rôles différents |

Les contraintes sont pilotées par la graine et le palier de récompense :
profondeur, nombre de branches, retours en arrière tolérés, nombre
d'objets portés à la fois. On abandonne le motif fixe de 8 temps au profit
d'une **courbe de tension** : découverte, montée, pic, respiration, finale.
Le graphe place les énigmes combinées sur les pics et les salles calmes
(soin, récit) sur les respirations.

### 3. Thème tiré du lieu

`scripts/legend_theme.py` lit ce que le serveur connaît déjà de la ville :
étiquettes OSM (mine, port, écluse, château, abbaye, gare, vignoble, rivière,
téléphérique) et catégories Wikipedia. Il produit un **profil** :

- tuiles et palette (prolonge `legend-theme-tiles.mjs`) ;
- poids des propriétés et récepteurs (mine : wagonnets, poids, lampes ; port :
  marée, flottaison, cordages ; abbaye : cloches, vitraux, lumière ; montagne :
  câbles, éboulis, froid) ;
- adversaires et pièges du donjon ;
- vocabulaire des indices.

Le profil est enregistré avec la légende de la ville (comme le plan de
recherche) pour que l'aventure ne change pas d'une session à l'autre.

### 4. Géométrie paramétrique

Chaque type de salle devient un **module paramétré** (hauteurs, largeur des
vides, longueur des rails, position des récepteurs) au lieu de coordonnées
figées. Le générateur choisit les paramètres dans des bornes vérifiées
(saut atteignable, rail dégagé, faisceau libre), avec les contrôles
existants (`validateMechanismPlacement`) étendus.

### 5. Validation par solveur

- **Solveur abstrait** sur le graphe : parcours en largeur de l'état (objets
  possédés, états des récepteurs, salles accessibles). Il garantit une
  solution et mesure sa longueur, ses retours en arrière et le nombre
  d'étapes « non évidentes ».
- **Bot** sur le vrai moteur pour la plateforme (sauts et minutages), comme
  le défenseur parfait des tests du combat.
- Une aventure rejetée passe à la graine dérivée suivante, de façon
  déterministe et bornée.
- Le score obtenu fixe la difficulté annoncée et alimente des tests de
  variété : distance entre aventures de graines différentes, et pas
  seulement des empreintes différentes.

### 6. Le modèle de langue raconte, il ne construit pas

Le récit de la légende (brief `legend.town`) reçoit les **éléments clés du
graphe** : l'objet final, deux ou trois clés marquantes, le thème. L'habitant
raconte ainsi l'aventure qu'on va réellement jouer (« la cloche fêlée de
l'abbaye… »). Le modèle écrit aussi les noms, inscriptions et indices, avec
validation et un texte de secours. Il ne décide jamais de la structure, ce
qui préserve la résolubilité, la rejouabilité et la validation serveur.

### 7. Formats enchaînés

Le graphe peut découper l'aventure en segments de formats différents : une
enquête pour comprendre où est la clé, puis une plateforme pour l'atteindre,
puis un donjon pour le combat final. La session enregistre la suite des
segments et le serveur les rejoue l'un après l'autre.

### 8. Mémoire du joueur et du voyage

- **Nouveauté par joueur** : le générateur reçoit les familles de règles et
  les thèmes des aventures déjà jouées sur ce voyage, et baisse leur poids.
  La nouveauté est garantie pour ce joueur, pas seulement en moyenne.
- **Inventaire du voyage** : corde, couteau, lanterne ou chien ouvrent des
  branches OU du graphe (des raccourcis ou d'autres solutions, jamais une
  obligation).
- **Conséquences** : l'issue de l'aventure alimente les rumeurs, la
  réputation en ville et les récompenses existantes (`legend-rewards.mjs`).

## Compatibilité

- Nouvelles versions de contenu (`woven-platform-v1`, `woven-investigation-v1`,
  `woven-dungeon-v1`, puis `woven-sequence-v1`). Les anciennes versions
  restent rejouables à l'identique : sessions en cours, sauvegardes et
  historique ne changent pas.
- Le générateur d'une version est figé une fois déployé. Toute évolution qui
  change le résultat passe par une nouvelle version.
- Les nouvelles légendes passent aux versions `woven-*`. Une légende déjà
  découverte mais pas encore jouée peut basculer, puisque son aventure n'a
  pas encore été vue.

## Étapes

1. **Mesure** : empreinte et métriques de variété du générateur actuel
   (combinaisons de règles, longueur de solution, retours en arrière), un
   test qui les calcule, et une page de prévisualisation qui affiche le
   graphe d'une graine.
2. **Moteur de règles** (`legend-rules.mjs`) et réécriture de 3 ou 4
   mécanismes existants en recettes, sans changer les versions en ligne.
3. **Graphe d'énigmes et solveur abstrait**, testés hors moteur : chaque
   graine produit un graphe résoluble, et la variété mesurée dépasse
   nettement celle de l'étape 1.
4. **Donjon `woven-dungeon-v1`** : premier format branché, le plus simple à
   spatialiser (grille). Rejeu serveur, prévisualisation, puis déploiement.
5. **Thème local** (`legend_theme.py`) et récit de la légende alimenté par
   le graphe.
6. **Plateforme `woven-platform-v1`** : modules paramétriques et bot de
   validation.
7. **Enquête `woven-investigation-v1`**.
8. **Formats enchaînés et mémoire du joueur** (nouveauté, inventaire,
   conséquences).

Chaque étape à partir de la 4 est jouable et déployable seule.

## Décisions à prendre

1. Le modèle de langue reste-t-il limité au texte ? (Recommandé : oui.)
2. Durée visée d'une aventure : 10 à 15 minutes comme aujourd'hui, ou plus
   courte mais plus dense ?
3. Formats enchaînés dans une même aventure, ou un seul format par ville ?
4. Une aventure ratée peut-elle avoir une conséquence durable (entrée
   effondrée, trésor perdu), ou reste-t-elle toujours retentable ?
