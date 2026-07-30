import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../lib/api';
import { Alert, Button, Field, Input } from '../components/ui';
import { Icon } from '../components/icons';

export function LoginPage() {
  const { login, sessionExpired } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-brand-fg shadow-md">
            <Icon name="bee" size={26} />
          </span>
          <h1 className="font-display text-2xl">Buzzy</h1>
          <p className="mt-1.5 text-sm text-content-2">
            Veille d'événements et calendriers éditoriaux.
          </p>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 shadow-md">
          {sessionExpired && (
            <Alert tone="warning" className="mb-5">
              Votre session a expiré. Reconnectez-vous pour reprendre.
            </Alert>
          )}

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="Adresse e-mail">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="admin@example.com"
                required
                autoFocus
              />
            </Field>

            <Field label="Mot de passe">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>

            {error && (
              <Alert tone="danger" className="!py-2.5">
                {error}
              </Alert>
            )}

            <Button type="submit" variant="primary" size="lg" block loading={loading}>
              Se connecter
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-content-muted">
          Identifiants définis par <code className="font-mono">ADMIN_EMAIL</code> et{' '}
          <code className="font-mono">ADMIN_PASSWORD</code> au premier démarrage.
        </p>
      </motion.div>
    </div>
  );
}
