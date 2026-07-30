import clsx from 'clsx';
import type { Network } from '../lib/types';
import { NETWORK_LABEL } from '../lib/constants';

/** Tracés SVG des logos (Simple Icons, CC0), viewBox 0 0 24 24. */
const PATHS: Record<Network, string> = {
  facebook:
    'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  instagram:
    'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z',
  linkedin:
    'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  x: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  tiktok:
    'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
};

/** Couleur de marque ; X s'adapte au thème (noir en clair, blanc en sombre). */
export const NETWORK_BRAND: Record<Network, string> = {
  facebook: '#1877F2',
  instagram: '#E1306C',
  linkedin: '#0A66C2',
  x: 'var(--text)',
  tiktok: '#00C4B4',
};

/**
 * Couleur lisible SUR la couleur de marque.
 *
 * Blanc convient partout sauf pour X, dont la « couleur » suit le thème :
 * en mode sombre elle est quasi blanche, et une coche blanche y disparaît.
 */
const NETWORK_ON_BRAND: Record<Network, string> = {
  facebook: '#ffffff',
  instagram: '#ffffff',
  linkedin: '#ffffff',
  x: 'var(--surface)',
  tiktok: '#ffffff',
};

export function NetworkIcon({
  network,
  size = 18,
  colored = true,
  className,
}: {
  network: Network;
  size?: number;
  /** `false` pour hériter de la couleur du texte environnant. */
  colored?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={colored ? NETWORK_BRAND[network] : 'currentColor'}
      className={className}
      style={{ flexShrink: 0 }}
      aria-hidden
      focusable="false"
    >
      <path d={PATHS[network]} />
    </svg>
  );
}

/** Logo + nom du réseau, format compact pour les listes et en-têtes. */
export function NetworkLabel({
  network,
  size = 14,
  colored = true,
  className,
}: {
  network: Network;
  size?: number;
  colored?: boolean;
  className?: string;
}) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5', className)}>
      <NetworkIcon network={network} size={size} colored={colored} />
      {NETWORK_LABEL[network]}
    </span>
  );
}

/** Sélecteur multiple de réseaux. */
export function NetworkSelector({
  networks,
  selected,
  onToggle,
}: {
  networks: Network[];
  selected: Network[];
  onToggle: (n: Network) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {networks.map((n) => {
        const isOn = selected.includes(n);
        return (
          <button
            key={n}
            type="button"
            onClick={() => onToggle(n)}
            aria-pressed={isOn}
            className={clsx(
              'relative flex h-[4.5rem] w-[4.5rem] flex-col items-center justify-center gap-1.5',
              'rounded-lg border text-2xs font-medium transition-all duration-150',
              isOn
                ? 'border-transparent bg-surface-2 text-content shadow-sm'
                : 'border-line bg-surface text-content-muted hover:border-line-strong hover:text-content-2',
            )}
            // La couleur de marque n'apparaît qu'à l'état sélectionné : cinq
            // logos colorés côte à côte rendraient l'état actif illisible.
            style={isOn ? { boxShadow: `inset 0 0 0 2px ${NETWORK_BRAND[n]}` } : undefined}
          >
            {isOn && (
              <span
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full"
                style={{ background: NETWORK_BRAND[n], color: NETWORK_ON_BRAND[n] }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m20 6-11 11-5-5" />
                </svg>
              </span>
            )}
            <NetworkIcon network={n} size={24} colored={isOn} />
            {NETWORK_LABEL[n]}
          </button>
        );
      })}
    </div>
  );
}
