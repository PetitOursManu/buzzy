/**
 * Budget de temps global pour une opération.
 *
 * Un délai par appel ne suffit pas : une génération d'événements enchaîne
 * jusqu'à onze appels au modèle, entrecoupés d'allers-retours vers les
 * serveurs MCP. Bornés individuellement mais pas globalement, ils peuvent
 * cumuler plus de vingt minutes — bien au-delà de ce qu'attend un
 * reverse-proxy, qui coupe alors la requête et renvoie SON PROPRE 502, sans
 * corps JSON exploitable.
 *
 * L'échéance garantit que Buzzy répond toujours avant le proxy, avec un
 * message qui nomme la cause.
 */

/** Raison d'annulation, pour distinguer l'échéance d'une autre interruption. */
export const DEADLINE_EXCEEDED = Symbol('buzzy-deadline-exceeded');

export interface Deadline {
  /** À passer aux appels réseau : s'annule à l'expiration du budget. */
  readonly signal: AbortSignal;
  /** Budget total accordé, en millisecondes. */
  readonly totalMs: number;
  /** Temps restant, jamais négatif. */
  remainingMs(): number;
  /** Temps déjà consommé. */
  elapsedMs(): number;
  expired(): boolean;
  /** Libère la minuterie. Toujours appeler, sinon le processus reste éveillé. */
  dispose(): void;
}

export function createDeadline(totalMs: number): Deadline {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(DEADLINE_EXCEEDED), totalMs);
  // Sans unref, une échéance longue empêcherait le processus de s'arrêter.
  timer.unref?.();

  return {
    signal: controller.signal,
    totalMs,
    elapsedMs: () => Date.now() - startedAt,
    remainingMs: () => Math.max(0, totalMs - (Date.now() - startedAt)),
    expired: () => controller.signal.aborted,
    dispose: () => clearTimeout(timer),
  };
}

/** Vrai si l'annulation vient de l'expiration du budget global. */
export function isDeadlineAbort(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true && signal.reason === DEADLINE_EXCEEDED;
}
