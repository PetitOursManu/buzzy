import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { aiGenerationLimiter } from '../middleware/rateLimit';
import { postUpdateSchema } from './schemas';
import { regeneratePost } from '../services/calendar.service';
import { AiConfigError, AiRequestError } from '../services/ai-provider.service';

const router = Router();
router.use(requireAuth);

router.put('/:id', validate(postUpdateSchema), async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Publication introuvable.' });

  const body = req.body as {
    title?: string;
    content?: string;
    hashtags?: string[];
    status?: 'DRAFT' | 'APPROVED' | 'PUBLISHED';
  };
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.content !== undefined) data.content = body.content;
  if (body.hashtags !== undefined) data.hashtags = body.hashtags.map((h) => h.replace(/^#/, ''));
  if (body.status !== undefined) data.status = body.status;

  const post = await prisma.post.update({ where: { id }, data });
  return res.json(post);
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
