import type {
  AiProviderInfo,
  DateTarget,
  Diagnostics,
  EventItem,
  EventScope,
  Frequency,
  McpServerInfo,
  ModelInfo,
  Network,
  PostItem,
  PostPlan,
  PostStatus,
  UserProfileInfo,
} from './types';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Session expirée.
 *
 * Le jeton vit 7 jours : un onglet resté ouvert finit par voir toutes ses
 * requêtes tomber en 401. Sans ce relais, l'application affichait des erreurs
 * en cascade sans jamais ramener vers l'écran de connexion.
 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

/** Routes dont un 401 est une réponse normale, pas une session perdue. */
const AUTH_ROUTES = ['/auth/me', '/auth/login', '/auth/logout'];

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    // Après `...options`, jamais avant : un appelant ne doit pas pouvoir
    // désactiver l'envoi du cookie de session par inadvertance.
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401 && !AUTH_ROUTES.includes(path)) {
    onUnauthorized?.();
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const message =
      (isJson && payload && typeof payload === 'object' && 'error' in payload
        ? (payload as { error: string }).error
        : null) ?? `Erreur ${res.status}`;
    throw new ApiError(message, res.status, isJson ? (payload as any)?.details : undefined);
  }
  return payload as T;
}

/* ─── Auth ─────────────────────────────────────────────────────── */
export const authApi = {
  login: (email: string, password: string) =>
    request<{ user: { id: string; email: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: { sub: string; email: string } }>('/auth/me'),
};

/* ─── Settings ─────────────────────────────────────────────────── */
export const settingsApi = {
  getDiagnostics: () => request<Diagnostics>('/settings/diagnostics'),

  getAiProvider: () => request<AiProviderInfo | null>('/settings/ai-provider'),
  saveAiProvider: (data: {
    name: string;
    baseUrl: string;
    apiKey?: string;
    selectedModel?: string | null;
    reasoningEffort?: string | null;
  }) =>
    request<AiProviderInfo>('/settings/ai-provider', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  listModels: (baseUrl: string, apiKey?: string) =>
    request<{ models: ModelInfo[]; baseUrl: string; warning?: string }>(
      '/settings/ai-provider/list-models',
      {
        method: 'POST',
        body: JSON.stringify({ baseUrl, apiKey }),
      },
    ),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/settings/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  getProfile: () => request<UserProfileInfo | null>('/settings/profile'),
  saveProfile: (data: {
    description: string;
    tone: string;
    targetAudience?: string | null;
    restrictions?: string | null;
    prioritySources?: string | null;
    preferredNetworks?: string[];
  }) => request<UserProfileInfo>('/settings/profile', { method: 'PUT', body: JSON.stringify(data) }),

  listMcpServers: () => request<McpServerInfo[]>('/settings/mcp-servers'),
  createMcpServer: (data: {
    name: string;
    url: string;
    authHeader?: string | null;
    enabled?: boolean;
    preset?: string | null;
  }) =>
    request<McpServerInfo>('/settings/mcp-servers', { method: 'POST', body: JSON.stringify(data) }),
  updateMcpServer: (
    id: string,
    data: Partial<{
      name: string;
      url: string;
      authHeader: string | null;
      enabled: boolean;
      preset: string | null;
    }>,
  ) =>
    request<McpServerInfo>(`/settings/mcp-servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteMcpServer: (id: string) =>
    request<{ ok: boolean }>(`/settings/mcp-servers/${id}`, { method: 'DELETE' }),
  testMcpServer: (id: string) =>
    request<{ ok: boolean; tools: string[]; error?: string }>(`/settings/mcp-servers/${id}/test`, {
      method: 'POST',
    }),
};

/* ─── Events ───────────────────────────────────────────────────── */
export const eventsApi = {
  generate: (data: {
    scopes: EventScope[];
    regions?: string[];
    themes: string[];
    priorityThemes?: string[];
    dateTarget: DateTarget;
    excludeIds: string[];
    count?: number;
    plan?: string;
    strictSources?: boolean;
  }) =>
    request<{ events: EventItem[]; webSearchUsed: boolean; notice: string | null }>(
      '/events/generate',
      { method: 'POST', body: JSON.stringify(data) },
    ),
  plan: (data: {
    scopes: EventScope[];
    regions?: string[];
    themes: string[];
    priorityThemes?: string[];
    dateTarget: DateTarget;
    count?: number;
  }) =>
    request<{ plan: string }>('/events/plan', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  list: (params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v));
    });
    const qs = q.toString();
    return request<{ events: EventItem[]; total: number }>(`/events${qs ? `?${qs}` : ''}`);
  },
  createManual: (data: {
    title: string;
    description: string;
    eventDate?: string | null;
    scope?: EventScope;
    theme?: string;
    region?: string | null;
  }) => request<EventItem>('/events/manual', { method: 'POST', body: JSON.stringify(data) }),
  /** Édition manuelle d'un événement déjà enregistré. */
  update: (
    id: string,
    data: Partial<{
      title: string;
      description: string;
      eventDate: string | null;
      eventPeriod: string | null;
      scope: EventScope;
      region: string | null;
      theme: string;
    }>,
  ) => request<EventItem>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: string) =>
    request<{ ok: boolean; id: string; unlinkedPosts: number }>(`/events/${id}`, {
      method: 'DELETE',
    }),
  rephrase: (id: string) => request<EventItem>(`/events/${id}/rephrase`, { method: 'POST' }),
  deleteHistory: (exceptIds: string[]) =>
    request<{ deleted: number; unlinkedPosts: number }>('/events', {
      method: 'DELETE',
      body: JSON.stringify({ exceptIds }),
    }),
};

/* ─── Calendar ─────────────────────────────────────────────────── */
export type ExportFormat = 'json' | 'csv' | 'ics';

export const calendarApi = {
  generate: (data: {
    name?: string;
    startDate: string;
    endDate: string;
    frequency: Frequency;
    networks: Network[];
    eventSource: 'selected' | 'ai';
    selectedEventIds: string[];
    discoveryFilters?: { scope: string; region?: string; themes: string[] };
  }) =>
    request<{ postPlan: PostPlan; posts: PostItem[]; warning?: string }>('/calendar/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  /** Crée un calendrier vide, sans aucune génération IA. */
  createEmpty: (data: {
    name?: string;
    startDate: string;
    endDate: string;
    frequency?: Frequency;
    networks: Network[];
  }) => request<PostPlan>('/calendar', { method: 'POST', body: JSON.stringify(data) }),
  /** Rattache un événement existant à un calendrier (une publication par réseau). */
  addEvent: (
    planId: string,
    data: { eventId: string; networks?: Network[]; scheduledDate?: string },
  ) =>
    request<{ posts: PostItem[]; postPlan: PostPlan; warning?: string }>(
      `/calendar/${planId}/events`,
      { method: 'POST', body: JSON.stringify(data) },
    ),
  /** Modifie le nom, la plage de dates ou les réseaux d'un calendrier. */
  update: (
    id: string,
    data: Partial<{ name: string; startDate: string; endDate: string; networks: Network[] }>,
  ) =>
    request<{ postPlan: PostPlan; rescheduled: number; warning?: string }>(`/calendar/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  list: () => request<PostPlan[]>('/calendar'),
  get: (id: string) => request<PostPlan>(`/calendar/${id}`),
  remove: (id: string) =>
    request<{ ok: boolean; id: string }>(`/calendar/${id}`, { method: 'DELETE' }),
  clearPosts: (id: string) =>
    request<{ deleted: number }>(`/calendar/${id}/posts`, { method: 'DELETE' }),
  exportUrl: (id: string, format: ExportFormat) => `/api/calendar/${id}/export?format=${format}`,
};

/* ─── Posts ────────────────────────────────────────────────────── */
export const postsApi = {
  /** Ajoute une publication à la main dans un calendrier (sans IA). */
  create: (data: {
    postPlanId: string;
    scheduledDate: string;
    network: Network;
    title: string;
    content?: string;
    hashtags?: string[];
    relatedEventId?: string | null;
  }) => request<PostItem>('/posts', { method: 'POST', body: JSON.stringify(data) }),
  remove: (id: string) => request<{ ok: boolean; id: string }>(`/posts/${id}`, { method: 'DELETE' }),
  update: (
    id: string,
    data: Partial<{
      title: string;
      content: string;
      hashtags: string[];
      status: PostStatus;
      scheduledDate: string;
    }>,
  ) => request<PostItem>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  /** Duplique une publication dans le même calendrier (autre réseau / autre date). */
  duplicate: (id: string, data: { network?: Network; scheduledDate?: string } = {}) =>
    request<PostItem>(`/posts/${id}/duplicate`, { method: 'POST', body: JSON.stringify(data) }),
  regenerate: (id: string) => request<PostItem>(`/posts/${id}/regenerate`, { method: 'POST' }),
};
