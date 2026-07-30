import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { settingsApi, ApiError } from '../../lib/api';
import { Alert, Button, Card, Field, Input } from '../../components/ui';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';

/** Estimation grossière de la robustesse, à titre indicatif seulement. */
function strengthOf(password: string): { score: 0 | 1 | 2 | 3; label: string; className: string } {
  if (password.length === 0) return { score: 0, label: '', className: '' };
  let points = 0;
  if (password.length >= 12) points++;
  if (password.length >= 16) points++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points++;
  if (/\d/.test(password)) points++;
  if (/[^A-Za-z0-9]/.test(password)) points++;

  if (password.length < 8 || points <= 1) {
    return { score: 1, label: 'Faible', className: 'text-danger' };
  }
  if (points <= 3) return { score: 2, label: 'Correct', className: 'text-warning' };
  return { score: 3, label: 'Solide', className: 'text-success' };
}

export function AccountTab() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmValue, setConfirmValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const strength = strengthOf(next);

  const change = useMutation({
    mutationFn: () => settingsApi.changePassword(current, next),
    onSuccess: () => {
      toast('Mot de passe modifié.', 'success');
      setCurrent('');
      setNext('');
      setConfirmValue('');
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
    if (next !== confirmValue) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    change.mutate();
  };

  const canSubmit = !!current && !!next && !!confirmValue;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card className="flex flex-col gap-5">
        <div>
          <h2 className="font-display text-lg">Compte & sécurité</h2>
          <p className="mt-1 text-sm text-content-2">
            Modifiez le mot de passe du compte{' '}
            <strong className="font-medium">{user?.email}</strong>.
          </p>
        </div>

        <Field label="Mot de passe actuel">
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </Field>

        <Field
          label="Nouveau mot de passe"
          hint={
            strength.label ? (
              <>
                Robustesse : <span className={strength.className}>{strength.label}</span>
              </>
            ) : (
              'Au moins 8 caractères. Une phrase longue vaut mieux qu’un mot compliqué.'
            )
          }
        >
          <Input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
        </Field>

        <Field
          label="Confirmer le nouveau mot de passe"
          error={
            confirmValue && next !== confirmValue ? 'Les deux saisies diffèrent.' : undefined
          }
        >
          <Input
            type="password"
            value={confirmValue}
            onChange={(e) => setConfirmValue(e.target.value)}
            autoComplete="new-password"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) submit();
            }}
          />
        </Field>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="border-t border-line pt-4">
          <Button
            variant="primary"
            icon="lock"
            onClick={submit}
            loading={change.isPending}
            disabled={!canSubmit}
          >
            Changer le mot de passe
          </Button>
        </div>
      </Card>

      <Alert tone="info" title="Comment Buzzy protège votre compte">
        Le mot de passe est haché en <strong>argon2id</strong> — il n'est jamais stocké en clair. La
        session repose sur un cookie <code className="font-mono text-xs">httpOnly</code>,
        inaccessible au JavaScript de la page, valable 7 jours. La clé API de votre fournisseur IA
        est chiffrée en base en <strong>AES-256-GCM</strong> et n'est jamais renvoyée au navigateur.
      </Alert>
    </div>
  );
}
