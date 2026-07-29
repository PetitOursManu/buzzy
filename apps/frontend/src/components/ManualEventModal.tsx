import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { calendarApi, eventsApi, ApiError } from '../lib/api';
import type { EventItem, EventScope, Network } from '../lib/types';
import { NETWORK_EMOJI, NETWORK_LABEL, SCOPES, THEMES } from '../lib/constants';
import { Field, Modal, Spinner } from './ui';
import { useToast } from '../hooks/useToast';
import { usePreferredNetworks } from '../hooks/usePreferredNetworks';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Formulaire d'ajout manuel d'un événement.
 *
 * L'événement est toujours ajouté à la page principale (Découverte). Le
 * formulaire demande ensuite si l'utilisateur souhaite aussi le placer dans un
 * calendrier existant :
 *  - « Non » : l'événement est simplement créé, rien d'autre.
 *  - « Oui » : une publication est créée dans le calendrier choisi, pour chaque
 *    réseau retenu, à partir du titre et de la description de l'événement.
 *
 * Aucune génération IA n'intervient : tout est enregistré tel quel.
 */
export function ManualEventModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Appelé après création réussie de l'événement. */
  onCreated?: (event: EventItem) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(iso(new Date()));
  const [scope, setScope] = useState<EventScope>('NATIONAL');
  const [theme, setTheme] = useState<string>('Autre');

  // Rattachement optionnel à un calendrier existant.
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [planId, setPlanId] = useState<string>('');
  const [networks, setNetworks] = useState<Network[]>([]);

  const plansQuery = useQuery({
    queryKey: ['calendar', 'list'],
    queryFn: calendarApi.list,
    enabled: open,
  });
  const plans = plansQuery.data ?? [];
  const selectedPlan = plans.find((p) => p.id === planId) ?? null;

  // Mêmes réseaux que partout ailleurs : ceux retenus dans les Paramètres.
  const { networks: preferredNetworks } = usePreferredNetworks();

  // À l'ouverture d'un calendrier, on présélectionne ses réseaux, en écartant
  // ceux qui ne sont plus retenus dans les Paramètres.
  useEffect(() => {
    if (selectedPlan) {
      setNetworks((selectedPlan.networks ?? []).filter((n) => preferredNetworks.includes(n)));
    }
  }, [planId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Premier calendrier présélectionné dès que l'utilisateur choisit « Oui ».
  useEffect(() => {
    if (addToCalendar && !planId && plans.length > 0) setPlanId(plans[0].id);
  }, [addToCalendar, plans, planId]);

  const reset = () => {
    setTitle('');
    setDescription('');
    setDate(iso(new Date()));
    setScope('NATIONAL');
    setTheme('Autre');
    setAddToCalendar(false);
    setPlanId('');
    setNetworks([]);
  };

  const toggleNetwork = (n: Network) =>
    setNetworks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));

  const submit = useMutation({
    mutationFn: async () => {
      // 1. L'événement rejoint toujours la page principale.
      const event = await eventsApi.createManual({
        title: title.trim(),
        description: description.trim(),
        eventDate: date || null,
        scope,
        theme,
      });

      // 2. Rattachement au calendrier choisi, si demandé.
      let addedPosts = 0;
      let warning: string | undefined;
      if (addToCalendar && planId) {
        const res = await calendarApi.addEvent(planId, {
          eventId: event.id,
          networks,
          scheduledDate: date ? new Date(`${date}T10:00:00`).toISOString() : undefined,
        });
        addedPosts = res.posts.length;
        warning = res.warning;
      }
      return { event, addedPosts, warning };
    },
    onSuccess: ({ event, addedPosts, warning }) => {
      queryClient.invalidateQueries({ queryKey: ['events', 'history'] });
      if (addedPosts > 0) {
        queryClient.invalidateQueries({ queryKey: ['calendar'] });
        toast(
          `Événement ajouté et ${addedPosts} publication(s) créée(s) dans « ${selectedPlan?.name} ».`,
          'success',
        );
        if (warning) toast(warning, 'info');
      } else {
        toast('Événement ajouté à la page principale.', 'success');
      }
      onCreated?.(event);
      reset();
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Ajout impossible.', 'error'),
  });

  const noNetworks = addToCalendar && !!planId && networks.length === 0;
  const canSubmit =
    !!title.trim() && !!description.trim() && !submit.isPending && !noNetworks &&
    !(addToCalendar && !planId);

  return (
    <Modal open={open} onClose={onClose} title="Ajouter un événement">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-secondary">
          Créez un événement que vous connaissez déjà. Il est enregistré tel quel, sans génération
          par l'IA.
        </p>

        <Field label="Date de l'événement">
          <input type="date" className="glass-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label="Titre">
          <input
            className="glass-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex : Inauguration de notre nouveau local"
          />
        </Field>

        <Field label="Description">
          <textarea
            className="glass-input min-h-[110px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Décrivez l'événement…"
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Portée">
            <select className="glass-input" value={scope} onChange={(e) => setScope(e.target.value as EventScope)}>
              {SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Thème">
            <select className="glass-input" value={theme} onChange={(e) => setTheme(e.target.value)}>
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* ─── Rattachement à un calendrier ─── */}
        <div className="glass rounded-xl p-4 flex flex-col gap-3">
          <Field
            label="Ajouter aussi cet événement à un calendrier ?"
            hint="Dans tous les cas, l'événement est ajouté à la page principale."
          >
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAddToCalendar(false)}
                aria-pressed={!addToCalendar}
                className={!addToCalendar ? 'btn-primary !py-2 text-sm flex-1' : 'btn-ghost !py-2 text-sm flex-1'}
              >
                Non, page principale seulement
              </button>
              <button
                type="button"
                onClick={() => setAddToCalendar(true)}
                aria-pressed={addToCalendar}
                disabled={plans.length === 0}
                title={plans.length === 0 ? "Aucun calendrier existant pour l'instant" : undefined}
                className={addToCalendar ? 'btn-primary !py-2 text-sm flex-1' : 'btn-ghost !py-2 text-sm flex-1'}
              >
                Oui, dans un calendrier
              </button>
            </div>
          </Field>

          {plans.length === 0 && (
            <p className="text-xs text-muted">
              Aucun calendrier pour l'instant. Créez-en un depuis la page « Calendrier ».
            </p>
          )}

          {addToCalendar && plans.length > 0 && (
            <>
              <Field label="Calendrier de destination">
                <select className="glass-input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p._count?.posts ?? 0} publication(s))
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Réseaux concernés"
                hint="Une publication est créée par réseau, reprenant le titre et la description de l'événement."
              >
                <div className="flex flex-wrap gap-2">
                  {preferredNetworks.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleNetwork(n)}
                      aria-pressed={networks.includes(n)}
                      className={networks.includes(n) ? 'opt-tag opt-tag--active' : 'opt-tag'}
                    >
                      <span aria-hidden>{NETWORK_EMOJI[n]}</span> {NETWORK_LABEL[n]}
                    </button>
                  ))}
                </div>
                {preferredNetworks.length === 0 && (
                  <p className="text-xs text-amber-500 mt-2">
                    Aucun réseau retenu dans les Paramètres. Choisissez-en au moins un dans votre
                    profil pour pouvoir créer des publications.
                  </p>
                )}
                {noNetworks && preferredNetworks.length > 0 && (
                  <p className="text-xs text-amber-500 mt-2">
                    Sélectionnez au moins un réseau pour créer les publications.
                  </p>
                )}
              </Field>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost text-sm" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn-primary text-sm flex items-center gap-2"
            onClick={() => submit.mutate()}
            disabled={!canSubmit}
          >
            {submit.isPending ? <Spinner /> : '➕'}
            {addToCalendar ? "Ajouter l'événement et les publications" : "Ajouter l'événement"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
