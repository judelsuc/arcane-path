# Infrastructure, personnages, habillages, accueil des villes et retours joueurs

Plan du 23 octobre 2026. Exigences : R-182 à R-186 dans
[REQUIREMENTS](./REQUIREMENTS.md), en complément de R-155/R-156.

Ce document décrit une cible et un ordre de réalisation, pas une infrastructure
déjà provisionnée. Aucune reprise des données existantes n'est nécessaire.
Les changements locaux des fenêtres, de la boutique et du prompt du parent
restent à livrer séparément ; ils ne sont pas annulés par ce plan.

### Démarrage autorisé et premier socle

Budget confirmé : **100 EUR TTC/mois au total**, VM + base + stockage.
L'implémentation locale est autorisée ; aucune ressource payante n'est créée.
Le devis reste à établir, et la disponibilité d'une offre compatible avec ce
plafond n'est pas présumée.

Premier incrément : [asset_storage.py](../scripts/asset_storage.py) fournit :

- un catalogue privé par portée et identifiant idempotent ;
- des blobs locaux immuables et un adaptateur S3 à écriture conditionnelle ;
- des métadonnées SQLite locales ou PostgreSQL, avec initialisation SQL explicite ;
- la séparation `durable` / `cache`, checksum SHA-256, taille, type et provenance ;
- upload puis relecture vérifiée avant publication SQL ; vérification à la lecture ;
- une erreur explicite pour corruption, conflit ou panne, sans bascule silencieuse ;
- des délais de connexion/lecture bornés et TLS vérifié pour les clients distants.

Les dépendances sont dans [requirements.txt](../requirements.txt). Les adaptateurs
distants utilisent `boto3` et `psycopg` ; ils ne créent ni bucket ni cluster.
`ovh_storage(dsn=..., endpoint=..., region=..., bucket=...)` construit les clients ;
`store.catalogue.initialize()` initialise explicitement la table du catalogue.
La chaîne PostgreSQL doit inclure `sslmode=verify-full`, `connect_timeout` entre
1 et 30 secondes et les paramètres CA nécessaires au service choisi.
Les accès S3 viennent de la chaîne de credentials du SDK, jamais du navigateur.
Ils restent hors Git et hors des arguments d'une commande publique.

La portée fournie au module doit être calculée par le serveur **après**
autorisation : connaître un nom de portée n'est pas une authentification.
Ce module n'ajoute pas de route HTTP ni d'accès public aux objets.
Les références d'objets ne sont pas des URL signées et ne contiennent pas de capacité.

Exemple local, dans un répertoire distinct des données actuelles :

```sh
.venv/bin/python scripts/asset_storage.py --root .cache/storage-foundation \
  put cafe-art.svg --scope preview-world --request cafe-art-v1 \
  --media-type image/svg+xml --retention durable \
  --source repository --license internal --version 1
.venv/bin/python scripts/asset_storage.py --root .cache/storage-foundation \
  verify --scope preview-world --request cafe-art-v1
.venv/bin/python -m unittest discover -s tests -p 'test_asset_storage.py'
```

Le type MIME déclaré est une métadonnée, pas une preuve du format des octets :
les consommateurs image devront conserver leurs validations de décodage.
L'exemple est un outil local d'administration, pas un endpoint d'upload joueur.

**Bornes du premier socle :** pas de migration des bases, pas de file de jobs persistante, pas de pool SQL,
pas de purge/réconciliation automatique ni de synchronisation cloud des parties.
Les tests locaux couvrent les écritures concurrentes, les erreurs, les reprises,
les contrôles de clients SDK et la commande de vérification. Une vraie recette
PostgreSQL/S3 (y compris les écritures conditionnelles sur l'offre OVH retenue)
reste obligatoire avant activation distante. Aucun test simulé ne remplace cette recette.
Sans activation explicite, les stockages historiques restent utilisés.

### Deuxième incrément : premier consommateur et services réels locaux

Les images d'accueil [StartArt](../scripts/start_art.py) utilisent maintenant
le catalogue/blobs lorsqu'une configuration privée est fournie. Le job de
génération et l'API utilisent la même fabrique `StartArt.configured`.
L'image est normalisée en WebP, stockée, relue et vérifiée avant de marquer
l'essai comme prêt. L'API conserve son format et ne révèle pas les clés S3.
Une corruption ou panne du catalogue/S3 donne une erreur explicite 503,
pas une image de remplacement présentée comme réussite.
Un échec de publication conserve l'image précédente et n'autorise pas un
nouvel appel payant le même jour.

Activation facultative : `ARCANE_ASSET_STORAGE_CONFIG_FILE` pointe vers un
fichier JSON serveur régulier, non symlink, permissions 0600, hors Git.
Exemple local :

```json
{"backend":"local","root":"/absolute/private/path/assets"}
```

Format distant, à remplir avec les accès approuvés :

```json
{
  "backend": "ovh",
  "dsn": "host=DB_HOST dbname=DB_NAME user=DB_USER sslmode=verify-full sslrootcert=/private/ca.pem connect_timeout=5",
  "endpoint": "https://S3_ENDPOINT",
  "region": "S3_REGION",
  "bucket": "private-assets"
}
```

Le mot de passe PostgreSQL vient du mécanisme privé de libpq ou du fichier
de configuration privé ; les credentials S3 de la chaîne du SDK.
Pour la cible distante, l'administrateur initialise le catalogue séparément :

```sh
.venv/bin/python scripts/asset_storage.py --configured initialize
```

Le serveur et le timer doivent recevoir **la même configuration** et les
mêmes permissions, sans placer les secrets dans les unités versionnées.
Une configuration invalide échoue explicitement, sans repli vers SQLite.
Sans variable, aucun changement de stockage ni de schéma des essais.
Les images BLOB anciennes restent lisibles dans ce mode historique ; aucune
copie massive n'est faite. Au deuxième incrément, le statut et la réservation
de l'essai journalier restaient dans `start-art.sqlite3` ; cette limite est
levée par le troisième incrément ci-dessous.

Cible confirmée : toutes les instances API, workers et tâches planifiées partagent
le même service PostgreSQL OVH et la même base de référence, y compris pour les
réservations journalières. Il n'y aura pas de base de référence distincte par VM.
La réservation doit y être atomique afin que deux producteurs concurrents ne
puissent pas lancer chacun une génération pour le même jour.

Recette disponible :

```sh
ARCANE_STORAGE_INTEGRATION=1 .venv/bin/python -m unittest discover \
  -s tests -p 'test_asset_storage_integration.py'
```

Elle lance un vrai PostgreSQL 16 et un serveur S3 compatible RustFS épinglé
par digest, sur des ports aléatoires limités au loopback, avec credentials
éphémères et uniquement des fixtures générées localement. Elle vérifie les
transactions concurrentes, l'écriture conditionnelle, les erreurs, la lecture
après redémarrage des deux services et le producteur d'image d'accueil.
Les conteneurs créés sont supprimés à la fin, sans toucher aux autres.
Les images MinIO initialement essayées n'étaient pas accessibles depuis les
registres ; RustFS sert uniquement de cible de test, pas de choix d'hébergement.

Ce test local utilise HTTP/connexion SQL locale dans l'environnement jetable ;
la fabrique OVH conserve HTTPS et `sslmode=verify-full`.
Il ne prouve pas les propriétés réseau/TLS, permissions, quotas ni toutes les
compatibilités de l'offre OVH : cette recette reste à effectuer avant production.
Les tests ordinaires ignorent explicitement les tests Docker si la
variable d'intégration n'est pas activée.

Validation de ce deuxième incrément : les quatre tests d'intégration réels
passent séparément ; la suite Python complète compte 409 tests, dont ces quatre
ignorés dans l'exécution ordinaire (405 exécutés), et les 1 189 tests JavaScript
passent. Le contrôle des dépendances et `git diff --check` passent également.

### Troisième incrément : réservation et état quotidiens partagés

Lorsque le stockage est configuré, la réservation, le statut, le brief et le modèle
de génération sont conservés dans la table `generation_jobs` du **même catalogue
SQL que les assets**. En cible OVH, toutes les instances API, workers et timers
utilisent donc la même base PostgreSQL. Le mode local configuré utilise cette
même table dans le SQLite du catalogue pour le développement.

Une contrainte primaire `(kind, request)` et un `INSERT ... ON CONFLICT DO NOTHING`
réservent atomiquement `title-art` / date de Paris. La transaction est validée
**avant** l'appel payant et aucune connexion SQL n'est gardée pendant celui-ci.
Un autre producteur voit `running`, `ready` ou `failed`, sans refaire l'appel.
L'API lit aussi ce statut partagé et peut servir une image produite par une autre
VM ; elle ne dépend plus du fichier d'essais local de ce producteur.
Une panne SQL échoue explicitement, sans repli vers une réservation locale.

L'administration initialise les tables et leur index avec la commande existante
`scripts/asset_storage.py --configured initialize` ; elle doit être exécutée avant
l'activation du serveur et du timer distants. La commande est idempotente.
En mode configuré, `start-art.sqlite3` n'est ni créé ni lu : l'activation démarre
un historique partagé neuf, sans importer les essais ou images de l'ancien mode.
Tous les producteurs doivent être arrêtés pendant ce basculement, puis redémarrés
avec la même configuration ; mélanger un ancien producteur local et un nouveau
partagé pourrait générer deux fois l'image du jour.
Sans configuration, le chemin historique reste inchangé.

Une interruption après publication de l'asset mais avant validation de l'état
`ready` se répare sans génération supplémentaire :

```sh
.venv/bin/python scripts/start_art.py --recover-published 2026-10-23
```

Cette commande utilise la configuration privée habituelle, ne demande aucun jeton
du générateur et ne fait aucun appel à celui-ci. Elle exige un job existant
et un asset présent dont la taille et le checksum sont vérifiés.
Un asset absent/corrompu n'est pas transformé en réussite. Depuis le cinquième
incrément, un statut `failed` dû à la perte d'un accusé SQL peut aussi être
réconcilié, mais uniquement si l'asset correspondant a réellement été publié
et vérifié ; la commande remet alors les deux registres de jobs en cohérence.
Si l'interruption a eu lieu avant publication vérifiable, l'essai reste `running`
et aucun nouvel appel n'est autorisé pour ce jour ; l'image précédente reste
disponible. Ce choix conserve la règle existante d'une seule tentative quotidienne,
même si le résultat de l'appel payant est inconnu.

Ce registre durable couvre **uniquement le dispatch sans répétition des images
d'accueil**. Ce n'est pas encore une file générique avec leases, reprise automatique
des tâches sûres, quotas globaux ou récupération d'un upload orphelin. Les autres
producteurs d'images et les objets magiques ne sont pas encore basculés.
La recette réelle PostgreSQL/S3 comprend maintenant six tests, dont deux
producteurs concurrents à chemins VM distincts, l'état partagé vu par l'API,
la persistance de la réservation après redémarrage et la récupération d'une
publication sans nouvel appel fournisseur.

Validation de ce troisième incrément : 417 tests dans la suite Python complète,
dont six tests Docker ignorés explicitement (411 exécutés sans échec) ; ces six
tests d'intégration réels passent séparément. Les contrôles des dépendances et
des espaces de fin de ligne passent également.

### Quatrième incrément : baux, reprise sûre et comptabilité des appels

[durable_jobs.py](../scripts/durable_jobs.py) ajoute une file SQL persistante au
même catalogue : `worker_jobs`, `provider_quotas` et `provider_usage`.
L'initialisation administrative existante crée ces tables de façon idempotente.
En PostgreSQL, les workers acquièrent les jobs avec `FOR UPDATE SKIP LOCKED`.
Les baux utilisent l'horloge SQL, un jeton de possession renouvelé à chaque
acquisition et un nombre maximal de tentatives. Un worker dont le bail est expiré
ou repris ne peut plus renouveler ni valider le job.

Une tâche sûre/idempotente interrompue avant finalisation devient réacquérable
après expiration, dans la limite de tentatives. Un appel fournisseur est différent :
`dispatch` réserve transactionnellement les compteurs et valide `dispatched`
**avant** l'appel externe. Après expiration, un job déjà dispatché devient
`uncertain`, jamais automatiquement réexécuté. Une coupure entre validation SQL et
appel peut donc consommer un compteur sans appel réel : c'est une borne prudente,
pas une mesure de facturation. Le handler doit appeler le fournisseur uniquement
après le retour réussi de `dispatch`, jamais réessayer un appel incertain, et
renouveler son bail pendant une opération longue.
Les écritures/effets métier d'une tâche sûre doivent rester idempotents :
un bail ne rend pas une API externe transactionnelle.

**Décision utilisateur du 23 octobre : appels image illimités tant que le service
est gratuit.** Cette décision ne prouve pas un tarif fournisseur et ne change pas
le plafond infrastructure de 100 EUR TTC/mois. Le mécanisme permet des plafonds
journaliers et mensuels UTC, ou une absence de plafond explicitement configurée :

```sh
.venv/bin/python scripts/asset_storage.py --configured initialize
.venv/bin/python scripts/durable_jobs.py quota --provider images \
  --daily unlimited --monthly unlimited
```

Sans ligne de configuration pour le fournisseur d'un nouveau job, `dispatch`
refuse explicitement l'appel. Avec `unlimited`, les appels restent comptabilisés.
Les limites finies, lorsqu'elles sont choisies, sont partagées entre tous les
types de jobs déclarant le même fournisseur, verrouillées avec leur comptabilité
dans la même transaction ; un quota mensuel refusé annule aussi l'incrément
journalier. Les compteurs d'appels ne sont pas des limites de débit par seconde
ni des plafonds financiers.

Premier handler réellement branché : la récupération sûre d'une image d'accueil
déjà publiée, sans appel fournisseur, via :

```sh
.venv/bin/python scripts/start_art.py --queue-recovery 2026-10-23
.venv/bin/python scripts/start_art.py --work-recovery
.venv/bin/python scripts/durable_jobs.py inspect \
  --kind title-recovery --request 2026-10-23
```

Le worker traite au plus un job par invocation, avec un bail de 300 secondes.
Une erreur connue est enregistrée `failed` et remontée ; un processus interrompu
laisse le bail expirer, puis une nouvelle invocation reprend sans génération.
Il n'y a pas de daemon ni de timer supplémentaire activé par cet incrément.

**Périmètre au quatrième incrément :** les appels image existants restent derrière leur registre
`generation_jobs` sans répétition, et ne passent pas encore par les compteurs de
cette nouvelle file. La règle d'une tentative d'image d'accueil par jour reste
inchangée, même avec des quotas illimités. La comptabilité partagée ne couvrira tous
les fournisseurs qu'après raccordement de chaque producteur ; les autres images,
textes et téléchargements ne doivent pas être annoncés comme déjà protégés.
La file générique et le handler de récupération sont disponibles localement ;
aucune configuration distante ni ressource payante n'est créée.

Validation du quatrième incrément : 427 tests dans la suite Python, dont huit
tests Docker ignorés explicitement (419 exécutés sans échec). Les huit tests
réels PostgreSQL/S3 passent séparément, y compris les baux concurrents et les
quotas transactionnels. Les contrôles des dépendances, espaces de fin de ligne
et liens locaux du plan passent également.

### Cinquième incrément : raccordement des trois producteurs d'images

[shared_images.py](../scripts/shared_images.py) est maintenant le chemin commun
des images d'accueil, de carnet et de rencontres en **mode configuré**. Les
fabriques de l'API et des commandes planifiées lisent toutes la configuration
privée `ARCANE_ASSET_STORAGE_CONFIG_FILE`. Sans configuration, le comportement
historique reste inchangé.

Pour chaque image : enregistrement durable du brief symbolique, modèle et version,
acquisition du job précis, réservation des compteurs `images`, puis appel
fournisseur unique, normalisation WebP, renouvellement du bail et publication
vérifiée dans le catalogue/S3. Le job est ensuite marqué prêt. Un même identifiant
avec un brief différent est rejeté ; une image déjà publiée et vérifiée est
réutilisée sans nouvel appel, même après perte de l'accusé de finalisation SQL.
La réconciliation du job n'est permise qu'après relecture intègre de cet asset.

La configuration explicite du fournisseur `images` ci-dessus est donc obligatoire
avant de lancer ces producteurs dans ce mode. Utiliser `unlimited` pour les deux
plafonds, conformément à la décision utilisateur ; ne pas créer de politique par
défaut implicite au démarrage d'une API. Tous les trois partagent les compteurs
UTC, pas trois budgets séparés. Un quota refusé ou une panne empêche l'appel
et donne une erreur visible ; la validation du tarif gratuit dans
`OvhImageWriter` reste inchangée, sans bascule payante.

Identités de requête :

- accueil : date de Paris, en conservant le registre d'une tentative par jour ;
- carnet : hash de la paire propriétaire/clé de page, sans nom ni capability dans
  le payload du job ; les motifs envoyés restent symboliques ;
- rencontres : ID d'image stable, créé avant le dispatch et réutilisable
  explicitement. Le lot planifié utilise un ID dérivé du créneau UTC et de son
  intervalle, identique lors d'un redémarrage dans ce créneau. Une scène différente
  pour le même créneau est un conflit explicite, pas un deuxième appel.

Un appel commencé ou ambigu n'est pas relancé. Le bail est de 900 secondes ;
si le fournisseur dépasse ce délai, le worker ne peut plus publier ni valider :
le résultat reste incertain, sans répétition automatique. L'expiration avant
dispatch reste réacquérable selon la limite de tentatives de la file.
L'intervalle du lot doit être identique sur les instances ; le changer crée
un autre espace de créneaux et exige un arrêt coordonné des producteurs.

**Limite au cinquième incrément :** les files/droits du carnet et les stocks/attributions de
rencontres restent dans leurs SQLite locaux, avec leurs BLOBs de lecture existants.
Les images normalisées sont aussi conservées comme assets durables partagés,
mais leurs autorisations continuent à passer par les API privées actuelles :
aucune route publique d'asset n'est ajoutée. Le registre et les compteurs partagés
empêchent la répétition d'une même requête fournisseur, pas encore les doubles
attributions d'un stock de rencontres entre bases locales distinctes.
Ne pas activer plusieurs API/gestionnaires de stock sur le monde avant
externalisation de ces tables. Aucun import des anciennes images n'est effectué.
Les jobs fournisseur sont exécutés par le producteur qui les demande ; il n'y a
pas encore de daemon distribué capable de reprendre toutes les files historiques.
Les textes et téléchargements n'utilisent pas encore ce chemin image.

Validation du cinquième incrément : 443 tests dans la suite Python complète,
dont dix tests Docker ignorés explicitement (433 exécutés sans échec).
Les dix tests réels PostgreSQL/S3 passent séparément, avec les trois producteurs,
la comptabilité commune, la concurrence et la récupération sans nouvel appel.
Les conteneurs de recette sont supprimés ; les contrôles des dépendances,
des espaces de fin de ligne et des liens locaux passent.

### Sixième incrément : stock et attributions des rencontres partagés

En mode configuré, [EncounterArt](../scripts/encounter_art.py) utilise maintenant
[EncounterStorage](../scripts/encounter_storage.py) pour toutes ses opérations :
stock, observations, attributions, renouvellements et préparation du lot.
Les métadonnées sont dans `encounter_stock` et `encounter_assignments`, dans le
même catalogue SQL que les jobs et assets ; les octets des images sont lus
directement depuis le stockage privé, avec vérification d'intégrité.
Le fichier `encounter-art.sqlite3`, son répertoire et le verrou de fichier du lot
ne sont plus créés ni consultés dans ce mode. Sans configuration, le chemin
historique reste inchangé.

L'initialisation administrative existante crée les tables, l'index et une ligne de
verrou SQL. Pour ce premier jalon, les mutations du stock sont sérialisées avec
un verrou de ligne transactionnel PostgreSQL (ou `BEGIN IMMEDIATE` en développement
SQLite). Ce choix simple borne les courses sur la capacité par propriétaire,
l'ajout d'observations et l'attribution ; aucune transaction n'est gardée pendant
un appel fournisseur ou une lecture S3. Une contrainte `UNIQUE(image_id)` renforce
l'exclusivité des attributions courantes. Un stock déjà réclamé ne redevient pas
disponible quand son ancien détenteur reçoit son renouvellement.

Deux API voient donc les mêmes attributions et les mêmes images ; une répétition
de sync ne crée pas d'observation supplémentaire. La scène d'une occurrence
reste immuable et une demande de lot incohérente est entièrement annulée.
La limite de 2 000 occurrences par propriétaire est partagée, pas par VM.
Les réponses privées gardent le format existant, le modèle/la licence et
`Cache-Control: private, no-store`. Les contrôles de capability existants sont
exécutés avant chaque accès ; une clé S3 n'est pas une autorisation publique.
Une panne de stockage ou une image corrompue remonte en 503 HTTP avec message
neutralisé et journal serveur, sans repli vers SQLite.

Le renouvellement conserve la règle de sept jours : l'ancienne image reste
affichable tant que la nouvelle n'est pas attribuée. Le lot examine le stock
partagé, privilégie les observations en attente, puis équilibre les scènes.
Sa limite de taille porte sur la somme des tailles d'images du stock SQL,
pas sur un fichier SQLite ou le disque d'une VM. Le seuil de disque libre
historique ne s'applique qu'au mode local non configuré.
Ce seuil de stock est un garde-fou avant génération, pas un quota S3 global
ni une réservation d'octets entre producteurs concurrents.

Les entrées de stock non réclamées expirées peuvent être retirées, mais leurs
assets durables ne sont pas supprimés automatiquement : aucune purge de S3 ni
politique globale de rétention n'est ajoutée. Les images réclamées sont conservées.
Si l'image a été publiée dans S3/catalogue mais que l'inscription au stock a
échoué, rejouer le même ID termine l'inscription sans nouvel appel fournisseur.
Le lot conserve sa clé de créneau stable ; un redémarrage dans un autre créneau
ne retrouve pas automatiquement un ID orphelin du précédent.

Avant activation distante, initialiser le schéma et arrêter tous les producteurs
et API pendant le basculement, puis les relancer avec la même configuration.
Le stock partagé démarre neuf, sans import ni suppression des anciennes bases.
L'autorisation des voyages et capacités reste locale, tout comme la file du
carnet : **le jeu complet n'est pas encore prêt pour plusieurs API indépendantes**.
La prochaine étape locale est la file/statuts du carnet, puis les autres états
autoritaires et leurs autorisations. Le verrou global du stock pourra être affiné
si les mesures montrent une contention ; aucun pool SQL n'est ajouté ici.

Validation du sixième incrément : 454 tests dans la suite Python complète,
dont douze tests Docker ignorés explicitement (442 exécutés sans échec).
Les douze tests réels PostgreSQL/S3 passent séparément, y compris l'attribution
concurrente exclusive, la lecture inter-instance, le renouvellement et la
conservation des attributions après redémarrage des deux services.
Les conteneurs de recette sont supprimés ; dépendances, espaces de fin de ligne
et liens locaux du plan sont vérifiés.

### Septième incrément : file et statuts des illustrations du carnet partagés

[JournalStorage](../scripts/journal_storage.py) prend en charge la file, les
briefs, statuts, dates et durées dans `journal_illustrations`, dans le même SQL
partagé que les assets, jobs et rencontres. Le schéma est créé par la commande
administrative d'initialisation existante ; aucune création implicite de schéma
PostgreSQL au démarrage d'une API.
En mode configuré, [JournalArt](../scripts/journal_art.py) ne crée ni ne lit
`journal-art.sqlite3` : les images sont servies depuis les assets privés et
vérifiées à chaque lecture. Sans configuration, son comportement SQLite initial
est conservé. Le mode partagé commence neuf, sans import ni suppression des
anciens fichiers ; tous les producteurs doivent être basculés ensemble.

Le premier enqueue d'une paire propriétaire/page conserve son brief et sa recette ;
une demande répétée ne reroule pas l'image. Les limites existantes sont désormais
globales : 366 images par propriétaire, 1 000 au total et 32 jobs queued/running.
Le contrôle des limites et l'insertion sont transactionnels, sous verrou de ligne
SQL commun. L'acquisition des travaux utilise le même verrou, sans le conserver
pendant la génération ou une lecture S3. Chaque travail reçoit un jeton de
possession et un bail de 1 200 secondes ; un worker expiré ou remplacé ne peut
pas modifier son statut.

Un nouveau service ne transforme plus les travaux `running` d'un autre en
échecs au démarrage. Un worker d'une autre instance prend un travail en attente
ou dont le bail a expiré :

- avant dispatch fournisseur, il peut poursuivre la génération avec les contrôles
  partagés du chemin image ;
- après publication vérifiée de l'image, il termine l'état de la page sans
  rappeler le fournisseur ;
- après un dispatch incertain sans asset vérifiable, il marque l'échec visible
  avec l'explication « no retry », sans répéter l'appel.

La file de pages reste distincte du registre de dispatch image : les deux baux
ne sont pas une transaction avec le fournisseur. Une expiration du bail image
de 900 secondes interdit sa publication tardive ; le bail de page est de
1 200 secondes. Il n'y a pas de heartbeat de page ni de nouveau daemon activé.
Les workers locaux réveillés au démarrage ou par les requêtes `sync`/`enqueue`
drainent la file partagée ; une expiration seule ne réveille pas un processus
inactif. Une nouvelle requête, un redémarrage ou un autre worker actif est
nécessaire à la reprise. Les erreurs connues sont conservées comme `failed`,
sans nouvelle tentative payante.

Le format public des entrées et les contrôles de capability restent inchangés.
Une image n'est servie qu'à son propriétaire autorisé et quand sa page est prête ;
le navigateur reçoit toujours `private, no-store`. Corruption et panne SQL/S3
remontent en 503 neutralisé, avec trace serveur ; aucun repli local n'est effectué.
Les réponses de page n'exposent ni jetons de bail ni clés d'assets.

**Limites restantes :** les voyages, capacités et gardiens utilisés par
`JournalArt.authorize` ne sont pas externalisés ici. Une instance ne peut donc
pas encore autoriser un voyage qui n'existe que dans le SQLite d'une autre.
Les images partagées ne rendent ni ces autorisations ni le monde entier
multi-instance ; leur externalisation est le prochain jalon, avant activation
de plusieurs API indépendantes. Pas de purge S3, pool SQL ou provisioning OVH.

Validation du septième incrément : 465 tests dans la suite Python complète,
dont quatorze tests Docker ignorés explicitement (451 exécutés sans échec).
Les quatorze tests réels PostgreSQL/S3 passent séparément : file conservée après
redémarrage, workers concurrents, jeton de possession, état partagé et récupération
d'asset sans nouvel appel fournisseur. Les tests HTTP vérifient les lectures
privées, le refus d'une capability invalide et l'erreur 503 en cas de corruption.
Les conteneurs PostgreSQL/RustFS sont supprimés après recette ; dépendances,
espaces de fin de ligne et liens locaux du plan sont vérifiés.

### Huitième incrément : voyages et autorisations partagés

[JourneyStore](../scripts/journeys.py) possède maintenant une fabrique configurée,
utilisée par l'API. En mode configuré, les départs immuables sont conservés dans
la table `journeys` du même catalogue SQL que les images et jobs ; aucune base
locale `journeys.sqlite3` n'est créée ni consultée.
Le checksum, la version du contenu, le seed, le profil, l'histoire du parent
et l'identifiant de requête restent épinglés dans le même payload qu'avant.
Une requête concurrente ou rejouée sur une autre API retrouve exactement le même
départ ; un changement de nom/région pour cette requête est toujours refusé.
La limite de 1 000 voyages est globale et laisse fonctionner les relectures.

[AbandonedJournals](../scripts/abandoned_journals.py) hérite de ce choix de
stockage : capacités, gardiens et leur source, carnets abandonnés, contenu partagé
et rumeurs sont maintenant dans ce même SQL. Externaliser tout ce cycle évite
qu'une capacité partagée autorise des mutations d'un carnet local divergent.
Les autres consommateurs (`JournalArt`, lore, indices) utilisent les mêmes méthodes
et lisent donc aussi les capacités partagées, sans changement du contrat public.
Une capacité est conservée uniquement sous forme de digest SHA-256 ; elle ne
devient ni une clé S3 ni un compte utilisateur.

[journey_storage.py](../scripts/journey_storage.py) définit les tables et un
adaptateur SQL limité aux placeholders et au contrat de lignes des stores.
Le SQL métier est explicite et portable (`ON CONFLICT`), pas traduit à partir
d'instructions SQLite arbitraires. Les rumeurs partagées ont une séquence SQL
explicite pour conserver l'ordre d'acquisition, sans dépendance à `rowid`.
L'initialisation administrative existante crée les tables et deux lignes de verrou.

Les créations sont sérialisées par un verrou transactionnel `journeys` et les
mutations de carnets par un verrou `notebooks`, distincts, dans PostgreSQL
(ou transactions `BEGIN IMMEDIATE` dans le catalogue SQLite de développement).
Ces verrous conservent les invariants de capacité, liaison exclusive d'une
capability, gardien/source, publication idempotente, détenteur unique, progression,
libération et expiration des claims de sept jours. Un enregistrement de gardien
incompatible est entièrement annulé ; une course entre deux capacités pour le
même voyage ne peut pas remplacer le gagnant.
La création du départ garde le verrou pendant la construction de l'histoire,
comme la transaction historique ; aucun pool ni optimisation de cette durée
n'est ajouté. Les transactions restent soumises aux timeouts SQL configurés.

La création du voyage et la liaison de sa capacité restent deux transactions
successives, comme auparavant. Si la seconde échoue, le même `requestId` et
la même capacité permettent de reprendre sans recréer de départ ; aucun accusé
de création réussie n'est envoyé avant la liaison demandée. Un accès inconnu
ou une mauvaise capacité reste refusé. Une panne SQL remonte explicitement
en 503 neutralisé, sans création d'une base locale de secours.
Le répertoire de cache des autres services encore locaux est créé explicitement
par le serveur : son existence ne dépend plus du démarrage d'une base de voyages.

Le contenu des carnets volontairement publiés reste pour cet incrément un JSON
SQL (photos encodées comprises), avec les mêmes validations et borne de 48 MiB ;
ce n'est pas encore une externalisation de ces photos vers S3. La progression
ordinaire des joueurs reste dans la sauvegarde navigateur : partager les départs
et capacités ne crée pas une synchronisation cloud complète des parties.
Les caches de chemins et sources restent également locaux/recalculables.

Activation : initialiser le catalogue partagé, arrêter les anciens producteurs/API,
puis relancer toutes les instances avec la même configuration. Départ neuf,
sans import ni suppression des anciennes bases. Sans configuration, les
stockages historiques restent utilisés et leur schéma est inchangé.
Les illustrations privées peuvent désormais être autorisées depuis une autre
instance, mais les objets magiques, contrats/POI de quêtes et textes générés
restent à externaliser : **pas encore d'activation multi-instance du jeu entier**.

Validation : 475 tests dans la suite Python complète, dont seize tests Docker
ignorés explicitement (459 exécutés sans échec). Les seize tests réels PostgreSQL/S3
passent séparément, avec création concurrente, liaison de capacité exclusive,
gardien et lecture d'image privés inter-instances, claims concurrents, rumeurs,
expiration et conservation des voyages/capacités après redémarrage des services.
Deux serveurs HTTP locaux vérifient aussi création/rejeu, autorisation croisée,
refus d'accès et 503 SQL neutralisé. Les conteneurs de recette sont supprimés ;
contrôles des dépendances et espaces de fin de ligne réussis.

### Neuvième incrément : objets magiques de la partie principale

[MainArtifacts](../scripts/main_artifacts.py) hérite maintenant du stockage choisi
par les voyages. En mode configuré, le monde, la garde des 22 objets, les sessions
d'exécution et les reçus de commandes sont conservés dans
`main_artifact_world`, `main_artifact_sessions` et `main_artifact_receipts`.
Le fichier `main-artifacts.sqlite3` n'est ni créé ni lu.
[artifact_storage.py](../scripts/artifact_storage.py) définit les tables, l'index
des sessions et le verrou partagé, créés par l'initialisation administrative
existante. Les instances utilisent le même catalogue PostgreSQL que les voyages,
capacités, images et jobs.

Chaque requête autorisée prend le verrou SQL `main-artifacts` avant de relire son
reçu, le monde et sa session. Les changements de garde, pouvoirs, remises en cache,
coûts/révisions de session et l'insertion du reçu sont validés **ensemble**, dans
une transaction. Deux prises concurrentes ne peuvent pas attribuer le même objet ;
un rejeu sur une autre instance retourne le reçu exact sans rappeler le moteur,
ni repayer le coût. Un même identifiant avec un contenu différent est refusé.
La capacité de reçus reste globale ; un reçu existant est relisible même lorsque
la limite est atteinte.

Un échec d'écriture du reçu annule aussi les écritures du monde et de la session ;
le client peut rejouer la même commande sans double effet après retour du service.
Les checksums du monde et des sessions restent vérifiés avant usage. Les fins de
partie et les sessions inactives depuis 30 jours libèrent les objets selon les
règles existantes, dans cette même transaction partagée. Les objets ne sont pas
dupliqués lors d'un départ depuis une autre région. Les mutations n'altèrent pas
le départ immuable et ne synchronisent pas automatiquement la sauvegarde navigateur.

Le moteur de règles reste le worker Node existant. Le verrou SQL est conservé
pendant la préparation/validation de la commande et l'appel au moteur, sans
ajouter de génération payante. Les caches de terrain/routes restent locaux :
une préparation incomplète donne toujours une erreur réessayable et ne publie
pas de reçu de réussite. Le verrou global privilégie ici la correction ; les
timeouts et la contention doivent être mesurés avant une montée en charge.
Pas de pool de connexions ajouté dans ce jalon.

Les tables sont explicitement distinctes de celles de
[LorePlaytest](../scripts/lore_playtest.py) : le prototype reste local et isolé,
même lorsque les voyages sont partagés. Aucune donnée de ce prototype n'est
importée dans le monde principal. Sans configuration, les tables historiques
`world`/`sessions`/`receipts` restent dans leur SQLite habituel ; leurs écritures
utilisent les mêmes upserts portables et le même comportement transactionnel.
Avant bascule distante : initialiser le catalogue, arrêter les API, puis les
relancer avec la même configuration. Départ neuf, sans import ni suppression
des anciennes bases.

Validation : 485 tests dans la suite Python complète, dont dix-huit tests Docker
ignorés explicitement (467 exécutés sans échec). Les dix-huit tests réels
PostgreSQL/S3 passent séparément, notamment garde exclusive concurrente,
rejeu inter-instance, annulation après échec tardif du reçu et conservation
du reçu après redémarrage des services. Les tests locaux vérifient aussi pouvoirs,
remise en cache/transfert, fin de partie, libération après inactivité, corruption,
capacité de reçus, isolation du prototype et réponses HTTP 403/409/503.
Les conteneurs de recette sont supprimés ; contrôles des dépendances et espaces
de fin de ligne réussis.

**Limites à la fin de ce neuvième incrément :** les destinations/contrats de quêtes et les textes générés
restent locaux. Le monde complet ne doit pas encore être activé sur plusieurs
API indépendantes. Étapes suivantes : états de quêtes/textes, pool SQL,
devis A et recette OVH. Aucun déploiement ni service payant créé.

### Dixième incrément réalisé : destinations de quêtes et textes partagés

En mode configuré, [QuestDestinations](../scripts/quest_destinations.py) et
[LiveNarrative](../scripts/live_narrative.py) utilisent le même catalogue SQL
que les voyages, carnets, images et objets. Les schémas sont définis dans
[content_storage.py](../scripts/content_storage.py) et initialisés avec le
catalogue. Aucun fichier SQLite de destinations ou de textes n'est créé dans
ce mode ; le fonctionnement historique sans configuration reste inchangé.

- **Quêtes géographiques :** requête et modèle rédigé conservés, identité
  propriétaire/nonce stable, résultat durable et cache POI public réutilisable
  entre instances. Une transaction avec verrou SQL couvre l'admission et la
  prise de travail ; limites communes de seize travaux actifs et mille instances
  par propriétaire. Un bail de cinq minutes et un jeton excluent les résultats
  tardifs. Une découverte interrompue peut être reprise, au plus trois tentatives ;
  l'épuisement devient un échec explicite. Une erreur de fournisseur normalement
  observée reste un résultat d'échec durable, sans relance automatique.
- **Textes :** entrées privées filtrées, versions, sorties bilingues, statuts et
  compteurs d'appels/tokens partagés. Le verrou SQL protège l'admission (trente-deux
  travaux actifs) et l'enregistrement du départ avant l'appel réseau. Les appels
  ne tiennent pas de transaction ouverte pendant le réseau. Un autre service
  peut prendre un travail encore en file, mais démarrer un service ne modifie
  pas un appel actif. Après expiration du bail de cinq minutes, un appel engagé
  passe en échec visible, avec facturation inconnue conservée, sans répétition
  automatique ; un résultat tardif ne peut plus être publié.
- **Autorisation :** mêmes contrats et capacités privées que précédemment ;
  aucune nouvelle route publique ni copie locale de secours lors d'une erreur SQL.

Les workers sont réveillés au démarrage et par les requêtes. Aucun nouveau
daemon, timer de reprise périodique, pool de connexions ou quota global de
dépense/débit pour les textes et téléchargements n'est ajouté. La comptabilité
des textes ne constitue pas un tel quota ; le choix « illimité » concernait
les images et n'est pas étendu implicitement aux textes.

Validation : suite Python complète de 505 tests, dont 28 tests Docker ignorés
explicitement : **477 exécutés sans échec**. Les **28 tests PostgreSQL/S3 réels**
passent séparément. Les dix nouveaux scénarios communs aux deux moteurs couvrent
déduplication concurrente, limites globales, cache POI partagé, reprise bornée,
rejet des sorties tardives, démarrage pendant un appel actif, conservation des
textes et de la comptabilité, absence de répétition d'un appel expiré,
autorisation et erreur SQL sans repli local. Dépendances et contrôle des espaces
validés ; conteneurs de recette supprimés.

**Limites à la fin du dixième incrément :** la progression et les contrats de quêtes présents dans
la sauvegarde du navigateur ne sont pas une sauvegarde cloud. Les autres caches,
chemins et états serveur doivent encore être audités avant activation complète
de plusieurs API. Restent notamment pool SQL, politiques fournisseurs
textes/téléchargements, devis A et recette OVH. Aucun déploiement, import
d'anciennes données ou service payant créé.

### Onzième incrément : pool PostgreSQL borné et audit des persistances restantes

Le catalogue OVH de [asset_storage.py](../scripts/asset_storage.py) utilise
désormais le pool officiel `psycopg-pool`, déclaré dans les dépendances :

- Création fermée, ouverture au premier accès SQL ; aucun accès réseau ni
  initialisation de schéma lors de la construction des clients.
- Zéro connexion minimale, quatre au maximum **par catalogue/processus**,
  seize demandes en attente au maximum et cinq secondes pour obtenir une
  connexion. Les délais SQL restent trente secondes par instruction et cinq
  secondes pour les verrous. L'attente d'une connexion n'est pas un délai global
  pour toute une requête HTTP ou une transaction.
- Validation de la connexion avant utilisation ; remplacement d'une connexion
  inactive coupée. Validation ou annulation de la transaction avant restitution
  au pool, y compris après une erreur applicative.
- Saturation/indisponibilité : erreur de stockage explicite et réponse HTTP 503
  assainie, sans connexion hors pool, repli SQLite ou répétition automatique de
  la transaction applicative. Le pilote peut remplacer/rétablir ses connexions,
  mais cela n'autorise pas à répéter un appel fournisseur au résultat inconnu.
- Une seule fabrique de stockage pour une API : voyages, carnets, titre,
  illustrations, rencontres, quêtes, textes et objets réutilisent le catalogue
  du voyage. L'arrêt de l'API attend ses workers avant de fermer le pool.
  Fermeture de secours à la sortie du processus pour les commandes autonomes.

Le pool n'est pas un proxy PostgreSQL global. Le budget maximal doit sommer
`4 × (processus API + workers autonomes + commandes administratives simultanées)`,
puis réserver les connexions d'administration/supervision exigées par l'offre
OVH. Ne pas choisir le nombre d'instances sans connaître la limite réelle du
service ; aucune capacité OVH ni conformité au budget de 100 EUR TTC/mois
n'est déduite de ces paramètres. Pas de nouvelle configuration privée requise,
de migration de données ou de service payant.

#### Audit local : ce qui bloque encore plusieurs API indépendantes

Lecture du code courant, pas nouvelle inspection ni modification de production.
Le tableau ci-dessous complète l'inventaire historique de la section 1.

| Surface et source | État actuel / risque | Suite nécessaire avant activation |
|---|---|---|
| Origines personnalisées, [ChunkStore](../scripts/travel_server.py) | **Résolu depuis le douzième incrément** : carte/manifeste partagés en SQL et source OSM immuable en S3 ; registre chargé à la demande. Le cache source local est réhydratable. Une ancienne origine locale non publiée bloque le mode partagé explicitement. | Garder version de carte et SHA-256 cohérents ; versionner/reconstruire explicitement une carte obsolète. Les chunks hors de la carte de départ restent des caches locaux à externaliser séparément. |
| Routes du parent et affectations par voyage, [ParentPaths](../scripts/parent_paths.py) | **Résolu depuis le treizième incrément** : affectations/jobs SQL partagés et routes immuables en asset privé ; JSON local seulement comme cache réhydratable. | Le terrain/chunks utilisés au premier calcul restent locaux ; externaliser ensuite les jobs et snapshots de chunks. Garder distinctes route de voyage, trajet lore et prototype. |
| Terrain, sources OSM et altitudes, [ChunkStore](../scripts/travel_server.py) | **Partiellement résolu au quatorzième incrément** : grilles et altitudes complètes en assets S3 privés avec manifeste SQL ; baux et admission globale de deux calculs, cooldown elevation 429 partagé. Sources OSM brutes et leurs téléchargements restent locaux. | Partager ensuite sources OSM et leurs téléchargements ; externaliser météo, hébergements, événements et leur admission/cooldowns. Préserver provenance/version et les données épinglées avant purge. |
| Météo historique, [WeatherStore](../scripts/travel_server.py) | Cache checksummé local ; verrou et cooldown en mémoire. | Cache public partagé et politique fournisseur commune ; ce n'est pas une récompense ou une sauvegarde joueur. |
| Hébergements, [Accommodations](../scripts/accommodations.py) | Résultats OSM locaux et catalogue DATAtourisme SQLite importé, lu en lecture seule. Progression/admission locales. | Versionner/distribuer le catalogue en lecture seule, partager résultats et coordination des téléchargements. Ne pas traiter cet export SQLite comme la base transactionnelle du monde. |
| Villes et événements, [TownTrailStore](../scripts/town_trail.py), [LivingWorld](../scripts/living_world.py) | Villes issues du catalogue local du paquet par défaut ; cache réseau de villes si mode en ligne, cache local d'événements publics. Tâches/progression en mémoire. | Distribuer la même version du catalogue ; cache versionné/TTL et jobs partagés pour les chemins réseau ; conserver fraîcheur, crédits et absence de couverture. |
| Files géographiques, [ChunkJobs](../scripts/travel_server.py) | Capacités et déduplication en mémoire, uniquement par API. | Admission/leases durables communes aux téléchargements. Un pool SQL seul n'externalise pas ces files. |
| Transports, [JourneyTransport](../scripts/journey_transport.py) | Horaires calculés depuis les mêmes snapshots datés du paquet et les cartes ; pas de nouvelle base mutable dans ce composant. | Déployer les mêmes snapshots/versions et rendre les origines accessibles ; ne pas annoncer une couverture réseau temps réel. |
| Atelier et prototype, [Workshop](../scripts/content_factory.py), [LorePlaytest](../scripts/lore_playtest.py) | SQLite locaux distincts, hors monde principal partagé. | Garder isolés ; si l'atelier devient multi-instance, externaliser séparément son admission, ses résultats et sa comptabilité. Pas d'import implicite du prototype. |
| Carnets et sauvegardes navigateur | Photos de carnets publiés encore encapsulées dans le contenu SQL ; progression ordinaire et photos personnelles locales au navigateur. | Envisager assets privés pour les grosses photos SQL ; ne pas confondre infrastructure partagée et sauvegarde cloud complète. |

**Ordre suivant recommandé :** sources OSM brutes et téléchargements partagés,
puis météo, hébergements, événements et leurs admission/cooldowns ; compléter
la politique fournisseur des textes sans supposer une gratuité ou un quota
illimité approuvé. Recette finale OVH et devis restent indispensables. Le monde
complet n'est toujours pas déclaré prêt pour plusieurs API indépendantes.

Validation de cet incrément : suite Python complète de **511 tests**, dont
**32 tests Docker ignorés explicitement**, soit **479 exécutés sans échec**.
Les **32 tests PostgreSQL/S3 réels** passent séparément. Les quatre nouveaux
scénarios réels vérifient réutilisation et options SQL, annulation des
transactions SQL/applicatives, fermeture, bornes de connexions/file/attente,
remplacement d'une connexion coupée, partage du catalogue dans l'API et
réponse HTTP 503 assainie pendant la saturation, puis retour au service.
Les tests locaux vérifient aussi l'ouverture paresseuse, l'absence de repli
hors pool et une seule fabrique de stockage par API. Dépendances et espaces
validés ; aucun conteneur PostgreSQL/RustFS de recette restant.
Aucun déploiement ni commit réalisé.

### Douzième incrément : origines personnalisées partagées

En mode stockage configuré, [ChunkStore](../scripts/travel_server.py) publie
la carte de départ compacte et son manifeste `custom_origins` dans PostgreSQL,
ainsi que la source OSM compressée comme asset durable privé. Le manifeste
contient des empreintes SHA-256 vérifiées, l'identité déterministe du snapshot
et sa taille ; l'asset porte sa provenance OpenStreetMap, licence ODbL et
version. Aucun snapshot complet n'est copié en SQLite/S3 à chaque lecture.

- Une autre API découvre les origines partagées, récupère la carte par son ID et
  charge l'origine référencée par un voyage, transport, chemin ou requête de
  terrain avant usage.
- Le snapshot OSM est récupéré et vérifié par SHA-256 lorsque le cache source
  local manque ou est corrompu ; il sert ensuite à reconstruire la source d'un
  chunk à l'intérieur de la carte de départ sans nouvel appel réseau. Les
  chunks extérieurs, leurs altitudes, verrous et cooldowns restent locaux.
- La création utilise un bail PostgreSQL commun de dix minutes. Un seul worker
  télécharge/génère une origine donnée ; après expiration, un nouveau bail peut
  reprendre. La publication SQL vérifie le jeton actif dans sa transaction ;
  un ancien worker ne peut publier une carte après perte du bail. Les sources
  immuables sont adressées par origine et SHA, de sorte qu'une source tardive
  ne remplace pas la version gagnante.
- Une ancienne origine trouvée seulement sur disque local entraîne une erreur
  explicite au démarrage du mode partagé : pas de repli silencieux, pas de
  migration automatique et pas de perte discrète d'un voyage qui la référence.
  La remise à niveau d'une carte partagée après changement de version du
  rasteriseur demande une reconstruction explicitement versionnée.

La taille de snapshot reste soumise à la limite d'asset de 12 MB. Cette étape
ne partage pas les chunks ordinaires hors carte de départ, les routes épinglées,
l'admission globale des téléchargements OSM d'autres chunks ni les caches météo,
hébergements et événements. Le pool SQL n'en fait pas un stockage partagé.

Validation : quatre tests locaux couvrent relecture après redémarrage, partage
entre deux workers, refus d'une carte altérée et fencing d'un bail expiré. Un
test réel PostgreSQL/S3 exerce l'admission concurrente (un seul téléchargement),
la publication, le démarrage d'une API indépendante, les routes HTTP de liste et
carte, puis la réhydratation du snapshot après perte du cache local et la
construction de terrain sans réseau OSM.
Validation finale après intégration : suite Python de **516 tests**, dont
**33 tests Docker ignorés explicitement**, soit **483 tests exécutés sans
échec**. Les **33 tests PostgreSQL/S3 réels** passent également. Le contrôle des
dépendances et des espaces est propre ; aucun conteneur de recette ne reste.
Le mode partagé refuse aussi explicitement une origine référencée mais absente
du catalogue.

### Treizième incrément : routes parent épinglées partagées

En mode stockage configuré, les affectations des routes épinglées sont
désormais détenues par PostgreSQL dans `parent_path_assignments`. Une affectation
stable par voyage/étape (ou position pour une route lore) désigne un asset
immuable privé dans S3. Les géométries ne sont pas retournées par la lecture de
l'API ; elles sont vérifiées par empreinte puis matérialisées dans le cache JSON
local attendu par les consommateurs internes.

- Les créations sont coordonnées par baux et jetons de fencing SQL. Les
  reprises après expiration ne permettent pas à un ancien worker de publier
  une affectation ; les tentatives sont bornées et l'admission globale limite
  à deux les calculs actifs.
- Les autres API réutilisent la route déjà épinglée au lieu de recalculer et
  sélectionner un itinéraire différent. Routes de voyage et variantes lore
  restent distinctes, y compris les coordonnées négatives des positions lore.
- Les consommateurs internes qui lisent encore directement les fichiers
  locaux reçoivent une route réhydratée avant usage. Le mode historique local
  conserve son comportement existant.
- Le calcul initial dépend encore des chunks/élévations locaux. Cette étape ne
  partage pas les sources OSM ordinaires, les chunks, leurs téléchargements ni
  les autres caches géographiques.

Validation : les tests ciblés `ParentPaths`, stockage d'assets, artefacts
principaux et lore passent (**74 tests**). La suite Python complète passe :
**522 tests**, dont **34 ignorés explicitement**, soit **488 exécutés sans
échec**. Les **34 tests PostgreSQL/S3 réels** passent également. Le test
d'intégration vérifie qu'une seconde instance relit la route épinglée sans la
recalculer ; les conteneurs de recette sont nettoyés. `pip check` et
`git diff --check` sont propres. Ces changements sont inclus dans le checkpoint
de prévisualisation du 23 octobre ci-dessous.

### Quatorzième incrément : grilles de terrain partagées

En mode stockage configuré, chaque tuile de terrain complète (grille et
élévations disponibles) est publiée comme asset privé immuable S3, indexée dans
`travel_chunk_cache` par région, empreinte du snapshot, version du pipeline et
coordonnées. Les autres API vérifient le manifeste SQL puis réhydratent le
cache JSON local ; un cache local correspondant évite une nouvelle lecture S3.
Les caches locaux compatibles avec le pipeline précédent sont migrés à la
première lecture sans retéléchargement ni nouveau rasteriseur.

- Un bail PostgreSQL fencé par tuile déduplique calcul et appels d'élévation
  simultanés. L'admission globale limite à deux calculs actifs, les reprises
  sont bornées à trois tentatives et les résultats tardifs ne remplacent pas le
  gagnant. Une file locale conserve sa capacité existante par API.
- Le cooldown d'élévation HTTP 429 est maintenant commun à toutes les API ;
  l'erreur de service reste visible et la grille existante reste utilisable.
- Les anciennes grilles locales sont publiées à la demande dès le prochain
  accès en mode partagé ; il n'y a ni migration massive au démarrage ni
  suppression de données.
- Les sources OSM brutes ordinaires restent locales. Un nouveau nœud ayant
  besoin d'une tuile non encore publiée peut donc encore télécharger/rasteriser
  sa source OSM ; partage des sources et admission des téléchargements restent
  la prochaine tranche cache. Météo, hébergements, villes et événements ne sont
  pas externalisés ici.

Validation : **50 tests ciblés** passent, couvrant cache local, migration
compatible, cache partagé, checksum, cooldown et routes. La suite Python
complète passe : **525 tests**, dont **35 ignorés explicitement**, soit
**490 exécutés sans échec**. Les **35 tests PostgreSQL/S3 réels** passent
également ; un test à deux services concurrents confirme un unique calcul et
la réutilisation de la même grille. Les conteneurs de recette sont nettoyés,
`pip check` et `git diff --check` passent. Déployé sur la prévisualisation OVH
dans le checkpoint `4934a99d610df71469e6a397fd1accccac671b85`; le mode partagé
reste inactif faute de services PostgreSQL/S3 et de configuration sur cette VM.

## 1. État actuel : où vont les données ?

Inventaire fondé sur le code du checkpoint de prévisualisation
`4934a99d610df71469e6a397fd1accccac671b85`, installé le 23 octobre. La VM
continue d'utiliser son mode local faute de configuration PostgreSQL/S3 ;
les caches restent sur le disque existant.
Le runtime est dans `/opt/arcane-path` ; les données serveur sont principalement
sur le disque de la VM, sous `/var/lib/arcane-path/cache/travel`.
Le mot « cache » recouvre aujourd'hui aussi des données irremplaçables.

| Famille | Aujourd'hui | Conséquence |
|---|---|---|
| Objets magiques de la partie principale | `main-artifacts.sqlite3`, via [MainArtifacts](../scripts/main_artifacts.py) et [LorePlaytest](../scripts/lore_playtest.py) : monde, sessions, reçus ; monde sérialisé/checksummé | Garde unique et commandes durables, mais couplées à SQLite et à une transaction locale ; ce n'est pas un fichier de cache à purger |
| Prototype des objets | `lore-playtest.sqlite3`, distinct du monde principal | Ne pas importer ce prototype comme état du monde de production |
| Départs des voyages | `journeys.sqlite3`, [JourneyStore](../scripts/journeys.py) | Le serveur garde le départ canonique, pas toute la progression ordinaire |
| Carnets perdus et capacités | `abandoned-journals.sqlite3`, [AbandonedJournals](../scripts/abandoned_journals.py) : capacités, carnets, détenteurs, rumeurs, contenu | Données privées et partagées, avec attribution exclusive des carnets |
| Quêtes géographiques | `quest-destinations.sqlite3`, [QuestDestinations](../scripts/quest_destinations.py) | Instances/POI côté serveur ; progression et contrats de services aussi présents dans la sauvegarde du navigateur |
| Textes générés | `live-narrative.sqlite3`, [LiveNarrative](../scripts/live_narrative.py) : entrées, sorties, statuts et comptabilité | Les textes conservés ne sont pas à régénérer à chaque lecture ; worker et verrou en mémoire du processus |
| Images générées | `journal-art.sqlite3`, `start-art.sqlite3`, `encounter-art.sqlite3` : images BLOB et métadonnées, [JournalArt](../scripts/journal_art.py), [StartArt](../scripts/start_art.py), [EncounterArt](../scripts/encounter_art.py) | Images et attribution d'occurrence sur le disque ; des images du carnet sont aussi épinglées côté navigateur |
| Atelier de contenu | Par défaut `.cache/content-factory/workshop.sqlite3`, [ContentFactory](../scripts/content_factory.py), indépendant du service de voyage | À inventorier avec les autres jobs/productions ; son chemin ne doit pas être supposé identique au cache de voyage |
| Terrain et sources | Grilles/altitudes terminées partagées via SQL/S3 en mode configuré ; sources OSM ordinaires, météo et monde vivant encore en caches locaux de [ChunkStore](../scripts/travel_server.py) | Les sources et données météo/monde vivant restent locales à chaque VM ; les données statiques sont distribuées dans le paquet Git |
| Chemins | Routes communes et affectations par voyage partagées via SQL/S3 en mode configuré ; JSON/checksums locaux réhydratables, [ParentPaths](../scripts/parent_paths.py) | Distinguer résultat recalculable et chemin déjà épinglé pour un voyage |
| Photos/documentation externes | Wikipedia/Commons/OSM et autres fournisseurs via [CellContent](../cell-content.mjs) ; cache IndexedDB [ContentCache](../content-cache.mjs) | Aujourd'hui essentiellement téléchargés et conservés par navigateur, pas un catalogue S3 commun |
| Progression personnelle | Sauvegarde locale [JourneySave](../journey-save.mjs), photos/carnets IndexedDB [PhotoJournal](../photo-journal.mjs) | Pas de reprise cloud complète ; une autre machine ne retrouve pas automatiquement le voyage |
| Assets livrés | Modules, CSS, images historiques, audio et catalogues dans Git/paquet du runtime | Leur distribution est distincte de la persistance du monde |

Les sauvegardes de déploiement runtime/SQLite sont également sur la VM.
Elles permettent un retour arrière local mais ne remplacent pas un plan de
reprise après perte du disque ou de la région.

### Limites de passage à l'échelle

- Des écritures SQLite, verrous Python, files de threads, verrous de fichiers et
  timers systemd supposent un hôte/processus coordinateur.
- Ajouter une deuxième API sans changer ces mécanismes peut multiplier les
  générations, les téléchargements ou les actions concurrentes.
- Mettre SQLite dans S3 ou monter S3 comme disque partagé ne résout pas cela.
- Une base hébergée ne rend pas les déplacements, les récompenses et tous les
  compteurs clients subitement autoritaires. Cette limite reste explicite.

## 2. Architecture recommandée

```text
Navigateur : rendu, préférences, sauvegarde locale et cache de lecture
                      |
              API de jeu authentifiée
                 /             \
       PostgreSQL OVH       Object Storage S3 OVH
       état + métadonnées   images + fichiers immuables
       contrats + reçus    terrain + packs graphiques
       jobs + mémoires     provenance et versions associées
                 |
           workers bornés
      génération, géographie, préparation et images
```

### PostgreSQL : ce qui doit être transactionnel

Un cluster géré au départ, avec tables/domaines séparés plutôt qu'un service
par fonctionnalité : mondes, objets et détentions, voyages, carnets, capacités,
quêtes, personnages, rencontres, souvenirs, jobs, textes, métadonnées d'assets.

Pour les objets, privilégier une ligne par instance avec propriétaire/position,
révision et contraintes de garde ; ne pas recopier sans réflexion un gros
document de monde réécrit à chaque commande. Une collecte, son reçu et les
mutations associées doivent être validés ensemble.
Même principe pour une remise de carnet et un paiement de quête.

Utiliser transactions, contraintes uniques, verrous de ligne ou mises à jour
conditionnées par révision. Une requête répétée avec le même identifiant renvoie
le même résultat ; un contenu différent sous cet identifiant est refusé.
Indexer les lieux et états réellement interrogés. PostGIS est une option
ultérieure si les besoins le justifient, pas une dépendance obligatoire du jalon.

### S3 : ce qui est volumineux et immuable

Espaces logiquement séparés, éventuellement des buckets distincts selon les
politiques d'accès et de rétention :

- **Assets durables** : portraits, illustrations attribuées/épinglées, images
  autorisées du carnet, versions publiées des tilesets et habillages.
- **Cache partagé reconstructible** : sources OSM, grilles dérivées, météo
  selon sa durée de validité, photos documentaires réutilisables autorisées.
- **Résultats privés** : chemins par voyage, contenus de carnets et exports,
  sans accès public aux coordonnées ou indices cachés.

Clés versionnées/contenu haché, checksum, type MIME, taille, origine, licence,
date et état de publication. Les métadonnées recherchables et les autorisations
restent en PostgreSQL. Pas de secrets dans les noms de fichiers.
Une illustration retenue ne reçoit pas la règle d'expiration du cache terrain.

Conserver un petit cache local borné pour accélérer les lectures, jamais comme
unique copie d'un résultat durable. Servir les fichiers privés via API ou URL
signée courte après autorisation ; ne pas ouvrir les buckets pour simplifier
le frontend. Les polices/images publiques d'un pack pourront avoir une
distribution séparée seulement après décision explicite.

### Publication et pannes

Pas de transaction atomique entre PostgreSQL et S3 : créer un job/idempotency key,
déposer l'objet sous une clé immuable, vérifier son intégrité puis publier sa
référence dans une transaction SQL. Un résultat incomplet reste « en cours »,
pas « prêt ». Réconcilier les objets orphelins après un délai de sécurité.
Ne jamais retirer un asset encore référencé par un carnet.

Les workers prennent des jobs persistants avec bail, heartbeat, compteur de
tentatives et reprise bornée. Une seule tâche logique par clé ; un worker mort
ne bloque pas éternellement le travail. PostgreSQL peut gérer la première file ;
Redis n'est pas nécessaire au départ. Les limites de débit et de coût des
fournisseurs sont communes à tous les workers, pas seulement par processus.

### Services OVH à retenir et décisions avant commande

Recommandation : Object Storage compatible S3 et Public Cloud Databases for
PostgreSQL dans des régions compatibles, proches de l'API. La documentation
officielle décrit stockage S3, base gérée, sauvegardes, restauration à un instant
donné, offres de haute disponibilité et réseau privé ; vérifier les propriétés
du **plan et de la région choisis**, pas seulement celles de la gamme.

- [Object Storage OVHcloud](https://www.ovhcloud.com/en/public-cloud/object-storage/)
- [FAQ S3 officielle](https://docs.ovhcloud.com/en/guides/storage-and-backup/object-storage/s3-faq)
- [PostgreSQL géré OVHcloud](https://www.ovhcloud.com/en/public-cloud/postgresql/)

Avant achat : devis dans le compte/région, taille minimale, disponibilité,
réseau, connexions, conservation des sauvegardes, volumes et frais de stockage,
requêtes/transfert selon l'offre, TVA et budget maximal.
Le coût fixe de PostgreSQL peut peser davantage que celui des images.
Ne pas promettre le maintien du budget historique de la VM.
Réseau privé si disponible, TLS vérifié, rôles minimaux et secrets hors Git.
Tester restauration SQL et fichiers référencés ensemble ; une sauvegarde SQL
ne sauvegarde pas automatiquement les images S3.

### Bascule sans importer les anciennes données

1. Créer une cible vide en environnement de test avec un nouvel identifiant de monde.
2. Déployer schéma, accès S3, workers et données de référence versionnées.
3. Tester le parcours neuf complet, puis perte/redémarrage d'un worker et deux API
   concurrentes. Ne pas activer le monde neuf avec les capacités de l'ancien.
4. Préparer un cutover production, informer qu'une nouvelle partie est nécessaire,
   arrêter les anciens producteurs puis basculer API et workers ensemble.
5. Conserver l'ancien environnement isolé le temps de la vérification ; un retour
   arrière vise son ancien monde, jamais un mélange des deux.
6. Supprimer les données précédentes uniquement lors d'une opération explicitement
   approuvée. « Pas besoin de migration » n'impose pas d'effacer immédiatement.

Le reset évite l'ETL des données, pas la réécriture des accès disque/SQLite,
des transactions et de la coordination. La synchronisation cloud des sauvegardes
du navigateur reste hors de ce premier changement.

## 3. Personnages : identité, mémoire et nouveau parcours

### Parcours demandé

**Ville / Parler aux habitants → Choisir un personnage → Dialogue.**

Le sélecteur présente les personnages existants disponibles à cet endroit,
leur portrait, nom et rôle, plus une action explicite de nouvelle rencontre.
Choisir un personnage connu ouvre directement son dialogue. Demander un nouveau
personnage lance une création bornée pour le besoin choisi, puis ouvre le
dialogue après sauvegarde de l'identité. En cours/échec et repli sans portrait
sont visibles. Revenir au sélecteur ne crée personne.

Le sujet « Avez-vous croisé mon parent ? » devient une question à **ce**
personnage. Tous ne sont pas témoins. Un refus ou une absence de connaissance
ne doit ni être silencieux, ni inventer une rencontre avec le parent.
Les directions, services, carnets et objets restent des sujets de Dialogue ;
les suivis et indices restent dans Quêtes. Le changement d'interlocuteur ne
reroule pas les récompenses ou les probabilités des demandes.

Hors ville, le même sélecteur peut présenter les rencontres routières
réellement disponibles. Il ne propose pas les habitants d'une ville lointaine.

### Données minimales

| Domaine | Champs / règle |
|---|---|
| Identité | `characterId`, `worldId`, nom affiché stable, locale de nomination, rôle, version du profil |
| Localisation | ville d'attache via identifiant OSM stable, position géographique, POI facultatif et disponibilité validés par le moteur |
| Caractéristiques | quelques traits originaux, besoins structurés, motivations compatibles avec le rôle et le lieu |
| Connaissances | faits autorisés avec provenance, portée, précision et validité ; opinions distinctes des faits |
| Mémoire des rencontres | personnage, voyage/joueur autorisé, événement, date de jeu et date serveur, résumé factuel borné |
| Quêtes | références aux instances proposées/acceptées/remises, état et rôle de l'interlocuteur ; pas une copie divergente du contrat |
| Portrait | référence d'asset durable, statut, prompt/profil versionnés, modèle, provenance et cohérence visuelle |
| Concurrence | révision, identifiants idempotents, historique d'événements nécessaire à la cohérence |

Les noms utilisent des jeux de noms locaux vérifiés et une locale de lieu
explicite ; les localités multilingues ont une règle de choix conservée dans
le profil. Aucun renommage automatique lors d'un passage FR/EN.
Un nom fictionnel ne prétend pas identifier un véritable habitant.

Mémoire publique : faits du personnage et engagements publics permis.
Mémoire privée : relation et événements du joueur concerné.
Le LLM reçoit une vue filtrée, pas toute la base, ni les conversations privées
des autres joueurs. Les résumés servent la présentation, les événements et
contrats structurés font autorité. Pas de mémoire vectorielle obligatoire
pour commencer.

La présence partagée utilise une règle de monde définie séparément des horloges
individuelles : dormir six heures dans un voyage ne déplace pas tous les PNJ
pour les autres joueurs. Premier jalon recommandé : habitants attachés à leur
ville, sans simulation de déplacements globale.

Portrait : réutiliser la génération d'images existante derrière le nouveau
stockage, avec un job par version de personnage, sans données privées de joueurs.
Pas d'appel image à chaque ouverture. Une silhouette locale permet de parler
pendant l'attente ; les portraits sont marqués comme illustrations.
Définir quota, coût et politique de création avant activation en production.

## 4. Tilesets et habillages

Aujourd'hui [app.js](../app.js) construit la grille à partir de glyphes,
[styles.css](../styles.css) définit les couleurs/états et le cycle jour/nuit,
et [journey-map.mjs](../journey-map.mjs) dessine une carte de carnet séparée.
R-155/R-156 existent mais aucun pack graphique n'a été choisi.

Séparer :

- **Tileset** : dessin des terrains et overlays de la carte.
- **Skin UI** : tokens de couleurs, panneaux, boutons, typographie et espacement.

Un manifeste versionné définit identité, fichiers, dimensions/atlas éventuel,
mapping des terrains, overlays, compatibilité et crédits. Un adaptateur commun
laisse le moteur et les coordonnées inchangés. Réutiliser ce mapping pour la
légende et décider explicitement du rendu d'export, plutôt qu'oublier le carnet.
Le système conserve l'ordre des couches, les états inconnus/en téléchargement,
les objets suivis, la sélection et les marqueurs existants.
Il ne prétend pas recréer des routes superposées si la donnée n'en contient pas.

Livraison initiale : ASCII + un pack graphique cohérent sous licence vérifiée ;
skin actuelle + une variante. Options séparées, mémorisées hors sauvegarde du
voyage ; aucune influence sur les coûts ou collisions. Pas de CSS/scripts
distants arbitraires. Tester mobile, zoom, clavier, lecteurs d'écran, contraste,
images absentes et préférence de mouvement réduit.
Les variantes jour/nuit sont compatibles avec les tokens, pas écrasées par un
changement de skin.

La production quotidienne de tilesets reste un lot ultérieur : génération
d'un pack entier, validation de couverture/cohérence, aperçu, publication
atomique d'une version. Aucun planning ni budget nouveau n'est activé ici.

## 5. Entrée en ville : réutiliser ce qui existe

[TownUI](../towns-ui.mjs) ouvre déjà un accueil et charge une description via
[CellContent](../cell-content.mjs). Il manque une galerie documentaire propre à
la ville ; les photos de case existantes ne garantissent pas de représenter
la commune. L'accueil actuel suit aussi la position de case, pas seulement
l'identité stable d'une ville.

Ce changement concerne uniquement l'accueil des villes. Les descriptions,
photos, sources et commandes des autres cases restent identiques ; elles ne
sont pas remplacées par le contenu documentaire de la ville voisine.

Plan :

1. Résoudre la ville par OSM, liens Wikipédia/Wikidata et coordonnées ;
   éviter les homonymes et le simple « article le plus proche ».
2. Extraire un court texte sourcé dans la langue demandée ; étiqueter une langue
   de repli. Utiliser les descriptions OSM quand elles existent ; sinon afficher
   une absence explicite, pas une histoire générée présentée comme factuelle.
3. Obtenir 3 à 5 photos distinctes via les associations Commons/OSM/Wikipedia.
   Ne pas remplir artificiellement avec une photo sans rapport si une seule existe.
4. Afficher texte et premières images progressivement, avec légendes, crédits,
   licences et lien source ; distinguer ville et environs. Pas de diaporama
   automatique obligatoire ni de téléchargement d'originaux démesurés.
5. Conserver les métadonnées en SQL, les images autorisées en S3 et un cache de
   lecture navigateur. Dédupliquer par ville/langue/version/source.
6. Déclencher l'accueil au changement de ville, pas à chaque case de la même
   ville. Un autre modal actif ne doit pas être écrasé ; conserver un accès manuel.
   Les services de ville restent utilisables pendant les chargements.

Le point d'entrée de sélection des personnages se trouve dans ce même accueil.
Photos réelles, portraits fictifs et illustrations générées portent des
présentations distinctes.

## 6. Demandes de modification des joueurs

Cinquième chantier ajouté le 23 octobre : R-186. À la demande du joueur, une
commande **« Proposer une modification »** rassemble une capture de la vue du jeu,
un snapshot de son état au même moment et un commentaire libre, par exemple
« les boutons sont trop petits chez moi ». L'utilisateur a demandé pour cette
étape **les exigences et le plan uniquement**, sans démarrage de l'implémentation.

### Parcours

1. Le joueur déclenche la commande depuis le jeu.
2. Avant d'ouvrir le formulaire, figer une projection diagnostique de l'état et
   capturer la vue correspondante : carte, contrôles et fenêtre active compris,
   sans inclure le futur formulaire de retour. Ne pas capturer d'autre onglet,
   application ou bureau.
3. Afficher l'aperçu, le périmètre des données jointes et un champ commentaire.
   Le joueur peut annuler ou confirmer explicitement l'envoi.
4. Envoyer un identifiant de soumission stable avec les trois éléments ; afficher
   la progression et conserver le brouillon en cas d'échec.
5. Après confirmation de persistance par le serveur, afficher le numéro de demande.
   Un double clic ou une nouvelle tentative réseau ne crée pas de doublon.

Le choix technique de capture fera l'objet d'un prototype sur le rendu réel :
DOM, canvas, carte, polices et images externes peuvent imposer des limites.
Vérifier notamment CORS, mobile, zoom et fenêtres ouvertes. Si la capture ne
peut pas être obtenue, expliquer l'erreur ; ne pas prétendre avoir envoyé une
demande complète ou substituer une capture vide.

### Persistance et confidentialité

Choix confirmé : **commentaire et snapshot dans PostgreSQL partagé ; capture
privée durable dans S3**, liée à la même demande par le catalogue d'assets.
Ce n'est pas une issue GitHub ni une publication publique.

Le record SQL contient au minimum l'identifiant, la date serveur, la référence
autorisée du voyage si nécessaire, le commentaire, le snapshot JSON versionné,
la version/build du jeu, les informations d'affichage utiles, la référence
d'asset et un statut initial `submitted`. L'image conserve checksum, taille,
type et provenance dans le catalogue. Le snapshot indique langue, dimensions
du viewport, ratio de pixels, tileset/skin et état visible pertinent pour reproduire
le problème.

La projection diagnostique est une liste explicite de champs autorisés, pas un
dump du store, des bases ou du navigateur. Exclure tokens, capabilities, secrets,
réponses cachées des quêtes et données privées d'autres joueurs. Ne pas inclure
automatiquement de journal de conversation complet. Prévenir le joueur que
son commentaire et sa capture peuvent contenir des informations personnelles.
Le snapshot est une pièce de diagnostic ; il ne peut pas être réimporté comme
sauvegarde ni exécuté comme commande.

Le serveur contrôle les accès avec le modèle existant, valide et borne les
entrées, décode réellement l'image et limite fréquence, dimensions et volumes.
La consultation des demandes et captures est réservée aux personnes autorisées.
Stocker et vérifier l'asset avant la publication transactionnelle du record SQL ;
une panne ne doit ni produire un accusé de réception mensonger ni laisser une
demande présentée comme complète sans ses pièces. Prévoir le traitement des
assets orphelins et définir rétention/suppression avant activation en production.

### Livraison prévue et recette

1. Contrat de snapshot, modèle SQL et autorisation de consultation des retours.
2. Prototype de capture cohérente avec l'état du jeu et limites explicites.
3. Commande, aperçu, commentaire, annulation et envoi avec états FR/EN accessibles.
4. API idempotente et persistance PostgreSQL/S3 via les fondations existantes.
5. Consultation privée minimale du commentaire et des deux pièces ; recette.

Vérifier capture et snapshot correspondants, mobile/zoom/modal, annulation sans
envoi, exclusion des secrets et informations cachées, limites de taille, refus
d'accès non autorisé, double soumission, coupure réseau, panne S3/SQL et lecture
après redémarrage depuis une autre instance. Aucune implémentation ou collecte
de retours n'est activée par cet ajout au plan.

## 7. Ordre de réalisation et critères de sortie

| Lot | Contenu | Dépendances | Vérification attendue |
|---|---|---|---|
| A | Architecture détaillée, volumes/retentions, région, devis et plafond de dépense | Aucune | Proposition chiffrée approuvée avant commande ; périmètre des sauvegardes et accès écrit |
| B | Accès PostgreSQL/S3, schéma vide, configuration, catalogue d'assets et jobs durables | A | Départ neuf ; upload/lecture autorisés ; pannes explicites ; restauration de test |
| C | Remplacer les stockages existants et préparer le cutover sans import | B | Deux collectes concurrentes : un seul gagnant ; reçu rejoué sans double coût ; carnet/quête cohérents ; worker tué puis repris ; redémarrage sans perte |
| D | Identité/mémoire des personnages et API de sélection/création | B ; C avant activation sur le monde neuf | Même personnage retrouvé après redémarrage ; noms stables ; création concurrente dédupliquée ; mémoire privée isolée |
| E | Sélecteur avant Dialogue, sujets contextualisés, portraits persistants | D | Choisir ancien/nouveau puis parler ; revoir une quête donnée ; absence d'info honnête ; portrait réutilisé et échec non bloquant |
| F | Manifeste/adaptateur tileset, tokens UI et premières variantes | Indépendant de D/E ; B pour distribution S3 finale | Mêmes cases/commandes/états en ASCII et graphique ; préférences restaurées ; pack absent rejeté ; mobile et exports cohérents |
| G | Description et galerie de ville, arrivée dédupliquée | Réutilisation locale possible ; B pour cache partagé final | Même ville non rouverte à chaque case ; homonymes/langues testés ; 0/1/5 images ; crédits et panne partielle visibles |
| I | Demandes de modification : commande, capture, snapshot, commentaire et consultation privée | B pour PostgreSQL/S3 ; indépendant de D/E/F/G | Capture fidèle et snapshot cohérent ; consentement ; aucun secret ; soumission idempotente ; pannes explicites ; pièces retrouvées après redémarrage |
| H | Recette intégrée, sauvegarde/reprise et publication | C, E, F, G, I | Parcours neuf complet, deux instances API, tests d'autorisation et restauration, retour joueur complet, coût observé, retour arrière défini |

Recommandation d'exécution : **A → B → C → D → E**, avec **F et G réalisables
indépendamment** une fois les contrats d'assets fixés. Le modèle de personnages
doit précéder la nouvelle interface de conversation pour ne pas ajouter une
simple liste de noms sans mémoire.
Le lot **I** peut avancer indépendamment de D/E/F/G une fois le contrat de
stockage B disponible ; sa capture devra rester compatible avec les skins F.

Pas d'estimation calendaire ferme avant le choix du service géré et la mesure
des accès à remplacer. La partie difficile n'est pas de copier les fichiers :
c'est de conserver l'unicité des objets, les reçus et la confidentialité quand
plusieurs workers agissent ensemble.
