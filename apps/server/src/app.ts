// Express app factory.
// Middleware: cookie-parser, json body, request logger.
// Routes: all under /api; /api/dev only in non-production.
// Global error handler emits { error: { code, message } }.

import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { debug, info } from './util/logger.js';

// Route modules
import authRouter from './routes/auth.js';
import restaurantRouter from './routes/restaurant.js';
import dayRouter from './routes/day.js';
import workersRouter from './routes/workers.js';
import menuRouter from './routes/menu.js';
import reviewsRouter from './routes/reviews.js';
import leaderboardRouter from './routes/leaderboard.js';
import settingsRouter from './routes/settings.js';

// ─── HttpError ───────────────────────────────────────────────────────────────

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

// ─── App factory ─────────────────────────────────────────────────────────────

export function createApp(): express.Application {
  const app = express();

  // ── Middleware ──────────────────────────────────────────────────────────
  // cookie-parser with session signing secret (for reference; our cookies are
  // manually signed in auth/cookie.ts for full control)
  app.use(cookieParser(config.sessionSigningSecret));

  app.use(express.json({ limit: '64kb' }));

  // Tiny request logger
  app.use((req: Request, _res: Response, next: NextFunction) => {
    debug(`${req.method} ${req.path}`);
    next();
  });

  // ── Health check (no auth) ───────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: '0.1.0' });
  });

  // ── API routes ───────────────────────────────────────────────────────────
  app.use('/api/auth', authRouter);
  app.use('/api/restaurant', restaurantRouter);
  app.use('/api/day', dayRouter);
  app.use('/api/workers', workersRouter);
  app.use('/api/menu', menuRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/settings', settingsRouter);

  // ── Dev routes (never in production) ────────────────────────────────────
  if (config.nodeEnv !== 'production') {
    // Dynamic import to avoid loading dev code in prod builds
    import('./routes/dev.js').then(({ default: devRouter }) => {
      app.use('/api/dev', devRouter);
    });
  }

  // ── Static frontend (production only) ────────────────────────────────────
  // In prod, the built React app at apps/web/dist is served from the same
  // origin. Lets the whole game live behind ONE port for LAN/iPad access.
  // In dev, Vite serves the frontend separately on :5173 and proxies /api
  // back to this server on :4000.
  if (config.nodeEnv === 'production') {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname  = path.dirname(__filename);
    // From apps/server/dist → ../../web/dist
    const webDist = path.resolve(__dirname, '../../web/dist');

    if (fs.existsSync(webDist)) {
      info(`Serving static frontend from ${webDist}`);
      app.use(express.static(webDist, { maxAge: '1h', index: false }));
      // SPA fallback — any non-/api path returns index.html
      app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
        res.sendFile(path.join(webDist, 'index.html'));
      });
    } else {
      info(`No web/dist found at ${webDist} — frontend not bundled. Run \`npm run build\` first.`);
    }
  }

  // ── 404 fallthrough ──────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found.' } });
  });

  // ── Global error handler ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }

    // Unknown errors
    const message = err instanceof Error ? err.message : 'Internal server error.';
    res.status(500).json({ error: { code: 'internal_error', message } });
  });

  return app;
}
