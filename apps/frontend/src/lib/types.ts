export type EventScope = 'GLOBAL' | 'NATIONAL' | 'REGIONAL' | 'LOCAL';
export type PostStatus = 'DRAFT' | 'APPROVED' | 'PUBLISHED';
export type Network = 'facebook' | 'instagram' | 'linkedin' | 'x' | 'tiktok';
export type Tone = 'professionnel' | 'chaleureux' | 'humoristique' | 'institutionnel';
export type McpPreset = 'brave' | 'tavily' | 'bright-data' | 'searxng' | 'custom';

export type SourceStatus = 'ok' | 'redirected' | 'unreachable' | 'unchecked';

export interface EventSource {
  title: string;
  url: string;
  /** Absent sur les événements générés avant la vérification des liens. */
  status?: SourceStatus;
}

export interface EventItem {
  id: string;
  title: string;
  description: string;
  scope: EventScope;
  region: string | null;
  theme: string;
  eventDate: string | null;
  eventPeriod: string | null;
  sources: EventSource[];
  networkDescriptions: Partial<Record<Network, string>> | null;
  verified: boolean;
  createdAt: string;
}

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export interface AiProviderInfo {
  id: string;
  name: string;
  baseUrl: string;
  selectedModel: string | null;
  reasoningEffort: ReasoningEffort | null;
  keyConfigured: boolean;
  keyLast4: string;
  updatedAt: string;
}

export interface UserProfileInfo {
  id: string;
  description: string;
  tone: Tone;
  targetAudience: string | null;
  restrictions: string | null;
  prioritySources: string | null;
  preferredNetworks: Network[];
  updatedAt: string;
}

export interface McpServerInfo {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  preset: McpPreset | null;
  authConfigured: boolean;
  createdAt: string;
}

export interface Frequency {
  type: 'day' | 'week' | 'month';
  count: number;
}

export interface PostItem {
  id: string;
  postPlanId: string;
  scheduledDate: string;
  network: Network;
  title: string;
  content: string;
  hashtags: string[];
  relatedEventId: string | null;
  relatedEvent?: EventItem | null;
  status: PostStatus;
  /** L'événement lié est daté hors de la plage : une date reste à attribuer. */
  needsReschedule?: boolean;
  createdAt: string;
}

export interface PostPlan {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  frequency: Frequency;
  networks: Network[];
  createdAt: string;
  posts?: PostItem[];
  _count?: { posts: number };
}

export type DateTarget =
  | { kind: 'month'; month: number; year: number }
  | { kind: 'date'; date: string }
  | { kind: 'range'; start: string; end: string };

/** Modèle proposé par le fournisseur IA, avec sa prise en charge des tools. */
export interface ModelInfo {
  id: string;
  /** `null` quand le fournisseur ne renseigne pas la capacité. */
  supportsTools: boolean | null;
}

/** État de santé fonctionnel de l'installation (Paramètres → Diagnostic). */
export interface Diagnostics {
  version: string;
  ai: {
    configured: boolean;
    baseUrl: string | null;
    model: string | null;
    keyConfigured: boolean;
    /** `false` signale presque toujours un ENCRYPTION_KEY modifié après coup. */
    keyDecryptable: boolean | null;
  };
  profile: {
    configured: boolean;
    hasDescription: boolean;
    preferredNetworks: Network[];
  };
  webSearch: {
    registered: number;
    enabled: number;
    servers: {
      id: string;
      name: string;
      url: string;
      reachable: boolean;
      toolCount: number;
      error?: string;
    }[];
  };
  content: { events: number; calendars: number };
}
