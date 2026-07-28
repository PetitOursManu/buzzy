import type { UserProfile } from '@prisma/client';

/**
 * Templates de prompts pour les générations IA de Buzzy.
 * Tous les prompts sont en français.
 */

const SCOPE_LABELS: Record<string, string> = {
  GLOBAL: 'mondiale',
  NATIONAL: 'nationale',
  REGIONAL: 'régionale',
  LOCAL: 'locale',
};

const TONE_LABELS: Record<string, string> = {
  professionnel: 'professionnel',
  chaleureux: 'chaleureux et convivial',
  humoristique: 'humoristique',
  institutionnel: 'institutionnel',
};

export interface EventGenParams {
  scopes: string[];
  regions: string[];
  themes: string[];
  priorityThemes: string[];
  dateTarget: DateTarget;
  excludeTitles: string[];
  count: number;
  webSearchEnabled: boolean;
  plan?: string; // plan validé par l'utilisateur (mode planification)
  preferredNetworks: string[]; // descriptions par réseau à générer pour chaque événement
  prioritySources?: string; // sources à privilégier pour trouver/sourcer les événements
}

/** Consigne de longueur/ton pour une description d'événement adaptée à un réseau. */
const NETWORK_DESC_GUIDELINES: Record<string, string> = {
  facebook: 'Facebook : ton conversationnel, 2 à 3 phrases (~400 caractères max), 1 à 2 emojis.',
  instagram:
    'Instagram : accroche visuelle + 1 à 2 phrases (~300 caractères max), emojis bienvenus, pensé pour une légende.',
  linkedin:
    'LinkedIn : ton professionnel et posé, 3 à 5 phrases structurées (~600 à 900 caractères), peu d\'emojis.',
  x: 'X (Twitter) : très concis, MOINS de 280 caractères, une idée forte et percutante.',
  tiktok:
    'TikTok : ton spontané et dynamique, légende courte (~150 caractères max), accroche immédiate.',
};

export function networkDescGuideline(network: string): string {
  return NETWORK_DESC_GUIDELINES[network] ?? `${network} : description concise et adaptée au réseau.`;
}

export type DateTarget =
  | { kind: 'month'; month: number; year: number }
  | { kind: 'date'; date: string }
  | { kind: 'range'; start: string; end: string };

export function describeDateTarget(dt: DateTarget): string {
  if (dt.kind === 'month') {
    const monthName = new Date(dt.year, dt.month - 1, 1).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    });
    return `le mois de ${monthName}`;
  }
  if (dt.kind === 'date') {
    const d = new Date(dt.date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return `la date du ${d}`;
  }
  const s = new Date(dt.start).toLocaleDateString('fr-FR');
  const e = new Date(dt.end).toLocaleDateString('fr-FR');
  return `la période du ${s} au ${e}`;
}

export function eventGenerationSystemPrompt(webSearchEnabled: boolean): string {
  return [
    "Tu es un assistant expert en veille d'événements et d'actualités pour la création de contenu sur les réseaux sociaux.",
    "Ta mission : proposer des événements réels, pertinents et variés (journées mondiales, salons, festivals, conférences, dates marquantes, temps forts saisonniers, etc.) correspondant précisément aux critères fournis.",
    webSearchEnabled
      ? "Tu disposes d'outils de recherche web : utilise-les pour vérifier l'existence des événements et fournir des sources réelles et exploitables (liens cliquables valides)."
      : "Tu ne disposes pas de recherche web. Fournis les meilleures sources que tu connais, en restant honnête : n'invente jamais de liens qui n'existent pas.",
    'Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, respectant strictement le schéma demandé.',
  ].join(' ');
}

function describeScopesAndRegions(params: EventGenParams): string {
  const scopeLabels = params.scopes.map((s) => SCOPE_LABELS[s] ?? s);
  const scopeText =
    scopeLabels.length === 1
      ? `de portée ${scopeLabels[0]}`
      : `de portées ${scopeLabels.join(', ')}`;
  const hasRegions = params.regions.length > 0;
  const regionText = hasRegions
    ? params.regions.length === 1
      ? ` concernant la localisation « ${params.regions[0]} »`
      : ` répartis sur les localisations suivantes : ${params.regions.map((r) => `« ${r} »`).join(', ')}`
    : '';
  return `${scopeText}${regionText}`;
}

export function eventGenerationUserPrompt(params: EventGenParams): string {
  const themesPart =
    params.themes.length > 0
      ? `Thèmes ciblés : ${params.themes.join(', ')}.`
      : 'Tous thèmes confondus.';
  const priorityPart =
    params.priorityThemes.length > 0
      ? `Thèmes PRIORITAIRES (à privilégier fortement, majorité des événements) : ${params.priorityThemes.join(', ')}.`
      : null;
  const excludePart =
    params.excludeTitles.length > 0
      ? `\n\nÉvénements DÉJÀ proposés (à ne PAS répéter, propose-en de nouveaux, distincts) :\n- ${params.excludeTitles.join('\n- ')}`
      : '';

  const multiRegionConstraint =
    params.regions.length > 1
      ? `- Répartis les événements entre les différentes localisations demandées (${params.regions.join(', ')}), en couvrant chacune autant que possible.`
      : null;
  const planPart = params.plan
    ? `\n\nPlan validé à suivre pour cette génération :\n${params.plan}`
    : '';
  const prioritySourcesPart = params.prioritySources?.trim()
    ? `\n\nSources à privilégier EN PRIORITÉ pour trouver et sourcer les événements (en plus de tes sources habituelles) :\n${params.prioritySources.trim()}`
    : '';

  const hasNetworks = params.preferredNetworks.length > 0;
  const networksPart = hasNetworks
    ? [
        '',
        `Pour CHAQUE événement, rédige aussi une description prête à publier, adaptée à chacun de ces réseaux : ${params.preferredNetworks.join(', ')}.`,
        'Respecte le ton et la longueur propres à chaque réseau :',
        ...params.preferredNetworks.map((n) => `  • ${networkDescGuideline(n)}`),
      ].join('\n')
    : '';

  // Schéma JSON — on ajoute networkDescriptions seulement si des réseaux sont demandés.
  const eventShape: Record<string, unknown> = {
    title: 'string (titre court)',
    description: 'string (2 à 3 phrases)',
    scope: 'GLOBAL | NATIONAL | REGIONAL | LOCAL',
    region: 'string ou null',
    theme: 'string (un des thèmes demandés)',
    eventDate: 'string ISO (YYYY-MM-DD) ou null si période imprécise',
    eventPeriod: 'string (ex: "Juin 2026") ou null',
    sources: [{ title: 'string', url: 'string (URL http/https valide)' }],
  };
  if (hasNetworks) {
    eventShape.networkDescriptions = params.preferredNetworks.reduce<Record<string, string>>(
      (acc, n) => {
        acc[n] = `string (description adaptée à ${n}, respectant sa longueur)`;
        return acc;
      },
      {},
    );
  }

  return [
    `Propose ${params.count} événements ${describeScopesAndRegions(params)}, concernant ${describeDateTarget(params.dateTarget)}.`,
    themesPart,
    ...(priorityPart ? [priorityPart] : []),
    excludePart,
    planPart,
    prioritySourcesPart,
    networksPart,
    '',
    'Contraintes :',
    '- Chaque événement doit être plausible et vérifiable.',
    ...(priorityPart
      ? ['- Consacre la majorité des événements aux thèmes prioritaires indiqués.']
      : []),
    ...(prioritySourcesPart
      ? ['- Privilégie les sources indiquées ci-dessus quand elles sont pertinentes, sans t\'y limiter.']
      : []),
    ...(multiRegionConstraint ? [multiRegionConstraint] : []),
    ...(hasNetworks
      ? ['- Fournis une description distincte par réseau demandé dans "networkDescriptions".']
      : []),
    "- Varie les thèmes et les types d'événements.",
    "- Fournis des sources sous forme de liens réels (site officiel, page dédiée, article). Si tu n'as pas de source fiable, laisse le tableau sources vide plutôt que d'inventer.",
    '',
    'Schéma JSON attendu :',
    JSON.stringify({ events: [eventShape] }, null, 2),
  ].join('\n');
}

/* ─── Alternative d'un événement (reformulation) ───────────────── */

export function eventRephraseSystemPrompt(): string {
  return [
    "Tu es un expert en rédaction et veille d'événements.",
    "On te donne le titre et la description d'un événement. Propose une ALTERNATIVE : une reformulation différente du titre ET de la description, en conservant le même événement et les mêmes faits, mais avec un angle et une formulation nouveaux.",
    'Réponds UNIQUEMENT en JSON valide : { "title": string, "description": string }.',
  ].join(' ');
}

export function eventRephraseUserPrompt(title: string, description: string): string {
  return [
    `Titre actuel : ${title}`,
    `Description actuelle : ${description}`,
    '',
    'Propose une alternative : un titre court reformulé et une description de 2 à 3 phrases reformulée.',
  ].join('\n');
}

/* ─── Mode planification ───────────────────────────────────────── */

export function eventPlanSystemPrompt(): string {
  return [
    "Tu es un assistant de veille d'événements. Avant de générer des événements, tu proposes un PLAN d'approche court et concret.",
    "Le plan décrit : les angles/catégories d'événements que tu vas chercher, les localisations couvertes, et les pistes de sources.",
    'Réponds en français, en 4 à 7 puces claires (format Markdown avec des tirets). Pas de préambule, pas de conclusion : uniquement le plan.',
  ].join(' ');
}

export function eventPlanUserPrompt(params: EventGenParams): string {
  const themesPart =
    params.themes.length > 0 ? `Thèmes : ${params.themes.join(', ')}.` : 'Tous thèmes.';
  const priorityPart =
    params.priorityThemes.length > 0
      ? `Thèmes prioritaires : ${params.priorityThemes.join(', ')}.`
      : '';
  const sourcesPart = params.prioritySources?.trim()
    ? `Sources à privilégier : ${params.prioritySources.trim()}.`
    : '';
  return [
    `Établis un plan pour proposer ${params.count} événements ${describeScopesAndRegions(params)}, concernant ${describeDateTarget(params.dateTarget)}.`,
    themesPart,
    priorityPart,
    sourcesPart,
    params.webSearchEnabled
      ? 'Tu disposes d\'outils de recherche web : indique quelles recherches tu comptes effectuer.'
      : 'Tu ne disposes pas de recherche web : appuie-toi sur tes connaissances.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function profileBlock(profile: UserProfile | null): string {
  if (!profile) {
    return "Aucun profil utilisateur renseigné : adopte un ton professionnel neutre et une audience grand public.";
  }
  const tone = TONE_LABELS[profile.tone] ?? profile.tone;
  const lines = [
    `Description de l'activité de l'utilisateur : ${profile.description || 'non précisée'}.`,
    `Ton souhaité pour les publications : ${tone}.`,
  ];
  if (profile.targetAudience) lines.push(`Audience cible : ${profile.targetAudience}.`);
  if (profile.restrictions)
    lines.push(`Sujets/formulations à ÉVITER absolument : ${profile.restrictions}.`);
  return lines.join('\n');
}

const NETWORK_GUIDELINES: Record<string, string> = {
  facebook:
    'Facebook : ton conversationnel et accessible, longueur moyenne, 2 à 4 emojis pertinents, 2 à 4 hashtags maximum, incite à l\'interaction (question, appel à commenter).',
  instagram:
    'Instagram : ton visuel et inspirant, accroche forte en première ligne, storytelling court, 5 à 12 hashtags pertinents, emojis bienvenus.',
  linkedin:
    'LinkedIn : ton professionnel, expert et posé, texte plus long et structuré (contexte + valeur ajoutée + conclusion), peu d\'emojis, 3 à 5 hashtags sobres.',
  x: 'X (Twitter) : ton percutant et concis, MOINS de 280 caractères, 1 à 3 hashtags, une idée forte.',
  tiktok:
    'TikTok : ton spontané, jeune et dynamique, formulé comme une légende de vidéo courte, accroche immédiate, 3 à 6 hashtags tendance.',
};

export function networkGuideline(network: string): string {
  return NETWORK_GUIDELINES[network] ?? `${network} : ton adapté au réseau, concis et engageant.`;
}

export function postGenerationSystemPrompt(profile: UserProfile | null): string {
  return [
    "Tu es un rédacteur expert en communication sur les réseaux sociaux.",
    "Tu rédiges des publications prêtes à l'emploi, adaptées au réseau ciblé et au profil de l'utilisateur.",
    '',
    'Profil de l\'utilisateur :',
    profileBlock(profile),
    '',
    'Réponds UNIQUEMENT avec un objet JSON valide : { "title": string, "content": string, "hashtags": string[] }.',
    'Le champ "hashtags" contient les hashtags SANS le caractère #.',
    'Le champ "content" ne doit PAS répéter les hashtags (ils sont ajoutés séparément).',
  ].join('\n');
}

export interface PostGenContext {
  network: string;
  scheduledDate: Date;
  event?: {
    title: string;
    description: string;
    eventDate?: Date | null;
    eventPeriod?: string | null;
    theme: string;
  } | null;
}

export function postGenerationUserPrompt(ctx: PostGenContext): string {
  const dateStr = ctx.scheduledDate.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const lines = [
    `Rédige une publication pour ${ctx.network.toUpperCase()}, prévue le ${dateStr}.`,
    networkGuideline(ctx.network),
  ];
  if (ctx.event) {
    lines.push(
      '',
      'Événement à mettre en avant :',
      `- Titre : ${ctx.event.title}`,
      `- Thème : ${ctx.event.theme}`,
      `- Description : ${ctx.event.description}`,
    );
    if (ctx.event.eventDate) {
      lines.push(`- Date de l'événement : ${ctx.event.eventDate.toLocaleDateString('fr-FR')}`);
    } else if (ctx.event.eventPeriod) {
      lines.push(`- Période : ${ctx.event.eventPeriod}`);
    }
  } else {
    lines.push('', 'Aucun événement spécifique : propose un contenu pertinent lié à l\'actualité générale du profil.');
  }
  return lines.join('\n');
}
