# Infrastructure OVHcloud - rapport du 17 octobre 2026

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
