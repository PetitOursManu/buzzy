# 🐝 Buzzy

![Aperçu de Buzzy — page Découverte d'événements](docs/buzzy.png)

**Buzzy** est une application web *self-hosted* qui vous aide à :

1. **Découvrir des événements** mondiaux, nationaux, régionaux et locaux, classés par thème, générés par une IA que vous connectez dans les paramètres.
2. **Générer un calendrier éditorial** de publications (titre + description + hashtags) prêtes à être adaptées pour **Facebook, Instagram, LinkedIn, X et TikTok**, à partir de ces événements et de votre profil.

Optionnellement, Buzzy peut se brancher à des **serveurs MCP de recherche web** pour fiabiliser les sources des événements générés.

Conçue pour être déployée aux côtés d'autres applications self-hosted (Docker Compose / Coolify), Buzzy est totalement autonome.

---

## ✨ Fonctionnalités

- **Découverte d'événements** : filtres combinables (**portées multiples**, **plusieurs localisations**, thèmes multi-sélection avec **jusqu'à 2 thèmes prioritaires**, cible temporelle par mois / date / période), génération IA, grille de cartes *glassmorphism*, bouton « Afficher plus », présélection pour le calendrier, historique persistant. Les filtres sont **conservés d'une page à l'autre**.
- **Mode planification** : optionnel — l'IA propose d'abord un plan d'approche que l'utilisateur **valide** avant la génération réelle, pour de meilleures réponses.
- **Descriptions par réseau** : choisissez vos **réseaux sociaux préférés** dans le profil ; pour chaque événement découvert, une description prête à publier est générée **par réseau**, en respectant le ton et la longueur de chacun (onglets + copie directe sur la carte).
- **Calendrier éditorial** : répartition automatique des publications sur une plage de dates selon une fréquence (X/jour, X/semaine, X/mois), génération d'un post par date et par réseau avec ton adapté à chaque plateforme, vues **Mois / Semaine / Liste**, édition et régénération individuelle, export **JSON** et **CSV**.
- **Paramètres** : configuration du fournisseur IA (compatible OpenAI), **mode de réflexion** (reasoning effort, si le modèle le supporte), profil & attentes, thème clair/sombre/système, serveurs de recherche web MCP, **changement de mot de passe**.
- **Sécurité** : compte admin unique, JWT en cookie httpOnly, mot de passe hashé en **argon2id**, clé API IA chiffrée en base (**AES-256-GCM**), validation **zod** sur toutes les routes, *rate limiting* sur les générations IA.
- **Design** : glassmorphism poussé en clair et sombre, dégradés animés (blobs), animations Framer Motion, squelettes *shimmer*, notifications toast, interface responsive **entièrement en français**.

---

## 🧱 Stack technique

| Couche | Technologies |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Framer Motion, TanStack Query, React Router |
| Backend | Node.js 20, Express, TypeScript |
| Base de données | PostgreSQL 16, Prisma ORM |
| Auth | JWT (cookie httpOnly), argon2id |
| Validation | zod |
| Recherche web | SDK MCP officiel (`@modelcontextprotocol/sdk`), tool calling compatible OpenAI |
| Conteneurisation | Docker multi-stage + docker-compose |

Le projet est un **monorepo npm workspaces** :

```
buzzy/
├── apps/
│   ├── frontend/          # React + Vite + TS + Tailwind
│   └── backend/           # Express + TS + Prisma
├── Dockerfile             # multi-stage (front + back → image Node)
├── docker-compose.yml     # services app + db (+ bloc MCP SearXNG optionnel)
├── docker-entrypoint.sh   # migrations Prisma puis démarrage
├── .env.example
└── README.md
```

---

## 🚀 Déploiement Docker (recommandé)

Prérequis : Docker + Docker Compose.

```bash
cp .env.example .env
# Éditez .env : changez au minimum JWT_SECRET, ENCRYPTION_KEY, ADMIN_PASSWORD
docker compose up -d --build
```

L'application est disponible sur **http://localhost:3000**.

Au premier démarrage :
- l'entrypoint attend PostgreSQL, applique la migration initiale (`prisma migrate deploy`) ;
- le backend crée automatiquement le compte administrateur à partir de `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

Connectez-vous avec ces identifiants, puis configurez votre fournisseur IA dans **Paramètres → Modèle IA**.

### Déploiement Coolify / Traefik

Le `docker-compose.yml` contient un bloc de **labels Traefik commentés** (service `app`). Décommentez-les et adaptez le domaine (`Host(...)`) au moment du déploiement — rien n'est codé en dur.

---

## 🛠️ Installation en local (développement)

Prérequis : Node.js ≥ 20, une base PostgreSQL accessible.

```bash
# 1. Dépendances (monorepo)
npm install

# 2. Variables d'environnement
cp .env.example .env
#    Adaptez DATABASE_URL vers votre Postgres local, par ex. :
#    DATABASE_URL=postgresql://buzzy:buzzy@localhost:5432/buzzy

# 3. Client Prisma + migration de la base
npm run prisma:generate -w apps/backend
npm run prisma:migrate:dev -w apps/backend   # applique/crée la migration
npm run seed -w apps/backend                 # crée le compte admin

# 4. Lancement front + back en parallèle
npm run dev
```

- Backend : http://localhost:3000 (API sous `/api`)
- Frontend (Vite) : http://localhost:5173 (proxy `/api` → backend)

> En développement, `npm run dev` lance les deux serveurs via `concurrently`. Vous pouvez aussi les lancer séparément : `npm run dev -w apps/backend` et `npm run dev -w apps/frontend`.

---

## 🔐 Variables d'environnement

| Variable | Description | Exemple |
|---|---|---|
| `DATABASE_URL` | URL de connexion PostgreSQL | `postgresql://buzzy:buzzy@db:5432/buzzy` |
| `JWT_SECRET` | Secret de signature des JWT (à changer) | chaîne aléatoire longue |
| `ENCRYPTION_KEY` | Clé de chiffrement AES-256-GCM des secrets (clé API IA, auth MCP). 32 octets : 32 caractères, ou hex 64, ou base64 | `openssl rand -hex 32` |
| `ADMIN_EMAIL` | Email du compte admin créé au 1er démarrage | `admin@example.com` |
| `ADMIN_PASSWORD` | Mot de passe admin (hashé en argon2id) | `change-me` |
| `PORT` | Port d'écoute du serveur | `3000` |
| `NODE_ENV` | Environnement | `production` |
| `CORS_ORIGIN` | (Optionnel) origine(s) autorisée(s) en dev | `http://localhost:5173` |

> ⚠️ La clé API du fournisseur IA n'est **jamais** renvoyée en clair au frontend ni loguée. Seuls un indicateur « clé configurée » et les 4 derniers caractères sont exposés. Si vous changez `ENCRYPTION_KEY` après avoir enregistré des secrets, ceux-ci deviennent indéchiffrables et doivent être ressaisis.

---

## 🌐 Vue d'ensemble des routes API

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/auth/login` | Connexion, pose le cookie JWT httpOnly |
| POST | `/api/auth/logout` | Déconnexion |
| GET | `/api/auth/me` | Utilisateur courant |
| GET | `/api/settings/ai-provider` | Config IA (sans la clé en clair) |
| PUT | `/api/settings/ai-provider` | Enregistre fournisseur, URL, clé (chiffrée), modèle |
| POST | `/api/settings/ai-provider/list-models` | Teste la connexion et liste les modèles |
| GET | `/api/settings/profile` | Récupère le profil utilisateur |
| PUT | `/api/settings/profile` | Met à jour le profil utilisateur |
| GET | `/api/settings/mcp-servers` | Liste les serveurs MCP |
| POST | `/api/settings/mcp-servers` | Ajoute un serveur MCP |
| PUT | `/api/settings/mcp-servers/:id` | Modifie / active / désactive un serveur MCP |
| DELETE | `/api/settings/mcp-servers/:id` | Supprime un serveur MCP |
| POST | `/api/settings/mcp-servers/:id/test` | Teste la connexion à un serveur MCP |
| POST | `/api/events/plan` | Mode planification : renvoie un plan à valider |
| POST | `/api/events/generate` | Génère de nouveaux événements via l'IA |
| PUT | `/api/settings/password` | Change le mot de passe de l'admin |
| GET | `/api/events` | Liste les événements persistés (filtrable) |
| POST | `/api/calendar/generate` | Génère un calendrier éditorial complet |
| GET | `/api/calendar` | Liste les calendriers générés |
| GET | `/api/calendar/:postPlanId` | Récupère un calendrier |
| GET | `/api/calendar/:postPlanId/export` | Export `?format=json\|csv` |
| PUT | `/api/posts/:id` | Édition manuelle d'une publication |
| POST | `/api/posts/:id/regenerate` | Régénère une publication individuelle |

Toutes les routes (hors `login`/`logout`/`health`) exigent le cookie JWT.

---

## 🔎 Fiabilité des sources

> **Important.** Sans recherche web MCP activée, Buzzy dépend entièrement des connaissances du modèle IA configuré. Le modèle peut se tromper de dates ou proposer des liens approximatifs : les événements sont alors marqués **« Sources à vérifier »** et **doivent être vérifiés manuellement**.
>
> Avec la recherche web MCP activée, les sources proviennent de **résultats de recherche réels** et les événements sont marqués **« Sources vérifiées »** — mais leur qualité dépend du serveur MCP choisi.

---

## 🌐 Recherche web MCP (optionnelle)

Buzzy peut brancher un ou plusieurs **serveurs MCP (Model Context Protocol)** de recherche web pour améliorer la fiabilité des sources. La fonctionnalité est **désactivée par défaut**.

### Comment l'activer

1. Ouvrez **Paramètres → Recherche Web (MCP)**.
2. Ajoutez un serveur : cliquez sur un **préréglage** (pré-remplit nom + URL) puis renseignez votre clé API si nécessaire, ou saisissez un **serveur personnalisé** (nom + URL + auth optionnelle).
3. Cliquez sur **Tester** pour vérifier la connexion et lister les outils exposés.
4. Cochez **Actif** sur le(s) serveur(s) à utiliser.

Dès qu'au moins un serveur est actif, la génération d'événements transmet les outils de recherche au modèle IA sous forme de *function calling* (compatible OpenAI). Le modèle peut alors effectuer une ou plusieurs recherches avant de rédiger sa réponse.

> Cette fonctionnalité nécessite un modèle IA **compatible tool calling**. Si le modèle ne le supporte pas, Buzzy revient automatiquement à une génération sans recherche web et l'indique clairement dans l'interface.
>
> Pour rester simple et sûr en environnement conteneurisé, Buzzy ne se connecte qu'à des serveurs MCP exposés en **HTTP/SSE** (distants ou conteneurs voisins sur le même réseau Docker). Aucun serveur MCP local n'est lancé en sous-processus (pas de stdio).

### Serveurs MCP pré-intégrés

| Serveur MCP | Coût | Clé API requise | Point fort |
|---|---|---|---|
| **SearXNG** (auto-hébergé) | 100% gratuit | Non | Aucune dépendance externe, confidentialité totale, à héberger soi-même (bloc docker-compose fourni) |
| **Brave Search MCP** | Gratuit avec limite, puis payant | Oui | Simple, bon pour la recherche web/actualités générale |
| **Tavily MCP** | Gratuit jusqu'à 1000 crédits/mois, puis payant | Oui | Résultats structurés optimisés pour les IA, bon rapport qualité/simplicité |
| **Bright Data MCP** | Gratuit jusqu'à 5000 requêtes/mois, puis payant | Oui | Le plus robuste (contourne les blocages), utile pour des événements locaux peu indexés |

Vous pouvez également ajouter **n'importe quel serveur MCP personnalisé** — la liste n'est pas fermée.

### Recherche web 100% gratuite et auto-hébergée (SearXNG)

Buzzy est livré avec un fichier **`docker-compose.override.yml`** (chargé **automatiquement** par `docker compose up`) qui déploie deux services à côté de l'app :

- **`searxng`** — moteur de recherche (format JSON activé via [`searxng/settings.yml`](searxng/settings.yml)) ;
- **`searxng-mcp`** — wrapper qui expose SearXNG en **MCP Streamable HTTP** (`/mcp`) via [`searxng-mcp/Dockerfile`](searxng-mcp/Dockerfile) (mcp-searxng + supergateway).

```bash
docker compose up -d --build
```

Au démarrage, l'app lit la variable `SEARXNG_MCP_URL` et **pré-enregistre automatiquement** le serveur MCP `http://searxng-mcp:8000/mcp` (désactivé). Il suffit alors d'aller dans **Paramètres → Recherche Web (MCP)** et de le cocher **Actif** — aucune clé API, aucune configuration manuelle.

> **Pour désactiver** cette recherche web auto-hébergée : renommez ou supprimez `docker-compose.override.yml` (par ex. `docker-compose.override.yml.disabled`).
>
> **Note d'architecture** : une application web ne peut pas provisionner d'infrastructure. Buzzy ne *démarre* pas de serveur MCP depuis un clic dans l'UI (cela exigerait l'accès au démon Docker de l'hôte, un risque de sécurité, et est interdit par conception). L'approche retenue — déploiement via Compose + pré-enregistrement automatique — offre l'expérience la plus proche de « ça marche en un clic » sans compromettre la sécurité.

Le `docker-compose.yml` conserve par ailleurs un **bloc commenté** documentant la même intégration, pour référence.

---

## 🧭 Pistes d'évolution

- **Nouveaux préréglages MCP** : ajouter d'autres fournisseurs de recherche web pré-configurés.
- **Publication automatique** : connexion directe à un outil de programmation de posts (ex. **Postiz**) pour planifier automatiquement les publications générées, avec passage du statut `DRAFT → APPROVED → PUBLISHED`.
- **Multi-utilisateurs & rôles**, gestion d'équipes.
- **Génération d'images** d'illustration par IA pour chaque publication.
- **Analytics** de performance des publications par réseau.

---

## 📝 Notes techniques & choix d'implémentation

- **Client IA agnostique** : Buzzy appelle directement l'API `/chat/completions` et `/models` compatible OpenAI (sans SDK propriétaire) pour tolérer OpenRouter, Ollama Cloud, OpenAI, etc. Le parsing JSON des réponses est tolérant (extraction de l'objet JSON même si le modèle ajoute du texte).
- **Migrations** : la migration initiale est fournie dans `apps/backend/prisma/migrations`. En Docker, `docker-entrypoint.sh` exécute `prisma migrate deploy` avec ré-essais tant que la base n'est pas prête.
- **Garde-fous génération** : la génération de calendrier est plafonnée (nb total de publications) pour maîtriser le coût/temps ; un post dont la génération échoue est persisté en brouillon avec un message, et peut être régénéré individuellement.
- **Servi en une seule image** : en production, Express sert l'API sous `/api` et le frontend buildé (fallback SPA) sur le port `3000`.

---

Buzzy 🐝 — *Fait bourdonner votre communication.*
