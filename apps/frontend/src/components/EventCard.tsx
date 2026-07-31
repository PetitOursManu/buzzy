import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import type { EventItem, Network } from '../lib/types';
import { NETWORK_LABEL, NETWORK_RECOMMENDED, SCOPE_ICON, SCOPE_LABEL } from '../lib/constants';
import { Badge, Button, Checkbox, IconButton } from './ui';
import { Icon, type IconName } from './icons';
import { NetworkIcon } from './NetworkIcon';
import { useToast } from '../hooks/useToast';
import { eventsApi, ApiError } from '../lib/api';

function formatEventWhen(ev: EventItem): string {
  if (ev.eventDate) {
    return new Date(ev.eventDate).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
  return ev.eventPeriod ?? 'Date à préciser';
}

/** Recherche web de secours quand aucune source fiable n'est disponible. */
function searchUrl(event: EventItem): string {
  const when = event.eventDate
    ? new Date(event.eventDate).getFullYear()
    : (event.eventPeriod?.match(/20\d{2}/)?.[0] ?? '');
  const q = [event.title, event.region ?? '', when].filter(Boolean).join(' ');
  return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
}

const SOURCE_HINT: Record<string, { icon: IconName; label: string; className: string }> = {
  ok: { icon: 'check-circle', label: 'Lien vérifié', className: 'text-success' },
  redirected: {
    icon: 'alert-triangle',
    label: "Redirige vers l'accueil du site — page précise introuvable",
    className: 'text-warning',
  },
  unchecked: {
    icon: 'help-circle',
    label: 'Lien non vérifiable automatiquement (site protégé)',
    className: 'text-content-muted',
  },
};

/* ─── Sources ──────────────────────────────────────────────────── */

function SourceList({ event }: { event: EventItem }) {
  const sources = event.sources ?? [];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-semibold uppercase tracking-wide text-content-muted">
        Sources
      </span>

      {sources.length === 0 ? (
        <p className="text-xs text-warning">
          Aucune source fiable fournie — les liens inexistants sont écartés automatiquement.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {sources.slice(0, 4).map((s, i) => {
            const hint = SOURCE_HINT[s.status ?? 'unchecked'] ?? SOURCE_HINT.unchecked;
            return (
              <li key={i}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${hint.label} — ${s.url}`}
                  className={clsx(
                    'inline-flex max-w-full items-start gap-1.5 text-xs hover:underline',
                    hint.className,
                  )}
                >
                  <Icon name={hint.icon} size={13} className="mt-0.5" />
                  <span className="truncate">{s.title || s.url}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      <a
        href={searchUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-content-muted hover:text-content hover:underline"
      >
        <Icon name="search" size={13} />
        {sources.length === 0 ? 'Rechercher des sources' : "Chercher d'autres sources"}
      </a>
    </div>
  );
}

/* ─── Descriptions par réseau ──────────────────────────────────── */

function NetworkDescriptions({
  descriptions,
}: {
  descriptions: Partial<Record<Network, string>>;
}) {
  const { toast } = useToast();
  const networks = useMemo(
    () => (Object.keys(descriptions) as Network[]).filter((n) => descriptions[n]),
    [descriptions],
  );
  const [active, setActive] = useState<Network | null>(networks[0] ?? null);

  // Une régénération peut retirer le réseau affiché : sans ce recalage,
  // l'onglet actif pointerait vers un texte disparu.
  useEffect(() => {
    if (networks.length === 0) {
      setActive(null);
    } else if (!active || !networks.includes(active)) {
      setActive(networks[0]);
    }
  }, [networks, active]);

  if (networks.length === 0 || !active) return null;

  const text = descriptions[active] ?? '';
  const limit = NETWORK_RECOMMENDED[active];
  const tooLong = text.length > limit;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`Texte ${NETWORK_LABEL[active]} copié.`, 'success');
    } catch {
      toast('Copie impossible dans ce navigateur.', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <span className="text-2xs font-semibold uppercase tracking-wide text-content-muted">
        Descriptions par réseau
      </span>

      <div className="flex flex-wrap gap-1">
        {networks.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setActive(n)}
            aria-pressed={active === n}
            title={NETWORK_LABEL[n]}
            className={clsx(
              'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
              active === n
                ? 'border-line-strong bg-surface-2'
                : 'border-transparent opacity-55 hover:opacity-100',
            )}
          >
            <NetworkIcon network={n} size={15} colored={active === n} />
          </button>
        ))}
      </div>

      <div className="rounded-md border border-line bg-surface-2 p-2.5">
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{text}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={clsx('text-2xs tabular-nums', tooLong ? 'text-warning' : 'text-content-muted')}>
            {text.length} / {limit} caractères conseillés
          </span>
          <Button size="sm" variant="ghost" icon="copy" onClick={copy}>
            Copier
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Carte ────────────────────────────────────────────────────── */

export function EventCard({
  event,
  selected,
  onToggleSelect,
  onTextsRegenerated,
  onEdit,
  onDelete,
}: {
  event: EventItem;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onTextsRegenerated?: (updated: EventItem) => void;
  onEdit?: (event: EventItem) => void;
  onDelete?: (event: EventItem) => void;
}) {
  const { toast } = useToast();
  const hasNetworkDescriptions =
    event.networkDescriptions && Object.keys(event.networkDescriptions).length > 0;

  // Réécrit uniquement les textes par réseau, à partir du profil. Les faits
  // (titre, description, date, sources) restent tels qu'ils ont été vérifiés.
  const regenerate = useMutation({
    mutationFn: () => eventsApi.regenerateTexts(event.id),
    onSuccess: (updated) => {
      const count = Object.keys(updated.networkDescriptions ?? {}).length;
      toast(
        count > 1 ? `${count} textes réécrits selon votre profil.` : 'Texte réécrit selon votre profil.',
        'success',
      );
      onTextsRegenerated?.(updated);
    },
    onError: (e) =>
      toast(e instanceof ApiError ? e.message : 'Erreur lors de la génération.', 'error'),
  });

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className={clsx(
        'group flex flex-col gap-3 rounded-xl border bg-surface p-4 transition-shadow',
        selected ? 'border-brand shadow-brand' : 'border-line shadow-sm hover:shadow-md',
      )}
    >
      {/* En-tête : qualification + actions au survol */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral" icon={SCOPE_ICON[event.scope]}>
            {SCOPE_LABEL[event.scope]}
          </Badge>
          <Badge tone="accent">{event.theme}</Badge>
          {event.verified ? (
            <Badge tone="success" icon="shield">
              Sources vérifiées
            </Badge>
          ) : (
            <Badge tone="warning" icon="alert-triangle">
              À vérifier
            </Badge>
          )}
        </div>

        {(onEdit || onDelete) && (
          <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {onEdit && (
              <IconButton icon="pencil" label="Modifier" size="sm" onClick={() => onEdit(event)} />
            )}
            {onDelete && (
              <IconButton
                icon="trash"
                label="Supprimer"
                size="sm"
                variant="danger"
                onClick={() => onDelete(event)}
              />
            )}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-display text-[15px] leading-snug">{event.title}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
          <span className="inline-flex items-center gap-1">
            <Icon name="calendar" size={13} />
            {formatEventWhen(event)}
          </span>
          {event.region && (
            <span className="inline-flex items-center gap-1">
              <Icon name="map-pin" size={13} />
              {event.region}
            </span>
          )}
        </div>
      </div>

      <p className="flex-1 text-[13px] leading-relaxed text-content-2">{event.description}</p>

      <SourceList event={event} />

      {hasNetworkDescriptions && (
        <NetworkDescriptions descriptions={event.networkDescriptions!} />
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <Checkbox
          checked={selected}
          onChange={() => onToggleSelect(event.id)}
          label="Ajouter au calendrier"
        />
        <Button
          size="sm"
          variant="ghost"
          icon="refresh"
          loading={regenerate.isPending}
          onClick={() => regenerate.mutate()}
          title={
            hasNetworkDescriptions
              ? 'Réécrire le texte de chaque réseau à partir de votre profil (ton, audience, restrictions)'
              : 'Rédiger un texte par réseau à partir de votre profil (ton, audience, restrictions)'
          }
        >
          {hasNetworkDescriptions ? 'Réécrire les textes' : 'Rédiger les textes'}
        </Button>
      </div>
    </motion.article>
  );
}
