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
 * Pré-enregistre un serveur MCP SearXNG si l'URL est fournie via la variable
 * d'environnement SEARXNG_MCP_URL (cas du déploiement Docker avec le service
 * searxng-mcp voisin). Créé désactivé : l'utilisateur l'active d'un clic.
 * Idempotent : ne recrée pas s'il existe déjà (même URL).
 */
export async function ensureSeededMcpServers(): Promise<void> {
  const url = process.env.SEARXNG_MCP_URL?.trim();
  if (!url) return;
  const existing = await prisma.mcpServer.findFirst({ where: { url } });
  if (existing) return;
  await prisma.mcpServer.create({
    data: {
      name: 'SearXNG (auto-hébergé)',
      url,
      enabled: false,
      preset: 'searxng',
    },
  });
  console.log(`[seed] Serveur MCP SearXNG pré-enregistré (désactivé) : ${url}`);
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
