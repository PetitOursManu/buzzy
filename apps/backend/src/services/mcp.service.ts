import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { McpServer } from '@prisma/client';
import { decrypt } from '../lib/crypto';
import type { ToolDefinition } from './ai-provider.service';

/**
 * Client MCP générique, limité aux serveurs exposés en HTTP/SSE
 * (distants ou conteneurs voisins). Aucun spawn de sous-processus stdio.
 *
 * Stratégie de connexion : on tente d'abord le transport "Streamable HTTP"
 * (spec MCP récente), puis on retombe sur le transport SSE si nécessaire.
 */

export interface McpToolInfo {
  serverId: string;
  serverName: string;
  name: string; // nom d'outil préfixé et sûr pour le function calling
  originalName: string; // nom réel côté serveur MCP
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface ConnectedMcpServer {
  serverId: string;
  serverName: string;
  client: Client;
  tools: McpToolInfo[];
  close: () => Promise<void>;
}

function authHeaderValue(server: McpServer): string | undefined {
  if (!server.authHeader) return undefined;
  try {
    return decrypt(server.authHeader);
  } catch {
    // Compat : si la valeur n'est pas chiffrée (ne devrait pas arriver), l'utiliser telle quelle.
    return server.authHeader;
  }
}

/** Sanitize un nom d'outil pour respecter le format function-calling OpenAI. */
function safeToolName(serverIndex: number, toolName: string): string {
  const clean = toolName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  return `mcp${serverIndex}__${clean}`;
}

/**
 * Les fournisseurs compatibles OpenAI exigent un JSON Schema d'objet pour les
 * paramètres d'un outil. Certains serveurs MCP renvoient un schéma partiel
 * (sans `type`, sans `properties`), ce que l'API rejette en 400 — la
 * génération entière échouerait à cause d'un seul outil mal décrit.
 */
function normalizeInputSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { type: 'object', properties: {} };
  }
  const s = { ...(schema as Record<string, unknown>) };
  if (s.type !== 'object') s.type = 'object';
  if (!s.properties || typeof s.properties !== 'object') s.properties = {};
  return s;
}

async function buildTransport(server: McpServer, mode: 'http' | 'sse') {
  const url = new URL(server.url);
  const headerVal = authHeaderValue(server);
  const requestInit: RequestInit = {};
  if (headerVal) {
    // L'en-tête d'auth peut être fourni sous forme "Nom: valeur" ou juste la valeur (→ Authorization).
    const headers: Record<string, string> = {};
    const idx = headerVal.indexOf(':');
    if (idx > 0 && idx < 40) {
      headers[headerVal.slice(0, idx).trim()] = headerVal.slice(idx + 1).trim();
    } else {
      headers['Authorization'] = headerVal;
    }
    requestInit.headers = headers;
  }
  if (mode === 'http') {
    return new StreamableHTTPClientTransport(url, { requestInit });
  }
  return new SSEClientTransport(url, { requestInit });
}

/** Se connecte à un serveur MCP et récupère la liste de ses outils. */
export async function connectMcpServer(
  server: McpServer,
  serverIndex: number,
): Promise<ConnectedMcpServer> {
  const client = new Client(
    { name: 'buzzy', version: '1.0.0' },
    { capabilities: {} },
  );

  let connected = false;
  let lastError: unknown;
  for (const mode of ['http', 'sse'] as const) {
    try {
      const transport = await buildTransport(server, mode);
      await client.connect(transport);
      connected = true;
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!connected) {
    throw new Error(
      `Connexion MCP impossible à « ${server.name} » (${server.url}) : ${(lastError as Error)?.message ?? 'inconnu'}`,
    );
  }

  const listed = await client.listTools();
  const tools: McpToolInfo[] = listed.tools.map((t) => ({
    serverId: server.id,
    serverName: server.name,
    name: safeToolName(serverIndex, t.name),
    originalName: t.name,
    description: t.description,
    inputSchema: normalizeInputSchema(t.inputSchema),
  }));

  return {
    serverId: server.id,
    serverName: server.name,
    client,
    tools,
    close: async () => {
      try {
        await client.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/** Teste la connexion à un serveur MCP et renvoie la liste des noms d'outils. */
export async function testMcpServer(server: McpServer): Promise<{ ok: boolean; tools: string[]; error?: string }> {
  try {
    const conn = await connectMcpServer(server, 0);
    const names = conn.tools.map((t) => t.originalName);
    await conn.close();
    return { ok: true, tools: names };
  } catch (e) {
    return { ok: false, tools: [], error: (e as Error).message };
  }
}

/** Convertit les outils MCP connectés en définitions d'outils OpenAI. */
export function mcpToolsToOpenAI(connections: ConnectedMcpServer[]): {
  tools: ToolDefinition[];
  lookup: Map<string, McpToolInfo & { client: Client }>;
} {
  const tools: ToolDefinition[] = [];
  const lookup = new Map<string, McpToolInfo & { client: Client }>();
  for (const conn of connections) {
    for (const tool of conn.tools) {
      tools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description ?? `Outil de recherche web via ${tool.serverName}`,
          parameters: tool.inputSchema,
        },
      });
      lookup.set(tool.name, { ...tool, client: conn.client });
    }
  }
  return { tools, lookup };
}

/** Exécute un appel d'outil MCP et renvoie le résultat sérialisé en texte. */
export async function callMcpTool(
  entry: McpToolInfo & { client: Client },
  args: Record<string, unknown>,
): Promise<string> {
  const result = await entry.client.callTool({
    name: entry.originalName,
    arguments: args,
  });
  // Le contenu MCP est un tableau de blocs (text/image/...). On extrait le texte.
  const content = (result.content as Array<{ type: string; text?: string }>) ?? [];
  const text = content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n');
  return text || JSON.stringify(result).slice(0, 4000);
}
