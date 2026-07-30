import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import clsx from 'clsx';
import { Icon, type IconName } from '../icons';

/* ─── Habillage commun des champs ──────────────────────────────── */

const CONTROL =
  'w-full bg-surface text-content rounded-md border border-line px-3 ' +
  'placeholder:text-content-muted ' +
  'transition-[border-color,box-shadow] duration-150 outline-none ' +
  'focus:border-brand focus:ring-2 focus:ring-brand/25 ' +
  'disabled:opacity-60 disabled:cursor-not-allowed';

const INVALID = 'border-danger focus:border-danger focus:ring-danger/25';

export interface FieldProps {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  /** Rend le champ sur toute la largeur du parent. */
  children: ReactNode;
  className?: string;
  /** Signale visuellement un champ obligatoire. */
  required?: boolean;
}

/**
 * Enveloppe libellé + aide + erreur.
 *
 * Utilise `<label>` : cliquer le libellé donne le focus au champ, y compris
 * pour les cases à cocher — un gain d'accessibilité que `<div>` ne donne pas.
 */
export function Field({ label, hint, error, children, className, required }: FieldProps) {
  return (
    <label className={clsx('block', className)}>
      {label && (
        <span className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-content">
          {label}
          {required && (
            <span className="text-danger" aria-hidden>
              *
            </span>
          )}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1 flex items-center gap-1 text-xs text-danger">
          <Icon name="alert-circle" size={13} />
          {error}
        </span>
      ) : (
        hint && <span className="mt-1 block text-xs leading-relaxed text-content-muted">{hint}</span>
      )}
    </label>
  );
}

/* ─── Contrôles ────────────────────────────────────────────────── */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  icon?: IconName;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, icon, ...rest },
  ref,
) {
  if (!icon) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={clsx(CONTROL, 'h-10', invalid && INVALID, className)}
        {...rest}
      />
    );
  }
  return (
    <span className="relative block">
      <Icon
        name={icon}
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-muted"
      />
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={clsx(CONTROL, 'h-10 !pl-9', invalid && INVALID, className)}
        {...rest}
      />
    </span>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={clsx(CONTROL, 'py-2 resize-y', className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <span className="relative block">
        <select
          ref={ref}
          className={clsx(CONTROL, 'h-10 appearance-none !pr-9 cursor-pointer', className)}
          {...rest}
        >
          {children}
        </select>
        <Icon
          name="chevron-down"
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-content-muted"
        />
      </span>
    );
  },
);

/* ─── Case à cocher ────────────────────────────────────────────── */

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  disabled,
  tone = 'brand',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  tone?: 'brand' | 'accent';
}) {
  return (
    <label
      className={clsx(
        'flex items-start gap-2.5 cursor-pointer select-none',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className={clsx(
          'mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line',
          tone === 'brand' ? 'accent-[var(--brand)]' : 'accent-[var(--accent)]',
        )}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-tight">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-relaxed text-content-muted">{hint}</span>}
      </span>
    </label>
  );
}

/* ─── Interrupteur ─────────────────────────────────────────────── */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150',
        checked ? 'bg-brand' : 'bg-surface-3',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        className={clsx(
          'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-150',
          checked ? 'translate-x-[1.125rem]' : 'translate-x-[0.1875rem]',
        )}
      />
    </button>
  );
}

/* ─── Saisie multi-valeurs ─────────────────────────────────────── */

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
  const id = useId();

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
    <div
      className={clsx(
        'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5',
        'transition-[border-color,box-shadow] duration-150',
        'focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25',
      )}
    >
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-2 py-0.5 text-[13px] font-medium text-brand-text"
        >
          {v}
          <button
            type="button"
            onClick={() => remove(v)}
            className="rounded-sm opacity-60 transition-opacity hover:opacity-100"
            aria-label={`Retirer ${v}`}
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
      <input
        id={id}
        className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-content-muted"
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

/* ─── Étiquette sélectionnable ─────────────────────────────────── */

/**
 * Grande étiquette cliquable des filtres (portées, thèmes…).
 * `aria-pressed` plutôt qu'une case masquée : c'est un bouton bascule, et les
 * lecteurs d'écran annoncent correctement son état enfoncé.
 */
export function Tag({
  active,
  onClick,
  children,
  icon,
  tone = 'brand',
  disabled,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: IconName;
  tone?: 'brand' | 'accent';
  disabled?: boolean;
  badge?: ReactNode;
}) {
  const activeStyle =
    tone === 'brand'
      ? 'bg-brand text-brand-fg border-brand shadow-sm'
      : 'bg-accent text-white border-accent shadow-sm';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium',
        'transition-[background-color,border-color,color] duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        active
          ? activeStyle
          : 'border-line bg-surface text-content-2 hover:border-line-strong hover:text-content',
      )}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
      {badge}
    </button>
  );
}
