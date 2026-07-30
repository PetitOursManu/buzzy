/**
 * Extraction tolérante d'un objet JSON dans la réponse d'un modèle de langage.
 *
 * Un LLM à qui l'on demande du JSON répond rarement par du JSON pur. Il
 * l'enrobe dans un bloc markdown, le précède d'un préambule, raisonne à voix
 * haute — et le texte alentour contient souvent des accolades. La stratégie
 * naïve « du premier { au dernier } » échoue alors, et une réponse pourtant
 * exploitable est rejetée.
 *
 * Pire : quand la réponse est tronquée faute de jetons, le JSON est
 * syntaxiquement invalide alors que les objets déjà écrits sont parfaitement
 * lisibles. On les récupère plutôt que de tout perdre.
 */

/** Retire les clôtures markdown (```json … ```) autour du contenu. */
function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:json|javascript|js)?\s*\n?([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  // Clôture ouverte, jamais refermée (réponse coupée en plein bloc).
  const open = text.match(/```(?:json|javascript|js)?\s*\n?([\s\S]*)$/i);
  if (open?.[1]) return open[1].trim();
  return text.trim();
}

interface ScanState {
  /** Piles des délimiteurs encore ouverts, dans l'ordre. */
  stack: string[];
  inString: boolean;
}

/** Parcourt le texte en tenant compte des chaînes et des échappements. */
function scan(text: string, from: number, to: number, state: ScanState): void {
  let escaped = false;
  for (let i = from; i < to; i++) {
    const ch = text[i];
    if (state.inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') state.inString = false;
      continue;
    }
    if (ch === '"') state.inString = true;
    else if (ch === '{' || ch === '[') state.stack.push(ch);
    else if (ch === '}' || ch === ']') state.stack.pop();
  }
}

/**
 * Objets JSON de premier niveau présents dans le texte. Le dernier candidat
 * peut être incomplet : c'est le cas d'une réponse tronquée.
 */
function objectCandidates(text: string): string[] {
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          candidates.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }

  // Objet jamais refermé : candidat à réparer.
  if (depth > 0 && start !== -1) candidates.push(text.slice(start));
  return candidates;
}

/**
 * Répare un objet JSON tronqué.
 *
 * On recule jusqu'au dernier élément complet — la dernière accolade fermante —
 * puis on referme les délimiteurs restés ouverts. L'élément partiel est perdu,
 * tous les précédents sont sauvés.
 */
function repairTruncated(fragment: string): string | null {
  const lastClose = fragment.lastIndexOf('}');
  if (lastClose === -1) return null;

  let candidate = fragment.slice(0, lastClose + 1);

  const state: ScanState = { stack: [], inString: false };
  scan(candidate, 0, candidate.length, state);
  if (state.inString) return null; // coupé au milieu d'une chaîne, non réparable ici

  // Une virgule en attente d'un élément qui ne viendra jamais.
  candidate = candidate.replace(/,\s*$/, '');

  const closers = state.stack
    .reverse()
    .map((open) => (open === '{' ? '}' : ']'))
    .join('');

  return candidate + closers;
}

export interface ExtractOptions {
  /**
   * Clé attendue à la racine. Départage plusieurs objets candidats : sans
   * elle, un exemple de schéma cité dans le préambule pourrait l'emporter
   * sur la vraie réponse.
   */
  requiredKey?: string;
}

export interface ExtractResult {
  value: unknown;
  /** Vrai si l'objet a dû être réparé : la réponse était tronquée. */
  repaired: boolean;
}

/** Tente d'extraire un objet JSON exploitable. `null` si rien n'est récupérable. */
export function extractJsonObject(text: string, options: ExtractOptions = {}): ExtractResult | null {
  if (!text || !text.trim()) return null;

  const cleaned = stripCodeFences(text);
  const matches = (value: unknown): boolean => {
    if (typeof value !== 'object' || value === null) return false;
    if (!options.requiredKey) return true;
    return options.requiredKey in (value as Record<string, unknown>);
  };

  // 1. Le texte entier est peut-être déjà du JSON valide.
  for (const source of [cleaned, text.trim()]) {
    try {
      const parsed = JSON.parse(source);
      if (matches(parsed)) return { value: parsed, repaired: false };
    } catch {
      /* on poursuit */
    }
  }

  const candidates = objectCandidates(cleaned);

  // 2. Objets complets, du plus tardif au plus précoce : la vraie réponse
  //    suit le préambule et les exemples de schéma.
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(candidates[i]);
      if (matches(parsed)) return { value: parsed, repaired: false };
    } catch {
      /* candidat suivant */
    }
  }

  // 3. Dernier recours : réparer un objet tronqué.
  for (let i = candidates.length - 1; i >= 0; i--) {
    const repaired = repairTruncated(candidates[i]);
    if (!repaired) continue;
    try {
      const parsed = JSON.parse(repaired);
      if (matches(parsed)) return { value: parsed, repaired: true };
    } catch {
      /* candidat suivant */
    }
  }

  // 4. Sans clé requise satisfaite, on accepte n'importe quel objet valide
  //    plutôt que d'échouer : l'appelant jugera de sa forme.
  if (options.requiredKey) {
    const anyObject = extractJsonObject(text, {});
    if (anyObject) return anyObject;
  }

  return null;
}
