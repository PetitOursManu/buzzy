import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Icon, type IconName } from '../components/icons';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
let counter = 0;

const STYLES: Record<ToastType, { icon: IconName; accent: string }> = {
  success: { icon: 'check-circle', accent: 'text-success' },
  error: { icon: 'alert-circle', accent: 'text-danger' },
  info: { icon: 'info', accent: 'text-info' },
};

// Une erreur mérite d'être lue posément ; une confirmation peut s'effacer vite.
const DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 5500,
  error: 9000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++counter;
    setToasts((prev) => [...prev, { id, message, type }]);
    const timer = setTimeout(() => {
      timers.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATIONS[type]);
    timers.current.set(id, timer);
  }, []);

  // Sans ce nettoyage, les minuteries survivent au démontage du provider
  // (navigation, rechargement à chaud) et tentent de mettre à jour un
  // composant disparu.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end"
        // `polite` : annoncé sans interrompre la lecture en cours.
        aria-live="polite"
        aria-atomic="false"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const style = STYLES[t.type];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className={clsx(
                  'pointer-events-auto flex w-full items-start gap-2.5 sm:max-w-sm',
                  'rounded-lg border border-line bg-surface px-3.5 py-3 shadow-lg',
                )}
                role={t.type === 'error' ? 'alert' : 'status'}
              >
                <Icon name={style.icon} size={17} className={clsx('mt-0.5', style.accent)} />
                <span className="flex-1 text-sm leading-snug">{t.message}</span>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Fermer la notification"
                  className="mt-0.5 rounded-sm text-content-muted transition-colors hover:text-content"
                >
                  <Icon name="close" size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast doit être utilisé dans ToastProvider');
  return ctx;
}
