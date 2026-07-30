import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi, ApiError } from '../../lib/api';
import { Alert, Button, Card, Field, Input, Select, Textarea } from '../../components/ui';
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
  const [prioritySources, setPrioritySources] = useState('');
  const [preferredNetworks, setPreferredNetworks] = useState<Network[]>([]);

  useEffect(() => {
    const p = profileQuery.data;
    if (p) {
      setDescription(p.description);
      setTone(p.tone);
      setTargetAudience(p.targetAudience ?? '');
      setRestrictions(p.restrictions ?? '');
      setPrioritySources(p.prioritySources ?? '');
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
        prioritySources: prioritySources || null,
        preferredNetworks,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['diagnostics'] });
      toast('Profil enregistré.', 'success');
    },
    onError: (e) =>
      toast(e instanceof ApiError ? e.message : 'Enregistrement impossible.', 'error'),
  });

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card className="flex flex-col gap-5">
        <div>
          <h2 className="font-display text-lg">Profil & attentes</h2>
          <p className="mt-1 text-sm text-content-2">
            Ces informations orientent le ton et le contenu de toutes vos générations.
          </p>
        </div>

        <Field
          label="Description de votre activité"
          hint="Plus c'est précis, plus les publications vous ressemblent."
        >
          <Textarea
            className="min-h-[7rem]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Décrivez votre activité, votre marque, vos valeurs…"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ton souhaité">
            <Select value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Audience cible">
            <Input
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="ex : jeunes actifs, associations locales…"
            />
          </Field>
        </div>

        <Field label="Sujets ou formulations à éviter">
          <Textarea
            className="min-h-[5rem]"
            value={restrictions}
            onChange={(e) => setRestrictions(e.target.value)}
            placeholder="ex : ne pas parler de politique, éviter le tutoiement…"
          />
        </Field>

        <Field
          label="Sources à privilégier"
          hint="Sites, domaines ou organismes que l'IA doit privilégier pour trouver et sourcer les événements, en plus de ses sources habituelles. Un par ligne ou séparés par des virgules."
        >
          <Textarea
            className="min-h-[6rem]"
            value={prioritySources}
            onChange={(e) => setPrioritySources(e.target.value)}
            placeholder={
              "ex :\nunesco.org\njournee-mondiale.com\nAgenda de ma région / ville\nSites d'associations locales"
            }
          />
        </Field>

        <div className="border-t border-line pt-4">
          <Button variant="primary" icon="save" onClick={() => save.mutate()} loading={save.isPending}>
            Enregistrer
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <h3 className="font-display text-base">Réseaux sociaux</h3>
          <p className="mt-1 text-sm text-content-2">
            Pour chaque réseau retenu, une description prête à publier — respectant sa longueur et
            son ton — est rédigée pour <strong>chaque</strong> événement découvert. Ce sont aussi
            les seuls réseaux proposés dans les calendriers.
          </p>
        </div>

        <NetworkSelector
          networks={NETWORKS.map((n) => n.value)}
          selected={preferredNetworks}
          onToggle={toggleNetwork}
        />

        {preferredNetworks.length === 0 && (
          <Alert tone="warning">
            Sans réseau retenu, aucun calendrier ne peut être généré et aucune description par
            réseau ne sera rédigée.
          </Alert>
        )}

        <div className="border-t border-line pt-4">
          <Button variant="primary" icon="save" onClick={() => save.mutate()} loading={save.isPending}>
            Enregistrer
          </Button>
        </div>
      </Card>
    </div>
  );
}
