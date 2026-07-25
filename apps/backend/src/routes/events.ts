import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { validate, validated } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { aiGenerationLimiter } from '../middleware/rateLimit';
import { eventGenerateSchema, eventPlanSchema, eventListQuerySchema } from './schemas';
import { generateEvents, planEvents } from '../services/event.service';
import { AiConfigError, AiRequestError } from '../services/ai-provider.service';
import type { EventScope, Prisma } from '@prisma/client';

const router = Router();
router.use(requireAuth);

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
  };
  const { scopes, regions } = resolveScopesAndRegions(body);
  try {
    const result = await generateEvents({
      scopes,
      regions,
      themes: body.themes,
      priorityThemes: body.priorityThemes ?? [],
      dateTarget: body.dateTarget,
      excludeIds: body.excludeIds,
      count: body.count,
      plan: body.plan,
    });
    return res.json({
      events: result.events,
      webSearchUsed: result.webSearchUsed,
      notice: result.notice ?? null,
    });
  } catch (e) {
    if (e instanceof AiConfigError) {
      return res.status(400).json({ error: e.message });
    }
    if (e instanceof AiRequestError) {
      return res.status(502).json({ error: e.message });
    }
    console.error('Erreur génération événements:', e);
    return res.status(500).json({ error: "Erreur inattendue lors de la génération d'événements." });
  }
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
    if (e instanceof AiConfigError) return res.status(400).json({ error: e.message });
    if (e instanceof AiRequestError) return res.status(502).json({ error: e.message });
    console.error('Erreur planification événements:', e);
    return res.status(500).json({ error: 'Erreur inattendue lors de la planification.' });
  }
});

router.get('/', validate(eventListQuerySchema, 'query'), async (req, res) => {
  const q = validated<{
    scope?: 'GLOBAL' | 'NATIONAL' | 'REGIONAL' | 'LOCAL';
    theme?: string;
    region?: string;
    verified?: 'true' | 'false';
    take: number;
    skip: number;
  }>(req, 'query');

  const where: Prisma.EventWhereInput = {};
  if (q.scope) where.scope = q.scope;
  if (q.theme) where.theme = q.theme;
  if (q.region) where.region = { contains: q.region, mode: 'insensitive' };
  if (q.verified) where.verified = q.verified === 'true';

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
