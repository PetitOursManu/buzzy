import { ReactNode, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';

/* ─── Fond animé (blobs) ───────────────────────────────────────── */
export function Background() {
  return (
    <div className="bg-blobs" aria-hidden>
      <span />
    </div>
  );
}

/* ─── Squelette shimmer ────────────────────────────────────────── */
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('shimmer rounded-xl', className)} />;
}

export function CardSkeleton() {
  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex gap-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-24" />
      </div>
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-1/3 mt-2" />
    </div>
  );
}

/* ─── Spinner ──────────────────────────────────────────────────── */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        className ?? 'h-4 w-4',
      )}
      aria-hidden
    />
  );
}

/* ─── Badge / chip ─────────────────────────────────────────────── */
export function Chip({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'honey' | 'grape' | 'green' | 'amber';
}) {
  const styles: Record<string, string> = {
    default: '',
    honey: 'text-[color:var(--honey-2)] border-[color:var(--honey)]/40',
    grape: 'text-[color:var(--grape)] border-[color:var(--grape)]/40',
    green: 'text-emerald-500 border-emerald-500/40',
    amber: 'text-amber-500 border-amber-500/40',
  };
  return <span className={clsx('chip', styles[tone])}>{children}</span>;
}

/* ─── Modale verre ─────────────────────────────────────────────── */
export function Modal({
  open,
  onClose,
  children,
  title,
  maxWidth = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  maxWidth?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={clsx('glass-strong relative z-10 w-full rounded-2xl p-6', maxWidth)}
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            {title && (
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-display font-semibold">{title}</h2>
                <button
                  onClick={onClose}
                  className="btn-ghost !p-2 !px-3 text-lg leading-none"
                  aria-label="Fermer"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="max-h-[75vh] overflow-y-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── État vide ────────────────────────────────────────────────── */
export function EmptyState({
  icon = '🐝',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-10 text-center flex flex-col items-center gap-3">
      <div className="text-5xl" aria-hidden>
        {icon}
      </div>
      <h3 className="text-lg font-display font-semibold">{title}</h3>
      {description && <p className="text-secondary max-w-md">{description}</p>}
      {action}
    </div>
  );
}

/* ─── Section verre ────────────────────────────────────────────── */
export function GlassPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={clsx('glass rounded-2xl p-5', className)}>{children}</div>;
}

/* ─── Saisie multi-valeurs (chips) ─────────────────────────────── */
export function MultiInput({
  values,
  onChange,
  placeholder,
  ariaLabel,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...values];
    for (const p of parts) {
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
    setDraft('');
  };

  const remove = (v: string) => onChange(values.filter((x) => x !== v));

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      remove(values[values.length - 1]);
    }
  };

  return (
    <div className="glass-input flex flex-wrap items-center gap-1.5 !py-2">
      {values.map((v) => (
        <span key={v} className="chip !bg-honey-gradient !text-[#1a1206] !border-transparent">
          {v}
          <button
            type="button"
            onClick={() => remove(v)}
            className="ml-0.5 leading-none hover:opacity-70"
            aria-label={`Retirer ${v}`}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={values.length === 0 ? placeholder : 'Ajouter…'}
        aria-label={ariaLabel}
      />
    </div>
  );
}

/* ─── Label de champ ───────────────────────────────────────────── */
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted mt-1">{hint}</span>}
    </label>
  );
}
