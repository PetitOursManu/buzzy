import { prisma } from '../lib/prisma';
import {
  chatCompletion,
  getActiveAiConfig,
  AiRequestError,
  type ChatMessage,
  type ToolDefinition,
} from './ai-provider.service';
import {
  connectMcpServer,
  mcpToolsToOpenAI,
  callMcpTool,
  type ConnectedMcpServer,
} from './mcp.service';
import {
  eventGenerationSystemPrompt,
  eventGenerationUserPrompt,
  eventPlanSystemPrompt,
  eventPlanUserPrompt,
  type EventGenParams,
  type DateTarget,
} from '../prompts';
import type { EventScope, Event as PrismaEvent } from '@prisma/client';

const MAX_TOOL_ITERATIONS = 5;

export interface GeneratedEventInput {
  scopes: EventScope[];
  regions: string[];
  themes: string[];
  priorityThemes: string[];
  dateTarget: DateTarget;
  excludeIds: string[];
  count: number;
  plan?: string;
}

export interface EventGenerationResult {
  events: PrismaEvent[];
  webSearchUsed: boolean;
  toolCallingUnsupported: boolean;
  notice?: string;
}

interface RawEvent {
  title?: string;
  description?: string;
  scope?: string;
  region?: string | null;
  theme?: string;
  eventDate?: string | null;
  eventPeriod?: string | null;
  sources?: Array<{ title?: string; url?: string }>;
  networkDescriptions?: Record<string, unknown>;
}

const VALID_SCOPES: EventScope[] = ['GLOBAL', 'NATIONAL', 'REGIONAL', 'LOCAL'];

/** Extrait les descriptions par réseau, limitées aux réseaux demandés. */
function cleanNetworkDescriptions(
  raw: RawEvent['networkDescriptions'],
  preferredNetworks: string[],
): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || preferredNetworks.length === 0) return null;
  const out: Record<string, string> = {};
  for (const net of preferredNetworks) {
    const val = (raw as Record<string, unknown>)[net];
    if (typeof val === 'string' && val.trim()) {
      out[net] = val.trim();
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function coerceScope(value: string | undefined, fallback: EventScope): EventScope {
  const up = (value ?? '').toUpperCase() as EventScope;
  return VALID_SCOPES.includes(up) ? up : fallback;
}

function cleanSources(sources: RawEvent['sources']): { list: { title: string; url: string }[]; hasValid: boolean } {
  if (!Array.isArray(sources)) return { list: [], hasValid: false };
  const list = sources
    .map((s) => ({ title: (s?.title ?? '').toString().trim(), url: (s?.url ?? '').toString().trim() }))
    .filter((s) => /^https?:\/\//i.test(s.url))
    .map((s) => ({ title: s.title || s.url, url: s.url }));
  return { list, hasValid: list.length > 0 };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* try to locate a JSON object */
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Prépare les connexions MCP actives (si la recherche web est activée). */
async function prepareMcpConnections(): Promise<{
  connections: ConnectedMcpServer[];
  tools: ToolDefinition[];
  lookup: ReturnType<typeof mcpToolsToOpenAI>['lookup'];
}> {
  const servers = await prisma.mcpServer.findMany({ where: { enabled: true } });
  const connections: ConnectedMcpServer[] = [];
  let index = 0;
  for (const server of servers) {
    try {
      const conn = await connectMcpServer(server, index++);
      connections.push(conn);
    } catch {
      // Un serveur MCP indisponible ne doit pas bloquer la génération.
    }
  }
  const { tools, lookup } = mcpToolsToOpenAI(connections);
  return { connections, tools, lookup };
}

/**
 * Boucle d'orchestration de tool calling : le modèle peut demander plusieurs
 * recherches web (via MCP) avant de produire sa réponse JSON finale.
 * Retourne le texte final produit par le modèle et si des outils ont servi.
 */
async function runChatWithTools(
  config: Awaited<ReturnType<typeof getActiveAiConfig>>,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  lookup: ReturnType<typeof mcpToolsToOpenAI>['lookup'],
): Promise<{ finalText: string; toolsUsed: boolean; toolCallingUnsupported: boolean }> {
  let toolsUsed = false;

  // Sans outils : appel simple.
  if (tools.length === 0) {
    const res = await chatCompletion(config, { messages, temperature: 0.8 });
    return { finalText: res.message.content ?? '', toolsUsed: false, toolCallingUnsupported: false };
  }

  const working = [...messages];
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    let res;
    try {
      res = await chatCompletion(config, { messages: working, tools, temperature: 0.8 });
    } catch (e) {
      // Modèle ne supportant pas le tool calling → repli sans outils.
      if (e instanceof AiRequestError && (e.status === 400 || e.status === 404 || e.status === 422)) {
        const fallback = await chatCompletion(config, { messages, temperature: 0.8 });
        return {
          finalText: fallback.message.content ?? '',
          toolsUsed,
          toolCallingUnsupported: true,
        };
      }
      throw e;
    }

    const toolCalls = res.message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return { finalText: res.message.content ?? '', toolsUsed, toolCallingUnsupported: false };
    }

    // On rejoue le message assistant contenant les appels d'outils.
    working.push({
      role: 'assistant',
      content: res.message.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const entry = lookup.get(call.function.name);
      let toolResult: string;
      if (!entry) {
        toolResult = 'Outil inconnu.';
      } else {
        toolsUsed = true;
        let args: Record<string, unknown> = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          args = {};
        }
        try {
          toolResult = await callMcpTool(entry, args);
        } catch (e) {
          toolResult = `Erreur lors de la recherche : ${(e as Error).message}`;
        }
      }
      working.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: toolResult.slice(0, 6000),
      });
    }
  }

  // Trop d'itérations : on force une réponse finale sans outils.
  const finalRes = await chatCompletion(config, { messages: working, temperature: 0.7 });
  return { finalText: finalRes.message.content ?? '', toolsUsed, toolCallingUnsupported: false };
}

export async function generateEvents(input: GeneratedEventInput): Promise<EventGenerationResult> {
  const config = await getActiveAiConfig();

  // Titres à exclure (déjà affichés).
  let excludeTitles: string[] = [];
  if (input.excludeIds.length > 0) {
    const existing = await prisma.event.findMany({
      where: { id: { in: input.excludeIds } },
      select: { title: true },
    });
    excludeTitles = existing.map((e) => e.title);
  }

  // Réseaux préférés (descriptions par réseau) issus du profil.
  const profile = await prisma.userProfile.findFirst({ orderBy: { updatedAt: 'desc' } });
  const preferredNetworks = profile?.preferredNetworks ?? [];

  // Recherche web MCP ?
  const mcpEnabledCount = await prisma.mcpServer.count({ where: { enabled: true } });
  const webSearchRequested = mcpEnabledCount > 0;

  const { connections, tools, lookup } = webSearchRequested
    ? await prepareMcpConnections()
    : { connections: [], tools: [], lookup: new Map() };

  const webSearchAvailable = tools.length > 0;

  const params: EventGenParams = {
    scopes: input.scopes,
    regions: input.regions,
    themes: input.themes,
    priorityThemes: input.priorityThemes,
    dateTarget: input.dateTarget,
    excludeTitles,
    count: input.count,
    webSearchEnabled: webSearchAvailable,
    plan: input.plan,
    preferredNetworks,
  };

  const messages: ChatMessage[] = [
    { role: 'system', content: eventGenerationSystemPrompt(webSearchAvailable) },
    { role: 'user', content: eventGenerationUserPrompt(params) },
  ];

  let finalText = '';
  let toolsUsed = false;
  let toolCallingUnsupported = false;
  try {
    const result = await runChatWithTools(config, messages, tools, lookup);
    finalText = result.finalText;
    toolsUsed = result.toolsUsed;
    toolCallingUnsupported = result.toolCallingUnsupported;
  } finally {
    await Promise.all(connections.map((c) => c.close()));
  }

  const parsed = extractJson(finalText) as { events?: RawEvent[] } | null;
  const rawEvents = parsed?.events ?? [];
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    throw new AiRequestError(
      "Le modèle n'a pas renvoyé d'événements exploitables. Réessayez ou changez de modèle.",
    );
  }

  const created: PrismaEvent[] = [];
  for (const raw of rawEvents) {
    if (!raw.title || !raw.description) continue;
    const { list: sources, hasValid } = cleanSources(raw.sources);
    // "verified" = true seulement si la recherche web a réellement servi ET des sources valides existent.
    const verified = toolsUsed && hasValid;
    let eventDate: Date | null = null;
    if (raw.eventDate) {
      const d = new Date(raw.eventDate);
      if (!isNaN(d.getTime())) eventDate = d;
    }
    const networkDescriptions = cleanNetworkDescriptions(raw.networkDescriptions, preferredNetworks);
    const event = await prisma.event.create({
      data: {
        title: raw.title.trim().slice(0, 300),
        description: raw.description.trim(),
        scope: coerceScope(raw.scope, input.scopes[0] ?? 'GLOBAL'),
        region: raw.region?.toString().trim() || input.regions[0] || null,
        theme: (raw.theme ?? input.themes[0] ?? 'Autre').toString().trim(),
        eventDate,
        eventPeriod: raw.eventPeriod?.toString().trim() || null,
        sources: sources,
        networkDescriptions: networkDescriptions ?? undefined,
        verified,
      },
    });
    created.push(event);
  }

  let notice: string | undefined;
  if (webSearchRequested && !webSearchAvailable) {
    notice = "La recherche web MCP est activée mais aucun serveur n'a pu être contacté. Génération effectuée sans recherche web.";
  } else if (toolCallingUnsupported) {
    notice = "Le modèle sélectionné ne prend pas en charge le tool calling : génération effectuée sans recherche web.";
  }

  return {
    events: created,
    webSearchUsed: toolsUsed,
    toolCallingUnsupported,
    notice,
  };
}

export interface PlanInput {
  scopes: EventScope[];
  regions: string[];
  themes: string[];
  priorityThemes: string[];
  dateTarget: DateTarget;
  count: number;
}

/**
 * Mode planification : demande au modèle un plan d'approche court, que
 * l'utilisateur validera avant la génération réelle.
 */
export async function planEvents(input: PlanInput): Promise<{ plan: string }> {
  const config = await getActiveAiConfig();
  const webSearchAvailable = (await prisma.mcpServer.count({ where: { enabled: true } })) > 0;

  const params: EventGenParams = {
    scopes: input.scopes,
    regions: input.regions,
    themes: input.themes,
    priorityThemes: input.priorityThemes,
    dateTarget: input.dateTarget,
    excludeTitles: [],
    count: input.count,
    webSearchEnabled: webSearchAvailable,
    preferredNetworks: [],
  };

  const messages: ChatMessage[] = [
    { role: 'system', content: eventPlanSystemPrompt() },
    { role: 'user', content: eventPlanUserPrompt(params) },
  ];
  const res = await chatCompletion(config, { messages, temperature: 0.5 });
  const plan = (res.message.content ?? '').trim();
  if (!plan) {
    throw new AiRequestError("Le modèle n'a pas produit de plan. Réessayez.");
  }
  return { plan };
}
