import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { aiGenerationLimiter } from '../middleware/rateLimit';
import { calendarCreateSchema, calendarGenerateSchema } from './schemas';
import { createEmptyCalendar, generateCalendar } from '../services/calendar.service';
import { AiConfigError, AiRequestError } from '../services/ai-provider.service';
import { toCsv } from '../lib/csv';

const router = Router();
router.use(requireAuth);

router.post('/generate', aiGenerationLimiter, validate(calendarGenerateSchema), async (req, res) => {
  const body = req.body as {
    name?: string;
    startDate: string;
    endDate: string;
    frequency: { type: 'day' | 'week' | 'month'; count: number };
    networks: string[];
    eventSource: 'selected' | 'ai';
    selectedEventIds: string[];
    discoveryFilters?: { scope: string; region?: string; themes: string[] };
  };

  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).json({ error: 'Dates invalides.' });
  }
  if (endDate < startDate) {
    return res.status(400).json({ error: 'La date de fin précède la date de début.' });
  }

  try {
    const result = await generateCalendar({
      name: body.name,
      startDate,
      endDate,
      frequency: body.frequency,
      networks: body.networks,
      eventSource: body.eventSource,
      selectedEventIds: body.selectedEventIds,
      discoveryFilters: body.discoveryFilters,
    });
    return res.json({
      postPlan: result.postPlan,
      posts: result.posts,
      warning: result.warning,
    });
  } catch (e) {
    if (e instanceof AiConfigError) return res.status(400).json({ error: e.message });
    if (e instanceof AiRequestError) return res.status(502).json({ error: e.message });
    console.error('Erreur génération calendrier:', e);
    return res.status(500).json({ error: 'Erreur inattendue lors de la génération du calendrier.' });
  }
});

/**
 * Crée un calendrier vide. Aucun appel à l'IA n'est effectué : le calendrier
 * est créé tel quel, sans aucune publication.
 */
router.post('/', validate(calendarCreateSchema), async (req, res) => {
  const body = req.body as {
    name?: string;
    startDate: string;
    endDate: string;
    frequency?: { type: 'day' | 'week' | 'month'; count: number };
    networks: string[];
  };

  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).json({ error: 'Dates invalides.' });
  }
  if (endDate < startDate) {
    return res.status(400).json({ error: 'La date de fin précède la date de début.' });
  }

  const plan = await createEmptyCalendar({
    name: body.name,
    startDate,
    endDate,
    frequency: body.frequency,
    networks: body.networks,
  });
  return res.status(201).json(plan);
});

/** Liste tous les calendriers (plans) générés. */
router.get('/', async (_req, res) => {
  const plans = await prisma.postPlan.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { posts: true } } },
  });
  return res.json(plans);
});

router.get('/:postPlanId', async (req, res) => {
  const { postPlanId } = req.params;
  const plan = await prisma.postPlan.findUnique({
    where: { id: postPlanId },
    include: {
      posts: {
        orderBy: { scheduledDate: 'asc' },
        include: { relatedEvent: true },
      },
    },
  });
  if (!plan) return res.status(404).json({ error: 'Calendrier introuvable.' });
  return res.json(plan);
});

/** Supprime un calendrier et toutes ses publications (cascade Prisma). */
router.delete('/:postPlanId', async (req, res) => {
  const { postPlanId } = req.params;
  const plan = await prisma.postPlan.findUnique({ where: { id: postPlanId } });
  if (!plan) return res.status(404).json({ error: 'Calendrier introuvable.' });

  await prisma.postPlan.delete({ where: { id: postPlanId } });
  return res.json({ ok: true, id: postPlanId });
});

/** Vide un calendrier de toutes ses publications, en le conservant. */
router.delete('/:postPlanId/posts', async (req, res) => {
  const { postPlanId } = req.params;
  const plan = await prisma.postPlan.findUnique({ where: { id: postPlanId } });
  if (!plan) return res.status(404).json({ error: 'Calendrier introuvable.' });

  const result = await prisma.post.deleteMany({ where: { postPlanId } });
  return res.json({ deleted: result.count });
});

router.get('/:postPlanId/export', async (req, res) => {
  const { postPlanId } = req.params;
  const format = (req.query.format as string) === 'csv' ? 'csv' : 'json';
  const plan = await prisma.postPlan.findUnique({
    where: { id: postPlanId },
    include: {
      posts: { orderBy: { scheduledDate: 'asc' }, include: { relatedEvent: true } },
    },
  });
  if (!plan) return res.status(404).json({ error: 'Calendrier introuvable.' });

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="buzzy-calendrier-${postPlanId}.json"`,
    );
    return res.send(JSON.stringify(plan, null, 2));
  }

  // CSV
  const rows = plan.posts.map((p) => ({
    date: p.scheduledDate.toISOString(),
    reseau: p.network,
    titre: p.title,
    contenu: p.content,
    hashtags: p.hashtags.map((h) => `#${h}`).join(' '),
    statut: p.status,
    evenement: p.relatedEvent?.title ?? '',
    sources: p.relatedEvent
      ? ((p.relatedEvent.sources as Array<{ url?: string }>) ?? [])
          .map((s) => s.url)
          .filter(Boolean)
          .join(' | ')
      : '',
  }));
  const csv = toCsv(rows, ['date', 'reseau', 'titre', 'contenu', 'hashtags', 'statut', 'evenement', 'sources']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="buzzy-calendrier-${postPlanId}.csv"`);
  return res.send('﻿' + csv); // BOM pour Excel
});

export default router;
