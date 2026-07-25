import { FormEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../lib/api';
import { Spinner } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 24 }}
        className="glass-strong rounded-3xl p-8 w-full max-w-md"
      >
        <div className="text-center mb-6">
          <div className="text-5xl mb-2" aria-hidden>
            🐝
          </div>
          <h1 className="text-3xl font-display font-bold">
            <span className="bg-honey-gradient bg-clip-text text-transparent">Buzzy</span>
          </h1>
          <p className="text-secondary text-sm mt-1">
            Connectez-vous pour découvrir des événements et générer vos calendriers éditoriaux.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="block">
            <span className="block text-sm font-medium mb-1.5">Email</span>
            <input
              type="email"
              className="glass-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium mb-1.5">Mot de passe</span>
            <input
              type="password"
              className="glass-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary flex items-center justify-center gap-2" disabled={loading}>
            {loading && <Spinner />}
            Se connecter
          </button>
        </form>
      </motion.div>
    </div>
  );
}
