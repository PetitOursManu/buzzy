import { Router } from 'express';
import argon2 from 'argon2';
import { prisma } from '../lib/prisma';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { encrypt, decrypt, lastFour } from '../lib/crypto';
import {
  aiProviderSchema,
  listModelsSchema,
  profileSchema,
  changePasswordSchema,
  mcpServerCreateSchema,
  mcpServerUpdateSchema,
} from './schemas';
import { listModels, AiRequestError } from '../services/ai-provider.service';
import { testMcpServer } from '../services/mcp.service';
import { APP_VERSION } from '../lib/version';

const router = Router();
router.use(requireAuth);

/* ─── Diagnostic de l'installation ────────────────────────────── */

/**
 * État de santé fonctionnel de l'installation.
 *
 * Répond à la question que se pose tout utilisateur qui vient de déployer
 * Buzzy : « qu'est-ce qu'il me reste à configurer ? ». Chaque contrôle est
 * indépendant et ne fait jamais échouer la réponse.
 */
router.get('/diagnostics', async (_req, res) => {
  const [provider, profile, mcpServers, eventCount, planCount] = await Promise.all([
    prisma.aiProvider.findFirst({ orderBy: { updatedAt: 'desc' } }),
    prisma.userProfile.findFirst({ orderBy: { updatedAt: 'desc' } }),
    prisma.mcpServer.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.event.count(),
    prisma.postPlan.count(),
  ]);

  const enabledServers = mcpServers.filter((s) => s.enabled);

  // On ne teste que les serveurs activés : ce sont les seuls dont une panne
  // dégrade réellement la génération.
  const mcpResults = await Promise.all(
    enabledServers.map(async (server) => {
      const result = await testMcpServer(server);
      return {
        id: server.id,
        name: server.name,
        url: server.url,
        reachable: result.ok,
        toolCount: result.tools.length,
        error: result.error,
      };
    }),
  );

  return res.json({
    version: APP_VERSION,
    ai: {
      configured: !!provider,
      baseUrl: provider?.baseUrl ?? null,
      model: provider?.selectedModel ?? null,
      keyConfigured: !!provider?.apiKeyEncrypted,
      // Une clé indéchiffrable signale presque toujours un ENCRYPTION_KEY
      // modifié après coup : la cause est invisible sans ce contrôle.
      keyDecryptable: provider?.apiKeyEncrypted ? canDecrypt(provider.apiKeyEncrypted) : null,
    },
    profile: {
      configured: !!profile,
      hasDescription: !!profile?.description?.trim(),
      preferredNetworks: profile?.preferredNetworks ?? [],
    },
    webSearch: {
      registered: mcpServers.length,
      enabled: enabledServers.length,
      servers: mcpResults,
    },
    content: { events: eventCount, calendars: planCount },
  });
});

function canDecrypt(payload: string): boolean {
  try {
    decrypt(payload);
    return true;
  } catch {
    return false;
  }
}

/* ─── Compte / Sécurité ───────────────────────────────────────── */

router.put('/password', validate(changePasswordSchema), async (req, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };
  const userId = req.user!.sub;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  let ok = false;
  try {
    ok = await argon2.verify(user.passwordHash, currentPassword);
  } catch {
    ok = false;
  }
  if (!ok) {
    return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit être différent de l\'actuel.' });
  }

  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return res.json({ ok: true });
});

/* ─── Fournisseur IA ──────────────────────────────────────────── */

router.get('/ai-provider', async (_req, res) => {
  const provider = await prisma.aiProvider.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!provider) {
    return res.json(null);
  }
  let keyLast4 = '';
  let keyConfigured = false;
  if (provider.apiKeyEncrypted) {
    keyConfigured = true;
    try {
      keyLast4 = lastFour(decrypt(provider.apiKeyEncrypted));
    } catch {
      keyLast4 = '';
    }
  }
  return res.json({
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    selectedModel: provider.selectedModel,
    reasoningEffort: provider.reasoningEffort ?? null,
    keyConfigured,
    keyLast4,
    updatedAt: provider.updatedAt,
  });
});

router.put('/ai-provider', validate(aiProviderSchema), async (req, res) => {
  const { name, baseUrl, apiKey, selectedModel, reasoningEffort } = req.body as {
    name: string;
    baseUrl: string;
    apiKey?: string;
    selectedModel?: string | null;
    reasoningEffort?: string | null;
  };
  const existing = await prisma.aiProvider.findFirst({ orderBy: { updatedAt: 'desc' } });

  // Conserver l'ancienne clé si aucune nouvelle n'est fournie.
  let apiKeyEncrypted = existing?.apiKeyEncrypted ?? '';
  if (apiKey && apiKey.trim() !== '') {
    apiKeyEncrypted = encrypt(apiKey.trim());
  }

  const data = {
    name,
    baseUrl,
    apiKeyEncrypted,
    selectedModel: selectedModel ?? existing?.selectedModel ?? null,
    reasoningEffort:
      reasoningEffort === undefined ? existing?.reasoningEffort ?? null : reasoningEffort,
  };

  const saved = existing
    ? await prisma.aiProvider.update({ where: { id: existing.id }, data })
    : await prisma.aiProvider.create({ data });

  return res.json({
    id: saved.id,
    name: saved.name,
    baseUrl: saved.baseUrl,
    selectedModel: saved.selectedModel,
    reasoningEffort: saved.reasoningEffort ?? null,
    keyConfigured: !!saved.apiKeyEncrypted,
    keyLast4: saved.apiKeyEncrypted ? lastFour(decrypt(saved.apiKeyEncrypted)) : '',
    updatedAt: saved.updatedAt,
  });
});

router.post('/ai-provider/list-models', validate(listModelsSchema), async (req, res) => {
  const { baseUrl, apiKey } = req.body as { baseUrl: string; apiKey?: string };
  // Si aucune clé fournie, réutiliser celle enregistrée.
  let key = apiKey?.trim() ?? '';
  if (!key) {
    const existing = await prisma.aiProvider.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (existing?.apiKeyEncrypted) {
      try {
        key = decrypt(existing.apiKeyEncrypted);
      } catch {
        /* ignore */
      }
    }
  }
  try {
    const { models, baseUrl: resolvedBaseUrl } = await listModels(baseUrl, key);
    if (models.length === 0) {
      return res.status(200).json({
        models: [],
        baseUrl: resolvedBaseUrl,
        warning: 'Aucun modèle listé par le fournisseur.',
      });
    }
    return res.json({ models, baseUrl: resolvedBaseUrl });
  } catch (e) {
    const message =
      e instanceof AiRequestError
        ? e.message
        : "Erreur lors de la récupération des modèles. Vérifiez l'URL de base et la clé API.";
    return res.status(502).json({ error: message });
  }
});

/* ─── Profil utilisateur ──────────────────────────────────────── */

router.get('/profile', async (_req, res) => {
  const profile = await prisma.userProfile.findFirst({ orderBy: { updatedAt: 'desc' } });
  return res.json(profile ?? null);
});

router.put('/profile', validate(profileSchema), async (req, res) => {
  const body = req.body as {
    description: string;
    tone: string;
    targetAudience?: string | null;
    restrictions?: string | null;
    prioritySources?: string | null;
    preferredNetworks?: string[];
  };
  const existing = await prisma.userProfile.findFirst({ orderBy: { updatedAt: 'desc' } });
  const data = {
    description: body.description,
    tone: body.tone,
    targetAudience: body.targetAudience ?? null,
    restrictions: body.restrictions ?? null,
    prioritySources: body.prioritySources ?? null,
    preferredNetworks: body.preferredNetworks ?? [],
  };
  const saved = existing
    ? await prisma.userProfile.update({ where: { id: existing.id }, data })
    : await prisma.userProfile.create({ data });
  return res.json(saved);
});

/* ─── Serveurs MCP ────────────────────────────────────────────── */

function serializeMcp(server: {
  id: string;
  name: string;
  url: string;
  authHeader: string | null;
  enabled: boolean;
  preset: string | null;
  createdAt: Date;
}) {
  return {
    id: server.id,
    name: server.name,
    url: server.url,
    enabled: server.enabled,
    preset: server.preset,
    authConfigured: !!server.authHeader,
    createdAt: server.createdAt,
  };
}

router.get('/mcp-servers', async (_req, res) => {
  const servers = await prisma.mcpServer.findMany({ orderBy: { createdAt: 'asc' } });
  return res.json(servers.map(serializeMcp));
});

router.post('/mcp-servers', validate(mcpServerCreateSchema), async (req, res) => {
  const body = req.body as {
    name: string;
    url: string;
    authHeader?: string | null;
    enabled?: boolean;
    preset?: string | null;
  };
  const authHeader =
    body.authHeader && body.authHeader.trim() !== '' ? encrypt(body.authHeader.trim()) : null;
  const server = await prisma.mcpServer.create({
    data: {
      name: body.name,
      url: body.url,
      authHeader,
      enabled: body.enabled ?? false,
      preset: body.preset ?? 'custom',
    },
  });
  return res.status(201).json(serializeMcp(server));
});

router.put('/mcp-servers/:id', validate(mcpServerUpdateSchema), async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.mcpServer.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Serveur MCP introuvable.' });

  const body = req.body as {
    name?: string;
    url?: string;
    authHeader?: string | null;
    enabled?: boolean;
    preset?: string | null;
  };

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.url !== undefined) data.url = body.url;
  if (body.enabled !== undefined) data.enabled = body.enabled;
  if (body.preset !== undefined) data.preset = body.preset;
  // authHeader : absent = inchangé ; "" = effacé ; valeur = (re)chiffrée.
  if (body.authHeader !== undefined) {
    data.authHeader =
      body.authHeader && body.authHeader.trim() !== '' ? encrypt(body.authHeader.trim()) : null;
  }

  const server = await prisma.mcpServer.update({ where: { id }, data });
  return res.json(serializeMcp(server));
});

router.delete('/mcp-servers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.mcpServer.delete({ where: { id } });
  } catch {
    return res.status(404).json({ error: 'Serveur MCP introuvable.' });
  }
  return res.json({ ok: true });
});

router.post('/mcp-servers/:id/test', async (req, res) => {
  const { id } = req.params;
  const server = await prisma.mcpServer.findUnique({ where: { id } });
  if (!server) return res.status(404).json({ error: 'Serveur MCP introuvable.' });
  const result = await testMcpServer(server);
  if (!result.ok) {
    return res.status(200).json({ ok: false, error: result.error, tools: [] });
  }
  return res.json({ ok: true, tools: result.tools });
});

export default router;
