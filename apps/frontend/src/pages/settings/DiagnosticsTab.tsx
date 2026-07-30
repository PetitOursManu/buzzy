import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { settingsApi } from '../../lib/api';
import { NETWORK_LABEL } from '../../lib/constants';
import { Alert, Button, Card, Skeleton } from '../../components/ui';
import { Icon, type IconName } from '../../components/icons';

type Level = 'ok' | 'warn' | 'error';

const LEVEL_STYLE: Record<Level, { icon: IconName; className: string }> = {
  ok: { icon: 'check-circle', className: 'text-success' },
  warn: { icon: 'alert-triangle', className: 'text-warning' },
  error: { icon: 'alert-circle', className: 'text-danger' },
};

function CheckRow({
  level,
  label,
  detail,
  action,
}: {
  level: Level;
  label: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}) {
  const style = LEVEL_STYLE[level];
  return (
    <li className="flex items-start gap-2.5 border-b border-line py-2.5 last:border-0">
      <Icon name={style.icon} size={16} className={clsx('mt-0.5 shrink-0', style.className)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="mt-0.5 break-words text-xs text-content-2">{detail}</p>}
      </div>
      {action && (
        <Button size="sm" variant="ghost" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </li>
  );
}

/**
 * Diagnostic de l'installation.
 *
 * Répond d'un coup d'œil à « qu'est-ce qu'il me reste à configurer ? », la
 * question qui suivait chaque déploiement et n'avait aucune réponse dans
 * l'interface : il fallait ouvrir chaque onglet pour deviner ce qui manquait.
 */
export function DiagnosticsTab({ onGoToTab }: { onGoToTab: (tab: string) => void }) {
  const query = useQuery({
    queryKey: ['diagnostics'],
    queryFn: settingsApi.getDiagnostics,
    // Un test réseau par serveur MCP actif : trop coûteux pour être refait
    // à chaque affichage de l'onglet.
    staleTime: 60_000,
  });

  if (query.isLoading) {
    return (
      <div className="flex max-w-3xl flex-col gap-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Alert tone="danger" title="Diagnostic indisponible">
        Impossible de récupérer l'état de l'installation.
      </Alert>
    );
  }

  const d = query.data;

  /* ─── Modèle IA ─── */
  const aiChecks: { level: Level; label: string; detail?: string }[] = [];
  if (!d.ai.configured) {
    aiChecks.push({
      level: 'error',
      label: 'Aucun fournisseur IA configuré',
      detail: "Aucune génération n'est possible tant qu'un fournisseur n'est pas renseigné.",
    });
  } else {
    aiChecks.push({
      level: 'ok',
      label: 'Fournisseur IA configuré',
      detail: d.ai.baseUrl ?? undefined,
    });
    aiChecks.push(
      d.ai.model
        ? { level: 'ok', label: 'Modèle sélectionné', detail: d.ai.model }
        : { level: 'error', label: 'Aucun modèle sélectionné' },
    );
    if (d.ai.keyConfigured && d.ai.keyDecryptable === false) {
      aiChecks.push({
        level: 'error',
        label: 'Clé API indéchiffrable',
        detail:
          "ENCRYPTION_KEY a changé depuis l'enregistrement de la clé. Ressaisissez-la, ou restaurez l'ancienne valeur.",
      });
    } else if (!d.ai.keyConfigured) {
      aiChecks.push({
        level: 'warn',
        label: 'Aucune clé API enregistrée',
        detail: 'Normal pour un fournisseur local (Ollama), bloquant pour une API distante.',
      });
    } else {
      aiChecks.push({ level: 'ok', label: 'Clé API enregistrée et déchiffrable' });
    }
  }

  /* ─── Profil ─── */
  const profileChecks: { level: Level; label: string; detail?: string }[] = [
    d.profile.hasDescription
      ? { level: 'ok', label: "Description de l'activité renseignée" }
      : {
          level: 'warn',
          label: "Description de l'activité vide",
          detail: 'Les textes générés seront génériques, sans lien avec votre organisation.',
        },
    d.profile.preferredNetworks.length > 0
      ? {
          level: 'ok',
          label: `${d.profile.preferredNetworks.length} réseau(x) retenu(s)`,
          detail: d.profile.preferredNetworks.map((n) => NETWORK_LABEL[n]).join(', '),
        }
      : {
          level: 'error',
          label: 'Aucun réseau social retenu',
          detail: 'Aucun calendrier ne peut être généré tant qu’aucun réseau n’est choisi.',
        },
  ];

  /* ─── Recherche web ─── */
  const unreachable = d.webSearch.servers.filter((s) => !s.reachable);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg">Diagnostic</h2>
            <p className="mt-1 text-sm text-content-2">
              État de votre installation et prochaines étapes de configuration.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon="refresh"
            loading={query.isFetching}
            onClick={() => query.refetch()}
          >
            Actualiser
          </Button>
        </div>
        <p className="text-xs text-content-muted">
          Buzzy v{d.version} · {d.content.events} événement(s) · {d.content.calendars} calendrier(s)
        </p>
      </Card>

      <Card>
        <h3 className="mb-1 flex items-center gap-2 font-display text-base">
          <Icon name="cpu" size={17} className="text-content-muted" />
          Modèle IA
        </h3>
        <ul>
          {aiChecks.map((c, i) => (
            <CheckRow
              key={i}
              {...c}
              action={
                i === 0 && c.level !== 'ok'
                  ? { label: 'Configurer', onClick: () => onGoToTab('ai') }
                  : undefined
              }
            />
          ))}
        </ul>
      </Card>

      <Card>
        <h3 className="mb-1 flex items-center gap-2 font-display text-base">
          <Icon name="user" size={17} className="text-content-muted" />
          Profil & réseaux
        </h3>
        <ul>
          {profileChecks.map((c, i) => (
            <CheckRow
              key={i}
              {...c}
              action={
                c.level !== 'ok'
                  ? { label: 'Compléter', onClick: () => onGoToTab('profile') }
                  : undefined
              }
            />
          ))}
        </ul>
      </Card>

      <Card>
        <h3 className="mb-1 flex items-center gap-2 font-display text-base">
          <Icon name="network" size={17} className="text-content-muted" />
          Recherche web (MCP)
        </h3>
        <ul>
          {d.webSearch.enabled === 0 ? (
            <CheckRow
              level="warn"
              label="Aucun serveur de recherche actif"
              detail={`${d.webSearch.registered} serveur(s) enregistré(s). Sans recherche web, l'IA écrit de mémoire et ne peut pas vérifier ses sources.`}
              action={{ label: 'Activer', onClick: () => onGoToTab('mcp') }}
            />
          ) : (
            d.webSearch.servers.map((s) => (
              <CheckRow
                key={s.id}
                level={s.reachable ? 'ok' : 'error'}
                label={s.name}
                detail={
                  s.reachable
                    ? `${s.toolCount} outil(s) disponible(s) — ${s.url}`
                    : (s.error ?? `Injoignable — ${s.url}`)
                }
              />
            ))
          )}
        </ul>
      </Card>

      {unreachable.length > 0 && (
        <Alert tone="warning" title="Serveurs de recherche injoignables">
          {unreachable.length} serveur(s) activé(s) ne répondent pas. La génération continuera sans
          eux, mais les sources ne seront pas vérifiées. En Docker, vérifiez que les conteneurs{' '}
          <code className="font-mono text-xs">searxng-mcp</code>,{' '}
          <code className="font-mono text-xs">mcp-fetch</code> et{' '}
          <code className="font-mono text-xs">mcp-time</code> sont bien démarrés.
        </Alert>
      )}

      {/* Annoncer « tout est en place » au-dessus d'un avertissement serait
          contradictoire : le message de succès attend que rien ne cloche. */}
      {d.ai.configured &&
        d.ai.model &&
        d.profile.preferredNetworks.length > 0 &&
        unreachable.length === 0 && (
          <Alert tone="success" title="Installation opérationnelle">
            Tout est en place.{' '}
            <Link to="/" className="underline">
              Lancez votre première recherche d'événements
            </Link>
            .
          </Alert>
        )}
    </div>
  );
}
