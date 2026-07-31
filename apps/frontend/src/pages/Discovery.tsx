import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { calendarApi, eventsApi, ApiError } from '../lib/api';
import type { DateTarget, EventItem, EventScope, PostPlan } from '../lib/types';
import { SCOPES, THEMES } from '../lib/constants';
import { EventCard } from '../components/EventCard';
import { EventFormModal } from '../components/EventFormModal';
import { Icon } from '../components/icons';
import {
  Alert,
  Button,
  Card,
  CardSkeleton,
  Checkbox,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  MultiInput,
  PageHeader,
  SectionTitle,
  SegmentedControl,
  Select,
  Tag,
} from '../components/ui';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { useSelection } from '../hooks/useSelection';
import { usePersistentState } from '../hooks/usePersistentState';

type DateMode = 'month' | 'date' | 'range';

const now = new Date();
const MAX_PRIORITY = 2;
const HISTORY_PAGE = 24;

/* ─── Tri chronologique ────────────────────────────────────────── */

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
  return periodToTime(e.eventPeriod) ?? Number.POSITIVE_INFINITY;
}

type SortMode = 'date-asc' | 'date-desc' | 'theme' | 'scope' | 'title' | 'verified';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'date-asc', label: 'Date — au plus tôt' },
  { value: 'date-desc', label: 'Date — au plus tard' },
  { value: 'theme', label: 'Thème (A→Z)' },
  { value: 'scope', label: 'Portée (Mondial→Local)' },
  { value: 'title', label: 'Titre (A→Z)' },
  { value: 'verified', label: "Sources vérifiées d'abord" },
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
      return arr.sort(
        (a, b) => SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope] || eventTime(a) - eventTime(b),
      );
    case 'title':
      return arr.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    case 'verified':
      return arr.sort((a, b) => (a.verified === b.verified ? 0 : a.verified ? -1 : 1));
    default:
      return arr;
  }
}

const GRID = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';

/* ─── Page ─────────────────────────────────────────────────────── */

export function DiscoveryPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { selectedIds, toggle } = useSelection();
  const queryClient = useQueryClient();

  /* Filtres persistants (survivent à la navigation entre pages) */
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

  /* Résultats (non persistés) */
  const [events, setEvents] = useState<EventItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [planText, setPlanText] = useState<string | null>(null);
  // Une génération dure souvent plus d'une minute : sans compte rendu, on
  // croit l'application figée.
  const [progress, setProgress] = useState<{ message: string; seconds: number } | null>(null);

  /* Historique : recherche + pagination */
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);

  // Sans anti-rebond, chaque frappe déclencherait une requête serveur.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setHistoryLimit(HISTORY_PAGE);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const historyQuery = useQuery({
    queryKey: ['events', 'history', debouncedSearch, historyLimit],
    queryFn: () => eventsApi.list({ take: historyLimit, q: debouncedSearch || undefined }),
    placeholderData: (prev) => prev,
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

  /* ─── Génération ─── */

  const generate = useMutation({
    mutationFn: async (args: { mode: 'new' | 'more'; plan?: string }) => {
      const dateTarget = buildDateTarget();
      if (!dateTarget) throw new ApiError('Renseignez la cible temporelle.', 400);
      setProgress({ message: 'Démarrage…', seconds: 0 });
      return eventsApi.generate(
        {
          ...commonPayload(),
          dateTarget,
          excludeIds: args.mode === 'more' ? events.map((e) => e.id) : [],
          count: args.mode === 'more' ? 6 : 9,
          plan: args.plan,
          strictSources,
        },
        (message, seconds) => setProgress({ message, seconds }),
      );
    },
    onSettled: () => setProgress(null),
    onSuccess: (data, args) => {
      setNotice(data.notice);
      setEvents((prev) => (args.mode === 'more' ? [...prev, ...data.events] : data.events));
      queryClient.invalidateQueries({ queryKey: ['events', 'history'] });
      if (data.notice) toast(data.notice, 'info');
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : 'Erreur lors de la génération.', 'error'),
  });

  const plan = useMutation({
    mutationFn: async () => {
      const dateTarget = buildDateTarget();
      if (!dateTarget) throw new ApiError('Renseignez la cible temporelle.', 400);
      return eventsApi.plan({ ...commonPayload(), dateTarget, count: 9 });
    },
    onSuccess: (data) => setPlanText(data.plan),
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : 'Erreur lors de la planification.', 'error'),
  });

  const onGenerateClick = () => {
    if (planningEnabled) {
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

  const sortedEvents = useMemo(() => sortEvents(events, sortMode), [events, sortMode]);

  const newEventIds = useMemo(() => new Set(events.map((e) => e.id)), [events]);
  const historyEvents = useMemo(
    () =>
      sortEvents(
        (historyQuery.data?.events ?? []).filter((e) => !newEventIds.has(e.id)),
        sortMode,
      ),
    [historyQuery.data, newEventIds, sortMode],
  );
  const historyTotal = historyQuery.data?.total ?? 0;
  const canLoadMore = (historyQuery.data?.events.length ?? 0) < historyTotal;

  /* ─── Actions sur l'historique ─── */

  const invalidateEvents = () => queryClient.invalidateQueries({ queryKey: ['events'] });

  const deleteHistory = useMutation({
    mutationFn: () => eventsApi.deleteHistory(events.map((e) => e.id)),
    onSuccess: (r) => {
      toast(`Historique supprimé (${r.deleted} événement(s)).`, 'success');
      if (r.unlinkedPosts > 0) {
        toast(
          `${r.unlinkedPosts} publication(s) conservée(s) mais détachée(s) de leur événement.`,
          'info',
        );
      }
      invalidateEvents();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Suppression impossible.', 'error'),
  });

  const deleteEvent = useMutation({
    mutationFn: (id: string) => eventsApi.remove(id),
    onSuccess: (r, id) => {
      setEvents((prev) => prev.filter((e) => e.id !== id));
      toast(
        r.unlinkedPosts > 0
          ? `Événement supprimé. ${r.unlinkedPosts} publication(s) conservée(s) mais détachée(s).`
          : 'Événement supprimé.',
        'success',
      );
      invalidateEvents();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Suppression impossible.', 'error'),
  });

  const askDeleteEvent = async (event: EventItem) => {
    const ok = await confirm({
      title: `Supprimer « ${event.title} » ?`,
      message:
        'Les publications déjà créées à partir de cet événement sont conservées, mais perdent le lien vers sa description et ses sources.',
      confirmLabel: 'Supprimer',
    });
    if (ok) deleteEvent.mutate(event.id);
  };

  const askDeleteHistory = async () => {
    const ok = await confirm({
      title: "Supprimer tout l'historique ?",
      message: `${historyTotal} événement(s) enregistré(s) seront supprimés définitivement. Les publications de vos calendriers sont conservées, mais perdent le lien vers leur événement.`,
      confirmLabel: 'Tout supprimer',
    });
    if (ok) deleteHistory.mutate();
  };

  const updateNewEvent = (u: EventItem) =>
    setEvents((prev) => prev.map((e) => (e.id === u.id ? u : e)));

  /* ─── Modales ─── */

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (event: EventItem) => {
    setEditing(event);
    setFormOpen(true);
  };

  /* ─── Calendriers existants ─── */

  const plansQuery = useQuery({ queryKey: ['calendar', 'list'], queryFn: calendarApi.list });

  const hasSort = events.length > 0 || historyEvents.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Découverte d'événements"
        description="Explorez les temps forts mondiaux, nationaux, régionaux et locaux par thème, puis sélectionnez ceux qui alimenteront votre calendrier éditorial."
        actions={
          <Button variant="secondary" icon="plus" onClick={openCreate}>
            Ajouter un événement
          </Button>
        }
      />

      <CalendarBar plans={plansQuery.data ?? []} />

      {/* ─── Filtres ─── */}
      <Card className="flex flex-col gap-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Field label="Portée géographique" hint="Sélection multiple possible.">
            <div className="flex flex-wrap gap-1.5">
              {SCOPES.map((s) => (
                <Tag
                  key={s.value}
                  active={scopes.includes(s.value)}
                  onClick={() => toggleScope(s.value)}
                  icon={s.icon}
                >
                  {s.label}
                </Tag>
              ))}
            </div>
          </Field>

          <Field
            label="Localisations (régions / villes)"
            hint={
              hasLocalScope
                ? 'Entrée ou virgule pour valider chaque zone.'
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

        <Field label="Thèmes" hint="Multi-sélection.">
          <div className="flex flex-wrap gap-1.5">
            {THEMES.map((t) => (
              <Tag key={t} active={themes.includes(t)} onClick={() => toggleTheme(t)}>
                {t}
              </Tag>
            ))}
          </div>
          {themes.includes('Autre') && (
            <Input
              className="mt-2"
              placeholder="Précisez le thème…"
              value={customTheme}
              onChange={(e) => setCustomTheme(e.target.value)}
            />
          )}
        </Field>

        {effectiveThemes.length > 0 && (
          <Field
            label={`Thèmes prioritaires (max. ${MAX_PRIORITY})`}
            hint="Les thèmes prioritaires concentreront la majorité des événements générés."
          >
            <div className="flex flex-wrap gap-1.5">
              {effectiveThemes.map((t) => {
                const isPriority = priorityThemes.includes(t);
                return (
                  <Tag
                    key={t}
                    active={isPriority}
                    tone="accent"
                    onClick={() => togglePriority(t)}
                    icon="star"
                    badge={
                      isPriority ? (
                        <span className="ml-0.5 text-2xs font-bold opacity-80">
                          #{priorityThemes.indexOf(t) + 1}
                        </span>
                      ) : undefined
                    }
                  >
                    {t}
                  </Tag>
                );
              })}
            </div>
          </Field>
        )}

        <Field label="Cible temporelle">
          <SegmentedControl
            options={[
              { value: 'month', label: 'Mois précis' },
              { value: 'date', label: 'Date précise' },
              { value: 'range', label: 'Période libre' },
            ]}
            value={dateMode}
            onChange={(v) => setDateMode(v as DateMode)}
            ariaLabel="Type de cible temporelle"
            className="mb-2.5"
          />

          {dateMode === 'month' && (
            <div className="flex flex-wrap gap-2">
              <Select
                className="!w-auto min-w-[10rem]"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                aria-label="Mois"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long' })}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                className="!w-28"
                value={year}
                min={2000}
                max={2100}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="Année"
              />
            </div>
          )}
          {dateMode === 'date' && (
            <Input
              type="date"
              className="!w-auto"
              value={singleDate}
              onChange={(e) => setSingleDate(e.target.value)}
            />
          )}
          {dateMode === 'range' && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="date"
                className="!w-auto"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                aria-label="Début de période"
              />
              <Input
                type="date"
                className="!w-auto"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                aria-label="Fin de période"
              />
            </div>
          )}
        </Field>

        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3.5">
          <Checkbox
            checked={planningEnabled}
            onChange={setPlanningEnabled}
            tone="accent"
            label="Mode planification"
            hint="L'IA propose d'abord un plan que vous validez avant de lancer la recherche."
          />
          <Checkbox
            checked={strictSources}
            onChange={setStrictSources}
            label="Mode strict — zéro invention"
            hint="N'affiche que les événements dont au moins un lien source répond réellement. Liste plus courte, mais fiable. Recommandé avec la recherche web activée."
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="lg"
            icon="sparkles"
            onClick={onGenerateClick}
            loading={isFirstGen || plan.isPending}
            disabled={generate.isPending || plan.isPending}
          >
            {planningEnabled ? 'Planifier & trouver' : 'Trouver les événements'}
          </Button>
          {selectedIds.length > 0 && (
            <Link to="/calendrier">
              <Button variant="secondary" icon="calendar" iconAfter="chevron-right">
                {selectedIds.length} sélectionné{selectedIds.length > 1 ? 's' : ''}
              </Button>
            </Link>
          )}
        </div>
      </Card>

      {progress && (
        <Alert tone="info" title="Génération en cours">
          <span className="flex flex-wrap items-center gap-x-2">
            <span>{progress.message}</span>
            <span className="tabular-nums text-content-muted">({progress.seconds} s)</span>
          </span>
          <p className="mt-1 text-xs text-content-muted">
            La recherche web prend souvent une à deux minutes. Vous pouvez laisser cette page
            ouverte.
          </p>
        </Alert>
      )}

      {notice && <Alert tone="warning">{notice}</Alert>}

      {/* ─── Tri ─── */}
      {!isFirstGen && !plan.isPending && hasSort && (
        <div className="flex items-center justify-end gap-2">
          <label htmlFor="sort-mode" className="text-[13px] text-content-muted">
            Trier par
          </label>
          <Select
            id="sort-mode"
            className="!w-auto"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      )}

      {/* ─── Résultats ─── */}
      {isFirstGen ? (
        <div className={GRID}>
          {Array.from({ length: 9 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {events.length > 0 && (
            <section className="flex flex-col gap-4">
              <SectionTitle icon="sparkles" count={events.length}>
                Nouveaux événements
              </SectionTitle>
              <motion.div layout className={GRID}>
                <AnimatePresence mode="popLayout">
                  {sortedEvents.map((ev) => (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      selected={selectedIds.includes(ev.id)}
                      onToggleSelect={toggle}
                      onRephrased={updateNewEvent}
                      onEdit={openEdit}
                      onDelete={askDeleteEvent}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  icon="plus"
                  onClick={() => generate.mutate({ mode: 'more' })}
                  loading={isMoreGen}
                  disabled={generate.isPending}
                >
                  Afficher plus d'événements
                </Button>
              </div>
            </section>
          )}

          {plan.isPending && events.length === 0 && (
            <Card className="flex flex-col items-center gap-3 py-10 text-center">
              <Icon name="sparkles" size={22} className="animate-pulse text-brand" />
              <span className="text-sm text-content-2">Élaboration du plan en cours…</span>
            </Card>
          )}

          {/* ─── Historique ─── */}
          <section className="flex flex-col gap-4 border-t border-line pt-6">
            <SectionTitle
              icon="history"
              count={historyTotal}
              actions={
                <>
                  <Input
                    icon="search"
                    className="!h-9 !w-auto min-w-[13rem]"
                    placeholder="Rechercher…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Rechercher dans l'historique"
                  />
                  {historyTotal > 0 && (
                    <IconButton
                      icon="trash"
                      label="Supprimer tout l'historique"
                      variant="danger"
                      size="sm"
                      disabled={deleteHistory.isPending}
                      onClick={askDeleteHistory}
                    />
                  )}
                </>
              }
            >
              Historique
            </SectionTitle>

            {historyQuery.isLoading ? (
              <div className={GRID}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            ) : historyEvents.length > 0 ? (
              <>
                <div className={GRID}>
                  {historyEvents.map((ev) => (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      selected={selectedIds.includes(ev.id)}
                      onToggleSelect={toggle}
                      onRephrased={invalidateEvents}
                      onEdit={openEdit}
                      onDelete={askDeleteEvent}
                    />
                  ))}
                </div>
                {canLoadMore && (
                  <div className="flex justify-center">
                    <Button
                      variant="ghost"
                      icon="chevron-down"
                      loading={historyQuery.isFetching}
                      onClick={() => setHistoryLimit((n) => n + HISTORY_PAGE)}
                    >
                      Charger plus ({historyTotal - historyEvents.length} restants)
                    </Button>
                  </div>
                )}
              </>
            ) : debouncedSearch ? (
              <EmptyState
                icon="search"
                title="Aucun résultat"
                description={`Aucun événement enregistré ne correspond à « ${debouncedSearch} ».`}
                action={
                  <Button variant="ghost" onClick={() => setSearch('')}>
                    Effacer la recherche
                  </Button>
                }
              />
            ) : (
              events.length === 0 &&
              !plan.isPending && (
                <EmptyState
                  icon="compass"
                  title="Aucun événement pour l'instant"
                  description="Choisissez vos filtres puis lancez une recherche. Vous pouvez aussi saisir un événement que vous connaissez déjà."
                  action={
                    <Button variant="secondary" icon="plus" onClick={openCreate}>
                      Ajouter un événement
                    </Button>
                  }
                />
              )
            )}
          </section>
        </>
      )}

      <EventFormModal
        open={formOpen}
        event={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => {
          // Une édition doit se refléter immédiatement dans la grille des
          // résultats fraîchement générés, qui vit hors du cache React Query.
          updateNewEvent(saved);
        }}
      />

      {/* ─── Validation du plan ─── */}
      <Modal
        open={!!planText}
        onClose={() => setPlanText(null)}
        title="Plan proposé par l'IA"
        description="Validez pour lancer la recherche, ou ajustez vos filtres."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPlanText(null)}>
              Annuler
            </Button>
            <Button
              variant="secondary"
              icon="refresh"
              onClick={() => plan.mutate()}
              loading={plan.isPending}
            >
              Regénérer le plan
            </Button>
            <Button variant="primary" icon="check" onClick={validatePlan}>
              Valider & générer
            </Button>
          </>
        }
      >
        <div className="whitespace-pre-wrap rounded-lg border border-line bg-surface-2 p-4 text-sm leading-relaxed">
          {planText}
        </div>
      </Modal>
    </div>
  );
}

/**
 * Rappel compact des calendriers existants : accès direct depuis la page
 * principale, sans passer par l'onglet Calendrier.
 */
function CalendarBar({ plans }: { plans: PostPlan[] }) {
  if (plans.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-[13px] text-content-muted">
        <Icon name="calendar" size={14} />
        Mes calendriers
      </span>
      {plans.map((p) => (
        <Link
          key={p.id}
          to="/calendrier"
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-[13px] transition-colors hover:border-line-strong hover:bg-surface-2"
        >
          {p.name}
          <span className="text-2xs text-content-muted">{p._count?.posts ?? 0}</span>
        </Link>
      ))}
    </div>
  );
}
