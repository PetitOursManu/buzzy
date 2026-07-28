import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { env, isProduction } from './lib/env';
import { prisma } from './lib/prisma';
import { ensureAdminUser, ensureSeededMcpServers } from './seed';

import authRoutes from './routes/auth';
import settingsRoutes from './routes/settings';
import eventsRoutes from './routes/events';
import calendarRoutes from './routes/calendar';
import postsRoutes from './routes/posts';

async function main() {
  const app = express();

  app.set('trust proxy', 1);
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
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', name: 'buzzy' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/events', eventsRoutes);
  app.use('/api/calendar', calendarRoutes);
  app.use('/api/posts', postsRoutes);

  // 404 pour toute route API inconnue.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Route API introuvable.' }));

  // Gestionnaire d'erreurs global (pas de stack trace exposée en prod).
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('Erreur non gérée:', err);
      if (res.headersSent) return;
      res.status(500).json({ error: 'Une erreur interne est survenue.' });
    },
  );

  // ─── Frontend statique (SPA) ────────────────────────────────
  // Le build frontend est copié dans ./public à côté du backend compilé.
  const publicDir = path.resolve(__dirname, '..', 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) =>
      res.json({ name: 'buzzy', message: 'API en ligne. Frontend non buildé (mode développement).' }),
    );
  }

  // ─── Démarrage ──────────────────────────────────────────────
  try {
    await ensureAdminUser();
    await ensureSeededMcpServers();
  } catch (e) {
    console.error('[startup] Erreur lors de l\'initialisation :', e);
  }

  app.listen(env.PORT, () => {
    console.log(`🐝 Buzzy en écoute sur le port ${env.PORT} (${isProduction ? 'production' : 'dev'})`);
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
  console.error('Échec du démarrage du serveur :', e);
  await prisma.$disconnect();
  process.exit(1);
});
