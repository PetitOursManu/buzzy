import { GlassPanel } from '../../components/ui';
import { useTheme, ThemeMode } from '../../hooks/useTheme';

const OPTIONS: { value: ThemeMode; label: string; emoji: string; desc: string }[] = [
  { value: 'light', label: 'Clair', emoji: '☀️', desc: 'Verre lumineux sur fond pastel.' },
  { value: 'dark', label: 'Sombre', emoji: '🌙', desc: 'Verre profond sur fond nuit miel.' },
  { value: 'system', label: 'Système', emoji: '🖥️', desc: 'Suit les préférences de votre appareil.' },
];

export function AppearanceTab() {
  const { mode, resolved, setMode } = useTheme();

  return (
    <GlassPanel className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h2 className="text-xl font-display font-semibold">Apparence</h2>
        <p className="text-secondary text-sm mt-1">
          Choisissez votre thème. L'aperçu s'applique instantanément (thème actif : {resolved === 'dark' ? 'sombre' : 'clair'}).
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setMode(opt.value)}
            className={
              mode === opt.value
                ? 'glass-strong rounded-2xl p-4 text-left ring-2 ring-[color:var(--honey)] shadow-glow'
                : 'glass rounded-2xl p-4 text-left hover:shadow-glow transition-shadow'
            }
          >
            <div className="text-3xl mb-2" aria-hidden>
              {opt.emoji}
            </div>
            <div className="font-display font-semibold">{opt.label}</div>
            <div className="text-xs text-muted mt-1">{opt.desc}</div>
          </button>
        ))}
      </div>
    </GlassPanel>
  );
}
