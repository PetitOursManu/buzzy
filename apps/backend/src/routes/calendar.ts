import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { aiGenerationLimiter } from '../middleware/rateLimit';
import {
  calendarAddEventSchema,
  calendarCreateSchema,
  calendarGenerateSchema,
  calendarUpdateSchema,
} from './schemas';
import {
  CalendarInputError,
  atPublishingHour,
  createEmptyCalendar,
  generateCalendar,
  preGeneratedDescription,
} from '../services/calendar.service';
import { toCsv } from '../lib/csv';
import { buildIcs } from '../lib/ics';

const router = Router();
router.use(requireAuth);

/** Libellés lisibles pour les exports destinés à un humain. */
const NETWORK_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
  tiktok: 'TikTok',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  APPROVED: 'Validée',
  PUBLISHED: 'Publiée',
};

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
    if (e instanceof CalendarInputError) return res.status(400).json({ error: e.message });
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

/**
 * Modifie un calendrier : son nom, sa plage de dates, ses réseaux.
 *
 * Resserrer la plage peut laisser des publications en dehors : plutôt que de
 * refuser la modification ou de les perdre, elles sont ramenées au début de la
 * nouvelle plage et signalées, pour que l'utilisateur leur attribue une date
 * depuis l'encart prévu à cet effet.
 */
router.put('/:postPlanId', validate(calendarUpdateSchema), async (req, res) => {
  const { postPlanId } = req.params;
  const body = req.body as {
    name?: string;
    startDate?: string;
    endDate?: string;
    networks?: string[];
  };

  const plan = await prisma.postPlan.findUnique({ where: { id: postPlanId } });
  if (!plan) return res.status(404).json({ error: 'Calendrier introuvable.' });

  const startDate = body.startDate ? new Date(body.startDate) : plan.startDate;
  const endDate = body.endDate ? new Date(body.endDate) : plan.endDate;
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).json({ error: 'Dates invalides.' });
  }
  if (endDate < startDate) {
    return res.status(400).json({ error: 'La date de fin précède la date de début.' });
  }

  const updated = await prisma.postPlan.update({
    where: { id: postPlanId },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      startDate,
      endDate,
      ...(body.networks !== undefined ? { networks: body.networks } : {}),
    },
  });

  // Publications désormais hors de la nouvelle plage : ramenées à son début et
  // signalées pour replacement manuel.
  const rangeStart = new Date(startDate).setHours(0, 0, 0, 0);
  const rangeEnd = new Date(endDate).setHours(23, 59, 59, 999);
  const stranded = await prisma.post.findMany({
    where: {
      postPlanId,
      OR: [
        { scheduledDate: { lt: new Date(rangeStart) } },
        { scheduledDate: { gt: new Date(rangeEnd) } },
      ],
    },
    select: { id: true },
  });
  if (stranded.length > 0) {
    await prisma.post.updateMany({
      where: { id: { in: stranded.map((p) => p.id) } },
      data: { scheduledDate: atPublishingHour(startDate), needsReschedule: true },
    });
  }

  return res.json({
    postPlan: updated,
    rescheduled: stranded.length,
    warning:
      stranded.length > 0
        ? `${stranded.length} publication(s) se retrouvent hors de la nouvelle plage. Attribuez-leur une date depuis l'encart affiché au-dessus du calendrier.`
        : undefined,
  });
});

/**
 * Rattache un événement existant à un calendrier : crée une publication par
 * réseau à partir des données de l'événement. Aucun appel à l'IA — le titre et
 * la description de l'événement sont repris tels quels.
 */
router.post('/:postPlanId/events', validate(calendarAddEventSchema), async (req, res) => {
  const { postPlanId } = req.params;
  const body = req.body as { eventId: string; networks: string[]; scheduledDate?: string };

  const plan = await prisma.postPlan.findUnique({ where: { id: postPlanId } });
  if (!plan) return res.status(404).json({ error: 'Calendrier introuvable.' });

  const event = await prisma.event.findUnique({ where: { id: body.eventId } });
  if (!event) return res.status(404).json({ error: 'Événement introuvable.' });

  // À défaut de réseaux explicites, on reprend ceux configurés sur le calendrier.
  const networks = body.networks.length > 0 ? body.networks : plan.networks;
  if (networks.length === 0) {
    return res.status(400).json({
      error: "Aucun réseau ciblé : ce calendrier n'en définit aucun, précisez-en au moins un.",
    });
  }

  // Date de publication : celle demandée, sinon celle de l'événement, sinon le
  // début du calendrier.
  let scheduledDate = event.eventDate ?? plan.startDate;
  if (body.scheduledDate) {
    const d = new Date(body.scheduledDate);
    if (isNaN(d.getTime())) {
      return res.status(400).json({ error: 'Date de publication invalide.' });
    }
    scheduledDate = d;
  }

  // Hors de la plage du calendrier : on replie sur son début et on signale la
  // publication pour que l'utilisateur lui attribue une date.
  const rangeStart = new Date(plan.startDate).setHours(0, 0, 0, 0);
  const rangeEnd = new Date(plan.endDate).setHours(23, 59, 59, 999);
  const needsReschedule =
    scheduledDate.getTime() < rangeStart || scheduledDate.getTime() > rangeEnd;
  if (needsReschedule) scheduledDate = atPublishingHour(plan.startDate);

  const posts = await prisma.$transaction(
    networks.map((network) =>
      prisma.post.create({
        data: {
          postPlanId,
          scheduledDate,
          network,
          title: event.title.slice(0, 300),
          content: preGeneratedDescription(event, network) ?? event.description,
          hashtags: [],
          relatedEventId: event.id,
          status: 'DRAFT',
          needsReschedule,
        },
        include: { relatedEvent: true },
      }),
    ),
  );

  return res.status(201).json({
    posts,
    postPlan: plan,
    warning: needsReschedule
      ? `« ${event.title} » est daté hors de la plage du calendrier. Attribuez-lui une date depuis l'encart affiché au-dessus du calendrier.`
      : undefined,
  });
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

const EXPORT_FORMATS = ['json', 'csv', 'ics'] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];

router.get('/:postPlanId/export', async (req, res) => {
  const { postPlanId } = req.params;
  const requested = String(req.query.format ?? 'json').toLowerCase();
  const format: ExportFormat = (EXPORT_FORMATS as readonly string[]).includes(requested)
    ? (requested as ExportFormat)
    : 'json';
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

  if (format === 'ics') {
    // Importable dans Google Agenda, Outlook, Apple Calendar…
    const ics = buildIcs(
      `Buzzy — ${plan.name}`,
      plan.posts.map((p) => ({
        uid: `${p.id}@buzzy`,
        start: p.scheduledDate,
        durationMinutes: 30,
        summary: `${NETWORK_LABELS[p.network] ?? p.network} · ${p.title}`,
        description: [
          p.content,
          p.hashtags.length > 0 ? p.hashtags.map((h) => `#${h}`).join(' ') : '',
          p.relatedEvent ? `Événement : ${p.relatedEvent.title}` : '',
          `Statut : ${STATUS_LABELS[p.status] ?? p.status}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
        categories: [NETWORK_LABELS[p.network] ?? p.network],
      })),
      new Date(),
    );
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="buzzy-calendrier-${postPlanId}.ics"`,
    );
    return res.send(ics);
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
