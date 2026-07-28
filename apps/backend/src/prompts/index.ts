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
    "Tu es un documentaliste spécialisé dans la veille d'événements. Ton exigence est l'EXACTITUDE FACTUELLE.",
    "Ta mission : RECENSER des événements qui existent RÉELLEMENT (journées mondiales officielles, salons, festivals, conférences, temps forts récurrents…) correspondant aux critères fournis.",
    "CE QUE TU SAIS ET DOIS UTILISER : les journées mondiales et internationales officielles (ONU, UNESCO, OMS…), les fêtes et temps forts annuels récurrents, ainsi que les grands salons et festivals établis sont des FAITS ÉTABLIS et vérifiables, à date fixe ou récurrente. Tu DOIS les proposer quand ils correspondent aux critères : ce ne sont pas des inventions, et les omettre serait une erreur.",
    "CE QUE TU NE DOIS JAMAIS FAIRE : inventer un événement, un nom, un lieu ou une date ; inventer un événement local « plausible » pour satisfaire une demande ; affirmer l'existence d'une édition précise (dates, programme, lieu) d'un événement dont tu n'as pas connaissance.",
    "En cas de doute sur un événement précis : ne le mets pas. Mais ne renvoie pas une liste vide par excès de prudence si des événements récurrents établis correspondent aux critères.",
    webSearchEnabled
      ? "Tu disposes d'outils : recherche web, lecture de page (fetch) et date du jour (time). MÉTHODE OBLIGATOIRE : (1) commence par connaître la date réelle si un outil le permet ; (2) recherche les événements ; (3) quand c'est possible, OUVRE la page candidate avec l'outil de lecture pour confirmer que l'événement et sa date y figurent vraiment. Ne retiens un événement que si une source consultée le confirme. RÈGLE ABSOLUE sur les sources : n'indique QUE des URLs réellement vues dans les résultats ou effectivement ouvertes, copiées à l'identique. N'invente, ne devine et ne complète JAMAIS une URL."
      : "Tu ne disposes PAS de recherche web : tu ne peux donc pas vérifier les URLs. RÈGLE ABSOLUE : ne donne que des URLs d'accueil de sites institutionnels dont tu es certain qu'ils existent (ex: https://www.unesco.org). N'invente JAMAIS de chemin profond (/articles/..., /events/2026/...) : ces liens n'existent presque jamais. En cas de doute, laisse le tableau sources VIDE.",
    'Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, respectant strictement le schéma demandé.',
  ].join(' ');
}

function describeScopesAndRegions(params: EventGenParams): string {
  const scopeLabels = params.scopes.map((s) => SCOPE_LABELS[s] ?? s);
  const scopeText =
    scopeLabels.length === 1
      ? `de portée ${scopeLabels[0]}`
      : `de portées ${scopeLabels.join(', ')}`;

  if (params.regions.length === 0) return scopeText;

  const zones = params.regions.map((r) => `« ${r} »`).join(', ');
  // La localisation ne s'applique qu'aux portées régionale/locale : un
  // événement mondial ne « concerne » pas une ville en particulier.
  const hasWideScope = params.scopes.some((s) => s === 'GLOBAL' || s === 'NATIONAL');
  const hasLocalScope = params.scopes.some((s) => s === 'REGIONAL' || s === 'LOCAL');

  if (hasWideScope && hasLocalScope) {
    return `${scopeText}. Pour les portées régionale et locale, cible ${zones} ; pour les portées mondiale et nationale, propose les événements correspondants sans restriction géographique (n'exige pas de lien avec ${zones})`;
  }
  if (hasLocalScope) {
    return `${scopeText}, situés à/en ${zones}`;
  }
  return scopeText;
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
    description: 'string (2 à 3 phrases, uniquement des faits établis)',
    certainty: '"certain" | "incertain" — sois honnête, les "incertain" sont écartés',
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
    `Recense JUSQU'À ${params.count} événements ${describeScopesAndRegions(params)}, concernant ${describeDateTarget(params.dateTarget)}.`,
    `${params.count} est un MAXIMUM, pas un objectif : n'inclus que les événements dont tu es certain — mais inclus TOUS ceux qui le sont (journées mondiales/internationales officielles, temps forts récurrents établis…). Ne renvoie une liste vide que si vraiment aucun événement certain ne correspond.`,
    themesPart,
    ...(priorityPart ? [priorityPart] : []),
    excludePart,
    planPart,
    prioritySourcesPart,
    networksPart,
    '',
    'Contraintes :',
    "- N'inclus QUE des événements réels et établis. Aucune invention, aucune extrapolation, aucun événement « probable ».",
    '- Champ "certainty" : mets "certain" pour toute journée mondiale/internationale officielle, tout temps fort récurrent établi, ou tout événement confirmé par une recherche — c\'est le cas le plus fréquent. Réserve "incertain" aux événements dont tu doutes réellement de l\'existence (ils seront écartés).',
    "- Si tu hésites sur l'existence d'un événement : ne le mets pas. Si tu es sûr de l'événement mais pas de sa date exacte, indique la période plutôt qu'une fausse date précise.",
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
    '- SOURCES : chaque URL doit exister réellement. Un lien inventé est PIRE que pas de lien — il sera automatiquement détecté et supprimé.',
    "- Préfère une URL d'accueil ou de rubrique stable et certaine plutôt qu'un lien profond deviné.",
    "- Si tu n'as aucune source dont tu es sûr, laisse le tableau sources VIDE.",
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
