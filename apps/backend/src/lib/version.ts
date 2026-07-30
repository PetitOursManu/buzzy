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

export const APP_VERSION = readVersion();
