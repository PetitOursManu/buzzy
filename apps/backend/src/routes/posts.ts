import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { aiGenerationLimiter } from '../middleware/rateLimit';
import { postCreateSchema, postDuplicateSchema, postUpdateSchema } from './schemas';
import { regeneratePost } from '../services/calendar.service';
import { AiConfigError, AiRequestError } from '../services/ai-provider.service';

const router = Router();
router.use(requireAuth);

/**
 * Ajoute une publication à la main dans un calendrier existant.
 * Aucune génération IA : le contenu fourni est enregistré tel quel.
 */
router.post('/', validate(postCreateSchema), async (req, res) => {
  const body = req.body as {
    postPlanId: string;
    scheduledDate: string;
    network: string;
    title: string;
    content: string;
    hashtags: string[];
    relatedEventId?: string | null;
  };

  const plan = await prisma.postPlan.findUnique({ where: { id: body.postPlanId } });
  if (!plan) return res.status(404).json({ error: 'Calendrier introuvable.' });

  const scheduledDate = new Date(body.scheduledDate);
  if (isNaN(scheduledDate.getTime())) {
    return res.status(400).json({ error: 'Date de publication invalide.' });
  }

  if (body.relatedEventId) {
    const event = await prisma.event.findUnique({ where: { id: body.relatedEventId } });
    if (!event) return res.status(404).json({ error: 'Événement lié introuvable.' });
  }

  const post = await prisma.post.create({
    data: {
      postPlanId: body.postPlanId,
      scheduledDate,
      network: body.network,
      title: body.title.trim().slice(0, 300),
      content: body.content,
      hashtags: body.hashtags.map((h) => h.replace(/^#/, '')).filter(Boolean),
      relatedEventId: body.relatedEventId ?? null,
      status: 'DRAFT',
    },
    include: { relatedEvent: true },
  });
  return res.status(201).json(post);
});

router.put('/:id', validate(postUpdateSchema), async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.post.findUnique({
    where: { id },
    include: { postPlan: true },
  });
  if (!existing) return res.status(404).json({ error: 'Publication introuvable.' });

  const body = req.body as {
    title?: string;
    content?: string;
    hashtags?: string[];
    status?: 'DRAFT' | 'APPROVED' | 'PUBLISHED';
    scheduledDate?: string;
  };
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.content !== undefined) data.content = body.content;
  if (body.hashtags !== undefined) data.hashtags = body.hashtags.map((h) => h.replace(/^#/, ''));
  if (body.status !== undefined) data.status = body.status;

  if (body.scheduledDate !== undefined) {
    const d = new Date(body.scheduledDate);
    if (isNaN(d.getTime())) {
      return res.status(400).json({ error: 'Date de publication invalide.' });
    }
    // La date attribuée doit tomber dans la plage du calendrier, sans quoi la
    // publication resterait introuvable dans les vues Mois et Semaine.
    const rangeStart = new Date(existing.postPlan.startDate).setHours(0, 0, 0, 0);
    const rangeEnd = new Date(existing.postPlan.endDate).setHours(23, 59, 59, 999);
    if (d.getTime() < rangeStart || d.getTime() > rangeEnd) {
      return res.status(400).json({
        error: `La date doit être comprise entre le ${new Date(rangeStart).toLocaleDateString('fr-FR')} et le ${new Date(rangeEnd).toLocaleDateString('fr-FR')}.`,
      });
    }
    data.scheduledDate = d;
    // La publication est replacée : elle n'attend plus de date.
    data.needsReschedule = false;
  }

  const post = await prisma.post.update({ where: { id }, data });
  return res.json(post);
});

/**
 * Duplique une publication dans le même calendrier.
 *
 * Sert au cas le plus courant du travail éditorial : décliner un même message
 * sur un autre réseau, ou le reprogrammer à une seconde date, sans tout
 * ressaisir. La copie est toujours créée en brouillon.
 */
router.post('/:id/duplicate', validate(postDuplicateSchema), async (req, res) => {
  const { id } = req.params;
  const source = await prisma.post.findUnique({
    where: { id },
    include: { postPlan: true },
  });
  if (!source) return res.status(404).json({ error: 'Publication introuvable.' });

  const body = req.body as { network?: string; scheduledDate?: string };

  let scheduledDate = source.scheduledDate;
  if (body.scheduledDate) {
    const d = new Date(body.scheduledDate);
    if (isNaN(d.getTime())) return res.status(400).json({ error: 'Date de publication invalide.' });
    const rangeStart = new Date(source.postPlan.startDate).setHours(0, 0, 0, 0);
    const rangeEnd = new Date(source.postPlan.endDate).setHours(23, 59, 59, 999);
    if (d.getTime() < rangeStart || d.getTime() > rangeEnd) {
      return res.status(400).json({
        error: `La date doit être comprise entre le ${new Date(rangeStart).toLocaleDateString('fr-FR')} et le ${new Date(rangeEnd).toLocaleDateString('fr-FR')}.`,
      });
    }
    scheduledDate = d;
  }

  const copy = await prisma.post.create({
    data: {
      postPlanId: source.postPlanId,
      scheduledDate,
      network: body.network ?? source.network,
      title: source.title,
      content: source.content,
      hashtags: source.hashtags,
      relatedEventId: source.relatedEventId,
      status: 'DRAFT',
      needsReschedule: source.needsReschedule,
    },
    include: { relatedEvent: true },
  });
  return res.status(201).json(copy);
});

/** Supprime une publication d'un calendrier. */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Publication introuvable.' });

  await prisma.post.delete({ where: { id } });
  return res.json({ ok: true, id });
});

router.post('/:id/regenerate', aiGenerationLimiter, async (req, res) => {
  const { id } = req.params;
  try {
    const post = await regeneratePost(id);
    return res.json(post);
  } catch (e) {
    if (e instanceof AiConfigError) return res.status(400).json({ error: e.message });
    if (e instanceof AiRequestError) return res.status(502).json({ error: e.message });
    console.error('Erreur régénération post:', e);
    return res.status(500).json({ error: 'Erreur lors de la régénération de la publication.' });
  }
});

export default router;
