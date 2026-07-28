import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Email invalide.'),
  password: z.string().min(1, 'Mot de passe requis.'),
});

export const aiProviderSchema = z.object({
  name: z.string().min(1, 'Nom du fournisseur requis.').max(120),
  baseUrl: z.string().url("URL de base invalide (ex: https://openrouter.ai/api/v1)."),
  // Clé optionnelle : si absente/vide à la mise à jour, on conserve l'existante.
  apiKey: z.string().max(500).optional(),
  selectedModel: z.string().max(200).optional().nullable(),
  // Effort de réflexion : null/none/low/medium/high.
  reasoningEffort: z.enum(['none', 'low', 'medium', 'high']).optional().nullable(),
});

export const listModelsSchema = z.object({
  baseUrl: z.string().url('URL de base invalide.'),
  // Si vide, on réutilise la clé déjà enregistrée.
  apiKey: z.string().max(500).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis.'),
  newPassword: z
    .string()
    .min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères.')
    .max(200),
});

export const profileSchema = z.object({
  description: z.string().max(4000).default(''),
  tone: z.enum(['professionnel', 'chaleureux', 'humoristique', 'institutionnel']),
  targetAudience: z.string().max(1000).optional().nullable(),
  restrictions: z.string().max(4000).optional().nullable(),
  prioritySources: z.string().max(4000).optional().nullable(),
  preferredNetworks: z
    .array(z.enum(['facebook', 'instagram', 'linkedin', 'x', 'tiktok']))
    .max(5)
    .optional()
    .default([]),
});

export const mcpServerCreateSchema = z.object({
  name: z.string().min(1, 'Nom requis.').max(120),
  url: z.string().url('URL invalide.'),
  authHeader: z.string().max(500).optional().nullable(),
  enabled: z.boolean().optional().default(false),
  preset: z.enum(['brave', 'tavily', 'bright-data', 'searxng', 'custom']).optional().nullable(),
});

export const mcpServerUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  url: z.string().url('URL invalide.').optional(),
  // "" => efface l'auth ; absent => inchangé ; valeur => (re)chiffrée.
  authHeader: z.string().max(500).optional().nullable(),
  enabled: z.boolean().optional(),
  preset: z.enum(['brave', 'tavily', 'bright-data', 'searxng', 'custom']).optional().nullable(),
});

const dateTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('month'),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000).max(2100),
  }),
  z.object({ kind: z.literal('date'), date: z.string().min(1) }),
  z.object({ kind: z.literal('range'), start: z.string().min(1), end: z.string().min(1) }),
]);

const scopeEnum = z.enum(['GLOBAL', 'NATIONAL', 'REGIONAL', 'LOCAL']);

export const eventGenerateSchema = z.object({
  // Rétrocompatibilité : ancien champ unique.
  scope: scopeEnum.optional(),
  // Plusieurs portées possibles.
  scopes: z.array(scopeEnum).max(4).optional().default([]),
  // Rétrocompatibilité : ancien champ unique.
  region: z.string().max(200).optional().nullable(),
  // Plusieurs localisations possibles (villes / régions).
  regions: z.array(z.string().max(200)).max(20).optional().default([]),
  themes: z.array(z.string().max(120)).max(20).default([]),
  // Jusqu'à 2 thèmes prioritaires parmi les thèmes sélectionnés.
  priorityThemes: z.array(z.string().max(120)).max(2).optional().default([]),
  dateTarget: dateTargetSchema,
  excludeIds: z.array(z.string()).max(500).default([]),
  count: z.number().int().min(1).max(12).optional().default(9),
  // Plan validé (mode planification).
  plan: z.string().max(6000).optional(),
  // Mode strict : n'accepter que les événements avec une source qui répond.
  strictSources: z.boolean().optional().default(false),
});

export const eventPlanSchema = z.object({
  scope: scopeEnum.optional(),
  scopes: z.array(scopeEnum).max(4).optional().default([]),
  region: z.string().max(200).optional().nullable(),
  regions: z.array(z.string().max(200)).max(20).optional().default([]),
  themes: z.array(z.string().max(120)).max(20).default([]),
  priorityThemes: z.array(z.string().max(120)).max(2).optional().default([]),
  dateTarget: dateTargetSchema,
  count: z.number().int().min(1).max(12).optional().default(9),
});

export const manualEventSchema = z.object({
  title: z.string().min(1, 'Titre requis.').max(300),
  description: z.string().min(1, 'Description requise.').max(4000),
  eventDate: z.string().optional().nullable(),
  eventPeriod: z.string().max(120).optional().nullable(),
  scope: scopeEnum.optional().default('NATIONAL'),
  region: z.string().max(200).optional().nullable(),
  theme: z.string().max(120).optional().default('Autre'),
});

export const deleteEventsSchema = z.object({
  exceptIds: z.array(z.string()).max(1000).optional().default([]),
});

export const eventListQuerySchema = z.object({
  scope: z.enum(['GLOBAL', 'NATIONAL', 'REGIONAL', 'LOCAL']).optional(),
  theme: z.string().max(120).optional(),
  region: z.string().max(200).optional(),
  verified: z.enum(['true', 'false']).optional(),
  take: z.coerce.number().int().min(1).max(200).optional().default(60),
  skip: z.coerce.number().int().min(0).optional().default(0),
});

export const calendarGenerateSchema = z.object({
  name: z.string().max(160).optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  frequency: z.object({
    type: z.enum(['day', 'week', 'month']),
    count: z.number().int().min(1).max(50),
  }),
  networks: z
    .array(z.enum(['facebook', 'instagram', 'linkedin', 'x', 'tiktok']))
    .min(1, 'Sélectionnez au moins un réseau.'),
  eventSource: z.enum(['selected', 'ai']),
  selectedEventIds: z.array(z.string()).max(200).default([]),
  discoveryFilters: z
    .object({
      scope: z.string(),
      region: z.string().optional(),
      themes: z.array(z.string()).default([]),
    })
    .optional(),
});

export const postUpdateSchema = z.object({
  title: z.string().max(300).optional(),
  content: z.string().max(8000).optional(),
  hashtags: z.array(z.string().max(80)).max(30).optional(),
  status: z.enum(['DRAFT', 'APPROVED', 'PUBLISHED']).optional(),
});
