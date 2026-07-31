import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { validate, validated } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { aiGenerationLimiter } from '../middleware/rateLimit';
import {
  eventGenerateSchema,
  eventPlanSchema,
  eventListQuerySchema,
  manualEventSchema,
  eventUpdateSchema,
  deleteEventsSchema,
} from './schemas';
import { generateEvents, planEvents, rephraseEvent } from '../services/event.service';
import { describeAiError, respondToAiError } from '../lib/ai-errors';
import { getJob, startJob } from '../lib/jobs';
import type { EventScope, Prisma } from '@prisma/client';

const router = Router();
router.use(requireAuth);

/** Création manuelle d'un événement (date + titre + description). */
router.post('/manual', validate(manualEventSchema), async (req, res) => {
  const b = req.body as {
    title: string;
    description: string;
    eventDate?: string | null;
    eventPeriod?: string | null;
    scope: EventScope;
    region?: string | null;
    theme: string;
  };
  let eventDate: Date | null = null;
  if (b.eventDate) {
    const d = new Date(b.eventDate);
    if (!isNaN(d.getTime())) eventDate = d;
  }
  const event = await prisma.event.create({
    data: {
      title: b.title.trim(),
      description: b.description.trim(),
      scope: b.scope,
      region: b.region?.trim() || null,
      theme: b.theme?.trim() || 'Autre',
      eventDate,
      eventPeriod: b.eventPeriod?.trim() || null,
      sources: [],
      verified: false,
    },
  });
  return res.status(201).json(event);
});

/** Génère une alternative (reformulation IA) du titre et de la description. */
router.post('/:id/rephrase', aiGenerationLimiter, async (req, res) => {
  try {
    const event = await rephraseEvent(req.params.id);
    return res.json(event);
  } catch (e) {
    return respondToAiError(res, "reformulation d'un événement", e);
  }
});

/** Édition manuelle d'un événement déjà enregistré. */
router.put('/:id', validate(eventUpdateSchema), async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Événement introuvable.' });

  const b = req.body as {
    title?: string;
    description?: string;
    eventDate?: string | null;
    eventPeriod?: string | null;
    scope?: EventScope;
    region?: string | null;
    theme?: string;
  };

  const data: Record<string, unknown> = {};
  if (b.title !== undefined) data.title = b.title.trim().slice(0, 300);
  if (b.description !== undefined) data.description = b.description.trim();
  if (b.scope !== undefined) data.scope = b.scope;
  if (b.region !== undefined) data.region = b.region?.trim() || null;
  if (b.theme !== undefined) data.theme = b.theme.trim() || 'Autre';
  if (b.eventPeriod !== undefined) data.eventPeriod = b.eventPeriod?.trim() || null;

  if (b.eventDate !== undefined) {
    if (!b.eventDate) {
      data.eventDate = null;
    } else {
      const d = new Date(b.eventDate);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Date invalide.' });
      data.eventDate = d;
    }
  }

  const event = await prisma.event.update({ where: { id }, data });
  return res.json(event);
});

/**
 * Supprime un événement. Les publications qui en découlaient sont conservées
 * (la clé étrangère est en ON DELETE SET NULL) : on prévient l'appelant du
 * nombre de publications qui perdent leur source.
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Événement introuvable.' });

  const linkedPosts = await prisma.post.count({ where: { relatedEventId: id } });
  await prisma.event.delete({ where: { id } });
  return res.json({ ok: true, id, unlinkedPosts: linkedPosts });
});

/** Supprime l'historique des événements (sauf ceux passés dans exceptIds). */
router.delete('/', validate(deleteEventsSchema), async (req, res) => {
  const { exceptIds } = req.body as { exceptIds: string[] };
  const where = exceptIds.length > 0 ? { id: { notIn: exceptIds } } : {};
  const unlinkedPosts = await prisma.post.count({
    where: { relatedEventId: { not: null }, relatedEvent: where },
  });
  const result = await prisma.event.deleteMany({ where });
  return res.json({ deleted: result.count, unlinkedPosts });
});

type ScopeInput = {
  scope?: EventScope;
  scopes?: EventScope[];
  region?: string | null;
  regions?: string[];
};

/** Fusionne/déduplique portées et localisations (ancien + nouveau format). */
function resolveScopesAndRegions(body: ScopeInput): { scopes: EventScope[]; regions: string[] } {
  const scopes = Array.from(
    new Set([...(body.scopes ?? []), ...(body.scope ? [body.scope] : [])]),
  );
  if (scopes.length === 0) scopes.push('GLOBAL');
  const regions = Array.from(
    new Set(
      [...(body.regions ?? []), ...(body.region ? [body.region] : [])]
        .map((r) => r.trim())
        .filter(Boolean),
    ),
  );
  return { scopes, regions };
}

router.post('/generate', aiGenerationLimiter, validate(eventGenerateSchema), async (req, res) => {
  const body = req.body as ScopeInput & {
    themes: string[];
    priorityThemes: string[];
    dateTarget: any;
    excludeIds: string[];
    count: number;
    plan?: string;
    strictSources?: boolean;
  };
  const { scopes, regions } = resolveScopesAndRegions(body);

  // Réponse immédiate : le travail se poursuit en tâche de fond.
  //
  // Une génération dépasse couramment la minute, et tout intermédiaire impose
  // sa propre limite — Cloudflare coupe à 100 s avec un 524, non configurable
  // hors offre Enterprise. Tenir la requête ouverte jusqu'au bout était donc
  // structurellement voué à l'échec, quel que soit le réglage.
  const jobId = startJob(
    (progress) =>
      generateEvents({
        scopes,
        regions,
        themes: body.themes,
        priorityThemes: body.priorityThemes ?? [],
        dateTarget: body.dateTarget,
        excludeIds: body.excludeIds,
        count: body.count,
        plan: body.plan,
        strictSources: body.strictSources,
        onProgress: progress,
      }).then((result) => ({
        events: result.events,
        webSearchUsed: result.webSearchUsed,
        notice: result.notice ?? null,
      })),
    (error) => describeAiError("génération d'événements", error),
    'Préparation…',
  );

  return res.status(202).json({ jobId });
});

/** Avancement d'une génération lancée. Interrogé en boucle par le client. */
router.get('/generate/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    // Tâche inconnue : identifiant erroné, ou serveur redémarré depuis (les
    // tâches vivent en mémoire).
    return res.status(404).json({
      error: "Génération introuvable. Elle a peut-être expiré, ou le serveur a redémarré depuis. Relancez la recherche.",
    });
  }
  return res.json(job);
});

router.post('/plan', aiGenerationLimiter, validate(eventPlanSchema), async (req, res) => {
  const body = req.body as ScopeInput & {
    themes: string[];
    priorityThemes: string[];
    dateTarget: any;
    count: number;
  };
  const { scopes, regions } = resolveScopesAndRegions(body);
  try {
    const result = await planEvents({
      scopes,
      regions,
      themes: body.themes,
      priorityThemes: body.priorityThemes ?? [],
      dateTarget: body.dateTarget,
      count: body.count,
    });
    return res.json({ plan: result.plan });
  } catch (e) {
    return respondToAiError(res, 'planification des événements', e);
  }
});

router.get('/', validate(eventListQuerySchema, 'query'), async (req, res) => {
  const q = validated<{
    scope?: 'GLOBAL' | 'NATIONAL' | 'REGIONAL' | 'LOCAL';
    theme?: string;
    region?: string;
    verified?: 'true' | 'false';
    q?: string;
    take: number;
    skip: number;
  }>(req, 'query');

  const where: Prisma.EventWhereInput = {};
  if (q.scope) where.scope = q.scope;
  if (q.theme) where.theme = q.theme;
  if (q.region) where.region = { contains: q.region, mode: 'insensitive' };
  if (q.verified) where.verified = q.verified === 'true';

  const search = q.q?.trim();
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { theme: { contains: search, mode: 'insensitive' } },
      { region: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: q.take,
      skip: q.skip,
    }),
    prisma.event.count({ where }),
  ]);

  return res.json({ events, total });
});

export default router;
