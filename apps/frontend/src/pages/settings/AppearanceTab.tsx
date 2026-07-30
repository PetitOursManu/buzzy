import clsx from 'clsx';
import { Card } from '../../components/ui';
import { Icon, type IconName } from '../../components/icons';
import { useTheme, type ThemeMode } from '../../hooks/useTheme';

const OPTIONS: { value: ThemeMode; label: string; icon: IconName; desc: string }[] = [
  { value: 'light', label: 'Clair', icon: 'sun', desc: 'Fond papier chaud, contraste élevé.' },
  { value: 'dark', label: 'Sombre', icon: 'moon', desc: 'Brun profond, accents miel.' },
  {
    value: 'system',
    label: 'Système',
    icon: 'monitor',
    desc: 'Suit le réglage de votre appareil.',
  },
];

export function AppearanceTab() {
  const { mode, resolved, setMode } = useTheme();

  return (
    <Card className="flex max-w-2xl flex-col gap-5">
      <div>
        <h2 className="font-display text-lg">Apparence</h2>
        <p className="mt-1 text-sm text-content-2">
          Le changement s'applique instantanément. Thème actif :{' '}
          <strong>{resolved === 'dark' ? 'sombre' : 'clair'}</strong>.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((opt) => {
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              aria-pressed={active}
              className={clsx(
                'rounded-lg border p-4 text-left transition-all duration-150',
                active
                  ? 'border-brand bg-brand-soft shadow-sm'
                  : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2',
              )}
            >
              <span
                className={clsx(
                  'mb-2.5 flex h-9 w-9 items-center justify-center rounded-md',
                  active ? 'bg-brand text-brand-fg' : 'bg-surface-2 text-content-2',
                )}
              >
                <Icon name={opt.icon} size={18} />
              </span>
              <span className="block font-display text-sm">{opt.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-content-muted">
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>

      <p className="border-t border-line pt-4 text-xs leading-relaxed text-content-muted">
        Buzzy utilise la typographie de votre système : aucune police n'est téléchargée depuis un
        service tiers, l'interface s'affiche immédiatement et fonctionne hors ligne.
      </p>
    </Card>
  );
}
