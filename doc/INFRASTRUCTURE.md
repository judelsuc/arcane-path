# Infrastructure OVHcloud - rapport du 17 octobre 2026

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
| Domaine arcane-path.eu | Non reserve ; disponibilite non verifiee | Tarif non confirme |
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
  Aucun acces HTTP/HTTPS public. Le groupe OVH default n'a pas ete modifie.
- Cle privee locale `~/.ssh/arcane-path-ovh`, permissions 600, hors Git.
- Ubuntu 24.04 ; cloud-init termine et service systemd non privilegie prepare.
  Les fichiers du prototype sont transferes ; service `arcane-path` actif.
- SSH effectif verifie : mots de passe et connexion root desactives,
  seul utilisateur ubuntu autorise, tunnel local vers 127.0.0.1:8766 uniquement.
- Cache persistant prevu dans `/var/lib/arcane-path/cache` ; ce n'est pas une
  sauvegarde et la suppression de l'instance pourrait le perdre.

Le serveur de prototype reste lie a 127.0.0.1. L'acces prevu est un tunnel SSH ;
aucune URL publique n'est annoncee. Le filtrage depend du systeme invite :
cloud-init ne garantit pas un pare-feu des le premier instant du demarrage.
Une publication Internet demandera notamment HTTPS, controle d'acces,
limitation des requetes et verification des fichiers exposes.

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
- Aucune verification visuelle complete du gameplay distant n'est revendiquee.
- Le transfert contient les fichiers runtime suivis du checkpoint `d4405db` ;
  l'infrastructure est ajoutee au checkpoint suivant. Aucun secret transfere.

La premiere connexion SSH utilise l'acceptation de la nouvelle cle d'hote
(TOFU), puis les connexions suivantes exigent la cle locale connue.
Le tunnel de test a ete ferme ; la VM et le service restent actifs.

Validation locale du checkpoint : 162 tests JavaScript, 92 tests Python et
5 plans Terraform simules passes. L'ajout d'un workflow GitHub Actions a ete
refuse par GitHub (scope OAuth `workflow` absent) ; il a ete retire de la
publication. Aucune CI distante n'est donc revendiquee.

## Reprise

1. Renouveler le jeton si necessaire : expiration relevee au 18 octobre 2026
   a 13 h 02 heure de Paris. Ne jamais l'inclure dans Git ou le chat.
2. Regenerer un plan Terraform ; ne pas reutiliser l'ancien plan.
3. Verifier que le plan ne remplace ni ne detruit aucune ressource existante.
4. Utiliser le tunnel documente dans README pour acceder au prototype.
5. Configurer une sauvegarde avec restauration testee avant publication.
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

Les couches de jeu suivantes ne sont pas declarees deployees ou terminees.
Leur implementation doit reprendre a partir du document de conception apres
verification de ce premier serveur, avec checkpoints frequents.
