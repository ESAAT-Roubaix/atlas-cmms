# Atlas CMMS – ESAAT

Déploiement de la GMAO [Atlas CMMS](https://github.com/Grashjs/cmms) pour les agents techniques de l'ESAAT (Roubaix) :
suivi des demandes d'intervention, bons de travail, équipements et maintenance préventive.

Pour l'informatique, les demandes restent à adresser à dsi@esaat-roubaix.com.

## Ce qui change par rapport à Atlas d'origine

| Élément | Détail | Où |
|---|---|---|
| Formulaire public de demande | `/demande` : demande sans compte, transmise à Atlas via un compte de service. QR code par salle avec `?lieu=B204` | `demande/` |
| Pièces jointes débloquées | Le backend est recompilé avec un correctif : `LOCAL_ENTITLEMENTS` active des options sans clé de licence | `atlas-api/` |
| Charte ESAAT | Logo, favicons, icône mobile, couleurs, mention « Powered by Intelloop » retirée | `branding/`, `.env` |
| Point d'entrée unique | nginx : `/` frontend, `/api/` backend, `/storage/` fichiers, `/demande` formulaire | `nginx.conf` |
| HTTPS optionnel | Caddy avec certificat Let's Encrypt automatique | `docker-compose.https.yml` |

## Versions

| Composant | Version |
|---|---|
| Backend | Atlas, commit [`6af6ea1d53`](https://github.com/Grashjs/cmms/commit/6af6ea1d53) (30/09/2026, après v1.9.0) + correctif ESAAT |
| Frontend | `intelloop/atlas-cmms-frontend:v1.9.0` |
| PostgreSQL | `postgres:16-alpine` |
| Stockage S3 | `pgsty/silo:RELEASE.2026-09-16T00-00-00Z` (MinIO) |
| Proxy | `nginx:1.27-alpine`, `caddy:2.10-alpine` (HTTPS) |
| Formulaire | `node:22-alpine`, sans dépendances |

Aucune migration de base n'a été ajoutée entre la v1.9.0 et le commit utilisé : backend et frontend v1.9.0 sont compatibles.

## Déploiement

Prérequis : un serveur Linux avec Docker et Docker Compose v2.24+.

```bash
git clone https://github.com/ESAAT-Roubaix/atlas-cmms.git
cd atlas-cmms
./setup.sh https://maintenance.esaat-roubaix.com   # crée .env avec des secrets aléatoires
```

Vérifier `.env`, notamment `ALLOWED_ORGANIZATION_ADMINS` : seule cette adresse pourra créer l'organisation.

**Sans HTTPS** (test ou réseau interne, port 3000) :

```bash
docker compose up -d --build
```

**Avec HTTPS** (le DNS de `DOMAIN` doit pointer vers le serveur, ports 80 et 443 ouverts) :

```bash
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
```

La première compilation du backend prend quelques minutes. Suivre le démarrage avec `docker compose logs -f api`.

### Après le premier démarrage

1. Ouvrir l'URL publique et s'inscrire avec l'adresse de `ALLOWED_ORGANIZATION_ADMINS` : ce compte crée l'organisation et en est l'administrateur.
2. Créer les emplacements (bâtiments, salles) : ils apparaissent dans la liste du formulaire `/demande`.
3. Créer le compte de service du formulaire (`DEMANDE_EMAIL`) avec un rôle limité à la création de demandes, puis renseigner `DEMANDE_PASSWORD` dans `.env` et lancer `docker compose up -d demande`.

### Application mobile

L'application officielle Atlas CMMS (Android et iOS) fonctionne avec ce serveur : sur l'écran de connexion, choisir « serveur personnalisé » et saisir `https://<domaine>/api`. HTTPS est nécessaire.

## Exploitation

**Sauvegarde** (base et fichiers) :

```bash
docker compose exec -T postgres pg_dump -U atlas -Fc atlas > atlas-$(date +%F).dump
docker run --rm -v atlas-cmms_minio_data:/data -v "$PWD":/backup alpine tar czf /backup/fichiers-$(date +%F).tgz -C /data .
```

**Restauration de la base** :

```bash
docker compose exec -T postgres pg_restore -U atlas -d atlas --clean < atlas-AAAA-MM-JJ.dump
```

**Mise à jour d'Atlas** : changer ensemble `ATLAS_COMMIT` dans `atlas-api/Dockerfile` et le tag du frontend dans `docker-compose.yml` (même version), vérifier que `atlas-api/local-entitlements.patch` s'applique toujours, sauvegarder, puis `docker compose up -d --build`.

**Changer le logo** : `branding/generer-logos.py` régénère les images à partir du logo source (voir le script).

## Licence

Atlas CMMS est distribué sous double licence : AGPLv3 ou licence commerciale d'Intelloop. Ce déploiement utilise **l'AGPLv3**,
qui autorise à modifier le logiciel à condition de mettre le code source modifié à disposition des utilisateurs du service :
c'est le rôle de ce dépôt public. L'ensemble est distribué sous [AGPLv3](LICENSE).

Le correctif de `atlas-api/` ne contourne aucune licence commerciale : aucune n'a été souscrite. Pour bénéficier du support
d'Intelloop ou de la licence commerciale, voir [atlas-cmms.com](https://atlas-cmms.com).
