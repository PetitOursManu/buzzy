import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import type { EventItem, Network } from '../lib/types';
import { SCOPE_LABEL, NETWORK_EMOJI, NETWORK_LABEL } from '../lib/constants';
import { Chip, Spinner } from './ui';
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

const SOURCE_HINT: Record<string, { icon: string; label: string; className: string }> = {
  ok: { icon: '✅', label: 'Lien vérifié', className: 'text-[color:var(--grape)]' },
  redirected: {
    icon: '↪️',
    label: "Redirige vers l'accueil du site — page précise introuvable",
    className: 'text-amber-600 dark:text-amber-400',
  },
  unchecked: {
    icon: '❔',
    label: 'Lien non vérifiable automatiquement (site protégé)',
    className: 'text-[color:var(--text-secondary)]',
  },
};

/** Liste des sources, avec l'état réel de chaque lien. */
function SourceList({ event }: { event: EventItem }) {
  const sources = event.sources ?? [];

  if (sources.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Sources :</span>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Aucune source fiable fournie (les liens inexistants sont automatiquement écartés).
        </p>
        <a
          href={searchUrl(event)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[color:var(--grape)] hover:underline"
        >
          🔎 Rechercher des sources sur le web
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">Sources :</span>
      <ul className="flex flex-col gap-0.5">
        {sources.slice(0, 4).map((s, i) => {
          const hint = SOURCE_HINT[s.status ?? 'unchecked'] ?? SOURCE_HINT.unchecked;
          return (
            <li key={i}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`${hint.label} — ${s.url}`}
                className={`text-xs hover:underline break-all ${hint.className}`}
              >
                {hint.icon} {s.title || s.url}
              </a>
            </li>
          );
        })}
      </ul>
      <a
        href={searchUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-muted hover:underline"
      >
        🔎 Chercher d'autres sources
      </a>
    </div>
  );
}

/** Descriptions adaptées par réseau (onglets + copie). */
function NetworkDescriptions({ descriptions }: { descriptions: Partial<Record<Network, string>> }) {
  const { toast } = useToast();
  const networks = Object.keys(descriptions).filter(
    (n) => descriptions[n as Network],
  ) as Network[];
  const [active, setActive] = useState<Network>(networks[0]);
  const text = descriptions[active] ?? '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`Texte ${NETWORK_LABEL[active]} copié.`, 'success');
    } catch {
      toast('Copie impossible dans ce navigateur.', 'error');
    }
  };

  if (networks.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-[color:var(--glass-border)] pt-3">
      <span className="text-xs font-medium text-muted">Descriptions par réseau :</span>
      <div className="flex flex-wrap gap-1.5">
        {networks.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setActive(n)}
            aria-pressed={active === n}
            className={
              active === n
                ? 'chip !bg-grape !text-white !border-transparent'
                : 'chip hover:border-[color:var(--grape)]'
            }
          >
            {NETWORK_EMOJI[n]} {NETWORK_LABEL[n]}
          </button>
        ))}
      </div>
      <div className="glass rounded-xl p-3 flex flex-col gap-2">
        <p className="text-sm whitespace-pre-wrap">{text}</p>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted">{text.length} caractères</span>
          <button type="button" onClick={copy} className="btn-ghost !py-1 !px-2.5 text-xs">
            📋 Copier
          </button>
        </div>
      </div>
    </div>
  );
}

export function EventCard({
  event,
  selected,
  onToggleSelect,
  onRephrased,
}: {
  event: EventItem;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onRephrased?: (updated: EventItem) => void;
}) {
  const { toast } = useToast();
  const hasNetworkDescriptions =
    event.networkDescriptions && Object.keys(event.networkDescriptions).length > 0;

  const rephrase = useMutation({
    mutationFn: () => eventsApi.rephrase(event.id),
    onSuccess: (updated) => {
      toast('Alternative générée.', 'success');
      onRephrased?.(updated);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Erreur lors de la génération.', 'error'),
  });

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      whileHover={{ y: -6 }}
      className="group glass rounded-2xl p-5 flex flex-col gap-3 hover:shadow-glow transition-shadow"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="honey">📍 {SCOPE_LABEL[event.scope]}</Chip>
        <Chip tone="grape">{event.theme}</Chip>
        {event.verified ? (
          <Chip tone="green">✔ Sources vérifiées</Chip>
        ) : (
          <Chip tone="amber">⚠ Sources à vérifier</Chip>
        )}
      </div>

      <h3 className="text-lg font-display font-semibold leading-snug">{event.title}</h3>
      {event.region && <p className="text-xs text-muted -mt-1">🌍 {event.region}</p>}

      <p className="text-sm text-secondary flex-1">{event.description}</p>

      <div className="text-xs text-muted flex items-center gap-1.5">
        <span aria-hidden>🗓️</span>
        {formatEventWhen(event)}
      </div>

      <SourceList event={event} />

      {hasNetworkDescriptions && <NetworkDescriptions descriptions={event.networkDescriptions!} />}

      <button
        type="button"
        onClick={() => rephrase.mutate()}
        disabled={rephrase.isPending}
        className="btn-ghost !py-1.5 text-xs flex items-center justify-center gap-1.5"
        title="Reformuler le titre et la description via l'IA"
      >
        {rephrase.isPending ? <Spinner /> : '🔄'} Générer une alternative (titre & description)
      </button>

      <label className="mt-1 flex items-center gap-2 cursor-pointer select-none border-t border-[color:var(--glass-border)] pt-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(event.id)}
          className="h-4 w-4 accent-[color:var(--honey)]"
        />
        <span className="text-sm font-medium">Ajouter au calendrier</span>
      </label>
    </motion.article>
  );
}
