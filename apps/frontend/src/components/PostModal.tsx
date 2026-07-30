import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import type { PostItem, PostPlan, PostStatus } from '../lib/types';
import {
  NETWORK_LABEL,
  NETWORK_RECOMMENDED,
  POST_STATUS,
  POST_STATUS_LABEL,
} from '../lib/constants';
import { postsApi, ApiError } from '../lib/api';
import {
  Alert,
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  Textarea,
} from './ui';
import { Icon } from './icons';
import { NetworkIcon } from './NetworkIcon';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';

const iso = (d: Date | string) => {
  const date = new Date(d);
  // Découpe en heure locale : `toISOString()` bascule en UTC et décale d'un
  // jour toute publication du soir sur un fuseau positif.
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export function PostModal({
  post,
  plan,
  onClose,
}: {
  post: PostItem | null;
  plan: PostPlan | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const planId = plan?.id ?? '';

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [status, setStatus] = useState<PostStatus>('DRAFT');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (post) {
      setTitle(post.title);
      setContent(post.content);
      setHashtags(post.hashtags.map((h) => `#${h}`).join(' '));
      setStatus(post.status);
      setDate(iso(post.scheduledDate));
    }
  }, [post]);

  const parseHashtags = () =>
    hashtags
      .split(/[\s,]+/)
      .map((h) => h.replace(/^#/, '').trim())
      .filter(Boolean);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['calendar', planId] });
    queryClient.invalidateQueries({ queryKey: ['calendar', 'list'] });
  };

  const save = useMutation({
    mutationFn: () =>
      postsApi.update(post!.id, {
        title,
        content,
        hashtags: parseHashtags(),
        status,
        // L'heure de publication (10 h) est conservée par le backend ; on
        // n'envoie que la journée choisie.
        scheduledDate: new Date(`${date}T10:00:00`).toISOString(),
      }),
    onSuccess: () => {
      invalidate();
      toast('Publication enregistrée.', 'success');
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Erreur d'enregistrement.", 'error'),
  });

  const remove = useMutation({
    mutationFn: () => postsApi.remove(post!.id),
    onSuccess: () => {
      invalidate();
      toast('Publication supprimée.', 'success');
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Suppression impossible.', 'error'),
  });

  const duplicate = useMutation({
    mutationFn: () => postsApi.duplicate(post!.id),
    onSuccess: () => {
      invalidate();
      toast('Copie créée en brouillon, à la même date.', 'success');
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Duplication impossible.', 'error'),
  });

  const regenerate = useMutation({
    mutationFn: () => postsApi.regenerate(post!.id),
    onSuccess: (updated) => {
      setTitle(updated.title);
      setContent(updated.content);
      setHashtags(updated.hashtags.map((h) => `#${h}`).join(' '));
      invalidate();
      toast('Publication régénérée.', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Erreur de régénération.', 'error'),
  });

  const copyText = async () => {
    const tags = parseHashtags()
      .map((h) => `#${h}`)
      .join(' ');
    const text = `${content}${tags ? `\n\n${tags}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('Texte copié dans le presse-papiers.', 'success');
    } catch {
      toast('Copie impossible dans ce navigateur.', 'error');
    }
  };

  const askRemove = async () => {
    const ok = await confirm({
      title: 'Supprimer cette publication ?',
      message: `« ${post?.title} » sera retirée du calendrier. Cette action est définitive.`,
      confirmLabel: 'Supprimer',
    });
    if (ok) remove.mutate();
  };

  if (!post) return null;

  const limit = NETWORK_RECOMMENDED[post.network];
  const tooLong = content.length > limit;
  const busy = save.isPending || remove.isPending || regenerate.isPending || duplicate.isPending;

  return (
    <Modal
      open={!!post}
      onClose={onClose}
      title="Publication"
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="danger" icon="trash" onClick={askRemove} disabled={busy}>
            Supprimer
          </Button>
          <span className="flex-1" />
          {/* Icône seule : « copier » se reconnaît sans libellé, et cinq
              boutons texte feraient passer le pied sur deux lignes. */}
          <IconButton
            icon="copy"
            label="Copier le texte de la publication"
            onClick={copyText}
            disabled={busy}
          />
          <Button
            variant="ghost"
            icon="copy"
            onClick={() => duplicate.mutate()}
            loading={duplicate.isPending}
            disabled={busy && !duplicate.isPending}
            title="Crée une copie en brouillon dans le même calendrier"
          >
            Dupliquer
          </Button>
          <Button
            variant="secondary"
            icon="sparkles"
            onClick={() => regenerate.mutate()}
            loading={regenerate.isPending}
            disabled={busy && !regenerate.isPending}
            title={`Régénère le texte via l'IA, adapté à ${NETWORK_LABEL[post.network]}`}
          >
            Régénérer
          </Button>
          <Button
            variant="primary"
            icon="save"
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={busy && !save.isPending}
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium">
            <NetworkIcon network={post.network} size={13} />
            {NETWORK_LABEL[post.network]}
          </span>
          {post.relatedEvent && (
            <Badge tone="brand" icon="link">
              {post.relatedEvent.title}
            </Badge>
          )}
        </div>

        {post.needsReschedule && (
          <Alert tone="warning" title="Date à confirmer">
            L'événement lié est daté hors de la plage du calendrier. Choisissez une date ci-dessous
            pour lever ce signalement.
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Date de publication"
            hint={
              plan
                ? `Entre le ${new Date(plan.startDate).toLocaleDateString('fr-FR')} et le ${new Date(plan.endDate).toLocaleDateString('fr-FR')}.`
                : undefined
            }
          >
            <Input
              type="date"
              value={date}
              min={plan ? iso(plan.startDate) : undefined}
              max={plan ? iso(plan.endDate) : undefined}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          <Field label="Statut" hint="Suit l'avancement de la publication.">
            <SegmentedControl
              options={POST_STATUS.map((s) => ({ value: s.value, label: s.label, icon: s.icon }))}
              value={status}
              onChange={setStatus}
              ariaLabel="Statut de la publication"
              className="!flex w-full"
            />
          </Field>
        </div>

        <Field label="Titre">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <Field label="Contenu">
          <Textarea
            className="min-h-[10rem]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <span
            className={clsx(
              'mt-1 flex items-center gap-1 text-xs tabular-nums',
              tooLong ? 'text-warning' : 'text-content-muted',
            )}
          >
            {tooLong && <Icon name="alert-triangle" size={12} />}
            {content.length} / {limit} caractères conseillés pour {NETWORK_LABEL[post.network]}
          </span>
        </Field>

        <Field label="Hashtags" hint="Séparés par des espaces ou des virgules.">
          <Input
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="#exemple #buzzy"
          />
        </Field>

        {post.relatedEvent && post.relatedEvent.sources.length > 0 && (
          <div className="rounded-lg border border-line bg-surface-2 p-3">
            <span className="text-2xs font-semibold uppercase tracking-wide text-content-muted">
              Sources de l'événement lié
            </span>
            <ul className="mt-1.5 flex flex-col gap-1">
              {post.relatedEvent.sources.map((s, i) => (
                <li key={i}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-start gap-1.5 text-xs text-accent-text hover:underline"
                  >
                    <Icon name="external-link" size={12} className="mt-0.5" />
                    <span className="truncate">{s.title || s.url}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-2xs text-content-muted">
          Statut actuel enregistré : {POST_STATUS_LABEL[post.status]}.
        </p>
      </div>
    </Modal>
  );
}
