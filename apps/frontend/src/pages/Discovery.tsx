import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { eventsApi, ApiError } from '../lib/api';
import type { DateTarget, EventItem, EventScope } from '../lib/types';
import { SCOPES, THEMES } from '../lib/constants';
import { EventCard } from '../components/EventCard';
import {
  CardSkeleton,
  EmptyState,
  Field,
  GlassPanel,
  Modal,
  MultiInput,
  Spinner,
} from '../components/ui';
import { useToast } from '../hooks/useToast';
import { useSelection } from '../hooks/useSelection';
import { usePersistentState } from '../hooks/usePersistentState';

type DateMode = 'month' | 'date' | 'range';

const now = new Date();
const MAX_PRIORITY = 2;

const SCOPE_ICON: Record<EventScope, string> = {
  GLOBAL: '🌍',
  NATIONAL: '🏳️',
  REGIONAL: '🗺️',
  LOCAL: '📍',
};

// Tri chronologique des événements (eventDate, sinon eventPeriod ; sans date = à la fin).
const MONTH_INDEX: Record<string, number> = {
  janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11,
  printemps: 2, été: 5, ete: 5, automne: 8, hiver: 11,
};

function periodToTime(period: string | null): number | null {
  if (!period) return null;
  const p = period.toLowerCase();
  const yearMatch = p.match(/\b(20\d{2})\b/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1], 10);
  let month = 0;
  for (const [name, idx] of Object.entries(MONTH_INDEX)) {
    if (p.includes(name)) {
      month = idx;
      break;
    }
  }
  return new Date(year, month, 1).getTime();
}

function eventTime(e: EventItem): number {
  if (e.eventDate) {
    const t = new Date(e.eventDate).getTime();
    if (!isNaN(t)) return t;
  }
  const pt = periodToTime(e.eventPeriod);
  return pt ?? Number.POSITIVE_INFINITY;
}

type SortMode = 'date-asc' | 'date-desc' | 'theme' | 'scope' | 'title' | 'verified';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'date-asc', label: 'Date — au plus tôt' },
  { value: 'date-desc', label: 'Date — au plus tard' },
  { value: 'theme', label: 'Thème (A→Z)' },
  { value: 'scope', label: 'Portée (Mondial→Local)' },
  { value: 'title', label: 'Titre (A→Z)' },
  { value: 'verified', label: 'Sources vérifiées d\'abord' },
];

const SCOPE_RANK: Record<EventScope, number> = { GLOBAL: 0, NATIONAL: 1, REGIONAL: 2, LOCAL: 3 };

function sortEvents(list: EventItem[], mode: SortMode): EventItem[] {
  const arr = [...list];
  switch (mode) {
    case 'date-asc':
      return arr.sort((a, b) => eventTime(a) - eventTime(b));
    case 'date-desc':
      return arr.sort((a, b) => {
        const ta = eventTime(a);
        const tb = eventTime(b);
        // Les événements sans date exploitable restent toujours en fin de liste.
        if (ta === Infinity && tb === Infinity) return 0;
        if (ta === Infinity) return 1;
        if (tb === Infinity) return -1;
        return tb - ta;
      });
    case 'theme':
      return arr.sort((a, b) => a.theme.localeCompare(b.theme, 'fr'));
    case 'scope':
      return arr.sort((a, b) => SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope] || eventTime(a) - eventTime(b));
    case 'title':
      return arr.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    case 'verified':
      return arr.sort((a, b) => (a.verified === b.verified ? 0 : a.verified ? -1 : 1));
    default:
      return arr;
  }
}

export function DiscoveryPage() {
  const { toast } = useToast();
  const { selectedIds, toggle } = useSelection();
  const queryClient = useQueryClient();

  // ─── Filtres persistants (survivent à la navigation entre pages) ───
  const [scopes, setScopes] = usePersistentState<EventScope[]>('buzzy-f-scopes', ['GLOBAL']);
  const [regions, setRegions] = usePersistentState<string[]>('buzzy-f-regions', []);
  const [themes, setThemes] = usePersistentState<string[]>('buzzy-f-themes', []);
  const [customTheme, setCustomTheme] = usePersistentState<string>('buzzy-f-customTheme', '');
  const [priorityThemes, setPriorityThemes] = usePersistentState<string[]>('buzzy-f-priority', []);
  const [planningEnabled, setPlanningEnabled] = usePersistentState<boolean>('buzzy-f-planning', false);
  const [sortMode, setSortMode] = usePersistentState<SortMode>('buzzy-f-sort', 'date-asc');
  const [strictSources, setStrictSources] = usePersistentState<boolean>('buzzy-f-strict', false);

  const [dateMode, setDateMode] = usePersistentState<DateMode>('buzzy-f-dateMode', 'month');
  const [month, setMonth] = usePersistentState<number>('buzzy-f-month', now.getMonth() + 1);
  const [year, setYear] = usePersistentState<number>('buzzy-f-year', now.getFullYear());
  const [singleDate, setSingleDate] = usePersistentState<string>('buzzy-f-singleDate', '');
  const [rangeStart, setRangeStart] = usePersistentState<string>('buzzy-f-rangeStart', '');
  const [rangeEnd, setRangeEnd] = usePersistentState<string>('buzzy-f-rangeEnd', '');

  // ─── Résultats (non persistés) ───
  const [events, setEvents] = useState<EventItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [planText, setPlanText] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ['events', 'history'],
    queryFn: () => eventsApi.list({ take: 30 }),
  });

  const hasLocalScope = scopes.includes('REGIONAL') || scopes.includes('LOCAL');

  const effectiveThemes = useMemo(() => {
    const base = themes.filter((t) => t !== 'Autre');
    if (themes.includes('Autre') && customTheme.trim()) base.push(customTheme.trim());
    return base;
  }, [themes, customTheme]);

  // Nettoie les thèmes prioritaires qui ne sont plus sélectionnés.
  useEffect(() => {
    setPriorityThemes((prev) => {
      const filtered = prev.filter((p) => effectiveThemes.includes(p));
      return filtered.length === prev.length ? prev : filtered;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveThemes.join('|')]);

  const buildDateTarget = (): DateTarget | null => {
    if (dateMode === 'month') return { kind: 'month', month, year };
    if (dateMode === 'date') return singleDate ? { kind: 'date', date: singleDate } : null;
    return rangeStart && rangeEnd ? { kind: 'range', start: rangeStart, end: rangeEnd } : null;
  };

  const toggleScope = (s: EventScope) =>
    setScopes((prev) => {
      const next = prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s];
      return next.length === 0 ? prev : next; // au moins une portée
    });

  const toggleTheme = (t: string) =>
    setThemes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const togglePriority = (t: string) =>
    setPriorityThemes((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      if (prev.length >= MAX_PRIORITY) {
        toast(`${MAX_PRIORITY} thèmes prioritaires maximum.`, 'info');
        return prev;
      }
      return [...prev, t];
    });

  const commonPayload = () => ({
    scopes,
    regions: hasLocalScope ? regions : [],
    themes: effectiveThemes,
    priorityThemes,
  });

  // ─── Génération ───
  const generate = useMutation({
    mutationFn: async (args: { mode: 'new' | 'more'; plan?: string }) => {
      const dateTarget = buildDateTarget();
      if (!dateTarget) throw new ApiError('Renseignez la cible temporelle.', 400);
      return eventsApi.generate({
        ...commonPayload(),
        dateTarget,
        excludeIds: args.mode === 'more' ? events.map((e) => e.id) : [],
        count: args.mode === 'more' ? 6 : 9,
        plan: args.plan,
        strictSources,
      });
    },
    onSuccess: (data, args) => {
      setNotice(data.notice);
      setEvents((prev) => (args.mode === 'more' ? [...prev, ...data.events] : data.events));
      queryClient.invalidateQueries({ queryKey: ['events', 'history'] });
      if (data.notice) toast(data.notice, 'info');
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Erreur lors de la génération.', 'error'),
  });

  // ─── Planification ───
  const plan = useMutation({
    mutationFn: async () => {
      const dateTarget = buildDateTarget();
      if (!dateTarget) throw new ApiError('Renseignez la cible temporelle.', 400);
      return eventsApi.plan({ ...commonPayload(), dateTarget, count: 9 });
    },
    onSuccess: (data) => setPlanText(data.plan),
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Erreur lors de la planification.', 'error'),
  });

  const onGenerateClick = () => {
    if (planningEnabled) {
      // Fait disparaître les anciens événements (animation de sortie) avant de planifier.
      setNotice(null);
      setEvents([]);
      plan.mutate();
    } else {
      generate.mutate({ mode: 'new' });
    }
  };

  const validatePlan = () => {
    const p = planText ?? undefined;
    setPlanText(null);
    generate.mutate({ mode: 'new', plan: p });
  };

  const isFirstGen = generate.isPending && generate.variables?.mode === 'new';
  const isMoreGen = generate.isPending && generate.variables?.mode === 'more';

  // Affichage trié selon le mode choisi.
  const sortedEvents = useMemo(() => sortEvents(events, sortMode), [events, sortMode]);

  // Historique = événements persistés, hors ceux affichés en « nouveaux ».
  const newEventIds = useMemo(() => new Set(events.map((e) => e.id)), [events]);
  const historyEvents = useMemo(
    () => sortEvents((historyQuery.data?.events ?? []).filter((e) => !newEventIds.has(e.id)), sortMode),
    [historyQuery.data, newEventIds, sortMode],
  );

  const deleteHistory = useMutation({
    mutationFn: () => eventsApi.deleteHistory(events.map((e) => e.id)),
    onSuccess: (r) => {
      toast(`Historique supprimé (${r.deleted} événement(s)).`, 'success');
      queryClient.invalidateQueries({ queryKey: ['events', 'history'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Suppression impossible.', 'error'),
  });

  const updateNewEvent = (u: EventItem) => setEvents((prev) => prev.map((e) => (e.id === u.id ? u : e)));
  const invalidateHistory = () => queryClient.invalidateQueries({ queryKey: ['events', 'history'] });

  const hasSort = events.length > 0 || historyEvents.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Découverte d'événements</h1>
        <p className="text-secondary mt-1">
          Explorez des événements mondiaux, nationaux, régionaux et locaux par thème, générés par votre IA.
        </p>
      </div>

      {/* ─── Filtres ─── */}
      <GlassPanel className="flex flex-col gap-5">
        <div className="grid md:grid-cols-2 gap-5">
          <Field label="Portée géographique" hint="Sélection multiple possible.">
            <div className="flex flex-wrap gap-2.5">
              {SCOPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleScope(s.value)}
                  aria-pressed={scopes.includes(s.value)}
                  className={scopes.includes(s.value) ? 'opt-tag opt-tag--active' : 'opt-tag'}
                >
                  <span aria-hidden className="text-base">
                    {SCOPE_ICON[s.value]}
                  </span>
                  {s.label}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="Localisations (régions / villes)"
            hint={
              hasLocalScope
                ? 'Ajoutez-en plusieurs : Entrée ou virgule pour valider chaque zone.'
                : 'Utilisé avec les portées Régional / Local.'
            }
          >
            <MultiInput
              values={regions}
              onChange={setRegions}
              placeholder="ex : Lyon, Bretagne, Île-de-France…"
              ariaLabel="Localisations ciblées"
            />
          </Field>
        </div>

        <Field label="Thèmes (multi-sélection)">
          <div className="flex flex-wrap gap-2.5">
            {THEMES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTheme(t)}
                aria-pressed={themes.includes(t)}
                className={themes.includes(t) ? 'opt-tag opt-tag--active' : 'opt-tag'}
              >
                {themes.includes(t) && <span aria-hidden>✓</span>}
                {t}
              </button>
            ))}
          </div>
          {themes.includes('Autre') && (
            <input
              className="glass-input mt-2"
              placeholder="Précisez le thème…"
              value={customTheme}
              onChange={(e) => setCustomTheme(e.target.value)}
            />
          )}
        </Field>

        {/* ─── Thèmes prioritaires ─── */}
        {effectiveThemes.length > 0 && (
          <Field
            label={`Thèmes prioritaires (max ${MAX_PRIORITY})`}
            hint="Cliquez sur ⭐ pour prioriser jusqu'à deux thèmes : ils seront privilégiés lors de la génération."
          >
            <div className="flex flex-wrap gap-2.5">
              {effectiveThemes.map((t) => {
                const isPriority = priorityThemes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => togglePriority(t)}
                    aria-pressed={isPriority}
                    className={
                      isPriority ? 'opt-tag opt-tag--priority' : 'opt-tag hover:!border-[color:var(--grape)]'
                    }
                  >
                    <span aria-hidden>{isPriority ? '⭐' : '☆'}</span> {t}
                    {isPriority && (
                      <span className="opt-tag__badge">#{priorityThemes.indexOf(t) + 1}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        <Field label="Cible temporelle">
          <div className="flex flex-wrap gap-2 mb-3">
            {(['month', 'date', 'range'] as DateMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDateMode(m)}
                className={
                  dateMode === m ? 'btn-primary !py-1.5 !px-3 text-sm' : 'btn-ghost !py-1.5 !px-3 text-sm'
                }
              >
                {m === 'month' ? 'Mois précis' : m === 'date' ? 'Date précise' : 'Période libre'}
              </button>
            ))}
          </div>

          {dateMode === 'month' && (
            <div className="flex gap-2">
              <select className="glass-input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long' })}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="glass-input"
                value={year}
                min={2000}
                max={2100}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>
          )}
          {dateMode === 'date' && (
            <input type="date" className="glass-input" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} />
          )}
          {dateMode === 'range' && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="date"
                className="glass-input"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                aria-label="Début de période"
              />
              <input
                type="date"
                className="glass-input"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                aria-label="Fin de période"
              />
            </div>
          )}
        </Field>

        {/* ─── Options de fiabilité ─── */}
        <div className="flex flex-col gap-3">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={planningEnabled}
              onChange={(e) => setPlanningEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[color:var(--grape)]"
            />
            <span>
              <span className="text-sm font-medium">Mode planification</span>
              <span className="block text-xs text-muted">
                L'IA propose d'abord un plan que vous validez avant de lancer — meilleures réponses.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={strictSources}
              onChange={(e) => setStrictSources(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[color:var(--honey)]"
            />
            <span>
              <span className="text-sm font-medium">🔒 Mode strict — zéro invention</span>
              <span className="block text-xs text-muted">
                N'affiche QUE les événements dont au moins un lien source répond réellement. Les
                événements non vérifiables sont écartés (liste plus courte, mais fiable). Recommandé
                avec la recherche web activée.
              </span>
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-primary flex items-center gap-2"
            onClick={onGenerateClick}
            disabled={generate.isPending || plan.isPending}
          >
            {isFirstGen || plan.isPending ? <Spinner /> : <span aria-hidden>✨</span>}
            {planningEnabled ? 'Planifier & trouver' : 'Trouver les évènements'}
          </button>
          {selectedIds.length > 0 && (
            <Link to="/calendrier" className="btn-ghost flex items-center gap-2 text-sm">
              🗓️ {selectedIds.length} sélectionné{selectedIds.length > 1 ? 's' : ''} → Calendrier
            </Link>
          )}
        </div>
      </GlassPanel>

      {notice && (
        <div className="glass rounded-xl px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          ⚠️ {notice}
        </div>
      )}

      {/* ─── Barre de tri ─── */}
      {!isFirstGen && !plan.isPending && hasSort && (
          <div className="flex items-center justify-end gap-2">
            <label htmlFor="sort-mode" className="text-sm text-muted">
              Trier par :
            </label>
            <select
              id="sort-mode"
              className="glass-input !w-auto !py-1.5 text-sm"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

      {/* ─── Grille de résultats ─── */}
      {isFirstGen ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {/* ─── Nouveaux événements générés ─── */}
          {events.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-lg font-display font-semibold flex items-center gap-2">
                <span aria-hidden>✨</span> Nouveaux événements générés
                <span className="text-sm font-normal text-muted">({events.length})</span>
              </h2>
              <motion.div layout className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <AnimatePresence mode="popLayout">
                  {sortedEvents.map((ev) => (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      selected={selectedIds.includes(ev.id)}
                      onToggleSelect={toggle}
                      onRephrased={updateNewEvent}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
              <div className="flex justify-center">
                <button
                  className="btn-ghost flex items-center gap-2"
                  onClick={() => generate.mutate({ mode: 'more' })}
                  disabled={generate.isPending}
                >
                  {isMoreGen ? <Spinner /> : <span aria-hidden>➕</span>}
                  Afficher plus
                </button>
              </div>
            </section>
          )}

          {plan.isPending && events.length === 0 && (
            <div className="glass rounded-2xl p-10 text-center flex flex-col items-center gap-3">
              <Spinner className="h-6 w-6" />
              <span className="text-secondary">Élaboration du plan en cours…</span>
            </div>
          )}

          {/* ─── Historique ─── */}
          {historyQuery.isLoading && events.length === 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : historyEvents.length > 0 ? (
            <section className="flex flex-col gap-4 border-t border-[color:var(--glass-border)] pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-display font-semibold flex items-center gap-2 text-secondary">
                  <span aria-hidden>🕓</span> Historique
                  <span className="text-sm font-normal text-muted">({historyEvents.length})</span>
                </h2>
                <button
                  className="btn-ghost !py-1.5 !px-3 text-sm text-red-500 flex items-center gap-1.5"
                  onClick={() => {
                    if (confirm('Supprimer définitivement tout l\'historique des événements générés ?')) {
                      deleteHistory.mutate();
                    }
                  }}
                  disabled={deleteHistory.isPending}
                >
                  {deleteHistory.isPending ? <Spinner /> : '🗑'} Supprimer l'historique
                </button>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {historyEvents.map((ev) => (
                  <EventCard
                    key={ev.id}
                    event={ev}
                    selected={selectedIds.includes(ev.id)}
                    onToggleSelect={toggle}
                    onRephrased={invalidateHistory}
                  />
                ))}
              </div>
            </section>
          ) : (
            events.length === 0 &&
            !plan.isPending && (
              <EmptyState
                icon="🔭"
                title="Aucun événement pour l'instant"
                description="Choisissez vos filtres puis cliquez sur « Trouver les évènements » pour lancer votre veille."
              />
            )
          )}
        </>
      )}

      {/* ─── Modale de validation du plan ─── */}
      <Modal open={!!planText} onClose={() => setPlanText(null)} title="Plan proposé par l'IA">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-secondary">
            Voici l'approche que l'IA suivra pour générer vos événements. Validez pour lancer, ou annulez pour ajuster vos filtres.
          </p>
          <div className="glass rounded-xl p-4 text-sm whitespace-pre-wrap leading-relaxed max-h-[45vh] overflow-y-auto">
            {planText}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-ghost text-sm" onClick={() => setPlanText(null)}>
              Annuler
            </button>
            <button className="btn-ghost text-sm flex items-center gap-2" onClick={() => plan.mutate()} disabled={plan.isPending}>
              {plan.isPending ? <Spinner /> : '🔄'} Regénérer le plan
            </button>
            <button className="btn-primary text-sm flex items-center gap-2" onClick={validatePlan}>
              ✅ Valider & générer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
