# Infrastructure OVHcloud - rapport du 18 octobre 2026

## Personal journal cover delivery (20 October 2026)

- Game 0.20.1, production commit `94080ee3592864052ef55910dc73f2d575dda45b`.
  The administrator explicitly approved the existing free symbolic
  tarot/scenery cover independently of postponed photo-based generation.
- Enabled the separate journal-art token-file environment setting; the
  shared daily title-screen illustration is not reused as a personal cover.
  Added one private, durable bilingual departure-based subtitle per owner.
- Exact production validation: 1,018 JavaScript tests and 50 focused Python
  tests passed. Browser fixture verified a loaded personal cover image and
  live EN/FR subtitle updates. PDF cover data/image wiring passes regressions;
  the hidden browser stalled during the full canvas PDF export, so that
  browser export is not counted as validated.
- Nine runtime files installed with a private pre-update backup; existing
  journey genesis unchanged. Public updated assets matched on both domains.
  Backup: `/var/lib/arcane-path/backups/journal-cover-94080ee35928`.
- A separate production QA journey generated one real normalized 1024 x 1024
  WebP cover (181,524 bytes) and one bilingual subtitle. Repeated requests
  retained the same text with one text-provider attempt and one cover row.
  No private player notes, capabilities or future route stages were sent.

## SSH recovery and approved access policy (20 October 2026)

The administrator approved SSH from any source IP with public-key
authentication required, password/keyboard-interactive login disabled, and
root login disabled. The previous source-IP restriction prevented access
after changing Wi-Fi networks. Ask before future administrative access-policy
changes that could cause a lockout.

Cloud-init and its tests now describe this approved policy; updating the
template alone does not change an existing VM. Rescue authentication failed;
the original disk was not modified and the original runtime was restored
before the administrator explicitly authorized rebuilding the VM and losing
server data. An authenticated OpenStack in-place rebuild with corrected
cloud-init retained the instance identity and public IP, 57.130.85.251.
Cloud-init completed successfully; effective SSH configuration requires
public keys, disables passwords and root login, and the guest firewall
accepts SSH from any source. The fresh SSH host key was pinned using
trust-on-first-use after the rebuild; it was not independently attested.
Keep Terraform's `prevent_destroy` guard; do not replace the instance merely
to refresh cloud-init. Historical delivery records below describe the
policies at those dates.

## HTTPS apex and www

The certificate setup requests both `arcane-path.eu` and `www.arcane-path.eu`
in the existing `arcane-path.eu` certificate lineage. Both names must resolve
to the VM before issuance or renewal. Both HTTPS names use the same protected
preview configuration; HTTP requests redirect to the apex HTTPS name, while
ACME validation remains available on both names.

After the authorized rebuild, production release `b81f094` (game 0.20.0)
and the GSHHG shoreline dataset were restored. Both HTTPS names were checked
with normal certificate verification: eleven public assets match the exact
production package on each name, both travel/origin APIs return HTTP 200,
anonymous access returns HTTP 401, and private repository paths return
HTTP 404. All five fresh SQLite databases pass integrity checks. The game
backend listens only on loopback port 8766; SSH, Nginx, the firewall and both
certificate/art timers are active. The issued certificate covers both names
and expires on 18 January 2027. Server journeys and terrain caches from before
the rebuild were discarded with the administrator's approval; browser-local
saves were not deleted or migrated.

## Livraison - douze jeux, sac spatial et compagnon

- Runtime `e4bbde7bf534a3abe003d501e53aa9fbf01e9840`, branche
  `deploy/games-equipment`, tag pousse `deploy-2026-10-18-games-equipment`.
  Base de production `dcc96bd`. **814 tests JavaScript et 24 tests Python**
  passent dans le worktree isole exact ; 817 tests JavaScript sur la branche
  de developpement.
- Les douze jeux approuves sont relies au temps, besoins, argent, progression,
  sauvegarde et son du voyage. Conditions avant engagement, resultat reel
  apres jeu ; annulation sans gain, sans remboursement du temps.
  Vendanges payees au point, sans plafond artificiel base sur un ratio.
- Sac illustre 6 x 4, objets portes separes, limite 5,5 kg, rotation et
  sauvegarde. Poids/usure/pluie/sommeil appliques ; tente uniquement dans
  les campings OSM accessibles. Rencontre de chien optionnelle via les
  evenements, nom obligatoire a l'adoption, nourriture/soins et bonus reels.
  Migration des anciennes sauvegardes sans usure ou besoins retroactifs.
- **80 fichiers installes et verifies**, dont **78 assets publics compares
  octet par octet en HTTPS authentifie**, y compris modules/SVG imbriques.
  Nginx teste/recharge ; services actifs, API origines HTTP 200. Acces sans
  authentification HTTP 401 ; scripts, tests et fichiers Git restent HTTP 404.
- Frequence des evenements toujours **90 minutes de marche** ; le parametre
  accelere est ignore sur le domaine de production. Illustrations et
  epinglage au carnet conserves.
- Navigateur : neuf nouveaux adaptateurs montes/annules avec controle du
  jeu courant, couts conserves, aucun gain ; inventaire FR/EN et mobile,
  achat/rotation/reprise, adoption nommee, besoins et nourriture verifies.
  La page de test etant parfois masquee, cela ne constitue pas un nouveau
  playtest manuel complet de chaque jeu chronometre. Un test automatise
  termine le vrai jeu de vendanges et verifie recu et nettoyage de l'adaptateur.
- Sauvegardes SQLite avant/apres, integrite verifiee :
  **16 genesis existantes inchangees**. Copies privees (0600) sous
  `/var/lib/arcane-path/backups/`, suffixe `e4bbde7bf534`.
  Retour code : `/home/ubuntu/arcane-path-before-deploy-e4bbde7bf534.tar.gz`
  (0600). Ne jamais restaurer les bases en arriere lors d'un retour code.
- Non livres : sources reelles du monde vivant/photos associees, autres
  compagnons, pouvoirs d'artefacts et bonus qualite de l'appareil photo.

## Livraison - evenements du chemin et sante

- Runtime `dcc96bd`, tag `deploy-2026-10-18-journey-events`, base `e6e20a1`.
  **447 tests JS** sur la base de production isolee ; **450 tests JS et
  23 tests Python** sur la branche de developpement correspondante.
- 23 fichiers installes et verifies sur le serveur ; **21 assets publics
  verifies octet par octet en HTTPS**. Service redemarre, API origines HTTP
  200, services `arcane-path` et `nginx` actifs.
- Frequence normale : une occasion toutes les **90 minutes de marche**.
  Le parametre de test accelere ne fonctionne que sur localhost ; les deux
  tarots conservent leurs probabilites. Effets favorables en vert,
  defavorables en rouge, illustration et epinglage automatique au carnet.
- Sauvegardes SQLite avant/apres : **16 genesis existantes inchangees**.
  Retour code : `/home/ubuntu/arcane-path-before-deploy-dcc96bd.tar.gz` (0600).
  Ne pas restaurer les bases en arriere lors d'un retour de code.
- Mini-jeux supplementaires et equipement exclus de cette livraison initiale ;
  livres ensuite dans le checkpoint ci-dessus.

## Dernieres livraisons - couverture du carnet et fond reel en cache

- Couverture : runtime `e6e20a1`, tag `deploy-2026-10-18-notebook-cover`,
  developpement `04e2e50`, base `f473198`. Sept assets et manifeste verifies
  octet par octet sur HTTPS, sans redemarrage ; **421 tests JS passes**.
  Titre Voyage de [nom], sous-titre humoristique FR/EN, depart et date UTC,
  page initiale du carnet et du PDF. Donnees du lecteur exclues des carnets trouves.
  Retour code : `/home/ubuntu/arcane-path-before-deploy-e6e20a1.tar.gz` (0600).
- Correction du fond : runtime `f473198`, tag
  `deploy-2026-10-18-terrain-inventory`, developpement `63f4eb5`, base `c572c0f`.
  Deux assets, deux modules Python et manifeste verifies ; backend redemarre.
  Inventaire des vrais fichiers de cache au lieu de sondages espaces manquant
  les chemins etroits. Aucun travail fournisseur ni reconstruction de chunk.
  Retrait de la spirale decorative au milieu de la carte.
  **419 tests JS et quatre nouveaux tests Python passes** (dont HTTP reel).
  Suite serveur : dix tests passent ; un echec preexistant attend cinq photos
  alors que la configuration de production en autorise dix, inchangee ici.
- Endpoint de production verifie sur le cache reel : **68 chunks, 4352 blocs
  de terrain, 12 types**, stride 1, aucun telechargement geographique.
  Retour code : `/home/ubuntu/arcane-path-before-deploy-f473198.tar.gz` (0600).
- Pour chaque livraison : deux bases sauvegardees avant/apres, **16 genesis
  initiales inchangees**, services actifs et API disponible. Mini-jeux exclus.
  Verification visuelle toujours bloquee par la connexion navigateur CDP.

## Derniere livraison - carte du voyage, fond en cache et deces

- Runtime `c572c0f`, tag `deploy-2026-10-18-death-terrain`,
  developpement `35b1232`, base live `bcf0a48`. Huit assets et manifeste
  verifies octet par octet sur HTTPS, sans redemarrage.
- Carte du carnet : terrain reduit depuis les chunks en cache uniquement,
  aucune preparation cartographique. Couverture incomplete/echantillonnee
  signalee ; fond identique dans le PDF. Pointilles bruns entre lieux connus
  quand l'ancien chemin manque, distincts du trace reel rouge.
- R-113 : croix au deces, fondu noir de cinq secondes, arcane XIII et cause
  explicite dans une fenetre native au-dessus du fondu. Fermeture sans
  resurrection, mouvement reduit respecte et reessai des images disponible.
  Evanouissement, placement et retrouvailles exclus.
- **419 tests JS passes** sur runtime isole. Verification visuelle indisponible
  (connexion navigateur CDP en timeout). API disponible et services actifs.
- Deux bases sauvegardees avant/apres ; **16 genesis initiales inchangees**.
  Retour code : `/home/ubuntu/arcane-path-before-deploy-c572c0f.tar.gz` (0600).
- Livraison intermediaire `bcf0a48`, tag `deploy-2026-10-18-journey-map`,
  developpement `af64eda` : trace persistant, page dediee, animation et PDF.
  407 tests JS passes, dix assets et manifeste verifies sur HTTPS, sans
  redemarrage ; 16 genesis inchangees et deux bases sauvegardees.
  Retour code : `/home/ubuntu/arcane-path-before-deploy-bcf0a48.tar.gz` (0600).
- Mini-jeux locaux exclus des deux livraisons.

## Derniere livraison - export PDF du carnet

- **18 octobre 2026 (heure locale)** : runtime `8169e9a`, tag
  `deploy-2026-10-18-notebook-pdf`, developpement `6862b7b`,
  base live `cd9b157`. Cinq assets et manifeste installes et verifies
  octet par octet sur HTTPS, sans redemarrage ni changement de configuration.
- **Exporter en PDF** telecharge toutes les pages du carnet : photos, tarot,
  notes et credits, avec les statistiques du voyage quand disponibles.
  Un carnet abandonne inclut ses indices, sans statistiques du lecteur.
  Generation locale en pages A4 rasterisees ; brouillons sauvegardes avant
  export, erreurs visibles, aucun service tiers.
- **400 tests JS passes** sur le runtime isole, dont export FR/EN, brouillons,
  isolation des carnets trouves, erreurs, annulation par fermeture, structure
  PDF et nettoyage du telechargement. Validation independante stricte par
  pypdf : pages A4, images incorporees et commandes de dessin.
  Verification visuelle navigateur indisponible (connexion CDP en timeout).
- Les mini-jeux et autres modifications locales en cours sont exclus.
  Deux bases SQLite sauvegardees avant et apres ; les **16 lignes de genesis
  initiales restent inchangees**. API disponible, services actifs.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-8169e9a.tar.gz` (0600).
  Conserver les bases actuelles en cas de retour au code precedent.

## Livraison precedente - recuperation complete en hebergement payant

- Runtime `cd9b157`, tag `deploy-2026-10-18-hotel-recovery`,
  developpement `fee127b`, base live `91e274d`.
- Repas du soir et petit-dejeuner inclus ; reserve alimentaire pleine,
  fatigue et pression de sommeil a zero au reveil. Abris gratuits inchanges.
- 393 tests JS passes ; trois assets et manifeste verifies sur HTTPS.
  Services actifs et 16 lignes de genesis inchangees.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-cd9b157.tar.gz` (0600).

## Derniere livraison - couche 10, effets du tarot et statistiques du carnet

- **18 octobre 2026 (heure locale)** : runtime `91e274d`, tag
  `deploy-2026-10-18-layer-ten-stats`, developpement `0392dbd`,
  base live `dafb019`. 27 fichiers installes, 26 assets/manifeste HTTPS
  verifies octet par octet ; redemarrage du backend, proxy inchange.
- Vigilance, proprete et sympathie/reputation locale, action d'hygiene payante,
  contexte policier cartographie et temps dans un secteur de 2 km.
  Toutes les actions passent par le meme bilan ; les actions interrompues
  ne donnent ni gain ni indice ni avancement.
- A 100 vigilance, deux placements recuperables : 24 h a l'abri, repas/repos,
  perte arrondie de 25 % de l'argent, retour au meme endroit, carnet et piste
  preserves. Le troisieme termine le voyage et publie le carnet a la derniere
  position. Aucun temps au foyer compte comme exposition dehors ; un besoin
  deja fatal reste prioritaire.
- Cartes de naissance et du jour : effets directs sur vigilance, sympathie,
  proprete et oubli des nouveaux temoins, chiffres visibles dans le panneau,
  le tirage quotidien et les statistiques. Effets actualises au nouveau jour.
  Les indices conservent leur heure/facteur de collecte ; une recherche locale
  terminee dans les 3 km identifie toujours la destination.
- Carnet : page **Statistiques du voyage** distincte des photos/cartes, avec
  totaux reels du voyage, besoins, argent, compteurs, pressions et deux arcanes.
  Ni destination cachee ni statistiques personnelles dans les carnets trouves.
- **392 tests JS** et **24 tests Python** passes (carnets et chemins parent).
  Navigateur avec vrais modules et DOM : FR/EN, statistiques a jour sans
  debordement a 1280/390 px, isolation des carnets trouves. Reprise UI puis
  placement verifie : 1470 minutes, 1 placement, vigilance 20, aucune exposition
  nocturne supplementaire, sauvegarde reussie. Hygiene UI : 20 minutes,
  proprete 100, vigilance 17,4, prix correctement debite et statistiques a jour.
- Deux bases SQLite sauvegardees avant et apres par l'API backup, sans retour
  arriere des donnees. Les **16 lignes de genesis initiales sont inchangees**.
  API disponible et services `arcane-path`/`nginx` actifs.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-91e274d.tar.gz` (0600).
  Ne jamais restaurer les bases vers un etat anterieur pour revenir au code.

## Livraison precedente - recherche sans trajet de reference

- Runtime `dafb019`, tag `deploy-2026-10-18-destination-search`,
  developpement `d8c9574`, base live `eba26f1`.
- Chemin en attente/en echec ou worker occupe : recherche explicitement fondee
  sur la distance a la destination, sans inventer de trajet, couts usuels.
  Autres erreurs et reponses invalides restent visibles, sans cout d'action.
- 24 tests JS cibles passes ; trois assets et manifeste verifies octet par
  octet sur HTTPS, sans redemarrage. Les 16 genesis restent inchangees.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-dafb019.tar.gz` (0600).

## Derniere livraison - pages de piste et directions vers les villes citees

- **18 octobre 2026 (heure locale)** : runtime `eba26f1`, tag
  `deploy-2026-10-18-trail-pages`, developpement `d829645`,
  base live `f4ceb07`. Cinq assets et manifeste, sans redemarrage.
- J separe **Indices actuels**, **Enqueter** et **Destinations precedentes**.
  Les temoignages sont classes sous la destination qu'ils designent, pas
  sous le lieu de collecte. Decouvertes en attente et fausses pistes rejoignent
  la chronologie ; dates en premier, dernier indice date marque, dates inconnues
  en fin de liste. Les sejours du parent restent dans l'archive correspondante.
- I propose les villes deja nommees : suggestions anciennes conservees,
  destinations visitees et noms reellement obtenus, sans reveler l'itineraire cache.
  Choix avec etape/statut, demande payante habituelle (10 minutes, 2 fatigue,
  chance selon terrain), direction depuis la position actuelle et coordonnees.
  L'avis reste non confirme ; aucun changement de destination ou de progression.
- 371 tests JS passent. Navigateur avec vrais modules : trois pages isolees,
  dates 13:00/12:40/12:20 decroissantes, archives distinctes, arrivee ouvrant
  une page vide sans fuite de nom futur. Vraie demande de direction vers une
  ancienne proposition : echec puis succes, 20 minutes payees, quete inchangee.
  Liste de villes restauree depuis les rapports deja sauvegardes ; selecteur
  sans debordement a 390 et 1280 px.
- Cinq assets et manifeste HTTPS verifies octet par octet, API disponible et
  services actifs. Les 16 lignes de genesis initiales sont strictement inchangees.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-eba26f1.tar.gz` (0600).

## Derniere livraison - calendrier reduit et colonne horloge/meteo

- **17 octobre 2026** : runtime `f4ceb07`, tag
  `deploy-2026-10-17-simple-weather`, developpement `088f113`,
  base live `e64e055`. Trois assets et manifeste, sans redemarrage.
- Date plus petite a gauche, sans coupure des deux chiffres du jour.
  Horloge analogique, icone, temperature et condition empilees a droite.
  Heure numerique, legendes UTC/marche, titre meteo, moyennes et sources
  permanents retires. Details et attribution conserves dans l'infobulle.
- 369 tests JS passent. Navigateur 1280/390 px : alignement exact de
  l'horloge et de la meteo, aucun debordement des dates ou temperatures,
  panneau de 202 px de haut, infobulle accessible au clavier.
- Trois assets et manifeste HTTPS verifies octet par octet ; API disponible,
  services actifs et les 16 lignes de genesis initiales inchangees.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-f4ceb07.tar.gz` (0600).

## Derniere livraison - carnets, tarot et panneau meteo compact

- **17 octobre 2026** : runtime `e64e055`, tag
  `deploy-2026-10-17-notebooks-weather`, developpement `1ff2e9f`,
  base live `2db306c`. 45 fichiers selectionnes, sans remplacer config.yml.
- Agenda, horloge et meteo dans un seul panneau : couleurs selon la
  temperature estimee, gouttes sous pluie/orage et soleil/lune en arriere-plan
  suivant l'heure du jeu. Ancien cadran solaire separe retire.
  Effets meteo dans une infobulle au survol ou au focus clavier.
- Indices dates UTC, tous types fusionnes du plus recent au plus ancien.
  Bouton d'enquete en haut ; destination atteinte marquee et nouvelle page
  ouverte immediatement, sans avancer la quete avant l'enquete locale.
- 22 arcanes majeurs Jean Dodal et dos historiques du domaine public, servis
  localement avec credits. Tirages naissance/jour reveles epingles avec date,
  identite par voyage/role/jour et notes preservees lors des reprises.
- Carnet propre a chaque voyage. Au deces ou au remplacement, depot du carnet
  complet a la derniere position : photos, notes, tarot et indices deviennent
  lisibles par les autres joueurs, avec avertissement et confirmation.
  File IndexedDB durable, ancienne sauvegarde conservee si le depot echoue.
- Recuperation et livraison en quete annexe, carnet retrouve en lecture seule,
  sans remplacer la quete du joueur. Capacites privees, reclamation exclusive,
  bail de sept jours ; parent de cette livraison fixe a sa position au depot.
  Limites explicites de partage : 1000 entrees, 48 MiB d'images au total.
- 369 tests JS et 21 tests Python passent. Navigateur : images decodees,
  vrai stockage IndexedDB et API locale, migration/reinitialisation des carnets,
  lecture retrouvee, dates/pages ; panneau et infobulle verifies a 1280/390 px,
  soleil/lune ronds et uniques, pluie effacee lorsque les donnees changent.
- Nginx valide puis recharge, service Python redemarre. 42 assets HTTPS
  verifies octet par octet ; hachages des 45 fichiers installes verifies,
  API jeu disponible et nouvelle API sans capacite correctement refusee (403).
  Les 16 lignes de genesis presentes avant livraison sont strictement inchangees.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-e64e055.tar.gz` (0600).
  Snapshots SQLite coherents (0600) dans `/var/lib/arcane-path/backups/` :
  `journeys-before-e64e055.sqlite3` et `abandoned-journals-after-e64e055.sqlite3`.
  Le nouveau magasin est `cache/travel/abandoned-journals.sqlite3` (0600),
  distinct de `journeys.sqlite3`. Inclure desormais **les deux bases** dans
  toute sauvegarde ; ne jamais restaurer une ancienne base lors d'un retour code.

## Derniere livraison - recherches retrouvant un indice connu

- **17 octobre 2026** : runtime `2db306c`, tag
  `deploy-2026-10-17-repeated-clues`, developpement `8a3a375`,
  base live `1905873`. Trois modules et manifeste, sans redemarrage.
- Une recherche retrouvant le meme type et la meme precision d'indice pour
  la meme etape ne pretend plus ajouter un indice : message explicite rouge,
  couts conserves, pas de doublon. Probabilites et garantie inchangees.
- Marqueur facultatif repeated sur lastSearch, valide en sauvegarde ;
  anciennes sauvegardes lisibles. Les anciens resultats deja sauvegardes
  sans marqueur ne sont pas reinterpretes.
- 37 tests recherche/sauvegarde passent : nouveau puis doublon, couts,
  reprise exacte, marqueurs invalides rejetes et vrais handlers FR/EN rouges.
- Trois modules et manifeste HTTPS verifies octet par octet ; API jeu verifiee.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-2db306c.tar.gz` (0600).

## Derniere livraison - indices en premier dans J

- **17 octobre 2026** : runtime `1905873`, tag
  `deploy-2026-10-17-clues-first`, developpement `0cdf906`,
  base live `0a8dff8`. Quatre assets et manifeste, sans redemarrage serveur.
- Decouvertes, photos et indices precedant les actions. Sur mobile, la zone
  principale precede les consignes. Les avis ne sont plus dupliques avant
  les actions. Liste d'actions sur une colonne.
- Bouton de recherche puis cout resume toujours visibles ; longues regles
  dans une aide repliable fermee par defaut. Probabilites et couts inchanges.
- 24 tests cibles passent. Navigateur avec vrai setupTrail et indice :
  indices avant actions, bouton en premier, aide fermee puis depliable,
  contenu principal avant consignes a 390 px sans debordement horizontal.
- Quatre assets et manifeste HTTPS verifies octet par octet ; API jeu verifiee.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-1905873.tar.gz` (0600).

## Derniere livraison - retrait du bouton Nouveau voyage dans J

- **17 octobre 2026** : runtime `0a8dff8`, tag
  `deploy-2026-10-17-trail-remove-restart`, developpement `fe1ff59`,
  base live `69f2970`. Deux assets et manifeste, sans redemarrage serveur.
- Bouton et gestionnaire retires de J ; Nouveau voyage reste disponible
  sur l'ecran principal. Aucun changement aux sauvegardes.
- 24 tests cibles passent, dont l'absence du bouton dans J, sa presence
  sur l'ecran principal et les interactions J/I en francais et anglais.
- Deux assets et manifeste HTTPS verifies octet par octet ; API jeu verifiee.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-0a8dff8.tar.gz` (0600).

## Derniere livraison - piste du parent et position des villes proposees

- **17 octobre 2026** : runtime `69f2970`, tag
  `deploy-2026-10-17-trail-layout`, developpement `9b8d51b`,
  base live `5ffd3c2`. Quatre assets et manifeste, sans redemarrage serveur.
- J affiche les consignes dans une colonne laterale et les actions,
  photos et resultats dans la zone principale ; empilement sur mobile.
- Les propositions de villes dans I et leur historique affichent aussi
  direction et distance a vol d'oiseau depuis la position actuelle, ainsi
  que les coordonnees. L'avis reste explicitement non confirme.
- 349 tests JS passent dans le runtime isole, dont le vrai parcours
  J puis I en francais et anglais. Navigateur : colonnes a 1280 px,
  empilement sans debordement horizontal a 390 px, texte de position verifie.
- Quatre assets et manifeste HTTPS verifies octet par octet ; API jeu et
  services actifs. Sauvegardes et journaux serveur inchanges.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-69f2970.tar.gz`
  (0600). Le partage des journaux abandonnes reste hors de cette livraison.

## Derniere livraison - repere de marche vers un hebergement

- **17 octobre 2026** : runtime `5ffd3c2`, tag
  `deploy-2026-10-17-hotel-guidance`, developpement `810334e`,
  base live `342b1e7`. Six assets et manifeste, sans redemarrage serveur.
- Chaque resultat d'hebergement propose un bouton pour choisir sa case
  comme repere. Direction, distance et coordonnees affichables pendant
  la marche manuelle ; case encadree quand visible, arrivee confirmee.
  Aucun deplacement automatique, paiement ni sommeil par ce bouton.
  Repere annulable, conserve uniquement pendant le voyage ouvert.
- 346 tests JS du runtime isole passent. Navigateur : choix des Carillons
  depuis les resultats caches, dialogue ferme, direction affichee et
  position du personnage inchangee. Manifeste, six assets HTTPS et API jeu
  verifies octet par octet.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-5ffd3c2.tar.gz`
  (0600). Le carnet photo reste disponible ; partage des journaux en cours.

## Derniere livraison - carnet photo a spirale

- **17 octobre 2026** : runtime `342b1e7`, tag
  `deploy-2026-10-17-photo-notebook`, developpement `5320159`,
  base live `09cfca4`. Dix assets et manifeste, sans redemarrage serveur
  ni modification des sauvegardes ou des journaux de depart.
- A ouvre le carnet a deux pages et spirale centrale. Toutes les photos
  affichees peuvent etre epinglees avec leurs credits/licence, cadre blanc
  et note manuscrite. Les indices photo vagues gardent leur titre masque.
  IndexedDB distinct du cache photo ; aucune synchronisation serveur.
- 343 tests JS passent dans le runtime isole. Navigateur : vraie image IGN
  decodee 512x512, note sauvegardee puis relue apres rechargement et apres
  effacement du cache photo, deux pages et reliure verifiees. Attendre
  la confirmation d'enregistrement avant de recharger la page.
- Manifeste, dix assets HTTPS compares octet par octet et API jeu verifies.
  Le partage des journaux abandonnes n'est pas inclus dans cette livraison.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-342b1e7.tar.gz`
  (0600). Le carnet navigateur reste local et n'est pas efface par ce retour.

## Derniere livraison - separation des dialogues J et I

- **17 octobre 2026** : runtime `09cfca4`, tag
  `deploy-2026-10-17-clue-dialogs`, developpement `8adb605`,
  base live `7a24962`. Trois assets et manifeste, sans redemarrage ni
  modification des sauvegardes.
- J conserve les recherches de nouveaux indices et l'historique. Les
  actions pour montrer les fragments/photos collectes sont dans I.
  Titres, explications et aide des raccourcis corriges en FR/EN.
- 41 tests cibles passent, dont recherche dans J puis reconnaissance du
  fragment dans I, couts, suggestions incertaines et reprise sauvegardee.
  Manifeste, trois assets HTTPS et API jeu verifies.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-09cfca4.tar.gz`
  (0600). Aucun changement des probabilites d'accueil.

## Derniere livraison - cache immediat et couleurs des resultats

- **17 octobre 2026** : runtime `7a24962`, tag
  `deploy-2026-10-17-cached-lodging-feedback`, developpement `9f06f0c`,
  base live `b2ebd65`. Dix modules client, un script serveur et manifeste ;
  redemarrage Python, sans changement des probabilites d'accueil.
- Les POI des cartes deja chargees dans le navigateur sont listes sans
  reseau. Le job serveur transmet ensuite ses propres resultats de cartes
  en cache pendant l'attente OSM. Listes provisoires identifiees, conservees
  en cas d'annulation/erreur ; la liste serveur finale les remplace. Filtrage,
  rayon de 5 km, credits et sommeil dans la case exacte sont conserves.
- Feedback semantique vert/rouge : hospitalite et lieux de culte, choix de
  survie, musique, sauvegardes, voyage, sources photo, localisation et audio.
  Les recherches en cours restent neutres. Carnet photo toujours non livre.
- 338 tests JavaScript du runtime isole passent et dix tests Python
  hebergements passent. Navigateur : quatre hebergements caches visibles
  avant reponse en ligne ; refus Paulhe rouge `rgb(255,155,155)`, accueil
  vert `rgb(143,227,160)` verifies en style calcule.
- Manifeste, dix modules HTTPS et hash du script serveur verifies.
  L'API live transmet quatre resultats caches pendant `phase=provider`.
  Services actifs et quinze journaux de depart existants inchanges.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-7a24962.tar.gz`
  (0600). Ne pas restaurer une ancienne base joueur.

## Derniere livraison - progression reelle de recherche d'hebergements

- **17 octobre 2026** : runtime `b2ebd65`, tag
  `deploy-2026-10-17-lodging-progress`, developpement `a50b5bb`,
  base live `45cc324`. Quatre modules client, deux scripts Python et
  manifeste ; redemarrage du service Python uniquement.
- Etapes transmises par le job serveur : attente, cartes disponibles,
  source OSM avec son nom, disponibilite du catalogue complementaire,
  distances/classement et cache. Secondes ecoulees cote client, sans
  pourcentage invente ; les etapes tres rapides peuvent etre sautees
  entre deux polls. Les mises a jour ne reconstruisent pas les actions.
- 34 tests JS, neuf tests Python hebergements et vingt tests de transport
  OSM passent. Navigateur avec reponses controlees : passage de l'attente
  OSM au fournisseur avec temps ecoule, puis annulation explicite.
- Quatre modules HTTPS et deux scripts serveur compares au runtime teste.
  Manifeste et API jeu verifies, services actifs. A la position signalee,
  l'API live transmet `phase=provider`, `provider=overpass-api.de`.
- Les quinze journaux de depart existants restent inchanges. Aucune baisse
  des probabilites d'accueil activee. Retour code :
  `/home/ubuntu/arcane-path-before-deploy-b2ebd65.tar.gz` (0600).

## Derniere livraison - recherche d'hebergements annulable

- **17 octobre 2026** : runtime `45cc324`, tag
  `deploy-2026-10-17-lodging-search-ui`, developpement `131b991`,
  base live `9616997`. Deux modules et manifeste uniquement ; aucun
  redemarrage serveur ni changement des sauvegardes.
- La recherche automatique affiche un bouton actif pour annuler, un delai
  maximal explicite de quatre minutes et une confirmation d'annulation.
  La relance est immediate ; une ancienne reponse ne termine pas la
  nouvelle recherche. Fermer le menu annule toujours la recherche client.
- 31 tests cibles passent dans le developpement et le runtime isole.
  Navigateur : bouton actif, annulation, relance, retour du libelle et
  raccourci numerique verifies avec une source deliberement en attente.
- Manifeste et deux modules HTTPS compares au runtime teste ; API jeu
  verifiee. Retour code :
  `/home/ubuntu/arcane-path-before-deploy-45cc324.tar.gz` (0600).

## Derniere livraison - photo aerienne IGN de secours

- **17 octobre 2026** : runtime `9616997`, tag
  `deploy-2026-10-17-aerial-photos`, developpement `8574a61`,
  base live `58f4f51`. Six assets statiques et manifeste, sans carnet photo,
  partage de journaux, redemarrage serveur ni modification des sauvegardes.
- Fallback IGN exact-cell en France metropolitaine/Corse, pays confirme,
  credits/licence et etiquette aerienne ; recherche classique toujours 2 km.
  Les anciens caches photo vides sont retentes. Descriptions inchangees,
  aucune photo aerienne utilisee comme indice du parent.
- 63 tests cibles isoles reussis. Les deux positions signalees ont retourne
  une image IGN ; 43.778990/2.407230 verifie dans le navigateur : JPEG
  512x512, 33422 octets, 1252 couleurs echantillonnees (pas une image vide).
- Six assets HTTPS compares octet par octet, manifeste et API verifies.
  Le pays de la position signalee est confirme FR par l'endpoint live.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-9616997.tar.gz`
  (0600). Aucune restauration de base de donnees necessaire.

## Derniere livraison - indices narratifs et petits signes

- **17 octobre 2026** : runtime `58f4f51`, tag
  `deploy-2026-10-17-clue-reassurance`, developpement `68da9d5`,
  base live `98e91ef`. Livraison statique isolee : cinq assets et manifeste,
  sans carnet photo, IGN, partage de journaux ni changement serveur.
- Probabilite plus douce, petits signes sans destination, garantie apres
  trois cases distinctes sans resultat pres du trajet, historique persistant
  compatible avec les anciennes sauvegardes, vingt formulations FR/EN.
- 62 tests cibles JS reussis sur base live valide : indices, actions,
  sauvegardes, non-divulgation et couleurs. Navigateur : quatrieme recherche
  distincte donnant un signe, aucun saut d'etape, statut vert effectivement
  calcule, lieu/temps de decouverte et absence de nom futur verifies.
- Cinq assets HTTPS compares octet par octet au runtime teste ; manifeste
  exact et `/api/travel` verifie. Aucun redemarrage ni ecriture en base joueur.
- Retour code prive : `/home/ubuntu/arcane-path-before-deploy-58f4f51.tar.gz`
  (0600). Ne pas restaurer de base SQLite pour ce retour statique.

## Livraison precedente - hebergements reels a proximite

- Runtime `98e91ef`, tag `deploy-2026-10-17-nearby-lodging`,
  developpement `99970d3`, base live `8962aa0`.
- Recherche 5 km depuis le sommeil et la ville, OSM noeuds/ways/relations,
  positions mondiales, cache serveur et avertissements de sources incompletes.
  Dormir requiert toujours la case exacte. Aucun catalogue DATAtourisme importe.
- 55 tests JS et sept tests Python cibles reussis ; navigateur avec neuf
  hebergements reels pres de Firmi, aucun sommeil distant, arrivee aux
  Carillons puis paiement/avance de huit heures verifies.
- Six assets HTTPS compares octet par octet, scripts serveur et proxy hashes
  verifies ; API live retournant neuf lieux sans avertissement. Nginx et
  service actifs. Les quinze journaux de depart immuables inchanges.
- Backups : `/var/lib/arcane-path/backups/journeys-before-98e91ef.sqlite3`
  et `/home/ubuntu/arcane-path-before-deploy-98e91ef.tar.gz` (0600).
  Ne pas restaurer une ancienne base sur les creations posterieures.

## Derniere livraison - indices progressifs et reconnaissance incertaine

- **17 octobre 2026** : runtime `8962aa0`, tag
  `deploy-2026-10-17-progressive-clues`, base live `49ba8c7`.
  Developpement : `63c4002`. Neuf fichiers runtime et manifeste, sans
  hebergements en cours ni changement de configuration/proxy.
- Recherche dans les cases terrestres chargees, probabilite selon la proximite
  du chemin de reference cache, precision et cout aleatoire selon la proximite
  de la ville recherchee. Nouvelles pistes vagues ; fragments et photos
  peuvent etre montres a des temoins susceptibles de se tromper.
- 310 tests JavaScript reussis ; Python 135/137, avec les deux memes echecs
  preexistants de configuration photo. Les quatorze tests de chemin,
  proximite et reconnaissance HTTP passent.
- Verification navigateur FR/EN sur fixtures explicites : fragment vague,
  suggestion erronee non confirmee, indice precis moins couteux a proximite,
  sauvegarde/relecture sans saut d'etape ni fuite de la ville suivante.
- Sept modules compares octet par octet via HTTPS authentifie ; deux scripts
  serveur compares par SHA-256 ; manifeste, API et reconnaissance GeoNames
  reelle verifies. Aucune geometrie ni marqueur de bonne reponse expose.
- Backup SQLite coherent :
  `/var/lib/arcane-path/backups/journeys-before-8962aa0.sqlite3` (0600).
  Les quatorze departs existants sont strictement identiques apres livraison ;
  aucun nouveau depart de controle ni modification des donnees joueurs.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-8962aa0.tar.gz`
  (0600). Le nouveau module trail-search.mjs reste inerte avec les anciens
  imports. En cas de retour code, ne pas restaurer la base SQLite sur les
  nouvelles creations. Service redemarre et API verifiee avec attente de
  disponibilite ; Nginx actif et cache partage inchange.

## Derniere livraison - couche 9, jalon narratif leger termine

- **17 octobre 2026** : runtime `49ba8c7`, tag
  `deploy-2026-10-17-layer-nine`, base live `4b3c836`.
  Developpement correspondant : `f6bc5c4` et generateur deja present sur la
  branche de developpement, auparavant exclu du runtime.
- Onze fichiers runtime et manifeste : generateur de recit du parent pour les
  nouvelles parties, chronologie, fausses pistes facultatives, poursuite mobile
  finie ; preparation automatique de la seule etape de reference courante,
  non bloquante, erreurs visibles et reessai hors du journal.
- 290 tests JavaScript reussis. Python : 133/135 reussis ; les deux echecs
  de configuration photo (10 dans YAML contre 5 exporte/attendu) ont ete
  reproduits sur la base live inchangee. Aucun changement de config.yml.
- Verifications navigateur FR/EN avec vraie creation serveur locale et
  terrain/chemins explicitement simules : panne de reference non bloquante,
  sauvegarde/reprise du recit, indice obtenu et visite decouverte preserves.
  Tests narratifs jusqu'aux retrouvailles stationnaires, mobiles precoces et
  treizieme ville, avec sauvegarde/relecture apres chaque transition.
- Huit assets HTTPS compares octet par octet ; trois scripts Python compares
  par SHA-256. Creation reelle HTTPS, replay idempotent et lecture verifies,
  puis validation navigateur et sauvegarde/relecture du depart reel.
- Backup SQLite coherent avant livraison :
  `/var/lib/arcane-path/backups/journeys-before-49ba8c7.sqlite3` (0600).
  Les treize departs precedents sont verifies strictement identiques apres
  mise a jour. Le seul nouveau depart de controle est conserve comme les autres.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-49ba8c7.tar.gz`
  (0600). Le nouveau script parent_story.py reste inerte si les anciens imports
  sont restaures. Service arcane-path redemarre ; API disponible, Nginx valide,
  services actifs, lien `.cache` et caches partages preserves.
- Simulation avancee terrain/budget de survie toujours reportee (R-083).
  Recherche d'hebergements et autres modifications en attente non incluses.

## Derniere livraison - piste du parent sans navigation precise

- **17 octobre 2026** : runtime `4b3c836`, tag
  `deploy-2026-10-17-parent-reminders`, base live `ec80dd6`.
  Developpement correspondant : `3f02bcd`.
- Trois assets statiques et manifeste : rappel des indices et du lieu connu,
  sans nombres de cases, distances, estimations de trajet ni lien cartographique
  vers la cible. Historique avec texte des indices, sans fiche interne.
- 277 tests JavaScript reussis ; cas Berchem et dialogue reel verifies en FR/EN.
  Trois assets HTTPS compares octet par octet, manifeste et `/api/travel`
  verifies. Services actifs sans restart ; sauvegardes et caches preserves.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-4b3c836.tar.gz`,
  archive privee mode 0600 des trois anciens assets et du manifeste.
- Hebergements et preparation automatique des parcours non inclus.

## Derniere livraison - erreurs musicales et charisme du tarot de depart

- **17 octobre 2026** : runtime `ec80dd6`, tag
  `deploy-2026-10-17-music-charisma`, base live `2b5977e`.
  Developpement correspondant : `dec65ef`.
- Cinq assets statiques et manifeste : frappes incorrectes penalisees,
  arret immediat sans gain a 3-8 erreurs selon le charisme de la carte de
  depart uniquement. Charisme, seuil et erreurs visibles dans le mini-jeu.
- 274 tests JavaScript du runtime isole reussis ; navigateur FR/EN verifie
  avec l'Hermite (3) et le Bateleur (8), une note reussie puis echec sans gain,
  couts de 30 minutes et quatre fatigue conserves. Cinq assets HTTPS compares
  octet par octet, manifeste et `/api/travel` verifies.
- Services actifs sans restart ; sauvegardes, configuration et caches
  serveur preserves. Travaux hebergements et piste du parent non inclus.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-ec80dd6.tar.gz`,
  archive privee mode 0600 des cinq anciens assets et du manifeste.

## Derniere livraison - prix et portions des repas

- **17 octobre 2026** : runtime `2b5977e`, tag
  `deploy-2026-10-17-meal-offers`, base live `dd1d6b9`.
  Developpement correspondant : `1aebe52`.
- Trois assets statiques et manifeste : offres de repas a 70-150% du tarif
  local, stables par partie/case/repas/jour UTC, recuperation de faim
  proportionnelle au prix. Les autres usages du prix local restent inchanges.
- 272 tests JavaScript du runtime isole reussis ; menu navigateur avec prix
  et calories differents, rerender stable et achat au prix affiche verifies.
  Trois assets HTTPS compares octet par octet, manifeste et `/api/travel`
  verifies. Services actifs sans restart ; configuration et caches preserves.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-2b5977e.tar.gz`,
  archive privee des trois anciens assets et du manifeste.

## Derniere livraison - rythmes musicaux aleatoires

- **17 octobre 2026** : runtime `dd1d6b9`, tag
  `deploy-2026-10-17-random-rhythm`, base live `e86befe`.
  Developpement correspondant : `5687384`.
- Quatre assets statiques et manifeste : nouvelle phrase de huit notes et
  quatre silences tiree a chaque prestation, partagee par affichage, score
  et accompagnement WAV natif. Trois repetitions, couts et gains inchanges.
- 267 tests JavaScript du runtime isole reussis ; quatre assets HTTPS compares
  octet par octet, manifeste et `/api/travel` verifies. Services actifs, aucun
  restart, changement de configuration ou modification des caches serveur.
- Retour code : `/home/ubuntu/arcane-path-before-deploy-dd1d6b9.tar.gz`,
  archive privee des quatre anciens assets et du manifeste.

## Derniere livraison - meteo, indices, sommeil et audio du mini-jeu

- **17 octobre 2026** : runtime `e86befe`, tag
  `deploy-2026-10-17-weather-clues-sleep-audio`, issu de la base live
  `ed19caa`. Developpement correspondant : `044c5f0`.
- Douze assets statiques et manifeste livres : exposition froid/chaleur/pluie,
  recherche aleatoire d'indice avec vraie photo, pression de sommeil nocturne
  et sommeil force a barre pleine, mini-jeu musical lu en WAV PCM natif.
  Aucun generateur Python de nouvelles histoires du parent n'est livre.
- **Validation** : 265 tests JavaScript du runtime isole reussis ; photo
  Commons reelle affichee dans le navigateur avec cout de 30 minutes,
  credit/source/licence ; decodage/lecture audio natifs et depart/arret du
  mini-jeu verifies. Confirmation auditive sur l'appareil du joueur encore
  necessaire. Douze assets HTTPS compares octet par octet, manifeste et
  `/api/travel` verifies ; services `arcane-path` et `nginx` actifs, sans restart.
- Retour code :
  `/home/ubuntu/arcane-path-before-deploy-e86befe.tar.gz`, mode 0600.
  Le nouveau module `weather-effects.mjs` reste inerte apres restauration
  des anciens imports. Le lien `.cache` vers `/var/lib/arcane-path/cache`,
  la configuration et les donnees serveur ne sont pas modifies.

## Etat reel

Region verifiee : **EU-WEST-PAR (Paris)**. Le jeton OpenStack correspond au
projet du fichier OpenRC. Aucun acces au domaine ou a la facturation OVH n'a
ete etabli avec ce jeton.

| Element | Etat | Cout supplementaire estime |
| --- | --- | --- |
| Cle SSH publique `arcane-path-preview` | Creee et suivie par Terraform | Aucun cout identifie |
| Instance CPU b3-8 | Creee a Paris, cloud-init termine | 0,06144 EUR TTC/heure estime |
| Groupe et regle de securite dedies | Non crees ; groupe default inchange | 0 EUR |
| GPU, volumes additionnels, IP flottante | Non crees | 0 EUR |
| Domaine arcane-path.eu | DNS A 57.130.85.251 ; previsualisation HTTPS protegee par mot de passe | Tarif domaine non confirme ; certificat gratuit |
| Deploiement du jeu sur OVH | Service actif, HTTP et generation de parcours verifies par tunnel | Inclus dans la VM |
| Sauvegarde distante | Non configuree | Tarif non confirme |

L'inventaire initial indiquait zero instance ; Terraform a ensuite cree une
seule VM. Ce rapport n'est pas un releve de facturation de l'ensemble du compte.

## Budget previsionnel

Source publique consultee :
[catalogue Public Cloud OVH France](https://eu.api.ovh.com/1.0/order/catalog/public/cloud?ovhSubsidiary=FR),
plan `b3-8.consumption.3AZ`, le 17 octobre 2026.

- Instance b3-8 : 2 vCPU, 8 000 Mo de RAM, disque local 50 Go.
- Calcul : 0,0512 EUR HT/heure ; taxe catalogue 0,01024 EUR/heure.
- Total : **0,06144 EUR TTC/heure**.
- Mois de 30 jours : **44,24 EUR TTC**.
- Mois de 31 jours (744 heures) : **45,71 EUR TTC**.
- Reserve de planification : 10 EUR/mois pour extras a confirmer ;
  calcul + reserve = **55,71 EUR TTC/mois** au maximum de 744 heures.
  Cette reserve n'achete ni domaine ni sauvegarde.

Le total reel doit ajouter les eventuels frais de domaine, sauvegardes,
stockage, reseau et autres services du compte. Les conditions tarifaires
applicables au compte restent a confirmer ; le jeton OpenStack ne permet
pas de consulter la facture. Aucun GPU n'entre dans cette proposition.

Objectif utilisateur : environ 50 EUR/mois, plafond 100 EUR/mois. Le controle
Terraform utilise le tarif releve, pas une mesure de facturation en direct.
Il ne constitue pas un plafond contractuel ; pas d'autoscaling ni de GPU.
Eteindre une VM ne garantit pas l'arret de toute facturation.

## Quota et simplification approuvee

L'appel de creation du groupe de securite a retourne HTTP 409 `OverQuota`.
Quotas reseau releves : `security_group=0`, `security_group_rule=0`.
Un groupe `default` existe deja avec 20 regles ; il n'a pas ete modifie.

L'utilisateur a ensuite approuve une solution sans groupe personnalise :
garder `default` inchange et filtrer dans Ubuntu avec nftables.
La VM a ete creee avec cette configuration. Aucune augmentation de quota
n'est necessaire pour cette premiere previsualisation.

Les quotas CPU/RAM sont suffisants : 3 instances, 6 vCPU, 25 000 Mo.

## Configuration preparee

- Terraform 1.13.5 installe dans l'espace de session, archive verifiee par SHA256.
- Fournisseur OpenStack 3.4.0 verrouille dans `infra/.terraform.lock.hcl`.
- Ressources desactivees par defaut dans le code. Les variables locales ignorees
  activent explicitement la proposition autorisee par l'utilisateur.
- Pare-feu nftables `inet` actif : entrees IPv4/IPv6 bloquees par defaut,
  sauf boucle locale, flux etablis, ICMP et SSH depuis l'IPv4 administrateur /32.
  L'etape HTTPS ajoute les ports 80 et 443 ; le groupe OVH default reste inchange.
- Cle privee locale `~/.ssh/arcane-path-ovh`, permissions 600, hors Git.
- Ubuntu 24.04 ; cloud-init termine et service systemd non privilegie prepare.
  Les fichiers du prototype sont transferes ; service `arcane-path` actif.
- SSH effectif verifie : mots de passe et connexion root desactives,
  seul utilisateur ubuntu autorise, tunnel local vers 127.0.0.1:8766 uniquement.
- Cache persistant prevu dans `/var/lib/arcane-path/cache` ; ce n'est pas une
  sauvegarde et la suppression de l'instance pourrait le perdre.

Le serveur Python reste lie a 127.0.0.1. Nginx permet maintenant l'acces a
**https://arcane-path.eu**, uniquement avec le mot de passe de previsualisation.
Le tunnel SSH reste une alternative. Le filtrage depend du systeme invite :
cloud-init ne garantit pas un pare-feu des le premier instant du demarrage.
Ne pas retirer l'authentification partagee pour ouvrir un service multi-joueurs
sans autorisation individuelle, protections adaptees et sauvegarde restauree.

## Verifications effectuees

- Cloud-init : `status: done` ; nftables : actif.
- Regles nftables lues dans la VM, incluant le filtrage IPv4/IPv6.
- Configuration SSH effective lue avec `sshd -T`.
- Service systemd actif ; socket du jeu uniquement sur `127.0.0.1:8766`.
- Test depuis le Mac au travers d'un tunnel SSH temporaire :
  page d'accueil, carte, configuration, economie et sante API en HTTP 200.
- Generation distante de dix etapes depuis Firmi reussie.
- Chemins caches, Git et tentative de traversee rejetes.
- Cache accessible en ecriture au compte de service, code non modifiable
  par ce compte. Permissions de lecture corrigees apres le premier transfert.
- Aucun parcours pieton complet de dix etapes n'a ete valide a distance.
- Le transfert initial contenait les fichiers runtime du checkpoint `d4405db`.
  Le jalon couche 9 ci-dessous les met a jour. Aucun secret transfere.

La premiere connexion SSH utilise l'acceptation de la nouvelle cle d'hote
(TOFU), puis les connexions suivantes exigent la cle locale connue.
Le tunnel de test a ete ferme ; la VM et le service restent actifs.

Validation locale du checkpoint initial : 162 tests JavaScript, 92 tests Python et
5 plans Terraform simules passes. L'ajout d'un workflow GitHub Actions a ete
refuse par GitHub (scope OAuth `workflow` absent) ; il a ete retire de la
publication. Aucune CI distante n'est donc revendiquee.

### Jalon couche 9 : depart persistant

- Creation distante par POST : HTTP 201, dix villes et zero requete externe
  pour la generation de la piste ; un reessai renvoie HTTP 200 et le meme etat.
- Redemarrage reel du service : le meme identifiant de requete retrouve le
  meme depart, et la lecture par identifiant renvoie exactement cet enregistrement.
- Base `/var/lib/arcane-path/cache/travel/journeys.sqlite3` : proprietaire
  `arcane`, permissions 0600 ; elle n'est pas lisible par l'utilisateur ubuntu
  sans privilege. Le premier controle depuis ubuntu a donc ete refuse ; la
  verification privilegiee confirme les permissions attendues.
- Test navigateur par tunnel : nouveau personnage, affichage du tarot initial,
  sauvegarde locale egale au depart conserve sur le serveur. Apres rechargement,
  Reprendre conserve exactement l'etat et ne fait aucun POST de creation.
- La musique telechargee hors Git n'est pas incluse dans le paquet : fichiers
  audio absents signales. Un chargement de carte voisine a retourne une erreur
  fournisseur 503, explicitement affichee ; la disponibilite des fournisseurs
  externes n'est pas garantie par ce jalon.
- Validation locale : **167 tests JavaScript et 101 tests Python passes**,
  dont la parite des etats initiaux pour les 22 tarots. Terraform n'a pas
  change et aucune ressource supplementaire n'a ete commandee.

Seul le depart est conserve cote serveur, pas la progression. Les sauvegardes
en cours restent locales ; routage pieton et validation complete de la couche
9 restent a faire. La base limitee a 1 000 departs doit etre incluse dans une
future sauvegarde restauree et testee. Une copie du runtime precedent est
conservee dans `/home/ubuntu/arcane-path-before-layer9.tar.gz`, mode 0600 :
elle permet un retour du code, mais ne sauvegarde pas cette base.

### HTTPS protege et certificats sur la VM

- Choix utilisateur : previsualisation HTTPS avec mot de passe, sans tunnel.
  Accord Let's Encrypt accepte et adresse de contact fournie par l'administrateur.
- Nginx et Certbot sont installes sur la VM existante. Certificat Let's Encrypt
  emis pour `arcane-path.eu`, expiration initiale au **15 janvier 2027**.
  La verification TLS du Mac reussit ; sans authentification, la racine
  repond HTTP 401. HTTP redirige vers HTTPS ; seul le chemin ACME reste public.
- Utilisateur : `preview`. Mot de passe genere dans
  `~/.config/arcane-path/preview-access.json` sur le Mac, permissions 0600.
  Il n'est pas dans Git, les arguments de commande ou les logs. Sur la VM,
  seul le hash bcrypt est dans `/etc/nginx/arcane-preview.htpasswd`,
  proprietaire root:www-data, permissions 0640.
- Script de configuration/emission installe :
  `/opt/arcane-path/scripts/configure_https.sh`. Il peut etre rejoue avec
  `--agree-tos --email ADRESSE_ADMIN`, sans changer le mot de passe existant.
  `--password-stdin` permet sa creation/rotation sans secret dans les arguments.
- Renouvellement automatique : `certbot.timer`, active. Le hook versionne
  `/etc/letsencrypt/renewal-hooks/deploy/arcane-nginx` verifie Nginx avant reload.
  Commande de controle : `sudo certbot renew --dry-run --run-deploy-hooks --no-random-sleep-on-renew`.
  Simulation distante terminee avec succes, y compris execution du hook.
- Le proxy autorise uniquement les assets du jeu et les API connues, avec
  filtrage des methodes, limite de corps et limites de requetes/connexions.
  Les scripts, sources OSM, Terraform, depots Git et caches restent inaccessibles
  par le proxy. Les credentials HTTP ne sont pas transmis au backend Python.
- Tests HTTPS depuis le Mac avec credentials charges en memoire : assets et
  API en HTTP 200 ; creation 201, reessai 200 identique, lecture identique ;
  absence de credentials 401 ; chemins du depot refuses ; origine et methode
  interdites refusees ; limite de creation effectivement verifiee (HTTP 429).
- Le pare-feu persistant ajoute seulement 80/443, conserve la restriction SSH,
  et garde l'ancienne configuration dans `/etc/nftables.before-https.conf`.
  Le cloud-init Terraform existant n'est pas modifie : pas de remplacement VM.
- Aucun GPU, nouvelle VM, volume ou service payant additionnel. Certificat et
  logiciels gratuits ; les frais de domaine/reseau du compte restent a verifier.
- Quatre tests locaux cibles passes (trois pour la configuration HTTPS et un
  pour le paquet runtime). Reexecution du script sur la VM validee : certificat
  encore valable reutilise, mot de passe conserve et aucune nouvelle regle
  pare-feu dupliquee. Le refus 429 contient une erreur JSON et Retry-After.

La sauvegarde navigateur reste propre a l'origine : les voyages sur localhost
ne sont pas automatiquement presents sur `https://arcane-path.eu`.
Cette protection est un compte partage de test, pas une gestion de comptes
joueurs. Aucun test de charge ou audit de securite complet n'est revendique.

### Checkpoint deploye : recuperation du gameplay

- **17 octobre 2026** : commit `b89cc2bba454d84b66fa774cf88f23bcc4b5e164`,
  tag pousse `deploy-2026-10-17-gameplay-recovery`.
- Hospitalite, reequilibrage du repos nocturne, pas sonores, prechargement
  immobile, agenda/cadran, copie des coordonnees et correction des relations
  de couverture OSM incompletes sur les morceaux externes.
- 193 tests JavaScript et 109 tests Python passes avant empaquetage.
- HTTPS authentifie : manifeste `public/release.json` egal au commit attendu,
  API voyage et nouveaux modules en 200, WAV de pas accessible (7 982 octets).
  Nginx valide, services actifs, cache persistant et base de voyages conserves.
- Retour code possible avec `/home/ubuntu/arcane-path-before-deploy-b89cc2b.tar.gz`,
  permissions 0600. Cette archive exclut le cache et n'est pas une sauvegarde
  des voyages. Aucun nouvel abonnement ni ressource payante.

### Checkpoint deploye : repas et musique

- **17 octobre 2026** : commit `7100f2bbe3caae68e28d9adeaeb3b55abf399e25`,
  tag pousse `deploy-2026-10-17-food-music`.
- Repas simple dans toutes les localites, restaurants OSM actuels proposes
  avec source et limites explicites ; melodie et accompagnement synchronises
  du mini-jeu musical, retours des frappes justes/fausses.
- 203 tests JavaScript passes, suite Python de 109 tests toujours valide
  (aucune modification Python dans ce checkpoint). Verification navigateur :
  contexte Web Audio running, 24 voix programmees ; achat du repas simple.
- Services distants actifs et API voyage 200. Manifeste HTTPS authentifie egal
  au commit attendu ; module musical et module economie avec repas simple
  effectivement servis en 200.
- Archive de retour code, hors cache :
  `/home/ubuntu/arcane-path-before-deploy-7100f2b.tar.gz`, mode 0600.

### Checkpoint deploye : aide des raccourcis

- **17 octobre 2026** : commit `b94763e500a9355c7a3eaee08797aad340a3cbd1`,
  tag pousse `deploy-2026-10-17-controls`, PR #5.
- Popup Commandes a la premiere preparation de chaque visite, rouvrable
  par ? ou le bouton. Liste derivee des vrais raccourcis, usages FR/EN,
  fermeture Echap et defilement mobile.
- 205 tests JavaScript passes ; derniere suite Python : 109 tests passes,
  aucun changement Python depuis. Navigateur : 20 lignes, focus dans le
  dialogue, pas de debordement a 375 px, fermeture Echap, reouverture ? et
  absence d'ouverture pendant la saisie.
- Nginx et service jeu actifs, API voyage 200. Verification HTTPS authentifiee :
  manifeste egal au commit exact, page avec le dialogue et les deux modules
  de commandes effectivement servis en 200. Les correctifs repas/musique du
  checkpoint precedent sont inclus.
- Archive de retour code hors cache :
  `/home/ubuntu/arcane-path-before-deploy-b94763e.tar.gz`, mode 0600.
- Ce checkpoint termine les corrections de jouabilite en cours, pas la couche 9
  complete : itineraires pietons, algorithme complet du parent et validateur
  de resolubilite restent explicitement non implementes.

### Checkpoint deploye : evanouissement au lieu de fatigue fatale

- **17 octobre 2026** : commit `b6cd3e130976d66550aa311b3908ae7509aa5d53`,
  tag pousse `deploy-2026-10-17-fainting`.
- A 100 fatigue : huit heures d'inconscience dans la meme case, retour a
  exactement 40 fatigue ; faim et metabolisme continuent, exposition nocturne
  comptabilisee. Vol fictif selon lieu/tarots, 25--50% de la bourse,
  resultat deterministe sauvegarde. Les anciennes parties terminees restent
  terminees. Actions interrompues sans indices/gains/accueil apres le reveil.
- 212 tests JavaScript passes. Aucun changement Python depuis les 109 tests
  passes du checkpoint precedent. Navigateur : mouvement, evanouissement,
  480 minutes supplementaires, fatigue 40, vol persiste et popup FR verifies ;
  sauvegarde locale precedente restauree apres le test.
- Service jeu et Nginx actifs ; API voyage 200. Manifeste HTTPS authentifie
  egal au commit attendu. Modules economie, survie, notifications, traduction
  et voyage effectivement servis en 200 avec les nouvelles regles.
- Archive de retour code hors cache :
  `/home/ubuntu/arcane-path-before-deploy-b6cd3e1.tar.gz`, mode 0600.
  Lien du cache et base des departs conserves ; aucune nouvelle ressource.
- Priorite enregistree : finir la couche 9 (chemins A* bornes sur la grille,
  algorithme parent et resolubilite), puis passer directement a la couche 15
  (photos et carnet). Ce checkpoint ne termine pas la couche 9.

### Checkpoint deploye : fallback cartographique Paris / Louis Blanc

- **17 octobre 2026** : commit `cd562013f727a8836c421ce8bc231aebe7ce902d`,
  tag pousse `deploy-2026-10-17-paris-map`.
- Les cellules manquantes sont des telechargements inacheves, pas des cellules
  vides. Logs reels : quota OSM HTTP 509, erreurs 502/500 des deux Overpass.
  Les grilles deja conservees se lisent en 8--23 ms sur le serveur.
- Le fallback ne descend plus recursivement dans toutes les relations de
  transport/administration, potentiellement nationales : noeuds, chemins,
  multipolygones et leurs membres restent demandes.
- Essai reel depuis OVH : morceau Paris `(1,-2)`, au nord de Louis Blanc,
  source complete recue par Overpass en 34,35 s, grille 8 x 8 construite et
  cache disque verifie. Reprise des autres morceaux de la vue en cours ;
  ce checkpoint ne garantit pas la disponibilite des fournisseurs.
- 16 tests du telechargeur passes. Service et Nginx actifs, cache persistant
  conserve. Manifeste HTTPS authentifie egal au commit exact, API voyage 200.
  Archive de retour code hors cache :
  `/home/ubuntu/arcane-path-before-deploy-cd56201.tar.gz`, mode 0600.
- Correctif deploye depuis un worktree propre, sans le routage couche 9
  encore en cours dans le worktree principal.

### Checkpoint deploye : cache stable, retours visibles et chemins sur grille

- **17 octobre 2026** : commit `1d97170452d65b32b94205ba77eea50164484460`,
  tag pousse `deploy-2026-10-17-cache-feedback-paths`.
- Inclut le correctif de resultat de cueillette `eac8c68` : resultat/erreur
  en haut du dialogue, focus et defilement. Confirmation manuelle de
  sauvegarde visible dans le viewport, heure reelle, mention navigateur ;
  erreur de stockage en alerte, jamais en succes.
- Identite des grilles separee des API et du transport. Migration explicite
  de 17 grilles compatibles depuis le pipeline
  `9d5affc03d4d75553e2fe93d335e8a729ad77bc723753b7afd139caccd610d7c`,
  apres verification somme de controle/geometrie, sans telechargement ni
  rasterisation. Apres redemarrage : neuf morceaux Louis Blanc HTTP 200,
  0,43 s au total, aucune nouvelle preparation.
- Moteur A* borne, cache partage et traces conservees par partie/etape.
  Lancement volontaire depuis le journal, pas de telechargement distant
  automatique pendant les tests. Resume seulement cote navigateur, trace
  cachee. Ce jalon ne termine pas la couche 9 ni ne garantit une etape
  distante complete validee : narration parent et resolubilite restent ouvertes.
- 224 tests JavaScript et 126 Python passes. Navigateur : resultat de
  cueillette visible dans un dialogue de 320 px, confirmation/erreur Save,
  journal chemins avec reponse simulee et mention altitude manquante.
  Tests Python : terrain reel prepare Firmi, couts/detours, bornes,
  persistance/reprise, migration sans reseau et API ; 1 944 cas de couts
  compares exactement aux regles JavaScript.
- Nginx teste puis recharge, services actifs. Manifeste HTTPS authentifie
  egal au commit exact ; nouveaux modules, HTML et API verifies. Endpoint
  chemins teste avec identifiant inexistant, sans creer de partie ni download.
- Archive code hors cache :
  `/home/ubuntu/arcane-path-before-deploy-1d97170.tar.gz`, mode 0600.
  Ancien Nginx : `/home/ubuntu/arcane-nginx-before-1d97170.conf`, mode 0600.
  Cache et base des departs preserves. Aucune ressource payante ajoutee.

### Checkpoint deploye : voisins caches hors file et rotation des sources

- **17 octobre 2026** : commit `f4fba25`, tag pousse
  `deploy-2026-10-17-cache-queue-rotation`.
- Corrige un second probleme distinct de l'identite du cache : deux preparations
  lentes bloquaient les voisins pourtant deja caches dans la file du navigateur.
  Lecture groupee de neuf morceaux maximum, sans nouveau travail ni appel
  fournisseur, puis preparation des seuls morceaux absents.
- La capture concernee demandait Paris x=4..6, y=-3..-1, et non les neuf morceaux
  Louis Blanc testes auparavant. Des morceaux n'avaient aucune ancienne copie ;
  les attentes HTTP 509 fournisseur ne venaient donc pas toutes du cache.
- API OSM et deux sources Overpass alternees a partir de la derniere source
  selectionnee. Catalogues villes/lieux egalement alternes ; cooldowns partages,
  acces reseau toujours serialise et Retry-After respecte pour les catalogues.
  Cela ne garantit pas le premier chargement si les fournisseurs sont indisponibles.
- 55 tests cibles passes : 14 JavaScript streaming, 11 Python serveur,
  20 telechargement OSM et 10 parcours de villes. Test de regression avec les
  deux preparations bloquees et voisins caches disponibles avant leur resolution.
  Validation serveur dans un worktree propre au commit exact ; modification
  locale utilisateur du nombre de photos conservee et exclue du deploiement.
- Identite de grille avant/apres strictement egale :
  `7ccc8a3695deecf956b432b48ccdb8f58f9c773b52e4328bcd1f8feb6baf0886`.
  Aucune migration ni invalidation. Lien cache preserve, Nginx teste/recharge,
  services actifs, manifeste et nouveaux modules verifies en HTTPS authentifie.
- Verification HTTPS groupee : neuf morceaux Louis Blanc en 0,637 s ; sept
  morceaux deja termines dans la zone de la capture en 0,18 s. Deux morceaux
  y restent absents du cache. Sonde absente explicite : liste vide en 0,063 s,
  sans telechargement. Pas de promesse de couverture complete de Paris.
- Rollback hors cache :
  `/home/ubuntu/arcane-path-before-deploy-f4fba25.tar.gz`, mode 0600 ;
  ancien Nginx `/home/ubuntu/arcane-nginx-before-f4fba25.conf`, mode 0600.
  Aucune ressource payante supplementaire ni import regional massif.

### Checkpoint deploye : resultat d'hospitalite visible

- **17 octobre 2026** : commit `b035fa6`, tag pousse
  `deploy-2026-10-17-hospitality-feedback`.
- Apres confirmation utilisateur que le message arrive apres le premier clic
  ou raccourci 1 : resultat du vrai essai affiche sous le bouton, avant
  l'explication de la limite quotidienne, focus et defilement visibles.
  Aucune suppression d'historique ni modification des regles.
- 18 tests JavaScript cibles passes, dont refus FR/EN, ouverture sans effet,
  nouvelle ville et horodatages exacts du signalement Tremblay. Navigateur reel :
  dialogue de 320 px deja defile, refus visible et focalise, un seul essai.
- Seuls `economy-ui.mjs` et `public/release.json` remplaces : pas de redemarrage
  du service ni interruption volontaire des preparations de terrain.
  Services actifs ; manifeste exact, module identique et API verifies en HTTPS
  authentifie. Cache et sauvegardes non modifies.
- Rollback statique :
  `/home/ubuntu/arcane-path-before-deploy-b035fa6.tar.gz`, mode 0600.
  Modification locale utilisateur de configuration photo exclue.

### Checkpoint deploye : refus d'hospitalite explicite

- **17 octobre 2026** : commit `d4897fe`, tag pousse
  `deploy-2026-10-17-hospitality-wording`.
- Texte FR/EN : refus explicite, absence de sommeil, tentative consommee meme
  en cas de refus ; prochain jour UTC ou autre localite pour reessayer.
- 24 tests JavaScript cibles passes. Module de traduction et manifeste verifies
  identiques au commit en HTTPS authentifie ; services actifs, sans redemarrage.
  Sauvegardes, probabilites et cache inchanges, configuration utilisateur exclue.
- Rollback :
  `/home/ubuntu/arcane-path-before-deploy-d4897fe.tar.gz`, mode 0600.

### Checkpoint deploye : musique avec silences et trois boucles

- **17 octobre 2026** : commit `e28c7d8`, tag pousse
  `deploy-2026-10-17-music-loops`.
- Phrase de 12 cases : huit notes et quatre silences, trois boucles, 24 notes
  au total. Pas 400 ms, tolerance 150 ms ; audio et reperes synchronises.
  Compteur de boucle, silences vides ; plafond de revenu et cout de jeu inchanges.
- 32 tests cibles passes (musique, audio, UI, langues et sauvegardes). Navigateur :
  quatre cases vides, compteurs 1/3, 2/3, 3/3 et score final 24/24 verifies.
- Cinq assets statiques et manifeste remplaces, tous compares en HTTPS au commit.
  Services actifs ; pas de redemarrage ni modification des caches/sauvegardes.
  Travail couche 9 en cours et configuration utilisateur exclus du paquet.
- Rollback :
  `/home/ubuntu/arcane-path-before-deploy-e28c7d8.tar.gz`, mode 0600.

### Checkpoint deploye : arrivee en ville avec tolerance d'une case

- **17 octobre 2026** : commit runtime `371ddc4`, tag pousse
  `deploy-2026-10-17-town-arrival`. Correctif reporte sur la branche de
  developpement par `ed916a7`.
- Parcours de villes : case cible et huit voisines acceptent les enquetes.
  A deux cases sur un axe, l'arrivee n'est pas encore validee. Meme helper
  pour indice, journal, actions et bouton d'enquete ; parcours locaux inchanges.
- 32 tests cibles passes, dont les 25 offsets d'un voisinage 5 x 5, sauvegarde
  apres enquete sans teleporter le joueur et conservation des anciens parcours.
  Navigateur : reproduction Cuise-la-Motte une case au nord, distance 0,2 km,
  arrivee et quatre enquetes disponibles.
- Seuls `trail.mjs` et manifeste remplaces, verifies en HTTPS. Services actifs,
  aucune interruption des preparations ni modification de sauvegarde/cache.
  Le moteur narratif en developpement n'est pas deploye avec ce correctif.
- Rollback :
  `/home/ubuntu/arcane-path-before-deploy-371ddc4.tar.gz`, mode 0600.

### Checkpoint deploye : plats europeens et abri fictif dans les lieux de culte

- **17 octobre 2026** : commit runtime `5f9e70a`, tag
  `deploy-2026-10-17-worship-european-food`. Integration developpement :
  `6fd0426`. Base live `371ddc4` ; moteur narratif couche 9 exclu.
- Catalogue de 19 plats : quinze ajouts couvrant quinze pays europeens,
  pays confirme et bornes geographiques, distinction regional/national.
  Les ajouts sont disponibles a la reprise sans remplacer les anciens plats
  ni modifier le portefeuille ou la progression.
- Lieux de culte actifs accessibles de la case : demande d'abri gratuite,
  trente minutes, chance selon tarot puis sommeil protege si accepte.
  Une tentative par lieu/jour de jeu UTC ; refus et accueil fictifs affiches
  immediatement et conserves dans la sauvegarde.
- 42 tests cibles, 242 tests JavaScript de la release isolee et 12 tests
  Python de cartographie passes. Navigateur a 320 px : refus visible et
  focalise, pas de sommeil accorde ; descriptions regionales/nationales
  et liens documentaires verifies.
- Six assets statiques et manifeste remplaces, chacun compare exactement en
  HTTPS au commit ; API voyage et services actifs. Aucun redemarrage,
  aucune modification des caches, genèses existantes ou configuration utilisateur.
- Rollback :
  `/home/ubuntu/arcane-path-before-deploy-5f9e70a.tar.gz`, mode 0600.

### Checkpoint deploye : dialogues varies et presentation narrative legere

- **17 octobre 2026** : runtime `7832ea9`, tag
  `deploy-2026-10-17-easy-parent-dialogue`, integration `ea85d49`.
  Base live `5f9e70a` ; aucun changement du generateur serveur.
- Discussions : trois voix deterministes ; souvenirs plus flous a sept puis
  trente jours seulement si des dates de recit existent. Le repere essentiel
  reste exact ; une enquete en attente ne revele toujours pas la ville suivante.
  Anciens voyages : voix variees, aucune date ni motivation inventee.
- Presentation des motifs et sejours historiques prete pour les voyages
  contenant deja un recit. Le moteur narratif Python reste non deploye ;
  cette release ne cree donc pas encore ces nouveaux recits sur le serveur.
- R-083 reporte les simulations terrain/survie et le routage selon motif :
  ce ne sont plus des prerequis du jalon narratif leger.
- 26 tests cibles et 243 tests JavaScript de release passes. Navigateur :
  dialogue et historique FR/EN, visites decouvertes uniquement, masquage
  pour anciens voyages et conservation du verrou de destination verifies.
- Quatre assets et manifeste compares exactement en HTTPS. API et services
  actifs, sans redemarrage ni modification de cache/configuration/sauvegardes.
- Rollback :
  `/home/ubuntu/arcane-path-before-deploy-7832ea9.tar.gz`, mode 0600.
  Restaurer les quatre anciens fichiers archives ; le module ajoute
  `parent-story.mjs` peut rester inerte ou etre retire separement.

### Checkpoint deploye : demander son chemin avec I

- **17 octobre 2026** : runtime `4c12274`, tag
  `deploy-2026-10-17-vague-directions`, integration `6044695`.
- I conserve son raccourci : reponse gratuite d'un passant imaginaire vers
  l'objectif connu, huit directions generales et distance qualitative.
  Aucun nombre de cases ni kilometres exacts dans cette reponse ; journal
  numerique et bouton de preparation des chemins inchanges.
- Arrivee et lieux non resolus restent utilisables sans devoiler la prochaine
  ville. Aucun PNJ reel, appel fournisseur, temps ou argent necessaire.
- 244 tests JavaScript de release passes ; navigateur FR/EN sur Bapaume :
  direction nord-est, distance vague, aucune etape inconnue et touche I verifies.
- Deux assets et manifeste compares exactement en HTTPS ; API et services
  actifs, aucun redemarrage ni changement des caches/sauvegardes/configuration.
- Rollback :
  `/home/ubuntu/arcane-path-before-deploy-4c12274.tar.gz`, mode 0600.

### Checkpoint deploye : rencontres pour demander son chemin et fatigue dans l'eau

- **17 octobre 2026** : runtime `ed19caa`, tag
  `deploy-2026-10-17-encounters-water`, integration `5309bc7`.
  Base live `4c12274` ; generateur narratif en attente exclu.
- I ouvre un dialogue gratuit montrant cout/chance, sans indication revelee.
  Chaque tentative : 10 minutes, +2 fatigue, metabolisme/exposition ordinaires,
  aucun argent. Reessais payants independants ; 90 % en localite et moins
  ailleurs selon terrain, 0 % dans l'eau. Evanouissement/besoin fatal bloque
  l'obtention d'indications. Cout sauvegarde normalement.
- Chaque entree dans une case d'eau ajoute 40 fatigue par pas de 250 m,
  sans reduction par endurance. Ponts cartographies comme route inchanges.
  A 100 fatigue, finalisation ordinaire de l'evanouissement.
- 249 tests JavaScript de release passes, dont probabilites mesurees pour
  chaque terrain, couts/reessais, sauvegarde, besoins, exposition, eau/ponts.
  Navigateur FR/EN : cout/chance avant action, echec puis succes payants,
  20 minutes/4 fatigue pour deux tentatives et aucune reponse gratuite.
- Six assets et manifeste verifies exactement en HTTPS ; services/API actifs,
  aucun redemarrage ni changement des caches/configuration/sauvegardes existantes.
- Rollback :
  `/home/ubuntu/arcane-path-before-deploy-ed19caa.tar.gz`, mode 0600.
  Restaurer les anciens fichiers archives ; `directions.mjs` ajoute peut rester
  inerte ou etre retire separement.

## Reprise

1. Renouveler le jeton si necessaire : expiration relevee au 18 octobre 2026
   a 13 h 02 heure de Paris. Ne jamais l'inclure dans Git ou le chat.
2. Regenerer un plan Terraform ; ne pas reutiliser l'ancien plan.
3. Verifier que le plan ne remplace ni ne detruit aucune ressource existante.
4. Utiliser HTTPS et le mot de passe prive, ou le tunnel documente dans README.
5. Configurer une sauvegarde avec restauration testee avant ouverture sans mot de passe.
6. Traiter le domaine separement : les droits OpenStack ne le permettent pas.

Le fournisseur Terraform OVH propose aussi
[ovh_cloud_project_instance](https://registry.terraform.io/providers/ovh/ovh/latest/docs/resources/cloud_project_instance)
(API indiquee beta dans sa documentation), avec facturation, reseau public
et auto-backup. Il demande des credentials API OVH distincts du jeton OpenStack.
Le fournisseur OpenStack a ete conserve pour la VM car son authentification
fonctionne ; une migration n'est pas necessaire au deploiement actuel.

L'etat Terraform local et les variables dans `infra/` sont ignores par Git,
avec permissions privees. Aucun backend distant partage n'est configure :
conserver une copie chiffree de l'etat avant de changer de poste.
Ne jamais publier les plans ou les etats ; ils peuvent contenir des secrets.

Le premier jalon de creation de la couche 9 est deploye en prive, pas la couche
complete. La suite reprend le document de conception avec checkpoints frequents.
