/**
 * Chargement et validation des variables d'environnement.
 * Échoue rapidement au démarrage si une variable critique manque ou si un
 * secret de démonstration a été laissé en place en production.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/**
 * En développement, les variables viennent du fichier .env à la racine du
 * dépôt. En conteneur, elles sont déjà injectées par Docker : le fichier
 * n'existe pas et son absence n'a rien d'anormal.
 *
 * On remonte l'arborescence depuis ce module, ce qui fonctionne aussi bien
 * depuis `src/` (tsx) que depuis `dist/` (build compilé).
 */
function loadDotEnv(): void {
  let dir = __dirname;
  for (let depth = 0; depth < 6; depth++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) {
      // `override: false` : une variable déjà présente dans l'environnement
      // réel (Docker, CI, shell) l'emporte toujours sur le fichier.
      dotenv.config({ path: candidate, override: false });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

loadDotEnv();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Variable d'environnement manquante : ${name}.\n` +
        "  → En local : lancez `npm run setup` (crée un .env complet), ou copiez .env.example vers .env.\n" +
        '  → En Docker/Coolify : définissez la variable dans la configuration du service.',
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

function parsePort(raw: string): number {
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT invalide : « ${raw} ». Attendu : un entier entre 1 et 65535.`);
  }
  return port;
}

export const env = {
  DATABASE_URL: required('DATABASE_URL'),
  JWT_SECRET: required('JWT_SECRET'),
  ENCRYPTION_KEY: required('ENCRYPTION_KEY'),
  ADMIN_EMAIL: optional('ADMIN_EMAIL', 'admin@example.com'),
  ADMIN_PASSWORD: optional('ADMIN_PASSWORD', ''),
  PORT: parsePort(optional('PORT', '3000')),
  NODE_ENV: optional('NODE_ENV', 'production'),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '',
};

export const isProduction = env.NODE_ENV === 'production';

/**
 * Secrets livrés dans .env.example. Les laisser en production revient à
 * publier une application dont n'importe qui peut forger un jeton de session
 * et déchiffrer la clé API stockée : on refuse de démarrer.
 */
const PLACEHOLDER_SECRETS = new Set([
  'change-me',
  'change-me-32-bytes-long-secret!!',
  'changeme',
  'secret',
]);

function auditSecret(name: string, value: string, minLength: number): string | null {
  if (PLACEHOLDER_SECRETS.has(value.trim())) {
    return `${name} vaut encore la valeur d'exemple. Générez-en une : openssl rand -hex 32`;
  }
  if (value.length < minLength) {
    return `${name} est trop court (${value.length} caractères, ${minLength} minimum).`;
  }
  return null;
}

export function auditEnvironment(): void {
  const problems = [
    auditSecret('JWT_SECRET', env.JWT_SECRET, 32),
    auditSecret('ENCRYPTION_KEY', env.ENCRYPTION_KEY, 32),
  ].filter((p): p is string => p !== null);

  if (env.ADMIN_PASSWORD && PLACEHOLDER_SECRETS.has(env.ADMIN_PASSWORD.trim())) {
    problems.push("ADMIN_PASSWORD vaut encore « change-me » : choisissez un vrai mot de passe.");
  }

  if (problems.length === 0) return;

  if (isProduction) {
    console.error('\n✗ Configuration refusée — secrets non sécurisés en production :');
    problems.forEach((p) => console.error(`    • ${p}`));
    console.error(
      '\n  Corrigez ces variables puis redémarrez. Pour lever ce contrôle sur un déploiement\n' +
        "  volontairement non exposé, définissez BUZZY_ALLOW_WEAK_SECRETS=1.\n",
    );
    if (process.env.BUZZY_ALLOW_WEAK_SECRETS !== '1') {
      process.exit(1);
    }
    console.warn('  BUZZY_ALLOW_WEAK_SECRETS=1 : démarrage malgré tout.\n');
    return;
  }

  console.warn('\n! Secrets de développement détectés (bloquants en production) :');
  problems.forEach((p) => console.warn(`    • ${p}`));
  console.warn('');
}
