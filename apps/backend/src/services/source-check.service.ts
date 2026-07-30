/**
 * Vérification réelle des liens de sources.
 *
 * Les modèles IA produisent fréquemment des URLs « plausibles » mais
 * inexistantes (404) ou qui redirigent vers l'accueil du site. On teste donc
 * chaque lien par une requête HTTP avant de l'enregistrer, et on qualifie
 * son état pour l'afficher honnêtement dans l'interface.
 *
 * Ces URLs viennent d'un tiers non fiable : chaque saut de redirection est
 * revalidé contre le garde-fou SSRF, et le corps des réponses n'est jamais
 * téléchargé — seul le statut nous intéresse.
 */

import { isPublicUrl } from '../lib/net-guard';

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
const MAX_REDIRECTS = 5;
const USER_AGENT =
  'Mozilla/5.0 (compatible; BuzzyBot/1.0; +https://github.com/PetitOursManu/buzzy)';

const REQUEST_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
};

/** Normalise un chemin pour comparer origine et destination d'une redirection. */
function pathDepth(url: string): number {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '');
    return p === '' ? 0 : p.split('/').filter(Boolean).length;
  } catch {
    return 0;
  }
}

/** Libère la connexion sans lire le corps de la réponse. */
function discardBody(res: Response): void {
  res.body?.cancel().catch(() => undefined);
}

interface HopResult {
  status: number;
  finalUrl: string;
  /** La chaîne de redirections a mené hors du périmètre autorisé. */
  blocked: boolean;
}

/**
 * Suit les redirections à la main pour pouvoir revalider chaque saut : une
 * URL publique peut très bien rediriger vers http://169.254.169.254/.
 */
async function fetchFollowing(
  startUrl: string,
  method: 'HEAD' | 'GET',
  signal: AbortSignal,
): Promise<HopResult> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const verdict = await isPublicUrl(current);
    if (!verdict.allowed) return { status: 0, finalUrl: current, blocked: true };

    const res = await fetch(current, {
      method,
      redirect: 'manual',
      signal,
      headers: REQUEST_HEADERS,
    });
    discardBody(res);

    const location = res.headers.get('location');
    const isRedirect = res.status >= 300 && res.status < 400 && location;
    if (!isRedirect) {
      return { status: res.status, finalUrl: current, blocked: false };
    }

    try {
      current = new URL(location, current).toString();
    } catch {
      return { status: res.status, finalUrl: current, blocked: false };
    }
  }

  // Boucle de redirection : le lien ne mène nulle part d'exploitable.
  return { status: 0, finalUrl: current, blocked: false };
}

/**
 * Teste une URL. Politique volontairement prudente :
 *  - hôte interne, schéma non http(s), DNS muet → 'unreachable'
 *  - 404/410 ou échec réseau                    → 'unreachable' (lien écarté)
 *  - 403/405/429/5xx                            → 'unchecked'   (le site bloque
 *                                                  les bots : gardé, non certifié)
 *  - 2xx mais redirigé d'une page profonde vers l'accueil → 'redirected'
 *  - 2xx sinon                                  → 'ok'
 */
export async function checkUrl(url: string): Promise<SourceStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // HEAD d'abord : même information, sans transférer la page.
    let result = await fetchFollowing(url, 'HEAD', controller.signal);
    if (result.blocked) return 'unreachable';

    // Beaucoup de serveurs refusent HEAD (405/501) ou le gèrent mal (400) :
    // on retente alors en GET, dont on jette le corps immédiatement.
    if (result.status === 400 || result.status === 405 || result.status === 501) {
      result = await fetchFollowing(url, 'GET', controller.signal);
      if (result.blocked) return 'unreachable';
    }

    const { status, finalUrl } = result;
    if (status === 0) return 'unreachable';
    if (status === 404 || status === 410) return 'unreachable';
    if (status < 200 || status >= 300) return 'unchecked'; // 403, 429, 5xx…

    // Redirection d'une page précise vers la racine du site : la page
    // demandée n'existe probablement pas.
    if (pathDepth(url) > 0 && pathDepth(finalUrl) === 0) return 'redirected';

    return 'ok';
  } catch {
    return 'unreachable'; // timeout, DNS, TLS, connexion refusée…
  } finally {
    clearTimeout(timer);
  }
}

/** Exécute les vérifications avec une concurrence bornée. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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
