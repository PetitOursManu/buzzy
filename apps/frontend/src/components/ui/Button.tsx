import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Icon, type IconName } from '../icons';
import { Spinner } from './Feedback';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-fg hover:bg-brand-hover shadow-sm',
  secondary:
    'bg-surface text-content border border-line hover:bg-surface-2 hover:border-line-strong shadow-sm',
  ghost: 'text-content-2 hover:bg-surface-2 hover:text-content',
  accent: 'bg-accent text-white hover:brightness-110 shadow-sm',
  danger: 'text-danger hover:bg-danger-soft border border-transparent hover:border-danger/30',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-md',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-lg',
};

const ICON_ONLY: Record<ButtonSize, string> = {
  sm: 'h-8 w-8 p-0',
  md: 'h-10 w-10 p-0',
  lg: 'h-11 w-11 p-0',
};

const BASE =
  'inline-flex items-center justify-center font-medium whitespace-nowrap select-none ' +
  'transition-[background-color,border-color,color,box-shadow,opacity] duration-150 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

/**
 * Classes du bouton, exposées à part pour les éléments qui doivent rester des
 * balises `<a>` — un téléchargement ou un lien de navigation ne sont pas des
 * boutons, et les déguiser en `<button>` casserait le clic milieu, le
 * « ouvrir dans un nouvel onglet » et l'annonce du lecteur d'écran.
 */
export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return clsx(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icône affichée avant le libellé (remplacée par le spinner si `loading`). */
  icon?: IconName;
  /** Icône affichée après le libellé. */
  iconAfter?: IconName;
  loading?: boolean;
  /** Occupe toute la largeur disponible. */
  block?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    iconAfter,
    loading = false,
    block = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const iconOnly = !children;
  const iconSize = size === 'sm' ? 15 : size === 'lg' ? 19 : 17;

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      // Un bouton qui travaille doit le dire, pas seulement le montrer.
      aria-busy={loading || undefined}
      className={clsx(
        BASE,
        VARIANTS[variant],
        SIZES[size],
        iconOnly && ICON_ONLY[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size={iconSize} />
      ) : (
        icon && <Icon name={icon} size={iconSize} />
      )}
      {children}
      {iconAfter && !loading && <Icon name={iconAfter} size={iconSize} />}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'iconAfter'> {
  icon: IconName;
  /** Obligatoire : un bouton sans texte n'a pas de nom accessible. */
  label: string;
}

export function IconButton({ icon, label, variant = 'ghost', ...rest }: IconButtonProps) {
  return <Button icon={icon} variant={variant} aria-label={label} title={label} {...rest} />;
}
