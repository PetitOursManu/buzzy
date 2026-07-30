import { motion } from 'framer-motion';
import clsx from 'clsx';
import type { PostItem, PostStatus } from '../lib/types';
import { NETWORK_LABEL, POST_STATUS_LABEL, POST_STATUS_TONE } from '../lib/constants';
import { Badge, IconButton } from './ui';
import { Icon } from './icons';
import { NetworkIcon } from './NetworkIcon';

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** Lundi de la semaine contenant `d`. */
export function startOfWeek(d: Date): Date {
  const start = new Date(d);
  start.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Liseré de couleur signalant le statut d'une publication en un coup d'œil. */
const STATUS_BAR: Record<PostStatus, string> = {
  DRAFT: 'bg-line-strong',
  APPROVED: 'bg-accent',
  PUBLISHED: 'bg-success',
};

/* ─── Navigation de période ────────────────────────────────────── */

export function PeriodNav({
  label,
  onPrev,
  onNext,
  onReset,
  resetLabel,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  resetLabel: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <IconButton icon="chevron-left" label="Période précédente" size="sm" onClick={onPrev} />

      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-display text-sm capitalize">{label}</span>
        <button
          type="button"
          onClick={onReset}
          title={resetLabel}
          className="whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs text-content-muted transition-colors hover:bg-surface-2 hover:text-content"
        >
          Début
        </button>
      </div>

      <IconButton icon="chevron-right" label="Période suivante" size="sm" onClick={onNext} />
    </div>
  );
}

/* ─── Pastille de publication (vues Mois / Semaine) ────────────── */

export function PostChip({ post, onClick }: { post: PostItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${NETWORK_LABEL[post.network]} — ${post.title}`}
      className="flex w-full items-center gap-1.5 overflow-hidden rounded-md border border-line bg-surface px-1.5 py-1 text-left text-2xs transition-colors hover:border-line-strong hover:bg-surface-2"
    >
      <span className={clsx('h-3 w-0.5 shrink-0 rounded-full', STATUS_BAR[post.status])} />
      <NetworkIcon network={post.network} size={11} />
      <span className="truncate font-medium">{post.title}</span>
    </button>
  );
}

/* ─── Vue Liste ────────────────────────────────────────────────── */

export function ListView({
  posts,
  onSelect,
  onDelete,
  deletingId,
}: {
  posts: PostItem[];
  onSelect: (p: PostItem) => void;
  onDelete?: (p: PostItem) => void;
  deletingId?: string | null;
}) {
  const grouped = posts.reduce<Record<string, PostItem[]>>((acc, p) => {
    // Clé locale (et non ISO/UTC) : une publication à 00h30 heure de Paris
    // tomberait sinon dans la journée précédente.
    const d = new Date(p.scheduledDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    (acc[key] ??= []).push(p);
    return acc;
  }, {});
  const days = Object.keys(grouped).sort();

  return (
    <div className="flex flex-col gap-5">
      {days.map((day) => (
        <div key={day} className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold capitalize text-content-2">
            {new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
            <span className="h-px flex-1 bg-line" />
            <span className="text-2xs font-normal text-content-muted">
              {grouped[day].length} publication{grouped[day].length > 1 ? 's' : ''}
            </span>
          </h3>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {grouped[day].map((p) => (
              <motion.div
                key={p.id}
                layout
                className="group relative flex overflow-hidden rounded-lg border border-line bg-surface transition-shadow hover:shadow-md"
              >
                <span className={clsx('w-1 shrink-0', STATUS_BAR[p.status])} aria-hidden />
                <button
                  onClick={() => onSelect(p)}
                  className="flex w-full flex-col gap-1.5 p-3 text-left"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-content-muted">
                      <NetworkIcon network={p.network} size={13} />
                      {NETWORK_LABEL[p.network]}
                    </span>
                    <Badge tone={POST_STATUS_TONE[p.status]}>{POST_STATUS_LABEL[p.status]}</Badge>
                  </span>
                  <span className="pr-6 text-sm font-medium leading-snug">{p.title}</span>
                  <span className="clamp-2 text-xs leading-relaxed text-content-2">{p.content}</span>
                  {p.hashtags.length > 0 && (
                    <span className="truncate text-xs text-accent-text">
                      {p.hashtags.map((h) => `#${h}`).join(' ')}
                    </span>
                  )}
                </button>
                {onDelete && (
                  <div className="absolute bottom-2 right-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <IconButton
                      icon="trash"
                      label={`Supprimer « ${p.title} »`}
                      size="sm"
                      variant="danger"
                      disabled={deletingId === p.id}
                      onClick={() => onDelete(p)}
                    />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Vue Mois ─────────────────────────────────────────────────── */

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export function MonthView({
  posts,
  anchor,
  onSelect,
}: {
  posts: PostItem[];
  anchor: Date;
  onSelect: (p: PostItem) => void;
}) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const today = new Date();

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[44rem]">
        <div className="mb-1.5 grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="text-center text-2xs font-semibold uppercase tracking-wide text-content-muted"
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((date, i) => {
            const dayPosts = date
              ? posts.filter((p) => sameDay(new Date(p.scheduledDate), date))
              : [];
            const isToday = date ? sameDay(date, today) : false;

            return (
              <div
                key={i}
                className={clsx(
                  'flex min-h-[6rem] flex-col gap-1 rounded-lg p-1.5',
                  date ? 'border border-line bg-surface' : 'bg-transparent',
                  isToday && 'border-brand ring-1 ring-brand/30',
                )}
              >
                {date && (
                  <>
                    <span
                      className={clsx(
                        'px-0.5 text-2xs font-semibold tabular-nums',
                        isToday ? 'text-brand-text' : 'text-content-muted',
                      )}
                    >
                      {date.getDate()}
                    </span>
                    <div className="flex flex-col gap-1 overflow-hidden">
                      {dayPosts.slice(0, 3).map((p) => (
                        <PostChip key={p.id} post={p} onClick={() => onSelect(p)} />
                      ))}
                      {dayPosts.length > 3 && (
                        <span className="px-1 text-2xs text-content-muted">
                          +{dayPosts.length - 3} autre{dayPosts.length - 3 > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Vue Semaine ──────────────────────────────────────────────── */

export function WeekView({
  posts,
  anchor,
  onSelect,
}: {
  posts: PostItem[];
  anchor: Date;
  onSelect: (p: PostItem) => void;
}) {
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const today = new Date();

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {days.map((date, i) => {
        const dayPosts = posts.filter((p) => sameDay(new Date(p.scheduledDate), date));
        const isToday = sameDay(date, today);

        return (
          <div
            key={i}
            className={clsx(
              'flex min-h-[8rem] flex-col gap-1.5 rounded-lg border bg-surface p-2',
              isToday ? 'border-brand ring-1 ring-brand/30' : 'border-line',
            )}
          >
            <span
              className={clsx(
                'text-2xs font-semibold uppercase tracking-wide',
                isToday ? 'text-brand-text' : 'text-content-muted',
              )}
            >
              {date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
            </span>
            <div className="flex flex-col gap-1">
              {dayPosts.length === 0 ? (
                <span className="py-2 text-center text-2xs text-content-muted">—</span>
              ) : (
                dayPosts.map((p) => <PostChip key={p.id} post={p} onClick={() => onSelect(p)} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Légende des statuts ──────────────────────────────────────── */

export function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-content-muted">
      <span className="inline-flex items-center gap-1.5">
        <Icon name="info" size={12} />
        Statuts :
      </span>
      {(Object.keys(STATUS_BAR) as PostStatus[]).map((status) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <span className={clsx('h-2.5 w-1 rounded-full', STATUS_BAR[status])} />
          {POST_STATUS_LABEL[status]}
        </span>
      ))}
    </div>
  );
}
