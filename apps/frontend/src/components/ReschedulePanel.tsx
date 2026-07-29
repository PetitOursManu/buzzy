import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PostItem, PostPlan } from '../lib/types';
import { NETWORK_EMOJI, NETWORK_LABEL } from '../lib/constants';
import { postsApi, ApiError } from '../lib/api';
import { Spinner } from './ui';
import { useToast } from '../hooks/useToast';

const iso = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

const dateLabel = (d: string) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Encart affiché au-dessus du calendrier lorsque des publications proviennent
 * d'événements datés hors de la plage du calendrier.
 *
 * Buzzy ne choisit pas à la place de l'utilisateur : chaque publication attend
 * qu'on lui attribue une date, forcément comprise dans la plage du calendrier.
 */
export function ReschedulePanel({ plan, posts }: { plan: PostPlan; posts: PostItem[] }) {
  if (posts.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-strong rounded-2xl p-4 flex flex-col gap-3 border border-amber-500/40"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <span aria-hidden>⚠️</span>
          {posts.length} publication(s) hors de la plage du calendrier
        </h3>
        <span className="text-xs text-muted">
          calendrier du {dateLabel(plan.startDate)} au {dateLabel(plan.endDate)}
        </span>
      </div>
      <p className="text-sm text-secondary">
        Ces événements sont datés en dehors de la plage choisie. Attribuez à chacun une date
        comprise dans le calendrier ; en attendant, ils restent placés à titre provisoire.
      </p>

      <div className="flex flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {posts.map((post) => (
            <RescheduleRow key={post.id} post={post} plan={plan} />
          ))}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

function RescheduleRow({ post, plan }: { post: PostItem; plan: PostPlan }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(iso(plan.startDate));

  const save = useMutation({
    mutationFn: () =>
      postsApi.update(post.id, {
        scheduledDate: new Date(`${date}T10:00:00`).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', plan.id] });
      queryClient.invalidateQueries({ queryKey: ['calendar', 'list'] });
      toast(`« ${post.title} » placé au ${dateLabel(date)}.`, 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Date non attribuée.', 'error'),
  });

  // Date d'origine de l'événement, celle qui tombe hors plage.
  const originalDate = post.relatedEvent?.eventDate;

  return (
    <motion.div
      layout
      exit={{ opacity: 0, height: 0 }}
      className="glass rounded-xl p-3 flex flex-wrap items-center gap-3"
    >
      <div className="flex-1 min-w-[220px] flex flex-col gap-0.5">
        <span className="text-xs text-muted flex items-center gap-1.5">
          {NETWORK_EMOJI[post.network]} {NETWORK_LABEL[post.network]}
        </span>
        <span className="font-medium text-sm">{post.title}</span>
        {originalDate && (
          <span className="text-xs text-amber-500">
            Date de l'événement : {dateLabel(originalDate)} — hors calendrier
          </span>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <span className="sr-only">Nouvelle date pour « {post.title} »</span>
        <input
          type="date"
          className="glass-input !w-auto !py-1.5"
          value={date}
          min={iso(plan.startDate)}
          max={iso(plan.endDate)}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>

      <button
        className="btn-primary !py-1.5 !px-3 text-sm flex items-center gap-2"
        onClick={() => save.mutate()}
        disabled={save.isPending || !date}
      >
        {save.isPending ? <Spinner /> : '📌'} Attribuer
      </button>
    </motion.div>
  );
}
