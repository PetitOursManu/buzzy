import type {
  AiProviderInfo,
  DateTarget,
  EventItem,
  EventScope,
  Frequency,
  McpServerInfo,
  Network,
  PostItem,
  PostPlan,
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  });

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
    request<{ models: string[]; baseUrl: string; warning?: string }>(
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
  }) => request<McpServerInfo>('/settings/mcp-servers', { method: 'POST', body: JSON.stringify(data) }),
  updateMcpServer: (
    id: string,
    data: Partial<{ name: string; url: string; authHeader: string | null; enabled: boolean; preset: string | null }>,
  ) => request<McpServerInfo>(`/settings/mcp-servers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
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
};

/* ─── Calendar ─────────────────────────────────────────────────── */
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
    request<{ postPlan: PostPlan; posts: PostItem[] }>('/calendar/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  list: () => request<PostPlan[]>('/calendar'),
  get: (id: string) => request<PostPlan>(`/calendar/${id}`),
  exportUrl: (id: string, format: 'json' | 'csv') => `/api/calendar/${id}/export?format=${format}`,
};

/* ─── Posts ────────────────────────────────────────────────────── */
export const postsApi = {
  update: (
    id: string,
    data: Partial<{ title: string; content: string; hashtags: string[]; status: string }>,
  ) => request<PostItem>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  regenerate: (id: string) => request<PostItem>(`/posts/${id}/regenerate`, { method: 'POST' }),
};
