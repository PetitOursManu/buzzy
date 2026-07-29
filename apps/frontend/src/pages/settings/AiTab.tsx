import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi, ApiError } from '../../lib/api';
import { Field, GlassPanel, Spinner } from '../../components/ui';
import { useToast } from '../../hooks/useToast';
import type { ModelInfo, ReasoningEffort } from '../../lib/types';

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
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('none');

  useEffect(() => {
    const p = providerQuery.data;
    if (p) {
      setName(p.name);
      setBaseUrl(p.baseUrl);
      setSelectedModel(p.selectedModel ?? '');
      setReasoningEffort(p.reasoningEffort ?? 'none');
    }
  }, [providerQuery.data]);

  const provider = providerQuery.data;

  // Ce que le fournisseur annonce du modèle saisi, s'il l'a listé.
  const currentModelInfo = models.find((m) => m.id === selectedModel.trim()) ?? null;
  const toolsKnown = models.filter((m) => m.supportsTools !== null);
  const toolsCapable = toolsKnown.filter((m) => m.supportsTools);

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
        toast(data.warning ?? 'Aucun modèle listé. Saisissez son identifiant à la main.', 'info');
      } else {
        toast(`${data.models.length} modèle(s) disponible(s).`, 'success');
        if (!selectedModel && data.models[0]) setSelectedModel(data.models[0].id);
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

      {/* ─── Choix du modèle : saisie libre, suggestions si listées ─── */}
      <Field
        label="Modèle utilisé"
        hint={
          models.length > 0
            ? `Choisissez parmi les ${models.length} modèles listés, ou saisissez librement un autre identifiant.`
            : "Saisissez l'identifiant exact du modèle, tel que votre fournisseur l'attend."
        }
      >
        <input
          className="glass-input"
          list="buzzy-models"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          placeholder="ex : mistralai/mistral-large, gpt-4o, qwen3:14b…"
          autoComplete="off"
          spellCheck={false}
        />
        <datalist id="buzzy-models">
          {models.map((m) => (
            <option key={m.id} value={m.id} />
          ))}
        </datalist>

        {/* Ce que le fournisseur annonce du modèle saisi. */}
        {currentModelInfo?.supportsTools === true && (
          <p className="text-xs text-emerald-500 mt-2">
            ✅ Ce modèle annonce la prise en charge des tools.
          </p>
        )}
        {currentModelInfo?.supportsTools === false && (
          <p className="text-xs text-red-500 mt-2">
            ⛔ Ce modèle n'annonce <strong>pas</strong> la prise en charge des tools : la recherche
            web via MCP ne fonctionnera pas avec lui.
          </p>
        )}
        {selectedModel.trim() && !currentModelInfo && models.length > 0 && (
          <p className="text-xs text-muted mt-2">
            Modèle absent de la liste du fournisseur : Buzzy l'utilisera tel quel, sans pouvoir
            vérifier ses capacités.
          </p>
        )}
      </Field>

      {/* ─── Exigence : accès aux tools ─── */}
      <div className="glass rounded-xl p-4 flex flex-col gap-2 border border-amber-500/40">
        <h3 className="text-sm font-display font-semibold flex items-center gap-2">
          <span aria-hidden>🔧</span> Le modèle doit avoir accès aux tools
        </h3>
        <p className="text-sm text-secondary">
          Buzzy interroge le web via des serveurs <strong>MCP</strong>, et cela passe par l'appel
          d'outils (<em>tools</em>, aussi appelé <em>function calling</em>). Un modèle qui ne le
          prend pas en charge ne pourra pas chercher sur le web : il inventerait des événements au
          lieu de les trouver, ce que Buzzy refuse de faire — vous obtiendriez donc des résultats
          vides ou très pauvres.
        </p>
        <p className="text-xs text-muted">
          Cette exigence ne vaut que si vous avez activé au moins un serveur MCP dans l'onglet
          « 🌐 Recherche Web (MCP) ». Sans MCP actif, aucun outil n'est envoyé au modèle et
          n'importe lequel convient — mais la découverte se limite alors à ses connaissances
          internes.
        </p>
        {toolsKnown.length > 0 && (
          <p className="text-xs text-secondary">
            Votre fournisseur renseigne cette capacité :{' '}
            <strong>
              {toolsCapable.length} modèle(s) sur {toolsKnown.length}
            </strong>{' '}
            annoncent la prise en charge des tools.
          </p>
        )}
        {models.length > 0 && toolsKnown.length === 0 && (
          <p className="text-xs text-muted">
            Votre fournisseur ne renseigne pas cette capacité : vérifiez dans sa documentation que
            le modèle choisi accepte bien les <em>tools</em>.
          </p>
        )}
      </div>

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
