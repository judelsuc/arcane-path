# Les Arcanes du Chemin

## Game version and notebook rumours

Options includes the game version and a French/English changelog, with the
packaged commit and UTC date when deployment metadata is available. Local
builds and unavailable metadata are labelled explicitly. Update
[release notes](public/changelog.json) whenever delivered game behavior changes;
the deployment packager still generates `public/release.json` independently.

In ordinary journeys, the town dialog lets players ask about abandoned
notebooks from actual mapped named settlements. Reports give approximate
bearings and distance bands within 20 km, with a stable 50% draw per notebook,
settlement cell and game day. A dedicated **Travellers' notebooks** window
(shortcut **9**) explains these other travellers' stories and keeps one foldable
witness account per notebook. Conversations open this window, not an inline wall
of reports. No notebook whereabouts, pickup listing or 1 km indication appears
before a character has mentioned that notebook. After that, proximity can help;
pickup still requires being within 200 m. Reports are saved as earned clues
and rechecked for availability; they reveal no private notebook pages and do
not guarantee that another traveller has not already claimed the notebook.
Legacy passive observations remain stored but are hidden from the notebook/PDF
until the corresponding witness story has been heard. Raw fractional journey
minutes and coordinate pairs are not shown in this window.

## Parent-trail rescue dreams

After at least one hour of deliberate sleep, a guiding dream can give a broad
bearing toward the current parent stage from the sleeping location. Checks
are at least 12 game-hours apart: 50% normally, guaranteed after three failed
field searches or 24 game-hours without new parent progress. Successful
dreams remain on the corresponding trail page and in published abandoned
notebooks. The sleep choices explain the rules.

Outdoor, shelter, hotel and accepted hospitality sleep qualify; ordinary
rest, fainting, detention, care and interrupted/terminal sleep do not.
No extra time, energy or money is charged, and no model call is made.
The dream does not name hidden towns or guarantee a traversable route.
This standalone mechanism does not activate the unpublished lore/artifact
dream system.

## Nearby hosting and companion status

The sleep menu lists real hotels and public places of worship within 5 km,
including immediately available map data while the online search continues.
Each result explains the next step: **walk to its cell**, then open sleep
(**H**) to pay for a stay or ask the church/place of worship for shelter.
Choosing a destination only marks it; it does not move or sleep the player.
Worship hospitality keeps the existing chance of acceptance and one request
per place per game day. Private, inactive and abandoned places are excluded.
Later search responses retain previously mapped destinations.

An adopted dog's status is displayed directly below the player-status panel;
clicking it still opens companion care. It remains hidden without an adopted dog.

## Public agenda and transport

Normal journeys include **Public agenda and transport** (R-165). Explicit
search shows nearby dated public events and source links, with acknowledgements
saved but no attendance rewards. A publication observed after the simulated
journey clock cannot become a retroactive encounter.

Board from a mapped town/stop cell, select a departure, then confirm its UTC
dates and estimated game fare. Continue in player-triggered steps of at most
30 minutes: awake survival/pressure rules apply every minute, payment occurs
once at boarding, cancellation is free only before boarding. Timetable/booking
saves resume without a second charge; map vehicle links are not walking paths.
Real coverage is only the loaded licensed dated snapshots, not a live European
network. Explicitly fictional coaches connect nearby real towns where current
real coverage is absent. Provider errors do not silently become invented trips.

Options links to the [public-event preview](layers/living-world/preview.html),
using bounded OpenAgenda searches with explicit coverage, freshness, provenance
and optional openly licensed Commons photographs labelled illustrative.
It also links to the existing European transport source explorer and hybrid
Grenoble-Lyon preview. These remain separate demonstrations alongside the
ordinary-journey integration. See [coverage and privacy](layers/living-world/README.md)
and [transport sources/licences](data/transport/README.md).

Elevation-provider HTTP 429 triggers a shared, persisted cooldown of at least
one hour (longer `Retry-After` values are respected). Cached terrain and heights
stay usable; missing heights remain explicitly unavailable, not invented.
Identical elevation warnings are shown once per journey instead of per tile.
This does not fix upstream OSM delays or guarantee a complete parent route:
route preparation remains bounded and must not be mistaken for a validated
route while unavailable.

Movement controls show a French/English explanation while blocked by a foreground
action/map load, missing current terrain, a pending encounter/game, an active
transport booking, or journey end. The explanation does not dismiss an encounter,
change the save, or bypass the action lock. Recovery after waiting alone does not
establish which blocker caused a particular incident.

## Content factory and gameplay feedback release

See [the content-factory guide](doc/CONTENT_FACTORY.md) for optional OVH
encounter wording, journal artwork, and the shared start-page illustration
scheduled at 05:00 Europe/Paris. Image generation stops if free pricing cannot
be verified; failed refreshes retain the previous published illustration.

This production-based release also fixes mini-game styling, mobile player
status, vigilance visibility, fatigue/sleep warnings, shelter washing,
nearby-town recovery after care, the opening clue, and the nginx journey-map
route. It does not publish the separate development artifact playtest or enable
its powers, broader dreams or lore routes in ordinary journeys.

## Shared discovery in ordinary journeys

The [shared ledger](./discovery.mjs) now records already-earned parent clues and
abandoned-journal discoveries through the [domain adapters](./discovery-targets.mjs).
The main notebook's **Clues and discoveries / Indices et decouvertes** section
and PDF export show these earned facts, including game time and
current/historical/unavailable status. Suggestions remain explicitly unconfirmed.
Found notebooks do not inherit the reader's private discoveries.

Save validation accepts old journeys without a ledger and preserves the new
ledger on resume. This does not change action costs, chances or parent progress,
disclose hidden destinations, or enable artifact custody and powers. The explicit
progress-preserving migration required by [R-169](./doc/REQUIREMENTS.md#r-169---lore-in-ordinary-journeys-and-progress-preserving-migration)
is still unimplemented.

Prototype jouable des **couches 1 a 8** : carte OSM, voyage, temps, besoins,
localites, economie, musique de rue et piste minimale du parent.
grille ASCII de 250 m, exploration a pied, horloge simulee, effort et streaming.

Les ajouts au document de conception sont suivis dans [doc/REQUIREMENTS.md](./doc/REQUIREMENTS.md).
Les prompts musicaux 8-bit et sons de jeu sont dans [audio-prompts](./audio-prompts/README.md).

## Couverture personnelle du carnet

Le recit du depart est ecrit automatiquement a partir du nom fictif du personnage,
sans bouton de regeneration. Une ancienne biographie sans cette inspiration est
remplacee une seule fois ; les relectures reutilisent ensuite le recit conserve.
Un message visible « Veuillez patienter » et un indicateur accompagnent l'ecriture ;
le voyage ne peut pas commencer avant son terme. En cas d'echec explicite, le recit
d'origine permet de continuer. La case de personnalisation concerne les evenements
uniquement. Les nouveaux textes d'evenements evoluent par jour de jeu,
sans modifier leurs effets ni remplacer une introduction deja affichee.
Un indicateur visible signale les textes en cours de generation (sans animation
si le navigateur demande de reduire les mouvements). Tous les recits de depart,
generes ou d'origine,
sont ajoutees au carnet en francais et en anglais ; une regeneration conserve
les anciennes pages. Les evenements y gardent exactement l'introduction affichee,
avec leurs effets reels. Ces pages font aussi partie du PDF et du carnet partage.

Si le voyage serveur a disparu apres une reconstruction, creer un nouveau
voyage propose d'archiver l'ancienne sauvegarde dans ce navigateur avant
remplacement. Le menu **Carnets archives** du carnet permet de consulter les
photos/pages conservees et de les exporter ; aucune restauration serveur ou
publication reussie n'est pretendue. Une erreur reseau/authentification ne
declenche pas cette procedure. Ne pas effacer le stockage du navigateur.

La couverture dispose de sa propre illustration symbolique tarot/decor,
distincte de l'image d'accueil, generee en arriere-plan par la file privee
du carnet. Son sous-titre FR/EN est genere une seule fois depuis le cadre
du depart, le tarot et le motif canonique du depart du parent, sans futur
repere ni texte prive. L'image et le sous-titre sont repris dans le PDF.
La generation photo-basee reste reportee. Voir les
[conditions et limites](./doc/CONTENT_FACTORY.md#personalized-journal-illustrations).

## Suivi des prochaines etapes

Mise a jour : 18 octobre 2026. Une coche signifie une etape effectivement
verifiee, pas seulement du code prepare. Voir le
[rapport infrastructure et couts](./doc/INFRASTRUCTURE.md).

- [x] Prototype jouable des couches 1 a 8, sauvegarde locale et besoins.
- [x] Tarifs nationaux europeens et estimation de secours stable par case.
- [x] Details reels du chargement des cartes et compteurs de requetes.
- [x] Hospitalite fictive chez les habitants : une demande par localite/jour, selon les tarots.
- [x] Repos nocturne utile : 10 fatigue recuperee avant exposition (environ 9 nets).
- [x] Pas sonores par terrain, agenda UTC et bouton Copier les coordonnees.
- [x] Huit voisins visibles precharges meme a l'arret, reessais temporaires espaces.
- [x] Repas simple payant dans toutes les localites, restaurants OSM en contexte.
- [x] Melodie, basse et retours de frappe synchronises au mini-jeu musical.
- [x] Erreurs musicales : echec sans gain a 3-8 erreurs selon le charisme de la carte de depart.
- [x] Popup des raccourcis et de leur usage a la preparation, rouvrable avec ?.
- [x] Evanouissement a 100 fatigue : 8 h, retour a 40, risque de vol selon lieu/tarots.
- [x] Acces OpenStack au bon projet et inventaire de Paris verifies.
- [x] Tarif CPU verifie : 45,71 EUR TTC maximum pour 744 heures, hors extras.
- [x] Terraform valide : une VM CPU, aucun GPU ni volume additionnel.
- [x] VM b3-8 creee a Paris : 2 vCPU, 8 Go RAM, disque local 50 Go.
- [x] Cloud-init termine ; pare-feu IPv4/IPv6 et SSH par cle verifies.
- [x] Fichiers du prototype transferes sur la VM, hors secrets et etat Terraform.
- [x] Service du jeu operationnel et tests HTTP distants termines.
- [x] Acces prive par tunnel SSH verifie ; parcours distant de dix etapes genere.
- [ ] CI GitHub Actions : publication du workflow bloquee par les droits OAuth actuels.
- [ ] Sauvegarde distante et restauration testee.
- [x] DNS arcane-path.eu : adresse A 57.130.85.251 verifiee localement et sur Cloudflare.
- [x] Certificat HTTPS valide et acces de previsualisation protege par mot de passe.
- [ ] Ouverture sans mot de passe : comptes, protections et sauvegardes a finaliser.
- [x] Couche 9, jalon leger : creation serveur, recit coherent et poursuite finie.
  - [x] Depart cree et conserve cote serveur : identifiant, graine, tarot, etat initial, contenu versionne.
  - [x] Reessais idempotents, reprise locale et anciennes sauvegardes preserves.
  - [x] Moteur A* borne sur la grille, persistance, cache et preparation automatique de l'etape courante.
  - [x] Recit factuel, chronologie, fausses pistes et poursuite mobile : parcours narratifs et sauvegardes verifies.
  - [x] Dialogues varies, souvenirs vieillissants sans perte des indices et presentation claire du motif/sejours (code).
- [ ] Plus tard (R-083) : validation terrain 30–60 km, budget de survie,
  nuits/achats sur le trajet et destinations guidees par le motif.
- [x] Couche 15, jalon accepte : photos, cartes historiques et carnet par voyage,
  pages d'indices et carnets abandonnes. Conversion ASCII encore reportee.
- [x] Couche 10 : vigilance, sympathie locale, hygiene, temoins vieillissants et
  deux placements recuperables avant une troisieme fin de voyage.
- [x] Page Statistiques dans le carnet : besoins, chemin, argent, compteurs,
  pressions et effets combines des cartes de naissance et du jour.
- [x] Douze mini-jeux approuves integres et deployes dans le vrai voyage.
- [x] Evenements illustres epingles au carnet, frequence normale restauree.
- [x] Sac spatial illustre, effets d'equipement et rencontre de chien nommable.
- [ ] Autres couches du document de conception, avec checkpoints testes.
- [ ] R-062 : caches d'objets persistantes, pour les autres joueurs et ses prochaines parties.
- [ ] R-063 : indices d'arcanes plus precis avec la proximite ; habillage narratif LLM ulterieur.
- [ ] Notifications par mail : aucun service d'envoi configure.

Le DNS resout maintenant l'IP de la VM ; le site est accessible en HTTPS
avec un mot de passe de previsualisation. Le jalon leger de la couche 9 est
termine ; la simulation avancee du terrain et du budget de survie reste reportee.
Les couts sont des estimations, pas un plafond de facturation automatise.

## Pressions et statistiques du voyage

### Douze activites dans le voyage

Le menu **Gagner de l'argent** conserve la musique de rue, le cafe et le vol,
et propose les neuf autres jeux testes quand leur contexte cartographique est
present : vendanges dans les vignes, atelier velo, croquis, marche, librairie,
livraisons, petanque, lanternes et objets trouves. Les possibilites dependent
des cellules et lieux OSM disponibles ; ce ne sont pas des emplois annonces
par les vrais etablissements.

Les conditions affichent le temps simule et la fatigue engages avant le choix
de l'activite, ainsi que le plafond de gain de base, ou le prix par point payant
pour les vendanges sans plafond artificiel. Le score joue determine
le gain reel, avec la concordance d'arcane lorsqu'elle s'applique. L'experience
progresse par activite, sans passer par les budgets de demonstration.
Fermer, annuler ou recharger n'accorde aucun gain et ne rembourse pas le temps
ni les besoins deja depenses. Un jeu actif ne peut pas etre rejoue depuis un
instantane de sauvegarde pour toucher deux fois le meme revenu. Les nouveaux
jeux respectent le son/volume global et ne capturent pas les raccourcis du sac.

### Couche 19 : sac et compagnon

Le bouton **Sac et compagnon** ouvre le sac illustre de **6 x 4 cases**.
Chaussures, sac a dos et impermeable sont portes hors grille, mais leur poids
compte dans la limite de **5,5 kg**. Selectionner puis cliquer une case,
glisser-deposer, ou utiliser les fleches et R pour deplacer/tourner un objet.
La reorganisation est gratuite ; abandonner prend du temps, sans remboursement.
Les achats, reparations et provisions du chien se font dans une localite, aux
prix de jeu affiches (pas une affirmation sur les commerces reels).

Le poids ralentit et augmente l'effort ; la marche use les objets. L'impermeable
attenue la pluie, le couchage la fatigue du sommeil dehors. La tente donne acces
aux campings cartographies accessibles, jamais au camping sauvage universel :
recuperation partielle, aucun repas inclus. Le bonus photo de l'appareil reste
annonce comme futur, faute de mecanique de qualite des photos du carnet.

Un evenement favorable peut proposer un chien : on peut refuser, ou le nommer
et l'accueillir (5 EUR, 30 minutes de jeu). Pas de rencontre garantie apres 5 km
dans le vrai voyage. Les besoins avancent pendant tout le temps simule, sans
progression hors ligne. A faim ou soins >=65, ses bonus sont suspendus :
fatigue de marche x0,95, indices +8 points, musique x1,1 et risque de vol
lors d'un evanouissement nocturne x0,9. Nourrir : 1,50 EUR / 10 min ;
entretenir : 2 EUR / 20 min. Nom, choix, besoins, et positions du sac sont
sauvegardes avec le voyage ; une ancienne partie recoit le materiel de base
sans usure retroactive. Les autres compagnons, dont un imaginaire, restent
des exigences futures.

Apres adoption, une icone de chien reste visible dans l'etat du personnage.
Son expression et son texte suivent la faim et les soins sauvegardes :
en forme sous 20 pour les deux besoins, attention des 20, soins urgents des 65.
Cliquer l'icone ouvre directement la section du compagnon dans le sac.
Il ne s'agit pas d'une nouvelle jauge de sante ; recharger ne change pas ses besoins.

### Couche 13 : evenements du voyage

Chaque evenement rencontre est automatiquement epingle une seule fois dans le
carnet, aux cotes des photos et cartes : meme illustration ASCII, date et effets
reels. Ces pages restent annotables et font partie de l'export PDF.

Pour un playtest local accelere, ouvrir `/?eventPlaytest=1` sur `localhost`
ou `127.0.0.1`. Une banniere signale une occasion toutes les **5 minutes**
de marche au lieu de 90 ; les probabilites du tarot restent identiques.
Ce mode utilise une sauvegarde separee, sans remplacer le voyage normal.
Sans ce parametre, et sur tout hote distant, la frequence normale est conservee.

Toutes les 90 minutes cumulees de marche terminee, une occasion de rencontre
est resolue. Les menus, l'attente reelle, le sommeil et les actions immobiles
ne creent pas d'evenements. Une longue action ne produit jamais une rafale.
Les anciennes parties commencent a compter a leur prochaine marche.

Les deux tarots influencent la frequence **et** la proportion d'issues favorables :
avec `F = 0.5 + (risque naissance + risque du jour) / 2`, la probabilite par
occasion vaut `0.35 * F` et la probabilite favorable conditionnelle `1 - F / 2`.
Les cartes actuelles donnent 24.5–38.5 % d'occurrence et 45–65 % d'issues
favorables parmi les rencontres mecaniques. Un quart des rencontres est
purement narratif. Les probabilites courantes figurent dans les statistiques du carnet.

Vingt evenements mecaniques : nourriture, pieces, encouragement, pauses,
sieste, lucidite, vents favorables ou contraires, pansement, pique-nique,
conseils, retard, pertes, pensees agitees, ampoules, frissons et rencontres
avec des animaux en foret. Huit petits mysteres sans effet mecanique
(cerf blanc, cloche silencieuse, ombre, spirale, inconnu, etoiles, ruban,
reflet) nourrissent aussi le recit. Chaque popup illustre l'evenement avec
une scene ASCII originale, en plus du texte localise. La notification montre
les effets reels, les cartes ayant declenche l'evenement et l'etat de sauvegarde.
Les couts de temps et de fatigue conservent les regles de faim, meteo, nuit,
evanouissement et placement. Aucun evenement ne ranime une partie terminee.

Les effets sont appliques une seule fois avant la notification ; confirmer ne
relance pas le hasard. Les tirages deterministes, occasions sans evenement et
resultats sont sauvegardes. Reprendre une partie restaure la notification en
attente sans appliquer une seconde fois ses effets. Le carnet/PDF conserve le
total et les 32 derniers evenements. Les geocaches reelles restent reportees.

### Sante et faim

La sante commence a 100. A reserve alimentaire vide, le personnage ne meurt
plus immediatement : il perd 10 points de sante par heure de jeu, seulement
pour la portion de l'action passee sans nourriture. La faim ralentit toujours
la marche progressivement, meme lorsque la reserve est deja vide.
Les blessures et certains evenements peuvent aussi affecter la sante.

Un repas ne soigne pas instantanement. Dormir avec des reserves rend
5 points de sante par heure ; une fois la nourriture epuisee, la perte reprend.
La sante a zero est mortelle, avec le meme carnet abandonne et la presentation
de mort existante. Les anciennes parties actives reprennent avec 100 sante ;
les parties deja terminees ne sont jamais ranimees.

Les bonus/malus de vitesse durent un temps de jeu borne (60 a 120 minutes),
y compris si le personnage se repose. Leur expiration en cours de pas est
prise en compte. Ils remplacent le precedent effet, sans modifier les
attributs permanents. Le panneau des besoins affiche sante et effet actif.

### Mini-jeux en cours de test local (non publies)

Jeu 10 : ouvrir `/lanterns-preview.html?lang=fr` (`?lang=en` en anglais).
Memoriser les lanternes illustrees allumees puis reproduire la suite avec les boutons
ou les chiffres. Comme Simon, la partie commence avec un element ; apres chaque
repetition reussie, la meme suite s'allonge d'un element. Objectifs par niveau :
7, 8, 9, 10 et 11 elements. Une seule erreur termine la partie sans recompense.
Le nombre de lanternes (3 a 6) et la vitesse augmentent aussi. Aide, nouvelle repetition
et annulation sont disponibles, sans lire ni modifier le voyage sauvegarde.
Chaque lanterne possede un dessin original, une couleur, un motif et un numero
(noms accessibles aux lecteurs d'ecran, sans mots sur les lanternes).
Des notes distinctes accompagnent la demonstration et chaque reponse :
la lanterne choisie s'allume pendant 260 ms, y compris la derniere reponse.
Le bouton Son coupe les notes ; annulation, fin, masquage et nouvelle partie
arretent les sons et les temporisations.

Jeu 11 : ouvrir `/bookshop-preview.html?lang=fr` (`?lang=en` en anglais).
Deviner le rayon de chaque livre a partir de son theme, puis ranger les titres
par ordre alphabetique de gauche a droite dans chaque rayon. Le tri utilise
la langue affichee, inclut les articles (Le, La, The, A), ignore les accents,
majuscules et signes de ponctuation. Ni rayon ni rang ne sont indiques sur les
livres. Choisir ensuite le titre demande par chaque client et le servir.
Le catalogue contient seize classiques reels (Verne, Stevenson, Kipling,
Conan Doyle, Baudelaire, etc.), leurs auteurs et des resumes/indices originaux.
Les couvertures illustrees sont creees pour le jeu, avec les titres francais
ou anglais ; aucune couverture commerciale n'est telechargee ou reproduite.
Les cartes restent de meme largeur, y compris la derniere ligne incomplete.
Des sons accompagnent choix, rangement, service, erreur et fin ; bouton Son,
erreurs audio explicites et arret au masquage/annulation/nouveau service.
Cinq niveaux, chronometre, limites d'erreurs et aide contextuelle ; aucun effet
sur la sauvegarde.

Jeu 12 : ouvrir `/market-preview.html?lang=fr` (`?lang=en` en anglais).
Preparer les quantites demandees, laisser les autres produits a zero, puis
rendre la monnaie exacte en euros avec le champ (par exemple 5,05) ou les pieces et billets.
Illustrations originales des huit produits, panier vivant, sons, coupure du son,
cinq niveaux et chronometre demarrant uniquement avec Commencer. Trois erreurs
ou le delai termine mettent fin au service ; aucun achat reel, sauvegarde ou
gain de voyage n'est applique dans ce bac a sable.
Le fond de caisse est limite et conserve d'un client a l'autre. Les paiements
remplissent la caisse ; les boutons indiquent les pieces/billets disponibles
et reserves pour la monnaie. Retirer ou Effacer libere la selection, qui n'est
debitee qu'au service reussi. Le champ en euros compose un montant avec les
pieces reellement presentes, sans les inventer.
Demander l'appoint permet de solliciter jusqu'a 5 euros par demande dans la
bourse limitee du client. Il peut refuser sans compter d'erreur. L'appoint
accepte augmente la somme recue et la monnaie due du meme montant ; il ne
cree aucun gain supplementaire. Choisir les denominations permet de preserver
les petites pieces pour les clients suivants.
Le niveau facile dispose de 3,40 euros de petite monnaie supplementaire.
Les boutons −0,05 € et +0,05 € ajustent l'appoint demande entre 0 et 5 euros,
sans envoyer la demande tant que Demander l'appoint n'est pas choisi.
Pour tester Justice directement :
`/market-preview.html?lang=fr&resonance=journey`.
Le premier client demande un produit au poids : ajouter/retirer les poids
etalons pour equilibrer la balance, puis preparer les autres produits et rendre
la monnaie normalement. Le prix du panier suit la pesee.

Les douze fenetres de test regroupent les regles, raccourcis clavier, explications
de difficulte et notes du bac a sable dans le bouton Aide (Help en anglais).
Les jeux integres au voyage reprennent aussi leurs commandes detaillees dans
cette aide. Les boutons a commandes natives conservent leurs infobulles au
survol et au focus, sans ajouter de raccourcis qui interferent avec le jeu.
Le pop-up se ferme avec Fermer ou Echap et rend le focus au bouton Aide, sans
quitter le jeu. Les chronometres continuent ; scores, indices, modeles, legendes
de couleur et controles restent visibles. Le contenu d'aide suit le niveau
choisi et les changements de phase.

La meme aide contextuelle est disponible sur les trois ecrans et les dix-huit
dialogues du jeu principal : depart, carte, options, tarot, carnet, photos,
services, activites, evenements et piste du parent. Chaque fenetre affiche
seulement sa propre aide, mise a jour avec son contenu et la langue choisie.
Les prix, risques, avertissements de confidentialite, recits, cartes revelees
et indices restent visibles dans leur fenetre. Fermer l'aide ne ferme pas
le dialogue sous-jacent et rend le focus a son bouton Aide. Ces changements
restent locaux, sans publication.

#### Resonance des arcanes (test local)

Chaque activite possede une carte tutelaire. Une concordance avec la carte
du voyage ou du jour active une variation legere, une illustration historique
agrandie et floutee en arriere-plan et des gains multiplies par 1,1. Les deux cartes concordantes
ne cumulent pas les effets. Les scores, couts et penalites ne sont pas
multiplies ; une partie annulee ou sans recompense eligible ne gagne rien.
Les bacs a sable affichent le taux sans verser d'argent au voyage.
Le selecteur Mode arcane permet de comparer Normal, carte du voyage, carte
du jour et les deux. Les URL acceptent `?resonance=journey`, `daily` ou `both`
(avec `&resonance=...` si `lang` est deja present). Changer le mode recommence
l'exercice ; l'Aide explique la variation active.

| Jeu | Arcane | Variation |
| --- | --- | --- |
| Cafe | Temperance | Certains clients ajoutent ou retirent un article à mi-préparation du plateau ; leur fréquence augmente avec le niveau. |
| Musique | Le Jugement | Démonstration normale, puis reproduction sans indices visuels ; seules les notes réussies apparaissent. |
| Vol | Le Diable | Choisir entre la cible ordinaire et une cible doree plus tentante. |
| Livraisons | Le Chariot | Tracer son propre parcours pendant la memorisation. |
| Vendanges | L'Imperatrice | Écraser les grappes pourries avec Espace ; une grappe pourrie dans un panier retire un point. |
| Atelier | Le Bateleur | Repeindre toute pièce montée ; une pièce impose de trouver sa bonne taille puis sa couleur. |
| Carte postale | L'Etoile | Retenir trois reperes dont seules les positions restent visibles. |
| Petanque | La Force | Tenter un carreau une fois : Main sure puis une boule cible, a toute puissance ; 75/65/55/45/35 % de reussite selon le niveau. |
| Objets trouves | La Lune | Inspecter une paire ressemblante avant de confirmer, toujours en 15 secondes. |
| Lanternes | L'Hermite | Lanternes masquees pendant la demonstration ; petites etincelles aux positions jouees avec les notes, puis lanternes visibles pour repondre. |
| Librairie | La Papesse | Interpreter le souhait d'un lecteur, avec plusieurs titres acceptables. |
| Marche | La Justice | Equilibrer une pesee pour le premier client. |

Test direct de Cafe rush : ouvrir `/cafe-preview.html?lang=fr` sur le serveur
local (`?lang=en` pour l'anglais). Ce bac a sable reutilise le vrai dialogue,
les regles et les raccourcis, avec un cafe explicitement fictif et cinq niveaux.
Il ne lit ni ne modifie la sauvegarde du voyage.

Test direct de musique : `/music-preview.html?lang=fr` (`?lang=en` en anglais),
avec son active et niveaux 0 a 4, sans acces a la sauvegarde. Utiliser un serveur
statique pour ces deux pages (par exemple `python3 -m http.server 8777 --bind 127.0.0.1`) :
elles lisent directement les fichiers de configuration publics.

Troisieme test : `/theft-preview.html?lang=fr` (`?lang=en` en anglais).
Ce bac a sable reutilise le vrai jeu de vol et ses consequences, uniquement
en memoire : aucune sauvegarde n'est lue ou modifiee. Appuyer sur Espace ou
cliquer quand le curseur traverse la zone verte ; chaque essai repart de zero,
avec une nouvelle position et une nouvelle largeur de cible.
Le selecteur de test propose aussi **Hard** : curseur 50 % plus rapide
(cycle de 1,2 s) et cible de 7 a 16 %, sans changer le delai de 9 s ni les
consequences. Ce mode reste reserve au bac a sable ; le voyage conserve Normal.
Un son bref distingue reussite et capture ; il respecte le volume et la coupure
partages. Le bac a sable dispose aussi d'un bouton pour couper le son.

Quatrieme test : `/deliveries-preview.html?lang=en` (ou `?lang=fr`).
Memoriser les lettres des colis devant les maisons fictives, puis choisir
un colis avec 1–7 et maintenir les fleches pour rouler librement a velo.
La maison a portee s'illumine ; Espace ou le bouton Livrer depose le colis.
Des boutons directionnels maintenus permettent aussi de jouer au tactile.
Niveaux 0 a 4 ; aucune sauvegarde ni consequence sur le
voyage : l'integration des couts et gains reste a faire apres validation.
Le plateau illustre colis, maisons et depot. Des consignes par phase expliquent
les associations a memoriser, puis le colis en main et la progression des
livraisons. Les colis sont centres, sans coordonnees de maisons. Un son bref
distingue bonne et mauvaise livraison, avec coupure du son dans le bac a sable.
La distance reellement parcourue (detours inclus) influe sur le score ; elle
compte les deplacements horizontaux et verticaux, avec un retour direct
automatique a la poste ajoute au bilan final. La distance minimale de reference
utilise les centres des maisons. Les zones permettent de livrer a proximite,
sans obliger a viser exactement un point.
Les chiffres de la rangee superieure et du pave numerique selectionnent les colis
(1–6, et 7 au dernier niveau). Une fois livre, le colis reste dessine devant sa
maison avec sa lettre et une coche ; les destinations encore inconnues restent
masquees.
La difficulte augmente de 3 a 7 colis, de 3×3 a 5×5 maisons et reduit la
memorisation de 15 a 9 secondes. La tournee passe de 60 a 100 secondes pour
tenir compte du village plus grand ; trois erreurs terminent toujours la partie.
Jeu de livraisons valide en test local par l'utilisateur. Le compte a rebours
reste bien visible juste au-dessus du village, avec une alerte de couleur dans
les dix dernieres secondes ; l'expiration termine la tournee sans gain.

Cinquieme test : `/harvest-preview.html?lang=en` (ou `?lang=fr`).
Vendanges : une grappe coloree et illustree tombe automatiquement ; maintenir
Gauche/Droite la guide horizontalement vers le panier de meme couleur.
Relacher arrete uniquement le mouvement horizontal. Les boutons fleches
maintenus fonctionnent aussi au tactile. Le panier sous la grappe est souligne ;
couleurs, symboles et noms permettent de reperer les associations.
Un son distingue bonne et mauvaise reception, avec coupure locale.
Les niveaux 0 a 4 proposent 3, 3, 4, 5 et 6 couleurs/paniers, avec des chutes
de 2,5, 2,45, 2,1, 1,75 et 1,4 secondes. Le niveau facile a ete renforce
apres le retour utilisateur ; les autres niveaux, dont le difficile valide,
restent inchanges. Jeu de vendanges valide en test local avec cet ajustement.
La vitesse horizontale reste fixe. Chaque manche dure 30 secondes à tous les
niveaux, sans limite de grappes : plus vous triez correctement, plus le gain
potentiel augmente, sans multiplicateur de vitesse. Appuyez puis relâchez
Espace pour une chute rapide visible (160 ms maximum), puis la suivante.
Maintenez Espace ou le bouton de chute pendant 0,5 seconde pour écraser
toute grappe avec un son distinct : +1 si pourrie, aucun point si bonne.
Une grappe pourrie dans un panier
retire un point gagné, avec un minimum de zéro. Relâchez entre deux actions.
Échap annule ; masquer la page annule aussi.
Ce bac a sable est isole de la sauvegarde et ne verse aucun gain au voyage.
Nouvelle partie permet de recommencer.

Sixieme test : `/workshop-preview.html?lang=en` (ou `?lang=fr`).
Atelier velo : reproduire un velo assemble qui reste visible a cote de votre
construction. Choisir cadre, roue arriere, roue avant, selle, pedales et guidon,
avec la meme couleur et la meme taille que le modele. Les illustrations changent
reellement de geometrie selon la taille. Comparez les deux vélos en haut :
aucune réponse écrite ne révèle la couleur ou taille attendue en bas.
Les tailles de guidon sont nettement distinctes ; un refus nomme les
pièces incorrectes sans donner la solution. Les pieces peuvent etre
remplacees ; Verifier le velo valide le modele complet, ou indique les pieces
a revoir sans remettre le chronometre a zero.
Les niveaux 0 a 4 donnent 3 a 7 choix par piece et 60, 54, 48, 42 ou 36 secondes
pour assembler un velo. Le temps ne commence qu'avec Commencer et son expiration
termine la partie. Cliquer/toucher les choix illustres, ou Tab/Entree/Espace ;
1–6 selectionne les categories, Echap annule. Aucune sauvegarde ni remuneration
du voyage n'est appliquee.
Atelier valide en test local par l'utilisateur. Un son bref accompagne chaque
piece effectivement changee, la verification incorrecte, la reussite et la fin
du temps. Le bouton Son permet la coupure ; annulation, nouvelle partie et
page masquee arretent la lecture.

Septieme test : `/sketch-preview.html?lang=en` (ou `?lang=fr`).
Croquis de carte postale : observer un motif original, puis le reproduire
de memoire en cliquant/touchant les cases. Les niveaux 0 a 4 proposent des
grilles 3×3, 4×4, 5×5, 6×6 et 7×7, avec 1, 1, 2, 2 et 4 couleurs.
Pour reduire le saut entre les niveaux 2 et 3, le niveau 2 garde deux couleurs
mais demande une memorisation plus rapide (7 secondes au lieu de 9). Le niveau 3
garde aussi deux couleurs et laisse 12 secondes au lieu de 10 pour sa grille
plus grande. L'observation dure ainsi 7, 8, 7, 12 ou 11 secondes ; ces parametres sont affiches
avant de commencer. Choisir la couleur dans la palette, puis peindre les cases ;
recliquer avec la meme couleur efface. La gomme et Effacer permettent de corriger.
Les couleurs ont aussi des symboles distincts (#, O, +, *).
Les fleches deplacent le focus, Espace/Entree bascule une case. Dessiner maintenant
masque le modele plus tot ; Terminer le croquis calcule le score, avec penalite
pour les cases superflues ou mal colorees. Le resultat conserve les symboles
de couleur et la taille reelle de la grille. La phase de dessin est sans limite de temps.
Au resultat, le modele original et le dessin du joueur sont affiches cote a cote
avec les memes dimensions et couleurs. Jeu 7 valide localement ; pas de publication.
Niveaux 0 a 4, Nouvelle partie et Echap pour annuler ; aucune sauvegarde ou
remuneration du voyage n'est appliquee.

Huitieme test : `/petanque-preview.html?lang=en` (ou `?lang=fr`).
Petanque : commencer, regler direction et puissance, puis lancer trois boules
contre l'ordinateur (trois boules aussi), chacun a son tour.
Fleches Gauche/Droite pour viser, Haut/Bas pour la
puissance, Maj pour de grands pas, Espace/Entree pour lancer, Echap pour annuler.
Les curseurs et boutons permettent aussi de jouer au tactile. Les niveaux
augmentent la difficulte du terrain et la precision de l'ordinateur.
Deux a six reliefs alternent bosses et creux, dont les pixels sont colores selon
la hauteur locale : clair pour une bosse, sombre pour un creux ;
leurs pentes locales influencent reellement la trajectoire et la vitesse.
Les niveaux superieurs ont davantage de relief et des hauteurs plus marquees.
La visee couvre ±30° pour pouvoir compenser les deviations du terrain.
La fleche indique la pente generale, separee de la hauteur locale affichee.
Le joueur est bleu (V en francais, Y en anglais), l'ordinateur rouge (O/C).
Apres les six lancers, seul le gagnant marque : une boule plus proche du cochonnet
que la meilleure boule adverse vaut un point. Les boules hors terrain sont exclues ;
une egalite des meilleures distances ne donne aucun point.
Les boules gagnantes sont surlignees de la plus proche a la plus lointaine,
avec le score qui augmente a chaque etape (trois points maximum).
La limite de trois minutes concerne les lancers ; une manche incomplete expire
sans points, et une manche terminee a temps conserve son animation de comptage.
Les boules se percutent reellement : transfert de mouvement, deviations laterales
et reactions en chaine peuvent changer les positions ou sortir une boule du
terrain. Toutes les boules deplacees sont animees et leurs distances sont
recalculees avant le comptage. Le cochonnet reste fixe. Le diametre visible,
agrandi pour la lisibilite, correspond au diametre de collision.
Des sons originaux synthetises accompagnent le lancer, le roulement sur le
gravier et l'arret ; des chocs metalliques se superposent au roulement.
Le bouton Son coupe la lecture ; annulation, nouvelle partie
et page masquee l'arretent. Les erreurs audio sont affichees.
Bac a sable fictif sans acces a la sauvegarde ni gain au voyage.

Neuvieme test : `/lostfound-preview.html?lang=en` (ou `?lang=fr`).
Objets trouves : Commencer, lire chaque signalement fictif, puis choisir
l'objet dessine correspondant. Les huit illustrations originales montrent les
details des parapluies, carnets, cles et pochettes : lune/etoile, feuille/fleur,
poisson/oiseau, piece carree/ronde. Les cartes portent seulement un numero ;
leur description reste accessible aux lecteurs d'ecran.
Les niveaux 0 a 4 proposent 4 a 8 objets et des indices de moins en moins directs.
Un compte a rebours visible de 15 secondes (reduit de 90, puis 60 et 30 apres les retours de test)
commence uniquement sur Commencer,
devient urgent dans les dix dernieres secondes et termine l'enquete a zero.
Trois erreurs terminent aussi l'enquete. Les clics apres le delai ne comptent pas.
Tab puis Espace/Entree choisit un objet ; Echap annule. Nouvelle enquete relance
le test. Les eventuels cadeaux de remerciement restent imaginaires :
aucune sauvegarde, integration au voyage ou remuneration reelle.

Cafe rush propose des commandes de tailles variees : 3 a 5 articles au niveau 0,
jusqu'a 5 a 7 au niveau 4. Les quantites repetees sont regroupees (`Cafe x2`).
Les boutons d'ingredients sont carres et espaces ; un plateau illustre reserve
une place fixe a chaque ingredient, avec de grandes illustrations et un compteur
superpose (les ingredients absents restent estompes), un format de plateau 4:2,
plus un resume textuel
accessible.
La patience des clients est de 14 secondes au niveau 0, puis diminue jusqu'a
8 secondes au niveau 4. Chaque ingredient effectivement ajoute joue un petit
son distinct. Une ambiance originale synthetisee (brouhaha, machine et vaisselle)
boucle pendant le service, sans enregistrement externe. Volume et coupure
suivent Options ; fermeture, fin du service ou onglet masque arretent les sons.
Le bac a sable propose aussi ses propres commandes de volume et de coupure.

Le menu **Gagner de l'argent** regroupe la manche, la musique, le vol de
nourriture et Cafe rush, selon les services reels de la case. Cafe rush
demande un cafe ou restaurant cartographie ; aucun travail distant n'est invente.
La musique et le cafe ont une progression sauvegardee : davantage de notes
ou de clients, moins de patience et des gains potentiels plus eleves.

La qualite du resultat influence la reputation locale : moins de 40 % ou
echec musical au plafond d'erreurs = -3, de 40 a moins de 60 % = neutre,
60 % et plus = +2. Cela influence la sympathie, les chances sociales et les
prochains gains. Les resultats affichent cet effet. Annuler ne donne aucun
gain ni bonus de reputation ; le temps et la fatigue restent depenses.

Le vol est un mini-jeu de timing : commencer, puis cliquer **Prendre** ou
appuyer sur Espace quand le curseur traverse la zone verte. Sa largeur varie
de 12 a 28 % de la piste et sa position est tiree au sort a chaque tentative,
avec une marge de 8 % aux extremites. La zone reste fixe pendant l'essai.
Un seul geste en 9 secondes, sans second tirage aleatoire. Reussite :
jusqu'a 900 kcal consommees ; echec ou delai depasse : 6 h de detention,
nourriture et sommeil de base, sans amende. La tentative coute d'avance
10 minutes, 3 fatigue, de la vigilance et 15 reputation locale ; etre pris
coute 5 reputation de plus. Fermer, masquer ou recharger abandonne sans gain.
Les autres mini-jeux prepares restent soumis a une approbation individuelle.

Une nuit dans un hebergement payant (hotel, auberge, chambre d'hotes, motel
ou refuge payant) inclut diner et petit-dejeuner dans le prix existant.
Au reveil, reserve alimentaire pleine, fatigue a zero et pression de sommeil
a zero ; deux repas et une nuit sont comptes. La duree et le prix ne changent
pas. Les abris gratuits, l'hospitalite et le sommeil dehors n'incluent pas
ces repas. Une partie deja terminee ne peut pas etre ranimee par un sejour.

Les pressions commencent au lancement ou a la reprise d'un voyage actif ;
les sauvegardes anterieures restent lisibles, sans modifier le depart serveur.
La vigilance (0–100) augmente avec le temps dans un secteur de 2 km, davantage
en ville, pres d'une police cartographiee, avec forte fatigue ou mauvaise
proprete. Apres quatre heures dans le meme secteur, rester sur place ajoute
une pression. Mendier et voler attirent aussi l'attention. Marcher et dormir
a l'abri la reduisent. Se laver en ville ou aux sanitaires publics cartographies
coute 20 minutes et un quart de repas, rend la proprete a 100 et retire 5 de
vigilance avant la pression du temps passe. Dormir a l'abri restaure aussi
une partie de la proprete.

A 100, un placement fictif ajoute 24 heures a l'abri, repas et repos,
et fait perdre 25 % de l'argent restant, arrondi vers le bas. Aucun gain,
indice ou avancement n'est accorde pour l'action interrompue. Les deux
premiers episodes laissent reprendre au meme endroit, avec carnet et piste
intacts ; le troisieme termine le voyage et depose le carnet a la derniere
position. Les heures au foyer ne sont pas facturees comme exposition dehors.
Un besoin deja fatal garde priorite.
Le pop-up explique le seuil de vigilance a 100 et, pour les nouveaux episodes,
la vigilance avant l'action, sa duree et les contributions reelles (temps,
fatigue, proprete, police, sejour prolonge, activite, deplacement et abri).
Les facteurs absents ne sont pas inventes pour les anciens episodes.
Reprendre une sauvegarde ne rejoue pas les notifications d'anciens placements
ou evanouissements ; les nouveaux episodes et avertissements courants restent
signales. Les regles et probabilites ne changent pas.

La sympathie depend de la proprete, de la fatigue et de la reputation du
secteur. Une prestation reussie ameliore celle-ci ; mendier la reduit
legerement et voler la degrade. Elle influence demandes d'argent, accueil,
rencontres pour les directions et gains musicaux. La reputation est bornee
a ±25 et conservee pour les 64 derniers secteurs concernes. Aucune competence
linguistique de la future couche 17 n'est ajoutee.

**Les deux cartes ont un effet direct** : on reutilise leur facteur existant
`0.5 + (risque_naissance + risque_jour) / 2` pour le rythme de vigilance et
l'oubli des nouveaux temoins ; le bonus de sympathie vaut
`30 * (1 - facteur)` et l'usure de proprete est multipliee par
`0.75 + facteur / 4`. Une nouvelle carte quotidienne actualise ces effets
pour les actions suivantes, sans recalculer les indices deja collectes.
Le panneau Pressions, le tirage quotidien et la page Statistiques affichent
ces effets.

Les nouveaux temoignages deviennent moins precis apres l'equivalent d'une
semaine, puis ne donnent plus qu'une direction apres un mois, selon l'age
du sejour du parent et les cartes. Sans chronologie du parent, l'anciennete
commence a l'activation de ces pressions. Les indices et photos deja obtenus
restent intacts : heure et facteur de collecte sont enregistres.
Dans les 3 km de la destination, toute recherche terminee sans interruption
permet toujours de l'identifier, meme si les temoins ont oublie ou le trajet
de reference n'est pas pret.

Dans le carnet, **Photos et cartes** et **Statistiques du voyage** sont deux
pages distinctes. Les statistiques suivent la partie sauvegardee, montrent
les besoins, argent, distance, temps, denivele, destinations atteintes et
compteurs d'actions, ainsi que les deux cartes et les pressions. Aucun
nom d'etape cachee n'apparait. Elles ne sont pas partagees avec les photos
d'un carnet abandonne et ne remplacent ni les photos ni les notes.

## Infrastructure OVHcloud

Le dossier [infra](./infra/) contient la configuration Terraform OpenStack
pour OVH Paris, fournisseur 3.4.0 verrouille. Une instance CPU b3-8 est prevue,
desactivee par defaut, SSH limite a l'IP administrateur. Le prototype est
protege par mot de passe via Nginx. Le [rapport infrastructure](./doc/INFRASTRUCTURE.md)
detaille les ressources reelles, les couts et la reprise.

**Etat :** VM CPU et cle SSH creees ; cloud-init, pare-feu Ubuntu, service du
jeu et acces par tunnel verifies. Le service Python ecoute seulement sur 127.0.0.1 ;
Nginx expose les ports 80 (redirection/ACME) et 443 (HTTPS avec authentification).
Le groupe reseau OVH `default` est utilise sans modification, selon le choix
de simplification approuve. Le DNS du domaine resout l'IP de la VM.

### Tester dans le navigateur

Ouvrir **https://arcane-path.eu** et utiliser le compte `preview`.
Le mot de passe est conserve hors Git, dans le fichier local prive
`~/.config/arcane-path/preview-access.json` du poste administrateur.
Il n'est ni inclus dans ce document ni affiche dans les logs de deploiement.
Le navigateur affiche sa boite de connexion HTTP ; aucun tunnel n'est requis.
Ne pas partager ce compte publiquement. Aucun compte individuel de joueur
n'est encore disponible, et la progression reste propre a chaque navigateur.

Le certificat Let's Encrypt est valide et renouvele par `certbot.timer`.
Sur la VM, le script versionne `scripts/configure_https.sh` configure Nginx,
emet le certificat et active le renouvellement ; il est installe dans
`/opt/arcane-path/scripts/configure_https.sh`. Pour le rejouer sans changer
le mot de passe existant, depuis la racine du runtime sur la VM :

```sh
sudo bash scripts/configure_https.sh --agree-tos --email ADRESSE_ADMIN
sudo certbot renew --dry-run --run-deploy-hooks --no-random-sleep-on-renew
sudo systemctl list-timers certbot.timer
```

`--agree-tos` suppose l'acceptation de l'accord Let's Encrypt par l'administrateur.
Au premier passage, ou pour changer le mot de passe, ajouter
`--password-stdin` et transmettre un secret de 20 a 72 octets sur stdin,
jamais dans les arguments ni Git. Seul son hash bcrypt reste sur le serveur.
Le hook `scripts/renew_https_hook.sh`, installe dans
`/etc/letsencrypt/renewal-hooks/deploy/arcane-nginx`, verifie la configuration
avant de recharger Nginx apres renouvellement.

Les fichiers Nginx dans `infra/nginx/` limitent les routes exposees aux assets
du jeu et aux API connues, filtrent les methodes et limitent les requetes.
Les depots, scripts, donnees source et caches ne sont pas servis par ce proxy.
Cette previsualisation partagee ne remplace pas des comptes joueurs, une
moderation ou une sauvegarde externe. Les ressources CPU existantes suffisent ;
aucun service payant additionnel n'est commande pour HTTPS.
Le pare-feu est modifie apres provisionnement sans changer le cloud-init
Terraform de la VM existante, afin de ne pas provoquer son remplacement.

Les credentials restent hors Git : `~/Downloads/openrc.sh` et
`~/.config/arcane-path/openstack-token`, permissions 600. Le wrapper lit
uniquement les parametres OpenRC litteraux, sans executer ce script ni charger
un mot de passe. Ne jamais coller le jeton dans le chat ou la ligne de commande.
Apres installation de Terraform (>= 1.7) :

```sh
terraform -chdir=infra init
terraform -chdir=infra fmt -check
terraform -chdir=infra validate
terraform -chdir=infra test
python3 scripts/terraform_ovh.py -- -chdir=infra plan -input=false
```

Ces commandes ne creent pas de serveur. Les tests utilisent un fournisseur
simule. Les variables locales `*.tfvars.json`, etats, plans et credentials
sont ignores par Git ; ils restent sensibles et ne doivent pas etre partages.
Terraform suit la VM et la cle SSH : conserver l'etat local prive
et regenerer le plan avant toute modification. Aucun backend distant partage
n'est configure ; ne pas executer depuis plusieurs postes.

Budget cible : environ 50 EUR/mois, plafond absolu 100 EUR/mois, TVA et
extras a confirmer avant commande. Terraform n'impose pas ce plafond.
Le GPU n'est pas inclus. Le calcul seul est estime a 45,71 EUR TTC pour
744 heures au tarif public releve le 17 octobre 2026, hors extras.

Depuis le poste administrateur, obtenir l'IP avec `terraform -chdir=infra output -raw preview_ipv4`,
puis ouvrir un tunnel en remplacant `ADRESSE_VM` par cette IP :

```sh
ssh -N -i ~/.ssh/arcane-path-ovh \
  -o IdentitiesOnly=yes \
  -o UserKnownHostsFile=~/.ssh/arcane-path-known-hosts \
  -o StrictHostKeyChecking=yes \
  -L 127.0.0.1:18766:127.0.0.1:8766 ubuntu@ADRESSE_VM
```

Ouvrir ensuite `http://127.0.0.1:18766`. Fermer le tunnel avec Ctrl+C.
Une autre IP administrateur necessite une mise a jour prudente du pare-feu
depuis une session ouverte ou la console OVH ; changer cloud-init apres
creation pourrait remplacer la VM et est bloque par `prevent_destroy`.
Les sauvegardes navigateur du port 8766 ne sont pas automatiquement presentes
sur le port 18766 : chaque origine navigateur garde ses propres voyages.

### Couche 9 : jalon narratif leger

Une nouvelle partie passe par `POST /api/journeys`. Le serveur choisit une
graine et un tarot, genere dix villes du catalogue europeen local, le recit du
parent et, si necessaire, trois villes de continuation. Il conserve
le depart complet dans `.cache/travel/journeys.sqlite3`. Le meme identifiant
de requete renvoie exactement le meme depart, meme apres redemarrage ou mise
a jour des regles. Un changement de nom ou region avec cet identifiant est
refuse, sans remplacer la partie. Le navigateur conserve cet identifiant pour
reessayer apres une erreur ou annulation, tant que la page n'est pas rechargee.
Un echec du chargement initial ne remplace pas une sauvegarde locale existante.

Le contenu epingle comprend les regles de survie et d'economie ; son empreinte
integre aussi le generateur, la carte/source et le catalogue. Le navigateur
valide le depart contre ses regles existantes avant de jouer. Les anciennes
parties restent lisibles sans identifiant serveur et ne sont pas regenerees.
La mise a jour des seuls tarifs a la reprise reste volontairement conservee.

**Limites :** seul le depart est conserve sur le serveur. La progression reste
dans le navigateur ; ce n'est ni une synchronisation ni une reprise cloud.
`GET /api/journeys/IDENTIFIANT` retrouve le depart, pas la progression ; aucun
annuaire de parties n'est expose. L'identifiant aleatoire doit rester prive :
il permet de lire le nom et la piste. Cette API est protegee par le mot de
passe partage de previsualisation, sans comptes utilisateurs individuels ;
ne pas retirer cette protection avant de definir l'autorisation par joueur
et les protections de publication. La base est limitee a 1 000 departs
(y compris les creations abandonnees), puis refuse explicitement de
nouvelles creations sans effacer les anciennes. Ce fichier doit etre inclus
dans une future sauvegarde ; le cache persistant seul n'est pas une sauvegarde.

Les etapes restent choisies a **30–60 km a vol d'oiseau**. Le choix approuve
pour les chemins est A* sur la grille du jeu, pas OSRM/GraphHopper. Cela ne
revendique ni un vrai itineraire routier pieton ni une validation du budget de
survie. Le jalon leger valide la coherence du recit et l'acces aux indices.

Le recit fixe motif, mode de voyage, chronologie, fausses pistes facultatives et
souvenirs des temoins. Le parent attend ou poursuit sa route apres 7, 14 et 21
jours de jeu, puis attend dans la treizieme ville au plus tard. On peut le
rattraper des la dixieme. Chaque etape garde un indice accessible sans argent,
photo externe, competence ni objet unique. Les anciennes parties conservent
leur piste d'origine, sans recit ajoute retroactivement.

### Chemins du parent sur la grille

Pendant une partie serveur, la preparation du chemin de l'etape courante
demarre automatiquement des la preparation/reprise et a chaque nouvel indice.
Elle reste en arriere-plan, sans bloquer l'ouverture de la partie. Les
etapes futures ne sont pas telechargees d'avance. Un statut et un bouton de
reessai en cas d'erreur apparaissent hors du journal ; attente client bornee a
cinq minutes et une relance automatique d'un echec serveur deja en cache.
Le journal rappelle uniquement les indices obtenus, sans distances ou nombres
de cases. Le calcul de reference (personnage 4,5 km/h, sans fatigue, faim ni
repos) utilise les couts terrain/pente et les quatre directions du joueur.
L'eau reste traversable comme dans le jeu actuel ; aucune
precision de pont, cloture ou chemin pieton reel n'est inventee.

`GET /api/parent-path?journey=IDENTIFIANT&stage=0` lance ou consulte la
preparation ; `retry=1` relance seulement un echec. Reponse 202 avec compteurs,
200 avec resume sans geometrie, 422 en cas d'echec, 429 si la file est pleine.
Le trace reste cache cote serveur. Ajouter `col` et `row` retourne uniquement
la proximite de cette position au trace conserve, pour les recherches d'indices.
`recognize=vague-prefix|partial-prefix|vague-photo|partial-photo` avec une
position propose des villes reelles du catalogue, sans geometrie ni indication
de la bonne reponse. Les anciennes parties locales sans identifiant serveur
ne sont ni regenerees ni dotees d'un faux chemin.

Un seul worker de chemins, au plus deux travaux en cours/file, couloirs de
8/16/32 cases elargis si aucun passage, 50 000 expansions au total, 256
morceaux en memoire et 96 preparations de morceaux par essai. Budget de
180 secondes controle entre les acces terrain ; un telechargement deja
commence conserve les delais bornes des fournisseurs et peut le depasser.
Apres limite ou panne, erreur explicite et bouton Reessayer : le terrain
deja prepare reste reutilisable, pas de faux trace direct. Le jeu reste
jouable ; un terrain joueur non cache peut toutefois attendre le fournisseur
OSM partage avec les autres telechargements.

Les caches terrain sont partages entre parties/joueurs. Les chemins identiques
reutilisent aussi un cache par points/source/version, puis sont epingles par
partie/etape dans `.cache/travel/parent-paths/journeys/`. Une mise a jour du
rasteriseur peut reconstruire les grilles depuis leurs sources en cache ; les
chemins deja termines d'une partie ne sont pas recalcules. Les caches ont une
somme de controle ; une corruption est signalee, pas remplacee silencieusement.
Inclure ces chemins dans la future sauvegarde distante.

Les modifications d'API, d'interface ou de transport du telechargeur ne changent
plus l'identite des grilles. Pour la transition compatible de ce correctif,
`scripts/migrate_chunk_grids.py --from-pipeline SHA256_PRECEDENT` conserve les
grilles completes apres verification. Usage administrateur seulement, apres
confirmation que la geometrie et les regles de rendu n'ont pas change :
ce n'est pas un contournement de l'invalidation pour un vrai changement raster.

Pour preparer un transfert sans credentials ni fichiers non suivis :
`python3 scripts/package_preview.py /chemin/prive/preview.tar.gz`.
Le paquet normalise les permissions des fichiers a 0644 pour le service non
privilegie. Ne pas inclure l'etat Terraform ou le cache local dans le transfert.
Le runtime doit etre committe avant empaquetage. Chaque paquet contient
`public/release.json` avec le commit exact et la date de preparation.
Chaque deploiement doit avoir un checkpoint Git et un tag `deploy-*`, etre
verifie sur le serveur puis annonce a l'utilisateur. Le manifeste reste protege
par le mot de passe HTTPS ; il ne contient aucun credential.

Retablir le service et verifier sa disponibilite avant de rechauffer les caches
terrain apres un changement de rasteriseur. Ne pas garder le serveur arrete
pendant cette reconstruction : nginx renverrait des erreurs 502 aux joueurs.
Conserver les sources, altitudes et anciennes grilles pour permettre la reprise
et un retour au code precedent sans restaurer les bases des parties.

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
  Apres une recherche, Commencer/Reprendre restent bloques jusqu'au choix
  effectif d'un resultat ; Annuler conserve explicitement le depart precedent.
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
Une petite roue accompagne le message pendant les recherches et la
preparation de la carte ou du voyage. Elle disparait a la fin ou a
l'annulation ; aucun pourcentage artificiel n'est affiche. L'animation
respecte la preference systeme de reduction des mouvements.
Pour un depart recherche, le message indique l'etape reelle : identification
Nominatim, attente d'acces aux fournisseurs, telechargement et serveur utilise,
secours ou pause fournisseur, subdivision d'une zone dense, lecture des
geometries, construction des 24 x 24 cases, puis enregistrement en cache.
Le nombre de requetes cartographiques reellement envoyees (y compris secours
et subdivisions, hors recherche du lieu) et le temps d'attente sont affiches.
Le total de requetes n'est pas connu a l'avance ; aucun pourcentage n'est deduit.
Une file serveur temporairement pleine conserve l'attente et sa roue,
avec nouvelle tentative automatique et annulation possible.
Les nouvelles pistes sont creees dans le catalogue europeen local :
dix recherches de villes, **zero requete Overpass**. Le journal rappelle
ce bilan ; les phases plus longues du chargement de carte gardent leur roue.
L'ancien chemin de catalogues en ligne conserve ses compteurs de requetes,
lectures du cache, replis Allemagne/Kumi et trois tentatives par catalogue,
mais n'est plus utilise pour creer les nouvelles pistes.
Pendant la marche, une roue apparait aussi au centre de chaque morceau
visible en attente de streaming. Elle disparait au chargement ou en cas
d'echec ; les zones inconnues non demandees gardent simplement leurs « ? ».
  Si l'API OSM depasse sa limite de noeuds, les requetes sont subdivisees ;
  si quatre niveaux ne suffisent pas, le chargement essaie Overpass
  (overpass-api.de, puis overpass.kumi.systems) sur la zone complete.
  Les erreurs HTTP ou reponses incompletes du fournisseur primaire declenchent
  aussi ces replis, avec delai de refroidissement et erreur explicite si
  aucun fournisseur ne peut fournir la carte.
  L'interface interdit de lancer une autre partie pendant cette attente ;
  changer de region annule l'attente, sans supprimer le cache en preparation.
  Le depart n'exige plus dix lieux nommes dans sa petite carte :
  la piste des nouveaux voyages cherche des villes dans une zone bien plus large.
  La preparation echoue explicitement si aucun parcours de dix etapes
  de 30 a 60 km n'est disponible, ou si ses fournisseurs sont indisponibles.
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

Les oceans sont le complement des polygones de terre fermes de
[GSHHG 2.3.7](https://www.soest.hawaii.edu/pwessel/gshhg/), pleine resolution,
sous LGPL 3 ou ulterieure. Installer `gshhs_f.b` avec `README.TXT`,
`LICENSE.TXT` et `COPYING.LESSERv3` depuis l'archive officielle
`gshhg-bin-2.3.7.zip` dans `.cache/shorelines/`, puis redemarrer.
SHA-256 du binaire :
`af9215d58ebc525b2d09654a89959829f09e6edc457f3666759cded37be4ecf6`.
La provenance/licence est exposee avec la carte. Sans le fichier, le serveur
avertit explicitement que la couverture des oceans est indisponible.
Cette source historique ne garantit pas la precision actuelle du rivage.

A 250 m et au-dela, les empreintes de batiments OSM sont agregees sur une
grille de 20 x 20 points : `#` apparait a partir de **15 %** d'emprise cumulee,
sans doublons ni cours interieures. Routes principales, rails, eau et reperes
gardent leurs priorites. Le pourcentage est consultable meme quand un autre
symbole domine. Aucun cout de marche ni blocage supplementaire n'est ajoute.

Apres modification, executer `python3 scripts/prepare_regions.py` puis
redemarrer le serveur. Les caches de grilles sont invalides automatiquement
par la configuration ; les sources OSM et altitudes restent reutilisees.

## Couche 2 : voyage a pied

Le fond de la fenetre et de la carte suit uniquement l'heure simulee du voyage :
bleu nuit, prune a l'aube, bleu ardoise de jour, brun ambre au crepuscule.
L'aube et le crepuscule suivent les heures solaires locales, a 45 minutes pres.
Le titre et la preparation gardent leur fond original ; les couleurs meteo
restent liees a la temperature.

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
  ralentissent la marche. La reserve vide termine le voyage. Fatigue a 100 ou
  barre de sommeil pleine (32 h d'eveil equivalent) provoquent huit heures
  d'inconscience, fatigue ramenee a 40 avant meteo et risque de vol d'argent.
  La faim continue ; les anciennes parties deja terminees ne sont pas ranimees.
  La pression de sommeil croit deux fois plus vite de 22:00 a 02:00, quatre fois
  plus vite de 02:00 a 06:00, selon l'horloge UTC du jeu, meme a l'abri.
  Dormir conserve sa recuperation habituelle. Passer 02:00 ne suffit pas a
  provoquer le sommeil force si la barre n'est pas pleine.
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
Chaque repas a une offre fictive stable par partie, case et jour UTC :
prix tire entre 70 et 150 % de son tarif local et portion proportionnelle au
prix (900 kcal pour une unite de repas locale). Les plats et etablissements
peuvent donc avoir des prix et effets differents ; rouvrir le menu, acheter ou
recharger la partie ne relance pas les offres. Un nouveau jour renouvelle les
offres. Le menu affiche le prix exact et les kcal avant achat ; la recuperation
ne depasse pas la reserve maximale. La duree reste de 20 minutes ; ce ne sont
pas des mesures nutritionnelles. Les zones sont des boites de curation,
pas des frontieres culinaires exactes. Un **repas simple** de jeu reste toujours
propose sur une case de localite, y compris hors de ces quatre zones, au meme
tarif national et avec les memes couts de temps. Les restaurants, cafes,
restaurations rapides et food courts OSM de la case proposent aussi ce repas
sous leur nom avec lien source ; leur menu, ouverture et service reels ne sont
pas verifies. Lieux prives/interdits, desaffectes ou abandonnes exclus. Aucun
restaurant n'est invente lorsque la carte n'en indique pas. Les achats restent
limites aux cases de localite et exigent la bourse necessaire.

L'echelle des tarifs utilise les observations Big Mac du **1 juillet 2026**
publiees par The Economist, pas Eurostat. Les valeurs en dollars permettent
une comparaison entre marches, convertie en euros de jeu sur la reference
zone euro (6,19). Ce ne sont pas les prix reels de ces plats ou etablissements.
Les 31 marches nationaux disponibles (30 en Europe) ont leurs propres observations :
France 5,60 EUR, Italie 6,56 EUR, notamment. Le menu peut confirmer un pays
absent des donnees de la case via Nominatim/OSM (coordonnees de la case
envoyees uniquement a l'ouverture du menu, reponse mise en cache) ; ni la
region choisie ni la specialite culinaire ne permettent de deviner le pays.
Pays absent/ambigu ou prix national absent (notamment PF) :
**moyenne arithmetique non ponderee des 30 observations nationales europeennes**,
comparees en dollars puis converties en euros de jeu, avec un ecart de
**-10 % a +10 % stable par case**. Le meme emplacement garde son ecart apres
rechargement ; les menus, achats et recompenses utilisent le meme calcul.
Cette estimation est signalee, y compris si la verification du pays echoue.
Aucun change monetaire ni paiement reel. Actualiser les observations avec
`python scripts/update_prices.py` ; source et date figurent dans le menu.
L'import couvre les codes ISO de tous les pays europeens pris en charge et
signale ceux sans observation a la date courante ; aucun ancien prix n'est
presente comme actuel. La Moldavie est incluse, sans dependre du nom du pays
dans le fichier source.
Les prix ne completent pas la couverture geographique des specialites.

**Sommeil et abri** propose les hebergements OSM de la case actuelle :
hotel, auberge, chambre d'hotes, motel ou refuge alpin. Tarif de jeu : quatre
repas de reference locale ; un abri n'est gratuit que si `fee=no` est
explicitement cartographie. Acces prive/interdit et lieux desaffectes exclus.
Un hotel dans le menu des environs n'est pas utilisable a distance.

Sur une case de localite nommee, **Demander l'hospitalite et dormir si accepte**
consomme 30 minutes, puis immediatement la nuit protegee normale si des habitants
acceptent. C'est gratuit, sans repas. La probabilite depend des tarots de naissance
et du jour ; tenue et reputation sont differees. Une demande par identifiant OSM
de localite et jour UTC, resultat enregistre et tirage stable contre les rechargements.
Le resultat (refus ou accueil, date et temps passe) reste directement sous le
bouton, avant la limite quotidienne ; apres la demande, il recoit le focus et
defile dans la zone visible. Ouvrir le menu seul ne fait aucune demande.
Une demande commencee avant minuit compte pour ce jour-la. Un accueil fictif
n'invente pas un hebergement OSM ni une promesse reelle d'accueil.
La demande reste exposee a la nuit ; le sommeil accepte est protege. Aucun besoin
fatal n'est annule. Les anciennes sauvegardes sans historique restent compatibles.

Dormir dehors reste possible, mais sans recuperation de fatigue d'effort,
avec seulement 25 % de recuperation du besoin de sommeil. Toute action dehors
accumule +2 fatigue par heure nocturne (marche, repos et sommeil). Le repos
nocturne recupere maintenant 50 % de la recuperation normale : 10 fatigue en
30 minutes, moins l'exposition (generalement 9 nets). A 90, un repos nocturne
de 30 minutes finit a 81, pas a 100. Il consomme toujours des reserves et
augmente le manque de sommeil. Le resultat prevu est affiche avant l'action.
Cette modification approuvee migre uniquement ce coefficient des anciennes
sauvegardes a la reprise, sans modifier leur etat ni les autres regles.
La nuit utilise le cycle solaire
geographique, pas une heure fixe. Les repas et nuits payees sont proteges.
Les futurs evenements nocturnes dangereux dependront du tarot du jour ;
leurs mini-jeux ne sont pas encore actifs. Attendre reellement ou regarder
la carte ne passe toujours pas de temps.

L'agenda, le cadran et la meteo partagent un meme panneau. Son fond devient
bleu jusqu'a 0 C, bleu-vert sous 10 C, vert jusqu'a 25 C, ambre jusqu'a 30 C
et rouge au-dela, selon la temperature estimee a la position du joueur.
Des gouttes decoratives apparaissent sous la pluie ou l'orage, sans animation.
Sans donnees meteo, le fond reste neutre et les gouttes disparaissent.
Le soleil ou la lune suit son arc en arriere-plan du meme panneau, sans
cadran separe. Les effets de temperature et de pluie sont dans une infobulle
au survol ou au focus clavier de la meteo, plutot qu'en texte permanent.
Le petit calendrier reste a gauche ; le cadran analogique, l'icone meteo,
la temperature et la condition sont empiles dans la colonne de droite.
Pas d'heure numerique ni de petites legendes permanentes : moyennes,
estimations et sources sont accessibles dans l'infobulle.
L'agenda et le cadran affichent la date et l'heure simulees en UTC, avec
libelles francais/anglais et texte accessible complet. Les aiguilles n'avancent
pas en temps reel. **Copier les coordonnees** copie le centre de la case du joueur
ou du curseur d'observation a six decimales ; les erreurs presse-papiers sont affichees.
Les cinq sons de pas originaux suivent le terrain d'arrivee, uniquement apres un
deplacement reussi. Ils partagent volume et coupure avec la musique. Les autres
effets sonores restent a connecter ; les musiques telechargees hors Git ne sont
pas automatiquement incluses dans le deploiement.

La camera charge ses huit voisins, coins compris, meme sans marcher, avec au
plus deux requetes actives. Les erreurs temporaires se reessaient apres 30 s,
puis 60 s, 120 s, jusqu'a 5 min entre tentatives ; les erreurs de donnees restent
explicites et attendent une relance manuelle. Ce n'est pas un telechargement
illimite du trajet futur. `?` signifie morceau non disponible ; les petits
points sont un terrain sans couverture specifique dans la source OSM chargee,
pas un telechargement en attente. Diagnostic d'Engins : sept multipolygones
OSM incomplets dans le cache. Avec leurs membres complets, les cinq cases
non classees du morceau contenant Engins deviennent de la foret, pas de l'herbe.
Les nouveaux telechargements completent les relations de couverture manquantes
(au plus 16 par requete, sinon fournisseur recursif de secours). Les anciens
morceaux externes incomplets sont retelecharges avant reconstruction. Les
cartes de depart preparees restent utilisables hors ligne sans retelechargement
force ; cette correction ne garantit pas une couverture OSM sans lacune partout.

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

## Piste du parent : un long voyage de ville en ville

### Hebergements a proximite

Ouvrir **Sommeil et abri** lance une recherche des vrais hotels, auberges et
autres hebergements dans un rayon de 5 km. Le menu de ville propose aussi
**Hebergements a proximite**. Chaque resultat indique une distance a vol
d'oiseau, une direction et sa source. Il faut rejoindre sa case de 250 m
pour le choisir parmi les options de sommeil ; les tarifs et effets de
sommeil habituels restent inchanges. La recherche ne coute pas de temps de jeu.

La recherche OSM couvre les noeuds, batiments et relations, dans tous les pays
pris en charge. Les cartes deja conservees par le serveur completent les
resultats. Si une source est indisponible, la liste est signalee incomplete,
pas interpretee comme l'absence d'hotels. Un catalogue DATAtourisme francais
peut etre importe par l'administrateur, mais il n'est pas installe par les
joueurs et ne constitue pas une couverture internationale.

Dans la liste des hebergements, **Aller a cet hebergement** choisit un repere :
la carte signale sa case quand elle est visible, et la distance et la direction
s'actualisent pendant la marche. Le bouton ne deplace pas le personnage.
Les directions sont a vol d'oiseau, pas un itineraire garanti ; il faut rejoindre
la case a pied puis ouvrir le sommeil avec H. Le repere peut etre annule et
n'est pas conserve apres fermeture ou rechargement du voyage.

La fenetre de la piste du parent (J) separe les consignes et le rappel de la
piste dans une colonne laterale, des boutons d'enquete et des resultats dans
la zone principale. Sur petit ecran, le contenu principal precede les consignes.
Le bouton Nouveau voyage reste sur l'ecran principal, pas dans le journal J.
Le bouton de recherche et son cout resume restent en haut ; les longues
explications se deploient a la demande. Les indices portent leur date de jeu
(UTC), du plus recent au plus ancien, dans une page par etape. Une destination
atteinte est marquee et ouvre immediatement une nouvelle page pour chercher
la piste suivante, sans avancer la quete avant l'enquete sur place.
Les pages precedentes restent consultables, sans devoiler les futures villes.
Les anciennes entrees sans date le signalent, sans inventer un horodatage.
J s'ouvre sur **Indices actuels** ; **Enqueter** affiche les actions sur une
page separee et **Destinations precedentes** permet de feuilleter les archives.
Chaque indice est classe par la destination qu'il concerne, pas par le lieu
ou il a ete recueilli : un temoignage obtenu a A pour rejoindre B figure avec B.
La date precede chaque entree et le dernier indice date est marque clairement.
Les recits de sejour du parent ne s'affichent que dans l'archive concernee.
Dans I, **Villes deja citees** permet de choisir une ville deja nommee par un
temoin, un indice precis ou une destination atteinte, puis de demander sa
direction depuis la position actuelle. Les propositions anciennes restent
disponibles avec leur etape et leur statut non confirme. Chaque demande paie
les 10 minutes et 2 points de fatigue habituels, avec la meme chance de
rencontrer quelqu'un ; elle ne change ni la quete ni la destination active.
Retrouver un indice deja connu ne cree pas de doublon : le resultat signale
explicitement qu'aucun nouvel indice n'a ete ajoute, avec les couts payes.
Lorsqu'un temoin propose un nom de ville dans I, son avis indique aussi la
distance a vol d'oiseau, la direction depuis votre position actuelle et les
coordonnees de la ville proposee. Cela ne confirme pas qu'il s'agit de la
bonne destination ; le temoin peut toujours se tromper.

### Carnet de photos

Le carnet s'ouvre sur une page de titre **Voyage de [nom]**, accompagnee de
« Parti chercher un parent. A surtout trouve des ampoules. », du point de
depart et de la date initiale en UTC. La couverture est aussi la premiere
page du PDF. Les donnees absentes des anciennes sauvegardes sont signalees,
jamais remplacees par un lieu invente. Aucun renseignement du lecteur n'est
ajoute a la couverture d'un carnet abandonne.

En cas de deces (faim, ou anciennes fins par fatigue/manque de sommeil),
une croix remplace le personnage a sa derniere position. L'ecran s'assombrit
en cinq secondes et une fenetre montre l'arcane XIII historique et la cause
du deces. La fenetre reste lisible au-dessus du fondu ; la fermer rend acces
au carnet et aux commandes de nouveau voyage sans ressusciter le personnage.
Le mouvement reduit supprime l'animation. Les evanouissements recuperables,
placements au foyer et retrouvailles ne declenchent pas cet effet. Ce n'est
pas un nouveau tirage de tarot et cela ne modifie pas le depot du carnet.

La page **Carte du voyage** propose une vue schematique sur papier vieilli :
chemin reel en pointilles rouges, depart, destinations effectivement atteintes,
position actuelle, nord et echelle. **Rejouer le trace** anime la ligne sans
avancer le temps de jeu ; la preference de mouvement reduit est respectee.
Ce n'est pas un fond de carte geographique ni le trajet secret du parent.
Les deplacements sont enregistres dans la sauvegarde locale ; les anciennes
sauvegardes commencent l'enregistrement a la reprise, sans inventer le chemin
anterieur : des pointilles bruns relient alors les lieux connus a vol d'oiseau,
dans l'ordre des visites, distincts du chemin reel rouge. Les tres longs
parcours sont simplifies et explicitement signales.
La carte et sa legende figurent aussi dans l'export PDF. Les carnets abandonnes
ne montrent jamais la carte personnelle de leur lecteur.
Le fond affiche les cellules de terrain reduites depuis le cache uniquement :
aucune preparation ni requete fournisseur n'est lancee. Les zones absentes
restent vierges et sont signalees. Le serveur inventorie les chunks reellement
en cache dans le rectangle, au lieu de deviner des coordonnees a sonder.
Jusqu'a 4096 chunks sont lus avec verification ; les grandes vues regroupent
les cellules par terrain dominant. Les limites sont signalees, sans affecter
le trace du voyage.

**Exporter en PDF** telecharge le carnet complet, pas seulement les deux pages
visibles : photos, cartes de tarot, notes et credits avec leurs liens sources,
ainsi que les statistiques du voyage. Les brouillons sont enregistres avant
l'export. Le PDF est genere localement dans le navigateur, sans envoi a un
service tiers. Ses pages sont des images (texte non selectionnable). Un carnet
abandonne exporte contient ses indices et ses pages, jamais les statistiques
personnelles du joueur qui le consulte. Les erreurs restent visibles dans le
carnet ; l'export ne modifie ni le voyage ni les tirages.

Les tirages de naissance et du jour utilisent les scans du Tarot de Marseille
de Jean Dodal (vers 1701, domaine public), servis localement avec leur source.
Les 22 arcanes et le dos historique remplacent les dessins ASCII des tirages.
Chaque tirage est automatiquement epingle dans le carnet avec son role,
son nom, sa date de jeu et une interpretation modifiable comme note.
Une meme carte tiree deux jours differents reste deux souvenirs distincts.
Reprendre un voyage ajoute sa carte de naissance et sa carte du jour deja
revelee si elles manquent, sans ecraser les notes. Les anciennes cartes
des jours passes non conserves dans la sauvegarde ne sont pas reconstruites.
Les erreurs d'image ou de stockage sont visibles ; l'epinglage propose
de reessayer et n'empeche pas de poursuivre le voyage.

Le bouton **Mon carnet** dans l'en-tete (A) ouvre un carnet a deux pages
avec une reliure spirale centrale. Dans la fenetre d'une photo de carte,
de nature ou d'indice, **Epingler dans mon carnet** conserve l'image affichee,
son auteur, sa source et sa licence. Les photos apparaissent dans des cadres
blancs, avec un champ de note a l'ecriture manuscrite sous l'image.
La note est enregistree en quittant le champ ou avec **Garder ma note**.
Les fleches tournent les doubles pages ; retirer une photo demande confirmation.

Chaque voyage possede son propre carnet IndexedDB, independant du cache photo.
Un nouveau depart ne reprend pas les photos et notes du voyage precedent.
Au deces ou avant de remplacer la sauvegarde, le carnet complet est laisse
a la derniere position du personnage sur le serveur. Photos, notes, cartes
et indices sont alors partageables : n'y inscrivez pas de donnees privees.
Le nouveau depart avertit de ce partage et attend la confirmation du serveur ;
en cas d'echec, l'ancien carnet et la sauvegarde restent conserves.
Les depots complets attendent dans une file IndexedDB en cas de panne reseau.
Les anciens carnets sans voyage sont rattaches au voyage repris ou remplace
lors de la migration ; leur provenance entre anciennes parties est inconnue.
Le partage accepte JPEG, PNG, WebP et GIF, 12 Mo par image et 48 Mio au total
(1000 entrees maximum). Un depassement est signale sans publication partielle.

Le panneau **SIDEQUEST - Journaux abandonnes** recherche a votre position
(200 m), permet une prise exclusive puis la lecture du carnet recueilli.
Il reste distinct du votre et n'est pas modifiable. Suivez ses etapes pour
le rendre a son parent, sans modifier votre propre quete. Pour un parent
mobile, cette livraison conserve sa position au moment du depot ; elle ne
simule pas un second parent mobile. Les reclamations expirent apres sept
jours d'inactivite ; les carnets portes sont relaches a la derniere position
signalee du porteur a son deces ou nouveau depart, une fois connecte.
La base serveur `abandoned-journals.sqlite3` est distincte des genese immuables
et doit etre sauvegardee avec celles-ci. Les images et notes deposees restent
sur le serveur meme si les donnees locales du navigateur sont effacees.
Les photos d'indices vagues restent sans titre geographique dans le carnet,
et les notes personnelles ne constituent pas des indices confirmes.

Les **nouveaux voyages europeens** preparent dix etapes dans de vraies
localites du catalogue GeoNames, espacees de **30 a 60 km a vol d'oiseau**, y compris
du depart a la premiere ville : 300 a 600 km au total, soit un voyage de
plusieurs semaines. Les cases sont projetees dans la grille globale,
y compris au nord ou a l'ouest du depart ; la carte continue a charger en marchant.
Le serveur choisit des coordonnees candidates aleatoires dans la direction
du voyage, puis cherche la localite reelle admissible la plus proche dans
un index spatial local. Les distances reelles, doublons et limites de grille
sont verifies apres ce choix. Les donnees comprennent 38 081 localites
europeennes d'au moins 2 000 habitants recenses, pas les objets `place=town`
d'OSM : les classifications peuvent differer.
Le catalogue [GeoNames](https://www.geonames.org/) est inclus sous
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) dans
`data/europe-towns.json.gz`, avec provenance et date. Aucune requete externe
n'est faite pour ces dix recherches ; aucun abonnement ni cle API necessaire.
Pour mettre a jour les donnees : `.venv/bin/python scripts/prepare_town_catalogue.py`
(telechargement du seul extrait `cities500.zip`, puis filtrage).
Une localite manquante n'est pas remplacee par un commerce. Un echec ne remplace pas la
sauvegarde precedente et ne tire pas le tarot du nouveau personnage.
Les telechargements de carte, altitude, meteo et photos restent distincts
et peuvent encore rencontrer des limites de leurs fournisseurs.

**Piste du parent** (J) ouvre gratuitement le carnet. Chaque nouvelle piste
commence vaguement : direction generale depuis la precedente halte, fragment
du nom de ville ou photo sans annotation. Le carnet ne fournit ni distances,
ni coordonnees, ni trace et ne nomme pas les villes encore inconnues.
Dans une case terrestre chargee, **Chercher un indice** (F dans le carnet)
consomme du temps, de la fatigue et de l'energie, meme sans resultat.
Les chances diminuent avec l'eloignement du chemin cache du parent.
Les couts tires au hasard diminuent en approchant de la ville recherchee :
30–60 min/+4–7 fatigue loin, jusqu'a 8–14 min/+1–2 fatigue a proximite.
Les indices deviennent progressivement plus precis : fragment plus long
dans les 15 km, ville identifiable dans les 3 km.
Si le chemin de reference est encore en preparation, en echec ou sa file
occupee, la recherche utilise explicitement la distance a la destination,
sans inventer de trajet. Les couts et resultats normaux s'appliquent et ce
mode est signale dans le resultat. Les erreurs reseau, de donnees ou de
partie inconnue restent visibles sans facturer l'action.

On peut **montrer un fragment ou une photo a quelqu'un**, dans le carnet
ou avec I : 10 min/+2 fatigue, avec les chances habituelles de rencontrer
quelqu'un selon le terrain. Les personnes suggerent de vraies villes :
la plus proche commencant par ces lettres, ou une ville qui rappelle la photo.
Elles peuvent confondre des noms similaires ou se tromper sur l'image.
Ces avis restent explicitement **non confirmes**, sont sauvegardes a part
des indices et n'avancent jamais la quete.

Pour les parcours de villes, l'enquete est accessible sur la case du point
repere et ses huit voisines (250 m par axe), afin de ne pas exiger le pixel
exact d'un centre GeoNames/OSM. A deux cases sur un axe, il faut encore avancer.
Les anciens parcours locaux gardent leur regle de case exacte.
Seule l'arrivee dans ce rayon permet de **passer a l'etape suivante** ;
une recherche en pleine campagne ne saute jamais une ville. Le curseur Look
ne deplace pas le personnage et n'autorise pas de recherche distante.
A l'arrivee, la decouverte est tiree parmi quatre formes accessibles :
discussion, photo, lettre, fouille, note achetee, livre d'or ou billet.
Chaque forme amorce une nouvelle piste vague, avec ses couts propres :

| Action | Temps | Fatigue ajoutee | Effort supplementaire |
| --- | --- | --- | --- |
| Discuter | 15 min | 1 | 10 kcal |
| Chercher une photo | 30 min | 3 | 30 kcal |
| Lire une lettre | 20 min | 2 | 15 kcal |
| Fouiller | 40 min | 5 | 50 kcal |
| Acheter une note | 10 min | 1 | 5 kcal + prix de 0,25 repas local |
| Consulter un livre d'or | 25 min | 2 | 20 kcal |
| Examiner un billet | 30 min | 3 | 25 kcal |
| Demander son chemin | 15 min | 1 | 10 kcal |

Le metabolisme et les risques nocturnes habituels s'ajoutent a ces couts.
L'epuisement peut terminer la partie avant qu'un indice soit obtenu.
Dans les anciennes pistes longues qui contiennent un lieu public nomme, certains
indices ne donnent que son nom : il faut ensuite **demander son chemin**
sur place pour identifier la ville. Le carnet ne devoile alors ni distance
ni lien cartographique. Cette attente et les decouvertes sont sauvegardees.
Les nouvelles pistes locales ne font plus de recherche de lieux publics
au depart : cet enrichissement optionnel est differe, pas simule.
Une ancienne sauvegarde conserve sa destination deja connue lors de la
reprise ; ses nouvelles pistes utilisent ensuite les indices progressifs.

La photo cherche une vraie image geographique sous licence, autour de la
destination, avec auteur, source et licence, mais sans titre geographique
ni annotation revelant la ville. Lors d'une recherche hors etape, une photo
indisponible est remplacee explicitement par un fragment de nom.
Lettres, temoins, billets et autres objets narratifs sont egalement fictifs :
aucun habitant ou etablissement reel n'est implique dans l'histoire.

La derniere decouverte declenche les retrouvailles et termine le voyage.
Les anciennes sauvegardes a trois ou dix reperes locaux restent **inchangees**,
avec leur ancienne rencontre de cinq minutes ; elles ne sont pas converties.
Les pistes longues OSM deja sauvegardees restent egalement inchangees,
y compris leurs indices de lieux et demandes de directions.
Commencer un nouveau voyage pour obtenir la longue piste et ses nouvelles actions.

Limites : distances geographiques, pas un itineraire pieton calcule ; le
trajet reel peut etre plus long ou interrompu par la mer ou des obstacles.
Pas de garantie de continuite routiere, de deplacement du parent, de fausses
pistes ou de calendrier narratif. La generation serveur couvre cette partie
de la couche 9, pas l'ensemble de ses fonctionnalites prevues.
Le catalogue utilise le filtre europeen deja applique aux nouveaux departs.
Les nouvelles pistes de Tahiti ne sont pas prises en charge ; les anciennes
sauvegardes y restent lisibles et jouables. Sur une ile ou une zone trop peu
peuplee, l'absence de dix etapes admissibles est signalee explicitement.

## Boutons et raccourcis

La bourse et l'energie alimentaire restante (kcal actuelles / capacite) sont
affichees en evidence dans le panneau du personnage. Il s'agit des reserves
deja consommees par le personnage, pas d'un inventaire de provisions portables.
La nourriture achetee ou trouvee recharge directement cette reserve.
Un message s'ouvre a partir de **75 % de faim**, avec les moyens de se nourrir
et le rappel que **100 % de faim termine la partie**. Il ne se repete pas a
chaque pas ; manger pour repasser sous 75 % rearme l'avertissement. Une reprise
de sauvegarde deja affamee avertit aussi. Le message attend la fermeture des
autres dialogues pour ne pas interrompre une action en cours.
Un arret pour faim, fatigue ou manque de sommeil ouvre egalement une explication.
Ces changements n'ajoutent ni provisions ni reanimation d'une partie terminee.

**Demander son chemin (I)** permet de chercher un passant
imaginaire comment rejoindre l'objectif deja connu : direction generale parmi
huit points cardinaux et distance vague (« encore assez loin »), sans nombre de
cases, kilometres exacts ni itineraire garanti. Disponible sans chercher un PNJ
reel. Sur une etape, il rappelle comment enqueter ; pour un indice de lieu non
resolu, il indique comment le preciser sans devoiler la ville.
Ouvrir le dialogue est gratuit ; chaque tentative coute 10 minutes et +2
fatigue, plus metabolisme et exposition nocturne, sans argent. Reessayer
relance le tirage et paie de nouveau. Chances : localites 90 %, gares 75 %,
routes/batiments/lieux de culte 50 %, plaines/prairies/champs/parcs/vignes 25 %,
forets/collines 15 %, montagnes/rails/cables 5 %, eau 0 %.

Chaque pas de 250 m entrant dans une case d'eau ajoute 40 fatigue aux couts
ordinaires, sans reduction par endurance. Les ponts cartographies comme route
gardent leur cout normal ; a 100 fatigue, les regles d'evanouissement s'appliquent.

La meteo estimee influence les actions exterieures : sous 10 C, +25 % de
consommation calorique par tranche de dix degres (progressif, plafond +100 %) ;
au-dessus de 30 C, +2 fatigue/heure par cinq degres (plafond +10/heure).
Pluie : +2 fatigue/heure et vitesse de marche -15 % ; orage : +4/heure et
vitesse -25 %, avec les limites de vitesse habituelles. Les effets s'ajoutent
a l'exposition nocturne. Les actions abritees sont exemptees. Dormir dehors
ne recupere pas de fatigue, mais conserve la recuperation reduite du sommeil.
Sans donnees meteo chargees, le panneau indique explicitement que ces effets
ne sont pas encore appliques. Il ne s'agit pas de meteo observee en direct.

Sur une etape, **Chercher un indice (F)** choisit au hasard un type de
decouverte accessible. Les couts possibles sont presentes avant l'action ;
seul celui du resultat obtenu est facture. Les photos sont de vraies images
geographiques du cache ou d'Internet avec source/licence, pas des illustrations
generees. Si aucune image utilisable ne charge, un autre indice est choisi,
avec une explication et son seul cout. Les lieux non resolus gardent leur
action de demande de precision ; les indices futurs ne sont pas devoiles.

Le journal de piste indique les directions depuis le joueur avec des nombres
positifs et des fleches : est →, ouest ←, nord ↑, sud ↓. Par exemple, « 1 case
vers l'est et 1 vers le nord » signifie une case a droite et une vers le haut.
Les axes sans deplacement sont omis ; sur place, le journal invite a choisir
une enquete (ou a parler au temoin pour les anciennes pistes).

Chaque bouton affiche son raccourci **entre parentheses**, directement dans
son libelle : « Se reposer (R) », « Acheter un repas (E) ». Une seule touche
suffit, sans Alt/Maj ; la meme action garde sa touche dans les differents menus.
Survoler le bouton ou lui donner le focus affiche aussi son info-bulle.
Chaque bouton dispose de `title` et `aria-keyshortcuts`. Exemples : N nouveau
voyage, C reprise, E repas, H sommeil, T ville, B musique de rue, J journal,
S sauvegarde, Q retour preparation, K Options, G recherche, V position actuelle.
Entree ouvre la preparation depuis le titre ; D
revele le tarot, puis Entree continue. M commande la musique dans Options.
Les anciennes combinaisons Alt + Maj + touche restent acceptees.

Dans les dialogues, seuls leurs boutons repondent ; les enquetes gardent leurs
touches propres, meme quand l'ordre change. Les autres options dynamiques
utilisent 1-9, 0 puis les lettres disponibles, affichees dans les boutons.
Les boutons caches/desactives et les appuis repetes sont ignores. Aucun
raccourci ne s'active pendant l'utilisation d'un champ ou selecteur.
Les commandes existantes restent disponibles sans modificateurs : fleches,
L observation, R repos, P photo, Espace rythme et Echap pour fermer.
Une fenetre **Commandes** presente les touches et leur utilisation a la premiere
preparation de chaque visite (sans stocker de preference). Elle explique
notamment la difference entre repos et sommeil et l'observation sans avancer
le temps. Bouton **Commandes (?)** en haut ou touche **?** pour la rouvrir ;
**Echap** ou **Compris, continuer** pour fermer. Liste et touches partagent les
memes liaisons clavier, en francais/anglais. Dans les autres menus, les touches
disponibles restent affichees sur les boutons ; aucun raccourci ne s'active
pendant la saisie d'un texte.

## Ecran titre

Au chargement, un ecran titre presente le voyage avec une illustration ASCII
et une courte introduction (francais/anglais). **Preparer le voyage** donne
acces a l'ecran intermediaire de choix du depart et de reprise ; cette transition
ne cree aucune partie et ne remplace aucune sauvegarde. Langue et musique
restent accessibles dans Options. L'ecran revient a chaque rechargement.

## Autres moyens de subsister

En voyage ou dans le menu de ville, **Agir dans cette case**
(F) ouvre les actions de la case actuelle, pas de la ville entiere.
Le repos et le sommeil sont accessibles partout ; repas, musique de rue,
cueillette, manche et vol dependent du terrain et des commerces cartographies.
Hors etape prevue, ces actions servent a obtenir nourriture, argent ou repos,
pas des indices du parent. Sur une etape, le menu ouvre aussi ses enquetes.
Les commandes reutilisent les memes regles et sauvegardes que leurs boutons
habituels. Les trois actions de subsistance gardent leur cout et risque :

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
Le mini-jeu a sa propre melodie originale avec basse et accompagnement,
synthetisee localement en WAV PCM, lue par le meme lecteur audio natif que
les musiques de fond (sans contexte Web Audio separe ni fichier externe).
La lecture est recalee sur les memes reperes visuels : une phrase tiree au
hasard au debut de chaque prestation est repetee trois fois pour permettre de
l'apprendre. Le niveau 0 garde 12 cases (8 notes, 4 silences), a 150 BPM.
Les niveaux suivants accelerent jusqu'a 231 BPM (260 ms par temps), allongent
la phrase jusqu'a 22 cases et 36 notes au total, et ajoutent jusqu'a trois
notes tenues par boucle. Il reste quatre silences par boucle.
Pour `H2`, `H3` ou `H4` suivi de `=`, maintenir Espace ou le bouton pendant
2, 3 ou 4 temps. Une lumiere remplit progressivement chaque case, meme sans
appui, pour guider la duree ; puis
relacher au signal `^` ; relacher trop tot, trop tard ou perdre la prise compte
comme une erreur, sans point pour cette note. Les notes tenues ne sont comptees
qu'une fois, a leur relachement. Les silences et les notes manquees ne donnent
aucun point. La tolerance d'attaque reste de 150 ms ; le relachement accepte
300 ms avant ou apres la fin prevue. Le compteur indique la boucle
courante sur trois ; repeter la phrase ne triple pas le plafond de revenu.
Une frappe juste ou fausse joue un retour distinct. Le bouton de depart
demande l'activation audio au navigateur ; les refus sont affiches sans bloquer
le jeu visuel. Volume et coupure partages dans Options. Fermeture, annulation
et onglet masque arretent toutes les notes ; aucune musique de fond ne masque
le rythme. Les pistes `future-` restent non connectees.
Un premier jeu de 27 effets courts est maintenant synthetise localement,
sans musique d'accompagnement :
[ecouter les effets](public/audio/sfx/index.html). Les cinq sons de pas sont
connectes ; les autres WAV restent disponibles pour de futures actions.
Le mini-jeu utilise sa propre synthese synchronisee, pas ces WAV.
Regeneration reproductible avec
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
  les regles YAML, repas et tarots restent ceux de la sauvegarde.
  Seules les observations tarifaires sont actualisees a la reprise, sans
  modifier le portefeuille, le personnage, la piste ou les actions passees.
  Un echec de chargement est signale et laisse la sauvegarde intacte.
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
Avant les preparations, une lecture groupee du cache serveur restaure les voisins
deja termines, sans lancer de telechargement. Elle contourne la file des deux
preparations lentes : des voisins caches ne restent plus en `?` derriere elles.
Les morceaux absents du cache doivent toujours etre telecharges.
Le client limite les preparations simultanees a deux et conserve au plus 25 morceaux
en memoire. Les demandes de deplacement sont prioritaires devant celles encore
en file d'attente. Le serveur limite lui aussi ses travailleurs a deux et
sa file a dix travaux, avec deduplication des demandes identiques.

Les OSM compresses, altitudes, provenance et grilles sont conserves dans
[.cache/travel/](./.cache/travel/) (ignore par Git). Les extraits inclus sont
reutilises lorsque le morceau est entierement couvert ; sinon le serveur
telecharge OSM avec la subdivision existante. En cas d'indisponibilite,
deux API Overpass et l'API OSM sont selectionnees a tour de role, apres la derniere
source essayee, plutot que de toujours solliciter le meme serveur en premier.
Les catalogues de villes/lieux alternent aussi leurs deux sources Overpass.
Les delais HTTP et messages de limitation sont respectes par source
(60 secondes par defaut), avec acces reseau serialise et erreurs journalisees.
Les cooldowns Overpass sont partages entre cartes et catalogues ; une source
en pause est sautee, sans requete ni contournement de sa limite.
Les sources effectivement utilisees sont conservees dans le snapshot.
Ces services publics ne garantissent pas la disponibilite ; les caches restent
prioritaires. Les grilles terminees portent un
checksum et leur identite depend du pipeline, du snapshot initial et de la
resolution. Les remplacements sont atomiques. Les donnees deja en cache sont
servies sans requete fournisseur, meme apres redemarrage du serveur.
Une panne d'altitude ne fige pas une fausse altitude dans le cache final.

Le cache grandit avec les zones effectivement explorees, pas automatiquement
avec toute la France. Pour reduire la dependance aux API publiques, des extraits
regionaux [Geofabrik](https://download.geofabrik.de/europe/france.html) ou des
extraits personnalises [BBBike](https://extract.bbbike.org/) constituent une
piste distincte d'import local ; ils ne sont pas des endpoints interchangeables
avec les requetes actuelles et leur import PBF n'est pas encore implemente.

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
