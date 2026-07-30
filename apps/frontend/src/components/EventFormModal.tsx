import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { calendarApi, eventsApi, ApiError } from '../lib/api';
import type { EventItem, EventScope, Network } from '../lib/types';
import { NETWORK_LABEL, SCOPES, THEMES } from '../lib/constants';
import { Alert, Button, Field, Input, Modal, SegmentedControl, Select, Tag, Textarea } from './ui';
import { NetworkIcon } from './NetworkIcon';
import { useToast } from '../hooks/useToast';
import { usePreferredNetworks } from '../hooks/usePreferredNetworks';

const iso = (d: Date | string) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

interface FormState {
  title: string;
  description: string;
  date: string;
  period: string;
  scope: EventScope;
  theme: string;
  region: string;
}

function initialState(event: EventItem | null): FormState {
  if (!event) {
    return {
      title: '',
      description: '',
      date: iso(new Date()),
      period: '',
      scope: 'NATIONAL',
      theme: 'Autre',
      region: '',
    };
  }
  return {
    title: event.title,
    description: event.description,
    date: event.eventDate ? iso(event.eventDate) : '',
    period: event.eventPeriod ?? '',
    scope: event.scope,
    theme: THEMES.includes(event.theme as (typeof THEMES)[number]) ? event.theme : 'Autre',
    region: event.region ?? '',
  };
}

/**
 * Création et édition d'un événement.
 *
 * Un seul formulaire pour les deux cas : ce sont les mêmes champs, et les
 * dédoubler garantissait qu'ils divergent au premier ajout. En création
 * seulement, on propose de rattacher directement l'événement à un calendrier
 * existant — l'enchaînement le plus fréquent après une saisie manuelle.
 *
 * Aucune génération IA n'intervient : tout est enregistré tel quel.
 */
export function EventFormModal({
  open,
  onClose,
  event = null,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Renseigné = édition ; `null` = création. */
  event?: EventItem | null;
  onSaved?: (event: EventItem) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = event !== null;

  const [form, setForm] = useState<FormState>(() => initialState(event));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Réinitialise à chaque ouverture, sinon la modale rouvrirait sur les
  // valeurs de l'événement précédemment édité.
  useEffect(() => {
    if (open) setForm(initialState(event));
  }, [open, event]);

  /* ─── Rattachement à un calendrier (création uniquement) ─── */
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [planId, setPlanId] = useState('');
  const [networks, setNetworks] = useState<Network[]>([]);

  const plansQuery = useQuery({
    queryKey: ['calendar', 'list'],
    queryFn: calendarApi.list,
    enabled: open && !isEdit,
  });
  const plans = plansQuery.data ?? [];
  const selectedPlan = plans.find((p) => p.id === planId) ?? null;
  const { networks: preferredNetworks } = usePreferredNetworks();

  useEffect(() => {
    if (!open) {
      setAddToCalendar(false);
      setPlanId('');
      setNetworks([]);
    }
  }, [open]);

  useEffect(() => {
    if (addToCalendar && !planId && plans.length > 0) setPlanId(plans[0].id);
  }, [addToCalendar, plans, planId]);

  // Présélectionne les réseaux du calendrier choisi, en écartant ceux qui ne
  // sont plus retenus dans les Paramètres.
  useEffect(() => {
    if (selectedPlan) {
      setNetworks((selectedPlan.networks ?? []).filter((n) => preferredNetworks.includes(n)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  const toggleNetwork = (n: Network) =>
    setNetworks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));

  /* ─── Enregistrement ─── */

  const submit = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        eventDate: form.date || null,
        eventPeriod: form.period.trim() || null,
        scope: form.scope,
        theme: form.theme,
        region: form.region.trim() || null,
      };

      if (isEdit) {
        const updated = await eventsApi.update(event!.id, payload);
        return { event: updated, addedPosts: 0, warning: undefined as string | undefined };
      }

      const created = await eventsApi.createManual(payload);

      let addedPosts = 0;
      let warning: string | undefined;
      if (addToCalendar && planId) {
        const res = await calendarApi.addEvent(planId, {
          eventId: created.id,
          networks,
          scheduledDate: form.date ? new Date(`${form.date}T10:00:00`).toISOString() : undefined,
        });
        addedPosts = res.posts.length;
        warning = res.warning;
      }
      return { event: created, addedPosts, warning };
    },
    onSuccess: ({ event: saved, addedPosts, warning }) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      if (addedPosts > 0) {
        queryClient.invalidateQueries({ queryKey: ['calendar'] });
        toast(
          `Événement ajouté et ${addedPosts} publication(s) créée(s) dans « ${selectedPlan?.name} ».`,
          'success',
        );
        if (warning) toast(warning, 'info');
      } else {
        toast(isEdit ? 'Événement modifié.' : 'Événement ajouté.', 'success');
      }
      onSaved?.(saved);
      onClose();
    },
    onError: (e) =>
      toast(e instanceof ApiError ? e.message : 'Enregistrement impossible.', 'error'),
  });

  const missingNetworks = addToCalendar && !!planId && networks.length === 0;
  const canSubmit =
    !!form.title.trim() && !!form.description.trim() && !missingNetworks && !(addToCalendar && !planId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Modifier l'événement" : 'Ajouter un événement'}
      description={
        isEdit
          ? 'Les publications déjà créées à partir de cet événement ne sont pas modifiées.'
          : 'Créez un événement que vous connaissez déjà. Rien n’est généré par l’IA.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            icon={isEdit ? 'save' : 'plus'}
            onClick={() => submit.mutate()}
            loading={submit.isPending}
            disabled={!canSubmit}
          >
            {isEdit
              ? 'Enregistrer'
              : addToCalendar
                ? "Ajouter l'événement et les publications"
                : "Ajouter l'événement"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Titre" required>
          <Input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="ex : Inauguration de notre nouveau local"
          />
        </Field>

        <Field label="Description" required>
          <Textarea
            className="min-h-[7rem]"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Décrivez l'événement…"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" hint="Laissez vide pour une période imprécise.">
            <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Période" hint="Utilisée quand aucune date précise n'est connue.">
            <Input
              value={form.period}
              onChange={(e) => set('period', e.target.value)}
              placeholder="ex : Juin 2026"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Thème">
            <Select value={form.theme} onChange={(e) => set('theme', e.target.value)}>
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Localisation" hint="Ville ou région concernée, si pertinent.">
            <Input
              value={form.region}
              onChange={(e) => set('region', e.target.value)}
              placeholder="ex : Lyon"
            />
          </Field>
        </div>

        <Field label="Portée">
          <SegmentedControl
            options={SCOPES.map((s) => ({ value: s.value, label: s.label, icon: s.icon }))}
            value={form.scope}
            onChange={(v) => set('scope', v)}
            ariaLabel="Portée géographique"
            className="!flex w-full flex-wrap"
          />
        </Field>

        {/* ─── Rattachement à un calendrier ─── */}
        {!isEdit && (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-4">
            <Field
              label="Ajouter aussi cet événement à un calendrier ?"
              hint="Dans tous les cas, l'événement rejoint la page Découverte."
            >
              <SegmentedControl
                options={[
                  { value: 'no', label: 'Découverte seulement' },
                  { value: 'yes', label: 'Et dans un calendrier' },
                ]}
                value={addToCalendar ? 'yes' : 'no'}
                onChange={(v) => setAddToCalendar(v === 'yes' && plans.length > 0)}
                ariaLabel="Rattachement à un calendrier"
                className="!flex w-full"
              />
            </Field>

            {plans.length === 0 && (
              <p className="text-xs text-content-muted">
                Aucun calendrier pour l'instant. Créez-en un depuis la page « Calendrier ».
              </p>
            )}

            {addToCalendar && plans.length > 0 && (
              <>
                <Field label="Calendrier de destination">
                  <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p._count?.posts ?? 0} publication(s))
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="Réseaux concernés"
                  hint="Une publication est créée par réseau, reprenant le titre et la description."
                >
                  <div className="flex flex-wrap gap-1.5">
                    {preferredNetworks.map((n) => (
                      <Tag
                        key={n}
                        active={networks.includes(n)}
                        onClick={() => toggleNetwork(n)}
                      >
                        <NetworkIcon network={n} size={13} colored={!networks.includes(n)} />
                        {NETWORK_LABEL[n]}
                      </Tag>
                    ))}
                  </div>
                </Field>

                {preferredNetworks.length === 0 && (
                  <Alert tone="warning">
                    Aucun réseau retenu dans les Paramètres. Choisissez-en au moins un dans votre
                    profil pour pouvoir créer des publications.
                  </Alert>
                )}
                {missingNetworks && preferredNetworks.length > 0 && (
                  <Alert tone="warning">
                    Sélectionnez au moins un réseau pour créer les publications.
                  </Alert>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
