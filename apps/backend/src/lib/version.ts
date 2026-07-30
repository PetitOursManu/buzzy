import fs from 'fs';
import path from 'path';

/**
 * Version applicative, lue depuis le package.json le plus proche.
 *
 * Le chemin diffère selon le contexte d'exécution : `src/` sous tsx en
 * développement, `dist/` dans l'image Docker. On essaie les deux niveaux
 * plutôt que de coder la valeur en dur, qui divergerait au premier oubli.
 */
function readVersion(): string {
  for (const candidate of [
    path.resolve(__dirname, '..', '..', 'package.json'),
    path.resolve(__dirname, '..', '..', '..', 'package.json'),
  ]) {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (typeof parsed.version === 'string') return parsed.version;
    } catch {
      /* candidat suivant */
    }
  }
  return '0.0.0';
}

/** Horodatage gravé dans l'image par le Dockerfile. Absent hors conteneur. */
function readBuildTimestamp(): string {
  if (process.env.BUZZY_BUILT_AT) return process.env.BUZZY_BUILT_AT;
  try {
    return fs.readFileSync('/app/.build-info', 'utf8').trim();
  } catch {
    return '';
  }
}

export const APP_VERSION = readVersion();

/**
 * Empreinte du build déployé.
 *
 * `version` seule ne bouge pas d'un commit à l'autre : impossible de savoir si
 * un redéploiement a effectivement pris. Le commit et l'horodatage de build
 * répondent à « le correctif est-il vraiment en ligne ? », première question
 * de tout dépannage à distance.
 */
export const BUILD_INFO = {
  version: APP_VERSION,
  // Coolify expose SOURCE_COMMIT ; les autres plateformes leur équivalent.
  commit: (
    process.env.BUZZY_BUILD_SHA ||
    process.env.SOURCE_COMMIT ||
    process.env.GIT_COMMIT ||
    ''
  ).slice(0, 12),
  builtAt: readBuildTimestamp(),
  startedAt: new Date().toISOString(),
};
