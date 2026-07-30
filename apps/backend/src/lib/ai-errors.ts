import type { Response } from 'express';
import { AiConfigError, AiRequestError } from '../services/ai-provider.service';

/**
 * Traduction homogène d'une erreur d'appel IA en réponse HTTP.
 *
 * Chaque route dupliquait ce triage, et toutes commettaient la même faute :
 * le `return` du 502 précédait le `console.error`. Un échec de génération ne
 * laissait donc AUCUNE trace côté serveur — la seule information disponible
 * était un « 502 » nu dans la console du navigateur, impossible à diagnostiquer
 * sur une instance auto-hébergée.
 *
 * - AiConfigError → 400 : configuration incomplète, l'utilisateur peut agir.
 * - AiRequestError → 502 : le fournisseur IA a échoué, Buzzy n'y est pour rien.
 * - le reste       → 500 : bug côté Buzzy, avec la pile complète.
 */
export function respondToAiError(res: Response, context: string, error: unknown): Response {
  if (error instanceof AiConfigError) {
    console.warn(`[${context}] configuration IA incomplète : ${error.message}`);
    return res.status(400).json({ error: error.message });
  }

  if (error instanceof AiRequestError) {
    console.error(
      `[${context}] échec du fournisseur IA` +
        (error.status ? ` (HTTP ${error.status})` : '') +
        ` : ${error.message}`,
    );
    return res.status(502).json({ error: error.message });
  }

  console.error(`[${context}] erreur inattendue :`, error);
  return res.status(500).json({ error: `Erreur inattendue : ${context}.` });
}
