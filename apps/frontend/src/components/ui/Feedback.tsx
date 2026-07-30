import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Icon, type IconName } from '../icons';

/* ─── Spinner ──────────────────────────────────────────────────── */

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}

/* ─── Squelettes ───────────────────────────────────────────────── */

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton rounded-md', className)} aria-hidden />;
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 flex flex-col gap-3">
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-5/6" />
      <Skeleton className="h-3.5 w-1/3 mt-1" />
    </div>
  );
}

/* ─── Badge ────────────────────────────────────────────────────── */

export type BadgeTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-content-2 border-line',
  brand: 'bg-brand-soft text-brand-text border-brand/25',
  accent: 'bg-accent-soft text-accent-text border-accent/25',
  success: 'bg-success-soft text-success border-success/25',
  warning: 'bg-warning-soft text-warning border-warning/25',
  danger: 'bg-danger-soft text-danger border-danger/25',
  info: 'bg-info-soft text-info border-info/25',
};

export function Badge({
  children,
  tone = 'neutral',
  icon,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: IconName;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold',
        BADGE_TONES[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

/* ─── Bandeau d'information ────────────────────────────────────── */

export type AlertTone = 'info' | 'warning' | 'danger' | 'success';

const ALERT_TONES: Record<AlertTone, { wrap: string; icon: IconName }> = {
  info: { wrap: 'bg-info-soft border-info/30 text-info', icon: 'info' },
  warning: { wrap: 'bg-warning-soft border-warning/30 text-warning', icon: 'alert-triangle' },
  danger: { wrap: 'bg-danger-soft border-danger/30 text-danger', icon: 'alert-circle' },
  success: { wrap: 'bg-success-soft border-success/30 text-success', icon: 'check-circle' },
};

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const style = ALERT_TONES[tone];
  return (
    <div
      className={clsx('rounded-lg border px-3.5 py-3 flex items-start gap-2.5', style.wrap, className)}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon name={style.icon} size={17} className="mt-0.5" />
      <div className="flex-1 min-w-0 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5', 'text-content-2')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/* ─── État vide ────────────────────────────────────────────────── */

export function EmptyState({
  icon = 'compass',
  title,
  description,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-dashed border-line bg-surface/60 px-6 py-12',
        'flex flex-col items-center text-center gap-3',
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-content-muted">
        <Icon name={icon} size={21} />
      </span>
      <h3 className="font-display text-base">{title}</h3>
      {description && <p className="text-sm text-content-2 max-w-md text-balance">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
