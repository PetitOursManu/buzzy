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
            <div className="flex flex-wrap gap-2">
              {SCOPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleScope(s.value)}
                  aria-pressed={scopes.includes(s.value)}
                  className={
                    scopes.includes(s.value)
                      ? 'btn-primary !py-1.5 !px-3 text-sm'
                      : 'btn-ghost !py-1.5 !px-3 text-sm'
                  }
                >
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
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTheme(t)}
                aria-pressed={themes.includes(t)}
                className={
                  themes.includes(t)
                    ? 'chip !bg-honey-gradient !text-[#1a1206] !border-transparent'
                    : 'chip hover:border-[color:var(--honey)]'
                }
              >
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
            <div className="flex flex-wrap gap-2">
              {effectiveThemes.map((t) => {
                const isPriority = priorityThemes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => togglePriority(t)}
                    aria-pressed={isPriority}
                    className={
                      isPriority
                        ? 'chip !bg-grape !text-white !border-transparent shadow-glow-grape'
                        : 'chip hover:border-[color:var(--grape)]'
                    }
                  >
                    <span aria-hidden>{isPriority ? '⭐' : '☆'}</span> {t}
                    {isPriority && (
                      <span className="ml-1 opacity-80">#{priorityThemes.indexOf(t) + 1}</span>
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

        {/* ─── Mode planification ─── */}
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
              L'IA propose d'abord un plan que vous validez avant de générer — meilleures réponses.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-primary flex items-center gap-2"
            onClick={onGenerateClick}
            disabled={generate.isPending || plan.isPending}
          >
            {isFirstGen || plan.isPending ? <Spinner /> : <span aria-hidden>✨</span>}
            {planningEnabled ? 'Planifier & générer' : 'Générer des événements'}
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

      {/* ─── Grille de résultats ─── */}
      {isFirstGen ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {/* AnimatePresence toujours monté : les cartes s'animent en sortie
              lorsqu'on vide la liste (ex : nouveau « Planifier & générer »). */}
          <motion.div layout className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {events.map((ev) => (
                <EventCard key={ev.id} event={ev} selected={selectedIds.includes(ev.id)} onToggleSelect={toggle} />
              ))}
            </AnimatePresence>
          </motion.div>

          {events.length > 0 && (
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
          )}

          {events.length === 0 && !plan.isPending && (
            <HistoryOrEmpty
              history={historyQuery.data?.events ?? []}
              loading={historyQuery.isLoading}
              onToggle={toggle}
              selectedIds={selectedIds}
            />
          )}

          {events.length === 0 && plan.isPending && (
            <div className="glass rounded-2xl p-10 text-center flex flex-col items-center gap-3">
              <Spinner className="h-6 w-6" />
              <span className="text-secondary">Élaboration du plan en cours…</span>
            </div>
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

function HistoryOrEmpty({
  history,
  loading,
  onToggle,
  selectedIds,
}: {
  history: EventItem[];
  loading: boolean;
  onToggle: (id: string) => void;
  selectedIds: string[];
}) {
  if (loading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (history.length === 0) {
    return (
      <EmptyState
        icon="🔭"
        title="Aucun événement pour l'instant"
        description="Choisissez vos filtres puis cliquez sur « Générer des événements » pour lancer votre veille."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-display font-semibold text-secondary">Historique récent</h2>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {history.map((ev) => (
          <EventCard key={ev.id} event={ev} selected={selectedIds.includes(ev.id)} onToggleSelect={onToggle} />
        ))}
      </div>
    </div>
  );
}
