import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { calendarApi, postsApi, ApiError } from '../lib/api';
import type { Network, PostItem, PostPlan } from '../lib/types';
import { NETWORK_LABEL } from '../lib/constants';
import { CardSkeleton, EmptyState, Field, GlassPanel, Modal, Spinner } from '../components/ui';
import { ListView, MonthView, PeriodNav, WeekView, startOfWeek } from '../components/CalendarViews';
import { ManualEventModal } from '../components/ManualEventModal';
import { NetworkSelector } from '../components/NetworkIcon';
import { PostModal } from '../components/PostModal';
import { ReschedulePanel } from '../components/ReschedulePanel';
import { useToast } from '../hooks/useToast';
import { useSelection } from '../hooks/useSelection';
import { usePreferredNetworks } from '../hooks/usePreferredNetworks';

type FreqType = 'day' | 'week' | 'month';
type ViewMode = 'month' | 'week' | 'list';

const today = new Date();
const inTwoWeeks = new Date(today.getTime() + 14 * 24 * 3600 * 1000);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function CalendarPage() {
  const { toast } = useToast();
  const { selectedIds, clear, toggle } = useSelection();
  const queryClient = useQueryClient();

  // Ajout manuel d'un événement (formulaire partagé avec la page principale).
  const [manualOpen, setManualOpen] = useState(false);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(iso(today));
  const [endDate, setEndDate] = useState(iso(inTwoWeeks));
  const [freqType, setFreqType] = useState<FreqType>('week');
  const [freqCount, setFreqCount] = useState(3);
  // Seuls les réseaux retenus dans les Paramètres sont proposés : ce sont les
  // seuls pour lesquels une description a été rédigée lors de la découverte.
  const { networks: preferredNetworks, loading: networksLoading, isEmpty: noPreferredNetworks } =
    usePreferredNetworks();
  const [networks, setNetworks] = useState<Network[]>([]);

  // Tout réseau retiré des Paramètres disparaît aussi de la sélection en cours.
  useEffect(() => {
    if (networksLoading) return;
    setNetworks((prev) => {
      const kept = prev.filter((n) => preferredNetworks.includes(n));
      // Première visite : on part de tous les réseaux configurés.
      if (prev.length === 0) return preferredNetworks;
      return kept.length === prev.length ? prev : kept;
    });
  }, [preferredNetworks, networksLoading]);

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
      if (data.warning) {
        toast(data.warning, 'info');
      } else {
        toast(`Calendrier généré : ${data.posts.length} publication(s).`, 'success');
      }
      queryClient.invalidateQueries({ queryKey: ['calendar', 'list'] });
      setActivePlanId(data.postPlan.id);
      setViewMode('list');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Erreur de génération.', 'error'),
  });

  /** Crée un calendrier vide : aucune publication n'est générée. */
  const createEmpty = useMutation({
    mutationFn: () =>
      calendarApi.createEmpty({
        name: name.trim() || undefined,
        startDate,
        endDate,
        frequency: { type: freqType, count: freqCount },
        networks,
      }),
    onSuccess: (plan) => {
      toast('Calendrier vide créé. Ajoutez-y vos publications à la main.', 'success');
      queryClient.invalidateQueries({ queryKey: ['calendar', 'list'] });
      setActivePlanId(plan.id);
      setViewMode('list');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Création impossible.', 'error'),
  });

  const deletePlan = useMutation({
    mutationFn: (id: string) => calendarApi.remove(id),
    onSuccess: (_res, id) => {
      toast('Calendrier supprimé.', 'success');
      if (activePlanId === id) setActivePlanId(null);
      queryClient.invalidateQueries({ queryKey: ['calendar', 'list'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Suppression impossible.', 'error'),
  });

  const clearPosts = useMutation({
    mutationFn: (id: string) => calendarApi.clearPosts(id),
    onSuccess: (res, id) => {
      toast(`${res.deleted} publication(s) supprimée(s).`, 'success');
      queryClient.invalidateQueries({ queryKey: ['calendar', id] });
      queryClient.invalidateQueries({ queryKey: ['calendar', 'list'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Suppression impossible.', 'error'),
  });

  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const deletePost = useMutation({
    mutationFn: (id: string) => postsApi.remove(id),
    onMutate: (id: string) => setDeletingPostId(id),
    onSuccess: () => {
      toast('Publication supprimée.', 'success');
      queryClient.invalidateQueries({ queryKey: ['calendar', activePlanId] });
      queryClient.invalidateQueries({ queryKey: ['calendar', 'list'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Suppression impossible.', 'error'),
    onSettled: () => setDeletingPostId(null),
  });

  // Ajout manuel d'une publication dans le calendrier actif.
  const [postOpen, setPostOpen] = useState(false);
  const [pDate, setPDate] = useState(iso(today));
  const [pNetwork, setPNetwork] = useState<Network | ''>('');
  const [pTitle, setPTitle] = useState('');
  const [pContent, setPContent] = useState('');
  const [pHashtags, setPHashtags] = useState('');

  const createPost = useMutation({
    mutationFn: () =>
      postsApi.create({
        postPlanId: activePlanId!,
        scheduledDate: new Date(`${pDate}T10:00:00`).toISOString(),
        network: pNetwork as Network,
        title: pTitle.trim(),
        content: pContent,
        hashtags: pHashtags
          .split(/[\s,]+/)
          .map((h) => h.replace(/^#/, '').trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', activePlanId] });
      queryClient.invalidateQueries({ queryKey: ['calendar', 'list'] });
      toast('Publication ajoutée.', 'success');
      setPostOpen(false);
      setPTitle('');
      setPContent('');
      setPHashtags('');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Ajout impossible.', 'error'),
  });

  const activePlan = planQuery.data;

  // ─── Navigation dans les vues Mois et Semaine ───
  // `anchor` est la période affichée ; elle démarre au début du calendrier et
  // se déplace ensuite librement avec les flèches.
  const [anchor, setAnchor] = useState<Date | null>(null);
  const planStart = activePlan ? new Date(activePlan.startDate) : today;
  const currentAnchor = anchor ?? planStart;

  // Changer de calendrier remet la navigation à son début.
  useEffect(() => {
    setAnchor(null);
  }, [activePlanId]);

  const shiftAnchor = (direction: -1 | 1) => {
    const next = new Date(currentAnchor);
    if (viewMode === 'month') {
      next.setDate(1);
      next.setMonth(next.getMonth() + direction);
    } else {
      next.setDate(next.getDate() + direction * 7);
    }
    setAnchor(next);
  };

  const periodLabel =
    viewMode === 'month'
      ? currentAnchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      : (() => {
          const start = startOfWeek(currentAnchor);
          const end = new Date(start);
          end.setDate(start.getDate() + 6);
          const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
          return `${start.toLocaleDateString('fr-FR', opts)} – ${end.toLocaleDateString('fr-FR', opts)} ${end.getFullYear()}`;
        })();

  // ─── Modification du calendrier (nom et plage de dates) ───
  const [editOpen, setEditOpen] = useState(false);
  const [eName, setEName] = useState('');
  const [eStart, setEStart] = useState('');
  const [eEnd, setEEnd] = useState('');

  const openEdit = (plan: PostPlan) => {
    setEName(plan.name);
    setEStart(iso(new Date(plan.startDate)));
    setEEnd(iso(new Date(plan.endDate)));
    setEditOpen(true);
  };

  const updatePlan = useMutation({
    mutationFn: () =>
      calendarApi.update(activePlanId!, {
        name: eName.trim(),
        startDate: eStart,
        endDate: eEnd,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      setAnchor(null); // la navigation repart du nouveau début
      toast('Calendrier mis à jour.', 'success');
      if (res.warning) toast(res.warning, 'info');
      setEditOpen(false);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Modification impossible.', 'error'),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold">Calendrier éditorial</h1>
          <p className="text-secondary mt-1">
            Générez un calendrier de publications prêtes à adapter pour chaque réseau social.
          </p>
        </div>
        <button className="btn-ghost flex items-center gap-2 text-sm" onClick={() => setManualOpen(true)}>
          ➕ Ajouter un événement manuellement
        </button>
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

        <Field
          label="Fréquence de publication"
          hint="Chaque événement ne donne qu'une publication par réseau, à sa propre date. Cette fréquence ne sert qu'à répartir les événements sans date, ou datés hors de la plage."
        >
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

        <Field
          label="Réseaux ciblés"
          hint={
            noPreferredNetworks
              ? undefined
              : 'Limités aux réseaux retenus dans les Paramètres : ce sont ceux dont les descriptions ont déjà été rédigées.'
          }
        >
          {networksLoading ? (
            <div className="shimmer rounded-xl h-24 w-full max-w-md" />
          ) : noPreferredNetworks ? (
            <div className="glass rounded-xl p-4 flex flex-col gap-2">
              <p className="text-sm text-amber-500">
                Aucun réseau retenu dans les Paramètres.
              </p>
              <p className="text-xs text-secondary">
                Les descriptions d'événements sont rédigées uniquement pour les réseaux choisis dans
                votre profil. Sélectionnez-en au moins un pour pouvoir générer un calendrier.
              </p>
              <Link to="/parametres" className="btn-ghost text-sm self-start !py-1.5 !px-3">
                ⚙️ Choisir mes réseaux
              </Link>
            </div>
          ) : (
            <NetworkSelector networks={preferredNetworks} selected={networks} onToggle={toggleNetwork} />
          )}
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

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => generate.mutate()}
            disabled={generate.isPending || createEmpty.isPending || networks.length === 0}
          >
            {generate.isPending ? <Spinner /> : <span aria-hidden>📅</span>}
            Générer le calendrier
          </button>
          <button
            className="btn-ghost flex items-center gap-2"
            onClick={() => createEmpty.mutate()}
            disabled={generate.isPending || createEmpty.isPending}
            title="Crée un calendrier sans aucune publication : rien n'est généré par l'IA"
          >
            {createEmpty.isPending ? <Spinner /> : <span aria-hidden>📄</span>}
            Créer un calendrier vide
          </button>
        </div>
        <p className="text-xs text-muted -mt-2">
          La génération reprend les titres et descriptions déjà rédigés lors de la découverte, sans
          rappeler l'IA. Pour retoucher un texte, utilisez « Régénérer » sur la publication
          concernée. Un calendrier vide, lui, est créé sans aucune publication.
        </p>
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
        onDelete={(p) => {
          if (confirm(`Supprimer définitivement le calendrier « ${p.name} » et ses publications ?`)) {
            deletePlan.mutate(p.id);
          }
        }}
        deletingId={deletePlan.isPending ? (deletePlan.variables as string) : null}
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
                  <p className="text-xs text-muted flex flex-wrap items-center gap-1.5">
                    <span>
                      {new Date(activePlan.startDate).toLocaleDateString('fr-FR')} –{' '}
                      {new Date(activePlan.endDate).toLocaleDateString('fr-FR')} ·{' '}
                      {activePlan.posts?.length ?? 0} publication(s)
                    </span>
                    <button
                      onClick={() => openEdit(activePlan)}
                      className="hover:underline text-[color:var(--grape)]"
                      title="Modifier le nom et les dates du calendrier"
                    >
                      ✏️ Modifier les dates
                    </button>
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
                  <button
                    className="btn-ghost !py-1.5 !px-3 text-sm"
                    onClick={() => {
                      setPDate(iso(new Date(activePlan.startDate)));
                      // Réseau du calendrier s'il fait partie des réseaux
                      // configurés, sinon le premier réseau configuré.
                      const planNetwork = activePlan.networks.find((n) =>
                        preferredNetworks.includes(n),
                      );
                      setPNetwork(planNetwork ?? preferredNetworks[0] ?? '');
                      setPostOpen(true);
                    }}
                  >
                    ➕ Publication
                  </button>
                  <a href={calendarApi.exportUrl(activePlan.id, 'json')} className="btn-ghost !py-1.5 !px-3 text-sm">
                    ⬇ JSON
                  </a>
                  <a href={calendarApi.exportUrl(activePlan.id, 'csv')} className="btn-ghost !py-1.5 !px-3 text-sm">
                    ⬇ CSV
                  </a>
                  {(activePlan.posts?.length ?? 0) > 0 && (
                    <button
                      className="btn-ghost !py-1.5 !px-3 text-sm !text-red-500 hover:!bg-red-500/10"
                      onClick={() => {
                        if (
                          confirm(
                            `Supprimer les ${activePlan.posts!.length} publication(s) de « ${activePlan.name} » ? Le calendrier est conservé, vide.`,
                          )
                        ) {
                          clearPosts.mutate(activePlan.id);
                        }
                      }}
                      disabled={clearPosts.isPending}
                      title="Vide le calendrier de toutes ses publications"
                    >
                      {clearPosts.isPending ? <Spinner /> : '🧹'} Vider
                    </button>
                  )}
                  <button
                    className="btn-ghost !py-1.5 !px-3 text-sm !text-red-500 hover:!bg-red-500/10"
                    onClick={() => {
                      if (confirm(`Supprimer définitivement le calendrier « ${activePlan.name} » et ses publications ?`)) {
                        deletePlan.mutate(activePlan.id);
                      }
                    }}
                    disabled={deletePlan.isPending}
                    title="Supprime ce calendrier et toutes ses publications"
                  >
                    {deletePlan.isPending ? <Spinner /> : '🗑️'} Supprimer
                  </button>
                </div>
              </div>

              {/* Publications issues d'événements datés hors de la plage :
                  l'utilisateur leur attribue une date à la main. */}
              <ReschedulePanel
                plan={activePlan}
                posts={(activePlan.posts ?? []).filter((p) => p.needsReschedule)}
              />

              {(activePlan.posts?.length ?? 0) === 0 ? (
                <EmptyState title="Aucune publication dans ce calendrier. Utilisez « ➕ Publication » pour en ajouter une." />
              ) : (
                <GlassPanel>
                  {viewMode === 'list' && (
                    <ListView
                      posts={activePlan.posts!}
                      onSelect={setSelectedPost}
                      deletingId={deletingPostId}
                      onDelete={(p) => {
                        if (confirm(`Supprimer la publication « ${p.title} » ?`)) {
                          deletePost.mutate(p.id);
                        }
                      }}
                    />
                  )}
                  {viewMode !== 'list' && (
                    <PeriodNav
                      label={periodLabel}
                      onPrev={() => shiftAnchor(-1)}
                      onNext={() => shiftAnchor(1)}
                      onReset={() => setAnchor(null)}
                      resetLabel={`Revenir au début du calendrier (${new Date(activePlan.startDate).toLocaleDateString('fr-FR')})`}
                    />
                  )}
                  {viewMode === 'month' && (
                    <MonthView posts={activePlan.posts!} anchor={currentAnchor} onSelect={setSelectedPost} />
                  )}
                  {viewMode === 'week' && (
                    <WeekView posts={activePlan.posts!} anchor={currentAnchor} onSelect={setSelectedPost} />
                  )}
                </GlassPanel>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      )}

      <PostModal post={selectedPost} planId={activePlanId ?? ''} onClose={() => setSelectedPost(null)} />

      {/* ─── Modale : modification du calendrier ─── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Modifier le calendrier">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-secondary">
            Choisissez la période couverte par ce calendrier. Les publications qui se retrouveraient
            hors de la nouvelle plage sont conservées et signalées, pour que vous leur attribuiez
            une date.
          </p>
          <Field label="Nom du calendrier">
            <input className="glass-input" value={eName} onChange={(e) => setEName(e.target.value)} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Début">
              <input type="date" className="glass-input" value={eStart} onChange={(e) => setEStart(e.target.value)} />
            </Field>
            <Field label="Fin">
              <input type="date" className="glass-input" value={eEnd} onChange={(e) => setEEnd(e.target.value)} />
            </Field>
          </div>
          {eStart && eEnd && eEnd < eStart && (
            <p className="text-xs text-amber-500">La date de fin précède la date de début.</p>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost text-sm" onClick={() => setEditOpen(false)}>
              Annuler
            </button>
            <button
              className="btn-primary text-sm flex items-center gap-2"
              onClick={() => updatePlan.mutate()}
              disabled={updatePlan.isPending || !eName.trim() || !eStart || !eEnd || eEnd < eStart}
            >
              {updatePlan.isPending ? <Spinner /> : '💾'} Enregistrer
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Modale : ajout manuel d'une publication ─── */}
      <Modal open={postOpen} onClose={() => setPostOpen(false)} title="Ajouter une publication">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-secondary">
            La publication est enregistrée telle quelle : aucun contenu n'est généré par l'IA.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Date de publication">
              <input type="date" className="glass-input" value={pDate} onChange={(e) => setPDate(e.target.value)} />
            </Field>
            <Field label="Réseau">
              <select
                className="glass-input"
                value={pNetwork}
                onChange={(e) => setPNetwork(e.target.value as Network)}
              >
                {preferredNetworks.length === 0 && <option value="">Aucun réseau configuré</option>}
                {preferredNetworks.map((n) => (
                  <option key={n} value={n}>
                    {NETWORK_LABEL[n]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Titre">
            <input
              className="glass-input"
              value={pTitle}
              onChange={(e) => setPTitle(e.target.value)}
              placeholder="ex : Annonce de notre porte ouverte"
            />
          </Field>
          <Field label="Contenu">
            <textarea
              className="glass-input min-h-[140px] resize-y"
              value={pContent}
              onChange={(e) => setPContent(e.target.value)}
              placeholder="Rédigez votre publication…"
            />
          </Field>
          <Field label="Hashtags (optionnel)">
            <input
              className="glass-input"
              value={pHashtags}
              onChange={(e) => setPHashtags(e.target.value)}
              placeholder="#exemple #buzzy"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost text-sm" onClick={() => setPostOpen(false)}>
              Annuler
            </button>
            <button
              className="btn-primary text-sm flex items-center gap-2"
              onClick={() => createPost.mutate()}
              disabled={createPost.isPending || !pTitle.trim() || !pNetwork}
            >
              {createPost.isPending ? <Spinner /> : '➕'} Ajouter la publication
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Modale : ajout manuel d'un événement (formulaire partagé) ─── */}
      <ManualEventModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onCreated={(ev) => {
          // Sur cette page, l'événement créé rejoint la sélection servant à la
          // génération du calendrier.
          toggle(ev.id);
          setEventSource('selected');
        }}
      />
    </div>
  );
}

function PlanSelector({
  plans,
  loading,
  activePlanId,
  onSelect,
  onDelete,
  deletingId,
}: {
  plans: PostPlan[];
  loading: boolean;
  activePlanId: string | null;
  onSelect: (id: string) => void;
  onDelete: (plan: PostPlan) => void;
  deletingId: string | null;
}) {
  if (loading) return <Skeleton />;
  if (plans.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-display font-semibold text-secondary">Mes calendriers</h2>
      <div className="flex flex-wrap gap-2">
        {plans.map((p) => (
          <div
            key={p.id}
            className={`flex items-center rounded-xl ${
              activePlanId === p.id ? 'btn-primary !p-0' : 'btn-ghost !p-0'
            }`}
          >
            <button onClick={() => onSelect(p.id)} className="!py-2 !pl-4 !pr-2 text-sm">
              {p.name}{' '}
              <span className="opacity-60 text-xs">({p._count?.posts ?? p.posts?.length ?? 0})</span>
            </button>
            <button
              onClick={() => onDelete(p)}
              disabled={deletingId === p.id}
              aria-label={`Supprimer le calendrier « ${p.name} »`}
              title="Supprimer ce calendrier"
              className="h-7 w-7 mr-1.5 rounded-lg flex items-center justify-center text-xs
                         opacity-50 hover:opacity-100 hover:bg-red-500/20 transition-opacity disabled:opacity-30"
            >
              {deletingId === p.id ? '…' : '🗑️'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Skeleton() {
  return <div className="shimmer rounded-xl h-10 w-full max-w-sm" />;
}
