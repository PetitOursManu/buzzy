/**
 * Chargement et validation des variables d'environnement.
 * Échoue rapidement au démarrage si une variable critique manque.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

export const env = {
  DATABASE_URL: required('DATABASE_URL'),
  JWT_SECRET: required('JWT_SECRET'),
  ENCRYPTION_KEY: required('ENCRYPTION_KEY'),
  ADMIN_EMAIL: optional('ADMIN_EMAIL', 'admin@example.com'),
  ADMIN_PASSWORD: optional('ADMIN_PASSWORD', ''),
  PORT: parseInt(optional('PORT', '3000'), 10),
  NODE_ENV: optional('NODE_ENV', 'production'),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '',
};

export const isProduction = env.NODE_ENV === 'production';
