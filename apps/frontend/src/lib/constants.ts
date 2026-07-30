import type { IconName } from '../components/icons';
import type { EventScope, McpPreset, Network, PostStatus, Tone } from './types';

export const THEMES = [
  'Technologie',
  'Culture & Arts',
  'Sport',
  'Environnement & Écologie',
  'Santé & Bien-être',
  'Business & Économie',
  'Société & Solidarité',
  'Éducation',
  'Gastronomie',
  'Handicap, Inclusion & Vie associative',
  'Autre',
] as const;

export const SCOPES: { value: EventScope; label: string; icon: IconName }[] = [
  { value: 'GLOBAL', label: 'Mondial', icon: 'globe' },
  { value: 'NATIONAL', label: 'National', icon: 'flag' },
  { value: 'REGIONAL', label: 'Régional', icon: 'map' },
  { value: 'LOCAL', label: 'Local', icon: 'map-pin' },
];

export const SCOPE_LABEL: Record<EventScope, string> = {
  GLOBAL: 'Mondial',
  NATIONAL: 'National',
  REGIONAL: 'Régional',
  LOCAL: 'Local',
};

export const SCOPE_ICON: Record<EventScope, IconName> = {
  GLOBAL: 'globe',
  NATIONAL: 'flag',
  REGIONAL: 'map',
  LOCAL: 'map-pin',
};

export const TONES: { value: Tone; label: string }[] = [
  { value: 'professionnel', label: 'Professionnel' },
  { value: 'chaleureux', label: 'Chaleureux et convivial' },
  { value: 'humoristique', label: 'Humoristique' },
  { value: 'institutionnel', label: 'Institutionnel' },
];

export const NETWORKS: { value: Network; label: string; color: string }[] = [
  { value: 'facebook', label: 'Facebook', color: '#1877F2' },
  { value: 'instagram', label: 'Instagram', color: '#E1306C' },
  { value: 'linkedin', label: 'LinkedIn', color: '#0A66C2' },
  { value: 'x', label: 'X', color: '#111111' },
  { value: 'tiktok', label: 'TikTok', color: '#00C4B4' },
];

export const NETWORK_LABEL: Record<Network, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
  tiktok: 'TikTok',
};

/**
 * Limites de caractères par réseau, à titre indicatif dans l'éditeur.
 * Ce sont les plafonds réels des plateformes, pas les longueurs conseillées.
 */
export const NETWORK_LIMIT: Record<Network, number> = {
  facebook: 63206,
  instagram: 2200,
  linkedin: 3000,
  x: 280,
  tiktok: 2200,
};

/** Longueur au-delà de laquelle un texte devient trop long pour bien passer. */
export const NETWORK_RECOMMENDED: Record<Network, number> = {
  facebook: 500,
  instagram: 400,
  linkedin: 1200,
  x: 280,
  tiktok: 200,
};

export const POST_STATUS: { value: PostStatus; label: string; icon: IconName }[] = [
  { value: 'DRAFT', label: 'Brouillon', icon: 'pencil' },
  { value: 'APPROVED', label: 'Validée', icon: 'check-circle' },
  { value: 'PUBLISHED', label: 'Publiée', icon: 'send' },
];

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  DRAFT: 'Brouillon',
  APPROVED: 'Validée',
  PUBLISHED: 'Publiée',
};

export const POST_STATUS_TONE: Record<PostStatus, 'neutral' | 'accent' | 'success'> = {
  DRAFT: 'neutral',
  APPROVED: 'accent',
  PUBLISHED: 'success',
};

/** Préréglages de serveurs MCP courants. */
export interface McpPresetDef {
  preset: McpPreset;
  label: string;
  url: string;
  needsAuth: boolean;
  authHint?: string;
  note: string;
  /** Livré et déployé par la stack Docker de Buzzy. */
  bundled?: boolean;
}

export const MCP_PRESETS: McpPresetDef[] = [
  {
    preset: 'searxng',
    label: 'SearXNG — recherche web',
    url: 'http://searxng-mcp:8000/mcp',
    needsAuth: false,
    bundled: true,
    note: '100 % gratuit, aucune clé. Déployé avec Buzzy. Trouve les événements sur le web.',
  },
  {
    preset: 'custom',
    label: 'Fetch — lecture de pages',
    url: 'http://mcp-fetch:8000/mcp',
    needsAuth: false,
    bundled: true,
    note: "100 % gratuit, aucune clé. Ouvre les pages trouvées pour VÉRIFIER qu'un événement existe. Le plus efficace contre les inventions.",
  },
  {
    preset: 'custom',
    label: 'Time — date du jour',
    url: 'http://mcp-time:8000/mcp',
    needsAuth: false,
    bundled: true,
    note: "100 % gratuit, aucune clé. Donne la date réelle : évite les erreurs d'année et d'édition.",
  },
  {
    preset: 'brave',
    label: 'Brave Search MCP',
    url: 'https://mcp.brave.com/mcp',
    needsAuth: true,
    authHint: 'X-Subscription-Token: VOTRE_CLE',
    note: 'Gratuit avec limite puis payant. Nécessite une clé API Brave.',
  },
  {
    preset: 'tavily',
    label: 'Tavily MCP',
    url: 'https://mcp.tavily.com/mcp/',
    needsAuth: true,
    authHint: 'Authorization: Bearer tvly-...',
    note: "Gratuit jusqu'à 1000 crédits/mois. Résultats structurés pour IA.",
  },
  {
    preset: 'bright-data',
    label: 'Bright Data MCP',
    url: 'https://mcp.brightdata.com/mcp',
    needsAuth: true,
    authHint: 'Authorization: Bearer VOTRE_TOKEN',
    note: 'Gratuit jusqu\'à 5000 requêtes/mois. Le plus robuste (anti-blocage).',
  },
];

export function monthName(month: number, year: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}
