#!/bin/sh
set -e

echo "🐝 Buzzy — démarrage"

# Répertoire du backend (contient prisma/schema.prisma)
cd /app/apps/backend

# Applique les migrations Prisma (attend que la base soit prête).
echo "→ Application des migrations Prisma…"
ATTEMPTS=0
until npx prisma migrate deploy; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 20 ]; then
    echo "✗ Base de données injoignable après plusieurs tentatives. Abandon."
    exit 1
  fi
  echo "  Base non prête, nouvelle tentative dans 3s… ($ATTEMPTS/20)"
  sleep 3
done

echo "→ Lancement du serveur Buzzy"
exec node dist/index.js
