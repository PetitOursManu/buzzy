export type EventScope = 'GLOBAL' | 'NATIONAL' | 'REGIONAL' | 'LOCAL';
export type PostStatus = 'DRAFT' | 'APPROVED' | 'PUBLISHED';
export type Network = 'facebook' | 'instagram' | 'linkedin' | 'x' | 'tiktok';
export type Tone = 'professionnel' | 'chaleureux' | 'humoristique' | 'institutionnel';
export type McpPreset = 'brave' | 'tavily' | 'bright-data' | 'searxng' | 'custom';

export interface EventSource {
  title: string;
  url: string;
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
