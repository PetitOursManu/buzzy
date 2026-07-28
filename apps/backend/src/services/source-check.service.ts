/**
 * Vérification réelle des liens de sources.
 *
 * Les modèles IA produisent fréquemment des URLs « plausibles » mais
 * inexistantes (404) ou qui redirigent vers l'accueil du site. On teste donc
 * chaque lien par une requête HTTP avant de l'enregistrer, et on qualifie
 * son état pour l'afficher honnêtement dans l'interface.
 */

export type SourceStatus = 'ok' | 'redirected' | 'unreachable' | 'unchecked';

export interface RawSource {
  title: string;
  url: string;
}

export interface CheckedSource extends RawSource {
  status: SourceStatus;
}

const TIMEOUT_MS = 6000;
const CONCURRENCY = 8;
const USER_AGENT =
  'Mozilla/5.0 (compatible; BuzzyBot/1.0; +https://github.com/PetitOursManu/buzzy)';

/** Normalise un chemin pour comparer origine et destination d'une redirection. */
function pathDepth(url: string): number {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '');
    return p === '' ? 0 : p.split('/').filter(Boolean).length;
  } catch {
    return 0;
  }
}

/**
 * Teste une URL. Politique volontairement prudente :
 *  - 404/410 ou échec réseau/DNS  → 'unreachable' (le lien sera écarté)
 *  - 403/405/429/5xx              → 'unchecked'   (le site bloque les bots :
 *                                    on garde le lien sans le certifier)
 *  - 2xx mais redirigé d'une page profonde vers l'accueil → 'redirected'
 *  - 2xx sinon                    → 'ok'
 */
export async function checkUrl(url: string): Promise<SourceStatus> {
  if (!/^https?:\/\//i.test(url)) return 'unreachable';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
    });

    if (res.status === 404 || res.status === 410) return 'unreachable';
    if (!res.ok) return 'unchecked'; // 403, 405, 429, 5xx… : indéterminé

    // Redirection d'une page précise vers la racine du site : la page
    // demandée n'existe probablement pas.
    const finalUrl = res.url || url;
    if (pathDepth(url) > 0 && pathDepth(finalUrl) === 0) return 'redirected';

    return 'ok';
  } catch {
    return 'unreachable'; // timeout, DNS, TLS, connexion refusée…
  } finally {
    clearTimeout(timer);
  }
}

/** Exécute les vérifications avec une concurrence bornée. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface VerifiedSources {
  sources: CheckedSource[];
  /** true si au moins un lien répond réellement (status 'ok'). */
  hasLiveSource: boolean;
}

/**
 * Vérifie une liste de sources, écarte les liens morts et déduplique.
 * Les liens conservés portent leur statut, affiché dans l'interface.
 */
export async function verifySources(raw: RawSource[]): Promise<VerifiedSources> {
  // Déduplication par URL normalisée.
  const seen = new Set<string>();
  const unique = raw.filter((s) => {
    const key = s.url.replace(/\/+$/, '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) return { sources: [], hasLiveSource: false };

  const statuses = await mapLimit(unique, CONCURRENCY, (s) => checkUrl(s.url));
  const checked: CheckedSource[] = unique.map((s, i) => ({ ...s, status: statuses[i] }));

  // On écarte les liens morts : mieux vaut aucune source qu'un lien 404.
  const kept = checked.filter((s) => s.status !== 'unreachable');
  const hasLiveSource = kept.some((s) => s.status === 'ok');

  return { sources: kept, hasLiveSource };
}
