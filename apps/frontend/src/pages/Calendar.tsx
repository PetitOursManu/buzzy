import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { calendarApi, postsApi, ApiError, type ExportFormat } from '../lib/api';
import type { Network, PostItem, PostPlan, PostStatus } from '../lib/types';
import { NETWORK_LABEL, POST_STATUS, POST_STATUS_LABEL } from '../lib/constants';
import {
  Alert,
  Button,
  Card,
  CardSkeleton,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  Textarea,
  buttonClasses,
} from '../components/ui';
import { Icon } from '../components/icons';
import { ListView, MonthView, PeriodNav, StatusLegend, WeekView, startOfWeek } from '../components/CalendarViews';
import { EventFormModal } from '../components/EventFormModal';
import { NetworkSelector } from '../components/NetworkIcon';
import { PostModal } from '../components/PostModal';
import { ReschedulePanel } from '../components/ReschedulePanel';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { useSelection } from '../hooks/useSelection';
import { usePreferredNetworks } from '../hooks/usePreferredNetworks';

type FreqType = 'day' | 'week' | 'month';
type ViewMode = 'month' | 'week' | 'list';
type StatusFilter = PostStatus | 'ALL';

const today = new Date();
const inTwoWeeks = new Date(today.getTime() + 14 * 24 * 3600 * 1000);

const iso = (d: Date | string) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const EXPORTS: { format: ExportFormat; label: string; title: string }[] = [
  { format: 'ics', label: 'iCal', title: 'Importer dans Google Agenda, Outlook, Apple Calendar…' },
  { format: 'csv', label: 'CSV', title: 'Ouvrir dans un tableur' },
  { format: 'json', label: 'JSON', title: 'Export brut, pour un traitement automatisé' },
];

export function CalendarPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { selectedIds, clear, toggle } = useSelection();
  const queryClient = useQueryClient();

  const [eventFormOpen, setEventFormOpen] = useState(false);

  /* ─── Formulaire de création ─── */
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(iso(today));
  const [endDate, setEndDate] = useState(iso(inTwoWeeks));
  const [freqType, setFreqType] = useState<FreqType>('week');
  const [freqCount, setFreqCount] = useState(3);

  // Seuls les réseaux retenus dans les Paramètres sont proposés : ce sont les
  // seuls pour lesquels une description a été rédigée lors de la découverte.
  const {
    networks: preferredNetworks,
    loading: networksLoading,
    isEmpty: noPreferredNetworks,
  } = usePreferredNetworks();
  const [networks, setNetworks] = useState<Network[]>([]);

  // Tout réseau retiré des Paramètres disparaît aussi de la sélection en cours.
  useEffect(() => {
    if (networksLoading) return;
    setNetworks((prev) => {
      if (prev.length === 0) return preferredNetworks;
      const kept = prev.filter((n) => preferredNetworks.includes(n));
      return kept.length === prev.length ? prev : kept;
    });
  }, [preferredNetworks, networksLoading]);

  const [eventSource, setEventSource] = useState<'selected' | 'ai'>(
    selectedIds.length > 0 ? 'selected' : 'ai',
  );

  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedPost, setSelectedPost] = useState<PostItem | null>(null);

  const plansQuery = useQuery({ queryKey: ['calendar', 'list'], queryFn: calendarApi.list });
  const planQuery = useQuery({
    queryKey: ['calendar', activePlanId],
    queryFn: () => calendarApi.get(activePlanId!),
    enabled: !!activePlanId,
  });
  const activePlan = planQuery.data;

  const toggleNetwork = (n: Network) =>
    setNetworks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ['calendar'] });

  /* ─── Mutations ─── */

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
      if (data.warning) toast(data.warning, 'info');
      else toast(`Calendrier généré : ${data.posts.length} publication(s).`, 'success');
      invalidateAll();
      setActivePlanId(data.postPlan.id);
      setViewMode('list');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Erreur de génération.', 'error'),
  });

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
      invalidateAll();
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
      invalidateAll();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Suppression impossible.', 'error'),
  });

  const clearPosts = useMutation({
    mutationFn: (id: string) => calendarApi.clearPosts(id),
    onSuccess: (res) => {
      toast(`${res.deleted} publication(s) supprimée(s).`, 'success');
      invalidateAll();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Suppression impossible.', 'error'),
  });

  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const deletePost = useMutation({
    mutationFn: (id: string) => postsApi.remove(id),
    onMutate: (id: string) => setDeletingPostId(id),
    onSuccess: () => {
      toast('Publication supprimée.', 'success');
      invalidateAll();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Suppression impossible.', 'error'),
    onSettled: () => setDeletingPostId(null),
  });

  /* ─── Ajout manuel d'une publication ─── */
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
      invalidateAll();
      toast('Publication ajoutée.', 'success');
      setPostOpen(false);
      setPTitle('');
      setPContent('');
      setPHashtags('');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Ajout impossible.', 'error'),
  });

  /* ─── Navigation Mois / Semaine ─── */
  const [anchor, setAnchor] = useState<Date | null>(null);
  const planStart = activePlan ? new Date(activePlan.startDate) : today;
  const currentAnchor = anchor ?? planStart;

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

  /* ─── Modification du calendrier ─── */
  const [editOpen, setEditOpen] = useState(false);
  const [eName, setEName] = useState('');
  const [eStart, setEStart] = useState('');
  const [eEnd, setEEnd] = useState('');

  const openEdit = (plan: PostPlan) => {
    setEName(plan.name);
    setEStart(iso(plan.startDate));
    setEEnd(iso(plan.endDate));
    setEditOpen(true);
  };

  const updatePlan = useMutation({
    mutationFn: () =>
      calendarApi.update(activePlanId!, { name: eName.trim(), startDate: eStart, endDate: eEnd }),
    onSuccess: (res) => {
      invalidateAll();
      setAnchor(null);
      toast('Calendrier mis à jour.', 'success');
      if (res.warning) toast(res.warning, 'info');
      setEditOpen(false);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Modification impossible.', 'error'),
  });

  /* ─── Publications filtrées ─── */
  const allPosts = useMemo(() => activePlan?.posts ?? [], [activePlan]);
  const visiblePosts = useMemo(
    () => (statusFilter === 'ALL' ? allPosts : allPosts.filter((p) => p.status === statusFilter)),
    [allPosts, statusFilter],
  );
  const statusCounts = useMemo(() => {
    const counts: Record<PostStatus, number> = { DRAFT: 0, APPROVED: 0, PUBLISHED: 0 };
    allPosts.forEach((p) => {
      counts[p.status] += 1;
    });
    return counts;
  }, [allPosts]);

  const askDeletePlan = async (plan: PostPlan) => {
    const ok = await confirm({
      title: `Supprimer « ${plan.name} » ?`,
      message: 'Le calendrier et toutes ses publications seront supprimés définitivement.',
      confirmLabel: 'Supprimer',
    });
    if (ok) deletePlan.mutate(plan.id);
  };

  const askClearPosts = async (plan: PostPlan) => {
    const ok = await confirm({
      title: 'Vider ce calendrier ?',
      message: `Les ${allPosts.length} publication(s) de « ${plan.name} » seront supprimées. Le calendrier est conservé, vide.`,
      confirmLabel: 'Vider',
    });
    if (ok) clearPosts.mutate(plan.id);
  };

  const askDeletePost = async (post: PostItem) => {
    const ok = await confirm({
      title: 'Supprimer cette publication ?',
      message: `« ${post.title} » sera retirée du calendrier.`,
      confirmLabel: 'Supprimer',
    });
    if (ok) deletePost.mutate(post.id);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendrier éditorial"
        description="Répartissez vos événements en publications prêtes à adapter, réseau par réseau."
        actions={
          <Button variant="secondary" icon="plus" onClick={() => setEventFormOpen(true)}>
            Ajouter un événement
          </Button>
        }
      />

      {/* ─── Création ─── */}
      <Card className="flex flex-col gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nom du calendrier" hint="Facultatif — daté automatiquement sinon.">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex : Campagne rentrée 2026"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Début">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Fin">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
        </div>

        <Field
          label="Fréquence de publication"
          hint="Chaque événement ne donne qu'une publication par réseau, à sa propre date. Cette fréquence ne sert qu'à répartir les événements sans date, ou datés hors de la plage."
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <Input
              type="number"
              min={1}
              max={50}
              className="!w-20"
              value={freqCount}
              onChange={(e) => setFreqCount(Math.max(1, Number(e.target.value)))}
              aria-label="Nombre de publications"
            />
            <span className="text-sm text-content-2">publication(s) par</span>
            <SegmentedControl
              options={[
                { value: 'day', label: 'jour' },
                { value: 'week', label: 'semaine' },
                { value: 'month', label: 'mois' },
              ]}
              value={freqType}
              onChange={(v) => setFreqType(v as FreqType)}
              ariaLabel="Unité de fréquence"
            />
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
            <Skeleton className="h-[4.5rem] w-full max-w-md" />
          ) : noPreferredNetworks ? (
            <Alert
              tone="warning"
              title="Aucun réseau retenu dans les Paramètres"
              action={
                <Link to="/parametres" className={buttonClasses('secondary', 'sm')}>
                  Choisir mes réseaux
                </Link>
              }
            >
              Les descriptions d'événements sont rédigées uniquement pour les réseaux choisis dans
              votre profil. Sélectionnez-en au moins un pour générer un calendrier.
            </Alert>
          ) : (
            <NetworkSelector
              networks={preferredNetworks}
              selected={networks}
              onToggle={toggleNetwork}
            />
          )}
        </Field>

        <Field label="Source des événements">
          <SegmentedControl
            options={[
              { value: 'selected', label: `Ma sélection (${selectedIds.length})` },
              { value: 'ai', label: 'Événements enregistrés' },
            ]}
            value={eventSource}
            onChange={(v) => setEventSource(v as 'selected' | 'ai')}
            ariaLabel="Source des événements"
            className="!flex w-full max-w-md"
          />
          {eventSource === 'selected' && selectedIds.length === 0 && (
            <p className="mt-2 text-xs text-warning">
              Aucun événement sélectionné. Cochez-en dans « Découverte », ou basculez sur les
              événements enregistrés.
            </p>
          )}
          {eventSource === 'selected' && selectedIds.length > 0 && (
            <button
              type="button"
              className="mt-2 text-xs text-content-muted hover:text-content hover:underline"
              onClick={clear}
            >
              Vider la sélection
            </button>
          )}
        </Field>

        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              icon="calendar"
              onClick={() => generate.mutate()}
              loading={generate.isPending}
              disabled={createEmpty.isPending || networks.length === 0}
            >
              Générer le calendrier
            </Button>
            <Button
              variant="secondary"
              icon="file-text"
              onClick={() => createEmpty.mutate()}
              loading={createEmpty.isPending}
              disabled={generate.isPending}
              title="Crée un calendrier sans aucune publication"
            >
              Créer un calendrier vide
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-content-muted">
            La génération reprend les titres et descriptions déjà rédigés lors de la découverte,
            sans rappeler l'IA. Pour retoucher un texte, utilisez « Régénérer » sur la publication
            concernée.
          </p>
        </div>
      </Card>

      {generate.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* ─── Sélecteur de calendrier ─── */}
      <PlanSelector
        plans={plansQuery.data ?? []}
        loading={plansQuery.isLoading}
        activePlanId={activePlanId}
        onSelect={setActivePlanId}
        onDelete={askDeletePlan}
        deletingId={deletePlan.isPending ? (deletePlan.variables as string) : null}
      />

      {/* ─── Calendrier actif ─── */}
      {activePlanId && (
        <AnimatePresence mode="wait">
          {planQuery.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : activePlan ? (
            <motion.div
              key={activePlan.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-4"
            >
              {/* Barre d'outils du calendrier */}
              <Card padded={false} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg">{activePlan.name}</h2>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-content-muted">
                      <span>
                        {new Date(activePlan.startDate).toLocaleDateString('fr-FR')} –{' '}
                        {new Date(activePlan.endDate).toLocaleDateString('fr-FR')}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{allPosts.length} publication(s)</span>
                      <button
                        type="button"
                        onClick={() => openEdit(activePlan)}
                        className="inline-flex items-center gap-1 text-accent-text hover:underline"
                      >
                        <Icon name="pencil" size={12} />
                        Modifier
                      </button>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon="plus"
                      onClick={() => {
                        setPDate(iso(activePlan.startDate));
                        const planNetwork = activePlan.networks.find((n) =>
                          preferredNetworks.includes(n),
                        );
                        setPNetwork(planNetwork ?? preferredNetworks[0] ?? '');
                        setPostOpen(true);
                      }}
                    >
                      Publication
                    </Button>

                    <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />

                    {EXPORTS.map((exp) => (
                      <a
                        key={exp.format}
                        href={calendarApi.exportUrl(activePlan.id, exp.format)}
                        title={exp.title}
                        className={buttonClasses('ghost', 'sm')}
                      >
                        <Icon name="download" size={14} />
                        {exp.label}
                      </a>
                    ))}

                    <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />

                    {allPosts.length > 0 && (
                      <IconButton
                        icon="eraser"
                        label="Vider le calendrier"
                        size="sm"
                        variant="danger"
                        disabled={clearPosts.isPending}
                        onClick={() => askClearPosts(activePlan)}
                      />
                    )}
                    <IconButton
                      icon="trash"
                      label="Supprimer le calendrier"
                      size="sm"
                      variant="danger"
                      disabled={deletePlan.isPending}
                      onClick={() => askDeletePlan(activePlan)}
                    />
                  </div>
                </div>
              </Card>

              <ReschedulePanel
                plan={activePlan}
                posts={allPosts.filter((p) => p.needsReschedule)}
              />

              {allPosts.length === 0 ? (
                <EmptyState
                  icon="calendar"
                  title="Ce calendrier est vide"
                  description="Ajoutez une publication à la main, ou générez-en depuis vos événements."
                />
              ) : (
                <Card className="flex flex-col gap-4">
                  {/* Vue + filtre de statut */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <SegmentedControl
                      options={[
                        { value: 'list', label: 'Liste', icon: 'list' },
                        { value: 'week', label: 'Semaine', icon: 'columns' },
                        { value: 'month', label: 'Mois', icon: 'grid' },
                      ]}
                      value={viewMode}
                      onChange={(v) => setViewMode(v as ViewMode)}
                      ariaLabel="Mode d'affichage"
                    />

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Icon name="filter" size={14} className="text-content-muted" />
                      <button
                        type="button"
                        onClick={() => setStatusFilter('ALL')}
                        className={clsx(
                          'rounded-full border px-2.5 py-0.5 text-2xs font-semibold transition-colors',
                          statusFilter === 'ALL'
                            ? 'border-line-strong bg-surface-2 text-content'
                            : 'border-line text-content-muted hover:text-content',
                        )}
                      >
                        Toutes ({allPosts.length})
                      </button>
                      {POST_STATUS.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setStatusFilter(s.value)}
                          className={clsx(
                            'rounded-full border px-2.5 py-0.5 text-2xs font-semibold transition-colors',
                            statusFilter === s.value
                              ? 'border-line-strong bg-surface-2 text-content'
                              : 'border-line text-content-muted hover:text-content',
                          )}
                        >
                          {s.label} ({statusCounts[s.value]})
                        </button>
                      ))}
                    </div>
                  </div>

                  {visiblePosts.length === 0 ? (
                    <EmptyState
                      icon="filter"
                      title="Aucune publication dans ce statut"
                      description={`Aucune publication « ${POST_STATUS_LABEL[statusFilter as PostStatus]} » dans ce calendrier.`}
                      action={
                        <Button variant="ghost" onClick={() => setStatusFilter('ALL')}>
                          Voir toutes les publications
                        </Button>
                      }
                    />
                  ) : (
                    <>
                      {viewMode === 'list' && (
                        <ListView
                          posts={visiblePosts}
                          onSelect={setSelectedPost}
                          deletingId={deletingPostId}
                          onDelete={askDeletePost}
                        />
                      )}
                      {viewMode !== 'list' && (
                        <>
                          <PeriodNav
                            label={periodLabel}
                            onPrev={() => shiftAnchor(-1)}
                            onNext={() => shiftAnchor(1)}
                            onReset={() => setAnchor(null)}
                            resetLabel={`Revenir au début du calendrier (${new Date(activePlan.startDate).toLocaleDateString('fr-FR')})`}
                          />
                          {viewMode === 'month' ? (
                            <MonthView
                              posts={visiblePosts}
                              anchor={currentAnchor}
                              onSelect={setSelectedPost}
                            />
                          ) : (
                            <WeekView
                              posts={visiblePosts}
                              anchor={currentAnchor}
                              onSelect={setSelectedPost}
                            />
                          )}
                        </>
                      )}
                    </>
                  )}

                  <div className="border-t border-line pt-3">
                    <StatusLegend />
                  </div>
                </Card>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      )}

      <PostModal post={selectedPost} plan={activePlan ?? null} onClose={() => setSelectedPost(null)} />

      {/* ─── Modification du calendrier ─── */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Modifier le calendrier"
        description="Les publications hors de la nouvelle plage sont conservées et signalées."
        maxWidth="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              icon="save"
              onClick={() => updatePlan.mutate()}
              loading={updatePlan.isPending}
              disabled={!eName.trim() || !eStart || !eEnd || eEnd < eStart}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Nom du calendrier" required>
            <Input value={eName} onChange={(e) => setEName(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Début">
              <Input type="date" value={eStart} onChange={(e) => setEStart(e.target.value)} />
            </Field>
            <Field label="Fin">
              <Input type="date" value={eEnd} onChange={(e) => setEEnd(e.target.value)} />
            </Field>
          </div>
          {eStart && eEnd && eEnd < eStart && (
            <Alert tone="warning">La date de fin précède la date de début.</Alert>
          )}
        </div>
      </Modal>

      {/* ─── Ajout manuel d'une publication ─── */}
      <Modal
        open={postOpen}
        onClose={() => setPostOpen(false)}
        title="Ajouter une publication"
        description="Enregistrée telle quelle : aucun contenu n'est généré par l'IA."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPostOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              icon="plus"
              onClick={() => createPost.mutate()}
              loading={createPost.isPending}
              disabled={!pTitle.trim() || !pNetwork}
            >
              Ajouter
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date de publication">
              <Input
                type="date"
                value={pDate}
                min={activePlan ? iso(activePlan.startDate) : undefined}
                max={activePlan ? iso(activePlan.endDate) : undefined}
                onChange={(e) => setPDate(e.target.value)}
              />
            </Field>
            <Field label="Réseau" required>
              <Select value={pNetwork} onChange={(e) => setPNetwork(e.target.value as Network)}>
                {preferredNetworks.length === 0 && <option value="">Aucun réseau configuré</option>}
                {preferredNetworks.map((n) => (
                  <option key={n} value={n}>
                    {NETWORK_LABEL[n]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Titre" required>
            <Input
              value={pTitle}
              onChange={(e) => setPTitle(e.target.value)}
              placeholder="ex : Annonce de notre porte ouverte"
            />
          </Field>
          <Field label="Contenu">
            <Textarea
              className="min-h-[9rem]"
              value={pContent}
              onChange={(e) => setPContent(e.target.value)}
              placeholder="Rédigez votre publication…"
            />
          </Field>
          <Field label="Hashtags" hint="Séparés par des espaces ou des virgules.">
            <Input
              value={pHashtags}
              onChange={(e) => setPHashtags(e.target.value)}
              placeholder="#exemple #buzzy"
            />
          </Field>
        </div>
      </Modal>

      <EventFormModal
        open={eventFormOpen}
        onClose={() => setEventFormOpen(false)}
        onSaved={(ev) => {
          // Sur cette page, l'événement créé rejoint la sélection servant à la
          // génération du calendrier.
          toggle(ev.id);
          setEventSource('selected');
        }}
      />
    </div>
  );
}

/* ─── Sélecteur de calendrier ──────────────────────────────────── */

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
  if (loading) return <Skeleton className="h-9 w-full max-w-sm" />;
  if (plans.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold text-content-2">Mes calendriers</h2>
      <div className="flex flex-wrap gap-2">
        {plans.map((p) => {
          const active = activePlanId === p.id;
          return (
            <div
              key={p.id}
              className={clsx(
                'group flex items-center rounded-md border transition-colors',
                active
                  ? 'border-brand bg-brand-soft'
                  : 'border-line bg-surface hover:border-line-strong',
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                aria-pressed={active}
                className={clsx(
                  'py-1.5 pl-3 pr-1.5 text-[13px] font-medium',
                  active ? 'text-brand-text' : 'text-content-2',
                )}
              >
                {p.name}
                <span className="ml-1.5 text-2xs opacity-70">
                  {p._count?.posts ?? p.posts?.length ?? 0}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(p)}
                disabled={deletingId === p.id}
                aria-label={`Supprimer le calendrier « ${p.name} »`}
                title="Supprimer ce calendrier"
                className="mr-1 flex h-6 w-6 items-center justify-center rounded text-content-muted opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
