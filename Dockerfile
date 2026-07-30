# ─────────────────────────────────────────────────────────────────
# Buzzy — Dockerfile multi-stage
# 1. build-frontend : build Vite → dist
# 2. build-backend  : compilation TypeScript
# 3. prod-deps      : dépendances d'exécution seules (image légère)
# 4. final          : image Node légère servant API + statique
# ─────────────────────────────────────────────────────────────────

# ─── Stage commun d'installation des dépendances ────────────────
FROM node:20-alpine AS deps
# openssl : requis par Prisma ; build-base/python3 : requis pour argon2 (natif)
RUN apk add --no-cache openssl python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
# Le schéma Prisma doit précéder `npm install` : le postinstall de la racine
# génère le client, et échouerait sans lui.
COPY apps/backend/prisma apps/backend/prisma
RUN npm install

# ─── Stage 1 : build du frontend ────────────────────────────────
FROM deps AS build-frontend
WORKDIR /app
COPY apps/frontend apps/frontend
RUN npm run build -w apps/frontend

# ─── Stage 2 : build du backend ─────────────────────────────────
# Le client Prisma a déjà été généré par le postinstall du stage `deps`.
FROM deps AS build-backend
WORKDIR /app
COPY apps/backend apps/backend
RUN npm run build -w apps/backend

# ─── Stage 3 : dépendances d'exécution seules ───────────────────
# L'arbre complet des dépendances pèse ~267 Mo : TypeScript, Vite, React,
# Tailwind… Rien de tout cela ne sert à l'exécution — le frontend est déjà
# bundlé en JS statique. On réinstalle donc le seul workspace backend, sans
# devDependencies (~84 Mo), ce qui allège d'autant la plus grosse couche de
# l'image finale et son export.
# La CLI Prisma est déclarée en dépendance de production du backend : elle est
# nécessaire au `prisma migrate deploy` exécuté au démarrage du conteneur.
FROM node:20-alpine AS prod-deps
RUN apk add --no-cache openssl python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/
# Idem : le postinstall régénère le client Prisma dans CET arbre de modules.
COPY apps/backend/prisma apps/backend/prisma
RUN npm install --omit=dev --workspace apps/backend --include-workspace-root \
 && npm cache clean --force
# Filet de sécurité : un client Prisma manquant ne se verrait qu'au démarrage
# du conteneur. `generate` est idempotent, on le rejoue explicitement.
RUN npx prisma generate --schema apps/backend/prisma/schema.prisma

# ─── Stage 4 : image finale de production ───────────────────────
FROM node:20-alpine AS final
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

# Dépendances d'exécution (inclut la CLI Prisma pour `migrate deploy`)
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json

# Backend compilé + Prisma
COPY --from=build-backend /app/apps/backend/dist ./apps/backend/dist
COPY --from=build-backend /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=build-backend /app/apps/backend/package.json ./apps/backend/package.json

# Frontend buildé, servi en statique par Express (résolu en ../public depuis dist)
COPY --from=build-frontend /app/apps/frontend/dist ./apps/backend/public

# Script de démarrage : applique les migrations puis lance le serveur
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Empreinte du build : permet de vérifier qu'un redéploiement a bien pris.
# BUILD_SHA est facultatif ; l'horodatage, lui, est toujours renseigné.
ARG BUILD_SHA=""
ENV BUZZY_BUILD_SHA=$BUILD_SHA
# `ENV` ne peut pas recevoir le résultat d'un `RUN` : on passe par un fichier,
# lu au démarrage par lib/version.ts.
RUN date -u +%Y-%m-%dT%H:%M:%SZ > /app/.build-info

EXPOSE 3000
WORKDIR /app/apps/backend
ENTRYPOINT ["docker-entrypoint.sh"]
