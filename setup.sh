#!/bin/sh
# Crée .env à partir de .env.example avec des secrets aléatoires.
# Usage : ./setup.sh [URL publique]   ex. ./setup.sh https://maintenance.esaat-roubaix.com
set -eu
cd "$(dirname "$0")"

if [ -f .env ]; then
  echo ".env existe déjà, rien n'est modifié." >&2
  exit 1
fi

url="${1:-http://localhost:3000}"
url="${url%/}"
domain=""
case "$url" in https://*) domain="${url#https://}" ;; esac

secret() { openssl rand -hex 24; }

sed \
  -e "s|^PUBLIC_SERVER_URL=.*|PUBLIC_SERVER_URL=$url|" \
  -e "s|^POSTGRES_PWD=.*|POSTGRES_PWD=$(secret)|" \
  -e "s|^JWT_SECRET_KEY=.*|JWT_SECRET_KEY=$(openssl rand -base64 32)|" \
  -e "s|^MINIO_PASSWORD=.*|MINIO_PASSWORD=$(secret)|" \
  -e "s|^DOMAIN=.*|DOMAIN=$domain|" \
  .env.example > .env
chmod 600 .env

echo ".env créé pour $url"
echo "Reste à définir DEMANDE_PASSWORD après avoir créé le compte de service dans Atlas."
