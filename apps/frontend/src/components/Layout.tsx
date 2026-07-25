import { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';

const NAV = [
  { to: '/', label: 'Découverte', emoji: '🔭', end: true },
  { to: '/calendrier', label: 'Calendrier', emoji: '🗓️', end: false },
  { to: '/parametres', label: 'Paramètres', emoji: '⚙️', end: false },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    toast('Déconnexion réussie.', 'success');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="glass-strong rounded-2xl px-4 py-3 flex items-center gap-4 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-2 font-display font-bold text-lg">
            <span className="text-2xl" aria-hidden>
              🐝
            </span>
            <span className="bg-honey-gradient bg-clip-text text-transparent">Buzzy</span>
          </div>

          <nav className="flex items-center gap-1 flex-1 justify-center" aria-label="Navigation principale">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    'relative px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                    isActive ? 'text-[color:var(--text-primary)]' : 'text-muted hover:text-[color:var(--text-primary)]',
                  )
                }
              >
                {({ isActive }) => (
                  <span className="relative flex items-center gap-1.5">
                    <span aria-hidden>{item.emoji}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                    {isActive && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute -inset-x-2 -inset-y-1.5 -z-10 rounded-xl bg-honey-gradient opacity-20"
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      />
                    )}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden md:block text-xs text-muted max-w-[140px] truncate" title={user?.email}>
              {user?.email}
            </span>
            <button onClick={handleLogout} className="btn-ghost !py-1.5 !px-3 text-sm">
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="flex-1 px-4 py-6 max-w-[1600px] w-full mx-auto"
      >
        {children}
      </motion.main>

      <footer className="text-center text-xs text-muted py-6">
        Buzzy 🐝 — Découverte d'événements & calendriers éditoriaux assistés par IA
      </footer>
    </div>
  );
}
