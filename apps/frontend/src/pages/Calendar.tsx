import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { calendarApi, ApiError } from '../lib/api';
import type { Network, PostItem, PostPlan } from '../lib/types';
import { NETWORKS } from '../lib/constants';
import { CardSkeleton, EmptyState, Field, GlassPanel, Spinner } from '../components/ui';
import { ListView, MonthView, WeekView } from '../components/CalendarViews';
import { PostModal } from '../components/PostModal';
import { useToast } from '../hooks/useToast';
import { useSelection } from '../hooks/useSelection';

type FreqType = 'day' | 'week' | 'month';
type ViewMode = 'month' | 'week' | 'list';

const today = new Date();
const inTwoWeeks = new Date(today.getTime() + 14 * 24 * 3600 * 1000);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function CalendarPage() {
  const { toast } = useToast();
  const { selectedIds, clear } = useSelection();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(iso(today));
  const [endDate, setEndDate] = useState(iso(inTwoWeeks));
  const [freqType, setFreqType] = useState<FreqType>('week');
  const [freqCount, setFreqCount] = useState(3);
  const [networks, setNetworks] = useState<Network[]>(['instagram', 'linkedin']);
  const [eventSource, setEventSource] = useState<'selected' | 'ai'>(
    selectedIds.length > 0 ? 'selected' : 'ai',
  );

  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedPost, setSelectedPost] = useState<PostItem | null>(null);

  const plansQuery = useQuery({ queryKey: ['calendar', 'list'], queryFn: calendarApi.list });
  const planQuery = useQuery({
    queryKey: ['calendar', activePlanId],
    queryFn: () => calendarApi.get(activePlanId!),
    enabled: !!activePlanId,
  });

  const toggleNetwork = (n: Network) =>
    setNetworks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));

  const generate = useMutation({
    mutationFn: () =>
      calendarApi.generate({
        name: name.trim() || undefined,
        startDate,
        endDate,
        frequency: { type: freqType, count: freqCount },
        networks,
        eventSource,
        selectedEventIds: eventSource === 'selected' ? selectedIds : [],
      }),
    onSuccess: (data) => {
      toast(`Calendrier généré : ${data.posts.length} publication(s).`, 'success');
      queryClient.invalidateQueries({ queryKey: ['calendar', 'list'] });
      setActivePlanId(data.postPlan.id);
      setViewMode('list');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Erreur de génération.', 'error'),
  });

  const activePlan = planQuery.data;
  const anchor = useMemo(
    () => (activePlan ? new Date(activePlan.startDate) : today),
    [activePlan],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Calendrier éditorial</h1>
        <p className="text-secondary mt-1">
          Générez un calendrier de publications prêtes à adapter pour chaque réseau social.
        </p>
      </div>

      {/* ─── Formulaire de génération ─── */}
      <GlassPanel className="flex flex-col gap-5">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Nom du calendrier (optionnel)">
            <input
              className="glass-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex : Campagne rentrée 2026"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Début">
              <input type="date" className="glass-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Fin">
              <input type="date" className="glass-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
        </div>

        <Field label="Fréquence de publication">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={1}
              max={50}
              className="glass-input !w-24"
              value={freqCount}
              onChange={(e) => setFreqCount(Math.max(1, Number(e.target.value)))}
            />
            <span className="text-secondary">post(s) par</span>
            <div className="flex gap-2">
              {(['day', 'week', 'month'] as FreqType[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFreqType(f)}
                  className={freqType === f ? 'btn-primary !py-1.5 !px-3 text-sm' : 'btn-ghost !py-1.5 !px-3 text-sm'}
                >
                  {f === 'day' ? 'jour' : f === 'week' ? 'semaine' : 'mois'}
                </button>
              ))}
            </div>
          </div>
        </Field>

        <Field label="Réseaux ciblés">
          <div className="flex flex-wrap gap-2">
            {NETWORKS.map((n) => (
              <button
                key={n.value}
                type="button"
                onClick={() => toggleNetwork(n.value)}
                className={
                  networks.includes(n.value)
                    ? 'chip !bg-honey-gradient !text-[#1a1206] !border-transparent'
                    : 'chip hover:border-[color:var(--honey)]'
                }
              >
                {n.emoji} {n.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Source des événements">
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setEventSource('selected')}
              className={eventSource === 'selected' ? 'btn-primary !py-2 text-sm flex-1' : 'btn-ghost !py-2 text-sm flex-1'}
            >
              À partir de ma sélection ({selectedIds.length})
            </button>
            <button
              type="button"
              onClick={() => setEventSource('ai')}
              className={eventSource === 'ai' ? 'btn-primary !py-2 text-sm flex-1' : 'btn-ghost !py-2 text-sm flex-1'}
            >
              Laisser l'IA choisir mes événements
            </button>
          </div>
          {eventSource === 'selected' && selectedIds.length === 0 && (
            <p className="text-xs text-amber-500 mt-2">
              Aucun événement sélectionné. Allez dans « Découverte » pour en cocher, ou laissez l'IA choisir.
            </p>
          )}
          {eventSource === 'selected' && selectedIds.length > 0 && (
            <button className="text-xs text-muted hover:underline mt-2" onClick={clear}>
              Vider la sélection
            </button>
          )}
        </Field>

        <div>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => generate.mutate()}
            disabled={generate.isPending || networks.length === 0}
          >
            {generate.isPending ? <Spinner /> : <span aria-hidden>✨</span>}
            Générer le calendrier
          </button>
        </div>
      </GlassPanel>

      {generate.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* ─── Liste des calendriers existants ─── */}
      <PlanSelector
        plans={plansQuery.data ?? []}
        loading={plansQuery.isLoading}
        activePlanId={activePlanId}
        onSelect={setActivePlanId}
      />

      {/* ─── Vue du calendrier actif ─── */}
      {activePlanId && (
        <AnimatePresence mode="wait">
          {planQuery.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : activePlan ? (
            <motion.div
              key={activePlan.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-4"
            >
              <div className="glass-strong rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-display font-semibold">{activePlan.name}</h2>
                  <p className="text-xs text-muted">
                    {new Date(activePlan.startDate).toLocaleDateString('fr-FR')} –{' '}
                    {new Date(activePlan.endDate).toLocaleDateString('fr-FR')} ·{' '}
                    {activePlan.posts?.length ?? 0} publication(s)
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex gap-1">
                    {(['month', 'week', 'list'] as ViewMode[]).map((v) => (
                      <button
                        key={v}
                        onClick={() => setViewMode(v)}
                        className={viewMode === v ? 'btn-primary !py-1.5 !px-3 text-sm' : 'btn-ghost !py-1.5 !px-3 text-sm'}
                      >
                        {v === 'month' ? 'Mois' : v === 'week' ? 'Semaine' : 'Liste'}
                      </button>
                    ))}
                  </div>
                  <a href={calendarApi.exportUrl(activePlan.id, 'json')} className="btn-ghost !py-1.5 !px-3 text-sm">
                    ⬇ JSON
                  </a>
                  <a href={calendarApi.exportUrl(activePlan.id, 'csv')} className="btn-ghost !py-1.5 !px-3 text-sm">
                    ⬇ CSV
                  </a>
                </div>
              </div>

              {(activePlan.posts?.length ?? 0) === 0 ? (
                <EmptyState title="Aucune publication dans ce calendrier." />
              ) : (
                <GlassPanel>
                  {viewMode === 'list' && (
                    <ListView posts={activePlan.posts!} onSelect={setSelectedPost} />
                  )}
                  {viewMode === 'month' && (
                    <MonthView posts={activePlan.posts!} anchor={anchor} onSelect={setSelectedPost} />
                  )}
                  {viewMode === 'week' && (
                    <WeekView posts={activePlan.posts!} anchor={anchor} onSelect={setSelectedPost} />
                  )}
                </GlassPanel>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      )}

      <PostModal post={selectedPost} planId={activePlanId ?? ''} onClose={() => setSelectedPost(null)} />
    </div>
  );
}

function PlanSelector({
  plans,
  loading,
  activePlanId,
  onSelect,
}: {
  plans: PostPlan[];
  loading: boolean;
  activePlanId: string | null;
  onSelect: (id: string) => void;
}) {
  if (loading) return <Skeleton />;
  if (plans.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-display font-semibold text-secondary">Mes calendriers</h2>
      <div className="flex flex-wrap gap-2">
        {plans.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={
              activePlanId === p.id ? 'btn-primary !py-2 !px-4 text-sm' : 'btn-ghost !py-2 !px-4 text-sm'
            }
          >
            {p.name}{' '}
            <span className="opacity-60 text-xs">({p._count?.posts ?? p.posts?.length ?? 0})</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Skeleton() {
  return <div className="shimmer rounded-xl h-10 w-full max-w-sm" />;
}
