# ─────────────────────────────────────────────────────────────────
# Buzzy — Dockerfile multi-stage
# 1. build-frontend : build Vite → dist
# 2. build-backend  : compilation TypeScript + génération Prisma
# 3. final          : image Node légère servant API + statique
# ─────────────────────────────────────────────────────────────────

# ─── Stage commun d'installation des dépendances ────────────────
FROM node:20-alpine AS deps
# openssl : requis par Prisma ; build-base/python3 : requis pour argon2 (natif)
RUN apk add --no-cache openssl python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN npm install

# ─── Stage 1 : build du frontend ────────────────────────────────
FROM deps AS build-frontend
WORKDIR /app
COPY apps/frontend apps/frontend
RUN npm run build -w apps/frontend

# ─── Stage 2 : build du backend + Prisma ────────────────────────
FROM deps AS build-backend
WORKDIR /app
COPY apps/backend apps/backend
RUN npm run prisma:generate -w apps/backend
RUN npm run build -w apps/backend

# ─── Stage 3 : image finale de production ───────────────────────
FROM node:20-alpine AS final
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

# Dépendances (inclut la CLI Prisma pour `migrate deploy` au démarrage)
COPY --from=build-backend /app/node_modules ./node_modules
COPY --from=build-backend /app/package.json ./package.json

# Backend compilé + Prisma
COPY --from=build-backend /app/apps/backend/dist ./apps/backend/dist
COPY --from=build-backend /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=build-backend /app/apps/backend/package.json ./apps/backend/package.json

# Frontend buildé, servi en statique par Express (résolu en ../public depuis dist)
COPY --from=build-frontend /app/apps/frontend/dist ./apps/backend/public

# Script de démarrage : applique les migrations puis lance le serveur
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
WORKDIR /app/apps/backend
ENTRYPOINT ["docker-entrypoint.sh"]
