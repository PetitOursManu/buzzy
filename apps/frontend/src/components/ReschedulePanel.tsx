import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PostItem, PostPlan } from '../lib/types';
import { NETWORK_LABEL } from '../lib/constants';
import { postsApi, ApiError } from '../lib/api';
import { Button, Input } from './ui';
import { Icon } from './icons';
import { NetworkIcon } from './NetworkIcon';
import { useToast } from '../hooks/useToast';

const iso = (d: Date | string) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

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
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4"
    >
      <div className="flex items-start gap-2.5">
        <Icon name="alert-triangle" size={18} className="mt-0.5 text-warning" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm text-warning">
            {posts.length} publication{posts.length > 1 ? 's' : ''} hors de la plage du calendrier
          </h3>
          <p className="mt-0.5 text-[13px] leading-relaxed text-content-2">
            Ces événements sont datés en dehors du {dateLabel(plan.startDate)} –{' '}
            {dateLabel(plan.endDate)}. Attribuez à chacun une date comprise dans le calendrier ; en
            attendant, ils restent placés à titre provisoire.
          </p>
        </div>
      </div>

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

  const originalDate = post.relatedEvent?.eventDate;

  return (
    <motion.div
      layout
      exit={{ opacity: 0, height: 0 }}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3"
    >
      <div className="flex min-w-[14rem] flex-1 flex-col gap-0.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-content-muted">
          <NetworkIcon network={post.network} size={12} />
          {NETWORK_LABEL[post.network]}
        </span>
        <span className="text-sm font-medium leading-snug">{post.title}</span>
        {originalDate && (
          <span className="text-xs text-warning">
            Événement daté du {dateLabel(originalDate)} — hors calendrier
          </span>
        )}
      </div>

      <label className="flex items-center gap-2">
        <span className="sr-only">Nouvelle date pour « {post.title} »</span>
        <Input
          type="date"
          className="!w-auto"
          value={date}
          min={iso(plan.startDate)}
          max={iso(plan.endDate)}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>

      <Button
        variant="primary"
        size="sm"
        icon="pin"
        onClick={() => save.mutate()}
        loading={save.isPending}
        disabled={!date}
      >
        Attribuer
      </Button>
    </motion.div>
  );
}
