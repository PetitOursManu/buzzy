import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Button, IconButton } from './Button';

/**
 * Pile des modales ouvertes.
 *
 * Chaque modale posait auparavant son propre écouteur sur `document` : avec
 * deux modales empilées, Échap les fermait toutes d'un coup. La pile garantit
 * qu'une seule touche ferme une seule modale — celle du dessus.
 */
const stack: symbol[] = [];

function useModalStack(open: boolean, onClose: () => void) {
  const idRef = useRef<symbol>(Symbol('modal'));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = idRef.current;
    stack.push(id);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (stack[stack.length - 1] !== id) return; // pas la modale du dessus
      e.stopPropagation();
      onCloseRef.current();
    };

    // Le défilement de la page sous une modale désoriente : on le fige, en
    // compensant la largeur de la barre pour éviter un saut de mise en page.
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    if (stack.length === 1) {
      const gap = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = stack.indexOf(id);
      if (index !== -1) stack.splice(index, 1);
      if (stack.length === 0) {
        document.body.style.overflow = previousOverflow;
        document.body.style.paddingRight = previousPadding;
      }
    };
  }, [open]);
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: string;
  /** Classe de largeur maximale (`max-w-lg`, `max-w-3xl`…). */
  maxWidth?: string;
  /** Pied de modale collant, hors de la zone défilante. */
  footer?: ReactNode;
}

export function Modal({
  open,
  onClose,
  children,
  title,
  description,
  maxWidth = 'max-w-2xl',
  footer,
}: ModalProps) {
  useModalStack(open, onClose);
  const panelRef = useRef<HTMLDivElement>(null);
  // Rend le focus à l'élément déclencheur : sans cela, la navigation clavier
  // repart du début de la page à chaque fermeture.
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      restoreRef.current = document.activeElement as HTMLElement | null;
      // Laisse l'animation d'entrée commencer avant de déplacer le focus.
      const t = window.setTimeout(() => panelRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    restoreRef.current?.focus?.();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            aria-description={description}
            className={clsx(
              'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden',
              'rounded-t-xl border border-line bg-surface shadow-lg outline-none sm:rounded-xl',
              maxWidth,
            )}
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            {title && (
              <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <h2 className="font-display text-lg">{title}</h2>
                  {description && (
                    <p className="mt-0.5 text-sm text-content-2">{description}</p>
                  )}
                </div>
                <IconButton icon="close" label="Fermer" size="sm" onClick={onClose} />
              </header>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

            {footer && (
              <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-5 py-3">
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Boîte de confirmation ────────────────────────────────────── */

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` pour une action destructrice. */
  tone?: 'danger' | 'brand';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'primary' : 'primary'}
            className={tone === 'danger' ? '!bg-danger !text-white hover:!brightness-110' : undefined}
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {typeof message === 'string' ? (
        <p className="text-sm leading-relaxed text-content-2">{message}</p>
      ) : (
        message
      )}
    </Modal>
  );
}
