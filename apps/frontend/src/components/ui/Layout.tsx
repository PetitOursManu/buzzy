import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Icon, type IconName } from '../icons';

/* ─── Carte / panneau ──────────────────────────────────────────── */

export function Card({
  children,
  className,
  padded = true,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  as?: 'div' | 'section' | 'article';
}) {
  return (
    <Tag
      className={clsx(
        'rounded-xl border border-line bg-surface shadow-sm',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/* ─── En-tête de page ──────────────────────────────────────────── */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-content-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ─── Titre de section ─────────────────────────────────────────── */

export function SectionTitle({
  icon,
  children,
  count,
  actions,
  className,
}: {
  icon?: IconName;
  children: ReactNode;
  count?: number;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-wrap items-center justify-between gap-3', className)}>
      <h2 className="flex items-center gap-2 font-display text-base">
        {icon && <Icon name={icon} size={17} className="text-content-muted" />}
        {children}
        {count !== undefined && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-content-muted">
            {count}
          </span>
        )}
      </h2>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ─── Contrôle segmenté ────────────────────────────────────────── */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

/**
 * Choix exclusif parmi 2 à 4 options courtes (vue Mois/Semaine/Liste,
 * mode de date…). Préféré à une liste déroulante : toutes les options
 * restent visibles, ce qui vaut mieux quand elles sont peu nombreuses.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  ariaLabel,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={clsx(
        'inline-flex items-center gap-0.5 rounded-md border border-line bg-surface-2 p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-[calc(var(--r-md)-3px)] font-medium',
              'transition-[background-color,color,box-shadow] duration-150',
              size === 'sm' ? 'h-7 px-2.5 text-[13px]' : 'h-8 px-3 text-sm',
              active
                ? 'bg-surface text-content shadow-sm'
                : 'text-content-2 hover:text-content',
            )}
          >
            {option.icon && <Icon name={option.icon} size={14} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Onglets ──────────────────────────────────────────────────── */

export interface TabOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      // Défilement horizontal sur mobile plutôt qu'un retour à la ligne :
      // les onglets restent sur une seule rangée, comme attendu.
      className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b border-line px-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={clsx(
              'relative inline-flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-2 text-sm font-medium',
              'transition-colors duration-150',
              active ? 'text-content' : 'text-content-2 hover:text-content',
            )}
          >
            {option.icon && <Icon name={option.icon} size={15} />}
            {option.label}
            <span
              className={clsx(
                'absolute inset-x-1 -bottom-px h-0.5 rounded-full transition-colors',
                active ? 'bg-brand' : 'bg-transparent',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
