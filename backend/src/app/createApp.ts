import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApiRouter } from '../registry/buildApiRouter.js';
import { attachContext } from '../middleware/attachContext.js';
import { mediaService, MediaError } from '../services/media/mediaService.js';

export function createApp() {
  const app = express();
  
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Test endpoint to verify routing works
  app.get('/test', (_req, res) => {
    res.status(200).json({ message: 'Server is responding', timestamp: new Date().toISOString() });
  });

  app.get('/media/:key(*)', attachContext, async (req, res) => {
    const key = req.params.key;
    if (!key) return res.status(404).end();
    try {
      const result = await mediaService.getMediaStreamByKey(key, req.ctx.userId ?? null);
      res.status(200).type(result.mimeType);
      result.stream.on('error', () => {
        if (!res.headersSent) {
          res.status(404).end();
        } else {
          res.destroy();
        }
      });
      result.stream.pipe(res);
    } catch (err) {
      if (err instanceof MediaError) {
        return res.status(err.status).end();
      }
      throw err;
    }
  });

  app.use('/api', buildApiRouter());

  const shouldServeFrontend =
  process.env.RAILWAY_ENVIRONMENT === 'production' ||
  process.env.NODE_ENV === 'production' ||
  process.env.SERVE_FRONTEND === 'true';

  if (shouldServeFrontend) {
    const frontendDist = resolveFrontendDist();
    if (frontendDist) {
      console.log(`[server] Serving frontend from: ${frontendDist}`);
      app.use(express.static(frontendDist));
      app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
    } else {
      console.warn('[server] Frontend dist not found, only serving API');
    }
  } else {
    console.log('[server] Frontend serving disabled');
  }

  // Error handler - must be after all routes
  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    process.stderr.write(`[Express] Unhandled error on ${req.method} ${req.url}: ${String(err)}\n`);
    if (err instanceof Error && err.stack) {
      process.stderr.write(`[Express] Error stack: ${err.stack}\n`);
    }
    if (res.headersSent) {
      return next(err);
    }
    // Default to 500 for unexpected errors
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

function resolveFrontendDist() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const root = path.resolve(__dirname, '../../..');
  const candidates = [
    path.join(process.cwd(), 'frontend', 'dist'),
    path.join(root, 'frontend', 'dist'),
  ];
  for (const dist of candidates) {
    if (existsSync(dist)) {
      return dist;
    }
  }
  console.warn(`[server] frontend dist not found at ${candidates.join(', ')}`);
  return null;
}
