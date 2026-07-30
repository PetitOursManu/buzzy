import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { env, isProduction, auditEnvironment } from './lib/env';
import { prisma } from './lib/prisma';
import { APP_VERSION, BUILD_INFO } from './lib/version';
import { ensureAdminUser, ensureSeededMcpServers } from './seed';

import authRoutes from './routes/auth';
import settingsRoutes from './routes/settings';
import eventsRoutes from './routes/events';
import calendarRoutes from './routes/calendar';
import postsRoutes from './routes/posts';

async function main() {
  auditEnvironment();

  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  if (env.CORS_ORIGIN) {
    app.use(
      cors({
        origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
        credentials: true,
      }),
    );
  }

  // ─── API ────────────────────────────────────────────────────
  // Sonde de vitalité : interrogée par Docker/Coolify, donc publique et
  // volontairement avare en détails.
  app.get('/api/health', async (_req, res) => {
    let database = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = true;
    } catch {
      database = false;
    }
    return res.status(database ? 200 : 503).json({
      status: database ? 'ok' : 'degraded',
      name: 'buzzy',
      database,
      ...BUILD_INFO,
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/events', eventsRoutes);
  app.use('/api/calendar', calendarRoutes);
  app.use('/api/posts', postsRoutes);

  // 404 pour toute route API inconnue.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Route API introuvable.' }));

  // ─── Frontend statique (SPA) ────────────────────────────────
  // Le build frontend est copié dans ./public à côté du backend compilé.
  const publicDir = path.resolve(__dirname, '..', 'public');
  if (fs.existsSync(publicDir)) {
    // Les assets Vite portent un hash dans leur nom : immuables et cachables
    // longtemps. index.html, lui, ne doit jamais être mis en cache, sans quoi
    // un déploiement continue de servir l'ancienne application.
    app.use(
      express.static(publicDir, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) =>
      res.json({
        name: 'buzzy',
        version: APP_VERSION,
        message: 'API en ligne. Frontend non buildé (mode développement).',
      }),
    );
  }

  // Gestionnaire d'erreurs global — enregistré EN DERNIER, seule position où
  // Express le fait intercepter les erreurs de toutes les couches précédentes.
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('Erreur non gérée:', err);
      if (res.headersSent) return;
      res.status(500).json({ error: 'Une erreur interne est survenue.' });
    },
  );

  // ─── Démarrage ──────────────────────────────────────────────
  try {
    await ensureAdminUser();
    await ensureSeededMcpServers();
  } catch (e) {
    console.error("[startup] Erreur lors de l'initialisation :", e);
  }

  app.listen(env.PORT, () => {
    console.log(
      `🐝 Buzzy v${APP_VERSION}` +
        (BUILD_INFO.commit ? ` (${BUILD_INFO.commit})` : '') +
        (BUILD_INFO.builtAt ? ` buildé le ${BUILD_INFO.builtAt}` : '') +
        ` en écoute sur le port ${env.PORT} (${isProduction ? 'production' : 'dev'})`,
    );
  });
}

// Un crash silencieux en production est indébogable : on trace explicitement
// la cause avant de laisser le superviseur (Docker/Coolify) redémarrer.
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Promesse rejetée non gérée :', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] Exception non interceptée :', err);
  // Sortie explicite : l'état du processus n'est plus fiable.
  process.exit(1);
});
process.on('SIGTERM', () => {
  console.log('[shutdown] SIGTERM reçu, arrêt propre.');
  prisma.$disconnect().finally(() => process.exit(0));
});

main().catch(async (e) => {
  console.error('Échec du démarrage du serveur :', e instanceof Error ? e.message : e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
