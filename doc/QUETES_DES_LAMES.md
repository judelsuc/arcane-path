# Quêtes des lames — des raisons de prendre la route

**Conception révisée et implémentation — 22 octobre 2026.**

### État de l'implémentation

Déployé le 22 octobre 2026 en **0.21.0**, commit
`8da7ac97745b878c3f0b5bf73f79481d86b38874`.
Les deux domaines HTTPS servent les fichiers vérifiés ; les neuf bases sont
intègres et les neuf départs existants n'ont pas été modifiés.
Validation avant publication : 1 183 tests JavaScript et 387 tests Python.
Une nouvelle partie est nécessaire, sans conversion des anciennes sauvegardes.

Le catalogue des 44 canevas, les offres rejouables, les étapes, les récompenses
figées, la sauvegarde et les formulations bilingues sont implémentés. Dialogue
regroupe les échanges et « Demander son chemin » ; Quêtes regroupe les quatre
fils. Les destinations annoncées des services acceptés apparaissent dans les
demandes de chemin, même pour une étape ultérieure et sans suivi actif.
Les services et les indications obtenues sont conservés dans le carnet et son PDF.
La toilette se trouve uniquement dans le menu de ville.

La sélection géographique vérifie des trajets de jeu dans un budget borné :
six villes candidates, huit téléchargements de morceaux de carte et 64 extensions
de transport. Elle signale explicitement l'indisponibilité ; elle ne garantit
pas de trouver un itinéraire pour toute destination en Europe. L'affichage
d'une destination propose une carte d'ensemble interne et un lien OpenStreetMap.
Cette carte montre les repères annoncés, pas un itinéraire garanti.

Un seul sélecteur permet de suivre un objectif parmi les quatre fils, avec
résumé, repère sur la carte de voyage et aperçu des positions connues.
Les indices vagues ne deviennent pas des coordonnées exactes.

Les objets magiques sont jouables dans la partie principale : renseignements
et collectionneur dans Dialogue ; collecte, pouvoirs, rangement et dépôt
dans Quêtes. Les 22 objets appartiennent à un monde serveur partagé distinct
du prototype isolé, sans import de ses données. Leur garde est unique, même
entre des voyages partis de grilles différentes. Les objets utilisent les
mêmes cases de sac et la même limite de poids que l'équipement ordinaire.
Les commandes réseau sont conservées jusqu'à leur sauvegarde locale :
réessayer après une coupure ne répète ni collecte ni coût d'activation.
Les trajets acquis avec l'Étoile apparaissent en doré sur la carte ; les
effets de marche et les révélations de la Lune après sommeil sont raccordés
aux actions ordinaires du voyage.

Le monde des objets demande au moins six localités cartographiées pour son
initialisation. La préparation de terrain est bornée à 256 morceaux et les
positions à 8 000 cellules de l'origine par axe ; une indisponibilité reste
une erreur visible, jamais une réussite inventée.

Les sauvegardes passent au schéma 3 avec le raccordement de l'histoire intime.
Les anciennes parties sont incompatibles :
un message invite à commencer un nouveau voyage, sans migration.
Le récit de départ, la première lettre, les motivations des témoins et les
générations LLM de témoignages/énigmes utilisent désormais les profils intimes
du parent. Cela ne réécrit pas toutes les inscriptions historiques des objets
ni ne révèle les intentions cachées de la cartomancienne.

Ce document accompagne [La Cartomancienne](./LA_CARTOMANCIENNE.md).
Il remplace les premières propositions, trop abstraites, par **44 canevas
rejouables de déplacement vers des POI précis**, deux pour chaque arcane.
La géographie et les objectifs appartiennent au moteur ; le LLM diversifie
les personnes, les demandes et les échanges, sans décider des règles.
L'interface Quêtes regroupe aussi la recherche du parent, les journaux perdus
et les objets magiques. Les 44 canevas et leur formule de récompense concernent
les services secondaires, pas une réécriture des règles de ces trois autres fils.

## 1. Direction retenue

- Une rencontre donne une raison humaine et concrète de voyager.
- Chaque mission exige de rejoindre au moins un POI distinct du lieu de départ.
  Une conversation résolue sur place n'est pas une quête de ce catalogue.
- Les destinations peuvent être proches, éloignées ou à l'autre bout de l'Europe.
  Il ne faut pas ramener systématiquement les quêtes à l'écran déjà chargé.
- Une mission peut enchaîner plusieurs étapes, dans une ou plusieurs villes.
- Plus le trajet demandé est long, plus la récompense est importante.
  Des étapes supplémentaires augmentent également la récompense.
- Les canevas se répètent avec d'autres lieux et situations. Une quête terminée
  n'épuise pas le canevas, mais la même instance ne se récompense qu'une fois.
- La lame donne une **inclination** : l'espoir, la transmission, la réparation,
  le départ. Ni esprit à suivre, ni énigme ésotérique obligatoire.
- Aider n'exige ni possession de la lame ou de son objet, ni chien, ni pouvoir.
  Le lien entre carte et quête ne révèle aucune cache de la cartomancienne.

Une course peut comporter une lettre ou un document : ce n'est pas interdit.
Pour éviter l'impression de « FedEx », le déplacement doit avoir une raison,
les étapes produire une avancée et l'arrivée montrer ce que l'aide a permis.
On évite les trois tampons arbitraires, les retours automatiques au donneur
et les demandes qui changent de destination seulement pour rallonger le trajet.

Les interlocuteurs, dossiers, réservations et services décrits sont **fictifs
et internes au jeu**. Un POI réel sert d'ancrage géographique, pas de promesse
sur ses employés, ses horaires ou ses prestations réelles. Aucun geste,
contact, paiement ou déplacement réel du joueur n'est demandé.

## 2. Lire les canevas

Chaque entrée indique :

- **Demande** : besoin humain et raison pour laquelle la personne délègue.
- **Parcours** : POI à sélectionner puis actions de jeu à accomplir dans l'ordre.
- **Variation** : paramètres renouvelables sans changer la logique de la mission.
- **Issue / gain** : conséquence narrative et forme possible du gain.

Les gains particuliers restent des propositions d'équilibrage. Toute instance
doit annoncer sa récompense exacte avant acceptation. Les prestations comme
un repas ou une nuit nécessitent un effet réellement pris en charge par le jeu ;
à défaut, le moteur utilise une récompense monétaire, pas une promesse fictive
présentée comme un avantage jouable.

## 3. Les 44 canevas

### 0. Le Mat — rendre un départ possible

#### 01. Une adresse pour commencer
- **Demande :** une personne veut quitter un emploi sans logement, mais ne peut financer un voyage de reconnaissance.
- **Parcours :** auberge dans une autre ville → demander une proposition d'hébergement fictive → bureau de poste de cette ville → envoyer les conditions.
- **Variation :** ville, distance, motif du départ et type d'hébergement compatible.
- **Issue / gain :** elle peut préparer son départ sans partir à l'aveugle ; paiement et, si disponible, nuit à l'arrivée. Pas de retour imposé.

#### 02. La première halte
- **Demande :** une personne partira bientôt à pied et veut vérifier sa première étape avant de s'engager.
- **Parcours :** fontaine potable identifiée dans une autre localité → relever le repère → camping ou auberge désigné à proximité → faire confirmer une halte fictive.
- **Variation :** itinéraire, localité, deux POI et raison de l'appréhension.
- **Issue / gain :** un projet dispose de repères concrets ; paiement au second POI. Aucune ouverture réelle n'est certifiée.

### I. Le Bateleur — donner sa chance à un savoir-faire

#### 03. L'essai à l'atelier
- **Demande :** un apprenti a reçu une proposition d'essai dans une ville lointaine, sans savoir ce qu'il faut préparer.
- **Parcours :** atelier compatible → parler au maître fictif → magasin d'outillage désigné → obtenir la liste de matériel puis transmettre la réponse.
- **Variation :** métier, outil concerné, ville et nature de l'épreuve.
- **Issue / gain :** l'apprenti sait à quoi s'engager ; paiement. Aucun achat obligatoire pour se renseigner.

#### 04. La place du marché
- **Demande :** une artisane ne peut quitter sa famille pour vérifier si un autre marché accepte son activité.
- **Parcours :** place de marché d'une autre ville → consulter le placier fictif → mairie de cette ville → déposer sa demande autorisée.
- **Variation :** artisanat, motif d'immobilité et marché cible.
- **Issue / gain :** une candidature est enregistrée, pas un succès commercial garanti ; paiement à la mairie.

### II. La Papesse — retrouver et transmettre un savoir

#### 05. La page manquante
- **Demande :** une personne veut compléter une histoire familiale mais ne peut accéder elle-même à une bibliothèque éloignée.
- **Parcours :** bibliothèque cible → consulter un document public fictif → seconde bibliothèque ou archive sélectionnée → comparer et envoyer une copie autorisée.
- **Variation :** sujet, période, deux établissements et fragment recherché.
- **Issue / gain :** une lacune précise est éclaircie ; paiement. Pas d'accès à un dossier privé inventé par le LLM.

#### 06. Le livre pour la classe
- **Demande :** un enseignant cherche une édition utile à ses élèves, disponible dans une autre ville.
- **Parcours :** bibliothèque ou librairie désignée → demander le prêt ou la cession fictive → bureau de poste cible → expédier l'exemplaire réservé.
- **Variation :** matière, type d'ouvrage et destination.
- **Issue / gain :** l'école reçoit une ressource ; paiement. Le livre est un objet de quête, sans achat avec l'argent du joueur.

### III. L'Impératrice — permettre à quelque chose de grandir

#### 07. Les graines du prochain printemps
- **Demande :** un jardin collectif veut essayer une culture connue dans une région éloignée, mais personne ne peut s'absenter.
- **Parcours :** jardin botanique ou jardinerie désigné → recevoir un lot fictif autorisé → jardin public cible doté d'un correspondant de quête → remettre le lot.
- **Variation :** espèce autorisée par le canevas, saison narrative et deux lieux.
- **Issue / gain :** un essai de culture peut commencer ; paiement. Aucune récolte assurée, aucune introduction réelle d'espèces.

#### 08. La fournée partagée
- **Demande :** une association prépare un repas et veut apprendre une recette auprès d'une boulangerie d'une autre ville.
- **Parcours :** boulangerie cible → recueillir la recette consentie → lieu d'accueil désigné dans une seconde localité → la transmettre au cuisinier fictif.
- **Variation :** recette, fête et deux villes.
- **Issue / gain :** une préparation commune devient possible ; paiement et repas si cet effet est disponible.

### IV. L'Empereur — établir un abri et des repères stables

#### 09. Le toit à réparer
- **Demande :** un lieu d'accueil dispose d'un budget, mais son responsable ne peut aller chercher un devis.
- **Parcours :** atelier de construction compatible dans une autre ville → obtenir un devis fictif → mairie ou lieu d'accueil désigné → déposer le dossier.
- **Variation :** réparation, bâtiment bénéficiaire et distance.
- **Issue / gain :** les travaux peuvent être examinés ; paiement. Le joueur ne finance ni ne réalise le chantier.

#### 10. Une halte pour l'hiver
- **Demande :** un petit groupe doit préparer son prochain hébergement sans pouvoir envoyer quelqu'un en reconnaissance.
- **Parcours :** hébergement cible → vérifier une capacité fictive prédéfinie → second hébergement sélectionné → transmettre les deux possibilités depuis ce dernier.
- **Variation :** taille du groupe, villes et contraintes de couchage.
- **Issue / gain :** le groupe dispose d'un plan principal et d'un repli ; paiement au dernier POI.

### V. Le Pape — accomplir un geste pour quelqu'un d'absent

#### 11. Le cierge promis
- **Demande :** une personne ne peut plus voyager et souhaite qu'un cierge soit allumé pour un proche dans une église précise.
- **Parcours :** église désignée, éventuellement dans une ville très lointaine → action de jeu « Allumer le cierge » → laisser le message convenu.
- **Variation :** dédicace, raison du lien à cette église, ville et distance.
- **Issue / gain :** la promesse est accomplie ; paiement à validation. Le cierge est prévu par la quête, sans dépense obligatoire ni miracle annoncé.

#### 12. La parole transmise
- **Demande :** une personne veut remercier une communauté qui l'a accueillie autrefois, mais ne peut refaire le voyage.
- **Parcours :** lieu de culte compatible désigné → remettre un message au correspondant fictif → bureau de poste sélectionné → envoyer sa réponse.
- **Variation :** tradition explicitement compatible, histoire d'accueil et localité.
- **Issue / gain :** un lien est renoué ; paiement. Pas de conversion, d'absolution ou de pardon imposé.

### VI. L'Amoureux — donner à une relation les moyens de choisir

#### 13. Deux chemins pour se retrouver
- **Demande :** deux proches vivent loin l'un de l'autre et cherchent un lieu de rencontre accessible.
- **Parcours :** gare d'une ville intermédiaire → obtenir une proposition de trajet fictive → café désigné → réserver un accueil de quête et envoyer les modalités.
- **Variation :** relation, villes d'origine et ville intermédiaire.
- **Issue / gain :** une rencontre devient organisable ; paiement. Les personnes restent libres de venir.

#### 14. La lettre acceptée
- **Demande :** une personne souhaite proposer une reprise de contact ; le destinataire a accepté de recevoir une lettre par un intermédiaire.
- **Parcours :** bibliothèque ou café convenu dans une autre ville → remettre la lettre → bureau de poste désigné, éventuellement dans une seconde ville → expédier la réponse consentie.
- **Variation :** amitié, fratrie ou couple, cause de l'éloignement et réponse prédéfinie.
- **Issue / gain :** une réponse, même négative, parvient à son auteur ; paiement identique. La réconciliation ne conditionne pas la réussite.

### VII. Le Chariot — préparer un trajet qui tienne debout

#### 15. Le passage à vérifier
- **Demande :** un transporteur fictif prépare une tournée et manque d'informations sur une étape éloignée.
- **Parcours :** gare ou gare routière cible → relever la correspondance de quête → hébergement désigné dans une autre localité → confirmer la halte fictive.
- **Variation :** mode de transport, villes et type de tournée.
- **Issue / gain :** le trajet peut être organisé ; paiement. Pas d'horaires réels inventés ni de transport à débloquer artificiellement.

#### 16. Les étapes du voyage
- **Demande :** une association veut organiser un déplacement en plusieurs journées pour des participants peu habitués à voyager.
- **Parcours :** deux ou trois hébergements désignés dans des villes successives → recueillir à chacun une proposition fictive → transmettre le plan au dernier.
- **Variation :** corridor géographique, nombre d'étapes et besoins du groupe.
- **Issue / gain :** un parcours documenté remplace une idée vague ; paiement lié au trajet total et aux étapes.

### VIII. La Justice — réunir les éléments d'une décision équitable

#### 17. Les deux exemplaires
- **Demande :** une personne conteste une somme réclamée et possède une autorisation de consulter les copies de son contrat.
- **Parcours :** mairie ou archive désignée → récupérer une copie fictive → bureau administratif ancré sur un second POI compatible → faire comparer les références.
- **Variation :** contrat, erreur prédéfinie et villes.
- **Issue / gain :** le dossier est clarifié selon des faits fixés par le moteur ; paiement. Le LLM ne prononce pas un verdict.

#### 18. La mesure commune
- **Demande :** deux vendeurs acceptent une vérification de leurs instruments, mais ne peuvent quitter leur activité.
- **Parcours :** deux marchés dans des localités distinctes → recueillir les relevés de quête → atelier désigné → obtenir un constat fictif.
- **Variation :** produits, instruments et emplacement des trois POI.
- **Issue / gain :** une mesure commune permet de régler le différend ; paiement sans devoir désigner un coupable.

### IX. L'Hermite — aller chercher un repère fiable

#### 19. La fontaine du vieux chemin
- **Demande :** un marcheur ne peut plus parcourir le chemin où il guidait les voyageurs et veut mettre sa fiche à jour.
- **Parcours :** deux fontaines potables cartographiées dans des localités distinctes → relever chaque repère → office de tourisme désigné → déposer la fiche de quête.
- **Variation :** corridor, fontaines et longueur du circuit.
- **Issue / gain :** une fiche interne au jeu est complétée ; paiement. Une source potable n'est jamais déduite du seul mot « fontaine ».

#### 20. Le refuge à reconnaître
- **Demande :** une personne prépare sa première randonnée lointaine et cherche des repères avant de partir.
- **Parcours :** refuge ou hébergement cartographié → relever son entrée de jeu → point de vue désigné sur un trajet pris en charge → envoyer le relevé.
- **Variation :** massif, refuge et repère visuel.
- **Issue / gain :** elle dispose d'une reconnaissance ; paiement. Ni escalade requise ni garantie réelle de sécurité ou d'ouverture.

### X. La Roue de Fortune — faire parvenir une chance à quelqu'un

#### 21. Le dossier d'héritage
- **Demande :** une personne sans ressources a appris qu'un legs lui revenait, mais ne peut voyager pour faire suivre les pièces autorisées.
- **Parcours :** bureau notarial cartographié ou service fictif rattaché explicitement à une mairie → retirer une copie autorisée → second bureau administratif désigné → déposer le dossier.
- **Variation :** lien avec le défunt, obstacle au voyage, villes et nature modeste du legs.
- **Issue / gain :** le dossier est recevable, sans fortune garantie ; paiement via une avance de frais prévue par la mission, pas pris à la personne démunie.

#### 22. La candidature encore possible
- **Demande :** une personne apprend qu'une place s'est libérée dans une formation éloignée et ne peut aller déposer sa candidature.
- **Parcours :** école ou centre de formation compatible désigné → remettre le dossier → bureau de poste cible → envoyer l'accusé de réception.
- **Variation :** métier, ville et circonstance ayant rouvert la place.
- **Issue / gain :** sa candidature est examinable, pas son admission garantie ; paiement. Pas de délai caché qui expire pendant la génération.

### XI. La Force — soulager un effort devenu trop lourd

#### 23. Une relève pour le refuge
- **Demande :** un bénévole épuisé veut organiser une relève sans abandonner les personnes accueillies.
- **Parcours :** lieu associatif compatible dans une autre ville → recueillir un engagement fictif → lieu d'accueil bénéficiaire désigné → transmettre le planning.
- **Variation :** activité d'accueil, motif de fatigue et villes.
- **Issue / gain :** une relève est préparée ; paiement. Le joueur n'a pas à prendre lui-même tous les services.

#### 24. Le banc sur le parcours
- **Demande :** une association de marcheurs veut proposer un parcours avec de véritables points de repos.
- **Parcours :** deux ou trois parcs ou aires de repos identifiés → relever les points imposés → café désigné → remettre la fiche au correspondant.
- **Variation :** région, circuit et nombre de haltes.
- **Issue / gain :** un itinéraire de repos existe dans le jeu ; paiement. Aucune obligation de marcher blessé ou de s'épuiser.

### XII. Le Pendu — chercher une autre manière d'avancer

#### 25. Le livre accessible
- **Demande :** une lectrice ne peut plus utiliser son édition et cherche une autre forme du même texte.
- **Parcours :** bibliothèque cible → obtenir une édition adaptée fictive → bureau de poste désigné → organiser son envoi autorisé.
- **Variation :** titre fictif, format et distance.
- **Issue / gain :** la lecture redevient possible autrement ; paiement. Le format n'est pas traité comme un pouvoir de guérison.

#### 26. L'autre entrée
- **Demande :** une association prépare une visite et souhaite repérer l'accès annoncé plutôt qu'improviser au dernier moment.
- **Parcours :** musée désigné disposant de métadonnées d'accès utilisables → vérifier le repère dans le jeu → office de tourisme cible → transmettre la fiche.
- **Variation :** musée, ville et besoin d'accès explicitement pris en charge.
- **Issue / gain :** la visite peut être préparée ; paiement. Sans données suffisantes, ce canevas n'est pas proposé.

### XIII. L'Arcane sans nom — accompagner une fin et une transmission

#### 27. La boîte à transmettre
- **Demande :** une personne ferme son atelier et souhaite donner ses modèles à un établissement qui les utilisera.
- **Parcours :** école ou musée compatible dans une autre ville → faire accepter le don fictif → second POI destinataire désigné → remettre l'inventaire et le lot de quête.
- **Variation :** métier, modèles et institutions.
- **Issue / gain :** une activité se termine sans que tout disparaisse ; paiement. Aucun lien avec les réceptacles de la cartomancienne.

#### 28. Le nom sur le registre
- **Demande :** une famille souhaite compléter une inscription commémorative et ne peut se rendre dans la ville concernée.
- **Parcours :** archive ou mairie cible → retirer l'extrait public fictif → cimetière désigné → remettre la demande au correspondant de quête.
- **Variation :** lien familial, souvenir et localité.
- **Issue / gain :** la mémoire est documentée ; paiement. Aucun contact avec un mort ni obligation de pardon.

### XIV. Tempérance — faire circuler ce qui manque

#### 29. Le surplus utile
- **Demande :** une association dispose d'un lot de fournitures dont un autre lieu d'accueil a besoin.
- **Parcours :** lieu de collecte désigné → prendre un colis de quête transportable → lieu d'accueil dans une autre ville → remettre et recevoir un accusé.
- **Variation :** fournitures ordinaires, villes et bénéficiaires.
- **Issue / gain :** une ressource disponible rencontre un besoin ; paiement. Ni médicament ni logistique commerciale réelle simulée par le LLM.

#### 30. La recette qui se partage
- **Demande :** deux cantines veulent adapter une préparation à leurs moyens sans perdre ce qui la rend appréciée.
- **Parcours :** restaurant partenaire désigné → recueillir la recette autorisée → marché d'une autre ville → relever les substitutions prévues → restaurant destinataire.
- **Variation :** recette, ingrédients non sensibles et trois POI.
- **Issue / gain :** une solution commune est transmise ; paiement et repas si disponible.

### XV. Le Diable — desserrer une dépendance concrète

#### 31. Le contrat qu'on ne comprend pas
- **Demande :** une personne n'ose pas quitter une location de matériel à cause d'une clause qu'elle ne comprend pas.
- **Parcours :** mairie ou lieu d'aide compatible désigné → faire examiner la copie autorisée → magasin loueur cible → déposer la demande préparée.
- **Variation :** matériel, clause prédéfinie et localités.
- **Issue / gain :** elle connaît ses options et sa demande est enregistrée ; paiement. Pas de menace, vol ou conseil juridique réel inventé.

#### 32. Le travail retenu
- **Demande :** une artisane veut montrer sa production ailleurs pour ne plus dépendre d'un acheteur unique.
- **Parcours :** deux marchés ou boutiques compatibles dans des villes différentes → présenter un catalogue de quête → bureau de poste désigné → envoyer les réponses.
- **Variation :** artisanat, débouchés et distances.
- **Issue / gain :** elle dispose de propositions supplémentaires ; paiement. Aucune vente miraculeuse ni rupture imposée.

### XVI. La Maison Dieu — préparer l'après quand un cadre s'effondre

#### 33. Une salle de remplacement
- **Demande :** une salle associative est indisponible dans la fiction ; l'organisateur cherche un autre lieu pour maintenir son activité.
- **Parcours :** mairie d'une autre localité → recevoir une proposition fictive → salle ou lieu d'accueil cartographié désigné → confirmer les modalités.
- **Variation :** activité, raison non catastrophiste de l'indisponibilité et ville.
- **Issue / gain :** une activité peut reprendre ailleurs ; paiement. Aucune fermeture réelle du bâtiment n'est affirmée.

#### 34. Les plans de secours
- **Demande :** une petite structure a perdu ses copies de travail et sait où en retrouver des doubles autorisés.
- **Parcours :** deux archives, bibliothèques ou ateliers compatibles désignés → récupérer les deux fragments fictifs → établissement bénéficiaire dans une troisième localité.
- **Variation :** plans, projet et répartition géographique.
- **Issue / gain :** le travail peut reprendre ; paiement majoré pour le parcours. Pas d'accident ajouté pour dramatiser.

### XVII. L'Étoile — transformer l'espoir en possibilité vérifiée

#### 35. La place pour repartir
- **Demande :** une personne sans emploi a entendu parler d'un travail dans un hôtel éloigné et ne peut payer un voyage exploratoire.
- **Parcours :** hôtel désigné → demander les conditions d'embauche fictives → bureau de poste de cette ville → envoyer la proposition.
- **Variation :** personne, ville, poste et établissement compatible ; restaurant ou ferme seulement si le canevas le permet.
- **Issue / gain :** elle sait qu'une possibilité existe ; paiement et nuit si disponible. Le joueur ne promet ni embauche ni bonheur.

#### 36. La formation qu'on croyait hors de portée
- **Demande :** une personne souhaite reprendre un apprentissage mais ignore si une aide peut couvrir ses frais.
- **Parcours :** école compatible d'une autre ville → recueillir les conditions → mairie cible → obtenir le dossier d'aide fictif et le transmettre.
- **Variation :** domaine, obstacle financier et localité.
- **Issue / gain :** un projet dispose de démarches concrètes ; paiement. L'aide n'est pas attribuée par un dialogue improvisé.

### XVIII. La Lune — vérifier avant de laisser l'inquiétude décider

#### 37. La pension dont on parle
- **Demande :** une personne veut réserver loin de chez elle mais a reçu deux descriptions contradictoires d'un hébergement.
- **Parcours :** hébergement désigné → relever les éléments de quête → office de tourisme cible → faire vérifier sa fiche fictive et transmettre le constat.
- **Variation :** contradiction matérielle prédéfinie, ville et type de logement.
- **Issue / gain :** une incertitude est levée ; paiement. Aucune accusation sur un établissement réel.

#### 38. Le colis annoncé
- **Demande :** une personne a reçu un avis de dépôt incomplet et ne peut aller vérifier de quoi il s'agit.
- **Parcours :** bureau de poste d'une autre ville → consulter l'avis autorisé → second bureau de poste désigné → faire suivre le colis fictif.
- **Variation :** origine du colis, erreur de référence et villes.
- **Issue / gain :** une supposition devient un fait vérifié ; paiement. Ni filature, ni consultation de correspondance privée sans mandat.

### XIX. Le Soleil — permettre à un moment heureux d'avoir lieu

#### 39. La photo de la fête
- **Demande :** une association prépare un anniversaire et veut retrouver une copie d'une ancienne photo de groupe autorisée.
- **Parcours :** bibliothèque ou musée désigné → obtenir la reproduction fictive → café ou lieu de fête dans une autre localité → la remettre.
- **Variation :** événement, époque et lieu d'arrivée.
- **Issue / gain :** un souvenir devient partageable ; paiement et repas si disponible. Pas d'image privée récupérée sur Internet.

#### 40. La musique jusqu'au village
- **Demande :** un organisateur ne peut quitter les préparatifs d'une fête pour confirmer la venue de musiciens.
- **Parcours :** café ou école de musique compatible désigné → obtenir l'accord fictif → lieu de fête cartographié dans une autre ville → transmettre les modalités.
- **Variation :** occasion, style musical et distance.
- **Issue / gain :** le programme est confirmé dans la fiction ; paiement. Aucun concert réel ni effet d'attente obligatoire.

### XX. Le Jugement — faire parvenir les preuves d'une injustice

#### 41. Le reçu qui l'innocente
- **Demande :** une personne accusée à tort sait qu'un duplicata prouve son paiement, mais ne peut faire le voyage.
- **Parcours :** commerce ou mairie désigné → obtenir le reçu fictif autorisé → lieu d'accueil où l'accusation circule → remettre la preuve au responsable.
- **Variation :** dépense, raison de l'absence et villes.
- **Issue / gain :** une accusation établie comme fausse est rectifiée ; paiement. Contrairement à la Justice, le tort est déjà fixé par le canevas.

#### 42. Le témoignage écarté
- **Demande :** un groupe a été privé d'une aide parce qu'une pièce de son dossier n'a pas été prise en compte.
- **Parcours :** archive ou mairie cible → récupérer la pièce datée → second bureau administratif désigné → faire enregistrer le recours et son accusé.
- **Variation :** aide fictive, document omis et localités.
- **Issue / gain :** le dossier peut être réexaminé avec la preuve manquante ; paiement. Ni pardon exigé ni indemnité inventée.

### XXI. Le Monde — relier plusieurs lieux en une œuvre commune

#### 43. Les recettes du voyage
- **Demande :** une bibliothèque prépare un petit recueil de recettes offertes par plusieurs villes.
- **Parcours :** deux ou trois restaurants consentants désignés dans des localités différentes → recueillir chaque fiche fictive → bibliothèque destinataire.
- **Variation :** corridor, cuisines et nombre d'étapes.
- **Issue / gain :** un recueil collectif est complété ; paiement lié au parcours. Chaque collecte ajoute une contribution distincte.

#### 44. L'exposition itinérante
- **Demande :** un musée veut réunir des reproductions autorisées conservées dans plusieurs établissements.
- **Parcours :** deux musées ou bibliothèques désignés dans des villes différentes → retirer les reproductions fictives → musée destinataire dans une autre localité.
- **Variation :** thème, régions et ordre géographique validé.
- **Issue / gain :** une exposition devient réalisable ; paiement. Aucune œuvre réelle à transporter, aucune collection des 22 lames exigée.

## 4. Adapter un canevas à la position du joueur

### 4.1. Séparer le modèle et son instance

Le **canevas** décrit les rôles de POI, les actions et leurs dépendances.
L'**instance** fixe une fois pour toutes les lieux, interlocuteurs fictifs,
faits, étapes et gains pour une rencontre donnée.

Exemple de structure indicative, pas de nouveau format déjà implémenté :

```text
canevas : star.employment-check, révision 1
instance : identifiant unique ; graine persistée
départ : cellule et localité de la rencontre, figées à la création
destination 1 : identifiant stable du POI hôtel + coordonnées + localité
destination 2 : identifiant stable du POI poste + coordonnées + localité
étapes : parler à l'hôtel ; envoyer la réponse à la poste
faits : poste fictif ; conditions ; réponse ; raison de la délégation
récompense : somme exacte ; éventuel effet additionnel disponible
distance de référence : somme des jambes du parcours obligatoire
progression : étape active ; actions validées ; statut ; gain versé ou non
présentation : langue ; version du prompt ; textes validés et conservés
```

Les destinations et le gain ne se recalculent pas parce que le joueur marche,
recharge la partie, change de langue ou demande une autre formulation.
Les objets transportés sont des éléments de quête, distincts des réceptacles
magiques : leurs règles de transport doivent être annoncées avant acceptation.

### 4.2. Instancier depuis une rencontre réelle

1. **Ancrer le départ.** Utiliser la position effective du joueur au moment de
   la rencontre, sa localité et les POI publics disponibles. Ne pas le
   téléporter chez un donneur ni lui inventer une visite passée.
2. **Choisir les canevas compatibles.** Vérifier leurs types de POI, données
   nécessaires et actions prises en charge. La carte peut orienter les offres,
   sans rendre sa possession obligatoire ni bloquer la recherche du parent.
3. **Choisir une portée.** Proposer des offres locales, régionales et lointaines.
   Bandes initiales proposées : 5–30 km, 30–150 km, 150–500 km, plus de 500 km.
   Ces seuils sont à équilibrer, pas des limites techniques déjà garanties.
4. **Chercher des villes candidates.** Pour le lointain, interroger un index
   géographique couvrant la zone supportée, pas seulement les cellules chargées.
   Charger ensuite les POI nécessaires dans les villes candidates, avec un
   budget de recherche borné. Ne pas scanner toute l'Europe à chaque rencontre.
5. **Résoudre tous les rôles.** Trouver les POI compatibles de chaque étape.
   Une ville connue sans hôtel ou poste vérifié ne suffit pas à instancier
   L'Étoile. Un office notarial absent n'est pas créé par le LLM.
6. **Vérifier le parcours.** Toutes les destinations doivent être dans la zone
   jouable et rejoindre le réseau de déplacement pris en charge. Vérifier
   accès, terrain et franchissements selon les données et moyens disponibles.
   Une distance à vol d'oiseau ne prouve pas qu'une île est accessible.
7. **Ordonner les étapes.** Respecter leurs dépendances puis éviter les
   zigzags inutiles. Deux points d'une même ville peuvent se suivre ; une
   collecte multiville doit apporter quelque chose à chaque arrêt.
8. **Calculer puis figer.** Fixer les faits de quête, la distance, le gain et
   les points de validation avant de demander les textes au LLM.
9. **Présenter l'offre.** Montrer destination, étapes, distance de référence,
   caractère estimé éventuel et récompense. Le joueur accepte ou refuse.

Une requête lointaine impossible ne devient pas discrètement une mission locale.
Le moteur peut proposer explicitement une autre portée ou ne pas proposer ce
canevas. Une erreur technique est signalée ; une absence normale de POI est
distinguée d'une panne de données. Aucune quête incomplète n'est offerte.

**Prérequis technique à construire :** un annuaire de villes ne constitue pas
un index de tous les POI européens ni une preuve de trajet accessible. La
recherche lointaine, la vérification et le cache des destinations sont une
partie du futur système, pas des capacités réputées acquises par ce document.

### 4.3. POI et validation dans le jeu

- Conserver source, type et identifiant stable, coordonnées, localité, catégories
  et métadonnées utiles. Un nom seul n'identifie pas une destination.
- Un lieu sans nom peut recevoir un libellé descriptif honnête, par exemple
  « Bureau de poste de [localité] », jamais un nom propre prétendument officiel.
- Ne pas confondre une catégorie générale et un service précis : lieu de culte
  ne signifie pas église, fontaine ne signifie pas eau potable, magasin ne
  signifie pas atelier de réparation. Les rôles exigent des critères explicites.
- Le Pape / cierge demande une église identifiée comme telle ; un autre lieu
  de culte nécessite un autre geste prévu par le canevas, pas le même rituel.
- Une étape se valide par **présence dans la cellule d'accès du POI désigné**
  et action de quête explicite. Un rayon de proximité éventuel doit être fixé
  par le moteur et annoncé, pas déterminé par le texte.
- Pour un grand bâtiment, choisir une cellule d'accès jouable, pas un centroïde
  inaccessible. Inspecter une cellule ou cliquer à distance ne valide rien.
- Une visite antérieure à l'acceptation n'accomplit pas un nouvel échange.
  Les étapes dépendantes ne se valident pas avant leurs prérequis.
- « Envoyer » est une action de jeu au POI postal, pas un courriel réel.
- Une destination devenue indisponible bloque avec une explication et une
  option d'abandon sans pénalité ajoutée. Toute substitution doit être explicite,
  acceptée et recalculée ; elle ne déplace jamais une cache magique.

### 4.4. Exemple : le même canevas, trois départs

Pour **L'Étoile / La place pour repartir**, les villes suivantes illustrent
la sélection ; elles ne constituent pas une liste de POI déjà vérifiés.

| Position lors de la rencontre | Portée souhaitée | Sélection attendue du moteur |
|---|---|---|
| Près de Lyon | Régionale | Ville de la bande régionale possédant un hôtel et une poste compatibles, par exemple en direction de Grenoble après vérification |
| Près de Turin | Lointaine | Ville distante compatible, par exemple en direction de Lyon ; ne pas réutiliser un hôtel voisin simplement parce qu'il est chargé |
| Village sans hôtel ni poste à proximité | Locale ou lointaine | Rencontre au village, mais recherche des deux destinations ailleurs ; ne pas inventer les services manquants au village |

L'origine change le bassin de recherche, le parcours et le gain. Le besoin
humain reste le même : obtenir une proposition concrète sans payer un
voyage exploratoire. Aucune de ces variantes ne réclame de retour au donneur.

## 5. Distance, étapes et récompense

### 5.1. Mesurer le trajet demandé, pas les détours

La distance de référence est la somme des jambes obligatoires :
**départ de la rencontre → étape 1 → étape 2 → … → dernière étape**.
Un retour n'entre dans la somme que s'il est réellement requis et annoncé.
Ni kilomètres errés, ni allers-retours volontaires, ni rechargements ne
majorent le gain. On ne réduit pas non plus une récompense acceptée parce
que le joueur a trouvé un transport plus rapide.

Utiliser un parcours compatible avec le réseau de jeu. Si seule une estimation
est disponible, elle doit être identifiée comme telle et suffisamment validée
pour ne pas promettre un trajet impossible. Une estimation ne devient pas
silencieusement une mesure routière exacte.

### 5.2. Formule implémentée, à équilibrer en jeu

Formule actuelle du moteur, **encore à calibrer par des parties de test** :

```text
gain en centimes = 500 + ceil(20 × D) + 300 × (N - 1)
D = distance de référence en kilomètres
N = nombre d'étapes obligatoires, au moins 1
```

| D | N | Gain monétaire |
|---|---|---|
| 20 km | 1 | 9 € |
| 100 km | 2 | 28 € |
| 500 km | 2 | 108 € |
| 1 000 km | 3 | 211 € |

À nombre d'étapes égal, une plus grande distance ne rapporte jamais moins ;
les bonus de nuit ou de repas ne diminuent pas cette part monétaire.
La formule continue au-delà des bandes de portée : pas de plafond qui rendrait
une traversée beaucoup plus longue aussi peu intéressante qu'un trajet moyen.
Les coefficients devront être testés contre les prix, frais et revenus
existants avant intégration ; ces montants ne sont pas une promesse d'équilibrage.

Le paiement est un effet du système, annoncé comme indemnité, budget associatif
ou avance du commanditaire : une personne pauvre ne devient pas riche pour
pouvoir payer. Le LLM ne choisit ni financeur mécanique ni somme.

### 5.3. Rejouer sans exploiter

- Une nouvelle instance peut réutiliser le canevas avec un autre départ,
  d'autres POI ou d'autres faits. Ne pas imposer un protagoniste historique unique.
- Éviter les doublons actifs de canevas et de destinations ; prévoir une rotation
  des canevas et un délai de reproposition à équilibrer.
- Figer l'offre dès son apparition pendant la rencontre pour empêcher les
  relances de texte de tirer une meilleure récompense.
- À chaque étape, appliquer une transition unique, persistée ; à la fin,
  verser le gain une seule fois, de manière atomique avec la clôture.
- Un reçu de quête n'est ni revendable, ni utilisable dans une autre instance.
  Le même POI peut servir plus tard, mais exige une nouvelle action de quête.
- Un abandon est possible sans culpabilisation ni gain final. Ne pas ajouter
  de paiement intermédiaire avant d'avoir défini ses règles anti-duplication.
- Les conditions de transport, frais et délais éventuels sont explicites.
  Par défaut, pas d'échéance ni d'achat obligatoire ; aucune urgence créée par le LLM.

## 6. Ce que le LLM peut varier

### 6.1. Entrée : un contrat déjà résolu

Le moteur fournit seulement les données utiles à l'étape à écrire :

- identifiant et version du canevas, graine de variation et langue ;
- inclination de la lame en une phrase, sans secrets de la cartomancienne ;
- situation autorisée, raison de déléguer et liens entre personnages fictifs ;
- noms, catégories et localités des POI concernés, tels qu'ils seront affichés ;
- étapes connues, action attendue, résultat prédéfini et état de progression ;
- distance annoncée, récompense exacte et contraintes ;
- variantes permises de ton, de personnalité et de détail quotidien ;
- formulations déjà conservées pour éviter les répétitions.

Le modèle ne reçoit ni route future du parent, ni caches, ni carnet privé,
ni emplacement d'autres joueurs. Il ne doit pas recevoir tout le voyage
pour écrire une demande de quelques lignes. Un détail intime du parent n'est
pas nécessaire à ces missions et ne doit pas être recyclé pour tous les PNJ.

### 6.2. Liberté narrative, pas liberté de modifier la quête

**Peut varier :** titre, voix du demandeur, pudeur ou franchise, petite habitude,
formulation du besoin, échanges à l'arrivée et remerciement cohérent avec l'issue.
La raison concrète de déléguer peut être tirée d'une liste autorisée :
manque d'argent, responsabilité familiale, travail, mobilité limitée.
Une fois choisie, elle reste cohérente dans tous les textes de l'instance.

**Ne peut pas varier :** POI, coordonnées, nombre ou ordre des étapes,
actions, distance, montants, objets requis, autorisations, délais, succès,
échec, conditions d'accès ou suite de mission. Pas de maladie, dette, menace,
nouvel interlocuteur à visiter ou fermeture ajoutée pour faire du drame.

Le plus sûr est de garder **lieux, distances, objectifs et gain dans des champs
d'interface écrits par le moteur**. Le texte généré peut désigner « cet hôtel »
ou utiliser un jeton que le moteur remplace par le libellé exact. Il ne
réécrit pas une somme ou un nom propre dont il pourrait changer l'orthographe.

Sortie indicative limitée à des champs narratifs :

```json
{
  "titre": "Avant de faire ma valise",
  "demande": "Je ne peux pas payer le voyage juste pour poser la question. Si tu y vas, pourrais-tu te renseigner pour moi ?",
  "dialogue_arrivee": "Nous pouvons lui transmettre les conditions prévues. Il lui restera à décider si elles lui conviennent.",
  "conclusion": "La réponse est partie. Cette fois, elle pourra décider avec quelque chose de concret entre les mains."
}
```

Les instructions d'objectif, les marqueurs et le bouton de validation ne sont
pas dans cette sortie. Si une énigme facultative apparaît dans la présentation,
sa solution est fournie par le canevas et **l'objectif clair reste accessible**.
La prose n'est jamais l'unique moyen de connaître le POI à rejoindre.

### 6.3. Deux présentations du même contrat

Contrat moteur : hôtel puis poste d'une ville éloignée ; se renseigner puis
envoyer les conditions ; récompense et distance fixées dans l'interface.
Raison autorisée pour cette instance : manque d'argent pour la reconnaissance.

**Voix réservée :**
> « J'ai noté le nom de l'hôtel trois fois, comme si ça pouvait me rapprocher.
> Je n'ai pas les moyens d'y aller juste pour demander. Tu pourrais poser la question ? »

**Voix directe :**
> « Le travail, je veux bien le faire. Mais payer le trajet pour découvrir
> qu'il n'y a rien, je ne peux pas. Renseigne-toi là-bas et fais-moi suivre leur réponse. »

Ces deux textes n'ajoutent aucun détour. Une troisième instance du même canevas
pourrait retenir une responsabilité familiale comme motif, mais les textes
d'une instance déjà acceptée ne changent pas soudainement de biographie.

### 6.4. Validation, conservation et échecs

1. Construire et valider l'instance jouable avant la génération.
2. Demander une sortie structurée avec champs autorisés et longueurs bornées.
3. Rejeter les champs supplémentaires, les montants, lieux ou obligations non
   autorisés et les contradictions détectables avec les faits fournis.
   Ces contrôles ne prouvent pas à eux seuls toute la cohérence sémantique :
   les faits jouables restent donc toujours hors du texte libre.
4. Afficher un texte d'auteur paramétré si le service est absent, lent ou invalide.
   Signaler cet état selon le mécanisme habituel ; ne pas bloquer l'offre,
   prétendre que la génération a réussi ou retenter indéfiniment.
5. Conserver les textes acceptés par instance, étape et langue avec leur version
   de prompt. Réouvrir une fenêtre ou reprendre la sauvegarde ne régénère pas.
6. Dans l'autre langue, conserver les mêmes faits et le même état. Une traduction
   ne réinstancie ni la géographie ni la récompense.
7. Ne générer que pour les offres réellement retenues et les étapes utiles,
   pas pour tous les POI candidats. Borner coût, file et tentatives.

## 7. Commandes à ajouter à l'interface existante

**Cette section spécifie les futurs ajouts ; aucun bouton n'est encore ajouté.**
Conserver l'interface centrée sur le jeu : pas une commande de barre principale
par quête, ni une fenêtre qui s'ouvre automatiquement à chaque cellule.

**Deux fenêtres, deux rôles : « Dialogue » pour interagir avec les gens ;
« Quêtes » pour consulter les quêtes et leurs indices.** Ce découpage remplace
la proposition précédente qui mettait toutes les interactions dans Quêtes.
Il couvre le parent, les services secondaires, les journaux perdus et les objets
magiques. Les anciens raccourcis spécialisés sont supprimés, pas redirigés.

### 7.1. Où découvrir, consulter et accomplir une quête

Deux entrées visibles suffisent pour ces fonctions : **Dialogue** et **Quêtes**.
La conversation actuelle devient Dialogue. Les anciens panneaux spécialisés
de parent, d'indices, de journaux perdus et de recherche d'objets ne sont plus
des destinations indépendantes. Le carnet personnel conserve ses photos et récits,
sans redevenir un gestionnaire de quêtes.

| Surface existante | Ajout proposé | Fonction |
|---|---|---|
| Barre principale | **« Dialogue »** et **« Quêtes »** | Deux points d'entrée visibles et accessibles sur mobile |
| Fenêtre Dialogue | Échanges avec les personnes présentes | Recevoir et accepter une demande, interroger un témoin, demander son chemin, remettre un document ou un journal |
| Fenêtre Quêtes | Parent, services, journaux perdus et objets magiques | Consulter objectifs, indices acquis, destinations, progression et historique ; gérer le suivi et l'abandon autorisé |
| Fenêtre des actions de la cellule | Aucun bouton de quête | Conserver les activités existantes ; les actions de quête restent dans Quêtes |
| Carnet personnel et PDF | Traces des quêtes, en lecture seule | Conserver récit, progression et issue, sans deuxième panneau de commandes |
| Carte et résumé de voyage | Un objectif suivi choisi dans les quatre fils | Montrer la prochaine action et les seules informations géographiques acquises ; garder le parent identifiable comme quête principale |
| Liste des POI de la cellule | Mention textuelle **« Étape de quête »** | Identifier le POI exact, sans bouton d'action supplémentaire |
| Aide et raccourcis | Description de l'accès unique | Expliquer les commandes regroupées dans Quêtes |

Les offres se présentent dans Dialogue, liées à la personne et à la position
réelles. Ouvrir Quêtes ne permet pas de converser à distance. S'il n'existe aucune offre,
afficher une réponse courte et normale. Si la recherche de destinations échoue
techniquement, afficher une erreur distincte avec une relance explicite :
« personne n'a besoin d'aide » ne doit pas masquer une panne.

### 7.2. Les commandes du joueur

| Commande | Emplacement | Effet et limites |
|---|---|---|
| **Écouter la demande** | Dialogue / interlocuteur présent | Affiche récit court et contrat, sans acceptation implicite |
| **Accepter** | Dialogue / demande proposée | Enregistre l'instance et ses conditions, sans déplacer le joueur ni accomplir une étape |
| **Pas cette fois** | Dialogue / demande proposée | Refuse la proposition sans pénalité morale ; ne retire pas une quête déjà acceptée |
| **Suivre cette quête** | Quêtes / détail | Choisit l'unique objectif secondaire affiché sur la carte |
| **Ne plus suivre** | Quêtes / détail | Retire son affichage de carte, sans abandonner ni effacer la progression |
| **Voir la destination** | Quêtes / détail d'étape | Affiche dans cette fenêtre une vue d'ensemble avec joueur et POI ; n'est ni un déplacement ni une validation |
| **Objectif clair** | Quêtes / détail | Affiche les instructions moteur, même si la prose du LLM est absente ou obscure |
| **Interroger / demander son chemin / remettre** | Dialogue / interlocuteur présent | Propose les sujets et étapes compatibles avec la personne, le POI et les preuves acquises |
| **Geste sans interlocuteur** | Quêtes / détail, bloc fixe « Action sur place » | Exécute uniquement un geste matériel autorisé au bon lieu : allumer un cierge, chercher ou ramasser un objet |
| **Abandonner la quête** | Quêtes / détail | Demande confirmation dans cette même fenêtre, rappelle la perte du gain final et clôt l'engagement sans punition ajoutée |
| **Revenir à la carte** | Dialogue ou Quêtes | Ferme la fenêtre et restitue le contexte sans effet de jeu |

Dans le détail, les commandes occupent toujours le même bloc, sous l'objectif
actuel. Un geste matériel reste à cet emplacement hors destination, désactivé
avec la raison et le lieu à rejoindre. Une étape nécessitant une personne indique
« Parler au responsable dans Dialogue », sans dupliquer son bouton d'échange.
Les gestes sans interlocuteur n'ouvrent pas une troisième fenêtre spécialisée.
Sur petit écran, conserver cet ordre avec défilement accessible.

Pas de bouton générique **« Terminer la quête »** utilisable n'importe où.
Le moteur termine la mission après la dernière action valide et verse
automatiquement le gain une fois. Pas de retour obligatoire ni de bouton
« Réclamer » ajouté uniquement pour toucher une récompense déjà acquise.

### 7.3. Le contenu de la fenêtre Quêtes

Une seule fenêtre propose quatre rubriques : **Parent**, **Services rendus**,
**Journaux perdus**, **Objets magiques**. Le bloc de commandes reste au même
endroit quelle que soit la rubrique. Les indications obtenues dans Dialogue
s'ajoutent aux indices de la quête concernée, pas à un panneau d'indices séparé.

Les services proposent les filtres **En cours**, **Terminées** et **Abandonnées**.
Les offres non acceptées restent dans Dialogue, liées à leur rencontre, et
ne deviennent pas des engagements ni des échanges accessibles à distance.

Les autres rubriques projettent leurs règles et états existants :

| Rubrique | Contenu et commandes à regrouper |
|---|---|
| Parent | Lettre initiale, indices acquis, témoignages, historique des étapes et gestes de recherche sans interlocuteur autorisés |
| Journaux perdus | Signalements connus, recherche et ramassage à portée, journaux détenus, destinations et traces des remises effectuées dans Dialogue |
| Objets magiques | Pistes et inscriptions acquises, lieux connus, recherche locale et prise ou dépôt lorsque ces actions sont permises |

Ce regroupement ne donne ni nouvelle connaissance ni droit supplémentaire :
aucun contenu privé d'un journal perdu avant l'accès autorisé, aucune cache
révélée par la simple présence d'un objet dans le catalogue. L'utilisation
ordinaire d'un pouvoir reste une action d'objet ; les commandes de sa recherche,
de sa récupération ou de son dépôt appartiennent à Quêtes.

La quête principale ne se refuse ni ne s'abandonne comme un service. Les journaux
et objets conservent leurs règles de garde, dépôt et restitution : le bouton
d'abandon d'un service n'efface pas un objet transporté. Ne pas leur appliquer
la formule monétaire des services ou exiger qu'ils soient rejouables.

Chaque ligne montre le titre, la prochaine information géographique connue,
la progression, la récompense si applicable et l'indication « suivie » éventuelle.
L'inclination de carte peut apparaître en
sous-titre discret ; elle n'est pas un prérequis à cocher.

Pour un service, le détail contient les éléments ci-dessous. Les autres fils
affichent leurs preuves acquises plutôt qu'un contrat ou des étapes futures cachées :

1. La demande et le souvenir du donneur, son lieu de rencontre.
2. Le **contrat clair**, toujours consultable sans coût : actions, destinations,
   distance de référence et gain exact convenus à l'acceptation.
3. Les étapes ordonnées avec leur état : **À venir**, **À faire**, **Accomplie**.
   Les étapes à venir restent visibles mais leurs actions ne sont pas exécutables.
4. Le POI précis : nom ou libellé descriptif, catégorie, localité et repère de carte.
5. Les documents et colis de quête, sous forme de mentions attachées à l'instance,
   sans les faire passer pour des objets ordinaires revendables ou des lames.
6. L'historique utile : action, lieu, moment du voyage et issue ; puis le gain
   effectivement reçu à la clôture.

Si un objet de quête doit plus tard occuper de la place ou peser dans le sac,
son poids et sa capacité requise font partie du contrat avant acceptation.
Ne pas ajouter un encombrement invisible après coup.

Le carnet doit conserver la trace des quêtes pour la consultation et l'export
PDF : demande, étapes réalisées, issue et récompense, sans exposer d'informations
privées appartenant à un autre voyageur. La publication d'un carnet suit les
règles de visibilité existantes ; elle ne rend pas les quêtes transférables.

### 7.4. Sur la carte et à l'arrivée

- Un seul objectif suivi, choisi parmi les quatre fils, évite une carte couverte
  de marqueurs. Le parent reste identifié comme quête principale ; suivre un
  service ne l'abandonne pas. Les autres quêtes restent actives et consultables.
- Sur la carte locale, marquer le POI de l'étape courante seulement s'il est dans
  la vue ; ne pas le dessiner faussement au bord comme s'il était à proximité.
- Hors champ, afficher une direction générale et la localité ; la commande de
  vue d'ensemble reste dans Quêtes. La distance restante informative est distincte de la distance
  de référence qui a fixé la récompense.
- Dans une carte ASCII, utiliser un repère dédié avec légende et une information
  textuelle équivalente. Si plusieurs éléments occupent la même cellule,
  conserver leur liste ; ne pas effacer joueur, terrain ou marqueur du parent.
- La vue d'ensemble, affichée dans Quêtes, peut utiliser les coordonnées déjà
  connues sans charger tous les détails du trajet lointain. Ses commandes de
  retour au joueur ou au détail restent dans cette fenêtre. Aucun déplacement
  automatique n'est ajouté.
- À l'arrivée réelle, afficher une notification non modale :
  « Étape disponible dans Dialogue : parler au responsable de l'hôtel. »
  Ne pas valider juste en entrant dans la cellule ni interrompre une autre scène.
- Dans Quêtes, signaler les étapes disponibles ici : échange à effectuer dans
  Dialogue ou geste matériel dans le bloc « Action sur place ». Dans Dialogue,
  regrouper les échanges par interlocuteur présent. Si plusieurs POI partagent
  la cellule, le libellé nomme la cible et l'acte ;
  on n'allume pas le cierge de la mauvaise église parce qu'elle a le même nom.
- Après l'action, confirmer ce qui a été fait et afficher la prochaine étape.
  À la dernière étape, montrer l'issue et le montant réellement versé.

Les indicateurs respectent la précision acquise : direction, région ou nom
partiel ne devient pas un marqueur exact. Aucun ancien raccourci n'ouvre
directement une rubrique ou l'orientation. Le choix d'une destination
est explicite et ne change pas silencieusement avec la quête suivie.

### 7.5. Clavier, mobile et accessibilité

- Supprimer les anciens accès spécialisés : `J` pour le parent, `I` pour les
  indices ou l'orientation, `9` pour les journaux perdus, ainsi que les accès
  directs aux objets de quête. Supprimer aussi leurs boutons masqués, infobulles
  et entrées d'aide. Aucun alias de compatibilité ni redirection vers une rubrique.
- Ne pas remplacer ces accès par une nouvelle touche par type de quête.
  Retirer la proposition précédente de réserver `8`. Les boutons Dialogue et
  Quêtes suffisent ; les commandes sans rapport avec ces recherches ne sont
  pas supprimées. Les raccourcis ordinaires éventuellement attribués aux deux
  boutons suivent le système commun, sans nouveaux accès spécialisés.
- Les deux boutons restent accessibles sur mobile ; aucun raccourci n'est
  nécessaire pour découvrir ou accomplir une mission.
- Les commandes des deux fenêtres utilisent le même système de boutons,
  d'infobulles et de raccourcis que les fenêtres actuelles. Pas de gestionnaire
  clavier parallèle, ni de raccourci qui agit derrière une autre fenêtre.
- `Échap` ferme la consultation sans refuser ou abandonner. Pour l'abandon,
  le choix initial de confirmation est **« Garder la quête »**.
- Tabulation, focus visible, restitution du focus à la fermeture et annonces
  de statut suivent les conventions existantes. État et repère ne reposent
  pas sur une couleur seule.
- Les textes et libellés existent en français et anglais, avec montants et
  distances formatés selon la langue, sans changement de contrat.

### 7.6. Coûts, blocages et erreurs

Consulter, suivre et lire l'objectif ne consomment ni temps de jeu ni argent.
Chaque **action de quête** annonce, avant exécution, son coût éventuel en temps
ou ressources, ainsi que le montant pris en charge par la mission. Le moteur
vérifie les mêmes conditions d'action que le reste du voyage ; une étape
secondaire ne contourne ni déplacement interrompu, ni indisponibilité, ni fin
de partie. Après la fin du voyage, les quêtes restent lisibles mais inactives.

Pendant une validation, désactiver le bouton concerné et empêcher les doubles
clics. Confirmer la réussite après l'enregistrement durable de la transition.
Si la sauvegarde échoue, afficher une erreur et conserver une reprise cohérente :
ne pas afficher « payé » sans paiement enregistré. Une requête répétée doit
retrouver le résultat précédent, pas l'appliquer de nouveau.

Une erreur de génération narrative ne bloque pas ces actions. Le statut de
génération et sa relance éventuelle restent secondaires ; relancer un texte
ne relance ni la sélection des POI ni le calcul de la récompense.

### 7.7. Surfaces d'implémentation raccordées

L'implémentation raccorde les deux boutons aux fenêtres Dialogue et
Quêtes. Dialogue regroupe les échanges, y compris ceux qui font progresser
une quête ; Quêtes regroupe objectifs, indices et suivi, avec les seuls gestes
matériels sans interlocuteur. Carnet/PDF et carte reçoivent des projections
de lecture seule. Supprimer les anciens accès spécialisés dans le routage,
les boutons visibles ou masqués, les raccourcis et l'aide. Raccorder les deux
langues, la persistance et la validation des transitions de quête.

Les systèmes de parent, journaux, objets et services fournissent leurs états
et actions autorisées à cette interface commune, sans dupliquer leur logique.
Aucune fenêtre ne recalcule seule la prochaine destination ou les gains.
Les anciens panneaux de gestion sont intégrés ou remplacés, pas conservés
comme un deuxième ensemble de commandes. La lecture d'un journal et le carnet
personnel restent des vues de lecture, non des gestionnaires de quêtes concurrents.
Les offres de ce document ne sont pas une extension implicite des mini-jeux
existants de livraison ou de travail : leur intégration doit être explicite.

### 7.8. Demander son chemin vers toutes les destinations connues

Dans Dialogue, la commande **« Demander son chemin »** présente une liste
qui reprend les localités déjà citées et ajoute **toutes les destinations connues
des quêtes acceptées**, pas seulement celle de la quête suivie :

- parent : lieux et pistes déjà découverts, jamais les étapes futures cachées ;
- services : POI des étapes annoncées, y compris à venir, avec leur ordre ;
- journaux perdus : lieux de signalement ou de remise effectivement connus ;
- objets magiques : lieux révélés par une preuve acquise, avec sa précision.

Une offre non acceptée n'ajoute pas ses destinations à la liste commune.
Une cible de quête close quitte la liste active, mais un lieu déjà cité reste
consultable selon les règles existantes d'historique géographique.

Chaque option indique **localité — POI ou piste connue — quête — état d'étape**.
Deux POI d'une même ville restent distinguables. Une même destination peut
regrouper plusieurs références de quête sans doublonner le lieu ; deux lieux
homonymes ne sont jamais fusionnés sans identité géographique commune.
Les étapes futures déjà annoncées sont sélectionnables pour demander la route,
sans que cela permette d'en accomplir l'action avant ses prérequis.

Après sélection, la demande utilise la position réelle et les coûts, conditions
de présence d'un interlocuteur et chances d'aide existants, annoncés avant action.
Elle oriente vers le lieu sélectionné, sans valider la quête, transporter le
joueur ou promettre une réponse précise. Un interlocuteur peut ne pas savoir.
La liste reste consultable gratuitement ; obtenir une nouvelle indication suit
les règles de l'action d'orientation.

Une piste partielle reste partielle : « vers le nord » ou une région connue
peut figurer comme telle, mais ne fournit ni nom caché ni coordonnées exactes.
Un ancien signalement de journal ou d'objet reste daté et incertain ; demander
son chemin ne révèle pas sa position actuelle ni celle de son porteur.
Si aucune cible localisable n'est connue, l'expliquer sans inventer une destination.

Le moteur compose la liste à partir des preuves et objectifs autorisés des
quatre fils. Le LLM peut formuler la réponse avec ces seuls faits ; il ne
sélectionne pas une cible secrète et n'augmente pas la précision autorisée.
Le résultat précise toujours la destination demandée et est enregistré parmi
les indices correspondants dans Quêtes, pour éviter de prendre une indication
vers une église pour une nouvelle piste du parent. Lire ensuite cet indice
ne nécessite pas de rouvrir Dialogue ou de payer une seconde demande.

## 8. Critères de validation

- Les 22 cartes possèdent deux canevas concrets ; chacun exige un déplacement,
  une action à un POI identifié et une fin vérifiable.
- Le Pape permet le cierge dans une église lointaine ; la Roue permet le dossier
  d'héritage pour une personne empêchée ; l'Étoile permet la vérification d'emploi.
- Le même canevas s'instancie depuis plusieurs régions, dont un village sans
  les services requis et un départ proche d'une frontière.
- Les offres lointaines ne se limitent pas aux cellules déjà chargées.
  Île inaccessible, données manquantes et faux type de POI ne produisent pas d'offre.
- Deux églises ou postes homonymes ne valident pas la même étape ; un POI inspecté
  à distance ou visité avant l'acceptation ne suffit pas.
- À étapes égales, augmenter la distance augmente le gain ; parcourir un détour
  après acceptation ne l'augmente pas. Changer de langue ne change rien au contrat.
- Sauvegarder au milieu d'une quête conserve étapes, documents, textes et gain.
  Répéter une action, reprendre après interruption ou rejouer un reçu ne paie pas deux fois.
- Après clôture, une autre instance reste possible sans recycler automatiquement
  la même personne ou cumuler des duplicatas de la même mission.
- Les erreurs du LLM, les indisponibilités réseau et un texte contradictoire
  laissent accessibles le contrat clair et la version d'auteur.
- Un POI supprimé a une issue explicite ; aucune substitution silencieuse,
  aucun nouvel objectif inventé par le modèle, aucune cache magique déplacée.
- Les interactions avec les gens se trouvent dans Dialogue ; les objectifs,
  indices et commandes de suivi dans Quêtes. Carnet, carte et actions de cellule
  ne dupliquent pas ces commandes ; aucun panneau spécialisé ne subsiste.
- Le bloc de commandes du détail reste au même endroit avant et après arrivée
  au POI ; un refus d'offre n'abandonne pas une autre quête.
- Parent, services, journaux perdus et objets magiques se consultent dans Quêtes ;
  leurs échanges passent tous par Dialogue. Les anciens raccourcis spécialisés,
  boutons masqués et entrées d'aide sont supprimés, sans alias ni redirection.
- La liste d'orientation contient les destinations connues de plusieurs quêtes
  simultanées, dont les étapes annoncées à venir, même si elles ne sont pas suivies.
  Elle distingue les POI homonymes et n'expose ni étape secrète du parent,
  ni cache inconnue, ni position privée ou actuelle déduite d'un vieux signalement.
- Demander son chemin vers une étape future ne la valide pas et ne la débloque
  pas ; changer de cible ne modifie ni contrat, ni preuve, ni quête suivie.
- Suivre, ne plus suivre, consulter la carte ou fermer une fenêtre n'accomplit
  rien ; l'action locale exige le bon POI et les prérequis de l'étape.
- La navigation reste utilisable au clavier et sur mobile, sans collision de
  raccourcis, piège de focus, rangée de commandes dupliquées ou masquage du parent.
- Après une action interrompue ou un échec de sauvegarde, l'interface ne montre
  ni succès fictif ni paiement dupliqué ; le carnet et son PDF restent cohérents.

Ces critères décrivent le futur système. Cette révision ne crée ni moteur de
quêtes, ni service de POI lointains, ni économie ou interface supplémentaires.
