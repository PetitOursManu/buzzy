import { prisma } from '../lib/prisma';
import { decrypt } from '../lib/crypto';
import { isDeadlineAbort } from '../lib/deadline';

/**
 * Client minimal pour une API compatible OpenAI (OpenRouter, Ollama Cloud,
 * OpenAI, etc.). On n'utilise pas le SDK openai pour rester agnostique et
 * tolérant aux implémentations partiellement compatibles.
 */

export interface AiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort?: string | null; // "low" | "medium" | "high" | null
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionResult {
  message: ChatMessage;
  finishReason: string | null;
  raw: unknown;
}

/** Normalise une URL de base : retire le slash final. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/** Récupère la configuration IA active depuis la base (clé déchiffrée). */
export async function getActiveAiConfig(): Promise<AiProviderConfig> {
  const provider = await prisma.aiProvider.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!provider) {
    throw new AiConfigError('Aucun fournisseur IA configuré. Renseignez-le dans les Paramètres.');
  }
  if (!provider.selectedModel) {
    throw new AiConfigError('Aucun modèle IA sélectionné. Choisissez-en un dans les Paramètres.');
  }
  let apiKey = '';
  if (provider.apiKeyEncrypted) {
    try {
      apiKey = decrypt(provider.apiKeyEncrypted);
    } catch {
      throw new AiConfigError('Impossible de déchiffrer la clé API. Vérifiez ENCRYPTION_KEY.');
    }
  }
  return {
    baseUrl: normalizeBaseUrl(provider.baseUrl),
    apiKey,
    model: provider.selectedModel,
    reasoningEffort: provider.reasoningEffort,
  };
}

export class AiConfigError extends Error {}
export class AiRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function authHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  return headers;
}

/** Récupère et parse la liste des modèles à partir d'une base précise. */
async function fetchModelsFrom(base: string, apiKey: string): Promise<ModelInfo[]> {
  const url = `${base}/models`;
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', headers: authHeaders(apiKey) });
  } catch (e) {
    throw new AiRequestError(
      `Connexion impossible à ${url}. Vérifiez l'URL de base. (${(e as Error).message})`,
    );
  }
  if (!res.ok) {
    const text = await safeText(res);
    throw new AiRequestError(
      `Le fournisseur a répondu ${res.status}. ${text || "Vérifiez l'URL et la clé API."}`,
      res.status,
    );
  }
  // La réponse peut être une page HTML (mauvaise URL de base) : on parse prudemment.
  const raw = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new AiRequestError(
      `La réponse de ${url} n'est pas du JSON (page HTML ?). Vérifiez que l'URL pointe vers l'API compatible OpenAI (souvent se terminant par /v1).`,
      res.status,
    );
  }
  return extractModelIds(data);
}

/**
 * Liste les modèles disponibles via GET {baseUrl}/models.
 * Si l'URL de base ne se termine pas par /v1 et échoue, on retente
 * automatiquement avec /v1 (cas fréquent : "https://ollama.com" → "/v1").
 * Renvoie aussi l'URL de base qui a réellement fonctionné, afin que le
 * frontend l'enregistre (garantissant que la génération utilisera la bonne).
 */
export async function listModels(
  baseUrl: string,
  apiKey: string,
): Promise<{ models: ModelInfo[]; baseUrl: string }> {
  const base = normalizeBaseUrl(baseUrl);
  const candidates = [base];
  if (!/\/v\d+$/.test(base)) {
    candidates.push(`${base}/v1`);
  }

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const models = await fetchModelsFrom(candidate, apiKey);
      return { models, baseUrl: candidate };
    } catch (e) {
      lastError = e;
      // On tente la base suivante uniquement si l'échec est "récupérable"
      // (mauvais chemin, HTML, 404). Une vraie erreur d'auth (401/403) est finale.
      if (e instanceof AiRequestError && (e.status === 401 || e.status === 403)) {
        throw e;
      }
    }
  }
  throw lastError instanceof AiRequestError
    ? lastError
    : new AiRequestError('Impossible de récupérer la liste des modèles.');
}

export interface ModelInfo {
  id: string;
  /**
   * Prise en charge de l'appel d'outils (tools / function calling).
   * `null` quand le fournisseur ne renseigne pas la capacité : on ne peut alors
   * ni l'affirmer ni la nier.
   */
  supportsTools: boolean | null;
}

/**
 * Déduit la prise en charge des tools à partir des métadonnées du fournisseur.
 * OpenRouter expose `supported_parameters` ; d'autres exposent `capabilities`.
 * En l'absence d'information, on retourne `null` plutôt que de deviner.
 */
function detectToolSupport(entry: any): boolean | null {
  if (!entry || typeof entry !== 'object') return null;

  // OpenRouter : supported_parameters: ["tools", "tool_choice", …]
  const params = entry.supported_parameters;
  if (Array.isArray(params)) {
    return params.some((p: unknown) => typeof p === 'string' && /^tools?$/i.test(p));
  }

  // Variantes : capabilities: { tools: true } ou capabilities: ["tools"]
  const caps = entry.capabilities;
  if (Array.isArray(caps)) {
    return caps.some((c: unknown) => typeof c === 'string' && /tool|function/i.test(c));
  }
  if (caps && typeof caps === 'object') {
    const v = caps.tools ?? caps.function_calling ?? caps.tool_calls;
    if (typeof v === 'boolean') return v;
  }

  return null;
}

function toModelInfo(entry: any): ModelInfo | null {
  if (typeof entry === 'string') return { id: entry, supportsTools: null };
  const id = entry?.id ?? entry?.name;
  if (typeof id !== 'string') return null;
  return { id, supportsTools: detectToolSupport(entry) };
}

function extractModelIds(data: unknown): ModelInfo[] {
  const pick = (list: unknown[]): ModelInfo[] =>
    list.map(toModelInfo).filter((m): m is ModelInfo => m !== null);

  // Format OpenAI / OpenRouter : { data: [{ id, supported_parameters }] }
  if (data && typeof data === 'object' && 'data' in data && Array.isArray((data as any).data)) {
    return pick((data as any).data);
  }
  // Format Ollama : { models: [{ name }] }
  if (data && typeof data === 'object' && 'models' in data && Array.isArray((data as any).models)) {
    return pick((data as any).models);
  }
  // Tableau brut
  if (Array.isArray(data)) {
    return pick(data);
  }
  return [];
}

export interface ChatOptions {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  responseFormatJson?: boolean;
  signal?: AbortSignal;
}

/**
 * Paramètres facultatifs de la requête : purement qualitatifs, ils peuvent être
 * retirés sans changer la nature de l'appel. Tous les modèles ne les acceptent
 * pas — les modèles de raisonnement, notamment, rejettent fréquemment
 * `temperature` ou `reasoning_effort`. L'ordre est celui du retrait.
 */
const OPTIONAL_PARAMS = ['reasoning_effort', 'response_format', 'temperature'] as const;

/** Repère, dans le message d'erreur du fournisseur, un paramètre facultatif mis en cause. */
function rejectedParam(errorText: string, body: Record<string, unknown>): string | null {
  const lower = errorText.toLowerCase();
  for (const p of OPTIONAL_PARAMS) {
    if (p in body && lower.includes(p)) return p;
  }
  return null;
}

/** Statuts pour lesquels un paramètre refusé est plausible. */
function isParamRejection(status: number): boolean {
  return status === 400 || status === 404 || status === 422;
}

/**
 * Délai maximal d'un appel au modèle. Généreux par défaut : une génération
 * avec recherche web enchaîne plusieurs allers-retours d'outils, et un modèle
 * de raisonnement peut légitimement mettre une minute.
 */
const REQUEST_TIMEOUT_MS = Math.max(
  10_000,
  Number.parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? '', 10) || 120_000,
);

/** Marqueur permettant de distinguer notre expiration d'une annulation externe. */
const TIMEOUT_REASON = Symbol('buzzy-ai-timeout');

/** Appel de chat completion compatible OpenAI. */
export async function chatCompletion(
  config: AiProviderConfig,
  options: ChatOptions,
): Promise<ChatCompletionResult> {
  const url = `${config.baseUrl}/chat/completions`;
  const body: Record<string, unknown> = {
    model: config.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
  };
  // Effort de réflexion (reasoning) — envoyé uniquement si configuré et non "none".
  // Format OpenAI standard : reasoning_effort.
  const effort = config.reasoningEffort;
  if (effort && effort !== 'none') {
    body.reasoning_effort = effort;
  }
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = 'auto';
  }
  if (options.responseFormatJson) {
    body.response_format = { type: 'json_object' };
  }

  const attempt = async (payload: Record<string, unknown>): Promise<Response> => {
    // Sans délai maximal, un fournisseur qui ne répond pas laisse la requête
    // ouverte indéfiniment : c'est alors le reverse-proxy (Coolify, Traefik,
    // nginx…) qui coupe au bout d'une minute et renvoie SON PROPRE 502, sans
    // corps JSON ni explication. On préfère échouer nous-mêmes, avec un
    // message qui nomme la cause.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(TIMEOUT_REASON), REQUEST_TIMEOUT_MS);
    const onExternalAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      return await fetch(url, {
        method: 'POST',
        headers: authHeaders(config.apiKey),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      // L'échéance globale prime : elle explique mieux l'échec que le délai
      // du seul appel en cours, qui n'en est que la conséquence.
      if (isDeadlineAbort(options.signal)) {
        throw new AiRequestError(
          "La génération a dépassé le temps qui lui est alloué. Réduisez le nombre de " +
            'serveurs de recherche actifs, choisissez un modèle plus rapide, ou augmentez ' +
            'BUZZY_GENERATION_TIMEOUT_MS (et le délai de votre reverse-proxy en conséquence).',
        );
      }
      if (controller.signal.reason === TIMEOUT_REASON) {
        throw new AiRequestError(
          `Le modèle n'a pas répondu en moins de ${Math.round(REQUEST_TIMEOUT_MS / 1000)} s. ` +
            'Essayez un modèle plus rapide, réduisez le mode de réflexion, ou augmentez ' +
            'AI_REQUEST_TIMEOUT_MS.',
        );
      }
      throw new AiRequestError(`Connexion impossible au modèle IA. (${(e as Error).message})`);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  };

  let res = await attempt(body);

  // Un paramètre facultatif refusé ne doit pas faire échouer toute la
  // génération : on le retire et on retente. D'abord celui que le fournisseur
  // nomme, puis, s'il n'en nomme aucun, tous d'un coup.
  let firstError: { status: number; text: string } | null = null;
  while (!res.ok && isParamRejection(res.status)) {
    const text = await safeText(res);
    if (!firstError) firstError = { status: res.status, text };

    const named = rejectedParam(text, body);
    if (named) {
      delete body[named];
      console.warn(`[ia] ${named} refusé par ${config.model} — nouvelle tentative sans.`);
    } else {
      const dropped = OPTIONAL_PARAMS.filter((p) => p in body);
      if (dropped.length === 0) break; // plus rien à retirer : erreur réelle
      dropped.forEach((p) => delete body[p]);
      console.warn(
        `[ia] ${config.model} a répondu ${res.status} sans nommer de paramètre — nouvelle tentative sans ${dropped.join(', ')}.`,
      );
    }
    res = await attempt(body);
  }

  if (!res.ok) {
    // On rapporte l'erreur d'origine : elle décrit le vrai refus, alors que la
    // dernière peut ne refléter qu'une tentative dégradée.
    const err = firstError ?? { status: res.status, text: await safeText(res) };
    throw new AiRequestError(
      `Le modèle a répondu ${err.status}. ${err.text || ''}`.trim(),
      err.status,
    );
  }

  const data = (await res.json()) as any;
  const choice = data?.choices?.[0];
  if (!choice) {
    throw new AiRequestError('Réponse du modèle vide ou invalide.');
  }
  const message: ChatMessage = {
    role: 'assistant',
    content: choice.message?.content ?? null,
    tool_calls: choice.message?.tool_calls ?? undefined,
  };
  return {
    message,
    finishReason: choice.finish_reason ?? null,
    raw: data,
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 500);
  } catch {
    return '';
  }
}
