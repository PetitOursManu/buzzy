import rateLimit from 'express-rate-limit';

/**
 * Limiteur de débit pour les routes de génération IA, qui sont
 * coûteuses (appels au modèle) et potentiellement lentes.
 */
export const aiGenerationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15, // 15 générations par minute max
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Trop de générations demandées. Veuillez patienter un instant avant de réessayer.',
  },
});

/** Limiteur plus strict pour la connexion (anti brute-force). */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.',
  },
});
