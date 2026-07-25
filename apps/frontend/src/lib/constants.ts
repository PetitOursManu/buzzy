import type { EventScope, McpPreset, Network, Tone } from './types';

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

export const SCOPES: { value: EventScope; label: string }[] = [
  { value: 'GLOBAL', label: 'Mondial' },
  { value: 'NATIONAL', label: 'National' },
  { value: 'REGIONAL', label: 'Régional' },
  { value: 'LOCAL', label: 'Local' },
];

export const SCOPE_LABEL: Record<EventScope, string> = {
  GLOBAL: 'Mondial',
  NATIONAL: 'National',
  REGIONAL: 'Régional',
  LOCAL: 'Local',
};

export const TONES: { value: Tone; label: string }[] = [
  { value: 'professionnel', label: 'Professionnel' },
  { value: 'chaleureux', label: 'Chaleureux et convivial' },
  { value: 'humoristique', label: 'Humoristique' },
  { value: 'institutionnel', label: 'Institutionnel' },
];

export const NETWORKS: { value: Network; label: string; emoji: string; color: string }[] = [
  { value: 'facebook', label: 'Facebook', emoji: '📘', color: '#1877F2' },
  { value: 'instagram', label: 'Instagram', emoji: '📸', color: '#E1306C' },
  { value: 'linkedin', label: 'LinkedIn', emoji: '💼', color: '#0A66C2' },
  { value: 'x', label: 'X', emoji: '✖️', color: '#111111' },
  { value: 'tiktok', label: 'TikTok', emoji: '🎵', color: '#00F2EA' },
];

export const NETWORK_LABEL: Record<Network, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
  tiktok: 'TikTok',
};

export const NETWORK_EMOJI: Record<Network, string> = {
  facebook: '📘',
  instagram: '📸',
  linkedin: '💼',
  x: '✖️',
  tiktok: '🎵',
};

/** Préréglages de serveurs MCP courants. */
export interface McpPresetDef {
  preset: McpPreset;
  label: string;
  url: string;
  needsAuth: boolean;
  authHint?: string;
  note: string;
}

export const MCP_PRESETS: McpPresetDef[] = [
  {
    preset: 'searxng',
    label: 'SearXNG (auto-hébergé)',
    url: 'http://searxng-mcp:8000/mcp',
    needsAuth: false,
    note: '100% gratuit, aucune clé. Déployé via docker-compose.override.yml.',
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
    note: 'Gratuit jusqu\'à 1000 crédits/mois. Résultats structurés pour IA.',
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
