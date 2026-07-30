import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi, ApiError } from '../../lib/api';
import { Alert, Button, Card, Field, Input, Select } from '../../components/ui';
import { Icon } from '../../components/icons';
import { useToast } from '../../hooks/useToast';
import type { ModelInfo, ReasoningEffort } from '../../lib/types';

const EFFORT_OPTIONS: { value: ReasoningEffort; label: string }[] = [
  { value: 'none', label: 'Aucun (par défaut)' },
  { value: 'low', label: 'Faible' },
  { value: 'medium', label: 'Moyen' },
  { value: 'high', label: 'Élevé' },
];

/** Fournisseurs courants, pour éviter de chercher l'URL de base dans la doc. */
const PROVIDER_PRESETS: { name: string; baseUrl: string; hint: string }[] = [
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', hint: 'Catalogue multi-modèles' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', hint: 'GPT' },
  { name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', hint: 'Mistral AI' },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', hint: 'Inférence rapide' },
  { name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', hint: 'Sans clé API' },
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
  const [keyCheck, setKeyCheck] = useState<{ ok: boolean; error?: string } | null>(null);

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
    mutationFn: () =>
      settingsApi.listModels(baseUrl, apiKey || undefined, selectedModel.trim() || undefined),
    onSuccess: (data) => {
      setModels(data.models);
      // Adopte l'URL de base qui a réellement fonctionné (ex : ajout auto de /v1).
      if (data.baseUrl && data.baseUrl !== baseUrl) {
        setBaseUrl(data.baseUrl);
        toast(`URL de base ajustée : ${data.baseUrl}`, 'info');
      }
      if (data.models.length === 0) {
        toast(data.warning ?? "Aucun modèle listé. Saisissez son identifiant à la main.", 'info');
      } else {
        toast(`${data.models.length} modèle(s) disponible(s).`, 'success');
        if (!selectedModel && data.models[0]) setSelectedModel(data.models[0].id);
      }

      // Le catalogue /models est public chez plusieurs fournisseurs : seul un
      // véritable appel de génération prouve que la clé est acceptée.
      setKeyCheck(data.keyCheck ?? null);
      if (data.keyCheck?.ok) {
        toast('Clé API validée par une génération réelle.', 'success');
      } else if (data.keyCheck) {
        toast('Les modèles sont listés, mais la génération est refusée.', 'error');
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
      queryClient.invalidateQueries({ queryKey: ['diagnostics'] });
      toast('Configuration IA enregistrée.', 'success');
    },
    onError: (e) =>
      toast(e instanceof ApiError ? e.message : 'Enregistrement impossible.', 'error'),
  });

  const applyPreset = (preset: (typeof PROVIDER_PRESETS)[number]) => {
    setName(preset.name);
    setBaseUrl(preset.baseUrl);
    setModels([]);
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card className="flex flex-col gap-5">
        <div>
          <h2 className="font-display text-lg">Modèle IA</h2>
          <p className="mt-1 text-sm text-content-2">
            Connectez une API compatible OpenAI. Buzzy n'appelle que{' '}
            <code className="font-mono text-xs">/models</code> et{' '}
            <code className="font-mono text-xs">/chat/completions</code>.
          </p>
        </div>

        <Field label="Fournisseurs courants" hint="Pré-remplit le nom et l'URL de base.">
          <div className="flex flex-wrap gap-1.5">
            {PROVIDER_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                title={`${preset.hint} — ${preset.baseUrl}`}
                className="rounded-md border border-line bg-surface px-2.5 py-1 text-[13px] text-content-2 transition-colors hover:border-line-strong hover:text-content"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom du fournisseur">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex : OpenRouter"
            />
          </Field>
          <Field label="URL de base de l'API" hint="Se termine généralement par /v1.">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
              spellCheck={false}
            />
          </Field>
        </div>

        <Field
          label="Clé API"
          hint={
            provider?.keyConfigured
              ? `Clé enregistrée (••••${provider.keyLast4}). Laissez vide pour la conserver.`
              : 'Chiffrée en base (AES-256-GCM) et jamais renvoyée en clair.'
          }
        >
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={provider?.keyConfigured ? '••••••••••••' : 'sk-…'}
            autoComplete="off"
          />
        </Field>

        <div className="flex flex-col gap-3">
          <Button
            variant="secondary"
            icon="network"
            onClick={() => listModels.mutate()}
            loading={listModels.isPending}
            disabled={!baseUrl}
          >
            {selectedModel.trim()
              ? 'Tester la connexion et la clé'
              : 'Tester la connexion et lister les modèles'}
          </Button>

          {keyCheck?.ok && (
            <Alert tone="success" title="Clé API validée">
              Une génération réelle a abouti : la configuration est fonctionnelle.
            </Alert>
          )}
          {keyCheck && !keyCheck.ok && (
            <Alert tone="danger" title="La génération est refusée">
              <p>{keyCheck.error}</p>
              <p className="mt-1.5">
                Lister les modèles ne prouve rien : ce catalogue est public chez plusieurs
                fournisseurs. C'est ce test-ci qui compte.
              </p>
            </Alert>
          )}
          {!keyCheck && !selectedModel.trim() && (
            <p className="text-xs text-content-muted">
              Renseignez un modèle ci-dessous pour que le test vérifie aussi la clé API par une
              génération réelle.
            </p>
          )}
        </div>

        <Field
          label="Modèle utilisé"
          hint={
            models.length > 0
              ? `Choisissez parmi les ${models.length} modèles listés, ou saisissez un autre identifiant.`
              : "Saisissez l'identifiant exact attendu par votre fournisseur."
          }
        >
          <Input
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

          {currentModelInfo?.supportsTools === true && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-success">
              <Icon name="check-circle" size={13} />
              Ce modèle annonce la prise en charge des outils.
            </p>
          )}
          {currentModelInfo?.supportsTools === false && (
            <p className="mt-2 inline-flex items-start gap-1.5 text-xs text-danger">
              <Icon name="alert-circle" size={13} className="mt-0.5" />
              <span>
                Ce modèle n'annonce <strong>pas</strong> la prise en charge des outils : la
                recherche web via MCP ne fonctionnera pas avec lui.
              </span>
            </p>
          )}
          {selectedModel.trim() && !currentModelInfo && models.length > 0 && (
            <p className="mt-2 text-xs text-content-muted">
              Modèle absent de la liste du fournisseur : Buzzy l'utilisera tel quel, sans pouvoir
              vérifier ses capacités.
            </p>
          )}
        </Field>

        <Field
          label="Mode de réflexion (reasoning)"
          hint="Envoyé uniquement si le modèle le supporte. Un effort élevé améliore la qualité, mais augmente le temps et le coût."
        >
          <Select
            value={reasoningEffort}
            onChange={(e) => setReasoningEffort(e.target.value as ReasoningEffort)}
          >
            {EFFORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="border-t border-line pt-4">
          <Button variant="primary" icon="save" onClick={() => save.mutate()} loading={save.isPending}>
            Enregistrer
          </Button>
        </div>
      </Card>

      {/* ─── Exigence : accès aux outils ─── */}
      <Alert tone="info" title="Le modèle doit gérer les outils (function calling)">
        <p>
          Buzzy interroge le web via des serveurs <strong>MCP</strong>, ce qui passe par l'appel
          d'outils. Un modèle qui ne le prend pas en charge ne pourra pas chercher : il inventerait
          des événements au lieu de les trouver, ce que Buzzy refuse — vous obtiendriez des
          résultats vides ou très pauvres.
        </p>
        <p className="mt-2">
          Cette exigence ne vaut que si au moins un serveur MCP est actif. Sans MCP, aucun outil
          n'est envoyé et n'importe quel modèle convient — mais la découverte se limite alors à ses
          connaissances internes.
        </p>
        {toolsKnown.length > 0 && (
          <p className="mt-2">
            Votre fournisseur renseigne cette capacité :{' '}
            <strong>
              {toolsCapable.length} modèle(s) sur {toolsKnown.length}
            </strong>{' '}
            acceptent les outils.
          </p>
        )}
        {models.length > 0 && toolsKnown.length === 0 && (
          <p className="mt-2">
            Votre fournisseur ne renseigne pas cette capacité : vérifiez dans sa documentation que
            le modèle choisi accepte bien les outils.
          </p>
        )}
      </Alert>
    </div>
  );
}
