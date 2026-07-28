#!/bin/sh
set -e

echo "🐝 Buzzy — démarrage"

cd /app/apps/backend

# Diagnostic : affiche la cible de connexion SANS révéler le mot de passe.
SAFE_DB_URL=$(printf '%s' "${DATABASE_URL:-<non défini>}" | sed -E 's#(://[^:]*:)[^@]*@#\1****@#')
echo "→ Base de données : $SAFE_DB_URL"

if [ -z "$DATABASE_URL" ]; then
  echo "✗ DATABASE_URL n'est pas défini. Renseignez-le dans les variables d'environnement."
  exit 1
fi

echo "→ Application des migrations Prisma…"
ATTEMPTS=0
MAX_ATTEMPTS=20
until npx prisma migrate deploy 2>/tmp/migrate.err; do
  ATTEMPTS=$((ATTEMPTS + 1))
  LAST_ERR=$(tail -n 20 /tmp/migrate.err)

  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo ""
    echo "✗ Impossible d'appliquer les migrations après ${MAX_ATTEMPTS} tentatives."
    echo "  Dernière erreur :"
    echo "$LAST_ERR" | sed 's/^/    /'
    echo ""
    echo "  Causes fréquentes :"
    echo "    • Mot de passe incohérent : POSTGRES_PASSWORD doit correspondre à"
    echo "      celui présent dans DATABASE_URL (ne définir que POSTGRES_PASSWORD"
    echo "      suffit : DATABASE_URL en découle automatiquement)."
    echo "    • Volume Postgres préexistant conservant un ANCIEN mot de passe :"
    echo "      changer POSTGRES_PASSWORD ne modifie pas une base déjà initialisée."
    echo "    • Service 'db' indisponible ou nom d'hôte différent de 'db'."
    exit 1
  fi

  # Erreur d'authentification : inutile d'insister, la base répond déjà.
  if echo "$LAST_ERR" | grep -qiE 'authentication failed|password'; then
    echo ""
    echo "✗ Authentification PostgreSQL refusée — inutile de réessayer."
    echo "$LAST_ERR" | sed 's/^/    /'
    echo ""
    echo "  → POSTGRES_PASSWORD et DATABASE_URL ne concordent pas, OU le volume"
    echo "    Postgres a été initialisé avec un autre mot de passe."
    exit 1
  fi

  echo "  Base non prête, nouvelle tentative dans 3s… ($ATTEMPTS/$MAX_ATTEMPTS)"
  sleep 3
done

echo "→ Lancement du serveur Buzzy"
exec node dist/index.js
