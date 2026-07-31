import type { Response } from 'express';
import { AiConfigError, AiRequestError } from '../services/ai-provider.service';

/** Ressource absente. Distincte d'une panne du fournisseur IA. */
export class NotFoundError extends Error {}

export interface ErrorDescription {
  status: number;
  message: string;
}

/**
 * Triage homogène d'une erreur d'appel IA.
 *
 * Chaque route dupliquait ce classement, et toutes commettaient la même faute :
 * le `return` du 502 précédait le `console.error`. Un échec de génération ne
 * laissait donc AUCUNE trace côté serveur — la seule information disponible
 * était un « 502 » nu dans la console du navigateur, impossible à diagnostiquer
 * sur une instance auto-hébergée.
 *
 * - NotFoundError  → 404 : la ressource demandée n'existe pas.
 * - AiConfigError  → 400 : configuration incomplète, l'utilisateur peut agir.
 * - AiRequestError → 502 : le fournisseur IA a échoué, Buzzy n'y est pour rien.
 * - le reste       → 500 : bug côté Buzzy, avec la pile complète.
 *
 * Isolé de la réponse HTTP pour que les tâches asynchrones, qui échouent hors
 * de tout cycle requête/réponse, classent leurs erreurs à l'identique.
 */
export function describeAiError(context: string, error: unknown): ErrorDescription {
  if (error instanceof NotFoundError) {
    return { status: 404, message: error.message };
  }

  if (error instanceof AiConfigError) {
    console.warn(`[${context}] configuration IA incomplète : ${error.message}`);
    return { status: 400, message: error.message };
  }

  if (error instanceof AiRequestError) {
    console.error(
      `[${context}] échec du fournisseur IA` +
        (error.status ? ` (HTTP ${error.status})` : '') +
        ` : ${error.message}`,
    );
    return { status: 502, message: error.message };
  }

  console.error(`[${context}] erreur inattendue :`, error);
  return { status: 500, message: `Erreur inattendue : ${context}.` };
}

/** Variante qui écrit directement la réponse HTTP. */
export function respondToAiError(res: Response, context: string, error: unknown): Response {
  const { status, message } = describeAiError(context, error);
  return res.status(status).json({ error: message });
}
