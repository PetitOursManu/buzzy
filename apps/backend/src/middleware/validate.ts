import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type Source = 'body' | 'query' | 'params';

/**
 * Middleware générique de validation zod.
 * Remplace la source validée par la version typée/nettoyée.
 */
export function validate(schema: ZodSchema, source: Source = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      // On réaffecte la valeur validée (query/params sont en lecture seule
      // selon Express : on stocke dans une propriété dédiée).
      if (source === 'body') {
        req.body = parsed;
      } else {
        (req as unknown as Record<string, unknown>)[`validated_${source}`] = parsed;
      }
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: 'Données invalides.',
          details: err.errors.map((e) => ({
            champ: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      return next(err);
    }
  };
}

/** Récupère la source validée (query/params) posée par le middleware. */
export function validated<T>(req: Request, source: 'query' | 'params'): T {
  return (req as unknown as Record<string, unknown>)[`validated_${source}`] as T;
}
