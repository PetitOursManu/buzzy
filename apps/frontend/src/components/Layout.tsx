import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useTheme, type ThemeMode } from '../hooks/useTheme';
import { useSelection } from '../hooks/useSelection';
import { Icon, type IconName } from './icons';
import { IconButton } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Découverte', icon: 'compass', end: true },
  { to: '/calendrier', label: 'Calendrier', icon: 'calendar', end: false },
  { to: '/parametres', label: 'Paramètres', icon: 'settings', end: false },
];

const THEME_OPTIONS: { value: ThemeMode; icon: IconName; label: string }[] = [
  { value: 'light', icon: 'sun', label: 'Thème clair' },
  { value: 'dark', icon: 'moon', label: 'Thème sombre' },
  { value: 'system', icon: 'monitor', label: 'Thème du système' },
];

/* ─── Marque ───────────────────────────────────────────────────── */

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-brand-fg shadow-sm">
        <Icon name="bee" size={19} />
      </span>
      {!compact && <span className="font-display text-[17px] tracking-tight">Buzzy</span>}
    </span>
  );
}

/* ─── Sélecteur de thème compact ───────────────────────────────── */

function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <div
      role="group"
      aria-label="Thème de l'interface"
      className="flex items-center gap-0.5 rounded-md border border-line bg-surface-2 p-0.5"
    >
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setMode(option.value)}
          aria-pressed={mode === option.value}
          title={option.label}
          aria-label={option.label}
          className={clsx(
            'flex h-7 flex-1 items-center justify-center rounded-[calc(var(--r-md)-3px)] transition-colors',
            mode === option.value
              ? 'bg-surface text-content shadow-sm'
              : 'text-content-muted hover:text-content',
          )}
        >
          <Icon name={option.icon} size={15} />
        </button>
      ))}
    </div>
  );
}

/* ─── Lien de navigation ───────────────────────────────────────── */

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        clsx(
          'relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'text-content' : 'text-content-2 hover:bg-surface-2 hover:text-content',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 -z-10 rounded-md bg-surface-2 shadow-sm"
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
          <Icon name={item.icon} size={17} className={isActive ? 'text-brand-text' : undefined} />
          {item.label}
        </>
      )}
    </NavLink>
  );
}

/* ─── Rappel de la sélection en cours ──────────────────────────── */

/**
 * Les événements cochés en Découverte alimentent la génération de calendrier.
 * Sans rappel permanent, on oublie une sélection faite dix minutes plus tôt et
 * on s'étonne du contenu du calendrier généré.
 */
function SelectionBadge({ onNavigate }: { onNavigate?: () => void }) {
  const { selectedIds } = useSelection();
  if (selectedIds.length === 0) return null;

  return (
    <NavLink
      to="/calendrier"
      onClick={onNavigate}
      className="flex items-center gap-2 rounded-md border border-brand/30 bg-brand-soft px-3 py-2 text-[13px] font-medium text-brand-text transition-colors hover:border-brand/50"
    >
      <Icon name="check-circle" size={15} />
      <span className="flex-1">
        {selectedIds.length} événement{selectedIds.length > 1 ? 's' : ''} sélectionné
        {selectedIds.length > 1 ? 's' : ''}
      </span>
      <Icon name="chevron-right" size={14} />
    </NavLink>
  );
}

/* ─── Bloc utilisateur ─────────────────────────────────────────── */

function UserBlock() {
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const handleLogout = async () => {
    await logout();
    toast('Déconnexion réussie.', 'success');
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-content-2">
        <Icon name="user" size={15} />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-content-2" title={user?.email}>
        {user?.email}
      </span>
      <IconButton icon="logout" label="Se déconnecter" size="sm" onClick={handleLogout} />
    </div>
  );
}

/* ─── Shell ────────────────────────────────────────────────────── */

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Le tiroir mobile doit se refermer après navigation, sans quoi il masque
  // la page qu'on vient d'ouvrir.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      {/* ─── Barre latérale (grand écran) ─── */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-4 border-r border-line bg-surface/70 px-3 py-4 backdrop-blur-sm lg:flex">
        <div className="px-2 py-1">
          <Wordmark />
        </div>

        <nav className="flex flex-col gap-1" aria-label="Navigation principale">
          {NAV.map((item) => (
            <NavItemLink key={item.to} item={item} />
          ))}
        </nav>

        <SelectionBadge />

        <div className="mt-auto flex flex-col gap-2">
          <ThemeToggle />
          <UserBlock />
        </div>
      </aside>

      {/* ─── En-tête (petit écran) ─── */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/85 px-4 py-2.5 backdrop-blur-md lg:hidden">
          <Wordmark />
          <IconButton
            icon={menuOpen ? 'close' : 'menu'}
            label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
          />
        </header>

        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="sticky top-[3.4rem] z-30 flex flex-col gap-2 border-b border-line bg-surface px-4 py-3 shadow-md lg:hidden"
          >
            <nav className="flex flex-col gap-1" aria-label="Navigation principale">
              {NAV.map((item) => (
                <NavItemLink key={item.to} item={item} onNavigate={() => setMenuOpen(false)} />
              ))}
            </nav>
            <SelectionBadge onNavigate={() => setMenuOpen(false)} />
            <ThemeToggle />
            <UserBlock />
          </motion.div>
        )}

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="mx-auto w-full max-w-[100rem] flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          {children}
        </motion.main>

        <footer className="px-4 pb-6 pt-2 text-center text-xs text-content-muted sm:px-6">
          Buzzy — veille d'événements et calendriers éditoriaux assistés par IA
        </footer>
      </div>
    </div>
  );
}
