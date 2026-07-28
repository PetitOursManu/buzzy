import argon2 from 'argon2';
import { prisma } from './lib/prisma';
import { env } from './lib/env';

/**
 * Crée le compte administrateur unique à partir des variables
 * d'environnement, si aucun utilisateur n'existe encore.
 * Idempotent : ne fait rien si un utilisateur est déjà présent.
 */
export async function ensureAdminUser(): Promise<void> {
  const count = await prisma.user.count();
  if (count > 0) {
    return;
  }
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.trim() === '') {
    console.warn(
      '[seed] ADMIN_PASSWORD non défini : aucun compte admin créé. ' +
        'Définissez ADMIN_EMAIL et ADMIN_PASSWORD puis redémarrez.',
    );
    return;
  }
  const passwordHash = await argon2.hash(env.ADMIN_PASSWORD, { type: argon2.argon2id });
  await prisma.user.create({
    data: {
      email: env.ADMIN_EMAIL,
      passwordHash,
    },
  });
  console.log(`[seed] Compte administrateur créé : ${env.ADMIN_EMAIL}`);
}

/**
 * Pré-enregistre les serveurs MCP auto-hébergés livrés avec Buzzy, quand leur
 * URL est fournie par l'environnement (services voisins du docker-compose).
 * Créés DÉSACTIVÉS : l'utilisateur les active d'un clic dans les Paramètres.
 * Idempotent : ne recrée pas un serveur déjà enregistré (même URL).
 */
const SEEDED_MCP_SERVERS: { env: string; name: string; preset: string; fallback?: string }[] = [
  {
    env: 'SEARXNG_MCP_URL',
    name: 'SearXNG — recherche web (auto-hébergé)',
    preset: 'searxng',
  },
  {
    env: 'MCP_FETCH_URL',
    name: 'Fetch — lecture de pages web (officiel)',
    preset: 'custom',
    fallback: 'http://mcp-fetch:8000/mcp',
  },
  {
    env: 'MCP_TIME_URL',
    name: 'Time — date du jour (officiel)',
    preset: 'custom',
    fallback: 'http://mcp-time:8000/mcp',
  },
];

export async function ensureSeededMcpServers(): Promise<void> {
  for (const server of SEEDED_MCP_SERVERS) {
    const url = (process.env[server.env]?.trim() || server.fallback || '').trim();
    if (!url) continue;
    const existing = await prisma.mcpServer.findFirst({ where: { url } });
    if (existing) continue;
    await prisma.mcpServer.create({
      data: { name: server.name, url, enabled: false, preset: server.preset },
    });
    console.log(`[seed] Serveur MCP pré-enregistré (désactivé) : ${server.name} → ${url}`);
  }
}

// Permet d'exécuter le seed en CLI : `npm run seed`
if (require.main === module) {
  ensureAdminUser()
    .then(() => ensureSeededMcpServers())
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[seed] Erreur :', e);
      process.exit(1);
    });
}
