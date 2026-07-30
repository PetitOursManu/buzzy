import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsApi, ApiError } from '../../lib/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  IconButton,
  Input,
  Skeleton,
  Switch,
} from '../../components/ui';
import { Icon } from '../../components/icons';
import { MCP_PRESETS, type McpPresetDef } from '../../lib/constants';
import type { McpServerInfo } from '../../lib/types';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';

export function McpTab() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const serversQuery = useQuery({ queryKey: ['mcp-servers'], queryFn: settingsApi.listMcpServers });

  const servers = serversQuery.data ?? [];
  const enabledCount = useMemo(() => servers.filter((s) => s.enabled).length, [servers]);

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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
    queryClient.invalidateQueries({ queryKey: ['diagnostics'] });
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
      invalidate();
      toast('Serveur MCP ajouté (désactivé).', 'success');
      setFormName('');
      setFormUrl('');
      setFormAuth('');
      setFormPreset('custom');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Ajout impossible.', 'error'),
  });

  const update = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      settingsApi.updateMcpServer(id, { enabled }),
    onSuccess: () => invalidate(),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Mise à jour impossible.', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => settingsApi.deleteMcpServer(id),
    onSuccess: () => {
      invalidate();
      toast('Serveur supprimé.', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Suppression impossible.', 'error'),
  });

  const askRemove = async (server: McpServerInfo) => {
    const ok = await confirm({
      title: `Supprimer « ${server.name} » ?`,
      message: "Le serveur ne sera plus proposé. Vous pourrez le rajouter à tout moment.",
      confirmLabel: 'Supprimer',
    });
    if (ok) remove.mutate(server.id);
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg">Recherche web (MCP)</h2>
            <p className="mt-1 text-sm text-content-2">
              Branchez des serveurs MCP pour que l'IA cherche les événements sur le web au lieu de
              les tirer de sa mémoire.
            </p>
          </div>
          <Badge tone={enabledCount > 0 ? 'success' : 'neutral'} icon={enabledCount > 0 ? 'check-circle' : 'info'}>
            {enabledCount > 0 ? `${enabledCount} serveur(s) actif(s)` : 'Inactive'}
          </Badge>
        </div>

        {enabledCount === 0 && (
          <Alert tone="info">
            Trois serveurs gratuits sont déjà déployés avec Buzzy et enregistrés ci-dessous. Il
            suffit de les activer — aucune clé API. Ensemble, ils forment la chaîne{' '}
            <strong>chercher → ouvrir → dater</strong> qui élimine l'essentiel des inventions.
          </Alert>
        )}

        <p className="text-xs leading-relaxed text-content-muted">
          Nécessite un modèle IA compatible avec l'appel d'outils. Sinon, Buzzy génère sans
          recherche web et le signale clairement dans l'interface.
        </p>
      </Card>

      {/* ─── Serveurs configurés ─── */}
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold text-content-2">Serveurs configurés</h3>
        {serversQuery.isLoading ? (
          <Skeleton className="h-20" />
        ) : servers.length === 0 ? (
          <p className="text-sm text-content-muted">Aucun serveur configuré pour l'instant.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {servers.map((s) => (
                <ServerRow
                  key={s.id}
                  server={s}
                  onToggle={(enabled) => update.mutate({ id: s.id, enabled })}
                  onDelete={() => askRemove(s)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* ─── Préréglages ─── */}
      <Card className="flex flex-col gap-3">
        <div>
          <h3 className="font-display text-base">Ajouter un serveur</h3>
          <p className="mt-0.5 text-xs text-content-muted">
            Cliquez un préréglage pour pré-remplir le formulaire, puis renseignez votre clé si
            nécessaire.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {MCP_PRESETS.map((p) => (
            <button
              key={`${p.preset}-${p.url}`}
              type="button"
              onClick={() => applyPreset(p)}
              className="rounded-lg border border-line bg-surface p-3 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{p.label}</span>
                <Badge tone={p.needsAuth ? 'warning' : 'success'}>
                  {p.needsAuth ? 'Clé requise' : 'Gratuit'}
                </Badge>
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-content-muted">{p.note}</span>
              {p.bundled && (
                <span className="mt-1.5 inline-flex items-center gap-1 text-2xs text-accent-text">
                  <Icon name="check-circle" size={11} />
                  Déployé avec Buzzy
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <Field label="Nom">
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="ex : Tavily"
            />
          </Field>
          <Field label="URL (HTTP/SSE)" hint="Distante ou interne au réseau Docker.">
            <Input
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://… ou http://searxng-mcp:8000/mcp"
              spellCheck={false}
            />
          </Field>
        </div>

        <Field
          label="En-tête d'authentification"
          hint="Facultatif. Format « Nom: valeur » (ex : Authorization: Bearer xxx), ou simplement le jeton. Chiffré en base."
        >
          <Input
            value={formAuth}
            onChange={(e) => setFormAuth(e.target.value)}
            placeholder="Authorization: Bearer …"
            autoComplete="off"
          />
        </Field>

        <div>
          <Button
            variant="primary"
            icon="plus"
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={!formName || !formUrl}
          >
            Ajouter le serveur
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ─── Ligne de serveur ─────────────────────────────────────────── */

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
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    tools: string[];
    error?: string;
  } | null>(null);

  const test = useMutation({
    mutationFn: () => settingsApi.testMcpServer(server.id),
    onSuccess: (res) => {
      setTestResult(res);
      if (res.ok) toast(`Connexion réussie — ${res.tools.length} outil(s).`, 'success');
      else toast(res.error ?? 'Connexion échouée.', 'error');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Test impossible.', 'error'),
  });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12 }}
      className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{server.name}</span>
            {server.preset && server.preset !== 'custom' && (
              <Badge tone="accent">{server.preset}</Badge>
            )}
            {server.authConfigured && (
              <Badge tone="neutral" icon="lock">
                auth
              </Badge>
            )}
          </div>
          <p className="truncate font-mono text-xs text-content-muted">{server.url}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon="network"
            onClick={() => test.mutate()}
            loading={test.isPending}
          >
            Tester
          </Button>
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <Switch
              checked={server.enabled}
              onChange={onToggle}
              label={`Activer ${server.name}`}
            />
            <span className={server.enabled ? 'font-medium text-content' : 'text-content-muted'}>
              {server.enabled ? 'Actif' : 'Inactif'}
            </span>
          </label>
          <IconButton icon="trash" label="Supprimer" size="sm" variant="danger" onClick={onDelete} />
        </div>
      </div>

      {testResult && (
        <p
          className={`inline-flex items-start gap-1.5 text-xs ${testResult.ok ? 'text-success' : 'text-danger'}`}
        >
          <Icon name={testResult.ok ? 'check-circle' : 'alert-circle'} size={13} className="mt-0.5" />
          <span className="min-w-0 break-words">
            {testResult.ok
              ? `${testResult.tools.length} outil(s) : ${testResult.tools.slice(0, 6).join(', ')}${testResult.tools.length > 6 ? '…' : ''}`
              : testResult.error}
          </span>
        </p>
      )}
    </motion.div>
  );
}
