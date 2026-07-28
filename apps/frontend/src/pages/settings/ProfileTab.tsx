import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi, ApiError } from '../../lib/api';
import { Field, GlassPanel, Spinner } from '../../components/ui';
import { TONES, NETWORKS } from '../../lib/constants';
import type { Network, Tone } from '../../lib/types';
import { NetworkSelector } from '../../components/NetworkIcon';
import { useToast } from '../../hooks/useToast';

export function ProfileTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: settingsApi.getProfile });

  const [description, setDescription] = useState('');
  const [tone, setTone] = useState<Tone>('professionnel');
  const [targetAudience, setTargetAudience] = useState('');
  const [restrictions, setRestrictions] = useState('');
  const [preferredNetworks, setPreferredNetworks] = useState<Network[]>([]);

  useEffect(() => {
    const p = profileQuery.data;
    if (p) {
      setDescription(p.description);
      setTone(p.tone);
      setTargetAudience(p.targetAudience ?? '');
      setRestrictions(p.restrictions ?? '');
      setPreferredNetworks(p.preferredNetworks ?? []);
    }
  }, [profileQuery.data]);

  const toggleNetwork = (n: Network) =>
    setPreferredNetworks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));

  const save = useMutation({
    mutationFn: () =>
      settingsApi.saveProfile({
        description,
        tone,
        targetAudience: targetAudience || null,
        restrictions: restrictions || null,
        preferredNetworks,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast('Profil enregistré.', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Enregistrement impossible.', 'error'),
  });

  return (
    <GlassPanel className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h2 className="text-xl font-display font-semibold">Profil & attentes</h2>
        <p className="text-secondary text-sm mt-1">
          Ces informations orientent le ton et le contenu de toutes vos générations.
        </p>
      </div>

      <Field label="Description de votre activité">
        <textarea
          className="glass-input min-h-[110px] resize-y"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Décrivez votre activité, votre marque, vos valeurs…"
        />
      </Field>

      <Field label="Ton souhaité">
        <select className="glass-input" value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
          {TONES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Audience cible">
        <input
          className="glass-input"
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          placeholder="ex : jeunes actifs, associations locales, dirigeants PME…"
        />
      </Field>

      <Field label="Sujets ou formulations à éviter">
        <textarea
          className="glass-input min-h-[80px] resize-y"
          value={restrictions}
          onChange={(e) => setRestrictions(e.target.value)}
          placeholder="ex : ne pas parler de politique, éviter le tutoiement…"
        />
      </Field>

      <Field
        label="Réseaux sociaux préférés"
        hint="Pour chaque réseau coché, une description prête à publier (adaptée à sa longueur) sera générée pour CHAQUE événement découvert."
      >
        <NetworkSelector
          networks={NETWORKS.map((n) => n.value)}
          selected={preferredNetworks}
          onToggle={toggleNetwork}
        />
      </Field>

      <div>
        <button className="btn-primary flex items-center gap-2" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Spinner /> : '💾'} Enregistrer
        </button>
      </div>
    </GlassPanel>
  );
}
