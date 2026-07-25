import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { settingsApi, ApiError } from '../../lib/api';
import { Field, GlassPanel, Spinner } from '../../components/ui';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';

export function AccountTab() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () => settingsApi.changePassword(current, next),
    onSuccess: () => {
      toast('Mot de passe modifié avec succès.', 'success');
      setCurrent('');
      setNext('');
      setConfirm('');
      setError(null);
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Modification impossible.';
      setError(msg);
      toast(msg, 'error');
    },
  });

  const submit = () => {
    setError(null);
    if (next.length < 8) {
      setError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (next !== confirm) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    change.mutate();
  };

  return (
    <GlassPanel className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h2 className="text-xl font-display font-semibold">Compte & sécurité</h2>
        <p className="text-secondary text-sm mt-1">
          Modifiez le mot de passe du compte{user?.email ? ` ${user.email}` : ''}.
        </p>
      </div>

      <Field label="Mot de passe actuel">
        <input
          type="password"
          className="glass-input"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
      </Field>

      <Field label="Nouveau mot de passe" hint="Au moins 8 caractères.">
        <input
          type="password"
          className="glass-input"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
        />
      </Field>

      <Field label="Confirmer le nouveau mot de passe">
        <input
          type="password"
          className="glass-input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </Field>

      {error && (
        <div className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2" role="alert">
          {error}
        </div>
      )}

      <div>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={submit}
          disabled={change.isPending || !current || !next || !confirm}
        >
          {change.isPending ? <Spinner /> : '🔒'} Changer le mot de passe
        </button>
      </div>
    </GlassPanel>
  );
}
