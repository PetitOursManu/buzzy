import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PostItem } from '../lib/types';
import { NETWORK_EMOJI, NETWORK_LABEL } from '../lib/constants';
import { postsApi, ApiError } from '../lib/api';
import { Modal, Spinner, Chip } from './ui';
import { useToast } from '../hooks/useToast';

export function PostModal({
  post,
  planId,
  onClose,
}: {
  post: PostItem | null;
  planId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hashtags, setHashtags] = useState('');

  useEffect(() => {
    if (post) {
      setTitle(post.title);
      setContent(post.content);
      setHashtags(post.hashtags.map((h) => `#${h}`).join(' '));
    }
  }, [post]);

  const parseHashtags = () =>
    hashtags
      .split(/[\s,]+/)
      .map((h) => h.replace(/^#/, '').trim())
      .filter(Boolean);

  const save = useMutation({
    mutationFn: () =>
      postsApi.update(post!.id, { title, content, hashtags: parseHashtags() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', planId] });
      toast('Publication enregistrée.', 'success');
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Erreur d\'enregistrement.', 'error'),
  });

  const remove = useMutation({
    mutationFn: () => postsApi.remove(post!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', planId] });
      queryClient.invalidateQueries({ queryKey: ['calendar', 'list'] });
      toast('Publication supprimée.', 'success');
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Suppression impossible.', 'error'),
  });

  const regenerate = useMutation({
    mutationFn: () => postsApi.regenerate(post!.id),
    onSuccess: (updated) => {
      setTitle(updated.title);
      setContent(updated.content);
      setHashtags(updated.hashtags.map((h) => `#${h}`).join(' '));
      queryClient.invalidateQueries({ queryKey: ['calendar', planId] });
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

  if (!post) return null;

  const dateStr = new Date(post.scheduledDate).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Modal open={!!post} onClose={onClose} title="Publication">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="grape">
            {NETWORK_EMOJI[post.network]} {NETWORK_LABEL[post.network]}
          </Chip>
          <Chip>🗓️ {dateStr}</Chip>
          {post.relatedEvent && <Chip tone="honey">🔖 {post.relatedEvent.title}</Chip>}
        </div>

        <label className="block">
          <span className="block text-sm font-medium mb-1.5">Titre</span>
          <input className="glass-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label className="block">
          <span className="block text-sm font-medium mb-1.5">Contenu</span>
          <textarea
            className="glass-input min-h-[160px] resize-y"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium mb-1.5">Hashtags</span>
          <input
            className="glass-input"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="#exemple #buzzy"
          />
        </label>

        {post.relatedEvent && post.relatedEvent.sources.length > 0 && (
          <div className="glass rounded-xl p-3">
            <span className="text-xs font-medium text-muted">Sources de l'événement lié :</span>
            <ul className="mt-1 flex flex-col gap-0.5">
              {post.relatedEvent.sources.map((s, i) => (
                <li key={i}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[color:var(--grape)] hover:underline break-all"
                  >
                    🔗 {s.title || s.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center border-t border-[color:var(--glass-border)] pt-4">
          <button
            className="btn-ghost text-sm flex items-center gap-2 !text-red-500 hover:!bg-red-500/10"
            onClick={() => {
              if (confirm('Supprimer définitivement cette publication du calendrier ?')) {
                remove.mutate();
              }
            }}
            disabled={remove.isPending}
            title="Retire cette publication du calendrier"
          >
            {remove.isPending ? <Spinner /> : '🗑️'} Supprimer
          </button>
          <div className="flex-1" />
          <button className="btn-ghost text-sm" onClick={copyText}>
            📋 Copier
          </button>
          <button
            className="btn-ghost text-sm flex items-center gap-2"
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            title={`Régénère le texte via l'IA, adapté à ${NETWORK_LABEL[post.network]}`}
          >
            {regenerate.isPending ? <Spinner /> : '🔄'} Régénérer pour {NETWORK_LABEL[post.network]}
          </button>
          <button
            className="btn-primary text-sm flex items-center gap-2"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {save.isPending ? <Spinner /> : '💾'} Enregistrer
          </button>
        </div>
      </div>
    </Modal>
  );
}
