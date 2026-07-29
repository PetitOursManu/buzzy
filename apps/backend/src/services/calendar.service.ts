import { prisma } from '../lib/prisma';
import {
  chatCompletion,
  getActiveAiConfig,
  AiRequestError,
  type ChatMessage,
} from './ai-provider.service';
import {
  postGenerationSystemPrompt,
  postGenerationUserPrompt,
  type PostGenContext,
} from '../prompts';
import type { Event as PrismaEvent, Post, PostPlan, UserProfile } from '@prisma/client';

/** Description déjà générée pour un réseau au niveau de l'événement, si disponible. */
export function preGeneratedDescription(event: PrismaEvent | null, network: string): string | null {
  if (!event) return null;
  const nd = event.networkDescriptions as Record<string, unknown> | null;
  if (!nd || typeof nd !== 'object') return null;
  const val = nd[network];
  return typeof val === 'string' && val.trim() ? val.trim() : null;
}

/**
 * Saisie invalide au moment de générer un calendrier. La génération n'appelant
 * plus le LLM, ces erreurs n'ont rien d'un incident réseau : elles se traduisent
 * par un 400 et non par un 502.
 */
export class CalendarInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarInputError';
  }
}

export interface Frequency {
  type: 'day' | 'week' | 'month';
  count: number;
}

export interface CalendarGenerationInput {
  name?: string;
  startDate: Date;
  endDate: Date;
  frequency: Frequency;
  networks: string[];
  eventSource: 'selected' | 'ai';
  selectedEventIds: string[];
  // Filtres de découverte utilisés quand eventSource = 'ai'
  discoveryFilters?: {
    scope: string;
    region?: string;
    themes: string[];
  };
}

/**
 * Calcule les dates de publication réparties sur la plage selon la fréquence.
 * - day: `count` publications par jour
 * - week: `count` publications par semaine (réparties)
 * - month: `count` publications par mois (réparties)
 */
export function computeScheduleDates(
  start: Date,
  end: Date,
  freq: Frequency,
): Date[] {
  const dates: Date[] = [];
  const startMs = new Date(start).setHours(9, 0, 0, 0);
  const endMs = new Date(end).setHours(23, 59, 59, 999);
  if (endMs < startMs) return dates;

  const totalDays = Math.floor((endMs - startMs) / (24 * 3600 * 1000)) + 1;
  const count = Math.max(1, Math.min(freq.count, 50));

  if (freq.type === 'day') {
    // count publications réparties dans chaque journée (heures ouvrées 9h-18h).
    for (let d = 0; d < totalDays; d++) {
      for (let k = 0; k < count; k++) {
        const day = new Date(startMs + d * 24 * 3600 * 1000);
        const hour = count === 1 ? 10 : Math.round(9 + (k * 9) / Math.max(1, count - 1));
        day.setHours(Math.min(18, hour), 0, 0, 0);
        dates.push(new Date(day));
      }
    }
    return dates;
  }

  // week / month : on répartit `count` publications par période, également espacées.
  const periodMs = freq.type === 'week' ? 7 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
  let periodStart = startMs;
  while (periodStart <= endMs) {
    const periodEnd = Math.min(periodStart + periodMs - 1, endMs);
    const span = periodEnd - periodStart;
    for (let k = 0; k < count; k++) {
      const frac = count === 1 ? 0.4 : k / (count - 1);
      const ts = periodStart + Math.round(span * frac);
      const dt = new Date(ts);
      dt.setHours(10, 0, 0, 0);
      if (dt.getTime() >= startMs && dt.getTime() <= endMs) {
        dates.push(dt);
      }
    }
    periodStart += periodMs;
  }
  return dates.sort((a, b) => a.getTime() - b.getTime());
}

/** Récupère ou sélectionne les événements source du calendrier. */
async function resolveSourceEvents(input: CalendarGenerationInput): Promise<PrismaEvent[]> {
  if (input.eventSource === 'selected') {
    // Sélection explicite : on s'y tient strictement. Une sélection vide donne
    // un calendrier vide — jamais un repli sur des événements arbitraires.
    if (input.selectedEventIds.length === 0) return [];
    return prisma.event.findMany({ where: { id: { in: input.selectedEventIds } } });
  }
  // Mode "IA choisit" : on pioche parmi les événements persistés correspondant aux filtres.
  const where: Record<string, unknown> = {};
  if (input.discoveryFilters) {
    if (input.discoveryFilters.scope) where.scope = input.discoveryFilters.scope;
    if (input.discoveryFilters.themes?.length) where.theme = { in: input.discoveryFilters.themes };
    if (input.discoveryFilters.region) where.region = { contains: input.discoveryFilters.region, mode: 'insensitive' };
  }
  return prisma.event.findMany({ where, orderBy: { createdAt: 'desc' }, take: 30 });
}

function stripHashtagsFromContent(content: string): string {
  return content.trim();
}

function normalizeHashtags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => t?.toString().trim().replace(/^#/, ''))
    .filter((t): t is string => !!t)
    .slice(0, 15);
}

interface RawPost {
  title?: string;
  content?: string;
  hashtags?: unknown;
}

function extractJson(text: string): RawPost | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as RawPost;
  } catch {
    /* try substring */
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1)) as RawPost;
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function generateOnePost(
  config: Awaited<ReturnType<typeof getActiveAiConfig>>,
  profile: UserProfile | null,
  ctx: PostGenContext,
): Promise<{ title: string; content: string; hashtags: string[] }> {
  const messages: ChatMessage[] = [
    { role: 'system', content: postGenerationSystemPrompt(profile) },
    { role: 'user', content: postGenerationUserPrompt(ctx) },
  ];
  const res = await chatCompletion(config, { messages, temperature: 0.85 });
  const parsed = extractJson(res.message.content ?? '');
  if (!parsed) {
    return {
      title: ctx.event?.title ?? 'Publication',
      content: (res.message.content ?? '').trim() || 'Contenu à compléter.',
      hashtags: [],
    };
  }
  return {
    title: (parsed.title ?? ctx.event?.title ?? 'Publication').toString().trim(),
    content: stripHashtagsFromContent((parsed.content ?? '').toString()),
    hashtags: normalizeHashtags(parsed.hashtags),
  };
}

export interface CalendarGenerationResult {
  postPlan: PostPlan;
  posts: Post[];
  /** Message informatif quand le calendrier est créé sans publication. */
  warning?: string;
}

/** Crée l'enregistrement du calendrier, sans aucune publication. */
async function createPlanRecord(input: {
  name?: string;
  startDate: Date;
  endDate: Date;
  frequency: Frequency;
  networks: string[];
}): Promise<PostPlan> {
  return prisma.postPlan.create({
    data: {
      name: input.name?.trim() || `Calendrier ${new Date().toLocaleDateString('fr-FR')}`,
      startDate: input.startDate,
      endDate: input.endDate,
      frequency: input.frequency as unknown as object,
      networks: input.networks,
    },
  });
}

/**
 * Crée un calendrier vide : aucune publication, aucun appel à l'IA.
 * Les publications sont ensuite ajoutées à la main par l'utilisateur.
 */
export async function createEmptyCalendar(input: {
  name?: string;
  startDate: Date;
  endDate: Date;
  frequency?: Frequency;
  networks: string[];
}): Promise<PostPlan> {
  return createPlanRecord({
    ...input,
    frequency: input.frequency ?? { type: 'week', count: 1 },
  });
}

export async function generateCalendar(
  input: CalendarGenerationInput,
): Promise<CalendarGenerationResult> {
  const sourceEvents = await resolveSourceEvents(input);
  const scheduleDates = computeScheduleDates(input.startDate, input.endDate, input.frequency);

  if (scheduleDates.length === 0) {
    throw new CalendarInputError(
      'La plage de dates et la fréquence ne produisent aucune publication.',
    );
  }
  if (input.networks.length === 0) {
    throw new CalendarInputError('Sélectionnez au moins un réseau social.');
  }

  // Aucun événement source : on crée le calendrier vide plutôt que d'inventer
  // des publications sans fondement. Aucun appel à l'IA n'est effectué, la
  // configuration IA n'est donc même pas requise.
  if (sourceEvents.length === 0) {
    const emptyPlan = await createPlanRecord({
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      frequency: input.frequency,
      networks: input.networks,
    });
    return {
      postPlan: emptyPlan,
      posts: [],
      warning:
        input.eventSource === 'selected'
          ? 'Calendrier créé vide : aucun événement sélectionné. Ajoutez des publications manuellement ou sélectionnez des événements dans « Découverte ».'
          : 'Calendrier créé vide : aucun événement enregistré ne correspond aux filtres. Lancez une découverte, puis relancez la génération.',
    };
  }

  // Garde-fou : limite le nombre total de publications générées (coût/temps).
  const MAX_POSTS = 120;
  const plannedTotal = scheduleDates.length * input.networks.length;
  const dateLimit =
    plannedTotal > MAX_POSTS
      ? Math.max(1, Math.floor(MAX_POSTS / input.networks.length))
      : scheduleDates.length;
  const usedDates = scheduleDates.slice(0, dateLimit);

  const postPlan = await createPlanRecord({
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    frequency: input.frequency,
    networks: input.networks,
  });

  const posts: Post[] = [];
  let eventCursor = 0;

  for (const date of usedDates) {
    // Un événement source tourne (round-robin) sur les dates.
    const event = sourceEvents[eventCursor % sourceEvents.length];
    eventCursor++;

    for (const network of input.networks) {
      // Aucun appel au LLM ici : le titre et la description ont déjà été
      // rédigés lors de la découverte, sur la page principale. On reprend la
      // description propre à ce réseau si elle existe, sinon la description
      // générale de l'événement. Pour retoucher un texte, le bouton
      // « Régénérer » de la publication reste disponible à la demande.
      const content = preGeneratedDescription(event, network) ?? event.description;

      const post = await prisma.post.create({
        data: {
          postPlanId: postPlan.id,
          scheduledDate: date,
          network,
          title: event.title.slice(0, 300),
          content,
          hashtags: [],
          relatedEventId: event.id,
          status: 'DRAFT',
        },
      });
      posts.push(post);
    }
  }

  return { postPlan, posts };
}

/** Régénère le contenu d'une publication existante. */
export async function regeneratePost(postId: string): Promise<Post> {
  const config = await getActiveAiConfig();
  const profile = await prisma.userProfile.findFirst({ orderBy: { updatedAt: 'desc' } });
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { relatedEvent: true },
  });
  if (!post) {
    throw new AiRequestError('Publication introuvable.');
  }

  const ctx: PostGenContext = {
    network: post.network,
    scheduledDate: post.scheduledDate,
    event: post.relatedEvent
      ? {
          title: post.relatedEvent.title,
          description: post.relatedEvent.description,
          eventDate: post.relatedEvent.eventDate,
          eventPeriod: post.relatedEvent.eventPeriod,
          theme: post.relatedEvent.theme,
        }
      : null,
    // Publication ajoutée à la main : on reformule son texte au lieu
    // d'inventer un événement de toutes pièces.
    baseContent: post.relatedEvent ? null : { title: post.title, content: post.content },
  };

  const generated = await generateOnePost(config, profile, ctx);
  return prisma.post.update({
    where: { id: postId },
    data: {
      title: generated.title.slice(0, 300),
      content: generated.content,
      hashtags: generated.hashtags,
    },
  });
}
