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

  // Healthcheck endpoint - must respond quickly for Railway
  app.get('/health', (_req, res) => {
    // Respond immediately without any async operations
    res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Test endpoint to verify routing works
  app.get('/test', (_req, res) => {
    res.status(200).json({ message: 'Server is responding', timestamp: new Date().toISOString() });
  });

  // Media serving route - must match paths with slashes like /media/0d/7a/uuid.jpg
  // Extract key from URL path (everything after /media/)
  app.get('/media/*', attachContext, async (req, res) => {
    // Extract the key from the URL path
    // Remove leading /media/ and any leading slashes
    const key = req.path.replace(/^\/media\//, '').replace(/^\/+/, '');
    if (!key) {
      process.stderr.write(`[media] No key found in request: ${req.url}\n`);
      return res.status(404).end();
    }
    process.stdout.write(`[media] Serving media with key: ${key}\n`);
    try {
      const result = await mediaService.getMediaStreamByKey(key, req.ctx.userId ?? null);
      process.stdout.write(`[media] Found media, streaming with mimeType: ${result.mimeType}\n`);
      res.status(200).type(result.mimeType);
      result.stream.on('error', (err) => {
        process.stderr.write(`[media] Stream error for key ${key}: ${String(err)}\n`);
        if (!res.headersSent) {
          res.status(404).end();
        } else {
          res.destroy();
        }
      });
      result.stream.pipe(res);
    } catch (err) {
      if (err instanceof MediaError) {
        process.stderr.write(`[media] MediaError for key ${key}: ${err.message} (${err.status})\n`);
        return res.status(err.status).end();
      }
      process.stderr.write(`[media] Unexpected error for key ${key}: ${String(err)}\n`);
      if (err instanceof Error && err.stack) {
        process.stderr.write(`[media] Stack: ${err.stack}\n`);
      }
      throw err;
    }
  });

  app.use('/api', buildApiRouter());

  // Serve frontend if dist exists (unless explicitly disabled)
  // This works for both local testing and Railway production
  const frontendDist = resolveFrontendDist();
  const shouldServeFrontend =
    frontendDist !== null &&
    process.env.SERVE_FRONTEND !== 'false';

  if (shouldServeFrontend && frontendDist) {
    const indexPath = path.join(frontendDist, 'index.html');
    if (!existsSync(indexPath)) {
      process.stderr.write(`[server] WARNING: Frontend index.html not found at ${indexPath}\n`);
      process.stderr.write('[server] Frontend will not be served\n');
    } else {
      process.stdout.write(`[server] Serving frontend from: ${frontendDist}\n`);
      process.stdout.write(`[server] Frontend index.html at: ${indexPath}\n`);
      app.use(express.static(frontendDist, {
        // Don't serve index.html for static files, let the catch-all handle it
        index: false
      }));
      // Catch-all route for SPA - must be last
      // Express routes are matched in order, so /api, /media, /health, /test will be matched first
      // This route only handles requests that don't match any other route
      const absoluteIndexPath = path.resolve(indexPath);
      app.get('*', (req, res) => {
        process.stdout.write(`[frontend] Serving index.html for: ${req.path}\n`);
        res.sendFile(absoluteIndexPath, (err) => {
          if (err) {
            process.stderr.write(`[frontend] Error serving index.html: ${String(err)}\n`);
            if (err instanceof Error && err.stack) {
              process.stderr.write(`[frontend] Stack: ${err.stack}\n`);
            }
            if (!res.headersSent) {
              res.status(500).json({ error: 'Failed to serve frontend' });
            }
          } else {
            process.stdout.write(`[frontend] Successfully served index.html for: ${req.path}\n`);
          }
        });
      });
    }
  } else if (!frontendDist) {
    process.stdout.write('[server] Frontend dist not found, only serving API\n');
    process.stdout.write('[server] Expected locations:\n');
    process.stdout.write(`  - ${path.join(process.cwd(), 'frontend', 'dist')}\n`);
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const root = path.resolve(__dirname, '../../..');
    process.stdout.write(`  - ${path.join(root, 'frontend', 'dist')}\n`);
  } else {
    process.stdout.write('[server] Frontend serving disabled (SERVE_FRONTEND=false)\n');
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
