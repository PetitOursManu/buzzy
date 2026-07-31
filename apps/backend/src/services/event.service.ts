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
import { verifySources, type RawSource } from './source-check.service';
import { createDeadline, type Deadline } from '../lib/deadline';
import { extractJsonObject } from '../lib/json-extract';
import { NotFoundError } from '../lib/ai-errors';
import {
  eventGenerationSystemPrompt,
  eventGenerationUserPrompt,
  eventPlanSystemPrompt,
  eventPlanUserPrompt,
  eventRephraseSystemPrompt,
  eventRephraseUserPrompt,
  type EventGenParams,
  type DateTarget,
} from '../prompts';
import type { EventScope, Event as PrismaEvent, Prisma } from '@prisma/client';

// Plusieurs serveurs MCP (recherche + lecture de page + date) impliquent
// davantage d'allers-retours avant la réponse finale.
const MAX_TOOL_ITERATIONS = 10;

/**
 * Budget total d'une génération, tous appels confondus.
 *
 * Généreux : la génération tourne en tâche de fond et la requête HTTP a déjà
 * rendu la main, donc aucun délai de proxy ne s'y applique. Ce budget n'est
 * plus là que pour éviter une tâche qui ne finirait jamais.
 */
const GENERATION_TIMEOUT_MS = Math.max(
  20_000,
  Number.parseInt(process.env.BUZZY_GENERATION_TIMEOUT_MS ?? '', 10) || 240_000,
);

/**
 * Temps mis de côté pour la réponse finale. Quand il ne reste plus que cela,
 * on cesse de chercher et on demande au modèle de conclure : mieux vaut une
 * liste établie à partir des recherches déjà faites qu'une erreur sèche.
 */
const FINAL_ANSWER_RESERVE_MS = 25_000;

export interface GeneratedEventInput {
  scopes: EventScope[];
  regions: string[];
  themes: string[];
  priorityThemes: string[];
  dateTarget: DateTarget;
  excludeIds: string[];
  count: number;
  plan?: string;
  /** Mode strict : n'accepter que les événements avec au moins un lien qui répond. */
  strictSources?: boolean;
  /** Compte rendu d'avancement, affiché pendant l'attente. */
  onProgress?: (message: string) => void;
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
  certainty?: string;
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

/** Extrait et nettoie les sources brutes renvoyées par le modèle (sans vérification réseau). */
function cleanSources(sources: RawEvent['sources']): RawSource[] {
  if (!Array.isArray(sources)) return [];
  return sources
    .map((s) => ({ title: (s?.title ?? '').toString().trim(), url: (s?.url ?? '').toString().trim() }))
    .filter((s) => /^https?:\/\//i.test(s.url))
    .map((s) => ({ title: s.title || s.url, url: s.url }));
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
  deadline: Deadline,
  onProgress: (message: string) => void,
): Promise<{
  finalText: string;
  toolsUsed: boolean;
  toolCallingUnsupported: boolean;
  /** 'length' signale une réponse coupée faute de jetons. */
  finishReason: string | null;
}> {
  let toolsUsed = false;
  const signal = deadline.signal;

  // Sans outils : appel simple.
  if (tools.length === 0) {
    // Sans outils, le modèle ne doit produire QUE du JSON : on peut le lui
    // imposer. Un fournisseur qui refuse `response_format` le fait savoir en
    // 400, et la boucle de retrait des paramètres s'en charge.
    onProgress('Interrogation du modèle…');
    const res = await chatCompletion(config, {
      messages,
      temperature: 0.8,
      responseFormatJson: true,
      signal,
    });
    return {
      finalText: res.message.content ?? '',
      toolsUsed: false,
      toolCallingUnsupported: false,
      finishReason: res.finishReason,
    };
  }

  const working = [...messages];
  let iterations = 0;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    // Il faut garder de quoi rédiger la réponse : une itération de plus
    // consommerait le budget sans rien produire d'exploitable.
    if (deadline.remainingMs() < FINAL_ANSWER_RESERVE_MS) {
      console.warn(
        `[events] budget de temps presque épuisé après ${iterations} recherche(s) ` +
          `(${Math.round(deadline.elapsedMs() / 1000)} s) — passage à la rédaction.`,
      );
      break;
    }
    iterations++;
    onProgress(
      iterations === 1
        ? 'Interrogation du modèle…'
        : `Recherche web en cours (${iterations - 1} recherche(s) effectuée(s))…`,
    );

    let res;
    try {
      res = await chatCompletion(config, { messages: working, tools, temperature: 0.8, signal });
    } catch (e) {
      // Modèle ne supportant pas le tool calling → repli sans outils.
      // On tente le repli pour TOUT refus du fournisseur (et pas seulement
      // 400/404/422) : plusieurs passerelles répondent 500 ou 503 lorsqu'elles
      // ne savent pas relayer les outils, et l'utilisateur n'obtenait alors
      // rien du tout. Une expiration du budget, elle, n'a pas de statut et ne
      // doit surtout pas relancer un appel.
      if (e instanceof AiRequestError && e.status !== undefined && !deadline.expired()) {
        console.warn(
          `[events] le fournisseur a refusé les outils (HTTP ${e.status}) — ` +
            'nouvelle tentative sans recherche web.',
        );
        const fallback = await chatCompletion(config, { messages, temperature: 0.8, signal });
        return {
          finalText: fallback.message.content ?? '',
          toolsUsed,
          toolCallingUnsupported: true,
          finishReason: fallback.finishReason,
        };
      }
      throw e;
    }

    const toolCalls = res.message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return {
        finalText: res.message.content ?? '',
        toolsUsed,
        toolCallingUnsupported: false,
        finishReason: res.finishReason,
      };
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
        // La spécification OpenAI veut une chaîne JSON, mais Ollama et
        // plusieurs passerelles renvoient directement un objet. Le parser
        // aveuglément vidait les paramètres : les outils étaient alors appelés
        // sans argument, en boucle et sans résultat.
        let args: Record<string, unknown> = {};
        const rawArgs: unknown = call.function.arguments;
        if (rawArgs && typeof rawArgs === 'object') {
          args = rawArgs as Record<string, unknown>;
        } else if (typeof rawArgs === 'string' && rawArgs.trim()) {
          try {
            args = JSON.parse(rawArgs);
          } catch {
            console.warn(
              `[events] arguments illisibles pour ${call.function.name} : ${rawArgs.slice(0, 200)}`,
            );
          }
        }
        try {
          toolResult = await callMcpTool(entry, args, signal);
        } catch (e) {
          // Un outil qui échoue n'interrompt pas la génération : le modèle
          // reçoit l'erreur et peut chercher autrement.
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

  // Budget épuisé ou trop d'itérations : on force une réponse finale sans
  // outils, à partir de ce qui a déjà été trouvé.
  onProgress('Rédaction des événements…');
  // Certains fournisseurs refusent un historique contenant des `tool_calls`
  // si le tableau `tools` n'accompagne pas la requête. On le conserve donc, en
  // interdisant simplement d'en appeler de nouveaux.
  try {
    const finalRes = await chatCompletion(config, {
      messages: working,
      temperature: 0.7,
      tools,
      toolChoice: 'none',
      responseFormatJson: true,
      signal,
    });
    return {
      finalText: finalRes.message.content ?? '',
      toolsUsed,
      toolCallingUnsupported: false,
      finishReason: finalRes.finishReason,
    };
  } catch (e) {
    // Dernier recours : repartir de la consigne d'origine, sans l'historique
    // d'outils. Mieux vaut une liste établie de mémoire qu'une erreur sèche.
    if (e instanceof AiRequestError && e.status !== undefined && !deadline.expired()) {
      console.warn(
        `[events] rédaction finale refusée (HTTP ${e.status}) — reprise sans historique d'outils.`,
      );
      const rescue = await chatCompletion(config, {
        messages,
        temperature: 0.7,
        responseFormatJson: true,
        signal,
      });
      return {
        finalText: rescue.message.content ?? '',
        toolsUsed,
        toolCallingUnsupported: false,
        finishReason: rescue.finishReason,
      };
    }
    throw e;
  }
}

export async function generateEvents(input: GeneratedEventInput): Promise<EventGenerationResult> {
  const progress = input.onProgress ?? (() => undefined);
  progress('Préparation…');
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

  if (webSearchRequested) progress('Connexion aux serveurs de recherche web…');
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
    prioritySources: profile?.prioritySources ?? undefined,
  };

  const messages: ChatMessage[] = [
    { role: 'system', content: eventGenerationSystemPrompt(webSearchAvailable) },
    { role: 'user', content: eventGenerationUserPrompt(params) },
  ];

  let finalText = '';
  let toolsUsed = false;
  let toolCallingUnsupported = false;
  let finishReason: string | null = null;
  const deadline = createDeadline(GENERATION_TIMEOUT_MS);
  try {
    const result = await runChatWithTools(config, messages, tools, lookup, deadline, progress);
    finalText = result.finalText;
    toolsUsed = result.toolsUsed;
    toolCallingUnsupported = result.toolCallingUnsupported;
    finishReason = result.finishReason;
  } finally {
    deadline.dispose();
    await Promise.all(connections.map((c) => c.close()));
  }

  // `length` : le modèle a été coupé faute de jetons. Son JSON est alors
  // syntaxiquement invalide, alors que les événements déjà écrits sont
  // parfaitement lisibles — l'extracteur les récupère.
  const truncated = finishReason === 'length';
  const extracted = extractJsonObject(finalText, { requiredKey: 'events' });
  const parsed = extracted?.value as Record<string, unknown> | undefined;

  /**
   * Le schéma demandé est { events: [...] }, mais les modèles s'en écartent
   * volontiers : tableau nu, ou clé nommée autrement. Rejeter ces réponses
   * pourtant complètes n'apporte rien — on accepte la première liste d'objets
   * trouvée à la racine.
   */
  const asEventList = (value: unknown): RawEvent[] | null => {
    if (Array.isArray(value)) return value as RawEvent[];
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    for (const key of ['events', 'evenements', 'événements', 'items', 'results', 'data']) {
      if (Array.isArray(record[key])) return record[key] as RawEvent[];
    }
    // Une seule valeur, et c'est une liste : c'est forcément celle-là.
    const arrays = Object.values(record).filter(Array.isArray);
    return arrays.length === 1 ? (arrays[0] as RawEvent[]) : null;
  };

  const eventList = asEventList(parsed);

  // Une réponse illisible est une erreur ; une liste VIDE est un résultat
  // légitime (le modèle n'a trouvé aucun événement dont il soit certain).
  if (!eventList) {
    // Journaliser AVANT de lever : sans cette trace, un échec de parsing ne
    // laissait rien d'exploitable dans les logs, et le message générique
    // accusait le modèle sans qu'on puisse le vérifier.
    console.error(
      `[events] réponse non exploitable — modèle=${config.model} ` +
        `finish_reason=${finishReason ?? 'inconnu'} longueur=${finalText.length} car.\n` +
        `  réponse brute (800 premiers caractères) :\n  ${finalText.slice(0, 800) || '(vide)'}`,
    );

    if (truncated) {
      throw new AiRequestError(
        "La réponse du modèle a été coupée avant d'être complète (limite de jetons atteinte) " +
          "et rien n'a pu en être récupéré. Réduisez le nombre d'événements demandés ou de " +
          'réseaux sociaux dans votre profil, ou augmentez AI_MAX_TOKENS.',
      );
    }
    if (!finalText.trim()) {
      throw new AiRequestError(
        "Le modèle a renvoyé une réponse vide. Certains modèles de raisonnement ne " +
          'produisent pas de texte exploitable ici : essayez-en un autre, ou désactivez le ' +
          'mode de réflexion dans Paramètres → Modèle IA.',
      );
    }
    throw new AiRequestError(
      "Le modèle n'a pas renvoyé de JSON exploitable (voir les logs du serveur pour sa " +
        `réponse exacte). Extrait : « ${finalText.trim().slice(0, 160)}… »`,
    );
  }
  const rawEvents = eventList;

  progress(`Vérification des sources de ${rawEvents.length} événement(s)…`);
  const created: PrismaEvent[] = [];
  let discardedUncertain = 0;
  let discardedUnsourced = 0;

  for (const raw of rawEvents) {
    if (!raw.title || !raw.description) continue;

    // Le modèle a lui-même signalé un doute : on écarte sans discuter.
    if (raw.certainty && !/^certain/i.test(raw.certainty.toString().trim())) {
      discardedUncertain++;
      continue;
    }

    // Vérification réseau réelle des liens : on écarte les 404 / liens morts
    // et on qualifie chaque source (ok / redirigée / non vérifiable).
    const { sources, hasLiveSource } = await verifySources(cleanSources(raw.sources));

    // Mode strict : aucun événement sans au moins une source qui répond.
    if (input.strictSources && !hasLiveSource) {
      discardedUnsourced++;
      continue;
    }
    // "verified" = la recherche web a servi ET au moins un lien répond vraiment.
    const verified = toolsUsed && hasLiveSource;
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
        sources: sources as unknown as Prisma.InputJsonValue,
        networkDescriptions: networkDescriptions ?? undefined,
        verified,
      },
    });
    created.push(event);
  }

  // Traçabilité : indispensable pour comprendre une génération vide, et pour
  // savoir si la durée approche du délai du reverse-proxy.
  console.log(
    `[events] modèle=${config.model} web=${toolsUsed ? 'oui' : 'non'} ` +
      `durée=${Math.round(deadline.elapsedMs() / 1000)}s/${Math.round(GENERATION_TIMEOUT_MS / 1000)}s ` +
      `fin=${finishReason ?? 'inconnu'}${extracted?.repaired ? ' (réponse réparée)' : ''} ` +
      `proposés=${rawEvents.length} retenus=${created.length} ` +
      `écartés(incertains)=${discardedUncertain} écartés(sans source)=${discardedUnsourced}`,
  );
  if (rawEvents.length === 0) {
    console.log(`[events] réponse brute du modèle (500 car.) : ${finalText.slice(0, 500)}`);
  }

  const notices: string[] = [];
  if (extracted?.repaired || truncated) {
    notices.push(
      'La réponse du modèle a été coupée avant la fin : les événements complets ont été ' +
        "conservés, les derniers manquent. Demandez-en moins à la fois, ou augmentez AI_MAX_TOKENS.",
    );
  }
  if (webSearchRequested && !webSearchAvailable) {
    notices.push(
      "La recherche web MCP est activée mais aucun serveur n'a pu être contacté : recherche effectuée sans le web.",
    );
  } else if (toolCallingUnsupported) {
    notices.push(
      "Le modèle sélectionné ne prend pas en charge le tool calling : recherche effectuée sans le web.",
    );
  }
  const discarded = discardedUncertain + discardedUnsourced;
  if (discarded > 0) {
    const details: string[] = [];
    if (discardedUncertain > 0) details.push(`${discardedUncertain} signalé(s) incertain(s) par le modèle`);
    if (discardedUnsourced > 0) details.push(`${discardedUnsourced} sans source vérifiable (mode strict)`);
    notices.push(`${discarded} événement(s) écarté(s) : ${details.join(', ')}.`);
  }
  if (input.strictSources && !toolsUsed) {
    notices.push(
      'Le mode strict est actif SANS recherche web : sans possibilité de vérifier les liens, presque tous les événements sont écartés. Activez un serveur MCP de recherche, ou désactivez le mode strict.',
    );
  }
  if (created.length === 0) {
    notices.push(
      rawEvents.length === 0
        ? "Le modèle n'a proposé aucun événement pour ces critères. Essayez d'élargir la période, la portée ou les thèmes."
        : 'Tous les événements proposés ont été écartés par les filtres de fiabilité (voir ci-dessus).',
    );
  }
  if (!toolsUsed && created.length > 0) {
    notices.push(
      'Recherche effectuée sans web : les informations proviennent de la mémoire du modèle et restent à vérifier.',
    );
  }
  const notice = notices.length > 0 ? notices.join(' ') : undefined;

  return {
    events: created,
    webSearchUsed: toolsUsed,
    toolCallingUnsupported,
    notice,
  };
}

/** Génère une alternative (reformulation) du titre et de la description d'un événement. */
export async function rephraseEvent(id: string): Promise<PrismaEvent> {
  const config = await getActiveAiConfig();
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    // Un identifiant inconnu n'est pas une panne du fournisseur IA : le
    // signaler en 502 accusait un tiers à tort.
    throw new NotFoundError('Événement introuvable.');
  }
  const messages: ChatMessage[] = [
    { role: 'system', content: eventRephraseSystemPrompt() },
    { role: 'user', content: eventRephraseUserPrompt(event.title, event.description) },
  ];
  const deadline = createDeadline(GENERATION_TIMEOUT_MS);
  let res;
  try {
    res = await chatCompletion(config, {
      messages,
      temperature: 0.9,
      responseFormatJson: true,
      signal: deadline.signal,
    });
  } finally {
    deadline.dispose();
  }
  // Reformulation ratée : on conserve le texte d'origine plutôt que d'échouer.
  const parsed = extractJsonObject(res.message.content ?? '', { requiredKey: 'title' })?.value as
    | { title?: string; description?: string }
    | undefined;
  const title = (parsed?.title ?? event.title).toString().trim().slice(0, 300) || event.title;
  const description = (parsed?.description ?? event.description).toString().trim() || event.description;
  return prisma.event.update({ where: { id }, data: { title, description } });
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
  const profile = await prisma.userProfile.findFirst({ orderBy: { updatedAt: 'desc' } });

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
    prioritySources: profile?.prioritySources ?? undefined,
  };

  const messages: ChatMessage[] = [
    { role: 'system', content: eventPlanSystemPrompt() },
    { role: 'user', content: eventPlanUserPrompt(params) },
  ];
  const deadline = createDeadline(GENERATION_TIMEOUT_MS);
  let res;
  try {
    res = await chatCompletion(config, { messages, temperature: 0.5, signal: deadline.signal });
  } finally {
    deadline.dispose();
  }
  const plan = (res.message.content ?? '').trim();
  if (!plan) {
    throw new AiRequestError("Le modèle n'a pas produit de plan. Réessayez.");
  }
  return { plan };
}
