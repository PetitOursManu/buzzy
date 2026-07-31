import { randomUUID } from 'node:crypto';

/**
 * Tâches longues exécutées hors du cycle requête/réponse.
 *
 * Une génération d'événements enchaîne plusieurs appels au modèle et des
 * recherches web : elle dépasse couramment la minute. Or tout intermédiaire
 * entre le navigateur et Buzzy impose sa propre limite — Cloudflare coupe à
 * 100 s avec un 524, non configurable hors offre Enterprise. Aucun réglage
 * côté application ne peut contourner cela.
 *
 * La requête HTTP se contente donc de DÉMARRER le travail et rend la main
 * aussitôt ; le client interroge ensuite l'avancement par de courtes requêtes.
 * Le traitement peut alors durer aussi longtemps que nécessaire.
 *
 * Stockage en mémoire, volontairement : Buzzy est mono-instance et une tâche
 * perdue au redémarrage se relance en un clic. Persister en base ajouterait
 * une table et des migrations pour un état dont la durée de vie est de
 * quelques minutes.
 */

export type JobStatus = 'running' | 'done' | 'error';

export interface JobError {
  message: string;
  /** Statut HTTP que la route aurait renvoyé en mode synchrone. */
  status: number;
}

export interface JobView<T> {
  id: string;
  status: JobStatus;
  /** Message d'avancement destiné à l'utilisateur. */
  progress: string;
  /** Secondes écoulées depuis le démarrage. */
  elapsedSeconds: number;
  result?: T;
  error?: JobError;
}

interface JobRecord<T> {
  id: string;
  status: JobStatus;
  progress: string;
  startedAt: number;
  finishedAt?: number;
  result?: T;
  error?: JobError;
}

/** Durée de conservation d'une tâche terminée, le temps que le client la lise. */
const RETENTION_MS = 15 * 60 * 1000;

const jobs = new Map<string, JobRecord<unknown>>();

/** Purge périodique : sans elle, la carte croît indéfiniment. */
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > RETENTION_MS) jobs.delete(id);
  }
}, 60_000);
sweeper.unref?.();

export type ProgressReporter = (message: string) => void;

/**
 * Démarre une tâche et renvoie son identifiant immédiatement.
 * `toError` traduit une exception en statut HTTP, exactement comme le ferait
 * la route en mode synchrone.
 */
export function startJob<T>(
  runner: (progress: ProgressReporter) => Promise<T>,
  toError: (error: unknown) => JobError,
  initialProgress = 'Démarrage…',
): string {
  const id = randomUUID();
  const record: JobRecord<T> = {
    id,
    status: 'running',
    progress: initialProgress,
    startedAt: Date.now(),
  };
  jobs.set(id, record as JobRecord<unknown>);

  const report: ProgressReporter = (message) => {
    // Une tâche déjà terminée ne doit plus voir son état bougé par un
    // rapport tardif.
    if (record.status === 'running') record.progress = message;
  };

  // Volontairement non attendu : la requête HTTP a déjà rendu la main.
  void runner(report)
    .then((result) => {
      record.result = result;
      record.status = 'done';
      record.progress = 'Terminé.';
    })
    .catch((error) => {
      record.error = toError(error);
      record.status = 'error';
      record.progress = 'Échec.';
    })
    .finally(() => {
      record.finishedAt = Date.now();
    });

  return id;
}

export function getJob<T>(id: string): JobView<T> | null {
  const job = jobs.get(id) as JobRecord<T> | undefined;
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    elapsedSeconds: Math.round(((job.finishedAt ?? Date.now()) - job.startedAt) / 1000),
    result: job.result,
    error: job.error,
  };
}
