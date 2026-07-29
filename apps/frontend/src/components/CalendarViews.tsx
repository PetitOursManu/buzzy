import { motion } from 'framer-motion';
import type { PostItem } from '../lib/types';
import { NETWORK_EMOJI, NETWORK_LABEL } from '../lib/constants';

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function PostChip({ post, onClick }: { post: PostItem; onClick: () => void }) {
  return (
    <motion.button
      layout
      whileHover={{ y: -2, scale: 1.01 }}
      onClick={onClick}
      className="glass rounded-lg px-2 py-1.5 text-left w-full text-xs flex flex-col gap-0.5 hover:shadow-glow-grape transition-shadow"
      title={post.title}
    >
      <span className="flex items-center gap-1">
        <span aria-hidden>{NETWORK_EMOJI[post.network]}</span>
        <span className="font-medium truncate">{post.title}</span>
      </span>
    </motion.button>
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
    const key = new Date(p.scheduledDate).toISOString().slice(0, 10);
    (acc[key] ??= []).push(p);
    return acc;
  }, {});
  const days = Object.keys(grouped).sort();

  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <div key={day} className="flex flex-col gap-2">
          <h3 className="text-sm font-display font-semibold text-secondary">
            {new Date(day).toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {grouped[day].map((p) => (
              <motion.div
                key={p.id}
                layout
                whileHover={{ y: -3 }}
                className="glass rounded-xl relative group hover:shadow-glow-grape transition-shadow"
              >
                <button
                  onClick={() => onSelect(p)}
                  className="p-3 text-left flex flex-col gap-1.5 w-full"
                >
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    {NETWORK_EMOJI[p.network]} {NETWORK_LABEL[p.network]}
                  </span>
                  <span className="font-medium text-sm pr-6">{p.title}</span>
                  <span className="text-xs text-secondary line-clamp-2">{p.content}</span>
                  {p.hashtags.length > 0 && (
                    <span className="text-xs text-[color:var(--grape)] truncate">
                      {p.hashtags.map((h) => `#${h}`).join(' ')}
                    </span>
                  )}
                </button>
                {onDelete && (
                  <button
                    onClick={() => onDelete(p)}
                    disabled={deletingId === p.id}
                    aria-label={`Supprimer la publication « ${p.title} »`}
                    title="Supprimer cette publication"
                    className="absolute top-2 right-2 h-7 w-7 rounded-lg flex items-center justify-center text-sm
                               opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                               hover:bg-red-500/15 text-red-500 transition-opacity disabled:opacity-50"
                  >
                    {deletingId === p.id ? '…' : '🗑️'}
                  </button>
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

  const weekdayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  return (
    <div>
      <div className="grid grid-cols-7 gap-2 mb-2">
        {weekdayLabels.map((w) => (
          <div key={w} className="text-center text-xs font-semibold text-muted">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((date, i) => {
          const dayPosts = date ? posts.filter((p) => sameDay(new Date(p.scheduledDate), date)) : [];
          return (
            <div
              key={i}
              className={
                date
                  ? 'glass rounded-xl p-1.5 min-h-[90px] flex flex-col gap-1'
                  : 'rounded-xl min-h-[90px] opacity-30'
              }
            >
              {date && (
                <>
                  <span className="text-xs text-muted font-medium px-1">{date.getDate()}</span>
                  <div className="flex flex-col gap-1 overflow-hidden">
                    {dayPosts.slice(0, 3).map((p) => (
                      <PostChip key={p.id} post={p} onClick={() => onSelect(p)} />
                    ))}
                    {dayPosts.length > 3 && (
                      <span className="text-[10px] text-muted px-1">+{dayPosts.length - 3} autre(s)</span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
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
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7)); // lundi
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {days.map((date, i) => {
        const dayPosts = posts.filter((p) => sameDay(new Date(p.scheduledDate), date));
        return (
          <div key={i} className="glass rounded-xl p-2 min-h-[140px] flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-secondary">
              {date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
            </span>
            <div className="flex flex-col gap-1">
              {dayPosts.map((p) => (
                <PostChip key={p.id} post={p} onClick={() => onSelect(p)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
