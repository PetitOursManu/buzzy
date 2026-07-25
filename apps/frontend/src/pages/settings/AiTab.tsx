import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi, ApiError } from '../../lib/api';
import { Field, GlassPanel, Spinner } from '../../components/ui';
import { useToast } from '../../hooks/useToast';
import type { ReasoningEffort } from '../../lib/types';

const EFFORT_OPTIONS: { value: ReasoningEffort; label: string }[] = [
  { value: 'none', label: 'Aucun (par défaut)' },
  { value: 'low', label: 'Faible' },
  { value: 'medium', label: 'Moyen' },
  { value: 'high', label: 'Élevé' },
];

export function AiTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const providerQuery = useQuery({ queryKey: ['ai-provider'], queryFn: settingsApi.getAiProvider });

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('none');

  useEffect(() => {
    const p = providerQuery.data;
    if (p) {
      setName(p.name);
      setBaseUrl(p.baseUrl);
      setSelectedModel(p.selectedModel ?? '');
      setReasoningEffort(p.reasoningEffort ?? 'none');
      if (p.selectedModel) setModels((m) => (m.includes(p.selectedModel!) ? m : [p.selectedModel!, ...m]));
    }
  }, [providerQuery.data]);

  const provider = providerQuery.data;

  const listModels = useMutation({
    mutationFn: () => settingsApi.listModels(baseUrl, apiKey || undefined),
    onSuccess: (data) => {
      setModels(data.models);
      // Adopte l'URL de base qui a réellement fonctionné (ex : ajout auto de /v1).
      if (data.baseUrl && data.baseUrl !== baseUrl) {
        setBaseUrl(data.baseUrl);
        toast(`URL de base ajustée : ${data.baseUrl}`, 'info');
      }
      if (data.models.length === 0) {
        toast(data.warning ?? 'Aucun modèle listé.', 'info');
      } else {
        toast(`${data.models.length} modèle(s) disponible(s).`, 'success');
        if (!selectedModel && data.models[0]) setSelectedModel(data.models[0]);
      }
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Connexion impossible.', 'error'),
  });

  const save = useMutation({
    mutationFn: () =>
      settingsApi.saveAiProvider({
        name,
        baseUrl,
        apiKey: apiKey || undefined,
        selectedModel: selectedModel || null,
        reasoningEffort,
      }),
    onSuccess: () => {
      setApiKey('');
      queryClient.invalidateQueries({ queryKey: ['ai-provider'] });
      toast('Configuration IA enregistrée.', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Enregistrement impossible.', 'error'),
  });

  return (
    <GlassPanel className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h2 className="text-xl font-display font-semibold">Modèle IA</h2>
        <p className="text-secondary text-sm mt-1">
          Connectez une API compatible OpenAI (OpenRouter, Ollama Cloud, OpenAI…).
        </p>
      </div>

      <Field label="Nom du fournisseur">
        <input className="glass-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex : OpenRouter" />
      </Field>

      <Field label="URL de base de l'API" hint="Doit se terminer par /v1 en général.">
        <input
          className="glass-input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://openrouter.ai/api/v1"
        />
      </Field>

      <Field
        label="Clé API"
        hint={provider?.keyConfigured ? `Clé configurée (••••${provider.keyLast4}). Laissez vide pour la conserver.` : 'La clé est chiffrée en base et jamais renvoyée en clair.'}
      >
        <input
          type="password"
          className="glass-input"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={provider?.keyConfigured ? '••••••••••••' : 'sk-…'}
          autoComplete="off"
        />
      </Field>

      <div>
        <button
          className="btn-ghost flex items-center gap-2 text-sm"
          onClick={() => listModels.mutate()}
          disabled={listModels.isPending || !baseUrl}
        >
          {listModels.isPending ? <Spinner /> : '🔌'} Tester la connexion et lister les modèles
        </button>
      </div>

      {models.length > 0 && (
        <Field label="Modèle par défaut">
          <select className="glass-input" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
            <option value="">— Choisir un modèle —</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field
        label="Mode de réflexion (reasoning)"
        hint="Envoyé au modèle uniquement s'il le supporte (reasoning_effort). Un effort plus élevé améliore la qualité mais augmente le temps et le coût."
      >
        <select
          className="glass-input"
          value={reasoningEffort}
          onChange={(e) => setReasoningEffort(e.target.value as ReasoningEffort)}
        >
          {EFFORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <div>
        <button className="btn-primary flex items-center gap-2" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Spinner /> : '💾'} Enregistrer
        </button>
      </div>
    </GlassPanel>
  );
}
