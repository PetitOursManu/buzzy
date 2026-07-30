#!/usr/bin/env node
/**
 * Installation en une commande : `npm run setup`.
 *
 * Prépare un environnement de développement complet sans qu'aucune étape ne
 * reste à deviner : fichier .env avec de vrais secrets, client Prisma, schéma
 * de base appliqué, compte administrateur créé.
 *
 * Le script est idempotent : relancé, il ne réécrit jamais un .env existant et
 * se contente de remettre la base à niveau.
 */

import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env');
const ENV_EXAMPLE_PATH = join(ROOT, '.env.example');

// Couleurs désactivées hors terminal (CI, redirection vers un fichier).
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (COLOR ? `\x1b[${code}m` : '');
const c = {
  reset: paint(0),
  bold: paint(1),
  dim: paint(2),
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  cyan: paint(36),
};

const step = (msg) => console.log(`\n${c.cyan}${c.bold}→ ${msg}${c.reset}`);
const ok = (msg) => console.log(`  ${c.green}✓${c.reset} ${msg}`);
const warn = (msg) => console.log(`  ${c.yellow}!${c.reset} ${msg}`);
const fail = (msg) => console.log(`  ${c.red}✗${c.reset} ${msg}`);

/** Mot de passe lisible : pas d'ambiguïté 0/O, l/1. */
function readablePassword(length = 20) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function run(command, { quiet = false } = {}) {
  execSync(command, { cwd: ROOT, stdio: quiet ? 'pipe' : 'inherit', env: process.env });
}

function tryRun(command) {
  try {
    execSync(command, { cwd: ROOT, stdio: 'pipe', env: process.env });
    return { ok: true, output: '' };
  } catch (e) {
    const output = [e.stdout?.toString() ?? '', e.stderr?.toString() ?? ''].join('\n').trim();
    return { ok: false, output };
  }
}

/* ─── 1. Version de Node ─────────────────────────────────────────── */

step('Vérification de Node.js');
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  fail(`Node.js ${process.versions.node} détecté — Buzzy exige Node.js 20 ou plus récent.`);
  process.exit(1);
}
ok(`Node.js ${process.versions.node}`);

/* ─── 2. Fichier .env ────────────────────────────────────────────── */

step('Fichier .env');
let generatedPassword = null;

if (existsSync(ENV_PATH)) {
  ok('.env déjà présent — laissé intact.');
} else {
  if (!existsSync(ENV_EXAMPLE_PATH)) {
    fail('.env.example introuvable : impossible de générer le .env.');
    process.exit(1);
  }
  generatedPassword = readablePassword();
  const content = readFileSync(ENV_EXAMPLE_PATH, 'utf8')
    .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${randomBytes(48).toString('hex')}`)
    .replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`)
    .replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${generatedPassword}`)
    // En développement local, Postgres tourne sur la machine, pas dans le
    // réseau Docker : l'hôte « db » n'existe pas.
    .replace(/^DATABASE_URL=.*$/m, 'DATABASE_URL=postgresql://buzzy:buzzy@localhost:5432/buzzy')
    .replace(/^NODE_ENV=.*$/m, 'NODE_ENV=development')
    .replace(/^# CORS_ORIGIN=/m, 'CORS_ORIGIN=');
  writeFileSync(ENV_PATH, content, 'utf8');
  ok('.env créé avec des secrets générés aléatoirement.');
}

/* ─── 3. Client Prisma ───────────────────────────────────────────── */

step('Génération du client Prisma');
run('npx prisma generate --schema apps/backend/prisma/schema.prisma', { quiet: true });
ok('Client Prisma généré.');

/* ─── 4. Base de données ─────────────────────────────────────────── */

step('Application du schéma de base de données');
const migrate = tryRun('npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma');

if (!migrate.ok) {
  fail("La base de données n'a pas pu être atteinte.");
  console.log(`${c.dim}${migrate.output.split('\n').slice(-8).join('\n')}${c.reset}`);
  console.log(`
${c.yellow}${c.bold}Buzzy a besoin d'un PostgreSQL accessible.${c.reset}

  ${c.bold}Option 1 — tout en Docker (le plus simple) :${c.reset}
    docker compose up -d --build
    ${c.dim}Rien d'autre à faire : migrations et compte admin sont automatiques.${c.reset}

  ${c.bold}Option 2 — Postgres seul, en Docker, pour développer hors conteneur :${c.reset}
    docker run -d --name buzzy-db -p 5432:5432 \\
      -e POSTGRES_USER=buzzy -e POSTGRES_PASSWORD=buzzy -e POSTGRES_DB=buzzy \\
      postgres:16-alpine
    npm run setup   ${c.dim}# puis relancez cette commande${c.reset}

  ${c.bold}Option 3 — un Postgres existant :${c.reset}
    Ajustez DATABASE_URL dans .env, puis relancez ${c.bold}npm run setup${c.reset}.
`);
  process.exit(1);
}
ok('Schéma appliqué.');

/* ─── 5. Compte administrateur ───────────────────────────────────── */

step('Compte administrateur');
const seed = tryRun('npm run seed --workspace apps/backend');
if (!seed.ok) {
  warn("Le compte administrateur n'a pas pu être créé automatiquement.");
  console.log(`${c.dim}${seed.output.split('\n').slice(-6).join('\n')}${c.reset}`);
} else {
  ok('Compte administrateur prêt.');
}

/* ─── Récapitulatif ──────────────────────────────────────────────── */

const adminEmail =
  readFileSync(ENV_PATH, 'utf8').match(/^ADMIN_EMAIL=(.*)$/m)?.[1]?.trim() || 'admin@example.com';

console.log(`
${c.green}${c.bold}Installation terminée.${c.reset}

  Démarrer : ${c.bold}npm run dev${c.reset}
  Ouvrir   : ${c.bold}http://localhost:5173${c.reset}

  Identifiants : ${c.bold}${adminEmail}${c.reset}${
    generatedPassword
      ? ` / ${c.bold}${generatedPassword}${c.reset}\n  ${c.dim}(également dans .env, à changer depuis Paramètres → Compte)${c.reset}`
      : `\n  ${c.dim}(mot de passe défini dans votre .env existant)${c.reset}`
  }

  Dernière étape dans l'application : ${c.bold}Paramètres → Modèle IA${c.reset}
  pour connecter votre fournisseur (OpenAI, OpenRouter, Ollama…).
`);
