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
  
  // CORS must be first, before any request logging
  app.use(cors({ origin: true, credentials: true }));
  
  // Then parse body and cookies
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  
  // Request logging AFTER parsing
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      process.stdout.write(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} ${duration}ms\n`);
    });
    next();
  });

  // Health check - minimal, synchronous
  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // API routes
  app.use('/api', buildApiRouter());

  // Media serving route
  app.get('/media/*', attachContext, async (req, res) => {
    const key = req.path.replace(/^\/media\//, '').replace(/^\/+/, '');
    if (!key) {
      return res.status(404).end();
    }
    
    try {
      const result = await mediaService.getMediaStreamByKey(key, req.ctx.userId ?? null);
      res.status(200).type(result.mimeType);
      
      result.stream.on('error', (err) => {
        process.stderr.write(`[media] Stream error: ${String(err)}\n`);
        if (!res.headersSent) {
          res.status(404).end();
        }
      });
      
      result.stream.pipe(res);
    } catch (err) {
      if (err instanceof MediaError) {
        return res.status(err.status).end();
      }
      process.stderr.write(`[media] Error: ${String(err)}\n`);
      res.status(500).end();
    }
  });

  // Serve frontend static files and SPA
  const frontendDist = resolveFrontendDist();
  if (frontendDist && process.env.SERVE_FRONTEND !== 'false') {
    const indexPath = path.join(frontendDist, 'index.html');
    
    if (existsSync(indexPath)) {
      // Serve static assets (JS, CSS, images)
      app.use(express.static(frontendDist, {
        index: false,
        maxAge: '1y',
        immutable: true,
        setHeaders: (res, filepath) => {
          // Don't cache HTML files
          if (filepath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        }
      }));
      
      // SPA catch-all - send index.html for all other GET requests
      // Use absolute path for sendFile
      const absoluteIndexPath = path.resolve(indexPath);
      app.get('*', (_req, res) => {
        res.sendFile(absoluteIndexPath, (err) => {
          if (err) {
            process.stderr.write(`[frontend] Failed to serve index.html: ${String(err)}\n`);
            if (err instanceof Error && err.stack) {
              process.stderr.write(`[frontend] Stack: ${err.stack}\n`);
            }
            if (!res.headersSent) {
              res.status(500).send('Internal Server Error');
            }
          }
        });
      });
    } else {
      process.stderr.write(`[server] Frontend index.html not found at ${indexPath}\n`);
    }
  }

  // Global error handler
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    process.stderr.write(`[error] ${req.method} ${req.url}: ${String(err)}\n`);
    if (err instanceof Error && err.stack) {
      process.stderr.write(`[error] ${err.stack}\n`);
    }
    
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return app;
}

function resolveFrontendDist(): string | null {
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
  
  return null;
}