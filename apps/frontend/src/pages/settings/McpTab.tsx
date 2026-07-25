import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsApi, ApiError } from '../../lib/api';
import { Chip, Field, GlassPanel, Spinner } from '../../components/ui';
import { MCP_PRESETS, type McpPresetDef } from '../../lib/constants';
import type { McpServerInfo } from '../../lib/types';
import { useToast } from '../../hooks/useToast';

export function McpTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const serversQuery = useQuery({ queryKey: ['mcp-servers'], queryFn: settingsApi.listMcpServers });

  const servers = serversQuery.data ?? [];
  const anyEnabled = useMemo(() => servers.some((s) => s.enabled), [servers]);

  // Formulaire d'ajout
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formAuth, setFormAuth] = useState('');
  const [formPreset, setFormPreset] = useState<string>('custom');

  const applyPreset = (preset: McpPresetDef) => {
    setFormName(preset.label);
    setFormUrl(preset.url);
    setFormAuth('');
    setFormPreset(preset.preset);
  };

  const create = useMutation({
    mutationFn: () =>
      settingsApi.createMcpServer({
        name: formName,
        url: formUrl,
        authHeader: formAuth || null,
        enabled: false,
        preset: formPreset,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
      toast('Serveur MCP ajouté.', 'success');
      setFormName('');
      setFormUrl('');
      setFormAuth('');
      setFormPreset('custom');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Ajout impossible.', 'error'),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<McpServerInfo> & { authHeader?: string | null } }) =>
      settingsApi.updateMcpServer(id, data as any),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mcp-servers'] }),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Mise à jour impossible.', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => settingsApi.deleteMcpServer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
      toast('Serveur supprimé.', 'success');
    },
  });

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <GlassPanel className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-semibold">Recherche Web (MCP)</h2>
            <p className="text-secondary text-sm mt-1">
              Branchez des serveurs MCP de recherche web pour fiabiliser les sources de vos événements.
              Désactivée par défaut.
            </p>
          </div>
          <Chip tone={anyEnabled ? 'green' : 'default'}>
            {anyEnabled ? '● Recherche web active' : '○ Inactive'}
          </Chip>
        </div>
        <p className="text-xs text-muted">
          La recherche web est utilisée dès qu'au moins un serveur est activé. Elle nécessite un modèle
          IA compatible avec le <em>tool calling</em> ; sinon Buzzy génère sans recherche web et l'indique.
        </p>
      </GlassPanel>

      {/* Préréglages */}
      <GlassPanel className="flex flex-col gap-3">
        <h3 className="font-display font-semibold">Préréglages</h3>
        <p className="text-xs text-muted">
          Cliquez pour pré-remplir le formulaire, puis renseignez votre clé si nécessaire.
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {MCP_PRESETS.map((p) => (
            <button
              key={p.preset}
              onClick={() => applyPreset(p)}
              className="glass rounded-xl p-3 text-left hover:shadow-glow transition-shadow"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{p.label}</span>
                <Chip tone={p.needsAuth ? 'amber' : 'green'}>{p.needsAuth ? 'Clé requise' : 'Gratuit'}</Chip>
              </div>
              <p className="text-xs text-muted mt-1">{p.note}</p>
            </button>
          ))}
        </div>
      </GlassPanel>

      {/* Formulaire d'ajout */}
      <GlassPanel className="flex flex-col gap-4">
        <h3 className="font-display font-semibold">Ajouter un serveur MCP</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Nom">
            <input className="glass-input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="ex : Tavily" />
          </Field>
          <Field label="URL (HTTP/SSE)" hint="Distante ou interne au réseau Docker.">
            <input className="glass-input" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://… ou http://searxng-mcp:3000/mcp" />
          </Field>
        </div>
        <Field
          label="En-tête d'authentification (optionnel)"
          hint="Format « Nom: valeur » (ex : Authorization: Bearer xxx) ou simplement la valeur du token. Chiffré en base."
        >
          <input
            className="glass-input"
            value={formAuth}
            onChange={(e) => setFormAuth(e.target.value)}
            placeholder="Authorization: Bearer …"
            autoComplete="off"
          />
        </Field>
        <div>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => create.mutate()}
            disabled={create.isPending || !formName || !formUrl}
          >
            {create.isPending ? <Spinner /> : '➕'} Ajouter le serveur
          </button>
        </div>
      </GlassPanel>

      {/* Liste des serveurs */}
      <div className="flex flex-col gap-3">
        <h3 className="font-display font-semibold">Serveurs configurés</h3>
        {serversQuery.isLoading ? (
          <div className="shimmer rounded-xl h-20" />
        ) : servers.length === 0 ? (
          <p className="text-sm text-muted">Aucun serveur configuré pour l'instant.</p>
        ) : (
          <AnimatePresence>
            {servers.map((s) => (
              <ServerRow
                key={s.id}
                server={s}
                onToggle={(enabled) => update.mutate({ id: s.id, data: { enabled } })}
                onDelete={() => remove.mutate(s.id)}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function ServerRow({
  server,
  onToggle,
  onDelete,
}: {
  server: McpServerInfo;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const [testResult, setTestResult] = useState<{ ok: boolean; tools: string[]; error?: string } | null>(null);

  const test = useMutation({
    mutationFn: () => settingsApi.testMcpServer(server.id),
    onSuccess: (res) => {
      setTestResult(res);
      if (res.ok) toast(`Connexion OK — ${res.tools.length} outil(s).`, 'success');
      else toast(res.error ?? 'Connexion échouée.', 'error');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Test impossible.', 'error'),
  });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="glass rounded-xl p-4 flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{server.name}</span>
            {server.preset && server.preset !== 'custom' && <Chip tone="grape">{server.preset}</Chip>}
            {server.authConfigured && <Chip>🔑 auth</Chip>}
          </div>
          <p className="text-xs text-muted truncate">{server.url}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost !py-1.5 !px-3 text-sm flex items-center gap-1.5" onClick={() => test.mutate()} disabled={test.isPending}>
            {test.isPending ? <Spinner /> : '🔌'} Tester
          </button>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={server.enabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="h-4 w-4 accent-[color:var(--honey)]"
            />
            Actif
          </label>
          <button className="btn-ghost !py-1.5 !px-3 text-sm text-red-500" onClick={onDelete} aria-label="Supprimer">
            🗑
          </button>
        </div>
      </div>
      {testResult && (
        <div className="text-xs">
          {testResult.ok ? (
            <span className="text-emerald-500">
              ✔ {testResult.tools.length} outil(s) : {testResult.tools.slice(0, 6).join(', ')}
              {testResult.tools.length > 6 ? '…' : ''}
            </span>
          ) : (
            <span className="text-red-500">✕ {testResult.error}</span>
          )}
        </div>
      )}
    </motion.div>
  );
}
