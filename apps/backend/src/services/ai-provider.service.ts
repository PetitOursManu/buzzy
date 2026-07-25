import { prisma } from '../lib/prisma';
import { decrypt } from '../lib/crypto';

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
async function fetchModelsFrom(base: string, apiKey: string): Promise<string[]> {
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
): Promise<{ models: string[]; baseUrl: string }> {
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

function extractModelIds(data: unknown): string[] {
  // Format OpenAI : { data: [{ id }] }
  if (data && typeof data === 'object' && 'data' in data && Array.isArray((data as any).data)) {
    return (data as any).data
      .map((m: any) => m?.id ?? m?.name)
      .filter((x: unknown): x is string => typeof x === 'string');
  }
  // Format Ollama : { models: [{ name }] }
  if (data && typeof data === 'object' && 'models' in data && Array.isArray((data as any).models)) {
    return (data as any).models
      .map((m: any) => m?.name ?? m?.id)
      .filter((x: unknown): x is string => typeof x === 'string');
  }
  // Tableau brut
  if (Array.isArray(data)) {
    return data
      .map((m: any) => (typeof m === 'string' ? m : m?.id ?? m?.name))
      .filter((x: unknown): x is string => typeof x === 'string');
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
  // Format OpenAI standard : reasoning_effort. Les modèles qui ne le gèrent pas
  // l'ignorent généralement ; ceux qui le rejettent renverront une erreur claire.
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

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: authHeaders(config.apiKey),
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (e) {
    throw new AiRequestError(`Connexion impossible au modèle IA. (${(e as Error).message})`);
  }

  if (!res.ok) {
    const text = await safeText(res);
    // Certains fournisseurs renvoient 400/404 si response_format non supporté :
    // on relaie l'erreur pour que l'appelant puisse retenter sans.
    throw new AiRequestError(
      `Le modèle a répondu ${res.status}. ${text || ''}`.trim(),
      res.status,
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
